"use client";
import { BotIcon, MessageSquareIcon, SparklesIcon } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
  type RefObject,
} from "react";
import { useChatShell } from "@/app/_components/chat-shell-context";
import type { AgentProfile } from "@/lib/agent-profiles";
import { chooseProfile, composerKey, updateComposerDraft } from "@/lib/chat/composer-draft";
import { loadRuntimeSkills, skillLabel, skillSummary, type RuntimeSkill } from "@/lib/skills";
import { cn } from "@/lib/utils";

/**
 * Typing `/` in the message box lists the skills and `@` the saved agents,
 * filtered by what follows; Enter, Tab or a tap picks one for the next
 * message and removes the typed trigger. The chosen skill or agent then shows
 * as a chip above the box (composer-workspace.tsx).
 */
type Kind = "skill" | "agent";
type Item = { id: string; label: string; description: string; profile?: AgentProfile };
type Trigger = { kind: Kind; query: string; start: number; end: number };

const TRIGGER = /(?:^|\s)([/@])([^\s/@]*)$/;
const MAX_ITEMS = 12;
const DEFAULTS: Record<Kind, Item> = {
  skill: { id: "", label: "Chat", description: "Ægentica picks skills itself" },
  agent: { id: "", label: "Ægentica", description: "The main agent" },
};

/** The trigger under the caret, if the text before it ends with `/word` or `@word`. */
export function findMentionTrigger(text: string, caret: number): Trigger | null {
  const before = text.slice(0, caret);
  const match = TRIGGER.exec(before);
  if (!match) return null;
  return {
    kind: match[1] === "/" ? "skill" : "agent",
    query: match[2] ?? "",
    start: before.length - match[1]!.length - (match[2]?.length ?? 0),
    end: caret,
  };
}

export function filterMentionItems(items: Item[], query: string) {
  const needle = query.trim().toLowerCase();
  const matches = needle
    ? items.filter(
        (item) =>
          item.label.toLowerCase().includes(needle) ||
          item.id.toLowerCase().includes(needle) ||
          item.description.toLowerCase().includes(needle),
      )
    : items;
  return matches.slice(0, MAX_ITEMS);
}

let skillsCache: RuntimeSkill[] | undefined;
let profilesCache: AgentProfile[] | undefined;

async function loadItems(kind: Kind): Promise<Item[]> {
  if (kind === "skill") {
    skillsCache = await loadRuntimeSkills();
    return skillsCache.map(({ name, description }) => ({
      id: name,
      label: skillLabel(name),
      description: description ? skillSummary(description) : "",
    }));
  }
  const response = await fetch("/api/agents", { cache: "no-store" });
  if (!response.ok) throw new Error("Could not load agents. Open Agents and retry.");
  profilesCache = (await response.json()).profiles as AgentProfile[];
  return profilesCache.map((profile) => ({
    id: profile.id,
    label: profile.name,
    description: profile.description ?? "",
    profile,
  }));
}

export function useComposerMentions({
  disabled,
  onChange,
  textareaRef,
  value,
}: {
  readonly disabled: boolean;
  readonly onChange: (value: string) => void;
  readonly textareaRef: RefObject<HTMLTextAreaElement | null>;
  readonly value: string;
}) {
  const pathname = usePathname();
  const key = composerKey(pathname);
  const { viewer, requestSignIn } = useChatShell();
  const listId = useId();
  const [trigger, setTrigger] = useState<Trigger | null>(null);
  const [items, setItems] = useState<Record<Kind, Item[] | null>>({ skill: null, agent: null });
  const [error, setError] = useState("");
  const [active, setActive] = useState(0);
  const dismissedRef = useRef<Trigger | null>(null);

  // Follow the caret: opening, filtering and closing all come from the text.
  useEffect(() => {
    const textarea = textareaRef.current;
    if (disabled || !textarea || document.activeElement !== textarea) {
      setTrigger(null);
      return;
    }
    const next = findMentionTrigger(value, textarea.selectionStart ?? value.length);
    const dismissed = dismissedRef.current;
    if (next && dismissed && dismissed.kind === next.kind && dismissed.start === next.start) {
      setTrigger(null);
      return;
    }
    dismissedRef.current = null;
    setTrigger(next);
  }, [disabled, textareaRef, value]);

  const kind = trigger?.kind;
  const query = trigger?.query;
  useEffect(() => {
    if (!kind || !viewer) return;
    let cancelled = false;
    setError("");
    loadItems(kind)
      .then((loaded) => !cancelled && setItems((current) => ({ ...current, [kind]: loaded })))
      .catch((failure: Error) => !cancelled && setError(failure.message));
    return () => {
      cancelled = true;
    };
  }, [kind, viewer]);

  const loaded = kind ? items[kind] : null;
  const visible = kind ? filterMentionItems([DEFAULTS[kind], ...(loaded ?? [])], query ?? "") : [];
  useEffect(() => setActive(0), [kind, query]);

  const close = useCallback(() => {
    dismissedRef.current = trigger;
    setTrigger(null);
  }, [trigger]);

  const select = useCallback(
    async (item: Item) => {
      if (!trigger) return;
      const textarea = textareaRef.current;
      const before = value.slice(0, trigger.start);
      const after = value.slice(trigger.end).replace(/^ /, "");
      const next = before + after;
      onChange(next);
      setTrigger(null);
      dismissedRef.current = null;
      requestAnimationFrame(() => {
        textarea?.focus();
        textarea?.setSelectionRange(trigger.start, trigger.start);
      });
      if (!viewer) {
        requestSignIn();
        return;
      }
      try {
        if (trigger.kind === "skill") await updateComposerDraft(key, { skill: item.id });
        else await chooseProfile(key, item.profile ?? null);
      } catch (failure) {
        setError(failure instanceof Error ? failure.message : "Could not save the choice.");
      }
    },
    [key, onChange, requestSignIn, textareaRef, trigger, value, viewer],
  );

  /** Keys the open list takes; the box keeps the rest. Returns whether it was used. */
  const onKeyDown = useCallback(
    (event: KeyboardEvent<HTMLTextAreaElement>) => {
      if (!trigger) return false;
      switch (event.key) {
        case "ArrowDown":
          event.preventDefault();
          setActive((index) => (visible.length ? (index + 1) % visible.length : 0));
          return true;
        case "ArrowUp":
          event.preventDefault();
          setActive((index) =>
            visible.length ? (index - 1 + visible.length) % visible.length : 0,
          );
          return true;
        case "Enter":
        case "Tab": {
          const item = visible[active];
          if (!item) return false;
          event.preventDefault();
          void select(item);
          return true;
        }
        case "Escape":
          event.preventDefault();
          close();
          return true;
        default:
          return false;
      }
    },
    [active, close, select, trigger, visible],
  );

  const activeId = trigger && visible[active] ? `${listId}-${active}` : undefined;
  const menu: ReactNode = trigger ? (
    <MentionMenu
      active={active}
      error={error}
      items={visible}
      kind={trigger.kind}
      listId={listId}
      loading={loaded === null && Boolean(viewer)}
      onHover={setActive}
      onSelect={(item) => void select(item)}
    />
  ) : null;

  return {
    menu,
    onKeyDown,
    // A tap on an option keeps focus in the box (its pointerdown is prevented);
    // focus leaving for good closes the list a moment later.
    onBlur: () =>
      window.setTimeout(() => {
        if (document.activeElement !== textareaRef.current) setTrigger(null);
      }, 150),
    inputProps: {
      "aria-autocomplete": "list" as const,
      "aria-haspopup": "listbox" as const,
      "aria-controls": trigger ? listId : undefined,
      "aria-activedescendant": activeId,
    },
  };
}

