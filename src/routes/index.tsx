import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight, GitBranch, ShieldCheck, Waypoints } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Mark } from "@/components/shell";
import { useCurrentUserState } from "@/lib/auth/use-current-user";

export const Route = createFileRoute("/")({ component: Landing });

function Landing() {
  const { user } = useCurrentUserState();
  return (
    <div className="min-h-dvh bg-bg">
      <header className="mx-auto flex max-w-5xl items-center justify-between px-5 py-5">
        <Mark />
        <div className="flex items-center gap-2">
          <Button variant="ghost" asChild>
            <Link to={user ? "/overview" : "/login"}>{user ? "Open control" : "Sign in"}</Link>
          </Button>
          <Button asChild>
            <Link to={user ? "/overview" : "/login"}>
              {user ? "Dashboard" : "Enter"}
              <ArrowRight className="size-4" />
            </Link>
          </Button>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-5 pb-20 pt-10 sm:pt-16">
        <p className="text-[11px] tracking-[0.18em] text-muted uppercase">SwiftRoute Logistics · India</p>
        <h1 className="mt-3 max-w-3xl font-display text-4xl leading-[1.08] tracking-tight sm:text-6xl">
          The board stopped trusting the dashboards. We rebuilt the pipe.
        </h1>
        <p className="mt-5 max-w-xl text-base text-muted sm:text-lg">
          Dirty warehouse CSVs, a flaky tracking API, incomplete driver events, and tickets.
          Medallion loads, quality gates, and one gold layer leadership can quote.
        </p>
        <div className="mt-8 flex flex-wrap gap-3">
          <Button size="lg" asChild>
            <Link to={user ? "/overview" : "/login"}>
              Open control room
              <ArrowRight className="size-4" />
            </Link>
          </Button>
          <Button size="lg" variant="outline" asChild>
            <Link to="/pipeline">See the pipeline</Link>
          </Button>
        </div>

        <dl className="mt-16 grid gap-4 sm:grid-cols-3">
          {[
            { k: "On-time (target)", v: "≥ 90%", d: "Breaches page the ops manager" },
            { k: "Pipeline success", v: "≥ 98%", d: "Retries, backoff, circuit breaker" },
            { k: "Quality score", v: "> 0.95", d: "Nulls, ranges, uniqueness, freshness" },
          ].map((s) => (
            <div key={s.k} className="rounded-xl bg-surface p-5 shadow-[var(--shadow-border)]">
              <dt className="text-xs tracking-wide text-muted uppercase">{s.k}</dt>
              <dd className="mt-2 font-display text-3xl tabular">{s.v}</dd>
              <dd className="mt-1 text-sm text-muted">{s.d}</dd>
            </div>
          ))}
        </dl>

        <section className="mt-16 grid gap-4 md:grid-cols-3">
          {[
            {
              icon: GitBranch,
              t: "Bronze → Silver → Gold",
              d: "Idempotent loads. Schema contracts. Quarantine instead of silent drops.",
            },
            {
              icon: ShieldCheck,
              t: "Quality before KPIs",
              d: "A red banner beats a green lie. Failed gates stay visible until acknowledged.",
            },
            {
              icon: Waypoints,
              t: "Inject friction",
              d: "Dirty CSV, schema drift, API outage — watch recovery from the Operator desk.",
            },
          ].map((c) => (
            <article key={c.t} className="rounded-xl bg-surface p-5 shadow-[var(--shadow-border)]">
              <c.icon className="size-5 text-forest" strokeWidth={1.6} />
              <h2 className="mt-3 font-display text-xl">{c.t}</h2>
              <p className="mt-1 text-sm text-muted">{c.d}</p>
            </article>
          ))}
        </section>
      </main>
    </div>
  );
}
