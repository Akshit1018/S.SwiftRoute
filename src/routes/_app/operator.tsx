import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import {
  getOperator,
  setInjectFlag,
  triggerRun,
  updateThresholds,
} from "@/lib/server/api";
import { formatStamp } from "@/lib/utils";
import { StatusBadge } from "@/components/widgets";
import { PageHead } from "@/components/shell";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";

export const Route = createFileRoute("/_app/operator")({ component: Operator });

function Operator() {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["operator"], queryFn: () => getOperator() });
  const [otd, setOtd] = useState<string>();
  const [nulls, setNulls] = useState<string>();
  const [fresh, setFresh] = useState<string>();
  const [qmin, setQmin] = useState<string>();

  const invalidate = async () => {
    await Promise.all([
      qc.invalidateQueries({ queryKey: ["operator"] }),
      qc.invalidateQueries({ queryKey: ["pipeline"] }),
      qc.invalidateQueries({ queryKey: ["quality"] }),
      qc.invalidateQueries({ queryKey: ["overview"] }),
      qc.invalidateQueries({ queryKey: ["alerts"] }),
      qc.invalidateQueries({ queryKey: ["trends"] }),
      qc.invalidateQueries({ queryKey: ["deliveries"] }),
    ]);
  };

  const run = useMutation({
    mutationFn: () => triggerRun({ data: { mode: "manual" } }),
    onSuccess: async (rep) => {
      toast.success(`Run ${rep.status} · quality ${(rep.qualityScore * 100).toFixed(0)}`);
      await invalidate();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Run failed"),
  });

  const flag = useMutation({
    mutationFn: (input: { flag: "dirty" | "drift" | "outage"; value: boolean }) =>
      setInjectFlag({ data: input }),
    onSuccess: async (_, vars) => {
      toast.message(vars.value ? `${vars.flag} queued for next run` : `${vars.flag} cleared`);
      await qc.invalidateQueries({ queryKey: ["operator"] });
    },
  });

  const save = useMutation({
    mutationFn: () => {
      const cfg = q.data?.config;
      return updateThresholds({
        data: {
          otdThreshold: Number(otd ?? cfg?.otdThreshold ?? 0.9),
          nullDriverThreshold: Number(nulls ?? cfg?.nullDriverThreshold ?? 0.05),
          freshnessMinutes: Number(fresh ?? cfg?.freshnessMinutes ?? 15),
          qualityMin: Number(qmin ?? cfg?.qualityMin ?? 0.95),
        },
      });
    },
    onSuccess: async () => {
      toast.success("Thresholds saved");
      await qc.invalidateQueries({ queryKey: ["operator"] });
      await qc.invalidateQueries({ queryKey: ["overview"] });
    },
  });

  if (q.isLoading || !q.data) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-10 w-40" />
        <Skeleton className="h-48" />
      </div>
    );
  }

  const { config, circuit, audit } = q.data;

  return (
    <div>
      <PageHead
        kicker="FDE desk · inject · recover"
        title="Operator"
        aside={<StatusBadge status={circuit === "open" ? "down" : circuit === "half_open" ? "degraded" : "ok"} />}
      />

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <div>
              <CardTitle>Run the pipe</CardTitle>
              <p className="mt-1 text-sm text-muted">
                Consumes any queued inject flags. Writes bronze, gates, silver, gold, and alerts.
              </p>
            </div>
          </CardHeader>
          <Button disabled={run.isPending} onClick={() => run.mutate()}>
            {run.isPending ? "Running medallion…" : "Run pipeline now"}
          </Button>
          {run.data ? (
            <p className="mt-3 text-sm text-muted">
              {run.data.notes} · {run.data.silverRows} silver · {run.data.quarantined} quarantined ·{" "}
              {(run.data.durationMs / 1000).toFixed(1)}s
            </p>
          ) : null}
        </Card>

        <Card>
          <CardHeader>
            <div>
              <CardTitle>Inject friction</CardTitle>
              <p className="mt-1 text-sm text-muted">One-shot flags. Next run applies them, then clears.</p>
            </div>
          </CardHeader>
          <div className="flex flex-col gap-2">
            <FlagRow
              label="Dirty warehouse CSV"
              hint="Null drivers, dup IDs, garbage costs"
              on={config.flags.dirtyNext}
              busy={flag.isPending}
              onToggle={(v) => flag.mutate({ flag: "dirty", value: v })}
            />
            <FlagRow
              label="Schema drift"
              hint="shipmentId / rider_ref / state_code"
              on={config.flags.driftNext}
              busy={flag.isPending}
              onToggle={(v) => flag.mutate({ flag: "drift", value: v })}
            />
            <FlagRow
              label="Tracking API outage"
              hint="Opens the circuit breaker"
              on={config.flags.outageNext}
              busy={flag.isPending}
              onToggle={(v) => flag.mutate({ flag: "outage", value: v })}
            />
          </div>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Thresholds</CardTitle>
          </CardHeader>
          <div className="grid grid-cols-2 gap-3">
            <Field label="OTD min (0–1)" value={otd ?? String(config.otdThreshold)} onChange={setOtd} />
            <Field label="Null driver max" value={nulls ?? String(config.nullDriverThreshold)} onChange={setNulls} />
            <Field label="Freshness (min)" value={fresh ?? String(config.freshnessMinutes)} onChange={setFresh} />
            <Field label="Quality min" value={qmin ?? String(config.qualityMin)} onChange={setQmin} />
          </div>
          <Button className="mt-4" variant="outline" disabled={save.isPending} onClick={() => save.mutate()}>
            Save thresholds
          </Button>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Audit</CardTitle>
          </CardHeader>
          <ul className="space-y-2 text-sm">
            {audit.map((a) => (
              <li key={a.id} className="border-b border-border pb-2 last:border-0">
                <p className="font-medium">{a.action}</p>
                <p className="text-xs text-muted">
                  {formatStamp(a.at)} · {a.userId ?? "system"}
                </p>
              </li>
            ))}
          </ul>
        </Card>
      </div>
    </div>
  );
}

function FlagRow({
  label,
  hint,
  on,
  busy,
  onToggle,
}: {
  label: string;
  hint: string;
  on: boolean;
  busy: boolean;
  onToggle: (v: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-md bg-sunken px-3 py-2.5">
      <div>
        <p className="text-sm font-medium">{label}</p>
        <p className="text-xs text-muted">{hint}</p>
      </div>
      <Button size="sm" variant={on ? "default" : "outline"} disabled={busy} onClick={() => onToggle(!on)}>
        {on ? "Queued" : "Queue"}
      </Button>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      <Input value={value} onChange={(e) => onChange(e.target.value)} inputMode="decimal" />
    </div>
  );
}
