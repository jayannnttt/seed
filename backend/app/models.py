"""SQLAlchemy models for the SeedSathi community seed bank platform."""
from datetime import datetime, date, timezone
from sqlalchemy import (
    Column, Integer, String, Float, Boolean, Date, DateTime, Text,
    ForeignKey, UniqueConstraint, JSON,
)
from sqlalchemy.orm import relationship
from .database import Base


def utcnow() -> datetime:
    # naive UTC (SQLite-friendly) without the deprecated datetime.utcnow()
    return datetime.now(timezone.utc).replace(tzinfo=None)


# --------------------------------------------------------------------------
# Conservation risk flag vocabulary (transparent, local, rule based).
# These are LOCAL flags maintained by the community seed bank network.
# They are NOT official conservation statuses (e.g. IUCN Red List categories).
# --------------------------------------------------------------------------
RISK_FLAG_VALUES = ("none", "watch", "priority")
LOT_CONDITION_VALUES = ("good", "fair", "poor", "unknown")
UNIT_VALUES = ("kg", "gram", "quintal", "packet", "bag", "sachet")
ALERT_SEVERITY_VALUES = ("info", "warning", "critical")
ALERT_STATUS_VALUES = ("open", "acknowledged", "resolved")
ALERT_CATEGORY_VALUES = (
    "temperature", "humidity", "sensor_offline", "power", "flood", "other",
)
RESCUE_STATUS_VALUES = ("pending", "approved", "dispatched", "received", "rejected")
URGENCY_VALUES = ("routine", "high", "critical")
REASON_VALUES = (
    "flood", "power_failure", "equipment_failure", "storage_risk",
    "contamination", "other",
)
TRANSFER_STATUS_VALUES = ("approved", "dispatched", "received", "rejected")


class SeedMeta(Base):
    """Tracks whether the demo dataset has been seeded (idempotent seeding)."""
    __tablename__ = "seed_meta"
    id = Column(Integer, primary_key=True)
    key = Column(String(64), unique=True, nullable=False)
    value = Column(String(255), nullable=False)
    updated_at = Column(DateTime, default=utcnow, onupdate=utcnow)


class SeedBank(Base):
    __tablename__ = "seed_banks"

    id = Column(Integer, primary_key=True)
    code = Column(String(32), unique=True, nullable=False)
    name = Column(String(160), nullable=False)
    village = Column(String(120), nullable=False, default="")
    district = Column(String(120), nullable=False, default="")
    state = Column(String(120), nullable=False, default="")
    latitude = Column(Float, nullable=True)
    longitude = Column(Float, nullable=True)
    coordinator = Column(String(120), nullable=False, default="")
    contact_phone = Column(String(40), nullable=False, default="")
    contact_email = Column(String(120), nullable=True)
    description = Column(Text, nullable=True)
    established_year = Column(Integer, nullable=True)
    is_demo = Column(Boolean, default=True, nullable=False)
    created_at = Column(DateTime, default=utcnow, nullable=False)

    lots = relationship("SeedLot", back_populates="bank", cascade="all, delete-orphan")
    devices = relationship("SensorDevice", back_populates="bank", cascade="all, delete-orphan")
    readings = relationship("SensorReading", back_populates="bank", cascade="all, delete-orphan")
    alerts = relationship("Alert", back_populates="bank", cascade="all, delete-orphan")

    @property
    def location(self) -> str:
        parts = [self.village, self.district, self.state]
        return ", ".join([p for p in parts if p])


class SeedVariety(Base):
    __tablename__ = "seed_varieties"

    id = Column(Integer, primary_key=True)
    name = Column(String(160), nullable=False)
    local_name = Column(String(160), nullable=True)
    scientific_name = Column(String(160), nullable=True)
    crop_category = Column(String(60), nullable=False, default="other")
    is_indigenous = Column(Boolean, default=False, nullable=False)
    indigenous_note = Column(Text, nullable=True)
    description = Column(Text, nullable=True)
    conservation_note = Column(Text, nullable=True)
    origin_region = Column(String(160), nullable=True)
    is_demo = Column(Boolean, default=True, nullable=False)
    created_at = Column(DateTime, default=utcnow, nullable=False)

    lots = relationship("SeedLot", back_populates="variety", cascade="all, delete-orphan")


