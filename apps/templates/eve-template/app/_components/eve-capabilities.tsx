"use client";

import { useChatShell } from "@/app/_components/chat-shell-context";
import Link from "next/link";
import {
  ActivityIcon,
  BlocksIcon,
  BotIcon,
  BrainIcon,
  CableIcon,
  CalendarClockIcon,
  CheckCircle2Icon,
  CircleAlertIcon,
  DatabaseIcon,
  FolderCogIcon,
  GitBranchIcon,
  HardDriveIcon,
  RadioTowerIcon,
  RefreshCwIcon,
  SearchIcon,
  ShieldCheckIcon,
  SparklesIcon,
  WrenchIcon,
} from "lucide-react";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { eveSurface } from "@/lib/eve-surface.generated";
import { cn } from "@/lib/utils";

interface RuntimeInfo {
  readonly version?: number;
  readonly mode?: string;
  readonly agent?: {
    readonly name?: string;
    readonly description?: string;
    readonly model?: { readonly id?: string; readonly endpoint?: { readonly connected?: boolean } };
  };
  readonly tools?: { readonly static?: readonly unknown[]; readonly dynamic?: readonly unknown[] };
  readonly skills?: { readonly static?: readonly unknown[]; readonly dynamic?: readonly unknown[] };
  readonly instructions?: {
    readonly static?: readonly unknown[];
    readonly dynamic?: readonly unknown[];
  };
  readonly connections?: readonly unknown[];
  readonly hooks?: readonly unknown[];
  readonly memories?: readonly unknown[];
  readonly schedules?: readonly unknown[];
  readonly channels?: {
    readonly routes?: readonly unknown[];
    readonly shadowed?: readonly unknown[];
  };
  readonly subagents?: { readonly local?: readonly unknown[]; readonly total?: number };
  readonly remoteAgents?: { readonly entries?: readonly unknown[]; readonly total?: number };
  readonly sandbox?: unknown;
  readonly workspace?: {
    readonly resourceRoot?: string | null;
    readonly rootEntries?: readonly unknown[];
  };
  readonly composition?: {
    readonly disabled?: readonly unknown[];
    readonly shadowed?: readonly unknown[];
  };
  readonly diagnostics?: { readonly discoveryErrors?: number; readonly discoveryWarnings?: number };
}

type AgentView = "overview" | "included" | "available";

const iconClass = "size-4";
const INCLUDED_AREAS = [
  ["Tools", "Typed and dynamic tools, approvals, filesystem, search and workflow scaffolds."],
  ["Skills", "Flat, packaged and dynamic skill loading."],
  ["Workflows", "Blocking, background and runtime-generated workflows."],
  ["Subagents", "Visible, hidden and conditional child-agent patterns."],
  ["Connections", "MCP, OpenAPI and dynamic connection scaffolds."],
  ["Channels", "HTTP, Slack, MCP and custom channel examples."],
  ["Memory", "Cross-session profile memory and durable session state."],
  ["Schedules", "Heartbeat and scheduled-action scaffolds."],
  ["Hooks", "Global lifecycle and audit hooks."],
  ["Sandbox", "Seeded workspace and Ægentica sandbox tooling."],
  ["Evals", "Smoke, HITL, state, delegation and workflow evals."],
] as const;

