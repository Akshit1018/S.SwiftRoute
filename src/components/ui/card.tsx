import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";

export function Card({ className, ...props }: ComponentProps<"div">) {
  return (
    <div
      className={cn("rounded-xl bg-surface p-5 shadow-[var(--shadow-border)]", className)}
      {...props}
    />
  );
}

export function CardHeader({ className, ...props }: ComponentProps<"div">) {
  return <div className={cn("mb-4 flex items-start justify-between gap-3", className)} {...props} />;
}

export function CardTitle({ className, ...props }: ComponentProps<"h3">) {
  return <h3 className={cn("font-display text-lg font-medium tracking-tight", className)} {...props} />;
}

export function CardDesc({ className, ...props }: ComponentProps<"p">) {
  return <p className={cn("text-sm text-muted", className)} {...props} />;
}
