"""Seed Vault FastAPI application entry point."""
import os
from contextlib import asynccontextmanager

from fastapi import Depends, FastAPI
from sqlalchemy.orm import Session
from fastapi.middleware.cors import CORSMiddleware

from .database import Base, engine, SessionLocal, get_db
from . import seed
from .routers import alerts, analytics, banks, inventory, monitoring, rescue, simulation

APP_NAME = "Seed Vault API"
APP_VERSION = "1.0.0"
FRONTEND_ORIGIN = os.getenv("FRONTEND_ORIGIN", "http://localhost:5173")


@asynccontextmanager
async def lifespan(app: FastAPI):
    Base.metadata.create_all(bind=engine)
    db = SessionLocal()
    try:
        result = seed.seed_demo_data(db)
        app.state.seed_status = result
    finally:
        db.close()
    yield


app = FastAPI(
    title=APP_NAME,
    version=APP_VERSION,
    description=(
        "Seed Vault — Community Seed Bank Monitoring & Seed Rescue Network.\n\n"
        "All sensor readings in the demo are SIMULATED unless delivered through "
        "POST /api/ingest/open/{device_code} by real hardware. Alert thresholds are "
        "operator-configured examples, not universal agronomic standards. Risk flags "
        "are local network flags, not official conservation statuses."
    ),
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[FRONTEND_ORIGIN, "http://127.0.0.1:5173", "http://localhost:4173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(banks.router)
app.include_router(inventory.router)
app.include_router(monitoring.router)
app.include_router(alerts.router)
app.include_router(rescue.router)
app.include_router(simulation.router)
app.include_router(analytics.router)


@app.get("/api/health")
def health():
    return {"status": "ok", "app": APP_NAME, "version": APP_VERSION}


@app.post("/api/demo/reset")
def reset_demo(confirm: bool = False, db: Session = Depends(get_db)):
    """Wipe and regenerate the sample dataset (requires ?confirm=true)."""
    from fastapi import HTTPException
    if not confirm:
        raise HTTPException(
            status_code=400,
            detail="Pass ?confirm=true to wipe and regenerate the demo dataset.")
    result = seed.seed_demo_data(db, force=True)
    return {"status": "reset", "detail": result,
            "note": "Demo dataset regenerated. All user changes were discarded."}


@app.post("/api/demo/reseed")
def reseed_demo(db: Session = Depends(get_db)):
    return {"status": "ok", "detail": seed.seed_demo_data(db, force=True)}
