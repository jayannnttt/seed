"""Seed Rescue Network: matching, state machine, inventory safety."""
from app import models


def _first_variety_with_alternate_stock(db):
    """Find a variety held at 2+ banks so the matcher has candidates."""
    from sqlalchemy import func
    rows = (db.query(models.SeedLot.variety_id,
                     func.count(func.distinct(models.SeedLot.bank_id)))
            .group_by(models.SeedLot.variety_id).all())
    for vid, bank_count in rows:
        if bank_count >= 2:
            return vid
    return None


def test_match_requires_same_variety_and_different_bank(db):
    vid = _first_variety_with_alternate_stock(db)
    assert vid, "demo data should hold some variety at 2+ banks"
    requesting_bank = db.query(models.SeedBank).first()
    res = client_search(db, vid, requesting_bank.id)
    assert res["match_count"] >= 1
    for m in res["matches"]:
        assert m["bank_id"] != requesting_bank.id
        assert m["available_quantity"] > 0
        assert m["reasons"], "every match must explain why it was recommended"
        assert "genetic equivalence is NOT claimed" in m["reasons"][0]


def client_search(db, variety_id, bank_id):
    from fastapi.testclient import TestClient
    from app.main import app
    from app import database

    def _override():
        yield db

    app.dependency_overrides[database.get_db] = _override
    try:
        with TestClient(app) as c:
            res = c.post("/api/rescue/search", json={
                "variety_id": variety_id, "requesting_bank_id": bank_id,
                "required_quantity": 2.0, "unit": "kg"})
            assert res.status_code == 200, res.text
            return res.json()
    finally:
        app.dependency_overrides.clear()


def test_full_rescue_workflow_updates_inventory(client, db):
    vid = _first_variety_with_alternate_stock(db)
    requesting = db.query(models.SeedBank).filter(models.SeedBank.id != 1).first()

    # 1. create request
    res = client.post("/api/rescue/requests", json={
        "variety_id": vid, "requesting_bank_id": requesting.id,
        "required_quantity": 2.0, "unit": "kg", "urgency": "critical",
        "reason_category": "flood", "reason_note": "test"})
    assert res.status_code == 201, res.text
    req = res.json()
    rid = req["id"]
    assert req["status"] == "pending"

    # 2. find matches
    matches = client.get(f"/api/rescue/matches/{rid}").json()["matches"]
    assert matches, "expected at least one donor match"
    donor = matches[0]

    # 3. proposal must NOT change stock
    lot_before = db.get(models.SeedLot, donor["lot_id"])
    qty_before = lot_before.quantity
    reserved_before = lot_before.reserved_quantity or 0.0
    res = client.post(f"/api/rescue/requests/{rid}/proposal", json={
        "donor_lot_id": donor["lot_id"], "transfer_quantity": 2.0})
    assert res.status_code == 200, res.text
    db.expire_all()
    assert lot_before.quantity == qty_before
    assert lot_before.reserved_quantity == reserved_before

    # 4. approve reserves but does not deduct
    res = client.post(f"/api/rescue/requests/{rid}/approve")
    assert res.status_code == 200, res.text
    db.expire_all()
    assert lot_before.quantity == qty_before
    assert abs(lot_before.reserved_quantity - (reserved_before + 2.0)) < 1e-6
    assert lot_before.available_quantity == qty_before - reserved_before - 2.0

    # 5. approve twice must fail (no double reservation)
    res = client.post(f"/api/rescue/requests/{rid}/approve")
    assert res.status_code == 409

    # 6. dispatch
    res = client.post(f"/api/rescue/requests/{rid}/dispatch")
    assert res.status_code == 200
    assert res.json()["status"] == "dispatched"

    # 7. receive deducts donor and creates the receiving lot
    res = client.post(f"/api/rescue/requests/{rid}/receive")
    assert res.status_code == 200, res.text
    db.expire_all()
    assert abs(lot_before.quantity - (qty_before - 2.0)) < 1e-6
    assert abs(lot_before.reserved_quantity - reserved_before) < 1e-6

    receiving = db.query(models.SeedLot).filter(
        models.SeedLot.bank_id == requesting.id,
        models.SeedLot.variety_id == vid,
        models.SeedLot.lot_code.like(f"TRF-{req['request_code']}%")).first()
    assert receiving is not None
    assert abs(receiving.quantity - 2.0) < 1e-6

    # 8. cannot receive twice
    res = client.post(f"/api/rescue/requests/{rid}/receive")
    assert res.status_code == 409

    # 9. transfer audit record exists
    transfers = client.get("/api/rescue/transfers").json()
    assert any(t["request_id"] == rid and t["status"] == "received" for t in transfers)


