import type { Metadata } from "next";
import { MemoryPage } from "@/app/_components/memory-page";

export const metadata: Metadata = { title: "Memory" };

export default function Memory() {
  return <MemoryPage />;
}
