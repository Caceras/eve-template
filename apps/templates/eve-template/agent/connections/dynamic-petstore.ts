import { defineDynamic, defineOpenAPIConnection } from "eve/connections";

export default defineDynamic({
  events: {
    "session.started": (_event, ctx) =>
      ctx.session.auth.current?.attributes.eveTemplateDynamicConnection === true
        ? defineOpenAPIConnection({
            spec: "https://petstore3.swagger.io/api/v3/openapi.json",
            operations: { allow: ["getPetById", "findPetsByStatus"] },
            description:
              "Caller-gated OpenAPI connection used to demonstrate Eve dynamic connection composition.",
          })
        : null,
  },
});
