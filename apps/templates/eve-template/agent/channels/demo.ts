import { defineChannel, GET, POST } from "eve/channels";

function authorized(request: Request) {
  const expected = process.env.EVE_TEMPLATE_DEMO_CHANNEL_TOKEN;
  if (!expected) return false;
  return request.headers.get("authorization") === `Bearer ${expected}`;
}

export default defineChannel({
  routes: [
    GET("/eve-template/demo", async () =>
      Response.json({
        ok: true,
        channel: "demo",
        note: "Set EVE_TEMPLATE_DEMO_CHANNEL_TOKEN to enable message dispatch.",
      }),
    ),
    POST("/eve-template/demo/:threadId/messages", async (request, { from, params }) => {
      if (!authorized(request)) {
        return Response.json({ error: "unauthorized" }, { status: 401 });
      }
      const body = (await request.json()) as { message?: unknown };
      if (typeof body.message !== "string" || body.message.trim().length === 0) {
        return Response.json({ error: "message_required" }, { status: 400 });
      }
      const session = await from(params.threadId).send(body.message, { auth: null });
      return Response.json({ ok: true, sessionId: session.id }, { status: 202 });
    }),
  ],
});
