# coordinator

Operator backend. In-memory stores in MVP — swap for Postgres in W3.

```bash
npm install
cp .env.example .env
npm run dev  # :3001
```

Endpoints: `GET /health`, `GET /api/status`, `POST /api/nodes/heartbeat`,
`POST /api/buyer/fetch` (x-api-key), `GET /api/epochs`, `POST /api/epochs/close` (Bearer admin).
