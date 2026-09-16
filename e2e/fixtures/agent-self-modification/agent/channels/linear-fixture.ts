import { defineChannel, GET } from "eve/channels";

export default defineChannel({
  routes: [
    GET("/eval-linear/issues", async () =>
      Response.json({ issues: [{ id: "EVE-123", title: "Refresh installed connections" }] }),
    ),
  ],
});
