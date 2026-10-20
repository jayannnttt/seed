"""Shared helpers: serialisation, threshold handling, alert generation, logging."""
from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Optional

from sqlalchemy import func
from sqlalchemy.orm import Session

from . import models, rules, schemas

# Example defaults used until an operator configures a bank's own thresholds.
# These are PLACEHOLDER EXAMPLES, not universal agronomic standards.
DEFAULT_THRESHOLDS = {
    "temperature": {"min_value": 18.0, "max_value": 32.0,
                    "note": "Example default — adjust per crop and local climate"},
    "humidity": {"min_value": 35.0, "max_value": 65.0,
                 "note": "Example default — adjust per crop and local climate"},
}

ALERT_DEDUPE_WINDOW = timedelta(hours=6)


def utcnow() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)


# ------------------------------------------------------------------ logging
def log_activity(db: Session, entity_type: str, entity_id: Optional[int], action: str,
                 description: str, bank_id: Optional[int] = None,
                 actor: str = "demo user", is_demo: bool = True) -> models.ActivityLog:
    entry = models.ActivityLog(
        bank_id=bank_id, entity_type=entity_type, entity_id=entity_id,
        action=action, description=description, actor=actor, is_demo=is_demo,
    )
    db.add(entry)
    return entry


import re


def next_code(db: Session, model, prefix: str, column: str = "alert_code") -> str:
    """Generate the next sequential code, e.g. ALT-0007.

    Uses the MAX existing numeric suffix (not a row count) so deleted rows
    can never produce a duplicate code.
    """
    pattern = re.compile(rf"^{re.escape(prefix)}-(\d+)$")
    highest = 0
    for (code,) in db.query(getattr(model, column)).all():
        if isinstance(code, str):
            m = pattern.match(code)
            if m:
                highest = max(highest, int(m.group(1)))
    return f"{prefix}-{highest + 1:04d}"


# ------------------------------------------------------------- thresholds --
def get_thresholds(db: Session, bank_id: int) -> dict:
    """Return {'temperature': Threshold, 'humidity': Threshold} for a bank.

    Metrics with no operator-configured row fall back to the documented
    system EXAMPLE defaults. Those fallbacks are returned with ``id=0`` so
    they serialise cleanly and the UI can show them as editable presets;
    the first PUT persists them as a real operator-configured row.
    """
    rows = db.query(models.AlertThreshold).filter(models.AlertThreshold.bank_id == bank_id).all()
    out = {}
    for r in rows:
        out[r.metric] = r
    for metric, defaults in DEFAULT_THRESHOLDS.items():
        if metric not in out:
            out[metric] = models.AlertThreshold(
                id=0, bank_id=bank_id, metric=metric,
                min_value=defaults["min_value"], max_value=defaults["max_value"],
                note=defaults["note"] + " (system example default)",
                updated_at=utcnow())
    return out


# ------------------------------------------------------------------ alerts
def check_and_create_alerts(db: Session, reading: models.SensorReading,
                            device: models.SensorDevice, bank: models.SeedBank) -> list[models.Alert]:
    """Evaluate one reading against the bank's configured thresholds.

    An out-of-range reading indicates POTENTIAL STORAGE RISK requiring
    inspection. It is never reported as proof that seed has been damaged.
    """
    thresholds = get_thresholds(db, bank.id)
    created: list[models.Alert] = []

    checks = [("temperature", reading.temperature_c), ("humidity", reading.humidity_pct)]
    for metric, value in checks:
        th = thresholds[metric]
        severity, message, action = rules.evaluate_reading(metric, value, th.min_value, th.max_value)
        if severity is None:
            continue

        affected = _lots_for_bank(db, bank.id)
        # Dedupe: reuse an open alert of the same bank+metric from the last window.
        existing = (
            db.query(models.Alert)
            .filter(models.Alert.bank_id == bank.id,
                    models.Alert.metric == metric,
                    models.Alert.status.in_(["open", "acknowledged"]),
                    models.Alert.detected_at >= utcnow() - ALERT_DEDUPE_WINDOW)
            .order_by(models.Alert.detected_at.desc()).first()
        )
        if existing:
            existing.reading_value = float(value)
            existing.severity = severity
            existing.message = message
            existing.detected_at = utcnow()
            created.append(existing)
            continue

        alert = models.Alert(
            alert_code=next_code(db, models.Alert, "ALT"),
            bank_id=bank.id, device_id=device.id,
            category=metric, metric=metric,
            reading_value=float(value),
            threshold_value=f"{th.min_value:g}–{th.max_value:g}",
            severity=severity, status="open", message=message,
            recommended_action=action,
            affected_lot_codes=affected or None,
            detected_at=utcnow(), is_simulated=device.is_simulated, is_demo=True,
        )
        db.add(alert)
        # Sessions run with autoflush=False — flush now so the dedupe lookup
        # and the next alert_code allocation can see this row.
        db.flush()
        log_activity(db, "alert", None, "created",
                     f"{severity.title()} {metric} alert at {bank.name}: {message}",
                     bank_id=bank.id)
        created.append(alert)
    return created


