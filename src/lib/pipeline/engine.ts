import type { Sql } from "@/lib/db";
import { id, mulberry32, pick, clamp } from "./rng";
import {
  APP_VERSIONS,
  REGIONS,
  type AlertKind,
  type AlertSeverity,
  type CircuitState,
  type DeliveryStatus,
  type PipelineConfig,
  type PipelineRunReport,
  type QualityCheckResult,
  type SourceId,
} from "./types";

const DEFAULT_CONFIG: PipelineConfig = {
  otdThreshold: 0.9,
  nullDriverThreshold: 0.05,
  freshnessMinutes: 15,
  qualityMin: 0.95,
  flags: { dirtyNext: false, driftNext: false, outageNext: false },
};

type RawRow = Record<string, unknown>;

type Silver = {
  deliveryId: string;
  runId: string;
  warehouseId: string | null;
  driverId: string | null;
  region: string;
  city: string;
  hub: string;
  status: DeliveryStatus;
  promisedAt: Date | null;
  deliveredAt: Date | null;
  onTime: boolean | null;
  costInr: number | null;
  weightKg: number | null;
  appVersion: string | null;
  crashRelated: boolean;
  createdAt: Date;
};

type SourceReport = PipelineRunReport["sources"][number];

const REGION_OTD: Record<string, number> = {
  ncr: 0.91,
  mumbai: 0.84,
  blr: 0.93,
  hyd: 0.92,
  pune: 0.9,
  jai: 0.95,
  kol: 0.86,
  amd: 0.93,
};

const REGION_COST: Record<string, number> = {
  ncr: 118,
  mumbai: 142,
  blr: 126,
  hyd: 108,
  pune: 112,
  jai: 88,
  kol: 96,
  amd: 94,
};

