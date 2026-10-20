/* Application shell: collapsible desktop sidebar + mobile navigation drawer.
 *
 * Also carries the always-visible honesty labels (Demo Simulation /
 * demonstration data) and the demo-data reset control.
 */
import {
  AlertTriangle, BarChart3, Database, LayoutDashboard, Leaf, Menu, Network,
  Radio, RotateCcw, Sprout, Warehouse, X, type LucideIcon,
} from "lucide-react";
import { useEffect, useState } from "react";
import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { api } from "../lib/api";
import { useApi, useMutation } from "../lib/hooks";
import { Badge, Button, ConfirmDialog, Spinner, useToast } from "./ui";

interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
  group: string;
}

const NAV: NavItem[] = [
  { to: "/", label: "Dashboard", icon: LayoutDashboard, group: "Overview" },
  { to: "/directory", label: "Seed Banks", icon: Warehouse, group: "Overview" },
  { to: "/inventory", label: "Seed Inventory", icon: Sprout, group: "Conservation" },
  { to: "/analytics", label: "Analytics", icon: BarChart3, group: "Conservation" },
  { to: "/monitoring", label: "IoT Monitoring", icon: Radio, group: "Operations" },
  { to: "/alerts", label: "Alerts & Risk", icon: AlertTriangle, group: "Operations" },
  { to: "/rescue", label: "Seed Rescue Network", icon: Network, group: "Rescue" },
  { to: "/simulation", label: "Rescue Simulation", icon: Leaf, group: "Rescue" },
];

const GROUPS = ["Overview", "Conservation", "Operations", "Rescue"];

