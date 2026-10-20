"""Critical inventory rules: validation, unknown germination, negative stock."""
from datetime import date

from app import models


def test_demo_seed_is_idempotent(db):
    """Re-running the seeder must not duplicate records."""
    banks_before = db.query(models.SeedBank).count()
    lots_before = db.query(models.SeedLot).count()
    from app.seed import seed_demo_data
    result = seed_demo_data(db)
    assert result["status"] == "skipped"
    assert db.query(models.SeedBank).count() == banks_before
    assert db.query(models.SeedLot).count() == lots_before


def test_create_lot_and_available_quantity(db, client):
    variety = db.query(models.SeedVariety).first()
    bank = db.query(models.SeedBank).first()
    payload = {
        "lot_code": "LOT-TEST-001", "variety_id": variety.id, "bank_id": bank.id,
        "quantity": 10.0, "unit": "kg", "condition": "good", "risk_flag": "none",
        "germination_rate": 88.0, "viability_test_date": date.today().isoformat(),
    }
    res = client.post("/api/lots", json=payload)
    assert res.status_code == 201, res.text
    body = res.json()
    assert body["available_quantity"] == 10.0
    assert body["variety_name"] == variety.name


def test_germination_without_rate_is_rejected(db, client):
    """A viability test date without a measured rate must not be accepted."""
    variety = db.query(models.SeedVariety).first()
    bank = db.query(models.SeedBank).first()
    payload = {
        "lot_code": "LOT-TEST-002", "variety_id": variety.id, "bank_id": bank.id,
        "quantity": 5.0, "unit": "kg", "condition": "good", "risk_flag": "none",
        "germination_rate": None, "viability_test_date": date.today().isoformat(),
    }
    res = client.post("/api/lots", json=payload)
    assert res.status_code == 422
    assert "germination" in res.json()["detail"].lower()


def test_duplicate_lot_code_rejected(db, client):
    lot = db.query(models.SeedLot).first()
    payload = {
        "lot_code": lot.lot_code, "variety_id": lot.variety_id, "bank_id": lot.bank_id,
        "quantity": 1.0, "unit": "kg",
    }
    res = client.post("/api/lots", json=payload)
    assert res.status_code == 409


def test_invalid_enum_rejected(db, client):
    variety = db.query(models.SeedVariety).first()
    bank = db.query(models.SeedBank).first()
    payload = {"lot_code": "LOT-TEST-003", "variety_id": variety.id,
               "bank_id": bank.id, "quantity": 1.0, "unit": "barrel"}
    res = client.post("/api/lots", json=payload)
    assert res.status_code == 422


def test_quantity_cannot_drop_below_reserved(db, client):
    lot = db.query(models.SeedLot).filter(models.SeedLot.reserved_quantity > 0).first()
    assert lot is not None, "demo data should include a reserved lot"
    res = client.patch(f"/api/lots/{lot.id}", json={"quantity": 0.5})
    assert res.status_code == 422
    assert "reserved" in res.json()["detail"].lower()


def test_reserved_lot_cannot_be_deleted(db, client):
    lot = db.query(models.SeedLot).filter(models.SeedLot.reserved_quantity > 0).first()
    res = client.delete(f"/api/lots/{lot.id}")
    assert res.status_code == 409


def test_risk_flags_are_computed_with_reasons(db):
    """Every lot must carry a non-empty, explainable risk flag reason."""
    for lot in db.query(models.SeedLot).all():
        assert lot.risk_flag in models.RISK_FLAG_VALUES
        assert lot.risk_flag_reason, f"{lot.lot_code} has no risk reason"


def test_untested_germination_stays_unknown(db):
    untested = db.query(models.SeedLot).filter(models.SeedLot.germination_rate.is_(None)).all()
    assert untested, "demo data should include untested lots"
    for lot in untested:
        assert lot.viability_test_date is None
        assert "never tested" in (lot.risk_flag_reason or "").lower() or \
               lot.risk_flag in ("watch", "priority")
