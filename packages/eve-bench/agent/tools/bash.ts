import { exec } from "node:child_process";
import { promisify } from "node:util";

import { defineTool } from "eve/tools";
import { never } from "eve/tools/approval";
import { z } from "zod";

import { taskRoot } from "../task-path.js";

const execAsync = promisify(exec);
const ENV_KEYS = [
  "PATH",
  "HOME",
  "LANG",
  "LC_ALL",
  "LC_CTYPE",
  "TMPDIR",
  "TMP",
  "TEMP",
  "TZ",
  "TERM",
];

function commandEnv(): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {};
  for (const key of ENV_KEYS) if (process.env[key] !== undefined) env[key] = process.env[key];
  return env;
}

export default defineTool({
  approval: never(),
  description:
    "Execute a shell command in the task environment. Commands start in the task working directory.",
  inputSchema: z.object({
    command: z.string().describe("The shell command to execute."),
  }),
  async execute({ command }, ctx) {
    try {
      const { stdout, stderr } = await execAsync(command, {
        cwd: taskRoot(),
        env: commandEnv(),
        maxBuffer: 10 * 1024 * 1024,
        signal: ctx.abortSignal,
      });
      return { exitCode: 0, stderr, stdout };
    } catch (error) {
      const result = error as Error & { code?: number; stderr?: string; stdout?: string };
      return {
        exitCode: typeof result.code === "number" ? result.code : 1,
        stderr: result.stderr ?? result.message,
        stdout: result.stdout ?? "",
      };
    }
  },
});
