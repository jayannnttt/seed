"""Documented, transparent rule-based logic for SeedSathi.

Everything in this module is a DETERMINISTIC, EXPLAINABLE rule set.
There is no machine-learning model involved. Each function returns the
reasons it produced a result so the UI can explain it to the user.

---------------------------------------------------------------------------
1. LOCAL CONSERVATION RISK FLAG (seed lots)
---------------------------------------------------------------------------
This is a LOCAL working flag used by this seed-bank network to prioritise
attention. It is NOT an official conservation status (IUCN, national lists,
etc.) and must never be presented as one.

Rule (evaluated top-down, first match wins):
  priority  : risk_flag_reason explains the trigger. Triggers:
                a) lot condition recorded as "poor"
                b) this variety exists at only ONE bank in the network
                   AND total network quantity <= SINGLE_BANK_WATCH_QUANTITY
                c) lot quantity <= CRITICAL_QUANTITY (network-local threshold)
  watch     : triggers:
                a) lot condition "fair" or "unknown"
                b) viability never tested (no germination rate recorded)
                c) last viability test older than VIABILITY_STALE_MONTHS
                d) variety held at only one bank (single point of failure)
  none      : none of the above apply.
The computed reason string always lists the triggering rules.

---------------------------------------------------------------------------
2. STORAGE ALERT EVALUATION (IoT readings vs configured thresholds)
---------------------------------------------------------------------------
A reading outside a configured threshold range means POTENTIAL RISK that
requires inspection. It does NOT prove that any seed has been damaged.
Severity:
  critical : outside range by more than CRITICAL_MARGIN (per metric)
  warning  : outside the configured range
  info     : inside the configured range (no alert raised)

---------------------------------------------------------------------------
3. RESCUE MATCH RANKING
---------------------------------------------------------------------------
Candidate = a lot of the SAME recorded seed variety, in a DIFFERENT bank,
with available quantity (quantity - reserved) > 0.
Score = weighted sum out of 100:
    availability  (up to 40) : min(1, available / required) * 40
    condition info(up to 35) : good 25 / fair 15 / poor 5 / unknown 5
                               + 10 if a germination rate has been recorded
    proximity     (up to 25) : <=25 km 25, <=75 km 18, <=200 km 12, else 6
                               neutral 8 when coordinates are unavailable
Honesty rules:
  * matching is by RECORDED VARIETY ID only; the platform never claims two
    lots are genetically equivalent.
  * missing data is reported as unknown, never invented.
"""
from __future__ import annotations

import math
from datetime import date, datetime
from typing import Optional

# ---- network-local configuration (documented, adjustable) ---------------
SINGLE_BANK_WATCH_QUANTITY = 25.0    # kg-equivalent, network local
CRITICAL_QUANTITY = 5.0              # kg-equivalent, network local
VIABILITY_STALE_MONTHS = 24
CRITICAL_MARGIN = {"temperature": 5.0, "humidity": 10.0}

CONDITION_SCORE = {"good": 25, "fair": 15, "poor": 5, "unknown": 5}


def months_between(a: date, b: date) -> int:
    return (b.year - a.year) * 12 + (b.month - a.month)


def compute_lot_risk_flag(lot, varieties_bank_counts: dict[int, int], today: date):
    """Return (risk_flag, reason) for a seed lot using the documented rules."""
    reasons: list[str] = []
    flag = "none"

    cond = (lot.condition or "unknown").lower()
    if cond == "poor":
        reasons.append("Condition recorded as 'poor' (rule: condition==poor -> priority)")
        flag = "priority"
    if lot.quantity is not None and lot.quantity <= CRITICAL_QUANTITY:
        reasons.append(
            f"Quantity {lot.quantity:g} {lot.unit} is at or below the network-local "
            f"critical quantity threshold of {CRITICAL_QUANTITY:g} (rule b)")
        flag = "priority"

    single_bank = varieties_bank_counts.get(lot.variety_id, 1) <= 1
    if flag != "priority" and single_bank and (lot.quantity or 0) <= SINGLE_BANK_WATCH_QUANTITY:
        reasons.append(
            f"Variety is held at only ONE bank in the network and total stock is at or "
            f"below {SINGLE_BANK_WATCH_QUANTITY:g} (rule c)")
        flag = "priority"

    if flag == "none":
        if cond in ("fair", "unknown"):
            reasons.append(f"Condition recorded as '{cond}'")
            flag = "watch"
        if lot.germination_rate is None:
            reasons.append("Germination rate has never been tested (recorded as unknown)")
            flag = "watch"
        elif lot.viability_test_date and months_between(lot.viability_test_date, today) > VIABILITY_STALE_MONTHS:
            reasons.append(
                f"Last viability test ({lot.viability_test_date.isoformat()}) is older than "
                f"{VIABILITY_STALE_MONTHS} months")
            flag = "watch"
        if flag == "none" and single_bank:
            reasons.append("Variety is held at only ONE bank in the network")
            flag = "watch"

    if not reasons:
        reasons.append("No local risk rule triggered")
    return flag, "; ".join(reasons)


