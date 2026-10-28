# Design Spec — Wind Forecast Insights Portal

*Product working title: "WindAhead" (repo ships under an anonymous random name per the challenge).*

## 1. Problem statement

A UK energy utility buys electricity from the wholesale day-ahead market to serve its
consumers. Because a large share of supply comes from wind generation, the volume they
must procure from dispatchable sources (e.g. thermal plants) on day D is roughly:

    procurement_needed(D) ≈ expected_demand(D) − expected_wind_generation(D)

Wind generation is weather-dependent and uncertain, while day-ahead purchases are firm
and must be placed one day before delivery. The trading team therefore lives off wind
generation **forecasts** and needs two capabilities to make good decisions:

1. **See the latest forecast that is actually available at decision time** — the day-ahead
   market gate closes at **09:50 GMT on D-1** (N2EX day-ahead auction; results ~10:00 GMT).
   Only forecasts published before that moment are usable.
2. **Know, quantitatively, how much the forecast can be trusted** — so purchases can be
   sized with an explicit error margin instead of trusting a single number.

**Product**: a web app that shows, for each day-ahead purchase decision, the wind forecast
vintage available at gate closure, and a quantified evaluation of how accurate those
forecasts have been (error statistics, uncertainty bands, and per-day/hour breakdowns).

## 2. Scope

### In scope (mandated by the PM)
- National-level GB wind power **actuals** from Elexon `FUELHH` (`fuelType=WIND`) only.
- National-level GB wind power **forecasts** from Elexon `WINDFOR` only.
- No other data source (no demand, no prices, no other fuel types).
- Analysis window: **purchase decisions made in January 2026** — i.e. decision dates
  `2026-01-01 … 2026-01-31`, each covering delivery day D = decision date + 1, so delivery
  days `2026-01-02 … 2026-02-01`.

### Out of scope (explicitly)
- Demand forecasts, price signals, other renewables (solar), intraday adjustments.
- Automated procurement recommendation engine (the app quantifies error; humans decide).
- Live streaming beyond on-demand refresh from the BMRS API.
- The gap between Jan 1 (delivery) and the Dec 31, 2025 decision (that decision was
  made in December, outside the window) and the Feb 1 decision (made in February).

## 3. Domain model (verified against the live API)

All facts below were probed against `https://data.elexon.co.uk/bmrs/api/v1` on 2026-10-26.

### 3.1 Actuals — FUELHH (half-hourly generation outturn by fuel type)
- Endpoint: `GET /datasets/FUELHH/stream`
- Query params (docs: bmrs.elexon.co.uk/api-documentation/endpoint/datasets/FUELHH/stream):
  `publishDateTimeFrom/To` (ISO datetime), `settlementDateFrom/To` (yyyy-MM-dd),
  `settlementPeriod` (list of ints), `fuelType` (list of strings).
- We use: `settlementDateFrom=2026-01-02&settlementDateTo=2026-02-01&fuelType=WIND`
  → exactly **1,488 records = 31 days × 48 settlement periods** (verified).
- Record: `{dataset, publishTime, startTime, settlementDate, settlementPeriod, fuelType, generation}`
  - `startTime`: start of a 30-min settlement period (SP), e.g. `2026-01-05T00:30:00Z` = SP2.
  - `generation`: average MW over that half hour.
  - `publishTime`: when the actual value was published (SP1 actual arrives ~00:30Z).

### 3.2 Forecasts — WINDFOR (wind generation forecast)
- Endpoint: `GET /datasets/WINDFOR/stream`
- Query params: **`publishDateTimeFrom/To` only** — the dataset is queried by
  *publication time*, not target time (a key gotcha; there is no `startTime` filter).
- We use: `publishDateTimeFrom=2025-12-31T00:00:00Z&publishDateTimeTo=2026-02-01T00:00:00Z`
  → **18,688 records / 256 publications** (verified).
- Record: `{dataset, publishTime, startTime, generation}`
  - `publishTime`: forecast issue time (the "vintage").
  - `startTime`: target hour, **hourly resolution** (the challenge text hints 30-min for
    actuals; WINDFOR is 60-min — verified: 73 unique hourly points per publication).
  - One publication = **73 hourly points** spanning **−5.5 h to +66.5 h** relative to issue
    time (i.e. covers the recent past out to ~2.75 days ahead).
- Publication cadence (verified): **8 issues/day at fixed UTC times**
  `02:30, 04:30, 07:30, 09:30, 11:30, 15:30, 18:30, 22:30`.

### 3.3 The decision timeline
For delivery day D, with gate closure at D-1 09:50 GMT (= UTC in January):

