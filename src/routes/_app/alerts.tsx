import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ackAlert, getAlerts } from "@/lib/server/api";
import { relativeTime } from "@/lib/utils";
import { Empty } from "@/components/widgets";
import { PageHead } from "@/components/shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";

export const Route = createFileRoute("/_app/alerts")({ component: Alerts });

function Alerts() {
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ["alerts"],
    queryFn: () => getAlerts(),
    refetchInterval: 10_000,
  });
  const ack = useMutation({
    mutationFn: (id: string) => ackAlert({ data: { id } }),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["alerts"] });
      await qc.invalidateQueries({ queryKey: ["overview"] });
      toast.success("Alert acknowledged");
    },
  });

  const rows = q.data ?? [];
  const open = rows.filter((a) => !a.acknowledged);

  return (
    <div>
      <PageHead
        kicker="KPI · quality · circuit"
        title="Alerts"
        aside={<span className="text-sm text-muted">{open.length} open</span>}
      />

      {q.isLoading ? (
        <div className="space-y-2">
          <Skeleton className="h-24" />
          <Skeleton className="h-24" />
        </div>
      ) : rows.length === 0 ? (
        <Empty title="Inbox is clear" body="Quality gates and KPI thresholds have not fired." />
      ) : (
        <ul className="space-y-2">
          {rows.map((a) => (
            <li key={a.id}>
              <Card className={a.acknowledged ? "p-4 opacity-60" : "p-4"}>
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge
                        tone={a.severity === "critical" ? "bad" : a.severity === "warning" ? "warn" : "info"}
                      >
                        {a.severity}
                      </Badge>
                      <Badge tone="neutral">{a.kind.replaceAll("_", " ")}</Badge>
                      {a.region ? <Badge tone="neutral">{a.region.toUpperCase()}</Badge> : null}
                      <span className="text-xs text-muted">{relativeTime(a.createdAt)}</span>
                    </div>
                    <p className="mt-2 font-medium">{a.title}</p>
                    <p className="mt-1 text-sm text-muted">{a.body}</p>
                  </div>
                  {!a.acknowledged ? (
                    <Button
                      variant="outline"
                      size="sm"
                      className="shrink-0"
                      disabled={ack.isPending}
                      onClick={() => ack.mutate(a.id)}
                    >
                      Acknowledge
                    </Button>
                  ) : (
                    <span className="text-xs text-muted">Acked</span>
                  )}
                </div>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
