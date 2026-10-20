# Seed Vault 🌱
**Community Seed Bank Monitoring & Seed Rescue Network**

A full-stack demonstration application that helps communities monitor seed-storage
conditions, keep a reliable inventory of traditional and indigenous seed varieties,
and — the signature feature — **recover seed stock across a network of community seed
banks when one of them is at risk**.

> **One clear outcome:** when a community seed bank risks losing valuable seed
> varieties, Seed Vault helps monitor the risk, identify potential replacement stock
> elsewhere, and coordinate the recovery.

---

## 1. The problem

Traditional and indigenous crop varieties are lost every year because of:

- poor seed-storage conditions (heat, humidity, power failure, flooding),
- inadequate inventory management and record keeping,
- natural disasters that destroy a single community's entire stock,
- a lack of coordination between community seed banks that hold the same varieties.

Seed Vault is **not** another generic IoT dashboard. Its purpose is conservation
coordination: notice a storage risk early, see exactly which lots are exposed, find
reserve stock held by another community, and move it safely.

---

## 2. Architecture

```
┌────────────────────────────┐        REST/JSON        ┌──────────────────────────────┐
│  React 19 + TypeScript     │  ◄──── /api proxy ────► │  FastAPI (Python 3.14)       │
│  Vite 6 · Tailwind CSS 4   │                         │  SQLAlchemy 2 · Pydantic 2   │
│  Lucide icons · Recharts   │                         │  SQLite (seedvault.db)       │
└────────────────────────────┘                         └──────────────┬───────────────┘
                                                                      │
                                                        ┌─────────────▼────────────┐
                                                        │ rules.py — documented,   │
                                                        │ explainable rule engine  │
                                                        │ simulator.py — IoT sim   │
                                                        └──────────────────────────┘
```

| Layer | Technology | Notes |
|---|---|---|
| Frontend | React 19, TypeScript, Vite 6, Tailwind CSS 4 | collapsible sidebar, mobile drawer, responsive tables/charts |
| Icons / charts | lucide-react, Recharts | shared chart & UI primitives in `src/components` |
| Backend | FastAPI, Pydantic v2 | OpenAPI docs at `/docs` |
| Database | SQLite via SQLAlchemy 2 | `backend/seedvault.db`, created & seeded on startup |
| Data exchange | REST (`/api/...`) | Vite dev server proxies `/api` → `http://127.0.0.1:8000` |
| Sensors | Simulated (clearly labelled) + HTTP ingest endpoint for real hardware | see §8 |

---

## 3. Features implemented

### A. Dashboard
Summary cards (banks, varieties/lots, vulnerable varieties, open alerts, pending
rescue requests), average temperature & humidity with sparklines, a 24-hour
storage-condition trend chart, recent alerts, varieties requiring attention, the
network overview table, recent rescue requests and the activity feed. **Every number
is derived from the database — nothing is hardcoded.**

### B. Seed Inventory
Full CRUD on seed lots and varieties. Search by seed name or lot ID; filter by crop
category, seed bank, risk flag and condition; sort by quantity, lot ID or last
update. A detailed record view, input validation, and confirmation before deletion.
**Untested germination is always shown as "Not tested" — never as a fabricated
measurement.** The API refuses a viability-test date that has no measured rate.

### C. IoT Storage Monitoring
Current temperature/humidity per bank, sensor connection status, latest reading
timestamps, recent-reading line charts, threshold-band charts, and per-bank
risk indicators. Alert thresholds are **configurable per bank and per metric** (with
documented example defaults). Simulated-sensor controls let you push readings and
take a sensor offline.

### D. Alerts & Risk Management
Every alert carries: code, bank + sensor, category, measured value, configured
threshold, severity, detection time, acknowledgement status, affected lots and a
recommended action. Filter by severity, bank, status and category; acknowledge and
resolve with notes (persisted). Wording is deliberate: an out-of-range reading is a
**potential risk requiring inspection**, not proof of damage.

### E. Seed Rescue Network — signature feature
1. create a rescue request (variety, quantity, bank, urgency, reason),
2. the platform searches the whole network for matching stock,
3. candidate donors are **ranked and explained** (score breakdown + reasons +
   warnings + distance when coordinates exist),
4. select a donor → create a transfer proposal,
5. statuses: **Pending → Approved → Dispatched → Received** (or Rejected),
6. both banks see progress, and
7. **inventory is only updated when the transfer is marked Received.**

