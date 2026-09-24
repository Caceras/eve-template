import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "Ægentica",
    short_name: "Ægentica",
    description: "Your persistent AI agent: chat, research, scheduled tasks and memory.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    launch_handler: { client_mode: "navigate-existing" },
    background_color: "#ffffff",
    theme_color: "#ffffff",
    categories: ["productivity", "utilities"],
    share_target: {
      action: "/",
      method: "GET",
      params: { title: "title", text: "text", url: "url" },
    },
    screenshots: [
      {
        src: "/screenshots/mobile-chat.png",
        sizes: "780x1688",
        type: "image/png",
        form_factor: "narrow",
        label: "Chat with Ægentica",
      },
      {
        src: "/screenshots/desktop-chat.png",
        sizes: "1440x900",
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
    ],
    shortcuts: [
      { name: "New chat", url: "/", icons: [{ src: "/icons/icon-192.png", sizes: "192x192" }] },
      { name: "Tasks", url: "/tasks", icons: [{ src: "/icons/icon-192.png", sizes: "192x192" }] },
      {
        name: "Settings",
        url: "/settings",
        icons: [{ src: "/icons/icon-192.png", sizes: "192x192" }],
      },
    ],
  };
}
