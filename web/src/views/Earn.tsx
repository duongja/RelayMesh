import { useState } from "react";
import { api, formatBytes } from "../api";
import { useMyNodeId } from "./Dashboard";

export default function Earn() {
  const [myId, saveMyId] = useMyNodeId();
  const [input, setInput] = useState(myId);
  const [err, setErr] = useState("");
  const [ok, setOk] = useState(false);
  const [checking, setChecking] = useState(false);

  const connect = async () => {
    const v = input.trim();
    if (!/^0x[0-9a-fA-F]{64}$/.test(v)) {
      setErr("That doesn’t look like a node ID — it should be 0x followed by 64 hex characters.");
      setOk(false);
      return;
    }
    setChecking(true);
    setErr("");
    try {
      const n = await api.node(v);
      saveMyId(v);
      setOk(true);
      setErr("");
      void n;
    } catch {
      setErr("No node with that ID has checked in yet. Run the app first, wait ~30 seconds, then try again.");
      setOk(false);
    } finally {
      setChecking(false);
    }
  };

  return (
    <>
      <div className="page-head">
        <h1>Start earning in<br />three steps.</h1>
        <p>Your connection stays yours. RelayMesh only ever uses what you’re not using — and you can stop it at any time.</p>
      </div>

      <div className="steps">
        <div className="step">
          <div className="step-num">1</div>
          <div>
            <h3>Run the node app</h3>
            <p>Linux terminal. It asks for nothing except permission to share idle bandwidth.</p>
            <div className="cmd">
              <span className="c"># heartbeat + worker (replace wallet + geo)</span>{"\n"}
              NODE_WALLET=0x… NODE_GEO=KE-Nairobi{"\n"}
              COORDINATOR_URL=https://your-coordinator{"\n"}
              relaymesh work
            </div>
          </div>
        </div>
        <div className="step">
          <div className="step-num">2</div>
          <div>
            <h3>Connect it here</h3>
            <p>Paste your node ID below. It’s stored only in this browser — this dashboard then shows your points and status.</p>
            <div className="searchrow" style={{ marginTop: 0 }}>
              <input
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") connect(); }}
                placeholder="0x… node ID"
                aria-label="Node ID"
                spellCheck={false}
                autoComplete="off"
              />
              <button className="btn-primary" onClick={connect} disabled={checking || !input.trim()}>
                {checking ? "Checking…" : myId ? "Reconnect" : "Connect"}
              </button>
            </div>
            {myId && !err && (
              <p className="op-note" style={{ marginTop: 8 }}>
                Connected as <code style={{ fontFamily: "var(--mono)", fontSize: 12 }}>{myId.slice(0, 14)}…{myId.slice(-6)}</code>
                {" · "}<button className="copy-btn" onClick={() => { saveMyId(""); setInput(""); setOk(false); }}>Disconnect</button>
              </p>
            )}
            {err && <div className="alert-err" role="alert">{err}</div>}
            {ok && <div className="alert-ok" role="status">Node found — your dashboard now tracks it.</div>}
          </div>
        </div>
        <div className="step">
          <div className="step-num">3</div>
          <div>
            <h3>Leave it running, earn points</h3>
            <p>Network points for traffic your connection carries ({formatBytes(102400)} = 1 point). Uptime points for staying connected. Settled every hour, provable on-chain.</p>
          </div>
        </div>
      </div>

      <div className="notice" role="note" style={{ marginTop: 18 }}>
        <span aria-hidden="true">●</span>
        <span>Outbound traffic only, to approved public sites. Never your files, passwords, or browsing. Pause anytime by stopping the app.</span>
      </div>
    </>
  );
}
