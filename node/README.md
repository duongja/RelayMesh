# node

Sharer client (CLI, MVP).

```bash
npm install
cp .env.example .env   # set NODE_GEO=CC-City, e.g. KE-Nairobi
npm run dev -- login --code <CODE>   # prints node id + consent
npm run dev -- work                   # heartbeat + job worker (observe tasks)
npm run dev -- fetch https://example.com   # manual relay test (allowlisted hosts only)
```

Limits: 2 MB body, 8 s timeout, 30 s heartbeat. No inbound ports.
