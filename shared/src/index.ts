import { keccak256, encodeAbiParameters, stringToHex, type Hex } from "viem";
export type { Hex };

export const CHAIN_ID = 968;
export const EPOCH_SCHEMA = "relaymesh/epoch-v1";

export type NodeId = Hex; // keccak256(wallet || installUUID)

export interface Job {
  jobId: string;
  url: string;
  host: string;
  geo: string;
  deadlineMs: number;
  nonce: Hex;
}

export interface JobResult {
  jobId: string;
  nodeId: NodeId;
  status: number;
  bytes: number;
  bodyHash: Hex;
  latencyMs: number;
}

export interface NodeTotals {
  nodeId: NodeId;
  netPts: number; // 1 per 100KB
  upPts: number; // 1 per 10min online
  bytes: number;
  jobs: number;
}

export interface EpochEvidence {
  schema: typeof EPOCH_SCHEMA;
  chainId: 968;
  epochId: number;
  startedAt: number;
  endedAt: number;
  perNode: NodeTotals[];
  jobsSample: { jobId: string; urlHash: Hex; nodeId: NodeId; bytes: number; latencyMs: number; status: number }[];
  spotChecks: { jobId: string; match: boolean }[];
  merkleRoot: Hex;
  rewards?: {
    poolWei: string;
    fundedWei: string;
    root: Hex;
    tx?: string;
    shares: { nodeId: NodeId; wallet: Hex; netPts: number; upPts: number; bytes: number; amountWei: string }[];
  };
}

export interface NodeRecord {
  wallet: string;
  ip: string;
  geo: GeoTag | null;
  kind: NodeKind;
  lastBeat: number;
  beats: number;
  bytes: number;
  jobs: number;
  eligible: boolean;
}

export const POINTS = {
  bytesPerNetPt: 102_400, // 1 pt per 100 KB
  beatsPerUpPt: 20, // 1 pt per 10 min at 30 s cadence
  maxNetPerDay: 500,
  maxUpPerDay: 144,
} as const;

export function computePoints(bytes: number, beats: number): { netPts: number; upPts: number } {
  return {
    netPts: Math.min(POINTS.maxNetPerDay, Math.floor(bytes / POINTS.bytesPerNetPt)),
    upPts: Math.min(POINTS.maxUpPerDay, Math.floor(beats / POINTS.beatsPerUpPt)),
  };
}

/** Canonical JSON: sorted keys, no whitespace variance. MUST be used before evidenceHash. */
export function canonicalJson(value: unknown): string {
  const sort = (v: unknown): unknown => {
    if (Array.isArray(v)) return v.map(sort);
    if (v !== null && typeof v === "object") {
      const out: Record<string, unknown> = {};
      for (const k of Object.keys(v as Record<string, unknown>).sort()) {
        out[k] = sort((v as Record<string, unknown>)[k]);
      }
      return out;
    }
    return v;
  };
  return JSON.stringify(sort(value));
}

export function nodeIdFor(wallet: Hex, installUUID: string): NodeId {
  return keccak256(stringToHex(`${wallet.toLowerCase()}:${installUUID}`));
}

/** Protocol rule: nodeIds must be 32-byte hex or they break on-chain hashing. */
export function isNodeId(id: string): id is NodeId {
  return /^0x[0-9a-fA-F]{64}$/.test(id);
}

/* ---------- observation layer (§16) ---------- */

/** `CC-City`, e.g. `KE-Nairobi`. Self-declared at heartbeat, verified on disputes. */
export type GeoTag = string;

export function isGeoTag(g: string): boolean {
  return /^[A-Z]{2}-[A-Za-z][A-Za-z\- ]{1,40}$/.test(g);
}

export interface HeartbeatPayload {
  nodeId: NodeId;
  wallet: Hex;
  geo?: GeoTag;
  kind?: NodeKind;
}

/** desktop = full relay worker; browser = PWA lite node (uptime only, never assigned relay jobs). */
export type NodeKind = "desktop" | "browser";

export type ObserveTask = "check_price";

export interface ObserveRequest {
  location: GeoTag;
  url: string;
  task: ObserveTask;
  redundancy?: 1 | 2 | 3;
}

export interface PriceValue {
  kind: "price";
  priceKes: number;
  currency: "KES";
  availability: boolean | null;
  range: boolean;
  adapter: string; // merchant adapter name or "generic"
}

export interface SingleObservation {
  nodeId: NodeId;
  value: PriceValue | null; // null = unparseable, not penalized
  latencyMs: number;
  bodyHash: Hex;
}

export interface ObservationResult {
  location: GeoTag;
  observedAt: number;
  task: ObserveTask;
  consensus: PriceValue | null;
  confidence: number; // 0–1, computed from agreement — never asserted
  observations: SingleObservation[];
  agreeing: number;
}

/** Agreement for prices: max/min within 2%. Consensus = median of agreeing values. */
export function reconcilePrices(obs: SingleObservation[]): { consensus: PriceValue | null; confidence: number; agreeing: number } {
  const priced = obs.filter((o) => o.value !== null) as (Omit<SingleObservation, "value"> & { value: PriceValue })[];
  if (priced.length === 0) return { consensus: null, confidence: 0, agreeing: 0 };
  const prices = priced.map((o) => o.value.priceKes).sort((a, b) => a - b);
  const lo = prices[0], hi = prices[prices.length - 1];
  const spread = lo > 0 ? (hi - lo) / lo : hi === 0 && lo === 0 ? 0 : Infinity;
  if (spread > 0.02) return { consensus: null, confidence: 0, agreeing: 0 };
  const median = prices[Math.floor(prices.length / 2)];
  const rep = priced.find((o) => o.value.priceKes === median)!.value;
  const n = priced.length, total = obs.length;
  const confidence = n === 3 && total === 3 ? 0.95 : n === 2 && total === 2 ? 0.9 : n === 2 && total === 3 ? 0.7 : n === 1 && total === 1 ? 0.6 : 0.5;
  return { consensus: { ...rep, priceKes: median }, confidence, agreeing: n };
}