Safety rules enforced by the backend (and covered by tests):

| Rule | Behaviour |
|---|---|
| available = quantity − reserved | never negative |
| proposal created | **no** stock change |
| approved | stock **reserved** (not deducted) |
| rejected | reservation released |
| received | donor deducted, receiving lot created |
| repeated/double actions | rejected with `409` |
| quantity below reserved | rejected with `422` |

### F. Seed Rescue Simulation
Judge-friendly scenario runner: sudden humidity spike, power failure, flooding, or a
sensor reporting unsafe conditions. It generates labelled simulated readings,
evaluates the configured thresholds, scores each affected lot with a **documented
rule-based calculation**, produces a prioritised inspection/recovery checklist, and
shows reserve stock elsewhere in the network — from where a real rescue request can
be opened. Reset any time via *Reset demo data*.

### G. Community Seed Bank Directory
Card or table view with location, coordinator and contact details, variety/lot
counts, stock, latest monitoring status, open alerts, recent rescue activity and
recorded coordinates. Location filtering by state/district.

### H. Analytics & Conservation Insights
Stock by crop category, inventory across banks, alerts open vs resolved, rescue
requests by status, transfers received, 24-hour storage trends, and the varieties
flagged for conservation attention — with explicit disclaimers separating verified
conservation information, calculated indicators and demonstration data.

---

## 4. Database structure

| Table | Purpose |
|---|---|
| `seed_banks` | community seed banks: code, name, location, coordinator, contact, coordinates |
| `seed_varieties` | varieties: name, local/scientific name, crop category, indigenous flag & note, conservation note |
| `seed_lots` | inventory: lot code, variety↔bank, quantity, **reserved_quantity**, unit, source, harvest date, germination rate (nullable = unknown), viability test date, storage location, condition, **local risk flag + reason**, notes |
| `sensor_devices` | devices: code, bank, transport (`simulated`/`mqtt`/`http`), online/offline, `is_simulated` |
| `sensor_readings` | temperature, humidity, timestamp, `is_simulated` |
| `alert_thresholds` | per bank + metric: min, max, operator note |
| `alerts` | code, bank, device, category, reading vs threshold, severity, status, message, recommended action, affected lots, ack/resolve timestamps |
| `rescue_requests` | request code, variety, requesting bank, donor bank/lot, quantities, urgency, reason, status, scenario |
| `seed_transfers` | audit record per rescue transfer step (donor, receiving bank/lot, quantity, status, timestamps) |
| `activity_log` | every meaningful action for the audit trail |
| `seed_meta` | demo-seed version marker (makes seeding idempotent) |

Relationships: `bank 1—* lot *—1 variety`, `bank 1—* device 1—* reading`,
`bank 1—* alert`, `request *—1 variety`, `request 1—* transfer`.

---

## 5. Installation & startup

**Prerequisites:** Python 3.11+ (tested on 3.14), Node.js 18+ (tested on 24).

```bash
# 1. Backend (terminal 1)
cd backend
pip install -r requirements.txt
python run.py                 # → http://127.0.0.1:8000

# 2. Frontend (terminal 2)
cd frontend
npm install
npm run dev                   # → http://localhost:5173
```

On Windows you can simply run `start.bat` from the project root — it opens both
servers in separate windows.

The database is created and demo-seeded automatically on first backend start.
Interactive API documentation: **http://127.0.0.1:8000/docs**

Optional environment variables — copy `.env.example` to `.env`:

| Variable | Default | Purpose |
|---|---|---|
| `DATABASE_URL` | `sqlite:///./seedvault.db` | any SQLAlchemy URL (PostgreSQL works) |
| `FRONTEND_ORIGIN` | `http://localhost:5173` | CORS allow-list |
| `VITE_API_URL` | *(empty = same origin)* | set only if the API is hosted elsewhere |
| `HOST` / `PORT` | `127.0.0.1` / `8000` | API bind address |

No API keys, paid services or physical hardware are required.

### Tests

```bash
cd backend
python -m pytest tests -q      # 24 tests: inventory rules, rescue workflow, monitoring
```

Optional browser smoke tests (require the dev server to be running; use the
system Edge/Chromium — no download needed):

```bash
cd frontend
node browser_smoke.mjs     # loads all 8 routes, fails on any console/page error
node rescue_ui_test.mjs    # drives the full rescue workflow through the UI
node ui_flows_test.mjs     # simulation run, alert acknowledgement, form validation
```

