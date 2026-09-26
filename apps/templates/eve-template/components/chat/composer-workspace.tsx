"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { usePathname } from "next/navigation";
import { BotIcon, PaperclipIcon, XIcon, SparklesIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useChatShell } from "@/app/_components/chat-shell-context";
import {
  asAttachment,
  composerKey,
  DRAFT_EVENT,
  readComposerDraft,
  updateComposerDraft,
  chooseProfile,
  validateFiles,
  type ComposerDraft,
} from "@/lib/chat/composer-draft";
import { skillLabel } from "@/lib/skills";
import { cn } from "@/lib/utils";

/**
 * What travels with the next message besides its text: the agent and skill
 * picked with @ and / (composer-mentions.tsx), shown as chips that a tap
 * removes, and the attached files. The attach button renders in the
 * composer's footer through `attachSlot`, so the row above the box appears
 * only when there is something to show.
 */
export function ComposerWorkspace({
  attachSlot,
  disabled,
  onState,
}: {
  attachSlot: HTMLElement | null;
  disabled: boolean;
  onState: (state: { hasFiles: boolean; busy: boolean }) => void;
}) {
  const pathname = usePathname();
  const key = composerKey(pathname);
  const { viewer, requestSignIn } = useChatShell();
  const [draft, setDraft] = useState<ComposerDraft | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [dragging, setDragging] = useState(false);
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
  // Desktop: files dragged anywhere onto the window attach to this message.
  useEffect(() => {
    if (!viewer || disabled) return;
    let depth = 0;
    const carriesFiles = (event: DragEvent) => Boolean(event.dataTransfer?.types.includes("Files"));
    const enter = (event: DragEvent) => {
      if (!carriesFiles(event)) return;
      depth += 1;
      setDragging(true);
    };
    const leave = (event: DragEvent) => {
      if (!carriesFiles(event)) return;
      depth = Math.max(0, depth - 1);
      if (!depth) setDragging(false);
    };
    const over = (event: DragEvent) => {
      if (!carriesFiles(event)) return;
      event.preventDefault();
      if (event.dataTransfer) event.dataTransfer.dropEffect = "copy";
    };
    const drop = (event: DragEvent) => {
      if (!carriesFiles(event)) return;
      event.preventDefault();
      depth = 0;
      setDragging(false);
      void filesAdded(Array.from(event.dataTransfer?.files ?? [], asAttachment));
    };
    document.addEventListener("dragenter", enter);
    document.addEventListener("dragleave", leave);
    document.addEventListener("dragover", over);
    document.addEventListener("drop", drop);
    return () => {
      document.removeEventListener("dragenter", enter);
      document.removeEventListener("dragleave", leave);
      document.removeEventListener("dragover", over);
      document.removeEventListener("drop", drop);
      setDragging(false);
    };
  }, [viewer, disabled, key]);
  const skill = draft?.skill ?? "";
  const profileName = draft?.profileName ?? "";
  const hasFiles = Boolean(draft?.files.length);
  const chip =
    "flex h-9 max-w-full items-center gap-1 rounded-full bg-muted/60 pl-2.5 text-xs font-medium text-foreground/85 pointer-fine:md:h-7";
  const remove = "size-10 rounded-full pointer-fine:md:size-7";
  const attachButton = (
    <>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="size-11 shrink-0 rounded-full text-muted-foreground hover:bg-muted pointer-fine:md:size-9"
        disabled={disabled || busy}
        aria-label="Attach files"
        title="Images, PDF and text. Up to 4 files, 6 MB total."
        onClick={() => (viewer ? fileInput.current?.click() : requestSignIn())}
      >
        <PaperclipIcon className="size-4" />
      </Button>
      {/* Reached through Attach files; hidden from screen readers so it is not a second button. */}
      <input
        ref={fileInput}
        aria-hidden
        className="sr-only"
        tabIndex={-1}
        aria-label="Upload attachments"
        type="file"
        multiple
        accept="image/png,image/jpeg,image/webp,image/gif,application/pdf,text/*"
        onChange={(e) => {
          const files = Array.from(e.currentTarget.files ?? [], asAttachment);
          e.currentTarget.value = "";
          void filesAdded(files);
        }}
      />
    </>
  );
  return (
    <div className={cn("px-3 sm:px-4", (profileName || skill || hasFiles) && "pt-2.5")}>
      {attachSlot ? createPortal(attachButton, attachSlot) : null}
      {profileName || skill ? (
        <div
          className="flex flex-wrap items-center gap-1.5 pb-1"
          aria-label="Chosen for this message"
        >
          {profileName ? (
            <span className={chip}>
              <BotIcon className="size-3.5 shrink-0" />
              <span className="truncate">{profileName}</span>
              <Button
                aria-label={`Remove agent ${profileName}`}
                className={remove}
                disabled={disabled || busy}
                onClick={() => void change(() => chooseProfile(key, null))}
                size="icon"
                title="Back to Ægentica"
                type="button"
                variant="ghost"
              >
                <XIcon className="size-3" />
              </Button>
            </span>
          ) : null}
          {skill ? (
            <span className={chip}>
              <SparklesIcon className="size-3.5 shrink-0" />
              <span className="truncate">{skillLabel(skill)}</span>
              <Button
                aria-label={`Remove skill ${skillLabel(skill)}`}
                className={remove}
                disabled={disabled || busy}
                onClick={() => void change(() => updateComposerDraft(key, { skill: "" }))}
                size="icon"
                title="Let Ægentica pick skills itself"
                type="button"
                variant="ghost"
              >
                <XIcon className="size-3" />
              </Button>
            </span>
          ) : null}
        </div>
      ) : null}
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
                className="size-10 rounded-full pointer-fine:md:size-8"
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
      {dragging &&
        createPortal(
          <div
            className="pointer-events-none fixed inset-0 z-[60] flex items-center justify-center bg-background/70 p-6 backdrop-blur-sm animate-in fade-in-0"
            data-drop-overlay
          >
            <div className="flex flex-col items-center gap-2 rounded-2xl border border-dashed border-foreground/20 bg-background px-10 py-8 text-center shadow-lg">
              <PaperclipIcon className="size-5 text-muted-foreground" />
              <p className="text-sm font-medium">Drop to attach</p>
              <p className="text-xs text-muted-foreground">
                Images, PDF and text. Up to 4 files, 6 MB total.
              </p>
            </div>
          </div>,
          document.body,
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
