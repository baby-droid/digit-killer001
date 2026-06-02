import { useEffect, useRef, useState } from "react";
import {
  useGetDigitAnalysis,
  getGetDigitAnalysisQueryKey,
} from "@workspace/api-client-react";
import { useSymbol } from "@/context/SymbolContext";
import { useDerivContext } from "@/context/DerivContext";
import { TrendingUp, Activity, Hash, LogIn, Wifi, ExternalLink } from "lucide-react";
import DerivConnectionBar from "@/components/DerivConnectionBar";

const DIGIT_COLORS: Record<number, string> = {
  0: "#00e5d4", 1: "#448aff", 2: "#ce93d8", 3: "#00c853", 4: "#ff9100",
  5: "#00e5ff", 6: "#c6ff00", 7: "#ff1744", 8: "#f50057", 9: "#ffd600",
};

const CLIENT_ID    = "33rtqtfBfgRZqEpvayxel";
const REDIRECT_URI = `${window.location.origin}/callback`;
const ALPHABET     = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~";

async function buildPkceUrl(): Promise<string> {
  const array        = crypto.getRandomValues(new Uint8Array(64));
  const codeVerifier = Array.from(array).map((v) => ALPHABET[v % ALPHABET.length]).join("");
  const hash         = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(codeVerifier));
  const codeChallenge = btoa(String.fromCharCode(...new Uint8Array(hash)))
    .replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  const state = crypto.getRandomValues(new Uint8Array(16)).reduce((s, b) => s + b.toString(16).padStart(2, "0"), "");
  sessionStorage.setItem("pkce_verifier", codeVerifier);
  sessionStorage.setItem("oauth_state",   state);
  return (
    `https://auth.deriv.com/oauth2/auth` +
    `?response_type=code` +
    `&client_id=${CLIENT_ID}` +
    `&redirect_uri=${encodeURIComponent(REDIRECT_URI)}` +
    `&scope=trade%20account_manage` +
    `&state=${state}` +
    `&code_challenge=${codeChallenge}` +
    `&code_challenge_method=S256`
  );
}

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

  const [prevDigit, setPrevDigit] = useState<number | null>(null);
  const [flipKey,   setFlipKey  ] = useState(0);
  const [tokenInput, setTokenInput] = useState("");

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

  async function handleOAuth() {
    try {
      const url = await buildPkceUrl();
      window.location.href = url;
    } catch {
      window.location.href =
        `https://oauth.deriv.com/oauth2/authorize?app_id=1089&redirect_uri=${encodeURIComponent(REDIRECT_URI)}`;
    }
  }

  function handlePATConnect() {
    const t = tokenInput.trim();
    if (!t) return;
    localStorage.setItem("deriv_token", t);
    deriv.connect(t);
    setTokenInput("");
  }

  const isConnected   = deriv.status === "connected";
  const isConnecting  = deriv.status === "connecting" || deriv.status === "authorizing";
  const isDisconnected = deriv.status === "disconnected";

  return (
    <div className="space-y-4 animate-fade-in-up" data-testid="page-dashboard">

      {/* ── Deriv Connection Panel (Dashboard-only full login) ──────────────── */}
      {isDisconnected && (
        <div className="rounded-2xl overflow-hidden"
          style={{ background: "rgba(0,0,0,0.4)", border: "1px solid rgba(0,229,255,0.18)", backdropFilter: "blur(8px)" }}>
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

          <div className="p-5 grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* OAuth Login */}
            <div className="flex flex-col gap-3 p-4 rounded-xl border"
              style={{ borderColor: "rgba(233,30,140,0.25)", background: "rgba(233,30,140,0.04)" }}>
              <div className="flex items-center gap-2">
                <LogIn size={14} style={{ color: "#e91e8c" }} />
                <span className="font-orbitron text-xs font-bold tracking-wider" style={{ color: "#e91e8c" }}>
                  LOGIN WITH DERIV
                </span>
                <span className="font-rajdhani text-[10px] px-1.5 py-0.5 rounded font-bold ml-auto"
                  style={{ background: "rgba(34,197,94,0.12)", color: "#22c55e" }}>RECOMMENDED</span>
              </div>
              <p className="font-rajdhani text-xs text-muted-foreground leading-relaxed">
                Use your Deriv email and password. Redirected to Deriv's secure login and back automatically.
              </p>
              <button
                onClick={handleOAuth}
                className="w-full flex items-center justify-center gap-2 py-3 rounded-lg font-orbitron text-xs font-bold tracking-wider transition-all"
                style={{ background: "linear-gradient(135deg,#ff444f,#e91e8c)", color: "#fff", boxShadow: "0 0 20px rgba(233,30,140,0.35)" }}
              >
                <LogIn size={13} /> Login with Deriv Account
              </button>
            </div>

            {/* API Token */}
            <div className="flex flex-col gap-3 p-4 rounded-xl border"
              style={{ borderColor: "rgba(0,229,255,0.2)", background: "rgba(0,229,255,0.03)" }}>
              <div className="flex items-center gap-2">
                <Wifi size={14} className="text-primary" />
                <span className="font-orbitron text-xs font-bold text-primary tracking-wider">API TOKEN</span>
              </div>
              <p className="font-rajdhani text-xs text-muted-foreground leading-relaxed">
                Paste a Deriv API token with <strong className="text-primary">Trade</strong> permission enabled.
              </p>
              <div className="flex gap-2">
                <input
                  type="password"
                  value={tokenInput}
                  onChange={(e) => setTokenInput(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") handlePATConnect(); }}
                  placeholder="Paste API token…"
                  className="flex-1 px-3 py-2.5 rounded-lg font-rajdhani text-xs bg-background border border-border text-foreground focus:outline-none focus:border-primary"
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
              <a href="https://app.deriv.com/account/api-token" target="_blank" rel="noopener noreferrer"
                className="flex items-center gap-1 font-rajdhani text-[10px] text-muted-foreground hover:text-primary transition-colors">
                <ExternalLink size={9} /> Get API token from Deriv
              </a>
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
