import type { GeoTag, Hex, NodeKind, NodeRecord } from "@relaymesh/shared";

export interface ClosedEpoch {
  root: Hex;
  evidenceHash: Hex;
  evidence: string;
  tx?: string;
}

export interface Dispute {
  id: number;
  nodeId: string;
  reason: string;
  at: number;
}

/** Storage behind all routes. Memory for tests; SQLite file-backed in production. */
export interface Store {
  getNode(id: string): NodeRecord | undefined;
  upsertBeat(id: string, wallet: string, ip: string, geo?: GeoTag | null, kind?: NodeKind): NodeRecord;
  setEligible(id: string, ok: boolean): NodeRecord | undefined;
  allNodes(): Iterable<[string, NodeRecord]>;
  recordResult(nodeId: string, bytes: number): void;
  size(): number;
  /** IPs currently claimed by >1 nodeId — 1-IP-1-node enforcement signal. */
  duplicateIps(): { ip: string; nodeIds: string[] }[];
  getEpoch(id: number): ClosedEpoch | undefined;
  saveEpoch(id: number, e: ClosedEpoch): void;
  allEpochs(): Record<number, ClosedEpoch>;
  addDispute(nodeId: string, reason: string): Dispute;
  allDisputes(): Dispute[];
}

export class MemoryStore implements Store {
  private nodes = new Map<string, NodeRecord>();
  private ipIndex = new Map<string, Set<string>>();
  private epochs = new Map<number, ClosedEpoch>();
  private disputeLog: Dispute[] = [];
  getNode(id: string) { return this.nodes.get(id); }
  upsertBeat(id: string, wallet: string, ip: string, geo?: GeoTag | null, kind?: NodeKind): NodeRecord {
    const prev = this.nodes.get(id) ?? { wallet, ip, geo: null, kind: "desktop", lastBeat: 0, beats: 0, bytes: 0, jobs: 0, eligible: true };
    prev.lastBeat = Date.now();
    prev.beats += 1;
    prev.ip = ip;
    if (geo) prev.geo = geo;
    if (kind) prev.kind = kind;
    this.nodes.set(id, prev);
    let set = this.ipIndex.get(ip);
    if (!set) { set = new Set(); this.ipIndex.set(ip, set); }
    set.add(id);
    return prev;
  }
  setEligible(id: string, ok: boolean) {
    const n = this.nodes.get(id);
    if (n) n.eligible = ok;
    return n;
  }
  allNodes() { return this.nodes.entries(); }
  recordResult(nodeId: string, bytes: number) {
    const n = this.nodes.get(nodeId);
    if (n) { n.bytes += bytes; n.jobs += 1; }
  }
  size() { return this.nodes.size; }
  duplicateIps() {
    const out: { ip: string; nodeIds: string[] }[] = [];
    for (const [ip, set] of this.ipIndex) {
      if (set.size > 1) out.push({ ip, nodeIds: [...set] });
    }
    return out;
  }
  getEpoch(id: number) { return this.epochs.get(id); }
  saveEpoch(id: number, e: ClosedEpoch) { this.epochs.set(id, e); }
  allEpochs() { return Object.fromEntries(this.epochs) as Record<number, ClosedEpoch>; }
  addDispute(nodeId: string, reason: string): Dispute {
    const d = { id: this.disputeLog.length + 1, nodeId, reason, at: Date.now() };
    this.disputeLog.push(d);
    return d;
  }
  allDisputes() { return this.disputeLog; }
}
