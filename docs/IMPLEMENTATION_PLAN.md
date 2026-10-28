# Implementation Plan — Wind Forecast Insights Portal

Hard budget: **≤ 16 hours total** (per the challenge). Phases below sum to 15.5 h,
leaving 0.5 h buffer. Each phase has a Definition of Done (DoD). Work strictly top-down;
anything marked *(stretch)* is only attempted if its phase finished early.

## Phase overview

| # | Phase | Est. | Output |
|---|-------|------|--------|
| 0 | Scaffold + tooling | 1.0 h | repo skeleton, make targets, CI lint gate |
| 1 | Data ingestion | 2.0 h | `fetch_data.py`, SQLite DB, validation report |
| 2 | Metrics engine | 2.5 h | metric functions + pytest suite |
| 3 | API | 2.0 h | FastAPI routes + tests + /docs |
| 4 | Frontend | 5.0 h | 3 screens, wired to API |
| 5 | Docker + deploy | 1.5 h | Dockerfile, compose, Vercel deploy live |
| 6 | README + video + submit | 1.5 h | all deliverables shipped |

## Execution mode (current build)

Two parallel agent workstreams coordinated by an orchestrator agent:

- **Backend stream** owns `backend/`, `scripts/`, `data/`, `api/` — ingestion, metrics, API,
  tests, local server on :8000.
- **Frontend stream** owns `frontend/` — Vite/React/TS UI on :5173 (proxy `/api` → :8000).
- **Orchestrator** freezes the API contract and work orders before the streams start, and
  reviews both outputs against the spec afterwards.
- Coordination protocol: shared status/blocker logs, file ownership (no cross-editing), and
  **no mocked data** — the frontend only wires real API responses; sections whose endpoint is
  not ready render an explicit "waiting for API" state, never invented numbers.

This mirrors the human 16 h plan; phases map 1:1 to the streams' scope.

---

## Phase 0 — Scaffold + tooling (1.0 h)

```
<anonymous-repo>/            # random name like "kdhqmwr" per challenge
├── backend/
│   ├── app/main.py          # FastAPI app + static serving
│   ├── app/api.py           # routes (from §6 of the spec)
│   ├── app/metrics.py       # pure metrics functions
│   ├── app/bmrs.py          # httpx BMRS client
│   ├── app/config.py        # window + gate closure constants
│   ├── app/tests/           # pytest fixtures: tiny DB + known series
│   ├── scripts/fetch_data.py
│   ├── Dockerfile (backend, multi-stage)
│   └── pyproject.toml
├── frontend/
│   ├── src/App.tsx, src/pages/{Overview,DecisionDay,Method}.tsx
│   ├── src/components/{KpiCard, ForecastChart, DailyMaeChart, HourProfileChart, ErrorScatter, VintageFan}
│   ├── src/api.ts           # typed fetch client generated from Pydantic models
│   └── package.json (Vite + React + TS)
├── data/portal.db (seeded)  + data/raw/ (JSON provenance)
├── docker-compose.yml, Makefile, README.md, .github/workflows/ci.yml
```

Tasks:
- Vite React-TS app + FastAPI skeleton; `make dev` (compose hot-reload), `make build`,
  `make verify` (lint + pytest + vitest build).
- CI: single GitHub Actions job — ruff + pytest + `npm run build` (fast, <3 min).
- Doc conventions: every module gets a 2-3 line docstring saying which spec section it
  implements (helps the tech-lead walkthrough).

DoD: `docker compose up` boots empty API + skeleton UI on :5173/:8000; CI green.

## Phase 1 — Data ingestion (2.0 h)

- `app/bmrs.py`: httpx client with retry (3×, exp. backoff + jitter), explicit params
  (`settlementDateFrom/To` + `fuelType` for FUELHH; `publishDateTimeFrom/To` for WINDFOR),
  and **strict response validation** — a naive call without correct params silently returns
  *today's* data instead of an error (discovered while probing); validation must therefore
  assert record counts/ranges, not just HTTP 200:
  - FUELHH: exactly 31×48 WIND rows; settlement dates 2026-01-02…2026-02-01; each SP 1…48 once.
  - WINDFOR: 32 publish days × 8 issues × 73 hourly points; issue times within the expected
    set; every decision day's gate-closure issue (D-1 ≤09:50Z) covers delivery day 24/24 hours.
