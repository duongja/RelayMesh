import { useState } from "react";
import {
  createPublicClient, createWalletClient, custom, defineChain, formatEther, http, parseAbi,
} from "viem";
import { api, BOT_TESTNET, TOKEN, type ClaimProof, type Epochs } from "../api";

const REWARDS_ABI = parseAbi([
  "function claim(uint256 epochId, bytes32 nodeId, address wallet, uint256 netPts, uint256 upPts, uint256 bytes_, uint256 amount, bytes32[] proof)",
  "function claimed(uint256 epochId, bytes32 nodeId) view returns (bool)",
]);

const botChain = defineChain({
  id: BOT_TESTNET.id,
  name: BOT_TESTNET.name,
  nativeCurrency: BOT_TESTNET.native,
  rpcUrls: { default: { http: [BOT_TESTNET.rpc] } },
  blockExplorers: { default: { name: "BOTScan", url: BOT_TESTNET.explorer } },
  testnet: true,
});

declare global {
  interface Window { ethereum?: { request: (a: { method: string; params?: unknown }) => Promise<unknown>; on?: (...a: never[]) => void } }
}

interface ClaimRow {
  epochId: number;
  nodeId: string;
  proof: ClaimProof;
  claimed: boolean;
  tx?: string;
  busy?: boolean;
  error?: string;
}

async function ensureWallet(): Promise<string> {
  const eth = window.ethereum;
  if (!eth) throw new Error("No wallet found. Install MetaMask or BO Wallet first.");
  const accounts = (await eth.request({ method: "eth_requestAccounts" })) as string[];
  if (!accounts[0]) throw new Error("Wallet gave no accounts.");
  try {
    await eth.request({
      method: "wallet_switchEthereumChain",
      params: [{ chainId: "0x3c8" }],
    });
  } catch {
    await eth.request({
      method: "wallet_addEthereumChain",
      params: [{
        chainId: "0x3c8", chainName: BOT_TESTNET.name,
        nativeCurrency: BOT_TESTNET.native,
        rpcUrls: [BOT_TESTNET.rpc], blockExplorerUrls: [BOT_TESTNET.explorer],
      }],
    });
  }
  return accounts[0];
}

