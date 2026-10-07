import { useCallback, useEffect, useState } from "react";
import {
  api, copyText, epochStart, formatBytes, formatCountdown, msToNextEpoch,
  shortHash, timeAgo, type Epochs, type NodeInfo, type Status,
} from "../api";
import { useConnection } from "../node";

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

const CITIES = ["KE-Nairobi", "KE-Mombasa", "KE-Kisumu", "KE-Nakuru", "NG-Lagos", "GH-Accra"];

export default function Dashboard() {
  const now = useNow();
  const conn = useConnection();
  const [status, setStatus] = useState<Status | null>(null);
  const [epochs, setEpochs] = useState<Epochs>({});
  const [failed, setFailed] = useState(false);
  const [mine, setMine] = useState<NodeInfo | null>(null);
  const [wallet, setWallet] = useState(conn.wallet);
  const [geo, setGeo] = useState("KE-Nairobi");

  const refresh = useCallback(async () => {
    try {
      const [s, e] = await Promise.all([api.status(), api.epochs()]);
      setStatus(s);
      setEpochs(e);
      setFailed(false);
      if (conn.nodeId && conn.status === "on") {
        try { setMine(await api.node(conn.nodeId)); } catch { setMine(null); }
      } else setMine(null);
    } catch {
      setFailed(true);
    }
  }, [conn.nodeId, conn.status]);

  useEffect(() => {
    refresh();
    const t = setInterval(() => { if (!document.hidden) refresh(); }, 10000);
    return () => clearInterval(t);
  }, [refresh]);

  const ids = Object.keys(epochs).sort((a, b) => Number(b) - Number(a));
  const connected = conn.status === "on";

  return (
    <>
      <div className="page-head">
        <h1>Earn from the internet<br />you don’t use.</h1>
        <p>Share idle bandwidth through your node. Track everything below — connection, points, and every settlement, all verifiable on-chain.</p>
      </div>

      <div className="status-hero">
        <div className={`status-light ${connected ? "" : "idle"}`} aria-hidden="true" />
        <div style={{ flex: 1, minWidth: 200 }}>
          <div className="status-title">
            {conn.status === "connecting" ? "Connecting…" : connected ? "Connected" : "Not connected"}
          </div>
          <div className="status-sub">
            {connected ? `BROWSER NODE · ${shortHash(conn.nodeId, 12, 8)}` : "One tap to join the network"}
          </div>
          {!connected && (
            <div className="op-row" style={{ marginTop: 12 }}>
              <input
                type="text"
                value={wallet}
                onChange={(e) => setWallet(e.target.value)}
                placeholder="Wallet address (0x…)"
                aria-label="Wallet address"
                spellCheck={false}
                autoComplete="off"
                style={{ maxWidth: 240 }}
              />
              <select
                value={geo}
                onChange={(e) => setGeo(e.target.value)}
                aria-label="City"
                style={{ font: "inherit", fontSize: 14, background: "rgba(255,255,255,0.04)", color: "var(--ink)", border: "1px solid var(--hairline-2)", borderRadius: 11, padding: "11px 12px" }}
              >
                {CITIES.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
              <button
                className="btn-primary"
                disabled={conn.status === "connecting" || !wallet.trim()}
                onClick={() => conn.connect(wallet, geo)}
              >
                {conn.status === "connecting" ? "Connecting…" : conn.hasIdentity ? "Reconnect" : "Connect"}
              </button>
            </div>
          )}
          {conn.status === "error" && <div className="alert-err" role="alert">{conn.error}</div>}
          {connected && (
            <div className="op-row" style={{ marginTop: 12 }}>
              <button className="btn-quiet" onClick={conn.disconnect}>Disconnect</button>
              <span className="op-note">Stops sharing instantly. Reconnect anytime.</span>
            </div>
          )}
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
            <div className="hint">
              of {status.nodesKnown} known
              {status.nodesBrowser ? ` · ${status.nodesBrowser} in app` : ""}
            </div>
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
        <span>This app earns uptime points while it stays open. For relay earnings, run the desktop node — see Get started.</span>
      </div>

      <div className="how">
        <div className="card">
          <h3>1 · Connect</h3>
          <p>One tap with your wallet. Your browser node registers and starts heartbeating.</p>
        </div>
        <div className="card">
          <h3>2 · Keep it open</h3>
          <p>Uptime accrues while the app is open. Your connection is never touched beyond heartbeats.</p>
        </div>
        <div className="card">
          <h3>3 · You earn points</h3>
          <p>Uptime points here; network points with the desktop node. Settled hourly, on-chain.</p>
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