### Reset the demonstration data

- **UI:** sidebar → *Reset demo data* (confirmation dialog), or
- **API:** `POST /api/demo/reset?confirm=true`, or
- **CLI:** `cd backend && python -m app.seed --force`

Re-running the seeder is idempotent — it never creates duplicates.

---

## 6. Demonstration data

5 community seed banks across Tamil Nadu, Kerala, Andhra Pradesh, Maharashtra and
Madhya Pradesh; 14 seed varieties (11 indigenous/traditional); 27 seed lots; 48 hours
of simulated sensor history per bank; one offline sensor; one resolved alert; one
in-flight rescue request. **All sample records are flagged `is_demo` and labelled in
the UI.**

---

## 7. Running a seed rescue scenario (demo workflow)

1. **Dashboard** — note the open storage alert and the bank carrying a local
   priority flag.
2. **Alerts & Risk** — open the alert: measured value vs configured threshold, with a
   recommended inspection action. Acknowledge it (persists).
3. **Seed Inventory** — inspect the affected bank's lots; note condition, local risk
   flag reasons and which lots have never been germination-tested.
4. **Rescue Simulation** — pick a scenario (e.g. *Flooding*) and a bank, then start.
   Review the bank risk score, the affected-lot table with per-lot scores and reasons,
   and the prioritised checklist.
5. **Reserve stock** — the simulation lists matching stock at other banks, each with
   an explained score. Open a rescue request from there (the form is pre-filled).
6. **Seed Rescue Network** — open the request, search the network, review the ranked
   donors ("Why this donor?"), select one and confirm the transfer quantity.
7. **Advance the workflow** — Approve (reserves stock) → Dispatch → **Receive**
   (updates inventory at both banks). Each step is validated; double actions are
   refused.
8. **Verify** — the donor lot is reduced, a new `TRF-…` receiving lot exists at the
   requesting bank, and the activity history + transfer records show the full trail.

---

## 8. Connecting real IoT hardware later

Simulated and real sensors share one pipeline, so nothing else needs to change:

1. A device posts JSON to the open ingest endpoint:
   `POST /api/ingest/open/{device_code}` with
   `{"temperature_c": 27.4, "humidity_pct": 61.2}`.
2. An ESP32/Arduino can call it directly (Wi-Fi), or an MQTT→HTTP bridge can forward
   `seedvault/{device_code}/readings` messages to the same endpoint.
3. Set the device's `transport` to `http` or `mqtt` (PATCH `/api/devices/{id}`); the
   UI then stops showing the "Simulated" badge because readings arrive with
   `is_simulated=false`.

**Honesty note:** with no physical sensors attached, every reading in this build is
generated by the simulator and is labelled *Demo Simulation* throughout the UI.

---

## 9. The rule engine (transparent, not AI)

`backend/app/rules.py` documents every rule in one place:

- **Local conservation risk flag** — `priority` / `watch` / `none`, each with a
  written reason (poor condition, single-bank stock, quantity below a network-local
  threshold, untested or stale viability). These are **local working flags, not
  official conservation statuses** such as IUCN categories.
- **Alert evaluation** — a reading outside the configured range yields a warning
  (or critical when it exceeds the per-metric margin) plus a practical next action.
- **Donor ranking** — availability (0–40) + recorded condition & germination
  information (0–35) + proximity (0–25). Matches are by **recorded variety only**;
  the platform never claims two lots are genetically equivalent.
- **Scenario risk score** — additive base + condition + viability + local flag
  penalties, capped 0–100, banded low/elevated/high. No machine learning is involved
  and no claim about real seed survival is made.

---

## 10. API overview

Interactive docs: `/docs` · ReDoc: `/redoc`

