# RelayMesh API (frozen for MVP build)

All types come from `@relaymesh/shared`. No duplicated shapes.
Evidence bytes hashed are always `canonicalJson(obj)` → `evidenceHash()`.

## Coordinator

- `GET /health` → `{ok:true}`
- `GET /api/status` → `{network:"BOT testnet 968", nodesKnown, nodesOnline, testnet:true}`
- `POST /api/nodes/heartbeat` body `HeartbeatPayload {nodeId, wallet, geo?}` → `{ok:true, eligible}`; 400 bad nodeId/geo; 403 `{ok:false, eligible:false, reason}` when IP matches `BLOCKED_PREFIXES`
- `GET /api/nodes/:id/job` → oldest pending assignment `{jobId, url, host, task, timeoutMs}`; `204` when none
- `POST /api/nodes/result` body `{nodeId, jobId, status, bytes, latencyMs}` → `{ok:true, credited, netPts?, upPts?}`
- `POST /api/buyer/fetch` header `x-api-key`, body `{url, geo?}` → `202 {jobId, url, host, nodeId, status:"ASSIGNED"}`; 400 host not allowlisted; 503 no nodes online / network paused

## Observations (§16, the product)

- `POST /api/observe` header `x-api-key`, body `{location: CC-City, url, task:"check_price", redundancy?: 1|2|3 = 2}`
  → waits ≤25s for node results → `{location, observedAt, task, consensus, confidence, observations:[{nodeId, value, latencyMs, bodyHash}], agreeing}`
  → `400` bad input / host not in pilot merchants; `401` bad key; `503` paused or no nodes in geo
- Confidence is computed from agreement (3/3→0.95, 2/2→0.9, 2/3→0.7, else null/0) — never asserted
- MCP: `mcp/` stdio server, tool `observe_web` → `POST /api/observe` (env `COORDINATOR_URL`, `RELAYMESH_API_KEY`)
- `GET /api/nodes/:id` → record + computed points
- `POST /api/nodes/dispute` body `{nodeId, reason}` → `201 {ok:true}` (48 h review SLA)
- `POST /api/nodes/admin/eligible` (Bearer admin) — mirrors on-chain `setEligible`
- `GET /api/admin/flags` (Bearer admin) → `{paused, duplicateIps:[{ip, nodeIds}]}` — 1-IP-1-node signal
- `POST /api/admin/pause {paused}` (Bearer admin) — kill-switch; buyer returns 503 while paused
- `GET /api/admin/disputes` (Bearer admin) → dispute queue
- `GET /api/epochs` → `{[epochId]: {root, evidence, tx?}}`
- `GET /api/epochs/:id/evidence` → exact canonical bytes hashed on-chain
- `GET /api/epochs/:id/proof/:nodeId` → claim inputs `{epochId, nodeId, wallet,
  netPts, upPts, bytes, amountWei, proof[], root, rewardsContract, tokenContract}`;
  `404` unknown epoch / no rewards / no share (added Step 4)
- `POST /api/epochs/close` header `Bearer ADMIN` → builds root + evidence, broadcasts
  `closeEpoch(epochId, root, evidenceHash)`, waits 2 confirmations →
  `{epochId, root, evidenceHash, tx, explorer}`; `401` bad token;
  `503` broadcast not configured (`LEDGER_ADDRESS` + `OPERATOR_PRIVATE_KEY`);
  `502` RPC not BOT 968; `409` epoch already closed; `500` revert/broadcast failure

## Hashing (shared)

- `nodeIdFor(wallet, installUUID)` = `keccak256("wallet:uuid")`
- `leafHash(NodeTotals)` = `keccak256(abi.encode(bytes32 nodeId, uint256 netPts, uint256 upPts, uint256 bytes))`
- `merkleRoot(leaves)` = sorted pairwise keccak (MVP)
- `evidenceHash(canonicalJson(EpochEvidence-minus-merkleRoot))`
- Points: `computePoints(bytes, beats)` — 1 net / 100 KB (cap 500/day), 1 up / 20 beats (cap 144/day)
