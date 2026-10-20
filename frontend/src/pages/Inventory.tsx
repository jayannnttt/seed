/* Seed Inventory — the core CRUD screen of Seed Vault.
 *
 * Every number on this page comes from the backend. Germination rates that
 * were never measured are shown as "Not tested" / "Never tested — viability
 * unknown" and are never invented. Risk flags are local working flags
 * recomputed by the documented rules on the server, not official statuses.
 */
import {
  AlertTriangle, Database, Eye, Leaf, Network, Pencil, Plus, Search, SearchX,
  Trash2, X,
} from "lucide-react";
import { useEffect, useMemo, useState, type ChangeEvent, type ReactNode } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import {
  Badge, Button, Card, ConfirmDialog, EmptyState, ErrorState, Field, Input,
  Modal, Notice, PageHeader, Select, Spinner, TableWrap, Td, Th, Textarea,
  conditionTone, riskTone, useToast,
} from "../components/ui";
import { api } from "../lib/api";
import {
  categoryLabel, formatDate, formatDateTime, formatNumber, timeAgo, titleCase,
} from "../lib/format";
import { useApi, useDebounced, useMutation } from "../lib/hooks";
import type { Bank, InventoryMeta, Lot, Variety } from "../lib/types";

/* ------------------------------------------------------------------ data - */
const SORT_OPTIONS: { value: string; label: string }[] = [
  { value: "updated_desc", label: "Latest update" },
  { value: "quantity_desc", label: "Quantity high to low" },
  { value: "quantity_asc", label: "Quantity low to high" },
  { value: "name_asc", label: "Lot ID A to Z" },
];

const FALLBACK_RISK_FLAGS = ["none", "watch", "priority"];

/** Only accept a positive integer coming from the URL / select. */
function toBankId(value: string): number | undefined {
  if (!value) return undefined;
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : undefined;
}

function stockText(quantity: number, unit: string): string {
  return `${formatNumber(quantity, 2)} ${unit}`;
}

/* --------------------------------------------------------- lot form modal - */
interface LotForm {
  lot_code: string;
  variety_id: string;
  bank_id: string;
  quantity: string;
  unit: string;
  condition: string;
  risk_flag: string;
  source_location: string;
  harvest_date: string;
  storage_location: string;
  germination_rate: string;
  viability_test_date: string;
  notes: string;
}

interface LotFormErrors {
  lot_code?: string;
  variety_id?: string;
  bank_id?: string;
  quantity?: string;
  germination_rate?: string;
}

interface LotPayload {
  lot_code: string;
  variety_id: number;
  bank_id: number;
  quantity: number;
  unit: string;
  condition: string;
  risk_flag: string;
  source_location: string | null;
  harvest_date: string | null;
  storage_location: string | null;
  germination_rate: number | null;
  viability_test_date: string | null;
  notes: string | null;
}

function emptyLotForm(): LotForm {
  return {
    lot_code: "",
    variety_id: "",
    bank_id: "",
    quantity: "",
    unit: "kg",
    condition: "unknown",
    risk_flag: "none",
    source_location: "",
    harvest_date: "",
    storage_location: "",
    germination_rate: "",
    viability_test_date: "",
    notes: "",
  };
}

function formFromLot(lot: Lot): LotForm {
  return {
    lot_code: lot.lot_code,
    variety_id: String(lot.variety_id),
    bank_id: String(lot.bank_id),
    quantity: String(lot.quantity),
    unit: lot.unit,
    condition: lot.condition,
    risk_flag: lot.risk_flag,
    source_location: lot.source_location ?? "",
    harvest_date: lot.harvest_date ?? "",
    storage_location: lot.storage_location ?? "",
    germination_rate: lot.germination_rate === null ? "" : String(lot.germination_rate),
    viability_test_date: lot.viability_test_date ?? "",
    notes: lot.notes ?? "",
  };
}

function validateLotForm(form: LotForm): LotFormErrors {
  const errors: LotFormErrors = {};
  const code = form.lot_code.trim();
  if (!code) errors.lot_code = "Lot code is required.";
  else if (code.length < 2) errors.lot_code = "Lot code must be at least 2 characters.";

  if (!form.variety_id) errors.variety_id = "Choose the seed variety for this lot.";
  if (!form.bank_id) errors.bank_id = "Choose the seed bank holding this lot.";

  const quantity = form.quantity.trim();
  const qty = Number(quantity);
  if (!quantity) errors.quantity = "Quantity is required.";
  else if (!Number.isFinite(qty)) errors.quantity = "Enter a valid quantity.";
  else if (qty < 0) errors.quantity = "Quantity cannot be negative.";

  const rate = form.germination_rate.trim();
  if (rate) {
    const parsed = Number(rate);
    if (!Number.isFinite(parsed) || parsed < 0 || parsed > 100) {
      errors.germination_rate = "Germination rate must be between 0 and 100.";
    }
  }
  // A test date without a measured rate would make untested seed look verified.
  if (form.viability_test_date && !rate) {
    errors.germination_rate =
      "Record the measured rate, or clear the test date — untested germination must not look verified.";
  }
  return errors;
}

