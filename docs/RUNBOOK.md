# RelayMesh Runbook (operator)

## Deploy order
1. `contracts/`: `forge build && forge test`; broadcast `Deploy.s.sol` to
   `https://rpc.bohr.life` (chain 968) with faucet-funded `OPERATOR_PRIVATE_KEY`.
   Record `REGISTRY_ADDRESS` + `LEDGER_ADDRESS`.
2. `coordinator/`: `npm install`; copy `.env.example` → `.env`; set
   `ADMIN_TOKEN`, `BUYER_API_KEY`, `REGISTRY_ADDRESS`, `LEDGER_ADDRESS`,
   `TOKEN_ADDRESS`, `REWARDS_ADDRESS`, `EPOCH_POOL_TOKENS` (tRELAY per epoch),
   `OPERATOR_PRIVATE_KEY` (only needed to broadcast closes/funds),
   `BLOCKED_PREFIXES` (datacenter ASN prefixes), `ALLOWED_ORIGINS`,
   `SQLITE_PATH=data/relaymesh.sqlite`.
   Run `npm run start`. One instance per DB + wallet.
3. Hourly settlement: `scripts/hourly-close.sh` with `COORDINATOR_URL` +
   `ADMIN_TOKEN` in env. Closes + funds shortly after each UTC hour boundary.
   Without it, epochs only close on manual `POST /api/epochs/close`.
3. `node/`: distribute binary + `NODE_WALLET`, `INSTALL_ID`, `COORDINATOR_URL`.
   Sharer runs `login`, confirms consent, leaves daemon on.
4. `web/`: `npm run build`, host statically, proxy `/api/*` to coordinator.

## Daily ops
- Faucet: keep operator wallet funded (`https://faucet.botchain.ai/basic`).
- Epochs: `POST /api/epochs/close` hourly (Bearer admin). Verify response
  `evidenceHash` matches `GET /api/epochs/:id/evidence` recomputation.
- Flags: `GET /api/admin/flags` — duplicate IPs → review → `setEligible(false)`
  off-chain + on-chain `MeshRegistry.setEligible`.
- Disputes: `GET /api/admin/disputes` — resolve within 48 h, log outcome.

## Incident: allowlist bypass or private-data exposure
1. `POST /api/admin/pause {"paused":true}` — halts assignments immediately.
2. Remove host from allowlist, rotate `BUYER_API_KEY`.
3. Review evidence + logs (7-day body retention, then hash-only).
4. Unpause only after fix + spot-check pass.

## Incident: missed epoch
1. Check coordinator logs + RPC (`eth_chainId` → `0x3c8`).
2. Retry `POST /api/epochs/close`; epoch stays PENDING and visible until posted.
3. Two consecutive misses → keep paused, investigate, do not backfill fake data.

## Backup
Coordinator DB (when SQLite lands: single file + WAL). It holds unrevealed
job state. Never publish DB, `.env`, or keys. Back up before upgrades.

## Full 24 h / 6-epoch soak (operator-run, not yet done)
Criteria: 24 h uninterrupted, 6 consecutive hourly `closeEpoch` txs confirmed on
`scan.bohr.life`, zero manual intervention, evidence recomputation green each hour.
Compressed functional soak (below) passed in-session; the calendar soak needs a host.
