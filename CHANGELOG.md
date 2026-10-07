# Changelog — RelayMesh

## Unreleased — token rewards end-to-end (verified live)

- MeshToken (tRELAY, 1M fixed) + MeshRewards (Merkle distributor) live on
  BOT testnet 968; epoch 497604 closed + funded (10 tRELAY pool), 8.333 tRELAY
  claimed by a throwaway wallet, balance verified on-chain
- Pro-rata shares, sorted-pair v2 leaves (wallet+epoch bound), proof endpoint,
  auto-approve funding, MetaMask Rewards view with Claim + chain switch

## v0.1.0 — testnet pilot (2026-10-07)

First releasable cut. BOT testnet only. No real money, no tradable token.

**Network (live on BOT testnet 968)**
- `MeshRegistry` + `EpochLedger` deployed and verified
  (`0x34fe…` / `0x1800…`, [explorer](https://scan.bohr.life))
- Genesis epoch 497585 settled on-chain (tx `0x6682…`, block 25932220),
  evidence independently recomputed

**Supply (node client)**
- CLI heartbeat + job worker, outbound-only, 2 MB / 8 s caps
- Self-declared geo tags (`CC-City`), allowlist enforced client-side too

**Coordination (operator backend)**
- Registry, job queue with completion index, hourly Merkle epochs + evidence,
  SQLite persistence (survives restarts), abuse rails (denylist, 1-IP-1-node
  flags, pause switch, dispute queue), nodeId validation + JSON errors

**Observation layer (the product pivot)**
- `POST /api/observe` — geo-routed quorum observations for AI agents
- `check_price` task, Kenya pilot merchants (Jumia, Kilimall, Jiji, Masoko)
- Confidence computed from agreement (never asserted); verified live 2/2 → 0.9
- `observe_web` MCP tool (stdio) for Claude/agent frameworks

**Consumer app**
- Dark dashboard: connection status + settlement countdown, Network/Uptime
  points, epoch proofs with evidence/transaction links, 3-step onboarding with
  browser-local node connect, operator panel, hash-routed views

## Unreleased — PWA lite nodes
- Installable PWA (`manifest` + offline-shell SW + icons): one-tap Connect
  (wallet + city), heartbeat loop while open, one-tap Disconnect
- Browser nodes earn uptime only; coordinator excludes them from relay
  assignment (honest 503 when no desktop nodes in geo); `nodesBrowser` in status
- `POST /api/nodes/register` mints nodeIds server-side; nodeId/geo validation
  at ingestion; JSON error middleware
