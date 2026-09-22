"use client";
import { useEffect, useState } from "react";
import type { CatalogModel, ProviderId } from "../model-catalog";
import { notifyModelSettingsChanged, subscribeModelPreference } from "./model-preference";

export type ClientCatalog = {
  provider: ProviderId;
  models: CatalogModel[];
  source: "live" | "cached" | "snapshot";
  updatedAt: string;
};
export type ProviderState = {
  configured: boolean;
  source: "app" | "environment" | "none" | "unreadable";
  updatedAt: string | null;
};
/** Null status means the viewer cannot manage providers (not the password operator). */
export type ProviderStatus = {
  active: ProviderId;
  providers: Record<ProviderId, ProviderState>;
} | null;

let catalogRequest: Promise<ClientCatalog> | undefined;
let statusRequest: Promise<ProviderStatus> | undefined;
let version = 0;

function loadCatalog() {
  if (catalogRequest) return catalogRequest;
  const request = fetch("/api/models", { cache: "no-store" }).then(async (response) => {
    if (!response.ok) throw new Error("Model catalog unavailable");
    return (await response.json()) as ClientCatalog;
  });
  request.catch(() => {
    if (catalogRequest === request) catalogRequest = undefined;
  });
  return (catalogRequest = request);
}
function loadStatus() {
  statusRequest ??= fetch("/api/settings/providers", { cache: "no-store" })
    .then(async (response) => (response.ok ? ((await response.json()) as ProviderStatus) : null))
    .catch(() => null);
  return statusRequest;
}

/** Shared catalog and provider status; every hook instance refreshes after a provider change. */
export function useModelSettings() {
  const [catalog, setCatalog] = useState<ClientCatalog | null>(null);
  const [status, setStatus] = useState<ProviderStatus | undefined>(undefined);
  const [catalogError, setCatalogError] = useState(false);
  useEffect(() => {
    let stopped = false;
    const refresh = () => {
      loadCatalog()
        .then((value) => {
          if (stopped) return;
          setCatalog(value);
          setCatalogError(false);
        })
        .catch(() => !stopped && setCatalogError(true));
      void loadStatus().then((value) => !stopped && setStatus(value));
    };
    let seen = version;
    refresh();
    const unsubscribe = subscribeModelPreference(() => {
      // Model choices fire this event too; refetch only after a provider change.
      if (seen === version) return;
      seen = version;
      refresh();
    });
    return () => {
      stopped = true;
      unsubscribe();
    };
  }, []);
  return { catalog, status, catalogError };
}

export async function providerAction(body: {
  action: "save" | "remove" | "activate" | "test";
  provider: ProviderId;
  apiKey?: string;
  model?: string;
}): Promise<{ ok: true; data: Record<string, unknown> } | { ok: false; error: string }> {
  try {
    const response = await fetch("/api/settings/providers", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await response.json();
    if (!response.ok) return { ok: false, error: data.error || "Could not complete the request." };
    if (body.action !== "test") {
      catalogRequest = undefined;
      statusRequest = undefined;
      version++;
      notifyModelSettingsChanged();
    }
    return { ok: true, data };
  } catch {
    return { ok: false, error: "Connection interrupted. Refresh and try again." };
  }
}

export function formatContext(tokens: number | null) {
  if (!tokens) return null;
  return tokens >= 1_000_000
    ? `${Number((tokens / 1_000_000).toFixed(1))}M context`
    : `${Math.round(tokens / 1000)}K context`;
}
export function formatPrice(model: CatalogModel) {
  if (model.inputPrice === null || model.outputPrice === null) return null;
  if (model.inputPrice === 0 && model.outputPrice === 0) return "Free";
  const usd = (value: number) =>
    `$${value < 1 ? Number(value.toFixed(3)) : Number(value.toFixed(2))}`;
  return `${usd(model.inputPrice)} in · ${usd(model.outputPrice)} out /1M`;
}