class SeedLot(Base):
    """A physical lot of seed held at one community seed bank (inventory record)."""
    __tablename__ = "seed_lots"
    __table_args__ = (UniqueConstraint("lot_code", name="uq_lot_code"),)

    id = Column(Integer, primary_key=True)
    lot_code = Column(String(48), nullable=False)
    variety_id = Column(Integer, ForeignKey("seed_varieties.id"), nullable=False)
    bank_id = Column(Integer, ForeignKey("seed_banks.id"), nullable=False)
    quantity = Column(Float, nullable=False, default=0.0)
    reserved_quantity = Column(Float, nullable=False, default=0.0)
    unit = Column(String(16), nullable=False, default="kg")
    source_location = Column(String(200), nullable=True)
    harvest_date = Column(Date, nullable=True)
    germination_rate = Column(Float, nullable=True)       # None == not tested (unknown)
    viability_test_date = Column(Date, nullable=True)     # None == never tested
    storage_location = Column(String(200), nullable=True)
    condition = Column(String(16), nullable=False, default="unknown")
    risk_flag = Column(String(16), nullable=False, default="none")
    risk_flag_reason = Column(Text, nullable=True)
    notes = Column(Text, nullable=True)
    is_demo = Column(Boolean, default=True, nullable=False)
    created_at = Column(DateTime, default=utcnow, nullable=False)
    updated_at = Column(DateTime, default=utcnow, onupdate=utcnow, nullable=False)

    variety = relationship("SeedVariety", back_populates="lots")
    bank = relationship("SeedBank", back_populates="lots")

    @property
    def available_quantity(self) -> float:
        return round(max(self.quantity - (self.reserved_quantity or 0.0), 0.0), 3)


class SensorDevice(Base):
    __tablename__ = "sensor_devices"
    __table_args__ = (UniqueConstraint("device_code", name="uq_device_code"),)

    id = Column(Integer, primary_key=True)
    device_code = Column(String(48), nullable=False)
    bank_id = Column(Integer, ForeignKey("seed_banks.id"), nullable=False)
    name = Column(String(120), nullable=False, default="Storage environment sensor")
    device_type = Column(String(40), nullable=False, default="environmental")
    # transport: how real hardware would deliver readings.
    #   simulated -> generated by the built-in simulator
    #   mqtt      -> placeholder for a real ESP32/Arduino MQTT bridge
    #   http      -> placeholder for a real device posting to /api/ingest/readings
    transport = Column(String(16), nullable=False, default="simulated")
    status = Column(String(16), nullable=False, default="online")  # online | offline
    is_simulated = Column(Boolean, default=True, nullable=False)
    last_reading_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=utcnow, nullable=False)

    bank = relationship("SeedBank", back_populates="devices")
    readings = relationship("SensorReading", back_populates="device", cascade="all, delete-orphan")


class SensorReading(Base):
    __tablename__ = "sensor_readings"

    id = Column(Integer, primary_key=True)
    device_id = Column(Integer, ForeignKey("sensor_devices.id"), nullable=False)
    bank_id = Column(Integer, ForeignKey("seed_banks.id"), nullable=False)
    temperature_c = Column(Float, nullable=False)
    humidity_pct = Column(Float, nullable=False)
    recorded_at = Column(DateTime, nullable=False, default=utcnow)
    is_simulated = Column(Boolean, default=True, nullable=False)

    device = relationship("SensorDevice", back_populates="readings")
    bank = relationship("SeedBank", back_populates="readings")


class AlertThreshold(Base):
    """Configurable per-bank storage thresholds.

    These are EXAMPLE defaults configured by this network's operators.
    They are NOT universal safe limits for every crop or seed species.
    """
    __tablename__ = "alert_thresholds"
    __table_args__ = (UniqueConstraint("bank_id", "metric", name="uq_bank_metric"),)

    id = Column(Integer, primary_key=True)
    bank_id = Column(Integer, ForeignKey("seed_banks.id"), nullable=False)
    metric = Column(String(24), nullable=False)  # temperature | humidity
    min_value = Column(Float, nullable=False)
    max_value = Column(Float, nullable=False)
    note = Column(String(255), nullable=True)
    updated_at = Column(DateTime, default=utcnow, onupdate=utcnow, nullable=False)

    bank = relationship("SeedBank")


