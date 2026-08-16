import { createServerFn } from "@tanstack/react-start";
import { getSql } from "@/lib/db";
import { authMiddleware } from "@/lib/auth/middleware";
import {
  ensureSeeded,
  getCircuit,
  loadConfig,
  runPipeline,
  saveConfig,
} from "@/lib/pipeline/engine";
import {
  REGIONS,
  ROLE_LABEL,
  ROLES,
  type AlertRow,
  type DailyPoint,
  type DeliveryRow,
  type DeliveryStatus,
  type OverviewKpi,
  type PipelineConfig,
  type PipelineRunReport,
  type Profile,
  type QualityCheckResult,
  type QuarantineRow,
  type RegionKpi,
  type Role,
  type RunRow,
  type SourceHealth,
} from "@/lib/pipeline/types";

function asRole(v: string | null | undefined): Role {
  return ROLES.includes(v as Role) ? (v as Role) : "ops";
}

async function ensureProfile(userId: string): Promise<Profile> {
  const sql = await getSql();
  await ensureSeeded(sql);
  const existing = await sql<{ user_id: string; role: string }>`
    select user_id, role from user_profiles where user_id = ${userId}
  `;
  if (existing[0]) return { userId, role: asRole(existing[0].role) };
  await sql`insert into user_profiles (user_id, role) values (${userId}, 'admin') on conflict (user_id) do nothing`;
  return { userId, role: "admin" };
}

export const getProfile = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    return ensureProfile(context.userId);
  });

export const setRole = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { role: Role }) => {
    if (!ROLES.includes(input.role)) throw new Error("Invalid role");
    return input;
  })
  .handler(async ({ context, data }) => {
    const sql = await getSql();
    await ensureProfile(context.userId);
    await sql`
      insert into user_profiles (user_id, role) values (${context.userId}, ${data.role})
      on conflict (user_id) do update set role = excluded.role
    `;
    await sql`
      insert into audit_log (id, user_id, action, detail)
      values (
        ${`aud_${Date.now().toString(36)}`},
        ${context.userId},
        'role.set',
        ${JSON.stringify({ role: data.role, label: ROLE_LABEL[data.role] })}::jsonb
      )
    `;
    return { userId: context.userId, role: data.role } satisfies Profile;
  });

export type OverviewPayload = {
  today: OverviewKpi;
  regions: RegionKpi[];
  lastRun: RunRow | null;
  openAlerts: number;
  qualityScore: number | null;
  freshnessMinutes: number | null;
  config: PipelineConfig;
  banner: { tone: "ok" | "warn" | "crit"; title: string; body: string } | null;
};

function regionName(id: string) {
  return REGIONS.find((r) => r.id === id)?.name ?? id.toUpperCase();
}

