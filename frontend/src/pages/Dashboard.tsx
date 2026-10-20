/* Network Dashboard — the first screen judges see.
 *
 * Every figure comes from GET /api/summary and is calculated from the
 * platform database. Sensor readings are simulated unless real hardware
 * has been attached, so the page carries an explicit demonstration-data
 * notice at all times.
 */
import { type LucideIcon } from "lucide-react";
import {
  Activity, AlertTriangle, ArrowRight, Bell, BellOff, Clock, Droplets, Info,
  Network, Package, Radio, RefreshCw, Sprout, Thermometer, Warehouse,
} from "lucide-react";
import type { ReactNode } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Sparkline, TrendChart } from "../components/charts";
import {
  alertStatusTone, Badge, Button, Card, CardHeader, conditionTone, EmptyState,
  ErrorState, Notice, PageHeader, riskTone, rescueStatusTone, severityTone,
  Spinner, TableWrap, Td, Th, useToast,
} from "../components/ui";
import { api } from "../lib/api";
import { formatNumber, timeAgo, titleCase } from "../lib/format";
import { useApi } from "../lib/hooks";

/* --------------------------------------------------------------- pieces ---- */

type IconTone = "forest" | "clay" | "gold";

const ICON_TONES: Record<IconTone, string> = {
  forest: "bg-forest-50 text-forest-700",
  clay: "bg-clay-100 text-clay-600",
  gold: "bg-gold-100 text-gold-600",
};

function StatCard({
  icon: Icon, label, value, subtitle, accent, tone = "forest",
}: {
  icon: LucideIcon;
  label: string;
  value: ReactNode;
  subtitle?: ReactNode;
  accent?: string;
  tone?: IconTone;
}) {
  return (
    <Card className={`p-4 ${accent ?? ""}`}>
      <span
        className={`inline-flex h-9 w-9 items-center justify-center rounded-lg ${ICON_TONES[tone]}`}
      >
        <Icon size={17} />
      </span>
      <p className="mt-3 text-[26px] leading-none font-semibold text-forest-900">{value}</p>
      <p className="mt-2 text-[12.5px] font-medium text-earth-700">{label}</p>
      {subtitle && <p className="mt-0.5 text-[11.5px] leading-snug text-earth-500">{subtitle}</p>}
    </Card>
  );
}

function LinkAction({ to, children }: { to: string; children: ReactNode }) {
  return (
    <Link
      to={to}
      className="inline-flex items-center gap-1.5 rounded-lg border border-earth-200 bg-white px-2.5 py-1.5 text-[12.5px] font-medium text-forest-700 transition-colors hover:bg-forest-50"
    >
      {children}
      <ArrowRight size={13} />
    </Link>
  );
}

function urgencyTone(urgency: string): "red" | "gold" | "neutral" {
  return urgency === "high" ? "red" : urgency === "medium" ? "gold" : "neutral";
}

const ACTIVITY_DOT: Record<string, string> = {
  alert: "bg-gold-400",
  rescue: "bg-forest-500",
  transfer: "bg-forest-500",
  lot: "bg-info-500",
  device: "bg-info-500",
  reading: "bg-info-500",
  bank: "bg-earth-400",
  variety: "bg-earth-400",
};

/* ---------------------------------------------------------------- page ---- */