def evaluate_reading(metric: str, value: float, min_value: float, max_value: float):
    """Return (severity_or_None, message, recommended_action) for one reading."""
    if min_value <= value <= max_value:
        return None, "", ""
    if metric == "temperature":
        unit = "°C"
        action = ("Inspect the storage area, verify the sensor reading with a second "
                  "thermometer and check ventilation or cooling equipment.")
    else:
        unit = "%"
        action = ("Inspect the storage area for dampness, check desiccants/ventilation "
                  "and verify the sensor reading with a separate hygrometer.")
    margin = CRITICAL_MARGIN.get(metric, 1.0)
    outside = max(min_value - value, value - max_value)
    severity = "critical" if outside > margin else "warning"
    side = "above" if value > max_value else "below"
    msg = (f"{metric.title()} {value:.1f}{unit} is {side} the configured range "
           f"{min_value:g}–{max_value:g}{unit} by {outside:.1f}{unit}.")
    return severity, msg, action


# ---------------------------------------------------------------- helpers --
def haversine_km(lat1, lon1, lat2, lon2) -> Optional[float]:
    """Great-circle distance in km, or None when coordinates are unavailable."""
    if None in (lat1, lon1, lat2, lon2):
        return None
    r = 6371.0
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dp = p2 - p1
    dl = math.radians(lon2 - lon1)
    a = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return round(2 * r * math.asin(math.sqrt(a)), 1)


def proximity_points(distance_km: Optional[float]) -> tuple[float, str]:
    if distance_km is None:
        return 8.0, "Location data unavailable for this bank — proximity not scored (neutral 8/25)"
    if distance_km <= 25:
        return 25.0, f"Close by: {distance_km} km away (25/25)"
    if distance_km <= 75:
        return 18.0, f"Nearby: {distance_km} km away (18/25)"
    if distance_km <= 200:
        return 12.0, f"Regional: {distance_km} km away (12/25)"
    return 6.0, f"Distant: {distance_km} km away (6/25)"


def condition_points(lot) -> tuple[float, list[str]]:
    pts = float(CONDITION_SCORE.get((lot.condition or "unknown").lower(), 5))
    notes = [f"Recorded condition '{lot.condition or 'unknown'}' ({pts:g}/25)"]
    if lot.germination_rate is not None:
        pts += 10
        notes.append(f"Germination rate recorded: {lot.germination_rate:g}% (+10)")
    else:
        notes.append("Germination rate never tested — reported as unknown (+0)")
    return pts, notes


def rank_matches(request, lots, requesting_bank) -> list[dict]:
    """Rank candidate donor lots for a rescue request. Pure function, explainable."""
    results = []
    for lot in lots:
        available = lot.available_quantity
        avail_pts = min(1.0, available / request.required_quantity) * 40.0
        cond_pts, cond_notes = condition_points(lot)
        dist = haversine_km(
            requesting_bank.latitude, requesting_bank.longitude,
            lot.bank.latitude, lot.bank.longitude)
        prox_pts, prox_note = proximity_points(dist)
        total = round(avail_pts + cond_pts + prox_pts, 1)

        reasons = [
            f"Same recorded variety: '{lot.variety.name}' "
            f"(matched by variety record only — genetic equivalence is NOT claimed "
            f"unless both banks' records are verified)",
            f"Available at donor: {available:g} {lot.unit} of {request.required_quantity:g} "
            f"{request.unit} requested ({avail_pts:.1f}/40)",
            *cond_notes,
            prox_note,
        ]
        warnings = []
        if lot.germination_rate is None:
            warnings.append("Donor lot has never had a germination test — viability unknown.")
        if (lot.condition or "unknown") in ("poor", "unknown"):
            warnings.append(
                f"Donor lot condition is '{lot.condition}' — confirm physical condition "
                f"before dispatch.")
        if available < request.required_quantity:
            warnings.append(
                f"Donor stock ({available:g} {lot.unit}) is short of the requested "
                f"{request.required_quantity:g} {lot.unit}.")
        if dist is None:
            warnings.append("Donor bank has no coordinates — travel distance unknown.")

        results.append({
            "lot": lot,
            "score": total,
            "distance_km": dist,
            "available_quantity": available,
            "reasons": reasons,
            "warnings": warnings,
            "breakdown": {
                "availability": round(avail_pts, 1),
                "condition_information": round(cond_pts, 1),
                "proximity": round(prox_pts, 1),
                "total": total,
            },
        })
    results.sort(key=lambda r: (-r["score"], r["distance_km"] if r["distance_km"] is not None else 9e9))
    return results


