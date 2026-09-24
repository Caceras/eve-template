"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  BlocksIcon,
  RefreshCwIcon,
  SearchIcon,
  ArrowUpRightIcon,
  ShieldCheckIcon,
} from "lucide-react";
import { useChatShell } from "./chat-shell-context";
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
import { cn } from "@/lib/utils";

type Scope = "runtime" | "included" | "directory";
type Category = "All" | "Tools" | "Skills" | "Agents" | "Connections" | "Channels" | "System";
type Item = {
  name: string;
  description: string;
  category: Category;
  group: string;
  scope: Scope;
  source?: string;
  docs?: string;
  access: string;
  details?: Record<string, unknown>;
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
const pair = (value: unknown) => [...array(record(value).static), ...array(record(value).dynamic)];
function entry(value: unknown, category: Category, group: string): Item {
  const r = record(value);
  const annotations = record(r.annotations);
  const readOnly = r.readOnlyHint ?? annotations.readOnlyHint;
  return {
    name:
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
          group,
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
const included: Item[] = [
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
    "Compiled researcher and reviewer agents, background review and saved profile delegation.",
  ],
  [
    "Apps",
    "Connections",
    "MCP, OpenAPI and Vercel Connect examples. Credentials and explicit configuration may be required.",
  ],
  [
    "Channels",
    "Communication channels",
    "Web chat, owner-paired Telegram, and reference custom channel patterns.",
  ],
  [
    "More",
    "Memory, state and scheduling",
    "Cross-session memory, durable session state, tasks, schedules and lifecycle hooks.",
  ],
  [
    "More",
    "Sandbox and evaluation",
    "The configured just-bash backend, evaluation fixtures and upstream test patterns; not an unrestricted host terminal.",
  ],
].map(([category, name, description]) => ({
  category: category as Category,
  name: name!,
  description: description!,
  group: "Scaffold",
  scope: "included",
  access: "Included source is not proof that an external service is connected.",
}));
export function EveCapabilities() {
  const { viewer, requestSignIn } = useChatShell();
  const router = useRouter();
  const [scope, setScope] = useState<Scope>("runtime");
  const [category, setCategory] = useState<Category>("All");
  const [query, setQuery] = useState("");
  const [info, setInfo] = useState<Record<string, unknown> | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [selected, setSelected] = useState<Item | null>(null);
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
      ["System", "Disabled", array(record(info.composition).disabled)],
      ["System", "Shadowed", array(record(info.composition).shadowed)],
      ["Channels", "Shadowed routes", array(record(info.channels).shadowed)],
      ["System", "Kernel effects", array(info.kernelEffects)],
      ["System", "Instrumentation", info.instrumentation ? [info.instrumentation] : []],
    ];
    return groups.flatMap(([category, group, entries]) =>
      entries.map((value) => entry(value, category, group)),
    );
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
      `${item.name} ${item.description} ${item.source || ""} ${item.group}`
        .toLowerCase()
        .includes(query.toLowerCase()),
  );
  function ask(item: Item) {
    try {
      window.sessionStorage.setItem(
        "eve-chat-draft",
        `Help me understand and use ${item.name}${item.source ? ` (${item.source})` : ""}. First check whether it is configured, which permissions it needs, and what is safe to do. Do not claim it is connected from a registry listing.`,
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
          <div className="inline-flex rounded-lg bg-muted p-1" aria-label="Capability source">
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
            className="ml-auto inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
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
        <div className="mt-3 flex gap-1 overflow-x-auto pb-2" aria-label="Capability category">
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
            <Button onClick={() => requestSignIn()}>Sign in</Button>
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
                  <BlocksIcon className="size-4 text-muted-foreground" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">{item.name}</span>
                  <span className="mt-1 line-clamp-2 text-xs leading-5 text-muted-foreground">
                    {item.description}
                  </span>
                </span>
                <Badge variant="outline" className="hidden shrink-0 font-normal sm:flex">
                  {item.group}
                </Badge>
                <ArrowUpRightIcon className="size-4 shrink-0 text-muted-foreground" />
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
          <DialogContent className="max-h-[85dvh] max-w-xl overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="break-words pr-6">{selected?.name}</DialogTitle>
              <DialogDescription>
                {selected?.scope === "runtime"
                  ? "Declared by the runtime"
                  : selected?.scope === "included"
                    ? "Included source pattern"
                    : "Official registry entry"}
              </DialogDescription>
            </DialogHeader>
            {selected && (
              <>
                <p className="text-sm leading-6">{selected.description}</p>
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
                        href={`https://eve.dev/docs${selected.docs}`}
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
