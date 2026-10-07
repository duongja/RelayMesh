import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import type { GeoTag, Hex, NodeKind, NodeRecord } from "@relaymesh/shared";
import type { ClosedEpoch, Dispute, Store } from "./store.js";

/** File-backed store. Same interface as MemoryStore — swap via SQLITE_PATH. */
export class SqliteStore implements Store {
  private db: DatabaseSync;

  constructor(path: string) {
    mkdirSync(dirname(path), { recursive: true });
    this.db = new DatabaseSync(path);
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS nodes (
        id TEXT PRIMARY KEY, wallet TEXT NOT NULL, ip TEXT NOT NULL,
        geo TEXT, kind TEXT NOT NULL DEFAULT 'desktop',
        lastBeat INTEGER NOT NULL, beats INTEGER NOT NULL DEFAULT 0,
        bytes INTEGER NOT NULL DEFAULT 0, jobs INTEGER NOT NULL DEFAULT 0,
        eligible INTEGER NOT NULL DEFAULT 1
      );
      CREATE TABLE IF NOT EXISTS epochs (
        id INTEGER PRIMARY KEY, root TEXT NOT NULL,
        evidenceHash TEXT NOT NULL, evidence TEXT NOT NULL, tx TEXT
      );
      CREATE TABLE IF NOT EXISTS disputes (
        id INTEGER PRIMARY KEY AUTOINCREMENT, nodeId TEXT NOT NULL,
        reason TEXT NOT NULL, at INTEGER NOT NULL
      );
    `);
    // Migration for DBs created before geo tags (§16.4).
    const cols = this.db.prepare("PRAGMA table_info(nodes)").all() as { name: string }[];
    if (!cols.some((c) => c.name === "geo")) {
      this.db.exec("ALTER TABLE nodes ADD COLUMN geo TEXT");
    }
    // Migration for DBs created before node kinds (PWA lite nodes).
    const cols2 = this.db.prepare("PRAGMA table_info(nodes)").all() as { name: string }[];
    if (!cols2.some((c) => c.name === "kind")) {
      this.db.exec("ALTER TABLE nodes ADD COLUMN kind TEXT NOT NULL DEFAULT 'desktop'");
    }
    // Migration for DBs created before rewards funding (token epoch layer).
    const cols3 = this.db.prepare("PRAGMA table_info(epochs)").all() as { name: string }[];
    for (const [col, type] of [["rewardsRoot", "TEXT"], ["rewardsTx", "TEXT"], ["fundedWei", "TEXT"]] as const) {
      if (!cols3.some((c) => c.name === col)) {
        this.db.exec(`ALTER TABLE epochs ADD COLUMN ${col} ${type}`);
      }
    }
  }

  private rowToNode(id: string, r: Record<string, unknown>): NodeRecord {
    return {
      wallet: r.wallet as string, ip: r.ip as string,
      geo: (r.geo as string) ?? null,
      kind: ((r.kind as string) ?? "desktop") as NodeKind,
      lastBeat: r.lastBeat as number, beats: r.beats as number,
      bytes: r.bytes as number, jobs: r.jobs as number,
      eligible: (r.eligible as number) === 1,
    };
  }

  getNode(id: string): NodeRecord | undefined {
    const r = this.db.prepare("SELECT * FROM nodes WHERE id = ?").get(id) as Record<string, unknown> | undefined;
    return r ? this.rowToNode(id, r) : undefined;
  }

  upsertBeat(id: string, wallet: string, ip: string, geo?: GeoTag | null, kind?: NodeKind): NodeRecord {
    const now = Date.now();
    this.db.prepare(`
      INSERT INTO nodes (id, wallet, ip, geo, kind, lastBeat, beats) VALUES (?, ?, ?, ?, ?, ?, 1)
      ON CONFLICT(id) DO UPDATE SET lastBeat = ?, beats = beats + 1, ip = ?,
        geo = COALESCE(?, geo), kind = COALESCE(?, kind)
    `).run(id, wallet, ip, geo ?? null, kind ?? "desktop", now, now, ip, geo ?? null, kind ?? null);
    return this.getNode(id)!;
  }

  setEligible(id: string, ok: boolean) {
    this.db.prepare("UPDATE nodes SET eligible = ? WHERE id = ?").run(ok ? 1 : 0, id);
    return this.getNode(id);
  }

  *allNodes(): Iterable<[string, NodeRecord]> {
    const rows = this.db.prepare("SELECT * FROM nodes").all() as Record<string, unknown>[];
    for (const r of rows) yield [r.id as string, this.rowToNode(r.id as string, r)];
  }

  recordResult(nodeId: string, bytes: number) {
    this.db.prepare("UPDATE nodes SET bytes = bytes + ?, jobs = jobs + 1 WHERE id = ?").run(bytes, nodeId);
  }

  size(): number {
    return (this.db.prepare("SELECT COUNT(*) AS n FROM nodes").get() as { n: number }).n;
  }

  duplicateIps(): { ip: string; nodeIds: string[] }[] {
    const rows = this.db.prepare(
      "SELECT ip, GROUP_CONCAT(id) AS ids, COUNT(*) AS n FROM nodes GROUP BY ip HAVING n > 1"
    ).all() as { ip: string; ids: string }[];
    return rows.map((r) => ({ ip: r.ip, nodeIds: r.ids.split(",") }));
  }

  getEpoch(id: number): ClosedEpoch | undefined {
    const r = this.db.prepare("SELECT * FROM epochs WHERE id = ?").get(id) as
      ({ root: string; evidenceHash: string; evidence: string; tx: string | null; rewardsRoot: string | null; rewardsTx: string | null; fundedWei: string | null } | undefined);
    if (!r) return undefined;
    const out: ClosedEpoch = { root: r.root as ClosedEpoch["root"], evidenceHash: r.evidenceHash as ClosedEpoch["evidenceHash"], evidence: r.evidence, tx: r.tx ?? undefined };
    if (r.rewardsRoot) out.rewardsRoot = r.rewardsRoot as Hex;
    if (r.rewardsTx) out.rewardsTx = r.rewardsTx;
    if (r.fundedWei) out.fundedWei = r.fundedWei;
    return out;
  }

  saveEpoch(id: number, e: ClosedEpoch) {
    this.db.prepare(`
      INSERT INTO epochs (id, root, evidenceHash, evidence, tx, rewardsRoot, rewardsTx, fundedWei) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET root = excluded.root, evidenceHash = excluded.evidenceHash,
        evidence = excluded.evidence, tx = COALESCE(excluded.tx, epochs.tx),
        rewardsRoot = COALESCE(excluded.rewardsRoot, epochs.rewardsRoot),
        rewardsTx = COALESCE(excluded.rewardsTx, epochs.rewardsTx),
        fundedWei = COALESCE(excluded.fundedWei, epochs.fundedWei)
    `).run(id, e.root, e.evidenceHash, e.evidence, e.tx ?? null, e.rewardsRoot ?? null, e.rewardsTx ?? null, e.fundedWei ?? null);
  }

  allEpochs(): Record<number, ClosedEpoch> {
    const rows = this.db.prepare("SELECT * FROM epochs").all() as
      { id: number; root: string; evidenceHash: string; evidence: string; tx: string | null; rewardsRoot: string | null; rewardsTx: string | null; fundedWei: string | null }[];
    const out: Record<number, ClosedEpoch> = {};
    for (const r of rows) {
      const e: ClosedEpoch = { root: r.root as ClosedEpoch["root"], evidenceHash: r.evidenceHash as ClosedEpoch["evidenceHash"], evidence: r.evidence, tx: r.tx ?? undefined };
      if (r.rewardsRoot) e.rewardsRoot = r.rewardsRoot as Hex;
      if (r.rewardsTx) e.rewardsTx = r.rewardsTx;
      if (r.fundedWei) e.fundedWei = r.fundedWei;
      out[r.id] = e;
    }
    return out;
  }

  addDispute(nodeId: string, reason: string): Dispute {
    const at = Date.now();
    const r = this.db.prepare("INSERT INTO disputes (nodeId, reason, at) VALUES (?, ?, ?) RETURNING id").get(nodeId, reason, at) as { id: number };
    return { id: r.id, nodeId, reason, at };
  }

  allDisputes(): Dispute[] {
    return this.db.prepare("SELECT * FROM disputes ORDER BY id").all() as unknown as Dispute[];
  }
}
