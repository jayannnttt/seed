/* Seed Rescue Simulation — the judge-facing demo of the full rescue
 * workflow.
 *
 * Everything on this page is a RULE-BASED SIMULATION: scenarios generate
 * plausible sensor readings and deterministic risk scores. There is no
 * machine-learning model, no prediction is made about actual seed
 * survival, and no claim of genetic equivalence is ever implied by the
 * reserve-stock matching. Running a simulation does not touch inventory;
 * real stock only moves when a rescue request is approved, dispatched and
 * received through the Seed Rescue Network page.
 */
import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import {
  AlertTriangle, ArrowRight, CheckCircle2, FlaskConical, ListChecks, MapPin,
  Phone, Play, RotateCcw, SearchX, Trash2,
} from "lucide-react";
import { api } from "../lib/api";
import { useApi, useMutation } from "../lib/hooks";
import {
  categoryLabel, formatDateTime, formatNumber, titleCase,
} from "../lib/format";
import type { Alert, Bank, Match, SimulationResult, ScenarioDef } from "../lib/types";
import {
  Badge, Button, Card, CardHeader, EmptyState, ErrorState, Field, Notice,
  PageHeader, Select, Spinner, TableWrap, Td, Th, conditionTone, riskTone,
  severityTone, useToast,
} from "../components/ui";

/* ------------------------------------------------------------ helpers --- */

const bandTone = (band: string) =>
  band === "high" ? "red" : band === "elevated" ? "gold" : "green";

const bandBarColor = (band: string) =>
  band === "high" ? "bg-clay-500" : band === "elevated" ? "bg-gold-400" : "bg-forest-600";

function scoreTone(score: number) {
  return score >= 80 ? "green" : score >= 60 ? "sage" : "neutral";
}

/* --------------------------------------------------------- match card --- */

/** Reserve-stock candidate card (same documented ranking as the Rescue
 * Network page). Used read-only here — the action opens a rescue request. */
function ReserveMatchCard({
  match, rank, requestedQuantity, unit,
}: { match: Match; rank: number; requestedQuantity: number; unit: string }) {
  return (
    <div className="rounded-xl border border-earth-200 bg-white p-3.5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-2.5">
          <span className="mt-0.5 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-forest-700 text-[11.5px] font-semibold text-white">
            {rank}
          </span>
          <div>
            <p className="text-[13.5px] font-semibold text-earth-900">{match.bank_name}</p>
            <p className="text-[12px] text-earth-500">
              {match.bank_location} · lot <span className="font-mono">{match.lot_code}</span>
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <Badge tone={scoreTone(match.score)}>{Math.round(match.score)}/100 fit</Badge>
          <Badge tone={conditionTone(match.condition)}>{titleCase(match.condition)}</Badge>
        </div>
      </div>

      <dl className="mt-2.5 grid grid-cols-2 gap-x-5 gap-y-1.5 text-[12px] sm:grid-cols-4">
        <div>
          <dt className="text-[10.5px] font-medium uppercase tracking-wide text-earth-400">Available</dt>
          <dd className="text-earth-800">
            {formatNumber(match.available_quantity)} {match.unit}{" "}
            <span className="text-earth-500">of {formatNumber(requestedQuantity)} {unit}</span>
          </dd>
        </div>
        <div>
          <dt className="text-[10.5px] font-medium uppercase tracking-wide text-earth-400">Distance</dt>
          <dd className="text-earth-800">
            {match.distance_km !== null
              ? `~${formatNumber(match.distance_km, 1)} km`
              : <span className="text-earth-500">Unknown</span>}
          </dd>
        </div>
        <div>
          <dt className="text-[10.5px] font-medium uppercase tracking-wide text-earth-400">Germination</dt>
          <dd>
            {match.germination_rate !== null
              ? <span className="text-earth-800">{formatNumber(match.germination_rate, 0)}%</span>
              : <Badge tone="neutral">Not tested</Badge>}
          </dd>
        </div>
        <div>
          <dt className="text-[10.5px] font-medium uppercase tracking-wide text-earth-400">Coordinator</dt>
          <dd className="text-earth-800">
            {match.bank_coordinator}
            {match.bank_phone && (
              <a href={`tel:${match.bank_phone}`} className="ml-1.5 inline-flex items-center gap-1 text-forest-700 hover:underline">
                <Phone size={10} />
                {match.bank_phone}
              </a>
            )}
          </dd>
        </div>
      </dl>

      <details className="mt-2.5 rounded-lg border border-earth-100 bg-ivory-50/70 px-3 py-2">
        <summary className="cursor-pointer select-none text-[12px] font-medium text-earth-700">
          Why this donor?
        </summary>
        <div className="mt-2 space-y-2">
          {match.reasons.length > 0 && (
            <ul className="space-y-1 text-[12px] leading-relaxed text-earth-600">
              {match.reasons.map((r, i) => (
                <li key={i} className="flex gap-2">
                  <CheckCircle2 size={12} className="mt-0.5 shrink-0 text-forest-600" />
                  <span>{r}</span>
                </li>
              ))}
            </ul>
          )}
          {match.warnings.length > 0 && (
            <div className="rounded-lg border border-gold-200 bg-gold-100/70 px-3 py-2">
              {match.warnings.map((w, i) => (
                <p key={i} className="flex gap-2 text-[12px] leading-relaxed text-gold-600">
                  <AlertTriangle size={12} className="mt-0.5 shrink-0" />
                  <span>{w}</span>
                </p>
              ))}
            </div>
          )}
        </div>
      </details>
    </div>
  );
}

