"use client";
import {
  BellIcon, BrainIcon, CalendarClockIcon, CpuIcon, MicIcon, PlugIcon, ShieldCheckIcon,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { SecurityNotice } from "./security-notice";
import { useChatShell } from "./chat-shell-context";

export type SettingsSection = "general" | "voice" | "notifications" | "integrations" | "security";
const SECTIONS: { id: SettingsSection; href: string; label: string; icon: LucideIcon }[] = [
  { id: "general", href: "/settings", label: "AI & models", icon: CpuIcon },
  { id: "voice", href: "/settings/voice", label: "Voice", icon: MicIcon },
  { id: "notifications", href: "/settings/notifications", label: "Notifications", icon: BellIcon },
  { id: "integrations", href: "/settings/integrations", label: "Connections", icon: PlugIcon },
  { id: "security", href: "/settings/security", label: "Security", icon: ShieldCheckIcon },
];
const RELATED = [
  { href: "/memory", label: "Memory", icon: BrainIcon },
  { href: "/tasks", label: "Tasks", icon: CalendarClockIcon },
];
const rowClass = "flex h-11 shrink-0 items-center gap-2 rounded-lg px-2.5 text-sm transition-colors md:h-9";

export function SettingsShell({ section, title, description, actions, children }: {
  readonly section: SettingsSection;
  readonly title: string;
  readonly description: string;
  readonly actions?: ReactNode;
  readonly children: ReactNode;
}) {
  const { viewer, requestSignIn } = useChatShell();
  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto flex max-w-5xl flex-col gap-6 px-4 pb-16 pt-16 sm:px-6 md:flex-row md:gap-12">
        <nav aria-label="Settings" className="-mx-4 flex gap-1 overflow-x-auto px-4 md:sticky md:top-20 md:mx-0 md:w-48 md:shrink-0 md:flex-col md:self-start md:overflow-visible md:px-0">
          <p className="hidden px-2.5 pb-1 text-[11px] font-medium text-muted-foreground/70 md:block">Settings</p>
          {SECTIONS.map((item) => (
            <Link aria-current={item.id === section ? "page" : undefined} className={cn(rowClass, item.id === section ? "bg-foreground/[0.055] text-foreground" : "text-muted-foreground hover:bg-foreground/[0.04] hover:text-foreground")} href={item.href} key={item.id}>
              <item.icon className="size-4" /><span className="whitespace-nowrap">{item.label}</span>
            </Link>
          ))}
          <p className="hidden px-2.5 pb-1 pt-4 text-[11px] font-medium text-muted-foreground/70 md:block">Also</p>
          {RELATED.map((item) => (
            <Link className={cn(rowClass, "text-muted-foreground hover:bg-muted/50 hover:text-foreground")} href={item.href} key={item.href}>
              <item.icon className="size-4" /><span className="whitespace-nowrap">{item.label}</span>
            </Link>
          ))}
        </nav>
        <div className="min-w-0 flex-1 md:max-w-2xl">
          <div className="flex items-start justify-between gap-4"><h1 className="text-2xl font-semibold tracking-tight">{title}</h1>{viewer ? actions : null}</div>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">{description}</p>
          {viewer ? (
            <div className="mt-7 space-y-4">{section !== "security" ? <SecurityNotice /> : null}{children}</div>
          ) : (
            <div className="mt-8 rounded-lg border p-5"><p className="mb-4 text-sm">Sign in to manage Ægentica.</p><Button onClick={() => requestSignIn()}>Sign in</Button></div>
          )}
        </div>
      </div>
    </div>
  );
}
