import { defineTool } from "eve/tools";
import { z } from "zod";

// The runtime tool name comes from the filename, so the model sees this as
// `get_weather`. Tool filenames must be snake_case ASCII.
export default defineTool({
  description:
    "Sample weather for demonstrations: always returns the same fixed data, never a real forecast. Use web search for real weather.",
  inputSchema: z.object({ city: z.string().min(1) }),
  async execute({ city }) {
    return { city, condition: "Sunny", temperatureF: 72 };
  },
});
