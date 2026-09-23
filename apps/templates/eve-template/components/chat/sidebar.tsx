"use client";

import { Suspense, type ComponentProps } from "react";
import Link from "next/link";
import { ChatSidebar as SidebarContent } from "./sidebar-content";
import { workspacePages } from "@/lib/navigation";
import { cn } from "@/lib/utils";

export function ChatSidebar(props: ComponentProps<typeof SidebarContent>) {
  return (
    <Suspense fallback={<SidebarFallback className={props.className} />}>
      <SidebarContent {...props} />
    </Suspense>
  );
}

// URL-dependent active states stream in without blocking the cached chat shell.
function SidebarFallback({ className }: { readonly className?: string }) {
  return (
    <aside aria-busy="true" aria-label="Loading workspace navigation" className={cn("flex h-full w-64 shrink-0 flex-col border-r border-border bg-background px-2 pt-2", className)}>
      <div className="mb-2 flex h-10 items-center gap-2 px-2 text-sm font-medium">
        <img alt="" aria-hidden className="size-5 invert dark:invert-0" src="/aegentica.svg" />
        Ægentica
      </div>
      <div className="h-9 rounded-lg bg-muted/30" />
      <div className="mt-1 h-9 rounded-lg bg-muted/30" />
      <nav aria-label="Workspace" className="mt-2 grid gap-0.5">
        {workspacePages.map(({ href, label, icon: Icon }) => (
          <Link key={href} href={href} className="flex min-h-11 items-center gap-2 rounded-lg px-2 text-sm text-muted-foreground md:min-h-9">
            <Icon className="size-4" />{label}
          </Link>
        ))}
      </nav>
      <div className="mt-auto border-t border-border py-3"><div className="h-8 rounded-md bg-muted/25" /></div>
    </aside>
  );
}
