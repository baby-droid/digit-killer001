/**
 * DerivConnectionBar — compact connection widget displayed at the top of every
 * trading page. Users connect via PAT/token or OAuth. Shows balance, account,
 * real/demo badge, demo reset, and account switcher.
 */
import { useState, useEffect } from "react";
import {
  Wifi, WifiOff, Loader, DollarSign, User, ChevronDown,
  RotateCcw, LogIn, LogOut, AlertCircle, ShieldCheck,
} from "lucide-react";
import { useDerivContext } from "@/context/DerivContext";

function generateCodeVerifier(): string {
  const arr = crypto.getRandomValues(new Uint8Array(64));
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~";
  return Array.from(arr).map((v) => chars[v % 66]).join("");
}
async function generateCodeChallenge(v: string): Promise<string> {
  const hash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(v));
  return btoa(String.fromCharCode(...new Uint8Array(hash))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function generateState(): string {
  return Array.from(crypto.getRandomValues(new Uint8Array(16))).map((b) => b.toString(16).padStart(2, "0")).join("");
}

interface OAuthConfig { client_id: string; app_id: string; redirect_uri: string; configured: boolean; }

export default function DerivConnectionBar() {
  const deriv = useDerivContext();
  const [tokenInput, setTokenInput] = useState(() => localStorage.getItem("deriv_token") ?? "");
  const [showConnect, setShowConnect] = useState(false);
  const [showAccts, setShowAccts]   = useState(false);
  const [loginMode, setLoginMode]   = useState<"pat" | "oauth">("pat");
  const [oauthCfg, setOauthCfg]    = useState<OAuthConfig | null>(null);
  const [oauthLoading, setOauthLoading] = useState(false);
  const [demoMsg, setDemoMsg]       = useState<string | null>(null);
  const [resetting, setResetting]   = useState(false);

  useEffect(() => {
    if (loginMode === "oauth" && !oauthCfg) {
      fetch("/api/deriv/oauth/config").then((r) => r.json()).then((d) => setOauthCfg(d as OAuthConfig)).catch(() => {});
    }
  }, [loginMode, oauthCfg]);

  const statusColor = {
    disconnected: "#ef4444", connecting: "#fb8c00", authorizing: "#facc15", connected: "#22c55e",
  }[deriv.status];

  async function handleOAuthLogin() {
    if (!oauthCfg?.configured) return;
    setOauthLoading(true);
    const verifier  = generateCodeVerifier();
    const challenge = await generateCodeChallenge(verifier);
    const state     = generateState();
    sessionStorage.setItem("pkce_code_verifier", verifier);
    sessionStorage.setItem("oauth_state", state);
    sessionStorage.setItem("oauth_redirect_uri", oauthCfg.redirect_uri);
    const params = new URLSearchParams({
      response_type: "code", client_id: oauthCfg.client_id, redirect_uri: oauthCfg.redirect_uri,
      scope: "trade account_manage", state, code_challenge: challenge, code_challenge_method: "S256",
    });
    window.location.href = `https://auth.deriv.com/oauth2/auth?${params.toString()}`;
  }

  async function handleDemoReset() {
    if (!deriv.account?.is_virtual) return;
    setResetting(true); setDemoMsg(null);
    try {
      await deriv.topupDemo();
      setDemoMsg("Demo topped up!");
    } catch (e) {
      setDemoMsg(e instanceof Error ? e.message : "Reset failed");
    }
    setResetting(false);
    setTimeout(() => setDemoMsg(null), 3000);
  }

  // ── Disconnected: show compact connect button ─────────────────────────────
  if (deriv.status === "disconnected") {
    return (
      <div className="mb-4">
        {deriv.error && (
          <div className="flex items-start gap-2 px-3 py-2 rounded-lg mb-2"
            style={{ background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.25)" }}>
            <AlertCircle size={12} className="text-red-400 flex-shrink-0 mt-0.5" />
            <div>
              <span className="font-rajdhani text-xs text-red-400">{deriv.error}</span>
              {deriv.error.includes("1006") && (
                <div className="font-rajdhani text-[10px] text-muted-foreground mt-0.5">
                  Tip: Ensure your API token has Trade permission enabled on Deriv.
                </div>
              )}
            </div>
          </div>
        )}

        {!showConnect ? (
          <button
            onClick={() => setShowConnect(true)}
            className="w-full flex items-center justify-center gap-2 py-2.5 rounded-lg font-orbitron text-xs font-bold tracking-wider transition-all border"
            style={{ background: "rgba(0,229,255,0.06)", borderColor: "rgba(0,229,255,0.3)", color: "#00e5ff" }}
          >
            <Wifi size={14} /> CONNECT DERIV ACCOUNT TO TRADE
          </button>
        ) : (
          <div className="rounded-xl border overflow-hidden" style={{ borderColor: "rgba(0,229,255,0.25)", background: "rgba(0,229,255,0.02)" }}>
            <div className="px-4 py-2.5 border-b flex items-center justify-between" style={{ borderColor: "rgba(0,229,255,0.12)", background: "rgba(0,0,0,0.25)" }}>
              <span className="font-orbitron text-xs font-bold text-primary tracking-wider">CONNECT TO DERIV</span>
              <button onClick={() => setShowConnect(false)} className="font-rajdhani text-[10px] text-muted-foreground hover:text-foreground">✕ close</button>
            </div>
            <div className="p-4 space-y-3">
              {/* Mode tabs */}
              <div className="flex rounded-lg overflow-hidden border" style={{ borderColor: "rgba(0,229,255,0.2)" }}>
                {(["pat", "oauth"] as const).map((m) => (
                  <button key={m} onClick={() => setLoginMode(m)}
                    className="flex-1 flex items-center justify-center gap-1.5 py-2 font-orbitron text-[10px] font-bold tracking-wider transition-all"
                    style={loginMode === m ? { background: "#00e5ff", color: "#050a0f" } : { color: "rgba(0,229,255,0.5)" }}>
                    {m === "pat" ? <Wifi size={10} /> : <LogIn size={10} />}
                    {m === "pat" ? "API Token" : "Login with Deriv"}
                  </button>
                ))}
              </div>

              {loginMode === "pat" && (
                <div className="flex gap-2">
                  <input
                    type="password" value={tokenInput}
                    onChange={(e) => setTokenInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && tokenInput.trim()) {
                        localStorage.setItem("deriv_token", tokenInput.trim());
                        deriv.connect(tokenInput.trim());
                        setShowConnect(false);
                      }
                    }}
                    placeholder="Paste Deriv API token (with Trade permission)…"
                    className="flex-1 px-3 py-2 rounded-lg font-rajdhani text-xs bg-background border border-border text-foreground focus:outline-none focus:border-primary"
                  />
                  <button
                    onClick={() => {
                      if (!tokenInput.trim()) return;
                      localStorage.setItem("deriv_token", tokenInput.trim());
                      deriv.connect(tokenInput.trim());
                      setShowConnect(false);
                    }}
                    className="px-4 py-2 rounded-lg font-orbitron text-xs font-bold tracking-wider transition-all"
                    style={{ background: "#00e5ff", color: "#050a0f" }}
                  >
                    <Wifi size={13} />
                  </button>
                </div>
              )}

              {loginMode === "oauth" && (
                oauthCfg === null ? (
                  <div className="flex items-center gap-2"><Loader size={12} className="animate-spin text-primary" /><span className="font-rajdhani text-xs text-muted-foreground">Loading…</span></div>
                ) : !oauthCfg.configured ? (
                  <div className="font-rajdhani text-xs text-yellow-400 p-2 rounded" style={{ background: "rgba(250,204,21,0.08)" }}>
                    Set <strong>DERIV_OAUTH_CLIENT_ID</strong> in Replit Secrets to enable this mode.
                  </div>
                ) : (
                  <button onClick={handleOAuthLogin} disabled={oauthLoading}
                    className="w-full flex items-center justify-center gap-2 py-2.5 rounded-lg font-orbitron text-xs font-bold tracking-wider disabled:opacity-40"
                    style={{ background: "linear-gradient(135deg,#ff444f,#e91e8c)", color: "#fff" }}>
                    {oauthLoading ? <Loader size={12} className="animate-spin" /> : <LogIn size={12} />}
                    {oauthLoading ? "Redirecting…" : "Login with Deriv"}
                  </button>
                )
              )}
            </div>
          </div>
        )}
      </div>
    );
  }

  // ── Connecting / Authorizing ───────────────────────────────────────────────
  if (deriv.status === "connecting" || deriv.status === "authorizing") {
    return (
      <div className="flex items-center gap-3 px-4 py-2.5 rounded-lg mb-4 border" style={{ borderColor: "rgba(0,229,255,0.15)", background: "rgba(0,229,255,0.03)" }}>
        <Loader size={14} className="animate-spin text-primary flex-shrink-0" />
        <span className="font-rajdhani text-xs text-muted-foreground">
          {deriv.status === "connecting" ? "Connecting to Deriv…" : "Authorizing token…"}
        </span>
      </div>
    );
  }

  // ── Connected ─────────────────────────────────────────────────────────────
  return (
    <div className="mb-4 space-y-2">
      <div className="flex items-center gap-3 px-3 py-2 rounded-lg border" style={{ borderColor: "rgba(0,229,255,0.2)", background: "rgba(0,229,255,0.04)" }}>
        {/* Status dot */}
        <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: statusColor, boxShadow: `0 0 6px ${statusColor}` }} />

        {/* Balance */}
        <div className="flex items-center gap-1.5">
          <DollarSign size={12} className="text-primary flex-shrink-0" />
          <span className="font-orbitron text-sm font-bold">
            {deriv.balance?.toFixed(2) ?? "—"} <span className="text-xs text-muted-foreground">{deriv.account?.currency}</span>
          </span>
          {deriv.account?.is_virtual ? (
            <span className="font-rajdhani text-[10px] px-1.5 py-0.5 rounded font-bold" style={{ background: "rgba(250,204,21,0.15)", color: "#facc15" }}>DEMO</span>
          ) : (
            <span className="font-rajdhani text-[10px] px-1.5 py-0.5 rounded font-bold" style={{ background: "rgba(34,197,94,0.15)", color: "#22c55e" }}>REAL</span>
          )}
        </div>

        {/* Demo reset */}
        {deriv.account?.is_virtual && (
          <button onClick={handleDemoReset} disabled={resetting}
            className="flex items-center gap-1 px-2 py-1 rounded font-orbitron text-[9px] font-bold transition-all disabled:opacity-40"
            style={{ background: "rgba(250,204,21,0.1)", border: "1px solid rgba(250,204,21,0.25)", color: "#facc15" }}>
            {resetting ? <Loader size={9} className="animate-spin" /> : <RotateCcw size={9} />} Reset
          </button>
        )}

        {/* Account switcher */}
        {deriv.accountList.length > 1 && (
          <button onClick={() => setShowAccts((p) => !p)}
            className="flex items-center gap-1 ml-1 font-orbitron text-[10px] text-muted-foreground hover:text-primary transition-colors">
            <User size={10} /> {deriv.account?.loginid} <ChevronDown size={9} className={showAccts ? "rotate-180" : ""} />
          </button>
        )}

        <button onClick={deriv.disconnect} className="ml-auto flex items-center gap-1 font-rajdhani text-[10px] text-muted-foreground hover:text-red-400 transition-colors">
          <LogOut size={11} /> Disconnect
        </button>
      </div>

      {demoMsg && (
        <div className="font-rajdhani text-xs text-center py-1" style={{ color: demoMsg.includes("topped") ? "#22c55e" : "#ef4444" }}>
          {demoMsg}
        </div>
      )}

      {showAccts && (
        <div className="rounded-lg border overflow-hidden" style={{ borderColor: "rgba(0,229,255,0.2)", background: "rgba(0,0,0,0.4)" }}>
          {deriv.accountList.map((item) => (
            <button key={item.loginid}
              onClick={() => { deriv.switchAccount(item); setShowAccts(false); }}
              className="w-full flex items-center justify-between px-3 py-2 hover:bg-white/5 transition-colors border-b last:border-0"
              style={{
                borderColor: "rgba(0,229,255,0.08)",
                background: deriv.account?.loginid === item.loginid ? "rgba(0,229,255,0.07)" : "transparent",
              }}>
              <div className="flex items-center gap-2">
                <User size={10} className={item.is_virtual ? "text-yellow-400" : "text-green-400"} />
                <span className="font-orbitron text-xs font-bold" style={{ color: item.is_virtual ? "#facc15" : "#22c55e" }}>{item.loginid}</span>
                <span className="font-rajdhani text-[10px] text-muted-foreground">{item.is_virtual ? "Demo" : "Real"} · {item.currency}</span>
              </div>
              {deriv.account?.loginid === item.loginid && (
                <span className="font-rajdhani text-[9px] text-primary">ACTIVE</span>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
