"use client";
import { useState, type FormEvent } from "react";
import { ExternalLinkIcon, Loader2Icon } from "lucide-react";
import { ModelPicker } from "@/components/chat/model-picker";
import { readModelPreference } from "@/lib/chat/model-preference";
import { providerAction, useModelSettings, type ProviderState } from "@/lib/chat/provider-client";
import { PROVIDERS, PROVIDER_IDS, type ProviderId } from "@/lib/model-catalog";
import { SettingsShell } from "./settings-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const ENV_NAMES: Record<ProviderId, string> = {
  gateway: "AI_GATEWAY_API_KEY",
  openrouter: "OPENROUTER_API_KEY",
};

function describe(provider: ProviderId, state: ProviderState) {
  switch (state.source) {
    case "app":
      return `Key saved${
        state.updatedAt
          ? ` ${new Date(state.updatedAt).toLocaleDateString(undefined, { dateStyle: "medium" })}`
          : ""
      }`;
    case "environment":
      return `Using the server key from ${ENV_NAMES[provider]}`;
    case "unreadable":
      return "The saved key can’t be read because the server secret changed. Remove it and save it again.";
    default:
      return "No key yet";
  }
}

function ProviderCard({
  provider,
  state,
  active,
}: {
  provider: ProviderId;
  state: ProviderState;
  active: boolean;
}) {
  const info = PROVIDERS[provider];
  const [apiKey, setApiKey] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function run(action: "save" | "remove" | "activate" | "test") {
    setBusy(action);
    setError("");
    setMessage("");
    const result = await providerAction(
      action === "save"
        ? { action, provider, apiKey }
        : action === "test"
          ? { action, provider, model: readModelPreference() }
          : { action, provider },
    );
    setBusy(null);
    if (!result.ok) return setError(result.error);
    if (action === "save") {
      setApiKey("");
      setMessage(`Key saved. ${info.label} is now active for new messages.`);
    } else if (action === "remove") setMessage("Saved key removed.");
    else if (action === "activate") setMessage(`${info.label} is now active for new messages.`);
    else setMessage(String(result.data.message));
  }

  const inputId = `${provider}-key`;
  return (
    <section
      aria-labelledby={`${provider}-title`}
      className="rounded-lg border bg-card p-4 sm:p-5"
      data-active={active}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 id={`${provider}-title`} className="flex items-center gap-2 font-medium">
            {info.label}
            {active && <Badge variant="secondary">Active</Badge>}
          </h2>
          <p
            className={
              state.source === "unreadable"
                ? "mt-1 text-sm text-destructive"
                : "mt-1 text-sm text-muted-foreground"
            }
          >
            {describe(provider, state)}
          </p>
        </div>
        {!active && (
          <Button
            variant="outline"
            className="h-11 shrink-0 md:h-9"
            disabled={!state.configured || Boolean(busy)}
            onClick={() => void run("activate")}
          >
            {busy === "activate" && <Loader2Icon className="size-4 animate-spin" />}
            Use {info.shortLabel}
          </Button>
        )}
      </div>
      <form
        className="mt-4 flex flex-col gap-2 sm:flex-row"
        onSubmit={(event: FormEvent) => {
          event.preventDefault();
          void run("save");
        }}
      >
        <label className="sr-only" htmlFor={inputId}>
          {state.configured ? `Replace ${info.label} API key` : `${info.label} API key`}
        </label>
        <Input
          id={inputId}
          type="password"
          autoComplete="off"
          spellCheck={false}
          value={apiKey}
          onChange={(event) => setApiKey(event.target.value)}
          placeholder={state.configured ? "Paste a new key to replace it" : info.keyPlaceholder}
          maxLength={2048}
          className="h-11 min-w-0 flex-1"
        />
        <Button className="h-11" type="submit" disabled={Boolean(busy) || !apiKey.trim()}>
          {busy === "save" && <Loader2Icon className="size-4 animate-spin" />}
          Save key
        </Button>
      </form>
      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
        {state.configured && (
          <Button
            variant="ghost"
            className="-ml-2 h-11 px-2 md:h-9"
            disabled={Boolean(busy)}
            onClick={() => void run("test")}
          >
            {busy === "test" && <Loader2Icon className="size-4 animate-spin" />}
            Test connection
          </Button>
        )}
        {(state.source === "app" || state.source === "unreadable") && (
          <Button
            variant="ghost"
            className="-ml-2 h-11 px-2 text-muted-foreground md:h-9"
            disabled={Boolean(busy)}
            onClick={() => void run("remove")}
          >
            {busy === "remove" && <Loader2Icon className="size-4 animate-spin" />}
            Remove saved key
          </Button>
        )}
        <a
          className="inline-flex min-h-11 items-center gap-1 text-muted-foreground underline-offset-4 hover:text-foreground hover:underline md:min-h-9"
          href={info.keysUrl}
          target="_blank"
          rel="noreferrer"
        >
          Get a key <ExternalLinkIcon className="size-3.5" />
        </a>
        <a
          className="inline-flex min-h-11 items-center gap-1 text-muted-foreground underline-offset-4 hover:text-foreground hover:underline md:min-h-9"
          href={info.billingUrl}
          target="_blank"
          rel="noreferrer"
        >
          Credits <ExternalLinkIcon className="size-3.5" />
        </a>
      </div>
      {error && (
        <p role="alert" className="mt-2 text-sm text-destructive">
          {error}
        </p>
      )}
      {message && !error && (
        <p role="status" className="mt-2 text-sm">
          {message}
        </p>
      )}
    </section>
  );
}

export function ProviderSettings() {
  const { status } = useModelSettings();
  return (
    <SettingsShell
      section="general"
      title="Models"
      description="Choose where Ægentica gets its AI models. Changes apply to the next message, with no restart."
    >
      {status === undefined ? (
        <p className="text-sm text-muted-foreground">Loading settings…</p>
      ) : status === null ? (
        <p className="rounded-lg border p-5 text-sm">
          Provider settings are available to the operator account that signs in with the app
          password.
        </p>
      ) : (
        <>
          <section className="rounded-lg border bg-card p-4 sm:p-5">
            <h2 className="font-medium">Model</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Used for new messages and the connection test. You can also change it from the
              composer.
            </p>
            <ModelPicker className="-ml-2 mt-2" />
          </section>
          {PROVIDER_IDS.map((provider) => (
            <ProviderCard
              key={provider}
              provider={provider}
              state={status.providers[provider]}
              active={status.active === provider}
            />
          ))}
          <p className="text-xs leading-5 text-muted-foreground">
            Keys are encrypted on this server and never shown again or stored in your browser. The
            connection test sends one short request and may use a few tokens. Images are created
            with the active provider too.
          </p>
        </>
      )}
    </SettingsShell>
  );
}