# ------------------------------------------------- simulation scenarios ---
SCENARIOS = {
    "humidity_spike": {
        "label": "Sudden humidity spike",
        "description": ("Relative humidity rises sharply, for example after heavy rain or a "
                        "ventilation failure. Higher humidity can encourage mould and reduce "
                        "seed viability over time."),
        "base_risk": 25,
        "delta_temperature": (0.0, 1.5),
        "delta_humidity": (14.0, 24.0),
        "category": "humidity",
        "reason_category": "storage_risk",
    },
    "power_failure": {
        "label": "Power failure affecting storage",
        "description": ("Mains power is lost. Fans, dehumidifiers and coolers stop; temperature "
                        "and humidity drift towards outside conditions."),
        "base_risk": 30,
        "delta_temperature": (2.0, 5.0),
        "delta_humidity": (6.0, 14.0),
        "category": "power",
        "reason_category": "power_failure",
    },
    "flood": {
        "label": "Flooding places the bank at risk",
        "description": ("Rising water or waterlogging threatens the storage building. Seed in "
                        "affected areas may be compromised and rapid rescue or relocation is "
                        "required."),
        "base_risk": 45,
        "delta_temperature": (1.0, 3.0),
        "delta_humidity": (18.0, 30.0),
        "category": "flood",
        "reason_category": "flood",
    },
    "unsafe_sensor": {
        "label": "Sensor reports potentially unsafe conditions",
        "description": ("The storage sensor reports readings outside the configured safe range. "
                        "The reading must be verified on site before assuming damage."),
        "base_risk": 20,
        "delta_temperature": (4.0, 7.0),
        "delta_humidity": (10.0, 18.0),
        "category": "other",
        "reason_category": "equipment_failure",
    },
}


def scenario_risk_score(lot, scenario_key: str) -> tuple[int, list[str]]:
    """Documented, additive, rule-based risk score (0-100). NOT an AI model."""
    sc = SCENARIOS.get(scenario_key, SCENARIOS["unsafe_sensor"])
    score = sc["base_risk"]
    reasons = [f"Scenario base risk for '{sc['label']}': +{sc['base_risk']}"]

    cond = (lot.condition or "unknown").lower()
    if cond == "poor":
        score += 20
        reasons.append("Recorded lot condition 'poor': +20")
    elif cond == "fair":
        score += 10
        reasons.append("Recorded lot condition 'fair': +10")
    elif cond == "unknown":
        score += 10
        reasons.append("Recorded lot condition 'unknown' (treated cautiously): +10")

    if lot.germination_rate is None:
        score += 10
        reasons.append("Germination never tested — viability unknown: +10")
    elif lot.viability_test_date:
        age = months_between(lot.viability_test_date, date.today())
        if age > VIABILITY_STALE_MONTHS:
            score += 8
            reasons.append(f"Viability test is {age} months old (> {VIABILITY_STALE_MONTHS}): +8")

    if lot.risk_flag == "priority":
        score += 15
        reasons.append("Local conservation risk flag is 'priority': +15")
    elif lot.risk_flag == "watch":
        score += 8
        reasons.append("Local conservation risk flag is 'watch': +8")

    if scenario_key == "flood" and (lot.storage_location or "").lower().find("ground") >= 0:
        score += 10
        reasons.append("Lot is stored at ground level in a flood scenario: +10")

    score = max(0, min(100, score))
    band = ("high" if score >= 70 else "elevated" if score >= 40 else "low")
    reasons.append(f"Final score {score}/100 -> {band} attention band")
    return score, "; ".join(reasons)


def scenario_band(score: int) -> str:
    return "high" if score >= 70 else "elevated" if score >= 40 else "low"
