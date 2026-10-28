# Frontend — Wind Forecast Insights Portal

React 18 + Vite + TypeScript + Recharts + Tailwind. See the repository root
[`README.md`](../README.md) for the product overview, data method, and full quickstart.

```bash
npm install
npm run dev        # http://127.0.0.1:5173, proxies /api to http://127.0.0.1:8000
npm run typecheck
npm run build
npm test
```

The UI consumes only the live API (`/api/...`, same origin). There is no mock data in
production code; tests use fixtures under `src/test/` exclusively. Design tokens live in
`src/index.css` and `tailwind.config.js`; the typed client is `src/api/types.ts` mirrored from
`docs/orchestration/API_CONTRACT.md`.
