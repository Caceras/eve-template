import { defineDynamic, defineSkill } from "eve/skills";

export default defineDynamic({
  events: {
    "session.started": (_event, ctx) => {
      const note = ctx.session.auth.current?.attributes?.eveTemplateSkill;
      return typeof note === "string" && note.trim().length > 0
        ? defineSkill({
            description: "Caller-provided session reference.",
            markdown: `# Caller-provided reference\n\n${note}`,
          })
        : null;
    },
  },
});
