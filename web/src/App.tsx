import { useCallback, useEffect, useState } from "react";
import {
  api, copyText, epochStart, formatBytes, shortHash, timeAgo,
  type Epochs, type Flags, type NodeInfo, type Status,
} from "./api";

function useNow(intervalMs = 30000): number {
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

export default function App() {
  const now = useNow();
  const [status, setStatus] = useState<Status | null>(null);
  const [epochs, setEpochs] = useState<Epochs>({});
  const [failed, setFailed] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const [s, e] = await Promise.all([api.status(), api.epochs()]);
      setStatus(s);
      setEpochs(e);
      setFailed(false);
    } catch {
      setFailed(true);
    }
  }, []);

  useEffect(() => {
    refresh();
    const t = setInterval(() => {
      if (!document.hidden) refresh();
    }, 10000);
    return () => clearInterval(t);
  }, [refresh]);

  const ids = Object.keys(epochs).sort((a, b) => Number(b) - Number(a));
  const latest = ids[0];

  return (
    <div className="shell">
      <header className="topbar">
        <div className="wordmark">RelayMesh <span>· Bandwidth network</span></div>
        <span className="netpill" aria-live="polite">
          <span className={`dot ${(status?.nodesOnline ?? 0) > 0 ? "live" : "idle"}`} />
          {status ? `${status.nodesOnline} online · Testnet` : "Connecting…"}
        </span>
      </header>

      <div className="hero">
        <h1>Put idle bandwidth to work for public web data.</h1>
        <p>
          RelayMesh routes verified fetch jobs through residential connections and
          settles every hour on BOT Chain — openly verifiable, down to the block.
        </p>
        <div className="pilot-note" role="note">
          <span aria-hidden="true">●</span>
          <span>Testnet pilot. Points record contribution only — they have no monetary value and cannot be transferred.</span>
        </div>
      </div>

      <section aria-label="Network overview">
        <p className="eyebrow">Network</p>
        <h2 className="section-title">Live right now</h2>
        {failed && !status ? (
          <div className="empty"><strong>Can’t reach the coordinator.</strong>Check that the backend is running, then refresh.</div>
        ) : !status ? (
          <div className="stats">
            {[0, 1, 2, 3].map((i) => <div className="stat" key={i}><div className="skel" /></div>)}
          </div>
        ) : (
          <div className="stats">
            <div className="stat">
              <div className="label">Nodes online</div>
              <div className="value">{status.nodesOnline}</div>
              <div className="hint">of {status.nodesKnown} known</div>
            </div>
            <div className="stat">
              <div className="label">Epochs settled</div>
              <div className="value">{ids.length}</div>
              <div className="hint">on BOT testnet</div>
            </div>
            <div className="stat">
              <div className="label">Latest epoch</div>
              <div className="value" style={{ fontSize: 24 }}>{latest ?? "—"}</div>
              <div className="hint">{latest ? timeAgo(epochStart(Number(latest)) + 3_600_000, now) + " closed" : "none yet"}</div>
            </div>
            <div className="stat">
              <div className="label">Settlement</div>
              <div className="value" style={{ fontSize: 20, paddingTop: 4 }}>On-chain</div>
              <div className="hint">Merkle root + evidence</div>
            </div>
          </div>
        )}
      </section>

      <EpochSection ids={ids} epochs={epochs} now={now} />

      <NodeSection />

      <OperatorSection onChanged={refresh} />

      <footer>
        <span>BOT Testnet · Chain 968 · No real-money stakes</span>
        <span>
          <a href="https://scan.bohr.life" target="_blank" rel="noreferrer">Explorer</a>
          {" · "}
          <a href="https://faucet.botchain.ai/basic" target="_blank" rel="noreferrer">Faucet</a>
          {" · "}
          <a href="https://dev-docs.botchain.ai" target="_blank" rel="noreferrer">Docs</a>
        </span>
      </footer>
    </div>
  );
}

/* ---------------- epochs ---------------- */

