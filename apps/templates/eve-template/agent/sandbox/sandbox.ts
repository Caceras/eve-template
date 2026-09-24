import { defineSandbox } from "eve/sandbox";
import { JustBashSandbox } from "eve/sandbox/just-bash";

// This installation has no Docker socket or VM runtime. Select the supported
// lightweight backend explicitly instead of depending on host detection.
export const environment = JustBashSandbox.environment();
export default defineSandbox(() => environment.open());
