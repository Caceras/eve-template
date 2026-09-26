"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  BlocksIcon,
  RefreshCwIcon,
  SearchIcon,
  ArrowUpRightIcon,
  ChevronRightIcon,
  ShieldCheckIcon,
} from "lucide-react";
import { useChatShell } from "./chat-shell-context";
import { PageSignInButton } from "./page-sign-in";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { eveSurface } from "@/lib/eve-surface.generated";
import { skillLabel } from "@/lib/skills";
import { registryBrand, serviceBrand } from "@/lib/brands";
import { BrandIcon } from "@/components/brand-icon";
import { cn } from "@/lib/utils";
import { StickyBar } from "@/components/chat/sticky-bar";

type Scope = "runtime" | "included" | "directory";
type Category = "All" | "Tools" | "Skills" | "Agents" | "Connections" | "Channels" | "System";
type Item = {
  name: string;
  /** The runtime's own identifier, when the name shown is a readable form of it. */
  id?: string;
  description: string;
  category: Category;
  group: string;
  scope: Scope;
  source?: string;
  docs?: string;
  access: string;
  details?: Record<string, unknown>;
  /** Declared but not in effect: turned off in this build, or replaced by an override. */
  inactive?: "disabled" | "shadowed";
};
const categories: Category[] = [
  "All",
  "Tools",
  "Skills",
  "Agents",
  "Connections",
  "Channels",
  "System",
];
const record = (value: unknown): Record<string, unknown> =>
  value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
const array = (value: unknown): unknown[] => (Array.isArray(value) ? value : []);
const text = (value: unknown) => (typeof value === "string" ? value : "");
// Descriptions are plain text written for the model: "- " lines become lists
// and `backticks` become code, rendered as JSX text so nothing is parsed as HTML.
function CapabilityText({ text }: { readonly text: string }) {
  const blocks: { list: boolean; lines: string[] }[] = [];
  for (const raw of text.split("\n")) {
    const line = raw.trim();
    if (!line) {
      blocks.push({ list: false, lines: [] });
      continue;
    }
    const item = /^[-*•]\s+(.*)$/.exec(line)?.[1];
    const list = item !== undefined;
    const last = blocks.at(-1);
    if (last && last.list === list && last.lines.length) last.lines.push(item ?? line);
    else blocks.push({ list, lines: [item ?? line] });
  }
  const inline = (value: string) =>
    value.split("`").map((part, index) =>
      index % 2 ? (
        <code className="rounded bg-muted px-1 py-0.5 text-[0.8125rem]" key={index}>
          {part}
        </code>
      ) : (
        part
      ),
    );
  return (
    <div className="space-y-3 text-sm leading-6">
      {blocks
        .filter((block) => block.lines.length)
        .map((block, index) =>
          block.list ? (
            <ul className="list-disc space-y-1 pl-5 marker:text-muted-foreground" key={index}>
              {block.lines.map((line, item) => (
                <li key={item}>{inline(line)}</li>
              ))}
            </ul>
          ) : (
            <p className="break-words" key={index}>
              {block.lines.map((line, item) => (
                <span key={item}>
                  {item > 0 && <br />}
                  {inline(line)}
                </span>
              ))}
            </p>
          ),
        )}
    </div>
  );
}

// Tool descriptions are written for the model; rows show only their opening sentence.
const summary = (description: string) => description.split(/(?<=[.!?])\s/)[0] ?? description;
const pair = (value: unknown) => [...array(record(value).static), ...array(record(value).dynamic)];
/** The service an entry belongs to, for its logo: registry items by name, runtime ones by id. */
const brandOf = (item: Item) =>
  item.scope === "directory"
    ? registryBrand(item.source ?? "")
    : item.scope === "runtime"
      ? serviceBrand(item.id ?? item.name)
      : undefined;

// Code identifiers read as words in lists (read_file → Read file,
// profile__save_memory → Profile · Save memory); details keep the identifier.
const readable = (id: string) =>
  /^[a-z0-9]+(?:[_-]+[a-z0-9]+)*$/.test(id) ? id.split("__").map(skillLabel).join(" · ") : id;
