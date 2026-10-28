# Wind Forecast Insights Portal

A web app for a UK utility's day-ahead trading desk. It answers two questions the desk faces
every morning before the N2EX day-ahead auction closes:

1. **What wind forecast could we actually act on?** For each January-2026 purchase decision,
   the app shows the latest Elexon `WINDFOR` issue published before the **09:50 GMT gate
   closure** — the 09:30 issue, 20 minutes before the gate — not a later, hindsight forecast.
2. **How wrong has that forecast been?** The app quantifies accuracy against settled `FUELHH`
   wind outturn: MAE, RMSE, bias, MAPE, error percentiles, per-day and per-hour breakdowns,
   and how error grows with forecast horizon.

Built with **React + Vite + TypeScript** (frontend) and **Python + FastAPI + SQLite** (backend),
containerised with Docker, and deployable to Vercel 

**Live app:** https://gridbrick-challenge.vercel.app/

> **AI tools were used** to build this project: planning, code, tests, documentation and the
> demo script were produced with **Hermes Agent (Nous Research)** as an agentic developer,
> with a human directing scope and reviewing output.


## How to start

**Docker (recommended — same as production):**

```bash
docker compose up --build
# open http://localhost:8000
```




