import type { CSSProperties } from "react";
import { hasBrand } from "@/lib/brands";
import { cn } from "@/lib/utils";

/**
 * A third party's real logo, drawn in the current text colour (a CSS mask over
 * public/brands/<brand>.svg), so it matches the monochrome UI in light and
 * dark and costs nothing until shown. Without a logo, the name's initial on a
 * quiet tile stands in. Decorative: the name always sits beside it.
 */
export function BrandIcon({
  brand,
  className,
  name,
}: {
  readonly brand?: string;
  readonly className?: string;
  readonly name: string;
}) {
  if (hasBrand(brand)) {
    return (
      <span
        aria-hidden
        className={cn("brand-icon size-4", className)}
        data-brand={brand}
        style={{ "--brand": `url(/brands/${brand}.svg)` } as CSSProperties}
      />
    );
  }
  return (
    <span
      aria-hidden
      className={cn(
        "inline-flex size-4 shrink-0 items-center justify-center rounded-[4px] bg-muted text-[10px] leading-none font-semibold text-muted-foreground uppercase",
        className,
      )}
    >
      {name.trim().charAt(0)}
    </span>
  );
}
