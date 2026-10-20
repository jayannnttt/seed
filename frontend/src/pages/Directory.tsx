/* Community Seed Bank Directory.
 *
 * Read-only view of every seed bank in the network: stock, storage sensor
 * readings, alerts and rescue activity. Coordinates are shown exactly as the
 * backend records them — no distances are estimated here and no GPS is
 * invented. Sensor readings come from simulated devices unless real hardware
 * is connected.
 */
import {
  AlertTriangle, CheckCircle2, ChevronRight, LayoutGrid, Leaf, List, MapPin,
  Network, Phone, Search, SearchX, Sprout, Thermometer, X,
} from "lucide-react";
import { useMemo, useState, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import {
  Badge, Button, Card, EmptyState, ErrorState, Field, Input, Modal,
  PageHeader, Select, Spinner, TableWrap, Td, Th,
} from "../components/ui";
import { api } from "../lib/api";
import { formatDateTime, formatNumber, timeAgo, titleCase } from "../lib/format";
import { useApi, useDebounced, type AsyncState } from "../lib/hooks";
import type { ActivityEntry, Bank } from "../lib/types";

/* ------------------------------------------------------------- helpers -- */
function statusDotClass(status: string | null): string {
  return status === "online"
    ? "bg-forest-500"
    : status === "offline"
      ? "bg-clay-500"
      : "bg-earth-300";
}

function formatCoordinate(value: number, axis: "latitude" | "longitude"): string {
  const hemisphere =
    axis === "latitude" ? (value >= 0 ? "N" : "S") : (value >= 0 ? "E" : "W");
  return `${Math.abs(value).toFixed(2)}° ${hemisphere}`;
}

function coordinateLine(bank: Bank): string {
  if (bank.latitude === null || bank.longitude === null) return "Location coordinates not recorded";
  return `${formatCoordinate(bank.latitude, "latitude")}, ${formatCoordinate(bank.longitude, "longitude")}`;
}

function sensorText(bank: Bank): string {
  const temperature =
    bank.latest_temperature_c !== null ? `${formatNumber(bank.latest_temperature_c, 1)}°C` : null;
  const humidity =
    bank.latest_humidity_pct !== null ? `${formatNumber(bank.latest_humidity_pct, 1)}% RH` : null;
  if (temperature && humidity) return `${temperature} · ${humidity}`;
  return temperature ?? humidity ?? "No sensor reading recorded";
}

function AlertBadge({ bank }: { bank: Bank }) {
  if (bank.critical_alerts > 0) {
    return (
      <Badge tone="red" icon={AlertTriangle}>
        {bank.open_alerts} open · {bank.critical_alerts} critical
      </Badge>
    );
  }
  if (bank.open_alerts > 0) {
    return (
      <Badge tone="gold" icon={AlertTriangle}>
        {bank.open_alerts} open
      </Badge>
    );
  }
  return (
    <Badge tone="sage" icon={CheckCircle2}>
      No alerts
    </Badge>
  );
}

function DeviceStatusBadge({ bank }: { bank: Bank }) {
  if (!bank.device_status) return <Badge tone="neutral">No device reported</Badge>;
  const tone =
    bank.device_status === "online" ? "green" : bank.device_status === "offline" ? "red" : "neutral";
  return <Badge tone={tone}>{titleCase(bank.device_status)}</Badge>;
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <p className="text-[10.5px] font-semibold tracking-wide text-earth-500 uppercase">
        {label}
      </p>
      <p className="mt-0.5 truncate text-[13.5px] font-semibold text-earth-800">{value}</p>
    </div>
  );
}