export const getOverview = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .validator((input: { region?: string } = {}) => input)
  .handler(async ({ context, data }): Promise<OverviewPayload> => {
    const sql = await getSql();
    await ensureProfile(context.userId);
    const region = data.region && data.region !== "all" ? data.region : null;
    const dayAgg = region
      ? await sql<{
          day: string;
          deliveries: number;
          on_time: number;
          failed: number;
          delayed: number;
          avg_cost: number;
          crash_count: number;
          tickets: number;
        }>`
          select day::text as day,
                 coalesce(sum(deliveries),0)::int as deliveries,
                 coalesce(sum(on_time),0)::int as on_time,
                 coalesce(sum(failed),0)::int as failed,
                 coalesce(sum(delayed),0)::int as delayed,
                 coalesce(avg(avg_cost),0)::float8 as avg_cost,
                 coalesce(sum(crash_count),0)::int as crash_count,
                 coalesce(sum(tickets),0)::int as tickets
          from gold_daily_kpis
          where region = ${region}
          group by day
          order by day desc
          limit 2
        `
      : await sql<{
          day: string;
          deliveries: number;
          on_time: number;
          failed: number;
          delayed: number;
          avg_cost: number;
          crash_count: number;
          tickets: number;
        }>`
          select day::text as day,
                 coalesce(sum(deliveries),0)::int as deliveries,
                 coalesce(sum(on_time),0)::int as on_time,
                 coalesce(sum(failed),0)::int as failed,
                 coalesce(sum(delayed),0)::int as delayed,
                 coalesce(avg(avg_cost),0)::float8 as avg_cost,
                 coalesce(sum(crash_count),0)::int as crash_count,
                 coalesce(sum(tickets),0)::int as tickets
          from gold_daily_kpis
          group by day
          order by day desc
          limit 2
        `;

    const cur = dayAgg[0] ?? {
      day: "",
      deliveries: 0,
      on_time: 0,
      failed: 0,
      delayed: 0,
      avg_cost: 0,
      crash_count: 0,
      tickets: 0,
    };
    const prev = dayAgg[1] ?? {
      day: "",
      deliveries: 0,
      on_time: 0,
      failed: 0,
      delayed: 0,
      avg_cost: 0,
      crash_count: 0,
      tickets: 0,
    };
    const day = cur.day;

    const regionRows = day
      ? await sql<{
          region: string;
          deliveries: number;
          on_time: number;
          failed: number;
          avg_cost: number;
          crash_count: number;
        }>`
          select region,
                 deliveries::int as deliveries,
                 on_time::int as on_time,
                 failed::int as failed,
                 avg_cost::float8 as avg_cost,
                 crash_count::int as crash_count
          from gold_daily_kpis where day = ${day}::date
          order by deliveries desc
        `
      : [];

    const lastRunRows = await sql<{
      id: string;
      started_at: Date | string;
      finished_at: Date | string | null;
      status: RunRow["status"];
      triggered_by: string | null;
      trigger_type: string;
      bronze_rows: number;
      silver_rows: number;
      quarantined: number;
      quality_score: number | null;
      duration_ms: number | null;
      notes: string | null;
      error: string | null;
    }>`
      select id, started_at, finished_at, status, triggered_by, trigger_type,
             bronze_rows, silver_rows, quarantined, quality_score, duration_ms, notes, error
      from pipeline_runs order by started_at desc limit 1
    `;

    const lastRun = lastRunRows[0]
      ? mapRun(lastRunRows[0])
      : null;

    const open = await sql<{ n: number }>`select count(*)::int as n from alerts where acknowledged = false`;
    const config = await loadConfig(sql);

    const freshnessMinutes = lastRun?.finishedAt
      ? Math.max(0, Math.round((Date.now() - new Date(lastRun.finishedAt).getTime()) / 60000))
      : null;

    const failed = lastRun?.status === "failed";
    const stale = freshnessMinutes != null && freshnessMinutes > config.freshnessMinutes;
    const qfail = lastRun && lastRun.qualityScore != null && lastRun.qualityScore < config.qualityMin;
    let banner: OverviewPayload["banner"] = null;
    if (failed) {
      banner = { tone: "crit", title: "Pipeline failed", body: lastRun?.error || lastRun?.notes || "Last run did not complete." };
    } else if (qfail) {
      banner = {
        tone: "crit",
        title: `Quality gate failed — score ${((lastRun?.qualityScore ?? 0) * 100).toFixed(0)}`,
        body: lastRun?.notes || "Open Quality to inspect quarantined rows and failing checks.",
      };
    } else if (stale) {
      banner = {
        tone: "warn",
        title: `KPI freshness ${freshnessMinutes}m (target < ${config.freshnessMinutes}m)`,
        body: "Gold layer is older than the freshness contract. Run the pipeline from Operator.",
      };
    } else if (lastRun?.status === "partial") {
      banner = { tone: "warn", title: "Partial load", body: lastRun.notes || "One source degraded. Gold updated from surviving rows." };
    }

    const deliveries = Number(cur.deliveries) || 0;
    const onTime = Number(cur.on_time) || 0;
    const prevD = Number(prev.deliveries) || 0;
    const prevO = Number(prev.on_time) || 0;

    return {
      today: {
        day: cur.day,
        deliveries,
        onTimeRate: deliveries ? onTime / deliveries : 0,
        failed: Number(cur.failed) || 0,
        delayed: Number(cur.delayed) || 0,
        avgCost: Number(cur.avg_cost) || 0,
        crashCount: Number(cur.crash_count) || 0,
        tickets: Number(cur.tickets) || 0,
        prevOnTimeRate: prevD ? prevO / prevD : 0,
        prevDeliveries: prevD,
      },
      regions: regionRows.map((r) => ({
        region: r.region,
        regionName: regionName(r.region),
        deliveries: Number(r.deliveries),
        onTimeRate: r.deliveries ? Number(r.on_time) / Number(r.deliveries) : 0,
        failed: Number(r.failed),
        avgCost: Number(r.avg_cost),
        crashCount: Number(r.crash_count),
      })),
      lastRun,
      openAlerts: Number(open[0]?.n ?? 0),
      qualityScore: lastRun?.qualityScore ?? null,
      freshnessMinutes,
      config,
      banner,
    };
  });

