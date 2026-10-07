import { useState } from "react";
import { api, type Flags } from "../api";

export default function Operator({ onChanged }: { onChanged: () => void }) {
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
    <>
      <div className="page-head">
        <h1>Operator controls.</h1>
        <p>Settlements, kill-switch, abuse flags. Your token never leaves this browser except to the coordinator.</p>
      </div>
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
    </>
  );
}