| Group | Endpoints |
|---|---|
| Health/demo | `GET /api/health`, `POST /api/demo/reset`, `POST /api/demo/reseed` |
| Dashboard | `GET /api/summary`, `GET /api/analytics`, `GET /api/activity` |
| Banks | `GET/POST /api/banks`, `GET/PATCH/DELETE /api/banks/{id}`, `GET /api/banks/locations` |
| Varieties | `GET/POST /api/varieties`, `PATCH/DELETE /api/varieties/{id}` |
| Inventory | `GET/POST /api/lots`, `GET/PATCH/DELETE /api/lots/{id}`, `GET /api/inventory/meta` |
| Monitoring | `GET /api/devices`, `PATCH /api/devices/{id}`, `GET /api/readings`, `POST /api/monitoring/simulate`, `GET /api/thresholds`, `PUT /api/thresholds/{bank}/{metric}`, `POST /api/ingest/open/{device_code}` |
| Alerts | `GET /api/alerts`, `POST /api/alerts/{id}/acknowledge`, `POST /api/alerts/{id}/resolve`, `DELETE /api/alerts/{id}` |
| Rescue | `POST /api/rescue/search`, `GET/POST /api/rescue/requests`, `GET /api/rescue/requests/{id}`, `GET /api/rescue/matches/{id}`, `POST .../proposal`, `.../approve`, `.../dispatch`, `.../receive`, `.../reject`, `GET /api/rescue/transfers` |
| Simulation | `GET /api/simulation/scenarios`, `POST /api/simulation/run?scenario=…` |

---

## 11. Project structure

```
SEED VAULT/
├── backend/
│   ├── app/
│   │   ├── main.py            # FastAPI app, CORS, lifespan seeding
│   │   ├── database.py        # engine/session (DATABASE_URL)
│   │   ├── models.py          # 12 tables + vocabulary constants
│   │   ├── schemas.py         # Pydantic request/response models
│   │   ├── rules.py           # documented risk / matching / scoring rules
│   │   ├── simulator.py       # simulated sensor core + real-device ingest
│   │   ├── services.py        # serialisation, thresholds, alert generation
│   │   ├── seed.py            # idempotent demo dataset
│   │   └── routers/           # banks, inventory, monitoring, alerts,
│   │                          # rescue, simulation, analytics
│   ├── tests/                 # 24 pytest tests (inventory + rescue + monitoring)
│   └── run.py
├── frontend/
│   └── src/
│       ├── components/        # Layout, ui.tsx primitives, charts.tsx
│       ├── lib/               # api.ts, types.ts, hooks.ts, format.ts
│       └── pages/             # Dashboard, Inventory, Monitoring, Alerts,
│                              # RescueNetwork, RescueSimulation, Directory, Analytics
├── .env.example
└── README.md
```

---

## 12. Limitations (stated honestly)

- **No physical sensors** in this build — all readings are simulated and labelled.
  The HTTP ingest endpoint and device `transport` field are the integration points.
- **Thresholds are operator-set examples**, not agronomic standards; different crops
  and climates need different values.
- **Conservation flags are local**, computed by documented rules. They are not
  official endangered-status classifications and Seed Vault does not claim to predict
  seed survival or germination outcomes.
- **Matching is by recorded variety name/ID.** Genetic equivalence between lots held
  at different banks is never asserted without verified records from both banks.
- Single-user demo: **no authentication/authorisation** layer yet; both banks "see"
  the same interface. Add auth (e.g. OAuth2/OIDC) plus per-bank scoping before any
  real multi-organisation deployment.
- SQLite is used for zero-setup demos; `DATABASE_URL` supports PostgreSQL for
  production. Sensor data accumulates — add a retention/downsampling policy for
  long-running deployments.
- No offline/PWA mode and no SMS/USSD channel for low-connectivity villages, both of
  which would matter in real field use.

---

## 13. Feature checklist (verified during this build)

- [x] Backend boots, auto-creates the schema and seeds demo data (idempotent)
- [x] 24 automated tests pass (`pytest`)
- [x] Dashboard figures derive from the database (banks, varieties, lots, alerts, requests)
- [x] Inventory: create / edit / delete persists; duplicate lot code → 409
- [x] Untested germination stays "unknown"; test date without rate → 422
- [x] Quantity cannot drop below reserved stock → 422; reserved lot cannot be deleted → 409
- [x] Simulated readings generate alerts against configured thresholds
- [x] Alert acknowledge/resolve persists and double-acknowledge → 409
- [x] Threshold editing persists; min ≥ max → 422
- [x] Rescue: create → match → propose → approve → dispatch → receive
- [x] Stock only reserved on approval, only deducted on receipt
- [x] Double approve/receive → 409; over-requested quantity → 422 with an explanation
- [x] Simulation produces risk scores, checklist and reserve matches; no inventory change
- [x] `POST /api/demo/reset?confirm=true` restores the original dataset
- [x] Frontend builds cleanly (`npm run build`, TypeScript strict)
