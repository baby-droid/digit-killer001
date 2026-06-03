import { useEffect, useRef, useState } from "react";
import {
  useGetDigitAnalysis,
  getGetDigitAnalysisQueryKey,
} from "@workspace/api-client-react";
import { useSymbol } from "@/context/SymbolContext";
import { useDerivContext } from "@/context/DerivContext";
import { TrendingUp, Activity, Hash, Wifi, ExternalLink, Globe, Zap, Shield, Key, UserCheck, ChevronRight } from "lucide-react";
import DerivConnectionBar from "@/components/DerivConnectionBar";

type LoginTab = "beta" | "legacy" | "token";

async function generatePkce() {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~";
  const array = crypto.getRandomValues(new Uint8Array(64));
  const codeVerifier = Array.from(array).map((v) => chars[v % chars.length]).join("");
  const hash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(codeVerifier));
  const codeChallenge = btoa(String.fromCharCode(...new Uint8Array(hash)))
    .replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  const stateBytes = crypto.getRandomValues(new Uint8Array(16));
  const state = Array.from(stateBytes).reduce((s, b) => s + b.toString(16).padStart(2, "0"), "");
  return { codeVerifier, codeChallenge, state };
}

const DIGIT_COLORS: Record<number, string> = {
  0: "#00e5d4", 1: "#448aff", 2: "#ce93d8", 3: "#00c853", 4: "#ff9100",
  5: "#00e5ff", 6: "#c6ff00", 7: "#ff1744", 8: "#f50057", 9: "#ffd600",
};

function DigitBubble({ digit, isLatest }: { digit: number; isLatest: boolean }) {
  const color = DIGIT_COLORS[digit] ?? "#fff";
  return (
    <div
      className={`flex items-center justify-center rounded-full font-orbitron font-bold text-sm transition-all duration-200 flex-shrink-0 ${
        isLatest ? "w-10 h-10 border-2" : "w-7 h-7 border"
      }`}
      style={{
        borderColor: color,
        color,
        background: `${color}18`,
        boxShadow: isLatest ? `0 0 12px ${color}80` : undefined,
      }}
      data-testid={`digit-bubble-${digit}`}
    >
      {digit}
    </div>
  );
}

function AnimatedCounter({ value, decimals = 2 }: { value: number; decimals?: number }) {
  const [display, setDisplay] = useState(value);
  const prevRef = useRef(value);
  useEffect(() => {
    prevRef.current = display;
    const target = value;
    const diff = target - display;
    if (Math.abs(diff) < 0.0001) return;
    let start: number | null = null;
    const dur = 400;
    function step(ts: number) {
      if (!start) start = ts;
      const prog = Math.min((ts - start) / dur, 1);
      setDisplay(prevRef.current + diff * prog);
      if (prog < 1) requestAnimationFrame(step);
    }
    requestAnimationFrame(step);
  }, [value]);
  return <>{display.toFixed(decimals)}</>;
}

