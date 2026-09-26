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
  | { connected: true; login: string | null; source: "app" | "env" };

// Pre-filled fine-grained token form: the permissions the GitHub tools use.
const NEW_TOKEN_URL =
  "https://github.com/settings/personal-access-tokens/new?name=%C3%86gentica&description=GitHub%20tools%20for%20%C3%86gentica&contents=write&pull_requests=write&issues=write&actions=write&metadata=read";

async function call(body?: Record<string, unknown>) {
  const response = await fetch("/api/settings/github", {
    method: body ? "POST" : "GET",
    cache: "no-store",
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || "Could not complete the request.");
  return data as Status;
}

export function GithubSettings() {
  const [status, setStatus] = useState<Status | null>(null);
  const [token, setToken] = useState("");
  const [busy, setBusy] = useState<"connect" | "disconnect" | null>(null);
  const [error, setError] = useState("");

  const refresh = useCallback(async () => {
    try {
      setStatus(await call());
    } catch (reason) {
      setError((reason as Error).message);
    }
  }, []);
  useEffect(() => void refresh(), [refresh]);

  async function run(action: "connect" | "disconnect") {
    setBusy(action);
    setError("");
    try {
      setStatus(await call(action === "connect" ? { action, token } : { action }));
      setToken("");
    } catch (reason) {
      setError((reason as Error).message);
    } finally {
      setBusy(null);
    }
  }

  return (
    <section aria-labelledby="github-title" className="rounded-lg border bg-card p-4 sm:p-5">
      <h2 id="github-title" className="flex items-center gap-2 font-medium">
        <BrandIcon brand="github" name="GitHub" />
        GitHub
        {status?.connected && <Badge variant="secondary">Connected</Badge>}
      </h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Let Ægentica read repositories, pull requests, issues and failing checks. Anything that
        changes GitHub, like a comment, branch or merge, asks you first.
      </p>

      {status === null ? (
        <p className="mt-4 text-sm text-muted-foreground">Loading…</p>
      ) : status.connected ? (
        <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2">
          <p className="text-sm">
            {status.login ? (
              <>
                Connected as{" "}
                <a
                  className="underline underline-offset-4"
                  href={`https://github.com/${status.login}`}
                  target="_blank"
                  rel="noreferrer"
                >
                  @{status.login}
                </a>
                .
              </>
            ) : (
              "Using the GITHUB_TOKEN from the server environment."
            )}
          </p>
          {status.source === "app" && (
            <ConfirmButton
              variant="ghost"
              className="-ml-2 h-11 px-2 text-muted-foreground pointer-fine:md:h-9"
              disabled={Boolean(busy)}
              title="Disconnect GitHub?"
              description="The saved token is deleted. Ægentica loses access to your repositories until you add a token again."
              confirmLabel="Disconnect"
              onConfirm={() => void run("disconnect")}
            >
              {busy === "disconnect" && <Loader2Icon className="size-4 animate-spin" />}
              Disconnect
            </ConfirmButton>
          )}
        </div>
      ) : (
        <>
          <ol className="mt-4 list-decimal space-y-1 pl-5 text-sm">
            <li>
              <a
                className="inline-flex items-center gap-1 underline underline-offset-4"
                href={NEW_TOKEN_URL}
                target="_blank"
                rel="noreferrer"
              >
                Create a GitHub token <ExternalLinkIcon className="size-3.5" />
              </a>{" "}
              (the permissions are filled in). Choose which repositories it may use.
            </li>
            <li>Copy the token and paste it here.</li>
          </ol>
          <form
            className="mt-4 flex flex-col gap-2 sm:flex-row"
            onSubmit={(event: FormEvent) => {
              event.preventDefault();
              void run("connect");
            }}
          >
            <label className="sr-only" htmlFor="github-token">
              GitHub token
            </label>
            <Input
              id="github-token"
              type="password"
              autoComplete="off"
              spellCheck={false}
              value={token}
              onChange={(event) => setToken(event.target.value)}
              placeholder="github_pat_…"
              maxLength={300}
              className="h-11 min-w-0 flex-1"
            />
            <Button className="h-11" type="submit" disabled={Boolean(busy) || !token.trim()}>
              {busy === "connect" && <Loader2Icon className="size-4 animate-spin" />}
              Connect GitHub
            </Button>
          </form>
        </>
      )}
      {status && !status.connected && status.unreadable && (
        <p className="mt-2 text-sm text-destructive">
          The saved token can’t be read because the server secret changed. Connect again.
        </p>
      )}
      {error && (
        <p role="alert" className="mt-2 text-sm text-destructive">
          {error}
        </p>
      )}
    </section>
  );
}
