"use client";
import { useEffect, useState, type FormEvent } from "react";
import { ShieldCheckIcon, Loader2Icon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useChatShell } from "./chat-shell-context";
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
  useEffect(() => {
    if (!viewer) return;
    const controller = new AbortController();
    void fetch("/api/settings/security", { signal: controller.signal })
      .then(async (response) => {
        const body = await response.json();
        if (!response.ok) throw new Error(body.error || "Could not load security settings.");
        setStatus(body);
      })
      .catch((cause: unknown) => {
        if (!controller.signal.aborted)
          setError(cause instanceof Error ? cause.message : "Could not load security settings.");
      });
    return () => controller.abort();
  }, [viewer]);
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
        ) : (
          <p className="text-sm text-muted-foreground">Loading security settings...</p>
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
    </SettingsShell>
  );
}
