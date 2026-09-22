"use client";
import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { ChevronDownIcon, CheckIcon, SearchIcon } from "lucide-react";
import {
  CATALOG_SNAPSHOT,
  DEFAULT_MODEL,
  modelUnavailableReason,
  type GatewayModel,
} from "@/lib/model-catalog";
import {
  readModelPreference,
  setModelPreference,
  subscribeModelPreference,
} from "@/lib/chat/model-preference";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
export function ModelPicker() {
  const selected = useSyncExternalStore(
    subscribeModelPreference,
    readModelPreference,
    () => DEFAULT_MODEL,
  );
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [models, setModels] = useState<GatewayModel[]>(CATALOG_SNAPSHOT);
  const [source, setSource] = useState("snapshot");
  useEffect(() => {
    if (!open) return;
    const controller = new AbortController();
    fetch("/api/models", { signal: controller.signal })
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((data) => {
        setModels(data.models);
        setSource(data.source);
      })
      .catch(() => {});
    return () => controller.abort();
  }, [open]);
  const filtered = useMemo(
    () =>
      models
        .filter((model) =>
          `${model.name} ${model.id} ${model.provider} ${model.type}`
            .toLowerCase()
            .includes(query.toLowerCase().trim()),
        )
        .sort((a, b) => a.provider.localeCompare(b.provider) || a.name.localeCompare(b.name)),
    [models, query],
  );
  const label = models.find((model) => model.id === selected)?.name ?? selected;
  return (
    <Dialog
      open={open}
      onOpenChange={(value) => {
        setOpen(value);
        if (!value) setQuery("");
      }}
    >
      <DialogTrigger asChild>
        <Button
          variant="ghost"
          type="button"
          aria-label={`Model: ${label}`}
          className="min-h-11 max-w-[220px] gap-1.5 px-2 text-sm font-normal md:min-h-9"
        >
          <span className="truncate">{label}</span>
          <ChevronDownIcon className="size-3.5 shrink-0" />
        </Button>
      </DialogTrigger>
      <DialogContent className="flex max-h-[85dvh] w-[calc(100%-2rem)] max-w-xl flex-col gap-3 p-4 sm:p-6">
        <DialogHeader>
          <DialogTitle>Gateway models</DialogTitle>
          <DialogDescription>
            {models.length} models from every provider. Your selection applies to the next message.
          </DialogDescription>
        </DialogHeader>
        <div className="relative">
          <SearchIcon className="absolute left-3 top-3.5 size-4 text-muted-foreground" />
          <Input
            aria-label="Search Gateway models"
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search model, provider or type…"
            className="h-11 pl-9"
          />
        </div>
        <p className="text-xs text-muted-foreground">
          {filtered.length} results ·{" "}
          {source === "live" ? "Live Gateway catalog" : "Saved catalog · live refresh unavailable"}
        </p>
        <div
          className="min-h-0 flex-1 overflow-y-auto rounded-lg border"
          aria-label="Gateway model results"
        >
          {filtered.map((model) => {
            const reason = modelUnavailableReason(model);
            return (
              <button
                type="button"
                key={model.id}
                disabled={Boolean(reason)}
                onClick={() => {
                  setModelPreference(model.id);
                  setOpen(false);
                  setQuery("");
                }}
                aria-label={`${model.name} · ${model.id}${reason ? ` · ${reason}` : ""}`}
                aria-pressed={selected === model.id}
                className="flex min-h-16 w-full items-center gap-3 border-b px-3 py-3 text-left last:border-0 hover:bg-muted/50 focus-visible:bg-muted disabled:cursor-not-allowed disabled:text-muted-foreground disabled:hover:bg-transparent"
              >
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium">{model.name}</p>
                  <p className="mt-0.5 break-all text-xs text-muted-foreground">{model.id}</p>
                  {reason && <p className="mt-1 text-xs">{reason}</p>}
                </div>
                {selected === model.id && <CheckIcon className="size-4 shrink-0" />}
              </button>
            );
          })}
          {!filtered.length && (
            <p className="p-6 text-sm text-muted-foreground">No matching models.</p>
          )}
        </div>
        <p className="text-xs leading-5 text-muted-foreground">
          All Gateway models are shown. This agent requires text and tool support; other model types
          are labelled. Availability and cost depend on your Gateway account.
        </p>
      </DialogContent>
    </Dialog>
  );
}
