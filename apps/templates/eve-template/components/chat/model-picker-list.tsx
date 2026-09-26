"use client";
import { Fragment, useMemo, useState } from "react";
import { defaultFilter } from "cmdk";
import { CheckIcon, ChevronRightIcon } from "lucide-react";
import { PROVIDERS, type CatalogModel, type ProviderId } from "@/lib/model-catalog";
import { readRecentModels } from "@/lib/chat/model-preference";
import { formatContext, formatPrice } from "@/lib/chat/provider-client";
import { focusOpensKeyboard } from "@/lib/pwa/keyboard";
import { cn } from "@/lib/utils";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { BrandIcon } from "@/components/brand-icon";
import { makerBrand, makerLabel } from "@/lib/brands";

// The searchable list inside the model picker (model-picker.tsx loads it when
// the picker opens, so cmdk is not part of every page with a composer). It
// mounts with the dialog, so a new opening starts with a clear search.

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
      <BrandIcon
        brand={makerBrand(model.maker)}
        className="mt-0.5 text-foreground/80"
        name={makerLabel(model.maker)}
      />
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

// A maker's row opens and closes its list of models.
function MakerRow({
  maker,
  models,
  expanded,
  onToggle,
}: {
  maker: string;
  models: readonly CatalogModel[];
  expanded: boolean;
  onToggle: () => void;
}) {
  return (
    <CommandItem value={`maker ${maker}`} onSelect={onToggle} className="min-h-11 gap-3 px-3 py-2">
      <BrandIcon brand={makerBrand(models[0]!.maker)} className="text-foreground/80" name={maker} />
      <span className="min-w-0 flex-1 truncate text-sm font-medium">{maker}</span>
      <span className="shrink-0 text-xs text-muted-foreground">
        {models.length} {models.length === 1 ? "model" : "models"}
        <span className="sr-only">{expanded ? ", shown" : ", hidden"}</span>
      </span>
      <ChevronRightIcon
        className={cn(
          "size-4 shrink-0 text-muted-foreground transition-transform",
          expanded && "rotate-90",
        )}
      />
    </CommandItem>
  );
}

// Search lists the best matches first. A query that matches most of the
// catalog would otherwise mount every model at once, as opening used to.
const SEARCH_LIMIT = 40;

export function ModelPickerList({
  models,
  provider,
  loaded,
  failed,
  selectedId,
  onChoose,
}: {
  models: readonly CatalogModel[];
  provider: ProviderId;
  loaded: boolean;
  failed: boolean;
  selectedId: string | undefined;
  onChoose: (model: CatalogModel) => void;
}) {
  const [query, setQuery] = useState("");
  // Makers start collapsed: a few dozen rows to render instead of the whole catalog.
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(() => new Set());
  const [showAllFor, setShowAllFor] = useState<string | null>(null);
  // Read once per opening, like the rest of the list.
  const [recentIds] = useState(readRecentModels);

  const groups = useMemo(() => {
    const byId = new Map(models.map((model) => [model.id, model]));
    const byMaker = new Map<string, CatalogModel[]>();
    for (const model of [...models].sort((a, b) => a.name.localeCompare(b.name))) {
      const label = makerLabel(model.maker);
      byMaker.set(label, [...(byMaker.get(label) ?? []), model]);
    }
    // Makers that share a name (mistral, mistralai) share a heading and logo.
    const pick = (ids: readonly string[]) =>
      ids.map((id) => byId.get(id)).filter((model): model is CatalogModel => Boolean(model));
    return {
      recent: pick(recentIds),
      recommended: pick(PROVIDERS[provider].recommended),
      makers: [...byMaker].sort(([a], [b]) => a.localeCompare(b)),
    };
  }, [models, provider, recentIds]);

  const searching = query.trim().length > 0;
  // cmdk's own scoring over the whole catalog, best matches first.
  const results = useMemo(() => {
    if (!searching) return null;
    const matches = models
      .map((model) => ({
        model,
        score: defaultFilter(model.id, query, [model.name, model.id, makerLabel(model.maker)]),
      }))
      .filter((match) => match.score > 0)
      .sort((a, b) => b.score - a.score);
    const shown = showAllFor === query ? matches : matches.slice(0, SEARCH_LIMIT);
    const byMaker = new Map<string, CatalogModel[]>();
    for (const { model } of shown) {
      const label = makerLabel(model.maker);
      byMaker.set(label, [...(byMaker.get(label) ?? []), model]);
    }
    return { makers: [...byMaker], hidden: matches.length - shown.length };
  }, [models, query, searching, showAllFor]);
  function toggleMaker(maker: string) {
    setExpanded((current) => {
      const next = new Set(current);
      if (!next.delete(maker)) next.add(maker);
      return next;
    });
  }
  const modelRow = (model: CatalogModel) => (
    <ModelRow
      key={model.id}
      value={model.id}
      model={model}
      selected={selectedId === model.id}
      onSelect={() => onChoose(model)}
    />
  );
  return (
    <Command
      className="min-h-0 flex-1 rounded-none **:data-[slot=command-input-wrapper]:h-12"
      shouldFilter={false}
    >
      <CommandInput
        autoFocus={!focusOpensKeyboard()}
        value={query}
        onValueChange={setQuery}
        placeholder="Search models or makers…"
        aria-label="Search models"
        className="h-12 text-base sm:text-sm"
      />
      <CommandList className="max-h-none min-h-0 flex-1 overscroll-contain">
        {!loaded ? (
          <p className="p-6 text-center text-sm text-muted-foreground">
            {failed ? "Could not load models. Close and try again." : "Loading models…"}
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
                    selected={selectedId === model.id}
                    onSelect={() => onChoose(model)}
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
                    selected={selectedId === model.id}
                    onSelect={() => onChoose(model)}
                  />
                ))}
              </CommandGroup>
            )}
            {results ? (
              <>
                {results.makers.map(([maker, makerModels]) => (
                  <CommandGroup
                    key={maker}
                    heading={
                      <span className="flex items-center gap-1.5">
                        <BrandIcon
                          brand={makerBrand(makerModels[0]!.maker)}
                          className="size-3.5"
                          name={maker}
                        />
                        {maker}
                      </span>
                    }
                  >
                    {makerModels.map(modelRow)}
                  </CommandGroup>
                ))}
                {results.hidden > 0 && (
                  <CommandGroup>
                    <CommandItem
                      value="show all matches"
                      onSelect={() => setShowAllFor(query)}
                      className="min-h-11 justify-center px-3 text-sm text-muted-foreground"
                    >
                      Show {results.hidden} more matching models
                    </CommandItem>
                  </CommandGroup>
                )}
              </>
            ) : (
              <CommandGroup heading="All models">
                {groups.makers.map(([maker, makerModels]) => (
                  <Fragment key={maker}>
                    <MakerRow
                      expanded={expanded.has(maker)}
                      maker={maker}
                      models={makerModels}
                      onToggle={() => toggleMaker(maker)}
                    />
                    {expanded.has(maker) && makerModels.map(modelRow)}
                  </Fragment>
                ))}
              </CommandGroup>
            )}
          </>
        )}
      </CommandList>
    </Command>
  );
}