function LotFormModal({
  open, mode, lot, varieties, banks, meta, optionsError, onRetryOptions,
  onClose, onSaved,
}: {
  open: boolean;
  mode: "create" | "edit";
  lot: Lot | null;
  varieties: Variety[] | null;
  banks: Bank[] | null;
  meta: InventoryMeta | null;
  optionsError: string | null;
  onRetryOptions: () => void;
  onClose: () => void;
  onSaved: () => void;
}) {
  const toast = useToast();
  const [form, setForm] = useState<LotForm>(emptyLotForm);
  const [errors, setErrors] = useState<LotFormErrors>({});

  useEffect(() => {
    if (!open) return;
    setForm(lot ? formFromLot(lot) : emptyLotForm());
    setErrors({});
  }, [open, lot]);

  const save = useMutation(
    (payload: LotPayload, lotId?: number) =>
      lotId === undefined ? api.createLot(payload) : api.updateLot(lotId, payload),
    {
      onSuccess: (saved) => {
        toast.success(
          mode === "create" ? "Seed lot added" : "Seed lot updated",
          `${saved.lot_code} was saved to ${saved.bank_name}.`,
        );
        onSaved();
      },
      onError: (message) => toast.error("Could not save seed lot", message),
    },
  );

  const set = (key: keyof LotForm) =>
    (event: ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
      const value = event.target.value;
      setForm((prev) => ({ ...prev, [key]: value }));
      setErrors((prev) => {
        if (!(key in prev)) return prev;
        const next: LotFormErrors = { ...prev };
        delete (next as Record<string, string | undefined>)[key];
        return next;
      });
    };

  const submit = () => {
    const nextErrors = validateLotForm(form);
    setErrors(nextErrors);
    if (Object.values(nextErrors).some(Boolean)) return;

    const payload: LotPayload = {
      lot_code: form.lot_code.trim(),
      variety_id: Number(form.variety_id),
      bank_id: Number(form.bank_id),
      quantity: Number(form.quantity),
      unit: form.unit,
      condition: form.condition,
      risk_flag: form.risk_flag,
      source_location: form.source_location.trim() || null,
      harvest_date: form.harvest_date || null,
      storage_location: form.storage_location.trim() || null,
      germination_rate: form.germination_rate.trim() ? Number(form.germination_rate) : null,
      viability_test_date: form.viability_test_date || null,
      notes: form.notes.trim() || null,
    };
    void save.run(payload, mode === "edit" && lot ? lot.id : undefined);
  };

  const units = meta?.units ?? [];
  const conditions = meta?.conditions ?? [];
  const riskFlags = meta?.risk_flags?.length ? meta.risk_flags : FALLBACK_RISK_FLAGS;
  const disabled = Boolean(optionsError);

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={mode === "create" ? "Add seed lot" : "Edit seed lot"}
      subtitle={
        mode === "edit" && lot
          ? `Updating ${lot.lot_code} at ${lot.bank_name}`
          : "Register a new lot held by one of the community seed banks"
      }
      width="max-w-2xl"
      footer={
        <>
          <Button onClick={onClose} disabled={save.pending}>
            Cancel
          </Button>
          <Button
            variant="primary"
            icon={mode === "create" ? Plus : Pencil}
            loading={save.pending}
            onClick={submit}
          >
            {mode === "create" ? "Add seed lot" : "Save changes"}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {optionsError && (
          <Notice tone="gold" icon={AlertTriangle}>
            Reference lists could not be loaded: {optionsError}{" "}
            <button
              type="button"
              onClick={onRetryOptions}
              className="font-semibold underline underline-offset-2"
            >
              Retry
            </button>
          </Notice>
        )}
        {save.error && <Notice tone="gold" icon={AlertTriangle}>{save.error}</Notice>}

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Seed variety" required error={errors.variety_id}>
            <Select
              value={form.variety_id}
              onChange={set("variety_id")}
              disabled={disabled || !varieties}
            >
              <option value="">
                {varieties?.length ? "Select a variety" : "No varieties available yet"}
              </option>
              {(varieties ?? []).map((variety) => (
                <option key={variety.id} value={variety.id}>
                  {variety.name} ({categoryLabel(variety.crop_category)})
                  {variety.is_indigenous ? " · indigenous" : ""}
                </option>
              ))}
            </Select>
          </Field>

          <Field label="Seed bank" required error={errors.bank_id}>
            <Select
              value={form.bank_id}
              onChange={set("bank_id")}
              disabled={disabled || !banks}
            >
              <option value="">
                {banks?.length ? "Select a seed bank" : "No seed banks available yet"}
              </option>
              {(banks ?? []).map((bank) => (
                <option key={bank.id} value={bank.id}>
                  {bank.name} — {bank.location}
                </option>
              ))}
            </Select>
          </Field>

          <Field label="Lot ID" required error={errors.lot_code} hint="Must be unique across the network.">
            <Input
              value={form.lot_code}
              onChange={set("lot_code")}
              placeholder="e.g. KML-2024-017"
              maxLength={48}
            />
          </Field>

          <Field label="Quantity" required error={errors.quantity}>
            <Input
              type="number"
              min={0}
              step="any"
              value={form.quantity}
              onChange={set("quantity")}
              placeholder="0"
            />
          </Field>

          <Field label="Unit">
            <Select value={form.unit} onChange={set("unit")} disabled={disabled}>
              {units.length === 0 && <option value={form.unit}>{form.unit}</option>}
              {units.map((unit) => (
                <option key={unit} value={unit}>
                  {titleCase(unit)}
                </option>
              ))}
            </Select>
          </Field>

          <Field label="Condition">
            <Select value={form.condition} onChange={set("condition")} disabled={disabled}>
              {conditions.length === 0 && (
                <option value={form.condition}>{titleCase(form.condition)}</option>
              )}
              {conditions.map((value) => (
                <option key={value} value={value}>
                  {titleCase(value)}
                </option>
              ))}
            </Select>
          </Field>

          <Field
            label="Local risk flag"
            hint={
              meta?.risk_flag_notes?.[form.risk_flag] ??
              "Local working flag, recomputed from documented rules after saving."
            }
          >
            <Select value={form.risk_flag} onChange={set("risk_flag")}>
              {riskFlags.map((value) => (
                <option key={value} value={value}>
                  {titleCase(value)}
                </option>
              ))}
            </Select>
          </Field>

          <Field label="Source location">
            <Input
              value={form.source_location}
              onChange={set("source_location")}
              placeholder="Where the seed came from"
            />
          </Field>

          <Field label="Harvest date">
            <Input type="date" value={form.harvest_date} onChange={set("harvest_date")} />
          </Field>

          <Field label="Storage location">
            <Input
              value={form.storage_location}
              onChange={set("storage_location")}
              placeholder="e.g. Rack B, shelf 3"
            />
          </Field>

          <Field
            label="Germination rate (%)"
            error={errors.germination_rate}
            hint="Leave empty if never tested — untested must stay unknown."
          >
            <Input
              type="number"
              min={0}
              max={100}
              step={0.1}
              value={form.germination_rate}
              onChange={set("germination_rate")}
              placeholder="e.g. 86"
            />
          </Field>

          <Field
            label="Viability test date"
            hint="Only valid with a measured germination rate."
          >
            <Input
              type="date"
              value={form.viability_test_date}
              onChange={set("viability_test_date")}
            />
          </Field>

          <div className="sm:col-span-2">
            <Field label="Notes">
              <Textarea
                rows={3}
                value={form.notes}
                onChange={set("notes")}
                placeholder="Handling, provenance or observation notes"
              />
            </Field>
          </div>
        </div>
      </div>
    </Modal>
  );
}

