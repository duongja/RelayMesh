# RelayMesh — Agent Implementation Plan
Single monorepo. No human time estimates. Order is dependency-driven. A step starts
only when its inputs exist and its gate checks pass.

Legend: `IN` = required inputs, `OUT` = artifacts produced, `GATE` = verification
that must pass before dependents start.

## Step 0 — Freeze interfaces
IN: MVP_SPEC.md, existing scaffold.
OUT: `shared/src/index.ts` finalized (Job, JobResult, NodeTotals, EpochEvidence,
nodeIdFor, leafHash, merkleRoot, evidenceHash, urlHash), `docs/API.md` sketch.
GATE: `shared` typechecks; coordinator + node import only from `@relaymesh/shared`,
no duplicated types.
WHY FIRST: everything else depends on these shapes. Changing them later is the
most expensive rework.

## Step 1 — Contracts to testnet-ready
IN: Step 0 types.
OUT: `contracts/src/MeshRegistry.sol`, `src/EpochLedger.sol` final +
`test/Mesh.t.sol` covering register, double-register reject, eligibility toggle,
non-operator reject, closeEpoch once + double-close reject, zero-hash reject.
GATE: `forge build` clean, `forge test -vv` all pass. No `vm` hacks, no funds held.
NOTE: Deploy script exists but broadcast happens in Step 5, not here.

## Step 2 — Coordinator skeleton serving real state
IN: Step 0.
OUT: `coordinator/src/index.ts` + `routes/status|nodes|buyer|epochs` backed by a
`Store` interface with two impls: `MemoryStore` (now) and `SqliteStore` (added here,
file-backed so restarts keep heartbeats/points). Endpoints:
`GET /health`, `GET /api/status`, `POST /api/nodes/heartbeat`,
`POST /api/buyer/fetch` (allowlist enforced, 503 when zero nodes),
`GET /api/epochs`, `POST /api/epochs/close` (computes root + evidence hash,
no broadcast yet).
GATE: `tsc --noEmit` clean; curl sequence passes: heartbeat → status shows 1 online →
buyer fetch returns 202 ASSIGNED → epochs/close returns root + evidenceHash.
Parallel with Step 3 (shared types are the only coupling).

## Step 3 — Node CLI heartbeat + guarded fetch
IN: Step 0.
OUT: `node/src/index.ts`: `login` prints nodeId + consent, daemon loop beats every
30s with retry/backoff, `fetch <url>` enforces local allowlist + 2 MB / 8 s caps,
reports `{status, bytes, latencyMs}`. `.env.example` documented.
GATE: against Step 2 coordinator locally: login → daemon 3 beats observed in
coordinator status → manual fetch of allowlisted URL returns bytes → non-allowlisted
URL rejected client-side before network.
Parallel with Step 2.

## Step 4 — Local loop: node → coordinator → points → epoch
IN: Steps 2 + 3.
OUT: wiring: coordinator accepts JobResult ingestion (`POST /api/nodes/result`),
validates size/status, updates per-node bytes/jobs, computes Network/Uptime points
with MVP caps (500 net/day, 144 up/day). Epoch builder produces canonical
`relaymesh/epoch-v1` JSON, root via `merkleRoot`, hash via `evidenceHash`.
`GET /api/epochs/:id/evidence` returns exact bytes hashed.
GATE: end-to-end locally with 2 fake nodes: 10 jobs → points match hand-computed
values → epoch JSON recomputed root matches → evidence hash matches.
This is the last step before touching testnet.

## Step 5 — Testnet wiring (BOT 968)
IN: Steps 1 + 4.
OUT: `contracts/script/Deploy.s.sol` broadcast to `https://rpc.bohr.life`,
addresses in `coordinator/.env` + README. Coordinator `POST /api/epochs/close`
actually sends `closeEpoch(epochId, root, evidence)` via viem (simulate → sign →
2 confirmations), stores tx hash. Dashboard links to `scan.bohr.life`.
GATE: on testnet: register 1 node (`MeshRegistry.register` tx confirmed) →
close 1 epoch (`EpochLedger.closeEpoch` tx confirmed) → explorer URLs resolve →
evidence recomputation matches on-chain hashes. Faucet-funded operator wallet only.
If RPC/explorer unreachable: stop, do not proceed to web.

## Step 6 — Web dashboards (read-only first)
IN: Steps 4 + 5 (API + real epoch data).
OUT: `web/src`: Landing, Network (nodes online, MB relayed, latency, epoch table
with tx + evidence links), My Node (uptime, points, health), Operator (allowlist,
flags, epoch retry, pause-all). Proxy `/api/*` to coordinator. Banner everywhere:
testnet, points have no value.
GATE: `npm run build` clean; against local coordinator: Network page shows same
numbers as `/api/status`; epoch row links open explorer + evidence JSON that
recomputes to on-chain root.

## Step 7 — Abuse + safety rails
IN: Steps 4–6 working.
OUT: coordinator: ASN/datacenter reject list, 1-IP-1-node enforcement per epoch,
geo-jump flag, success-collapse flag, `setEligible(false)` path both off-chain and
on-chain, global pause switch, 7-day body retention then hash-only, dispute log.
Node: idle-aware pause (skip beat payload flag when saturated).
GATE: scripted abuse tests pass: datacenter IP rejected with reason; second node
same IP flagged; pause-all stops assignments in <60 s; evidence contains no raw
bodies older than retention.

## Step 8 — Pilot readiness (internal soak)
IN: Steps 5–7.
OUT: `docs/RUNBOOK.md`: deploy order, env vars, faucet refill, epoch retry,
allowlist change, takedown within 24 h, backup/restore of coordinator DB.
Soak: coordinator + 3 nodes + buyer simulator running uninterrupted; epoch closes
every hour with no missing roots.
GATE: 24 h continuous soak locally + 6 consecutive hourly epochs closed on testnet
with zero manual intervention. Any missed epoch → back to Step 4, not forward.

## Dependency graph
```
        Step 0
       /      \
   Step 1    Step 2 + Step 3 (parallel)
               \      /
               Step 4
                 |
               Step 5
                 |
               Step 6
                 |
               Step 7
                 |
               Step 8
```

## Stop conditions (do not work around)
- `forge test` red → stop, fix contracts before any backend work.
- Evidence recomputation mismatch → stop, fix canonical JSON before testnet.
- Testnet RPC or explorer down → stop, no web/abuse work on assumed chain state.
- Allowlist bypass found → pause-all, back to Step 7.

## Definition of done (MVP)
Coincides with spec §11 at small scale: multi-node local loop + hourly epochs on
BOT 968 with verifiable evidence + dashboards + abuse rails + runbook. No token,
no payouts, no mobile, no marketplace.
