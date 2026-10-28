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

## 3. Video

- [ ] Record Part 1 (≤5 min) and Part 2 (≤5 min) using `docs/video-script.md`; total ≤10 min.
- [ ] Upload as **unlisted** YouTube.
- [ ] Open the video URL in an incognito window and confirm it plays without sign-in.
- [ ] Add the video link to the submission form (not required in the README).

## 4. Submission form

- [ ] Repo URL.
- [ ] Deployed app URL.
- [ ] Unlisted video URL.
- [ ] Any form fields about AI-tool usage — answer yes (see README disclosure).

## 5. Final verification (incognito)

- [ ] Repo loads for a logged-out user; README renders; screenshots visible.
- [ ] App loads and shows real January-2026 numbers on all three screens.
- [ ] Video plays.
- [ ] Screenshot or note the successful checks for your records.

## Known non-issues (do not "fix" before submitting)

- `2026-01-15` has a 12:25 WINDFOR issue instead of 11:30; the API normalises it; gate issue
  remains 09:30.
- `WINDFOR` issue spans vary (~ −12.5 h to +60 h); only the 73-point count and 24/24 coverage
  are asserted.
- The bias is strongly positive by design of the data (~1.15× level gap); the Method page
  carries the metering-scope/curtailment caveat.
