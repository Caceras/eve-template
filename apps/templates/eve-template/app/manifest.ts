import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    lang: "en",
    dir: "ltr",
    name: "Ægentica",
    short_name: "Ægentica",
    description:
      "Your own AI agent on your own server: chat, research, voice, scheduled tasks and memory, on every device.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    launch_handler: { client_mode: "navigate-existing" },
    // Desktop: Ægentica appears under "Open with" for these files, which
    // arrive as attachments of a new chat (lib/pwa/file-launch.ts).
    file_handlers: [
      {
        action: "/",
        accept: {
          "image/png": [".png"],
          "image/jpeg": [".jpg", ".jpeg"],
          "image/webp": [".webp"],
          "image/gif": [".gif"],
          "application/pdf": [".pdf"],
          "text/plain": [".txt", ".md", ".csv", ".log"],
        },
      },
    ],
    background_color: "#ffffff",
    theme_color: "#ffffff",
    categories: ["productivity", "utilities"],
    share_target: {
      action: "/share",
      method: "POST",
      enctype: "multipart/form-data",
      params: {
        title: "title",
        text: "text",
        url: "url",
        files: [
          {
            name: "files",
            accept: [
              "image/png",
              "image/jpeg",
              "image/webp",
              "image/gif",
              "application/pdf",
              "text/*",
            ],
          },
        ],
      },
    },
    // Branded install-dialog images from scripts/install-screenshots.mjs.
    screenshots: [
      ...(
        [
          ["phone-home", "Your own AI agent"],
          ["phone-chat", "Ask anything"],
          ["phone-tasks", "Runs tasks for you"],
          ["phone-memory", "Remembers what matters"],
        ] as const
      ).map(([name, label]) => ({
        src: `/screenshots/${name}.png`,
        sizes: "1080x1920",
        type: "image/png",
        form_factor: "narrow" as const,
        label,
      })),
      {
        src: "/screenshots/desktop-chat.png",
        sizes: "1920x1080",
        type: "image/png",
        form_factor: "wide",
        label: "Ægentica on desktop",
      },
    ],
    icons: [
      { src: "/icon.svg", sizes: "any", type: "image/svg+xml" },
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
      // Android's themed icons tint this silhouette to match the wallpaper.
      {
        src: "/icons/monochrome-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "monochrome",
      },
    ],
    // Android shows the first shortcuts on a long-press of the home-screen icon,
    // each with the glyph the sidebar uses.
    shortcuts: (
      [
        ["New chat", "/", "chat"],
        ["Tasks", "/tasks", "tasks"],
        ["Agents", "/agents", "agents"],
        ["Settings", "/settings", "settings"],
      ] as const
    ).map(([name, url, glyph]) => ({
      name,
      url,
      icons: [
        {
          src: `/icons/shortcut-${glyph}.png`,
          sizes: "192x192",
          type: "image/png",
          purpose: "maskable" as const,
        },
        { src: `/icons/shortcut-${glyph}.png`, sizes: "192x192", type: "image/png" },
      ],
    })),
  };
}
