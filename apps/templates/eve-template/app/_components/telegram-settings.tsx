"use client";
import { BrandIcon } from "@/components/brand-icon";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import { ExternalLinkIcon, Loader2Icon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ConfirmButton } from "./confirm-button";

type Status =
  | { connected: false; unreadable?: true }
  | {
      connected: true;
      botUsername: string;
      linked: boolean;
      ownerUsername: string | null;
      pairingCode: string | null;
    };
type Action = "connect" | "pair" | "unlink" | "disconnect" | "test";

async function call(body?: Record<string, unknown>) {
  const response = await fetch("/api/settings/telegram", {
    method: body ? "POST" : "GET",
    cache: "no-store",
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || "Could not complete the request.");
  return data;
}

export function TelegramSettings() {
  const [status, setStatus] = useState<Status | null>(null);
  const [token, setToken] = useState("");
  const [busy, setBusy] = useState<Action | null>(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const refresh = useCallback(async () => {
    try {
      setStatus(await call());
    } catch (reason) {
      setError((reason as Error).message);
    }
  }, []);
  useEffect(() => void refresh(), [refresh]);

  // While a link code is open, watch for the Telegram side to complete pairing.
  const waiting = status?.connected && !status.linked && Boolean(status.pairingCode);
  useEffect(() => {
    if (!waiting) return;
    const timer = setInterval(() => void refresh(), 3000);
    return () => clearInterval(timer);
  }, [waiting, refresh]);

  async function run(action: Action) {
    setBusy(action);
    setError("");
    setMessage("");
    try {
      const data = await call(action === "connect" ? { action, botToken: token } : { action });
      if (action === "test") setMessage(data.message);
      else setStatus(data);
      if (action === "connect") setToken("");
    } catch (reason) {
      setError((reason as Error).message);
    } finally {
      setBusy(null);
    }
  }

  const spinner = (action: Action) =>
    busy === action && <Loader2Icon className="size-4 animate-spin" />;

  return (
    <section aria-labelledby="telegram-title" className="rounded-lg border bg-card p-4 sm:p-5">
      <h2 id="telegram-title" className="flex items-center gap-2 font-medium">
        <BrandIcon brand="telegram" name="Telegram" />
        Telegram
        {status?.connected && status.linked && <Badge variant="secondary">Linked</Badge>}
      </h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Chat with Ægentica from Telegram and get your reminders there. Only your linked account can
        use the bot, and it shares memory with this app.
      </p>

      {status === null ? (
        <p className="mt-4 text-sm text-muted-foreground">Loading…</p>
      ) : !status.connected ? (
        <>
          <ol className="mt-4 list-decimal space-y-1 pl-5 text-sm">
            <li>
              In Telegram, open{" "}
              <a
                className="underline underline-offset-4"
                href="https://t.me/BotFather"
                target="_blank"
                rel="noreferrer"
              >
                @BotFather
              </a>{" "}
              and send <code>/newbot</code>.
            </li>
            <li>Pick a name, then copy the token it gives you.</li>
            <li>Paste it here. Ægentica registers the bot for you.</li>
          </ol>
          <form
            className="mt-4 flex flex-col gap-2 sm:flex-row"
            onSubmit={(event: FormEvent) => {
              event.preventDefault();
              void run("connect");
            }}
          >
            <label className="sr-only" htmlFor="telegram-token">
              Telegram bot token
            </label>
            <Input
              id="telegram-token"
              type="password"
              autoComplete="off"
              spellCheck={false}
              value={token}
              onChange={(event) => setToken(event.target.value)}
              placeholder="123456789:AA…"
              maxLength={100}
              className="h-11 min-w-0 flex-1"
            />
            <Button className="h-11" type="submit" disabled={Boolean(busy) || !token.trim()}>
              {spinner("connect")}
              Connect bot
            </Button>
          </form>
        </>
      ) : (
        <>
          <p className="mt-4 text-sm">
            Bot{" "}
            <a
              className="underline underline-offset-4"
              href={`https://t.me/${status.botUsername}`}
              target="_blank"
              rel="noreferrer"
            >
              @{status.botUsername}
            </a>{" "}
            {status.linked
              ? `is linked to ${status.ownerUsername ? `@${status.ownerUsername}` : "your account"}.`
              : "is connected. Link your Telegram account to start."}
          </p>
          {!status.linked &&
            (status.pairingCode ? (
              <div className="mt-3 rounded-md bg-muted p-3 text-sm">
                <a
                  className="inline-flex min-h-11 items-center gap-1 font-medium underline underline-offset-4"
                  href={`https://t.me/${status.botUsername}?start=link${status.pairingCode}`}
                  target="_blank"
                  rel="noreferrer"
                >
                  Open Telegram and tap Start <ExternalLinkIcon className="size-3.5" />
                </a>
                <p className="mt-1 text-muted-foreground">
                  Or send <code>/link {status.pairingCode}</code> to the bot. The code works once
                  and expires in 10 minutes. This page updates when you are linked.
                </p>
              </div>
            ) : (
              <Button
                className="mt-3 h-11"
                disabled={Boolean(busy)}
                onClick={() => void run("pair")}
              >
                {spinner("pair")}
                Link my Telegram
              </Button>
            ))}
          <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2">
            {status.linked && (
              <Button
                variant="ghost"
                className="-ml-2 h-11 px-2 pointer-fine:md:h-9"
                disabled={Boolean(busy)}
                onClick={() => void run("test")}
              >
                {spinner("test")}
                Send test message
              </Button>
            )}
            {status.linked && (
              <ConfirmButton
                variant="ghost"
                className="-ml-2 h-11 px-2 text-muted-foreground pointer-fine:md:h-9"
                disabled={Boolean(busy)}
                title="Unlink your Telegram account?"
                description="The bot stops answering you until you pair it again with a new code."
                confirmLabel="Unlink"
                onConfirm={() => void run("unlink")}
              >
                {spinner("unlink")}
                Unlink account
              </ConfirmButton>
            )}
            <ConfirmButton
              variant="ghost"
              className="-ml-2 h-11 px-2 text-muted-foreground pointer-fine:md:h-9"
              disabled={Boolean(busy)}
              title="Disconnect the Telegram bot?"
              description="The bot token and webhook are removed. To use Telegram again, connect the bot and pair your account again."
              confirmLabel="Disconnect"
              onConfirm={() => void run("disconnect")}
            >
              {spinner("disconnect")}
              Disconnect bot
            </ConfirmButton>
          </div>
        </>
      )}
      {status && !status.connected && status.unreadable && (
        <p className="mt-2 text-sm text-destructive">
          The saved bot can’t be read because the server secret changed. Connect it again.
        </p>
      )}
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
