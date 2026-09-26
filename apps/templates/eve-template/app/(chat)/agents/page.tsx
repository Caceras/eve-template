import type { Metadata } from "next";
import { Suspense } from "react";
import { AgentProfilesPage } from "@/app/_components/agent-profiles-page";

export const metadata: Metadata = { title: "Agents" };
export default function AgentsPage() {
  return (
    <Suspense fallback={null}>
      <AgentProfilesPage />
    </Suspense>
  );
}
