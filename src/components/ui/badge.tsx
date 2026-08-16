import type { ComponentProps } from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium tracking-wide",
  {
    variants: {
      tone: {
        neutral: "bg-sunken text-muted",
        forest: "bg-forest text-forest-fg",
        good: "bg-good-bg text-good",
        warn: "bg-warn-bg text-warn",
        bad: "bg-bad-bg text-bad",
        info: "bg-info-bg text-info",
      },
    },
    defaultVariants: { tone: "neutral" },
  },
);

export function Badge({
  className,
  tone,
  ...props
}: ComponentProps<"span"> & VariantProps<typeof badgeVariants>) {
  return <span className={cn(badgeVariants({ tone }), className)} {...props} />;
}
