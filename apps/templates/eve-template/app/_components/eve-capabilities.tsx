"use client";

import { Client } from "eve/client";
import {
  ActivityIcon,
  BlocksIcon,
  BotIcon,
  BrainIcon,
  CableIcon,
  CalendarClockIcon,
  CircleAlertIcon,
  DatabaseIcon,
  FolderCogIcon,
  GitBranchIcon,
  HardDriveIcon,
  RadioTowerIcon,
  RefreshCwIcon,
  ShieldCheckIcon,
  SparklesIcon,
  WrenchIcon,
} from "lucide-react";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { eveSurface } from "@/lib/eve-surface.generated";

interface RuntimeInfo {
  readonly version?: number;
  readonly mode?: string;
  readonly agent?: {
    readonly name?: string;
    readonly description?: string;
    readonly model?: { readonly id?: string };
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
  readonly channels?: { readonly routes?: readonly unknown[]; readonly shadowed?: readonly unknown[] };
  readonly subagents?: { readonly local?: readonly unknown[]; readonly total?: number };
  readonly remoteAgents?: { readonly entries?: readonly unknown[]; readonly total?: number };
  readonly sandbox?: unknown;
  readonly workspace?: { readonly resourceRoot?: string | null; readonly rootEntries?: readonly unknown[] };
  readonly composition?: { readonly disabled?: readonly unknown[]; readonly shadowed?: readonly unknown[] };
  readonly diagnostics?: { readonly discoveryErrors?: number; readonly discoveryWarnings?: number };
}

const iconClass = "size-4";

export function EveCapabilities() {
  const [info, setInfo] = useState<RuntimeInfo | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const client = new Client({ host: "" });
      setInfo((await client.info()) as unknown as RuntimeInfo);
    } catch (value) {
      setError(value instanceof Error ? value.message : "Could not inspect the Eve agent.");
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
      `${item.name} ${item.title} ${item.description} ${item.category}`.toLowerCase().includes(normalized),
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

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto w-full max-w-4xl px-4 py-10 sm:px-6 sm:py-12">
        <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="mb-2 flex items-center gap-2 text-sm text-muted-foreground">
              <BlocksIcon className={iconClass} />
              Agent
            </div>
            <h1 className="text-2xl font-semibold tracking-tight">Agent</h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">
              See what this agent is running now, what this repo already includes, and what the official Eve ecosystem can add. These scopes are kept separate so available capabilities are never mistaken for active ones.
            </p>
          </div>
          <Button disabled={loading} onClick={() => void load()} size="sm" variant="outline">
            <RefreshCwIcon className={loading ? "size-4 animate-spin" : "size-4"} />
            Refresh runtime
          </Button>
        </div>

        {error ? (
          <div className="mb-6 flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm">
            <CircleAlertIcon className="mt-0.5 size-4 shrink-0 text-destructive" />
            <div>
              <p className="font-medium">Runtime inspection unavailable</p>
              <p className="mt-1 text-muted-foreground">{error}</p>
            </div>
          </div>
        ) : null}

        <div className="mb-3 text-xs font-medium uppercase tracking-wide text-muted-foreground">Active</div>
        <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <SummaryCard
            icon={<BotIcon className={iconClass} />}
            label="Runtime"
            value={info?.agent?.name ?? (loading ? "Loading…" : "Unavailable")}
            detail={info?.agent?.model?.id ?? "Live compiled agent"}
          />
          <SummaryCard
            icon={<WrenchIcon className={iconClass} />}
            label="Tools"
            value={String(countPair(info?.tools))}
            detail="static + dynamic"
          />
          <SummaryCard
            icon={<SparklesIcon className={iconClass} />}
            label="Skills"
            value={String(countPair(info?.skills))}
            detail="static + dynamic"
          />
          <SummaryCard
            icon={<GitBranchIcon className={iconClass} />}
            label="Agents"
            value={String((info?.subagents?.total ?? 0) + (info?.remoteAgents?.total ?? 0))}
            detail="local + remote"
          />
        </section>

        <section className="mt-6">
          <div className="mb-3">
            <p className="text-sm font-medium">Active capabilities</p>
            <p className="mt-1 text-xs leading-5 text-muted-foreground">Reported by the live compiled Eve agent for this runtime.</p>
          </div>
          <div className="grid gap-3 lg:grid-cols-2">
          <CapabilityGroup title="Tools" icon={<WrenchIcon className={iconClass} />} entries={pairEntries(info?.tools)} />
          <CapabilityGroup title="Skills" icon={<SparklesIcon className={iconClass} />} entries={pairEntries(info?.skills)} />
          <CapabilityGroup title="Instructions" icon={<BrainIcon className={iconClass} />} entries={pairEntries(info?.instructions)} />
          <CapabilityGroup title="Connections" icon={<CableIcon className={iconClass} />} entries={info?.connections ?? []} />
          <CapabilityGroup title="Channels / routes" icon={<RadioTowerIcon className={iconClass} />} entries={info?.channels?.routes ?? []} />
          <CapabilityGroup title="Memory" icon={<DatabaseIcon className={iconClass} />} entries={info?.memories ?? []} />
          <CapabilityGroup title="Schedules" icon={<CalendarClockIcon className={iconClass} />} entries={info?.schedules ?? []} />
          <CapabilityGroup title="Hooks" icon={<ActivityIcon className={iconClass} />} entries={info?.hooks ?? []} />
          <CapabilityGroup title="Local subagents" icon={<BotIcon className={iconClass} />} entries={info?.subagents?.local ?? []} />
          <CapabilityGroup title="Remote agents" icon={<RadioTowerIcon className={iconClass} />} entries={info?.remoteAgents?.entries ?? []} />
          <CapabilityGroup title="Sandbox" icon={<HardDriveIcon className={iconClass} />} entries={info?.sandbox ? [info.sandbox] : []} />
          <CapabilityGroup title="Workspace" icon={<FolderCogIcon className={iconClass} />} entries={info?.workspace?.rootEntries ?? []} />
          <CapabilityGroup title="Composition: disabled" icon={<ShieldCheckIcon className={iconClass} />} entries={info?.composition?.disabled ?? []} />
          <CapabilityGroup title="Composition: shadowed" icon={<FolderCogIcon className={iconClass} />} entries={info?.composition?.shadowed ?? []} />
          </div>
        </section>

        <section className="mt-6 rounded-lg border bg-card">
          <div className="border-b p-4">
            <div className="flex items-center gap-2 font-medium">
              <BlocksIcon className={iconClass} />
              Included in this repo
            </div>
            <p className="mt-1 text-sm text-muted-foreground">
              Working scaffolds and examples already present in this template. Some are caller-gated, optional, or only active after credentials are configured.
            </p>
          </div>
          <div className="grid gap-px bg-border sm:grid-cols-2 lg:grid-cols-3">
            {[
              ["Tools", "typed, dynamic, approvals, filesystem, search, workflow"],
              ["Skills", "flat, packaged and dynamic skills"],
              ["Workflows", "blocking, background and runtime-generated"],
              ["Subagents", "visible, hidden and conditional child agents"],
              ["Connections", "MCP, OpenAPI and dynamic connection examples"],
              ["Channels", "HTTP, Slack, MCP and custom channel scaffolds"],
              ["Memory", "cross-session profile memory and session state"],
              ["Schedules", "heartbeat scheduling scaffold"],
              ["Hooks", "global lifecycle audit hook"],
              ["Sandbox", "seeded workspace plus Eve sandbox tools"],
              ["Evals", "smoke, HITL, state, delegation and workflow evals"],
            ].map(([title, detail]) => (
              <div className="bg-background p-4" key={title}>
                <p className="text-sm font-medium">{title}</p>
                <p className="mt-1 text-xs leading-5 text-muted-foreground">{detail}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="mt-6 rounded-lg border bg-card">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b p-4">
            <div>
              <div className="flex items-center gap-2 font-medium">
                <HardDriveIcon className={iconClass} />
                Available from Eve
              </div>
              <p className="mt-1 text-sm text-muted-foreground">
                {eveSurface.registryItems.length} official registry items available to add or configure · Eve {eveSurface.eveVersion}
              </p>
            </div>
            <Input
              className="w-full sm:w-72"
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search integrations…"
              value={query}
            />
          </div>
          <div className="divide-y">
            {groups.map(([category, items]) => (
              <div className="grid gap-3 p-4 md:grid-cols-[10rem_1fr]" key={category}>
                <div className="pt-1 text-sm font-medium capitalize">{category}</div>
                <div className="grid gap-2 sm:grid-cols-2">
                  {items.map((item) => (
                    <div className="rounded-lg border bg-background p-3" key={item.name}>
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium">{item.title}</p>
                          <p className="mt-1 line-clamp-2 text-xs leading-5 text-muted-foreground">
                            {item.description}
                          </p>
                        </div>
                        <Badge variant="secondary">{item.implementation ?? "registry"}</Badge>
                      </div>
                      <code className="mt-2 block truncate text-[11px] text-muted-foreground">
                        eve add {item.name}
                      </code>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="mt-6 rounded-lg border bg-card">
          <div className="border-b p-4">
            <div className="flex items-center gap-2 font-medium">
              <BlocksIcon className={iconClass} /> Available package surface
            </div>
            <p className="mt-1 text-sm text-muted-foreground">
              {eveSurface.packageExports.length} public package entrypoints exposed by the checked-out Eve package.
            </p>
          </div>
          <div className="flex flex-wrap gap-2 p-4">
            {eveSurface.packageExports.map((entry) => (
              <Badge key={entry} variant="outline">{entry}</Badge>
            ))}
          </div>
        </section>

        <section className="mt-6 rounded-lg border bg-card p-4 text-sm">
          <div className="flex items-center gap-2 font-medium">
            <ShieldCheckIcon className={iconClass} /> Diagnostics
          </div>
          <div className="mt-3 grid gap-2 text-muted-foreground sm:grid-cols-3">
            <p>Agent-info: v{info?.version ?? "—"}</p>
            <p>Mode: {info?.mode ?? "—"}</p>
            <p>
              Diagnostics: {info?.diagnostics?.discoveryErrors ?? 0} errors · {info?.diagnostics?.discoveryWarnings ?? 0} warnings
            </p>
          </div>
        </section>
      </div>
    </div>
  );
}

function SummaryCard({
  icon,
  label,
  value,
  detail,
}: {
  readonly icon: ReactNode;
  readonly label: string;
  readonly value: string;
  readonly detail: string;
}) {
  return (
    <div className="rounded-lg border bg-card p-3.5">
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        {icon}
        {label}
      </div>
      <div className="mt-2.5 text-lg font-semibold">{value}</div>
      <div className="mt-1 truncate text-xs text-muted-foreground">{detail}</div>
    </div>
  );
}

function CapabilityGroup({
  title,
  icon,
  entries,
}: {
  readonly title: string;
  readonly icon: ReactNode;
  readonly entries: readonly unknown[];
}) {
  return (
    <div className="rounded-lg border bg-card p-3.5">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-sm font-medium">
          {icon}
          {title}
        </div>
        <Badge variant="secondary">{entries.length}</Badge>
      </div>
      {entries.length ? (
        <div className="mt-3 flex flex-wrap gap-2">
          {entries.slice(0, 30).map((entry, index) => (
            <Badge key={`${entryName(entry)}-${index}`} variant="outline">
              {entryName(entry)}
            </Badge>
          ))}
          {entries.length > 30 ? <Badge variant="outline">+{entries.length - 30}</Badge> : null}
        </div>
      ) : (
        <p className="mt-3 text-xs text-muted-foreground">None in the effective compiled agent.</p>
      )}
    </div>
  );
}

function pairEntries(value: RuntimeInfo["tools"] | RuntimeInfo["skills"] | RuntimeInfo["instructions"]) {
  return [...(value?.static ?? []), ...(value?.dynamic ?? [])];
}

function countPair(value: RuntimeInfo["tools"] | RuntimeInfo["skills"] | RuntimeInfo["instructions"]) {
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
