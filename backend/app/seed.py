"""Repeatable demo dataset for SeedSathi.

Re-running this module NEVER creates duplicates: it is guarded by the
``seed_meta`` table. Run ``python -m app.seed --force`` (or call
``seed_demo_data(db, force=True)``) to wipe and regenerate the sample data.

Every record created here is flagged with ``is_demo=True`` so the UI can
label it as demonstration data.
"""
from __future__ import annotations

import os
import sys
from datetime import date, datetime, timedelta

from sqlalchemy.orm import Session

from . import models, rules, services, simulator

SEED_VERSION = "3"

BANKS = [
    dict(code="SVB-001", name="Kaveri Community Seed Bank", village="Thanjavur",
         district="Thanjavur", state="Tamil Nadu", latitude=10.7870, longitude=79.1379,
         coordinator="R. Muthulakshmi", contact_phone="+91 94430 11223",
         contact_email="kaveri.seeds@example.org",
         description="Custodian of traditional rain-fed rice and millet landraces from the "
                     "Kaveri delta since 2004.",
         established_year=2004),
    dict(code="SVB-002", name="Western Ghats Seed Sanctuary", village="Wayanad",
         district="Wayanad", state="Kerala", latitude=11.6854, longitude=76.1320,
         coordinator="P. Suresh Kumar", contact_phone="+91 98470 55321",
         contact_email="ghats.seeds@example.org",
         description="Hill-region seed bank specialising in tuber, banana and spice "
                     "varieties maintained by smallholder farmer groups.",
         established_year=2009),
    dict(code="SVB-003", name="Deccan Dryland Seed Centre", village="Anantapur",
         district="Anantapur", state="Andhra Pradesh", latitude=14.6819, longitude=77.6006,
         coordinator="B. Venkataramana", contact_phone="+91 90000 44556",
         contact_email="deccan.seeds@example.org",
         description="Dryland pulse and millet conservation focused on drought-tolerant "
                     "landraces of the Rayalaseema plateau.",
         established_year=2011),
    dict(code="SVB-004", name="Coastal Konkan Seed Vault", village="Ratnagiri",
         district="Ratnagiri", state="Maharashtra", latitude=16.9902, longitude=73.3120,
         coordinator="S. Ananya Deshmukh", contact_phone="+91 98220 77889",
         contact_email="konkan.seeds@example.org",
         description="Coastal repository for fruit, vegetable and coastal paddy varieties; "
                     "monsoon flood risk is a recurring concern.",
         established_year=2007),
    dict(code="SVB-005", name="Bundelkhand Heritage Seed Bank", village="Chhatarpur",
         district="Chhatarpur", state="Madhya Pradesh", latitude=24.9195, longitude=79.5924,
         coordinator="K. Prabha Singh", contact_phone="+91 94250 66778",
         contact_email="bundelkhand.seeds@example.org",
         description="Community seed bank conserving coarse cereals and legumes of the "
                     "Bundelkhand region, working with 40+ farmer producer groups.",
         established_year=2013),
]

