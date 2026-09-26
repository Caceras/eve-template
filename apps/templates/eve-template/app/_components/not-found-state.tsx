import Link from "next/link";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function NotFoundState({
  title,
  description,
  standalone = false,
}: {
  readonly title: string;
  readonly description: string;
  // Outside the chat shell the page owns the viewport; inside it, the shell does.
  readonly standalone?: boolean;
}) {
  const Root = standalone ? "main" : "div";
  return (
    <Root
      className={cn(
        "flex flex-1 flex-col items-center justify-center px-4 text-center",
        standalone ? "fixed inset-0 overflow-y-auto" : "h-full",
      )}
    >
      <img
        alt="Ægentica"
        className="mb-5 size-11 select-none invert dark:invert-0"
        draggable={false}
        src="/aegentica.svg"
      />
      <h1 className="text-2xl font-medium tracking-tight">{title}</h1>
      <p className="mt-1.5 max-w-sm text-sm leading-6 text-muted-foreground">{description}</p>
      <Button asChild className="mt-6 min-h-11">
        <Link href="/">New chat</Link>
      </Button>
    </Root>
  );
}
