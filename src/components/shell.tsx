import { Link, useRouterState } from "@tanstack/react-router";
import {
  Activity,
  AlertTriangle,
  BarChart3,
  LayoutDashboard,
  Menu,
  PackageX,
  Shield,
  SlidersHorizontal,
  Truck,
} from "lucide-react";
import { useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { RedirectToSignIn } from "@/lib/auth/gates";
import { signOut } from "@/lib/auth/client";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { getAlerts, getProfile, setRole } from "@/lib/server/api";
import { ROLE_LABEL, ROLES, type Role } from "@/lib/pipeline/types";
import { cn } from "@/lib/utils";
import { Button } from "./ui/button";
import { Select } from "./ui/select";
import { Sheet } from "./ui/sheet";
import { Skeleton } from "./ui/skeleton";

const NAV = [
  { to: "/overview", label: "Overview", icon: LayoutDashboard, roles: ["ops", "exec", "engineer", "admin"] },
  { to: "/trends", label: "Trends", icon: BarChart3, roles: ["ops", "exec", "engineer", "admin"] },
  { to: "/deliveries", label: "Deliveries", icon: PackageX, roles: ["ops", "engineer", "admin"] },
  { to: "/pipeline", label: "Pipeline", icon: Activity, roles: ["engineer", "admin"] },
  { to: "/quality", label: "Quality", icon: Shield, roles: ["engineer", "admin", "ops"] },
  { to: "/alerts", label: "Alerts", icon: AlertTriangle, roles: ["ops", "exec", "engineer", "admin"] },
  { to: "/operator", label: "Operator", icon: SlidersHorizontal, roles: ["admin", "engineer"] },
] as const;

export function Mark({ className }: { className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-2", className)}>
      <span className="grid size-8 place-items-center rounded-sm bg-forest text-forest-fg">
        <Truck className="size-4" strokeWidth={1.75} />
      </span>
      <span className="leading-none">
        <span className="block font-display text-[1.05rem] tracking-tight">SwiftRoute</span>
        <span className="block text-[10px] tracking-[0.16em] text-muted uppercase">Control</span>
      </span>
    </span>
  );
}

function NavLinks({
  role,
  onNavigate,
  alertCount,
}: {
  role: Role;
  onNavigate?: () => void;
  alertCount: number;
}) {
  const path = useRouterState({ select: (s) => s.location.pathname });
  return (
    <nav className="flex flex-col gap-0.5">
      {NAV.filter((n) => (n.roles as readonly string[]).includes(role)).map((item) => {
        const active = path === item.to || path.startsWith(`${item.to}/`);
        const Icon = item.icon;
        return (
          <Link
            key={item.to}
            to={item.to}
            onClick={onNavigate}
            className={cn(
              "flex h-11 items-center gap-3 rounded-sm px-3 text-sm transition-colors duration-150",
              active ? "bg-sunken text-fg" : "text-muted hover:bg-sunken/70 hover:text-fg",
            )}
          >
            <Icon className="size-4 shrink-0" strokeWidth={1.75} />
            <span className="flex-1">{item.label}</span>
            {item.to === "/alerts" && alertCount > 0 ? (
              <span className="tabular rounded-full bg-bad px-1.5 text-[10px] font-medium text-surface">
                {alertCount}
              </span>
            ) : null}
          </Link>
        );
      })}
    </nav>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const { user, isPending } = useCurrentUserState();
  const [open, setOpen] = useState(false);
  const profile = useQuery({
    queryKey: ["profile"],
    queryFn: () => getProfile(),
    enabled: !!user,
  });
  const alerts = useQuery({
    queryKey: ["alerts"],
    queryFn: () => getAlerts(),
    enabled: !!user,
    refetchInterval: 20_000,
  });

  if (isPending) {
    return (
      <div className="flex min-h-dvh bg-bg">
        <aside className="hidden w-60 border-r border-border bg-surface p-5 md:block">
          <Skeleton className="h-8 w-36" />
          <div className="mt-8 space-y-2">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
          </div>
        </aside>
        <div className="flex-1 p-6">
          <Skeleton className="h-8 w-48" />
          <div className="mt-6 grid gap-3 sm:grid-cols-3">
            <Skeleton className="h-28" />
            <Skeleton className="h-28" />
            <Skeleton className="h-28" />
          </div>
        </div>
      </div>
    );
  }

  if (!user) return <RedirectToSignIn />;

  const role = profile.data?.role ?? "ops";
  const openAlerts = alerts.data?.filter((a) => !a.acknowledged).length ?? 0;

  async function onRole(next: string) {
    await setRole({ data: { role: next as Role } });
    await profile.refetch();
  }

  const sidebar = (
    <div className="flex h-full flex-col">
      <Link to="/overview" className="mb-6" onClick={() => setOpen(false)}>
        <Mark />
      </Link>
      <NavLinks role={role} alertCount={openAlerts} onNavigate={() => setOpen(false)} />
      <div className="mt-auto space-y-3 pt-6">
        <p className="text-[10px] tracking-[0.14em] text-faint uppercase">View as</p>
        <Select
          value={role}
          onValueChange={onRole}
          items={ROLES.map((r) => ({ value: r, label: ROLE_LABEL[r] }))}
          className="w-full"
        />
        <div className="rounded-md bg-sunken px-3 py-2">
          <p className="truncate text-sm font-medium">{user.displayName ?? "Signed in"}</p>
          <p className="truncate text-xs text-muted">{user.primaryEmail ?? ROLE_LABEL[role]}</p>
        </div>
        <Button variant="ghost" className="w-full justify-start" onClick={() => void signOut("/login")}>
          Sign out
        </Button>
      </div>
    </div>
  );

  return (
    <div className="flex min-h-dvh bg-bg">
      <aside className="sticky top-0 hidden h-dvh w-60 shrink-0 border-r border-border bg-surface p-5 md:flex md:flex-col">
        {sidebar}
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-border bg-bg/90 px-4 backdrop-blur-sm md:hidden">
          <button
            type="button"
            className="grid size-10 place-items-center rounded-sm hover:bg-sunken"
            onClick={() => setOpen(true)}
            aria-label="Open menu"
          >
            <Menu className="size-5" />
          </button>
          <Mark />
        </header>
        <Sheet open={open} onOpenChange={setOpen} title="Navigate">
          {sidebar}
        </Sheet>
        <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6 sm:px-6 sm:py-8">{children}</main>
      </div>
    </div>
  );
}

export function PageHead({
  kicker,
  title,
  aside,
}: {
  kicker?: string;
  title: string;
  aside?: ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-col gap-3 sm:mb-8 sm:flex-row sm:items-end sm:justify-between">
      <div>
        {kicker ? (
          <p className="mb-1 text-[11px] tracking-[0.16em] text-muted uppercase">{kicker}</p>
        ) : null}
        <h1 className="font-display text-3xl tracking-tight sm:text-4xl">{title}</h1>
      </div>
      {aside ? <div className="flex flex-wrap items-center gap-2">{aside}</div> : null}
    </div>
  );
}
