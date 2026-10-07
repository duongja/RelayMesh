import { useCallback, useEffect, useState } from "react";
import {
  api, copyText, epochStart, formatBytes, formatCountdown, msToNextEpoch,
  shortHash, timeAgo, type Epochs, type NodeInfo, type Status,
} from "../api";

function useNow(intervalMs = 1000): number {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(t);
  }, [intervalMs]);
  return now;
}

function Copy({ value }: { value: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      className="copy-btn"
      title="Copy full value"
      onClick={async (e) => {
        e.preventDefault();
        if (await copyText(value)) {
          setDone(true);
          setTimeout(() => setDone(false), 1200);
        }
      }}
    >
      {done ? "Copied" : "Copy"}
    </button>
  );
}

const NODE_KEY = "relaymesh-node-id";

export function useMyNodeId(): [string, (v: string) => void] {
  const [id, setId] = useState(() => localStorage.getItem(NODE_KEY) || "");
  const save = (v: string) => {
    setId(v);
    if (v) localStorage.setItem(NODE_KEY, v);
    else localStorage.removeItem(NODE_KEY);
  };
  return [id, save];
}

export default function Dashboard() {
  const now = useNow();
  const [status, setStatus] = useState<Status | null>(null);
  const [epochs, setEpochs] = useState<Epochs>({});
  const [failed, setFailed] = useState(false);
  const [myId] = useMyNodeId();
  const [mine, setMine] = useState<NodeInfo | null>(null);

  const refresh = useCallback(async () => {
    try {
      const [s, e] = await Promise.all([api.status(), api.epochs()]);
      setStatus(s);
      setEpochs(e);
      setFailed(false);
      if (myId) {
        try { setMine(await api.node(myId)); } catch { setMine(null); }
      } else setMine(null);
    } catch {
      setFailed(true);
    }
  }, [myId]);

  useEffect(() => {
    refresh();
    const t = setInterval(() => { if (!document.hidden) refresh(); }, 10000);
    return () => clearInterval(t);
  }, [refresh]);

  const ids = Object.keys(epochs).sort((a, b) => Number(b) - Number(a));
  const myOnline = mine ? Date.now() - mine.lastBeat < 90_000 : false;

  return (
    <>
      <div className="page-head">
        <h1>Earn from the internet<br />you don’t use.</h1>
        <p>Share idle bandwidth through your node. Track everything below — connection, points, and every settlement, all verifiable on-chain.</p>
      </div>

      <div className="status-hero">
        <div className={`status-light ${myOnline ? "" : "idle"}`} aria-hidden="true" />
        <div>
          <div className="status-title">{mine ? (myOnline ? "Connected" : "Node offline") : "No node connected"}</div>
          <div className="status-sub">
            {mine ? `DEVICE · ${shortHash(mine.nodeId, 12, 8)}` : "Connect your node to start earning"}
          </div>
        </div>
        <div className="status-meta">
          <div className="countdown">{formatCountdown(msToNextEpoch(now))}</div>
          <div className="countdown-label">until next settlement</div>
        </div>
      </div>

      {failed && !status ? (
        <div className="empty"><strong>Can’t reach the coordinator.</strong>Check that the backend is running, then refresh.</div>
      ) : !status ? (
        <div className="grid cols-4">
          {[0, 1, 2, 3].map((i) => <div className="card" key={i}><div className="skel" /></div>)}
        </div>
      ) : (
        <div className="grid cols-4">
          <div className="card">
            <div className="label">Network points</div>
            <div className="big accent">{mine ? mine.points.netPts : "—"}</div>
            <div className="hint">{mine ? `${formatBytes(mine.bytes)} relayed` : "for traffic served"}</div>
          </div>
          <div className="card">
            <div className="label">Uptime points</div>
            <div className="big accent">{mine ? mine.points.upPts : "—"}</div>
            <div className="hint">{mine ? `${mine.beats} heartbeats` : "for staying connected"}</div>
          </div>
          <div className="card">
            <div className="label">Nodes online</div>
            <div className="big">{status.nodesOnline}</div>
            <div className="hint">of {status.nodesKnown} known</div>
          </div>
          <div className="card">
            <div className="label">Epochs settled</div>
            <div className="big">{ids.length}</div>
            <div className="hint">on BOT testnet</div>
          </div>
        </div>
      )}

      <div className="notice" role="note">
        <span aria-hidden="true">●</span>
        <span>Testnet pilot. Points record contribution only — they have no monetary value and cannot be transferred.</span>
      </div>

      <div className="how">
        <div className="card">
          <h3>1 · Connect your node</h3>
          <p>Run the app with your wallet. Your node registers and starts heartbeating.</p>
        </div>
        <div className="card">
          <h3>2 · It runs in the background</h3>
          <p>Only idle bandwidth is used. Your streaming, calls and downloads always come first.</p>
        </div>
        <div className="card">
          <h3>3 · You earn points</h3>
          <p>Network points for traffic served, uptime points for staying connected. Settled hourly, on-chain.</p>
        </div>
      </div>

      {ids.length > 0 && (
        <>
          <div className="page-head" style={{ marginTop: 34 }}>
            <h1 style={{ fontSize: 22 }}>Latest settlement</h1>
          </div>
          <div className="rows">
            {ids.slice(0, 3).map((id) => {
              const e = epochs[id];
              return (
                <div className="row" key={id}>
                  <div className="row-main">
                    <div className="row-title">Epoch {id}</div>
                    <div className="row-sub">
                      Closed {timeAgo(epochStart(Number(id)) + 3_600_000, now)}
                      {" · "}<code>{shortHash(e.root)}</code>
                      <Copy value={e.root} />
                    </div>
                  </div>
                  <div className="row-links">
                    <a className="link-btn" href={`/api/epochs/${id}/evidence`} target="_blank" rel="noreferrer">Evidence</a>
                    {e.tx ? <a className="link-btn" href={`https://scan.bohr.life/tx/${e.tx}`} target="_blank" rel="noreferrer">Transaction</a> : null}
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}
    </>
  );
}
