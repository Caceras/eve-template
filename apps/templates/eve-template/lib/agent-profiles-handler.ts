import { deleteProfile, listProfiles, ProfileError, saveProfile } from "./agent-profiles";
import { handleOperatorSettings, json } from "./settings-api";
export function handleAgentProfiles(request: Request) {
  return handleOperatorSettings(request, {
    maxBytes: 65_536,
    read: async () => json({ profiles: await listProfiles() }),
    write: async (body) => {
      try {
        if (body.action === "save")
          return json({
            profile: await saveProfile(
              body.profile,
              typeof body.id === "string" ? body.id : undefined,
              typeof body.version === "number" ? body.version : undefined,
            ),
          });
        if (
          body.action === "delete" &&
          typeof body.id === "string" &&
          typeof body.version === "number"
        ) {
          await deleteProfile(body.id, body.version);
          return json({ deleted: true });
        }
        return json({ error: "Unknown agent action." }, 400);
      } catch (error) {
        if (error instanceof ProfileError) return json({ error: error.message }, error.status);
        throw error;
      }
    },
  });
}