VARIETIES = [
    dict(name="Kichili Samba", local_name="கிச்சிலி சம்பா", scientific_name="Oryza sativa",
         crop_category="cereal", is_indigenous=True,
         indigenous_note="Traditional aromatic short-grain rice of the Kaveri delta, "
                         "grown by farmers for over 200 years.",
         description="Short-duration aus rice suited to rain-fed lowlands; fine aromatic grain.",
         conservation_note="Maintained by 60+ custodian farmers in the delta belt.",
         origin_region="Kaveri delta, Tamil Nadu"),
    dict(name="Mappillai Samba", local_name="மாப்பிள்ளை சம்பா",
         scientific_name="Oryza sativa", crop_category="cereal", is_indigenous=True,
         indigenous_note="Red bran rice traditionally given to bridegrooms before the "
                         "wedding as a strength-building food.",
         description="Tall, long-duration red rice with high straw yield for fodder.",
         conservation_note="Height and duration make it vulnerable to modern short-variety "
                           "replacement; conserved on 30 ha.",
         origin_region="Kaveri delta, Tamil Nadu"),
    dict(name="Navara", local_name="നവര", scientific_name="Oryza sativa",
         crop_category="cereal", is_indigenous=True,
         indigenous_note="Medicinal rice of Kerala referenced in classical Ayurvedic texts.",
         description="Short-duration medicinal rice used in traditional preparations.",
         conservation_note="Fewer than 200 growers remain in the northern Kerala belt.",
         origin_region="Kerala"),
    dict(name="Ratna", local_name=None, scientific_name="Oryza sativa",
         crop_category="cereal", is_indigenous=False,
         indigenous_note=None,
         description="Improved short-duration variety released in the 1970s; retained for "
                     "comparison and cross-pollination management.",
         conservation_note=None,
         origin_region="Central Rice Research Institute release"),
    dict(name="Foxtail Millet Landrace 4", local_name="Thinai (local)",
         scientific_name="Setaria italica", crop_category="millets", is_indigenous=True,
         indigenous_note="Farmer-selected landrace maintained by dryland farmers.",
         description="Drought-tolerant small millet with stiff, compact panicles.",
         conservation_note="Genetic diversity across three village populations.",
         origin_region="Rayalaseema, Andhra Pradesh"),
    dict(name="Little Millet Kodo", local_name="Samai", scientific_name="Panicum miliaceum",
         crop_category="millets", is_indigenous=True,
         indigenous_note="Traditional small millet grown on marginal monsoon soils.",
         description="Early-maturing little millet suited to low-input systems.",
         conservation_note="Important pre-monsoon food security crop.",
         origin_region="Bundelkhand, Madhya Pradesh"),
    dict(name="Kodo Millet Traditional", local_name="Kodo", scientific_name="Paspalum scrobiculatum",
         crop_category="millets", is_indigenous=True,
         indigenous_note="Sacred harvest crop with strong traditional seed-exchange networks.",
         description="Hardy millet suited to poor soils and erratic rainfall.",
         conservation_note="Held by women's collectives in three districts.",
         origin_region="Central India"),
    dict(name="Tur (Arhar) Desi", local_name="Kalyan Red Tur",
         scientific_name="Cajanus cajan", crop_category="pulses", is_indigenous=True,
         indigenous_note="Deep-rooted red-seeded pigeon pea landrace.",
         description="Long-duration pigeon pea tolerant of drought and poor soils.",
         conservation_note="Perennial habit supports soil conservation on field bunds.",
         origin_region="Maharashtra"),
    dict(name="Rajmash HUR-15", local_name="Rajma", scientific_name="Phaseolus vulgaris",
         crop_category="pulses", is_indigenous=False,
         indigenous_note=None,
         description="Improved kidney bean selected for higher yield and uniform seed.",
         conservation_note=None, origin_region="HPKV Shimla release"),
    dict(name="Gingelly Black", local_name="Karuppu Ellu",
         scientific_name="Sesamum indicum", crop_category="oilseeds", is_indigenous=True,
         indigenous_note="Black-seeded sesame retained by temple-farm traditional systems.",
         description="Black-seeded oilseed with high oil content, used in festival foods.",
         conservation_note="Nearly displaced by white-seeded commercial varieties.",
         origin_region="Tamil Nadu"),
    dict(name="Groundnut TMV-2 (maintained)", local_name="Verkadalai",
         scientific_name="Arachis hypogaea", crop_category="oilseeds", is_indigenous=False,
         indigenous_note=None, description="Widely grown Virginia-type groundnut line.",
         conservation_note=None, origin_region="TNAU release"),
    dict(name="Brinjal Long Purple Local", local_name="Kathirikai",
         scientific_name="Solanum melongena", crop_category="vegetables", is_indigenous=True,
         indigenous_note="Village-selected long purple brinjal with hardy local adaptation.",
         description="Long purple fruiting brinjal; tolerant of local pest pressure.",
         conservation_note="Held in seed exchange by 120 home gardens.",
         origin_region="Tamil Nadu"),
    dict(name="Bitter Gourd Local Spiny", local_name="Pavakkai",
         scientific_name="Momordica charantia", crop_category="vegetables", is_indigenous=True,
         indigenous_note="Spiny bitter gourd selected by coastal farming families.",
         description="Small, intensely bitter fruiting type; climbing habit.",
         conservation_note="Coastal farmers depend on it for monsoon-season income.",
         origin_region="Konkan coast, Maharashtra"),
    dict(name="Banana Nendran Traditional", local_name="Nendran",
         scientific_name="Musa acuminata", crop_category="fruits", is_indigenous=True,
         indigenous_note="Traditional Kerala cooking banana with strong cultural ties.",
         description="Tall cooking banana propagated through traditional suckers.",
         conservation_note="Tissue-culture propagation is displacing farmer-held material.",
         origin_region="Kerala"),
]


