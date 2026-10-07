# Testnet deployment — BOT 968 (LIVE)

Deployed by agent via `forge script`, operator wallet (faucet-funded, 10 tBOT).

- Deployer: `0x39cDB726FD7be38c2245B2360caa04548084ce9C`
- Chain: 968 (`eth_chainId` → `0x3c8`), RPC `https://rpc.bohr.life`
- Explorer `https://scan.bohr.life`: both pages HTTP 200
- Faucet `https://faucet.botchain.ai/basic`: HTTP 200

## Contracts

| Contract | Address | Deploy tx | Explorer |
|---|---|---|---|
| MeshRegistry | `0x34fe318f9450fb4e27b2a975f3a2a2ee42e04d78` | `0xc3b6b9538190b9210d43d898ef6cfb3439c475d014cea7ec12b2ff5bef61b118` | https://scan.bohr.life/address/0x34fe318f9450fb4e27b2a975f3a2a2ee42e04d78 |
| EpochLedger | `0x1800aC7B1827D137E80400be25afDD15f401fb2e` | `0x6fa2a4ae2a269c6c90dbb2ef236443bc3ba3a2b644d372b3d5dccb500327fcc5` | https://scan.bohr.life/address/0x1800ac7b1827d137e80400be25afdd15f401fb2e |

Verified on-chain: both return runtime bytecode via `eth_getCode`;
`operator()` on both = deployer address. `forge test` 6/6 green pre-broadcast.

## Wiring (operator)

Set in `coordinator/.env` (never commit):

```
REGISTRY_ADDRESS=0x34fe318f9450fb4e27b2a975f3a2a2ee42e04d78
LEDGER_ADDRESS=0x1800ac7b1827d137e80400be25afdd15f401fb2e
OPERATOR_PRIVATE_KEY=0x… (testnet-only wallet, keep secret)
```

## Genesis epoch (LIVE, settled by agent)

- Epoch `497585` (hourly UTC bucket), closed via coordinator `POST /api/epochs/close`
- Tx `0x6682394a05263e04b61594ca88acca127c78245bd06ff0ad2eadcac57c271e7f` — block `25932220`, status success — https://scan.bohr.life/tx/0x6682394a05263e04b61594ca88acca127c78245bd06ff0ad2eadcac57c271e7f
- Root `0x0decfb526f9cf93e1f474c0395c16680415f76b8bb332f905810e1d6fbbeab1e`, evidence `0xbf3f9cdcbc97e3a80877af19cc28509b859439cd1aa2740b63ce5fd3d6c47b8b` — both match on-chain `merkleRoot()`/`evidenceHash()` reads; evidence JSON recomputes clean (canonical/hash/root all true)
- Contents: genesis test node `0x35af…b8c` (registered on-chain tx `0xb4a2…8423`, `eligible()=1`), 204,800 bytes / 1 job → net 2 / up 0; one malformed pre-validation row skipped and reported (led to the nodeId-validation fix below)
- Coordinator persists it in `data/relaymesh.sqlite` — verified present after restart

Live-found fixes shipped in the same session: `nodeId` format validation at ingestion (`400` on malformed), JSON error middleware (no HTML stack traces), epoch builder skips non-bytes32 ids instead of crashing, double-close returns `409`.

```bash
cd RelayMesh
PORT=3001 ADMIN_TOKEN=... BUYER_API_KEY=... BOT_RPC_URL=https://rpc.bohr.life \
LEDGER_ADDRESS=0x1800ac7b1827d137e80400be25afdd15f401fb2e \
REGISTRY_ADDRESS=0x34fe318f9450fb4e27b2a975f3a2a2ee42e04d78 \
OPERATOR_PRIVATE_KEY=0x... npm --workspace coordinator run start
```

## Pilot allowlist (operator choice, test phase)

- `example.com` — connectivity smoke tests
- `httpbin.org` — structured fetch validation (`/get`, `/bytes/N`)

Real buyer domains get added via the operator allowlist flow (§6.4 plan:
path-prefix rules → category policies → buyer tiers). No other hosts served.

## Name

Product name: **RelayMesh** (confirmed). Monorepo already uses `@relaymesh/*`.
