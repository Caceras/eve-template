"use client";
import {
  BrainIcon,
  CalendarClockIcon,
  ChevronDownIcon,
  GlobeIcon,
  ImageIcon,
  MicIcon,
  SearchIcon,
  TerminalIcon,
} from "lucide-react";
import Link from "next/link";
import { type ComponentType, type ReactNode, useCallback, useEffect, useState } from "react";
import { GitHubIcon, LinearIcon, NotionIcon, SentryIcon } from "@/components/icons";
import { BrandIcon } from "@/components/brand-icon";

const TelegramIcon = ({ className }: { className?: string }) => (
  <BrandIcon brand="telegram" className={className} name="Telegram" />
);
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Input } from "@/components/ui/input";
import type { ConfiguredConnection } from "@/lib/chat/types";
import { cn } from "@/lib/utils";
import { useChatShell } from "./chat-shell-context";
import { GithubSettings } from "./github-settings";
import { SettingsShell } from "./settings-shell";
import { TelegramSettings } from "./telegram-settings";

type Status = "on" | "connected" | "configured" | "setup";
type Integration = {
  id: string;
  name: string;
  description: string;
  icon: ComponentType<{ className?: string }>;
  status: Status;
  group: "Built in" | "Accounts" | "Work apps";
  href?: string;
  panel?: ReactNode;
  note?: string;
  /** Called when an expanded panel closes, so its row badge catches up. */
  onClose?: () => void;
};

const STATUS_LABEL: Record<Status, string> = {
  on: "On",
  connected: "Connected",
  configured: "Configured",
  setup: "Set up",
};

async function readStatus(path: string) {
  const response = await fetch(path, { cache: "no-store" }).catch(() => null);
  if (!response?.ok) return {};
  return (await response.json().catch(() => ({}))) as { connected?: boolean; available?: boolean };
}

