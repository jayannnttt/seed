"""Community seed bank directory endpoints."""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from ..database import get_db
from .. import models, schemas, services

router = APIRouter(prefix="/api/banks", tags=["seed banks"])


def get_bank_or_404(db: Session, bank_id: int) -> models.SeedBank:
    bank = db.get(models.SeedBank, bank_id)
    if not bank:
        raise HTTPException(status_code=404, detail=f"Seed bank {bank_id} not found")
    return bank


@router.get("", response_model=list[schemas.BankOut])
def list_banks(state: str | None = None, district: str | None = None,
               db: Session = Depends(get_db)):
    q = db.query(models.SeedBank)
    if state:
        q = q.filter(models.SeedBank.state.ilike(f"%{state}%"))
    if district:
        q = q.filter(models.SeedBank.district.ilike(f"%{district}%"))
    banks = q.order_by(models.SeedBank.name).all()
    return [services.bank_out(db, b) for b in banks]


@router.get("/locations", response_model=list[schemas.BankBrief])
def list_locations(db: Session = Depends(get_db)):
    return [services.bank_brief(b) for b in
            db.query(models.SeedBank).order_by(models.SeedBank.name).all()]


@router.get("/{bank_id}", response_model=schemas.BankOut)
def get_bank(bank_id: int, db: Session = Depends(get_db)):
    return services.bank_out(db, get_bank_or_404(db, bank_id))


@router.post("", response_model=schemas.BankOut, status_code=201)
def create_bank(payload: schemas.BankCreate, db: Session = Depends(get_db)):
    if db.query(models.SeedBank).filter(models.SeedBank.code == payload.code).first():
        raise HTTPException(status_code=409, detail=f"Bank code '{payload.code}' already exists")
    bank = models.SeedBank(**payload.model_dump(), is_demo=False)
    db.add(bank)
    db.flush()
    services.log_activity(db, "bank", bank.id, "created",
                          f"Seed bank '{bank.name}' ({bank.code}) added to the network",
                          bank_id=bank.id)
    db.commit()
    db.refresh(bank)
    return services.bank_out(db, bank)


@router.patch("/{bank_id}", response_model=schemas.BankOut)
def update_bank(bank_id: int, payload: schemas.BankUpdate, db: Session = Depends(get_db)):
    bank = get_bank_or_404(db, bank_id)
    for key, value in payload.model_dump(exclude_unset=True).items():
        setattr(bank, key, value)
    services.log_activity(db, "bank", bank.id, "updated",
                          f"Seed bank '{bank.name}' details updated", bank_id=bank.id)
    db.commit()
    db.refresh(bank)
    return services.bank_out(db, bank)


@router.delete("/{bank_id}", status_code=200)
def delete_bank(bank_id: int, db: Session = Depends(get_db)):
    bank = get_bank_or_404(db, bank_id)
    lots = db.query(models.SeedLot).filter(models.SeedLot.bank_id == bank.id).count()
    if lots:
        raise HTTPException(
            status_code=409,
            detail=(f"Cannot delete '{bank.name}' while {lots} seed lot(s) are still "
                    f"recorded there. Move or delete those lots first."))
    name = bank.name
    db.delete(bank)
    services.log_activity(db, "bank", bank_id, "deleted",
                          f"Seed bank '{name}' removed from the network")
    db.commit()
    return {"status": "deleted", "bank_id": bank_id, "name": name}