def _lots_spec() -> list[dict]:
    """(variety_index, bank_index, qty, unit, condition, storage, harvest_year)"""
    return [
        # bank 1 – Kaveri (Tamil Nadu)
        (0, 1, 18.5, "kg", "good", "Ground floor rack A2", 2024),
        (1, 1, 9.0, "kg", "fair", "Ground floor rack A3", 2023),
        (3, 1, 42.0, "kg", "good", "Ground floor rack B1", 2024),
        (9, 1, 12.0, "kg", "good", "Ground floor rack C1", 2024),
        (11, 1, 6.5, "kg", "unknown", "Ground floor rack C2", 2024),
        # bank 2 – Western Ghats (Kerala)
        (2, 2, 14.0, "kg", "good", "Upper floor rack 1", 2024),
        (13, 2, 4.0, "kg", "fair", "Upper floor rack 2", 2023),
        (5, 2, 22.0, "kg", "good", "Upper floor rack 3", 2024),
        (9, 2, 7.5, "kg", "good", "Upper floor rack 1", 2024),
        (6, 2, 3.0, "kg", "poor", "Ground floor rack G1", 2022),
        # bank 3 – Deccan (Andhra Pradesh)
        (4, 3, 25.0, "kg", "good", "Dry room shelf 1", 2024),
        (5, 3, 11.0, "kg", "good", "Dry room shelf 2", 2024),
        (7, 3, 30.0, "kg", "fair", "Dry room shelf 1", 2023),
        (10, 3, 48.0, "kg", "good", "Dry room shelf 3", 2024),
        (4, 3, 8.0, "kg", "unknown", "Dry room shelf 4", 2024),
        # bank 4 – Coastal Konkan (Maharashtra)
        (7, 4, 16.0, "kg", "good", "Ground floor rack 1", 2024),
        (12, 4, 2.5, "kg", "unknown", "Ground floor rack 2", 2024),
        (3, 4, 35.0, "kg", "good", "First floor rack 1", 2024),
        (0, 4, 5.5, "kg", "fair", "Ground floor rack 1", 2023),
        (8, 4, 20.0, "kg", "good", "First floor rack 2", 2024),
        # bank 5 – Bundelkhand (Madhya Pradesh)
        (5, 5, 19.0, "kg", "good", "Ventilated store room", 2024),
        (6, 5, 27.0, "kg", "good", "Ventilated store room", 2024),
        (4, 5, 13.5, "kg", "good", "Ventilated store room", 2024),
        (10, 5, 38.0, "kg", "fair", "Ventilated store room", 2023),
        (7, 5, 4.5, "kg", "good", "Ventilated store room", 2024),
        (0, 5, 7.0, "kg", "unknown", "Ventilated store room", 2024),
        (11, 5, 3.5, "kg", "good", "Ventilated store room", 2024),
    ]


def _germination(variety_index: int, lot_index: int):
    """Return (rate, test_date) or (None, None) — never invent a test result."""
    # ~25% of lots deliberately have NO recorded germination test.
    if (variety_index * 7 + lot_index * 3) % 4 == 0:
        return None, None
    rate = 62.0 + ((variety_index * 13 + lot_index * 11) % 32)
    age_months = 6 + ((variety_index + lot_index * 5) % 40)
    tested = date.today() - timedelta(days=30 * age_months)
    return round(rate, 1), tested


