"use client";
import { useEffect, useState, type FormEvent } from "react";
import { LogOutIcon, ShieldCheckIcon, Loader2Icon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { clearComposerStorage } from "@/lib/chat/composer-draft";
import { clearDraftTexts } from "@/lib/chat/draft-text";
import { useChatShell } from "./chat-shell-context";
import { LoadError } from "./load-error";
import { ConfirmButton } from "./confirm-button";
import { SettingsShell } from "./settings-shell";

type Status = { username: string; requiresChange: boolean; changedAt: string | null };

export function SecuritySettings() {
  const { viewer } = useChatShell();
  const [status, setStatus] = useState<Status | null>(null);
  const [current, setCurrent] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [loadFailed, setLoadFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [signingOut, setSigningOut] = useState(false);
  const [signOutError, setSignOutError] = useState("");
  useEffect(() => {
    if (!viewer) return;
    const controller = new AbortController();
    void fetch("/api/settings/security", { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error("Could not load security settings.");
        setStatus(await response.json());
      })
      .catch(() => {
        if (!controller.signal.aborted) setLoadFailed(true);
      });
    return () => controller.abort();
  }, [viewer, attempt]);
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setNotice("");
    if (password !== confirm) {
      setError("The new passwords do not match.");
      return;
    }
    setBusy(true);
    try {
      const response = await fetch("/api/settings/security", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPassword: current, newPassword: password }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "Could not change the password.");
      setStatus(body);
      setCurrent("");
      setPassword("");
      setConfirm("");
      setNotice(
        "Password changed. Other sessions have been signed out. Your API keys and data are unchanged.",
      );
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not change the password.");
    } finally {
      setBusy(false);
    }
  }
  async function signOutEverywhere() {
    setSignOutError("");
    setSigningOut(true);
    try {
      const response = await fetch("/api/settings/security", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ signOutEverywhere: true }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "Could not sign out everywhere.");
      // Like Sign out: this device's drafts go too.
      await clearComposerStorage().catch(() => {});
      clearDraftTexts();
      // A full load, like Sign out: pages kept alive in the background would
      // otherwise still show private chats on Back.
      window.location.replace("/");
    } catch (cause) {
      setSignOutError(cause instanceof Error ? cause.message : "Could not sign out everywhere.");
      setSigningOut(false);
    }
  }
  return (
    <SettingsShell
      section="security"
      title="Security"
      description="Manage access to your private workspace."
    >
      {status?.requiresChange ? (
        <p role="alert" className="rounded-lg border p-4 text-sm leading-6">
          Replace the temporary or short password before adding API keys or private information.
        </p>
      ) : null}
      <form
        onSubmit={(event) => void save(event)}
        className="space-y-5 rounded-xl border p-5 sm:p-6"
      >
        <div className="flex items-center gap-2">
          <ShieldCheckIcon className="size-4" />
          <h2 className="text-sm font-medium">Change password</h2>
        </div>
        {status ? (
          <p className="text-sm text-muted-foreground">
            Username: {status.username}. Choose a unique passphrase with at least 16 characters.
          </p>
        ) : loadFailed ? (
          <LoadError
            className="mt-0"
            message="Couldn't load your account. Check the connection and try again."
            onRetry={() => {
              setLoadFailed(false);
              setAttempt((count) => count + 1);
            }}
          />
        ) : (
          <p className="text-sm text-muted-foreground" role="status">
            Loading security settings...
          </p>
        )}
        <input
          type="text"
          name="username"
          autoComplete="username"
          value={status?.username || ""}
          readOnly
          hidden
        />
        <div className="space-y-2">
          <Label htmlFor="security-current">Current password</Label>
          <Input
            id="security-current"
            type="password"
            autoComplete="current-password"
            required
            maxLength={256}
            value={current}
            onChange={(event) => setCurrent(event.target.value)}
            className="min-h-11"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="security-new">New password</Label>
          <Input
            id="security-new"
            type="password"
            autoComplete="new-password"
            required
            minLength={16}
            maxLength={256}
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            className="min-h-11"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="security-confirm">Confirm new password</Label>
          <Input
            id="security-confirm"
            type="password"
            autoComplete="new-password"
            required
            minLength={16}
            maxLength={256}
            value={confirm}
            onChange={(event) => setConfirm(event.target.value)}
            className="min-h-11"
          />
        </div>
        {error ? (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        ) : null}
        {notice ? (
          <p role="status" className="text-sm leading-6">
            {notice}
          </p>
        ) : null}
        <Button type="submit" disabled={busy || !status} className="min-h-11">
          {busy ? <Loader2Icon className="size-4 animate-spin" /> : null}
          {busy ? "Saving..." : "Change password"}
        </Button>
        <p className="text-xs leading-5 text-muted-foreground">
          Other sessions will need to sign in again. Stored keys, agents and conversations stay
          intact.
        </p>
      </form>
      <section className="space-y-4 rounded-xl border p-5 sm:p-6">
        <div className="flex items-center gap-2">
          <LogOutIcon className="size-4" />
          <h2 className="text-sm font-medium">Sessions</h2>
        </div>
        <p className="text-sm leading-6 text-muted-foreground">
          Signing out ends that session on the server. Sign out everywhere ends every session,
          including this one, on all your devices and anywhere a copy of a sign-in may be.
        </p>
        {signOutError ? (
          <p role="alert" className="text-sm text-destructive">
            {signOutError}
          </p>
        ) : null}
        <ConfirmButton
          variant="outline"
          className="min-h-11"
          disabled={signingOut || !status}
          title="Sign out everywhere?"
          description="Every browser and device signed in to Ægentica is signed out, including this one. Sign in again with your password. Stored keys, agents and conversations stay intact."
          confirmLabel="Sign out everywhere"
          onConfirm={() => void signOutEverywhere()}
        >
          {signingOut ? <Loader2Icon className="size-4 animate-spin" /> : null}
          {signingOut ? "Signing out..." : "Sign out everywhere"}
        </ConfirmButton>
      </section>
    </SettingsShell>
  );
}
