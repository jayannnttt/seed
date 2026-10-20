"""Seed Rescue Network: match donors, propose, approve, dispatch, receive.

Inventory safety rules enforced here:
  * available = quantity - reserved_quantity (never negative)
  * stock is only RESERVED when a proposal is approved (never silently
    subtracted when a request or proposal is created)
  * stock is only DEDUCTED when a transfer is marked received
  * every state change validates the current status, so repeated or
    concurrent actions cannot double-spend or drive stock negative
"""
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from ..database import get_db
from .. import models, rules, schemas, services

router = APIRouter(prefix="/api/rescue", tags=["seed rescue"])

TRANSITIONS = {
    "pending": {"approved", "rejected"},
    "approved": {"dispatched", "rejected"},
    "dispatched": {"received"},
    "received": set(),
    "rejected": set(),
}

STATUS_LABELS = {
    "pending": "Pending — awaiting donor approval",
    "approved": "Approved — stock reserved at the donor bank",
    "dispatched": "Dispatched — seeds in transit",
    "received": "Received — inventory updated",
    "rejected": "Rejected — no transfer took place",
}


def _get_request(db: Session, request_id: int) -> models.RescueRequest:
    req = db.get(models.RescueRequest, request_id)
    if not req:
        raise HTTPException(status_code=404, detail=f"Rescue request {request_id} not found")
    return req


def _require_transition(req: models.RescueRequest, target: str) -> None:
    allowed = TRANSITIONS.get(req.status, set())
    if target not in allowed:
        raise HTTPException(
            status_code=409,
            detail=(f"Request {req.request_code} is '{STATUS_LABELS[req.status]}'. "
                    f"It cannot move to '{target}' from here."))


def _candidate_lots(db: Session, req: models.RescueRequest):
    """Lots of the same recorded variety at other banks with free stock."""
    return (
        db.query(models.SeedLot)
        .join(models.SeedVariety, models.SeedLot.variety_id == models.SeedVariety.id)
        .filter(models.SeedLot.variety_id == req.variety_id,
                models.SeedLot.bank_id != req.requesting_bank_id,
                models.SeedLot.quantity > 0)
        .all())


def _compute_matches(db: Session, req: models.RescueRequest) -> list[dict]:
    candidates = [l for l in _candidate_lots(db, req) if l.available_quantity > 0]
    ranked = rules.rank_matches(req, candidates, req.requesting_bank)
    out = []
    for r in ranked:
        lot: models.SeedLot = r["lot"]
        out.append({
            "lot_id": lot.id,
            "lot_code": lot.lot_code,
            "bank_id": lot.bank.id,
            "bank_name": lot.bank.name,
            "bank_location": lot.bank.location,
            "bank_coordinator": lot.bank.coordinator,
            "bank_phone": lot.bank.contact_phone,
            "quantity": lot.quantity,
            "reserved_quantity": lot.reserved_quantity,
            "available_quantity": r["available_quantity"],
            "unit": lot.unit,
            "condition": lot.condition,
            "germination_rate": lot.germination_rate,
            "viability_test_date": lot.viability_test_date.isoformat()
                if lot.viability_test_date else None,
            "storage_location": lot.storage_location,
            "updated_at": lot.updated_at.isoformat(),
            "distance_km": r["distance_km"],
            "score": r["score"],
            "score_breakdown": r["breakdown"],
            "reasons": r["reasons"],
            "warnings": r["warnings"],
        })
    return out


@router.post("/search")
def search_matches(payload: schemas.RescueCreate, db: Session = Depends(get_db)):
    """Dry-run the matching algorithm without creating a request."""
    variety = db.get(models.SeedVariety, payload.variety_id)
    bank = db.get(models.SeedBank, payload.requesting_bank_id)
    if not variety:
        raise HTTPException(status_code=422, detail="variety_id does not exist")
    if not bank:
        raise HTTPException(status_code=422, detail="requesting_bank_id does not exist")
    req = models.RescueRequest(
        request_code="DRYRUN", variety_id=variety.id, requesting_bank_id=bank.id,
        required_quantity=payload.required_quantity, unit=payload.unit)
    req.variety = variety
    req.requesting_bank = bank
    matches = _compute_matches(db, req)
    return {
        "variety": variety.name,
        "requesting_bank": services.bank_brief(bank),
        "required_quantity": payload.required_quantity,
        "unit": payload.unit,
        "matches": matches,
        "match_count": len(matches),
        "method": rules.rank_matches.__doc__,
    }