/* ----------------------------------------------------------- bank cards -- */
function BankCard({ bank, onOpen }: { bank: Bank; onOpen: () => void }) {
  return (
    <Card
      onClick={onOpen}
      className="flex cursor-pointer flex-col p-5 transition-colors hover:border-forest-300 hover:bg-ivory-50"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="text-[14.5px] font-semibold text-earth-900">{bank.name}</h3>
          <p className="mt-0.5 flex items-center gap-1.5 text-[12.5px] text-earth-500">
            <MapPin size={12} className="shrink-0" />
            <span className="truncate">{bank.location}</span>
          </p>
        </div>
        <Badge tone="neutral">{bank.code}</Badge>
      </div>

      <p className="mt-3 flex flex-wrap items-center gap-x-1.5 gap-y-1 text-[12.5px] text-earth-600">
        <Phone size={12} className="shrink-0" />
        <span className="truncate">{bank.coordinator}</span>
        <a
          href={`tel:${bank.contact_phone}`}
          onClick={(event) => event.stopPropagation()}
          className="text-forest-700 underline-offset-2 hover:underline"
        >
          {bank.contact_phone}
        </a>
      </p>
      {bank.established_year !== null && (
        <p className="mt-1 text-[12px] text-earth-500">Established {bank.established_year}</p>
      )}

      <div className="mt-3 grid grid-cols-3 gap-2 rounded-lg bg-ivory-50 px-3 py-2">
        <Stat label="Varieties" value={formatNumber(bank.variety_count, 0)} />
        <Stat label="Lots" value={formatNumber(bank.lot_count, 0)} />
        <Stat label="Stock" value={`${formatNumber(bank.total_quantity, 1)} kg`} />
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2 text-[12.5px] text-earth-700">
        <span
          className={`h-2 w-2 shrink-0 rounded-full ${statusDotClass(bank.device_status)}`}
          aria-hidden
        />
        <span className="flex items-center gap-1.5">
          <Thermometer size={13} className="text-earth-400" />
          {sensorText(bank)}
        </span>
        {bank.is_simulated && <Badge tone="neutral">Simulated</Badge>}
        {bank.latest_reading_at === null && (
          <span className="text-[12px] text-earth-500">No reading yet</span>
        )}
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <AlertBadge bank={bank} />
        <span className="flex items-center gap-1.5 text-[12px] text-earth-500">
          <Network size={12} className="shrink-0" />
          {bank.recent_rescue_activity} rescue actions in last 30 days
        </span>
      </div>

      {bank.description && (
        <p className="mt-3 line-clamp-2 text-[12.5px] leading-relaxed text-earth-600">
          {bank.description}
        </p>
      )}

      <p className="mt-2 flex items-start gap-1.5 text-[12px] text-earth-500">
        <MapPin size={12} className="mt-0.5 shrink-0" />
        {coordinateLine(bank)}
      </p>

      <div className="mt-4 flex items-center justify-between gap-2 border-t border-earth-100 pt-3">
        <span className="text-[11.5px] text-earth-500">
          {bank.latest_reading_at
            ? `Last reading ${formatDateTime(bank.latest_reading_at)}`
            : "Awaiting first reading"}
        </span>
        <Button
          size="sm"
          variant="ghost"
          icon={ChevronRight}
          onClick={(event) => {
            event.stopPropagation();
            onOpen();
          }}
        >
          View details
        </Button>
      </div>
    </Card>
  );
}

