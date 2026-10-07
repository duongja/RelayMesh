import { Router } from "express";
import { store } from "../index.js";

const r = Router();
r.get("/", (_req, res) => {
  const all = [...store.allNodes()];
  const live = all.filter(([, n]) => Date.now() - n.lastBeat < 90_000);
  res.json({
    network: "BOT testnet 968",
    nodesKnown: store.size(),
    nodesOnline: live.length,
    nodesBrowser: live.filter(([, n]) => n.kind === "browser").length,
    testnet: true,
  });
});
export default r;
