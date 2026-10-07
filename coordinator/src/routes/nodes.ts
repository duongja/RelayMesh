import { Router } from "express";
import { z } from "zod";
import { store, authed, isBlockedIp } from "../index.js";
import { keccak256, stringToHex } from "viem";
import { computePoints, isGeoTag, isNodeId, nodeIdFor, type Hex } from "@relaymesh/shared";
import { submitJobResult, takeJob } from "../jobs.js";

const r = Router();
const nodeIdSchema = z.string().refine(isNodeId, { message: "nodeId must be 0x + 64 hex chars" });
const kindSchema = z.enum(["desktop", "browser"]).default("desktop");

// POST /api/nodes/register {wallet, installId, geo?, kind?} — mints a nodeId (PWA + CLI onboarding)
r.post("/register", (req, res) => {
  const body = z.object({
    wallet: z.string().regex(/^0x[0-9a-fA-F]{40}$/, { message: "wallet must be a 0x address" }),
    installId: z.string().min(8).max(64),
    geo: z.string().optional(),
    kind: kindSchema,
  }).parse(req.body);
  if (body.geo !== undefined && !isGeoTag(body.geo)) {
    return res.status(400).json({ error: "invalid request", detail: "geo must look like CC-City, e.g. KE-Nairobi" });
  }
  const nodeId = nodeIdFor(body.wallet.toLowerCase() as Hex, body.installId);
  res.status(201).json({ nodeId, geo: body.geo ?? null, kind: body.kind });
});

// POST /api/nodes/heartbeat {nodeId, wallet, geo?, kind?} — 30s cadence, signed in production (TODO)
r.post("/heartbeat", (req, res) => {
  const body = z.object({ nodeId: nodeIdSchema, wallet: z.string(), geo: z.string().optional(), kind: kindSchema }).parse(req.body);
  if (body.geo !== undefined && !isGeoTag(body.geo)) {
    return res.status(400).json({ error: "invalid request", detail: "geo must look like CC-City, e.g. KE-Nairobi" });
  }
  const ip = (req.headers["x-forwarded-for"] as string) ?? req.socket.remoteAddress ?? "unknown";
  if (isBlockedIp(ip)) {
    const rec = store.upsertBeat(body.nodeId, body.wallet, ip, body.geo, body.kind);
    store.setEligible(body.nodeId, false);
    return res.status(403).json({ ok: false, eligible: false, reason: "blocked network prefix (datacenter/ASN denylist MVP)" });
  }
  const rec = store.upsertBeat(body.nodeId, body.wallet, ip, body.geo, body.kind);
  res.json({ ok: true, eligible: rec.eligible });
});

// POST /api/nodes/result {nodeId, jobId, status, bytes, latencyMs} — validated, credited
r.post("/result", (req, res) => {
  const body = z.object({
    nodeId: nodeIdSchema,
    jobId: z.string(),
    status: z.number().int().min(100).max(599),
    bytes: z.number().int().min(0).max(2_000_000),
    latencyMs: z.number().int().min(0).max(30_000),
    body: z.string().max(2_100_000).optional(), // raw page text for observe tasks
  }).parse(req.body);
  const n = store.getNode(body.nodeId);
  if (!n) return res.status(404).json({ error: "unknown node" });
  if (!n.eligible) return res.status(403).json({ error: "node ineligible" });
  if (body.status !== 200) {
    // Failed jobs count against success rate implicitly via jobs-without-bytes; no points.
    return res.json({ ok: true, credited: false });
  }
  store.recordResult(body.nodeId, body.bytes);
  submitJobResult(body.jobId, {
    status: body.status, bytes: body.bytes,
    bodyHash: keccak256(stringToHex(body.body ?? "")),
    latencyMs: body.latencyMs, body: body.body,
  });
  const updated = store.getNode(body.nodeId)!;
  const pts = computePoints(updated.bytes, updated.beats);
  res.json({ ok: true, credited: true, ...pts });
});

// GET /api/nodes/wallet/:address — nodeIds bound to a wallet (for Rewards lookup)
r.get("/wallet/:address", (req, res) => {
  const addr = req.params.address.toLowerCase();
  if (!/^0x[0-9a-f]{40}$/.test(addr)) return res.status(400).json({ error: "bad wallet address" });
  const out = [...store.allNodes()]
    .filter(([, n]) => n.wallet.toLowerCase() === addr)
    .map(([nodeId, n]) => ({ nodeId, geo: n.geo, kind: n.kind, eligible: n.eligible, lastBeat: n.lastBeat, beats: n.beats, bytes: n.bytes, jobs: n.jobs }));
  res.json(out);
});

// GET /api/nodes/:id/job — oldest pending assignment for this node (204 when none)
r.get("/:id/job", (req, res) => {
  if (!isNodeId(req.params.id)) return res.status(400).json({ error: "bad node id" });
  const job = takeJob(req.params.id);
  if (!job) return res.status(204).end();
  res.json({ jobId: job.jobId, url: job.url, host: job.host, task: job.task, timeoutMs: job.deadlineMs });
});

// GET /api/nodes/:id — record + computed points (read-only)
r.get("/:id", (req, res) => {
  const n = store.getNode(req.params.id);
  if (!n) return res.status(404).json({ error: "unknown node" });
  res.json({ nodeId: req.params.id, ...n, points: computePoints(n.bytes, n.beats) });
});

// POST /api/nodes/dispute {nodeId, reason} — manual review queue (48 h SLA, MVP)
r.post("/dispute", (req, res) => {
  const body = z.object({ nodeId: z.string(), reason: z.string().min(3).max(500) }).parse(req.body);
  const d = store.addDispute(body.nodeId, body.reason);
  res.status(201).json({ ok: true, id: d.id });
});

// POST /api/nodes/admin/eligible — operator toggle (mirrors MeshRegistry.setEligible)
r.post("/admin/eligible", (req, res) => {
  if (!authed(req)) return res.status(401).json({ error: "unauthorized" });
  const body = z.object({ nodeId: z.string(), ok: z.boolean() }).parse(req.body);
  const n = store.setEligible(body.nodeId, body.ok);
  if (!n) return res.status(404).json({ error: "unknown node" });
  res.json({ ok: true });
});

export default r;