/* --------------------------------------------------------- detail modal -- */
function BankDetailModal({
  bank, activity, onClose, onOpenInventory, onOpenSimulation,
}: {
  bank: Bank;
  activity: AsyncState<ActivityEntry[]>;
  onClose: () => void;
  onOpenInventory: () => void;
  onOpenSimulation: () => void;
}) {
  const row = (label: string, value: ReactNode) => (
    <div>
      <p className="text-[11px] font-semibold tracking-wide text-earth-500 uppercase">{label}</p>
      <p className="mt-0.5 text-[13px] text-earth-800">{value}</p>
    </div>
  );

  return (
    <Modal
      open
      onClose={onClose}
      title={bank.name}
      subtitle={`${bank.code} · ${bank.location}`}
      width="max-w-2xl"
      footer={
        <>
          <Button onClick={onClose}>Close</Button>
          <Button icon={Sprout} onClick={onOpenInventory}>
            Open inventory for this bank
          </Button>
          <Button variant="primary" icon={Leaf} onClick={onOpenSimulation}>
            Run rescue simulation here
          </Button>
        </>
      }
    >
      <div className="space-y-5">
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone="neutral">{bank.code}</Badge>
          <DeviceStatusBadge bank={bank} />
          {bank.is_simulated && <Badge tone="neutral">Simulated readings</Badge>}
          {bank.is_demo && <Badge tone="info">Demonstration record</Badge>}
        </div>

        <section>
          <h3 className="mb-2 text-[11px] font-semibold tracking-[0.08em] text-forest-700 uppercase">
            Contact & location
          </h3>
          <div className="grid gap-x-4 gap-y-3 rounded-xl border border-earth-200 px-4 py-3.5 sm:grid-cols-2">
            {row("Location", bank.location)}
            {row("Established", bank.established_year !== null ? String(bank.established_year) : "Not recorded")}
            {row("Coordinator", bank.coordinator)}
            {row(
              "Phone",
              <a href={`tel:${bank.contact_phone}`} className="text-forest-700 underline-offset-2 hover:underline">
                {bank.contact_phone}
              </a>,
            )}
            {row("Email", bank.contact_email || "Not recorded")}
            {row("Coordinates", coordinateLine(bank))}
          </div>
          {bank.description && (
            <p className="mt-3 text-[12.5px] leading-relaxed text-earth-600">{bank.description}</p>
          )}
        </section>

        <section>
          <h3 className="mb-2 text-[11px] font-semibold tracking-[0.08em] text-forest-700 uppercase">
            Stock & storage
          </h3>
          <div className="grid gap-3 rounded-xl border border-earth-200 bg-ivory-50 px-4 py-3.5 sm:grid-cols-2">
            <div className="grid grid-cols-3 gap-2 sm:col-span-2">
              <Stat label="Varieties" value={formatNumber(bank.variety_count, 0)} />
              <Stat label="Lots" value={formatNumber(bank.lot_count, 0)} />
              <Stat label="Stock" value={`${formatNumber(bank.total_quantity, 1)} kg`} />
            </div>
            {row("Latest reading", sensorText(bank))}
            {row(
              "Recorded at",
              bank.latest_reading_at ? formatDateTime(bank.latest_reading_at) : "No reading yet",
            )}
            {row("Open alerts", `${formatNumber(bank.open_alerts, 0)} (${formatNumber(bank.critical_alerts, 0)} critical)`)}
            {row(
              "Rescue activity",
              `${bank.recent_rescue_activity} rescue actions in last 30 days`,
            )}
          </div>
        </section>

        <section>
          <h3 className="mb-2 text-[11px] font-semibold tracking-[0.08em] text-forest-700 uppercase">
            Recent activity
          </h3>
          {activity.loading ? (
            <Spinner label="Loading recent activity…" />
          ) : activity.error ? (
            <ErrorState message={activity.error} onRetry={activity.reload} />
          ) : !activity.data || activity.data.length === 0 ? (
            <p className="text-[12.5px] text-earth-500">
              No recent activity has been recorded for this bank.
            </p>
          ) : (
            <ul className="space-y-2.5">
              {activity.data.map((entry) => (
                <li key={entry.id} className="flex items-start gap-2.5">
                  <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-sage-400" aria-hidden />
                  <div className="min-w-0">
                    <p className="text-[12.5px] leading-relaxed text-earth-700">
                      {entry.description}
                      {entry.is_demo && (
                        <span className="ml-1.5">
                          <Badge tone="info">Sample</Badge>
                        </span>
                      )}
                    </p>
                    <p className="mt-0.5 text-[11.5px] text-earth-500">
                      {titleCase(entry.action)} · {entry.actor} · {timeAgo(entry.created_at)}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </Modal>
  );
}

/* ----------------------------------------------------------------- page -- */
export default function Directory() {
  const navigate = useNavigate();

  const [view, setView] = useState<"grid" | "table">("grid");
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebounced(search.trim().toLowerCase(), 300);
  const [stateFilter, setStateFilter] = useState("");
  const [onlyAlerts, setOnlyAlerts] = useState(false);
  const [selected, setSelected] = useState<Bank | null>(null);

  const banks = useApi(() => api.banks(), []);
  // Loaded lazily: only fetched for the bank whose detail sheet is open.
  const activity = useApi(
    () =>
      selected
        ? api.activity(8, selected.id)
        : Promise.resolve<ActivityEntry[]>([]),
    [selected?.id],
  );

  const list = useMemo(() => banks.data ?? [], [banks.data]);
  const states = useMemo(
    () => Array.from(new Set(list.map((bank) => bank.state).filter(Boolean))).sort(),
    [list],
  );

  const filtered = useMemo(() => {
    const query = debouncedSearch;
    return list.filter((bank) => {
      if (stateFilter && bank.state !== stateFilter) return false;
      if (onlyAlerts && bank.open_alerts <= 0) return false;
      if (!query) return true;
      return [bank.name, bank.code, bank.location, bank.village, bank.district, bank.state].some(
        (field) => field.toLowerCase().includes(query),
      );
    });
  }, [list, debouncedSearch, stateFilter, onlyAlerts]);

  const filtersActive = Boolean(debouncedSearch || stateFilter || onlyAlerts);

  const clearFilters = () => {
    setSearch("");
    setStateFilter("");
    setOnlyAlerts(false);
  };

  const toggleClass = (active: boolean) =>
    active ? "bg-forest-700! text-white! hover:bg-forest-800!" : "text-earth-600";

  return (
    <div>
      <PageHeader
        title="Community Seed Bank Directory"
        description="Every community seed bank in the network with its stock, storage conditions, open alerts and rescue activity. Coordinates are shown exactly as recorded — no distance or proximity is estimated on this page."
        badge={<Badge tone="info">Demonstration dataset</Badge>}
        actions={
          <div className="flex items-center gap-1 rounded-lg border border-earth-200 bg-white p-1">
            <Button
              size="sm"
              variant="ghost"
              icon={LayoutGrid}
              className={toggleClass(view === "grid")}
              aria-pressed={view === "grid"}
              title="Card view"
              onClick={() => setView("grid")}
            >
              Cards
            </Button>
            <Button
              size="sm"
              variant="ghost"
              icon={List}
              className={toggleClass(view === "table")}
              aria-pressed={view === "table"}
              title="Table view"
              onClick={() => setView("table")}
            >
              Table
            </Button>
          </div>
        }
      />

      {/* ------------------------------------------------------- filters -- */}
      <Card className="p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <div className="min-w-0 flex-1">
            <Field label="Search banks">
              <div className="relative">
                <Search
                  size={14}
                  className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-earth-400"
                />
                <Input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Search bank name, village, district or code"
                  className="pl-9"
                />
              </div>
            </Field>
          </div>

          <div className="sm:w-56">
            <Field label="State">
              <Select
                value={stateFilter}
                onChange={(event) => setStateFilter(event.target.value)}
                disabled={states.length === 0}
              >
                <option value="">All states</option>
                {states.map((state) => (
                  <option key={state} value={state}>
                    {state}
                  </option>
                ))}
              </Select>
            </Field>
          </div>

          <label className="flex h-9 cursor-pointer items-center gap-2 self-start rounded-lg border border-earth-200 bg-white px-3 text-[12.5px] font-medium text-earth-700 sm:self-auto">
            <input
              type="checkbox"
              checked={onlyAlerts}
              onChange={(event) => setOnlyAlerts(event.target.checked)}
              className="h-4 w-4 rounded border-earth-300 accent-forest-700"
            />
            Open alerts only
          </label>

          <Button icon={X} onClick={clearFilters} disabled={!filtersActive}>
            Clear filters
          </Button>
        </div>
      </Card>

      {banks.data !== null && (
        <div className="mt-4 mb-3 flex flex-wrap items-center justify-between gap-2">
          <p className="text-[13px] text-earth-600">
            <span className="font-semibold text-earth-800">{filtered.length}</span>
            <span className="mx-1.5 text-earth-300">·</span>
            {list.length === 0
              ? "no seed banks registered"
              : `of ${list.length} seed bank${list.length === 1 ? "" : "s"}`}
          </p>
          {onlyAlerts && <Badge tone="gold" icon={AlertTriangle}>Showing banks with open alerts</Badge>}
        </div>
      )}

      {/* --------------------------------------------------------- list --- */}
      {banks.loading && !banks.data ? (
        <Card>
          <Spinner label="Loading seed banks…" />
        </Card>
      ) : banks.error && !banks.data ? (
        <Card>
          <ErrorState message={banks.error} onRetry={banks.reload} />
        </Card>
      ) : list.length === 0 ? (
        <Card>
          <EmptyState
            icon={SearchX}
            title="No seed banks registered yet"
            description="Once community seed banks are added to the network they will appear here."
            action={<Button onClick={banks.reload}>Refresh</Button>}
          />
        </Card>
      ) : filtered.length === 0 ? (
        <Card>
          <EmptyState
            icon={SearchX}
            title="No seed banks match these filters"
            description="Try a different search term or state, or clear the filters to see the whole directory."
            action={<Button onClick={clearFilters}>Clear filters</Button>}
          />
        </Card>
      ) : view === "grid" ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {filtered.map((bank) => (
            <BankCard key={bank.id} bank={bank} onOpen={() => setSelected(bank)} />
          ))}
        </div>
      ) : (
        <Card>
          <TableWrap>
            <thead>
              <tr>
                <Th>Bank</Th>
                <Th>Location</Th>
                <Th>Coordinator</Th>
                <Th>Varieties</Th>
                <Th>Lots</Th>
                <Th>Stock</Th>
                <Th>Sensor</Th>
                <Th>Open alerts</Th>
                <Th>Rescue activity</Th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((bank) => (
                <tr
                  key={bank.id}
                  onClick={() => setSelected(bank)}
                  className="cursor-pointer transition-colors hover:bg-ivory-100/70"
                >
                  <Td>
                    <div className="flex flex-col gap-1">
                      <span className="font-medium text-earth-900">{bank.name}</span>
                      <Badge tone="neutral" className="self-start">{bank.code}</Badge>
                    </div>
                  </Td>
                  <Td>
                    <div className="flex flex-col">
                      <span className="text-[13px] text-earth-800">{bank.village}</span>
                      <span className="text-[11.5px] text-earth-500">
                        {bank.district}, {bank.state}
                      </span>
                    </div>
                  </Td>
                  <Td>
                    <div className="flex flex-col">
                      <span className="text-[13px] text-earth-800">{bank.coordinator}</span>
                      <a
                        href={`tel:${bank.contact_phone}`}
                        onClick={(event) => event.stopPropagation()}
                        className="text-[11.5px] text-forest-700 underline-offset-2 hover:underline"
                      >
                        {bank.contact_phone}
                      </a>
                    </div>
                  </Td>
                  <Td>{formatNumber(bank.variety_count, 0)}</Td>
                  <Td>{formatNumber(bank.lot_count, 0)}</Td>
                  <Td>{`${formatNumber(bank.total_quantity, 1)} kg`}</Td>
                  <Td>
                    <div className="flex items-center gap-2">
                      <span
                        className={`h-2 w-2 shrink-0 rounded-full ${statusDotClass(bank.device_status)}`}
                        aria-hidden
                      />
                      <span className="text-[12.5px] text-earth-700">{sensorText(bank)}</span>
                    </div>
                  </Td>
                  <Td>
                    <AlertBadge bank={bank} />
                  </Td>
                  <Td>
                    <span className="flex items-center gap-1.5 text-[12.5px] text-earth-600">
                      <Network size={12} className="shrink-0" />
                      {bank.recent_rescue_activity} in 30 days
                    </span>
                  </Td>
                </tr>
              ))}
            </tbody>
          </TableWrap>
        </Card>
      )}

      {selected && (
        <BankDetailModal
          bank={selected}
          activity={activity}
          onClose={() => setSelected(null)}
          onOpenInventory={() => navigate(`/inventory?bank_id=${selected.id}`)}
          onOpenSimulation={() => navigate(`/simulation?bank_id=${selected.id}`)}
        />
      )}
    </div>
  );
}
