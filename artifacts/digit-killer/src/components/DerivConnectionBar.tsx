/**
 * DerivConnectionBar — Deriv account connection widget.
 *
 * Three separate login panels:
 *   1. BETA ACCOUNT  — New API (auth.deriv.com, PKCE OAuth 2.0, client_id 33s2usCRNz0BJnxgjqANK)
 *   2. LEGACY API    — Classic Deriv OAuth (oauth.deriv.com, app_id 1089) + one-click
 *   3. API TOKEN     — Direct PAT token entry
 *
 * Shows CR number (7-9 chars, e.g. CR1234567) prominently when connected.
 * On Dashboard: full login form. Other pages: compact status strip or banner.
 */
import { useState } from "react";
import { useLocation, Link } from "wouter";
import {
  Wifi, Loader, DollarSign, User, ChevronDown,
  RotateCcw, LogIn, LogOut, AlertCircle, ExternalLink,
  Globe, Zap, Shield, Key,
} from "lucide-react";
import { useDerivContext } from "@/context/DerivContext";

function isDashboard(location: string): boolean {
  return location === "/" || location === "/dashboard" || location.startsWith("/dashboard");
}

type LoginTab = "beta" | "legacy" | "token";

async function generatePkce() {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~";
  const array = crypto.getRandomValues(new Uint8Array(64));
  const codeVerifier = Array.from(array).map((v) => chars[v % chars.length]).join("");
  const hash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(codeVerifier));
  const codeChallenge = btoa(String.fromCharCode(...new Uint8Array(hash)))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
  const stateBytes = crypto.getRandomValues(new Uint8Array(16));
  const state = Array.from(stateBytes).reduce((s, b) => s + b.toString(16).padStart(2, "0"), "");
  return { codeVerifier, codeChallenge, state };
}

function CrBadge({ loginid }: { loginid: string }) {
  const isCr = /^[A-Z]{2}\d{5,7}$/.test(loginid);
  return (
    <span
      className="font-orbitron text-xs font-bold px-2 py-0.5 rounded tracking-wider"
      style={{
        background: isCr ? "rgba(0,229,255,0.12)" : "rgba(250,204,21,0.12)",
        color: isCr ? "#00e5ff" : "#facc15",
        border: `1px solid ${isCr ? "rgba(0,229,255,0.3)" : "rgba(250,204,21,0.3)"}`,
        letterSpacing: "0.08em",
      }}
    >
      {loginid}
    </span>
  );
}