@router.get("/matches/{request_id}")
def request_matches(request_id: int, db: Session = Depends(get_db)):
    req = _get_request(db, request_id)
    return {"request": services.rescue_out(req), "matches": _compute_matches(db, req),
            "status_labels": STATUS_LABELS}


@router.post("/requests", response_model=schemas.RescueOut, status_code=201)
def create_request(payload: schemas.RescueCreate, db: Session = Depends(get_db)):
    variety = db.get(models.SeedVariety, payload.variety_id)
    bank = db.get(models.SeedBank, payload.requesting_bank_id)
    if not variety:
        raise HTTPException(status_code=422, detail="variety_id does not exist")
    if not bank:
        raise HTTPException(status_code=422, detail="requesting_bank_id does not exist")
    if payload.required_quantity <= 0:
        raise HTTPException(status_code=422, detail="required_quantity must be greater than zero")

    req = models.RescueRequest(
        request_code=services.next_code(db, models.RescueRequest, "RSQ", "request_code"),
        variety_id=variety.id, requesting_bank_id=bank.id,
        required_quantity=payload.required_quantity, unit=payload.unit,
        urgency=payload.urgency, reason_category=payload.reason_category,
        reason_note=payload.reason_note, scenario=payload.scenario,
        status="pending", is_demo=False)
    db.add(req)
    db.flush()
    services.log_activity(
        db, "rescue", req.id, "created",
        f"Rescue request {req.request_code} opened by {bank.name}: "
        f"{payload.required_quantity:g} {payload.unit} of '{variety.name}' "
        f"(urgency: {payload.urgency}, reason: {payload.reason_category})",
        bank_id=bank.id)
    db.commit()
    db.refresh(req)
    return services.rescue_out(req)


@router.get("/requests", response_model=list[schemas.RescueOut])
def list_requests(status: Optional[str] = None, bank_id: Optional[int] = None,
                  db: Session = Depends(get_db)):
    q = db.query(models.RescueRequest)
    if status:
        q = q.filter(models.RescueRequest.status == status)
    if bank_id:
        q = q.filter((models.RescueRequest.requesting_bank_id == bank_id) |
                     (models.RescueRequest.donor_bank_id == bank_id))
    return [services.rescue_out(r) for r in
            q.order_by(models.RescueRequest.updated_at.desc()).all()]


@router.get("/requests/{request_id}")
def get_request(request_id: int, db: Session = Depends(get_db)):
    req = _get_request(db, request_id)
    transfers = [services.transfer_out(t) for t in req.transfers]
    return {
        "request": services.rescue_out(req),
        "transfers": transfers,
        "status_labels": STATUS_LABELS,
        "next_actions": sorted(list(TRANSITIONS.get(req.status, set()))),
        "reason": rules.SCENARIOS.get(req.scenario, {}).get("description")
            if req.scenario else None,
    }