function mapRun(r: {
  id: string;
  started_at: Date | string;
  finished_at: Date | string | null;
  status: RunRow["status"];
  triggered_by: string | null;
  trigger_type: string;
  bronze_rows: number;
  silver_rows: number;
  quarantined: number;
  quality_score: number | null;
  duration_ms: number | null;
  notes: string | null;
  error: string | null;
}): RunRow {
  return {
    id: r.id,
    startedAt: new Date(r.started_at).toISOString(),
    finishedAt: r.finished_at ? new Date(r.finished_at).toISOString() : null,
    status: r.status,
    triggeredBy: r.triggered_by,
    triggerType: r.trigger_type,
    bronzeRows: Number(r.bronze_rows),
    silverRows: Number(r.silver_rows),
    quarantined: Number(r.quarantined),
    qualityScore: r.quality_score == null ? null : Number(r.quality_score),
    durationMs: r.duration_ms == null ? null : Number(r.duration_ms),
    notes: r.notes,
    error: r.error,
  };
}

export const getTrends = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .validator((input: { region?: string } = {}) => input)
  .handler(async ({ context, data }): Promise<DailyPoint[]> => {
    const sql = await getSql();
    await ensureProfile(context.userId);
    const region = data.region && data.region !== "all" ? data.region : null;
    const rows = region
      ? await sql<{
          day: string;
          deliveries: number;
          on_time: number;
          failed: number;
          delayed: number;
          avg_cost: number;
          crash_count: number;
          tickets: number;
        }>`
          select day::text as day, deliveries::int as deliveries, on_time::int as on_time,
                 failed::int as failed, delayed::int as delayed, avg_cost::float8 as avg_cost,
                 crash_count::int as crash_count, tickets::int as tickets
          from gold_daily_kpis where region = ${region} order by day
        `
      : await sql<{
          day: string;
          deliveries: number;
          on_time: number;
          failed: number;
          delayed: number;
          avg_cost: number;
          crash_count: number;
          tickets: number;
        }>`
          select day::text as day,
                 sum(deliveries)::int as deliveries,
                 sum(on_time)::int as on_time,
                 sum(failed)::int as failed,
                 sum(delayed)::int as delayed,
                 avg(avg_cost)::float8 as avg_cost,
                 sum(crash_count)::int as crash_count,
                 sum(tickets)::int as tickets
          from gold_daily_kpis group by day order by day
        `;
    return rows.map((r) => ({
      day: r.day,
      deliveries: Number(r.deliveries),
      onTimeRate: r.deliveries ? Number(r.on_time) / Number(r.deliveries) : 0,
      failed: Number(r.failed),
      delayed: Number(r.delayed),
      avgCost: Number(r.avg_cost),
      crashCount: Number(r.crash_count),
      tickets: Number(r.tickets),
    }));
  });