export function leafHash(t: NodeTotals): Hex {
  return keccak256(
    encodeAbiParameters(
      [{ type: "bytes32" }, { type: "uint256" }, { type: "uint256" }, { type: "uint256" }],
      [t.nodeId, BigInt(t.netPts), BigInt(t.upPts), BigInt(t.bytes)]
    )
  );
}

/** MVP Merkle root: pairwise keccak of sorted leaves. Replace with balanced tree lib post-MVP. */
export function merkleRoot(leaves: Hex[]): Hex {
  if (leaves.length === 0) return "0x" + "0".repeat(64) as Hex;
  let level = [...leaves].sort();
  while (level.length > 1) {
    const next: Hex[] = [];
    for (let i = 0; i < level.length; i += 2) {
      const a = level[i], b = level[i + 1] ?? level[i];
      next.push(keccak256(encodeAbiParameters([{ type: "bytes32" }, { type: "bytes32" }], [a, b])));
    }
    level = next;
  }
  return level[0];
}

export function evidenceHash(canonicalJson: string): Hex {
  return keccak256(stringToHex(canonicalJson));
}

export function urlHash(url: string): Hex {
  return keccak256(stringToHex(url));
}

/* ---------- rewards v2: claimable leaves (matches MeshRewards.sol) ---------- */

export interface RewardShare {
  nodeId: NodeId;
  wallet: Hex;
  netPts: number;
  upPts: number;
  bytes: number;
  /** token amount in wei (tRELAY, 18 decimals). */
  amount: bigint;
}

/**
 * Pro-rata split of an epoch pool by points (net+up). Deterministic;
 * dust stays with the operator. Zero total points → all zero.
 */
export function computeShares(
  totals: { nodeId: NodeId; wallet: Hex; netPts: number; upPts: number; bytes: number }[],
  poolWei: bigint,
): RewardShare[] {
  const pts = totals.map((t) => t.netPts + t.upPts);
  const total = pts.reduce((a, b) => a + b, 0);
  if (total === 0 || poolWei === 0n) {
    return totals.map((t) => ({ ...t, amount: 0n }));
  }
  let assigned = 0n;
  const out = totals.map((t, i) => {
    const amount = (poolWei * BigInt(pts[i])) / BigInt(total);
    assigned += amount;
    return { ...t, amount };
  });
  void assigned; // remainder (dust) intentionally unassigned
  return out;
}

/** Must equal MeshRewards leaf: keccak(abi.encode(epochId, nodeId, wallet, netPts, upPts, bytes, amount)). */
export function rewardLeaf(epochId: number, s: RewardShare): Hex {
  return keccak256(
    encodeAbiParameters(
      [
        { type: "uint256" },
        { type: "bytes32" },
        { type: "address" },
        { type: "uint256" },
        { type: "uint256" },
        { type: "uint256" },
        { type: "uint256" },
      ],
      [BigInt(epochId), s.nodeId, s.wallet, BigInt(s.netPts), BigInt(s.upPts), BigInt(s.bytes), s.amount],
    ),
  );
}

function sortPair(a: Hex, b: Hex): Hex {
  return a.toLowerCase() <= b.toLowerCase()
    ? keccak256(encodeAbiParameters([{ type: "bytes32" }, { type: "bytes32" }], [a, b]))
    : keccak256(encodeAbiParameters([{ type: "bytes32" }, { type: "bytes32" }], [b, a]));
}

/** Sorted-pair tree root — matches MeshRewards.verifyProof. Replaces merkleRoot for rewards. */
export function rewardRoot(leaves: Hex[]): Hex {
  if (leaves.length === 0) return ("0x" + "0".repeat(64)) as Hex;
  if (leaves.length === 1) return leaves[0];
  let level = [...leaves].sort((a, b) => (a.toLowerCase() < b.toLowerCase() ? -1 : 1));
  while (level.length > 1) {
    const next: Hex[] = [];
    for (let i = 0; i < level.length; i += 2) {
      const a = level[i];
      const b = i + 1 < level.length ? level[i + 1] : level[i];
      next.push(sortPair(a, b));
    }
    level = next;
  }
  return level[0];
}

/** Sibling path for leaves[index]. Sorts a copy; maps the index through sorting. */
export function rewardProof(leaves: Hex[], index: number): Hex[] {
  if (leaves.length <= 1) return [];
  const cmp = (a: Hex, b: Hex) => (a.toLowerCase() < b.toLowerCase() ? -1 : 1);
  let level = [...leaves].sort(cmp);
  let idx = level.indexOf(leaves[index]);
  if (idx === -1) throw new Error("leaf not found");
  const proof: Hex[] = [];
  while (level.length > 1) {
    const sib = idx % 2 === 0 ? (idx + 1 < level.length ? level[idx + 1] : level[idx]) : level[idx - 1];
    proof.push(sib);
    const next: Hex[] = [];
    for (let i = 0; i < level.length; i += 2) {
      const a = level[i];
      const b = i + 1 < level.length ? level[i + 1] : level[i];
      next.push(sortPair(a, b));
    }
    level = next;
    idx = Math.floor(idx / 2);
  }
  return proof;
}
