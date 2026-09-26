"use client";
import Link from "next/link";
import dynamic from "next/dynamic";
import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { useChatShell } from "@/app/_components/chat-shell-context";
import { rememberModelLabel } from "@/lib/chat/model-label";
import { ChevronDownIcon, Loader2Icon } from "lucide-react";
import {
  PROVIDERS,
  PROVIDER_IDS,
  pickModel,
  type CatalogModel,
  type ProviderId,
} from "@/lib/model-catalog";
import {
  readModelPreference,
  setModelPreference,
  subscribeModelPreference,
} from "@/lib/chat/model-preference";
import { providerAction, useModelSettings } from "@/lib/chat/provider-client";
import { markLayerNavigation, useBackToClose } from "@/lib/pwa/back-layer";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { BrandIcon } from "@/components/brand-icon";
import { makerBrand, PROVIDER_BRANDS } from "@/lib/brands";

// The searchable list (cmdk) loads when the picker first opens, or earlier when
// the browser is idle, instead of with every page that shows a composer.
const loadList = () => import("./model-picker-list");
const ModelPickerList = dynamic(() => loadList().then((module) => module.ModelPickerList), {
  ssr: false,
  loading: () => (
    <p className="min-h-0 flex-1 p-6 text-center text-sm text-muted-foreground">Loading models…</p>
  ),
});

export function ModelPicker({ className }: { className?: string }) {
  const requested = useSyncExternalStore(subscribeModelPreference, readModelPreference, () => "");
  const { catalog, status, catalogError } = useModelSettings();
  const [open, setOpen] = useState(false);
  const [switching, setSwitching] = useState<ProviderId | null>(null);
  const [switchError, setSwitchError] = useState("");
  useBackToClose(open, () => setOpen(false));
  const { modelLabel } = useChatShell();
  const provider = catalog?.provider ?? status?.active ?? modelLabel?.provider ?? "gateway";
  const models = useMemo(() => catalog?.models ?? [], [catalog]);
  const effective = catalog ? pickModel(provider, models, requested) : undefined;
  const unavailable = Boolean(catalog && requested && effective?.id !== requested);

  useEffect(() => {
    const prefetch = () => void loadList().catch(() => {});
    if (typeof window.requestIdleCallback !== "function") {
      const timer = setTimeout(prefetch, 3_000);
      return () => clearTimeout(timer);
    }
    const idle = window.requestIdleCallback(prefetch, { timeout: 10_000 });
    return () => window.cancelIdleCallback(idle);
  }, []);

  async function switchProvider(next: ProviderId) {
    setSwitchError("");
    setSwitching(next);
    const result = await providerAction({ action: "activate", provider: next });
    setSwitching(null);
    if (!result.ok) setSwitchError(result.error);
  }
  function choose(model: CatalogModel) {
    setModelPreference(model.id);
    // The operator's pick also becomes the model for Telegram and schedules.
    if (status) void providerAction({ action: "model", model: model.id });
    setOpen(false);
  }

  const label =
    effective?.name ?? modelLabel?.label ?? (catalogError ? "Model" : "Loading models…");
  const brand = effective ? makerBrand(effective.maker) : modelLabel?.brand;
  useEffect(() => {
    if (effective)
      rememberModelLabel({ label: effective.name, provider, brand: makerBrand(effective.maker) });
  }, [effective, provider]);
  return (
    <Dialog
      open={open}
      onOpenChange={(value) => {
        setOpen(value);
        if (!value) setSwitchError("");
      }}
    >
      <DialogTrigger asChild>
        <Button
          variant="ghost"
          type="button"
          aria-label={`Model: ${label} via ${PROVIDERS[provider].label}. Change model`}
          className={cn(
            "min-h-11 min-w-0 max-w-full gap-1.5 px-2 text-xs font-medium text-muted-foreground sm:max-w-[260px] sm:text-sm pointer-fine:md:min-h-9",
            className,
          )}
        >
          {brand ? <BrandIcon brand={brand} className="size-3.5" name={label} /> : null}
          <span className="truncate">{label}</span>
          <span className="hidden shrink-0 text-xs text-muted-foreground sm:inline">
            {PROVIDERS[provider].shortLabel}
          </span>
          <ChevronDownIcon className="size-3.5 shrink-0" />
        </Button>
      </DialogTrigger>
      <DialogContent className="flex max-h-[85%] w-[calc(100%-2rem)] max-w-xl flex-col gap-0 overflow-hidden p-0">
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
                    {switching === id ? (
                      <Loader2Icon className="size-3.5 animate-spin" />
                    ) : (
                      <BrandIcon
                        brand={PROVIDER_BRANDS[id]}
                        className="size-3.5"
                        name={PROVIDERS[id].shortLabel}
                      />
                    )}
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
        <ModelPickerList
          failed={Boolean(catalogError)}
          loaded={Boolean(catalog)}
          models={models}
          onChoose={choose}
          provider={provider}
          selectedId={effective?.id}
        />
        <div className="flex flex-wrap items-center justify-between gap-2 border-t px-4 py-3 text-xs text-muted-foreground sm:px-5">
          <span>
            {models.length} models ·{" "}
            {catalog?.source === "live"
              ? "live catalog"
              : "saved catalog, live refresh unavailable"}
          </span>
          <Link
            href="/settings"
            onClick={() => {
              markLayerNavigation();
              setOpen(false);
            }}
            replace
            className="underline underline-offset-4 hover:text-foreground"
          >
            API keys
          </Link>
        </div>
      </DialogContent>
    </Dialog>
  );
}
