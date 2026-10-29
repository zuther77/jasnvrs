# Submission checklist

Status legend: `[ ]` todo · `[x]` done · `[~]` done by the build, needs a human action.

## 1. Repository

- [x] Public repo content ready (anonymous name required by the challenge — rename the repo
      before publishing if the current folder name is not suitably random).
- [x] README has: file/directory map, how to start, deployed-app link placeholder,
      AI-tools disclosure, method, findings, API pointer.
- [x] 61 backend tests, frontend typecheck/build/tests green.
- [x] Docker image builds and serves API + UI (`docker compose up --build`).
- [x] Vercel config + serverless entry present (`vercel.json`, `api/index.py`).
- [x] Push to GitHub under the anonymous repo name.

## 2. Deployment

- [ ] `vercel --prod` from the repo root (or connect the repo in the Vercel dashboard).
- [ ] Paste the production URL into the README "Live app" line.
- [ ] Open the URL in an **incognito** window: Overview, Decision Day (pick 5 Jan), Method.
- [ ] Confirm `GET /api/meta` returns counts 1488 / 18688 / 256 / 73 / 8 / 31 / 744.
- [ ] (Optional) set `ADMIN_SYNC_TOKEN` in Vercel env; otherwise sync returns 503 and the demo
      stays read-only — this is expected.