export default function Rewards() {
  const [wallet, setWallet] = useState("");
  const [rows, setRows] = useState<ClaimRow[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [funded, setFunded] = useState<{ epochId: number; fundedWei: string; tx?: string }[]>([]);

  const lookup = async () => {
    const w = wallet.trim();
    if (!/^0x[0-9a-fA-F]{40}$/.test(w)) {
      setErr("Enter a valid 0x wallet address.");
      return;
    }
    setBusy(true);
    setErr("");
    setRows([]);
    try {
      const [nodes, epochs] = await Promise.all([api.walletNodes(w), api.epochs() as Promise<Epochs>]);
      const eps = Object.keys(epochs).map(Number).sort((a, b) => b - a)
        .filter((id) => epochs[String(id)].rewardsRoot)
        .map((id) => ({ epochId: id, fundedWei: epochs[String(id)].fundedWei ?? "0", tx: epochs[String(id)].rewardsTx }));
      setFunded(eps);
      const publicClient = createPublicClient({ chain: botChain, transport: http() });
      const out: ClaimRow[] = [];
      for (const n of nodes) {
        for (const e of eps) {
          try {
            const proof = await api.proof(e.epochId, n.nodeId);
            if (proof.amountWei === "0") continue;
            const claimed = (await publicClient.readContract({
              address: TOKEN.rewards as `0x${string}`,
              abi: REWARDS_ABI, functionName: "claimed", args: [BigInt(e.epochId), proof.nodeId as `0x${string}`],
            })) as boolean;
            out.push({ epochId: e.epochId, nodeId: n.nodeId, proof, claimed });
          } catch { /* no share or unfunded — skip */ }
        }
      }
      setRows(out);
      if (out.length === 0) setErr("No claimable rewards for this wallet yet. Earn points first — settlements fund each hour.");
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Lookup failed");
    } finally {
      setBusy(false);
    }
  };

  const claim = async (row: ClaimRow) => {
    setRows((rs) => rs.map((r) => (r === row ? { ...r, busy: true, error: undefined } : r)));
    try {
      const from = await ensureWallet();
      if (from.toLowerCase() !== row.proof.wallet.toLowerCase()) {
        throw new Error(`Switch wallet to ${row.proof.wallet.slice(0, 10)}… (the node owner) to claim.`);
      }
      const walletClient = createWalletClient({ chain: botChain, transport: custom(window.ethereum!) });
      const hash = await walletClient.writeContract({
        address: TOKEN.rewards as `0x${string}`,
        abi: REWARDS_ABI,
        functionName: "claim",
        args: [
          BigInt(row.epochId), row.proof.nodeId as `0x${string}`, row.proof.wallet as `0x${string}`,
          BigInt(row.proof.netPts), BigInt(row.proof.upPts), BigInt(row.proof.bytes),
          BigInt(row.proof.amountWei), row.proof.proof as `0x${string}`[],
        ],
        account: from as `0x${string}`,
      });
      setRows((rs) => rs.map((r) => (r === row ? { ...r, busy: false, claimed: true, tx: hash } : r)));
    } catch (e) {
      const msg = e instanceof Error ? e.message.split("\n")[0].slice(0, 220) : "Claim failed";
      setRows((rs) => rs.map((r) => (r === row ? { ...r, busy: false, error: msg } : r)));
    }
  };

  const total = rows.filter((r) => !r.claimed).reduce((a, r) => a + BigInt(r.proof.amountWei), 0n);

  return (
    <>
      <div className="page-head">
        <h1>Your rewards.</h1>
        <p>Points become {TOKEN.symbol} every hour, split pro-rata across earners. Claim with the node owner’s wallet — directly from the contract, no middleman.</p>
      </div>

      <div className="card">
        <div className="label">tRELAY contract (BOT testnet)</div>
        <div className="row-sub"><code>{TOKEN.address}</code></div>
        <div className="searchrow">
          <input
            type="text"
            value={wallet}
            onChange={(e) => setWallet(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") lookup(); }}
            placeholder="Wallet address (0x…)"
            aria-label="Wallet address"
            spellCheck={false}
            autoComplete="off"
          />
          <button className="btn-primary" onClick={lookup} disabled={busy || !wallet.trim()}>
            {busy ? "Checking…" : "Find rewards"}
          </button>
        </div>
      </div>

      {err && <div className="alert-err" role="alert">{err}</div>}

      {funded.length > 0 && (
        <p className="op-note" style={{ marginTop: 14 }}>
          Funded epochs: {funded.map((f) => `#${f.epochId} (${formatEther(BigInt(f.fundedWei))} ${TOKEN.symbol})`).join(" · ")}
        </p>
      )}

      {rows.length > 0 && (
        <>
          <div className="page-head" style={{ marginTop: 26 }}>
            <h1 style={{ fontSize: 22 }}>
              Claimable: {formatEther(total)} {TOKEN.symbol}
            </h1>
          </div>
          <div className="rows">
            {rows.map((r) => (
              <div className="row" key={`${r.epochId}-${r.nodeId}`}>
                <div className="row-main">
                  <div className="row-title">
                    {formatEther(BigInt(r.proof.amountWei))} {TOKEN.symbol}
                    <span style={{ fontWeight: 400, color: "var(--secondary)" }}> · epoch {r.epochId}</span>
                  </div>
                  <div className="row-sub">
                    node <code>{r.nodeId.slice(0, 10)}…{r.nodeId.slice(-6)}</code>
                    {" · "}{r.proof.netPts + r.proof.upPts} pts
                    {r.claimed && !r.tx ? " · claimed" : ""}
                    {r.tx && <> · <a className="link-btn" href={`${BOT_TESTNET.explorer}/tx/${r.tx}`} target="_blank" rel="noreferrer" style={{ fontSize: 12, padding: "4px 10px" }}>Transaction</a></>}
                  </div>
                  {r.error && <div className="alert-err" role="alert">{r.error}</div>}
                </div>
                <div className="row-links">
                  {r.claimed ? (
                    <span className="pill live"><span className="dot" />Claimed</span>
                  ) : (
                    <button className="btn-primary" disabled={r.busy} onClick={() => claim(r)}>
                      {r.busy ? "Claiming…" : "Claim"}
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      <div className="notice" role="note" style={{ marginTop: 18 }}>
        <span aria-hidden="true">●</span>
        <span>Testnet {TOKEN.symbol} has no monetary value. Claims are wallet-bound: only the node owner’s address can claim its share, and each share pays exactly once.</span>
      </div>
    </>
  );
}
