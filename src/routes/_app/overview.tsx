import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { getOverview } from "@/lib/server/api";
import { REGIONS } from "@/lib/pipeline/types";
import { formatDay, formatInr, formatNumber, formatPct, relativeTime } from "@/lib/utils";
import { Banner, Freshness, Kpi, StatusBadge } from "@/components/widgets";
import { PageHead } from "@/components/shell";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { Select } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Progress } from "@/components/ui/progress";
import { useState } from "react";

export const Route = createFileRoute("/_app/overview")({ component: Overview });

function Overview() {
  const [region, setRegion] = useState("all");
  const q = useQuery({
    queryKey: ["overview", region],
    queryFn: () => getOverview({ data: { region } }),
    refetchInterval: 15_000,
  });

  if (q.isLoading || !q.data) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-56" />
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Skeleton className="h-28" />
          <Skeleton className="h-28" />
          <Skeleton className="h-28" />
          <Skeleton className="h-28" />
        </div>
      </div>
    );
  }

  const d = q.data;
  const otdDelta = d.today.onTimeRate - d.today.prevOnTimeRate;
  const volDelta = d.today.deliveries - d.today.prevDeliveries;

  return (
    <div>
      <PageHead
        kicker="Today · gold layer"
        title="Overview"
        aside={
          <>
            <Freshness minutes={d.freshnessMinutes} limit={d.config.freshnessMinutes} />
            {d.lastRun ? <StatusBadge status={d.lastRun.status} /> : null}
            <Select
              value={region}
              onValueChange={setRegion}
              items={[{ value: "all", label: "All regions" }, ...REGIONS.map((r) => ({ value: r.id, label: r.name }))]}
            />
          </>
        }
      />

      {d.banner ? (
        <div className="mb-5 rise-in">
          <Banner tone={d.banner.tone} title={d.banner.title} body={d.banner.body} />
        </div>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Kpi
          className="rise-in"
          label="On-time delivery"
          value={formatPct(d.today.onTimeRate)}
          delta={d.today.prevDeliveries > 0 ? otdDelta : null}
          hint={`target ${formatPct(d.config.otdThreshold, 0)} · vs yesterday`}
        />
        <Kpi
          className="rise-in rise-in-1"
          label="Deliveries"
          value={formatNumber(d.today.deliveries)}
          delta={d.today.prevDeliveries > 0 ? volDelta : null}
          hint={d.today.day ? formatDay(d.today.day) : "latest gold day"}
        />
        <Kpi
          className="rise-in rise-in-2"
          label="Failed / delayed"
          value={`${d.today.failed} / ${d.today.delayed}`}
          hint={`${d.today.tickets} tickets`}
        />
        <Kpi
          className="rise-in rise-in-3"
          label="Cost per delivery"
          value={formatInr(d.today.avgCost)}
          hint={`${d.today.crashCount} crash-linked`}
        />
      </div>

      <div className="mt-5 grid gap-4 lg:grid-cols-5">
        <Card className="lg:col-span-3">
          <CardHeader>
            <div>
              <CardTitle>Regions</CardTitle>
              <p className="mt-1 text-sm text-muted">On-time vs volume for the latest gold day.</p>
            </div>
          </CardHeader>
          <ul className="space-y-3">
            {d.regions.map((r) => (
              <li key={r.region}>
                <div className="mb-1 flex items-baseline justify-between gap-3 text-sm">
                  <span className="font-medium">{r.regionName}</span>
                  <span className="tabular text-muted">
                    {formatPct(r.onTimeRate)} · {formatNumber(r.deliveries)}
                  </span>
                </div>
                <Progress
                  value={r.onTimeRate * 100}
                  tone={r.onTimeRate >= d.config.otdThreshold ? "good" : r.onTimeRate >= 0.82 ? "warn" : "bad"}
                />
              </li>
            ))}
          </ul>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Control strip</CardTitle>
          </CardHeader>
          <dl className="space-y-3 text-sm">
            <Row k="Quality score" v={d.qualityScore != null ? formatPct(d.qualityScore, 0) : "—"} />
            <Row k="Open alerts" v={String(d.openAlerts)} />
            <Row
              k="Last run"
              v={d.lastRun ? `${d.lastRun.status} · ${relativeTime(d.lastRun.startedAt)}` : "—"}
            />
            <Row k="Silver rows" v={d.lastRun ? formatNumber(d.lastRun.silverRows) : "—"} />
            <Row k="Quarantined" v={d.lastRun ? String(d.lastRun.quarantined) : "—"} />
          </dl>
          <div className="mt-5 flex flex-col gap-2">
            <Link to="/alerts" className="text-sm text-forest underline-offset-4 hover:underline">
              Review alerts
            </Link>
            <Link to="/operator" className="text-sm text-forest underline-offset-4 hover:underline">
              Run pipeline / inject failure
            </Link>
          </div>
        </Card>
      </div>
    </div>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-b border-border pb-2 last:border-0">
      <dt className="text-muted">{k}</dt>
      <dd className="tabular font-medium">{v}</dd>
    </div>
  );
}
