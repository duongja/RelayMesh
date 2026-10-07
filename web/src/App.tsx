import { useState } from "react";
import Dashboard from "./views/Dashboard";
import Network from "./views/Network";
import Earn from "./views/Earn";
import Operator from "./views/Operator";

type View = "dashboard" | "network" | "earn" | "operator";

const NAV: { id: View; label: string; group: string }[] = [
  { id: "dashboard", label: "Dashboard", group: "Participate" },
  { id: "earn", label: "Get started", group: "Participate" },
  { id: "network", label: "Network", group: "Verify" },
  { id: "operator", label: "Operator", group: "Run" },
];

export default function App() {
  const [view, setView] = useState<View>(() => {
    const h = window.location.hash.replace("#/", "");
    return NAV.some((n) => n.id === h) ? (h as View) : "dashboard";
  });
  const [tick, setTick] = useState(0);

  const go = (v: View) => {
    setView(v);
    window.location.hash = `#/${v}`;
  };

  let lastGroup = "";
  return (
    <div className="shell">
      <aside className="sidebar" aria-label="Primary">
        <div className="brand">
          <div className="brand-mark" aria-hidden="true">R</div>
          <div>
            <div className="brand-name">RelayMesh</div>
            <div className="brand-sub">Bandwidth network</div>
          </div>
        </div>
        {NAV.map((n) => {
          const header = n.group !== lastGroup ? (
            <div className="nav-label" key={`g-${n.group}`}>{n.group}</div>
          ) : null;
          lastGroup = n.group;
          return (
            <div key={n.id}>
              {header}
              <button
                className={`nav-item ${view === n.id ? "active" : ""}`}
                aria-current={view === n.id ? "page" : undefined}
                onClick={() => go(n.id)}
              >
                <span className="nav-dot" />
                {n.label}
              </button>
            </div>
          );
        })}
        <div className="side-foot">
          <span className="pill"><span className="dot" />Testnet · No earnings</span>
          <div style={{ marginTop: 10 }}>BOT Chain · 968<br />Points have no value.</div>
        </div>
      </aside>

      <main className="main">
        {view === "dashboard" && <Dashboard />}
        {view === "network" && <Network />}
        {view === "earn" && <Earn />}
        {view === "operator" && <Operator onChanged={() => setTick((t) => t + 1)} />}
        <footer className="foot" key={tick} aria-hidden="true">
          <span>BOT Testnet · Chain 968 · No real-money stakes</span>
          <span>
            <a href="https://scan.bohr.life" target="_blank" rel="noreferrer">Explorer</a>
            {" · "}
            <a href="https://faucet.botchain.ai/basic" target="_blank" rel="noreferrer">Faucet</a>
            {" · "}
            <a href="https://dev-docs.botchain.ai" target="_blank" rel="noreferrer">Docs</a>
          </span>
        </footer>
      </main>
    </div>
  );
}
