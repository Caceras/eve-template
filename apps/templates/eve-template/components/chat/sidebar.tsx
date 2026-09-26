"use client";

import { Suspense, type ComponentProps } from "react";
import Link from "next/link";
import { PanelLeftIcon, PlusIcon, SearchIcon } from "lucide-react";
import { ChatSidebar as SidebarContent } from "./sidebar-content";
import { primaryWorkspacePages, systemWorkspacePages } from "@/lib/navigation";
import { cn } from "@/lib/utils";

export function ChatSidebar(props: ComponentProps<typeof SidebarContent>) {
  return (
    <Suspense fallback={<SidebarFallback className={props.className} />}>
      <SidebarContent {...props} />
    </Suspense>
  );
}

// URL-dependent active states stream in without blocking the cached chat
// shell; this mirrors the loaded sidebar row for row.
export function SidebarFallback({ className }: { readonly className?: string }) {
  const rows = (pages: typeof primaryWorkspacePages | typeof systemWorkspacePages) =>
    pages.map(({ href, label, icon: Icon }) => (
      <Link
        key={href}
        href={href}
        className="flex min-h-11 items-center gap-2.5 rounded-lg px-2 text-sm text-muted-foreground pointer-fine:md:min-h-9"
      >
        <Icon className="size-4 shrink-0" />
        {label}
      </Link>
    ));
  return (
    <aside
      aria-busy="true"
      aria-label="Loading workspace navigation"
      className={cn(
        "flex h-full w-64 shrink-0 flex-col border-r border-border/70 bg-background select-none",
        className,
      )}
    >
      <div className="flex flex-col gap-1 px-2 pb-2 pt-[max(0.5rem,env(safe-area-inset-top))]">
        <div className="mb-2 flex h-10 items-center justify-between px-2 text-sm font-medium">
          <span className="flex items-center gap-2">
            <img alt="" aria-hidden className="size-5 invert dark:invert-0" src="/aegentica.svg" />
            Ægentica
          </span>
          <PanelLeftIcon className="mr-3 size-4 text-muted-foreground" />
        </div>
        <div className="flex min-h-11 items-center gap-2 rounded-lg px-3 text-sm text-muted-foreground in-data-[boot-route=home]:bg-foreground/[0.055] in-data-[boot-route=home]:text-foreground pointer-fine:md:min-h-9">
          <PlusIcon className="size-4" />
          New chat
          <span className="ml-auto hidden rounded border border-border/70 px-1.5 py-0.5 text-[10px] leading-none text-muted-foreground pointer-fine:md:inline-flex">
            Ctrl/⌘ ⇧ O
          </span>
        </div>
        <div className="flex min-h-11 items-center gap-2 px-3 text-sm text-muted-foreground pointer-fine:md:min-h-9">
          <SearchIcon className="size-4" />
          Search
          <span className="ml-auto hidden rounded border border-border/70 px-1.5 py-0.5 text-[10px] leading-none text-muted-foreground pointer-fine:md:inline-flex">
            Ctrl/⌘ K
          </span>
        </div>
        <nav aria-label="Workspace" className="mt-3 grid gap-0.5">
          <p className="px-2 pb-1 pt-1 text-[11px] font-medium text-muted-foreground">Workspace</p>
          {rows(primaryWorkspacePages)}
          <p className="px-2 pb-1 pt-3 text-[11px] font-medium text-muted-foreground">More</p>
          {rows(systemWorkspacePages)}
        </nav>
      </div>
      <div className="mt-auto border-t border-border/70 px-2 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3">
        <div className="h-8 rounded-md bg-muted/25" />
      </div>
    </aside>
  );
}
