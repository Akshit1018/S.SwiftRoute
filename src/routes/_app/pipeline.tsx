import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight } from "lucide-react";
import { getPipeline } from "@/lib/server/api";
import { formatNumber, formatStamp, relativeTime } from "@/lib/utils";
import { ScoreText, StatusBadge, StatusDot } from "@/components/widgets";
import { PageHead } from "@/components/shell";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";

export const Route = createFileRoute("/_app/pipeline")({ component: Pipeline });

function Pipeline() {
  const q = useQuery({
    queryKey: ["pipeline"],
    queryFn: () => getPipeline(),
    refetchInterval: 12_000,
  });

  if (q.isLoading || !q.data) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-48" />
        <Skeleton className="h-40" />
        <Skeleton className="h-80" />
      </div>
    );
  }

  const { runs, sources, lastChecks, lastReportNotes } = q.data;
  const last = runs[0];

  return (
    <div>
      <PageHead
        kicker="Medallion · bronze / silver / gold"
        title="Pipeline health"
        aside={last ? <StatusBadge status={last.status} /> : null}
      />

      <div className="mb-5 grid gap-2 sm:grid-cols-4">
        {["Sources", "Bronze", "Silver", "Gold"].map((step, i) => (
          <div key={step} className="flex items-center gap-2 rounded-lg bg-surface px-3 py-3 shadow-[var(--shadow-border)]">
            <span className="grid size-7 place-items-center rounded-sm bg-forest text-[11px] font-medium text-forest-fg">
              {i + 1}
            </span>
            <div className="min-w-0">
              <p className="text-sm font-medium">{step}</p>
              <p className="truncate text-xs text-muted">
                {i === 0 ? "CSV · API · events" : i === 1 ? "Raw + metadata" : i === 2 ? "Normalized rows" : "KPI tables"}
              </p>
            </div>
            {i < 3 ? <ArrowRight className="ml-auto hidden size-3.5 text-faint sm:block" /> : null}
          </div>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Extractors</CardTitle>
          </CardHeader>
          <ul className="space-y-3">
            {sources.map((s) => (
              <li key={s.id} className="flex items-start justify-between gap-3 border-b border-border pb-3 last:border-0 last:pb-0">
                <div>
                  <p className="flex items-center gap-2 text-sm font-medium">
                    <StatusDot status={s.lastStatus} />
                    {s.label}
                  </p>
                  <p className="mt-0.5 text-xs text-muted">{s.lastNote}</p>
                </div>
                <div className="text-right">
                  <p className="tabular text-sm">{formatNumber(s.lastRows)}</p>
                  <p className="text-[10px] tracking-wide text-faint uppercase">circuit {s.circuit}</p>
                </div>
              </li>
            ))}
          </ul>
        </Card>

        <Card>
          <CardHeader>
            <div>
              <CardTitle>Last quality gate</CardTitle>
              <p className="mt-1 text-sm text-muted">{lastReportNotes}</p>
            </div>
            <ScoreText score={last?.qualityScore ?? null} />
          </CardHeader>
          <ul className="space-y-2">
            {lastChecks.map((c) => (
              <li key={c.checkName} className="flex items-start justify-between gap-3 text-sm">
                <span className={c.passed ? "text-fg" : "text-bad"}>
                  {c.checkName.replaceAll("_", " ")}
                </span>
                <Badge tone={c.passed ? "good" : "bad"}>{c.passed ? "pass" : "fail"}</Badge>
              </li>
            ))}
          </ul>
          <Link to="/quality" className="mt-4 inline-block text-sm text-forest underline-offset-4 hover:underline">
            Open scorecard
          </Link>
        </Card>
      </div>

      <Card className="mt-4 overflow-hidden p-0">
        <div className="px-5 pt-5">
          <h3 className="font-display text-lg">Run history</h3>
        </div>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[680px] text-left text-sm">
            <thead className="border-y border-border bg-sunken/50 text-xs tracking-wide text-muted uppercase">
              <tr>
                <th className="px-4 py-2 font-medium">Run</th>
                <th className="px-4 py-2 font-medium">Status</th>
                <th className="px-4 py-2 font-medium">Quality</th>
                <th className="px-4 py-2 font-medium">Silver</th>
                <th className="px-4 py-2 font-medium">Quarantine</th>
                <th className="px-4 py-2 font-medium">Duration</th>
                <th className="px-4 py-2 font-medium">When</th>
              </tr>
            </thead>
            <tbody>
              {runs.map((r) => (
                <tr key={r.id} className="border-b border-border last:border-0">
                  <td className="px-4 py-2.5">
                    <p className="font-mono text-xs">{r.id}</p>
                    <p className="text-xs text-muted">{r.triggerType}</p>
                  </td>
                  <td className="px-4 py-2.5">
                    <StatusBadge status={r.status} />
                  </td>
                  <td className="px-4 py-2.5">
                    <ScoreText score={r.qualityScore} />
                  </td>
                  <td className="px-4 py-2.5 tabular">{formatNumber(r.silverRows)}</td>
                  <td className="px-4 py-2.5 tabular">{r.quarantined}</td>
                  <td className="px-4 py-2.5 tabular text-muted">
                    {r.durationMs != null ? `${(r.durationMs / 1000).toFixed(1)}s` : "—"}
                  </td>
                  <td className="px-4 py-2.5 text-xs text-muted">
                    {r.finishedAt ? relativeTime(r.finishedAt) : formatStamp(r.startedAt)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