```
D-2 22:30  ─┐
D-1 02:30   │  earlier WINDFOR issues (usable but stale)
D-1 04:30   │
D-1 07:30   │
D-1 09:30  ◄┴─ LAST issue usable for the day-ahead decision (20 min before gate)
D-1 09:50  ──  N2EX day-ahead auction gate closure (09:50 GMT / 10:50 CET)
D-1 ~10:00 ──  auction results
D 00:00–24:00 ─ delivery day (48 half-hours, day-ahead products are HOURLY)
D 00:30…  ──  actuals start flowing into FUELHH
```

Verified: for **all 31 decision days**, the D-1 09:30 WINDFOR issue exists and fully covers
delivery day D (24 hourly points). This issue is defined as the **gate-closure forecast**.

### 3.4 Alignment of forecast and actuals
- Forecasts are hourly MW; actuals are 30-min average MW; day-ahead products are hourly.
- Alignment rule: hourly actual for hour h = mean(SP starting h:00, SP starting h:30).
  (FUELHH `startTime` marks the *start* of the SP; `generation` is the SP average.)
- All evaluation is done at **hourly resolution (24 points per day)** — matches both the
  forecast resolution and the day-ahead product granularity. No interpolation is invented.
- January is GMT, so UTC == local time; no DST edge cases inside the window.

## 4. Analytics / error definitions

Let `A(h)` = hourly actual, `F(h)` = gate-closure forecast for delivery hour h.

- **Error** `e(h) = F(h) − A(h)` (MW). Sign convention: **positive = forecast too high**
  (over-forecast) → actual wind below what was bought against → **shortfall risk**;
  negative = under-forecast → possible over-procurement. This is the trader-facing
  convention (bias is signed the way the desk talks); it must be consistent in backend,
  tests, chart labels and tooltips.
- **MAE** = mean |e|; **RMSE**; **bias** = mean e (positive = systematic over-forecast).
- **MAPE-with-guard**: percentage error computed only over hours with `A(h) ≥ 500 MW`
  (national wind rarely approaches zero, but the guard avoids divide-by-noise).
- **Uncertainty quantiles**: empirical P05/P50/P95 of `e`, overall and **per hour-of-day**
  → powers the headline product feature: *"historically, in the evening peak (17:00–20:00),
  actual wind fell short of the gate-closure forecast by more than X MW on 10% of hours —
  size your margin accordingly."* With the new sign convention the procurement margin is
  the P95 of `e` (the over-forecast tail).
- **Horizon / lead-time analysis (required — promoted from stretch)**: the dataset contains
  every issue (8/day), so quantify how error grows with lead time: all forecasts 0–48 h
  before target, bucketed in 6-hour bands (0–6, 6–12, … 42–48). Also expose per-issue-time
  accuracy (02:30 … 09:30) to answer "how much did waiting for the gate-closure issue help?"
  Reference implementation reported error rising from ~1.65 GW (0–6 h) to ~2.32 GW (42–48 h).
- **Energy totals (required)**: per delivery day show forecast wind energy (Σ hourly MW =
  MWh) and actual energy (Σ 30-min MW × 0.5 h), displayed in GWh, plus forecast avg/peak/low.
  Traders size purchases in energy, not only in instantaneous MW.
- **Aggregations exposed**: overall (31 days), per-decision-day (MAE + bias series),
  per-hour-of-day (MAE/bias + quantiles), per-horizon bucket, per-issue-time.
- **Measurement caveat (must appear in Method page and README)**: the prior build observed
  mean forecast ≈ 13.0 GW vs mean actual ≈ 11.3 GW (ratio ≈ 1.15) and one-sided errors on
  27/31 days — a level offset far larger than weather-error alone. Part of this likely
  reflects scope differences (WINDFOR forecast population vs FUELHH transmission-metered
  actuals, curtailment), not forecast skill. The app must present the bias with this caveat
  so the client does not over-read it.

Primary analysis object = **gate-closure forecast** (the one actually usable at decision
time). All-versions fan chart is a secondary view. This separation keeps the product honest:
"evaluate the forecast you could have used, not the one published after the fact."

**Prior-art validation**: reproducing the bricksgrid pipeline on its bundled data gave
MAE ≈ 2,022 MW, RMSE ≈ 2,497 MW, bias ≈ +1,746 MW over 744 hours. Correcting the alignment
to hourly SP-pair averaging changes these only marginally (MAE ≈ 2,039 at a 09:00 cutoff;
≈ 2,013 at the 09:50 gate-closure cutoff) — confirming the headline findings are robust and
that alignment is not driving the bias.

## 5. Architecture

