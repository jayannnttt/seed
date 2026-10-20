"""IoT storage monitoring: devices, readings, thresholds, simulation controls."""
from datetime import timedelta
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from ..database import get_db
from .. import models, schemas, services, simulator

router = APIRouter(prefix="/api", tags=["monitoring"])


@router.get("/devices", response_model=list[schemas.DeviceOut])
def list_devices(db: Session = Depends(get_db)):
    out = []
    for d in db.query(models.SensorDevice).order_by(models.SensorDevice.id).all():
        item = schemas.DeviceOut.model_validate(d)
        item.bank_name = d.bank.name if d.bank else ""
        out.append(item)
    return out


@router.patch("/devices/{device_id}", response_model=schemas.DeviceOut)
def update_device(device_id: int, payload: schemas.DeviceUpdate, db: Session = Depends(get_db)):
    device = db.get(models.SensorDevice, device_id)
    if not device:
        raise HTTPException(status_code=404, detail=f"Device {device_id} not found")
    for key, value in payload.model_dump(exclude_unset=True).items():
        setattr(device, key, value)
    services.log_activity(
        db, "device", device.id, "updated",
        f"Device '{device.name}' at {device.bank.name} set to status '{device.status}', "
        f"transport '{device.transport}'", bank_id=device.bank_id)
    db.commit()
    db.refresh(device)
    item = schemas.DeviceOut.model_validate(device)
    item.bank_name = device.bank.name
    return item


@router.get("/readings", response_model=list[schemas.ReadingOut])
def list_readings(bank_id: Optional[int] = None, hours: int = 24, limit: int = 500,
                  db: Session = Depends(get_db)):
    hours = max(1, min(hours, 24 * 30))
    since = services.utcnow() - timedelta(hours=hours)
    q = db.query(models.SensorReading).filter(models.SensorReading.recorded_at >= since)
    if bank_id:
        q = q.filter(models.SensorReading.bank_id == bank_id)
    rows = q.order_by(models.SensorReading.recorded_at.asc()).limit(limit).all()
    return rows


@router.post("/monitoring/simulate")
def simulate_readings(payload: schemas.SimulationRequest, db: Session = Depends(get_db)):
    """Push N new simulated readings for one bank's sensor (demo control)."""
    bank = db.get(models.SeedBank, payload.bank_id)
    if not bank:
        raise HTTPException(status_code=404, detail=f"Seed bank {payload.bank_id} not found")
    device = simulator.ensure_device(db, bank)
    if device.status != "online":
        raise HTTPException(
            status_code=409,
            detail=(f"The sensor at {bank.name} is marked OFFLINE. Set it back online "
                    f"before simulating new readings."))

    last = (db.query(models.SensorReading)
            .filter(models.SensorReading.device_id == device.id)
            .order_by(models.SensorReading.recorded_at.desc()).first())
    t, h = (last.temperature_c, last.humidity_pct) if last else simulator.base_climate(bank.id)
    baseline = simulator.base_climate(bank.id)
    rng = __import__("random").Random()
    now = services.utcnow()
    created = []
    for i in range(payload.steps):
        t, h = simulator.step_reading(t, h, rng, target=baseline)
        created.append(simulator.add_reading(
            db, device, bank, t, h,
            now + timedelta(minutes=5 * (i + 1)), evaluate=True))
    db.commit()
    alerts = db.query(models.Alert).filter(
        models.Alert.bank_id == bank.id, models.Alert.status == "open").all()
    return {
        "status": "ok",
        "bank": services.bank_brief(bank),
        "device": {"id": device.id, "device_code": device.device_code,
                   "is_simulated": device.is_simulated},
        "new_readings": [schemas.ReadingOut.model_validate(r).model_dump() for r in created],
        "open_alerts": [services.alert_out(a).model_dump() for a in alerts],
        "note": ("These readings were produced by the built-in DEMO SIMULATOR, "
                 "not by physical hardware."),
    }


