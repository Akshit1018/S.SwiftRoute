export const ROLES = ["ops", "exec", "engineer", "admin"] as const;
export type Role = (typeof ROLES)[number];

export const ROLE_LABEL: Record<Role, string> = {
  ops: "Ops Manager",
  exec: "Executive",
  engineer: "Mobile Engineer",
  admin: "System Admin",
};

export const REGIONS = [
  {
    id: "ncr",
    name: "NCR",
    cities: ["Delhi", "Gurugram", "Noida", "Faridabad"],
    hubs: ["Okhla", "Manesar", "Greater Noida"],
  },
  {
    id: "mumbai",
    name: "Mumbai",
    cities: ["Mumbai", "Thane", "Navi Mumbai"],
    hubs: ["Bhiwandi", "Andheri", "Kalamboli"],
  },
  {
    id: "blr",
    name: "Bengaluru",
    cities: ["Bengaluru", "Whitefield", "Electronic City"],
    hubs: ["Hoskote", "Bommasandra", "Yelahanka"],
  },
  {
    id: "hyd",
    name: "Hyderabad",
    cities: ["Hyderabad", "Secunderabad", "Gachibowli"],
    hubs: ["Shamshabad", "Kukatpally"],
  },
  {
    id: "pune",
    name: "Pune",
    cities: ["Pune", "Pimpri", "Hinjewadi"],
    hubs: ["Chakan", "Talegaon"],
  },
  {
    id: "jai",
    name: "Jaipur",
    cities: ["Jaipur", "Sitapura", "Vaishali Nagar"],
    hubs: ["Sitapura", "Jhotwara"],
  },
  {
    id: "kol",
    name: "Kolkata",
    cities: ["Kolkata", "Howrah", "Salt Lake"],
    hubs: ["Dhulagarh", "New Town"],
  },
  {
    id: "amd",
    name: "Ahmedabad",
    cities: ["Ahmedabad", "Gandhinagar", "Sanand"],
    hubs: ["Changodar", "Naroda"],
  },
] as const;

export type RegionId = (typeof REGIONS)[number]["id"];

export const APP_VERSIONS = ["4.12.1", "4.13.0", "4.13.2", "4.14.0-beta"] as const;

export const STATUSES = [
  "delivered",
  "delayed",
  "failed",
  "in_transit",
  "cancelled",
] as const;
export type DeliveryStatus = (typeof STATUSES)[number];

export type SourceId = "warehouse" | "tracking" | "mobile" | "tickets";

export type RunStatus = "running" | "success" | "failed" | "partial";

export type AlertSeverity = "critical" | "warning" | "info";
export type AlertKind =
  | "kpi_breach"
  | "quality_gate"
  | "pipeline_fail"
  | "schema_drift"
  | "freshness"
  | "circuit";

export type CircuitState = "closed" | "open" | "half_open";

export type PipelineFlags = {
  dirtyNext: boolean;
  driftNext: boolean;
  outageNext: boolean;
};

export type PipelineConfig = {
  otdThreshold: number;
  nullDriverThreshold: number;
  freshnessMinutes: number;
  qualityMin: number;
  flags: PipelineFlags;
};

export type QualityCheckResult = {
  checkName: string;
  source: string;
  passed: boolean;
  score: number;
  threshold: number;
  metricValue: number;
  message: string;
};

export type PipelineRunReport = {
  id: string;
  startedAt: string;
  finishedAt: string;
  status: RunStatus;
  triggeredBy: string;
  triggerType: string;
  bronzeRows: number;
  silverRows: number;
  quarantined: number;
  qualityScore: number;
  durationMs: number;
  notes: string;
  error: string | null;
  checks: QualityCheckResult[];
  sources: Array<{
    id: SourceId;
    label: string;
    status: "ok" | "degraded" | "down";
    rows: number;
    note: string;
  }>;
};

export type OverviewKpi = {
  day: string;
  deliveries: number;
  onTimeRate: number;
  failed: number;
  delayed: number;
  avgCost: number;
  crashCount: number;
  tickets: number;
  prevOnTimeRate: number;
  prevDeliveries: number;
};

export type RegionKpi = {
  region: string;
  regionName: string;
  deliveries: number;
  onTimeRate: number;
  failed: number;
  avgCost: number;
  crashCount: number;
};

export type DailyPoint = {
  day: string;
  deliveries: number;
  onTimeRate: number;
  failed: number;
  delayed: number;
  avgCost: number;
  crashCount: number;
  tickets: number;
};

export type DeliveryRow = {
  deliveryId: string;
  region: string;
  city: string;
  hub: string;
  driverId: string | null;
  status: DeliveryStatus;
  onTime: boolean | null;
  costInr: number | null;
  appVersion: string | null;
  crashRelated: boolean;
  promisedAt: string | null;
  deliveredAt: string | null;
  createdAt: string;
};

export type QuarantineRow = {
  id: string;
  runId: string;
  source: string;
  reason: string;
  checkName: string;
  rawJson: string;
  createdAt: string;
};

export type AlertRow = {
  id: string;
  createdAt: string;
  severity: AlertSeverity;
  kind: AlertKind;
  title: string;
  body: string;
  region: string | null;
  acknowledged: boolean;
};

export type RunRow = {
  id: string;
  startedAt: string;
  finishedAt: string | null;
  status: RunStatus;
  triggeredBy: string | null;
  triggerType: string;
  bronzeRows: number;
  silverRows: number;
  quarantined: number;
  qualityScore: number | null;
  durationMs: number | null;
  notes: string | null;
  error: string | null;
};

export type SourceHealth = {
  id: SourceId;
  label: string;
  circuit: CircuitState;
  lastRows: number;
  lastStatus: "ok" | "degraded" | "down";
  lastNote: string;
};

export type Profile = {
  userId: string;
  role: Role;
};
