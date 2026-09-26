"use client";

import { ErrorState } from "@/app/_components/error-state";

// Errors outside a chat page's content (the chat shell itself, sign-in) keep
// the root layout's styles and show the product's error state full screen.
export default function ErrorPage({ error }: { readonly error: Error & { digest?: string } }) {
  return <ErrorState error={error} standalone />;
}
