/* Alerts & Risk Management — review, acknowledge and resolve storage alerts.
 *
 * An out-of-range reading indicates a POTENTIAL RISK requiring inspection;
 * it never proves seed damage. Alerts produced by the demo simulator are
 * labelled "Simulated".
 */
import {
  AlertTriangle, Bell, BellOff, Check, CheckCircle2, ClipboardList, Cpu,
  Info, Lightbulb, MapPin, Package, RefreshCw, RotateCcw, ShieldAlert,
} from "lucide-react";
import { useMemo, useState, type ComponentType } from "react";
import { Link } from "react-router-dom";
import {
  Badge, Button, Card, EmptyState, ErrorState, Field, Modal, Notice,
  PageHeader, Select, Spinner, Textarea, alertStatusTone, severityTone,
  useToast,
} from "../components/ui";
import { ApiError, api } from "../lib/api";
import { formatDateTime, formatNumber, timeAgo, titleCase } from "../lib/format";
import { useApi } from "../lib/hooks";
import type { Alert, Bank } from "../lib/types";

const SEVERITY_BAR: Record<string, string> = {
  critical: "bg-clay-500",
  warning: "bg-gold-400",
  info: "bg-info-500",
};

const CATEGORY_OPTIONS = [
  "temperature",
  "humidity",
  "sensor_offline",
  "power",
  "flood",
  "other",
];

function metricUnit(metric: string | null): string {
  if (metric === "temperature") return " °C";
  if (metric === "humidity") return " %RH";
  return "";
}

function severityIcon(severity: string) {
  return severity === "info" ? Info : AlertTriangle;
}

/* ------------------------------------------------------------ stat card -- */
function StatCard({
  label, value, icon: Icon, tone,
}: {
  label: string;
  value: number;
  icon: ComponentType<{ size?: number | string; className?: string }>;
  tone: string;
}) {
  return (
    <Card className="flex items-center gap-3 px-4 py-3.5">
      <span className={`inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${tone}`}>
        <Icon size={16} />
      </span>
      <div className="min-w-0">
        <p className="text-[20px] font-semibold leading-tight text-earth-900">{value}</p>
        <p className="truncate text-[12px] text-earth-500">{label}</p>
      </div>
    </Card>
  );
}

