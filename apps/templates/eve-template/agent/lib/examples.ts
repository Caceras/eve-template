/**
 * Reference examples (demo tools, the public Petstore API) show eve's patterns
 * during development and in evals, but in production they only add noise to the
 * model's tool list. AEGENTICA_EXAMPLES=1 turns them on anywhere; =0 turns them off.
 */
export const examplesEnabled =
  process.env.AEGENTICA_EXAMPLES === "1" ||
  (process.env.AEGENTICA_EXAMPLES !== "0" && process.env.NODE_ENV !== "production");