- `scripts/fetch_data.py`: idempotent upsert into SQLite (`actuals`, `forecasts`), `--check`
  dry-run mode, writes `data/raw/*.json` provenance, prints validation summary.
- Commit `data/portal.db`.

DoD: `make fetch` produces the DB; `--check` prints PASS with counts (expected: 1,488 / 18,688);
re-run is a clean no-op.

## Phase 2 — Metrics engine (2.5 h)

Pure functions in `app/metrics.py` (no I/O), operating on loaded DataFrames:

1. `sp_to_hourly(actuals)` — 30-min → hourly means (SP pair averaging), with bridge
   period guards (none needed in Jan; assert 24 rows/day × 31 days).
2. `gate_closure_issue(forecasts, decision_date)` — latest `publishTime ≤ D-1 09:50Z`;
   returns issue id + its 24 hourly values for delivery day. Edge: issue missing → explicit
   exception surfaced as an API 422, never silent fallback.
3. `join_day(forecast, actuals)` → per-hour records `{hour, forecast, actual, error}`.
4. `day_metrics(rows)` — MAE, RMSE, bias, MAPE (≥500 MW guard), max shortfall (+hour).
5. `window_metrics(all_days)` — overall stats; per-hour-of-day error distribution
   (mean + P05/P50/P95); per-day MAE series; error percentiles per day for decision notes.
6. `lead_time_table(forecasts, actuals)` — **required** (promoted after prior-art review):
   MAE/RMSE by 6-hour horizon bucket (0–6 … 42–48) and by issue time-of-day
   (02:30 … 09:30) using the vintages we already store.
7. `energy_totals(rows)` — forecast MWh (Σ hourly MW), actual MWh (Σ 30-min MW × 0.5),
   avg/peak/low forecast, GWh formatting helpers on the frontend.

Tests (pytest, hand-computed fixtures): known small series for every metric (including
sign conventions), SP aggregation, gate-closure selection (incl. "09:30 vs 07:30" and
missing-issue cases), MAPE guard behaviour. ~15 tests.

DoD: `pytest` green; metrics on the real DB reproduce the manually-computed Jan 5 numbers
(MAE ≈ 1,064 MW / RMSE ≈ 1,262 MW / bias ≈ +31 MW under error = forecast − actual) —
recorded in test as integration check.

## Phase 3 — API (2.0 h)

- Routes per spec §6 (`/api/meta`, `/api/days`, `/api/days/{date}`,
  `/api/forecast/{date}`, `/api/summary` incl. `by_horizon` + `by_issue_time` + energy
  totals, `POST /api/admin/sync`).
- Pydantic response models; serve React build from FastAPI `StaticFiles` mount; OpenAPI at
  `/docs`.
- Compute per request with a small process-local cache (module-level dict keyed by
  DB mtime) — dataset is tiny (<20k rows), pandas ops are ms-scale; no Redis needed.
- `/api/admin/sync` guarded by `X-Admin-Token` env.
- API tests: fixture DB → assert shapes/one-day correctness/window completeness.

DoD: curl round-trip for all endpoints matches the spec table; `/docs` renders;
`TestClient` suite green.

## Phase 4 — Frontend (5.0 h)

Timebox per screen — spend the most on 7.2 (Decision Day), it is the demo centerpiece.

1. **(0.5 h) Shell**: dark tokens, top nav (Overview / Decision Day / Method), as-of badge
   from `/api/meta`, typed `api.ts` client, error/loading states skeleton.
2. **(1.5 h) Overview**: KPI cards + 4 charts (daily MAE **and bias** lines; hour-of-day
   error profile with P05/P95 band; **error-by-horizon bars**; forecast-vs-actual scatter).
   Auto-generated takeaway sentence from `/api/summary`.
3. **(2.5 h) Decision Day**: date stepper (1 of 31, keyboard accessible); context header
   (dates, gate closure, issue used, "forecast as known at" pill); **energy row (forecast
   vs actual GWh, avg/peak/low)**; main forecast-vs-actual chart with error ribbon +
   historical P05/P95 band; vintage fan of all 8 D-1 issues; per-day metric row; decision
   note percentiles ("worst 2h of the month" badges).
