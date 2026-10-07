import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "./api";

export type ConnStatus = "off" | "connecting" | "on" | "error";

export interface Connection {
  status: ConnStatus;
  nodeId: string;
  wallet: string;
  geo: string;
  lastBeat: number | null;
  hasIdentity: boolean;
  error: string;
  connect: (wallet: string, geo: string) => Promise<void>;
  disconnect: () => void;
}

const ID_KEY = "relaymesh-install-id";
const CONN_KEY = "relaymesh-connection";

function installId(): string {
  let v = localStorage.getItem(ID_KEY);
  if (!v) {
    v = crypto.randomUUID();
    localStorage.setItem(ID_KEY, v);
  }
  return v;
}

export function useConnection(): Connection {
  const [status, setStatus] = useState<ConnStatus>("off");
  const [nodeId, setNodeId] = useState("");
  const [wallet, setWallet] = useState("");
  const [geo, setGeo] = useState("");
  const [lastBeat, setLastBeat] = useState<number | null>(null);
  const [error, setError] = useState("");
  const timer = useRef<number | null>(null);

  const beat = useCallback(async (id: string, w: string, g: string) => {
    try {
      await api.heartbeat(id, w, g);
      setLastBeat(Date.now());
      setStatus("on");
    } catch {
      // Stay connected; retry next round. Only surface persistent failure.
    }
  }, []);

  const stop = useCallback(() => {
    if (timer.current) window.clearInterval(timer.current);
    timer.current = null;
  }, []);

  useEffect(() => stop, [stop]);

  const connect = useCallback(async (w: string, g: string) => {
    setStatus("connecting");
    setError("");
    try {
      const reg = await api.register(w.trim(), installId(), g.trim(), "browser");
      const saved = { nodeId: reg.nodeId, wallet: w.trim(), geo: g.trim() };
      localStorage.setItem(CONN_KEY, JSON.stringify(saved));
      setNodeId(saved.nodeId);
      setWallet(saved.wallet);
      setGeo(saved.geo);
      await beat(saved.nodeId, saved.wallet, saved.geo);
      stop();
      timer.current = window.setInterval(() => {
        if (!document.hidden) void beat(saved.nodeId, saved.wallet, saved.geo);
      }, 30_000);
    } catch (e) {
      setStatus("error");
      setError(e instanceof Error ? e.message : "Connection failed");
    }
  }, [beat, stop]);

  const disconnect = useCallback(() => {
    stop();
    setStatus("off");
    setLastBeat(null);
    // Identity kept for one-tap reconnect; node simply stops beating.
  }, [stop]);

  // Restore saved identity (paused until the user taps connect — explicit consent).
  useEffect(() => {
    try {
      const raw = localStorage.getItem(CONN_KEY);
      if (!raw) return;
      const s = JSON.parse(raw) as { nodeId: string; wallet: string; geo: string };
      if (s.nodeId && s.wallet) {
        setNodeId(s.nodeId);
        setWallet(s.wallet);
        setGeo(s.geo || "");
      }
    } catch { /* ignore */ }
  }, []);

  return { status, nodeId, wallet, geo, lastBeat, hasIdentity: Boolean(nodeId), error, connect, disconnect };
}
