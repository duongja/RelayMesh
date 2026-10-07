import { formatBytes } from "../api";

export default function Earn() {

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
            <h3>Connect on the dashboard</h3>
            <p>Enter your wallet and city on the Dashboard and tap Connect. Your browser node registers in one step — nothing to install.</p>
            <div className="op-row">
              <a className="link-btn primary" href="#/dashboard">Open dashboard</a>
            </div>
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
