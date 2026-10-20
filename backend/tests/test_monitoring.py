"""Monitoring, alerting and simulation workflows."""
from app import models


def test_devices_are_marked_simulated(db, client):
    devices = client.get("/api/devices").json()
    assert devices, "every demo bank should have a sensor device"
    for d in devices:
        assert d["is_simulated"] is True
        assert d["transport"] in ("simulated", "mqtt", "http")


def test_threshold_alert_acknowledge_resolve_persists(db, client):
    bank = db.query(models.SeedBank).filter(models.SeedBank.code == "SVB-001").first()
    device = db.query(models.SensorDevice).filter_by(bank_id=bank.id).first()

    res = client.post("/api/ingest/open/" + device.device_code,
                      json={"temperature_c": 45.0, "humidity_pct": 55.0})
    assert res.status_code == 200, res.text

    alerts = client.get(f"/api/alerts?bank_id={bank.id}&status=open").json()
    temp_alerts = [a for a in alerts if a["metric"] == "temperature"]
    assert temp_alerts, "an out-of-range reading must raise an alert"
    alert = temp_alerts[0]
    assert alert["severity"] in ("warning", "critical")
    assert alert["threshold_value"] is not None
    assert alert["recommended_action"], "alerts must recommend a practical action"
    assert "damage" not in alert["message"].lower(), "alerts must not claim seed damage"

    # acknowledge -> persists
    res = client.post(f"/api/alerts/{alert['id']}/acknowledge", json={"note": "checking"})
    assert res.status_code == 200
    db.expire_all()
    row = db.get(models.Alert, alert["id"])
    assert row.status == "acknowledged"

    # acknowledging twice must fail
    res = client.post(f"/api/alerts/{alert['id']}/acknowledge", json={})
    assert res.status_code == 409

    # resolve -> persists
    res = client.post(f"/api/alerts/{alert['id']}/resolve",
                      json={"note": "sensor verified, area ventilated"})
    assert res.status_code == 200
    db.expire_all()
    row = db.get(models.Alert, alert["id"])
    assert row.status == "resolved"
    assert "ventilated" in row.resolution_note


def test_offline_device_blocks_simulation(db, client):
    d5 = db.query(models.SensorDevice).join(models.SeedBank).filter(
        models.SeedBank.code == "SVB-005").first()
    assert d5.status == "offline", "demo data includes one offline sensor"
    res = client.post("/api/monitoring/simulate", json={"bank_id": d5.bank_id, "steps": 2})
    assert res.status_code == 409
    # bring it back online, then simulation works
    res = client.patch(f"/api/devices/{d5.id}", json={"status": "online"})
    assert res.status_code == 200
    res = client.post("/api/monitoring/simulate", json={"bank_id": d5.bank_id, "steps": 2})
    assert res.status_code == 200
    body = res.json()
    assert len(body["new_readings"]) == 2
    assert "SIMULATOR" in body["note"]


def test_threshold_update_and_validation(db, client):
    bank = db.query(models.SeedBank).first()
    res = client.put(f"/api/thresholds/{bank.id}/humidity",
                     json={"min_value": 30.0, "max_value": 70.0,
                           "note": "operator configured for demo"})
    assert res.status_code == 200
    res = client.put(f"/api/thresholds/{bank.id}/humidity",
                     json={"min_value": 80.0, "max_value": 70.0})
    assert res.status_code == 422


def test_thresholds_endpoint_serialises_defaults(db, client):
    """Regression: system example defaults must serialise (they have no row yet)."""
    bank = db.query(models.SeedBank).first()
    res = client.get(f"/api/thresholds?bank_id={bank.id}")
    assert res.status_code == 200, res.text
    rows = res.json()
    assert {r["metric"] for r in rows} >= {"temperature", "humidity"}
    for r in rows:
        assert isinstance(r["id"], int)
        assert r["max_value"] > r["min_value"]
        assert r["note"]
    # listing every bank must not 500 either
    assert client.get("/api/thresholds").status_code == 200


def test_scenario_simulation_produces_risk_and_checklist(db, client):
    bank = db.query(models.SeedBank).filter(models.SeedBank.code == "SVB-004").first()
    res = client.post(f"/api/simulation/run?scenario=flood",
                      json={"bank_id": bank.id, "steps": 3})
    assert res.status_code == 200, res.text
    body = res.json()
    assert body["is_simulation"] is True
    assert body["affected_lots"], "every bank should have lots to analyse"
    for lot in body["affected_lots"]:
        assert 0 <= lot["risk_score"] <= 100
        assert lot["risk_reasons"]
    assert body["checklist"], "a scenario must produce an inspection checklist"
    assert body["risk"]["method"], "the scoring method must be documented in the response"


def test_unknown_scenario_rejected(db, client):
    bank = db.query(models.SeedBank).first()
    res = client.post("/api/simulation/run?scenario=meteor",
                      json={"bank_id": bank.id, "steps": 1})
    assert res.status_code == 422


def test_summary_and_analytics_derive_from_data(db, client):
    s = client.get("/api/summary").json()
    assert s["counts"]["banks"] == db.query(models.SeedBank).count()
    assert s["counts"]["lots"] == db.query(models.SeedLot).count()
    assert s["trend"], "the 24h trend should have at least one bucket"
    assert s["network"], "network overview should list every bank"

    a = client.get("/api/analytics").json()
    total_cat = sum(c["lots"] for c in a["by_category"])
    assert total_cat == db.query(models.SeedLot).count()
    assert a["disclaimers"]["conservation"], "conservation disclaimer required"
    for row in a["flagged_varieties"]:
        assert row["risk_flag_reason"], "local flags must be explained"


def test_demo_reset_requires_confirmation(db, client):
    res = client.post("/api/demo/reset")
    assert res.status_code == 400
    res = client.post("/api/demo/reset?confirm=true")
    assert res.status_code == 200
    assert client.get("/api/summary").json()["counts"]["banks"] >= 5
