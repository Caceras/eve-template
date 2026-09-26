import { defineDynamic, defineOpenAPIConnection } from "eve/connections";
import { examplesEnabled } from "../lib/examples";

// A reference example, not a service for the operator: it stays out of
// production chats unless examples are switched on (see agent/lib/examples.ts).
export default defineDynamic({
  events: {
    "session.started": () =>
      examplesEnabled
        ? defineOpenAPIConnection({
            spec: "https://petstore3.swagger.io/api/v3/openapi.json",
            operations: { allow: ["getPetById", "findPetsByStatus"] },
            description:
              "Public OpenAPI reference connection used to demonstrate eve's first-class OpenAPI operation discovery.",
          })
        : null,
  },
});
