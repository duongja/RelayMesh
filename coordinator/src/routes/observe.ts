import { Router } from "express";
import { z } from "zod";
import { keccak256, stringToHex } from "viem";
import { BUYER_KEY, pauseState, store } from "../index.js";
import {
  isGeoTag, reconcilePrices,
  type ObservationResult, type ObserveTask, type SingleObservation,
} from "@relaymesh/shared";
import { assignJob, jobStatus } from "../jobs.js";
import { extractPrice, normalizeHost, PILOT_MERCHANTS } from "../extract.js";

const r = Router();
const OBSERVE_WAIT_MS = 25_000;

function pickNodes(geo: string, n: number): string[] {
  // Browser (PWA lite) nodes earn uptime only — relay needs a full worker.
  const eligible = [...store.allNodes()].filter(
    ([, rec]) => rec.eligible && rec.kind !== "browser" && Date.now() - rec.lastBeat < 90_000 && rec.geo === geo,
  );
  eligible.sort((a, b) => b[1].beats - a[1].beats);
  const pool = eligible.slice(0, Math.max(n, 3));
  // Rotate within the top pool so load spreads (wrap-around keeps all n).
  const start = pool.length > 0 ? Math.floor(Math.random() * pool.length) : 0;
  const rotated = [...pool.slice(start), ...pool.slice(0, start)];
  return rotated.slice(0, n).map(([id]) => id);
}

// POST /observe {location, url, task, redundancy?} — the product (§16.1).
// Agent key (x-api-key). Waits for node results, reconciles, responds with consensus.
r.post("/", async (req, res) => {
  if (pauseState.paused) return res.status(503).json({ error: "network paused by operator" });
  if ((req.headers["x-api-key"] ?? "") !== BUYER_KEY) return res.status(401).json({ error: "bad key" });
  const body = z.object({
    location: z.string().refine(isGeoTag, { message: "location must look like CC-City, e.g. KE-Nairobi" }),
    url: z.string().url(),
    task: z.literal("check_price"),
    redundancy: z.union([z.literal(1), z.literal(2), z.literal(3)]).default(2),
  }).parse(req.body);

  const host = normalizeHost(new URL(body.url).hostname);
  if (!PILOT_MERCHANTS.has(host)) {
    return res.status(400).json({ error: "host not in pilot merchant list", merchants: [...PILOT_MERCHANTS] });
  }

  const nodeIds = pickNodes(body.location, body.redundancy);
  if (nodeIds.length < body.redundancy) {
    return res.status(503).json({ error: "no nodes in geo", location: body.location, available: nodeIds.length });
  }

  const task = body.task as ObserveTask;
  const jobs = nodeIds.map((nodeId) => assignJob(body.url, host, nodeId, task));
  const deadline = Date.now() + OBSERVE_WAIT_MS;
  const seen = new Set<string>();
  while (Date.now() < deadline && seen.size < jobs.length) {
    for (const j of jobs) {
      const cur = jobStatus(j.jobId);
      if (cur?.result && !seen.has(j.jobId)) seen.add(j.jobId);
    }
    if (seen.size < jobs.length) await new Promise((r2) => setTimeout(r2, 400));
  }

  const observations: SingleObservation[] = [];
  for (const j of jobs) {
    const cur = jobStatus(j.jobId);
    const r2 = cur?.result;
    if (!r2 || r2.status !== 200 || !r2.body) continue;
    const value = extractPrice(r2.body, host);
    observations.push({
      nodeId: j.nodeId as `0x${string}`,
      value,
      latencyMs: r2.latencyMs,
      bodyHash: keccak256(stringToHex(r2.body.slice(0, 50_000))),
    });
  }

  const { consensus, confidence, agreeing } = reconcilePrices(observations);
  const out: ObservationResult = {
    location: body.location,
    observedAt: Math.floor(Date.now() / 1000),
    task,
    consensus,
    confidence,
    observations,
    agreeing,
  };
  res.json(out);
});

export default r;
