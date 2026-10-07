import { Router } from "express";
import { store } from "../index.js";

const r = Router();
r.get("/", (_req, res) => {
  const all = [...store.allNodes()];
  const online = all.filter(([, n]) => Date.now() - n.lastBeat < 90_000).length;
  res.json({
    network: "BOT testnet 968",
    nodesKnown: store.size(),
    nodesOnline: online,
    testnet: true,
  });
});
export default r;
