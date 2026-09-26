"use client";
import { useCallback, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  BotIcon,
  PlusIcon,
  SearchIcon,
  ArrowUpRightIcon,
  PencilIcon,
  Loader2Icon,
  CopyIcon,
} from "lucide-react";
import { useChatShell } from "./chat-shell-context";
import { PageSignInButton } from "./page-sign-in";
import { LoadError } from "./load-error";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Select,
  SelectTrigger,
  SelectContent,
  SelectItem,
  SelectValue,
} from "@/components/ui/select";
import { useModelSettings } from "@/lib/chat/provider-client";
import { makerBrand, makerLabel } from "@/lib/brands";
import { BrandIcon } from "@/components/brand-icon";
import { chooseProfile } from "@/lib/chat/composer-draft";
import type { AgentProfile } from "@/lib/agent-profiles";
import { focusOpensKeyboard } from "@/lib/pwa/keyboard";

type Fields = Pick<
  AgentProfile,
  "name" | "description" | "instructions" | "knowledge" | "model" | "reasoning"
>;
const blank: Fields = {
  name: "",
  description: "",
  instructions: "",
  knowledge: "",
  model: "",
  reasoning: "medium",
};
const starters = [
  {
    name: "Research partner",
    description: "Find evidence and test assumptions.",
    instructions:
      "Investigate the question, find primary sources, compare explanations, and clearly separate facts, inferences and unresolved questions. Cite sources and check dates. Delegate focused research when useful.",
  },
  {
    name: "Editor",
    description: "Make ideas clear without losing your voice.",
    instructions:
      "Edit for clarity, structure and accuracy. Preserve my intent and tone. Explain consequential edits, flag unsupported claims, and never invent facts or citations.",
  },
  {
    name: "Project partner",
    description: "Turn a goal into practical next steps.",
    instructions:
      "Clarify the desired outcome and constraints. Break work into testable milestones, identify the next action and risks, and coordinate specialists. Ask before external changes and report completed work separately from plans.",
  },
];
// Finger-sized on phones. The trigger sets its height under data-size, which a
// plain h-11 cannot outrank, so the size is set under the same selector.
const FIELD_SELECT = "w-full data-[size=default]:h-11 pointer-fine:md:data-[size=default]:h-9";
export function AgentProfilesPage() {
  const { viewer, requestSignIn, setupStatus } = useChatShell();
  const { catalog } = useModelSettings();
  const router = useRouter();
  const params = useSearchParams();
  const [profiles, setProfiles] = useState<AgentProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [error, setError] = useState("");
  const [loadFailed, setLoadFailed] = useState(false);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<AgentProfile | null>(null);
  const [fields, setFields] = useState<Fields>(blank);
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const refresh = useCallback(async () => {
    if (!viewer) {
      setLoading(false);
      setProfiles([]);
      return;
    }
    setLoading(true);
    setError("");
    setLoadFailed(false);
    try {
      const response = await fetch("/api/agents", { cache: "no-store" });
      if (!response.ok) throw new Error("Could not load agents.");
      setProfiles((await response.json()).profiles);
    } catch {
      setLoadFailed(true);
    } finally {
      setLoading(false);
    }
  }, [viewer]);
  useEffect(() => {
    void refresh();
  }, [refresh]);
  useEffect(() => {
    if (viewer && params.get("new") === "1") {
      setEditing(null);
      setFields(blank);
      setConfirmDelete(false);
      setOpen(true);
      router.replace("/agents", { scroll: false });
    }
  }, [viewer, params, router]);
  function create() {
    setEditing(null);
    setFields(blank);
    setError("");
    setConfirmDelete(false);
    setOpen(true);
  }
  async function save(remove = false) {
    if (saving) return;
    setSaving(true);
    setError("");
    try {
      const response = await fetch("/api/agents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: remove ? "delete" : "save",
          id: editing?.id,
          version: editing?.version,
          profile: fields,
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not save the agent.");
      setOpen(false);
      await refresh();
    } catch (error) {
      setError(error instanceof Error ? error.message : "Could not save the agent.");
    } finally {
      setSaving(false);
    }
  }
  async function useAgent(profile: AgentProfile) {
    try {
      await chooseProfile("new", profile);
      router.push("/");
    } catch (error) {
      setError(error instanceof Error ? error.message : "Could not prepare chat.");
    }
  }
  const visible = profiles.filter((p) =>
    `${p.name} ${p.description}`.toLowerCase().includes(query.toLowerCase()),
  );
  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-4xl px-4 pb-16 pt-16 sm:px-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Agents</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              Give each kind of work its own instructions, context and preferred model.
            </p>
          </div>
          <Button
            className="min-h-11 shrink-0"
            onClick={() => (viewer ? create() : requestSignIn())}
          >
            <PlusIcon className="size-4" />
            <span className="hidden sm:inline">Create agent</span>
            <span className="sm:hidden">Create</span>
          </Button>
        </div>
        {error && !open && (
          <p className="mt-4 text-sm text-destructive" role="alert">
            {error}
          </p>
        )}
        {!viewer ? (
          <div className="mt-8 rounded-xl border p-6">
            <h2 className="font-medium">Your agents, on your server</h2>
            <p className="my-3 text-sm text-muted-foreground">
              Sign in to create and manage agents. No model API key is needed to set them up.
            </p>
            <PageSignInButton />
          </div>
        ) : (
          <>
            <div className="relative mt-6">
              <SearchIcon className="pointer-events-none absolute left-3 top-3 size-4 text-muted-foreground" />
              <Input
                aria-label="Search agents"
                className="h-11 pl-9"
                placeholder="Search agents"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            </div>
            {loading ? (
              <p className="py-8 text-sm text-muted-foreground" role="status">
                Loading agents...
              </p>
            ) : loadFailed ? (
              <LoadError
                className="mt-4"
                message="Couldn't load your agents. Check the connection and try again."
                onRetry={() => void refresh()}
              />
            ) : visible.length ? (
              <div className="mt-4 divide-y overflow-hidden rounded-xl border">
                {visible.map((p) => (
                  <div className="flex items-center gap-3 p-4" key={p.id}>
                    <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-muted text-sm font-medium">
                      {p.name.slice(0, 2).toUpperCase()}
                    </span>
                    <div className="min-w-0 flex-1">
                      <h2 className="truncate text-sm font-medium">{p.name}</h2>
                      <p className="mt-1 line-clamp-2 text-xs leading-5 text-muted-foreground">
                        {p.description || "Custom agent"}
                      </p>
                    </div>
                    <Button
                      className="size-11"
                      size="icon"
                      variant="ghost"
                      aria-label={`Edit ${p.name}`}
                      onClick={() => {
                        setEditing(p);
                        setFields({
                          name: p.name,
                          description: p.description,
                          instructions: p.instructions,
                          knowledge: p.knowledge,
                          model: p.model,
                          reasoning: p.reasoning,
                        });
                        setError("");
                        setConfirmDelete(false);
                        setOpen(true);
                      }}
                    >
                      <PencilIcon className="size-4" />
                    </Button>
                    <Button className="min-h-11" variant="outline" onClick={() => void useAgent(p)}>
                      Chat
                      <ArrowUpRightIcon className="size-4" />
                    </Button>
                  </div>
                ))}
              </div>
            ) : (
              <div className="mt-4 rounded-xl border border-dashed p-8 text-center">
                <BotIcon className="mx-auto size-7 text-muted-foreground" />
                <h2 className="mt-3 font-medium">
                  {query ? "No matching agents" : "Create your first agent"}
                </h2>
                <p className="mt-2 text-sm text-muted-foreground">
                  {query
                    ? "Try a different name or description."
                    : "Start with a role and refine it as you work."}
                </p>
                {!query && (
                  <Button className="mt-4 min-h-11" variant="outline" onClick={create}>
                    Create agent
                  </Button>
                )}
              </div>
            )}
            <p className="mt-5 text-xs leading-5 text-muted-foreground">
              Saved agents are profiles of this private workspace, not separate deployments. They
              inherit existing tools and approvals. Ask in chat to list saved agents or delegate
              work; delegated runs use the current conversation model.
            </p>
            {setupStatus.authMode !== "password" && (
              <p className="mt-3 text-sm text-muted-foreground">
                Profile management requires the self-hosted operator sign-in.
              </p>
            )}
          </>
        )}
        <Dialog
          open={open}
          onOpenChange={(value) => {
            if (!saving) setOpen(value);
          }}
        >
          <DialogContent className="flex max-h-[90%] max-w-2xl flex-col overflow-hidden p-0">
            <DialogHeader className="border-b px-5 py-4 text-left">
              <DialogTitle>{editing ? `Edit ${editing.name}` : "Create an agent"}</DialogTitle>
              <DialogDescription>
                Instructions shape the work. Permissions remain governed by the runtime.
              </DialogDescription>
            </DialogHeader>
            <form
              className="flex min-h-0 flex-1 flex-col"
              onSubmit={(e) => {
                e.preventDefault();
                void save();
              }}
            >
              <div className="space-y-4 overflow-y-auto px-5 py-4">
                {!editing && (
                  <div className="flex flex-wrap gap-2">
                    {starters.map((s) => (
                      <Button
                        key={s.name}
                        className="h-11 pointer-fine:md:h-8"
                        size="sm"
                        type="button"
                        variant="outline"
                        onClick={() => setFields({ ...blank, ...s })}
                      >
                        {s.name}
                      </Button>
                    ))}
                  </div>
                )}
                <label className="block space-y-1.5 text-sm">
                  <span>Name</span>
                  <Input
                    autoFocus={!focusOpensKeyboard()}
                    className="h-11 pointer-fine:md:h-9"
                    required
                    maxLength={64}
                    value={fields.name}
                    onChange={(e) => setFields({ ...fields, name: e.target.value })}
                    placeholder="Research partner"
                  />
                </label>
                <label className="block space-y-1.5 text-sm">
                  <span>Description</span>
                  <Input
                    className="h-11 pointer-fine:md:h-9"
                    maxLength={240}
                    value={fields.description}
                    onChange={(e) => setFields({ ...fields, description: e.target.value })}
                    placeholder="What this agent is good at"
                  />
                </label>
                <label className="block space-y-1.5 text-sm">
                  <span>Instructions</span>
                  <Textarea
                    required
                    className="min-h-32"
                    maxLength={4000}
                    value={fields.instructions}
                    onChange={(e) => setFields({ ...fields, instructions: e.target.value })}
                    placeholder="Role, approach, expected output and boundaries"
                  />
                </label>
                <label className="block space-y-1.5 text-sm">
                  <span>Reference context</span>
                  <Textarea
                    className="min-h-24"
                    maxLength={4000}
                    value={fields.knowledge}
                    onChange={(e) => setFields({ ...fields, knowledge: e.target.value })}
                    placeholder="Background information and preferences. Never paste credentials."
                  />
                </label>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-1.5 text-sm">
                    <label htmlFor="profile-model">Preferred model</label>
                    <Select
                      value={fields.model || "default"}
                      onValueChange={(value) =>
                        setFields({ ...fields, model: value === "default" ? "" : value })
                      }
                    >
                      <SelectTrigger id="profile-model" className={FIELD_SELECT}>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="default">Current model</SelectItem>
                        {fields.model && !catalog?.models.some((m) => m.id === fields.model) && (
                          <SelectItem value={fields.model}>
                            {fields.model} (not in current catalog)
                          </SelectItem>
                        )}
                        {catalog?.models.map((m) => (
                          <SelectItem key={m.id} value={m.id}>
                            <BrandIcon
                              brand={makerBrand(m.maker)}
                              className="text-foreground/80"
                              name={makerLabel(m.maker)}
                            />
                            {m.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5 text-sm">
                    <label htmlFor="profile-reasoning">Reasoning effort</label>
                    <Select
                      value={fields.reasoning}
                      onValueChange={(value) =>
                        setFields({ ...fields, reasoning: value as Fields["reasoning"] })
                      }
                    >
                      <SelectTrigger id="profile-reasoning" className={FIELD_SELECT}>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {["provider-default", "low", "medium", "high"].map((v) => (
                          <SelectItem key={v} value={v}>
                            {v === "provider-default" ? "Provider default" : v}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <p className="text-xs leading-5 text-muted-foreground">
                  Model support depends on the active provider. You can change models in the
                  composer. Reference context is encrypted on the server and sent to the selected
                  model when this agent runs.
                </p>
                {error && (
                  <p className="text-sm text-destructive" role="alert">
                    {error}
                  </p>
                )}
              </div>
              <div className="flex flex-wrap items-center justify-between gap-2 border-t px-5 py-4">
                <div className="flex gap-2">
                  {editing && (
                    <>
                      <Button
                        className="h-11 pointer-fine:md:h-9"
                        disabled={saving}
                        variant="ghost"
                        type="button"
                        onClick={() => {
                          setEditing(null);
                          setFields({ ...fields, name: `${fields.name.slice(0, 55)} copy` });
                          setConfirmDelete(false);
                        }}
                      >
                        <CopyIcon className="size-4" />
                        Duplicate
                      </Button>
                      <Button
                        className="h-11 pointer-fine:md:h-9"
                        disabled={saving}
                        variant={confirmDelete ? "destructive" : "ghost"}
                        type="button"
                        onClick={() => (confirmDelete ? void save(true) : setConfirmDelete(true))}
                      >
                        {confirmDelete ? "Confirm delete" : "Delete"}
                      </Button>
                    </>
                  )}
                </div>
                <Button
                  className="h-11 pointer-fine:md:h-9"
                  disabled={saving || !fields.name.trim() || !fields.instructions.trim()}
                  type="submit"
                >
                  {saving && <Loader2Icon className="size-4 animate-spin" />}Save agent
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}
