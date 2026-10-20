/* API client for the SeedSathi backend.
 *
 * All requests go to the same origin (Vite dev server proxies /api to the
 * FastAPI server on :8000). Override with VITE_API_URL if you host them
 * separately. Every call fails gracefully: network errors are converted into
 * ApiError instances so the UI can render an honest error state instead of
 * crashing or silently pretending data loaded.
 */
import type {
  ActivityEntry, AffectedLot, Alert, Analytics, Bank, BankBrief, ChecklistStep,
  Device, InventoryMeta, Lot, Match, Reading, RescueDetail, RescueRequest,
  ScenarioDef, SimulationResult, Summary, Threshold, Transfer, Variety,
} from "./types";

const BASE = (import.meta.env.VITE_API_URL ?? "").replace(/\/$/, "");

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${BASE}${path}`, {
      headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
      ...init,
    });
  } catch {
    throw new ApiError(
      "Cannot reach the SeedSathi backend. Start it with `python run.py` inside backend/.",
      0,
    );
  }
  if (!res.ok) {
    let detail = `Request failed (${res.status})`;
    try {
      const body = await res.json();
      if (typeof body?.detail === "string") detail = body.detail;
      else if (Array.isArray(body?.detail)) {
        detail = body.detail
          .map((d: { msg?: string; loc?: (string | number)[] }) =>
            `${d.loc?.slice(1).join(".") ?? "field"}: ${d.msg ?? "invalid"}`)
          .join("; ");
      }
    } catch {
      /* keep the generic message */
    }
    throw new ApiError(detail, res.status);
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

const get = <T,>(path: string) => request<T>(path);
const post = <T,>(path: string, body?: unknown) =>
  request<T>(path, { method: "POST", body: body ? JSON.stringify(body) : undefined });
const put = <T,>(path: string, body: unknown) =>
  request<T>(path, { method: "PUT", body: JSON.stringify(body) });
const patch = <T,>(path: string, body: unknown) =>
  request<T>(path, { method: "PATCH", body: JSON.stringify(body) });
const del = <T,>(path: string) => request<T>(path, { method: "DELETE" });

const qs = (params: Record<string, string | number | boolean | undefined | null>) => {
  const search = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && v !== "") search.set(k, String(v));
  }
  const s = search.toString();
  return s ? `?${s}` : "";
};

export const api = {
  /* health & demo */
  health: () => get<{ status: string; version: string }>("/api/health"),
  resetDemo: () => post<{ status: string; note: string }>("/api/demo/reset?confirm=true"),

  /* dashboard & analytics */
  summary: () => get<Summary>("/api/summary"),
  analytics: () => get<Analytics>("/api/analytics"),
  activity: (limit = 30, bankId?: number) =>
    get<ActivityEntry[]>(`/api/activity${qs({ limit, bank_id: bankId })}`),

  /* banks */
  banks: (filters?: { state?: string; district?: string }) =>
    get<Bank[]>(`/api/banks${qs(filters ?? {})}`),
  bankLocations: () => get<BankBrief[]>("/api/banks/locations"),
  bank: (id: number) => get<Bank>(`/api/banks/${id}`),
  createBank: (body: unknown) => post<Bank>("/api/banks", body),
  updateBank: (id: number, body: unknown) => patch<Bank>(`/api/banks/${id}`, body),
  deleteBank: (id: number) => del<{ status: string }>(`/api/banks/${id}`),

  /* varieties & inventory */
  varieties: (filters?: { search?: string; category?: string; indigenous?: boolean }) =>
    get<Variety[]>(`/api/varieties${qs(filters ?? {})}`),
  createVariety: (body: unknown) => post<Variety>("/api/varieties", body),
  updateVariety: (id: number, body: unknown) => patch<Variety>(`/api/varieties/${id}`, body),
  deleteVariety: (id: number) => del<{ status: string }>(`/api/varieties/${id}`),
  lots: (filters?: {
    search?: string; category?: string; bank_id?: number; variety_id?: number;
    risk_flag?: string; condition?: string; sort?: string;
  }) => get<Lot[]>(`/api/lots${qs(filters ?? {})}`),
  lot: (id: number) => get<Lot>(`/api/lots/${id}`),
  createLot: (body: unknown) => post<Lot>("/api/lots", body),
  updateLot: (id: number, body: unknown) => patch<Lot>(`/api/lots/${id}`, body),
  deleteLot: (id: number) => del<{ status: string }>(`/api/lots/${id}`),
  inventoryMeta: () => get<InventoryMeta>("/api/inventory/meta"),

  /* monitoring */
  devices: () => get<Device[]>("/api/devices"),
  updateDevice: (id: number, body: unknown) => patch<Device>(`/api/devices/${id}`, body),
  readings: (bankId?: number, hours = 24) =>
    get<Reading[]>(`/api/readings${qs({ bank_id: bankId, hours })}`),
  simulateReadings: (bankId: number, steps = 4) =>
    post<{
      status: string; bank: BankBrief; new_readings: Reading[]; open_alerts: Alert[];
      note: string;
    }>("/api/monitoring/simulate", { bank_id: bankId, steps }),
  thresholds: (bankId?: number) =>
    get<Threshold[]>(`/api/thresholds${qs({ bank_id: bankId })}`),
  setThreshold: (bankId: number, metric: string, body: unknown) =>
    put<Threshold>(`/api/thresholds/${bankId}/${metric}`, body),

  /* alerts */
  alerts: (filters?: { severity?: string; bank_id?: number; status?: string; category?: string }) =>
    get<Alert[]>(`/api/alerts${qs(filters ?? {})}`),
  acknowledgeAlert: (id: number, note?: string) =>
    post<Alert>(`/api/alerts/${id}/acknowledge`, { note }),
  resolveAlert: (id: number, note?: string) => post<Alert>(`/api/alerts/${id}/resolve`, { note }),
  deleteAlert: (id: number) => del<{ status: string }>(`/api/alerts/${id}`),

  /* rescue network */
  rescueSearch: (body: {
    variety_id: number; requesting_bank_id: number; required_quantity: number; unit: string;
  }) =>
    post<{
      variety: string; requesting_bank: BankBrief; required_quantity: number; unit: string;
      matches: Match[]; match_count: number; method: string | null;
    }>("/api/rescue/search", body),
  rescueRequests: (filters?: { status?: string; bank_id?: number }) =>
    get<RescueRequest[]>(`/api/rescue/requests${qs(filters ?? {})}`),
  rescueRequest: (id: number) => get<RescueDetail>(`/api/rescue/requests/${id}`),
  createRescueRequest: (body: {
    variety_id: number; requesting_bank_id: number; required_quantity: number; unit: string;
    urgency: string; reason_category: string; reason_note?: string; scenario?: string;
  }) => post<RescueRequest>("/api/rescue/requests", body),
  rescueMatches: (id: number) =>
    get<{ request: RescueRequest; matches: Match[]; status_labels: Record<string, string> }>(
      `/api/rescue/matches/${id}`),
  proposeDonor: (id: number, body: { donor_lot_id: number; transfer_quantity: number }) =>
    post<RescueRequest>(`/api/rescue/requests/${id}/proposal`, body),
  approveRescue: (id: number) => post<RescueRequest>(`/api/rescue/requests/${id}/approve`),
  dispatchRescue: (id: number) => post<RescueRequest>(`/api/rescue/requests/${id}/dispatch`),
  receiveRescue: (id: number) => post<RescueRequest>(`/api/rescue/requests/${id}/receive`),
  rejectRescue: (id: number, note?: string) =>
    post<RescueRequest>(`/api/rescue/requests/${id}/reject`, { note }),
  transfers: () => get<Transfer[]>("/api/rescue/transfers"),

  /* simulation */
  scenarios: () => get<ScenarioDef[]>("/api/simulation/scenarios"),
  runScenario: (scenario: string, bankId: number, steps = 4) =>
    post<SimulationResult>(`/api/simulation/run${qs({ scenario })}`,
      { bank_id: bankId, steps }),
};

export type { AffectedLot, ChecklistStep };