export const getDeliveries = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .validator((input: { region?: string; status?: string; q?: string; limit?: number } = {}) => input)
  .handler(async ({ context, data }): Promise<DeliveryRow[]> => {
    const sql = await getSql();
    await ensureProfile(context.userId);
    const limit = Math.min(data.limit ?? 80, 200);
    const region = data.region && data.region !== "all" ? data.region : null;
    const status = data.status && data.status !== "all" ? data.status : null;
    const q = data.q?.trim() ? `%${data.q.trim()}%` : null;
    const rows = await sql.query<{
      delivery_id: string;
      region: string;
      city: string | null;
      hub: string | null;
      driver_id: string | null;
      status: DeliveryStatus;
      on_time: boolean | null;
      cost_inr: number | null;
      app_version: string | null;
      crash_related: boolean;
      promised_at: Date | string | null;
      delivered_at: Date | string | null;
      created_at: Date | string;
    }>(
      `select delivery_id, region, city, hub, driver_id, status, on_time, cost_inr, app_version,
              crash_related, promised_at, delivered_at, created_at
       from silver_deliveries
       where ($1::text is null or region = $1)
         and ($2::text is null or status = $2)
         and ($3::text is null or delivery_id ilike $3 or coalesce(driver_id,'') ilike $3 or coalesce(city,'') ilike $3)
       order by created_at desc
       limit $4`,
      [region, status, q, limit],
    );
    return rows.map((r) => ({
      deliveryId: r.delivery_id,
      region: r.region,
      city: r.city ?? "",
      hub: r.hub ?? "",
      driverId: r.driver_id,
      status: r.status,
      onTime: r.on_time,
      costInr: r.cost_inr == null ? null : Number(r.cost_inr),
      appVersion: r.app_version,
      crashRelated: Boolean(r.crash_related),
      promisedAt: r.promised_at ? new Date(r.promised_at).toISOString() : null,
      deliveredAt: r.delivered_at ? new Date(r.delivered_at).toISOString() : null,
      createdAt: new Date(r.created_at).toISOString(),
    }));
  });

export type PipelinePayload = {
  runs: RunRow[];
  lastChecks: QualityCheckResult[];
  sources: SourceHealth[];
  config: PipelineConfig;
  lastReportNotes: string | null;
};