export default function Dashboard() {
  const { data: summary, loading, error, reload } = useApi(() => api.summary(), []);
  const toast = useToast();
  const navigate = useNavigate();

  const refresh = () => {
    reload();
    toast.success(
      "Dashboard refreshed",
      "Latest network figures loaded from the platform database.",
    );
  };

  if (loading && !summary) {
    return <Spinner label="Loading network dashboard…" />;
  }

  if (error && !summary) {
    return (
      <Card>
        <ErrorState message={error} onRetry={reload} />
      </Card>
    );
  }

  const counts = summary?.counts;
  const environment = summary?.environment;
  const trend = summary?.trend ?? [];
  const alerts = (summary?.recent_alerts ?? []).slice(0, 6);
  const attentionLots = (summary?.attention_lots ?? []).slice(0, 8);
  const rescueRequests = (summary?.recent_rescue_requests ?? []).slice(0, 5);
  const activity = (summary?.recent_activity ?? []).slice(0, 8);
  const network = summary?.network ?? [];

  const tempSeries = trend.map((p) => p.temperature_c);
  const humiditySeries = trend.map((p) => p.humidity_pct);
  const readingSeries = trend.map((p) => p.readings);

  return (
    <div>
      <PageHeader
        title="Network Dashboard"
        description="Live picture of community seed banks across the network — storage health, varieties under pressure and open rescue requests."
        badge={<Badge tone="info" icon={Radio}>Demo simulation active</Badge>}
        actions={
          <Button icon={RefreshCw} variant="secondary" loading={loading} onClick={refresh}>
            Refresh
          </Button>
        }
      />

      <Notice tone="gold" icon={Info} className="mb-5">
        Demonstration dataset: 5 community seed banks, sample inventory and simulated sensor
        readings. All figures are calculated from the platform database.
      </Notice>

      {error && (
        <Notice tone="gold" icon={AlertTriangle} className="mb-4">
          <span className="flex flex-wrap items-center gap-2">
            Latest refresh failed: {error}
            <Button size="sm" onClick={reload}>Try again</Button>
          </span>
        </Notice>
      )}

      {/* ------------------------------------------------------ summary row */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
        <StatCard
          icon={Warehouse}
          label="Total seed banks"
          value={formatNumber(counts?.banks, 0)}
          subtitle="Community partners reporting into the network"
        />
        <StatCard
          icon={Sprout}
          label="Seed varieties"
          value={formatNumber(counts?.varieties, 0)}
          subtitle={`${formatNumber(counts?.lots, 0)} lots · ${formatNumber(counts?.total_seed_quantity)} kg total seed`}
        />
        <StatCard
          icon={AlertTriangle}
          label="Vulnerable varieties"
          value={formatNumber(counts?.priority_varieties, 0)}
          subtitle={`local priority flag · ${formatNumber(counts?.indigenous_varieties, 0)} indigenous`}
        />
        <StatCard
          icon={Bell}
          label="Open storage alerts"
          value={formatNumber(counts?.open_alerts, 0)}
          subtitle={
            counts?.critical_alerts
              ? `${counts.critical_alerts} critical`
              : "no critical alerts"
          }
          tone={counts?.open_alerts ? "clay" : "forest"}
          accent={counts?.open_alerts ? "border-l-[3px] border-l-clay-500" : undefined}
        />
        <StatCard
          icon={Network}
          label="Pending rescue requests"
          value={formatNumber(counts?.pending_rescue_requests, 0)}
          subtitle="awaiting donor, dispatch or receipt"
          tone={counts?.pending_rescue_requests ? "gold" : "forest"}
          accent={counts?.pending_rescue_requests ? "border-l-[3px] border-l-gold-400" : undefined}
        />
      </div>

      {/* -------------------------------------------------- environment strip */}
      <Card className="mt-4 p-5">
        <div className="grid gap-6 sm:grid-cols-3">
          <div className="min-w-0">
            <p className="flex items-center gap-1.5 text-[12px] font-medium text-earth-600">
              <Thermometer size={14} className="text-clay-500" />
              Average storage temperature
            </p>
            <p className="mt-1 text-[22px] leading-none font-semibold text-forest-900">
              {formatNumber(environment?.avg_temperature_c)}
              <span className="text-[13px] font-medium text-earth-500"> °C</span>
            </p>
            <div className="mt-2">
              <Sparkline data={tempSeries} color="#c25f3c" />
            </div>
          </div>

          <div className="min-w-0">
            <p className="flex items-center gap-1.5 text-[12px] font-medium text-earth-600">
              <Droplets size={14} className="text-forest-600" />
              Average relative humidity
            </p>
            <p className="mt-1 text-[22px] leading-none font-semibold text-forest-900">
              {formatNumber(environment?.avg_humidity_pct)}
              <span className="text-[13px] font-medium text-earth-500"> %</span>
            </p>
            <div className="mt-2">
              <Sparkline data={humiditySeries} color="#2d6840" />
            </div>
          </div>

          <div className="min-w-0">
            <p className="flex items-center gap-1.5 text-[12px] font-medium text-earth-600">
              <Radio size={14} className="text-info-500" />
              Sensors online
            </p>
            <p className="mt-1 text-[22px] leading-none font-semibold text-forest-900">
              {formatNumber(environment?.banks_online, 0)}
              <span className="text-[13px] font-medium text-earth-500">
                {" "}of {formatNumber(environment?.banks_total, 0)} banks
              </span>
            </p>
            <div className="mt-2">
              <Sparkline data={readingSeries} color="#3d6f96" />
            </div>
          </div>
        </div>
      </Card>

      {/* ------------------------------------------------------ trend chart */}
      <Card className="mt-4">
        <CardHeader
          icon={Activity}
          title="Storage conditions — last 24 hours"
          subtitle="Network average of simulated sensor readings"
        />
        <div className="px-3 py-4 sm:px-4">
          {trend.length > 0 ? (
            <TrendChart data={trend} />
          ) : (
            <EmptyState
              icon={Activity}
              title="No sensor readings yet"
              description="Once readings arrive the 24-hour temperature and humidity trend appears here."
            />
          )}
        </div>
      </Card>

      {/* -------------------------------------------- alerts + attention lots */}
      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader
            icon={Bell}
            title="Recent alerts"
            subtitle="Storage thresholds crossed across the network"
            action={<LinkAction to="/alerts">Open alerts centre</LinkAction>}
          />
          {alerts.length === 0 ? (
            <EmptyState
              icon={BellOff}
              title="No alerts recorded"
              description="No storage threshold has been crossed in the current dataset."
            />
          ) : (
            <div>
              {alerts.map((alert) => (
                <div
                  key={alert.id}
                  className="flex items-start gap-3 border-b border-earth-100 px-5 py-3.5 last:border-b-0"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge tone={severityTone(alert.severity)}>
                        {titleCase(alert.severity)}
                      </Badge>
                      <span className="truncate text-[12.5px] font-medium text-earth-800">
                        {alert.bank_name}
                      </span>
                    </div>
                    <p className="mt-1.5 line-clamp-2 text-[12.5px] leading-relaxed text-earth-600">
                      {alert.message}
                    </p>
                    {(alert.threshold_value !== null || alert.reading_value !== null) && (
                      <p className="mt-1 text-[11.5px] text-earth-500">
                        {alert.metric ? `${titleCase(alert.metric)} — ` : ""}
                        reading {formatNumber(alert.reading_value)} · threshold{" "}
                        {alert.threshold_value ?? "—"}
                      </p>
                    )}
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-1.5">
                    <Badge tone={alertStatusTone(alert.status)}>{titleCase(alert.status)}</Badge>
                    <span className="text-[11px] whitespace-nowrap text-earth-400">
                      {timeAgo(alert.detected_at)}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>

        <Card>
          <CardHeader
            icon={Package}
            title="Varieties requiring attention"
            subtitle="Lots matching the local attention rules"
            action={<LinkAction to="/inventory">Open inventory</LinkAction>}
          />
          {attentionLots.length === 0 ? (
            <EmptyState
              icon={Package}
              title="Nothing needs attention"
              description="No lot currently matches the local stock or storage attention rules."
            />
          ) : (
            <div>
              {attentionLots.map((lot) => (
                <div
                  key={lot.id}
                  className="border-b border-earth-100 px-5 py-3.5 last:border-b-0"
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="truncate text-[13px] font-medium text-earth-800">
                      {lot.variety_name}
                    </span>
                    {lot.is_indigenous && <Badge tone="sage">Indigenous</Badge>}
                    <Badge tone={riskTone(lot.risk_flag)}>{titleCase(lot.risk_flag)}</Badge>
                    <span className="ml-auto text-[12.5px] font-medium text-earth-700">
                      {formatNumber(lot.quantity)} {lot.unit}
                    </span>
                  </div>
                  <p className="mt-1 truncate text-[12px] text-earth-500">
                    {lot.bank_name} · {lot.lot_code}
                  </p>
                  {lot.risk_flag_reason && (
                    <p
                      className="mt-1 line-clamp-1 text-[11.5px] text-earth-400"
                      title={lot.risk_flag_reason}
                    >
                      {lot.risk_flag_reason}
                    </p>
                  )}
                  <div className="mt-1.5">
                    <Badge tone={conditionTone(lot.condition)}>{titleCase(lot.condition)}</Badge>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>

      {/* ---------------------------------------------------- network table */}
      <Card className="mt-4">
        <CardHeader
          icon={Warehouse}
          title="Network overview"
          subtitle="Every seed bank, its stock and its latest sensor reading"
          action={<LinkAction to="/directory">Open directory</LinkAction>}
        />
        {network.length === 0 ? (
          <EmptyState
            icon={Warehouse}
            title="No seed banks yet"
            description="Add a community seed bank to see it listed here."
          />
        ) : (
          <TableWrap>
            <thead>
              <tr>
                <Th>Bank</Th>
                <Th>Location</Th>
                <Th align="right" className="text-right">Varieties</Th>
                <Th align="right" className="text-right">Lots</Th>
                <Th align="right" className="text-right">Stock</Th>
                <Th>Sensor</Th>
                <Th align="right" className="text-right">Open alerts</Th>
              </tr>
            </thead>
            <tbody>
              {network.map((bank) => {
                const status = bank.device_status ?? "unknown";
                const dotClass =
                  status === "online"
                    ? "bg-forest-500"
                    : status === "offline"
                      ? "bg-clay-400"
                      : "bg-earth-400";
                return (
                  <tr
                    key={bank.id}
                    onClick={() => navigate("/directory")}
                    className="cursor-pointer transition-colors hover:bg-ivory-50"
                  >
                    <Td>
                      <Link
                        to="/directory"
                        onClick={(e) => e.stopPropagation()}
                        className="font-medium text-forest-800 hover:underline"
                      >
                        {bank.name}
                      </Link>
                      <p className="text-[11.5px] text-earth-500">{bank.code}</p>
                    </Td>
                    <Td className="text-[12.5px] text-earth-600">{bank.location}</Td>
                    <Td align="right" className="text-right">{bank.variety_count}</Td>
                    <Td align="right" className="text-right">{bank.lot_count}</Td>
                    <Td align="right" className="text-right whitespace-nowrap text-[12.5px] text-earth-700">
                      {formatNumber(bank.total_quantity)} kg
                    </Td>
                    <Td>
                      <div className="flex items-center gap-2">
                        <span
                          className={`h-2 w-2 shrink-0 rounded-full ${dotClass}`}
                          title={`Device ${status}`}
                          aria-hidden
                        />
                        <span className="text-[12.5px] text-earth-700">
                          {bank.latest_temperature_c !== null
                            ? `${formatNumber(bank.latest_temperature_c)} °C`
                            : "—"}
                        </span>
                        <span className="text-[12.5px] text-earth-500">
                          {bank.latest_humidity_pct !== null
                            ? `${formatNumber(bank.latest_humidity_pct)} %`
                            : "—"}
                        </span>
                      </div>
                      <p className="mt-0.5 text-[11px] text-earth-400">
                        {bank.latest_reading_at ? timeAgo(bank.latest_reading_at) : "no readings"}
                      </p>
                      {bank.device_status === "offline" && (
                        <div className="mt-1">
                          <Badge tone="red" icon={AlertTriangle}>Device offline</Badge>
                        </div>
                      )}
                    </Td>
                    <Td align="right" className="text-right">
                      {bank.open_alerts > 0 ? (
                        <Badge tone={bank.critical_alerts > 0 ? "red" : "gold"}>
                          {bank.open_alerts} open
                        </Badge>
                      ) : (
                        <Badge tone="sage">None</Badge>
                      )}
                    </Td>
                  </tr>
                );
              })}
            </tbody>
          </TableWrap>
        )}
      </Card>

      {/* ------------------------------------------------ rescue + activity */}
      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader
            icon={Network}
            title="Recent rescue requests"
            subtitle="Banks asking the network for reserve seed"
            action={<LinkAction to="/rescue">Open rescue network</LinkAction>}
          />
          {rescueRequests.length === 0 ? (
            <EmptyState
              icon={Network}
              title="No rescue requests"
              description="Requests raised by seed banks will appear here with their current status."
            />
          ) : (
            <div>
              {rescueRequests.map((request) => (
                <div
                  key={request.id}
                  className="flex items-start gap-3 border-b border-earth-100 px-5 py-3.5 last:border-b-0"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge tone={rescueStatusTone(request.status)}>
                        {request.request_code}
                      </Badge>
                      <span className="truncate text-[13px] font-medium text-earth-800">
                        {request.variety_name}
                      </span>
                    </div>
                    <p className="mt-1.5 truncate text-[12px] text-earth-600">
                      {request.requesting_bank_name} →{" "}
                      {request.donor_bank_name ?? "donor not assigned"}
                    </p>
                    <p className="mt-0.5 text-[11.5px] text-earth-500">
                      {formatNumber(request.required_quantity)} {request.unit} required ·{" "}
                      {titleCase(request.status)}
                    </p>
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-1.5">
                    <Badge tone={urgencyTone(request.urgency)}>
                      {titleCase(request.urgency)}
                    </Badge>
                    <span className="text-[11px] whitespace-nowrap text-earth-400">
                      {timeAgo(request.updated_at)}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>

        <Card>
          <CardHeader
            icon={Clock}
            title="Recent activity"
            subtitle="Latest changes recorded across the network"
          />
          {activity.length === 0 ? (
            <EmptyState
              icon={Clock}
              title="No activity yet"
              description="Edits, alerts and transfers will be listed here as they happen."
            />
          ) : (
            <div className="px-5 py-4">
              <ol className="space-y-4">
                {activity.map((entry, index) => (
                  <li key={entry.id} className="relative flex items-start gap-3">
                    {index < activity.length - 1 && (
                      <span
                        className="absolute top-5 left-[4px] h-full w-px bg-earth-100"
                        aria-hidden
                      />
                    )}
                    <span
                      className={`mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full ${
                        ACTIVITY_DOT[entry.entity_type] ?? "bg-earth-400"
                      }`}
                      aria-hidden
                    />
                    <div className="min-w-0 flex-1">
                      <p className="text-[12.5px] leading-relaxed text-earth-700">
                        {entry.description}
                      </p>
                      <p className="mt-0.5 text-[11.5px] text-earth-400">
                        {titleCase(entry.entity_type)} · {entry.actor} · {timeAgo(entry.created_at)}
                      </p>
                    </div>
                  </li>
                ))}
              </ol>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
