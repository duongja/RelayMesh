export interface Status {
  network: string;
  nodesKnown: number;
  nodesOnline: number;
  testnet: boolean;
}

export interface EpochRecord {
  root: string;
  evidenceHash: string;
  evidence: string;
  tx?: string;
}

export type Epochs = Record<string, EpochRecord>;

export interface NodePoints { netPts: number; upPts: number; }

export interface NodeInfo {
  nodeId: string;
  wallet: string;
  ip: string;
  lastBeat: number;
  beats: number;
  bytes: number;
  jobs: number;
  eligible: boolean;
  points: NodePoints;
}

export interface Flags {
  paused: boolean;
  duplicateIps: { ip: string; nodeIds: string[] }[];
}

async function req<T>(url: string, init?: RequestInit): Promise<T> {
  const r = await fetch(url, init);
  const body = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error((body as { error?: string }).error || `Request failed (${r.status})`);
  return body as T;
}

export const api = {
  status: () => req<Status>("/api/status"),
  epochs: () => req<Epochs>("/api/epochs"),
  node: (id: string) => req<NodeInfo>(`/api/nodes/${id.trim()}`),
  flags: (token: string) =>
    req<Flags>("/api/admin/flags", { headers: { Authorization: `Bearer ${token}` } }),
  setPaused: (token: string, paused: boolean) =>
    req<{ ok: boolean; paused: boolean }>("/api/admin/pause", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ paused }),
    }),
  closeEpoch: (token: string) =>
    req<{ epochId: number; root: string; evidenceHash: string; tx: string; explorer: string }>(
      "/api/epochs/close",
      { method: "POST", headers: { Authorization: `Bearer ${token}` } },
    ),
};

/* ---------- human-first formatting ---------- */

export function timeAgo(ms: number, now = Date.now()): string {
  const s = Math.max(0, Math.floor((now - ms) / 1000));
  if (s < 10) return "just now";
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return m === 1 ? "1 min ago" : `${m} min ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return h === 1 ? "1 hr ago" : `${h} hrs ago`;
  const d = Math.floor(h / 24);
  return d === 1 ? "1 day ago" : `${d} days ago`;
}

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / 1024 / 1024).toFixed(2)} MB`;
  return `${(n / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

export function shortHash(h: string, head = 10, tail = 8): string {
  if (h.length <= head + tail + 1) return h;
  return `${h.slice(0, head)}…${h.slice(-tail)}`;
}

export function epochStart(id: number): number {
  return id * 3_600_000;
}

/** ms until the next UTC hour boundary (next epoch close). */
export function msToNextEpoch(now = Date.now()): number {
  return 3_600_000 - (now % 3_600_000);
}

export function formatCountdown(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(h)}:${p(m)}:${p(sec)}`;
}

export async function copyText(t: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(t);
    return true;
  } catch {
    return false;
  }
}
