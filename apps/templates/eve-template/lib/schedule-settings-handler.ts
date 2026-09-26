import {
  ScheduleError,
  type TaskInput,
  createTask,
  deleteTask,
  listTasks,
  runTaskNow,
  updateTask,
} from "./schedule-store";
import { handleOperatorSettings, json } from "./settings-api";

const text = (value: unknown) => (typeof value === "string" ? value : undefined);
const nullableText = (value: unknown) => (value === null ? null : text(value));

function taskInput(body: Record<string, unknown>): Partial<TaskInput> {
  return {
    title: text(body.title),
    prompt: text(body.prompt),
    skill: nullableText(body.skill),
    cron: nullableText(body.cron),
    runAt: nullableText(body.runAt),
    timezone: text(body.timezone),
  };
}

export function handleScheduleSettings(request: Request) {
  return handleOperatorSettings(request, {
    read: async () => json({ tasks: await listTasks() }),
    async write(body) {
      try {
        if (body.action === "create") {
          const input = taskInput(body);
          await createTask({ ...input, title: input.title ?? "", prompt: input.prompt ?? "" });
          return json({ tasks: await listTasks() });
        }
        if (typeof body.id !== "string" || body.id.length > 64)
          return json({ error: "Invalid request." }, 400);
        if (body.action === "update") await updateTask(body.id, taskInput(body));
        else if (body.action === "pause") await updateTask(body.id, { enabled: false });
        else if (body.action === "resume") await updateTask(body.id, { enabled: true });
        else if (body.action === "run") await runTaskNow(body.id);
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
