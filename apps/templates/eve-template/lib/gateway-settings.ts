import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { mkdir, readFile, rename, stat, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

function settingsDirectory() {
  return (
    process.env.EVE_SETTINGS_DIR ||
    join(
      process.env.EVE_MEMORY_DIR ? dirname(process.env.EVE_MEMORY_DIR) : ".eve/.workflow-data",
      "settings",
    )
  );
}
function encryptionKey() {
  const secret = process.env.EVE_SESSION_SECRET?.trim();
  if (!secret) throw new Error("Settings encryption is not configured.");
  return createHash("sha256")
    .update("aegentica/gateway/v1\0" + secret)
    .digest();
}
export type GatewayCredential = {
  apiKey: string;
  revision: string;
  updatedAt: string | null;
  source: "app" | "environment";
};
export async function readGatewayCredential(): Promise<GatewayCredential> {
  const file = join(settingsDirectory(), "gateway.enc");
  let raw: string;
  try {
    if ((await stat(file)).size > 8192) throw new Error("Invalid settings file.");
    raw = await readFile(file, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    return {
      apiKey: process.env.AI_GATEWAY_API_KEY?.trim() || "",
      revision: "environment",
      updatedAt: null,
      source: "environment",
    };
  }
  const stored = JSON.parse(raw);
  const decipher = createDecipheriv(
    "aes-256-gcm",
    encryptionKey(),
    Buffer.from(stored.iv, "base64"),
  );
  decipher.setAuthTag(Buffer.from(stored.tag, "base64"));
  const value = JSON.parse(
    Buffer.concat([decipher.update(Buffer.from(stored.data, "base64")), decipher.final()]).toString(
      "utf8",
    ),
  );
  if (typeof value.apiKey !== "string" || typeof value.updatedAt !== "string")
    throw new Error("Invalid settings file.");
  return { ...value, revision: createHash("sha256").update(raw).digest("hex"), source: "app" };
}
async function atomicWrite(name: string, data: string) {
  const directory = settingsDirectory();
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const temp = join(directory, `${name}.${randomBytes(8).toString("hex")}.tmp`);
  await writeFile(temp, data, { mode: 0o600 });
  await rename(temp, join(directory, name));
}
export async function saveGatewayCredential(apiKey: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const data = Buffer.concat([
    cipher.update(JSON.stringify({ apiKey, updatedAt: new Date().toISOString() }), "utf8"),
    cipher.final(),
  ]);
  await atomicWrite(
    "gateway.enc",
    JSON.stringify({
      iv: iv.toString("base64"),
      tag: cipher.getAuthTag().toString("base64"),
      data: data.toString("base64"),
    }),
  );
}
export async function markGatewayApplied(revision: string) {
  await atomicWrite("gateway-applied.json", JSON.stringify({ revision }));
}
export async function gatewayStatus() {
  const credential = await readGatewayCredential();
  let applied: string | undefined;
  try {
    applied = JSON.parse(
      await readFile(join(settingsDirectory(), "gateway-applied.json"), "utf8"),
    ).revision;
  } catch {
    /* The runtime has not applied a key yet. */
  }
  return {
    configured: Boolean(credential.apiKey),
    source: credential.source,
    updatedAt: credential.updatedAt,
    active: applied === credential.revision,
  };
}
