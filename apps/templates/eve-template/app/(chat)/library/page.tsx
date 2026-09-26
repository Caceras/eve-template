import type { Metadata } from "next";
import { ProductLibrary } from "@/app/_components/product-library";

export const metadata: Metadata = { title: "Explore" };
export default function LibraryPage() {
  return <ProductLibrary />;
}
