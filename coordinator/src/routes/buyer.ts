import { Router } from "express";
import { z } from "zod";
import { randomUUID } from "node:crypto";
import { BUYER_KEY, store, pauseState } from "../index.js";
import { normalizeHost, PILOT_MERCHANTS } from "../extract.js";

const r = Router();

// Raw-relay primitive (§16.1). Agents use /observe; this stays internal.
// Hosts: pilot merchants + connectivity fixtures.
const ALLOWLIST = new Set([...PILOT_MERCHANTS, "example.com", "httpbin.org"]);

r.post("/fetch", (req, res) => {
  if (pauseState.paused) return res.status(503).json({ error: "network paused by operator" });
  if ((req.headers["x-api-key"] ?? "") !== BUYER_KEY) return res.status(401).json({ error: "bad key" });
  const body = z.object({ url: z.string().url(), geo: z.string().default("any") }).parse(req.body);
  const host = normalizeHost(new URL(body.url).hostname);
  if (!ALLOWLIST.has(host)) return res.status(400).json({ error: "host not allowlisted" });

  const eligible = [...store.allNodes()].filter(([, n]) => n.eligible && n.kind !== "browser" && Date.now() - n.lastBeat < 90_000);
  if (eligible.length === 0) return res.status(503).json({ error: "no nodes online" });

  // Reputation-weighted random MVP: prefer high-beat nodes (placeholder for §6.2 score).
  eligible.sort((a, b) => b[1].beats - a[1].beats);
  const [nodeId] = eligible[Math.floor(Math.random() * Math.min(3, eligible.length))];

  const job = { jobId: randomUUID(), url: body.url, host, nodeId, status: "ASSIGNED", createdAt: Date.now() };
  // TODO: persist, deliver via node long-poll SSE, await JobResult, validate, credit points.
  res.status(202).json(job);
});

export default r;
