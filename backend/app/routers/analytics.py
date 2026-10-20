"""Dashboard summary, analytics, activity feed and demo-data management."""
from datetime import timedelta

from fastapi import APIRouter, Depends
from sqlalchemy import func, case
from sqlalchemy.orm import Session

from ..database import get_db
from .. import models, schemas, services

router = APIRouter(prefix="/api", tags=["dashboard"])


def _latest_per_bank(db: Session) -> list[models.SensorReading]:
    sub = (db.query(models.SensorReading.bank_id,
                    func.max(models.SensorReading.recorded_at).label("mx"))
           .group_by(models.SensorReading.bank_id).subquery())
    return (db.query(models.SensorReading)
            .join(sub, (models.SensorReading.bank_id == sub.c.bank_id) &
                        (models.SensorReading.recorded_at == sub.c.mx))
            .all())


def _trend(db: Session, hours: int = 24) -> list[dict]:
    """Average temperature/humidity across the network, bucketed hourly."""
    since = services.utcnow() - timedelta(hours=hours)
    rows = (db.query(models.SensorReading)
            .filter(models.SensorReading.recorded_at >= since)
            .order_by(models.SensorReading.recorded_at.asc()).all())
    buckets: dict[str, list] = {}
    for r in rows:
        key = r.recorded_at.replace(minute=0, second=0, microsecond=0).isoformat()
        buckets.setdefault(key, []).append(r)
    out = []
    for key in sorted(buckets):
        group = buckets[key]
        out.append({
            "time": key,
            "temperature_c": round(sum(g.temperature_c for g in group) / len(group), 2),
            "humidity_pct": round(sum(g.humidity_pct for g in group) / len(group), 2),
            "readings": len(group),
        })
    return out


@router.get("/summary")
def summary(db: Session = Depends(get_db)):
    banks = db.query(models.SeedBank).all()
    lots = db.query(models.SeedLot).all()
    varieties = db.query(models.SeedVariety).all()
    latest = _latest_per_bank(db)
    open_alerts = db.query(models.Alert).filter(models.Alert.status == "open").all()
    pending = db.query(models.RescueRequest).filter(
        models.RescueRequest.status.in_(["pending", "approved", "dispatched"])).all()

    priority_varieties = {l.variety_id for l in lots if l.risk_flag == "priority"}

    attention = (
        db.query(models.SeedLot)
        .filter(models.SeedLot.risk_flag.in_(["priority", "watch"]))
        .order_by(case((models.SeedLot.risk_flag == "priority", 0), else_=1),
                  models.SeedLot.updated_at.desc())
        .limit(8).all())

    alerts_recent = (db.query(models.Alert)
                     .order_by(models.Alert.detected_at.desc()).limit(6).all())
    rescues_recent = (db.query(models.RescueRequest)
                      .order_by(models.RescueRequest.updated_at.desc()).limit(5).all())
    activity = (db.query(models.ActivityLog)
                .order_by(models.ActivityLog.created_at.desc()).limit(8).all())

    devices = db.query(models.SensorDevice).all()
    online = sum(1 for d in devices if d.status == "online")

    return {
        "demo_data": True,
        "counts": {
            "banks": len(banks),
            "varieties": len(varieties),
            "lots": len(lots),
            "indigenous_varieties": sum(1 for v in varieties if v.is_indigenous),
            "total_seed_quantity": round(sum(l.quantity or 0 for l in lots), 2),
            "priority_varieties": len(priority_varieties),
            "open_alerts": len(open_alerts),
            "critical_alerts": sum(1 for a in open_alerts if a.severity == "critical"),
            "pending_rescue_requests": len(pending),
        },
        "environment": {
            "avg_temperature_c": round(
                sum(r.temperature_c for r in latest) / len(latest), 2) if latest else None,
            "avg_humidity_pct": round(
                sum(r.humidity_pct for r in latest) / len(latest), 2) if latest else None,
            "banks_online": online,
            "banks_total": len(devices),
            "latest_readings": [
                {"bank_id": r.bank_id, "bank_name": r.bank.name,
                 "temperature_c": r.temperature_c, "humidity_pct": r.humidity_pct,
                 "recorded_at": r.recorded_at, "is_simulated": r.is_simulated}
                for r in latest],
        },
        "trend": _trend(db, 24),
        "recent_alerts": [services.alert_out(a) for a in alerts_recent],
        "recent_rescue_requests": [services.rescue_out(r) for r in rescues_recent],
        "attention_lots": [services.lot_out(l) for l in attention],
        "recent_activity": [schemas.ActivityOut.model_validate(a).model_dump() for a in activity],
        "network": [services.bank_out(db, b).model_dump() for b in banks],
        "notice": ("All figures on this dashboard are calculated from the platform's own "
                   "database. Sensor readings are marked as simulated unless real "
                   "hardware has been connected."),
    }


