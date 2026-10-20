"""Alerts centre: filtering, acknowledgement and resolution."""
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from ..database import get_db
from .. import models, schemas, services

router = APIRouter(prefix="/api/alerts", tags=["alerts"])


@router.get("", response_model=list[schemas.AlertOut])
def list_alerts(severity: Optional[str] = None, bank_id: Optional[int] = None,
                status: Optional[str] = None, category: Optional[str] = None,
                db: Session = Depends(get_db)):
    q = db.query(models.Alert)
    if severity:
        q = q.filter(models.Alert.severity == severity)
    if bank_id:
        q = q.filter(models.Alert.bank_id == bank_id)
    if status:
        q = q.filter(models.Alert.status == status)
    if category:
        q = q.filter(models.Alert.category == category)
    rows = q.order_by(models.Alert.detected_at.desc()).limit(500).all()
    return [services.alert_out(a) for a in rows]


@router.get("/summary")
def alert_summary(db: Session = Depends(get_db)):
    out = {}
    for status in models.ALERT_STATUS_VALUES:
        out[status] = db.query(models.Alert).filter(models.Alert.status == status).count()
    by_severity = {}
    for sev in models.ALERT_SEVERITY_VALUES:
        by_severity[sev] = db.query(models.Alert).filter(
            models.Alert.severity == sev, models.Alert.status == "open").count()
    return {"by_status": out, "open_by_severity": by_severity}


def _get(db: Session, alert_id: int) -> models.Alert:
    alert = db.get(models.Alert, alert_id)
    if not alert:
        raise HTTPException(status_code=404, detail=f"Alert {alert_id} not found")
    return alert


@router.post("/{alert_id}/acknowledge", response_model=schemas.AlertOut)
def acknowledge(alert_id: int, payload: schemas.AlertAction, db: Session = Depends(get_db)):
    alert = _get(db, alert_id)
    if alert.status != "open":
        raise HTTPException(
            status_code=409,
            detail=f"Alert {alert.alert_code} is already '{alert.status}' and cannot be acknowledged again.")
    alert.status = "acknowledged"
    alert.acknowledged_at = services.utcnow()
    services.log_activity(
        db, "alert", alert.id, "acknowledged",
        f"Alert {alert.alert_code} at {alert.bank.name} acknowledged"
        + (f" — {payload.note}" if payload.note else ""),
        bank_id=alert.bank_id)
    db.commit()
    db.refresh(alert)
    return services.alert_out(alert)


@router.post("/{alert_id}/resolve", response_model=schemas.AlertOut)
def resolve(alert_id: int, payload: schemas.AlertAction, db: Session = Depends(get_db)):
    alert = _get(db, alert_id)
    if alert.status == "resolved":
        raise HTTPException(status_code=409,
                            detail=f"Alert {alert.alert_code} is already resolved.")
    note = payload.note or "Resolved after inspection"
    alert.status = "resolved"
    alert.resolved_at = services.utcnow()
    alert.resolution_note = note
    if alert.acknowledged_at is None:
        alert.acknowledged_at = alert.resolved_at
    services.log_activity(
        db, "alert", alert.id, "resolved",
        f"Alert {alert.alert_code} at {alert.bank.name} resolved — {note}",
        bank_id=alert.bank_id)
    db.commit()
    db.refresh(alert)
    return services.alert_out(alert)


@router.delete("/{alert_id}")
def delete_alert(alert_id: int, db: Session = Depends(get_db)):
    alert = _get(db, alert_id)
    code = alert.alert_code
    db.delete(alert)
    services.log_activity(db, "alert", alert_id, "deleted", f"Alert {code} deleted")
    db.commit()
    return {"status": "deleted", "alert_id": alert_id, "alert_code": code}
