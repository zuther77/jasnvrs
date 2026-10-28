# Demo video script — two parts, under 10 minutes

Target: Part 1 ≤ 4.5 min (client pitch), Part 2 ≤ 4.5 min (tech-lead walkthrough).
Record against the deployed URL. All numbers below are the real January-2026 values.

Visual key: `slide:x` = title/overlay slide, `app:overview` = Overview tab,
`app:decision:DATE` = Decision Day with that decision date, `app:method` = Method tab,
`code:FILE` = source excerpt.

---

## Part 1 — Customer pitch (≈4.5 min)

### Shot 1 — `slide:title` (0:00–0:20)

"Thanks for your time. This is the Wind Forecast Insights Portal — the pilot we built for your
day-ahead desk. It answers two questions your team faces every morning: how much wind should we
expect tomorrow, and how much can we trust that number before we bid."

### Shot 2 — `app:overview` (0:20–1:20)

"This is January 2026: 31 decision days, 744 delivery hours. The headline: the forecast you
could actually act on was off by **2,013 MW** in a typical hour — 17.8% of mean wind. It ran
**high by 1,730 MW**, and **84% of hours** were shortfall hours. The takeaway sentence is
generated from the data; nothing here is hand-written. The charts show the daily error, the
hour-of-day profile with a 5–95% error band, and how error grows with horizon — from about
1,700 MW at six hours to 2,300 MW at two days."

### Shot 3 — `app:decision:2026-01-05` (1:20–2:30)

"Pick a decision date. Here is the 5th of January, for delivery on the 6th. The header is the
part that matters: gate closure was 09:50, and the forecast shown is the **09:30 issue** — the
latest one published before the gate, 20 minutes ahead. Not a later, better forecast.

Four energy cards: 275 GWh expected versus 227 GWh delivered. The amber line is the forecast you
had; the blue dashed line is what wind actually did; the grey band is the historical 5–95%
actual range for each hour. Red shading is the shortfall you had to cover. Below, the fan shows
all eight issues published that day — four were available before the gate; four came after and
were not knowable at decision time."

### Shot 4 — `app:decision:2026-01-27` (2:30–3:10)

"The 27th was the hardest day of the month: an average miss of 5,375 MW. On days like this the
gap has to be bought at short notice. The point of showing the band and the percentiles is that
your desk can size cover in advance instead of discovering the gap in real time."

### Shot 5 — `app:method` (3:10–3:50)

"Every number is defined on the Method page, including the honest caveat: the forecast series
sits about 15% above metered outturn overall. Some of that gap may be metering scope or
curtailment rather than forecast skill. We show it as a descriptive statistic, not a skill score
— that distinction matters when you set procurement margins."

### Shot 6 — `slide:value` (3:50–4:30)

"What you get: the exact vintage you could have traded on, a quantified error distribution by
day and hour, and a defensible basis for a buffer. Next steps would be live daily updates, demand
and prices, and a price-aware margin recommendation. Thank you."

---

## Part 2 — Tech lead walkthrough (≈4.5 min)

### Shot 1 — `slide:architecture` (0:00–0:40)

"A deliberately small architecture. A seed script pulls January 2026 from Elexon BMRS into
SQLite and commits it with raw provenance. FastAPI reads only that database and serves six
contract endpoints. React with Vite and Recharts consumes them through a single-origin API. One
multi-stage Docker image serves the built bundle and the API; the same app deploys to Vercel as
static hosting plus a Python function."

### Shot 2 — `slide:rules` (0:40–1:30)

"Four rules drive correctness. One: the window is defined by **decision dates**; delivery is
decision plus one day. Two: gate closure is delivery minus one day at **09:50Z**, and the gate
issue is the latest `WINDFOR` publication at or before that — the 09:30 issue, not 09:00.
Using decision-date minus one would silently select a stale vintage. Three: forecasts are
hourly, actuals half-hourly, so the hourly actual is the mean of the SP pair. Four: error is
forecast minus actual, positive meaning over-forecast."

### Shot 3 — `code:backend/app/bmrs.py` (1:30–2:10)

"The Elexon client has a trap worth calling out: `WINDFOR` accepts only publication-time params.
If you pass a target-time filter it ignores it and returns the latest data with HTTP 200 — no
error. So the ingest validates counts and coverage: 1,488 actuals, 18,688 forecast rows, 256
issues, 73 points each, and 24 of 24 delivery hours covered for every decision day. A wrong call
fails loudly here instead of quietly producing wrong charts."

### Shot 4 — `code:backend/app/metrics.py` + `service.py` (2:10–2:50)

"Business logic is pure functions: gate-issue selection, SP-to-hourly alignment, metrics with a
500 MW MAPE guard, empirical percentiles, energy totals, horizon buckets and issue-time buckets.
The service layer assembles the frozen contract responses and caches by database mtime, so admin
sync is visible on the next GET without a restart. GETs never touch BMRS — verified by running a
second instance with an unreachable upstream while the API stayed green."

### Shot 5 — `app:overview` + `frontend/src/api` (2:50–3:30)

"The frontend is TypeScript with a typed client generated by hand from the contract. It treats a
missing endpoint as a **waiting state**, not as a reason to invent numbers: every panel names the
endpoint and retries. I tested it by stopping the API mid-demo — the UI shows no numbers at all,
then recovers when the API returns. Shape guards throw on contract drift rather than coercing
data. Charts are Recharts with accessible data tables under each figure."

### Shot 6 — `slide:tests` (3:30–4:10)

"61 backend tests cover hand-computed metrics, gate-selection edge cases including the 09:30 vs
07:30 decision, ingest validation including a real data quirk — one 12:25 issue on 15 January —
and every API shape. Frontend has typecheck, production build and three smoke tests including the
no-data waiting state. The acceptance suite runs curl+jq assertions on every anchor, and the
Docker image is the same artifact that serves the demo."

### Shot 7 — `slide:practices` (4:10–4:40)

"Practices: contract-first parallel build with file ownership, no mocks in production code, small
commits, documented assumptions and known quirks, and the null result stated plainly — the bias
may partly be a metering artifact. To run it: docker compose up, or the README's local dev path.
Thanks for reviewing."