def seed_demo_data(db: Session, force: bool = False) -> dict:
    meta = db.query(models.SeedMeta).filter(models.SeedMeta.key == "demo_seed_version").first()
    if meta and meta.value == SEED_VERSION and not force:
        return {"status": "skipped", "detail": "Demo data already seeded (use force to reset)."}

    # wipe everything — demo reset returns the database to a known state
    for table in (models.ActivityLog, models.SeedTransfer, models.RescueRequest,
                  models.Alert, models.AlertThreshold, models.SensorReading,
                  models.SensorDevice, models.SeedLot, models.SeedVariety,
                  models.SeedBank, models.SeedMeta):
        db.query(table).delete()
    db.commit()

    banks = []
    for spec in BANKS:
        b = models.SeedBank(**spec, is_demo=True)
        db.add(b)
        banks.append(b)
    db.flush()

    varieties = []
    for spec in VARIETIES:
        v = models.SeedVariety(**spec, is_demo=True)
        db.add(v)
        varieties.append(v)
    db.flush()

    lots = []
    for idx, (vi, bi, qty, unit, condition, storage, harvest_year) in enumerate(_lots_spec()):
        variety, bank = varieties[vi], banks[bi - 1]
        rate, tested = _germination(vi, idx)
        lot = models.SeedLot(
            lot_code=f"LOT-{vi + 1:02d}-{bi:02d}-{idx + 1:03d}",
            variety_id=variety.id, bank_id=bank.id, quantity=qty, reserved_quantity=0.0,
            unit=unit, source_location=bank.village,
            harvest_date=date(harvest_year, 10 + (idx % 3), 5 + (idx % 20)),
            germination_rate=rate, viability_test_date=tested,
            storage_location=storage, condition=condition, risk_flag="none",
            risk_flag_reason=None,
            notes="Demonstration record — sample data for the SeedSathi hackathon demo.",
            is_demo=True)
        db.add(lot)
        lots.append(lot)
    db.flush()

    # thresholds: configure BEFORE generating readings so breaches are captured.
    # Bank 1 stays on the system example defaults; the coastal bank (SVB-004)
    # gets a tighter humidity band set by its operator.
    th4 = db.query(models.SeedBank).filter(models.SeedBank.code == "SVB-004").first()
    if th4:
        db.add(models.AlertThreshold(bank_id=th4.id, metric="humidity",
                                     min_value=40.0, max_value=60.0,
                                     note="Coastal bank — tighter humidity band set by "
                                          "the network operator (example setting)."))
    db.flush()

    # sensors + 48 hours of simulated readings per bank (alerts evaluated)
    for bank in banks:
        d = simulator.ensure_device(db, bank)
        simulator.simulate_series(db, bank, steps=48, interval_minutes=60,
                                  end_time=services.utcnow(), seed=bank.id * 17)
    db.flush()

    # one offline sensor for the sensor-offline workflow
    d5 = db.query(models.SensorDevice).join(models.SeedBank).filter(
        models.SeedBank.code == "SVB-005").first()
    if d5:
        d5.status = "offline"
    db.flush()

    # one resolved alert for history
    b1 = db.query(models.SeedBank).filter(models.SeedBank.code == "SVB-001").first()
    if b1:
        db.add(models.Alert(
            alert_code=services.next_code(db, models.Alert, "ALT"),
            bank_id=b1.id, category="temperature", metric="temperature",
            reading_value=33.4, threshold_value="18–32", severity="warning", status="resolved",
            message="Temperature 33.4°C was above the configured range 18–32°C.",
            recommended_action="Inspect the storage area and verify the sensor reading.",
            affected_lot_codes=None,
            detected_at=services.utcnow() - timedelta(days=6),
            acknowledged_at=services.utcnow() - timedelta(days=6, hours=-1),
            resolved_at=services.utcnow() - timedelta(days=6, hours=-2),
            resolution_note="Resolved after inspection: exhaust fan cleaned, reading "
                            "returned to normal range.",
            is_simulated=True, is_demo=True))
    db.flush()

    # demo rescue request already in flight: bank 4 requests Kichili Samba
    kichili = next(v for v in varieties if v.name == "Kichili Samba")
    db.add(models.RescueRequest(
        request_code="RSQ-0001", variety_id=kichili.id, requesting_bank_id=th4.id if th4 else banks[3].id,
        donor_bank_id=b1.id, donor_lot_id=lots[0].id, required_quantity=5.0,
        transfer_quantity=5.0, unit="kg", urgency="high", reason_category="flood",
        reason_note="Monsoon flooding damaged lower storage racks; reserve stock requested.",
        status="approved", scenario="flood",
        status_note="Approved — 5 kg reserved on donor lot LOT-01-01-001 (demo).",
        is_demo=True,
        created_at=services.utcnow() - timedelta(days=2),
        updated_at=services.utcnow() - timedelta(days=1)))
    db.flush()

    demo_request = db.query(models.RescueRequest).filter_by(request_code="RSQ-0001").first()
    if demo_request:
        db.add(models.SeedTransfer(
            request_id=demo_request.id, donor_bank_id=b1.id,
            receiving_bank_id=th4.id if th4 else banks[3].id,
            donor_lot_id=lots[0].id, variety_id=kichili.id, quantity=5.0, unit="kg",
            status="approved", note="Demo transfer sitting in the approved state."))

    # reserve the demo reservation so the numbers are consistent
    lots[0].reserved_quantity = 5.0

    for bank in banks:
        services.log_activity(
            db, "bank", bank.id, "seeded",
            f"Demo seed bank '{bank.name}' loaded with sample inventory.",
            bank_id=bank.id)

    db.add(models.SeedMeta(key="demo_seed_version", value=SEED_VERSION))
    db.commit()

    changed = services.refresh_risk_flags(db)
    db.commit()
    return {"status": "seeded", "banks": len(banks), "varieties": len(varieties),
            "lots": len(lots), "risk_flags_computed": changed}


if __name__ == "__main__":  # pragma: no cover
    from .database import SessionLocal
    db = SessionLocal()
    force = "--force" in sys.argv
    print(seed_demo_data(db, force=force))