/* ------------------------------------------------------- variety form modal */
interface VarietyForm {
  name: string;
  local_name: string;
  scientific_name: string;
  crop_category: string;
  is_indigenous: boolean;
  indigenous_note: string;
  description: string;
  conservation_note: string;
  origin_region: string;
}

interface VarietyPayload {
  name: string;
  local_name: string | null;
  scientific_name: string | null;
  crop_category: string;
  is_indigenous: boolean;
  indigenous_note: string | null;
  description: string | null;
  conservation_note: string | null;
  origin_region: string | null;
}

type VarietyTextKey =
  | "name"
  | "local_name"
  | "scientific_name"
  | "crop_category"
  | "indigenous_note"
  | "description"
  | "conservation_note"
  | "origin_region";

function emptyVarietyForm(cropCategory: string): VarietyForm {
  return {
    name: "",
    local_name: "",
    scientific_name: "",
    crop_category: cropCategory,
    is_indigenous: false,
    indigenous_note: "",
    description: "",
    conservation_note: "",
    origin_region: "",
  };
}

function VarietyFormModal({
  open, categories, onClose, onSaved,
}: {
  open: boolean;
  categories: string[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const toast = useToast();
  const categoryOptions = categories.length ? categories : ["other"];
  const [form, setForm] = useState<VarietyForm>(() =>
    emptyVarietyForm(categoryOptions.includes("other") ? "other" : categoryOptions[0]),
  );
  const [nameError, setNameError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    const options = categories.length ? categories : ["other"];
    setForm(emptyVarietyForm(options.includes("other") ? "other" : options[0]));
    setNameError(null);
  }, [open, categories]);

  const save = useMutation(
    (payload: VarietyPayload) => api.createVariety(payload),
    {
      onSuccess: (created) => {
        toast.success("Seed variety created", `${created.name} is now in the catalogue.`);
        onSaved();
      },
      onError: (message) => toast.error("Could not create variety", message),
    },
  );

  const set = (key: VarietyTextKey) =>
    (event: ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
      const value = event.target.value;
      setForm((prev) => ({ ...prev, [key]: value }));
      setNameError(null);
    };

  const submit = () => {
    const name = form.name.trim();
    if (name.length < 2) {
      setNameError("Enter a variety name of at least 2 characters.");
      return;
    }
    setNameError(null);
    void save.run({
      name,
      local_name: form.local_name.trim() || null,
      scientific_name: form.scientific_name.trim() || null,
      crop_category: form.crop_category,
      is_indigenous: form.is_indigenous,
      indigenous_note: form.indigenous_note.trim() || null,
      description: form.description.trim() || null,
      conservation_note: form.conservation_note.trim() || null,
      origin_region: form.origin_region.trim() || null,
    });
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="New seed variety"
      subtitle="Add a variety to the catalogue before registering seed lots for it"
      width="max-w-2xl"
      footer={
        <>
          <Button onClick={onClose} disabled={save.pending}>Cancel</Button>
          <Button variant="primary" icon={Leaf} loading={save.pending} onClick={submit}>
            Create variety
          </Button>
        </>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <Field label="Variety name" required error={nameError}>
            <Input
              value={form.name}
              onChange={set("name")}
              placeholder="e.g. Kaladhan rice"
              maxLength={160}
            />
          </Field>
        </div>

        <Field label="Local name">
          <Input value={form.local_name} onChange={set("local_name")} placeholder="Name used by farmers" />
        </Field>

        <Field label="Scientific name">
          <Input
            value={form.scientific_name}
            onChange={set("scientific_name")}
            placeholder="e.g. Oryza sativa"
          />
        </Field>

        <Field label="Crop category">
          <Select value={form.crop_category} onChange={set("crop_category")}>
            {categoryOptions.map((category) => (
              <option key={category} value={category}>
                {categoryLabel(category)}
              </option>
            ))}
          </Select>
        </Field>

        <Field label="Origin region">
          <Input value={form.origin_region} onChange={set("origin_region")} placeholder="Region of origin" />
        </Field>

        <div className="sm:col-span-2">
          <label className="flex items-start gap-2.5 rounded-lg border border-earth-200 bg-ivory-50 px-3.5 py-3">
            <input
              type="checkbox"
              checked={form.is_indigenous}
              onChange={(event) =>
                setForm((prev) => ({ ...prev, is_indigenous: event.target.checked }))
              }
              className="mt-0.5 h-4 w-4 rounded border-earth-300 accent-forest-700"
            />
            <span>
              <span className="block text-[12.5px] font-medium text-earth-800">
                Indigenous variety
              </span>
              <span className="mt-0.5 block text-[11.5px] leading-relaxed text-earth-500">
                Mark this as a locally conserved indigenous landrace kept by the network.
              </span>
            </span>
          </label>
        </div>

        <Field label="Indigenous note">
          <Textarea
            rows={2}
            value={form.indigenous_note}
            onChange={set("indigenous_note")}
            placeholder="Why this variety matters locally"
          />
        </Field>

        <Field label="Conservation note">
          <Textarea
            rows={2}
            value={form.conservation_note}
            onChange={set("conservation_note")}
            placeholder="How this variety should be conserved"
          />
        </Field>

        <div className="sm:col-span-2">
          <Field label="Description">
            <Textarea
              rows={3}
              value={form.description}
              onChange={set("description")}
              placeholder="Morphology, usage and growing notes"
            />
          </Field>
        </div>
      </div>
    </Modal>
  );
}

/* ------------------------------------------------------------ lot detail - */
function LotDetailModal({
  lot, variety, varietyError, onRetryVariety, onClose, onEdit,
}: {
  lot: Lot;
  variety: Variety | null;
  varietyError: string | null;
  onRetryVariety: () => void;
  onClose: () => void;
  onEdit: () => void;
}) {
  const navigate = useNavigate();

  const detail = (label: string, value: ReactNode) => (
    <div>
      <p className="text-[11px] font-semibold uppercase tracking-wide text-earth-500">{label}</p>
      <p className="mt-0.5 text-[13px] text-earth-800">{value}</p>
    </div>
  );

  const sectionTitle = (label: string) => (
    <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-forest-700">
      {label}
    </h3>
  );

  return (
    <Modal
      open
      onClose={onClose}
      title={lot.lot_code}
      subtitle={`${lot.variety_name} · ${lot.bank_name}`}
      width="max-w-2xl"
      footer={
        <>
          <Button onClick={onClose}>Close</Button>
          <Button variant="primary" icon={Pencil} onClick={onEdit}>
            Edit lot
          </Button>
        </>
      }
    >
      <div className="space-y-5">
        <div className="flex flex-wrap items-center gap-2">
          {lot.is_demo && <Badge tone="info">Demonstration record</Badge>}
          {lot.is_indigenous && <Badge tone="sage">Indigenous variety</Badge>}
          <Badge tone={conditionTone(lot.condition)}>Condition: {titleCase(lot.condition)}</Badge>
          <span title={lot.risk_flag_reason ?? undefined}>
            <Badge tone={riskTone(lot.risk_flag)}>Risk flag: {titleCase(lot.risk_flag)}</Badge>
          </span>
        </div>

        {/* ---------------------------------------------------- variety --- */}
        <section>
          {sectionTitle("Variety")}
          {!variety && varietyError ? (
            <Notice tone="gold" icon={AlertTriangle}>
              Variety details could not be loaded: {varietyError}{" "}
              <button
                type="button"
                onClick={onRetryVariety}
                className="font-semibold underline underline-offset-2"
              >
                Retry
              </button>
            </Notice>
          ) : !variety ? (
            <p className="text-[12.5px] text-earth-500">Loading variety record…</p>
          ) : (
            <div className="rounded-xl border border-earth-200 bg-ivory-50 px-4 py-3.5">
              <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                <p className="font-display text-[16px] font-semibold text-forest-900">
                  {variety.name}
                </p>
                {variety.local_name && (
                  <p className="text-[13px] text-earth-600">Local name: {variety.local_name}</p>
                )}
              </div>
              <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-[12.5px] text-earth-600">
                {variety.scientific_name && (
                  <span className="italic">{variety.scientific_name}</span>
                )}
                <span>Category: {categoryLabel(variety.crop_category)}</span>
                {variety.origin_region && <span>Origin: {variety.origin_region}</span>}
              </div>
              {variety.description && (
                <p className="mt-2 text-[12.5px] leading-relaxed text-earth-700">
                  {variety.description}
                </p>
              )}
              {variety.indigenous_note && (
                <p className="mt-2 border-t border-earth-200 pt-2 text-[12px] leading-relaxed text-earth-600">
                  <span className="font-semibold text-forest-800">Indigenous note: </span>
                  {variety.indigenous_note}
                </p>
              )}
              {variety.conservation_note && (
                <p className="mt-2 border-t border-earth-200 pt-2 text-[12px] leading-relaxed text-earth-600">
                  <span className="font-semibold text-forest-800">Conservation note: </span>
                  {variety.conservation_note}
                </p>
              )}
            </div>
          )}
        </section>

        {/* ------------------------------------------------------ lot grid */}
        <section>
          {sectionTitle("Lot details")}
          <div className="grid gap-x-4 gap-y-3 rounded-xl border border-earth-200 px-4 py-3.5 sm:grid-cols-2">
            {detail("Lot ID", <span className="font-mono text-[12px]">{lot.lot_code}</span>)}
            {detail(
              "Seed bank",
              <>
                <span className="text-earth-800">{lot.bank_name}</span>
                <span className="block text-[12px] text-earth-500">{lot.bank_location}</span>
              </>,
            )}
            {detail("Quantity", stockText(lot.quantity, lot.unit))}
            {lot.reserved_quantity > 0
              ? detail("Reserved", stockText(lot.reserved_quantity, lot.unit))
              : null}
            {lot.reserved_quantity > 0
              ? detail("Available", stockText(lot.available_quantity, lot.unit))
              : null}
            {detail("Source location", lot.source_location || "Not recorded")}
            {detail("Harvest date", formatDate(lot.harvest_date))}
            {detail("Storage location", lot.storage_location || "Not recorded")}
          </div>
        </section>

        {/* --------------------------------------------------- viability --- */}
        <section>
          {sectionTitle("Viability & risk")}
          <div className="space-y-3 rounded-xl border border-earth-200 bg-ivory-50 px-4 py-3.5">
            {lot.germination_rate !== null ? (
              <div>
                <p className="font-display text-[20px] font-semibold text-forest-800">
                  {formatNumber(lot.germination_rate, 1)}% germination
                </p>
                <p className="mt-0.5 text-[12.5px] text-earth-600">
                  {lot.viability_test_date
                    ? `Viability tested on ${formatDate(lot.viability_test_date)}`
                    : "Germination measured, but no test date was recorded."}
                </p>
              </div>
            ) : (
              <div>
                <p className="text-[13.5px] font-semibold text-earth-800">
                  Never tested — viability unknown
                </p>
                <p className="mt-0.5 text-[12.5px] leading-relaxed text-earth-600">
                  No germination rate has been recorded for this lot
                  {lot.viability_test_date
                    ? ` (test date on file: ${formatDate(lot.viability_test_date)}).`
                    : ". Treat viability as unknown until a test is carried out."}
                </p>
              </div>
            )}
            <div className="flex flex-wrap gap-4 border-t border-earth-200 pt-3">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wide text-earth-500">
                  Condition
                </p>
                <div className="mt-1">
                  <Badge tone={conditionTone(lot.condition)}>{titleCase(lot.condition)}</Badge>
                </div>
              </div>
              <div className="min-w-0">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-earth-500">
                  Local risk flag
                </p>
                <div className="mt-1">
                  <Badge tone={riskTone(lot.risk_flag)}>{titleCase(lot.risk_flag)}</Badge>
                </div>
                <p className="mt-1 max-w-md text-[11.5px] leading-relaxed text-earth-500">
                  {lot.risk_flag_reason ?? "No rule triggered for this lot."}
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* ------------------------------------------------------- notes --- */}
        <section>
          {sectionTitle("Notes")}
          <p className="text-[13px] leading-relaxed text-earth-700">
            {lot.notes?.trim() || "No notes recorded for this lot."}
          </p>
        </section>

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-earth-100 pt-4">
          <div className="text-[11.5px] text-earth-500">
            <span>Created {formatDateTime(lot.created_at)}</span>
            <span className="mx-2 text-earth-300">·</span>
            <span>Updated {formatDateTime(lot.updated_at)}</span>
          </div>
          <Button
            icon={Network}
            onClick={() =>
              navigate(
                `/rescue?variety_id=${lot.variety_id}&bank_id=${lot.bank_id}`,
              )
            }
          >
            Rescue this variety
          </Button>
        </div>
      </div>
    </Modal>
  );
}

/* --------------------------------------------------------------- page ----- */
export default function Inventory() {
  const toast = useToast();
  const [searchParams] = useSearchParams();

  const [search, setSearch] = useState("");
  const debouncedSearch = useDebounced(search.trim(), 300);
  const [category, setCategory] = useState("");
  const [bankId, setBankId] = useState(() => searchParams.get("bank_id") ?? "");
  const [riskFlag, setRiskFlag] = useState("");
  const [condition, setCondition] = useState("");
  const [sort, setSort] = useState("updated_desc");

  const lots = useApi(
    () =>
      api.lots({
        search: debouncedSearch || undefined,
        category: category || undefined,
        bank_id: toBankId(bankId),
        risk_flag: riskFlag || undefined,
        condition: condition || undefined,
        sort,
      }),
    [debouncedSearch, category, bankId, riskFlag, condition, sort],
  );
  const meta = useApi(() => api.inventoryMeta(), []);
  const banks = useApi(() => api.banks(), []);
  const varieties = useApi(() => api.varieties(), []);
  // Stable reference: the variety modal resets itself whenever this changes.
  const cropCategories = useMemo(() => meta.data?.crop_categories ?? [], [meta.data]);

  const [detail, setDetail] = useState<Lot | null>(null);
  const [formTarget, setFormTarget] = useState<
    { mode: "create"; lot: null } | { mode: "edit"; lot: Lot }
  | null>(null);
  const [varietyOpen, setVarietyOpen] = useState(false);
  const [deleting, setDeleting] = useState<Lot | null>(null);

  // Keep an open detail sheet in sync with the freshest copy of the lot.
  useEffect(() => {
    if (!detail) return;
    const fresh = lots.data?.find((lot) => lot.id === detail.id);
    setDetail(fresh ?? null);
  }, [lots.data, detail]);

  const remove = useMutation((lotId: number) => api.deleteLot(lotId), {
    onSuccess: () => {
      if (deleting) {
        toast.success("Seed lot deleted", `${deleting.lot_code} was removed from the inventory.`);
      }
      setDeleting(null);
      setDetail(null);
      lots.reload();
    },
    onError: (message) => toast.error("Could not delete seed lot", message),
  });

  const rows = lots.data ?? [];
  const totalQuantity = rows.reduce((sum, lot) => sum + (lot.quantity || 0), 0);
  const priorityCount = rows.filter((lot) => lot.risk_flag === "priority").length;
  const activeFilters = Boolean(debouncedSearch || category || bankId || riskFlag || condition);
  const optionsError = meta.error ?? banks.error ?? varieties.error ?? null;

  const clearFilters = () => {
    setSearch("");
    setCategory("");
    setBankId("");
    setRiskFlag("");
    setCondition("");
    setSort("updated_desc");
  };

  const retryOptions = () => {
    meta.reload();
    banks.reload();
    varieties.reload();
  };

  return (
    <div>
      <PageHeader
        title="Seed Inventory"
        description="Every seed lot held across the community seed banks, with stock, viability, condition and local risk flags. Germination that has never been measured stays unknown — it is never shown as a number."
        actions={
          <>
            <Button
              variant="primary"
              icon={Plus}
              onClick={() => setFormTarget({ mode: "create", lot: null })}
            >
              Add seed lot
            </Button>
            <Button icon={Leaf} onClick={() => setVarietyOpen(true)}>
              New variety
            </Button>
          </>
        }
      />

      {optionsError && (
        <Notice tone="gold" icon={AlertTriangle} className="mb-4">
          Some filter and form options could not be loaded: {optionsError}{" "}
          <button
            type="button"
            onClick={retryOptions}
            className="font-semibold underline underline-offset-2"
          >
            Retry
          </button>
        </Notice>
      )}

      {/* ------------------------------------------------------- filters --- */}
      <Card className="p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <div className="min-w-0 flex-1">
            <Field label="Search">
              <div className="relative">
                <Search
                  size={14}
                  className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-earth-400"
                />
                <Input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Search seed name or lot ID"
                  className="pl-9"
                />
              </div>
            </Field>
          </div>
          <Button icon={X} onClick={clearFilters} disabled={!activeFilters && sort === "updated_desc"}>
            Clear filters
          </Button>
        </div>

        <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
          <Field label="Crop category">
            <Select
              value={category}
              onChange={(event) => setCategory(event.target.value)}
              disabled={Boolean(meta.error)}
            >
              <option value="">All categories</option>
              {(meta.data?.crop_categories ?? []).map((value) => (
                <option key={value} value={value}>
                  {categoryLabel(value)}
                </option>
              ))}
            </Select>
          </Field>

          <Field label="Seed bank">
            <Select
              value={bankId}
              onChange={(event) => setBankId(event.target.value)}
              disabled={Boolean(banks.error)}
            >
              <option value="">All seed banks</option>
              {(banks.data ?? []).map((bank) => (
                <option key={bank.id} value={bank.id}>
                  {bank.name}
                </option>
              ))}
            </Select>
          </Field>

          <Field label="Risk flag">
            <Select value={riskFlag} onChange={(event) => setRiskFlag(event.target.value)}>
              <option value="">Any risk flag</option>
              {(meta.data?.risk_flags ?? FALLBACK_RISK_FLAGS).map((value) => (
                <option key={value} value={value}>
                  {titleCase(value)}
                </option>
              ))}
            </Select>
          </Field>

          <Field label="Condition">
            <Select
              value={condition}
              onChange={(event) => setCondition(event.target.value)}
              disabled={Boolean(meta.error)}
            >
              <option value="">Any condition</option>
              {(meta.data?.conditions ?? []).map((value) => (
                <option key={value} value={value}>
                  {titleCase(value)}
                </option>
              ))}
            </Select>
          </Field>

          <Field label="Sort by">
            <Select value={sort} onChange={(event) => setSort(event.target.value)}>
              {SORT_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </Select>
          </Field>
        </div>
      </Card>

      {/* --------------------------------------------------- results bar --- */}
      {lots.data !== null && (
        <div className="mt-4 mb-3 flex flex-wrap items-center justify-between gap-2">
          <p className="text-[13px] text-earth-600">
            <span className="font-semibold text-earth-800">
              {rows.length} lot{rows.length === 1 ? "" : "s"}
            </span>
            <span className="mx-1.5 text-earth-300">·</span>
            {formatNumber(totalQuantity, 2)} kg total
          </p>
          <Badge tone="info" icon={Database}>
            Sample and user records
          </Badge>
        </div>
      )}

      {lots.data !== null && (
        <div className="mb-4 grid gap-3 sm:grid-cols-3">
          <Card className="px-4 py-3">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-earth-500">
              Lots in view
            </p>
            <p className="mt-1 font-display text-[20px] font-semibold text-forest-900">
              {formatNumber(rows.length, 0)}
            </p>
          </Card>
          <Card className="px-4 py-3">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-earth-500">
              Total stock
            </p>
            <p className="mt-1 font-display text-[20px] font-semibold text-forest-900">
              {formatNumber(totalQuantity, 2)} <span className="text-[13px] font-medium">kg</span>
            </p>
          </Card>
          <Card className="px-4 py-3">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-earth-500">
              Priority flagged
            </p>
            <p className="mt-1 font-display text-[20px] font-semibold text-clay-600">
              {formatNumber(priorityCount, 0)}
            </p>
            <p className="text-[11.5px] text-earth-500">lots needing attention</p>
          </Card>
        </div>
      )}

      {/* -------------------------------------------------------- table ---- */}
      <Card>
        <div className="border-b border-earth-100 px-5 py-4">
          <h2 className="text-[15px] font-semibold text-earth-900">Seed lots</h2>
          <p className="mt-0.5 text-[13px] text-earth-500">
            {lots.loading && !lots.data
              ? "Loading lots…"
              : activeFilters
                ? "Filtered by the current search and selections"
                : "All lots in the network, newest updates first"}
          </p>
        </div>

        {lots.loading && !lots.data ? (
          <Spinner label="Loading seed lots…" />
        ) : lots.error && !lots.data ? (
          <ErrorState message={lots.error} onRetry={lots.reload} />
        ) : lots.data && rows.length === 0 ? (
          activeFilters ? (
            <EmptyState
              icon={SearchX}
              title="No seed lots match these filters"
              description="Try a different search term, or clear the filters to see the full inventory."
              action={<Button onClick={clearFilters}>Clear filters</Button>}
            />
          ) : (
            <EmptyState
              icon={SearchX}
              title="No seed lots yet"
              description="Register the first seed lot to start tracking stock, viability and condition."
              action={
                <Button
                  variant="primary"
                  icon={Plus}
                  onClick={() => setFormTarget({ mode: "create", lot: null })}
                >
                  Add seed lot
                </Button>
              }
            />
          )
        ) : (
          <TableWrap>
            <thead>
              <tr>
                <Th>Seed</Th>
                <Th>Lot ID</Th>
                <Th>Bank</Th>
                <Th>Stock</Th>
                <Th>Germination</Th>
                <Th>Condition</Th>
                <Th>Risk flag</Th>
                <Th>Updated</Th>
                <Th>Actions</Th>
              </tr>
            </thead>
            <tbody>
              {rows.map((lot) => (
                <tr
                  key={lot.id}
                  onClick={() => setDetail(lot)}
                  className={`cursor-pointer transition-colors hover:bg-ivory-100/70 ${
                    lots.loading ? "opacity-60" : ""
                  }`}
                >
                  <Td>
                    <div className="flex flex-col gap-1">
                      <span className="flex flex-wrap items-center gap-1.5 font-medium text-earth-900">
                        {lot.variety_name}
                        {lot.is_indigenous && <Badge tone="sage">Indigenous</Badge>}
                      </span>
                      <span className="text-[11.5px] text-earth-500">
                        {categoryLabel(lot.crop_category)}
                      </span>
                    </div>
                  </Td>
                  <Td>
                    <span className="font-mono text-[12px] text-earth-700">{lot.lot_code}</span>
                  </Td>
                  <Td>
                    <div className="flex flex-col">
                      <span className="text-[13px] text-earth-800">{lot.bank_name}</span>
                      <span className="text-[11.5px] text-earth-500">{lot.bank_location}</span>
                    </div>
                  </Td>
                  <Td>
                    <span className="font-medium text-earth-800">
                      {formatNumber(lot.quantity, 2)}
                    </span>{" "}
                    <span className="text-[12px] text-earth-500">{lot.unit}</span>
                    {lot.reserved_quantity > 0 && (
                      <span className="mt-0.5 block text-[11.5px] text-earth-500">
                        {formatNumber(lot.reserved_quantity, 2)} reserved ·{" "}
                        {formatNumber(lot.available_quantity, 2)} available
                      </span>
                    )}
                  </Td>
                  <Td>
                    {lot.germination_rate !== null ? (
                      <span className="text-[13px] text-earth-800">
                        {formatNumber(lot.germination_rate, 1)}%
                      </span>
                    ) : (
                      <Badge tone="neutral">Not tested</Badge>
                    )}
                  </Td>
                  <Td>
                    <Badge tone={conditionTone(lot.condition)}>
                      {titleCase(lot.condition)}
                    </Badge>
                  </Td>
                  <Td>
                    <span title={lot.risk_flag_reason ?? undefined}>
                      <Badge tone={riskTone(lot.risk_flag)}>{titleCase(lot.risk_flag)}</Badge>
                    </span>
                  </Td>
                  <Td>
                    <span className="text-[12.5px] text-earth-600">
                      {timeAgo(lot.updated_at)}
                    </span>
                  </Td>
                  <Td>
                    <div
                      className="flex items-center gap-1"
                      onClick={(event) => event.stopPropagation()}
                    >
                      <Button
                        size="sm"
                        variant="ghost"
                        icon={Eye}
                        title={`View ${lot.lot_code}`}
                        aria-label={`View ${lot.lot_code}`}
                        onClick={() => setDetail(lot)}
                      />
                      <Button
                        size="sm"
                        variant="ghost"
                        icon={Pencil}
                        title={`Edit ${lot.lot_code}`}
                        aria-label={`Edit ${lot.lot_code}`}
                        onClick={() => setFormTarget({ mode: "edit", lot })}
                      />
                      <Button
                        size="sm"
                        variant="ghost"
                        icon={Trash2}
                        className="text-clay-600 hover:bg-clay-100"
                        title={`Delete ${lot.lot_code}`}
                        aria-label={`Delete ${lot.lot_code}`}
                        onClick={() => setDeleting(lot)}
                      />
                    </div>
                  </Td>
                </tr>
              ))}
            </tbody>
          </TableWrap>
        )}
      </Card>

      {/* -------------------------------------------------------- sheets --- */}
      {detail && (
        <LotDetailModal
          lot={detail}
          variety={
            varieties.data?.find((variety) => variety.id === detail.variety_id) ?? null
          }
          varietyError={varieties.error}
          onRetryVariety={varieties.reload}
          onClose={() => setDetail(null)}
          onEdit={() => {
            setFormTarget({ mode: "edit", lot: detail });
            setDetail(null);
          }}
        />
      )}

      {formTarget && (
        <LotFormModal
          open
          mode={formTarget.mode}
          lot={formTarget.lot}
          varieties={varieties.data}
          banks={banks.data}
          meta={meta.data}
          optionsError={optionsError}
          onRetryOptions={retryOptions}
          onClose={() => setFormTarget(null)}
          onSaved={() => {
            setFormTarget(null);
            lots.reload();
            varieties.reload();
          }}
        />
      )}

      <VarietyFormModal
        open={varietyOpen}
        categories={cropCategories}
        onClose={() => setVarietyOpen(false)}
        onSaved={() => {
          setVarietyOpen(false);
          varieties.reload();
          meta.reload();
        }}
      />

      <ConfirmDialog
        open={deleting !== null}
        onClose={() => setDeleting(null)}
        onConfirm={() => {
          if (deleting) void remove.run(deleting.id);
        }}
        loading={remove.pending}
        tone="danger"
        title="Delete seed lot?"
        confirmLabel="Delete lot"
        message={
          <>
            You are about to delete lot{" "}
            <strong className="font-mono text-[12.5px]">{deleting?.lot_code}</strong> held at{" "}
            {deleting?.bank_name}. The record is removed from the inventory
            {" "}— lots reserved for an open rescue transfer cannot be deleted. This cannot be undone.
          </>
        }
      />
    </div>
  );
}
