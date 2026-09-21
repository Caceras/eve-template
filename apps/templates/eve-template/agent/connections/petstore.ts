import { defineOpenAPIConnection } from "eve/connections";

export default defineOpenAPIConnection({
  spec: "https://petstore3.swagger.io/api/v3/openapi.json",
  operations: { allow: ["getPetById", "findPetsByStatus"] },
  description:
    "Public OpenAPI reference connection used to demonstrate Eve's first-class OpenAPI operation discovery.",
});