/* ------------------------------------------------------------- page ----- */
export default function Alerts() {
  const toast = useToast();

  const [severity, setSeverity] = useState("all");
  const [status, setStatus] = useState("all");
  const [bank, setBank] = useState("all");
  const [category, setCategory] = useState("all");

  const filtersActive =
    severity !== "all" || status !== "all" || bank !== "all" || category !== "all";

  const banks = useApi<Bank[]>(() => api.banks(), []);

  /* Unfiltered list powers the summary strip. */
  const allAlerts = useApi<Alert[]>(() => api.alerts(), []);

  /* Filtered list powers the cards below. */
  const alerts = useApi<Alert[]>(
    () =>
      api.alerts({
        severity: severity === "all" ? undefined : severity,
        status: status === "all" ? undefined : status,
        category: category === "all" ? undefined : category,
        bank_id: bank === "all" ? undefined : Number(bank),
      }),
    [severity, status, bank, category],
  );

  const counts = useMemo(() => {
    const list = allAlerts.data ?? [];
    return {
      open: list.filter((a) => a.status === "open").length,
      acknowledged: list.filter((a) => a.status === "acknowledged").length,
      resolved: list.filter((a) => a.status === "resolved").length,
      criticalOpen: list.filter((a) => a.severity === "critical" && a.status === "open").length,
    };
  }, [allAlerts.data]);

  /* --------------------------------------------------------- mutations -- */
  const [action, setAction] = useState<{ alert: Alert; kind: "acknowledge" | "resolve" } | null>(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  const openAction = (alert: Alert, kind: "acknowledge" | "resolve") => {
    setAction({ alert, kind });
    setNote("");
  };

  const submitAction = async () => {
    if (!action) return;
    setBusy(true);
    const trimmed = note.trim();
    try {
      if (action.kind === "acknowledge") {
        await api.acknowledgeAlert(action.alert.id, trimmed || undefined);
        toast.success(
          "Alert acknowledged",
          `${action.alert.alert_code} at ${action.alert.bank_name} is now awaiting resolution.`,
        );
      } else {
        await api.resolveAlert(action.alert.id, trimmed || undefined);
        toast.success(
          "Alert resolved",
          `${action.alert.alert_code} at ${action.alert.bank_name} closed${
            trimmed ? ` — ${trimmed}` : ""
          }.`,
        );
      }
      setAction(null);
      setNote("");
      alerts.reload();
      allAlerts.reload();
    } catch (err) {
      toast.error(
        "Action rejected",
        err instanceof ApiError ? err.message : "Something went wrong.",
      );
    } finally {
      setBusy(false);
    }
  };

  const resetFilters = () => {
    setSeverity("all");
    setStatus("all");
    setBank("all");
    setCategory("all");
  };

  const listEmpty = !alerts.loading && !alerts.error && (alerts.data?.length ?? 0) === 0;

  /* ---------------------------------------------------------------- UI -- */
  return (
    <div>
      <PageHeader
        title="Alerts & Risk Management"
        description="Every storage-condition alert across the network, with its evidence, configured threshold and recommended inspection steps. Acknowledge alerts when you start looking and resolve them once the storage area has been checked."
        actions={
          <Button icon={RefreshCw} onClick={() => { alerts.reload(); allAlerts.reload(); }}>
            Refresh
          </Button>
        }
      />

      {/* ------------------------------------------------- summary strip -- */}
      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard
          label="Open alerts"
          value={counts.open}
          icon={Bell}
          tone="bg-gold-100 text-gold-600"
        />
        <StatCard
          label="Acknowledged"
          value={counts.acknowledged}
          icon={Check}
          tone="bg-info-100 text-info-700"
        />
        <StatCard
          label="Resolved"
          value={counts.resolved}
          icon={CheckCircle2}
          tone="bg-forest-50 text-forest-700"
        />
        <StatCard
          label="Critical open"
          value={counts.criticalOpen}
          icon={AlertTriangle}
          tone="bg-clay-100 text-clay-600"
        />
      </div>

      <Notice tone="info" icon={ShieldAlert} className="mb-5">
        An out-of-range storage reading indicates a <strong>potential risk</strong> that
        requires inspection. It does not prove that any seed has been damaged — verify with
        a second instrument and inspect the storage area before marking lots as affected.
      </Notice>

      {/* ---------------------------------------------------- filter bar -- */}
      <Card className="mb-5 px-4 py-3.5">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <Field label="Severity">
            <Select value={severity} onChange={(e) => setSeverity(e.target.value)}>
              <option value="all">All severities</option>
              <option value="critical">Critical</option>
              <option value="warning">Warning</option>
              <option value="info">Info</option>
            </Select>
          </Field>
          <Field label="Status">
            <Select value={status} onChange={(e) => setStatus(e.target.value)}>
              <option value="all">All statuses</option>
              <option value="open">Open</option>
              <option value="acknowledged">Acknowledged</option>
              <option value="resolved">Resolved</option>
            </Select>
          </Field>
          <Field label="Seed bank">
            <Select value={bank} onChange={(e) => setBank(e.target.value)}>
              <option value="all">All banks</option>
              {(banks.data ?? []).map((b) => (
                <option key={b.id} value={String(b.id)}>
                  {b.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Category">
            <Select value={category} onChange={(e) => setCategory(e.target.value)}>
              <option value="all">All categories</option>
              {CATEGORY_OPTIONS.map((c) => (
                <option key={c} value={c}>
                  {titleCase(c)}
                </option>
              ))}
            </Select>
          </Field>
          <div className="flex items-end">
            <Button
              icon={RotateCcw}
              onClick={resetFilters}
              disabled={!filtersActive}
              className="w-full lg:w-auto"
            >
              Reset filters
            </Button>
          </div>
        </div>
      </Card>

      {/* -------------------------------------------------------- list --- */}
      {alerts.loading ? (
        <Card>
          <Spinner label="Loading alerts…" />
        </Card>
      ) : alerts.error ? (
        <Card>
          <ErrorState message={alerts.error} onRetry={alerts.reload} />
        </Card>
      ) : listEmpty ? (
        <Card>
          {allAlerts.data && allAlerts.data.length === 0 ? (
            <EmptyState
              icon={CheckCircle2}
              title="The network is clear"
              description="No alerts have been raised for any seed bank. Storage conditions have stayed inside every configured range so far."
            />
          ) : (
            <EmptyState
              icon={BellOff}
              title="No alerts match these filters"
              description="Try clearing the severity, status, bank or category filters to see other alerts."
              action={
                filtersActive ? (
                  <Button icon={RotateCcw} onClick={resetFilters}>
                    Reset filters
                  </Button>
                ) : undefined
              }
            />
          )}
        </Card>
      ) : (
        <div className="space-y-4">
          {(alerts.data ?? []).map((alert) => {
            const SevIcon = severityIcon(alert.severity);
            return (
              <Card key={alert.id} className="overflow-hidden">
                <div className="flex">
                  <div
                    className={`w-1 shrink-0 ${SEVERITY_BAR[alert.severity] ?? "bg-earth-300"}`}
                    aria-hidden="true"
                  />
                  <div className="min-w-0 flex-1 space-y-3 p-4 sm:p-5">
                    {/* row 1 — codes and status */}
                    <div className="flex flex-wrap items-center gap-1.5">
                      <Badge className="font-mono">{alert.alert_code}</Badge>
                      <Badge tone={severityTone(alert.severity)} icon={SevIcon}>
                        {titleCase(alert.severity)}
                      </Badge>
                      <Badge tone={alertStatusTone(alert.status)}>{titleCase(alert.status)}</Badge>
                      <Badge tone="sage">{titleCase(alert.category)}</Badge>
                      {alert.is_simulated && <Badge tone="info">Simulated</Badge>}
                      <span className="ml-auto text-[12px] text-earth-500">
                        {timeAgo(alert.detected_at)}
                      </span>
                    </div>

                    {/* row 2 — where */}
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[12.5px] text-earth-600">
                      <span className="flex items-center gap-1">
                        <MapPin size={13} className="shrink-0 text-earth-400" />
                        <Link
                          to="/directory"
                          className="font-medium text-forest-700 hover:underline"
                        >
                          {alert.bank_name}
                        </Link>
                        <span className="text-earth-400">· {alert.bank_location}</span>
                      </span>
                      {alert.device_name && (
                        <span className="flex items-center gap-1 text-earth-500">
                          <Cpu size={13} className="shrink-0 text-earth-400" />
                          {alert.device_name}
                        </span>
                      )}
                    </div>

                    {/* row 3 — evidence and advice */}
                    <div className="space-y-2">
                      <p className="text-[13.5px] font-medium leading-relaxed text-earth-800">
                        {alert.message}
                      </p>
                      {(alert.reading_value !== null || alert.threshold_value) && (
                        <div className="flex flex-wrap gap-2 text-[12.5px]">
                          {alert.reading_value !== null && (
                            <span className="rounded-lg bg-clay-100 px-2 py-1 text-clay-600">
                              Measured:{" "}
                              <strong>
                                {formatNumber(alert.reading_value, 1)}
                                {metricUnit(alert.metric)}
                              </strong>
                            </span>
                          )}
                          {alert.threshold_value && (
                            <span className="rounded-lg bg-earth-100 px-2 py-1 text-earth-700">
                              Configured threshold: <strong>{alert.threshold_value}</strong>
                            </span>
                          )}
                        </div>
                      )}
                      {alert.recommended_action && (
                        <div className="flex items-start gap-2 rounded-lg border border-earth-200 bg-ivory-50 px-3 py-2 text-[12.5px] leading-relaxed text-earth-600">
                          <Lightbulb size={14} className="mt-0.5 shrink-0 text-gold-500" />
                          <span>{alert.recommended_action}</span>
                        </div>
                      )}
                    </div>

                    {/* row 4 — affected lots */}
                    {alert.affected_lot_codes && alert.affected_lot_codes.length > 0 && (
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="text-[11.5px] text-earth-500">Affected lots:</span>
                        {alert.affected_lot_codes.map((code) => (
                          <Link key={code} to="/inventory">
                            <Badge tone="gold" icon={Package}>
                              {code}
                            </Badge>
                          </Link>
                        ))}
                      </div>
                    )}

                    {/* actions */}
                    <div className="flex flex-wrap items-center gap-2 border-t border-earth-100 pt-3">
                      {alert.status === "open" && (
                        <>
                          <Button
                            size="sm"
                            icon={Check}
                            onClick={() => openAction(alert, "acknowledge")}
                          >
                            Acknowledge
                          </Button>
                          <Button
                            size="sm"
                            variant="primary"
                            icon={CheckCircle2}
                            onClick={() => openAction(alert, "resolve")}
                          >
                            Resolve
                          </Button>
                        </>
                      )}
                      {alert.status === "acknowledged" && (
                        <Button
                          size="sm"
                          variant="primary"
                          icon={CheckCircle2}
                          onClick={() => openAction(alert, "resolve")}
                        >
                          Resolve
                        </Button>
                      )}
                      {alert.status === "resolved" && (
                        <p className="text-[12px] leading-relaxed text-earth-500">
                          Resolved {formatDateTime(alert.resolved_at)}
                          {alert.resolution_note ? ` — ${alert.resolution_note}` : ""}.
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {/* ------------------------------------------------- action modal -- */}
      <Modal
        open={action !== null}
        onClose={() => {
          if (!busy) {
            setAction(null);
            setNote("");
          }
        }}
        title={
          action?.kind === "resolve" ? "Resolve alert" : "Acknowledge alert"
        }
        subtitle={
          action
            ? `${action.alert.alert_code} · ${action.alert.bank_name}`
            : undefined
        }
        footer={
          <>
            <Button onClick={() => setAction(null)} disabled={busy}>
              Cancel
            </Button>
            <Button
              variant="primary"
              loading={busy}
              icon={action?.kind === "resolve" ? CheckCircle2 : Check}
              onClick={submitAction}
            >
              {action?.kind === "resolve" ? "Mark resolved" : "Acknowledge"}
            </Button>
          </>
        }
      >
        {action && (
          <div className="space-y-3">
            <div className="flex items-start gap-2.5 rounded-lg border border-earth-200 bg-earth-100/50 px-3 py-2.5">
              <ClipboardList size={15} className="mt-0.5 shrink-0 text-earth-500" />
              <p className="text-[12.5px] leading-relaxed text-earth-700">{action.alert.message}</p>
            </div>
            <Field
              label="Note"
              hint={
                action.kind === "resolve"
                  ? "Optional. Describe what was inspected and what fixed the condition."
                  : "Optional. Note who is taking this alert or what you plan to check."
              }
            >
              <Textarea
                rows={3}
                value={note}
                placeholder={
                  action.kind === "resolve"
                    ? "e.g. exhaust fan cleaned, reading returned to the configured range"
                    : "e.g. coordinator visiting the storage room this evening"
                }
                onChange={(e) => setNote(e.target.value)}
              />
            </Field>
            {action.kind === "resolve" && !note.trim() && (
              <p className="text-[11.5px] text-earth-500">
                Without a note the alert will be closed as "Resolved after inspection".
              </p>
            )}
          </div>
        )}
      </Modal>
    </div>
  );
}