/** Everything Ægentica can use, in the shape of a plugin directory. */
export function IntegrationsSettings() {
  const { setupStatus, viewer } = useChatShell();
  const [query, setQuery] = useState("");
  const [accounts, setAccounts] = useState({ github: false, telegram: false, memory: true });

  const refreshAccounts = useCallback(() => {
    void Promise.all([
      readStatus("/api/settings/github"),
      readStatus("/api/settings/telegram"),
      readStatus("/api/settings/memory"),
    ]).then(([github, telegram, memory]) =>
      setAccounts({
        github: Boolean(github.connected),
        telegram: Boolean(telegram.connected),
        memory: memory.available !== false,
      }),
    );
  }, []);

  useEffect(() => {
    if (viewer) refreshAccounts();
  }, [viewer, refreshAccounts]);

  const configured = new Set<ConfiguredConnection>(setupStatus.configuredConnections ?? []);
  const workApp = (
    id: ConfiguredConnection,
    name: string,
    description: string,
    icon: Integration["icon"],
  ): Integration => ({
    id,
    name,
    description,
    icon,
    group: "Work apps",
    // The server only knows a connector id is set, not that the account answers.
    status: configured.has(id) ? "configured" : "setup",
    note: configured.has(id)
      ? "Turn it on for a chat from the connections menu in the message box."
      : `Needs a Vercel Connect connector: set ${id.toUpperCase()}_CONNECTOR on the server.`,
  });

  const integrations: Integration[] = [
    {
      id: "web",
      name: "Web search",
      description: "Search the web and read pages, with sources",
      icon: GlobeIcon,
      status: "on",
      group: "Built in",
    },
    {
      id: "images",
      name: "Image creation",
      description: "Create pictures and illustrations from a description",
      icon: ImageIcon,
      status: "on",
      group: "Built in",
    },
    {
      id: "sandbox",
      name: "Files and code",
      description: "A private workspace to run code and work with files",
      icon: TerminalIcon,
      status: "on",
      group: "Built in",
    },
    {
      id: "voice",
      name: "Voice",
      description: "Dictate messages and hear replies",
      icon: MicIcon,
      status: "on",
      group: "Built in",
      href: "/settings/voice",
    },
    {
      id: "memory",
      name: "Memory",
      description: "Remembers your preferences across chats",
      icon: BrainIcon,
      status: accounts.memory ? "on" : "setup",
      group: "Built in",
      href: "/memory",
    },
    {
      id: "tasks",
      name: "Tasks",
      description: "Reminders and recurring jobs with notifications",
      icon: CalendarClockIcon,
      status: "on",
      group: "Built in",
      href: "/tasks",
    },
    {
      id: "github",
      name: "GitHub",
      description: "Pull requests, issues, code and CI",
      icon: GitHubIcon,
      status: accounts.github ? "connected" : "setup",
      group: "Accounts",
      panel: <GithubSettings />,
      onClose: refreshAccounts,
    },
    {
      id: "telegram",
      name: "Telegram",
      description: "Chat with Ægentica from Telegram",
      icon: TelegramIcon,
      status: accounts.telegram ? "connected" : "setup",
      group: "Accounts",
      panel: <TelegramSettings />,
      onClose: refreshAccounts,
    },
    workApp("linear", "Linear", "Issues, projects and cycles", LinearIcon),
    workApp("notion", "Notion", "Pages and databases", NotionIcon),
    workApp("sentry", "Sentry", "Errors and performance issues", SentryIcon),
  ];

  const needle = query.trim().toLowerCase();
  const visible = integrations.filter(
    (item) => !needle || `${item.name} ${item.description}`.toLowerCase().includes(needle),
  );

  return (
    <SettingsShell
      section="integrations"
      title="Connections"
      description="The tools and accounts Ægentica can use. Anything that changes an account asks you first."
      actions={
        <Button asChild className="h-11 pointer-fine:md:h-9" variant="outline">
          <Link href="/capabilities?scope=directory">Browse directory</Link>
        </Button>
      }
    >
      <div className="relative">
        <SearchIcon className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          aria-label="Search integrations"
          className="h-11 pl-9"
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search integrations"
          value={query}
        />
      </div>

      {(["Built in", "Accounts", "Work apps"] as const).map((group) => {
        const items = visible.filter((item) => item.group === group);
        if (items.length === 0) return null;
        return (
          <section key={group} aria-label={group}>
            <h2 className="mb-2 mt-4 text-sm font-medium">{group}</h2>
            <ul className="divide-y rounded-lg border bg-card">
              {items.map((item) => (
                <IntegrationRow item={item} key={item.id} />
              ))}
            </ul>
          </section>
        );
      })}
      {visible.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Nothing matches. Browse the directory for more.
        </p>
      ) : null}
    </SettingsShell>
  );
}

function IntegrationRow({ item }: { readonly item: Integration }) {
  const [open, setOpen] = useState(false);
  const summary = (
    <>
      <span className="flex size-10 shrink-0 items-center justify-center rounded-xl border bg-background">
        <item.icon className="size-5" />
      </span>
      <span className="min-w-0 flex-1 text-left">
        <span className="block text-sm font-medium">{item.name}</span>
        <span className="block truncate text-xs text-muted-foreground">{item.description}</span>
      </span>
      <Badge variant={item.status === "setup" ? "outline" : "secondary"}>
        {STATUS_LABEL[item.status]}
      </Badge>
    </>
  );
  const rowClass = "flex min-h-16 w-full items-center gap-3 p-3 sm:px-4";

  if (item.panel || item.note) {
    return (
      <li>
        <Collapsible
          open={open}
          onOpenChange={(next) => {
            setOpen(next);
            if (!next) item.onClose?.();
          }}
        >
          <CollapsibleTrigger className={cn(rowClass, "hover:bg-muted/40")}>
            {summary}
            <ChevronDownIcon
              className={cn(
                "size-4 shrink-0 text-muted-foreground transition-transform",
                open && "rotate-180",
              )}
            />
          </CollapsibleTrigger>
          <CollapsibleContent className="px-3 pb-3 sm:px-4">
            {item.panel ?? <p className="text-sm text-muted-foreground">{item.note}</p>}
          </CollapsibleContent>
        </Collapsible>
      </li>
    );
  }
  return (
    <li>
      {item.href ? (
        <Link className={cn(rowClass, "hover:bg-muted/40")} href={item.href}>
          {summary}
        </Link>
      ) : (
        <div className={rowClass}>{summary}</div>
      )}
    </li>
  );
}
