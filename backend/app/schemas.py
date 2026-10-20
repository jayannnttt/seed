"""Pydantic schemas for the SeedSathi REST API."""
from datetime import datetime, date
from typing import Optional
from pydantic import BaseModel, ConfigDict, Field, field_validator

from .models import (
    RISK_FLAG_VALUES, LOT_CONDITION_VALUES, UNIT_VALUES, ALERT_SEVERITY_VALUES,
    ALERT_STATUS_VALUES, ALERT_CATEGORY_VALUES, RESCUE_STATUS_VALUES,
    URGENCY_VALUES, REASON_VALUES,
)


class ORMModel(BaseModel):
    model_config = ConfigDict(from_attributes=True)


# ---------------------------------------------------------------- banks ----
class BankCreate(BaseModel):
    code: str = Field(min_length=2, max_length=32)
    name: str = Field(min_length=2, max_length=160)
    village: str = ""
    district: str = ""
    state: str = ""
    latitude: Optional[float] = Field(default=None, ge=-90, le=90)
    longitude: Optional[float] = Field(default=None, ge=-180, le=180)
    coordinator: str = ""
    contact_phone: str = ""
    contact_email: Optional[str] = None
    description: Optional[str] = None
    established_year: Optional[int] = Field(default=None, ge=1900, le=2100)


class BankUpdate(BaseModel):
    name: Optional[str] = Field(default=None, min_length=2, max_length=160)
    village: Optional[str] = None
    district: Optional[str] = None
    state: Optional[str] = None
    latitude: Optional[float] = Field(default=None, ge=-90, le=90)
    longitude: Optional[float] = Field(default=None, ge=-180, le=180)
    coordinator: Optional[str] = None
    contact_phone: Optional[str] = None
    contact_email: Optional[str] = None
    description: Optional[str] = None
    established_year: Optional[int] = Field(default=None, ge=1900, le=2100)


class BankOut(ORMModel):
    id: int
    code: str
    name: str
    village: str
    district: str
    state: str
    latitude: Optional[float]
    longitude: Optional[float]
    coordinator: str
    contact_phone: str
    contact_email: Optional[str]
    description: Optional[str]
    established_year: Optional[int]
    is_demo: bool
    created_at: datetime
    location: str = ""
    variety_count: int = 0
    lot_count: int = 0
    total_quantity: float = 0.0
    latest_temperature_c: Optional[float] = None
    latest_humidity_pct: Optional[float] = None
    latest_reading_at: Optional[datetime] = None
    device_status: Optional[str] = None
    is_simulated: Optional[bool] = None
    open_alerts: int = 0
    critical_alerts: int = 0
    recent_rescue_activity: int = 0


class BankBrief(ORMModel):
    id: int
    code: str
    name: str
    location: str = ""
    latitude: Optional[float] = None
    longitude: Optional[float] = None


# ------------------------------------------------------------ varieties ----
class VarietyCreate(BaseModel):
    name: str = Field(min_length=2, max_length=160)
    local_name: Optional[str] = None
    scientific_name: Optional[str] = None
    crop_category: str = Field(default="other", max_length=60)
    is_indigenous: bool = False
    indigenous_note: Optional[str] = None
    description: Optional[str] = None
    conservation_note: Optional[str] = None
    origin_region: Optional[str] = None


class VarietyUpdate(BaseModel):
    name: Optional[str] = Field(default=None, min_length=2, max_length=160)
    local_name: Optional[str] = None
    scientific_name: Optional[str] = None
    crop_category: Optional[str] = None
    is_indigenous: Optional[bool] = None
    indigenous_note: Optional[str] = None
    description: Optional[str] = None
    conservation_note: Optional[str] = None
    origin_region: Optional[str] = None


class VarietyOut(ORMModel):
    id: int
    name: str
    local_name: Optional[str]
    scientific_name: Optional[str]
    crop_category: str
    is_indigenous: bool
    indigenous_note: Optional[str]
    description: Optional[str]
    conservation_note: Optional[str]
    origin_region: Optional[str]
    is_demo: bool
    created_at: datetime
    lot_count: int = 0
    bank_count: int = 0
    total_quantity: float = 0.0
    priority_lot_count: int = 0