/* ------------------------------------------------------- results view --- */

function AlertRow({ alert }: { alert: Alert }) {
  return (
    <li className="flex items-start gap-3 border-b border-earth-100 px-4 py-2.5 last:border-b-0">
      <Badge tone={severityTone(alert.severity)}>{titleCase(alert.severity)}</Badge>
      <div className="min-w-0 flex-1">
        <p className="text-[12.5px] leading-relaxed text-earth-800">{alert.message}</p>
        {alert.recommended_action && (
          <p className="mt-0.5 text-[12px] text-earth-500">
            Recommended: {alert.recommended_action}
          </p>
        )}
      </div>
      {alert.is_simulated && <Badge tone="info">Simulated</Badge>}
    </li>
  );
}

function SimulationResults({
  result, navigate,
}: { result: SimulationResult; navigate: ReturnType<typeof useNavigate> }) {
  const [expandedLots, setExpandedLots] = useState<Set<number>>(new Set());
  const [checkedSteps, setCheckedSteps] = useState<Set<number>>(new Set());

  const toggleLot = (id: number) =>
    setExpandedLots((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const toggleStep = (step: number) =>
    setCheckedSteps((prev) => {
      const next = new Set(prev);
      if (next.has(step)) next.delete(step);
      else next.add(step);
      return next;
    });

  const bank = result.bank;
  const thresholdRows = Object.entries(result.thresholds);

  return (
    <div className="space-y-5">
      {/* a — bank header */}
      <Card>
        <CardHeader
          icon={MapPin}
          title={bank.name}
          subtitle={bank.location}
          action={
            <Badge tone="gold" icon={FlaskConical}>Simulated incident</Badge>
          }
        />
        <div className="grid gap-4 px-5 py-4 sm:grid-cols-2">
          <div>
            <h3 className="text-[12px] font-semibold uppercase tracking-wide text-earth-500">
              Latest simulated reading
            </h3>
            <p className="mt-1.5 text-[15px] font-semibold text-earth-900">
              {result.latest_reading.temperature_c !== null
                ? `${formatNumber(result.latest_reading.temperature_c, 1)} °C`
                : "—"}
              <span className="mx-2 text-earth-300">|</span>
              {result.latest_reading.humidity_pct !== null
                ? `${formatNumber(result.latest_reading.humidity_pct, 1)} %RH`
                : "—"}
            </p>
            <p className="mt-0.5 text-[12px] text-earth-500">
              {result.latest_reading.recorded_at
                ? `recorded ${formatDateTime(result.latest_reading.recorded_at)}`
                : "no reading recorded"}
            </p>
          </div>
          <div>
            <h3 className="text-[12px] font-semibold uppercase tracking-wide text-earth-500">
              Configured thresholds
            </h3>
            {thresholdRows.length === 0 ? (
              <p className="mt-1.5 text-[12.5px] text-earth-500">
                No thresholds configured for this bank.
              </p>
            ) : (
              <ul className="mt-1.5 space-y-1 text-[12.5px] text-earth-700">
                {thresholdRows.map(([metric, t]) => (
                  <li key={metric} className="flex flex-wrap items-baseline gap-x-2">
                    <span className="font-medium">{titleCase(metric)}</span>
                    <span>
                      {formatNumber(t.min, 1)} – {formatNumber(t.max, 1)}
                      {metric === "humidity" ? " %RH" : " °C"}
                    </span>
                    {t.note && <span className="text-[11.5px] text-earth-400">({t.note})</span>}
                  </li>
                ))}
              </ul>
            )}
            <p className="mt-1.5 text-[11.5px] leading-relaxed text-earth-400">
              Operator-configured example — not a universal standard.
            </p>
          </div>
        </div>
      </Card>

      {/* b — risk summary */}
      <Card className="px-5 py-4">
        <div className="flex flex-wrap items-center gap-3">
          <div>
            <h3 className="text-[12px] font-semibold uppercase tracking-wide text-earth-500">
              Bank risk summary
            </h3>
            <p className="mt-1 flex items-baseline gap-2">
              <span className="text-[24px] font-semibold text-earth-900">
                {formatNumber(result.risk.bank_score, 0)}
              </span>
              <span className="text-[13px] text-earth-400">/ 100</span>
              <Badge tone={bandTone(result.risk.bank_band)}>{titleCase(result.risk.bank_band)} attention</Badge>
            </p>
          </div>
        </div>
        <p className="mt-2 text-[12px] leading-relaxed text-earth-500">
          <span className="font-medium text-earth-600">How this is calculated: </span>
          {result.risk.method}
        </p>
      </Card>

      {/* c — open alerts */}
      <Card>
        <CardHeader
          icon={AlertTriangle}
          title="Open alerts generated by this run"
          action={<Link to="/alerts" className="text-[12.5px] font-medium text-forest-700 hover:underline">Open alerts centre</Link>}
        />
        {result.open_alerts.length === 0 ? (
          <p className="px-5 py-4 text-[12.5px] text-earth-500">
            No alerts were raised by this simulated run.
          </p>
        ) : (
          <ul>
            {result.open_alerts.map((a) => <AlertRow key={a.id} alert={a} />)}
          </ul>
        )}
      </Card>

      {/* d — affected lots */}
      <Card>
        <CardHeader
          icon={AlertTriangle}
          title="Affected seed lots"
          subtitle="Rule-based flags for lots stored at the incident bank. No claim is made that any seed is damaged."
        />
        {result.affected_lots.length === 0 ? (
          <p className="px-5 py-4 text-[12.5px] text-earth-500">
            No lots at this bank matched the simulation's risk rules.
          </p>
        ) : (
          <TableWrap>
            <thead>
              <tr>
                <Th>Lot code</Th>
                <Th>Variety</Th>
                <Th>Storage</Th>
                <Th align="right">Quantity</Th>
                <Th>Condition</Th>
                <Th>Risk flag</Th>
                <Th>Risk score</Th>
                <Th>Band</Th>
                <Th>Why?</Th>
              </tr>
            </thead>
            <tbody>
              {result.affected_lots.map((lot) => {
                const expanded = expandedLots.has(lot.lot_id);
                return (
                  <tr key={lot.lot_id}>
                    <Td className="font-mono text-[12px]">{lot.lot_code}</Td>
                    <Td>
                      <span className="font-medium text-earth-900">{lot.variety_name}</span>
                      <span className="ml-1.5 text-[11.5px] text-earth-500">{categoryLabel(lot.crop_category)}</span>
                      {lot.is_indigenous && <Badge tone="sage" className="ml-1.5">Indigenous</Badge>}
                    </Td>
                    <Td className="text-[12px] text-earth-600">{lot.storage_location ?? "—"}</Td>
                    <Td align="right">{formatNumber(lot.quantity)} {lot.unit}</Td>
                    <Td><Badge tone={conditionTone(lot.condition)}>{titleCase(lot.condition)}</Badge></Td>
                    <Td><Badge tone={riskTone(lot.risk_flag)}>{titleCase(lot.risk_flag)}</Badge></Td>
                    <Td>
                      <div className="flex items-center gap-2">
                        <span className="w-8 text-[12.5px] font-semibold text-earth-800">
                          {formatNumber(lot.risk_score, 0)}
                        </span>
                        <span className="h-1.5 w-20 rounded-full bg-earth-100">
                          <span
                            className={`block h-1.5 rounded-full ${bandBarColor(lot.attention_band)}`}
                            style={{ width: `${Math.min(100, Math.max(0, lot.risk_score))}%` }}
                          />
                        </span>
                      </div>
                    </Td>
                    <Td><Badge tone={bandTone(lot.attention_band)}>{titleCase(lot.attention_band)}</Badge></Td>
                    <Td>
                      <Button size="sm" variant="ghost" onClick={() => toggleLot(lot.lot_id)}>
                        {expanded ? "Hide" : "Why?"}
                      </Button>
                    </Td>
                  </tr>
                );
              })}
            </tbody>
          </TableWrap>
        )}
        {result.affected_lots.some((l) => expandedLots.has(l.lot_id)) && (
          <div className="space-y-2 border-t border-earth-100 px-5 py-3">
            {result.affected_lots
              .filter((l) => expandedLots.has(l.lot_id))
              .map((l) => (
                <div key={l.lot_id}>
                  <p className="text-[12px] font-semibold text-earth-700">{l.lot_code}</p>
                  <ul className="mt-0.5 space-y-0.5">
                    {l.risk_reasons
                      .split(";")
                      .map((r) => r.trim())
                      .filter(Boolean)
                      .map((r, i) => (
                        <li key={i} className="flex gap-2 text-[12px] leading-relaxed text-earth-600">
                          <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-earth-300" />
                          <span>{r}</span>
                        </li>
                      ))}
                  </ul>
                </div>
              ))}
          </div>
        )}
      </Card>

      {/* e — prioritised checklist */}
      <Card>
        <CardHeader
          icon={ListChecks}
          title="Prioritised response checklist"
          subtitle="Tick-off is local to this browser session — nothing is saved."
        />
        {result.checklist.length === 0 ? (
          <p className="px-5 py-4 text-[12.5px] text-earth-500">No checklist steps for this scenario.</p>
        ) : (
          <ol className="divide-y divide-earth-100">
            {result.checklist.map((s) => {
              const high = s.priority === "high";
              const checked = checkedSteps.has(s.step);
              return (
                <li
                  key={s.step}
                  className={`flex items-start gap-3 px-5 py-3 ${
                    high ? "border-l-4 border-gold-400 bg-gold-100/40" : ""
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => toggleStep(s.step)}
                    className="mt-0.5 h-4 w-4 shrink-0 cursor-pointer rounded border-earth-300 accent-[#2d6840]"
                    aria-label={`Mark step ${s.step} done`}
                  />
                  <span className={`inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11.5px] font-semibold ${
                    checked ? "bg-forest-700 text-white" : "bg-earth-100 text-earth-600"
                  }`}>
                    {s.step}
                  </span>
                  <p className={`text-[13px] leading-relaxed ${
                    checked ? "text-earth-400 line-through" : "text-earth-800"
                  }`}>
                    {s.action}
                  </p>
                  {high && (
                    <Badge tone="gold" icon={AlertTriangle} className="ml-auto shrink-0">High priority</Badge>
                  )}
                </li>
              );
            })}
          </ol>
        )}
      </Card>

      {/* f — reserve stock elsewhere */}
      <div>
        <h2 className="mb-3 flex items-center gap-2 text-[15px] font-semibold text-forest-900">
          <SearchX size={16} className="text-forest-700" />
          Reserve stock elsewhere in the network
        </h2>
        {result.reserve_matches.length === 0 ? (
          <Card>
            <EmptyState
              icon={SearchX}
              title="No affected varieties needed a network search"
              description="None of the lots flagged by this scenario have recorded counterparts
                with free stock in other banks."
            />
          </Card>
        ) : (
          <div className="space-y-4">
            {result.reserve_matches.map((group) => (
              <Card key={`${group.lot_code}-${group.variety_id}`}>
                <CardHeader
                  title={group.variety_name}
                  subtitle={
                    <>
                      Lot <span className="font-mono">{group.lot_code}</span> at risk ·{" "}
                      {formatNumber(group.quantity_at_risk)} {group.unit}
                    </>
                  }
                  action={
                    <div className="flex flex-wrap items-center gap-1.5">
                      <Badge tone={bandTone(group.attention_band)}>
                        {formatNumber(group.risk_score, 0)} risk · {titleCase(group.attention_band)}
                      </Badge>
                      <Button
                        variant="primary"
                        size="sm"
                        icon={ArrowRight}
                        onClick={() =>
                          navigate(
                            `/rescue?variety_id=${group.variety_id}&bank_id=${result.bank.id}` +
                            `&quantity=${group.quantity_at_risk}&unit=${group.unit}`,
                          )
                        }
                      >
                        Open rescue request
                      </Button>
                    </div>
                  }
                />
                <div className="space-y-3 px-5 py-4">
                  {group.matches.length === 0 ? (
                    <EmptyState
                      icon={SearchX}
                      title="No reserve stock for this variety elsewhere in the network"
                      description="No other bank holds this recorded variety with free stock.
                        Document the variety as at-risk, and contact neighbouring networks
                        outside Seed Vault for help."
                    />
                  ) : (
                    group.matches.map((m, i) => (
                      <ReserveMatchCard
                        key={m.lot_id}
                        match={m}
                        rank={i + 1}
                        requestedQuantity={group.quantity_at_risk}
                        unit={group.unit}
                      />
                    ))
                  )}
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* g — honesty notice */}
      <p className="text-[12px] leading-relaxed text-earth-400">{result.notice}</p>
    </div>
  );
}

/* ------------------------------------------------------------- page ----- */

export default function RescueSimulation() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const toast = useToast();

  const scenarios = useApi<ScenarioDef[]>(() => api.scenarios(), []);
  const banks = useApi<Bank[]>(() => api.banks(), []);

  const [scenarioKey, setScenarioKey] = useState("");
  const [bankId, setBankId] = useState("");
  const [steps, setSteps] = useState(4);
  const [result, setResult] = useState<SimulationResult | null>(null);

  /* Deep link from the bank directory: /simulation?bank_id=N */
  useEffect(() => {
    const b = Number(searchParams.get("bank_id"));
    if (Number.isFinite(b) && b > 0) setBankId(String(b));
  }, [searchParams]);

  /* Default selections once the option lists arrive. */
  useEffect(() => {
    if (!scenarioKey && scenarios.data && scenarios.data.length > 0) {
      setScenarioKey(scenarios.data[0].key);
    }
    if (!bankId && banks.data && banks.data.length > 0) {
      setBankId(String(banks.data[0].id));
    }
  }, [scenarios.data, banks.data, scenarioKey, bankId]);

  const selectedScenario = useMemo(
    () => scenarios.data?.find((s) => s.key === scenarioKey) ?? null,
    [scenarios.data, scenarioKey],
  );

  const runMut = useMutation(() => api.runScenario(scenarioKey, Number(bankId), steps), {
    onSuccess: (r) => {
      setResult(r);
      toast.success("Simulation run complete", "Review the rule-based results below.");
    },
  });

  const setupError = scenarios.error ?? banks.error;

  return (
    <div className="space-y-5">
      <PageHeader
        title="Seed Rescue Simulation"
        description="Demonstrate the full rescue workflow for a chosen emergency scenario —
          without touching real hardware."
        badge={<Badge tone="gold" icon={FlaskConical}>Demo simulation</Badge>}
      />

      <Notice tone="gold" icon={FlaskConical}>
        Demo Simulation — scenarios generate plausible sensor readings and rule-based risk
        scores. No machine-learning model is used and no claim is made about actual seed
        survival. Use “Reset demo data” in the sidebar to restore the original dataset at
        any time.
      </Notice>

      {/* setup panel */}
      <Card>
        <CardHeader
          icon={Play}
          title="Simulation setup"
          subtitle="Pick an emergency scenario, a bank and the number of simulated sensor readings."
        />
        <div className="grid gap-4 px-5 py-4 sm:grid-cols-2 lg:grid-cols-4">
          <Field label="Emergency scenario">
            {scenarios.loading ? (
              <Spinner label="Loading…" />
            ) : scenarios.error ? (
              <ErrorState message={scenarios.error} onRetry={scenarios.reload} />
            ) : (
              <Select value={scenarioKey} onChange={(e) => setScenarioKey(e.target.value)}>
                {(scenarios.data ?? []).map((s) => (
                  <option key={s.key} value={s.key}>{s.label}</option>
                ))}
              </Select>
            )}
          </Field>

          <Field label="Bank">
            {banks.loading ? (
              <Spinner label="Loading…" />
            ) : banks.error ? (
              <ErrorState message={banks.error} onRetry={banks.reload} />
            ) : (
              <Select value={bankId} onChange={(e) => setBankId(e.target.value)}>
                {(banks.data ?? []).map((b) => (
                  <option key={b.id} value={b.id}>{b.name} — {b.location}</option>
                ))}
              </Select>
            )}
          </Field>

          <Field label="Simulated readings" hint="How many steps the scenario generates.">
            <Select value={String(steps)} onChange={(e) => setSteps(Number(e.target.value))}>
              <option value="2">2 readings</option>
              <option value="4">4 readings</option>
              <option value="8">8 readings</option>
            </Select>
          </Field>

          <div className="flex items-end gap-2">
            <Button
              variant="primary"
              icon={Play}
              loading={runMut.pending}
              disabled={!scenarioKey || !bankId || !!setupError}
              onClick={() => runMut.run()}
              className="flex-1"
            >
              Start simulation
            </Button>
            {result && (
              <Button
                icon={Trash2}
                onClick={() => {
                  setResult(null);
                  toast.info("Simulation cleared", "Client-side only — inventory was never modified.");
                }}
              >
                Clear
              </Button>
            )}
          </div>
        </div>

        <div className="space-y-2 border-t border-earth-100 px-5 py-3.5">
          {selectedScenario && (
            <div>
              <p className="text-[12.5px] text-earth-700">
                <span className="font-medium">{selectedScenario.label}:</span>{" "}
                {selectedScenario.description}
              </p>
              <p className="mt-0.5 text-[12px] text-earth-500">
                Reason category: {titleCase(selectedScenario.reason_category)} · base risk:{" "}
                {formatNumber(selectedScenario.base_risk, 0)}/100
              </p>
            </div>
          )}
          {runMut.error && <Notice tone="gold" icon={AlertTriangle}>{runMut.error}</Notice>}
          {result && (
            <p className="text-[11.5px] leading-relaxed text-earth-400">
              Running a simulation generates readings, alerts and rule-based risk flags only.
              It never modifies seed inventory — stock moves only through an approved rescue
              transfer.
            </p>
          )}
        </div>
      </Card>

      {/* results */}
      {result && (
        <SimulationResults result={result} navigate={navigate} />
      )}

      {!result && !runMut.pending && (
        <Card>
          <EmptyState
            icon={FlaskConical}
            title="No simulation run yet"
            description="Choose a scenario and a bank above, then start the simulation to
              generate a judge-facing incident: sensor readings, alerts, rule-based lot
              risk, a prioritised checklist and reserve-stock matches across the network."
          />
        </Card>
      )}

      {/* demo walkthrough */}
      <details className="rounded-xl border border-earth-200 bg-white px-5 py-4">
        <summary className="cursor-pointer select-none text-[13px] font-semibold text-earth-800">
          How to run the 8-step demo
        </summary>
        <ol className="mt-3 space-y-1.5">
          {[
            "Open the Dashboard for the network overview: banks, seed quantity, open alerts.",
            "Trigger a simulated alert (Monitoring → simulate readings) to show live detection.",
            "Inspect Inventory to see flagged lots and their recorded condition.",
            "Run a Seed Rescue Simulation here to model an emergency end-to-end.",
            "Review the prioritised checklist and rule-based lot risk with reasons.",
            "Find reserve stock for the affected variety elsewhere in the network.",
            "Open a rescue request, propose a donor, then approve → dispatch → receive.",
            "See the updated inventory and activity history confirm the transfer.",
          ].map((line, i) => (
            <li key={i} className="flex gap-2.5 text-[12.5px] leading-relaxed text-earth-600">
              <span className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-forest-700 text-[11px] font-semibold text-white">
                {i + 1}
              </span>
              <span>{line}</span>
            </li>
          ))}
        </ol>
      </details>
    </div>
  );
}
