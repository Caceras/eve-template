"use client";

import { code } from "@streamdown/code";
import { useEffect, useState } from "react";
import type { PluginConfig } from "streamdown";

type OnDemand = "cjk" | "math" | "mermaid";

// Math (KaTeX), diagrams (mermaid) and CJK line breaking are heavy and rare, so
// a reply loads each one the first time its text needs it; code highlighting,
// which most replies use, stays in the bundle.
const loaders: { readonly [key in OnDemand]: () => Promise<NonNullable<PluginConfig[key]>> } = {
  cjk: () => import("@streamdown/cjk").then((module) => module.cjk),
  math: () => import("./markdown-math").then((module) => module.math),
  mermaid: () => import("@streamdown/mermaid").then((module) => module.mermaid),
};

// The math plugin reads only $$…$$ (single-dollar math is off by default).
const needs: { readonly [key in OnDemand]: RegExp } = {
  cjk: /[　-ヿ㐀-䶿一-鿿가-힯＀-￯]/,
  math: /\$\$/,
  mermaid: /(?:```|~~~)\s*mermaid/i,
};

/** Which on-demand plugins this markdown text needs. */
export function neededPlugins(text: string): OnDemand[] {
  return (Object.keys(needs) as OnDemand[]).filter((key) => needs[key].test(text));
}

// Shared by every message on the page: a plugin loads once.
let loaded: PluginConfig = { code };
const pending = new Map<OnDemand, Promise<void>>();

function load(key: OnDemand) {
  let promise = pending.get(key);
  if (!promise) {
    promise = loaders[key]()
      .then((plugin) => {
        loaded = { ...loaded, [key]: plugin };
      })
      .catch(() => {
        // An unloadable chunk (a deploy replaced it) leaves the text as plain markdown.
        pending.delete(key);
      });
    pending.set(key, promise);
  }
  return promise;
}

/** Streamdown plugins for this text: code always, the rest once needed and loaded. */
export function useMarkdownPlugins(text: unknown): PluginConfig {
  const missing =
    typeof text === "string"
      ? neededPlugins(text)
          .filter((key) => !loaded[key])
          .join(",")
      : "";
  // Re-render once the missing plugins arrive; `loaded` then includes them.
  const [, setLoads] = useState(0);
  useEffect(() => {
    if (!missing) return;
    let active = true;
    void Promise.all(missing.split(",").map((key) => load(key as OnDemand))).then(() => {
      if (active) setLoads((count) => count + 1);
    });
    return () => {
      active = false;
    };
  }, [missing]);
  return loaded;
}
