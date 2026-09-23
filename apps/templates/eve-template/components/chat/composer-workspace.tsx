"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import Link from "next/link";
import {
  BotIcon,
  PaperclipIcon,
  XIcon,
  ChevronDownIcon,
  ImageIcon,
  SearchIcon,
  MessageSquareIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { useChatShell } from "@/app/_components/chat-shell-context";
import {
  composerKey,
  DRAFT_EVENT,
  readComposerDraft,
  updateComposerDraft,
  chooseProfile,
  validateFiles,
  type ComposerDraft,
} from "@/lib/chat/composer-draft";
import type { AgentProfile } from "@/lib/agent-profiles";

export function ComposerWorkspace({
  disabled,
  onState,
}: {
  disabled: boolean;
  onState: (state: { hasFiles: boolean; busy: boolean }) => void;
}) {
  const pathname = usePathname();
  const key = composerKey(pathname);
  const { viewer, requestSignIn } = useChatShell();
  const [draft, setDraft] = useState<ComposerDraft | null>(null);
  const [profiles, setProfiles] = useState<AgentProfile[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const fileInput = useRef<HTMLInputElement>(null);
  const busyRef = useRef(false);
  const activeKey = useRef(key);
  activeKey.current = key;
  const refresh = useCallback(async () => {
    if (!viewer) {
      setDraft(null);
      return;
    }
    try {
      const value = await readComposerDraft(key);
      if (activeKey.current === key) setDraft(value);
    } catch (error) {
      setError(error instanceof Error ? error.message : "Could not read draft.");
    }
  }, [key, viewer]);
  useEffect(() => {
    void refresh();
    const changed = () => void refresh();
    window.addEventListener(DRAFT_EVENT, changed);
    return () => window.removeEventListener(DRAFT_EVENT, changed);
  }, [refresh]);
  useEffect(() => {
    onState({ hasFiles: Boolean(draft?.files.length), busy });
  }, [draft, busy, onState]);
  async function change(work: () => Promise<unknown>) {
    if (busyRef.current || disabled) return;
    busyRef.current = true;
    setBusy(true);
    setError("");
    try {
      await work();
      await refresh();
    } catch (error) {
      setError(error instanceof Error ? error.message : "Could not save draft.");
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }
  async function filesAdded(files: File[]) {
    await change(async () => {
      const existing = await readComposerDraft(key);
      const all = [...existing.files, ...files];
      validateFiles(all);
      await updateComposerDraft(key, { files: all });
    });
  }
  useEffect(() => {
    if (!viewer || disabled) return;
    const paste = (event: ClipboardEvent) => {
      const files = Array.from(event.clipboardData?.files ?? []);
      if (
        !files.length ||
        !(event.target instanceof Element) ||
        !event.target.closest("[data-chat-composer]")
      )
        return;
      event.preventDefault();
      void filesAdded(files);
    };
    document.addEventListener("paste", paste);
    return () => document.removeEventListener("paste", paste);
  }, [viewer, disabled, key]);
  const mode = draft?.mode ?? "chat";
  const modes = [
    ["chat", "Chat", MessageSquareIcon],
    ["research", "Research", SearchIcon],
    ["image", "Image", ImageIcon],
  ] as const;
  const ModeIcon = modes.find(([id]) => id === mode)![2];
  return (
    <div className="px-3 pt-2 sm:px-4">
      <div className="flex min-h-8 items-center gap-1">
        <DropdownMenu
          onOpenChange={async (open) => {
            if (!open || !viewer) return;
            try {
              const response = await fetch("/api/agents", { cache: "no-store" });
              if (!response.ok) throw new Error("Could not load agents. Open Agents and retry.");
              setProfiles((await response.json()).profiles);
            } catch (error) {
              setError(error instanceof Error ? error.message : "Could not load agents.");
            }
          }}
        >
          <DropdownMenuTrigger asChild>
            <Button
              disabled={disabled || busy}
              type="button"
              size="sm"
              variant="ghost"
              className="h-8 max-w-[45%] gap-1.5 rounded-full bg-muted/55 px-2.5 text-xs font-medium text-foreground/80 hover:bg-muted"
              aria-label="Choose agent"
            >
              <BotIcon className="size-3.5 shrink-0" />
              <span className="truncate">{draft?.profileName || "\u00c6gentica"}</span>
              <ChevronDownIcon className="size-3 shrink-0" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="max-h-[50dvh] w-64 overflow-y-auto">
            <DropdownMenuItem
              onSelect={() =>
                viewer ? void change(() => chooseProfile(key, null)) : requestSignIn()
              }
            >
              Ægentica
            </DropdownMenuItem>
            {profiles.map((profile) => (
              <DropdownMenuItem
                key={profile.id}
                onSelect={() => void change(() => chooseProfile(key, profile))}
              >
                {profile.name}
              </DropdownMenuItem>
            ))}
            <DropdownMenuSeparator />
            <DropdownMenuItem asChild>
              <Link href="/agents">Create or manage agents</Link>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              type="button"
              disabled={disabled || busy}
              variant="ghost"
              size="sm"
              className="h-8 gap-1.5 rounded-full bg-muted/55 px-2.5 text-xs font-medium text-foreground/80 hover:bg-muted"
              aria-label="Choose input mode"
            >
              <ModeIcon className="size-3.5" />
              {modes.find(([id]) => id === mode)![1]}
              <ChevronDownIcon className="size-3" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            {modes.map(([id, label, Icon]) => (
              <DropdownMenuItem
                key={id}
                onSelect={() =>
                  viewer
                    ? void change(() => updateComposerDraft(key, { mode: id }))
                    : requestSignIn()
                }
              >
                <Icon className="size-4" />
                {label}
              </DropdownMenuItem>
            ))}
            <DropdownMenuSeparator />
            <DropdownMenuItem asChild>
              <Link href="/settings/voice">Voice settings</Link>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="ml-auto size-9 shrink-0 rounded-full text-muted-foreground hover:bg-muted"
          disabled={disabled || busy}
          aria-label="Attach files"
          title="Images, PDF and text. Up to 4 files, 6 MB total."
          onClick={() => (viewer ? fileInput.current?.click() : requestSignIn())}
        >
          <PaperclipIcon className="size-4" />
        </Button>
        <input
          ref={fileInput}
          className="sr-only"
          tabIndex={-1}
          aria-label="Upload attachments"
          type="file"
          multiple
          accept="image/png,image/jpeg,image/webp,image/gif,application/pdf,text/*"
          onChange={(e) => {
            const files = Array.from(e.currentTarget.files ?? []);
            e.currentTarget.value = "";
            void filesAdded(files);
          }}
        />
      </div>
      {Boolean(draft?.files.length) && (
        <div className="flex flex-wrap gap-1.5 pb-1.5 pt-1" aria-label="Attachments">
          {draft!.files.map((file, index) => (
            <span
              className="flex max-w-full items-center gap-1 rounded-full bg-muted/60 pl-2.5 text-xs text-foreground/80"
              key={`${file.name}-${index}`}
            >
              <span className="max-w-36 truncate">{file.name}</span>
              <span className="text-muted-foreground">{Math.ceil(file.size / 1024)} KB</span>
              <Button
                aria-label={`Remove ${file.name}`}
                disabled={disabled || busy}
                className="size-8 rounded-full"
                type="button"
                size="icon"
                variant="ghost"
                onClick={() =>
                  void change(async () => {
                    const current = await readComposerDraft(key);
                    await updateComposerDraft(key, {
                      files: current.files.filter((_, i) => i !== index),
                    });
                  })
                }
              >
                <XIcon className="size-3" />
              </Button>
            </span>
          ))}
        </div>
      )}
      {busy && (
        <p role="status" className="px-1 pb-1 text-[11px] text-muted-foreground">
          Saving draft...
        </p>
      )}
      {error && (
        <p role="alert" className="px-1 pb-1 text-[11px] text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}
