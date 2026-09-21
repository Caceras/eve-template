import { defineDynamic, defineOpenAPIConnection } from "eve/connections";

function isEnabled(value: string | readonly string[] | undefined) {
  return value === "true" || (Array.isArray(value) && value.includes("true"));
}

export default defineDynamic({
  events: {
    "session.started": (_event, ctx) =>
      isEnabled(ctx.session.auth.current?.attributes.eveTemplateDynamicConnection)
        ? defineOpenAPIConnection({
            spec: "https://petstore3.swagger.io/api/v3/openapi.json",
            operations: { allow: ["getPetById", "findPetsByStatus"] },
            description:
              "Caller-gated OpenAPI connection used to demonstrate Eve dynamic connection composition.",
          })
        : null,
  },
});
