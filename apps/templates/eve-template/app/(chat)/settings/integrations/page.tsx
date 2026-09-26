import type { Metadata } from "next";
import { IntegrationsSettings } from "@/app/_components/integrations-settings";

export const metadata: Metadata = { title: "Connections" };

export default function IntegrationsPage() {
  return <IntegrationsSettings />;
}
