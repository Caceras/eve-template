import { Suspense } from "react";
import { AgentProfilesPage } from "@/app/_components/agent-profiles-page";
export default function AgentsPage() {
  return (
    <Suspense fallback={null}>
      <AgentProfilesPage />
    </Suspense>
  );
}
