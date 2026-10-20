"""Seed Rescue Simulation — a judge-friendly, repeatable scenario runner.

Everything this endpoint does is (a) clearly labelled simulation, (b) based on
documented rules in app.rules, and (c) reversible via POST /api/demo/reset.
No machine-learning model is involved and no claim is made about real seed
survival.
"""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from ..database import get_db
from .. import models, rules, schemas, services, simulator

router = APIRouter(prefix="/api/simulation", tags=["rescue simulation"])

CHECKLIST_TEMPLATES = {
    "flood": [
        "Move seed lots from ground-level or water-facing racks to upper shelves immediately.",
        "Photograph and record any lot whose packaging shows wetting, before moving it.",
        "Verify the water source and cut power to submerged electrical points safely.",
        "Relocate priority-flagged lots first (see the prioritised lot list below).",
        "Open a Seed Rescue Request for any variety whose stock may be compromised.",
        "Log arrival condition for any rescued lot moved into this bank.",
    ],
    "power_failure": [
        "Confirm the outage scope and switch to battery/backup lighting.",
        "Seal storage rooms to slow humidity and temperature drift.",
        "Record temperature and humidity manually every 30 minutes until power returns.",
        "Prioritise moving temperature-sensitive lots to a working cooler if available.",
        "Check desiccant trays and replace any saturated sachets.",
        "Open a Seed Rescue Request if conditions stay outside the configured range.",
    ],
    "humidity_spike": [
        "Verify the sensor reading with a second hygrometer before assuming damage.",
        "Inspect walls, roof and floor for water ingress or condensation.",
        "Increase ventilation or run dehumidifiers; replenish desiccants.",
        "Re-check the seed containers and reseal any damaged packaging.",
        "Re-test germination for lots stored in the affected area after conditions settle.",
        "Open a Seed Rescue Request for lots flagged high below.",
    ],
    "unsafe_sensor": [
        "Verify the reported reading with a second instrument — a sensor fault is common.",
        "Inspect the storage area and record what you observe.",
        "Check the sensor's power, mounting and calibration date.",
        "Move any priority-flagged lots to a known-good storage area while investigating.",
        "Acknowledge the alert with your findings so other banks can see the status.",
        "Open a Seed Rescue Request only if the risk cannot be mitigated locally.",
    ],
}


@router.get("/scenarios")
def list_scenarios():
    return [
        {"key": key, "label": sc["label"], "description": sc["description"],
         "reason_category": sc["reason_category"], "base_risk": sc["base_risk"],
         "checklist": CHECKLIST_TEMPLATES.get(key, [])}
        for key, sc in rules.SCENARIOS.items()
    ]


