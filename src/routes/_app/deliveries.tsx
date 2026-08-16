import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { getDeliveries } from "@/lib/server/api";
import { REGIONS, STATUSES } from "@/lib/pipeline/types";
import { formatInr, formatStamp } from "@/lib/utils";
import { Empty, StatusBadge } from "@/components/widgets";
import { PageHead } from "@/components/shell";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Card } from "@/components/ui/card";

export const Route = createFileRoute("/_app/deliveries")({ component: Deliveries });

function Deliveries() {
  const [region, setRegion] = useState("all");
  const [status, setStatus] = useState("failed");
  const [q, setQ] = useState("");
  const query = useQuery({
    queryKey: ["deliveries", region, status, q],
    queryFn: () => getDeliveries({ data: { region, status, q, limit: 80 } }),
  });

  const rows = query.data ?? [];
  const crashN = useMemo(() => rows.filter((r) => r.crashRelated).length, [rows]);

  return (
    <div>
      <PageHead
        kicker="Silver · last 48 hours"
        title="Deliveries"
        aside={
          <span className="text-sm text-muted">
            {crashN} crash-linked in this view
          </span>
        }
      />

      <div className="mb-4 flex flex-col gap-2 sm:flex-row">
        <Input
          placeholder="Search ID, driver, city"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          className="sm:max-w-xs"
        />
        <Select
          value={region}
          onValueChange={setRegion}
          items={[{ value: "all", label: "All regions" }, ...REGIONS.map((r) => ({ value: r.id, label: r.name }))]}
        />
        <Select
          value={status}
          onValueChange={setStatus}
          items={[{ value: "all", label: "All statuses" }, ...STATUSES.map((s) => ({ value: s, label: s.replace("_", " ") }))]}
        />
      </div>

      {query.isLoading ? (
        <Skeleton className="h-96" />
      ) : rows.length === 0 ? (
        <Empty title="No matching consignments" body="Widen the status filter or clear search." />
      ) : (
        <>
          <Card className="hidden overflow-hidden p-0 md:block">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[720px] text-left text-sm">
                <thead className="border-b border-border bg-sunken/60 text-xs tracking-wide text-muted uppercase">
                  <tr>
                    <th className="px-4 py-3 font-medium">Consignment</th>
                    <th className="px-4 py-3 font-medium">Region</th>
                    <th className="px-4 py-3 font-medium">Status</th>
                    <th className="px-4 py-3 font-medium">Driver</th>
                    <th className="px-4 py-3 font-medium">App</th>
                    <th className="px-4 py-3 font-medium">Cost</th>
                    <th className="px-4 py-3 font-medium">Promised</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.deliveryId} className="border-b border-border last:border-0">
                      <td className="px-4 py-3">
                        <p className="font-mono text-xs">{r.deliveryId}</p>
                        <p className="text-xs text-muted">
                          {r.city} · {r.hub}
                        </p>
                      </td>
                      <td className="px-4 py-3 uppercase">{r.region}</td>
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <StatusBadge
                            status={
                              r.status === "delivered" ? "ok" : r.status === "failed" ? "failed" : "degraded"
                            }
                          />
                          {r.crashRelated ? <Badge tone="bad">crash</Badge> : null}
                          {r.onTime === false ? <Badge tone="warn">late</Badge> : null}
                        </div>
                      </td>
                      <td className="px-4 py-3 font-mono text-xs">{r.driverId ?? "—"}</td>
                      <td className="px-4 py-3 font-mono text-xs">{r.appVersion ?? "—"}</td>
                      <td className="px-4 py-3 tabular">{r.costInr != null ? formatInr(r.costInr) : "—"}</td>
                      <td className="px-4 py-3 text-xs text-muted">
                        {r.promisedAt ? formatStamp(r.promisedAt) : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>

          <div className="space-y-2 md:hidden">
            {rows.map((r) => (
              <Card key={r.deliveryId} className="p-4">
                <div className="flex items-start justify-between gap-2">
                  <p className="font-mono text-xs">{r.deliveryId}</p>
                  <StatusBadge status={r.status === "delivered" ? "ok" : r.status === "failed" ? "failed" : "degraded"} />
                </div>
                <p className="mt-1 text-sm">
                  {r.city} · {r.region.toUpperCase()}
                </p>
                <p className="mt-1 text-xs text-muted">
                  {r.driverId ?? "no driver"} · {r.costInr != null ? formatInr(r.costInr) : "no cost"}
                  {r.crashRelated ? " · crash" : ""}
                </p>
              </Card>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
