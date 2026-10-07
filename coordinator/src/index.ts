import "dotenv/config";
import express from "express";
import { z } from "zod";

const app = express();
app.use(express.json({ limit: "1mb" }));

const ADMIN = process.env.ADMIN_TOKEN ?? "";
const BUYER_KEY = process.env.BUYER_API_KEY ?? "";
const authed = (req: express.Request) =>
  (req.headers.authorization ?? "").replace(/^Bearer /, "") === ADMIN;

// ---- Store: SQLite file-backed when SQLITE_PATH set, else in-memory ----
import { MemoryStore } from "./store.js";
import { SqliteStore } from "./sqlite.js";
export const store = process.env.SQLITE_PATH ? new SqliteStore(process.env.SQLITE_PATH) : new MemoryStore();
console.log(`store: ${process.env.SQLITE_PATH ? `sqlite (${process.env.SQLITE_PATH})` : "memory"}`);
export const jobs: unknown[] = [];
// Global kill-switch: when true, buyer assignments halt in <60 s (next request).
export const pauseState = { paused: false };
// Prefix denylist MVP (e.g. "10.,192.168." in tests; ASN DB post-MVP).
export const BLOCKED_PREFIXES = (process.env.BLOCKED_PREFIXES ?? "").split(",").map((s) => s.trim()).filter(Boolean);
export const isBlockedIp = (ip: string) => BLOCKED_PREFIXES.some((p) => ip.startsWith(p));
// Manual dispute log lives in the store (survives restarts on SQLite).

import statusRoute from "./routes/status.js";
import nodesRoute from "./routes/nodes.js";
import buyerRoute from "./routes/buyer.js";
import epochsRoute from "./routes/epochs.js";
import observeRoute from "./routes/observe.js";
import adminRoute from "./routes/admin.js";

app.use("/api/status", statusRoute);
app.use("/api/nodes", nodesRoute);
app.use("/api/buyer", buyerRoute);
app.use("/api/observe", observeRoute);
app.use("/api/epochs", epochsRoute);
app.use("/api/admin", adminRoute);

app.get("/health", (_req, res) => res.json({ ok: true }));

// Invalid input (zod) → 400 JSON, never HTML stack traces.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
app.use((err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  if (err instanceof z.ZodError) {
    return res.status(400).json({ error: "invalid request", detail: err.issues[0]?.message ?? "validation failed" });
  }
  if (err instanceof SyntaxError) return res.status(400).json({ error: "invalid JSON" });
  console.error(err);
  res.status(500).json({ error: "internal error" });
});

const PORT = Number(process.env.PORT ?? 3001);
app.listen(PORT, "127.0.0.1", () => console.log(`coordinator :${PORT}`));

export { ADMIN, BUYER_KEY, authed };
