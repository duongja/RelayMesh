# RelayMesh — Idle Bandwidth for Public Web Data on BOT Chain

Monorepo. Testnet only. No real money. No ForecastArena dependency.

```
RelayMesh/
  contracts/    Foundry — MeshRegistry + EpochLedger (BOT testnet 968)
  shared/       Types, hashing, Merkle, epoch schema + geo/task/quorum helpers
  coordinator/  Operator backend — registry, jobs, extractor, /observe, epoch poster, dashboard API
  node/         Sharer client — heartbeat + job worker (CLI)
  mcp/          observe_web tool for AI agents (stdio MCP server → /observe)
  web/          Dashboards — sharer / public network / operator
  docs/         Specs + disclosure drafts
```

Spec: `../MVP_SPEC.md` (repo root) — read it first.

## Quickstart (MVP)

```bash
# 1. contracts
cd contracts && forge build && forge test

# 2. coordinator (needs Postgres or SQLite path in .env)
cd ../coordinator && npm install && npm run dev

# 3. node (needs login code from coordinator)
cd ../node && npm install && npm run dev -- login --code <CODE>

# 4. web
cd ../web && npm install && npm run dev
```

Network: BOT Testnet — chain 968, RPC `https://rpc.bohr.life`,
explorer `https://scan.bohr.life`, faucet `https://faucet.botchain.ai/basic`.

## Rules

- Outbound-only. Allowlist domains only. Public data only.
- Points only in MVP. No token, no payouts.
- One node per residential IP per epoch. Datacenter ASNs rejected.
