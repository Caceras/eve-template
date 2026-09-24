export const productLibrary = [
  {
    category: "Agent workflows",
    title: "Create and delegate to saved agents",
    description:
      "Save instructions, reference context and a preferred model; choose a profile in chat or delegate focused work.",
    status: "Included",
    example:
      "Open Agents, create a profile, then choose Chat. Or ask to list saved agents and delegate a research task.",
    requirements:
      "One operator workspace; profiles do not grant permissions. Delegation uses the compiled researcher and current conversation model. Model execution requires a working key.",
    path: "subagents",
  },
  {
    category: "Memory and files",
    title: "Browse your generated images",
    description: "View, save and delete images stored on the server volume.",
    status: "Included",
    example: "Open Images. Choose Create to start an image prompt in the main composer.",
    requirements:
      "Signed-in operator access. A working provider key is needed for generation, not browsing. Deletion also removes the image from linked conversations.",
    path: "tools/overview",
  },
  {
    category: "Conversations",
    title: "Research a question",
    description:
      "Ask for an explanation, compare options, or turn a broad question into a focused research plan.",
    status: "Included",
    example:
      "Ask: “Help me compare three approaches to my next project. Ask me about my constraints first.”",
    requirements:
      "External sources depend on the available search and fetch tools. Check important claims against their sources.",
    path: "concepts/built-in-tools",
  },
  {
    category: "Conversations",
    title: "Resume your work",
    description:
      "Open a recent conversation to return to its context and follow a response already in progress.",
    status: "Included",
    example: "Start a conversation, return to New chat, then select the conversation under Recent.",
    requirements: "History is saved on your server, so the desktop and the installed app share it.",
    path: "guides/client/continuations",
  },
  {
    category: "Conversations",
    title: "Steer and stop",
    description:
      "Add direction while work is running, or stop a response when you want to change course.",
    status: "Included",
    example:
      "While Ægentica is responding, type a correction and send it to steer the same turn, or tap Stop.",
    requirements: "Stopping generation does not undo tool actions already completed.",
    path: "guides/client/messages",
  },
  {
    category: "Conversations",
    title: "Make a plan",
    description:
      "Break work into concrete steps, explore tradeoffs, and ask the agent to clarify missing information.",
    status: "Included",
    example: "Ask: “Help me plan a small product launch. Ask me about the audience and deadline.”",
    requirements: "You decide which proposed actions to take.",
    path: "concepts/default-harness",
  },
  {
    category: "Memory and files",
    title: "Remember preferences",
    description:
      "Ask the agent to save a stable preference and recall it in a future conversation.",
    status: "Configured",
    example:
      "Ask: “Remember that I prefer short answers in Swedish.” Then open Memory to see it, or ask about it in a new conversation.",
    requirements:
      "Memory is stored on your server and shared by the app, Telegram and scheduled tasks. Edit or import it on the Memory page.",
    path: "memory/file",
  },
  {
    category: "Conversations",
    title: "Create an image",
    description: "Describe a picture, illustration or logo and get it in the chat.",
    status: "Configured",
    example: "Ask: “Make a watercolor illustration of a hummingbird, landscape.”",
    requirements: "Uses the active model provider and costs a little per image.",
    path: "tools/overview",
  },
  {
    category: "Conversations",
    title: "Talk and listen",
    description: "Dictate with the microphone in the message box and have replies read aloud.",
    status: "Included",
    example: "Tap the microphone, speak, and send. Choose a voice in Settings → Voice.",
    requirements: "Uses your device's speech features; availability depends on the browser.",
    path: "guides/frontend/overview",
  },
  {
    category: "Memory and files",
    title: "Work with attachments",
    description:
      "Bring images, PDFs and text into a conversation, and use a workspace for generated files.",
    status: "Included",
    example: "Attach or paste an image, PDF or text in the main composer.",
    requirements:
      "Main chat accepts four files / 6 MB total; unsent drafts stay on this device. The lightweight sandbox is not a full browser or arbitrary Linux environment; workspace files are not guaranteed to survive a deployment.",
    path: "sandbox",
  },
  {
    category: "Memory and files",
    title: "Keep session state",
    description: "Maintain task-specific state separately from long-term preferences.",
    status: "Included",
    example:
      "Ask the agent to use its session counter, then increment it again in the same conversation.",
    requirements:
      "Session state belongs to that conversation; profile memory serves a different purpose.",
    path: "concepts/state",
  },
  {
    category: "Agent workflows",
    title: "Work with specialists",
    description:
      "Ask focused research and review specialists to help with a task using their own context.",
    status: "Included",
    example: "Ask: “Research this idea and have the reviewer identify gaps in the result.”",
    requirements:
      "Specialists use model credits and may require additional tools for external research.",
    path: "subagents",
  },
  {
    category: "Agent workflows",
    title: "Approve an action",
    description: "Review a proposed tool action before allowing the agent to continue.",
    status: "Included",
    example: "Ask: “Create a short note in the workspace and ask me before writing it.”",
    requirements:
      "Approvals are specific to configured tools. Other tools can run without a prompt.",
    path: "human-in-the-loop",
  },
  {
    category: "Agent workflows",
    title: "Run background work",
    description: "Start a longer review, continue the conversation, and retrieve its result.",
    status: "Included",
    example: "Ask the agent to use background_review on a short text.",
    requirements:
      "Background tools are included; individual workflows should be tested before relying on unattended execution.",
    path: "tools/workflows",
  },
  {
    category: "Agent workflows",
    title: "Schedule recurring work",
    description:
      "Reminders, briefings and recurring jobs that run on their own and arrive as a chat and a notification.",
    status: "Configured",
    example: "Open Tasks → New task, or ask: “Every weekday at 8, give me a short briefing.”",
    requirements:
      "Turn on notifications in Settings → Notifications on each phone or computer that should be told.",
    path: "patterns/dynamic-scheduling",
  },
  {
    category: "Connections",
    title: "Work with GitHub",
    description:
      "Review pull requests, find why a check failed, and open issues or pull requests in your repositories.",
    status: "Needs setup",
    example: "Ask: “Review the latest pull request in my repository and tell me what could break.”",
    requirements:
      "Add a GitHub token in Settings → Connections → GitHub. Anything that changes GitHub asks for your approval first.",
    path: "extensions",
  },
  {
    category: "Connections",
    title: "Connect your work apps",
    description: "Add access to tools and context from services such as Linear, Notion and Sentry.",
    status: "Needs setup",
    example:
      "Open Connections for configured accounts, or Capabilities → Explore for the broader directory.",
    requirements:
      "These accounts are not connected. Each integration needs credentials and permissions; a catalog entry is not an active connection.",
    path: "connections",
  },
  {
    category: "Connections",
    title: "Reach other channels",
    description: "Use the same agent through Slack, messaging platforms or a custom application.",
    status: "Available",
    example: "Open Capabilities → Explore and filter Channels.",
    requirements:
      "Channels need their own accounts, credentials and routing. The web app is the configured entry point here.",
    path: "channels/custom",
  },
  {
    category: "Connections",
    title: "Use MCP and remote agents",
    description: "Connect external tool servers or cooperate with another agent over HTTP.",
    status: "Available",
    example: "Read the connection guide to choose an authenticated integration.",
    requirements:
      "The included MCP server is restricted to local development. Remote agents are not configured.",
    path: "guides/remote-agents",
  },
  {
    category: "Control and quality",
    title: "Understand usage limits",
    description:
      "Model access is metered, with limits on each session and on the API key of the active provider (AI Gateway or OpenRouter).",
    status: "Configured",
    example: "Keep initial tests short. Test your provider key in Settings.",
    requirements:
      "Each session stops at $25 of model cost. Set a spending limit on each provider key in the provider’s dashboard.",
    path: "agent-config",
  },
  {
    category: "Control and quality",
    title: "Inspect and evaluate",
    description:
      "Inspect a live session, test agent behavior and trace a task before using it for important work.",
    status: "Included",
    example: "Open Activity for advanced controls or read the evaluation guide.",
    requirements:
      "Reset and clear change a session’s context. External monitoring services require their own setup.",
    path: "evals/overview",
  },
] as const;
