"""Seed inventory: varieties and seed lots."""
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from ..database import get_db
from .. import models, schemas, services

router = APIRouter(prefix="/api", tags=["inventory"])

SORT_FIELDS = {
    "quantity_asc": (models.SeedLot.quantity, "asc"),
    "quantity_desc": (models.SeedLot.quantity, "desc"),
    "name_asc": (models.SeedLot.lot_code, "asc"),
    "name_desc": (models.SeedLot.lot_code, "desc"),
    "updated_asc": (models.SeedLot.updated_at, "asc"),
    "updated_desc": (models.SeedLot.updated_at, "desc"),
}


def _get_variety(db: Session, variety_id: int) -> models.SeedVariety:
    v = db.get(models.SeedVariety, variety_id)
    if not v:
        raise HTTPException(status_code=404, detail=f"Seed variety {variety_id} not found")
    return v


def _get_lot(db: Session, lot_id: int) -> models.SeedLot:
    lot = db.get(models.SeedLot, lot_id)
    if not lot:
        raise HTTPException(status_code=404, detail=f"Seed lot {lot_id} not found")
    return lot


def _check_refs(db: Session, variety_id: int, bank_id: int) -> None:
    if not db.get(models.SeedVariety, variety_id):
        raise HTTPException(status_code=422, detail=f"variety_id {variety_id} does not exist")
    if not db.get(models.SeedBank, bank_id):
        raise HTTPException(status_code=422, detail=f"bank_id {bank_id} does not exist")


# ------------------------------------------------------------- varieties ---
@router.get("/varieties", response_model=list[schemas.VarietyOut])
def list_varieties(search: Optional[str] = None, category: Optional[str] = None,
                   indigenous: Optional[bool] = None, db: Session = Depends(get_db)):
    q = db.query(models.SeedVariety)
    if search:
        q = q.filter((models.SeedVariety.name.ilike(f"%{search}%")) |
                     (models.SeedVariety.local_name.ilike(f"%{search}%")))
    if category:
        q = q.filter(models.SeedVariety.crop_category == category)
    if indigenous is not None:
        q = q.filter(models.SeedVariety.is_indigenous == indigenous)
    return [services.variety_out(db, v) for v in q.order_by(models.SeedVariety.name).all()]


@router.post("/varieties", response_model=schemas.VarietyOut, status_code=201)
def create_variety(payload: schemas.VarietyCreate, db: Session = Depends(get_db)):
    variety = models.SeedVariety(**payload.model_dump(), is_demo=False)
    db.add(variety)
    db.flush()
    services.log_activity(db, "variety", variety.id, "created",
                          f"Seed variety '{variety.name}' added to the catalogue")
    db.commit()
    db.refresh(variety)
    return services.variety_out(db, variety)


@router.patch("/varieties/{variety_id}", response_model=schemas.VarietyOut)
def update_variety(variety_id: int, payload: schemas.VarietyUpdate, db: Session = Depends(get_db)):
    variety = _get_variety(db, variety_id)
    for key, value in payload.model_dump(exclude_unset=True).items():
        setattr(variety, key, value)
    services.log_activity(db, "variety", variety.id, "updated",
                          f"Seed variety '{variety.name}' record updated")
    db.commit()
    db.refresh(variety)
    return services.variety_out(db, variety)


@router.delete("/varieties/{variety_id}")
def delete_variety(variety_id: int, db: Session = Depends(get_db)):
    variety = _get_variety(db, variety_id)
    lots = db.query(models.SeedLot).filter(models.SeedLot.variety_id == variety.id).count()
    if lots:
        raise HTTPException(
            status_code=409,
            detail=(f"Cannot delete '{variety.name}' while {lots} seed lot(s) reference it. "
                    f"Delete those lots first."))
    name = variety.name
    db.delete(variety)
    services.log_activity(db, "variety", variety_id, "deleted",
                          f"Seed variety '{name}' removed from the catalogue")
    db.commit()
    return {"status": "deleted", "variety_id": variety_id, "name": name}


# ------------------------------------------------------------------ lots ---
@router.get("/lots", response_model=list[schemas.LotOut])
def list_lots(search: Optional[str] = None, category: Optional[str] = None,
              bank_id: Optional[int] = None, variety_id: Optional[int] = None,
              risk_flag: Optional[str] = None, condition: Optional[str] = None,
              sort: str = Query("updated_desc"), db: Session = Depends(get_db)):
    q = db.query(models.SeedLot)
    if search:
        like = f"%{search}%"
        q = q.join(models.SeedVariety).filter(
            (models.SeedLot.lot_code.ilike(like)) |
            (models.SeedVariety.name.ilike(like)) |
            (models.SeedVariety.local_name.ilike(like)))
    else:
        q = q.join(models.SeedVariety)
    if category:
        q = q.filter(models.SeedVariety.crop_category == category)
    if variety_id:
        q = q.filter(models.SeedLot.variety_id == variety_id)
    if bank_id:
        q = q.filter(models.SeedLot.bank_id == bank_id)
    if risk_flag:
        q = q.filter(models.SeedLot.risk_flag == risk_flag)
    if condition:
        q = q.filter(models.SeedLot.condition == condition)

    column, direction = SORT_FIELDS.get(sort, SORT_FIELDS["updated_desc"])
    q = q.order_by(column.desc() if direction == "desc" else column.asc())
    return [services.lot_out(l) for l in q.all()]


