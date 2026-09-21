import { NativeAgentChat } from "@/app/_components/native-agent-chat";

export default async function NativeWebChatSessionPage({
  params,
}: {
  readonly params: Promise<{ readonly sessionId: string }>;
}) {
  const { sessionId } = await params;
  return <NativeAgentChat sessionId={sessionId} />;
}
