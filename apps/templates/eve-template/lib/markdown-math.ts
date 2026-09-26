// Loaded only when a reply contains $$ math (lib/markdown-plugins.ts), together
// with the KaTeX styles the plugin needs: without them a formula renders twice,
// once as MathML and once as unstyled HTML.
import "katex/dist/katex.min.css";

export { math } from "@streamdown/math";
