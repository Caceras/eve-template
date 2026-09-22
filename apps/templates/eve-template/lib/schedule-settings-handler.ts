import { ScheduleError, deleteTask, listTasks, updateTask } from "./schedule-store";
import { handleOperatorSettings, json } from "./settings-api";

export function handleScheduleSettings(request: Request) {
  return handleOperatorSettings(request, {
    read: async () => json({ tasks: await listTasks() }),
    async write(body) {
      if (typeof body.id !== "string" || body.id.length > 64)
        return json({ error: "Invalid request." }, 400);
      try {
        if (body.action === "pause") await updateTask(body.id, { enabled: false });
        else if (body.action === "resume") await updateTask(body.id, { enabled: true });
        else if (body.action === "delete") await deleteTask(body.id);
        else return json({ error: "Invalid action." }, 400);
      } catch (error) {
        if (error instanceof ScheduleError) return json({ error: error.message }, 400);
        throw error;
      }
      return json({ tasks: await listTasks() });
    },
  });
}
