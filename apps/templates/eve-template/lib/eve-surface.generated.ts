// Generated from the installed eve package and https://eve.dev/r/registry.json. Do not edit by hand.
export const eveSurface = {
  "eveVersion": "0.66.1",
  "packageExports": [
    ".",
    "./agents/auth",
    "./ai",
    "./channels",
    "./channels/auth",
    "./channels/chat-sdk",
    "./channels/discord",
    "./channels/eve",
    "./channels/github",
    "./channels/linear",
    "./channels/linq",
    "./channels/mcp",
    "./channels/photon",
    "./channels/slack",
    "./channels/teams",
    "./channels/telegram",
    "./channels/twilio",
    "./client",
    "./connections",
    "./context",
    "./evals",
    "./evals/expect",
    "./evals/loaders",
    "./evals/reporters",
    "./extension",
    "./extensions/code",
    "./extensions/code/prwatch",
    "./extensions/code/sandbox",
    "./extensions/code/tools",
    "./hooks",
    "./instructions",
    "./instrumentation",
    "./instrumentation/otel",
    "./internal/programmatic-source-loader",
    "./internal/workflow-step-execution",
    "./local-dev",
    "./memory",
    "./memory/file",
    "./memory/file/vercel",
    "./memory/scope",
    "./models",
    "./models/anthropic",
    "./models/openai",
    "./next",
    "./nuxt",
    "./package.json",
    "./react",
    "./sandbox",
    "./sandbox/docker",
    "./sandbox/just-bash",
    "./sandbox/microsandbox",
    "./sandbox/provider",
    "./sandbox/vercel",
    "./schedules",
    "./self-modification",
    "./self-modification/agent",
    "./self-modification/config",
    "./self-modification/sandbox",
    "./setup",
    "./setup/scaffold",
    "./skills",
    "./svelte",
    "./sveltekit",
    "./tools",
    "./tools/agent",
    "./tools/agent-router",
    "./tools/approval",
    "./tools/ask_question",
    "./tools/bash",
    "./tools/connection_search",
    "./tools/glob",
    "./tools/grep",
    "./tools/load_skill",
    "./tools/read_file",
    "./tools/sleep",
    "./tools/task_cancel",
    "./tools/web_fetch",
    "./tools/web_search",
    "./tools/workflow",
    "./tools/write_file",
    "./vercel",
    "./vue",
    "./workflow-modules"
  ],
  "registryItems": [
    {
      "name": "channel/blooio",
      "title": "Blooio",
      "description": "Send and receive iMessage, RCS, and SMS through Blooio, with reactions, typing indicators, read receipts, polls, groups, capability checks, and history.",
      "category": "channel",
      "implementation": "native",
      "requires": null,
      "docs": "/integrations/blooio#configure"
    },
    {
      "name": "channel/chat-sdk-agentphone",
      "title": "AgentPhone",
      "description": "SMS, MMS, iMessage, and voice conversations through AgentPhone.",
      "category": "channel",
      "implementation": "chat-sdk",
      "requires": null,
      "docs": "/integrations/chat-sdk-agentphone#configure"
    },
    {
      "name": "channel/chat-sdk-beeper",
      "title": "Beeper",
      "description": "Matrix rooms and bridged messaging networks through Beeper.",
      "category": "channel",
      "implementation": "chat-sdk",
      "requires": null,
      "docs": "/integrations/chat-sdk-beeper#configure"
    },
    {
      "name": "channel/chat-sdk-dial",
      "title": "Dial",
      "description": "Give your agent a phone number for SMS, MMS, iMessage, and voice transcripts.",
      "category": "channel",
      "implementation": "chat-sdk",
      "requires": null,
      "docs": "/integrations/chat-sdk-dial#configure"
    },
    {
      "name": "channel/chat-sdk-gchat",
      "title": "Google Chat",
      "description": "Google Chat spaces and DMs via the Chat SDK.",
      "category": "channel",
      "implementation": "chat-sdk",
      "requires": null,
      "docs": "/integrations/chat-sdk-gchat#configure"
    },
    {
      "name": "channel/chat-sdk-gmail",
      "title": "Gmail",
      "description": "Turn labelled Gmail threads into agent conversations via the Chat SDK.",
      "category": "channel",
      "implementation": "chat-sdk",
      "requires": null,
      "docs": "/integrations/chat-sdk-gmail#configure"
    },
    {
      "name": "channel/chat-sdk-kapso",
      "title": "Kapso",
      "description": "Managed WhatsApp conversations, media, buttons, and history through Kapso.",
      "category": "channel",
      "implementation": "chat-sdk",
      "requires": null,
      "docs": "/integrations/chat-sdk-kapso#configure"
    },
    {
      "name": "channel/chat-sdk-lark",
      "title": "Lark / Feishu",
      "description": "Lark and Feishu chats with native card streaming via the Chat SDK.",
      "category": "channel",
      "implementation": "chat-sdk",
      "requires": null,
      "docs": "/integrations/chat-sdk-lark#configure"
    },
    {
      "name": "channel/chat-sdk-liveblocks",
      "title": "Liveblocks",
      "description": "Bring your agent into Liveblocks comment threads, mentions, and reactions.",
      "category": "channel",
      "implementation": "chat-sdk",
      "requires": null,
      "docs": "/integrations/chat-sdk-liveblocks#configure"
    },
    {
      "name": "channel/chat-sdk-messenger",
      "title": "Messenger",
      "description": "Facebook Messenger bots with templates, buttons, and reactions via the Chat SDK.",
      "category": "channel",
      "implementation": "chat-sdk",
      "requires": null,
      "docs": "/integrations/chat-sdk-messenger#configure"
    },
    {
      "name": "channel/chat-sdk-novu",
      "title": "Novu",
      "description": "Reach Slack, Teams, WhatsApp, Telegram, and email through Novu.",
      "category": "channel",
      "implementation": "chat-sdk",
      "requires": null,
      "docs": "/integrations/chat-sdk-novu#configure"
    },
    {
      "name": "channel/chat-sdk-resend",
      "title": "Resend",
      "description": "Send and receive threaded email through Resend via the Chat SDK.",
      "category": "channel",
      "implementation": "chat-sdk",
      "requires": null,
      "docs": "/integrations/chat-sdk-resend#configure"
    },
    {
      "name": "channel/chat-sdk-sendblue",
      "title": "Sendblue",
      "description": "Send and receive iMessage, SMS, and RCS through Sendblue.",
      "category": "channel",
      "implementation": "chat-sdk",
      "requires": null,
      "docs": "/integrations/chat-sdk-sendblue#configure"
    },
    {
      "name": "channel/chat-sdk-velt",
      "title": "Velt",
      "description": "Add agents to anchored comments across documents, canvases, PDFs, and video.",
      "category": "channel",
      "implementation": "chat-sdk",
      "requires": null,
      "docs": "/integrations/chat-sdk-velt#configure"
    },
    {
      "name": "channel/chat-sdk-whatsapp",
      "title": "WhatsApp",
      "description": "Customer messaging through WhatsApp Business Cloud via the Chat SDK.",
      "category": "channel",
      "implementation": "chat-sdk",
      "requires": null,
      "docs": "/integrations/chat-sdk-whatsapp#configure"
    },
    {
      "name": "channel/chat-sdk-x",
      "title": "X",
      "description": "Public mentions and DMs on X via the Chat SDK.",
      "category": "channel",
      "implementation": "chat-sdk",
      "requires": null,
      "docs": "/integrations/chat-sdk-x#configure"
    },
    {
      "name": "channel/chat-sdk-zernio",
      "title": "Zernio",
      "description": "Reach seven social and messaging platforms through one Zernio integration.",
      "category": "channel",
      "implementation": "chat-sdk",
      "requires": null,
      "docs": "/integrations/chat-sdk-zernio#configure"
    },
    {
      "name": "channel/discord",
      "title": "Discord",
      "description": "Connect an eve agent to Discord with guided connector and slash-command setup.",
      "category": "channel",
      "implementation": "native",
      "requires": ">=0.33.0",
      "docs": "/docs/channels/discord"
    },
    {
      "name": "channel/github",
      "title": "GitHub",
      "description": "Drive your agent from issues, pull requests, and comments, with guided Connect setup.",
      "category": "channel",
      "implementation": "native",
      "requires": ">=0.33.0",
      "docs": "/docs/channels/github"
    },
    {
      "name": "channel/linear",
      "title": "Linear Agent",
      "description": "Delegate Linear issues and comments through Agent Sessions, with guided Vercel Connect setup.",
      "category": "channel",
      "implementation": "native",
      "requires": ">=0.33.0",
      "docs": "/docs/channels/linear"
    },
    {
      "name": "channel/linq",
      "title": "Linq",
      "description": "Connect an eve agent to iMessage and SMS through Linq with guided Connect or portable setup.",
      "category": "channel",
      "implementation": "native",
      "requires": ">=0.41.0",
      "docs": "/docs/channels/linq"
    },
    {
      "name": "channel/photon-imessage",
      "title": "Photon iMessage",
      "description": "Connect an eve agent to iMessage through Photon with guided project and phone setup.",
      "category": "channel",
      "implementation": "native",
      "requires": ">=0.33.0",
      "docs": "/docs/channels/photon"
    },
    {
      "name": "channel/slack",
      "title": "Slack",
      "description": "Connect an eve agent to Slack with Vercel Connect or portable credentials.",
      "category": "channel",
      "implementation": "native",
      "requires": ">=0.33.0",
      "docs": "/docs/channels/slack"
    },
    {
      "name": "channel/teams",
      "title": "Microsoft Teams",
      "description": "Run an eve agent as a managed Microsoft Teams bot, with guided Vercel Connect setup.",
      "category": "channel",
      "implementation": "native",
      "requires": ">=0.53.0",
      "docs": "/docs/channels/teams"
    },
    {
      "name": "channel/telegram",
      "title": "Telegram",
      "description": "Connect your agent to a Telegram bot for 1:1 and group chats.",
      "category": "channel",
      "implementation": "native",
      "requires": null,
      "docs": "/docs/channels/telegram"
    },
    {
      "name": "channel/twilio",
      "title": "Twilio",
      "description": "Put your agent on a phone number: SMS and speech-transcribed calls.",
      "category": "channel",
      "implementation": "native",
      "requires": null,
      "docs": "/docs/channels/twilio"
    },
    {
      "name": "channel/web",
      "title": "Web Chat",
      "description": "Add the built-in Next.js Web Chat channel to an eve agent.",
      "category": "channel",
      "implementation": "native",
      "requires": ">=0.66.1",
      "docs": "/docs/channels/eve"
    },
    {
      "name": "connection/agentcard",
      "title": "Agentcard",
      "description": "let agents buy online",
      "category": "connection",
      "implementation": null,
      "requires": ">=0.29.0",
      "docs": null
    },
    {
      "name": "connection/airtable",
      "title": "Airtable",
      "description": "Bases, tables, and records through Airtable's MCP server.",
      "category": "connection",
      "implementation": null,
      "requires": ">=0.29.0",
      "docs": null
    },
    {
      "name": "connection/bitly",
      "title": "Bitly",
      "description": "Shorten links, generate QR Codes, and track performance.",
      "category": "connection",
      "implementation": null,
      "requires": ">=0.29.0",
      "docs": null
    },
    {
      "name": "connection/brex",
      "title": "Brex",
      "description": "Expenses, cards, and cash through Brex's finance automation.",
      "category": "connection",
      "implementation": null,
      "requires": ">=0.29.0",
      "docs": null
    },
    {
      "name": "connection/browser-use",
      "title": "Browser Use",
      "description": "Run managed browser automation tasks through Browser Use's MCP server.",
      "category": "connection",
      "implementation": null,
      "requires": null,
      "docs": null
    },
    {
      "name": "connection/candid",
      "title": "Candid",
      "description": "Research nonprofits and funders using Candid's data.",
      "category": "connection",
      "implementation": null,
      "requires": ">=0.29.0",
      "docs": null
    },
    {
      "name": "connection/clickhouse",
      "title": "ClickHouse",
      "description": "Query and explore your ClickHouse Cloud data.",
      "category": "connection",
      "implementation": null,
      "requires": ">=0.29.0",
      "docs": null
    },
    {
      "name": "connection/cloudinary",
      "title": "Cloudinary",
      "description": "Manage, transform, and deliver your images and videos.",
      "category": "connection",
      "implementation": null,
      "requires": ">=0.29.0",
      "docs": null
    },
    {
      "name": "connection/coda",
      "title": "Coda",
      "description": "Create, search, and update docs and tables.",
      "category": "connection",
      "implementation": null,
      "requires": ">=0.29.0",
      "docs": null
    },
    {
      "name": "connection/context",
      "title": "context.dev",
      "description": "search, scrape, extract, and monitor live web data.",
      "category": "connection",
      "implementation": null,
      "requires": ">=0.29.0",
      "docs": null
    },
    {
      "name": "connection/datadog",
      "title": "Datadog",
      "description": "Query metrics, monitors, and logs through Datadog's MCP server.",
      "category": "connection",
      "implementation": null,
      "requires": ">=0.29.0",
      "docs": null
    },
    {
      "name": "connection/egnyte",
      "title": "Egnyte",
      "description": "Securely access and analyze Egnyte content.",
      "category": "connection",
      "implementation": null,
      "requires": ">=0.29.0",
      "docs": null
    },
    {
      "name": "connection/embat",
      "title": "Embat",
      "description": "Ask Embat about cash, debt, payments, and accounting.",
      "category": "connection",
      "implementation": null,
      "requires": ">=0.29.0",
      "docs": null
    },
    {
      "name": "connection/honeycomb",
      "title": "Honeycomb",
      "description": "Explore traces and run queries through Honeycomb's MCP server.",
      "category": "connection",
      "implementation": null,
      "requires": ">=0.29.0",
      "docs": null
    },
    {
      "name": "connection/hugging-face",
      "title": "Hugging Face",
      "description": "Access the Hugging Face Hub and thousands of Gradio apps.",
      "category": "connection",
      "implementation": null,
      "requires": ">=0.29.0",
      "docs": null
    },
    {
      "name": "connection/linear",
      "title": "Linear",
      "description": "Issues, projects, cycles, and comments via Linear's MCP server.",
      "category": "connection",
      "implementation": null,
      "requires": ">=0.29.0",
      "docs": null
    },
    {
      "name": "connection/local-falcon",
      "title": "Local Falcon",
      "description": "AI visibility and local search intelligence.",
      "category": "connection",
      "implementation": null,
      "requires": ">=0.29.0",
      "docs": null
    },
    {
      "name": "connection/make",
      "title": "Make",
      "description": "Run Make scenarios and manage your Make account.",
      "category": "connection",
      "implementation": null,
      "requires": ">=0.29.0",
      "docs": null
    },
    {
      "name": "connection/manufact",
      "title": "Manufact",
      "description": "Deploy and monitor MCP servers with Manufact.",
      "category": "connection",
      "implementation": null,
      "requires": ">=0.29.0",
      "docs": null
    },
    {
      "name": "connection/mem0",
      "title": "Mem0",
      "description": "Persistent memory for AI agents and assistants.",
      "category": "connection",
      "implementation": null,
      "requires": ">=0.29.0",
      "docs": null
    },
    {
      "name": "connection/miro",
      "title": "Miro",
      "description": "Access and create content on Miro boards.",
      "category": "connection",
      "implementation": null,
      "requires": ">=0.29.0",
      "docs": null
    },
    {
      "name": "connection/mixpanel",
      "title": "Mixpanel",
      "description": "Analyze, query, and manage your Mixpanel data.",
      "category": "connection",
      "implementation": null,
      "requires": ">=0.29.0",
      "docs": null
    },
    {
      "name": "connection/natural",
      "title": "Natural",
      "description": "Send, request, and manage payments with Natural.",
      "category": "connection",
      "implementation": null,
      "requires": ">=0.29.0",
      "docs": null
    },
    {
      "name": "connection/neon",
      "title": "Neon",
      "description": "Manage Neon projects, run queries, and make schema changes.",
      "category": "connection",
      "implementation": null,
      "requires": ">=0.48.0",
      "docs": null
    },
    {
      "name": "connection/netlify",
      "title": "Netlify",
      "description": "Create, deploy, manage, and secure websites on Netlify.",
      "category": "connection",
      "implementation": null,
      "requires": ">=0.29.0",
      "docs": null
    },
    {
      "name": "connection/notion",
      "title": "Notion",
      "description": "Search and edit Notion pages and databases over MCP or OpenAPI.",
      "category": "connection",
      "implementation": null,
      "requires": ">=0.29.0",
      "docs": null
    },
    {
      "name": "connection/oreilly",
      "title": "O'Reilly",
      "description": "Discover O'Reilly's expert learning content.",
      "category": "connection",
      "implementation": null,
      "requires": ">=0.29.0",
      "docs": null
    },
    {
      "name": "connection/planetscale",
      "title": "PlanetScale",
      "description": "Authenticated access to your PlanetScale Postgres and MySQL databases.",
      "category": "connection",
      "implementation": null,
      "requires": ">=0.29.0",
      "docs": null
    },
    {
      "name": "connection/posthog",
      "title": "PostHog",
      "description": "Query, analyze, and manage your PostHog insights.",
      "category": "connection",
      "implementation": null,
      "requires": ">=0.29.0",
      "docs": null
    },
    {
      "name": "connection/postman",
      "title": "Postman",
      "description": "Give API context to your coding agents with Postman.",
      "category": "connection",
      "implementation": null,
      "requires": ">=0.29.0",
      "docs": null
    },
    {
      "name": "connection/razorpay",
      "title": "Razorpay",
      "description": "Razorpay payments, settlements, and dashboard data.",
      "category": "connection",
      "implementation": null,
      "requires": ">=0.29.0",
      "docs": null
    },
    {
      "name": "connection/sentry",
      "title": "Sentry",
      "description": "Search, query, and debug errors intelligently.",
      "category": "connection",
      "implementation": null,
      "requires": ">=0.29.0",
      "docs": null
    },
    {
      "name": "connection/shopify",
      "title": "Shopify",
      "description": "Search products and manage carts and checkouts on a Shopify storefront.",
      "category": "connection",
      "implementation": null,
      "requires": ">=0.46.1",
      "docs": null
    },
    {
      "name": "connection/similarweb",
      "title": "Similarweb",
      "description": "Real-time web, mobile app, and market data.",
      "category": "connection",
      "implementation": null,
      "requires": ">=0.29.0",
      "docs": null
    },
    {
      "name": "connection/stripe",
      "title": "Stripe",
      "description": "Payment processing and financial infrastructure tools.",
      "category": "connection",
      "implementation": null,
      "requires": ">=0.29.0",
      "docs": null
    },
    {
      "name": "connection/supabase",
      "title": "Supabase",
      "description": "Manage databases, authentication, and storage.",
      "category": "connection",
      "implementation": null,
      "requires": ">=0.29.0",
      "docs": null
    },
    {
      "name": "connection/ticket-tailor",
      "title": "Ticket Tailor",
      "description": "Manage tickets, orders, and events with Ticket Tailor.",
      "category": "connection",
      "implementation": null,
      "requires": ">=0.29.0",
      "docs": null
    },
    {
      "name": "connection/ticktick",
      "title": "TickTick",
      "description": "Search, create, and manage your tasks and habits in TickTick.",
      "category": "connection",
      "implementation": null,
      "requires": ">=0.29.0",
      "docs": null
    },
    {
      "name": "connection/tinybird",
      "title": "Tinybird",
      "description": "Query pipes and data sources in your Tinybird Workspace.",
      "category": "connection",
      "implementation": null,
      "requires": ">=0.48.0",
      "docs": null
    },
    {
      "name": "connection/todoist",
      "title": "Todoist",
      "description": "Search, complete, and manage your tasks in Todoist.",
      "category": "connection",
      "implementation": null,
      "requires": ">=0.29.0",
      "docs": null
    },
    {
      "name": "connection/vercel",
      "title": "Vercel",
      "description": "Manage Vercel projects, deployments, and logs through Vercel's MCP server.",
      "category": "connection",
      "implementation": null,
      "requires": ">=0.29.0",
      "docs": null
    },
    {
      "name": "connection/webflow",
      "title": "Webflow",
      "description": "Manage Webflow CMS, pages, assets, and sites.",
      "category": "connection",
      "implementation": null,
      "requires": ">=0.29.0",
      "docs": null
    },
    {
      "name": "connection/wix",
      "title": "Wix",
      "description": "Manage and build sites and apps on Wix.",
      "category": "connection",
      "implementation": null,
      "requires": ">=0.29.0",
      "docs": null
    },
    {
      "name": "connection/zapier",
      "title": "Zapier",
      "description": "Automate workflows across thousands of apps.",
      "category": "connection",
      "implementation": null,
      "requires": ">=0.29.0",
      "docs": null
    },
    {
      "name": "connection/zomato",
      "title": "Zomato",
      "description": "Online food ordering and delivery through Zomato.",
      "category": "connection",
      "implementation": null,
      "requires": ">=0.29.0",
      "docs": null
    },
    {
      "name": "eve/self-modification",
      "title": "Self-modification",
      "description": "Add a source editing subagent with local edits and official registry installation.",
      "category": "eve",
      "implementation": null,
      "requires": ">=0.62.0",
      "docs": null
    },
    {
      "name": "experimental/self-modification",
      "title": "Self-modification (Experimental)",
      "description": "Add an experimental source editing subagent with local edits and official registry installation.",
      "category": "experimental",
      "implementation": null,
      "requires": ">=0.62.0",
      "docs": null
    },
    {
      "name": "extension/agent-browser",
      "title": "agent-browser",
      "description": "Add browser automation tools backed by agent-browser to an eve agent.",
      "category": "extension",
      "implementation": null,
      "requires": null,
      "docs": null
    },
    {
      "name": "extension/blitzreels",
      "title": "BlitzReels",
      "description": "Turn long videos into short clips, generate media, repair edits, and export.",
      "category": "extension",
      "implementation": null,
      "requires": null,
      "docs": null
    },
    {
      "name": "extension/browserbase",
      "title": "Browserbase",
      "description": "Search, fetch, and automate the web with Browserbase and Stagehand.",
      "category": "extension",
      "implementation": null,
      "requires": null,
      "docs": null
    },
    {
      "name": "extension/github-tools",
      "title": "GitHub Tools",
      "description": "Add scoped GitHub tools with Vercel Connect authentication and approval rules.",
      "category": "extension",
      "implementation": null,
      "requires": null,
      "docs": null
    },
    {
      "name": "extension/hindsight",
      "title": "Hindsight",
      "description": "Recall relevant context before every turn and retain each exchange automatically.",
      "category": "extension",
      "implementation": null,
      "requires": null,
      "docs": null
    },
    {
      "name": "extension/jetty",
      "title": "Jetty",
      "description": "Grade agent turns, compare experiments, and store durable evaluation trajectories.",
      "category": "extension",
      "implementation": null,
      "requires": null,
      "docs": null
    },
    {
      "name": "extension/kernel",
      "title": "KERNEL",
      "description": "Let your eve agent use the Internet with KERNEL browser infrastructure, observability, and stealth.",
      "category": "extension",
      "implementation": null,
      "requires": null,
      "docs": null
    },
    {
      "name": "instrumentation/arize",
      "title": "Arize",
      "description": "Export traces to Arize AX for LLM observability and evaluation.",
      "category": "instrumentation",
      "implementation": null,
      "requires": null,
      "docs": null
    },
    {
      "name": "instrumentation/braintrust",
      "title": "Braintrust",
      "description": "Trace eve agent sessions in Braintrust, including turns, steps, tool calls, and subagent interactions.",
      "category": "instrumentation",
      "implementation": null,
      "requires": null,
      "docs": null
    },
    {
      "name": "instrumentation/datadog",
      "title": "Datadog",
      "description": "Export agent traces to Datadog APM alongside the rest of your stack.",
      "category": "instrumentation",
      "implementation": null,
      "requires": null,
      "docs": null
    },
    {
      "name": "instrumentation/honeycomb",
      "title": "Honeycomb",
      "description": "Send OpenTelemetry traces to Honeycomb and query every agent turn.",
      "category": "instrumentation",
      "implementation": null,
      "requires": null,
      "docs": null
    },
    {
      "name": "instrumentation/jaeger",
      "title": "Jaeger",
      "description": "Trace your agent with a local or self-hosted Jaeger OTLP backend.",
      "category": "instrumentation",
      "implementation": null,
      "requires": null,
      "docs": null
    },
    {
      "name": "instrumentation/posthog",
      "title": "PostHog",
      "description": "Send agent traces and generations to PostHog AI Observability.",
      "category": "instrumentation",
      "implementation": null,
      "requires": null,
      "docs": null
    },
    {
      "name": "instrumentation/raindrop",
      "title": "Raindrop",
      "description": "Send agent traces to Raindrop to detect and debug AI product issues.",
      "category": "instrumentation",
      "implementation": null,
      "requires": null,
      "docs": null
    },
    {
      "name": "instrumentation/sentry",
      "title": "Sentry",
      "description": "Send agent traces to Sentry's OTLP endpoint for tracing and debugging.",
      "category": "instrumentation",
      "implementation": null,
      "requires": null,
      "docs": null
    },
    {
      "name": "memory/arcana",
      "title": "Kybernesis Arcana",
      "description": "Give your agents workspace-scoped long-term memory with automatic recall and deliberate storage.",
      "category": "memory",
      "implementation": null,
      "requires": ">=0.49.0",
      "docs": null
    },
    {
      "name": "memory/file",
      "title": "File memory",
      "description": "Store durable per-principal memory in a private Vercel Blob store. Setup connects production, preview, and development in the project's primary function region; Blob usage may incur charges.",
      "category": "memory",
      "implementation": null,
      "requires": ">=0.49.1",
      "docs": "/docs/memory/file"
    },
    {
      "name": "memory/supermemory",
      "title": "Supermemory",
      "description": "Give your agents long-term memory, user profiles, and SuperRAG across conversations and context.",
      "category": "memory",
      "implementation": null,
      "requires": ">=0.47.3",
      "docs": null
    },
    {
      "name": "memory/upstash-agentkit",
      "title": "Upstash AgentKit",
      "description": "Give your agents ranked recall and automatic capture on Upstash Redis, or a Redis backend for file memory.",
      "category": "memory",
      "implementation": null,
      "requires": ">=0.45.2",
      "docs": null
    },
    {
      "name": "tool/agent",
      "title": "Agent",
      "description": "Add root-agent background delegation.",
      "category": "tool",
      "implementation": null,
      "requires": null,
      "docs": null
    },
    {
      "name": "tool/ask_question",
      "title": "Ask Question",
      "description": "Let the agent ask the user one question and wait for the answer.",
      "category": "tool",
      "implementation": null,
      "requires": null,
      "docs": null
    },
    {
      "name": "tool/bash",
      "title": "Bash",
      "description": "Run shell commands in the agent sandbox.",
      "category": "tool",
      "implementation": null,
      "requires": null,
      "docs": null
    },
    {
      "name": "tool/glob",
      "title": "Glob",
      "description": "Find sandbox files by glob pattern.",
      "category": "tool",
      "implementation": null,
      "requires": null,
      "docs": null
    },
    {
      "name": "tool/grep",
      "title": "Grep",
      "description": "Search sandbox file contents with a regular expression.",
      "category": "tool",
      "implementation": null,
      "requires": null,
      "docs": null
    },
    {
      "name": "tool/load_skill",
      "title": "Load Skill",
      "description": "Load instructions from an agent skill.",
      "category": "tool",
      "implementation": null,
      "requires": null,
      "docs": null
    },
    {
      "name": "tool/read_file",
      "title": "Read File",
      "description": "Read text files from the agent sandbox.",
      "category": "tool",
      "implementation": null,
      "requires": null,
      "docs": null
    },
    {
      "name": "tool/sleep",
      "title": "Sleep",
      "description": "Pause and durably resume the current turn.",
      "category": "tool",
      "implementation": null,
      "requires": null,
      "docs": null
    },
    {
      "name": "tool/task_cancel",
      "title": "Task Cancel",
      "description": "Cancel background tasks from the root session.",
      "category": "tool",
      "implementation": null,
      "requires": null,
      "docs": null
    },
    {
      "name": "tool/web_fetch",
      "title": "Web Fetch",
      "description": "Fetch a URL from the app runtime.",
      "category": "tool",
      "implementation": null,
      "requires": null,
      "docs": null
    },
    {
      "name": "tool/web_search",
      "title": "Web Search",
      "description": "Search the web through the model provider.",
      "category": "tool",
      "implementation": null,
      "requires": null,
      "docs": null
    },
    {
      "name": "tool/write_file",
      "title": "Write File",
      "description": "Write complete files in the agent sandbox.",
      "category": "tool",
      "implementation": null,
      "requires": null,
      "docs": null
    }
  ]
} as const;