@router.post("/run")
def run_scenario(payload: schemas.SimulationRequest, scenario: str = "flood",
                 db: Session = Depends(get_db)):
    sc = rules.SCENARIOS.get(scenario)
    if not sc:
        raise HTTPException(
            status_code=422,
            detail=f"Unknown scenario '{scenario}'. Options: {list(rules.SCENARIOS)}")
    bank = db.get(models.SeedBank, payload.bank_id)
    if not bank:
        raise HTTPException(status_code=404, detail=f"Seed bank {payload.bank_id} not found")

    device = simulator.ensure_device(db, bank)
    last = (db.query(models.SensorReading)
            .filter(models.SensorReading.device_id == device.id)
            .order_by(models.SensorReading.recorded_at.desc()).first())
    t, h = (last.temperature_c, last.humidity_pct) if last else simulator.base_climate(bank.id)
    baseline = simulator.base_climate(bank.id)

    import random
    rng = random.Random(bank.id * 7919 + payload.steps)
    t_lo, t_hi = sc["delta_temperature"]
    h_lo, h_hi = sc["delta_humidity"]
    now = services.utcnow()
    readings = []
    for i in range(payload.steps):
        # bias ramps up over the steps to mimic a developing incident
        ramp = (i + 1) / payload.steps
        t_bias = rng.uniform(t_lo, t_hi) * ramp
        h_bias = rng.uniform(h_lo, h_hi) * ramp
        t, h = simulator.step_reading(t, h, rng, temp_bias=t_bias, hum_bias=h_bias,
                                      target=baseline)
        readings.append(simulator.add_reading(db, device, bank, t, h,
                                              now - timedelta_minutes(payload.steps - i),
                                              evaluate=True))
    db.flush()

    alerts = (db.query(models.Alert)
              .filter(models.Alert.bank_id == bank.id, models.Alert.status == "open")
              .order_by(models.Alert.detected_at.desc()).all())

    lots = db.query(models.SeedLot).filter(models.SeedLot.bank_id == bank.id).all()
    scored = []
    for lot in lots:
        score, reason = rules.scenario_risk_score(lot, scenario)
        scored.append({
            "lot_id": lot.id, "lot_code": lot.lot_code,
            "variety_id": lot.variety_id,
            "variety_name": lot.variety.name if lot.variety else "",
            "crop_category": lot.variety.crop_category if lot.variety else "",
            "is_indigenous": bool(lot.variety.is_indigenous) if lot.variety else False,
            "quantity": lot.quantity, "unit": lot.unit,
            "condition": lot.condition, "risk_flag": lot.risk_flag,
            "storage_location": lot.storage_location,
            "risk_score": score,
            "attention_band": rules.scenario_band(score),
            "risk_reasons": reason,
        })
    scored.sort(key=lambda x: -x["risk_score"])

    bank_score = 0
    if scored:
        bank_score = round(sum(s["risk_score"] for s in scored) / len(scored))

    reserve = []
    seen_varieties = set()
    for s in scored[:6]:
        if s["variety_id"] in seen_varieties or not s["quantity"]:
            continue
        seen_varieties.add(s["variety_id"])
        req = models.RescueRequest(
            request_code="DRYRUN", variety_id=s["variety_id"],
            requesting_bank_id=bank.id,
            required_quantity=s["quantity"], unit=s["unit"])
        req.variety = db.get(models.SeedVariety, s["variety_id"])
        req.requesting_bank = bank
        from . import rescue as rescue_router
        reserve.append({
            "variety_id": s["variety_id"],
            "variety_name": s["variety_name"],
            "lot_code": s["lot_code"],
            "quantity_at_risk": s["quantity"],
            "unit": s["unit"],
            "risk_score": s["risk_score"],
            "attention_band": s["attention_band"],
            "matches": rescue_router._compute_matches(db, req)[:5],
        })
        if len(reserve) >= 3:
            break

    services.log_activity(
        db, "simulation", bank.id, "run",
        f"Simulation '{sc['label']}' run at {bank.name}: {len(scored)} lot(s) analysed, "
        f"{len(alerts)} open alert(s), top risk "
        f"'{scored[0]['variety_name'] if scored else 'n/a'}'",
        bank_id=bank.id)
    db.commit()

    return {
        "scenario": {"key": scenario, "label": sc["label"],
                     "description": sc["description"]},
        "bank": services.bank_out(db, bank),
        "is_simulation": True,
        "notice": ("This is a DEMO SIMULATION generated by the rule-based scenario engine. "
                   "It does not represent real sensor hardware and makes no claim about "
                   "actual seed survival."),
        "latest_reading": {
            "temperature_c": readings[-1].temperature_c if readings else None,
            "humidity_pct": readings[-1].humidity_pct if readings else None,
            "recorded_at": readings[-1].recorded_at if readings else None,
        },
        "thresholds": {
            m: {"min": th.min_value, "max": th.max_value, "note": th.note}
            for m, th in services.get_thresholds(db, bank.id).items()},
        "open_alerts": [services.alert_out(a) for a in alerts],
        "risk": {
            "bank_score": bank_score,
            "bank_band": rules.scenario_band(bank_score),
            "method": (f"Lot score = scenario base risk ({sc['base_risk']}) + condition "
                       f"penalty + viability-test penalty + local risk flag penalty "
                       f"(see README). Bank score = mean of lot scores. Bands: "
                       f"low <40, elevated 40-69, high >=70."),
        },
        "affected_lots": scored,
        "checklist": build_checklist(scenario, scored, bank.name),
        "reserve_matches": reserve,
    }


def lot_free_estimate(lots, variety_id: int) -> float:
    return max((l.available_quantity for l in lots if l.variety_id == variety_id), default=1.0)


def timedelta_minutes(m: int):
    from datetime import timedelta
    return timedelta(minutes=5 * m)


def build_checklist(scenario: str, scored: list[dict], bank_name: str) -> list[dict]:
    template = CHECKLIST_TEMPLATES.get(scenario, [])
    steps = [{"step": i + 1, "action": action, "priority": "normal"}
             for i, action in enumerate(template)]
    if scored:
        worst = scored[0]
        steps.insert(0, {
            "step": 0,
            "action": (f"Start with lot {worst['lot_code']} ('{worst['variety_name']}') — "
                       f"highest calculated risk ({worst['risk_score']}/100, "
                       f"{worst['attention_band']} band)."),
            "priority": "high",
        })
        priority_lots = [s for s in scored if s["risk_flag"] == "priority"]
        if priority_lots:
            steps.insert(1, {
                "step": 1,
                "action": ("Local conservation priority flag on: "
                           + ", ".join(f"{s['lot_code']} ({s['variety_name']})"
                                       for s in priority_lots[:4])
                           + " — check these first."),
                "priority": "high",
            })
    for i, s in enumerate(steps):
        s["step"] = i + 1
    return steps
