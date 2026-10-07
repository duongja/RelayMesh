export interface Status {
  network: string;
  nodesKnown: number;
  nodesOnline: number;
  nodesBrowser?: number;
  testnet: boolean;
}

export interface EpochRecord {
  root: string;
  evidenceHash: string;
  evidence: string;
  tx?: string;
  rewardsRoot?: string;
  rewardsTx?: string;
  fundedWei?: string;
}

export type Epochs = Record<string, EpochRecord>;

export interface NodePoints { netPts: number; upPts: number; }

export interface NodeInfo {
  nodeId: string;
  wallet: string;
  ip: string;
  geo?: string | null;
  kind?: string;
  lastBeat: number;
  beats: number;
  bytes: number;
  jobs: number;
  eligible: boolean;
  points: { netPts: number; upPts: number };
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
  register: (wallet: string, installId: string, geo: string, kind: "browser" | "desktop") =>
    req<{ nodeId: string; geo: string | null; kind: string }>("/api/nodes/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ wallet, installId, geo, kind }),
    }),
  heartbeat: (nodeId: string, wallet: string, geo: string) =>
    req<{ ok: boolean; eligible: boolean }>("/api/nodes/heartbeat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ nodeId, wallet, geo, kind: "browser" }),
    }),
  walletNodes: (wallet: string) => req<WalletNode[]>(`/api/nodes/wallet/${wallet}`),
  proof: (epochId: number, nodeId: string) => req<ClaimProof>(`/api/epochs/${epochId}/proof/${nodeId}`),
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

export interface ClaimProof {
  epochId: number;
  nodeId: string;
  wallet: string;
  netPts: number;
  upPts: number;
  bytes: number;
  amountWei: string;
  proof: string[];
  root: string;
  rewardsContract?: string;
  tokenContract?: string;
}

export interface WalletNode {
  nodeId: string;
  geo: string | null;
  kind: string;
  eligible: boolean;
  lastBeat: number;
  beats: number;
  bytes: number;
  jobs: number;
}

export const TOKEN = {
  address: "0x5505ed8b5791ba757072464a8aa3d41d061f3c5c" as const,
  rewards: "0xd41ac651ee3a065588065d199c8e234bf4e21e9e" as const,
  symbol: "tRELAY",
  decimals: 18,
};

export const BOT_TESTNET = {
  id: 968,
  name: "BOT Testnet",
  rpc: "https://rpc.bohr.life",
  explorer: "https://scan.bohr.life",
  native: { name: "Test BOT", symbol: "tBOT", decimals: 18 },
};

export async function copyText(t: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(t);
    return true;
  } catch {
    return false;
  }
}
