import {
  BotIcon,
  BlocksIcon,
  CalendarClockIcon,
  ImageIcon,
  BrainIcon,
  PlugIcon,
  ListRestartIcon,
  BookOpenIcon,
  SettingsIcon,
  RadioTowerIcon,
} from "lucide-react";
export const primaryWorkspacePages = [
  {
    href: "/agents",
    label: "Agents",
    icon: BotIcon,
    keywords: "create delegate profiles instructions knowledge",
  },
  {
    href: "/tasks",
    label: "Tasks",
    icon: CalendarClockIcon,
    keywords: "schedule automation reminders cron",
  },
  { href: "/images", label: "Images", icon: ImageIcon, keywords: "gallery generate pictures" },
  { href: "/memory", label: "Memory", icon: BrainIcon, keywords: "remember facts preferences" },
] as const;

export const systemWorkspacePages = [
  {
    href: "/capabilities",
    label: "Capabilities",
    icon: BlocksIcon,
    keywords: "tools skills apps directory sandbox workflows channels",
  },
  {
    href: "/settings/integrations",
    label: "Connections",
    icon: PlugIcon,
    keywords: "GitHub Telegram MCP integrations channels",
  },
  {
    href: "/session",
    label: "Activity",
    icon: ListRestartIcon,
    keywords: "sessions runs logs inspect events activity",
  },
  {
    href: "/library",
    label: "Explore",
    icon: BookOpenIcon,
    keywords: "guide documentation help capabilities explore",
  },
  {
    href: "/settings",
    label: "Settings",
    icon: SettingsIcon,
    keywords: "models provider API key voice notifications PWA",
  },
] as const;

export const advancedWorkspacePages = [
  {
    href: "/native",
    label: "Live session",
    icon: RadioTowerIcon,
    keywords: "advanced web channel steering attachment communication durable session",
  },
] as const;

export const workspacePages = [
  ...primaryWorkspacePages,
  ...systemWorkspacePages,
  ...advancedWorkspacePages,
] as const;
export const COMMAND_EVENT = "aegentica:command-menu";