export default function DashboardPage() {
  const { symbol } = useSymbol();
  const deriv = useDerivContext();

  const [prevDigit,      setPrevDigit     ] = useState<number | null>(null);
  const [flipKey,        setFlipKey       ] = useState(0);
  const [loginTab,       setLoginTab      ] = useState<LoginTab>("beta");
  const [tokenInput,     setTokenInput    ] = useState("");
  const [legacyTokenInput, setLegacyTokenInput] = useState("");
  const [crInput,        setCrInput       ] = useState("");
  const [crMessage,      setCrMessage     ] = useState<{ text: string; ok: boolean } | null>(null);
  const [betaLoading,    setBetaLoading   ] = useState(false);
  const [legacyLoading,  setLegacyLoading ] = useState(false);
  const [legacyOAuthLoading, setLegacyOAuthLoading] = useState(false);

  const { data } = useGetDigitAnalysis(
    { symbol },
    {
      query: {
        enabled: !!symbol,
        queryKey: getGetDigitAnalysisQueryKey({ symbol }),
        refetchInterval: 2000,
      },
    }
  );

  const digits       = (data as { digits?: Array<{ digit: number; percentage: number; count: number; rank: number }> })?.digits ?? [];
  const currentDigit = (data as { current_digit?: number })?.current_digit ?? 0;
  const currentPrice = (data as { current_price?: number })?.current_price ?? 0;
  const tickCount    = (data as { count?: number })?.count ?? 0;
  const evenPct      = (data as { even_pct?: number })?.even_pct ?? 50;
  const oddPct       = (data as { odd_pct?: number })?.odd_pct ?? 50;
  const mostFreq     = (data as { most_frequent?: number })?.most_frequent ?? 0;
  const leastFreq    = (data as { least_frequent?: number })?.least_frequent ?? 0;

  const [recentDigits, setRecentDigits] = useState<number[]>([]);
  useEffect(() => {
    if (currentDigit === undefined || currentDigit === null) return;
    if (currentDigit !== prevDigit) {
      setPrevDigit(currentDigit);
      setFlipKey((k) => k + 1);
      setRecentDigits((prev) => [currentDigit, ...prev].slice(0, 30));
    }
  }, [currentDigit, prevDigit]);

  function getStoredTokenMap(): Record<string, string> {
    try { return JSON.parse(localStorage.getItem("deriv_account_tokens") ?? "{}") as Record<string, string>; }
    catch { return {}; }
  }

  function connectWithToken(token: string) {
    const t = token.trim();
    if (!t) return;
    localStorage.setItem("deriv_token", t);
    deriv.connect(t);
  }

  function handlePATConnect() {
    if (!tokenInput.trim()) return;
    connectWithToken(tokenInput.trim());
    setTokenInput("");
  }

  function handleLegacyTokenConnect() {
    if (!legacyTokenInput.trim()) return;
    connectWithToken(legacyTokenInput.trim());
    setLegacyTokenInput("");
  }

  function handleCrConnect() {
    const cr = crInput.trim().toUpperCase();
    if (!cr) return;
    const map   = getStoredTokenMap();
    const token = map[cr];
    if (token) {
      setCrMessage(null);
      connectWithToken(token);
      setCrInput("");
    } else {
      setCrMessage({ text: `No stored token for ${cr} — login via OAuth first`, ok: false });
    }
  }

  async function handleLegacyConnect() {
    setLegacyLoading(true);
    try { await deriv.connectLegacy(); } finally { setLegacyLoading(false); }
  }

  async function handleLegacyOAuthRedirect() {
    setLegacyOAuthLoading(true);
    try {
      const res  = await fetch("/api/deriv/oauth/login-url");
      const data = await res.json() as { url?: string };
      if (data.url) { window.location.href = data.url; return; }
    } catch { /* fallback */ }
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
      url.searchParams.set("response_type",         "code");
      url.searchParams.set("client_id",              cfg.client_id);
      url.searchParams.set("redirect_uri",           redirectUri);
      url.searchParams.set("scope",                  "trade");
      url.searchParams.set("state",                  state);
      url.searchParams.set("code_challenge",         codeChallenge);
      url.searchParams.set("code_challenge_method",  "S256");
      window.location.href = url.toString();
    } catch { setBetaLoading(false); }
  }

  const isConnected    = deriv.status === "connected";
  const isConnecting   = deriv.status === "connecting" || deriv.status === "authorizing";
  const isDisconnected = deriv.status === "disconnected";

  const storedAccounts = Object.entries(getStoredTokenMap()); // [[loginid, token], ...]

  const TAB_META: Array<{ id: LoginTab; label: string; icon: React.ReactNode; color: string }> = [
    { id: "beta",   label: "BETA",     icon: <Shield      size={10} />, color: "#00e5ff" },
    { id: "legacy", label: "LEGACY",   icon: <Zap         size={10} />, color: "#facc15" },
    { id: "token",  label: "BETA API", icon: <UserCheck   size={10} />, color: "#a78bfa" },
  ];

  return (
    <div className="space-y-4 animate-fade-in-up" data-testid="page-dashboard">

      {/* ── Deriv Connection Panel ─────────────────────────────────────────── */}
      {isDisconnected && (
        <div className="rounded-2xl overflow-hidden"
          style={{ background: "rgba(0,0,0,0.4)", border: "1px solid rgba(0,229,255,0.18)", backdropFilter: "blur(8px)" }}>

          {/* Header */}
          <div className="px-5 py-3 border-b flex items-center gap-3"
            style={{ borderColor: "rgba(0,229,255,0.1)", background: "rgba(0,229,255,0.04)" }}>
            <div className="w-2 h-2 rounded-full" style={{ background: "#ef4444", boxShadow: "0 0 6px #ef4444" }} />
            <span className="font-orbitron text-xs font-bold text-primary tracking-wider">DERIV ACCOUNT — NOT CONNECTED</span>
            <span className="font-rajdhani text-[10px] text-muted-foreground ml-auto">Connect once · trade everywhere</span>
          </div>

          {deriv.error && (
            <div className="mx-5 mt-3 flex items-start gap-2 px-3 py-2 rounded-lg"
              style={{ background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.25)" }}>
              <span className="text-red-400 text-xs">⚠</span>
              <span className="font-rajdhani text-xs text-red-400">{deriv.error}</span>
            </div>
          )}

          {/* Tab switcher */}
          <div className="flex border-b mt-4 mx-5" style={{ borderColor: "rgba(0,229,255,0.1)" }}>
            {TAB_META.map(({ id, label, icon, color }) => {
              const active = loginTab === id;
              return (
                <button
                  key={id}
                  onClick={() => setLoginTab(id)}
                  className="flex-1 flex items-center justify-center gap-1.5 py-2.5 font-orbitron text-[10px] font-bold tracking-wider transition-all"
                  style={{
                    color: active ? color : "rgba(255,255,255,0.35)",
                    background: active ? `${color}12` : "transparent",
                    borderBottom: active ? `2px solid ${color}` : "2px solid transparent",
                  }}
                >
                  {icon} {label}
                </button>
              );
            })}
          </div>

          {/* Panel */}
          <div className="p-5">
            <div className="flex flex-col gap-3 p-4 rounded-xl border max-w-lg mx-auto"
              style={{ borderColor: "rgba(0,229,255,0.15)", background: "rgba(0,229,255,0.02)" }}>

              {/* ── CR HEADER: Quick-connect from stored accounts ─────────────── */}
              {(loginTab === "beta" || loginTab === "legacy") && (
                <div className="rounded-lg overflow-hidden border"
                  style={{ borderColor: "rgba(0,229,255,0.2)", background: "rgba(0,0,0,0.3)" }}>

                  {/* Header */}
                  <div className="flex items-center gap-2 px-3 py-2 border-b"
                    style={{ borderColor: "rgba(0,229,255,0.12)", background: "rgba(0,229,255,0.05)" }}>
                    <UserCheck size={11} style={{ color: "#00e5ff" }} />
                    <span className="font-orbitron text-[9px] font-bold text-primary tracking-widest">CR ACCOUNT — QUICK CONNECT</span>
                  </div>

                  <div className="p-3 space-y-2.5">
                    {/* Stored accounts row */}
                    {storedAccounts.length > 0 && (
                      <div className="space-y-1.5">
                        <span className="font-rajdhani text-[9px] text-muted-foreground tracking-wider">STORED ACCOUNTS — CLICK TO CONNECT INSTANTLY</span>
                        <div className="flex flex-wrap gap-1.5">
                          {storedAccounts.map(([loginid, token]) => {
                            const isVirtual = loginid.startsWith("VR");
                            return (
                              <button
                                key={loginid}
                                onClick={() => connectWithToken(token)}
                                className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg font-orbitron text-[10px] font-bold transition-all hover:scale-105 active:scale-95"
                                style={{
                                  background: isVirtual ? "rgba(250,204,21,0.1)" : "rgba(0,229,255,0.1)",
                                  border: `1px solid ${isVirtual ? "rgba(250,204,21,0.4)" : "rgba(0,229,255,0.4)"}`,
                                  color: isVirtual ? "#facc15" : "#00e5ff",
                                }}
                                title={`Connect as ${loginid}`}
                              >
                                {loginid}
                                <ChevronRight size={9} />
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    {/* CR number paste input */}
                    <div className="space-y-1">
                      <span className="font-rajdhani text-[9px] text-muted-foreground tracking-wider">
                        OR ENTER CR NUMBER TO CONNECT
                      </span>
                      <div className="flex gap-2">
                        <input
                          type="text"
                          value={crInput}
                          onChange={(e) => { setCrInput(e.target.value); setCrMessage(null); }}
                          onKeyDown={(e) => { if (e.key === "Enter") handleCrConnect(); }}
                          placeholder="CR1234567 or VRTC1234567"
                          className="flex-1 px-3 py-2 rounded-lg font-rajdhani text-xs bg-background border border-border text-foreground focus:outline-none focus:border-primary tracking-wider"
                          style={{ textTransform: "uppercase" }}
                        />
                        <button
                          onClick={handleCrConnect}
                          disabled={!crInput.trim()}
                          className="flex items-center gap-1 px-3 py-2 rounded-lg font-orbitron text-[10px] font-bold tracking-wider disabled:opacity-40 transition-all"
                          style={{ background: "rgba(0,229,255,0.15)", border: "1px solid rgba(0,229,255,0.4)", color: "#00e5ff" }}
                        >
                          <ChevronRight size={12} />
                        </button>
                      </div>
                      {crMessage && (
                        <p className="font-rajdhani text-[10px]" style={{ color: crMessage.ok ? "#22c55e" : "#ef4444" }}>
                          {crMessage.text}
                        </p>
                      )}
                      {storedAccounts.length === 0 && (
                        <p className="font-rajdhani text-[9px]" style={{ color: "rgba(255,255,255,0.3)" }}>
                          No stored tokens yet — login via OAuth below to store account tokens automatically.
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* ── BETA ACCOUNT ─────────────────────────────────────────────── */}
              {loginTab === "beta" && (<>
                <div className="flex items-center gap-2 my-1">
                  <div className="flex-1 h-px" style={{ background: "rgba(255,255,255,0.08)" }} />
                  <span className="font-rajdhani text-[9px] text-muted-foreground">OR LOGIN WITH DERIV BETA OAUTH</span>
                  <div className="flex-1 h-px" style={{ background: "rgba(255,255,255,0.08)" }} />
                </div>

                <div className="rounded-lg px-4 py-3 space-y-1.5"
                  style={{ background: "rgba(0,229,255,0.05)", border: "1px solid rgba(0,229,255,0.15)" }}>
                  <div className="flex items-center gap-2">
                    <Shield size={12} style={{ color: "#00e5ff" }} />
                    <span className="font-orbitron text-[10px] font-bold text-primary tracking-wider">NEW DERIV BETA API</span>
                  </div>
                  <p className="font-rajdhani text-xs text-muted-foreground leading-relaxed">
                    Login with your <strong className="text-foreground">Deriv email &amp; password</strong> via secure OAuth 2.0 PKCE.
                    Supports <span style={{ color: "#00e5ff" }}>CR</span> real accounts (CR + 5–7 digits, 7–9 chars).
                  </p>
                  <p className="font-rajdhani text-[10px]" style={{ color: "rgba(0,229,255,0.45)" }}>
                    Client ID: 33s2usCRNz0BJnxgjqANK · auth.deriv.com
                  </p>
                </div>

                <button
                  onClick={() => void handleBetaLogin()}
                  disabled={betaLoading}
                  className="w-full flex items-center justify-center gap-2 py-3 rounded-lg font-orbitron text-xs font-bold tracking-wider transition-all border disabled:opacity-40"
                  style={{ background: "rgba(0,229,255,0.1)", borderColor: "rgba(0,229,255,0.45)", color: "#00e5ff" }}
                >
                  {betaLoading
                    ? <><span className="inline-block w-3 h-3 rounded-full border-2 border-current border-t-transparent animate-spin" /> Redirecting to Deriv…</>
                    : <><Shield size={13} /> LOGIN WITH DERIV BETA (EMAIL &amp; PASSWORD) →</>}
                </button>

                <p className="font-rajdhani text-[10px] text-center" style={{ color: "rgba(0,229,255,0.35)" }}>
                  Redirects to auth.deriv.com — you return here automatically after login.
                </p>
              </>)}

              {/* ── LEGACY API ───────────────────────────────────────────────── */}
              {loginTab === "legacy" && (<>
                <div className="flex items-center gap-2 my-1">
                  <div className="flex-1 h-px" style={{ background: "rgba(255,255,255,0.08)" }} />
                  <span className="font-rajdhani text-[9px] text-muted-foreground">OR CONNECT VIA LEGACY OAUTH</span>
                  <div className="flex-1 h-px" style={{ background: "rgba(255,255,255,0.08)" }} />
                </div>

                <div className="rounded-lg px-4 py-3 space-y-1.5"
                  style={{ background: "rgba(250,204,21,0.05)", border: "1px solid rgba(250,204,21,0.15)" }}>
                  <div className="flex items-center gap-2">
                    <Zap size={12} style={{ color: "#facc15" }} />
                    <span className="font-orbitron text-[10px] font-bold tracking-wider" style={{ color: "#facc15" }}>LEGACY DERIV API</span>
                  </div>
                  <p className="font-rajdhani text-xs text-muted-foreground leading-relaxed">
                    Classic Deriv OAuth via <strong className="text-foreground">oauth.deriv.com</strong> (app_id 1089).
                    Supports CR, MX, MF, and VR accounts.
                  </p>
                </div>

                <button
                  onClick={() => void handleLegacyConnect()}
                  disabled={legacyLoading}
                  className="w-full flex items-center justify-center gap-2 py-3 rounded-lg font-orbitron text-xs font-bold tracking-wider transition-all border disabled:opacity-50"
                  style={{ background: "rgba(250,204,21,0.09)", borderColor: "rgba(250,204,21,0.45)", color: "#facc15" }}
                >
                  {legacyLoading
                    ? <><span className="inline-block w-3 h-3 rounded-full border-2 border-current border-t-transparent animate-spin" /> Connecting…</>
                    : <><Zap size={13} /> LEGACY API — One-Click Connect</>}
                </button>

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

                <div className="flex items-center gap-2 my-1">
                  <div className="flex-1 h-px" style={{ background: "rgba(255,255,255,0.08)" }} />
                  <span className="font-rajdhani text-[9px] text-muted-foreground">OR PASTE YOUR API TOKEN</span>
                  <div className="flex-1 h-px" style={{ background: "rgba(255,255,255,0.08)" }} />
                </div>

                {/* Legacy inline token paste */}
                <div className="rounded-lg px-4 py-3 space-y-2"
                  style={{ background: "rgba(250,204,21,0.03)", border: "1px solid rgba(250,204,21,0.12)" }}>
                  <div className="flex items-center gap-1.5">
                    <Key size={11} style={{ color: "#facc15" }} />
                    <span className="font-orbitron text-[9px] font-bold tracking-wider" style={{ color: "#facc15" }}>PASTE LEGACY API TOKEN</span>
                  </div>
                  <div className="flex gap-2">
                    <input
                      type="password"
                      value={legacyTokenInput}
                      onChange={(e) => setLegacyTokenInput(e.target.value)}
                      onKeyDown={(e) => { if (e.key === "Enter") handleLegacyTokenConnect(); }}
                      placeholder="Paste your Deriv API token…"
                      className="flex-1 px-3 py-2 rounded-lg font-rajdhani text-xs bg-background border border-border text-foreground focus:outline-none focus:border-primary"
                    />
                    <button
                      onClick={handleLegacyTokenConnect}
                      disabled={!legacyTokenInput.trim()}
                      className="px-3 py-2 rounded-lg font-orbitron text-xs font-bold tracking-wider disabled:opacity-40 transition-all"
                      style={{ background: "rgba(250,204,21,0.2)", border: "1px solid rgba(250,204,21,0.4)", color: "#facc15" }}
                    >
                      <Wifi size={13} />
                    </button>
                  </div>
                  <a href="https://app.deriv.com/account/api-token" target="_blank" rel="noopener noreferrer"
                    className="flex items-center gap-1 font-rajdhani text-[9px] text-muted-foreground hover:text-primary transition-colors">
                    <ExternalLink size={8} /> Get your token at app.deriv.com → API Token (enable Trade)
                  </a>
                </div>
              </>)}

              {/* ── BETA API (PAT pat_... format) ─────────────────────────────── */}
              {loginTab === "token" && (<>
                <div className="rounded-lg px-4 py-3 space-y-1.5"
                  style={{ background: "rgba(139,92,246,0.06)", border: "1px solid rgba(139,92,246,0.2)" }}>
                  <div className="flex items-center gap-2">
                    <UserCheck size={12} style={{ color: "#a78bfa" }} />
                    <span className="font-orbitron text-[10px] font-bold tracking-wider" style={{ color: "#a78bfa" }}>BETA API — PERSONAL ACCESS TOKEN</span>
                  </div>
                  <p className="font-rajdhani text-xs text-muted-foreground leading-relaxed">
                    Paste a Deriv <strong className="text-foreground">Beta API token</strong> (<code className="text-[10px] px-1 rounded" style={{ background: "rgba(167,139,250,0.12)", color: "#a78bfa" }}>pat_...</code> format).
                    Connects using the same secure WebSocket authorization as Legacy.
                  </p>
                  <p className="font-rajdhani text-[10px]" style={{ color: "rgba(167,139,250,0.5)" }}>
                    Real &amp; Demo CR accounts supported · Trade permission required
                  </p>
                </div>

                {/* CR Header panel for token tab */}
                {storedAccounts.length > 0 && (
                  <div className="rounded-lg p-3 border space-y-2"
                    style={{ borderColor: "rgba(167,139,250,0.2)", background: "rgba(167,139,250,0.03)" }}>
                    <span className="font-rajdhani text-[9px] text-muted-foreground tracking-wider">STORED CR ACCOUNTS — CLICK TO RECONNECT</span>
                    <div className="flex flex-wrap gap-1.5">
                      {storedAccounts.map(([loginid, token]) => {
                        const isVirtual = loginid.startsWith("VR");
                        return (
                          <button
                            key={loginid}
                            onClick={() => connectWithToken(token)}
                            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg font-orbitron text-[10px] font-bold transition-all hover:scale-105"
                            style={{
                              background: isVirtual ? "rgba(250,204,21,0.1)" : "rgba(167,139,250,0.12)",
                              border: `1px solid ${isVirtual ? "rgba(250,204,21,0.35)" : "rgba(167,139,250,0.4)"}`,
                              color: isVirtual ? "#facc15" : "#a78bfa",
                            }}
                          >
                            {loginid} <ChevronRight size={9} />
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}

                <div className="flex gap-2">
                  <input
                    type="password"
                    value={tokenInput}
                    onChange={(e) => setTokenInput(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter") handlePATConnect(); }}
                    placeholder="pat_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
                    className="flex-1 px-3 py-2.5 rounded-lg font-rajdhani text-xs bg-background border border-border text-foreground focus:outline-none focus:border-primary"
                    style={{ fontFamily: "monospace" }}
                  />
                  <button
                    onClick={handlePATConnect}
                    disabled={!tokenInput.trim()}
                    className="px-4 py-2 rounded-lg font-orbitron text-xs font-bold tracking-wider disabled:opacity-40 transition-all"
                    style={{ background: "rgba(167,139,250,0.2)", border: "1px solid rgba(167,139,250,0.5)", color: "#a78bfa" }}
                  >
                    <Wifi size={13} />
                  </button>
                </div>

                <a href="https://app.deriv.com/account/api-token" target="_blank" rel="noopener noreferrer"
                  className="flex items-center gap-1 font-rajdhani text-[10px] text-muted-foreground hover:text-primary transition-colors">
                  <ExternalLink size={9} /> Get your Beta API token at app.deriv.com → API Token
                </a>
              </>)}
            </div>
          </div>
        </div>
      )}

      {/* Connecting state */}
      {isConnecting && (
        <div className="flex items-center gap-3 px-4 py-3 rounded-xl border"
          style={{ borderColor: "rgba(0,229,255,0.2)", background: "rgba(0,229,255,0.04)" }}>
          <div className="w-2 h-2 rounded-full animate-pulse" style={{ background: "#fb8c00", boxShadow: "0 0 6px #fb8c00" }} />
          <span className="font-orbitron text-xs font-bold text-primary tracking-wider">
            {deriv.status === "connecting" ? "CONNECTING TO DERIV…" : "AUTHORIZING…"}
          </span>
          <span className="font-rajdhani text-xs text-muted-foreground">Please wait</span>
        </div>
      )}

      {/* Connected bar */}
      {isConnected && <DerivConnectionBar />}

      {/* ── Header row ──────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="cyber-card p-4 col-span-2">
          <div className="flex items-start justify-between">
            <div>
              <div className="font-rajdhani text-xs text-muted-foreground tracking-widest uppercase mb-1">Current Price</div>
              <div className="font-orbitron text-2xl font-bold text-foreground" data-testid="text-current-price">
                {currentPrice ? <AnimatedCounter value={currentPrice} decimals={4} /> : "—"}
              </div>
            </div>
            <div className="flex flex-col items-end gap-1">
              <div className="text-xs text-muted-foreground font-rajdhani tracking-widest">CURRENT DIGIT</div>
              <div
                key={flipKey}
                className="font-orbitron text-4xl font-black animate-digit-flip"
                style={{ color: DIGIT_COLORS[currentDigit], textShadow: `0 0 20px ${DIGIT_COLORS[currentDigit]}90` }}
                data-testid="text-current-digit"
              >
                {currentDigit}
              </div>
            </div>
          </div>
        </div>

        <div className="cyber-card p-4 flex flex-col justify-between">
          <div className="flex items-center gap-2 text-muted-foreground">
            <Hash size={14} />
            <span className="font-rajdhani text-xs tracking-widest uppercase">Tick Samples</span>
          </div>
          <div className="font-orbitron text-xl font-bold text-foreground mt-2" data-testid="text-tick-count">
            {tickCount.toLocaleString()}
          </div>
        </div>

        <div className="cyber-card p-4 flex flex-col justify-between">
          <div className="flex items-center gap-2 text-muted-foreground">
            <Activity size={14} />
            <span className="font-rajdhani text-xs tracking-widest uppercase">Even / Odd</span>
          </div>
          <div className="flex items-center gap-3 mt-2">
            <span className="badge-even rounded px-2 py-0.5 text-xs font-bold font-rajdhani">E {evenPct}%</span>
            <span className="badge-odd rounded px-2 py-0.5 text-xs font-bold font-rajdhani">O {oddPct}%</span>
          </div>
        </div>
      </div>

      {/* ── Live tick stream ──────────────────────────────────────────────────── */}
      <div className="cyber-card p-4 scanlines">
        <div className="flex items-center gap-2 mb-3">
          <div className="live-dot w-2 h-2" />
          <span className="font-rajdhani font-semibold text-xs tracking-widest uppercase text-muted-foreground">Live Tick Stream</span>
        </div>
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 min-h-[44px]">
          {recentDigits.length === 0 ? (
            <span className="text-muted-foreground text-xs font-rajdhani">Waiting for data...</span>
          ) : (
            recentDigits.map((d, i) => (
              <DigitBubble key={`${i}-${d}`} digit={d} isLatest={i === 0} />
            ))
          )}
        </div>
      </div>

      {/* ── Digit distribution ──────────────────────────────────────────────── */}
      <div className="cyber-card p-4">
        <div className="flex items-center gap-2 mb-4">
          <TrendingUp size={14} className="text-primary" />
          <span className="font-rajdhani font-semibold text-xs tracking-widest uppercase text-muted-foreground">
            Digit Distribution (Last {tickCount} Ticks)
          </span>
        </div>
        <div className="grid grid-cols-5 md:grid-cols-10 gap-2">
          {Array.from({ length: 10 }, (_, i) => i).map((d) => {
            const stat     = digits.find((x) => x.digit === d);
            const pct      = stat?.percentage ?? 10;
            const count    = stat?.count ?? 0;
            const color    = DIGIT_COLORS[d];
            const isHighest = stat?.rank === 1;
            const isLowest  = stat?.rank === 10;
            return (
              <div
                key={d}
                className={`flex flex-col items-center gap-1 p-2 rounded-md transition-all ${
                  currentDigit === d ? "bg-primary/10 border border-primary/30" : "bg-muted/30"
                }`}
                data-testid={`digit-stat-${d}`}
              >
                <div className="font-orbitron text-lg font-bold" style={{ color, textShadow: `0 0 8px ${color}60` }}>{d}</div>
                <div className="w-full h-16 bg-muted/60 rounded-sm relative overflow-hidden flex flex-col-reverse">
                  <div
                    className="w-full rounded-sm transition-all duration-500"
                    style={{
                      height: `${pct}%`,
                      background: isHighest ? "#00ff8880" : isLowest ? "#ff3b3b80" : `${color}40`,
                      borderTop: `2px solid ${isHighest ? "#00ff88" : isLowest ? "#ff3b3b" : color}`,
                    }}
                  />
                </div>
                <div className="font-rajdhani text-xs font-semibold" style={{ color }}>{pct}%</div>
                <div className="font-rajdhani text-[10px] text-muted-foreground">{count}</div>
                {isHighest && <span className="text-[9px] font-bold text-green-400 font-rajdhani tracking-wider">HIGH</span>}
                {isLowest  && <span className="text-[9px] font-bold text-red-400 font-rajdhani tracking-wider">LOW</span>}
              </div>
            );
          })}
        </div>
      </div>

      {/* ── Hot/Cold summary ──────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 gap-3">
        <div className="cyber-card p-4">
          <div className="font-rajdhani text-xs tracking-widest uppercase text-muted-foreground mb-2">Hottest Digit</div>
          <div
            className="font-orbitron text-3xl font-black"
            style={{ color: DIGIT_COLORS[mostFreq], textShadow: `0 0 20px ${DIGIT_COLORS[mostFreq]}80` }}
            data-testid="text-hottest-digit"
          >
            {mostFreq}
          </div>
          <div className="font-rajdhani text-xs text-muted-foreground mt-1">
            {digits.find((d) => d.digit === mostFreq)?.percentage?.toFixed(1)}% frequency
          </div>
        </div>
        <div className="cyber-card p-4">
          <div className="font-rajdhani text-xs tracking-widest uppercase text-muted-foreground mb-2">Coldest Digit</div>
          <div
            className="font-orbitron text-3xl font-black"
            style={{ color: DIGIT_COLORS[leastFreq], textShadow: `0 0 20px ${DIGIT_COLORS[leastFreq]}80` }}
            data-testid="text-coldest-digit"
          >
            {leastFreq}
          </div>
          <div className="font-rajdhani text-xs text-muted-foreground mt-1">
            {digits.find((d) => d.digit === leastFreq)?.percentage?.toFixed(1)}% frequency
          </div>
        </div>
      </div>
    </div>
  );
}
