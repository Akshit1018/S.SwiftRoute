create table if not exists user_profiles (
  user_id    text primary key,
  role       text not null default 'ops',
  created_at timestamptz not null default now()
);

create table if not exists pipeline_config (
  key        text primary key,
  value      text not null,
  updated_by text,
  updated_at timestamptz not null default now()
);

create table if not exists pipeline_runs (
  id            text primary key,
  started_at    timestamptz not null,
  finished_at   timestamptz,
  status        text not null,
  triggered_by  text,
  trigger_type  text not null,
  bronze_rows   integer not null default 0,
  silver_rows   integer not null default 0,
  quarantined   integer not null default 0,
  quality_score double precision,
  duration_ms   integer,
  notes         text,
  error         text
);

create index if not exists pipeline_runs_started_idx on pipeline_runs (started_at desc);

create table if not exists quality_checks (
  id           text primary key,
  run_id       text not null,
  check_name   text not null,
  source       text not null,
  passed       boolean not null,
  score        double precision not null,
  threshold    double precision not null,
  metric_value double precision not null,
  message      text not null,
  created_at   timestamptz not null default now()
);

create index if not exists quality_checks_run_idx on quality_checks (run_id);

create table if not exists bronze_records (
  id          text primary key,
  run_id      text not null,
  source      text not null,
  ingested_at timestamptz not null,
  raw         jsonb not null
);

create index if not exists bronze_run_idx on bronze_records (run_id);
create index if not exists bronze_source_idx on bronze_records (source);

create table if not exists quarantine (
  id         text primary key,
  run_id     text not null,
  source     text not null,
  reason     text not null,
  check_name text not null,
  raw        jsonb not null,
  created_at timestamptz not null default now()
);

create index if not exists quarantine_run_idx on quarantine (run_id);

create table if not exists silver_deliveries (
  delivery_id    text primary key,
  run_id         text not null,
  warehouse_id   text,
  driver_id      text,
  region         text not null,
  city           text,
  hub            text,
  status         text not null,
  promised_at    timestamptz,
  delivered_at   timestamptz,
  on_time        boolean,
  cost_inr       double precision,
  weight_kg      double precision,
  app_version    text,
  crash_related  boolean not null default false,
  created_at     timestamptz not null
);

create index if not exists silver_region_idx on silver_deliveries (region);
create index if not exists silver_status_idx on silver_deliveries (status);
create index if not exists silver_created_idx on silver_deliveries (created_at desc);

create table if not exists gold_daily_kpis (
  day          date not null,
  region       text not null,
  deliveries   integer not null,
  on_time      integer not null,
  failed       integer not null,
  delayed      integer not null,
  avg_cost     double precision not null,
  crash_count  integer not null,
  tickets      integer not null,
  primary key (day, region)
);

create table if not exists alerts (
  id              text primary key,
  created_at      timestamptz not null default now(),
  severity        text not null,
  kind            text not null,
  title           text not null,
  body            text not null,
  region          text,
  acknowledged    boolean not null default false,
  acknowledged_by text,
  acknowledged_at timestamptz
);

create index if not exists alerts_open_idx on alerts (acknowledged, created_at desc);

create table if not exists audit_log (
  id      text primary key,
  at      timestamptz not null default now(),
  user_id text,
  action  text not null,
  detail  jsonb
);

create index if not exists audit_at_idx on audit_log (at desc);