```
┌────────────────────────── Docker Compose (dev) / Heroku container (prod) ─────────────────────┐
│                                                                                                │
│  React (Vite + TypeScript) ──static build──► served by FastAPI (single origin, no CORS pain)   │
│        │ fetch /api/*                                                                          │
│        ▼                                                                                       │
│  FastAPI backend (Python)                                                                      │
│    /api/days, /api/days/{date}, /api/forecast/{date}, /api/summary, /api/meta                 │
│        │                                                                                      │
│        ├── metrics engine (pure Python functions, pandas for alignment)                        │
│        ├── SQLite (data/portal.db)  ◄── scripts/fetch_data.py (seed + manual resync)          │
│        └── BMRS client (httpx) → data.elexon.co.uk/bmrs/api/v1 (refresh endpoint)              │
└────────────────────────────────────────────────────────────────────────────────────────────────┘
```

- **Stack**: React 18 + Vite + TypeScript + Recharts + Tailwind CSS (frontend);
  Python 3.12 + FastAPI + httpx + pandas + SQLite (backend); pytest (tests).
- **Single container**: FastAPI serves the built React bundle (`/`) and the JSON API
  (`/api/*`). One Dockerfile, one process — simplest possible deployment on Heroku's
  container stack, which satisfies both challenge constraints ("use docker" + "deploy on
  vercel or heroku"). Vercel note: Vercel does not run custom Dockerfiles, so Heroku is the
  primary target; if Heroku is unavailable at submission time, the same image runs on any
  container host and the Vercel path would be frontend + Python serverless functions
  reading the seed DB (documented fallback).
- **Persistence**: SQLite seeded by `scripts/fetch_data.py` from the live BMRS API and
  **committed to the repo** (`data/portal.db`, ~3 MB: 1,488 + 18,688 rows). Benefits:
  reproducible demo (no cold-start network dependency), fast dyno boot, reviewable.
  A `POST /api/admin/sync` endpoint (protected by a token env var) refetches from BMRS
  for freshness; GET endpoints read only from the DB, so the app stays up even if
  BMRS is slow/rate-limited.
- **Config**: `DECISION_START=2026-01-01`, `DECISION_END=2026-01-31`,
  `GATE_CLOSURE_UTC=09:50`, default window derived; all server-side, exposed via `/api/meta`.


## 6. Backend API (contract)

| Method & path | Returns |
|---|---|
| `GET /api/meta` | analysis window, gate-closure time, data vintages (last sync), definitions/assumptions, row counts |
| `GET /api/days` | list of 31 decision-day summaries: `decision_date`, `delivery_date`, gate-closure issue `publish_time`, `mae`, `rmse`, `bias`, `forecast_total_mwh`, `actual_total_mwh`, worst-shortfall hour |
| `GET /api/days/{decision_date}` | full day detail: hourly series `[{time, forecast, actual, error}]`, `summary` (forecast/actual energy GWh, avg/peak/low), per-day `metrics`, day `percentiles` (p05/p50/p95), the WINDFOR issue used, `flag` if delivery day incomplete (Feb 1 edge) |
| `GET /api/forecast/{decision_date}` | all WINDFOR issues published on D-1 (8 vintages × up to 73 hours) + which one is the gate-closure issue; powers the "what the trader saw" fan |
| `GET /api/summary` | window aggregates: overall metrics, `by_day` (MAE+bias series), `by_hour` (MAE/bias + p05/p50/p95), `by_horizon` (6 h buckets), `by_issue_time`, monthly energy totals |
| `POST /api/admin/sync` | refetch from BMRS into SQLite (401 without `X-Admin-Token`) |

Response models via Pydantic; errors as `{detail}`; OpenAPI docs auto-generated at `/docs`
(also a nice touch for the tech-lead video).

## 7. UI screens (React)

Design language: dark professional operations dashboard (industry convention for trading
tools), tokens per ui-ux-pro-max guidance — background `#0F172A`, card `#1B2336`,
foreground `#F8FAFC`, muted `#94A3B8`, border `#475569`. Semantic data colors: **actual =
blue `#3B82F6`**, **forecast = amber `#F59E0B`**, **shortfall/risk = red `#EF4444`**,
**positive = green `#22C55E`**; accent green `#22C55E`. Fira Sans for UI text + Fira Code for
numbers; WCAG AA contrast (light-on-dark ≥ 4.5:1), visible focus rings, no color-only meaning
(shortfall bars are both red AND signed/labelled), charts get text alternatives via
tables/summaries under each chart.

### 7.1 Overview (landing) — "How good are the forecasts?"
- KPI cards: window MAE (MW and % of mean actual), RMSE, bias, worst day, % hours in shortfall.
- Chart 1: daily MAE + bias across the 31 delivery days (bars + line, shared axis).
- Chart 2: hour-of-day error profile (MAE/bias + P05/P95 band) — the "when is wind
  over-forecast?" answer.
- Chart 3: **error by forecast horizon** (0–6 … 42–48 h, MAE and RMSE bars) — "how much does
  waiting cost?" — adopted from the prior build as a required view.
- Chart 4: scatter forecast vs actual (all 744 hours) with y=x line (secondary, below fold).
- Plain-language takeaway strip, auto-generated from the data ("On average the day-ahead
  wind forecast used for trading was off by X MW (Y%); it ran high by Z MW; errors grow to W
  MW at two days' horizon…").

### 7.2 Decision Day (the trader screen) — "What could I have known on D-1?"
- Decision-date picker (defaults to the latest evaluated day).
- Context header: decision date D, delivery day D+1, gate closure 09:50 GMT, issue used
  (09:30 vintage) with its `publishTime` — makes "latest usable forecast" explicit.
- Energy row (adopted from the prior build): forecast wind energy vs actual wind energy
  (GWh), plus average / peak / lowest forecast hour — the quantities a buyer actually trades.
- Main chart: gate-closure forecast curve for the delivery day (24 h), actual overlay
  (dashed, once realized), error ribbon (forecast − actual shaded), P05/P95 confidence
  band from historical metrics for the risk framing.
- Vintage fan: all 8 issues published on D-1 as light lines behind the gate-closure one,
  showing forecast evolution toward gate closure.
- Metrics row for this day: MAE, RMSE, bias, biggest 1-h shortfall (MW and when),
  biggest over-delivery.
- A short "decision note" block: how this day's error compares to the distribution of
  January errors (percentile badges).

### 7.3 Method & data
- Definitions of every metric (with formulas), sign conventions, alignment rule
  (30-min → hourly), the gate-closure vintage definition, data sources with links, the
  January-2026 window interpretation, assumptions and known limitations. Shared by both
  audiences (client credibility + tech-lead review) and doubles as video-script material.
- **Plain-language glossary (adopted from the prior build)**: a "What the numbers mean" panel
  that translates MAE/RMSE/bias/MAPE into trader sentences ("expect to be off by this much",
  "forecasts ran high, so buy cover") — same definitions, no jargon-only presentation.
- **Measurement caveat callout** from §4: the level gap between WINDFOR and FUELHH may partly
  reflect metering scope/curtailment, not pure forecast skill; state it plainly.

Navigation footnotes (adopted from prior build): every chart gets a one-line subtitle saying
what it shows and why it matters; the Decision view carries a "forecast as known at <time>"
pill; README includes a short "Findings (January 2026)" section with the headline numbers.

Navigation: top bar with 3 tabs + as-of/sync badge ("data through publishTime X, synced Y").
Responsive down to tablet; data tables + charts degrade gracefully.

## 8. Data pipeline

`scripts/fetch_data.py` (single idempotent script):
1. `FUELHH/WIND` for settlement dates 2026-01-02 → 2026-02-01 (1 request; params
   `settlementDateFrom/To` + `fuelType=WIND`). Validate: 31 days × 48 SPs, no gaps;
   fail loudly with a diff of what's missing.
2. `WINDFOR` for publish times 2025-12-31T00:00Z → 2026-02-01T00:00Z (chunked by day to
   stay well under any payload limit; 2 requests in practice are enough). Validate:
   8 issues/day × 73 hourly points, expected issue-time set, full coverage of each
   delivery day by its gate-closure issue (24/24 hours) — abort if any decision day fails.
3. Write to SQLite (`actuals`, `forecasts` tables) inside a transaction; store raw
   payloads under `data/raw/` for provenance. Print a validation summary (counts + ranges).
4. Never transform on ingest: all alignment/aggregation happens in the metrics engine, so
   raw data is inspectable and the engine is testable.

## 9. Verification & testing
- `pytest` unit tests for the metrics engine with hand-computed fixtures (tiny series with
  known MAE/RMSE/bias/quantiles; SP→hour aggregation; gate-closure issue selection
  including a "late issue" edge case).
- API tests with FastAPI `TestClient` against a small fixture DB.
- Ingest script has a `--check` dry-run mode printing validation results.
- Frontend: light — build + a couple of Vitest smoke tests (renders KPIs from fixture).
- `make verify` runs the full gate locally.
- Final manual check: README quickstart in a clean Docker cache; all submission URLs
  opened in incognito.

## 10. Assumptions & documented limitations
1. "Purchase decisions made in January 2026" ⇒ 31 decision days (Jan 1–31), delivery days
   Jan 2 – Feb 1. Boundary handling is stated in README + /api/meta.
2. WINDFOR `generation` for `startTime` h is treated as an hourly value comparable to the
   hourly mean of the two SP actuals. The prior build paired single half-hours against
   hourly forecasts; averaging the pair is the defensible alignment and is used here.
   Exact energy-normalisation semantics are not separately documented by Elexon — stated.
3. Only national wind as reported in FUELHH/WINDFOR (`fuelType=WIND`). Whether WINDFOR's
   forecast population exactly matches FUELHH's metered population is **unverified**; the
   observed level gap (~1.15×) suggests a scope difference may exist (see §4 caveat).
4. Gate-closure time 09:50 GMT per Nord Pool/N2EX documentation; we use the 09:30 UTC
   issue as "gate-closure forecast". If the desk actually trades with data later than
   gate closure (some intraday residual), the vintage definition parameter makes this
   configurable without code changes.
5. BMRS API has no key auth but rate limits (429s): sync is manual/on-demand; normal reads
   are DB-only. A documented retry/backoff with jitter is in the client.
6. Metrics are descriptive statistics, not a probabilistic forecast product; the band
   shown is historical empirical distribution, presented as such.
7. Data-quality caveat: the January 2026 WINDFOR series runs systematically above FUELHH
   actuals (mean forecast ≈ 13.0 GW vs mean actual ≈ 11.3 GW; one-sided errors on 27/31
   days). Bias figures must be shown with the metering-scope/curtailment caveat, not as
   pure forecast skill.

## 11. Deliverables mapping (from the challenge)
- Docker: Dockerfile (multi-stage) + docker-compose.yml + `make` targets.
- **Deploy (updated after prior-art review): Vercel primary** — `vercel.json` + `api/index.py`
  serverless entry that bundles `backend/` and `data/`; static React build from
  `frontend/dist`. **Docker required by the challenge and used for local/prod parity.**
  Heroku container stack remains a documented alternative. URL in README; fallback documented.
- Video (unlisted YouTube ≤10 min): Part 1 = Overview + one walking Decision Day demo
  (management narrative); Part 2 = architecture walk, codebase tour, metrics definitions,
  tests, pitfalls found (query-by-publishTime gotcha, hourly-vs-half-hourly alignment).
  **Add `docs/video-script.md`** with shot-by-shot narration (adopted from prior build).
- README: directory map, quickstart (docker + local dev), deployed link, AI-tools-usage
  disclosure, data window interpretation, **"Findings (January 2026)" summary** (headline
  MAE/RMSE/bias, horizon growth, caveat), API endpoints link (`/docs`), screenshots.
- Submission form + incognito link verification checklist (see implementation plan §6).

## 12. Prior-implementation review (bricksgrid, reference only)

A prior build (the bricksgrid project, reviewed from a local throwaway copy during planning;
not shipped in this repo) was reviewed to harvest decisions.

### Adopted (now part of this spec)
| Feature | Where it lands |
|---|---|
| Horizon/lead-time error analysis (6 h buckets, 0–48 h) | §4 required metric; §7.1 chart 3 |
| Per-day energy totals (GWh) + avg/peak/low forecast | §4; §7.2 energy row |
| Daily MAE **and bias** trend lines | §7.1 chart 1 |
| Plain-language glossary "What the numbers mean" | §7.3 |
| Chart subtitles explaining "what and why" | §7.3 |
| "Forecast as known at <cutoff>" pill | §7.2 context header |
| Vercel serverless packaging (vercel.json + api/index.py) | §11 deploy |
| Video script + reproducible demo-video pipeline | plan Phase 6 |
| README "Findings" section + screenshots | §11 |

### Corrected / not adopted
| Prior choice | Issue | Our choice |
|---|---|---|
| Cutoff 09:00 local | N2EX gate closure is **09:50 GMT**; 09:00 selects the 07:30 issue (2 h stale) | 09:50 GMT cutoff → 09:30 issue |
| Half-hour actual paired with hourly forecast at same startTime | Compares a 30-min mean to an hourly value | Average SP pair → hourly mean (§3.4) |
| Error = forecast − actual, ±MAE band | Sign fine; symmetric band ignores tails | Keep sign; use empirical P05/P95 bands |
| No fetch validation | Naive API calls silently return latest data | Strict count/coverage assertions (§8) |
| Light UI, 2 tabs | Fine but generic; no method page | Dark ops theme, 3 screens, method page |
| Forecast rows filtered to 0–48 h at ingest | Drops useful vintages; analyses hard to extend | Store all issues; filter at query time |