export default function DerivConnectionBar() {
  const deriv = useDerivContext();
  const [location] = useLocation();

  const [loginTab,          setLoginTab        ] = useState<LoginTab>("beta");
  const [tokenInput,        setTokenInput      ] = useState(() => localStorage.getItem("deriv_token") ?? "");
  const [showConnect,       setShowConnect     ] = useState(false);
  const [showAccts,         setShowAccts       ] = useState(false);
  const [demoMsg,           setDemoMsg         ] = useState<string | null>(null);
  const [resetting,         setResetting       ] = useState(false);
  const [betaLoading,       setBetaLoading     ] = useState(false);
  const [legacyLoading,     setLegacyLoading   ] = useState(false);
  const [legacyOAuthLoading,setLegacyOAuthLoading] = useState(false);

  const onDashboard = isDashboard(location);

  const statusColor = {
    disconnected: "#ef4444",
    connecting:   "#fb8c00",
    authorizing:  "#facc15",
    connected:    "#22c55e",
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

  async function handleLegacyOAuthRedirect() {
    setLegacyOAuthLoading(true);
    try {
      const res  = await fetch("/api/deriv/oauth/login-url");
      const data = await res.json() as { url?: string };
      if (data.url) { window.location.href = data.url; return; }
    } catch { /* fallback below */ }
    const redirectUri = encodeURIComponent(`${window.location.origin}/callback`);
    window.location.href = `https://oauth.deriv.com/oauth2/authorize?app_id=1089&redirect_uri=${redirectUri}`;
    setLegacyOAuthLoading(false);
  }

  async function handleBetaLogin() {
    setBetaLoading(true);
    try {
      const cfgRes = await fetch("/api/deriv/oauth/beta-config");
      const cfg    = await cfgRes.json() as { client_id: string; auth_url?: string };
      const { codeVerifier, codeChallenge, state } = await generatePkce();
      sessionStorage.setItem("pkce_verifier", codeVerifier);
      sessionStorage.setItem("oauth_state",   state);
      const redirectUri = `${window.location.origin}/callback`;
      const authBase    = cfg.auth_url ?? "https://auth.deriv.com/oauth2/auth";
      const url = new URL(authBase);
      url.searchParams.set("response_type",          "code");
      url.searchParams.set("client_id",               cfg.client_id);
      url.searchParams.set("redirect_uri",            redirectUri);
      url.searchParams.set("scope",                   "trade");
      url.searchParams.set("state",                   state);
      url.searchParams.set("code_challenge",          codeChallenge);
      url.searchParams.set("code_challenge_method",   "S256");
      window.location.href = url.toString();
    } catch {
      setBetaLoading(false);
    }
  }

  function handleDisconnect() {
    deriv.disconnect(); // clears all stored auth state
  }

  function getStoredToken(loginid: string): string | undefined {
    try { return (JSON.parse(localStorage.getItem("deriv_account_tokens") ?? "{}") as Record<string, string>)[loginid]; }
    catch { return undefined; }
  }

  // ── DISCONNECTED: non-dashboard compact banner ─────────────────────────────
  if (deriv.status === "disconnected" && !onDashboard) {
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

  // ── DISCONNECTED: dashboard — full login panel ─────────────────────────────
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
          <div className="space-y-2">
            <button
              onClick={() => setShowConnect(true)}
              className="w-full flex items-center justify-center gap-2 py-2.5 rounded-lg font-orbitron text-xs font-bold tracking-wider transition-all border"
              style={{ background: "rgba(0,229,255,0.06)", borderColor: "rgba(0,229,255,0.3)", color: "#00e5ff" }}
            >
              <Wifi size={14} /> CONNECT DERIV ACCOUNT TO TRADE
            </button>

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
          /* ── expanded connection panel ── */
          <div className="rounded-xl border overflow-hidden" style={{ borderColor: "rgba(0,229,255,0.25)", background: "rgba(0,229,255,0.02)" }}>
            {/* Header */}
            <div className="px-4 py-2.5 border-b flex items-center justify-between"
              style={{ borderColor: "rgba(0,229,255,0.12)", background: "rgba(0,0,0,0.35)" }}>
              <span className="font-orbitron text-xs font-bold text-primary tracking-wider">CONNECT TO DERIV</span>
              <button onClick={() => setShowConnect(false)} className="font-rajdhani text-[10px] text-muted-foreground hover:text-foreground">✕ close</button>
            </div>

            {/* Tab switcher */}
            <div className="flex border-b" style={{ borderColor: "rgba(0,229,255,0.1)" }}>
              {(["beta", "legacy", "token"] as LoginTab[]).map((tab) => {
                const labels: Record<LoginTab, string> = { beta: "BETA", legacy: "LEGACY", token: "API TOKEN" };
                const icons:  Record<LoginTab, React.ReactNode> = {
                  beta:   <Shield size={10} />,
                  legacy: <Globe size={10} />,
                  token:  <Key size={10} />,
                };
                const active = loginTab === tab;
                return (
                  <button
                    key={tab}
                    onClick={() => setLoginTab(tab)}
                    className="flex-1 flex items-center justify-center gap-1.5 py-2 font-orbitron text-[10px] font-bold tracking-wider transition-all"
                    style={{
                      color: active ? "#00e5ff" : "rgba(255,255,255,0.35)",
                      background: active ? "rgba(0,229,255,0.07)" : "transparent",
                      borderBottom: active ? "2px solid #00e5ff" : "2px solid transparent",
                    }}
                  >
                    {icons[tab]} {labels[tab]}
                  </button>
                );
              })}
            </div>

            {/* Panel content */}
            <div className="p-4 space-y-3">

              {/* ── BETA ACCOUNT panel ── */}
              {loginTab === "beta" && (
                <>
                  <div className="rounded-lg px-3 py-2.5 space-y-1"
                    style={{ background: "rgba(0,229,255,0.05)", border: "1px solid rgba(0,229,255,0.15)" }}>
                    <div className="flex items-center gap-2 mb-1">
                      <Shield size={11} style={{ color: "#00e5ff" }} />
                      <span className="font-orbitron text-[10px] font-bold text-primary tracking-wider">NEW DERIV BETA API</span>
                    </div>
                    <p className="font-rajdhani text-xs text-muted-foreground leading-relaxed">
                      Login with your <strong className="text-foreground">Deriv email &amp; password</strong> via the secure OAuth 2.0 PKCE flow.
                      Supports <span style={{ color: "#00e5ff" }}>CR</span> real accounts (CR + 5–7 digits).
                    </p>
                    <p className="font-rajdhani text-[10px]" style={{ color: "rgba(0,229,255,0.5)" }}>
                      Uses client ID: 33s2usCRNz0BJnxgjqANK · auth.deriv.com
                    </p>
                  </div>

                  <button
                    onClick={() => void handleBetaLogin()}
                    disabled={betaLoading}
                    className="w-full flex items-center justify-center gap-2 py-3 rounded-lg font-orbitron text-xs font-bold tracking-wider transition-all border disabled:opacity-40"
                    style={{ background: "rgba(0,229,255,0.1)", borderColor: "rgba(0,229,255,0.4)", color: "#00e5ff" }}
                  >
                    {betaLoading
                      ? <><span className="inline-block w-3 h-3 rounded-full border-2 border-current border-t-transparent animate-spin" /> Redirecting to Deriv…</>
                      : <><Shield size={13} /> LOGIN WITH DERIV BETA (EMAIL &amp; PASSWORD) →</>}
                  </button>

                  <p className="font-rajdhani text-[10px] text-center" style={{ color: "rgba(0,229,255,0.35)" }}>
                    You will be redirected to auth.deriv.com — after login you return here automatically.
                  </p>
                </>
              )}

              {/* ── LEGACY API panel ── */}
              {loginTab === "legacy" && (
                <>
                  <div className="rounded-lg px-3 py-2.5 space-y-1"
                    style={{ background: "rgba(250,204,21,0.05)", border: "1px solid rgba(250,204,21,0.15)" }}>
                    <div className="flex items-center gap-2 mb-1">
                      <Zap size={11} style={{ color: "#facc15" }} />
                      <span className="font-orbitron text-[10px] font-bold tracking-wider" style={{ color: "#facc15" }}>LEGACY DERIV API</span>
                    </div>
                    <p className="font-rajdhani text-xs text-muted-foreground leading-relaxed">
                      Classic Deriv OAuth using <strong className="text-foreground">oauth.deriv.com</strong> (app_id 1089).
                      Supports CR, MX, MF, and VR accounts.
                    </p>
                  </div>

                  {/* One-click legacy */}
                  <button
                    onClick={() => void handleLegacyConnect()}
                    disabled={legacyLoading}
                    className="w-full flex items-center justify-center gap-2 py-2.5 rounded-lg font-orbitron text-xs font-bold tracking-wider transition-all border disabled:opacity-50"
                    style={{ background: "rgba(250,204,21,0.08)", borderColor: "rgba(250,204,21,0.4)", color: "#facc15" }}
                  >
                    {legacyLoading
                      ? <><span className="inline-block w-3 h-3 rounded-full border-2 border-current border-t-transparent animate-spin" /> Connecting…</>
                      : <><Zap size={13} /> LEGACY API — One-Click Connect</>}
                  </button>

                  <div className="flex items-center gap-2">
                    <div className="flex-1 h-px" style={{ background: "rgba(255,255,255,0.08)" }} />
                    <span className="font-rajdhani text-[9px] text-muted-foreground">OR LOGIN WITH DERIV ACCOUNT</span>
                    <div className="flex-1 h-px" style={{ background: "rgba(255,255,255,0.08)" }} />
                  </div>

                  {/* Legacy OAuth redirect */}
                  <button
                    onClick={() => void handleLegacyOAuthRedirect()}
                    disabled={legacyOAuthLoading}
                    className="w-full flex items-center justify-center gap-2 py-2.5 rounded-lg font-orbitron text-xs font-bold tracking-wider transition-all border disabled:opacity-40"
                    style={{ background: "rgba(233,30,140,0.08)", borderColor: "rgba(233,30,140,0.35)", color: "#e91e8c" }}
                  >
                    {legacyOAuthLoading
                      ? <><span className="inline-block w-3 h-3 rounded-full border-2 border-current border-t-transparent animate-spin" /> Redirecting…</>
                      : <><Globe size={12} /> LOGIN WITH DERIV ACCOUNT (LEGACY) →</>}
                  </button>

                  <p className="font-rajdhani text-[10px] text-center" style={{ color: "rgba(250,204,21,0.4)" }}>
                    Redirects to oauth.deriv.com — returns with your trading token automatically.
                  </p>
                </>
              )}

              {/* ── API TOKEN (PAT) panel ── */}
              {loginTab === "token" && (
                <>
                  <div className="rounded-lg px-3 py-2.5 space-y-1"
                    style={{ background: "rgba(139,92,246,0.05)", border: "1px solid rgba(139,92,246,0.15)" }}>
                    <div className="flex items-center gap-2 mb-1">
                      <Key size={11} style={{ color: "#a78bfa" }} />
                      <span className="font-orbitron text-[10px] font-bold tracking-wider" style={{ color: "#a78bfa" }}>API TOKEN (PAT)</span>
                    </div>
                    <p className="font-rajdhani text-xs text-muted-foreground leading-relaxed">
                      Paste your Deriv API token with <strong className="text-foreground">Trade</strong> permission directly.
                    </p>
                  </div>

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
                </>
              )}
            </div>
          </div>
        )}
      </div>
    );
  }

  // ── CONNECTING / AUTHORIZING ───────────────────────────────────────────────
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

  // ── CONNECTED ─────────────────────────────────────────────────────────────
  const loginid    = deriv.account?.loginid ?? "";
  const multiAcct  = deriv.accountList.length > 1;

  return (
    <div className="mb-4 space-y-2">
      {/* ── Status bar ── */}
      <div className="flex items-center gap-2 px-3 py-2 rounded-lg border"
        style={{ borderColor: "rgba(0,229,255,0.2)", background: "rgba(0,229,255,0.04)" }}>

        <div className="w-2 h-2 rounded-full flex-shrink-0"
          style={{ background: statusColor, boxShadow: `0 0 6px ${statusColor}` }} />

        {/* CR badge — clicking opens/closes account switcher when multiple accounts exist */}
        {loginid && (
          multiAcct ? (
            <button
              onClick={() => setShowAccts((p) => !p)}
              className="flex items-center gap-1 rounded transition-opacity hover:opacity-80 focus:outline-none"
              title="Click to switch account"
            >
              <CrBadge loginid={loginid} />
              <ChevronDown
                size={10}
                className={`transition-transform duration-200 ${showAccts ? "rotate-180" : ""}`}
                style={{ color: "rgba(0,229,255,0.5)" }}
              />
            </button>
          ) : (
            <CrBadge loginid={loginid} />
          )
        )}

        {/* Balance */}
        <div className="flex items-center gap-1.5">
          <DollarSign size={12} className="text-primary flex-shrink-0" />
          <span className="font-orbitron text-sm font-bold">
            {deriv.balance?.toFixed(2) ?? "—"}{" "}
            <span className="text-xs text-muted-foreground">{deriv.account?.currency}</span>
          </span>
          {deriv.account?.is_virtual ? (
            <span className="font-rajdhani text-[10px] px-1.5 py-0.5 rounded font-bold"
              style={{ background: "rgba(250,204,21,0.15)", color: "#facc15" }}>DEMO</span>
          ) : (
            <span className="font-rajdhani text-[10px] px-1.5 py-0.5 rounded font-bold"
              style={{ background: "rgba(34,197,94,0.15)", color: "#22c55e" }}>REAL</span>
          )}
        </div>

        {/* Demo top-up */}
        {deriv.account?.is_virtual && (
          <button onClick={handleDemoReset} disabled={resetting}
            className="flex items-center gap-1 px-2 py-1 rounded font-orbitron text-[9px] font-bold transition-all disabled:opacity-40"
            style={{ background: "rgba(250,204,21,0.1)", border: "1px solid rgba(250,204,21,0.25)", color: "#facc15" }}>
            {resetting ? <Loader size={9} className="animate-spin" /> : <RotateCcw size={9} />} Reset
          </button>
        )}

        {/* Disconnect */}
        <button onClick={handleDisconnect}
          className="ml-auto flex items-center gap-1 font-rajdhani text-[10px] text-muted-foreground hover:text-red-400 transition-colors">
          <LogOut size={11} /> Disconnect
        </button>
      </div>

      {/* Demo top-up feedback */}
      {demoMsg && (
        <div className="font-rajdhani text-xs text-center py-1"
          style={{ color: demoMsg.includes("topped") ? "#22c55e" : "#ef4444" }}>
          {demoMsg}
        </div>
      )}

      {/* ── Account switcher dropdown ── */}
      {showAccts && multiAcct && (
        <div className="rounded-xl border overflow-hidden"
          style={{ borderColor: "rgba(0,229,255,0.25)", background: "rgba(0,0,0,0.55)", backdropFilter: "blur(8px)" }}>

          <div className="px-3 py-2 border-b flex items-center justify-between"
            style={{ borderColor: "rgba(0,229,255,0.12)", background: "rgba(0,229,255,0.04)" }}>
            <span className="font-orbitron text-[9px] font-bold text-primary tracking-widest">SWITCH ACCOUNT</span>
            <button onClick={() => setShowAccts(false)}
              className="font-rajdhani text-[10px] text-muted-foreground hover:text-foreground transition-colors">✕</button>
          </div>

          {deriv.accountList.map((item) => {
            const isActive  = deriv.account?.loginid === item.loginid;
            const hasToken  = !!(item.token ?? getStoredToken(item.loginid));
            const isCrAcct  = /^[A-Z]{2}\d{5,7}$/.test(item.loginid);

            return (
              <button
                key={item.loginid}
                onClick={() => {
                  if (!isActive && hasToken) {
                    deriv.switchAccount(item);
                    setShowAccts(false);
                  }
                }}
                disabled={isActive || !hasToken}
                className="w-full flex items-center justify-between px-3 py-3 border-b last:border-0 transition-all"
                style={{
                  borderColor: "rgba(0,229,255,0.08)",
                  background: isActive
                    ? `rgba(0,229,255,0.08)`
                    : hasToken ? "transparent" : "rgba(239,68,68,0.03)",
                  cursor: isActive ? "default" : hasToken ? "pointer" : "not-allowed",
                }}
                onMouseEnter={(e) => { if (!isActive && hasToken) (e.currentTarget as HTMLButtonElement).style.background = "rgba(255,255,255,0.04)"; }}
                onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = isActive ? "rgba(0,229,255,0.08)" : "transparent"; }}
              >
                <div className="flex items-center gap-2.5">
                  {/* Live status dot for active account */}
                  <div className="w-1.5 h-1.5 rounded-full flex-shrink-0"
                    style={{
                      background: isActive ? "#22c55e" : "rgba(255,255,255,0.15)",
                      boxShadow: isActive ? "0 0 4px #22c55e" : "none",
                    }} />
                  <CrBadge loginid={item.loginid} />
                  <div className="flex flex-col items-start gap-0.5">
                    <span className="font-rajdhani text-xs" style={{ color: isCrAcct ? "#00e5ff" : "#facc15" }}>
                      {item.is_virtual ? "Demo" : "Real"} · {item.currency}
                    </span>
                    {!hasToken && (
                      <span className="font-rajdhani text-[9px] text-red-400">No token — re-login to unlock</span>
                    )}
                  </div>
                </div>
                <div className="font-rajdhani text-[9px] tracking-wider font-bold">
                  {isActive ? (
                    <span style={{ color: "#22c55e" }}>● ACTIVE</span>
                  ) : hasToken ? (
                    <span style={{ color: "rgba(0,229,255,0.5)" }}>TAP TO SWITCH →</span>
                  ) : (
                    <span style={{ color: "rgba(239,68,68,0.6)" }}>NO TOKEN</span>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
