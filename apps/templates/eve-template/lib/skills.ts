/**
 * Skills are files under `agent/skills/`; eve compiles them and reports them at
 * `/eve/v1/info`. Nothing here names a skill: the composer and Tasks list
 * whatever the runtime reports, and the chosen name travels in one header.
 */
export const SKILL_HEADER = "x-aegentica-skill";

export type RuntimeSkill = { name: string; description: string };

const SKILL_NAME = /^[a-z0-9][a-z0-9_-]{0,63}$/i;
export const isSkillName = (value: unknown): value is string =>
  typeof value === "string" && SKILL_NAME.test(value);

/** `deep-research` → "Deep research": the label comes from the file path. */
export function skillLabel(name: string) {
  const words = name.replace(/[-_]+/g, " ").trim();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

/**
 * What a skill does, for people. A skill's description is written for the
 * model ("Use when the user asks for a daily summary, …"), and the runtime
 * reports no other summary, so this drops that lead-in and keeps the first
 * sentence: "A daily summary, morning briefing, …".
 */
export function skillSummary(description: string) {
  const text = description
    .trim()
    .replace(
      /^use (?:this (?:skill )?)?(?:only )?when (?:the user |someone |a user )?(?:asks? (?:you )?(?:for |to )?|asked (?:for |to )|wants? (?:help (?:with )?)?(?:to )?|needs? (?:to )?)?/i,
      "",
    );
  const sentence = text.match(/^.*?[.!?](?=\s|$)/)?.[0] ?? text;
  return sentence.charAt(0).toUpperCase() + sentence.slice(1);
}

export function skillAttribute(request: Request): Record<string, string> {
  const skill = request.headers.get(SKILL_HEADER);
  return isSkillName(skill) ? { composerSkill: skill } : {};
}

/**
 * Reads the compiled skills from the runtime. Dynamic skills resolve per
 * session and report no name here, so only static skills can be chosen.
 */
export async function loadRuntimeSkills(): Promise<RuntimeSkill[]> {
  const response = await fetch("/eve/v1/info", { cache: "no-store" });
  if (!response.ok) throw new Error("Could not load skills. Retry in a moment.");
  const info = (await response.json()) as { skills?: { static?: unknown } };
  const entries = Array.isArray(info.skills?.static) ? info.skills.static : [];
  const skills = new Map<string, RuntimeSkill>();
  for (const entry of entries) {
    const name = (entry as { name?: unknown })?.name;
    if (!isSkillName(name)) continue;
    const description = (entry as { description?: unknown }).description;
    skills.set(name, { name, description: typeof description === "string" ? description : "" });
  }
  return [...skills.values()].sort((a, b) => a.name.localeCompare(b.name));
}
