"use client";
import { useEffect, useSyncExternalStore } from "react";
import { AUTH_HINT_COOKIE_NAME, AUTH_HINT_COOKIE_VALUE } from "../auth-hint";
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
  // Signed-out visitors cannot manage providers; skip a request that can only be denied.
  if (!document.cookie.includes(`${AUTH_HINT_COOKIE_NAME}=${AUTH_HINT_COOKIE_VALUE}`))
    return Promise.resolve(null);
  if (statusRequest) return statusRequest;
  const request = fetch("/api/settings/providers", { cache: "no-store" }).then(async (response) => {
    if (response.ok) return (await response.json()) as ProviderStatus;
    if (response.status === 401 || response.status === 403) return null;
    throw new Error("Provider status unavailable");
  });
  // Offline or a passing server error is retried on the next refresh instead of
  // being remembered as "not the operator".
  request.catch(() => {
    if (statusRequest === request) statusRequest = undefined;
  });
  return (statusRequest = request);
}

type ModelSettings = {
  readonly catalog: ClientCatalog | null;
  readonly status: ProviderStatus | undefined;
  readonly catalogError: boolean;
  /** The provider status request failed (offline, server error); Retry calls retryModelSettings. */
  readonly statusError: boolean;
};
const NOT_LOADED: ModelSettings = {
  catalog: null,
  status: undefined,
  catalogError: false,
  statusError: false,
};
// One shared answer: a picker mounted by navigation (a new chat, another page)
// shows the loaded model at once instead of a loading label, while hydration
// still starts from the server's not-loaded snapshot.
let settings = NOT_LOADED;
const listeners = new Set<() => void>();
function publish(patch: Partial<ModelSettings>) {
  settings = { ...settings, ...patch };
  for (const listener of listeners) listener();
}
function subscribeSettings(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
function refreshSettings() {
  loadCatalog()
    .then((catalog) => publish({ catalog, catalogError: false }))
    .catch(() => publish({ catalogError: true }));
  loadStatus().then(
    (status) => publish({ status, statusError: false }),
    () => publish({ statusError: true }),
  );
}

/** Loads the catalog and provider status again after a failure. */
export function retryModelSettings() {
  publish({ catalogError: false, statusError: false });
  refreshSettings();
}

/** Shared catalog and provider status, refreshed on mount and after a provider change. */
export function useModelSettings() {
  useEffect(() => {
    let seen = version;
    refreshSettings();
    return subscribeModelPreference(() => {
      // Model choices fire this event too; refetch only after a provider change.
      if (seen === version) return;
      seen = version;
      refreshSettings();
    });
  }, []);
  return useSyncExternalStore(
    subscribeSettings,
    () => settings,
    () => NOT_LOADED,
  );
}

export async function providerAction(body: {
  action: "save" | "remove" | "activate" | "test" | "model";
  provider?: ProviderId;
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
    if (body.action !== "test" && body.action !== "model") {
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
