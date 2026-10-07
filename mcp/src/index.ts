/**
 * RelayMesh MCP server (stdio, zero framework deps).
 * Exposes one tool — observe_web — backed by coordinator POST /observe.
 * Wire into Claude Desktop / any MCP client as a stdio server.
 *
 * Env: COORDINATOR_URL (default http://127.0.0.1:3001), RELAYMESH_API_KEY.
 */
import "dotenv/config";
import { createInterface } from "node:readline";

const COORDINATOR = process.env.COORDINATOR_URL ?? "http://127.0.0.1:3001";
const API_KEY = process.env.RELAYMESH_API_KEY ?? "";

const TOOL = {
  name: "observe_web",
  description:
    "Observe a public web page from residential endpoints in a specific geography and return a structured, confidence-scored fact. MVP task: check_price on Kenyan pilot merchants (jumia.co.ke, kilimall.co.ke, jiji.co.ke, masoko.co.ke). Testnet pilot — no monetary value.",
  inputSchema: {
    type: "object",
    properties: {
      location: { type: "string", description: "Geo tag CC-City, e.g. KE-Nairobi" },
      url: { type: "string", description: "Public product page URL on a pilot merchant" },
      task: { type: "string", enum: ["check_price"], default: "check_price" },
      redundancy: { type: "integer", enum: [1, 2, 3], default: 2 },
    },
    required: ["location", "url"],
  },
};

function send(id: unknown, result: unknown) {
  process.stdout.write(JSON.stringify({ jsonrpc: "2.0", id, result }) + "\n");
}

function sendError(id: unknown, code: number, message: string) {
  process.stdout.write(JSON.stringify({ jsonrpc: "2.0", id, error: { code, message } }) + "\n");
}

async function callObserve(args: Record<string, unknown>) {
  const r = await fetch(`${COORDINATOR}/api/observe`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-api-key": API_KEY },
    body: JSON.stringify({ task: "check_price", redundancy: 2, ...args }),
  });
  const body = await r.json().catch(() => ({}));
  if (!r.ok) {
    return { content: [{ type: "text", text: `observe failed (${r.status}): ${(body as { error?: string }).error ?? "unknown"}` }], isError: true };
  }
  return { content: [{ type: "text", text: JSON.stringify(body) }] };
}

async function handle(msg: { jsonrpc: string; id?: unknown; method: string; params?: Record<string, unknown> }) {
  const id = msg.id ?? null;
  try {
    switch (msg.method) {
      case "initialize":
        return send(id, {
          protocolVersion: "2024-11-05",
          capabilities: { tools: {} },
          serverInfo: { name: "relaymesh-observe", version: "0.1.0" },
        });
      case "notifications/initialized":
        return;
      case "tools/list":
        return send(id, { tools: [TOOL] });
      case "tools/call": {
        const p = msg.params ?? {};
        if (p.name !== "observe_web") return sendError(id, -32602, "unknown tool");
        return send(id, await callObserve((p.arguments ?? {}) as Record<string, unknown>));
      }
      case "ping":
        return send(id, {});
      default:
        return sendError(id, -32601, `unknown method ${msg.method}`);
    }
  } catch (e) {
    sendError(id, -32603, e instanceof Error ? e.message.slice(0, 300) : "internal error");
  }
}

const rl = createInterface({ input: process.stdin, terminal: false });
rl.on("line", (line) => {
  if (!line.trim()) return;
  try {
    handle(JSON.parse(line) as { jsonrpc: string; id?: unknown; method: string; params?: Record<string, unknown> });
  } catch {
    sendError(null, -32700, "parse error");
  }
});
