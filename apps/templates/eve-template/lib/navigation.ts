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
export const workspacePages = [
  {
    href: "/agents",
    label: "Agents",
    icon: BotIcon,
    keywords: "create delegate profiles instructions knowledge",
  },
  {
    href: "/capabilities",
    label: "Capabilities",
    icon: BlocksIcon,
    keywords: "tools skills apps directory sandbox workflows channels",
  },
  {
    href: "/tasks",
    label: "Tasks",
    icon: CalendarClockIcon,
    keywords: "schedule automation reminders cron",
  },
  { href: "/images", label: "Images", icon: ImageIcon, keywords: "gallery generate pictures" },
  { href: "/memory", label: "Memory", icon: BrainIcon, keywords: "remember facts preferences" },
  {
    href: "/settings/integrations",
    label: "Connections",
    icon: PlugIcon,
    keywords: "GitHub Telegram MCP integrations channels",
  },
  {
    href: "/native",
    label: "Channels",
    icon: RadioTowerIcon,
    keywords: "web chat steering attachment communication",
  },
  {
    href: "/session",
    label: "Sessions",
    icon: ListRestartIcon,
    keywords: "runs logs inspect events",
  },
  {
    href: "/library",
    label: "Guide",
    icon: BookOpenIcon,
    keywords: "documentation help capabilities",
  },
  {
    href: "/settings",
    label: "Settings",
    icon: SettingsIcon,
    keywords: "models provider API key voice notifications PWA",
  },
] as const;
export const COMMAND_EVENT = "aegentica:command-menu";
