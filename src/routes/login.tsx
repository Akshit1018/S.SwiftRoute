import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState, type FormEvent } from "react";
import { GROK_PROVIDERS, authClient, authEnabled, signIn } from "@/lib/auth/client";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Mark } from "@/components/shell";
import { toast } from "sonner";

export const Route = createFileRoute("/login")({ component: Login });

function Login() {
  const { user, isPending } = useCurrentUserState();
  const nav = useNavigate();
  const [mode, setMode] = useState<"in" | "up">("in");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);

  if (!isPending && user) {
    void nav({ to: "/overview" });
  }

  async function onEmail(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      if (mode === "up") {
        const res = await authClient.signUp.email({ email, password, name: name || email.split("@")[0] });
        if (res.error) throw new Error(res.error.message ?? "Sign-up failed");
      } else {
        const res = await authClient.signIn.email({ email, password });
        if (res.error) throw new Error(res.error.message ?? "Sign-in failed");
      }
      await nav({ to: "/overview" });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not authenticate");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="grid min-h-dvh lg:grid-cols-2">
      <section className="relative hidden flex-col justify-between bg-forest px-10 py-10 text-forest-fg lg:flex">
        <Link to="/">
          <span className="inline-flex items-center gap-2">
            <span className="grid size-8 place-items-center rounded-sm bg-forest-fg/10">
              <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth="1.75">
                <path d="M3 13h4l2-6 2 11 2-8h6" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </span>
            <span className="font-display text-xl">SwiftRoute</span>
          </span>
        </Link>
        <div className="max-w-md">
          <p className="text-[11px] tracking-[0.18em] uppercase opacity-70">Customer engagement</p>
          <h1 className="mt-3 font-display text-4xl leading-[1.1] tracking-tight">
            One trusted number for on-time, cost, and crash.
          </h1>
          <p className="mt-4 text-sm leading-relaxed text-forest-fg/75">
            Warehouse CSVs, a flaky tracking API, driver-app events, and tickets land in bronze.
            Quality gates decide what reaches gold. Leadership stops arguing about whose spreadsheet
            is right.
          </p>
        </div>
        <p className="text-xs text-forest-fg/50">SwiftRoute Logistics · Last-mile · IN</p>
      </section>

      <section className="flex flex-col justify-center px-5 py-10 sm:px-10">
        <div className="mx-auto w-full max-w-sm">
          <div className="mb-8 lg:hidden">
            <Mark />
          </div>
          <h2 className="font-display text-3xl tracking-tight">Sign in</h2>
          <p className="mt-1 text-sm text-muted">Ops, exec, engineer, or admin — pick a view after you enter.</p>

          {authEnabled ? (
            <div className="mt-6 space-y-2">
              {GROK_PROVIDERS.map((p) => (
                <Button
                  key={p.providerId}
                  type="button"
                  variant="outline"
                  className="w-full"
                  onClick={() => void signIn(p.providerId, { callbackURL: "/overview" })}
                >
                  Continue with {p.label}
                </Button>
              ))}
            </div>
          ) : (
            <p className="mt-6 text-sm text-muted">Sign-in is disabled.</p>
          )}

          <div className="my-6 flex items-center gap-3 text-xs text-faint">
            <span className="h-px flex-1 bg-border" />
            or email
            <span className="h-px flex-1 bg-border" />
          </div>

          <form className="space-y-3" onSubmit={onEmail}>
            {mode === "up" ? (
              <div className="space-y-1.5">
                <Label htmlFor="name">Name</Label>
                <Input id="name" value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" />
              </div>
            ) : null}
            <div className="space-y-1.5">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="email"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                required
                minLength={8}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete={mode === "up" ? "new-password" : "current-password"}
              />
            </div>
            <Button type="submit" className="w-full" disabled={busy}>
              {busy ? "Working…" : mode === "up" ? "Create account" : "Sign in with email"}
            </Button>
          </form>

          <button
            type="button"
            className="mt-4 text-sm text-muted underline-offset-4 hover:underline"
            onClick={() => setMode(mode === "up" ? "in" : "up")}
          >
            {mode === "up" ? "Already have an account? Sign in" : "Need an account? Create one"}
          </button>
        </div>
      </section>
    </main>
  );
}
