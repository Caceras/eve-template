import type { Metadata } from "next";
import { EveSessionLab } from "@/app/_components/eve-session-lab";

export const metadata: Metadata = { title: "Activity" };

export default function SessionLabPage() {
  return <EveSessionLab />;
}