export function EveCapabilities() {
  const { requestSignIn } = useChatShell();
  const [needsLogin, setNeedsLogin] = useState(false);
  const [info, setInfo] = useState<RuntimeInfo | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [view, setView] = useState<AgentView>("overview");

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      setInfo(null);
      setNeedsLogin(false);
      const response = await fetch("/eve/v1/info");
      if (response.status === 401) {
        setNeedsLogin(true);
        return;
      }
      if (!response.ok)
        throw new Error("Agent status could not be loaded. Try refreshing in a moment.");
      setInfo((await response.json()) as RuntimeInfo);
    } catch (value) {
      setError(value instanceof Error ? value.message : "Could not inspect the Ægentica agent.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const registryItems = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return eveSurface.registryItems;
    return eveSurface.registryItems.filter((item) =>
      `${item.name} ${item.title} ${item.description} ${item.category}`
        .toLowerCase()
        .includes(normalized),
    );
  }, [query]);

  const groups = useMemo(() => {
    const map = new Map<string, typeof registryItems>();
    for (const item of registryItems) {
      const current = map.get(item.category) ?? [];
      map.set(item.category, [...current, item]);
    }
    return [...map.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [registryItems]);

  const activeGroups = [
    ["Tools", <WrenchIcon className={iconClass} />, pairEntries(info?.tools)],
    ["Skills", <SparklesIcon className={iconClass} />, pairEntries(info?.skills)],
    ["Instructions", <BrainIcon className={iconClass} />, pairEntries(info?.instructions)],
    ["Connections", <CableIcon className={iconClass} />, info?.connections ?? []],
    ["Channel routes", <RadioTowerIcon className={iconClass} />, info?.channels?.routes ?? []],
    ["Memory", <DatabaseIcon className={iconClass} />, info?.memories ?? []],
    ["Schedules", <CalendarClockIcon className={iconClass} />, info?.schedules ?? []],
    ["Hooks", <ActivityIcon className={iconClass} />, info?.hooks ?? []],
    ["Local agents", <BotIcon className={iconClass} />, info?.subagents?.local ?? []],
    ["Remote agents", <RadioTowerIcon className={iconClass} />, info?.remoteAgents?.entries ?? []],
    ["Sandbox", <HardDriveIcon className={iconClass} />, info?.sandbox ? [info.sandbox] : []],
    ["Workspace", <FolderCogIcon className={iconClass} />, info?.workspace?.rootEntries ?? []],
    ["Disabled", <ShieldCheckIcon className={iconClass} />, info?.composition?.disabled ?? []],
    ["Shadowed", <FolderCogIcon className={iconClass} />, info?.composition?.shadowed ?? []],
  ] as const;

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto w-full max-w-4xl px-4 pb-16 pt-16 sm:px-6 sm:pt-14">
        <div className="flex flex-wrap items-start justify-between gap-5">
          <div className="min-w-0">
            <div className="mb-2 flex items-center gap-2 text-sm text-muted-foreground">
              <BlocksIcon className={iconClass} />
              Agent
            </div>
            <h1 className="text-2xl font-semibold tracking-tight">Agent</h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
              See what your agent can do, check its connection, and explore more possibilities.{" "}
              <Link href="/library" className="underline underline-offset-4">
                Read the guide
              </Link>
            </p>
          </div>

          <div className="flex items-center gap-2">
            <Badge className="h-7 gap-1.5 rounded-md px-2.5 font-normal" variant="outline">
              <span
                className={cn(
                  "size-1.5 rounded-full",
                  needsLogin
                    ? "bg-muted-foreground"
                    : error
                      ? "bg-destructive"
                      : loading
                        ? "bg-muted-foreground/40"
                        : "bg-emerald-500",
                )}
              />
              {needsLogin
                ? "Sign in to inspect"
                : error
                  ? "Status unavailable"
                  : loading
                    ? "Checking agent"
                    : "Runtime live"}
            </Badge>
            <Button
              aria-label="Refresh runtime"
              disabled={loading}
              onClick={() => void load()}
              size="icon-sm"
              type="button"
              variant="outline"
            >
              <RefreshCwIcon className={cn("size-4", loading && "animate-spin")} />
            </Button>
          </div>
        </div>

        <div className="mt-7 inline-flex rounded-lg bg-muted/70 p-1">
          <ViewButton active={view === "overview"} onClick={() => setView("overview")}>
            Overview
          </ViewButton>
          <ViewButton active={view === "included"} onClick={() => setView("included")}>
            Included
          </ViewButton>
          <ViewButton active={view === "available"} onClick={() => setView("available")}>
            Available
          </ViewButton>
        </div>

        {needsLogin && view === "overview" ? (
          <div className="mt-6 rounded-xl border p-6">
            <h2 className="text-base font-medium">Get to know your agent</h2>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              Sign in to see your agent’s live capabilities. You can explore Included, Available and
              the library without signing in.
            </p>
            <Button className="mt-4" onClick={() => requestSignIn()}>
              Sign in
            </Button>
          </div>
        ) : null}
        {error ? (
          <div className="mt-6 flex items-start gap-3 rounded-lg border border-destructive/25 bg-destructive/[0.035] p-4 text-sm">
            <CircleAlertIcon className="mt-0.5 size-4 shrink-0 text-destructive" />
            <div className="min-w-0">
              <p className="font-medium">Runtime inspection unavailable</p>
              <p className="mt-1 break-words text-muted-foreground">{error}</p>
            </div>
          </div>
        ) : null}

        {view === "overview" && !needsLogin ? (
          <div className="mt-6 space-y-6">
            <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <Metric
                detail={info?.agent?.model?.id ?? "Live compiled agent"}
                icon={<BotIcon className={iconClass} />}
                label="Runtime"
                value={info?.agent?.name ?? (loading ? "Loading…" : "Unavailable")}
              />
              <Metric
                detail="static + dynamic"
                icon={<WrenchIcon className={iconClass} />}
                label="Tools"
                value={info ? String(countPair(info.tools)) : "—"}
              />
              <Metric
                detail="static + dynamic"
                icon={<SparklesIcon className={iconClass} />}
                label="Skills"
                value={info ? String(countPair(info.skills)) : "—"}
              />
              <Metric
                detail="local + remote"
                icon={<GitBranchIcon className={iconClass} />}
                label="Agents"
                value={
                  info
                    ? String((info.subagents?.total ?? 0) + (info.remoteAgents?.total ?? 0))
                    : "—"
                }
              />
            </section>

            {info ? (
              <div className="rounded-lg border px-4 py-3 text-sm leading-6">
                <span className="font-medium">Model selection: </span>
                Choose a model in the message composer.{" "}
                <Link href="/settings" className="underline underline-offset-4">
                  Switch between AI Gateway and OpenRouter in Settings
                </Link>
                .
                <p className="text-muted-foreground">
                  The capabilities below are declared by the agent. External services require their
                  own connection and a successful test.
                </p>
              </div>
            ) : null}
            <section>
              <SectionHeading
                description="Declared by the live runtime. Connections listed here are not necessarily authenticated."
                title="Agent capabilities"
              />
              <div className="overflow-hidden rounded-xl border bg-card">
                {info ? (
                  activeGroups.map(([title, icon, entries], index) => (
                    <CapabilityRow
                      entries={entries}
                      icon={icon}
                      key={title}
                      last={index === activeGroups.length - 1}
                      title={title}
                    />
                  ))
                ) : (
                  <p className="p-4 text-sm text-muted-foreground">
                    {loading
                      ? "Loading agent capabilities…"
                      : "Agent capabilities are currently unknown."}
                  </p>
                )}
              </div>
            </section>

            <section className="rounded-xl border bg-card">
              <div className="flex items-center gap-2 border-b px-4 py-3 text-sm font-medium">
                <ShieldCheckIcon className={iconClass} />
                Runtime
              </div>
              <div className="grid gap-px bg-border sm:grid-cols-3">
                <Diagnostic label="Agent info" value={`v${info?.version ?? "—"}`} />
                <Diagnostic label="Mode" value={info?.mode ?? "—"} />
                <Diagnostic
                  label="Discovery"
                  value={
                    info
                      ? `${info.diagnostics?.discoveryErrors ?? 0} errors · ${info.diagnostics?.discoveryWarnings ?? 0} warnings`
                      : "—"
                  }
                />
              </div>
            </section>
          </div>
        ) : null}

        {view === "included" ? (
          <div className="mt-6">
            <SectionHeading
              description="Present in this repository. Some capabilities still require credentials, caller permissions or explicit configuration before becoming active."
              title="Included scaffolds"
            />
            <div className="overflow-hidden rounded-xl border bg-card">
              <div className="grid gap-px bg-border sm:grid-cols-2">
                {INCLUDED_AREAS.map(([title, detail]) => (
                  <div className="bg-background p-4 sm:p-5" key={title}>
                    <div className="flex items-center gap-2">
                      <CheckCircle2Icon className="size-4 text-muted-foreground" />
                      <p className="text-sm font-medium">{title}</p>
                    </div>
                    <p className="mt-2 text-xs leading-5 text-muted-foreground">{detail}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        ) : null}

        {view === "available" ? (
          <div className="mt-6 space-y-6">
            <section>
              <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
                <SectionHeading
                  description={`${eveSurface.registryItems.length} official registry items available to add or configure in Ægentica.`}
                  title="Capability registry"
                />
                <div className="relative w-full sm:w-72">
                  <SearchIcon className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    className="pl-9"
                    onChange={(event) => setQuery(event.target.value)}
                    placeholder="Search registry"
                    value={query}
                  />
                </div>
              </div>

              <div className="mt-4 overflow-hidden rounded-xl border bg-card">
                {groups.length ? (
                  groups.map(([category, items], groupIndex) => (
                    <div className={cn(groupIndex > 0 && "border-t")} key={category}>
                      <div className="flex items-center justify-between bg-muted/30 px-4 py-2.5">
                        <p className="text-xs font-medium capitalize text-muted-foreground">
                          {category}
                        </p>
                        <span className="text-[11px] text-muted-foreground">{items.length}</span>
                      </div>
                      <div className="divide-y">
                        {items.map((item) => (
                          <div
                            className="grid gap-3 px-4 py-3.5 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center"
                            key={item.name}
                          >
                            <div className="min-w-0">
                              <div className="flex min-w-0 items-center gap-2">
                                <p className="truncate text-sm font-medium">{item.title}</p>
                                <Badge className="shrink-0 font-normal" variant="secondary">
                                  {item.implementation ?? "registry"}
                                </Badge>
                              </div>
                              <p className="mt-1 line-clamp-2 text-xs leading-5 text-muted-foreground">
                                {item.description}
                              </p>
                            </div>
                            <code className="truncate text-[11px] text-muted-foreground sm:max-w-56">
                              Add {item.name}
                            </code>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="px-4 py-10 text-center text-sm text-muted-foreground">
                    No registry items match “{query}”.
                  </div>
                )}
              </div>
            </section>

            <section>
              <SectionHeading
                description={`${eveSurface.packageExports.length} public package entrypoints exposed by the underlying agent framework.`}
                title="Package surface"
              />
              <div className="flex flex-wrap gap-2 rounded-xl border bg-card p-4">
                {eveSurface.packageExports.map((entry) => (
                  <Badge className="font-mono font-normal" key={entry} variant="outline">
                    {entry}
                  </Badge>
                ))}
              </div>
            </section>
          </div>
        ) : null}
      </div>
    </div>
  );
}

function ViewButton({
  active,
  children,
  onClick,
}: {
  readonly active: boolean;
  readonly children: ReactNode;
  readonly onClick: () => void;
}) {
  return (
    <button
      className={cn(
        "h-8 rounded-md px-3 text-sm transition-[background-color,color,box-shadow]",
        active
          ? "bg-background text-foreground shadow-sm"
          : "text-muted-foreground hover:text-foreground",
      )}
      onClick={onClick}
      type="button"
    >
      {children}
    </button>
  );
}

function SectionHeading({
  description,
  title,
}: {
  readonly description: string;
  readonly title: string;
}) {
  return (
    <div className="mb-3">
      <h2 className="text-sm font-medium">{title}</h2>
      <p className="mt-1 max-w-2xl text-xs leading-5 text-muted-foreground">{description}</p>
    </div>
  );
}

function Metric({
  detail,
  icon,
  label,
  value,
}: {
  readonly detail: string;
  readonly icon: ReactNode;
  readonly label: string;
  readonly value: string;
}) {
  return (
    <div className="rounded-xl border bg-card p-4">
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        {icon}
        {label}
      </div>
      <div className="mt-3 truncate text-lg font-semibold tracking-tight">{value}</div>
      <div className="mt-1 truncate text-xs text-muted-foreground">{detail}</div>
    </div>
  );
}

function CapabilityRow({
  entries,
  icon,
  last,
  title,
}: {
  readonly entries: readonly unknown[];
  readonly icon: ReactNode;
  readonly last: boolean;
  readonly title: string;
}) {
  return (
    <div className={cn("grid gap-3 px-4 py-3.5 sm:grid-cols-[10rem_1fr]", !last && "border-b")}>
      <div className="flex items-center gap-2 text-sm">
        <span className="text-muted-foreground">{icon}</span>
        <span className="font-medium">{title}</span>
        <span className="ml-auto text-xs tabular-nums text-muted-foreground sm:ml-1">
          {entries.length}
        </span>
      </div>
      <div className="min-w-0">
        {entries.length ? (
          <div className="flex flex-wrap gap-1.5">
            {entries.slice(0, 12).map((entry, index) => (
              <Badge
                className="max-w-full font-normal"
                key={`${entryName(entry)}-${index}`}
                variant="outline"
              >
                <span className="truncate">{entryName(entry)}</span>
              </Badge>
            ))}
            {entries.length > 12 ? (
              <Badge className="font-normal" variant="secondary">
                +{entries.length - 12}
              </Badge>
            ) : null}
          </div>
        ) : (
          <span className="text-xs text-muted-foreground">None active</span>
        )}
      </div>
    </div>
  );
}

function Diagnostic({ label, value }: { readonly label: string; readonly value: string }) {
  return (
    <div className="bg-background px-4 py-3.5">
      <p className="text-[11px] text-muted-foreground">{label}</p>
      <p className="mt-1 text-sm">{value}</p>
    </div>
  );
}

function pairEntries(
  value: RuntimeInfo["tools"] | RuntimeInfo["skills"] | RuntimeInfo["instructions"],
) {
  return [...(value?.static ?? []), ...(value?.dynamic ?? [])];
}

function countPair(
  value: RuntimeInfo["tools"] | RuntimeInfo["skills"] | RuntimeInfo["instructions"],
) {
  return (value?.static?.length ?? 0) + (value?.dynamic?.length ?? 0);
}

function entryName(value: unknown): string {
  if (typeof value === "string") return value;
  if (!value || typeof value !== "object") return "unknown";
  const record = value as Record<string, unknown>;
  for (const key of ["name", "id", "logicalPath", "sourceId", "path", "route"]) {
    if (typeof record[key] === "string") return record[key] as string;
  }
  return "capability";
}
