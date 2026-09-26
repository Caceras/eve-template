import type { Metadata } from "next";
import { EveCapabilities } from "@/app/_components/eve-capabilities";

export const metadata: Metadata = { title: "Capabilities" };

export default function CapabilitiesPage() {
  return <EveCapabilities />;
}
