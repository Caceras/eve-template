import type { Metadata } from "next";
import { ImagesPage } from "@/app/_components/images-page";

export const metadata: Metadata = { title: "Images" };
export default function Page() {
  return <ImagesPage />;
}
