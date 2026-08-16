import { cn } from "@/lib/utils";

export function Progress({
  value,
  className,
  tone = "forest",
}: {
  value: number;
  className?: string;
  tone?: "forest" | "good" | "warn" | "bad";
}) {
  const pct = Math.max(0, Math.min(100, value));
  const fill =
    tone === "good"
      ? "bg-good"
      : tone === "warn"
        ? "bg-warn"
        : tone === "bad"
          ? "bg-bad"
          : "bg-forest";
  return (
    <div className={cn("h-1.5 w-full overflow-hidden rounded-full bg-sunken", className)}>
      <div
        className={cn("h-full rounded-full transition-[width] duration-300 ease-out", fill)}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}