@router.get("/analytics")
def analytics(db: Session = Depends(get_db)):
    lots = db.query(models.SeedLot).all()

    by_category = {}
    for l in lots:
        cat = l.variety.crop_category if l.variety else "other"
        entry = by_category.setdefault(cat, {"category": cat, "lots": 0, "quantity": 0.0,
                                             "varieties": set()})
        entry["lots"] += 1
        entry["quantity"] = round(entry["quantity"] + (l.quantity or 0), 2)
        entry["varieties"].add(l.variety_id)
    categories = [{**v, "varieties": len(v["varieties"])}
                  for v in by_category.values()]
    categories.sort(key=lambda x: -x["quantity"])

    qty_col = func.coalesce(func.sum(models.SeedLot.quantity), 0).label("qty")
    lots_col = func.count(models.SeedLot.id).label("lots")
    by_bank = (db.query(models.SeedBank.id, models.SeedBank.name, models.SeedBank.state,
                        lots_col, qty_col)
               .outerjoin(models.SeedLot, models.SeedLot.bank_id == models.SeedBank.id)
               .group_by(models.SeedBank.id).order_by(qty_col.desc()).all())

    alerts_by_status = []
    for status in models.ALERT_STATUS_VALUES:
        alerts_by_status.append({
            "status": status,
            "count": db.query(models.Alert).filter(models.Alert.status == status).count()})
    open_by_severity = []
    for sev in models.ALERT_SEVERITY_VALUES:
        open_by_severity.append({
            "severity": sev,
            "count": db.query(models.Alert).filter(models.Alert.status == "open",
                                                   models.Alert.severity == sev).count()})

    rescue_by_status = []
    for status in models.RESCUE_STATUS_VALUES:
        rescue_by_status.append({
            "status": status,
            "count": db.query(models.RescueRequest).filter(
                models.RescueRequest.status == status).count()})
    transfers_received = db.query(models.SeedTransfer).filter(
        models.SeedTransfer.status == "received").count()

    flagged = (
        db.query(models.SeedLot)
        .filter(models.SeedLot.risk_flag.in_(["priority", "watch"]))
        .order_by(case((models.SeedLot.risk_flag == "priority", 0), else_=1))
        .limit(40).all())
    flagged_rows = []
    seen = set()
    for l in flagged:
        key = (l.variety_id, l.bank_id)
        if key in seen:
            continue
        seen.add(key)
        flagged_rows.append({
            "variety_id": l.variety_id,
            "variety_name": l.variety.name if l.variety else "",
            "crop_category": l.variety.crop_category if l.variety else "",
            "is_indigenous": bool(l.variety.is_indigenous) if l.variety else False,
            "bank_name": l.bank.name if l.bank else "",
            "risk_flag": l.risk_flag,
            "risk_flag_reason": l.risk_flag_reason,
            "quantity": l.quantity, "unit": l.unit,
        })

    trend = _trend(db, 24)

    return {
        "by_category": categories,
        "by_bank": [{"bank_id": r[0], "name": r[1], "state": r[2],
                     "lots": int(r[3]),
                     "quantity": round(float(r[4]), 2)} for r in by_bank],
        "alerts_by_status": alerts_by_status,
        "open_alerts_by_severity": open_by_severity,
        "rescue_by_status": rescue_by_status,
        "transfers_received": transfers_received,
        "flagged_varieties": flagged_rows,
        "trend": trend,
        "disclaimers": {
            "conservation": ("'priority' and 'watch' are LOCAL network flags produced by "
                             "the documented rules in backend/app/rules.py. They are NOT "
                             "official conservation statuses (e.g. IUCN)."),
            "simulated": ("Storage trends include simulated sensor readings, clearly "
                          "marked in the UI, because no physical sensors are attached."),
            "calculated": ("Every number here is calculated from the platform database. "
                           "No external service or prediction model is used."),
        },
    }


@router.get("/activity", response_model=list[schemas.ActivityOut])
def activity(limit: int = 30, bank_id: int | None = None, db: Session = Depends(get_db)):
    q = db.query(models.ActivityLog)
    if bank_id:
        q = q.filter(models.ActivityLog.bank_id == bank_id)
    rows = q.order_by(models.ActivityLog.created_at.desc()).limit(min(limit, 200)).all()
    out = []
    for r in rows:
        item = schemas.ActivityOut.model_validate(r)
        item.bank_name = r.bank.name if r.bank else None
        out.append(item)
    return out
