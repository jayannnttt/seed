"""Shared test fixtures: isolated SQLite database + FastAPI test client."""
import os
import sys
import tempfile

# Point the app's engine at a throw-away file BEFORE importing the app,
# so the lifespan seeding never touches the developer's demo database.
_TMP_DB = os.path.join(tempfile.gettempdir(), "seedsathi_test.db")
if os.path.exists(_TMP_DB):
    try:
        os.remove(_TMP_DB)
    except OSError:
        pass
os.environ["DATABASE_URL"] = f"sqlite:///{_TMP_DB}"

import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402
from sqlalchemy import create_engine  # noqa: E402
from sqlalchemy.orm import sessionmaker  # noqa: E402
from sqlalchemy.pool import StaticPool  # noqa: E402

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app import database, seed  # noqa: E402
from app.main import app  # noqa: E402


@pytest.fixture()
def db():
    engine = create_engine(
        "sqlite://", connect_args={"check_same_thread": False},
        poolclass=StaticPool, future=True)
    database.Base.metadata.create_all(bind=engine)
    TestingSession = sessionmaker(autocommit=False, autoflush=False, bind=engine, future=True)
    session = TestingSession()
    seed.seed_demo_data(session)
    session.expire_all()
    try:
        yield session
    finally:
        session.close()


@pytest.fixture()
def client(db):
    def _override():
        yield db

    app.dependency_overrides[database.get_db] = _override
    c = TestClient(app)
    c.__enter__()          # run lifespan without holding a hard context requirement
    c.db_session = db
    yield c
    c.__exit__(None, None, None)
    app.dependency_overrides.clear()
