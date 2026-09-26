/**
 * Touch-first devices raise the on-screen keyboard whenever a text field gets
 * focus, so nothing focuses a field for them until the user taps it.
 */
export function focusOpensKeyboard() {
  return (
    typeof window !== "undefined" &&
    window.matchMedia("(hover: none) and (pointer: coarse)").matches
  );
}
