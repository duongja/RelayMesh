import "dotenv/config";
import { randomUUID } from "node:crypto";
import { nodeIdFor, type Hex } from "@relaymesh/shared";

/**
 * MVP node: heartbeat loop + job worker.
 * Outbound-only. Allowlist enforced by coordinator; node ALSO checks host
 * before fetching (defense in depth). Caps: 2 MB body, 8 s timeout.
 */
const COORDINATOR = process.env.COORDINATOR_URL ?? "http://127.0.0.1:3001";
const WALLET = (process.env.NODE_WALLET ?? "0x0000000000000000000000000000000000000000") as Hex;
const INSTALL_ID = process.env.INSTALL_ID ?? randomUUID();
const GEO = process.env.NODE_GEO ?? undefined;
const NODE_ID = nodeIdFor(WALLET, INSTALL_ID);

const MAX_BYTES = 2_000_000;
// Pilot merchants + connectivity fixtures. Coordinator allowlist is authoritative.
const ALLOWED = /^(www\.)?(example\.com|httpbin\.org|jumia\.co\.ke|kilimall\.co\.ke|jiji\.co\.ke|masoko\.co\.ke)$/;

async function beat() {
  await fetch(`${COORDINATOR}/api/nodes/heartbeat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ nodeId: NODE_ID, wallet: WALLET, geo: GEO }),
  }).catch((e) => console.error("heartbeat failed", String(e).slice(0, 120)));
}

async function relayOnce(url: string) {
  const host = new URL(url).hostname.toLowerCase();
  // Local guard — coordinator allowlist is authoritative.
  if (!ALLOWED.test(host)) throw new Error("host not allowed");
  const t0 = Date.now();
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 8000);
  try {
    const res = await fetch(url, {
      signal: ctrl.signal,
      redirect: "follow",
      headers: { "User-Agent": "RelayMesh-node/0.1 (testnet pilot; public pages only)" },
    });
    const text = (await res.text()).slice(0, MAX_BYTES);
    return { status: res.status, bytes: text.length, latencyMs: Date.now() - t0, body: text };
  } finally { clearTimeout(t); }
}

interface JobOffer { jobId: string; url: string; host: string; task: string; timeoutMs: number; }

async function workOnce() {
  const r = await fetch(`${COORDINATOR}/api/nodes/${NODE_ID}/job`);
  if (r.status === 204) return false;
  if (!r.ok) throw new Error(`job poll ${r.status}`);
  const job = (await r.json()) as JobOffer;
  try {
    const out = await relayOnce(job.url);
    await fetch(`${COORDINATOR}/api/nodes/result`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ nodeId: NODE_ID, jobId: job.jobId, status: out.status, bytes: out.bytes, latencyMs: out.latencyMs, body: out.body }),
    });
  } catch (e) {
    await fetch(`${COORDINATOR}/api/nodes/result`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ nodeId: NODE_ID, jobId: job.jobId, status: 598, bytes: 0, latencyMs: 0 }),
    }).catch(() => {});
    console.error("job failed", job.jobId, String(e).slice(0, 120));
  }
  return true;
}

async function main() {
  const cmd = process.argv[2];
  if (cmd === "login") {
    console.log(`node ${NODE_ID} wallet ${WALLET} install ${INSTALL_ID} geo ${GEO ?? "(unset — set NODE_GEO=CC-City)"}`);
    console.log("Consent: outbound-only fetches to allowlisted public hosts. No files/history/LAN access.");
    return;
  }
  if (cmd === "fetch" && process.argv[3]) {
    console.log(await relayOnce(process.argv[3]));
    return;
  }
  if (cmd === "work") {
    console.log(`RelayMesh worker ${NODE_ID} geo ${GEO ?? "unset"}\ncoordinator ${COORDINATOR}`);
    await beat();
    for (;;) {
      try {
        const had = await workOnce();
        // Always pause: hammers the coordinator otherwise, and (pre-fix)
        // a success-path poll could purge a just-completed job mid-observe.
        await beat();
        await new Promise((r) => setTimeout(r, had ? 2000 : 5000));
      } catch (e) {
        console.error(String(e).slice(0, 160));
        await new Promise((r) => setTimeout(r, 5000));
      }
    }
  }
  console.log(`RelayMesh node ${NODE_ID}\ncoordinator ${COORDINATOR}\nheartbeat 30s…`);
  await beat();
  setInterval(beat, 30_000);
}

main();
