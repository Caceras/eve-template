"use client";
import { useEffect, useState, type FormEvent } from "react";
import { KeyRoundIcon, Loader2Icon } from "lucide-react";
import { useChatShell } from "./chat-shell-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type Status = {
  configured: boolean;
  source: "app" | "environment";
  active: boolean;
  updatedAt: string | null;
};
export function GatewaySettings() {
  const { viewer, requestSignIn } = useChatShell();
  const [status, setStatus] = useState<Status | null>(null);
  const [apiKey, setApiKey] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  useEffect(() => {
    if (!viewer) {
      setStatus(null);
      return;
    }
    let stopped = false;
    let timer: ReturnType<typeof setTimeout>;
    let polls = 0;
    async function refresh() {
      try {
        const response = await fetch("/api/settings/gateway", { cache: "no-store" });
        const data = await response.json();
        if (stopped) return;
        if (!response.ok) {
          setError(data.error);
          return;
        }
        setStatus(data);
        if (!data.active && polls++ < 30) timer = setTimeout(refresh, 2000);
      } catch {
        if (!stopped) setError("Could not load your key settings. Refresh to try again.");
      }
    }
    void refresh();
    return () => {
      stopped = true;
      clearTimeout(timer);
    };
  }, [viewer, message]);
  async function submit(action: "save" | "test") {
    setBusy(action);
    setError("");
    setMessage("");
    try {
      const response = await fetch("/api/settings/gateway", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(action === "save" ? { action, apiKey } : { action }),
      });
      const data = await response.json();
      if (!response.ok) {
        setError(data.error || "Could not complete the request.");
        return;
      }
      if (action === "save") {
        setApiKey("");
        setStatus(data);
        setMessage("Key saved. Applying it to your agent…");
      } else setMessage(data.message);
    } catch {
      setError("Connection interrupted. Refresh to check whether your key was saved.");
    } finally {
      setBusy(null);
    }
  }
  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-2xl px-4 pb-16 pt-20 sm:px-8">
        <KeyRoundIcon className="mb-4 size-6" />
        <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
        <p className="mt-3 text-sm leading-6 text-muted-foreground">
          Connect Ægentica to your Vercel AI Gateway.
        </p>
        {!viewer ? (
          <div className="mt-8 rounded-lg border p-5">
            <p className="mb-4 text-sm">Sign in to manage the API key for this app.</p>
            <Button onClick={() => requestSignIn()}>Sign in</Button>
          </div>
        ) : (
          <section className="mt-8 rounded-lg border p-5 sm:p-6">
            <h2 className="font-medium">AI Gateway API key</h2>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              Your key is encrypted on this server and shared by this app’s operator account. It is
              never displayed again or stored in your browser.
            </p>
            <p className="mt-3 text-xs text-muted-foreground">
              {status
                ? status.configured
                  ? status.source === "app"
                    ? status.active
                      ? "Saved key · active"
                      : "Saved key · waiting for the agent to apply it"
                    : "Using the deployment key"
                  : "No key configured"
                : "Loading settings…"}
            </p>
            <form
              className="mt-6 space-y-3"
              onSubmit={(event: FormEvent) => {
                event.preventDefault();
                void submit("save");
              }}
            >
              <label className="text-sm font-medium" htmlFor="gateway-key">
                {status?.configured ? "Replace API key" : "API key"}
              </label>
              <Input
                id="gateway-key"
                type="password"
                autoComplete="off"
                spellCheck={false}
                value={apiKey}
                onChange={(event) => setApiKey(event.target.value)}
                placeholder="Paste your Vercel AI Gateway key"
                maxLength={2048}
                required
                className="h-11"
                aria-describedby="key-help"
              />
              <p id="key-help" className="text-xs leading-5 text-muted-foreground">
                Saving briefly reconnects the agent. Finish any running conversation first. The key
                persists across deployments.
              </p>
              <div className="flex flex-wrap gap-3 pt-2">
                <Button className="h-11" type="submit" disabled={Boolean(busy) || !apiKey.trim()}>
                  {busy === "save" && <Loader2Icon className="size-4 animate-spin" />}Save key
                </Button>
                <Button
                  className="h-11"
                  type="button"
                  variant="outline"
                  disabled={Boolean(busy) || !status?.configured || !status.active}
                  onClick={() => void submit("test")}
                >
                  {busy === "test" && <Loader2Icon className="size-4 animate-spin" />}Test
                  connection
                </Button>
              </div>
            </form>
            <p className="mt-3 text-xs leading-5 text-muted-foreground">
              The connection test sends a small model request and may use a few tokens from your
              Gateway balance.
            </p>
            {error && (
              <p role="alert" className="mt-4 text-sm text-destructive">
                {error}
              </p>
            )}
            {message && !error && (
              <p role="status" className="mt-4 text-sm">
                {message.startsWith("Key saved") && status?.active
                  ? "Key saved and active. You can start a new conversation."
                  : message}
              </p>
            )}
            <a
              className="mt-6 inline-block text-sm underline underline-offset-4"
              href="https://vercel.com/dashboard/ai/api-keys"
              target="_blank"
              rel="noreferrer"
            >
              Manage keys in Vercel
            </a>
          </section>
        )}
      </div>
    </div>
  );
}
