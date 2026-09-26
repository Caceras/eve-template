import type { Metadata } from "next";
import { NativeAgentChat } from "@/app/_components/native-agent-chat";

export const metadata: Metadata = { title: "Live session" };

export default function NativeWebChatPage() {
  return <NativeAgentChat sessionless />;
}
