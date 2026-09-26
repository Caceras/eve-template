import type { Metadata } from "next";
import { ProviderSettings } from "@/app/_components/provider-settings";

export const metadata: Metadata = { title: "Models" };
export default function SettingsPage() {
  return <ProviderSettings />;
}