class Alert(Base):
    __tablename__ = "alerts"

    id = Column(Integer, primary_key=True)
    alert_code = Column(String(32), unique=True, nullable=False)
    bank_id = Column(Integer, ForeignKey("seed_banks.id"), nullable=False)
    device_id = Column(Integer, ForeignKey("sensor_devices.id"), nullable=True)
    category = Column(String(24), nullable=False, default="other")
    metric = Column(String(24), nullable=True)
    reading_value = Column(Float, nullable=True)
    threshold_value = Column(String(32), nullable=True)
    severity = Column(String(16), nullable=False, default="warning")
    status = Column(String(16), nullable=False, default="open")
    message = Column(Text, nullable=False)
    recommended_action = Column(Text, nullable=True)
    affected_lot_codes = Column(JSON, nullable=True)   # list[str] of lot codes when known
    detected_at = Column(DateTime, nullable=False, default=utcnow)
    acknowledged_at = Column(DateTime, nullable=True)
    resolved_at = Column(DateTime, nullable=True)
    resolution_note = Column(Text, nullable=True)
    is_simulated = Column(Boolean, default=True, nullable=False)
    is_demo = Column(Boolean, default=True, nullable=False)

    bank = relationship("SeedBank", back_populates="alerts")
    device = relationship("SensorDevice")


class RescueRequest(Base):
    __tablename__ = "rescue_requests"

    id = Column(Integer, primary_key=True)
    request_code = Column(String(32), unique=True, nullable=False)
    variety_id = Column(Integer, ForeignKey("seed_varieties.id"), nullable=False)
    requesting_bank_id = Column(Integer, ForeignKey("seed_banks.id"), nullable=False)
    donor_bank_id = Column(Integer, ForeignKey("seed_banks.id"), nullable=True)
    donor_lot_id = Column(Integer, ForeignKey("seed_lots.id"), nullable=True)
    required_quantity = Column(Float, nullable=False)
    transfer_quantity = Column(Float, nullable=True)
    unit = Column(String(16), nullable=False, default="kg")
    urgency = Column(String(16), nullable=False, default="high")
    reason_category = Column(String(24), nullable=False, default="storage_risk")
    reason_note = Column(Text, nullable=True)
    status = Column(String(16), nullable=False, default="pending")
    scenario = Column(String(40), nullable=True)        # set when created from a simulation
    status_note = Column(Text, nullable=True)
    is_demo = Column(Boolean, default=True, nullable=False)
    created_at = Column(DateTime, default=utcnow, nullable=False)
    updated_at = Column(DateTime, default=utcnow, onupdate=utcnow, nullable=False)

    variety = relationship("SeedVariety")
    requesting_bank = relationship("SeedBank", foreign_keys=[requesting_bank_id])
    donor_bank = relationship("SeedBank", foreign_keys=[donor_bank_id])
    donor_lot = relationship("SeedLot")
    transfers = relationship("SeedTransfer", back_populates="request", cascade="all, delete-orphan")


class SeedTransfer(Base):
    """Immutable-ish audit record of each transfer step on a rescue request."""
    __tablename__ = "seed_transfers"

    id = Column(Integer, primary_key=True)
    request_id = Column(Integer, ForeignKey("rescue_requests.id"), nullable=False)
    donor_bank_id = Column(Integer, ForeignKey("seed_banks.id"), nullable=False)
    receiving_bank_id = Column(Integer, ForeignKey("seed_banks.id"), nullable=False)
    donor_lot_id = Column(Integer, ForeignKey("seed_lots.id"), nullable=True)
    receiving_lot_id = Column(Integer, ForeignKey("seed_lots.id"), nullable=True)
    variety_id = Column(Integer, ForeignKey("seed_varieties.id"), nullable=False)
    quantity = Column(Float, nullable=False)
    unit = Column(String(16), nullable=False, default="kg")
    status = Column(String(16), nullable=False, default="approved")
    dispatched_at = Column(DateTime, nullable=True)
    received_at = Column(DateTime, nullable=True)
    note = Column(Text, nullable=True)
    created_at = Column(DateTime, default=utcnow, nullable=False)

    request = relationship("RescueRequest", back_populates="transfers")
    donor_bank = relationship("SeedBank", foreign_keys=[donor_bank_id])
    receiving_bank = relationship("SeedBank", foreign_keys=[receiving_bank_id])
    variety = relationship("SeedVariety")


class ActivityLog(Base):
    __tablename__ = "activity_log"

    id = Column(Integer, primary_key=True)
    bank_id = Column(Integer, ForeignKey("seed_banks.id"), nullable=True)
    entity_type = Column(String(32), nullable=False)
    entity_id = Column(Integer, nullable=True)
    action = Column(String(48), nullable=False)
    description = Column(Text, nullable=False)
    actor = Column(String(64), nullable=False, default="demo user")
    is_demo = Column(Boolean, default=True, nullable=False)
    created_at = Column(DateTime, default=utcnow, nullable=False)

    bank = relationship("SeedBank")