export const getPipeline = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }): Promise<PipelinePayload> => {
    const sql = await getSql();
    await ensureProfile(context.userId);
    const runsRaw = await sql<{
      id: string;
      started_at: Date | string;
      finished_at: Date | string | null;
      status: RunRow["status"];
      triggered_by: string | null;
      trigger_type: string;
      bronze_rows: number;
      silver_rows: number;
      quarantined: number;
      quality_score: number | null;
      duration_ms: number | null;
      notes: string | null;
      error: string | null;
    }>`
      select id, started_at, finished_at, status, triggered_by, trigger_type,
             bronze_rows, silver_rows, quarantined, quality_score, duration_ms, notes, error
      from pipeline_runs order by started_at desc limit 18
    `;
    const runs = runsRaw.map(mapRun);
    const lastId = runs[0]?.id;
    const checks = lastId
      ? await sql<{
          check_name: string;
          source: string;
          passed: boolean;
          score: number;
          threshold: number;
          metric_value: number;
          message: string;
        }>`
          select check_name, source, passed, score, threshold, metric_value, message
          from quality_checks where run_id = ${lastId}
        `
      : [];
    const circuit = await getCircuit(sql);
    const lastBronze = lastId
      ? await sql<{ source: string; n: number }>`
          select source, count(*)::int as n from bronze_records where run_id = ${lastId} group by source
        `
      : [];
    const countFor = (s: string) => lastBronze.find((r) => r.source === s)?.n ?? 0;
    const lastStatus = runs[0]?.status;
    const trackingState =
      circuit === "open" ? "down" : lastStatus === "partial" && circuit !== "closed" ? "degraded" : "ok";
    const config = await loadConfig(sql);
    return {
      runs,
      lastChecks: checks.map((c) => ({
        checkName: c.check_name,
        source: c.source,
        passed: Boolean(c.passed),
        score: Number(c.score),
        threshold: Number(c.threshold),
        metricValue: Number(c.metric_value),
        message: c.message,
      })),
      sources: [
        { id: "warehouse", label: "Warehouse CSV", circuit: "closed", lastRows: countFor("warehouse") || runs[0]?.silverRows || 0, lastStatus: config.flags.dirtyNext || config.flags.driftNext ? "degraded" : "ok", lastNote: "S3 hub dumps · 8 regions" },
        { id: "tracking", label: "Tracking API", circuit, lastRows: countFor("tracking"), lastStatus: trackingState, lastNote: circuit === "open" ? "Circuit open — 503" : "httpx + retry" },
        { id: "mobile", label: "Driver app events", circuit: "closed", lastRows: countFor("mobile"), lastStatus: "ok", lastNote: "Crash + scan stream" },
        { id: "tickets", label: "Support tickets", circuit: "closed", lastRows: countFor("tickets"), lastStatus: "ok", lastNote: "Nightly export" },
      ],
      config,
      lastReportNotes: runs[0]?.notes ?? null,
    };
  });

export type QualityPayload = {
  checks: QualityCheckResult[];
  history: Array<{ runId: string; at: string; score: number; quarantined: number; status: string }>;
  quarantine: QuarantineRow[];
  score: number | null;
  config: PipelineConfig;
};

export const getQuality = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }): Promise<QualityPayload> => {
    const sql = await getSql();
    await ensureProfile(context.userId);
    const last = await sql<{ id: string; quality_score: number | null }>`
      select id, quality_score from pipeline_runs order by started_at desc limit 1
    `;
    const lastId = last[0]?.id;
    const checks = lastId
      ? await sql<{
          check_name: string;
          source: string;
          passed: boolean;
          score: number;
          threshold: number;
          metric_value: number;
          message: string;
        }>`select check_name, source, passed, score, threshold, metric_value, message from quality_checks where run_id = ${lastId}`
      : [];
    const hist = await sql<{
      id: string;
      started_at: Date | string;
      quality_score: number | null;
      quarantined: number;
      status: string;
    }>`
      select id, started_at, quality_score, quarantined, status
      from pipeline_runs where quality_score is not null
      order by started_at desc limit 12
    `;
    const qrows = await sql<{
      id: string;
      run_id: string;
      source: string;
      reason: string;
      check_name: string;
      raw: unknown;
      created_at: Date | string;
    }>`
      select id, run_id, source, reason, check_name, raw, created_at
      from quarantine order by created_at desc limit 24
    `;
    const config = await loadConfig(sql);
    return {
      checks: checks.map((c) => ({
        checkName: c.check_name,
        source: c.source,
        passed: Boolean(c.passed),
        score: Number(c.score),
        threshold: Number(c.threshold),
        metricValue: Number(c.metric_value),
        message: c.message,
      })),
      history: hist
        .map((h) => ({
          runId: h.id,
          at: new Date(h.started_at).toISOString(),
          score: Number(h.quality_score ?? 0),
          quarantined: Number(h.quarantined),
          status: h.status,
        }))
        .reverse(),
      quarantine: qrows.map((q) => ({
        id: q.id,
        runId: q.run_id,
        source: q.source,
        reason: q.reason,
        checkName: q.check_name,
        rawJson:
          typeof q.raw === "string" ? q.raw : JSON.stringify(q.raw ?? {}),
        createdAt: new Date(q.created_at).toISOString(),
      })),
      score: last[0]?.quality_score == null ? null : Number(last[0].quality_score),
      config,
    };
  });

