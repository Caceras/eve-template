import { resolveGatewayChatModel } from "./gateway-model-catalog";
import { gatewayStatus, readGatewayCredential, saveGatewayCredential } from "./gateway-settings";
import { getPasswordSessionFromHeaders, hasSameOriginRequest } from "./password-auth";
let windowStart = 0;
let attempts = 0;
const json = (body: unknown, status = 200) =>
  Response.json(body, { status, headers: { "Cache-Control": "no-store" } });

export async function handleGatewaySettings(request: Request) {
  if (!getPasswordSessionFromHeaders(request.headers))
    return json({ error: "Sign in to manage your API key." }, 401);
  try {
    if (request.method === "GET") return json(await gatewayStatus());
    if (!hasSameOriginRequest(request)) return json({ error: "Invalid request origin." }, 403);
    if (Date.now() - windowStart > 60_000) {
      windowStart = Date.now();
      attempts = 0;
    }
    if (++attempts > 10) return json({ error: "Too many requests. Try again in a minute." }, 429);
    const reader = request.body?.getReader();
    let size = 0;
    const chunks: Uint8Array[] = [];
    if (reader)
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        size += value.byteLength;
        if (size > 4096) {
          await reader.cancel();
          return json({ error: "Request too large." }, 413);
        }
        chunks.push(value);
      }
    let body;
    try {
      body = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    } catch {
      return json({ error: "Invalid request." }, 400);
    }
    if (body?.action === "save") {
      const key = typeof body.apiKey === "string" ? body.apiKey.trim() : "";
      if (key.length < 20 || key.length > 2048 || /[^\x21-\x7e]/.test(key))
        return json({ error: "Enter a valid AI Gateway API key." }, 400);
      await saveGatewayCredential(key);
      return json({ ok: true, ...(await gatewayStatus()) });
    }
    if (body?.action === "test") {
      const { apiKey } = await readGatewayCredential();
      if (!apiKey) return json({ error: "Save an API key first." }, 400);
      const response = await fetch("https://ai-gateway.vercel.sh/v1/chat/completions", {
        method: "POST",
        redirect: "error",
        signal: AbortSignal.timeout(30_000),
        headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model: await resolveGatewayChatModel(body.model),
          messages: [{ role: "user", content: "Reply with OK." }],
          max_tokens: 32,
        }),
      });
      await response.body?.cancel();
      if (response.ok)
        return json({
          ok: true,
          message: "Connection verified. Your model accepted a test request.",
        });
      const error =
        response.status === 401 || response.status === 403
          ? "Vercel rejected this key. Check the key and its Vercel team access."
          : response.status === 402
            ? "Vercel requires billing or credits. Review your AI Gateway balance."
            : response.status === 429
              ? "The key is rate limited or has reached its quota. Try again later."
              : "The model request failed. Check model access and your Vercel AI Gateway account.";
      return json({ error }, 422);
    }
    return json({ error: "Invalid action." }, 400);
  } catch {
    return json(
      { error: "Could not complete the request. Try again or check your server configuration." },
      503,
    );
  }
}