function MentionMenu({
  active,
  error,
  items,
  kind,
  listId,
  loading,
  onHover,
  onSelect,
}: {
  readonly active: number;
  readonly error: string;
  readonly items: Item[];
  readonly kind: Kind;
  readonly listId: string;
  readonly loading: boolean;
  readonly onHover: (index: number) => void;
  readonly onSelect: (item: Item) => void;
}) {
  const listRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    listRef.current
      ?.querySelector<HTMLElement>(`[data-index="${active}"]`)
      ?.scrollIntoView({ block: "nearest" });
  }, [active]);
  const Icon = kind === "skill" ? SparklesIcon : BotIcon;
  return (
    <div
      className="absolute inset-x-2 bottom-full z-30 mb-2 overflow-hidden rounded-xl border border-border/75 bg-popover text-popover-foreground shadow-lg animate-in fade-in-0 slide-in-from-bottom-1 duration-150 sm:inset-x-3"
      data-chat-mentions
    >
      <div className="flex items-center justify-between px-3 pt-2 pb-1 text-[11px] font-medium text-muted-foreground">
        <span>{kind === "skill" ? "Skills for this message" : "Agent for this message"}</span>
        <span className="hidden pointer-fine:md:inline">↑↓ then Enter</span>
      </div>
      <div
        aria-label={kind === "skill" ? "Skills" : "Agents"}
        className="max-h-[40vh] overflow-y-auto p-1"
        id={listId}
        ref={listRef}
        role="listbox"
      >
        {items.map((item, index) => (
          <div
            aria-selected={index === active}
            className={cn(
              "flex min-h-11 cursor-pointer items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-sm pointer-fine:md:min-h-9",
              index === active && "bg-accent text-accent-foreground",
            )}
            data-index={index}
            id={`${listId}-${index}`}
            key={`${kind}:${item.id}`}
            onClick={() => onSelect(item)}
            onPointerDown={(event) => event.preventDefault()}
            onPointerMove={() => onHover(index)}
            role="option"
          >
            {item.id ? (
              <Icon className="size-4 shrink-0 text-muted-foreground" />
            ) : (
              <MessageSquareIcon className="size-4 shrink-0 text-muted-foreground" />
            )}
            <span className="flex min-w-0 flex-col">
              <span className="truncate font-medium">{item.label}</span>
              {item.description ? (
                <span className="line-clamp-1 text-xs text-muted-foreground">
                  {item.description}
                </span>
              ) : null}
            </span>
          </div>
        ))}
        {loading && items.length <= 1 ? (
          <p className="px-2.5 py-1.5 text-xs text-muted-foreground">Loading…</p>
        ) : null}
        {!loading && !error && items.every((item) => !item.id) ? (
          <p className="px-2.5 py-1.5 text-xs text-muted-foreground">
            {kind === "skill" ? "No skill matches." : "No agent matches."}
          </p>
        ) : null}
        {error ? (
          <p className="px-2.5 py-1.5 text-xs text-destructive" role="alert">
            {error}
          </p>
        ) : null}
      </div>
      <div className="border-t border-border/60 px-3 py-1.5 text-xs text-muted-foreground">
        {kind === "skill" ? (
          <Link
            className="hover:text-foreground"
            href="/capabilities"
            onPointerDown={(event) => event.preventDefault()}
          >
            All capabilities
          </Link>
        ) : (
          <Link
            className="hover:text-foreground"
            href="/agents"
            onPointerDown={(event) => event.preventDefault()}
          >
            Create or manage agents
          </Link>
        )}
      </div>
    </div>
  );
}
