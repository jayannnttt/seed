/* Seed Rescue Network — coordinate moving reserve seed from a bank that
 * has it to a bank at risk of losing a variety.
 *
 * Matching is rule-based and fully documented (backend/app/rules.py):
 * recorded variety only (genetic equivalence is never claimed), available
 * quantity, recorded condition and germination data, and travel distance
 * when coordinates exist. Every score shown here can be traced back to
 * its breakdown via the "Why this donor?" panel.
 *
 * Status workflow (drives every action button in this file):
 *   pending → (donor proposed, still pending) → approved (stock RESERVED,
 *   not deducted) → dispatched (in transit) → received (donor stock
 *   deducted, receiving lot created). rejected is possible from pending or
 *   approved and releases any reservation.
 */
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useSearchParams } from "react-router-dom";
import {
  AlertTriangle, ArrowRight, CheckCircle2, Network, Phone, Plus, SearchX,
  ShieldCheck, Truck, XCircle,
} from "lucide-react";
import { api } from "../lib/api";
import { useApi, useMutation } from "../lib/hooks";
import {
  categoryLabel, formatDate, formatDateTime, formatNumber, timeAgo, titleCase,
} from "../lib/format";
import type {
  Bank, Match, RescueDetail, RescueRequest, Transfer, Variety,
} from "../lib/types";
import {
  Badge, Button, Card, ConfirmDialog, EmptyState, ErrorState, Field, Input,
  Modal, Notice, PageHeader, Select, Spinner, TableWrap, Td, Textarea, Th,
  conditionTone, rescueStatusTone, useToast,
} from "../components/ui";

/* ------------------------------------------------------------- labels ---- */

const STATUS_LABELS: Record<string, string> = {
  pending: "Pending — awaiting donor approval",
  approved: "Approved — stock reserved",
  dispatched: "Dispatched — in transit",
  received: "Received — inventory updated",
  rejected: "Rejected",
};

const UNITS = ["kg", "gram", "quintal", "packet", "bag", "sachet"];
const REASON_CATEGORIES = [
  "flood", "power_failure", "equipment_failure", "storage_risk",
  "contamination", "other",
];
const ACTIVE_STATUSES = new Set(["pending", "approved", "dispatched"]);

const urgencyTone = (urgency: string) =>
  urgency === "critical" ? "red" : urgency === "high" ? "gold" : "neutral";

/* ----------------------------------------------------------- stepper ---- */

const STEP_LABELS = ["Requested", "Approved", "Dispatched", "Received"];
const STATUS_STEP: Record<string, number> = {
  pending: 0, approved: 1, dispatched: 2, received: 3,
};