# ------------------------------------------------------------- thresholds --
@router.get("/thresholds", response_model=list[schemas.ThresholdOut])
def list_thresholds(bank_id: Optional[int] = None, db: Session = Depends(get_db)):
    banks = ([db.get(models.SeedBank, bank_id)] if bank_id
             else db.query(models.SeedBank).order_by(models.SeedBank.id).all())
    if bank_id and banks[0] is None:
        raise HTTPException(status_code=404, detail=f"Seed bank {bank_id} not found")
    out = []
    for bank in banks:
        if bank is None:
            continue
        for th in services.get_thresholds(db, bank.id).values():
            out.append(th)
    return out


@router.put("/thresholds/{bank_id}/{metric}", response_model=schemas.ThresholdOut)
def set_threshold(bank_id: int, metric: str, payload: schemas.ThresholdUpdate,
                  db: Session = Depends(get_db)):
    if metric not in ("temperature", "humidity"):
        raise HTTPException(status_code=422, detail="metric must be 'temperature' or 'humidity'")
    bank = db.get(models.SeedBank, bank_id)
    if not bank:
        raise HTTPException(status_code=404, detail=f"Seed bank {bank_id} not found")
    th = db.query(models.AlertThreshold).filter(
        models.AlertThreshold.bank_id == bank_id,
        models.AlertThreshold.metric == metric).first()
    if th is None:
        th = models.AlertThreshold(bank_id=bank_id, metric=metric,
                                   min_value=payload.min_value, max_value=payload.max_value,
                                   note=payload.note)
        db.add(th)
    else:
        th.min_value = payload.min_value
        th.max_value = payload.max_value
        if payload.note is not None:
            th.note = payload.note
    services.log_activity(
        db, "threshold", bank_id, "updated",
        f"{metric.title()} threshold for {bank.name} set to "
        f"{payload.min_value:g}–{payload.max_value:g} (operator configured)",
        bank_id=bank_id)
    db.commit()
    db.refresh(th)
    return th


# ------------------------------------------------------------ raw ingest --
class IngestReading(schemas.ORMModel):
    temperature_c: float
    humidity_pct: float
    device_code: Optional[str] = None


@router.post("/ingest/readings")
def ingest_reading(payload: IngestReading, db: Session = Depends(get_db)):
    """Entry point for REAL hardware (ESP32/Arduino/MQTT bridge via HTTP).

    Deliver a JSON body with temperature_c, humidity_pct and (optionally)
    X-Device-Code header or device_code field. Simpler devices may use the
    public /api/ingest/open/{device_code} endpoint.
    """
    raise HTTPException(
        status_code=400,
        detail=("Use POST /api/ingest/open/{device_code} with a JSON body of "
                "{'temperature_c': float, 'humidity_pct': float}. That endpoint is "
                "intended for trusted devices on a private network."))


@router.post("/ingest/open/{device_code}")
def ingest_open(device_code: str, payload: IngestReading, db: Session = Depends(get_db)):
    device = db.query(models.SensorDevice).filter(
        models.SensorDevice.device_code == device_code).first()
    if not device:
        raise HTTPException(status_code=404, detail=f"Unknown device code '{device_code}'")
    bank = db.get(models.SeedBank, device.bank_id)
    if not (-40 <= payload.temperature_c <= 80):
        raise HTTPException(status_code=422, detail="temperature_c out of sensor range")
    if not (0 <= payload.humidity_pct <= 100):
        raise HTTPException(status_code=422, detail="humidity_pct must be 0-100")
    reading = simulator.add_reading(
        db, device, bank, payload.temperature_c, payload.humidity_pct,
        services.utcnow(), evaluate=True)
    device.transport = "http" if device.is_simulated else device.transport
    db.commit()
    return {"status": "stored", "reading_id": reading.id,
            "is_simulated": reading.is_simulated}
