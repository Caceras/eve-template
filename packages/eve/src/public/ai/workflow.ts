export function evaluate(): never {
  throw new Error(
    'evaluate() from "eve/ai" is unavailable in a workflow body. Call it from a "use step" function.',
  );
}