function EpochSection({ ids, epochs, now }: { ids: string[]; epochs: Epochs; now: number }) {
  return (
    <section aria-label="Settled epochs">
      <p className="eyebrow">Proof</p>
      <h2 className="section-title">Settled epochs</h2>
      <p className="section-sub">
        Each hour closes with a Merkle root and evidence bundle posted on-chain.
        Anyone can recompute both from the published evidence.
      </p>
      {ids.length === 0 ? (
        <div className="empty">
          <strong>No epochs settled yet.</strong>
          The first hourly close will appear here with its proof.
        </div>
      ) : (
        <div className="rows">
          {ids.map((id) => {
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
                  {e.tx ? (
                    <a className="link-btn" href={`https://scan.bohr.life/tx/${e.tx}`} target="_blank" rel="noreferrer">Transaction</a>
                  ) : null}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}

/* ---------------- node lookup ---------------- */

function NodeSection() {
  const [input, setInput] = useState("");
  const [node, setNode] = useState<NodeInfo | null>(null);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const now = useNow();

  const online = node ? Date.now() - node.lastBeat < 90_000 : false;

  const lookup = async () => {
    if (!input.trim()) return;
    setBusy(true);
    setErr("");
    setNode(null);
    try {
      setNode(await api.node(input));
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Lookup failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <section aria-label="Your node">
      <p className="eyebrow">Sharers</p>
      <h2 className="section-title">Check a node</h2>
      <p className="section-sub">Paste a node ID to see its contribution, earnings in points, and standing.</p>
      <div className="searchrow">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") lookup(); }}
          placeholder="0x… node ID"
          aria-label="Node ID"
          spellCheck={false}
          autoComplete="off"
        />
        <button className="btn-primary" onClick={lookup} disabled={busy || !input.trim()}>
          {busy ? "Looking…" : "Look up"}
        </button>
      </div>
      {err && <div className="alert-err" role="alert">{err === "node not found" ? "No node with that ID. Check for typos and try again." : err}</div>}
      {node && (
        <div className="nodecard">
          <div className="node-head">
            <span className={`dot ${online ? "live" : "idle"}`} />
            <span className="status-line">{online ? "Online" : "Offline"}</span>
          </div>
          <div className="node-id">{node.nodeId}</div>
          <div className="nodegrid">
            <div className="cell"><div className="k">Data relayed</div><div className="v">{formatBytes(node.bytes)}</div></div>
            <div className="cell"><div className="k">Jobs served</div><div className="v">{node.jobs}</div></div>
            <div className="cell"><div className="k">Network pts</div><div className="v">{node.points.netPts}</div></div>
            <div className="cell"><div className="k">Uptime pts</div><div className="v">{node.points.upPts}</div></div>
          </div>
          <p className="fineprint">
            {node.eligible ? "In good standing." : "Flagged by the operator — not receiving jobs."}
            {" Last heartbeat "}
            {timeAgo(node.lastBeat, now)} · {node.beats} heartbeats total.
          </p>
        </div>
      )}
    </section>
  );
}

/* ---------------- operator ---------------- */

function OperatorSection({ onChanged }: { onChanged: () => void }) {
  const [token, setToken] = useState(() => sessionStorage.getItem("relaymesh-admin") || "");
  const [flags, setFlags] = useState<Flags | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const save = () => sessionStorage.setItem("relaymesh-admin", token);

  const load = async () => {
    setMsg(null);
    try {
      save();
      setFlags(await api.flags(token));
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : "Failed" });
    }
  };

  const act = async (fn: (t: string) => Promise<unknown>, okText: string) => {
    setBusy(true);
    setMsg(null);
    try {
      save();
      await fn(token);
      setFlags(await api.flags(token));
      onChanged();
      setMsg({ ok: true, text: okText });
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : "Failed" });
    } finally {
      setBusy(false);
    }
  };

  return (
    <section aria-label="Operator">
      <p className="eyebrow">Operator</p>
      <h2 className="section-title">Run the network</h2>
      <p className="section-sub">Restricted actions. Your token never leaves this browser except to the coordinator.</p>
      <div className="op-panel">
        <div className="op-row">
          <input
            type="password"
            value={token}
            onChange={(e) => setToken(e.target.value)}
            placeholder="Operator token"
            aria-label="Operator token"
            autoComplete="off"
            style={{ maxWidth: 320 }}
          />
          <button className="btn-quiet" onClick={load} disabled={!token}>Connect</button>
        </div>
        {flags && (
          <>
            <div className="op-row" style={{ marginTop: 16 }}>
              <button className="btn-quiet" disabled={busy} onClick={() => act((t) => api.closeEpoch(t), "Epoch submitted — watch for the transaction.")}>
                Close epoch now
              </button>
              {flags.paused ? (
                <button className="btn-primary" disabled={busy} onClick={() => act((t) => api.setPaused(t, false), "Network resumed.")}>
                  Resume network
                </button>
              ) : (
                <button className="btn-danger-quiet" disabled={busy} onClick={() => act((t) => api.setPaused(t, true), "Network paused. Assignments halt immediately.")}>
                  Pause network
                </button>
              )}
            </div>
            <p className="op-note" style={{ marginTop: 12 }}>
              Status: {flags.paused ? "paused — no jobs are being assigned." : "live — assigning jobs."}
            </p>
            {flags.duplicateIps.length > 0 ? (
              <div style={{ marginTop: 8 }}>
                {flags.duplicateIps.map((f) => (
                  <div className="flag" key={f.ip}>
                    {f.nodeIds.length} nodes share IP <code>{f.ip}</code> — rewards split, review for farming.
                  </div>
                ))}
              </div>
            ) : (
              <p className="op-note">No shared-IP flags. One node per connection, as it should be.</p>
            )}
          </>
        )}
        {msg && <div className={msg.ok ? "alert-ok" : "alert-err"} role={msg.ok ? "status" : "alert"}>{msg.text}</div>}
      </div>
    </section>
  );
}
