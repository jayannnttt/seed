"""Simulated IoT sensor core.

The hackathon demo has no physical sensors, so readings here are GENERATED
and every one of them is stored with ``is_simulated=True``. The UI shows a
visible "Demo Simulation" indicator for these devices.

To connect REAL hardware later, point a device's ``transport`` field at
``mqtt`` or ``http`` and deliver readings to POST /api/ingest/readings
(from an ESP32/Arduino bridge, a Raspberry Pi gateway, or an MQTT->HTTP
adapter). Nothing else in the platform needs to change: real readings are
stored with ``is_simulated=False`` and flow through the same threshold and
alert logic.
"""
from __future__ import annotations

import random
from datetime import datetime, timedelta
from typing import Optional

from sqlalchemy.orm import Session

from . import models, services

# Stable per-bank "climate" so each demo bank looks geographically distinct.
CLIMATE = {
    1: (27.0, 58.0),   # plains
    2: (24.5, 64.0),   # hills
    3: (29.0, 55.0),   # dry plateau
    4: (23.0, 70.0),   # coastal / high humidity
    5: (26.0, 60.0),   # inland
}


def base_climate(bank_id: int, salt: int = 0) -> tuple[float, float]:
    if bank_id in CLIMATE:
        t, h = CLIMATE[bank_id]
    else:
        t, h = 26.0 + (bank_id % 5), 58.0 + (bank_id % 4) * 3
    jitter = random.Random(bank_id * 977 + salt).uniform(-0.6, 0.6)
    return round(t + jitter, 2), round(h + jitter * 1.5, 2)


def step_reading(prev_t: float, prev_h: float, rng: random.Random,
                 temp_bias: float = 0.0, hum_bias: float = 0.0,
                 target: tuple[float, float] = (26.0, 58.0)) -> tuple[float, float]:
    """Mean-reverting random walk around the bank's own climate baseline.

    Using a PER-BANK target keeps each demo bank looking geographically
    distinct (the coastal bank stays humid, the dryland bank stays dry)
    instead of every sensor drifting to one global average.
    """
    t_target, h_target = target
    t = prev_t + (t_target - prev_t) * 0.12 + rng.uniform(-0.35, 0.35) + temp_bias
    h = prev_h + (h_target - prev_h) * 0.12 + rng.uniform(-0.7, 0.7) + hum_bias
    return round(max(-10.0, min(60.0, t)), 2), round(max(5.0, min(100.0, h)), 2)


def add_reading(db: Session, device: models.SensorDevice, bank: models.SeedBank,
                temperature_c: float, humidity_pct: float, recorded_at: datetime,
                evaluate: bool = True) -> models.SensorReading:
    reading = models.SensorReading(
        device_id=device.id, bank_id=bank.id,
        temperature_c=round(temperature_c, 2), humidity_pct=round(humidity_pct, 2),
        recorded_at=recorded_at, is_simulated=device.is_simulated)
    db.add(reading)
    device.last_reading_at = recorded_at
    if evaluate and device.status == "online":
        services.check_and_create_alerts(db, reading, device, bank)
    return reading


def ensure_device(db: Session, bank: models.SeedBank) -> models.SensorDevice:
    device = db.query(models.SensorDevice).filter(
        models.SensorDevice.bank_id == bank.id).order_by(models.SensorDevice.id).first()
    if device is None:
        device = models.SensorDevice(
            device_code=f"SIM-{bank.code}", bank_id=bank.id,
            name="Storage environment sensor", device_type="environmental",
            transport="simulated", status="online", is_simulated=True)
        db.add(device)
        db.flush()
    return device


def simulate_series(db: Session, bank: models.SeedBank, steps: int = 48,
                    interval_minutes: int = 30,
                    end_time: Optional[datetime] = None,
                    temp_bias: float = 0.0, hum_bias: float = 0.0,
                    seed: Optional[int] = None,
                    evaluate_last: bool = True) -> list[models.SensorReading]:
    """Generate a plausible historical series for one bank's sensor."""
    device = ensure_device(db, bank)
    end_time = end_time or services.utcnow()
    rng = random.Random(seed if seed is not None else bank.id * 131)
    baseline = base_climate(bank.id, salt=steps)
    t, h = baseline
    out = []
    for i in range(steps, 0, -1):
        recorded_at = end_time - timedelta(minutes=interval_minutes * i)
        t, h = step_reading(t, h, rng, temp_bias=0.0, hum_bias=0.0, target=baseline)
        out.append(add_reading(db, device, bank, t, h, recorded_at, evaluate=False))
    if evaluate_last and out and device.status == "online":
        services.check_and_create_alerts(db, out[-1], device, bank)
    return out
