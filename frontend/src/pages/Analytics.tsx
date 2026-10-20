/* Analytics & Conservation Insights.
 *
 * Every number on this page is calculated from the platform database by
 * GET /api/analytics. The three disclaimers from the backend are shown
 * prominently so local risk flags are never mistaken for official
 * conservation statuses and simulated readings are never mistaken for
 * field measurements.
 */
import { type LucideIcon } from "lucide-react";
import {
  Activity, AlertTriangle, ArrowRight, Bell, BarChart3, Calculator, Info,
  Layers, Network, Radio, RefreshCw, ShieldCheck, Sprout, Warehouse,
} from "lucide-react";
import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { SimpleBarChart, SimplePieChart, StatusBarChart, TrendChart } from "../components/charts";
import {
  Badge, Button, Card, CardHeader, EmptyState, ErrorState, Notice, PageHeader,
  riskTone, Spinner, TableWrap, Td, Th, useToast,
} from "../components/ui";
import { api } from "../lib/api";
import { categoryLabel, formatNumber, titleCase } from "../lib/format";
import { useApi } from "../lib/hooks";

/* --------------------------------------------------------------- pieces ---- */

function StatCard({
  icon: Icon, label, value, subtitle,
}: {
  icon: LucideIcon;
  label: string;
  value: ReactNode;
  subtitle?: ReactNode;
}) {
  return (
    <Card className="p-4">
      <span className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-forest-50 text-forest-700">
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

/* ---------------------------------------------------------------- page ---- */

export default function Analytics() {
  const { data: analytics, loading, error, reload } = useApi(() => api.analytics(), []);
  const toast = useToast();

  const refresh = () => {
    reload();
    toast.success(
      "Analytics refreshed",
      "Indicators recalculated from the platform database.",
    );
  };

  if (loading && !analytics) {
    return <Spinner label="Calculating conservation indicators…" />;
  }

  if (error && !analytics) {
    return (
      <Card>
        <ErrorState message={error} onRetry={reload} />
      </Card>
    );
  }

  const byCategory = analytics?.by_category ?? [];
  const byBank = analytics?.by_bank ?? [];
  const alertsByStatus = analytics?.alerts_by_status ?? [];
  const severitySlices = (analytics?.open_alerts_by_severity ?? [])
    .filter((s) => s.count > 0)
    .map((s) => ({ name: titleCase(s.severity), value: s.count }));
  const rescueByStatus = analytics?.rescue_by_status ?? [];
  const flagged = analytics?.flagged_varieties ?? [];
  const trend = analytics?.trend ?? [];
  const disclaimers = analytics?.disclaimers;

  const totalLots = byCategory.reduce((sum, row) => sum + row.lots, 0);
  const totalVarieties = byCategory.reduce((sum, row) => sum + row.varieties, 0);
  const totalStock = byBank.reduce((sum, row) => sum + row.quantity, 0);
  const openAlerts = alertsByStatus.find((row) => row.status === "open")?.count ?? 0;
  const acknowledgedAlerts =
    alertsByStatus.find((row) => row.status === "acknowledged")?.count ?? 0;
  const resolvedAlerts = alertsByStatus.find((row) => row.status === "resolved")?.count ?? 0;

  const disclaimerRows: { icon: LucideIcon; text: string; iconCls: string }[] = [
    {
      icon: ShieldCheck,
      iconCls: "bg-forest-50 text-forest-700",
      text: disclaimers?.conservation ?? "",
    },
    {
      icon: Radio,
      iconCls: "bg-gold-100 text-gold-600",
      text: disclaimers?.simulated ?? "",
    },
    {
      icon: Calculator,
      iconCls: "bg-info-100 text-info-700",
      text: disclaimers?.calculated ?? "",
    },
  ].filter((row) => row.text.length > 0);

  return (
    <div>
      <PageHeader
        title="Analytics & Conservation Insights"
        description="Conservation indicators derived from inventory, monitoring, alert and rescue records held by the network."
        actions={
          <Button icon={RefreshCw} variant="secondary" loading={loading} onClick={refresh}>
            Refresh
          </Button>
        }
      />

      {error && (
        <div className="mb-4">
          <Notice tone="gold" icon={AlertTriangle}>
            <span className="flex flex-wrap items-center gap-2">
              Latest refresh failed: {error}
              <Button size="sm" onClick={reload}>Try again</Button>
            </span>
          </Notice>
        </div>
      )}

      {/* ------------------------------------------------------- disclaimers */}
      <Card className="mb-4">
        <div className="divide-y divide-earth-100">
          {disclaimerRows.map((row) => (
            <div key={row.text} className="flex items-start gap-3 px-5 py-3">
              <span
                className={`inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${row.iconCls}`}
              >
                <row.icon size={16} />
              </span>
              <p className="text-[12.5px] leading-relaxed text-earth-600">{row.text}</p>
            </div>
          ))}
        </div>
      </Card>

      {/* ---------------------------------------------------------- stat row */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          icon={Layers}
          label="Crop categories"
          value={formatNumber(byCategory.length, 0)}
          subtitle="crop groups represented in the catalogue"
        />
        <StatCard
          icon={AlertTriangle}
          label="Varieties with a local flag"
          value={formatNumber(flagged.length, 0)}
          subtitle="flagged by documented network rules"
        />
        <StatCard
          icon={Network}
          label="Transfers received"
          value={formatNumber(analytics?.transfers_received, 0)}
          subtitle="seed delivered between banks"
        />
        <StatCard
          icon={Bell}
          label="Alerts open / resolved"
          value={`${openAlerts} / ${resolvedAlerts}`}
          subtitle={`${acknowledgedAlerts} acknowledged · all recorded alerts`}
        />
      </div>

      {/* --------------------------------------------------------- chart grid */}
      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader
            icon={Sprout}
            title="Seed stock by crop category"
            subtitle={`lots: ${totalLots} · varieties: ${totalVarieties}`}
          />
          <div className="px-3 py-4 sm:px-4">
            {byCategory.length > 0 ? (
              <SimpleBarChart data={byCategory} dataKey="quantity" nameKey="category" horizontal />
            ) : (
              <EmptyState
                icon={BarChart3}
                title="No inventory data"
                description="Stock by crop category appears once seed lots exist."
              />
            )}
          </div>
        </Card>

        <Card>
          <CardHeader
            icon={Warehouse}
            title="Inventory distribution across banks"
            subtitle={`${byBank.length} banks · ${formatNumber(totalStock)} kg held`}
          />
          <div className="px-3 py-4 sm:px-4">
            {byBank.length > 0 ? (
              <SimpleBarChart data={byBank} dataKey="quantity" nameKey="name" horizontal />
            ) : (
              <EmptyState
                icon={BarChart3}
                title="No bank inventory"
                description="Distribution across seed banks appears once lots are recorded."
              />
            )}
          </div>
        </Card>

        <Card>
          <CardHeader
            icon={AlertTriangle}
            title="Alerts by status"
            subtitle="Storage alerts recorded across the network"
          />
          <div className="px-3 py-4 sm:px-4">
            {alertsByStatus.length > 0 ? (
              <StatusBarChart data={alertsByStatus} />
            ) : (
              <EmptyState
                icon={BarChart3}
                title="No alerts recorded"
                description="Alert counts by status appear once monitoring runs."
              />
            )}
          </div>
        </Card>

        <Card>
          <CardHeader
            icon={Bell}
            title="Open alerts by severity"
            subtitle="Distribution of alerts still open"
          />
          <div className="px-3 py-4 sm:px-4">
            {severitySlices.length > 0 ? (
              <SimplePieChart data={severitySlices} />
            ) : (
              <EmptyState
                icon={ShieldCheck}
                title="No open alerts"
                description="Every alert in the dataset has been acknowledged or resolved."
              />
            )}
          </div>
        </Card>

        <Card>
          <CardHeader
            icon={Network}
            title="Rescue requests by status"
            subtitle="Requests raised through the seed rescue network"
          />
          <div className="px-3 py-4 sm:px-4">
            {rescueByStatus.length > 0 ? (
              <StatusBarChart data={rescueByStatus} />
            ) : (
              <EmptyState
                icon={BarChart3}
                title="No rescue requests"
                description="Request counts by status appear once banks raise requests."
              />
            )}
          </div>
        </Card>

        <Card>
          <CardHeader
            icon={Activity}
            title="Storage-condition trend (24h)"
            subtitle="Network average of simulated sensor readings"
          />
          <div className="px-3 py-4 sm:px-4">
            {trend.length > 0 ? (
              <TrendChart data={trend} height={220} />
            ) : (
              <EmptyState
                icon={Activity}
                title="No sensor readings yet"
                description="Temperature and humidity trends appear once readings arrive."
              />
            )}
          </div>
        </Card>
      </div>

      {/* ------------------------------------------------- flagged varieties */}
      <Card className="mt-4">
        <CardHeader
          icon={ShieldCheck}
          title="Varieties flagged for conservation attention"
          subtitle="Local network flags, not official conservation statuses"
        />
        <div className="flex items-start gap-2 border-b border-earth-100 px-5 py-3 text-[12.5px] leading-relaxed text-earth-500">
          <Info size={14} className="mt-0.5 shrink-0" />
          <p>
            <span className="font-medium text-earth-700">Local risk flag</span> — produced by
            documented rules in backend/app/rules.py. Not an official conservation status.
          </p>
        </div>
        {flagged.length === 0 ? (
          <EmptyState
            icon={ShieldCheck}
            title="No varieties are flagged"
            description="No variety currently matches the local priority or watch rules."
          />
        ) : (
          <TableWrap>
            <thead>
              <tr>
                <Th>Variety</Th>
                <Th>Category</Th>
                <Th>Bank</Th>
                <Th align="right" className="text-right">Stock</Th>
                <Th>Local flag</Th>
                <Th>Why</Th>
              </tr>
            </thead>
            <tbody>
              {flagged.map((row) => (
                <tr key={`${row.variety_id}-${row.bank_name}`} className="hover:bg-ivory-50">
                  <Td>
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="font-medium text-earth-800">{row.variety_name}</span>
                      {row.is_indigenous && <Badge tone="sage">Indigenous</Badge>}
                    </div>
                  </Td>
                  <Td className="text-[12.5px] text-earth-600">
                    {categoryLabel(row.crop_category)}
                  </Td>
                  <Td className="text-[12.5px] text-earth-600">{row.bank_name}</Td>
                  <Td align="right" className="text-right whitespace-nowrap text-[12.5px] text-earth-700">
                    {formatNumber(row.quantity)} {row.unit}
                  </Td>
                  <Td>
                    <Badge tone={riskTone(row.risk_flag)}>{titleCase(row.risk_flag)}</Badge>
                  </Td>
                  <Td className="max-w-[320px] text-[12px] leading-relaxed text-earth-500">
                    {row.risk_flag_reason ?? "—"}
                  </Td>
                </tr>
              ))}
            </tbody>
          </TableWrap>
        )}
      </Card>

      {/* ------------------------------------------------- category breakdown */}
      <Card className="mt-4">
        <CardHeader
          icon={Layers}
          title="Category breakdown"
          subtitle="Varieties, lots and held stock per crop category"
          action={<LinkAction to="/inventory">Open inventory</LinkAction>}
        />
        {byCategory.length === 0 ? (
          <EmptyState
            icon={Layers}
            title="No categories yet"
            description="Crop categories appear once varieties and lots are added."
          />
        ) : (
          <TableWrap>
            <thead>
              <tr>
                <Th>Category</Th>
                <Th align="right" className="text-right">Varieties</Th>
                <Th align="right" className="text-right">Lots</Th>
                <Th align="right" className="text-right">Quantity</Th>
              </tr>
            </thead>
            <tbody>
              {byCategory.map((row) => (
                <tr key={row.category} className="hover:bg-ivory-50">
                  <Td className="font-medium text-earth-800">{categoryLabel(row.category)}</Td>
                  <Td align="right" className="text-right">{row.varieties}</Td>
                  <Td align="right" className="text-right">{row.lots}</Td>
                  <Td align="right" className="text-right whitespace-nowrap text-[12.5px] text-earth-700">
                    {formatNumber(row.quantity)} kg
                  </Td>
                </tr>
              ))}
            </tbody>
          </TableWrap>
        )}
      </Card>
    </div>
  );
}