@router.get("/lots/{lot_id}", response_model=schemas.LotOut)
def get_lot(lot_id: int, db: Session = Depends(get_db)):
    return services.lot_out(_get_lot(db, lot_id))


@router.post("/lots", response_model=schemas.LotOut, status_code=201)
def create_lot(payload: schemas.LotCreate, db: Session = Depends(get_db)):
    _check_refs(db, payload.variety_id, payload.bank_id)
    if db.query(models.SeedLot).filter(models.SeedLot.lot_code == payload.lot_code).first():
        raise HTTPException(status_code=409,
                            detail=f"Lot code '{payload.lot_code}' already exists")
    data = payload.model_dump()
    if data["germination_rate"] is None and data["viability_test_date"]:
        raise HTTPException(
            status_code=422,
            detail=("viability_test_date was provided without a germination rate. "
                    "Record the measured rate or leave the test date empty — "
                    "untested germination must not look like a verified result."))
    lot = models.SeedLot(**data, reserved_quantity=0.0, is_demo=False)
    db.add(lot)
    db.flush()
    services.refresh_risk_flags(db)
    services.log_activity(db, "lot", lot.id, "created",
                          f"Seed lot '{lot.lot_code}' added to inventory", bank_id=lot.bank_id)
    db.commit()
    db.refresh(lot)
    return services.lot_out(lot)


@router.patch("/lots/{lot_id}", response_model=schemas.LotOut)
def update_lot(lot_id: int, payload: schemas.LotUpdate, db: Session = Depends(get_db)):
    lot = _get_lot(db, lot_id)
    data = payload.model_dump(exclude_unset=True)
    if "variety_id" in data or "bank_id" in data:
        _check_refs(db, data.get("variety_id", lot.variety_id),
                    data.get("bank_id", lot.bank_id))
    if "lot_code" in data and data["lot_code"] != lot.lot_code:
        if db.query(models.SeedLot).filter(
                models.SeedLot.lot_code == data["lot_code"]).first():
            raise HTTPException(status_code=409,
                                detail=f"Lot code '{data['lot_code']}' already exists")

    new_qty = data.get("quantity", lot.quantity)
    reserved = lot.reserved_quantity or 0.0
    if new_qty < reserved:
        raise HTTPException(
            status_code=422,
            detail=(f"Quantity cannot be set to {new_qty:g} while {reserved:g} {lot.unit} "
                    f"is reserved for an open rescue transfer. Complete or reject that "
                    f"transfer first."))

    germination = data.get("germination_rate", lot.germination_rate)
    test_date = data.get("viability_test_date", lot.viability_test_date)
    if test_date and germination is None:
        raise HTTPException(
            status_code=422,
            detail=("viability_test_date was provided without a germination rate. "
                    "Untested germination must be recorded as unknown."))

    for key, value in data.items():
        setattr(lot, key, value)
    lot.updated_at = services.utcnow()
    services.refresh_risk_flags(db)
    services.log_activity(db, "lot", lot.id, "updated",
                          f"Seed lot '{lot.lot_code}' record updated", bank_id=lot.bank_id)
    db.commit()
    db.refresh(lot)
    return services.lot_out(lot)


@router.delete("/lots/{lot_id}")
def delete_lot(lot_id: int, db: Session = Depends(get_db)):
    lot = _get_lot(db, lot_id)
    if (lot.reserved_quantity or 0) > 0:
        raise HTTPException(
            status_code=409,
            detail=(f"Cannot delete '{lot.lot_code}' while {lot.reserved_quantity:g} "
                    f"{lot.unit} is reserved for an open rescue transfer."))
    used = db.query(models.RescueRequest).filter(
        models.RescueRequest.donor_lot_id == lot.id,
        models.RescueRequest.status.in_(["approved", "dispatched"])).count()
    if used:
        raise HTTPException(
            status_code=409,
            detail=(f"Cannot delete '{lot.lot_code}' — it is attached to an active "
                    f"rescue transfer."))
    code = lot.lot_code
    bank_id = lot.bank_id
    db.delete(lot)
    services.refresh_risk_flags(db)
    services.log_activity(db, "lot", lot_id, "deleted",
                          f"Seed lot '{code}' removed from inventory", bank_id=bank_id)
    db.commit()
    return {"status": "deleted", "lot_id": lot_id, "lot_code": code}


# ------------------------------------------------------------------ meta ---
@router.get("/inventory/meta")
def inventory_meta(db: Session = Depends(get_db)):
    categories = [r[0] for r in db.query(models.SeedVariety.crop_category).distinct().all()]
    conditions = [r[0] for r in db.query(models.SeedLot.condition).distinct().all()]
    return {
        "crop_categories": sorted([c for c in categories if c]),
        "units": list(models.UNIT_VALUES),
        "conditions": sorted([c for c in conditions if c]),
        "risk_flags": list(models.RISK_FLAG_VALUES),
        "risk_flag_notes": {
            "none": "No local risk rule triggered",
            "watch": "Local flag: worth monitoring (see reason)",
            "priority": "Local flag: prioritise for attention (see reason)",
        },
    }