function dayKey(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function atHour(base: Date, hour: number, rand: () => number): Date {
  const d = new Date(base);
  d.setUTCHours(hour, Math.floor(rand() * 60), Math.floor(rand() * 60), 0);
  return d;
}

function startOfUtcDay(offsetDays: number, now = new Date()): Date {
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  d.setUTCDate(d.getUTCDate() + offsetDays);
  return d;
}

export async function loadConfig(sql: Sql): Promise<PipelineConfig> {
  const rows = await sql<{ key: string; value: string }>`select key, value from pipeline_config`;
  if (!rows.length) return { ...DEFAULT_CONFIG, flags: { ...DEFAULT_CONFIG.flags } };
  const map = Object.fromEntries(rows.map((r) => [r.key, r.value]));
  return {
    otdThreshold: Number(map.otd_threshold ?? DEFAULT_CONFIG.otdThreshold),
    nullDriverThreshold: Number(map.null_driver_threshold ?? DEFAULT_CONFIG.nullDriverThreshold),
    freshnessMinutes: Number(map.freshness_minutes ?? DEFAULT_CONFIG.freshnessMinutes),
    qualityMin: Number(map.quality_min ?? DEFAULT_CONFIG.qualityMin),
    flags: {
      dirtyNext: map.dirty_next === "1",
      driftNext: map.drift_next === "1",
      outageNext: map.outage_next === "1",
    },
  };
}

export async function saveConfig(
  sql: Sql,
  patch: Partial<{
    otdThreshold: number;
    nullDriverThreshold: number;
    freshnessMinutes: number;
    qualityMin: number;
    dirtyNext: boolean;
    driftNext: boolean;
    outageNext: boolean;
  }>,
  userId: string,
) {
  const pairs: Array<[string, string]> = [];
  if (patch.otdThreshold != null) pairs.push(["otd_threshold", String(patch.otdThreshold)]);
  if (patch.nullDriverThreshold != null)
    pairs.push(["null_driver_threshold", String(patch.nullDriverThreshold)]);
  if (patch.freshnessMinutes != null)
    pairs.push(["freshness_minutes", String(patch.freshnessMinutes)]);
  if (patch.qualityMin != null) pairs.push(["quality_min", String(patch.qualityMin)]);
  if (patch.dirtyNext != null) pairs.push(["dirty_next", patch.dirtyNext ? "1" : "0"]);
  if (patch.driftNext != null) pairs.push(["drift_next", patch.driftNext ? "1" : "0"]);
  if (patch.outageNext != null) pairs.push(["outage_next", patch.outageNext ? "1" : "0"]);
  for (const [key, value] of pairs) {
    await sql`
      insert into pipeline_config (key, value, updated_by, updated_at)
      values (${key}, ${value}, ${userId}, now())
      on conflict (key) do update set value = excluded.value, updated_by = excluded.updated_by, updated_at = now()
    `;
  }
}

async function writeAudit(sql: Sql, userId: string, action: string, detail: unknown) {
  await sql`
    insert into audit_log (id, user_id, action, detail)
    values (${`aud_${Date.now().toString(36)}_${Math.floor(Math.random() * 1e6).toString(36)}`}, ${userId}, ${action}, ${JSON.stringify(detail)}::jsonb)
  `;
}

function generateWarehouse(
  rand: () => number,
  day: Date,
  count: number,
  opts: { dirty: boolean; drift: boolean },
): RawRow[] {
  const rows: RawRow[] = [];
  for (let i = 0; i < count; i++) {
    const region = pick(rand, REGIONS);
    const city = pick(rand, region.cities);
    const hub = pick(rand, region.hubs);
    const shipmentId = `SHP-${region.id.toUpperCase()}-${dayKey(day).replaceAll("-", "").slice(2)}-${String(1000 + i).padStart(5, "0")}`;
    const missingDriver = opts.dirty ? rand() < 0.18 : rand() < 0.012;
    const badCost = opts.dirty && rand() < 0.08;
    const dup = opts.dirty && i > 4 && rand() < 0.04;
    const promised = atHour(day, 6 + Math.floor(rand() * 10), rand);
    const statusRoll = rand();
    let status: DeliveryStatus = "delivered";
    if (statusRoll > 0.97) status = "cancelled";
    else if (statusRoll > 0.94) status = "in_transit";
    else if (statusRoll > 0.89) status = "failed";
    else if (statusRoll > 0.8) status = "delayed";

    const otdBase = REGION_OTD[region.id] ?? 0.9;
    const late = status === "delivered" ? rand() > otdBase : status === "delayed";
    const delivered =
      status === "in_transit" || status === "cancelled"
        ? null
        : new Date(
            promised.getTime() +
              (late ? (2.5 + rand() * 7) * 3600_000 : (3 + rand() * 12) * 60_000),
          );

    const base: RawRow = {
      shipment_id: dup ? rows[i - 1]?.shipment_id : shipmentId,
      driver_id: missingDriver ? (rand() < 0.5 ? "" : null) : `DRV-${1000 + Math.floor(rand() * 420)}`,
      dest_city: city,
      region: opts.dirty && rand() < 0.06 ? pick(rand, ["DELHI NCR", "bom", "Banglore", "JP", region.id]) : region.id,
      hub,
      promised_ts: promised.toISOString(),
      delivered_ts: delivered ? delivered.toISOString() : "",
      status,
      cost: badCost ? pick(rand, [-12, 99999, "N/A", ""]) : Math.round((REGION_COST[region.id] ?? 110) * (0.7 + rand() * 0.7)),
      weight_kg: Math.round((1.2 + rand() * 8) * 10) / 10,
      warehouse_file: `wh_${region.id}_${dayKey(day)}.csv`,
    };

    if (opts.drift) {
      rows.push({
        shipmentId: base.shipment_id,
        rider_ref: base.driver_id,
        destination_city: base.dest_city,
        zone: base.region,
        node: base.hub,
        sla_ts: base.promised_ts,
        actual_ts: base.delivered_ts,
        state_code: status === "delivered" ? 1 : status === "failed" ? 9 : 3,
        fare_paise: typeof base.cost === "number" ? base.cost * 100 : null,
        kg: base.weight_kg,
      });
    } else {
      rows.push(base);
    }
  }
  return rows;
}

function generateTracking(rand: () => number, warehouse: RawRow[], outage: boolean): { rows: RawRow[]; down: boolean; note: string } {
  if (outage) {
    return { rows: [], down: true, note: "HTTP 503 from tracking.swifroute.in — circuit opened after 3 failures" };
  }
  const rows: RawRow[] = [];
  for (const w of warehouse) {
    if (rand() < 0.07) continue;
    const sid = (w.shipment_id ?? w.shipmentId) as string | undefined;
    rows.push({
      shipment_id: sid,
      last_ping: new Date(Date.now() - rand() * 40 * 60_000).toISOString(),
      lat: 18 + rand() * 10,
      lng: 72 + rand() * 10,
      battery: Math.round(20 + rand() * 80),
      http_status: rand() < 0.04 ? 429 : 200,
    });
  }
  const limited = rows.filter((r) => r.http_status === 429).length;
  return {
    rows,
    down: false,
    note: limited ? `${limited} events rate-limited (429), rest accepted` : "OK",
  };
}

function generateMobile(rand: () => number, count: number, day: Date): RawRow[] {
  const rows: RawRow[] = [];
  for (let i = 0; i < count; i++) {
    const region = pick(rand, REGIONS);
    const version = pick(rand, APP_VERSIONS);
    const isCrash = version === "4.14.0-beta" ? rand() < 0.11 : rand() < 0.018;
    rows.push({
      event_id: id("evt", rand),
      ts: atHour(day, 5 + Math.floor(rand() * 16), rand).toISOString(),
      region: region.id,
      app_version: version,
      event: isCrash ? "app_crash" : pick(rand, ["session_start", "scan_ok", "nav_reroute", "pod_photo"]),
      device: pick(rand, ["Pixel 7a", "Redmi Note 13", "Samsung M14", "moto g54", "iPhone 13"]),
    });
  }
  return rows;
}

function generateTickets(rand: () => number, count: number, day: Date): RawRow[] {
  const rows: RawRow[] = [];
  const subjects = [
    "Package marked delivered, customer denied",
    "Driver app crash at POD",
    "Wrong hub assignment",
    "COD amount mismatch",
    "Delayed beyond SLA — monsoon",
    "Unable to reach consignee",
  ];
  for (let i = 0; i < count; i++) {
    const region = pick(rand, REGIONS);
    rows.push({
      ticket_id: `SR-${44000 + Math.floor(rand() * 9000)}`,
      opened_at: atHour(day, 8 + Math.floor(rand() * 10), rand).toISOString(),
      region: region.id,
      priority: pick(rand, ["p1", "p2", "p3", "p3", "p2"]),
      subject: pick(rand, subjects),
      channel: pick(rand, ["app", "whatsapp", "call", "email"]),
    });
  }
  return rows;
}

function normalizeRegion(raw: unknown): string | null {
  if (typeof raw !== "string" || !raw.trim()) return null;
  const s = raw.trim().toLowerCase();
  if (["ncr", "delhi", "delhi ncr", "del", "gurugram", "noida"].includes(s)) return "ncr";
  if (["mumbai", "bom", "bombay", "thane"].includes(s)) return "mumbai";
  if (["blr", "bengaluru", "bangalore", "banglore"].includes(s)) return "blr";
  if (["hyd", "hyderabad"].includes(s)) return "hyd";
  if (["pune", "pnq"].includes(s)) return "pune";
  if (["jai", "jaipur", "jp"].includes(s)) return "jai";
  if (["kol", "kolkata", "calcutta", "ccu"].includes(s)) return "kol";
  if (["amd", "ahmedabad", "amdavad"].includes(s)) return "amd";
  if (REGIONS.some((r) => r.id === s)) return s;
  return null;
}

function parseCost(raw: unknown): number | null {
  if (typeof raw === "number" && Number.isFinite(raw) && raw > 0 && raw < 2000) return raw;
  if (typeof raw === "string" && raw.trim() && !Number.isNaN(Number(raw))) {
    const n = Number(raw);
    if (n > 0 && n < 2000) return n;
  }
  return null;
}

function parseTs(raw: unknown): Date | null {
  if (typeof raw !== "string" || !raw.trim()) return null;
  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? null : d;
}

function cleanWarehouse(raw: RawRow, runId: string, drifted: boolean): { silver?: Silver; quarantine?: { reason: string; check: string } } {
  const shipmentId = String(raw.shipment_id ?? raw.shipmentId ?? "");
  if (!shipmentId) return { quarantine: { reason: "Missing shipment_id after contract normalize", check: "required_fields" } };
  const region = normalizeRegion(raw.region ?? raw.zone);
  if (!region) return { quarantine: { reason: `Unknown region '${String(raw.region ?? raw.zone ?? "")}'`, check: "region_enum" } };
  const meta = REGIONS.find((r) => r.id === region)!;
  const cost = drifted
    ? typeof raw.fare_paise === "number"
      ? raw.fare_paise / 100
      : null
    : parseCost(raw.cost);
  if (cost == null && (raw.cost != null || raw.fare_paise != null)) {
    return { quarantine: { reason: `Cost out of range or unparseable: ${String(raw.cost ?? raw.fare_paise)}`, check: "cost_range" } };
  }
  const driverRaw = raw.driver_id ?? raw.rider_ref;
  const driverId = typeof driverRaw === "string" && driverRaw.trim() ? driverRaw.trim() : null;
  const promised = parseTs(raw.promised_ts ?? raw.sla_ts);
  const delivered = parseTs(raw.delivered_ts ?? raw.actual_ts);
  let status = String(raw.status ?? "") as DeliveryStatus;
  if (drifted && typeof raw.state_code === "number") {
    status = raw.state_code === 1 ? "delivered" : raw.state_code === 9 ? "failed" : "delayed";
  }
  if (!["delivered", "delayed", "failed", "in_transit", "cancelled"].includes(status)) {
    return { quarantine: { reason: `Unknown status '${status}'`, check: "status_enum" } };
  }
  const onTime =
    status === "delivered" && promised && delivered
      ? delivered.getTime() <= promised.getTime() + 30 * 60_000
      : status === "delivered"
        ? true
        : null;

  return {
    silver: {
      deliveryId: shipmentId,
      runId,
      warehouseId: String(raw.warehouse_file ?? raw.node ?? "unknown"),
      driverId,
      region,
      city: String(raw.dest_city ?? raw.destination_city ?? pick(() => 0.3, meta.cities)),
      hub: String(raw.hub ?? raw.node ?? meta.hubs[0]),
      status,
      promisedAt: promised,
      deliveredAt: delivered,
      onTime,
      costInr: cost,
      weightKg: typeof raw.weight_kg === "number" ? raw.weight_kg : typeof raw.kg === "number" ? raw.kg : null,
      appVersion: null,
      crashRelated: false,
      createdAt: promised ?? new Date(),
    },
  };
}

function runQualityGates(
  warehouse: RawRow[],
  silver: Silver[],
  quarantined: number,
  tracking: { rows: RawRow[]; down: boolean },
  mobile: RawRow[],
  drifted: boolean,
  config: PipelineConfig,
): QualityCheckResult[] {
  const nullDrivers = warehouse.filter((r) => {
    const d = r.driver_id ?? r.rider_ref;
    return d == null || d === "";
  }).length;
  const nullRate = warehouse.length ? nullDrivers / warehouse.length : 0;
  const ids = warehouse.map((r) => String(r.shipment_id ?? r.shipmentId ?? ""));
  const unique = new Set(ids.filter(Boolean)).size;
  const uniqRate = ids.length ? unique / ids.length : 1;
  const validCost = silver.filter((s) => s.costInr != null && s.costInr >= 20 && s.costInr <= 800).length;
  const costRate = silver.length ? validCost / silver.length : 1;
  const refHits = tracking.rows.filter((t) => silver.some((s) => s.deliveryId === t.shipment_id)).length;
  const refRate = tracking.rows.length ? refHits / tracking.rows.length : tracking.down ? 0 : 1;
  const crashShare = mobile.length ? mobile.filter((m) => m.event === "app_crash").length / mobile.length : 0;
  const passRate = silver.length + quarantined ? silver.length / (silver.length + quarantined) : 1;

  return [
    {
      checkName: "null_driver_id",
      source: "warehouse",
      passed: nullRate <= config.nullDriverThreshold,
      score: clamp(1 - nullRate / Math.max(config.nullDriverThreshold * 4, 0.01), 0, 1),
      threshold: config.nullDriverThreshold,
      metricValue: nullRate,
      message: `Null driver_id rate ${(nullRate * 100).toFixed(1)}% (max ${(config.nullDriverThreshold * 100).toFixed(0)}%)`,
    },
    {
      checkName: "shipment_uniqueness",
      source: "warehouse",
      passed: uniqRate >= 0.99,
      score: uniqRate,
      threshold: 0.99,
      metricValue: uniqRate,
      message: `Unique shipment_id ${(uniqRate * 100).toFixed(1)}%`,
    },
    {
      checkName: "cost_range",
      source: "warehouse",
      passed: costRate >= 0.97,
      score: costRate,
      threshold: 0.97,
      metricValue: costRate,
      message: `Costs in ₹20–800: ${(costRate * 100).toFixed(1)}%`,
    },
    {
      checkName: "schema_contract",
      source: "warehouse",
      passed: !drifted,
      score: drifted ? 0.2 : 1,
      threshold: 1,
      metricValue: drifted ? 0 : 1,
      message: drifted
        ? "Contract mismatch: shipment_id/driver_id/status renamed — rows normalized with warnings"
        : "Warehouse schema matches contract v3.2",
    },
    {
      checkName: "referential_tracking",
      source: "tracking",
      passed: tracking.down ? false : refRate >= 0.8,
      score: tracking.down ? 0 : refRate,
      threshold: 0.8,
      metricValue: tracking.down ? 0 : refRate,
      message: tracking.down ? "Tracking source down — referential check skipped (fail-closed)" : `Tracking pings matched ${(refRate * 100).toFixed(0)}% of silver rows`,
    },
    {
      checkName: "freshness",
      source: "orchestrator",
      passed: true,
      score: 1,
      threshold: config.freshnessMinutes,
      metricValue: 0,
      message: `Batch ingested inside ${config.freshnessMinutes}m freshness window`,
    },
    {
      checkName: "row_survival",
      source: "silver",
      passed: passRate >= 0.9,
      score: passRate,
      threshold: 0.9,
      metricValue: passRate,
      message: `${silver.length} cleaned / ${quarantined} quarantined (${(passRate * 100).toFixed(1)}% survival)`,
    },
    {
      checkName: "crash_share",
      source: "mobile",
      passed: crashShare < 0.08,
      score: clamp(1 - crashShare / 0.12, 0, 1),
      threshold: 0.08,
      metricValue: crashShare,
      message: `Crash events ${(crashShare * 100).toFixed(1)}% of mobile stream`,
    },
  ];
}

function qualityScore(checks: QualityCheckResult[]): number {
  if (!checks.length) return 1;
  return checks.reduce((a, c) => a + c.score, 0) / checks.length;
}

async function insertBronze(sql: Sql, runId: string, source: SourceId, rows: RawRow[]) {
  if (!rows.length) return;
  const chunk = 40;
  for (let i = 0; i < rows.length; i += chunk) {
    const part = rows.slice(i, i + chunk);
    const values: unknown[] = [];
    const placeholders = part.map((raw, idx) => {
      const base = idx * 5;
      values.push(id("brz", Math.random), runId, source, new Date().toISOString(), JSON.stringify(raw));
      return `($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4}, $${base + 5}::jsonb)`;
    });
    await sql.query(
      `insert into bronze_records (id, run_id, source, ingested_at, raw) values ${placeholders.join(",")}`,
      values,
    );
  }
}

async function insertSilver(sql: Sql, rows: Silver[]) {
  if (!rows.length) return;
  const chunk = 25;
  for (let i = 0; i < rows.length; i += chunk) {
    const part = rows.slice(i, i + chunk);
    const values: unknown[] = [];
    const placeholders = part.map((s, idx) => {
      const b = idx * 16;
      values.push(
        s.deliveryId,
        s.runId,
        s.warehouseId,
        s.driverId,
        s.region,
        s.city,
        s.hub,
        s.status,
        s.promisedAt ? s.promisedAt.toISOString() : null,
        s.deliveredAt ? s.deliveredAt.toISOString() : null,
        s.onTime,
        s.costInr,
        s.weightKg,
        s.appVersion,
        s.crashRelated,
        s.createdAt.toISOString(),
      );
      return `($${b + 1},$${b + 2},$${b + 3},$${b + 4},$${b + 5},$${b + 6},$${b + 7},$${b + 8},$${b + 9},$${b + 10},$${b + 11},$${b + 12},$${b + 13},$${b + 14},$${b + 15},$${b + 16})`;
    });
    await sql.query(
      `insert into silver_deliveries (
        delivery_id, run_id, warehouse_id, driver_id, region, city, hub, status,
        promised_at, delivered_at, on_time, cost_inr, weight_kg, app_version, crash_related, created_at
      ) values ${placeholders.join(",")}
      on conflict (delivery_id) do update set
        run_id = excluded.run_id,
        status = excluded.status,
        delivered_at = excluded.delivered_at,
        on_time = excluded.on_time,
        cost_inr = excluded.cost_inr,
        crash_related = excluded.crash_related`,
      values,
    );
  }
}

async function insertQuarantine(
  sql: Sql,
  runId: string,
  rows: Array<{ reason: string; check: string; raw: RawRow }>,
) {
  if (!rows.length) return;
  const chunk = 25;
  for (let i = 0; i < rows.length; i += chunk) {
    const part = rows.slice(i, i + chunk);
    const values: unknown[] = [];
    const placeholders = part.map((r, idx) => {
      const b = idx * 6;
      values.push(id("q", Math.random), runId, "warehouse", r.reason, r.check, JSON.stringify(r.raw));
      return `($${b + 1},$${b + 2},$${b + 3},$${b + 4},$${b + 5},$${b + 6}::jsonb)`;
    });
    await sql.query(
      `insert into quarantine (id, run_id, source, reason, check_name, raw) values ${placeholders.join(",")}`,
      values,
    );
  }
}

async function refreshGold(sql: Sql, days: string[]) {
  for (const day of days) {
    await sql.query(`delete from gold_daily_kpis where day = $1`, [day]);
    await sql.query(
      `insert into gold_daily_kpis (day, region, deliveries, on_time, failed, delayed, avg_cost, crash_count, tickets)
       select $1, region, count(*)::int,
              count(*) filter (where on_time is true)::int,
              count(*) filter (where status = 'failed')::int,
              count(*) filter (where status = 'delayed')::int,
              coalesce(avg(cost_inr), 0),
              count(*) filter (where crash_related)::int,
              0
       from silver_deliveries
       where created_at >= ($1::timestamp) and created_at < (($1::timestamp) + interval '1 day')
       group by region`,
      [day],
    );
  }
}

async function addAlert(
  sql: Sql,
  severity: AlertSeverity,
  kind: AlertKind,
  title: string,
  body: string,
  region: string | null = null,
) {
  await sql`
    insert into alerts (id, severity, kind, title, body, region)
    values (${id("alrt", Math.random)}, ${severity}, ${kind}, ${title}, ${body}, ${region})
  `;
}

async function setCircuit(sql: Sql, state: CircuitState, userId: string) {
  await sql`
    insert into pipeline_config (key, value, updated_by)
    values ('tracking_circuit', ${state}, ${userId})
    on conflict (key) do update set value = excluded.value, updated_at = now()
  `;
}

export async function getCircuit(sql: Sql): Promise<CircuitState> {
  const rows = await sql<{ value: string }>`select value from pipeline_config where key = 'tracking_circuit'`;
  const v = rows[0]?.value;
  if (v === "open" || v === "half_open" || v === "closed") return v;
  return "closed";
}

export async function runPipeline(
  sql: Sql,
  opts: {
    triggeredBy: string;
    triggerType: "schedule" | "manual" | "inject" | "seed";
    day?: Date;
    count?: number;
    consumeFlags?: boolean;
    force?: Partial<PipelineConfig["flags"]>;
    persistBronzeLimit?: number;
  },
): Promise<PipelineRunReport> {
  const started = Date.now();
  const runId = `run_${new Date().toISOString().replace(/[-:.TZ]/g, "").slice(0, 14)}_${Math.floor(Math.random() * 46656).toString(36)}`;
  const config = await loadConfig(sql);
  const flags = {
    dirtyNext: opts.force?.dirtyNext ?? (opts.consumeFlags ? config.flags.dirtyNext : false),
    driftNext: opts.force?.driftNext ?? (opts.consumeFlags ? config.flags.driftNext : false),
    outageNext: opts.force?.outageNext ?? (opts.consumeFlags ? config.flags.outageNext : false),
  };
  const day = opts.day ?? startOfUtcDay(0);
  const rand = mulberry32((day.getTime() / 86400000 + started) | 0);
  const count = opts.count ?? 90 + Math.floor(rand() * 40);

  await sql`
    insert into pipeline_runs (id, started_at, status, triggered_by, trigger_type)
    values (${runId}, ${new Date(started).toISOString()}, 'running', ${opts.triggeredBy}, ${opts.triggerType})
  `;

  const warehouse = generateWarehouse(rand, day, count, { dirty: flags.dirtyNext, drift: flags.driftNext });
  const tracking = generateTracking(rand, warehouse, flags.outageNext);
  const mobile = generateMobile(rand, Math.round(count * 0.55), day);
  const tickets = generateTickets(rand, 6 + Math.floor(rand() * 8), day);

  const bronzeKeep = opts.persistBronzeLimit ?? 40;
  await insertBronze(sql, runId, "warehouse", warehouse.slice(0, bronzeKeep));
  await insertBronze(sql, runId, "tracking", tracking.rows.slice(0, Math.min(20, tracking.rows.length)));
  await insertBronze(sql, runId, "mobile", mobile.slice(0, 16));
  await insertBronze(sql, runId, "tickets", tickets);

  const seen = new Set<string>();
  const silver: Silver[] = [];
  const quarantineBatch: Array<{ reason: string; check: string; raw: RawRow }> = [];
  for (const raw of warehouse) {
    const cleaned = cleanWarehouse(raw, runId, flags.driftNext);
    if (cleaned.quarantine) {
      quarantineBatch.push({ ...cleaned.quarantine, raw });
      continue;
    }
    const row = cleaned.silver!;
    if (seen.has(row.deliveryId)) {
      quarantineBatch.push({
        reason: `Duplicate shipment_id ${row.deliveryId}`,
        check: "shipment_uniqueness",
        raw,
      });
      continue;
    }
    seen.add(row.deliveryId);
    const crashHit = mobile.some((m) => m.event === "app_crash" && m.region === row.region && rand() < 0.12);
    if (crashHit) {
      row.crashRelated = true;
      row.appVersion = "4.14.0-beta";
    } else {
      row.appVersion = pick(rand, APP_VERSIONS);
    }
    silver.push(row);
  }
  const quarantined = quarantineBatch.length;
  await insertQuarantine(sql, runId, quarantineBatch.slice(0, 80));
  await insertSilver(sql, silver);

  const ticketDay = dayKey(day);
  await refreshGold(sql, [ticketDay]);
  const ticketsByRegion = new Map<string, number>();
  for (const t of tickets) {
    const r = String(t.region);
    ticketsByRegion.set(r, (ticketsByRegion.get(r) ?? 0) + 1);
  }
  for (const [region, n] of ticketsByRegion) {
    const updated = await sql.query(`update gold_daily_kpis set tickets = $1 where day = $2 and region = $3`, [
      n,
      ticketDay,
      region,
    ]);
    void updated;
    const exists = await sql.query(`select 1 from gold_daily_kpis where day = $1 and region = $2`, [ticketDay, region]);
    if (!exists.length) {
      await sql.query(
        `insert into gold_daily_kpis (day, region, deliveries, on_time, failed, delayed, avg_cost, crash_count, tickets)
         values ($1, $2, 0, 0, 0, 0, 0, 0, $3)`,
        [ticketDay, region, n],
      );
    }
  }

  const checks = runQualityGates(warehouse, silver, quarantined, tracking, mobile, flags.driftNext, config);
  const score = qualityScore(checks);
  for (const c of checks) {
    await sql`
      insert into quality_checks (id, run_id, check_name, source, passed, score, threshold, metric_value, message)
      values (${id("qc", Math.random)}, ${runId}, ${c.checkName}, ${c.source}, ${c.passed}, ${c.score}, ${c.threshold}, ${c.metricValue}, ${c.message})
    `;
  }

  const failedChecks = checks.filter((c) => !c.passed);
  let status: PipelineRunReport["status"] = "success";
  let notes = "Medallion load complete. Gold refreshed.";
  const error: string | null = null;

  if (tracking.down) {
    await setCircuit(sql, "open", opts.triggeredBy);
    status = "partial";
    notes = "Tracking API circuit OPEN. Warehouse + mobile loaded; tracking skipped.";
    await addAlert(
      sql,
      "critical",
      "circuit",
      "Tracking API circuit opened",
      "tracking.swifroute.in returned 503. Extractor backed off. Deliveries still loaded from warehouse CSV; live pings missing.",
    );
  } else {
    const circuit = await getCircuit(sql);
    if (circuit === "open") await setCircuit(sql, "half_open", opts.triggeredBy);
    else if (circuit === "half_open") await setCircuit(sql, "closed", opts.triggeredBy);
  }

  if (flags.driftNext) {
    status = status === "success" ? "partial" : status;
    notes = "Schema drift detected on warehouse extract. Rows remapped via compatibility layer.";
    await addAlert(
      sql,
      "warning",
      "schema_drift",
      "Warehouse schema drift",
      "Contract v3.2 expected shipment_id, driver_id, status. Received shipmentId, rider_ref, state_code. Compatibility mapper engaged; survival dropped.",
    );
  }

  if (score < config.qualityMin || failedChecks.some((c) => c.checkName === "null_driver_id")) {
    status = "partial";
    await addAlert(
      sql,
      "critical",
      "quality_gate",
      `Quality gate failed — score ${(score * 100).toFixed(0)}`,
      failedChecks.map((c) => c.message).join(" · ") || `Quality score ${score.toFixed(2)} below ${config.qualityMin}`,
    );
  }

  const goldToday = await sql.query<{ on_time: number; deliveries: number; region: string }>(
    `select region, on_time, deliveries from gold_daily_kpis where day = $1`,
    [ticketDay],
  );
  const totD = goldToday.reduce((a, r) => a + Number(r.deliveries), 0);
  const totO = goldToday.reduce((a, r) => a + Number(r.on_time), 0);
  const otd = totD ? totO / totD : 1;
  if (otd < config.otdThreshold && totD > 20) {
    const worst = [...goldToday].sort(
      (a, b) => a.on_time / Math.max(1, a.deliveries) - b.on_time / Math.max(1, b.deliveries),
    )[0];
    await addAlert(
      sql,
      "warning",
      "kpi_breach",
      `On-time delivery ${(otd * 100).toFixed(1)}% below ${(config.otdThreshold * 100).toFixed(0)}%`,
      worst
        ? `Weakest region ${worst.region.toUpperCase()} at ${((Number(worst.on_time) / Math.max(1, Number(worst.deliveries))) * 100).toFixed(0)}% OTD.`
        : "Company OTD breached configured threshold.",
      worst?.region ?? null,
    );
  }

  if (opts.consumeFlags) {
    await saveConfig(sql, { dirtyNext: false, driftNext: false, outageNext: false }, opts.triggeredBy);
  }

  const durationMs = Date.now() - started;
  const bronzeRows = warehouse.length + tracking.rows.length + mobile.length + tickets.length;
  await sql`
    update pipeline_runs
    set finished_at = now(), status = ${status}, bronze_rows = ${bronzeRows},
        silver_rows = ${silver.length}, quarantined = ${quarantined},
        quality_score = ${score}, duration_ms = ${durationMs}, notes = ${notes}, error = ${error}
    where id = ${runId}
  `;

  await writeAudit(sql, opts.triggeredBy, "pipeline.run", {
    runId,
    status,
    flags,
    bronzeRows,
    silver: silver.length,
    quarantined,
    score,
  });

  const sources: SourceReport[] = [
    {
      id: "warehouse",
      label: "Warehouse CSV",
      status: flags.dirtyNext || flags.driftNext ? "degraded" : "ok",
      rows: warehouse.length,
      note: flags.driftNext ? "Schema drift remapped" : flags.dirtyNext ? "High null / duplicate rate" : "Nightly hub dumps",
    },
    {
      id: "tracking",
      label: "Tracking API",
      status: tracking.down ? "down" : tracking.note.includes("429") ? "degraded" : "ok",
      rows: tracking.rows.length,
      note: tracking.note,
    },
    {
      id: "mobile",
      label: "Driver app events",
      status: mobile.filter((m) => m.event === "app_crash").length > mobile.length * 0.08 ? "degraded" : "ok",
      rows: mobile.length,
      note: "Firebase-style event stream",
    },
    {
      id: "tickets",
      label: "Support tickets",
      status: "ok",
      rows: tickets.length,
      note: "Zendesk export",
    },
  ];

  return {
    id: runId,
    startedAt: new Date(started).toISOString(),
    finishedAt: new Date().toISOString(),
    status,
    triggeredBy: opts.triggeredBy,
    triggerType: opts.triggerType,
    bronzeRows,
    silverRows: silver.length,
    quarantined,
    qualityScore: score,
    durationMs,
    notes,
    error,
    checks,
    sources,
  };
}

async function seedGoldHistory(sql: Sql) {
  const rand = mulberry32(20260813);
  for (let offset = -10; offset <= -1; offset++) {
    const day = startOfUtcDay(offset);
    const key = dayKey(day);
    for (const region of REGIONS) {
      const monsoon = (region.id === "mumbai" || region.id === "kol") && day.getUTCMonth() === 7;
      const baseOtd = (REGION_OTD[region.id] ?? 0.9) - (monsoon ? 0.06 : 0) + (rand() - 0.5) * 0.04;
      const deliveries = 12 + Math.floor(rand() * 10);
      const onTime = Math.round(deliveries * clamp(baseOtd, 0.72, 0.98));
      const failed = Math.round(deliveries * (0.03 + rand() * 0.04));
      const delayed = Math.max(0, deliveries - onTime - failed - Math.round(deliveries * 0.04));
      const avgCost = (REGION_COST[region.id] ?? 110) * (0.92 + rand() * 0.16);
      const crashCount = Math.floor(rand() * 4) + (rand() < 0.2 ? 3 : 0);
      const tickets = 1 + Math.floor(rand() * 6);
      await sql.query(
        `insert into gold_daily_kpis (day, region, deliveries, on_time, failed, delayed, avg_cost, crash_count, tickets)
         values ($1, $2, $3, $4, $5, $6, $7, $8, $9)
         on conflict (day, region) do nothing`,
        [key, region.id, deliveries, onTime, failed, delayed, avgCost, crashCount, tickets],
      );
    }
    await sql.query(
      `insert into pipeline_runs (
        id, started_at, finished_at, status, triggered_by, trigger_type,
        bronze_rows, silver_rows, quarantined, quality_score, duration_ms, notes
      ) values ($1,$2,$3,'success','scheduler','schedule',$4,$5,$6,$7,$8,$9)
      on conflict (id) do nothing`,
      [
        `run_hist_${key}`,
        new Date(day.getTime() + 18 * 3600_000).toISOString(),
        new Date(day.getTime() + 18 * 3600_000 + 14000).toISOString(),
        180 + Math.floor(rand() * 40),
        150 + Math.floor(rand() * 30),
        2 + Math.floor(rand() * 4),
        0.96 + rand() * 0.03,
        11000 + Math.floor(rand() * 6000),
        "Scheduled 18:00 IST warehouse + API pull",
      ],
    );
  }
}

const seedLock: { current: Promise<void> | null } = { current: null };

export async function ensureSeeded(sql: Sql): Promise<void> {
  const existing = await sql`select 1 as ok from pipeline_runs limit 1`;
  if (existing.length) return;
  if (!seedLock.current) {
    seedLock.current = (async () => {
      const again = await sql`select 1 as ok from pipeline_runs limit 1`;
      if (again.length) return;
      await saveConfig(
        sql,
        {
          otdThreshold: 0.9,
          nullDriverThreshold: 0.05,
          freshnessMinutes: 15,
          qualityMin: 0.95,
          dirtyNext: false,
          driftNext: false,
          outageNext: false,
        },
        "system",
      );
      await setCircuit(sql, "closed", "system");
      await seedGoldHistory(sql);
      await runPipeline(sql, {
        triggeredBy: "system",
        triggerType: "seed",
        day: startOfUtcDay(-1),
        count: 96,
        persistBronzeLimit: 16,
      });
      await runPipeline(sql, {
        triggeredBy: "system",
        triggerType: "seed",
        day: startOfUtcDay(0),
        count: 88,
        persistBronzeLimit: 16,
      });
      await addAlert(
        sql,
        "info",
        "freshness",
        "Control room seeded",
        "Historical gold (10 days) plus yesterday and today silver are live. Inject a dirty batch from Operator to watch a quality gate fail.",
      );
    })().finally(() => {
      seedLock.current = null;
    });
  }
  await seedLock.current;
}
