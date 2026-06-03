/**
 * DerivConnectionBar — connection widget.
 *
 * On the Dashboard (/dashboard or /): shows the full token login form.
 * On all other pages: shows a compact status strip when connected, or a small
 *   "Connect on Dashboard" banner when disconnected — no login form.
 *
 * Login options:
 *   1. API Token (PAT) — paste a Deriv API token with Trade permission
 *   2. LEGACY API — one-click connect using the platform's built-in token
 *   3. Login with Deriv Account — OAuth redirect flow
 */
import { useState } from "react";
import { useLocation, Link } from "wouter";
import {
  Wifi, Loader, DollarSign, User, ChevronDown,
  RotateCcw, LogIn, LogOut, AlertCircle, ExternalLink, Globe, Zap,
} from "lucide-react";
import { useDerivContext } from "@/context/DerivContext";

function isDashboard(location: string): boolean {
  return location === "/" || location === "/dashboard" || location.startsWith("/dashboard");
}

export default function DerivConnectionBar() {
  const deriv = useDerivContext();
  const [location] = useLocation();

  const [tokenInput,    setTokenInput   ] = useState(() => localStorage.getItem("deriv_token") ?? "");
  const [showConnect,   setShowConnect  ] = useState(false);
  const [showAccts,     setShowAccts    ] = useState(false);
  const [demoMsg,       setDemoMsg      ] = useState<string | null>(null);
  const [resetting,     setResetting    ] = useState(false);
  const [oauthLoading,  setOauthLoading ] = useState(false);
  const [legacyLoading, setLegacyLoading] = useState(false);

  const onDashboard = isDashboard(location);

  const statusColor = {
    disconnected: "#ef4444", connecting: "#fb8c00", authorizing: "#facc15", connected: "#22c55e",
  }[deriv.status];

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

  function handlePATConnect() {
    const t = tokenInput.trim();
    if (!t) return;
    localStorage.setItem("deriv_token", t);
    deriv.connect(t);
    setShowConnect(false);
  }

  async function handleLegacyConnect() {
    setLegacyLoading(true);
    setShowConnect(false);
    try {
      await deriv.connectLegacy();
    } finally {
      setLegacyLoading(false);
    }
  }

  async function handleOAuthRedirect() {
    setOauthLoading(true);
    try {
      const res = await fetch("/api/deriv/oauth/login-url");
      const data = await res.json() as { url?: string };
      if (data.url) { window.location.href = data.url; return; }
    } catch { /* fallback below */ }
    const redirectUri = encodeURIComponent(`${window.location.origin}/callback`);
    window.location.href = `https://oauth.deriv.com/oauth2/authorize?app_id=1089&redirect_uri=${redirectUri}`;
    setOauthLoading(false);
  }

  function handleDisconnect() {
    localStorage.removeItem("deriv_token");
    localStorage.removeItem("deriv_access_token");
    deriv.disconnect();
  }

  // ── DISCONNECTED ─────────────────────────────────────────────────────────────
  if (deriv.status === "disconnected") {
    // Non-dashboard pages: compact "go connect" banner
    if (!onDashboard) {
      return (
        <div className="mb-4">
          {deriv.error && (
            <div className="flex items-start gap-2 px-3 py-2 rounded-lg mb-2"
              style={{ background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.25)" }}>
              <AlertCircle size={12} className="text-red-400 flex-shrink-0 mt-0.5" />
              <span className="font-rajdhani text-xs text-red-400">{deriv.error}</span>
            </div>
          )}
          <Link href="/dashboard">
            <div className="w-full flex items-center justify-center gap-2 py-2.5 rounded-lg font-orbitron text-xs font-bold tracking-wider border cursor-pointer transition-all hover:border-primary/50"
              style={{ background: "rgba(0,229,255,0.04)", borderColor: "rgba(0,229,255,0.2)", color: "rgba(0,229,255,0.6)" }}>
              <LogIn size={13} />
              Connect Deriv on Dashboard to trade
            </div>
          </Link>
        </div>
      );
    }

    // Dashboard: full login form
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
          <div className="space-y-2">
            {/* Primary connect button */}
            <button
              onClick={() => setShowConnect(true)}
              className="w-full flex items-center justify-center gap-2 py-2.5 rounded-lg font-orbitron text-xs font-bold tracking-wider transition-all border"
              style={{ background: "rgba(0,229,255,0.06)", borderColor: "rgba(0,229,255,0.3)", color: "#00e5ff" }}
            >
              <Wifi size={14} /> CONNECT DERIV ACCOUNT TO TRADE
            </button>

            {/* One-click legacy API button — always visible and separate */}
            <button
              onClick={() => void handleLegacyConnect()}
              disabled={legacyLoading}
              className="w-full flex items-center justify-center gap-2 py-2 rounded-lg font-orbitron text-[11px] font-bold tracking-wider transition-all border disabled:opacity-50"
              style={{ background: "rgba(250,204,21,0.07)", borderColor: "rgba(250,204,21,0.35)", color: "#facc15" }}
            >
              {legacyLoading
                ? <><span className="inline-block w-3 h-3 rounded-full border-2 border-current border-t-transparent animate-spin" /> Connecting…</>
                : <><Zap size={12} /> LEGACY API — Quick Connect</>}
            </button>
          </div>
        ) : (
          <div className="rounded-xl border overflow-hidden" style={{ borderColor: "rgba(0,229,255,0.25)", background: "rgba(0,229,255,0.02)" }}>
            <div className="px-4 py-2.5 border-b flex items-center justify-between" style={{ borderColor: "rgba(0,229,255,0.12)", background: "rgba(0,0,0,0.25)" }}>
              <span className="font-orbitron text-xs font-bold text-primary tracking-wider">CONNECT TO DERIV</span>
              <button onClick={() => setShowConnect(false)} className="font-rajdhani text-[10px] text-muted-foreground hover:text-foreground">✕ close</button>
            </div>

            <div className="p-4 space-y-2">
              {/* Option 1 — LEGACY API quick connect */}
              <button
                onClick={() => void handleLegacyConnect()}
                disabled={legacyLoading}
                className="w-full flex items-center justify-center gap-2 py-2.5 rounded-lg font-orbitron text-xs font-bold tracking-wider transition-all border disabled:opacity-50"
                style={{ background: "rgba(250,204,21,0.08)", borderColor: "rgba(250,204,21,0.4)", color: "#facc15" }}
              >
                {legacyLoading
                  ? <><span className="inline-block w-3 h-3 rounded-full border-2 border-current border-t-transparent animate-spin" /> Connecting Legacy API…</>
                  : <><Zap size={13} /> LEGACY API — One-Click Connect</>}
              </button>

              {/* Divider */}
              <div className="flex items-center gap-2">
                <div className="flex-1 h-px" style={{ background: "rgba(255,255,255,0.08)" }} />
                <span className="font-rajdhani text-[9px] text-muted-foreground">OR USE API TOKEN</span>
                <div className="flex-1 h-px" style={{ background: "rgba(255,255,255,0.08)" }} />
              </div>

              {/* Option 2 — PAT token input */}
              <p className="font-rajdhani text-xs text-muted-foreground">
                Enter your Deriv API token with <strong className="text-foreground">Trade</strong> permission.
              </p>
              <div className="flex gap-2">
                <input
                  type="password"
                  value={tokenInput}
                  onChange={(e) => setTokenInput(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") handlePATConnect(); }}
                  placeholder="Paste Deriv API token…"
                  className="flex-1 px-3 py-2 rounded-lg font-rajdhani text-xs bg-background border border-border text-foreground focus:outline-none focus:border-primary"
                />
                <button
                  onClick={handlePATConnect}
                  disabled={!tokenInput.trim()}
                  className="px-4 py-2 rounded-lg font-orbitron text-xs font-bold tracking-wider disabled:opacity-40 transition-all"
                  style={{ background: "#00e5ff", color: "#050a0f" }}
                >
                  <Wifi size={13} />
                </button>
              </div>
              <a
                href="https://app.deriv.com/account/api-token"
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1 font-rajdhani text-[10px] text-muted-foreground hover:text-primary transition-colors"
              >
                <ExternalLink size={9} /> Get API token from Deriv (enable Trade permission)
              </a>

              {/* Divider */}
              <div className="flex items-center gap-2 mt-1">
                <div className="flex-1 h-px" style={{ background: "rgba(255,255,255,0.08)" }} />
                <span className="font-rajdhani text-[9px] text-muted-foreground">OR</span>
                <div className="flex-1 h-px" style={{ background: "rgba(255,255,255,0.08)" }} />
              </div>

              {/* Option 3 — OAuth */}
              <button
                onClick={() => void handleOAuthRedirect()}
                disabled={oauthLoading}
                className="w-full flex items-center justify-center gap-2 py-2.5 rounded-lg font-orbitron text-xs font-bold tracking-wider transition-all border disabled:opacity-40"
                style={{ background: "rgba(233,30,140,0.08)", borderColor: "rgba(233,30,140,0.35)", color: "#e91e8c" }}
              >
                {oauthLoading
                  ? <><span className="inline-block w-3 h-3 rounded-full border-2 border-current border-t-transparent animate-spin" /> Redirecting…</>
                  : <><Globe size={12} /> Login with Deriv Account →</>}
              </button>
            </div>
          </div>
        )}
      </div>
    );
  }

  // ── CONNECTING / AUTHORIZING ──────────────────────────────────────────────────
  if (deriv.status === "connecting" || deriv.status === "authorizing") {
    return (
      <div className="flex items-center gap-3 px-4 py-2.5 rounded-lg mb-4 border"
        style={{ borderColor: "rgba(0,229,255,0.15)", background: "rgba(0,229,255,0.03)" }}>
        <Loader size={14} className="animate-spin text-primary flex-shrink-0" />
        <span className="font-rajdhani text-xs text-muted-foreground">
          {deriv.status === "connecting" ? "Connecting to Deriv…" : "Authorizing…"}
        </span>
      </div>
    );
  }

  // ── CONNECTED ─────────────────────────────────────────────────────────────────
  return (
    <div className="mb-4 space-y-2">
      <div className="flex items-center gap-3 px-3 py-2 rounded-lg border"
        style={{ borderColor: "rgba(0,229,255,0.2)", background: "rgba(0,229,255,0.04)" }}>
        <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: statusColor, boxShadow: `0 0 6px ${statusColor}` }} />

        <div className="flex items-center gap-1.5">
          <DollarSign size={12} className="text-primary flex-shrink-0" />
          <span className="font-orbitron text-sm font-bold">
            {deriv.balance?.toFixed(2) ?? "—"}{" "}
            <span className="text-xs text-muted-foreground">{deriv.account?.currency}</span>
          </span>
          {deriv.account?.is_virtual ? (
            <span className="font-rajdhani text-[10px] px-1.5 py-0.5 rounded font-bold" style={{ background: "rgba(250,204,21,0.15)", color: "#facc15" }}>DEMO</span>
          ) : (
            <span className="font-rajdhani text-[10px] px-1.5 py-0.5 rounded font-bold" style={{ background: "rgba(34,197,94,0.15)", color: "#22c55e" }}>REAL</span>
          )}
        </div>

        {deriv.account?.is_virtual && (
          <button onClick={handleDemoReset} disabled={resetting}
            className="flex items-center gap-1 px-2 py-1 rounded font-orbitron text-[9px] font-bold transition-all disabled:opacity-40"
            style={{ background: "rgba(250,204,21,0.1)", border: "1px solid rgba(250,204,21,0.25)", color: "#facc15" }}>
            {resetting ? <Loader size={9} className="animate-spin" /> : <RotateCcw size={9} />} Reset
          </button>
        )}

        {deriv.accountList.length > 1 && (
          <button onClick={() => setShowAccts((p) => !p)}
            className="flex items-center gap-1 ml-1 font-orbitron text-[10px] text-muted-foreground hover:text-primary transition-colors">
            <User size={10} /> {deriv.account?.loginid} <ChevronDown size={9} className={showAccts ? "rotate-180" : ""} />
          </button>
        )}

        <button onClick={handleDisconnect}
          className="ml-auto flex items-center gap-1 font-rajdhani text-[10px] text-muted-foreground hover:text-red-400 transition-colors">
          <LogOut size={11} /> Disconnect
        </button>
      </div>

      {demoMsg && (
        <div className="font-rajdhani text-xs text-center py-1"
          style={{ color: demoMsg.includes("topped") ? "#22c55e" : "#ef4444" }}>
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