export const getAlerts = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }): Promise<AlertRow[]> => {
    const sql = await getSql();
    await ensureProfile(context.userId);
    const rows = await sql<{
      id: string;
      created_at: Date | string;
      severity: AlertRow["severity"];
      kind: AlertRow["kind"];
      title: string;
      body: string;
      region: string | null;
      acknowledged: boolean;
    }>`
      select id, created_at, severity, kind, title, body, region, acknowledged
      from alerts order by acknowledged asc, created_at desc limit 40
    `;
    return rows.map((r) => ({
      id: r.id,
      createdAt: new Date(r.created_at).toISOString(),
      severity: r.severity,
      kind: r.kind,
      title: r.title,
      body: r.body,
      region: r.region,
      acknowledged: Boolean(r.acknowledged),
    }));
  });

export const ackAlert = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { id: string }) => input)
  .handler(async ({ context, data }) => {
    const sql = await getSql();
    await sql`
      update alerts set acknowledged = true, acknowledged_by = ${context.userId}, acknowledged_at = now()
      where id = ${data.id}
    `;
    return { ok: true };
  });

export const triggerRun = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { mode?: "manual" | "backfill" } = {}) => input)
  .handler(async ({ context, data }): Promise<PipelineRunReport> => {
    const sql = await getSql();
    await ensureProfile(context.userId);
    return runPipeline(sql, {
      triggeredBy: context.userId,
      triggerType: data.mode === "backfill" ? "manual" : "manual",
      consumeFlags: true,
      count: data.mode === "backfill" ? 200 : 110,
    });
  });

export const setInjectFlag = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { flag: "dirty" | "drift" | "outage"; value: boolean }) => input)
  .handler(async ({ context, data }) => {
    const sql = await getSql();
    await ensureProfile(context.userId);
    const patch =
      data.flag === "dirty"
        ? { dirtyNext: data.value }
        : data.flag === "drift"
          ? { driftNext: data.value }
          : { outageNext: data.value };
    await saveConfig(sql, patch, context.userId);
    await sql`
      insert into audit_log (id, user_id, action, detail)
      values (
        ${`aud_${Date.now().toString(36)}`},
        ${context.userId},
        'inject.flag',
        ${JSON.stringify(data)}::jsonb
      )
    `;
    return loadConfig(sql);
  });

export const updateThresholds = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { otdThreshold: number; nullDriverThreshold: number; freshnessMinutes: number; qualityMin: number }) => input)
  .handler(async ({ context, data }) => {
    const sql = await getSql();
    await saveConfig(sql, data, context.userId);
    await sql`
      insert into audit_log (id, user_id, action, detail)
      values (
        ${`aud_${Date.now().toString(36)}`},
        ${context.userId},
        'config.thresholds',
        ${JSON.stringify(data)}::jsonb
      )
    `;
    return loadConfig(sql);
  });

export type OperatorPayload = {
  config: PipelineConfig;
  circuit: "closed" | "open" | "half_open";
  audit: Array<{ id: string; at: string; userId: string | null; action: string; detail: string }>;
};

export const getOperator = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }): Promise<OperatorPayload> => {
    const sql = await getSql();
    await ensureProfile(context.userId);
    const config = await loadConfig(sql);
    const circuit = await getCircuit(sql);
    const audit = await sql<{
      id: string;
      at: Date | string;
      user_id: string | null;
      action: string;
      detail: unknown;
    }>`select id, at, user_id, action, detail from audit_log order by at desc limit 16`;
    return {
      config,
      circuit,
      audit: audit.map((a) => ({
        id: a.id,
        at: new Date(a.at).toISOString(),
        userId: a.user_id,
        action: a.action,
        detail: typeof a.detail === "string" ? a.detail : JSON.stringify(a.detail ?? null),
      })),
    };
  });
