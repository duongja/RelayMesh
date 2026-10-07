import { Router } from "express";
import { createPublicClient, createWalletClient, defineChain, http, isAddress, parseAbi, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { authed, store } from "../index.js";
import { leafHash, merkleRoot, evidenceHash, canonicalJson, computePoints, isNodeId, EPOCH_SCHEMA, type NodeTotals, type EpochEvidence } from "@relaymesh/shared";

const r = Router();

function epochIdNow() { return Math.floor(Date.now() / 3_600_000); }

const botTestnet = defineChain({
  id: 968,
  name: "BOT Testnet",
  nativeCurrency: { name: "Test BOT", symbol: "tBOT", decimals: 18 },
  rpcUrls: { default: { http: [process.env.BOT_RPC_URL || "https://rpc.bohr.life"] } },
  blockExplorers: { default: { name: "BOTScan", url: "https://scan.bohr.life" } },
  testnet: true,
});

const LEDGER_ABI = parseAbi(["function closeEpoch(uint256 epochId, bytes32 root, bytes32 evidence)"]);

// GET /api/epochs — list closed epochs with tx + explorer links
r.get("/", (_req, res) => res.json(store.allEpochs()));

// GET /api/epochs/:id/evidence — exact canonical bytes hashed on-chain
r.get("/:id/evidence", (req, res) => {
  const e = store.getEpoch(Number(req.params.id));
  if (!e) return res.status(404).json({ error: "unknown epoch" });
  res.setHeader("Content-Type", "application/json");
  res.send(e.evidence);
});

// POST /api/epochs/close — operator: build root + evidence, broadcast closeEpoch().
// Requires LEDGER_ADDRESS + OPERATOR_PRIVATE_KEY in env (never committed).
r.post("/close", async (req, res) => {
  if (!authed(req)) return res.status(401).json({ error: "unauthorized" });
  const id = epochIdNow();
  // Defensive: pre-validation rows (or manual DB edits) with malformed ids can
  // never be hashed on-chain — skip and report instead of crashing the close.
  const skipped: string[] = [];
  const perNode: NodeTotals[] = [...store.allNodes()].flatMap(([nodeId, n]) => {
    if (!isNodeId(nodeId)) { skipped.push(nodeId); return []; }
    const pts = computePoints(n.bytes, n.beats);
    return [{
      nodeId,
      netPts: pts.netPts,
      upPts: pts.upPts,
      bytes: n.bytes,
      jobs: n.jobs,
    }];
  });
  if (skipped.length) console.warn(`epoch ${id}: skipped ${skipped.length} malformed node id(s)`);
  const root = merkleRoot(perNode.map(leafHash));
  const evidenceObj: EpochEvidence = {
    schema: EPOCH_SCHEMA,
    chainId: 968,
    epochId: id,
    startedAt: id * 3_600_000,
    endedAt: (id + 1) * 3_600_000,
    perNode,
    jobsSample: [],
    spotChecks: [],
    merkleRoot: root,
  };
  const evidence = canonicalJson(evidenceObj);
  const eHash = evidenceHash(evidence);

  const ledger = process.env.LEDGER_ADDRESS ?? "";
  const key = process.env.OPERATOR_PRIVATE_KEY ?? "";
  if (!ledger || !isAddress(ledger) || !/^0x[0-9a-fA-F]{64}$/.test(key)) {
    return res.status(503).json({ error: "broadcast not configured: set LEDGER_ADDRESS + OPERATOR_PRIVATE_KEY" });
  }
  try {
    const account = privateKeyToAccount(key as Hex);
    const publicClient = createPublicClient({ chain: botTestnet, transport: http() });
    if ((await publicClient.getChainId()) !== 968) {
      return res.status(502).json({ error: "RPC is not BOT testnet (968)" });
    }
    const walletClient = createWalletClient({ account, chain: botTestnet, transport: http() });
    const { request } = await publicClient.simulateContract({
      address: ledger,
      abi: LEDGER_ABI,
      functionName: "closeEpoch",
      args: [BigInt(id), root, eHash],
      account,
    });
    const hash = await walletClient.writeContract(request);
    const receipt = await publicClient.waitForTransactionReceipt({ hash, confirmations: 2, timeout: 45_000 });
    if (receipt.status !== "success") {
      return res.status(500).json({ error: "closeEpoch transaction reverted" });
    }
    store.saveEpoch(id, { root, evidenceHash: eHash, evidence, tx: hash });
    res.json({ epochId: id, root, evidenceHash: eHash, tx: hash, explorer: `https://scan.bohr.life/tx/${hash}` });
  } catch (e) {
    const full = e instanceof Error ? e.message.slice(0, 500) : "broadcast failed";
    const msg = full.split("\n")[0].slice(0, 200);
    if (/Closed/.test(full)) return res.status(409).json({ error: "epoch already closed on-chain", detail: msg });
    return res.status(500).json({ error: "broadcast failed", detail: msg });
  }
});

export default r;
