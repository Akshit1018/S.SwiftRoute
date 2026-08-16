import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip as RTooltip,
  XAxis,
  YAxis,
} from "recharts";
import { getTrends } from "@/lib/server/api";
import { REGIONS } from "@/lib/pipeline/types";
import { chartTheme } from "@/lib/chart-theme";
import { formatDay, formatInr, formatNumber, formatPct } from "@/lib/utils";
import { ClientOnly } from "@/components/widgets";
import { PageHead } from "@/components/shell";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { Select } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";

export const Route = createFileRoute("/_app/trends")({ component: Trends });

function Trends() {
  const [region, setRegion] = useState("all");
  const q = useQuery({
    queryKey: ["trends", region],
    queryFn: () => getTrends({ data: { region } }),
  });

  const rows = (q.data ?? []).map((r) => ({
    ...r,
    label: formatDay(r.day),
    otd: Math.round(r.onTimeRate * 1000) / 10,
  }));

  return (
    <div>
      <PageHead
        kicker="Gold · last 10 days"
        title="Trends"
        aside={
          <Select
            value={region}
            onValueChange={setRegion}
            items={[{ value: "all", label: "All India" }, ...REGIONS.map((r) => ({ value: r.id, label: r.name }))]}
          />
        }
      />

      {q.isLoading ? (
        <div className="grid gap-4 lg:grid-cols-2">
          <Skeleton className="h-72" />
          <Skeleton className="h-72" />
        </div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>On-time %</CardTitle>
            </CardHeader>
            <ClientOnly>
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={rows} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                    <CartesianGrid stroke={chartTheme.rule} vertical={false} />
                    <XAxis dataKey="label" tick={{ fill: chartTheme.muted, fontSize: 11 }} axisLine={false} tickLine={false} />
                    <YAxis domain={[70, 100]} tick={{ fill: chartTheme.muted, fontSize: 11 }} axisLine={false} tickLine={false} width={32} />
                    <RTooltip
                      contentStyle={{ background: chartTheme.paper, border: `1px solid ${chartTheme.rule}`, borderRadius: 8 }}
                      formatter={(v) => [`${v}%`, "OTD"]}
                    />
                    <Line type="monotone" dataKey="otd" stroke={chartTheme.forest} strokeWidth={2} dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </ClientOnly>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Volume</CardTitle>
            </CardHeader>
            <ClientOnly>
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={rows} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                    <CartesianGrid stroke={chartTheme.rule} vertical={false} />
                    <XAxis dataKey="label" tick={{ fill: chartTheme.muted, fontSize: 11 }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fill: chartTheme.muted, fontSize: 11 }} axisLine={false} tickLine={false} width={36} />
                    <RTooltip
                      contentStyle={{ background: chartTheme.paper, border: `1px solid ${chartTheme.rule}`, borderRadius: 8 }}
                      formatter={(v) => [formatNumber(Number(v)), "Deliveries"]}
                    />
                    <Area type="monotone" dataKey="deliveries" stroke={chartTheme.forest} fill={chartTheme.forest} fillOpacity={0.12} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </ClientOnly>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Failures & delays</CardTitle>
            </CardHeader>
            <ClientOnly>
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={rows} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                    <CartesianGrid stroke={chartTheme.rule} vertical={false} />
                    <XAxis dataKey="label" tick={{ fill: chartTheme.muted, fontSize: 11 }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fill: chartTheme.muted, fontSize: 11 }} axisLine={false} tickLine={false} width={28} />
                    <RTooltip contentStyle={{ background: chartTheme.paper, border: `1px solid ${chartTheme.rule}`, borderRadius: 8 }} />
                    <Bar dataKey="failed" fill={chartTheme.bad} radius={[3, 3, 0, 0]} />
                    <Bar dataKey="delayed" fill={chartTheme.warn} radius={[3, 3, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </ClientOnly>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Cost & crashes</CardTitle>
            </CardHeader>
            <ClientOnly>
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={rows} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                    <CartesianGrid stroke={chartTheme.rule} vertical={false} />
                    <XAxis dataKey="label" tick={{ fill: chartTheme.muted, fontSize: 11 }} axisLine={false} tickLine={false} />
                    <YAxis yAxisId="l" tick={{ fill: chartTheme.muted, fontSize: 11 }} axisLine={false} tickLine={false} width={36} />
                    <YAxis yAxisId="r" orientation="right" tick={{ fill: chartTheme.muted, fontSize: 11 }} axisLine={false} tickLine={false} width={24} />
                    <RTooltip
                      contentStyle={{ background: chartTheme.paper, border: `1px solid ${chartTheme.rule}`, borderRadius: 8 }}
                      formatter={(v, name) => [name === "avgCost" ? formatInr(Number(v)) : v, name === "avgCost" ? "Avg cost" : "Crashes"]}
                    />
                    <Line yAxisId="l" type="monotone" dataKey="avgCost" stroke={chartTheme.forest} strokeWidth={2} dot={false} />
                    <Line yAxisId="r" type="monotone" dataKey="crashCount" stroke={chartTheme.bad} strokeWidth={1.5} dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </ClientOnly>
          </Card>
        </div>
      )}

      {rows.length > 0 ? (
        <p className="mt-4 text-xs text-muted">
          Latest day {formatPct(rows[rows.length - 1]!.onTimeRate)} OTD on{" "}
          {formatNumber(rows[rows.length - 1]!.deliveries)} consignments.
        </p>
      ) : null}
    </div>
  );
}
