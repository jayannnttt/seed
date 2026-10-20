/* Types mirroring the Seed Vault FastAPI backend (see backend/app/schemas.py). */

export interface Bank {
  id: number;
  code: string;
  name: string;
  village: string;
  district: string;
  state: string;
  latitude: number | null;
  longitude: number | null;
  coordinator: string;
  contact_phone: string;
  contact_email: string | null;
  description: string | null;
  established_year: number | null;
  is_demo: boolean;
  created_at: string;
  location: string;
  variety_count: number;
  lot_count: number;
  total_quantity: number;
  latest_temperature_c: number | null;
  latest_humidity_pct: number | null;
  latest_reading_at: string | null;
  device_status: string | null;
  is_simulated: boolean | null;
  open_alerts: number;
  critical_alerts: number;
  recent_rescue_activity: number;
}

export interface BankBrief {
  id: number;
  code: string;
  name: string;
  location: string;
  latitude: number | null;
  longitude: number | null;
}

export interface Variety {
  id: number;
  name: string;
  local_name: string | null;
  scientific_name: string | null;
  crop_category: string;
  is_indigenous: boolean;
  indigenous_note: string | null;
  description: string | null;
  conservation_note: string | null;
  origin_region: string | null;
  is_demo: boolean;
  created_at: string;
  lot_count: number;
  bank_count: number;
  total_quantity: number;
  priority_lot_count: number;
}

export interface Lot {
  id: number;
  lot_code: string;
  variety_id: number;
  bank_id: number;
  quantity: number;
  reserved_quantity: number;
  available_quantity: number;
  unit: string;
  source_location: string | null;
  harvest_date: string | null;
  germination_rate: number | null;
  viability_test_date: string | null;
  storage_location: string | null;
  condition: string;
  risk_flag: string;
  risk_flag_reason: string | null;
  notes: string | null;
  is_demo: boolean;
  created_at: string;
  updated_at: string;
  variety_name: string;
  crop_category: string;
  is_indigenous: boolean;
  bank_name: string;
  bank_code: string;
  bank_location: string;
}

export interface Device {
  id: number;
  device_code: string;
  bank_id: number;
  name: string;
  device_type: string;
  transport: string;
  status: string;
  is_simulated: boolean;
  last_reading_at: string | null;
  created_at: string;
  bank_name: string;
}

export interface Reading {
  id: number;
  device_id: number;
  bank_id: number;
  temperature_c: number;
  humidity_pct: number;
  recorded_at: string;
  is_simulated: boolean;
}

export interface Threshold {
  id: number;
  bank_id: number;
  metric: string;
  min_value: number;
  max_value: number;
  note: string | null;
  updated_at: string;
}

export interface Alert {
  id: number;
  alert_code: string;
  bank_id: number;
  device_id: number | null;
  category: string;
  metric: string | null;
  reading_value: number | null;
  threshold_value: string | null;
  severity: string;
  status: string;
  message: string;
  recommended_action: string | null;
  affected_lot_codes: string[] | null;
  detected_at: string;
  acknowledged_at: string | null;
  resolved_at: string | null;
  resolution_note: string | null;
  is_simulated: boolean;
  is_demo: boolean;
  bank_name: string;
  bank_location: string;
  device_name: string | null;
}

export interface RescueRequest {
  id: number;
  request_code: string;
  variety_id: number;
  requesting_bank_id: number;
  donor_bank_id: number | null;
  donor_lot_id: number | null;
  required_quantity: number;
  transfer_quantity: number | null;
  unit: string;
  urgency: string;
  reason_category: string;
  reason_note: string | null;
  status: string;
  scenario: string | null;
  status_note: string | null;
  is_demo: boolean;
  created_at: string;
  updated_at: string;
  variety_name: string;
  crop_category: string;
  requesting_bank_name: string;
  donor_bank_name: string | null;
  donor_lot_code: string | null;
}

export interface Transfer {
  id: number;
  request_id: number;
  donor_bank_id: number;
  receiving_bank_id: number;
  donor_lot_id: number | null;
  receiving_lot_id: number | null;
  variety_id: number;
  quantity: number;
  unit: string;
  status: string;
  dispatched_at: string | null;
  received_at: string | null;
  note: string | null;
  created_at: string;
  donor_bank_name: string;
  receiving_bank_name: string;
  variety_name: string;
}

