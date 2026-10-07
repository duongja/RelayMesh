import { Router } from "express";
import { z } from "zod";
import { authed, store, pauseState } from "../index.js";

const r = Router();

// POST /api/admin/pause {paused} — global kill-switch
r.post("/pause", (req, res) => {
  if (!authed(req)) return res.status(401).json({ error: "unauthorized" });
  const body = z.object({ paused: z.boolean() }).parse(req.body);
  pauseState.paused = body.paused;
  res.json({ ok: true, paused: pauseState.paused });
});

// GET /api/admin/flags — duplicate-IP signals + paused state
r.get("/flags", (req, res) => {
  if (!authed(req)) return res.status(401).json({ error: "unauthorized" });
  res.json({ paused: pauseState.paused, duplicateIps: store.duplicateIps() });
});

// POST /api/nodes/dispute is public; list is operator-only here
r.get("/disputes", (req, res) => {
  if (!authed(req)) return res.status(401).json({ error: "unauthorized" });
  res.json(store.allDisputes());
});

export default r;
