"use client";
import Link from "next/link";
import { useMemo, useState, useSyncExternalStore } from "react";
import { CheckIcon, ChevronDownIcon, Loader2Icon } from "lucide-react";
import {
  PROVIDERS,
  PROVIDER_IDS,
  pickModel,
  type CatalogModel,
  type ProviderId,
} from "@/lib/model-catalog";
import {
  readModelPreference,
  readRecentModels,
  setModelPreference,
  subscribeModelPreference,
} from "@/lib/chat/model-preference";
import {
  formatContext,
  formatPrice,
  providerAction,
  useModelSettings,
} from "@/lib/chat/provider-client";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

const MAKER_LABELS: Record<string, string> = {
  anthropic: "Anthropic",
  google: "Google",
  openai: "OpenAI",
  xai: "xAI",
  "x-ai": "xAI",
  meta: "Meta",
  "meta-llama": "Meta",
  mistral: "Mistral",
  mistralai: "Mistral",
  deepseek: "DeepSeek",
  alibaba: "Alibaba",
  qwen: "Qwen",
  moonshotai: "Moonshot AI",
  zai: "Z.ai",
  "z-ai": "Z.ai",
  amazon: "Amazon",
  cohere: "Cohere",
  nvidia: "NVIDIA",
  perplexity: "Perplexity",
  minimax: "MiniMax",
};
const makerLabel = (maker: string) =>
  MAKER_LABELS[maker] ?? maker.charAt(0).toUpperCase() + maker.slice(1);

function ModelRow({
  model,
  selected,
  value,
  onSelect,
}: {
  model: CatalogModel;
  selected: boolean;
  value: string;
  onSelect: () => void;
}) {
  const details = [
    formatContext(model.contextWindow),
    formatPrice(model),
    model.reasoning && "Reasoning",
    model.vision && "Vision",
  ].filter(Boolean);
  return (
    <CommandItem
      value={value}
      keywords={[model.name, model.id, makerLabel(model.maker)]}
      onSelect={onSelect}
      className="min-h-12 items-start gap-3 px-3 py-2.5"
    >
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{model.name}</p>
        <p className="mt-0.5 truncate text-xs text-muted-foreground">
          {model.id}
          {details.length > 0 && <span className="hidden sm:inline"> · {details.join(" · ")}</span>}
        </p>
        {details.length > 0 && (
          <p className="mt-0.5 truncate text-xs text-muted-foreground sm:hidden">
            {details.join(" · ")}
          </p>
        )}
      </div>
      {selected && <CheckIcon className="mt-0.5 size-4 text-foreground" aria-label="Selected" />}
    </CommandItem>
  );
}

