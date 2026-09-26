// The device's own share sheet (Android, iOS, macOS, Windows) instead of a
// web-page copy button, with copying as the fallback where there is none.

export function canShare() {
  return typeof navigator !== "undefined" && typeof navigator.share === "function";
}

/** Phones share through the sheet; desktops keep one-click copy. */
export function prefersShareSheet() {
  return canShare() && matchMedia("(pointer: coarse)").matches;
}

export async function shareOrCopy(data: {
  readonly text?: string;
  readonly title?: string;
  readonly url?: string;
}): Promise<"shared" | "copied" | "cancelled"> {
  if (canShare()) {
    try {
      await navigator.share(data);
      return "shared";
    } catch (error) {
      // Dismissing the sheet is a choice, not a failure.
      if (error instanceof DOMException && error.name === "AbortError") return "cancelled";
    }
  }
  await navigator.clipboard.writeText(data.url ?? data.text ?? "");
  return "copied";
}

/** An image as a file for the share sheet, or null where files cannot be shared. */
export async function shareableImage(url: string, name: string): Promise<File | null> {
  if (!canShare() || typeof navigator.canShare !== "function") return null;
  const response = await fetch(url);
  if (!response.ok) return null;
  const blob = await response.blob();
  const file = new File([blob], name, { type: blob.type || "image/png" });
  return navigator.canShare({ files: [file] }) ? file : null;
}