4. **(0.5 h) Method page**: render definitions/assumptions from `/api/meta` (single source
   of truth so text never drifts from code) + **plain-language glossary** and the
   measurement caveat callout.
5. **(1.0 h) Polish pass**: chart a11y (aria summaries + data tables under charts), focus
   states, empty/edge states (Feb 1 "incomplete" flag), mobile/tablet responsive check,
   favicon + page titles.

DoD: all screens real-data-wired; Vitest smoke tests (2) pass; Lighthouse a11y ≥ 90 on
Overview and Decision Day.

## Phase 5 — Docker + Heroku deploy (1.5 h)

- Single multi-stage Dockerfile (node build → python runtime, non-root user, CMD uvicorn
  on $PORT); docker-compose for dev; .dockerignore.
- **Vercel (primary)**: `vercel.json` + `api/index.py` entry bundling `backend/` + `data/`;
  static React build. `vercel --prod`, verify cold start and all endpoints.
- **Docker**: multi-stage image; `docker compose up` parity check.
- Heroku container stack documented as alternative (`heroku container:push web`).
- Smoke test prod URL (all endpoints + UI); document rollback = previous image.

DoD: deployed URL serves the app with January data; incognito check passes;
README deployment section filled in.

## Phase 6 — README + video + submission (1.5 h)

1. README (30 min): directory map, quickstart (`docker compose up`), deployed URL, data
   interpretation note (decision-window boundaries + hourly alignment), AI-tools disclosure
   (required by challenge), metrics dictionary link, screenshots.
2. **Video script** (`docs/video-script.md`, shot-by-shot) then video ≤ 10 min, unlisted
   YouTube (45 min total for script + recording):
   - Part 1 (≈4.5 min, client pitch): story (uncertainty → margin), Overview takeaway,
     one Decision Day walkthrough, method/credibility slide, limitations honesty.
   - Part 2 (≈4.5 min, tech lead): architecture diagram, BMRS pitfalls found
     (query-by-publishTime; hourly-vs-half-hourly), metrics tests, CI, repo tour,
     design-decision tradeoffs (analogy: "evaluate the vintage you could have used").
   - Record in one take per part; script bullet-first; demo environment = deployed URL.
3. **Screenshots** of all 3 screens for the README (10 min, part of the README step).
4. Submission form + checklist (15 min): repo public under anonymous name, form fields,
   **open every URL in incognito and verify** (repo readable, app loads, video reachable,
   form submitted; save confirmation screenshot).

DoD: form submitted; all checklist items ticked in the repo under docs/SUBMISSION.md.

---## Risks & mitigations

| Risk | Likelihood | Mitigation |
|---|---|---|
| Heroku deploy friction (account/limits) | Medium | Fallback documented (any container host; Vercel serverless variant); test deploy in Phase 5, not at the end |
| Scope creep (more analytics) | High | Spec §4 is frozen; stretch items explicitly cut first; anything beyond → README "future work" |
| BMRS API change/breakage mid-build | Low | DB is committed; app works offline of BMRS for demos |
| Chart polish eating frontend hours | Medium | Timeboxes per screen; ship matplotlib-caliber simplicity, not bespoke visuals |
| 16 h overrun | Medium | Phase DoD gates; cut order: lead-time analysis → scatter → vintage fan → CI in favour of required deliverables |

## Acceptance criteria (final gate)

- [ ] All four required product behaviours: shows gate-closure-used forecast per decision
      day; shows all D-1 vintage options; quantifies forecast error (MAE/RMSE/bias/MAPE +
      quantile bands); covers all 31 January decision days.
- [ ] Data pipeline validated (counts + coverage) and reproducible from scratch.
- [ ] Docker: `docker compose up` → working app; Heroku URL public in README.
- [ ] Tests pass; CI green on public repo.
- [ ] README complete incl. AI-tools disclosure.
- [ ] Unlisted YouTube video ≤ 10 min with both parts.
- [ ] Submission form completed; every URL verified in an incognito window.