export function ModelPicker({ className }: { className?: string }) {
  const requested = useSyncExternalStore(subscribeModelPreference, readModelPreference, () => "");
  const { catalog, status, catalogError } = useModelSettings();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [switching, setSwitching] = useState<ProviderId | null>(null);
  const [switchError, setSwitchError] = useState("");
  const provider = catalog?.provider ?? status?.active ?? "gateway";
  const models = useMemo(() => catalog?.models ?? [], [catalog]);
  const effective = catalog ? pickModel(provider, models, requested) : undefined;
  const unavailable = Boolean(catalog && requested && effective?.id !== requested);

  const groups = useMemo(() => {
    const byId = new Map(models.map((model) => [model.id, model]));
    const byMaker = new Map<string, CatalogModel[]>();
    for (const model of [...models].sort((a, b) => a.name.localeCompare(b.name))) {
      const label = makerLabel(model.maker);
      byMaker.set(label, [...(byMaker.get(label) ?? []), model]);
    }
    const pick = (ids: readonly string[]) =>
      ids.map((id) => byId.get(id)).filter((model): model is CatalogModel => Boolean(model));
    return {
      recent: open ? pick(readRecentModels()) : [],
      recommended: pick(PROVIDERS[provider].recommended),
      makers: [...byMaker].sort(([a], [b]) => a.localeCompare(b)),
    };
  }, [models, provider, open]);

  async function switchProvider(next: ProviderId) {
    setSwitchError("");
    setSwitching(next);
    const result = await providerAction({ action: "activate", provider: next });
    setSwitching(null);
    if (!result.ok) setSwitchError(result.error);
  }
  function choose(model: CatalogModel) {
    setModelPreference(model.id);
    setOpen(false);
    setQuery("");
  }

  const label = effective?.name ?? (catalogError ? "Model" : "Loading models…");
  const searching = query.trim().length > 0;
  return (
    <Dialog
      open={open}
      onOpenChange={(value) => {
        setOpen(value);
        if (!value) {
          setQuery("");
          setSwitchError("");
        }
      }}
    >
      <DialogTrigger asChild>
        <Button
          variant="ghost"
          type="button"
          aria-label={`Model: ${label} via ${PROVIDERS[provider].label}. Change model`}
          className={cn(
            "min-h-11 max-w-[240px] gap-1.5 px-2 text-sm font-normal md:min-h-9",
            className,
          )}
        >
          <span className="truncate">{label}</span>
          <span className="hidden shrink-0 text-xs text-muted-foreground sm:inline">
            {PROVIDERS[provider].shortLabel}
          </span>
          <ChevronDownIcon className="size-3.5 shrink-0" />
        </Button>
      </DialogTrigger>
      <DialogContent className="flex max-h-[85dvh] w-[calc(100%-2rem)] max-w-xl flex-col gap-0 overflow-hidden p-0">
        <DialogHeader className="gap-1 border-b px-4 pb-3 pt-4 text-left sm:px-5">
          <DialogTitle>Choose a model</DialogTitle>
          <DialogDescription>
            Applies to your next message. Only models that can use tools are listed.
          </DialogDescription>
          {status ? (
            <div
              role="radiogroup"
              aria-label="Model provider"
              className="mt-2 grid grid-cols-2 gap-1 rounded-lg bg-muted p-1"
            >
              {PROVIDER_IDS.map((id) => {
                const configured = status.providers[id].configured;
                const active = status.active === id;
                return (
                  <button
                    key={id}
                    type="button"
                    role="radio"
                    aria-checked={active}
                    disabled={!configured || Boolean(switching)}
                    onClick={() => !active && void switchProvider(id)}
                    className={cn(
                      "flex min-h-10 items-center justify-center gap-1.5 rounded-md px-2 text-sm transition-colors focus-visible:outline-2 focus-visible:outline-ring disabled:cursor-not-allowed",
                      active
                        ? "bg-background font-medium shadow-sm"
                        : "text-muted-foreground hover:text-foreground disabled:hover:text-muted-foreground",
                    )}
                  >
                    {switching === id && <Loader2Icon className="size-3.5 animate-spin" />}
                    {PROVIDERS[id].shortLabel}
                    {!configured && <span className="text-xs">· no key</span>}
                  </button>
                );
              })}
            </div>
          ) : (
            <p className="mt-1 text-xs text-muted-foreground">
              Models from {PROVIDERS[provider].label}
            </p>
          )}
          {switchError && (
            <p role="alert" className="text-xs text-destructive">
              {switchError}
            </p>
          )}
          {unavailable && effective && (
            <p className="text-xs text-muted-foreground">
              {requested} is not on {PROVIDERS[provider].label}. Using {effective.name} instead.
            </p>
          )}
        </DialogHeader>
        <Command className="min-h-0 flex-1 rounded-none **:data-[slot=command-input-wrapper]:h-12">
          <CommandInput
            autoFocus
            value={query}
            onValueChange={setQuery}
            placeholder="Search models or makers…"
            aria-label="Search models"
            className="h-12 text-base sm:text-sm"
          />
          <CommandList className="max-h-none min-h-0 flex-1 overscroll-contain">
            {!catalog ? (
              <p className="p-6 text-center text-sm text-muted-foreground">
                {catalogError ? "Could not load models. Close and try again." : "Loading models…"}
              </p>
            ) : (
              <>
                <CommandEmpty>No matching models.</CommandEmpty>
                {!searching && groups.recent.length > 0 && (
                  <CommandGroup heading="Recent">
                    {groups.recent.map((model) => (
                      <ModelRow
                        key={model.id}
                        value={`recent ${model.id}`}
                        model={model}
                        selected={effective?.id === model.id}
                        onSelect={() => choose(model)}
                      />
                    ))}
                  </CommandGroup>
                )}
                {!searching && groups.recommended.length > 0 && (
                  <CommandGroup heading="Recommended">
                    {groups.recommended.map((model) => (
                      <ModelRow
                        key={model.id}
                        value={`recommended ${model.id}`}
                        model={model}
                        selected={effective?.id === model.id}
                        onSelect={() => choose(model)}
                      />
                    ))}
                  </CommandGroup>
                )}
                {groups.makers.map(([maker, makerModels]) => (
                  <CommandGroup key={maker} heading={maker}>
                    {makerModels.map((model) => (
                      <ModelRow
                        key={model.id}
                        value={model.id}
                        model={model}
                        selected={effective?.id === model.id}
                        onSelect={() => choose(model)}
                      />
                    ))}
                  </CommandGroup>
                ))}
              </>
            )}
          </CommandList>
        </Command>
        <div className="flex flex-wrap items-center justify-between gap-2 border-t px-4 py-3 text-xs text-muted-foreground sm:px-5">
          <span>
            {models.length} models ·{" "}
            {catalog?.source === "live"
              ? "live catalog"
              : "saved catalog, live refresh unavailable"}
          </span>
          <Link
            href="/settings"
            onClick={() => setOpen(false)}
            className="underline underline-offset-4 hover:text-foreground"
          >
            API keys
          </Link>
        </div>
      </DialogContent>
    </Dialog>
  );
}
