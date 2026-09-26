import { BRAND_KEYS, REGISTRY_BRANDS } from "./brand-icons.generated";

// Who a model, provider, account or service belongs to, for its name and its
// logo (components/brand-icon.tsx). Logos come from public/brands/, written by
// scripts/sync-brand-icons.mjs.

/** Makers as the model catalogs name them: display name and logo key. */
const MAKERS: Record<string, readonly [label: string, brand?: string]> = {
  "aion-labs": ["AionLabs", "aionlabs"],
  alibaba: ["Alibaba", "alibaba"],
  amazon: ["Amazon", "amazon"],
  anthropic: ["Anthropic", "anthropic"],
  "arcee-ai": ["Arcee AI", "arcee"],
  bytedance: ["ByteDance", "bytedance"],
  "bytedance-seed": ["ByteDance Seed", "bytedance"],
  cohere: ["Cohere", "cohere"],
  deepseek: ["DeepSeek", "deepseek"],
  "dots-studio": ["dots.studio", "dotsstudio"],
  google: ["Google", "google"],
  "ibm-granite": ["IBM", "ibm"],
  inception: ["Inception", "inception"],
  inclusionai: ["inclusionAI"],
  interfaze: ["Interfaze"],
  kwaipilot: ["Kwaipilot", "kwaipilot"],
  liquid: ["Liquid AI", "liquid"],
  meituan: ["Meituan", "meituan"],
  meta: ["Meta", "meta"],
  "meta-llama": ["Meta", "meta"],
  minimax: ["MiniMax", "minimax"],
  mistral: ["Mistral", "mistral"],
  mistralai: ["Mistral", "mistral"],
  mixedbread: ["Mixedbread"],
  moonshotai: ["Moonshot AI", "moonshot"],
  "nex-agi": ["Nex AGI"],
  nvidia: ["NVIDIA", "nvidia"],
  openai: ["OpenAI", "openai"],
  openrouter: ["OpenRouter", "openrouter"],
  perplexity: ["Perplexity", "perplexity"],
  poolside: ["Poolside", "poolside"],
  "prism-ml": ["Prism ML"],
  quiverai: ["QuiverAI"],
  qwen: ["Qwen", "qwen"],
  rekaai: ["Reka", "reka"],
  relace: ["Relace", "relace"],
  sakana: ["Sakana AI", "sakana"],
  sao10k: ["Sao10K"],
  // Grok, listed under SpaceX since its merger with xAI.
  spacexai: ["xAI", "xai"],
  stepfun: ["StepFun", "stepfun"],
  tencent: ["Tencent", "tencent"],
  thinkingmachines: ["Thinking Machines"],
  unbiased: ["Unbiased"],
  upstage: ["Upstage", "upstage"],
  xai: ["xAI", "xai"],
  "x-ai": ["xAI", "xai"],
  xiaomi: ["Xiaomi", "xiaomi"],
  zai: ["Z.ai", "zai"],
  "z-ai": ["Z.ai", "zai"],
};

/** Whether the maker has a written name here, not just a capitalized slug. */
export function knownMaker(maker: string) {
  return maker in MAKERS;
}

export function makerLabel(maker: string) {
  return MAKERS[maker]?.[0] ?? maker.charAt(0).toUpperCase() + maker.slice(1);
}

export function makerBrand(maker: string) {
  return MAKERS[maker]?.[1];
}

/** Model providers the app switches between. */
export const PROVIDER_BRANDS = { gateway: "vercel", openrouter: "openrouter" } as const;

/** eve registry items (channel/slack, connection/stripe, …) that have a logo. */
export function registryBrand(name: string) {
  return REGISTRY_BRANDS[name];
}

/** Services the app's own tools and connections talk to. */
const SERVICES = new Set(["github", "linear", "notion", "sentry", "telegram", "vercel"]);

/**
 * Tools and runtime entries named after one of those services
 * (github__create_issue, linear_search, connection "notion"): its logo. Only
 * these, so a tool that merely starts with a brand's name (make_image) keeps
 * its plain look.
 */
export function serviceBrand(name: string) {
  const service = name.toLowerCase().match(/^(?:mcp\.)?([a-z0-9]+)/)?.[1];
  return service && SERVICES.has(service) ? service : undefined;
}

export function hasBrand(brand: string | undefined): brand is string {
  return Boolean(brand && BRAND_KEYS.has(brand));
}
