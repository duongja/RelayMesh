# mcp — `observe_web` tool for AI agents

Stdio MCP server. One tool backed by coordinator `POST /api/observe`.

```bash
npm install
COORDINATOR_URL=http://127.0.0.1:3001 RELAYMESH_API_KEY=... npm start
```

Claude Desktop config (`claude_desktop_config.json`):

```json
{ "mcpServers": { "relaymesh": {
  "command": "npx", "args": ["tsx", "/path/to/RelayMesh/mcp/src/index.ts"],
  "env": { "COORDINATOR_URL": "http://127.0.0.1:3001", "RELAYMESH_API_KEY": "..." }
} } }
```

Smoke test: pipe `initialize` → `tools/list` → `tools/call` JSON-RPC lines on stdin.