def test_proposal_over_available_quantity_rejected(client, db):
    vid = _first_variety_with_alternate_stock(db)
    requesting = db.query(models.SeedBank).filter(models.SeedBank.id != 1).first()
    req = client.post("/api/rescue/requests", json={
        "variety_id": vid, "requesting_bank_id": requesting.id,
        "required_quantity": 9999.0, "unit": "kg"}).json()

    matches = client.get(f"/api/rescue/matches/{req['id']}").json()["matches"]
    assert matches, "shortfalls are allowed — the ranker still lists smaller donors"
    big = matches[0]
    res = client.post(f"/api/rescue/requests/{req['id']}/proposal", json={
        "donor_lot_id": big["lot_id"], "transfer_quantity": 99999.0})
    assert res.status_code == 422


def test_wrong_variety_proposal_rejected(client, db):
    """A donor lot from a different variety must be refused."""
    variety_a = db.query(models.SeedVariety).first()
    other = db.query(models.SeedVariety).filter(
        models.SeedVariety.id != variety_a.id).first()
    requesting = db.query(models.SeedBank).filter(models.SeedBank.id != 1).first()
    req = client.post("/api/rescue/requests", json={
        "variety_id": variety_a.id, "requesting_bank_id": requesting.id,
        "required_quantity": 1.0, "unit": "kg"}).json()
    wrong_lot = db.query(models.SeedLot).filter(
        models.SeedLot.variety_id == other.id,
        models.SeedLot.bank_id != requesting.id).first()
    res = client.post(f"/api/rescue/requests/{req['id']}/proposal", json={
        "donor_lot_id": wrong_lot.id, "transfer_quantity": 0.5})
    assert res.status_code == 422


def test_reject_releases_reservation(client, db):
    vid = _first_variety_with_alternate_stock(db)
    requesting = db.query(models.SeedBank).filter(models.SeedBank.id != 1).first()
    req = client.post("/api/rescue/requests", json={
        "variety_id": vid, "requesting_bank_id": requesting.id,
        "required_quantity": 1.0, "unit": "kg"}).json()
    matches = client.get(f"/api/rescue/matches/{req['id']}").json()["matches"]
    donor_lot_id = matches[0]["lot_id"]
    baseline_reserved = (db.get(models.SeedLot, donor_lot_id).reserved_quantity or 0.0)
    client.post(f"/api/rescue/requests/{req['id']}/proposal",
                json={"donor_lot_id": donor_lot_id, "transfer_quantity": 1.0})
    client.post(f"/api/rescue/requests/{req['id']}/approve")
    lot = db.get(models.SeedLot, donor_lot_id)
    assert lot.reserved_quantity >= baseline_reserved + 1.0

    res = client.post(f"/api/rescue/requests/{req['id']}/reject",
                      json={"note": "donor needs the stock locally"})
    assert res.status_code == 200
    db.expire_all()
    assert abs(lot.reserved_quantity - baseline_reserved) < 1e-6, \
        "rejection must release exactly the reservation it created"
    assert lot.quantity > 0


def test_self_donation_rejected(client, db):
    vid = _first_variety_with_alternate_stock(db)
    requesting = db.query(models.SeedBank).first()
    req = client.post("/api/rescue/requests", json={
        "variety_id": vid, "requesting_bank_id": requesting.id,
        "required_quantity": 1.0, "unit": "kg"}).json()
    own_lot = db.query(models.SeedLot).filter(
        models.SeedLot.variety_id == vid, models.SeedLot.bank_id == requesting.id).first()
    if own_lot is None:
        return  # variety not held locally — nothing to test
    res = client.post(f"/api/rescue/requests/{req['id']}/proposal", json={
        "donor_lot_id": own_lot.id, "transfer_quantity": 0.5})
    assert res.status_code == 422