function NavLinks({ collapsed, onNavigate }: { collapsed: boolean; onNavigate?: () => void }) {
  const location = useLocation();
  return (
    <nav className="flex-1 space-y-5 overflow-y-auto px-3 py-4">
      {GROUPS.map((group) => (
        <div key={group}>
          {!collapsed && (
            <p className="mb-1.5 px-2 text-[10.5px] font-semibold uppercase tracking-[0.09em] text-forest-300">
              {group}
            </p>
          )}
          <ul className="space-y-1">
            {NAV.filter((item) => item.group === group).map((item) => {
              const active =
                item.to === "/"
                  ? location.pathname === "/"
                  : location.pathname.startsWith(item.to);
              return (
                <li key={item.to}>
                  <NavLink
                    to={item.to}
                    onClick={onNavigate}
                    title={collapsed ? item.label : undefined}
                    className={`group flex items-center gap-3 rounded-lg px-2.5 py-2 text-[13px] font-medium transition-colors ${
                      active
                        ? "bg-forest-800 text-white shadow-[inset_0_0_0_1px_rgba(255,255,255,0.06)]"
                        : "text-forest-100/85 hover:bg-forest-800/70 hover:text-white"
                    } ${collapsed ? "justify-center" : ""}`}
                  >
                    <item.icon size={17} className="shrink-0" />
                    {!collapsed && <span className="truncate">{item.label}</span>}
                  </NavLink>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );
}

export default function Layout() {
  const [collapsed, setCollapsed] = useState(
    () => localStorage.getItem("seedvault.sidebar") === "collapsed",
  );
  const [mobileOpen, setMobileOpen] = useState(false);
  const [resetOpen, setResetOpen] = useState(false);
  const toast = useToast();
  const navigate = useNavigate();

  const health = useApi(() => api.health(), []);
  const activity = useApi(() => api.activity(1), []);
  const backendUp = health.data?.status === "ok";
  const demoActivity = activity.data?.[0]?.is_demo ?? true;

  useEffect(() => {
    localStorage.setItem("seedvault.sidebar", collapsed ? "collapsed" : "expanded");
  }, [collapsed]);

  useEffect(() => {
    setMobileOpen(false);
  }, [location.pathname]);

  const reset = useMutation(() => api.resetDemo(), {
    onSuccess: () => {
      toast.success("Demo data regenerated", "The sample dataset is back to its initial state.");
      setResetOpen(false);
      navigate("/");
      window.location.reload();
    },
    onError: (message) => toast.error("Reset failed", message),
  });

  return (
    <div className="flex min-h-screen bg-ivory-100">
      {/* ---------------------------------------------------- desktop rail */}
      <aside
        className={`sticky top-0 hidden h-screen shrink-0 flex-col bg-forest-900 transition-[width] duration-200 lg:flex ${
          collapsed ? "w-[68px]" : "w-[248px]"
        }`}
      >
        <div className={`flex items-center gap-3 border-b border-white/10 px-4 py-4 ${collapsed ? "justify-center px-2" : ""}`}>
          <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gold-400 text-forest-950">
            <Sprout size={19} />
          </span>
          {!collapsed && (
            <div className="min-w-0">
              <p className="truncate font-display text-[17px] font-semibold leading-none text-white">
                Seed Vault
              </p>
              <p className="mt-1 truncate text-[10.5px] text-forest-200">Seed Rescue Network</p>
            </div>
          )}
        </div>

        <NavLinks collapsed={collapsed} />

        <div className="space-y-2 border-t border-white/10 px-3 py-3">
          <div className={`flex items-center gap-2 rounded-lg bg-forest-800/60 px-2.5 py-2 ${collapsed ? "justify-center" : ""}`}>
            <span
              className={`h-2 w-2 shrink-0 rounded-full ${
                backendUp ? "bg-forest-300" : "bg-clay-400"
              }`}
              aria-hidden
            />
            {!collapsed && (
              <div className="min-w-0">
                <p className="truncate text-[11px] font-medium text-forest-100">
                  {backendUp ? "API connected" : "API offline"}
                </p>
                <p className="truncate text-[10px] text-forest-300">
                  {backendUp ? "Demo simulation active" : "Start backend/run.py"}
                </p>
              </div>
            )}
          </div>
          {!collapsed && demoActivity && (
            <p className="px-1 text-[10px] leading-relaxed text-forest-300">
              Records marked as sample data are labelled throughout.
            </p>
          )}
          <button
            onClick={() => setResetOpen(true)}
            className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-[12px] font-medium text-forest-100/85 transition-colors hover:bg-forest-800/70 hover:text-white"
            title="Reset demonstration data"
          >
            <RotateCcw size={14} className="shrink-0" />
            {!collapsed && "Reset demo data"}
          </button>
          <button
            onClick={() => setCollapsed((c) => !c)}
            className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-[12px] font-medium text-forest-100/85 transition-colors hover:bg-forest-800/70 hover:text-white"
          >
            {!collapsed ? "« Collapse" : "»"}
          </button>
        </div>
      </aside>

      {/* ------------------------------------------------------ mobile bar */}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-40 flex items-center gap-3 border-b border-earth-200 bg-white/95 px-4 py-3 backdrop-blur lg:hidden">
          <button
            onClick={() => setMobileOpen(true)}
            className="rounded-lg border border-earth-200 p-2 text-earth-700"
            aria-label="Open navigation"
          >
            <Menu size={18} />
          </button>
          <div className="flex items-center gap-2">
            <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-forest-900 text-gold-400">
              <Sprout size={16} />
            </span>
            <div>
              <p className="font-display text-[15px] font-semibold leading-none text-forest-900">
                Seed Vault
              </p>
              <p className="mt-0.5 text-[10px] text-earth-500">Community Seed Rescue Network</p>
            </div>
          </div>
          {!backendUp && (
            <Badge tone="red" className="ml-auto">API offline</Badge>
          )}
        </header>

        <main className="mx-auto w-full max-w-[1400px] flex-1 px-4 py-5 sm:px-6 lg:px-8 lg:py-7">
          <Outlet />
        </main>

        <footer className="border-t border-earth-200 bg-white/70 px-4 py-4 text-center text-[11.5px] text-earth-500 sm:px-6">
          Seed Vault — demonstration build for community seed-bank monitoring. Storage readings are
          simulated unless real hardware is connected. Local risk flags are not official
          conservation statuses.
        </footer>
      </div>

      {/* --------------------------------------------------- mobile drawer */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div
            className="absolute inset-0 bg-earth-900/50"
            onClick={() => setMobileOpen(false)}
            aria-hidden
          />
          <div className="animate-fade-in absolute inset-y-0 left-0 flex w-[270px] flex-col bg-forest-900">
            <div className="flex items-center justify-between border-b border-white/10 px-4 py-4">
              <div className="flex items-center gap-2.5">
                <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-gold-400 text-forest-950">
                  <Sprout size={16} />
                </span>
                <p className="font-display text-[16px] font-semibold text-white">Seed Vault</p>
              </div>
              <button
                onClick={() => setMobileOpen(false)}
                className="rounded-lg p-1.5 text-forest-200 hover:bg-forest-800"
                aria-label="Close navigation"
              >
                <X size={17} />
              </button>
            </div>
            <NavLinks collapsed={false} onNavigate={() => setMobileOpen(false)} />
            <div className="space-y-1 border-t border-white/10 px-3 py-3">
              <button
                onClick={() => {
                  setMobileOpen(false);
                  setResetOpen(true);
                }}
                className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-[12.5px] font-medium text-forest-100/85 hover:bg-forest-800/70"
              >
                <RotateCcw size={15} /> Reset demo data
              </button>
            </div>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={resetOpen}
        onClose={() => setResetOpen(false)}
        onConfirm={() => reset.run()}
        loading={reset.pending}
        title="Reset demonstration data?"
        confirmLabel="Reset demo data"
        message={
          <>
            This wipes every change you have made — new seed lots, edits, alerts you
            acknowledged and rescue transfers — and regenerates the original sample
            dataset (5 seed banks, 14 varieties, 27 lots).{" "}
            <strong>It cannot be undone.</strong>
          </>
        }
      />

      {health.error && (
        <div className="fixed bottom-4 left-4 z-50 max-w-[320px] rounded-xl border border-clay-200 bg-clay-100 px-4 py-3 text-[12.5px] text-clay-600 shadow-lg">
          <p className="font-semibold">Backend unreachable</p>
          <p className="mt-0.5 leading-relaxed">{health.error}</p>
          <Button size="sm" className="mt-2" onClick={() => health.reload()}>
            Retry connection
          </Button>
        </div>
      )}

      {health.loading && !backendUp && (
        <div className="fixed bottom-4 left-4 z-50 rounded-xl border border-earth-200 bg-white px-4 py-3 shadow-lg">
          <Spinner label="Connecting to API…" />
        </div>
      )}
    </div>
  );
}

export { Database as _DatabaseIcon };