function Stepper({ status }: { status: string }) {
  const current = STATUS_STEP[status] ?? 0;
  const rejected = status === "rejected";
  return (
    <div className="flex flex-wrap items-center">
      {STEP_LABELS.map((label, i) => {
        const done = status === "received" ? true : !rejected && i < current;
        const active = !rejected && status !== "received" && i === current;
        return (
          <div key={label} className="flex items-center">
            <div className="flex items-center gap-2">
              <span
                className={`inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[12px] font-semibold ${
                  done
                    ? "bg-forest-700 text-white"
                    : active
                      ? "border-2 border-gold-400 bg-gold-100 text-gold-600"
                      : "border border-earth-200 bg-earth-100 text-earth-400"
                }`}
              >
                {done ? <CheckCircle2 size={14} /> : i + 1}
              </span>
              <span
                className={`text-[12px] font-medium ${
                  done ? "text-forest-800" : active ? "text-gold-600" : "text-earth-400"
                }`}
              >
                {label}
              </span>
            </div>
            {i < STEP_LABELS.length - 1 && (
              <span
                className={`mx-3 h-px w-8 sm:w-14 ${
                  status === "received" || (!rejected && i < current)
                    ? "bg-forest-400" : "bg-earth-200"
                }`}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

/* ---------------------------------------------------- score breakdown ---- */

function ScoreBreakdownBar({
  label, value, max, fill,
}: { label: string; value: number; max: number; fill: string }) {
  const pct = max > 0 ? Math.min(100, Math.round((value / max) * 100)) : 0;
  return (
    <div>
      <div className="flex items-center justify-between text-[11.5px] text-earth-600">
        <span>{label}</span>
        <span className="font-medium text-earth-700">
          {formatNumber(value, 1)} / {formatNumber(max, 0)}
        </span>
      </div>
      <div className="mt-1 h-1.5 rounded-full bg-earth-100">
        <div
          className={`h-1.5 rounded-full ${fill}`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

/* ------------------------------------------------------- donor card ----- */

/** Score components come from the documented rule weights: availability
 *  up to 40, condition information up to 35, proximity up to 25. */
function DonorMatchCard({
  match, rank, requestedQuantity, unit, onSelect, selectDisabled,
}: {
  match: Match;
  rank: number;
  requestedQuantity: number;
  unit: string;
  onSelect: (m: Match) => void;
  selectDisabled?: boolean;
}) {
  return (
    <Card className="p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <span className="mt-0.5 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-forest-700 text-[12px] font-semibold text-white">
            {rank}
          </span>
          <div>
            <p className="text-[14px] font-semibold text-earth-900">{match.bank_name}</p>
            <p className="text-[12px] text-earth-500">
              {match.bank_location} · lot <span className="font-mono">{match.lot_code}</span>
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <Badge tone={match.score >= 80 ? "green" : match.score >= 60 ? "sage" : "neutral"}>
            {Math.round(match.score)}/100 fit
          </Badge>
          <Badge tone={conditionTone(match.condition)}>{titleCase(match.condition)} condition</Badge>
        </div>
      </div>

      <dl className="mt-3 grid grid-cols-2 gap-x-5 gap-y-2 text-[12.5px] sm:grid-cols-3">
        <div>
          <dt className="text-[11px] font-medium uppercase tracking-wide text-earth-400">Available</dt>
          <dd className="text-earth-800">
            {formatNumber(match.available_quantity)} {match.unit}{" "}
            <span className="text-earth-500">of {formatNumber(requestedQuantity)} {unit} requested</span>
          </dd>
        </div>
        <div>
          <dt className="text-[11px] font-medium uppercase tracking-wide text-earth-400">Distance</dt>
          <dd className="text-earth-800">
            {match.distance_km !== null
              ? `~${formatNumber(match.distance_km, 1)} km away`
              : <span className="text-earth-500">Distance unknown — no coordinates recorded</span>}
          </dd>
        </div>
        <div>
          <dt className="text-[11px] font-medium uppercase tracking-wide text-earth-400">Germination</dt>
          <dd>
            {match.germination_rate !== null
              ? <span className="text-earth-800">{formatNumber(match.germination_rate, 0)}% germination</span>
              : <Badge tone="neutral">Not tested</Badge>}
          </dd>
        </div>
        <div>
          <dt className="text-[11px] font-medium uppercase tracking-wide text-earth-400">Viability tested</dt>
          <dd className="text-earth-800">{formatDate(match.viability_test_date)}</dd>
        </div>
        <div>
          <dt className="text-[11px] font-medium uppercase tracking-wide text-earth-400">Storage</dt>
          <dd className="text-earth-800">{match.storage_location ?? "—"}</dd>
        </div>
        <div>
          <dt className="text-[11px] font-medium uppercase tracking-wide text-earth-400">Stock updated</dt>
          <dd className="text-earth-800">{timeAgo(match.updated_at)}</dd>
        </div>
      </dl>

      <p className="mt-2 text-[12px] text-earth-500">
        Coordinator: {match.bank_coordinator}
        {match.bank_phone && (
          <>
            {" · "}
            <a
              href={`tel:${match.bank_phone}`}
              className="inline-flex items-center gap-1 text-forest-700 hover:underline"
            >
              <Phone size={11} />
              {match.bank_phone}
            </a>
          </>
        )}
      </p>

      <details className="mt-3 rounded-lg border border-earth-100 bg-ivory-50/70 px-3.5 py-2.5">
        <summary className="cursor-pointer select-none text-[12px] font-medium text-earth-700">
          Why this donor?
        </summary>
        <div className="mt-2 space-y-3">
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
          <div className="space-y-2">
            <p className="text-[11px] font-medium uppercase tracking-wide text-earth-400">
              Score breakdown
            </p>
            <ScoreBreakdownBar
              label="Availability" value={match.score_breakdown.availability} max={40}
              fill="bg-forest-600"
            />
            <ScoreBreakdownBar
              label="Condition information" value={match.score_breakdown.condition_information} max={35}
              fill="bg-sage-500"
            />
            <ScoreBreakdownBar
              label="Proximity" value={match.score_breakdown.proximity} max={25}
              fill="bg-earth-500"
            />
          </div>
        </div>
      </details>

      <div className="mt-3 flex justify-end">
        <Button
          variant="primary"
          size="sm"
          icon={ShieldCheck}
          disabled={selectDisabled || match.available_quantity <= 0}
          onClick={() => onSelect(match)}
        >
          Select this donor
        </Button>
      </div>
    </Card>
  );
}

/* ---------------------------------------------------- match finder ------ */

function MatchFinder({
  requestId, requestQuantity, unit, onSelect, emptyAction,
}: {
  requestId: number;
  requestQuantity: number;
  unit: string;
  onSelect: (m: Match) => void;
  emptyAction: ReactNode;
}) {
  const matches = useApi(() => api.rescueMatches(requestId), [requestId]);
  const list = matches.data?.matches ?? [];

  return (
    <section className="rounded-xl border border-forest-200 bg-forest-50/50 p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3 className="flex items-center gap-2 text-[13.5px] font-semibold text-forest-900">
            <Network size={15} className="text-forest-700" />
            Find donor stock
          </h3>
          <p className="mt-0.5 text-[12px] leading-relaxed text-earth-500">
            Ranked reserve lots of this recorded variety in other banks. Matching is by
            recorded variety only — genetic equivalence is not claimed.
          </p>
        </div>
        <Button size="sm" onClick={matches.reload} loading={matches.loading}>
          {list.length > 0 ? "Search again" : "Refresh results"}
        </Button>
      </div>

      <div className="mt-3 space-y-3">
        {matches.loading && <Spinner label="Searching the network…" />}
        {!matches.loading && matches.error && (
          <ErrorState message={matches.error} onRetry={matches.reload} />
        )}
        {!matches.loading && !matches.error && list.length === 0 && (
          <div className="rounded-xl border border-earth-200 bg-white">
            <EmptyState
              icon={SearchX}
              title="No reserve stock found in the network"
              description="No other bank holds this recorded variety with free stock. Suggested
                next steps: widen the request to a related local variety agreed by your
                community, ask neighbouring networks outside SeedSathi, or document the
                variety as at-risk."
              action={emptyAction}
            />
          </div>
        )}
        {!matches.loading && !matches.error && list.map((m, i) => (
          <DonorMatchCard
            key={m.lot_id}
            match={m}
            rank={i + 1}
            requestedQuantity={requestQuantity}
            unit={unit}
            onSelect={onSelect}
          />
        ))}
      </div>
    </section>
  );
}

/* -------------------------------------------------- detail body --------- */

function DetailBody({ data }: { data: RescueDetail }) {
  const req = data.request;
  return (
    <div className="space-y-4">
      {/* badges + reason */}
      <div className="flex flex-wrap items-center gap-1.5">
        <Badge tone={rescueStatusTone(req.status)}>
          {data.status_labels[req.status] ?? STATUS_LABELS[req.status] ?? titleCase(req.status)}
        </Badge>
        <Badge tone={urgencyTone(req.urgency)}>{titleCase(req.urgency)} urgency</Badge>
        <Badge>Reason: {titleCase(req.reason_category)}</Badge>
        {req.is_demo && <Badge tone="info">Sample</Badge>}
      </div>

      {(req.reason_note || data.reason) && (
        <div className="rounded-lg border border-earth-100 bg-ivory-50/70 px-3.5 py-2.5 text-[12.5px] leading-relaxed text-earth-600">
          {data.reason && <p className="mb-1 text-earth-700">{data.reason}</p>}
          {req.reason_note && <p>{req.reason_note}</p>}
        </div>
      )}

      {/* progress stepper */}
      <div className="rounded-xl border border-earth-200 bg-white px-4 py-3.5">
        <Stepper status={req.status} />
        {req.status === "rejected" && (
          <div className="mt-3 flex items-start gap-2 rounded-lg border border-clay-200 bg-clay-100/70 px-3 py-2 text-[12.5px] text-clay-600">
            <XCircle size={14} className="mt-0.5 shrink-0" />
            <div>
              <p className="font-medium">Rejected — the transfer will not proceed.</p>
              {req.status_note && <p className="mt-0.5">{req.status_note}</p>}
            </div>
          </div>
        )}
      </div>

      {/* summary grid */}
      <div>
        <h3 className="mb-2 text-[12px] font-semibold uppercase tracking-wide text-earth-500">
          Request summary
        </h3>
        <dl className="grid grid-cols-2 gap-x-5 gap-y-2.5 text-[12.5px] sm:grid-cols-3">
          <div>
            <dt className="text-[11px] font-medium uppercase tracking-wide text-earth-400">Variety</dt>
            <dd className="font-medium text-earth-900">{req.variety_name}</dd>
          </div>
          <div>
            <dt className="text-[11px] font-medium uppercase tracking-wide text-earth-400">Crop</dt>
            <dd className="text-earth-800">{categoryLabel(req.crop_category)}</dd>
          </div>
          <div>
            <dt className="text-[11px] font-medium uppercase tracking-wide text-earth-400">Quantity</dt>
            <dd className="text-earth-800">
              {formatNumber(req.required_quantity)} {req.unit} requested
              {req.transfer_quantity !== null && (
                <span className="text-earth-500"> · transfer: {formatNumber(req.transfer_quantity)} {req.unit}</span>
              )}
            </dd>
          </div>
          <div>
            <dt className="text-[11px] font-medium uppercase tracking-wide text-earth-400">Requesting bank</dt>
            <dd className="text-earth-800">{req.requesting_bank_name}</dd>
          </div>
          <div>
            <dt className="text-[11px] font-medium uppercase tracking-wide text-earth-400">Donor</dt>
            <dd className="text-earth-800">
              {req.donor_bank_name
                ? `${req.donor_bank_name}${req.donor_lot_code ? ` — lot ${req.donor_lot_code}` : ""}`
                : <span className="text-earth-500">Not yet selected</span>}
            </dd>
          </div>
          <div>
            <dt className="text-[11px] font-medium uppercase tracking-wide text-earth-400">Last updated</dt>
            <dd className="text-earth-800">{formatDateTime(req.updated_at)}</dd>
          </div>
        </dl>
        <p className="mt-2 text-[11.5px] text-earth-400">Opened {formatDateTime(req.created_at)}</p>
      </div>

      {/* transfer history */}
      {data.transfers.length > 0 && (
        <div>
          <h3 className="mb-2 text-[12px] font-semibold uppercase tracking-wide text-earth-500">
            Transfer history
          </h3>
          <Card>
            <TableWrap>
              <thead>
                <tr>
                  <Th>Status</Th>
                  <Th align="right">Quantity</Th>
                  <Th>Donor → Receiving</Th>
                  <Th>Dispatched</Th>
                  <Th>Received</Th>
                  <Th>Note</Th>
                </tr>
              </thead>
              <tbody>
                {data.transfers.map((t: Transfer) => (
                  <tr key={t.id}>
                    <Td><Badge tone={t.status === "received" ? "green" : t.status === "cancelled" ? "red" : "info"}>{titleCase(t.status)}</Badge></Td>
                    <Td align="right">{formatNumber(t.quantity)} {t.unit}</Td>
                    <Td>{t.donor_bank_name} → {t.receiving_bank_name}</Td>
                    <Td>{formatDateTime(t.dispatched_at)}</Td>
                    <Td>{formatDateTime(t.received_at)}</Td>
                    <Td className="max-w-[220px] text-[12px] text-earth-500">{t.note ?? "—"}</Td>
                  </tr>
                ))}
              </tbody>
            </TableWrap>
          </Card>
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------- request detail ------- */

function RequestDetail({
  requestId, onClose, onChanged, onNewRequest,
}: {
  requestId: number;
  onClose: () => void;
  onChanged: () => void;
  onNewRequest: () => void;
}) {
  const toast = useToast();
  const detail = useApi(() => api.rescueRequest(requestId), [requestId]);
  const data = detail.data;
  const req = data?.request;

  const [selecting, setSelecting] = useState<Match | null>(null);
  const [qty, setQty] = useState("");
  const [qtyError, setQtyError] = useState<string | null>(null);
  const [rejectOpen, setRejectOpen] = useState(false);
  const [rejectNote, setRejectNote] = useState("");
  const [receiveConfirm, setReceiveConfirm] = useState(false);

  const refreshed = (title: string, description?: string) => {
    toast.success(title, description);
    detail.reload();
    onChanged();
  };

  const approveMut = useMutation(() => api.approveRescue(requestId), {
    onSuccess: () => refreshed("Request approved", "Stock is now reserved at the donor bank — not yet deducted."),
    onError: () => undefined,
  });
  const dispatchMut = useMutation(() => api.dispatchRescue(requestId), {
    onSuccess: () => refreshed("Marked dispatched", "The transfer is now recorded as in transit."),
  });
  const receiveMut = useMutation(() => api.receiveRescue(requestId), {
    onSuccess: () => {
      setReceiveConfirm(false);
      refreshed("Transfer received", "Donor stock was deducted and a receiving lot was created.");
    },
  });
  const rejectMut = useMutation(
    (note: string) => api.rejectRescue(requestId, note.trim() ? note.trim() : undefined),
    {
      onSuccess: () => {
        setRejectOpen(false);
        setRejectNote("");
        refreshed("Request rejected", "Any reserved stock has been released.");
      },
    },
  );
  const proposeMut = useMutation(
    (lotId: number, quantity: number) =>
      api.proposeDonor(requestId, { donor_lot_id: lotId, transfer_quantity: quantity }),
    {
      onSuccess: () => {
        setSelecting(null);
        refreshed("Donor proposed — awaiting donor approval");
      },
    },
  );

  const actionError =
    approveMut.error ?? dispatchMut.error ?? receiveMut.error ??
    rejectMut.error ?? proposeMut.error;

  const handleSelectDonor = (m: Match) => {
    setSelecting(m);
    const wanted = Math.min(req?.required_quantity ?? m.available_quantity, m.available_quantity);
    setQty(wanted > 0 ? String(Number(wanted.toFixed(2))) : "");
    setQtyError(null);
  };

  const submitProposal = () => {
    if (!selecting) return;
    const q = Number(qty);
    if (!Number.isFinite(q) || q <= 0) {
      setQtyError("Enter a quantity greater than zero.");
      return;
    }
    if (q > selecting.available_quantity) {
      setQtyError(
        `This donor lot has only ${formatNumber(selecting.available_quantity, 2)} ${selecting.unit} available.`,
      );
      return;
    }
    proposeMut.run(selecting.lot_id, q);
  };

  const canApprove = req?.status === "pending" && !!req.donor_lot_id;
  const canDispatch = req?.status === "approved";
  const canReceive = req?.status === "dispatched";
  const canReject = req?.status === "pending" || req?.status === "approved";

  return (
    <>
      <Modal
        open
        onClose={onClose}
        width="max-w-3xl"
        title={req ? req.request_code : "Rescue request"}
        subtitle={req ? `${req.variety_name} · ${req.requesting_bank_name}` : undefined}
        footer={
          req ? (
            <>
              {canReject && (
                <Button variant="danger" icon={XCircle} disabled={rejectMut.pending} onClick={() => setRejectOpen(true)}>
                  Reject
                </Button>
              )}
              {canApprove && (
                <Button variant="primary" icon={CheckCircle2} loading={approveMut.pending} onClick={() => approveMut.run()}>
                  Approve (reserve stock)
                </Button>
              )}
              {canDispatch && (
                <Button variant="primary" icon={Truck} loading={dispatchMut.pending} onClick={() => dispatchMut.run()}>
                  Mark dispatched
                </Button>
              )}
              {canReceive && (
                <Button variant="primary" icon={CheckCircle2} onClick={() => setReceiveConfirm(true)}>
                  Mark received — update inventory
                </Button>
              )}
              {!canApprove && !canDispatch && !canReceive && !canReject && (
                <Button onClick={onClose}>Close</Button>
              )}
            </>
          ) : null
        }
      >
        {detail.loading && <Spinner label="Loading rescue request…" />}
        {!detail.loading && detail.error && (
          <ErrorState message={detail.error} onRetry={detail.reload} />
        )}
        {!detail.loading && !detail.error && data && (
          <div className="space-y-4">
            {actionError && (
              <Notice tone="gold" icon={AlertTriangle}>{actionError}</Notice>
            )}
            <DetailBody data={data} />
            {req && req.status === "pending" && !req.donor_lot_id && (
              <MatchFinder
                requestId={requestId}
                requestQuantity={req.required_quantity}
                unit={req.unit}
                onSelect={handleSelectDonor}
                emptyAction={
                  <Button
                    variant="primary"
                    size="sm"
                    icon={Plus}
                    onClick={() => {
                      onClose();
                      onNewRequest();
                    }}
                  >
                    Open a new request with different parameters
                  </Button>
                }
              />
            )}
          </div>
        )}
      </Modal>

      {/* propose donor — quantity */}
      {selecting && (
        <Modal
          open
          onClose={() => setSelecting(null)}
          title="Propose this donor"
          subtitle={`${selecting.bank_name} — lot ${selecting.lot_code}`}
          footer={
            <>
              <Button onClick={() => setSelecting(null)} disabled={proposeMut.pending}>Cancel</Button>
              <Button variant="primary" loading={proposeMut.pending} onClick={submitProposal}>
                Propose donor
              </Button>
            </>
          }
        >
          <div className="space-y-3">
            <p className="text-[13px] leading-relaxed text-earth-600">
              The donor bank's coordinator must approve the proposal before stock is
              reserved. Available reserve at this lot:{" "}
              <strong>{formatNumber(selecting.available_quantity)} {selecting.unit}</strong>.
            </p>
            {proposeMut.error && <Notice tone="gold" icon={AlertTriangle}>{proposeMut.error}</Notice>}
            <Field
              label={`Transfer quantity (${selecting.unit})`}
              required
              error={qtyError}
              hint={`At most ${formatNumber(selecting.available_quantity)} ${selecting.unit} is available at this lot.`}
            >
              <Input
                type="number"
                min={0.01}
                step="any"
                max={selecting.available_quantity}
                value={qty}
                onChange={(e) => {
                  setQty(e.target.value);
                  setQtyError(null);
                }}
              />
            </Field>
          </div>
        </Modal>
      )}

      {/* reject — note */}
      {rejectOpen && (
        <Modal
          open
          onClose={() => setRejectOpen(false)}
          title="Reject this rescue request"
          subtitle="The transfer will not proceed and any reservation is released."
          footer={
            <>
              <Button onClick={() => setRejectOpen(false)} disabled={rejectMut.pending}>Cancel</Button>
              <Button variant="danger" loading={rejectMut.pending} onClick={() => rejectMut.run(rejectNote)}>
                Reject request
              </Button>
            </>
          }
        >
          {rejectMut.error && <Notice tone="gold" icon={AlertTriangle}>{rejectMut.error}</Notice>}
          <Field label="Note (optional)" hint="Explain why — the requesting bank will see this.">
            <Textarea
              rows={3}
              value={rejectNote}
              onChange={(e) => setRejectNote(e.target.value)}
              placeholder="e.g. Reserve stock is committed to a local distribution next week."
            />
          </Field>
        </Modal>
      )}

      {/* receive — irreversible */}
      <ConfirmDialog
        open={receiveConfirm}
        onClose={() => setReceiveConfirm(false)}
        onConfirm={() => receiveMut.run()}
        title="Confirm receipt of this transfer?"
        confirmLabel="Mark received"
        tone="danger"
        loading={receiveMut.pending}
        message={
          <>
            Marking this transfer as received is <strong>irreversible</strong>. It deducts
            the transferred quantity from the donor lot and creates a new receiving lot at
            the requesting bank, updating inventory on both sides.
          </>
        }
      />

    </>
  );
}

/* -------------------------------------------------- create modal -------- */

interface Prefill {
  variety_id: number;
  bank_id: number;
  quantity: number | null;
  unit: string | null;
}

function CreateRequestModal({
  open, prefill, onClose, onCreated,
}: {
  open: boolean;
  prefill: Prefill | null;
  onClose: () => void;
  onCreated: (req: RescueRequest) => void;
}) {
  const toast = useToast();
  const varieties = useApi<Variety[]>(() => api.varieties(), [open]);
  const banks = useApi<Bank[]>(() => api.banks(), [open]);

  const [varietyId, setVarietyId] = useState(prefill?.variety_id ? String(prefill.variety_id) : "");
  const [bankId, setBankId] = useState(prefill?.bank_id ? String(prefill.bank_id) : "");
  const [quantity, setQuantity] = useState(prefill?.quantity ? String(prefill.quantity) : "");
  const [unit, setUnit] = useState(prefill?.unit ?? "kg");
  const [urgency, setUrgency] = useState("routine");
  const [reasonCategory, setReasonCategory] = useState("storage_risk");
  const [reasonNote, setReasonNote] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});

  const createMut = useMutation(
    (body: {
      variety_id: number; requesting_bank_id: number; required_quantity: number;
      unit: string; urgency: string; reason_category: string; reason_note?: string;
    }) => api.createRescueRequest(body),
    {
      onSuccess: (req) => {
        toast.success("Rescue request opened", `${req.request_code} — the network can now search for donor stock.`);
        onCreated(req);
      },
    },
  );

  const submit = () => {
    const next: Record<string, string> = {};
    if (!varietyId) next.variety_id = "Choose the variety that is at risk.";
    if (!bankId) next.bank_id = "Choose the bank raising the request.";
    const q = Number(quantity);
    if (!quantity || !Number.isFinite(q) || q <= 0) {
      next.quantity = "Required quantity must be greater than zero.";
    }
    setErrors(next);
    if (Object.keys(next).length > 0) return;
    createMut.run({
      variety_id: Number(varietyId),
      requesting_bank_id: Number(bankId),
      required_quantity: q,
      unit,
      urgency,
      reason_category: reasonCategory,
      reason_note: reasonNote.trim() || undefined,
    });
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      width="max-w-2xl"
      title="New rescue request"
      subtitle="Ask the network to find verified reserve stock of a variety you risk losing."
      footer={
        <>
          <Button onClick={onClose} disabled={createMut.pending}>Cancel</Button>
          <Button variant="primary" loading={createMut.pending} onClick={submit}>
            Open rescue request
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        {createMut.error && <Notice tone="gold" icon={AlertTriangle}>{createMut.error}</Notice>}

        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Variety at risk" required error={errors.variety_id}>
            {varieties.loading ? (
              <Spinner label="Loading varieties…" />
            ) : varieties.error ? (
              <ErrorState message={varieties.error} onRetry={varieties.reload} />
            ) : (
              <Select value={varietyId} onChange={(e) => setVarietyId(e.target.value)}>
                <option value="">Select a variety…</option>
                {(varieties.data ?? []).map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.name}{v.is_indigenous ? " (indigenous)" : ""}
                  </option>
                ))}
              </Select>
            )}
          </Field>

          <Field label="Requesting bank" required error={errors.bank_id}>
            {banks.loading ? (
              <Spinner label="Loading banks…" />
            ) : banks.error ? (
              <ErrorState message={banks.error} onRetry={banks.reload} />
            ) : (
              <Select value={bankId} onChange={(e) => setBankId(e.target.value)}>
                <option value="">Select a bank…</option>
                {(banks.data ?? []).map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name} — {b.location}
                  </option>
                ))}
              </Select>
            )}
          </Field>

          <Field label="Required quantity" required error={errors.quantity}>
            <Input
              type="number"
              min={0.01}
              step="any"
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
              placeholder="e.g. 25"
            />
          </Field>

          <Field label="Unit">
            <Select value={unit} onChange={(e) => setUnit(e.target.value)}>
              {UNITS.map((u) => <option key={u} value={u}>{u}</option>)}
            </Select>
          </Field>

          <Field label="Urgency">
            <Select value={urgency} onChange={(e) => setUrgency(e.target.value)}>
              <option value="routine">Routine</option>
              <option value="high">High</option>
              <option value="critical">Critical</option>
            </Select>
          </Field>

          <Field label="Reason category">
            <Select value={reasonCategory} onChange={(e) => setReasonCategory(e.target.value)}>
              {REASON_CATEGORIES.map((c) => (
                <option key={c} value={c}>{titleCase(c)}</option>
              ))}
            </Select>
          </Field>
        </div>

        <Field label="Reason note" hint="What happened, and what you observed. The donor bank will read this.">
          <Textarea
            rows={3}
            value={reasonNote}
            onChange={(e) => setReasonNote(e.target.value)}
            placeholder="e.g. Roof leak after the flood — the top shelf lots were exposed to moisture."
          />
        </Field>
      </div>
    </Modal>
  );
}

/* ------------------------------------------------------- page ----------- */

type TabKey = "active" | "all" | "transfers";

const TABS: { key: TabKey; label: string }[] = [
  { key: "active", label: "Active requests" },
  { key: "all", label: "All requests" },
  { key: "transfers", label: "Transfer history" },
];

export default function RescueNetwork() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [tab, setTab] = useState<TabKey>("active");
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [prefill, setPrefill] = useState<Prefill | null>(null);

  const requests = useApi<RescueRequest[]>(() => api.rescueRequests(), []);
  const transfers = useApi<Transfer[]>(() => api.transfers(), []);

  /* Deep link support: /rescue?variety_id=N&bank_id=M (Inventory and the
   * simulation page link here). Prefill the create form and open it. */
  useEffect(() => {
    const vRaw = searchParams.get("variety_id");
    const bRaw = searchParams.get("bank_id");
    const v = Number(vRaw);
    const b = Number(bRaw);
    if (vRaw && bRaw && Number.isFinite(v) && v > 0 && Number.isFinite(b) && b > 0) {
      const q = Number(searchParams.get("quantity"));
      setPrefill({
        variety_id: v,
        bank_id: b,
        quantity: searchParams.get("quantity") && q > 0 ? q : null,
        unit: searchParams.get("unit"),
      });
      setCreateOpen(true);
      setSearchParams({}, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const filtered = useMemo(() => {
    const list = requests.data ?? [];
    return tab === "all" ? list : list.filter((r) => ACTIVE_STATUSES.has(r.status));
  }, [requests.data, tab]);

  const openCreate = () => {
    setPrefill(null);
    setCreateOpen(true);
  };

  const handleCreated = (req: RescueRequest) => {
    setCreateOpen(false);
    setTab("active");
    requests.reload();
    setSelectedId(req.id);
  };

  return (
    <div className="space-y-5">
      <PageHeader
        title="Seed Rescue Network"
        description="When a community seed bank risks losing a variety, find verified reserve
          stock elsewhere in the network and coordinate the transfer."
        actions={
          <Button variant="primary" icon={Plus} onClick={openCreate}>
            New rescue request
          </Button>
        }
      />

      <Notice tone="green" icon={Network}>
        Matches are ranked by a documented, transparent rule: variety match (recorded
        variety only — genetic equivalence is NOT claimed unless both banks' records are
        verified), available quantity, recorded condition and germination data, and travel
        distance when coordinates exist.
      </Notice>

      {/* tabs */}
      <div className="flex flex-wrap gap-1.5">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`rounded-full px-3.5 py-1.5 text-[12.5px] font-medium transition-colors ${
              tab === t.key
                ? "bg-forest-700 text-white"
                : "border border-earth-200 bg-white text-earth-600 hover:bg-earth-100"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "transfers" ? (
        <Card>
          {transfers.loading && <Spinner label="Loading transfers…" />}
          {!transfers.loading && transfers.error && (
            <ErrorState message={transfers.error} onRetry={transfers.reload} />
          )}
          {!transfers.loading && !transfers.error && (transfers.data ?? []).length === 0 && (
            <EmptyState
              icon={Truck}
              title="No transfers recorded yet"
              description="Transfers appear here once a rescue request is approved, dispatched or received."
            />
          )}
          {!transfers.loading && !transfers.error && (transfers.data ?? []).length > 0 && (
            <TableWrap>
              <thead>
                <tr>
                  <Th>Request</Th>
                  <Th>Variety</Th>
                  <Th>Donor bank</Th>
                  <Th>Receiving bank</Th>
                  <Th align="right">Quantity</Th>
                  <Th>Status</Th>
                  <Th>Dispatched</Th>
                  <Th>Received</Th>
                  <Th>Note</Th>
                </tr>
              </thead>
              <tbody>
                {(transfers.data ?? []).map((t) => (
                  <tr key={t.id}>
                    <Td className="font-mono text-[12px]">#{t.request_id}</Td>
                    <Td>{t.variety_name}</Td>
                    <Td>{t.donor_bank_name}</Td>
                    <Td>{t.receiving_bank_name}</Td>
                    <Td align="right">{formatNumber(t.quantity)} {t.unit}</Td>
                    <Td>
                      <Badge tone={t.status === "received" ? "green" : t.status === "cancelled" ? "red" : "info"}>
                        {titleCase(t.status)}
                      </Badge>
                    </Td>
                    <Td>{formatDateTime(t.dispatched_at)}</Td>
                    <Td>{formatDateTime(t.received_at)}</Td>
                    <Td className="max-w-[200px] text-[12px] text-earth-500">{t.note ?? "—"}</Td>
                  </tr>
                ))}
              </tbody>
            </TableWrap>
          )}
        </Card>
      ) : (
        <>
          {requests.loading && <Card><Spinner label="Loading rescue requests…" /></Card>}
          {!requests.loading && requests.error && (
            <Card>
              <ErrorState message={requests.error} onRetry={requests.reload} />
            </Card>
          )}
          {!requests.loading && !requests.error && filtered.length === 0 && (
            <Card>
              <EmptyState
                icon={Network}
                title={(requests.data ?? []).length === 0
                  ? "No rescue requests yet"
                  : tab === "active"
                    ? "No active rescue requests"
                    : "No rescue requests yet"}
                description="When a seed bank is at risk, open a request here to find reserve
                  stock across the network."
                action={
                  <Button variant="primary" icon={Plus} onClick={openCreate}>
                    New rescue request
                  </Button>
                }
              />
            </Card>
          )}
          {!requests.loading && !requests.error && filtered.length > 0 && (
            <div className="space-y-3">
              {filtered.map((r) => (
                <Card key={r.id} className="p-4">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <Badge className="font-mono">{r.request_code}</Badge>
                    <Badge tone={rescueStatusTone(r.status)}>
                      {STATUS_LABELS[r.status] ?? titleCase(r.status)}
                    </Badge>
                    <Badge tone={urgencyTone(r.urgency)}>{titleCase(r.urgency)}</Badge>
                    {r.is_demo && <Badge tone="info">Sample</Badge>}
                    {r.scenario && <Badge tone="sage">{titleCase(r.scenario)}</Badge>}
                    <span className="ml-auto text-[11.5px] text-earth-400">{timeAgo(r.updated_at)}</span>
                  </div>

                  <div className="mt-2.5 flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                    <p className="text-[14px] font-semibold text-earth-900">{r.variety_name}</p>
                    <span className="text-[12px] text-earth-500">{categoryLabel(r.crop_category)}</span>
                  </div>
                  <p className="mt-0.5 text-[12.5px] text-earth-600">
                    Requested by {r.requesting_bank_name} · {formatNumber(r.required_quantity)} {r.unit} requested
                    {r.transfer_quantity !== null && (
                      <span className="text-earth-500"> · Transfer: {formatNumber(r.transfer_quantity)} {r.unit}</span>
                    )}
                  </p>

                  {r.donor_bank_name && (
                    <p className="mt-1 flex items-center gap-1.5 text-[12.5px] text-forest-800">
                      <ArrowRight size={13} className="text-forest-600" />
                      Donor: {r.donor_bank_name}
                      {r.donor_lot_code && (
                        <span className="text-earth-500">— lot <span className="font-mono">{r.donor_lot_code}</span></span>
                      )}
                    </p>
                  )}

                  {r.status_note && (
                    <p className="mt-2 rounded-lg border border-earth-100 bg-ivory-50/70 px-3 py-1.5 text-[12px] leading-relaxed text-earth-500">
                      {r.status_note}
                    </p>
                  )}

                  <div className="mt-3 flex justify-end">
                    <Button size="sm" onClick={() => setSelectedId(r.id)}>Open</Button>
                  </div>
                </Card>
              ))}
            </div>
          )}
        </>
      )}

      {selectedId !== null && (
        <RequestDetail
          requestId={selectedId}
          onClose={() => setSelectedId(null)}
          onChanged={requests.reload}
          onNewRequest={openCreate}
        />
      )}

      {createOpen && (
        <CreateRequestModal
          open={createOpen}
          prefill={prefill}
          onClose={() => setCreateOpen(false)}
          onCreated={handleCreated}
        />
      )}
    </div>
  );
}
