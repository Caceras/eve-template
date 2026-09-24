"use client";
import { useMemo, useState } from "react";
import Link from "next/link";
import { ArrowUpRightIcon, SearchIcon } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { productLibrary } from "@/lib/product-library";

export function ProductLibrary() {
  const [query, setQuery] = useState("");
  const items = useMemo(
    () =>
      productLibrary.filter((item) =>
        `${item.category} ${item.title} ${item.description} ${item.status}`
          .toLowerCase()
          .includes(query.toLowerCase().trim()),
      ),
    [query],
  );
  const categories = [...new Set(items.map((item) => item.category))];
  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-4xl px-4 pb-16 pt-16 sm:px-6">
        <h1 className="text-2xl font-semibold tracking-tight">Explore</h1>
        <p className="mt-2 max-w-xl text-sm leading-6 text-muted-foreground">
          Practical ways to use the capabilities already built into Ægentica, plus what needs setup.
        </p>
        <div className="mt-6 flex flex-wrap gap-x-5 gap-y-2 text-xs text-muted-foreground">
          <span>
            <strong className="font-medium text-foreground">Included</strong> · tools and workflows
            in this app
          </span>
          <span>
            <strong className="font-medium text-foreground">Configured</strong> · infrastructure is
            set up
          </span>
          <span>
            <strong className="font-medium text-foreground">Needs setup / Available</strong> ·
            requires configuration or an optional capability
          </span>
        </div>
        <p className="mt-3 text-xs leading-5 text-muted-foreground">
          Configuration does not guarantee every workflow has been tested.{" "}
          <Link className="underline underline-offset-4" href="/capabilities">
            Inspect live capabilities
          </Link>
          .
        </p>
        <div className="relative my-7">
          <SearchIcon className="absolute left-3 top-3.5 size-4 text-muted-foreground" />
          <Input
            aria-label="Search the library"
            placeholder="Search what Ægentica can do"
            className="h-11 pl-9"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </div>
        {categories.map((category) => (
          <section key={category} className="mb-8">
            <h2 className="mb-2 text-sm font-medium">{category}</h2>
            <div className="divide-y rounded-xl border px-4 sm:px-5">
              {items
                .filter((item) => item.category === category)
                .map((item) => (
                  <details key={item.title} className="group py-1">
                    <summary className="flex min-h-14 cursor-pointer list-none items-center justify-between gap-3 py-3 text-sm font-medium focus-visible:outline-2 focus-visible:outline-offset-4">
                      <span>{item.title}</span>
                      <span className="flex shrink-0 items-center gap-3">
                        <Badge variant="outline" className="font-normal text-muted-foreground">
                          {item.status}
                        </Badge>
                        <span
                          aria-hidden
                          className="text-lg font-normal text-muted-foreground group-open:rotate-45"
                        >
                          +
                        </span>
                      </span>
                    </summary>
                    <div className="space-y-4 pb-5 text-sm leading-6">
                      <p className="max-w-xl text-muted-foreground">{item.description}</p>
                      <div className="rounded-lg bg-muted/60 p-4">
                        <h3 className="mb-1 font-medium">Try it</h3>
                        <p>{item.example}</p>
                      </div>
                      <div>
                        <h3 className="font-medium">Before you start</h3>
                        <p className="text-muted-foreground">{item.requirements}</p>
                      </div>
                      <a
                        className="inline-flex items-center gap-1 text-xs underline underline-offset-4"
                        href={`https://eve.dev/docs/${item.path}`}
                        target="_blank"
                        rel="noreferrer"
                      >
                        Eve documentation
                        <ArrowUpRightIcon className="size-3" />
                      </a>
                    </div>
                  </details>
                ))}
            </div>
          </section>
        ))}
        {items.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">
            No matching guides. Try “memory”, “files” or “connections”.
          </p>
        ) : null}
        <footer className="border-t pt-5 text-xs leading-6 text-muted-foreground">
          Eve 0.63.0 reference snapshot · documentation by Vercel and contributors, Apache-2.0.{" "}
          <a className="underline underline-offset-4" href="/reference/NOTICE.txt">
            Attribution
          </a>{" "}
          ·{" "}
          <a className="underline underline-offset-4" href="/reference/index.json">
            Versioned documentation index
          </a>
        </footer>
      </div>
    </div>
  );
}