export interface Match {
  lot_id: number;
  lot_code: string;
  bank_id: number;
  bank_name: string;
  bank_location: string;
  bank_coordinator: string;
  bank_phone: string;
  quantity: number;
  reserved_quantity: number;
  available_quantity: number;
  unit: string;
  condition: string;
  germination_rate: number | null;
  viability_test_date: string | null;
  storage_location: string | null;
  updated_at: string;
  distance_km: number | null;
  score: number;
  score_breakdown: {
    availability: number;
    condition_information: number;
    proximity: number;
    total: number;
  };
  reasons: string[];
  warnings: string[];
}

export interface ActivityEntry {
  id: number;
  bank_id: number | null;
  entity_type: string;
  entity_id: number | null;
  action: string;
  description: string;
  actor: string;
  is_demo: boolean;
  created_at: string;
  bank_name: string | null;
}

export interface TrendPoint {
  time: string;
  temperature_c: number;
  humidity_pct: number;
  readings: number;
}

export interface Summary {
  demo_data: boolean;
  counts: {
    banks: number;
    varieties: number;
    lots: number;
    indigenous_varieties: number;
    total_seed_quantity: number;
    priority_varieties: number;
    open_alerts: number;
    critical_alerts: number;
    pending_rescue_requests: number;
  };
  environment: {
    avg_temperature_c: number | null;
    avg_humidity_pct: number | null;
    banks_online: number;
    banks_total: number;
    latest_readings: {
      bank_id: number;
      bank_name: string;
      temperature_c: number;
      humidity_pct: number;
      recorded_at: string;
      is_simulated: boolean;
    }[];
  };
  trend: TrendPoint[];
  recent_alerts: Alert[];
  recent_rescue_requests: RescueRequest[];
  attention_lots: Lot[];
  recent_activity: ActivityEntry[];
  network: Bank[];
  notice: string;
}

export interface Analytics {
  by_category: {
    category: string;
    lots: number;
    quantity: number;
    varieties: number;
  }[];
  by_bank: {
    bank_id: number;
    name: string;
    state: string;
    lots: number;
    quantity: number;
  }[];
  alerts_by_status: { status: string; count: number }[];
  open_alerts_by_severity: { severity: string; count: number }[];
  rescue_by_status: { status: string; count: number }[];
  transfers_received: number;
  flagged_varieties: {
    variety_id: number;
    variety_name: string;
    crop_category: string;
    is_indigenous: boolean;
    bank_name: string;
    risk_flag: string;
    risk_flag_reason: string | null;
    quantity: number;
    unit: string;
  }[];
  trend: TrendPoint[];
  disclaimers: {
    conservation: string;
    simulated: string;
    calculated: string;
  };
}

export interface ScenarioDef {
  key: string;
  label: string;
  description: string;
  reason_category: string;
  base_risk: number;
  checklist: string[];
}

export interface AffectedLot {
  lot_id: number;
  lot_code: string;
  variety_id: number;
  variety_name: string;
  crop_category: string;
  is_indigenous: boolean;
  quantity: number;
  unit: string;
  condition: string;
  risk_flag: string;
  storage_location: string | null;
  risk_score: number;
  attention_band: string;
  risk_reasons: string;
}

export interface ChecklistStep {
  step: number;
  action: string;
  priority: string;
}

export interface SimulationResult {
  scenario: { key: string; label: string; description: string };
  bank: Bank;
  is_simulation: boolean;
  notice: string;
  latest_reading: {
    temperature_c: number | null;
    humidity_pct: number | null;
    recorded_at: string | null;
  };
  thresholds: Record<string, { min: number; max: number; note: string | null }>;
  open_alerts: Alert[];
  risk: { bank_score: number; bank_band: string; method: string };
  affected_lots: AffectedLot[];
  checklist: ChecklistStep[];
  reserve_matches: {
    variety_id: number;
    variety_name: string;
    lot_code: string;
    quantity_at_risk: number;
    unit: string;
    risk_score: number;
    attention_band: string;
    matches: Match[];
  }[];
}

export interface InventoryMeta {
  crop_categories: string[];
  units: string[];
  conditions: string[];
  risk_flags: string[];
  risk_flag_notes: Record<string, string>;
}

export interface RescueDetail {
  request: RescueRequest;
  transfers: Transfer[];
  status_labels: Record<string, string>;
  next_actions: string[];
  reason: string | null;
}