# ---------------------------------------------------------------- lots ----
class LotCreate(BaseModel):
    lot_code: str = Field(min_length=2, max_length=48)
    variety_id: int
    bank_id: int
    quantity: float = Field(ge=0, le=1_000_000)
    unit: str = "kg"
    source_location: Optional[str] = None
    harvest_date: Optional[date] = None
    germination_rate: Optional[float] = Field(default=None, ge=0, le=100)
    viability_test_date: Optional[date] = None
    storage_location: Optional[str] = None
    condition: str = "unknown"
    risk_flag: str = "none"
    risk_flag_reason: Optional[str] = None
    notes: Optional[str] = None

    @field_validator("unit")
    @classmethod
    def _unit(cls, v: str) -> str:
        if v not in UNIT_VALUES:
            raise ValueError(f"unit must be one of {UNIT_VALUES}")
        return v

    @field_validator("condition")
    @classmethod
    def _condition(cls, v: str) -> str:
        if v not in LOT_CONDITION_VALUES:
            raise ValueError(f"condition must be one of {LOT_CONDITION_VALUES}")
        return v

    @field_validator("risk_flag")
    @classmethod
    def _flag(cls, v: str) -> str:
        if v not in RISK_FLAG_VALUES:
            raise ValueError(f"risk_flag must be one of {RISK_FLAG_VALUES}")
        return v


class LotUpdate(BaseModel):
    lot_code: Optional[str] = Field(default=None, min_length=2, max_length=48)
    variety_id: Optional[int] = None
    bank_id: Optional[int] = None
    quantity: Optional[float] = Field(default=None, ge=0, le=1_000_000)
    unit: Optional[str] = None
    source_location: Optional[str] = None
    harvest_date: Optional[date] = None
    germination_rate: Optional[float] = Field(default=None, ge=0, le=100)
    viability_test_date: Optional[date] = None
    storage_location: Optional[str] = None
    condition: Optional[str] = None
    risk_flag: Optional[str] = None
    risk_flag_reason: Optional[str] = None
    notes: Optional[str] = None

    @field_validator("unit")
    @classmethod
    def _unit(cls, v: Optional[str]) -> Optional[str]:
        if v is not None and v not in UNIT_VALUES:
            raise ValueError(f"unit must be one of {UNIT_VALUES}")
        return v

    @field_validator("condition")
    @classmethod
    def _condition(cls, v: Optional[str]) -> Optional[str]:
        if v is not None and v not in LOT_CONDITION_VALUES:
            raise ValueError(f"condition must be one of {LOT_CONDITION_VALUES}")
        return v

    @field_validator("risk_flag")
    @classmethod
    def _flag(cls, v: Optional[str]) -> Optional[str]:
        if v is not None and v not in RISK_FLAG_VALUES:
            raise ValueError(f"risk_flag must be one of {RISK_FLAG_VALUES}")
        return v


class LotOut(ORMModel):
    id: int
    lot_code: str
    variety_id: int
    bank_id: int
    quantity: float
    reserved_quantity: float
    available_quantity: float = 0.0
    unit: str
    source_location: Optional[str]
    harvest_date: Optional[date]
    germination_rate: Optional[float]
    viability_test_date: Optional[date]
    storage_location: Optional[str]
    condition: str
    risk_flag: str
    risk_flag_reason: Optional[str]
    notes: Optional[str]
    is_demo: bool
    created_at: datetime
    updated_at: datetime
    variety_name: str = ""
    crop_category: str = ""
    is_indigenous: bool = False
    bank_name: str = ""
    bank_code: str = ""
    bank_location: str = ""


# --------------------------------------------------------- monitoring ----
class DeviceOut(ORMModel):
    id: int
    device_code: str
    bank_id: int
    name: str
    device_type: str
    transport: str
    status: str
    is_simulated: bool
    last_reading_at: Optional[datetime]
    created_at: datetime
    bank_name: str = ""


class DeviceUpdate(BaseModel):
    status: Optional[str] = Field(default=None, pattern="^(online|offline)$")
    transport: Optional[str] = Field(default=None, pattern="^(simulated|mqtt|http)$")
    name: Optional[str] = None


class ReadingOut(ORMModel):
    id: int
    device_id: int
    bank_id: int
    temperature_c: float
    humidity_pct: float
    recorded_at: datetime
    is_simulated: bool


class ThresholdOut(ORMModel):
    id: int
    bank_id: int
    metric: str
    min_value: float
    max_value: float
    note: Optional[str]
    updated_at: datetime


