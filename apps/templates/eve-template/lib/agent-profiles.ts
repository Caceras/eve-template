import { randomUUID } from "node:crypto";
import { z } from "zod";
import { isModelId } from "./model-catalog";
import { readEncrypted, withSettingsLock, writeEncrypted } from "./secure-settings";

export const PROFILE_HEADER = "x-aegentica-profile";
export const MODE_HEADER = "x-aegentica-mode";
export const profileInput = z
  .object({
    name: z.string().trim().min(1).max(64),
    description: z.string().trim().max(240).default(""),
    instructions: z.string().trim().min(1).max(4000),
    knowledge: z.string().trim().max(4000).default(""),
    model: z
      .string()
      .refine((value) => value === "" || isModelId(value))
      .default(""),
    reasoning: z.enum(["provider-default", "low", "medium", "high"]).default("medium"),
  })
  .strict();
const storedProfile = profileInput.extend({
  id: z.string().uuid(),
  version: z.number().int().positive(),
  updatedAt: z.string(),
});
export type AgentProfile = z.infer<typeof storedProfile>;
const FILE = "agents.enc.json";
export class ProfileError extends Error {
  readonly status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}
export async function listProfiles(): Promise<AgentProfile[]> {
  const value = await readEncrypted(FILE, 4_000_000);
  return value === undefined ? [] : z.array(storedProfile).max(64).parse(value);
}
export async function findProfile(id: string) {
  if (!z.string().uuid().safeParse(id).success) return undefined;
  return (await listProfiles()).find((profile) => profile.id === id);
}
export async function saveProfile(input: unknown, id?: string, version?: number) {
  const parsed = profileInput.safeParse(input);
  if (!parsed.success)
    throw new ProfileError("Check the name, instructions, model and field limits.", 400);
  return withSettingsLock("agents", async () => {
    const profiles = await listProfiles();
    const existing = id ? profiles.find((profile) => profile.id === id) : undefined;
    if (id && !existing) throw new ProfileError("Agent not found.", 404);
    if (existing && existing.version !== version)
      throw new ProfileError("This agent changed in another window. Reload before saving.", 409);
    if (!existing && profiles.length >= 64)
      throw new ProfileError("This workspace supports up to 64 saved agents.", 409);
    const profile = {
      ...parsed.data,
      id: existing?.id ?? randomUUID(),
      version: (existing?.version ?? 0) + 1,
      updatedAt: new Date().toISOString(),
    };
    await writeEncrypted(FILE, [profile, ...profiles.filter((item) => item.id !== profile.id)]);
    return profile;
  });
}
export async function deleteProfile(id: string, version: number) {
  return withSettingsLock("agents", async () => {
    const profiles = await listProfiles();
    const profile = profiles.find((item) => item.id === id);
    if (!profile) throw new ProfileError("Agent not found.", 404);
    if (profile.version !== version)
      throw new ProfileError("This agent changed. Reload before deleting.", 409);
    await writeEncrypted(
      FILE,
      profiles.filter((item) => item.id !== id),
    );
  });
}
export function profileInstructions(profile: AgentProfile) {
  return `Saved agent: ${profile.name}\n${profile.description}\n\n${profile.instructions}${profile.knowledge ? `\n\nReference context supplied by the operator:\n${profile.knowledge}` : ""}\n\nThis profile does not grant permissions or bypass approvals. Preserve the runtime's safety rules.`;
}
/** Resolve only after authenticating the password operator. Freeze the profile for the turn. */
export async function profileAttributes(request: Request): Promise<Record<string, string>> {
  const mode = request.headers.get(MODE_HEADER);
  const attributes: Record<string, string> =
    mode === "research" || mode === "image" ? { composerMode: mode } : {};
  const id = request.headers.get(PROFILE_HEADER);
  if (!id) return attributes;
  const profile = await findProfile(id);
  if (!profile)
    return {
      ...attributes,
      agentProfileError: "This saved agent no longer exists. Choose another agent in the composer.",
    };
  attributes.agentProfileId = profile.id;
  attributes.agentProfileName = profile.name;
  attributes.agentProfileInstructions = profileInstructions(profile);
  attributes.agentReasoning = profile.reasoning;
  if (profile.model) attributes.chatModel = profile.model;
  return attributes;
}