@router.post("/requests/{request_id}/proposal", response_model=schemas.RescueOut)
def create_proposal(request_id: int, payload: schemas.ProposalCreate,
                    db: Session = Depends(get_db)):
    """Attach a donor lot to a request. NO stock changes hands here."""
    req = _get_request(db, request_id)
    if req.status != "pending" or req.donor_lot_id is not None:
        raise HTTPException(
            status_code=409,
            detail=(f"Request {req.request_code} already has a donor proposal "
                    f"(status: {req.status})."))
    lot = db.get(models.SeedLot, payload.donor_lot_id)
    if not lot:
        raise HTTPException(status_code=404, detail="Donor lot not found")
    if lot.variety_id != req.variety_id:
        raise HTTPException(
            status_code=422,
            detail=(f"Lot '{lot.lot_code}' is a different variety "
                    f"('{lot.variety.name}') from the requested one."))
    if lot.bank_id == req.requesting_bank_id:
        raise HTTPException(status_code=422,
                            detail="The requesting bank cannot donate to itself.")
    if payload.transfer_quantity > lot.available_quantity:
        raise HTTPException(
            status_code=422,
            detail=(f"Requested {payload.transfer_quantity:g} {lot.unit} but only "
                    f"{lot.available_quantity:g} {lot.unit} is free at "
                    f"'{lot.bank.name}' ({lot.quantity:g} total, "
                    f"{lot.reserved_quantity:g} already reserved)."))

    req.donor_bank_id = lot.bank_id
    req.donor_lot_id = lot.id
    req.transfer_quantity = payload.transfer_quantity
    req.unit = lot.unit
    req.status_note = (f"Proposal created: donor '{lot.bank.name}' lot '{lot.lot_code}'. "
                       f"Stock is NOT reserved until the donor bank approves.")
    services.log_activity(
        db, "rescue", req.id, "proposed",
        f"Donor proposed for {req.request_code}: {lot.bank.name} "
        f"(lot {lot.lot_code}, {payload.transfer_quantity:g} {lot.unit}) — "
        f"awaiting donor approval",
        bank_id=req.requesting_bank_id)
    db.commit()
    db.refresh(req)
    return services.rescue_out(req)


@router.post("/requests/{request_id}/approve", response_model=schemas.RescueOut)
def approve_request(request_id: int, db: Session = Depends(get_db)):
    req = _get_request(db, request_id)
    _require_transition(req, "approved")
    if req.donor_lot_id is None or req.transfer_quantity is None:
        raise HTTPException(status_code=409,
                            detail="Select a donor lot and quantity before approval.")
    lot = db.get(models.SeedLot, req.donor_lot_id)
    if req.transfer_quantity > lot.available_quantity:
        raise HTTPException(
            status_code=422,
            detail=(f"Only {lot.available_quantity:g} {lot.unit} is still free at "
                    f"'{lot.bank.name}'. The proposal can no longer be approved — "
                    f"choose another donor lot."))
    lot.reserved_quantity = (lot.reserved_quantity or 0.0) + req.transfer_quantity
    req.status = "approved"
    req.status_note = (f"Approved by {lot.bank.name}. {req.transfer_quantity:g} "
                       f"{lot.unit} reserved on lot {lot.lot_code}.")
    transfer = models.SeedTransfer(
        request_id=req.id, donor_bank_id=lot.bank_id,
        receiving_bank_id=req.requesting_bank_id, donor_lot_id=lot.id,
        variety_id=req.variety_id, quantity=req.transfer_quantity, unit=req.unit,
        status="approved", note=f"Reservation created on lot {lot.lot_code}")
    db.add(transfer)
    services.log_activity(
        db, "rescue", req.id, "approved",
        f"{req.request_code} approved by {lot.bank.name}: "
        f"{req.transfer_quantity:g} {req.unit} reserved (stock still held at donor)",
        bank_id=lot.bank_id)
    db.commit()
    db.refresh(req)
    return services.rescue_out(req)


@router.post("/requests/{request_id}/dispatch", response_model=schemas.RescueOut)
def dispatch_request(request_id: int, db: Session = Depends(get_db)):
    req = _get_request(db, request_id)
    _require_transition(req, "dispatched")
    req.status = "dispatched"
    req.status_note = f"Dispatched by {req.donor_bank.name} — seeds in transit."
    for t in req.transfers:
        if t.status in ("approved", "dispatched"):
            t.status = "dispatched"
            t.dispatched_at = services.utcnow()
    services.log_activity(
        db, "rescue", req.id, "dispatched",
        f"{req.request_code} dispatched by {req.donor_bank.name} "
        f"({req.transfer_quantity:g} {req.unit} of '{req.variety.name}')",
        bank_id=req.donor_bank_id)
    db.commit()
    db.refresh(req)
    return services.rescue_out(req)