class ThresholdUpdate(BaseModel):
    min_value: float = Field(ge=-100, le=200)
    max_value: float = Field(ge=-100, le=200)
    note: Optional[str] = Field(default=None, max_length=255)

    @field_validator("max_value")
    @classmethod
    def _range(cls, v: float, info) -> float:
        mn = info.data.get("min_value")
        if mn is not None and v <= mn:
            raise ValueError("max_value must be greater than min_value")
        return v


class SimulationRequest(BaseModel):
    bank_id: int
    steps: int = Field(default=4, ge=1, le=12)


# -------------------------------------------------------------- alerts ----
class AlertOut(ORMModel):
    id: int
    alert_code: str
    bank_id: int
    device_id: Optional[int]
    category: str
    metric: Optional[str]
    reading_value: Optional[float]
    threshold_value: Optional[str]
    severity: str
    status: str
    message: str
    recommended_action: Optional[str]
    affected_lot_codes: Optional[list] = None
    detected_at: datetime
    acknowledged_at: Optional[datetime]
    resolved_at: Optional[datetime]
    resolution_note: Optional[str]
    is_simulated: bool
    is_demo: bool
    bank_name: str = ""
    bank_location: str = ""
    device_name: Optional[str] = None


class AlertAction(BaseModel):
    note: Optional[str] = Field(default=None, max_length=500)


# -------------------------------------------------------------- rescue ----
class RescueCreate(BaseModel):
    variety_id: int
    requesting_bank_id: int
    required_quantity: float = Field(gt=0, le=1_000_000)
    unit: str = "kg"
    urgency: str = "high"
    reason_category: str = "storage_risk"
    reason_note: Optional[str] = Field(default=None, max_length=1000)
    scenario: Optional[str] = Field(default=None, max_length=40)

    @field_validator("unit")
    @classmethod
    def _unit(cls, v: str) -> str:
        if v not in UNIT_VALUES:
            raise ValueError(f"unit must be one of {UNIT_VALUES}")
        return v

    @field_validator("urgency")
    @classmethod
    def _urgency(cls, v: str) -> str:
        if v not in URGENCY_VALUES:
            raise ValueError(f"urgency must be one of {URGENCY_VALUES}")
        return v

    @field_validator("reason_category")
    @classmethod
    def _reason(cls, v: str) -> str:
        if v not in REASON_VALUES:
            raise ValueError(f"reason_category must be one of {REASON_VALUES}")
        return v


class ProposalCreate(BaseModel):
    donor_lot_id: int
    transfer_quantity: float = Field(gt=0, le=1_000_000)


class RescueStatusUpdate(BaseModel):
    status: str
    note: Optional[str] = Field(default=None, max_length=1000)

    @field_validator("status")
    @classmethod
    def _status(cls, v: str) -> str:
        if v not in RESCUE_STATUS_VALUES:
            raise ValueError(f"status must be one of {RESCUE_STATUS_VALUES}")
        return v


class RescueOut(ORMModel):
    id: int
    request_code: str
    variety_id: int
    requesting_bank_id: int
    donor_bank_id: Optional[int]
    donor_lot_id: Optional[int]
    required_quantity: float
    transfer_quantity: Optional[float]
    unit: str
    urgency: str
    reason_category: str
    reason_note: Optional[str]
    status: str
    scenario: Optional[str]
    status_note: Optional[str]
    is_demo: bool
    created_at: datetime
    updated_at: datetime
    variety_name: str = ""
    crop_category: str = ""
    requesting_bank_name: str = ""
    donor_bank_name: str = ""
    donor_lot_code: Optional[str] = None


class TransferOut(ORMModel):
    id: int
    request_id: int
    donor_bank_id: int
    receiving_bank_id: int
    donor_lot_id: Optional[int]
    receiving_lot_id: Optional[int]
    variety_id: int
    quantity: float
    unit: str
    status: str
    dispatched_at: Optional[datetime]
    received_at: Optional[datetime]
    note: Optional[str]
    created_at: datetime
    donor_bank_name: str = ""
    receiving_bank_name: str = ""
    variety_name: str = ""


# ------------------------------------------------------------- analytics --
class ActivityOut(ORMModel):
    id: int
    bank_id: Optional[int]
    entity_type: str
    entity_id: Optional[int]
    action: str
    description: str
    actor: str
    is_demo: bool
    created_at: datetime
    bank_name: Optional[str] = None
