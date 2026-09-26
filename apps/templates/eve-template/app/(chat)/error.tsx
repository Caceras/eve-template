"use client";

import { ErrorState } from "@/app/_components/error-state";

// A page that fails inside the chat shell keeps the sidebar and top bar, so
// every other page stays one tap away.
export default function ErrorPage({ error }: { readonly error: Error & { digest?: string } }) {
  return <ErrorState error={error} />;
}
