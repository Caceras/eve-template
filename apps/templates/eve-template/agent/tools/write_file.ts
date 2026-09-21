import { defineTool } from "eve/tools";
import writeFile from "eve/tools/write_file";
import { always } from "eve/tools/approval";

// Demonstrates how an application can keep Eve's built-in tool implementation
// while replacing only its policy at the canonical filesystem slot.
export default defineTool({
  ...writeFile,
  approval: always(),
});