@router.post("/requests/{request_id}/receive", response_model=schemas.RescueOut)
def receive_request(request_id: int, db: Session = Depends(get_db)):
    """Mark the transfer received: deduct donor stock, create receiving lot."""
    req = _get_request(db, request_id)
    _require_transition(req, "received")
    lot = db.get(models.SeedLot, req.donor_lot_id)
    qty = req.transfer_quantity

    if lot is None or lot.quantity < qty or (lot.reserved_quantity or 0) < qty:
        available = lot.available_quantity if lot else 0.0
        raise HTTPException(
            status_code=422,
            detail=(f"Cannot complete receipt: donor lot no longer holds the reserved "
                    f"stock (free: {available:g} {req.unit}). The request must be "
                    f"reviewed manually."))

    # 1) deduct at the donor
    lot.quantity = round(lot.quantity - qty, 3)
    lot.reserved_quantity = round(max((lot.reserved_quantity or 0.0) - qty, 0.0), 3)
    lot.updated_at = services.utcnow()

    # 2) create / grow the receiving lot
    receiving = (
        db.query(models.SeedLot)
        .filter(models.SeedLot.bank_id == req.requesting_bank_id,
                models.SeedLot.variety_id == req.variety_id,
                models.SeedLot.lot_code.like(f"TRF-{req.request_code}%"))
        .first())
    if receiving is None:
        receiving = models.SeedLot(
            lot_code=f"TRF-{req.request_code}", variety_id=req.variety_id,
            bank_id=req.requesting_bank_id, quantity=qty, reserved_quantity=0.0,
            unit=req.unit, condition="unknown", risk_flag="none",
            storage_location="Intake after rescue transfer",
            notes=(f"Received via Seed Rescue Network request {req.request_code} "
                   f"from {req.donor_bank.name} (lot {lot.lot_code}). Condition on "
                   f"arrival not yet assessed — record it after inspection."),
            is_demo=False)
        db.add(receiving)
        db.flush()
    else:
        receiving.quantity = round(receiving.quantity + qty, 3)
        receiving.updated_at = services.utcnow()

    req.status = "received"
    req.status_note = (f"Received by {req.requesting_bank.name}. Donor lot "
                       f"{lot.lot_code} reduced by {qty:g} {req.unit}; receiving lot "
                       f"{receiving.lot_code} now holds {receiving.quantity:g} {req.unit}.")
    now = services.utcnow()
    for t in req.transfers:
        if t.status in ("dispatched", "approved"):
            t.status = "received"
            t.received_at = now
            t.receiving_lot_id = receiving.id
            t.dispatched_at = t.dispatched_at or now

    services.log_activity(
        db, "rescue", req.id, "received",
        f"{req.request_code} RECEIVED by {req.requesting_bank.name}: "
        f"{qty:g} {req.unit} of '{req.variety.name}' moved from "
        f"{req.donor_bank.name}. Inventory updated at both banks.",
        bank_id=req.requesting_bank_id)
    services.refresh_risk_flags(db)
    db.commit()
    db.refresh(req)
    return services.rescue_out(req)


@router.post("/requests/{request_id}/reject", response_model=schemas.RescueOut)
def reject_request(request_id: int, payload: schemas.AlertAction,
                   db: Session = Depends(get_db)):
    req = _get_request(db, request_id)
    _require_transition(req, "rejected")
    released = 0.0
    if req.status == "approved" and req.donor_lot_id and req.transfer_quantity:
        lot = db.get(models.SeedLot, req.donor_lot_id)
        released = min(lot.reserved_quantity or 0.0, req.transfer_quantity)
        lot.reserved_quantity = round(max((lot.reserved_quantity or 0.0) - released, 0.0), 3)
    note = payload.note or "Rejected without a note"
    req.status = "rejected"
    req.status_note = f"Rejected — {note}"
    for t in req.transfers:
        if t.status in ("approved", "dispatched"):
            t.status = "rejected"
            t.note = (t.note or "") + f" | Rejected: {note}"
    services.log_activity(
        db, "rescue", req.id, "rejected",
        f"{req.request_code} rejected — {note}"
        + (f". {released:g} {req.unit} reservation released." if released else ""),
        bank_id=req.donor_bank_id or req.requesting_bank_id)
    db.commit()
    db.refresh(req)
    return services.rescue_out(req)


@router.get("/transfers", response_model=list[schemas.TransferOut])
def list_transfers(db: Session = Depends(get_db)):
    rows = db.query(models.SeedTransfer).order_by(
        models.SeedTransfer.created_at.desc()).limit(200).all()
    return [services.transfer_out(t) for t in rows]
