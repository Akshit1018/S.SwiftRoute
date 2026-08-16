import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";

export function Input({ className, ...props }: ComponentProps<"input">) {
  return (
    <input
      className={cn(
        "flex h-10 w-full rounded-sm border border-border-strong bg-surface px-3 text-sm text-fg placeholder:text-faint",
        "transition-[box-shadow,border-color] duration-150",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-forest/30",
        "disabled:cursor-not-allowed disabled:opacity-50",
        className,
      )}
      {...props}
    />
  );
}
