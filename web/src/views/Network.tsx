import { useCallback, useEffect, useState } from "react";
import { api, copyText, epochStart, shortHash, timeAgo, type Epochs, type Status } from "../api";

export default function Network() {
  const [status, setStatus] = useState<Status | null>(null);
  const [epochs, setEpochs] = useState<Epochs>({});
  const [failed, setFailed] = useState(false);
  const [now, setNow] = useState(Date.now());

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
    const t = setInterval(() => { if (!document.hidden) refresh(); }, 10000);
    const c = setInterval(() => setNow(Date.now()), 30000);
    return () => { clearInterval(t); clearInterval(c); };
  }, [refresh]);

  const ids = Object.keys(epochs).sort((a, b) => Number(b) - Number(a));

  return (
    <>
      <div className="page-head">
        <h1>Network activity.</h1>
        <p>Every settlement, with the proof to recompute it. No trust required.</p>
      </div>

      {failed && !status ? (
        <div className="empty"><strong>Can’t reach the coordinator.</strong>Check that the backend is running, then refresh.</div>
      ) : (
        <>
          <div className="grid cols-3">
            <div className="card">
              <div className="label">Nodes online</div>
              <div className="big">{status?.nodesOnline ?? "—"}</div>
              <div className="hint">of {status?.nodesKnown ?? "—"} known</div>
            </div>
            <div className="card">
              <div className="label">Network</div>
              <div className="big" style={{ fontSize: 22, paddingTop: 5 }}>BOT testnet</div>
              <div className="hint">Chain 968 · ~0.75s blocks</div>
            </div>
            <div className="card">
              <div className="label">Epochs settled</div>
              <div className="big">{ids.length}</div>
              <div className="hint">Merkle root + evidence each</div>
            </div>
          </div>

          <div className="page-head" style={{ marginTop: 30 }}>
            <h1 style={{ fontSize: 22 }}>All settlements</h1>
          </div>
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
                        <button
                          className="copy-btn"
                          onClick={async (ev) => {
                            ev.preventDefault();
                            await copyText(e.root);
                          }}
                        >
                          Copy
                        </button>
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
          )}
        </>
      )}
    </>
  );
}