def _lots_for_bank(db: Session, bank_id: int) -> list[str]:
    """Lot codes held at a bank that currently carry a watch/priority flag."""
    rows = (
        db.query(models.SeedLot.lot_code)
        .filter(models.SeedLot.bank_id == bank_id,
                models.SeedLot.risk_flag.in_(["watch", "priority"]))
        .limit(12).all()
    )
    return [r[0] for r in rows]


# ------------------------------------------------------------ serialisers --
def lot_out(lot: models.SeedLot) -> schemas.LotOut:
    out = schemas.LotOut.model_validate(lot)
    out.variety_name = lot.variety.name if lot.variety else ""
    out.crop_category = lot.variety.crop_category if lot.variety else ""
    out.is_indigenous = bool(lot.variety.is_indigenous) if lot.variety else False
    out.bank_name = lot.bank.name if lot.bank else ""
    out.bank_code = lot.bank.code if lot.bank else ""
    out.bank_location = lot.bank.location if lot.bank else ""
    return out


def variety_out(db: Session, variety: models.SeedVariety) -> schemas.VarietyOut:
    out = schemas.VarietyOut.model_validate(variety)
    lots = [l for l in variety.lots]
    out.lot_count = len(lots)
    out.bank_count = len({l.bank_id for l in lots})
    out.total_quantity = round(sum(l.quantity or 0 for l in lots), 3)
    out.priority_lot_count = sum(1 for l in lots if l.risk_flag == "priority")
    return out


def bank_out(db: Session, bank: models.SeedBank) -> schemas.BankOut:
    out = schemas.BankOut.model_validate(bank)
    out.location = bank.location
    lots = db.query(models.SeedLot).filter(models.SeedLot.bank_id == bank.id).all()
    out.lot_count = len(lots)
    out.variety_count = len({l.variety_id for l in lots})
    out.total_quantity = round(sum(l.quantity or 0 for l in lots), 3)

    latest = (
        db.query(models.SensorReading)
        .filter(models.SensorReading.bank_id == bank.id)
        .order_by(models.SensorReading.recorded_at.desc()).first()
    )
    if latest:
        out.latest_temperature_c = latest.temperature_c
        out.latest_humidity_pct = latest.humidity_pct
        out.latest_reading_at = latest.recorded_at

    device = (
        db.query(models.SensorDevice)
        .filter(models.SensorDevice.bank_id == bank.id)
        .order_by(models.SensorDevice.id.asc()).first()
    )
    if device:
        out.device_status = device.status
        out.is_simulated = device.is_simulated

    out.open_alerts = db.query(models.Alert).filter(
        models.Alert.bank_id == bank.id, models.Alert.status == "open").count()
    out.critical_alerts = db.query(models.Alert).filter(
        models.Alert.bank_id == bank.id, models.Alert.status == "open",
        models.Alert.severity == "critical").count()
    since = utcnow() - timedelta(days=30)
    out.recent_rescue_activity = db.query(models.RescueRequest).filter(
        (models.RescueRequest.requesting_bank_id == bank.id) |
        (models.RescueRequest.donor_bank_id == bank.id),
        models.RescueRequest.updated_at >= since).count()
    return out


def alert_out(alert: models.Alert) -> schemas.AlertOut:
    out = schemas.AlertOut.model_validate(alert)
    out.bank_name = alert.bank.name if alert.bank else ""
    out.bank_location = alert.bank.location if alert.bank else ""
    out.device_name = alert.device.name if alert.device else None
    return out


def rescue_out(req: models.RescueRequest) -> schemas.RescueOut:
    out = schemas.RescueOut.model_validate(req)
    out.variety_name = req.variety.name if req.variety else ""
    out.crop_category = req.variety.crop_category if req.variety else ""
    out.requesting_bank_name = req.requesting_bank.name if req.requesting_bank else ""
    out.donor_bank_name = req.donor_bank.name if req.donor_bank else None
    out.donor_lot_code = req.donor_lot.lot_code if req.donor_lot else None
    return out


def transfer_out(t: models.SeedTransfer) -> schemas.TransferOut:
    out = schemas.TransferOut.model_validate(t)
    out.donor_bank_name = t.donor_bank.name if t.donor_bank else ""
    out.receiving_bank_name = t.receiving_bank.name if t.receiving_bank else ""
    out.variety_name = t.variety.name if t.variety else ""
    return out


def bank_brief(bank: models.SeedBank) -> schemas.BankBrief:
    return schemas.BankBrief(
        id=bank.id, code=bank.code, name=bank.name, location=bank.location,
        latitude=bank.latitude, longitude=bank.longitude)


# ---------------------------------------------------- recompute risk flags -
def refresh_risk_flags(db: Session) -> int:
    """Recompute every lot's local risk flag using the documented rules."""
    counts = dict(
        db.query(models.SeedLot.variety_id, func.count(func.distinct(models.SeedLot.bank_id)))
        .group_by(models.SeedLot.variety_id).all())
    today = utcnow().date()
    changed = 0
    for lot in db.query(models.SeedLot).all():
        flag, reason = rules.compute_lot_risk_flag(lot, counts, today)
        if lot.risk_flag != flag or lot.risk_flag_reason != reason:
            lot.risk_flag = flag
            lot.risk_flag_reason = reason
            changed += 1
    return changed