function entry(value: unknown, category: Category, group: string): Item {
  const r = record(value);
  const annotations = record(r.annotations);
  const readOnly = r.readOnlyHint ?? annotations.readOnlyHint;
  const id =
    typeof value === "string"
      ? value
      : text(r.name) ||
        text(r.connectionName) ||
        text(r.slug) ||
        text(r.slot) ||
        text(r.id) ||
        text(r.logicalPath) ||
        text(r.path) ||
        text(r.route) ||
        group;
  return {
    name: readable(id),
    id: readable(id) === id ? undefined : id,
    description:
      text(r.description) ||
      text(r.summary) ||
      text(r.cron) ||
      text(r.backendKind) ||
      text(r.urlPath) ||
      "Declared by the runtime. Open the guide for configuration and usage.",
    category,
    group,
    scope: "runtime",
    details: r,
    source: text(r.sourcePath) || text(r.logicalPath) || text(r.path),
    access:
      r.requiresApproval === true
        ? "Approval required by the compiled tool policy"
        : readOnly === true
          ? "Declared read-only"
          : readOnly === false
            ? "May make changes; follow configured approval policy"
            : "Access policy is not specified in this listing. Listing a capability does not grant permission.",
  };
}
// Composition entries the runtime reports but does not run; they must not read as live.
const INACTIVE = {
  disabled: {
    label: "Disabled in this build",
    description: "Disabled in this build. The runtime does not load it, so it cannot run.",
    access: "Disabled in this build: nothing can call it until the build enables it again.",
  },
  shadowed: {
    label: "Replaced by an authored override",
    description:
      "Replaced by an authored override. The override with the same path runs instead of this definition.",
    access:
      "Replaced by an authored override: this definition never runs; the override's policy applies.",
  },
} as const;
function inactiveEntry(
  value: unknown,
  category: Category,
  group: string,
  kind: keyof typeof INACTIVE,
) {
  const r = record(value);
  const source = record(r.source);
  // Shadowed routes carry their method and path; composition entries a logical path.
  const route = text(r.urlPath) ? `${text(r.method)} ${text(r.urlPath)}`.trim() : "";
  const id = route || text(r.logicalPath) || text(source.logicalPath) || text(r.sourceId) || group;
  const winner = text(r.winnerSourceId);
  return {
    ...entry(value, category, group),
    name: route || readable(id),
    id: route || readable(id) === id ? undefined : id,
    description: `${INACTIVE[kind].description}${winner ? `\n\nIn effect: \`${winner}\`` : ""}`,
    source: text(r.sourceId) || text(source.sourceId),
    access: INACTIVE[kind].access,
    inactive: kind,
  } satisfies Item;
}
const included: Item[] = (
  [
    [
      "Tools",
      "Typed tools and approval flows",
      "Typed and dynamic tools, web and file tools, image creation and durable workflow tools.",
    ],
    [
      "Skills",
      "Progressive skill loading",
      "Flat, packaged and dynamic playbooks, loaded on demand.",
    ],
    [
      "Agents",
      "Delegation",
      "Copies of Ægentica for delegated work, an independent reviewer, background review and saved profile delegation.",
    ],
    [
      "Connections",
      "MCP and OpenAPI connections",
      "MCP, OpenAPI and Vercel Connect examples. Credentials and explicit configuration may be required.",
    ],
    [
      "Channels",
      "Communication channels",
      "Web chat, owner-paired Telegram, and reference custom channel patterns.",
    ],
    [
      "System",
      "Memory, state and scheduling",
      "Cross-session memory, durable session state, tasks, schedules and lifecycle hooks.",
    ],
    [
      "System",
      "Sandbox and evaluation",
      "The configured just-bash backend, evaluation fixtures and upstream test patterns; not an unrestricted host terminal.",
    ],
  ] satisfies [Category, string, string][]
).map(([category, name, description]) => ({
  category,
  name,
  description,
  group: "Scaffold",
  scope: "included",
  access: "Included source is not proof that an external service is connected.",
}));
export function EveCapabilities() {
  const { viewer } = useChatShell();
  const router = useRouter();
  const [scope, setScope] = useState<Scope>("runtime");
  const [category, setCategory] = useState<Category>("All");
  const [query, setQuery] = useState("");
  const [info, setInfo] = useState<Record<string, unknown> | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [selected, setSelected] = useState<Item | null>(null);
  useEffect(() => {
    // Deep links such as Connections → Browse directory open a given scope.
    const requested = new URLSearchParams(window.location.search).get("scope");
    if (requested === "included" || requested === "directory") setScope(requested);
  }, []);
  const load = useCallback(async () => {
    if (!viewer) {
      setInfo(null);
      return;
    }
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/eve/v1/info", { cache: "no-store" });
      if (!response.ok)
        throw new Error(
          response.status === 401
            ? "Sign in to inspect this runtime."
            : "Runtime inspection is unavailable. Retry in a moment.",
        );
      setInfo(record(await response.json()));
    } catch (error) {
      setInfo(null);
      setError(error instanceof Error ? error.message : "Could not inspect runtime.");
    } finally {
      setLoading(false);
    }
  }, [viewer]);
  useEffect(() => {
    void load();
  }, [load]);
  const runtime = useMemo(() => {
    if (!info) return [];
    const groups: [Category, string, unknown[]][] = [
      ["Tools", "Tools", pair(info.tools)],
      ["Skills", "Skills", pair(info.skills)],
      ["Agents", "Local agents", array(record(info.subagents).local)],
      ["Agents", "Remote agents", array(record(info.remoteAgents).entries)],
      ["Connections", "Connections", array(info.connections)],
      ["Channels", "Routes", array(record(info.channels).routes)],
      ["System", "Instructions", pair(info.instructions)],
      ["System", "Memory", array(info.memories)],
      ["System", "Schedules", array(info.schedules)],
      ["System", "Hooks", array(info.hooks)],
      ["System", "Sandbox", info.sandbox ? [info.sandbox] : []],
      ["System", "Workspace", array(record(info.workspace).rootEntries)],
      ["System", "Kernel effects", array(info.kernelEffects)],
      ["System", "Instrumentation", info.instrumentation ? [info.instrumentation] : []],
    ];
    const inactive: [Category, string, unknown[], keyof typeof INACTIVE][] = [
      ["System", "Disabled", array(record(info.composition).disabled), "disabled"],
      ["System", "Shadowed", array(record(info.composition).shadowed), "shadowed"],
      ["Channels", "Shadowed routes", array(record(info.channels).shadowed), "shadowed"],
    ];
    return [
      ...groups.flatMap(([category, group, entries]) =>
        entries.map((value) => entry(value, category, group)),
      ),
      ...inactive.flatMap(([category, group, entries, kind]) =>
        entries.map((value) => inactiveEntry(value, category, group, kind)),
      ),
    ];
  }, [info]);
  const directory = useMemo<Item[]>(
    () =>
      eveSurface.registryItems.map((item) => ({
        name: item.title,
        description: item.description,
        group: item.category,
        scope: "directory",
        source: item.name,
        docs: item.docs ?? undefined,
        details: { implementation: item.implementation, requirements: item.requires },
        category: item.category.includes("channel")
          ? "Channels"
          : item.category.includes("skill")
            ? "Skills"
            : item.category.includes("agent")
              ? "Agents"
              : item.category.includes("connection")
                ? "Connections"
                : item.category.includes("tool")
                  ? "Tools"
                  : "System",
        access:
          "Available from the official eve registry. Not installed or connected by this view.",
      })),
    [],
  );
  const inventory = scope === "runtime" ? runtime : scope === "included" ? included : directory;
  const filtered = inventory.filter(
    (item) =>
      (category === "All" || item.category === category) &&
      `${item.name} ${item.id || ""} ${item.description} ${item.source || ""} ${item.group}`
        .toLowerCase()
        .includes(query.toLowerCase()),
  );
  function ask(item: Item) {
    try {
      window.sessionStorage.setItem(
        "eve-chat-draft",
        `Help me understand and use ${item.name}${item.id || item.source ? ` (${item.id || item.source})` : ""}. First check whether it is configured, which permissions it needs, and what is safe to do. Do not claim it is connected from a registry listing.`,
      );
      setSelected(null);
      router.push("/");
    } catch {
      setError("Could not prepare the draft. Start a chat and ask about this capability.");
    }
  }
  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-4xl px-4 pb-16 pt-16 sm:px-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Capabilities</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              Discover the tools, skills and connections behind your agents.
            </p>
          </div>
          <Button
            aria-label="Refresh runtime"
            disabled={loading || !viewer}
            variant="outline"
            className="size-11 shrink-0"
            size="icon"
            onClick={() => void load()}
          >
            <RefreshCwIcon className={cn("size-4", loading && "animate-spin")} />
          </Button>
        </div>
        <div className="mt-6 flex flex-wrap items-center gap-3">
          <div
            className="inline-flex rounded-lg bg-muted p-1"
            aria-label="Capability source"
            role="group"
          >
            {(
              [
                ["runtime", "Live"],
                ["included", "Built in"],
                ["directory", "Explore"],
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                type="button"
                aria-pressed={scope === id}
                onClick={() => {
                  setScope(id);
                  setCategory("All");
                }}
                className={cn(
                  "min-h-10 rounded-md px-3 text-sm focus-visible:outline-2 focus-visible:outline-ring",
                  scope === id ? "bg-background shadow-sm" : "text-muted-foreground",
                )}
              >
                {label}
              </button>
            ))}
          </div>
          <Link
            className="ml-auto inline-flex min-h-11 items-center gap-1 px-1 text-sm text-muted-foreground hover:text-foreground pointer-fine:md:min-h-0"
            href="/agents"
          >
            Your agents
            <ArrowUpRightIcon className="size-4" />
          </Link>
        </div>
        <p className="mt-4 text-xs leading-5 text-muted-foreground">
          {scope === "runtime"
            ? "What this running Ægentica instance can currently expose. Connections may still need credentials or approval."
            : scope === "included"
              ? "Capabilities already included in the product, with configuration where needed."
              : `${directory.length} official eve capabilities you can add when you need them.`}
        </p>
        <div className="relative mt-5">
          <SearchIcon className="absolute left-3 top-3 size-4 text-muted-foreground" />
          <Input
            className="h-11 pl-9"
            aria-label="Search capabilities"
            placeholder="Search capabilities"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        <StickyBar className="mt-3 pb-2">
          <div
            className="scroll-row -mx-4 gap-1 px-4 sm:-mx-6 sm:px-6"
            aria-label="Capability category"
            role="group"
          >
            {categories.map((label) => (
              <button
                type="button"
                key={label}
                aria-pressed={category === label}
                onClick={() => setCategory(label)}
                className={cn(
                  "min-h-10 shrink-0 rounded-lg px-3 text-sm focus-visible:outline-2 focus-visible:outline-ring",
                  category === label
                    ? "bg-foreground text-background"
                    : "text-muted-foreground hover:bg-muted",
                )}
              >
                {label}
              </button>
            ))}
          </div>
        </StickyBar>
        {error && (
          <p className="my-3 text-sm text-destructive" role="alert">
            {error}
          </p>
        )}
        {scope === "runtime" && !viewer ? (
          <div className="mt-4 rounded-xl border p-6">
            <h2 className="font-medium">Inspect your running agent</h2>
            <p className="my-3 text-sm text-muted-foreground">
              Sign in for live capabilities. Included patterns and the official directory are
              public.
            </p>
            <PageSignInButton />
          </div>
        ) : loading && scope === "runtime" ? (
          <p className="py-8 text-sm text-muted-foreground" role="status">
            Inspecting runtime...
          </p>
        ) : filtered.length ? (
          <div className="mt-3 divide-y overflow-hidden rounded-xl border">
            {filtered.map((item, index) => (
              <button
                key={`${item.group}-${item.name}-${index}`}
                className="flex min-h-20 w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-muted/40 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring"
                onClick={() => setSelected(item)}
              >
                <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted">
                  {brandOf(item) ? (
                    <BrandIcon
                      brand={brandOf(item)}
                      className="text-foreground/80"
                      name={item.name}
                    />
                  ) : (
                    <BlocksIcon className="size-4 text-muted-foreground" />
                  )}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">{item.name}</span>
                  <span className="mt-1 line-clamp-2 text-xs leading-5 text-muted-foreground">
                    {summary(item.description)}
                  </span>
                </span>
                {/* Phones keep the badge that says an entry is not in effect. */}
                <Badge
                  variant="outline"
                  className={cn("shrink-0 font-normal", item.inactive ? "flex" : "hidden sm:flex")}
                >
                  {item.group}
                </Badge>
                <ChevronRightIcon className="size-4 shrink-0 text-muted-foreground" />
              </button>
            ))}
          </div>
        ) : (
          <div className="mt-4 rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">
            {error
              ? "Runtime information could not be retrieved."
              : "No capabilities match this view."}
          </div>
        )}
        {scope === "runtime" && info && (
          <details className="mt-4 rounded-lg border px-4 py-3 text-sm">
            <summary className="cursor-pointer font-medium">Technical details</summary>
            <dl className="mt-3 grid grid-cols-2 gap-2 text-xs">
              <dt>Environment</dt>
              <dd>{text(info.mode) || "Unknown"}</dd>
              <dt>Discovery errors</dt>
              <dd>{String(record(info.diagnostics).discoveryErrors ?? "Unknown")}</dd>
              <dt>Discovery warnings</dt>
              <dd>{String(record(info.diagnostics).discoveryWarnings ?? "Unknown")}</dd>
              <dt>Model routing</dt>
              <dd>{text(record(record(record(info.agent).model).routing).kind) || "Unknown"}</dd>
              <dt>Registry snapshot</dt>
              <dd>eve {eveSurface.eveVersion}</dd>
            </dl>
            <p className="mt-3 text-xs text-muted-foreground">
              Open Activity for live events and outcomes. Credentials are checked only when a
              capability actually runs.
            </p>
          </details>
        )}
        <div className="mt-5 flex items-start gap-2 text-xs leading-5 text-muted-foreground">
          <ShieldCheckIcon className="mt-0.5 size-4 shrink-0" />
          <p>
            External writes follow each tool's approval policy. Adding a profile or opening a
            capability does not grant new permissions.{" "}
            <Link href="/settings/integrations" className="underline underline-offset-4">
              Manage connections
            </Link>
          </p>
        </div>
        <Dialog
          open={Boolean(selected)}
          onOpenChange={(open) => {
            if (!open) setSelected(null);
          }}
        >
          <DialogContent className="max-h-[85%] max-w-xl overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 break-words pr-6">
                {selected && brandOf(selected) ? (
                  <BrandIcon brand={brandOf(selected)} className="size-5" name={selected.name} />
                ) : null}
                {selected?.name}
              </DialogTitle>
              <DialogDescription>
                {selected?.inactive
                  ? INACTIVE[selected.inactive].label
                  : selected?.scope === "runtime"
                    ? "Declared by the runtime"
                    : selected?.scope === "included"
                      ? "Included source pattern"
                      : "Official registry entry"}
              </DialogDescription>
            </DialogHeader>
            {selected && (
              <>
                {selected.id && (
                  <p className="text-xs text-muted-foreground">
                    Identifier <code className="break-all text-foreground">{selected.id}</code>
                  </p>
                )}
                <CapabilityText text={selected.description} />
                <div className="rounded-lg bg-muted p-4 text-sm">
                  <p className="font-medium">Access</p>
                  <p className="mt-1 leading-6 text-muted-foreground">{selected.access}</p>
                </div>
                {selected.source && (
                  <div>
                    <p className="mb-1 text-xs text-muted-foreground">
                      {selected.scope === "directory" ? "Registry identifier" : "Source"}
                    </p>
                    <code className="break-all text-xs">{selected.source}</code>
                  </div>
                )}
                {selected.scope === "directory" && selected.source && (
                  <div>
                    <p className="mb-2 text-sm">Maintainer setup</p>
                    <code className="block overflow-x-auto rounded-lg bg-muted p-3 text-xs">
                      pnpm exec eve add {selected.source}
                    </code>
                    <p className="mt-2 text-xs leading-5 text-muted-foreground">
                      Review generated code, configure credentials and approvals, rebuild, then
                      deploy through Dokploy.
                    </p>
                  </div>
                )}
                {selected.details && (
                  <details className="rounded-lg border p-3 text-sm">
                    <summary className="cursor-pointer font-medium">
                      Configuration and schemas
                    </summary>
                    <pre className="mt-3 max-h-72 overflow-auto whitespace-pre-wrap break-words text-xs leading-5">
                      {JSON.stringify(selected.details, null, 2)}
                    </pre>
                  </details>
                )}
                <div className="flex flex-wrap gap-2">
                  <Button variant="outline" className="min-h-11" onClick={() => ask(selected)}>
                    Ask in chat
                  </Button>
                  {selected.docs?.startsWith("/") && (
                    <Button asChild variant="outline" className="min-h-11">
                      <a
                        href={`https://eve.dev${selected.docs}`}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        Official documentation
                        <ArrowUpRightIcon className="size-4" />
                      </a>
                    </Button>
                  )}
                </div>
              </>
            )}
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}
