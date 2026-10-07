# web — RelayMesh PWA (consumer app)

Vite + React. Installable PWA: `manifest.webmanifest` + `sw.js` (offline shell,
network-always for `/api`) + icons. Proxy `/api/*` to coordinator in `vite.config.ts`.

Views: Dashboard (one-tap browser-node connect, live points, settlement
countdown) · Network (settlements + proofs) · Get started (3-step onboarding) ·
Operator (token-gated). Hash-routed (`#/<view>`), mobile-responsive.

Browser nodes (`kind: "browser"`) earn **uptime points only** while the app is
open — browsers can't relay merchant pages (CORS) or run closed. Relay earnings
need the desktop node. Coordinator never assigns them relay jobs.

