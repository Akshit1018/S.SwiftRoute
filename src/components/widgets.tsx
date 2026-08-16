import { useEffect, useState, type ReactNode } from "react";
import { cn, formatNumber, formatPct } from "@/lib/utils";
import { Badge } from "./ui/badge";
import { Card } from "./ui/card";

export function Kpi({
  label,
  value,
  hint,
  delta,
  invertDelta,
  className,
}: {
  label: string;
  value: string;
  hint?: string;
  delta?: number | null;
  invertDelta?: boolean;
  className?: string;
}) {
  const up = delta != null ? delta >= 0 : null;
  const good = up == null ? null : invertDelta ? !up : up;
  return (
    <Card className={cn("p-4 sm:p-5", className)}>
      <p className="text-xs font-medium tracking-wide text-muted uppercase">{label}</p>
      <p className="mt-2 font-display text-3xl tracking-tight tabular sm:text-4xl">{value}</p>
      <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted">
        {delta != null && Number.isFinite(delta) && (
          <span className={cn("tabular", good ? "text-good" : "text-bad")}>
            {Math.abs(delta) < 2 && Math.abs(delta) !== 0
              ? `${delta > 0 ? "+" : ""}${(delta * 100).toFixed(1)} pts`
              : `${delta > 0 ? "+" : ""}${formatNumber(delta)}`}
          </span>
        )}
        {hint ? <span>{hint}</span> : null}
      </div>
    </Card>
  );
}

export function StatusDot({
  status,
}: {
  status: "ok" | "degraded" | "down" | "success" | "partial" | "failed" | "running";
}) {
  const map = {
    ok: "bg-good",
    success: "bg-good",
    degraded: "bg-warn",
    partial: "bg-warn",
    down: "bg-bad",
    failed: "bg-bad",
    running: "bg-info",
  };
  return <span className={cn("inline-block size-1.5 rounded-full", map[status])} />;
}

export function StatusBadge({
  status,
}: {
  status: "ok" | "degraded" | "down" | "success" | "partial" | "failed" | "running";
}) {
  const tone =
    status === "ok" || status === "success"
      ? "good"
      : status === "degraded" || status === "partial" || status === "running"
        ? "warn"
        : "bad";
  const label =
    status === "ok"
      ? "Healthy"
      : status === "down"
        ? "Down"
        : status.charAt(0).toUpperCase() + status.slice(1);
  return (
    <Badge tone={tone} className="gap-1.5">
      <StatusDot status={status} />
      {label}
    </Badge>
  );
}

export function Freshness({ minutes, limit }: { minutes: number | null; limit: number }) {
  if (minutes == null) return <Badge tone="neutral">No runs yet</Badge>;
  const stale = minutes > limit;
  return (
    <Badge tone={stale ? "warn" : "good"}>
      Fresh {minutes < 1 ? "<1m" : `${minutes}m`}
      {stale ? ` · target <${limit}m` : ""}
    </Badge>
  );
}

export function Banner({
  tone,
  title,
  body,
}: {
  tone: "ok" | "warn" | "crit";
  title: string;
  body: string;
}) {
  const cls =
    tone === "crit"
      ? "bg-bad-bg text-bad"
      : tone === "warn"
        ? "bg-warn-bg text-warn"
        : "bg-good-bg text-good";
  return (
    <div className={cn("rounded-lg px-4 py-3", cls)}>
      <p className="text-sm font-medium">{title}</p>
      <p className="mt-0.5 text-sm opacity-90">{body}</p>
    </div>
  );
}

export function Empty({ title, body }: { title: string; body: string }) {
  return (
    <div className="rounded-xl border border-dashed border-border-strong px-6 py-12 text-center">
      <p className="font-display text-lg">{title}</p>
      <p className="mt-1 text-sm text-muted">{body}</p>
    </div>
  );
}

export function ScoreText({ score }: { score: number | null }) {
  if (score == null) return <span className="text-sm text-muted">—</span>;
  const cls = score >= 0.95 ? "text-good" : score >= 0.85 ? "text-warn" : "text-bad";
  return <span className={cn("tabular text-sm font-medium", cls)}>{formatPct(score, 0)}</span>;
}

export function ClientOnly({
  children,
  fallback,
}: {
  children: ReactNode;
  fallback?: ReactNode;
}) {
  const [ok, setOk] = useState(false);
  useEffect(() => {
    setOk(true);
  }, []);
  if (!ok) return <>{fallback ?? <div className="h-56 animate-pulse rounded-md bg-sunken" />}</>;
  return <>{children}</>;
}
