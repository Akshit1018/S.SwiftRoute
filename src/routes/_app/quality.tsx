import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip as RTooltip,
  XAxis,
  YAxis,
} from "recharts";
import { getQuality } from "@/lib/server/api";
import { chartTheme } from "@/lib/chart-theme";
import { formatPct } from "@/lib/utils";
import { ClientOnly, Empty, ScoreText } from "@/components/widgets";
import { PageHead } from "@/components/shell";
import { Badge } from "@/components/ui/badge";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";

export const Route = createFileRoute("/_app/quality")({ component: Quality });

function Quality() {
  const q = useQuery({
    queryKey: ["quality"],
    queryFn: () => getQuality(),
    refetchInterval: 12_000,
  });

  if (q.isLoading || !q.data) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-52" />
        <Skeleton className="h-64" />
      </div>
    );
  }

  const { checks, history, quarantine, score, config } = q.data;
  const chart = history.map((h) => ({
    label: new Date(h.at).toLocaleDateString("en-IN", { day: "numeric", month: "short" }),
    score: Math.round(h.score * 1000) / 10,
    q: h.quarantined,
  }));

  return (
    <div>
      <PageHead
        kicker="Gates · contracts · quarantine"
        title="Quality scorecard"
        aside={
          <>
            <span className="text-sm text-muted">
              Target {formatPct(config.qualityMin, 0)}
            </span>
            <ScoreText score={score} />
          </>
        }
      />

      <div className="grid gap-4 lg:grid-cols-5">
        <Card className="lg:col-span-3">
          <CardHeader>
            <CardTitle>Checks on last run</CardTitle>
          </CardHeader>
          <ul className="space-y-4">
            {checks.map((c) => (
              <li key={c.checkName}>
                <div className="mb-1 flex items-center justify-between gap-3 text-sm">
                  <span className="font-medium">{c.checkName.replaceAll("_", " ")}</span>
                  <Badge tone={c.passed ? "good" : "bad"}>{c.passed ? "pass" : "fail"}</Badge>
                </div>
                <Progress
                  value={c.score * 100}
                  tone={c.passed ? "good" : "bad"}
                />
                <p className="mt-1 text-xs text-muted">
                  {c.source} · {c.message}
                </p>
              </li>
            ))}
          </ul>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Score trend</CardTitle>
          </CardHeader>
          <ClientOnly>
            <div className="h-52">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chart} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
                  <CartesianGrid stroke={chartTheme.rule} vertical={false} />
                  <XAxis dataKey="label" tick={{ fill: chartTheme.muted, fontSize: 10 }} axisLine={false} tickLine={false} />
                  <YAxis domain={[70, 100]} tick={{ fill: chartTheme.muted, fontSize: 10 }} axisLine={false} tickLine={false} width={28} />
                  <RTooltip contentStyle={{ background: chartTheme.paper, border: `1px solid ${chartTheme.rule}`, borderRadius: 8 }} />
                  <Line type="monotone" dataKey="score" stroke={chartTheme.forest} strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </ClientOnly>
        </Card>
      </div>

      <h2 className="mt-8 mb-3 font-display text-2xl">Quarantine</h2>
      {quarantine.length === 0 ? (
        <Empty title="No quarantined rows" body="Last loads survived the contract tests." />
      ) : (
        <div className="space-y-2">
          {quarantine.map((row) => (
            <Card key={row.id} className="p-4">
              <div className="flex flex-wrap items-center gap-2">
                <Badge tone="bad">{row.checkName}</Badge>
                <span className="text-xs text-muted">{row.source}</span>
                <span className="font-mono text-[10px] text-faint">{row.runId}</span>
              </div>
              <p className="mt-2 text-sm">{row.reason}</p>
              <pre className="mt-2 overflow-x-auto rounded-sm bg-sunken p-2 font-mono text-[11px] text-muted">
                {row.rawJson.slice(0, 280)}
              </pre>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
