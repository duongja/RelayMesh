import { Router } from "express";
import { createPublicClient, createWalletClient, defineChain, http, isAddress, parseAbi, parseEther, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { authed, store } from "../index.js";
import {
  leafHash, merkleRoot, evidenceHash, canonicalJson, computePoints, isNodeId,
  computeShares, rewardLeaf, rewardRoot, rewardProof,
  EPOCH_SCHEMA, type NodeTotals, type EpochEvidence, type RewardShare,
} from "@relaymesh/shared";

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
const REWARDS_ABI = parseAbi([
  "function fund(uint256 epochId, bytes32 root, uint256 amount)",
  "function epochs(uint256) view returns (bytes32 root, uint256 funded, uint256 claimed, bool exists)",
]);
const TOKEN_ABI = parseAbi([
  "function approve(address spender, uint256 value) returns (bool)",
  "function allowance(address owner, address spender) view returns (uint256)",
]);

function poolWei(): bigint {
  try {
    return parseEther(process.env.EPOCH_POOL_TOKENS ?? "100");
  } catch {
    return parseEther("100");
  }
}

// GET /api/epochs — list closed epochs with tx + explorer links
r.get("/", (_req, res) => res.json(store.allEpochs()));

// GET /api/epochs/:id/evidence — exact canonical bytes hashed on-chain
r.get("/:id/evidence", (req, res) => {
  const e = store.getEpoch(Number(req.params.id));
  if (!e) return res.status(404).json({ error: "unknown epoch" });
  res.setHeader("Content-Type", "application/json");
  res.send(e.evidence);
});

// GET /api/epochs/:id/proof/:nodeId — claim inputs for a node (leaf args + siblings)
r.get("/:id/proof/:nodeId", (req, res) => {
  const id = Number(req.params.id);
  const e = store.getEpoch(id);
  if (!e) return res.status(404).json({ error: "unknown epoch" });
  const rewardsAddr = process.env.REWARDS_ADDRESS ?? "";
  const tokenAddr = process.env.TOKEN_ADDRESS ?? "";
  let ev: EpochEvidence;
  try {
    ev = JSON.parse(e.evidence) as EpochEvidence;
  } catch {
    return res.status(500).json({ error: "corrupt evidence" });
  }
  if (!ev.rewards?.shares) return res.status(404).json({ error: "epoch has no rewards" });
  const idx = ev.rewards.shares.findIndex((s) => s.nodeId.toLowerCase() === req.params.nodeId.toLowerCase());
  if (idx === -1) return res.status(404).json({ error: "node has no share in this epoch" });
  const shares: RewardShare[] = ev.rewards.shares.map((s) => ({ ...s, amount: BigInt(s.amountWei) }));
  const leaves = shares.map((s) => rewardLeaf(id, s));
  const s = shares[idx];
  res.json({
    epochId: id,
    nodeId: s.nodeId,
    wallet: s.wallet,
    netPts: s.netPts,
    upPts: s.upPts,
    bytes: s.bytes,
    amountWei: s.amount.toString(),
    proof: rewardProof(leaves, idx),
    root: rewardRoot(leaves),
    rewardsContract: rewardsAddr || undefined,
    tokenContract: tokenAddr || undefined,
  });
});

// POST /api/epochs/close — operator: audit root to ledger + fund rewards root.
// Requires LEDGER_ADDRESS + OPERATOR_PRIVATE_KEY. Rewards funding additionally
// needs REWARDS_ADDRESS + TOKEN_ADDRESS + EPOCH_POOL_TOKENS (else audit-only).
r.post("/close", async (req, res) => {
  if (!authed(req)) return res.status(401).json({ error: "unauthorized" });
  const id = epochIdNow();
  // Defensive: pre-validation rows (or manual DB edits) with malformed ids can
  // never be hashed on-chain — skip and report instead of crashing the close.
  const skipped: string[] = [];
  const valid: [string, { wallet: string; bytes: number; beats: number; jobs: number }][] = [];
  for (const [nodeId, n] of store.allNodes()) {
    if (!isNodeId(nodeId)) { skipped.push(nodeId); continue; }
    valid.push([nodeId, n]);
  }
  if (skipped.length) console.warn(`epoch ${id}: skipped ${skipped.length} malformed node id(s)`);
  const perNode: NodeTotals[] = valid.map(([nodeId, n]) => {
    const pts = computePoints(n.bytes, n.beats);
    return { nodeId: nodeId as `0x${string}`, netPts: pts.netPts, upPts: pts.upPts, bytes: n.bytes, jobs: n.jobs };
  });
  const root = merkleRoot(perNode.map(leafHash));

  // Rewards shares: only nodes with valid EVM wallets; pro-rata of the pool.
  const pool = poolWei();
  const shareInputs = valid.flatMap(([nodeId, n]) => {
    if (!isAddress(n.wallet)) return [];
    const pts = computePoints(n.bytes, n.beats);
    return [{ nodeId: nodeId as `0x${string}`, wallet: n.wallet as Hex, netPts: pts.netPts, upPts: pts.upPts, bytes: n.bytes }];
  });
  const shares = computeShares(shareInputs, pool);
  const funded = shares.reduce((a, s) => a + s.amount, 0n);
  const leaves = shares.map((s) => rewardLeaf(id, s));
  const rRoot = rewardRoot(leaves);

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
    rewards: {
      poolWei: pool.toString(),
      fundedWei: funded.toString(),
      root: rRoot,
      shares: shares.map((s) => ({
        nodeId: s.nodeId, wallet: s.wallet, netPts: s.netPts, upPts: s.upPts,
        bytes: s.bytes, amountWei: s.amount.toString(),
      })),
    },
  };
  const evidence = canonicalJson(evidenceObj);
  const eHash = evidenceHash(evidence);

  const ledger = process.env.LEDGER_ADDRESS ?? "";
  const key = process.env.OPERATOR_PRIVATE_KEY ?? "";
  if (!ledger || !isAddress(ledger) || !/^0x[0-9a-fA-F]{64}$/.test(key)) {
    return res.status(503).json({ error: "broadcast not configured: set LEDGER_ADDRESS + OPERATOR_PRIVATE_KEY" });
  }
  const rewardsAddr = process.env.REWARDS_ADDRESS ?? "";
  const tokenAddr = process.env.TOKEN_ADDRESS ?? "";
  const rewardsOn = rewardsAddr && isAddress(rewardsAddr) && tokenAddr && isAddress(tokenAddr);
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

    // Fund rewards (skip cleanly when unconfigured or nothing earned).
    let rewardsTx: string | undefined;
    let rewardsNote: string | undefined;
    if (!rewardsOn) {
      rewardsNote = "rewards skipped: set REWARDS_ADDRESS + TOKEN_ADDRESS";
    } else if (funded === 0n) {
      rewardsNote = "rewards skipped: no points earned this epoch";
    } else {
      const allowance = (await publicClient.readContract({
        address: tokenAddr, abi: TOKEN_ABI, functionName: "allowance", args: [account.address, rewardsAddr],
      })) as bigint;
      if (allowance < funded) {
        const { request: approveReq } = await publicClient.simulateContract({
          address: tokenAddr, abi: TOKEN_ABI, functionName: "approve", args: [rewardsAddr, funded], account,
        });
        const approveHash = await walletClient.writeContract(approveReq);
        await publicClient.waitForTransactionReceipt({ hash: approveHash, confirmations: 1, timeout: 45_000 });
      }
      const { request: fundReq } = await publicClient.simulateContract({
        address: rewardsAddr, abi: REWARDS_ABI, functionName: "fund", args: [BigInt(id), rRoot, funded], account,
      });
      const fundHash = await walletClient.writeContract(fundReq);
      const fundReceipt = await publicClient.waitForTransactionReceipt({ hash: fundHash, confirmations: 2, timeout: 60_000 });
      if (fundReceipt.status !== "success") {
        return res.status(500).json({ error: "rewards fund transaction reverted", tx: hash });
      }
      rewardsTx = fundHash;
    }

    // NOTE: rewardsTx lives in the epoch record + API response, NOT in the
    // evidence bytes — the ledger-committed evidenceHash must keep matching.
    store.saveEpoch(id, {
      root, evidenceHash: eHash, evidence, tx: hash,
      rewardsRoot: rRoot, rewardsTx, fundedWei: funded.toString(),
    });
    res.json({
      epochId: id, root, evidenceHash: eHash, tx: hash,
      explorer: `https://scan.bohr.life/tx/${hash}`,
      rewards: rewardsTx
        ? { root: rRoot, fundedWei: funded.toString(), tx: rewardsTx, explorer: `https://scan.bohr.life/tx/${rewardsTx}` }
        : { skipped: rewardsNote },
    });
  } catch (e) {
    const full = e instanceof Error ? e.message.slice(0, 500) : "broadcast failed";
    const msg = full.split("\n")[0].slice(0, 200);
    if (/Closed/.test(full)) return res.status(409).json({ error: "epoch already closed on-chain", detail: msg });
    if (/Funded/.test(full)) return res.status(409).json({ error: "epoch already funded on-chain", detail: msg });
    return res.status(500).json({ error: "broadcast failed", detail: msg });
  }
});

export default r;
