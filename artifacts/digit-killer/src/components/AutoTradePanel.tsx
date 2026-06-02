import { useState, useEffect, useRef, useCallback } from "react";
import {
  Bot, Wifi, WifiOff, Play, Square, DollarSign, TrendingUp, TrendingDown,
  Settings2, X, Zap, CheckCircle, XCircle, Loader, AlertCircle, ShieldCheck,
  RefreshCw, ChevronDown, LogIn, User, RotateCcw,
} from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────
export interface TradeSignal {
  contract_type: string;
  confidence: number;
  ticks: number;
  barrier?: number;
  digit?: number;
  label: string;
  direction?: string;
  psych_favors_win?: boolean;
  psych_score?: number;
  psych_win_rate_10?: number;
  psych_streak?: number;
}

interface TradeResult {
  id: string;
  contract_id: number;
  label: string;
  stake: number;
  ticks: number;
  status: "pending" | "open" | "won" | "lost";
  profit: number | null;
  timestamp: string;
  confidence: number;
}

interface Account {
  loginid: string;
  currency: string;
  balance: number;
  is_virtual: boolean;
}

interface AccountListItem {
  loginid: string;
  currency: string;
  is_virtual: number;
  account_type?: string;
  token?: string;
}

interface OAuthConfig {
  client_id: string;
  app_id: string;
  redirect_uri: string;
  configured: boolean;
}

// ─── Constants ────────────────────────────────────────────────────────────────
const MIN_CONFIDENCE = 87;
const MARKUP_PCT = 4;

// ─── PKCE helpers ─────────────────────────────────────────────────────────────
function generateCodeVerifier(): string {
  const arr = crypto.getRandomValues(new Uint8Array(64));
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~";
  return Array.from(arr).map((v) => chars[v % 66]).join("");
}

async function generateCodeChallenge(verifier: string): Promise<string> {
  const hash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier));
  return btoa(String.fromCharCode(...new Uint8Array(hash)))
    .replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function generateState(): string {
  return Array.from(crypto.getRandomValues(new Uint8Array(16)))
    .map((b) => b.toString(16).padStart(2, "0")).join("");
}

// ─── Proxy WS URL ─────────────────────────────────────────────────────────────
function getProxyUrl(): string {
  const proto = location.protocol === "https:" ? "wss" : "ws";
  return `${proto}://${location.host}/ws/deriv`;
}

// ─── Deriv WS hook ────────────────────────────────────────────────────────────
function useDerivWS() {
  const ws          = useRef<WebSocket | null>(null);
  const reqId       = useRef(2);
  const listeners   = useRef<Map<number, (m: Record<string, unknown>) => void>>(new Map());
  const tokenRef    = useRef<string>("");

  const [status,      setStatus     ] = useState<"disconnected"|"connecting"|"authorizing"|"connected">("disconnected");
  const [account,     setAccount    ] = useState<Account | null>(null);
  const [accountList, setAccountList] = useState<AccountListItem[]>([]);
  const [balance,     setBalance    ] = useState<number | null>(null);
  const [error,       setError      ] = useState<string | null>(null);

  const send = useCallback((msg: Record<string, unknown>) => {
    if (ws.current?.readyState === WebSocket.OPEN) {
      ws.current.send(JSON.stringify(msg));
    }
  }, []);

  const request = useCallback((msg: Record<string, unknown>): Promise<Record<string, unknown>> =>
    new Promise((resolve, reject) => {
      if (ws.current?.readyState !== WebSocket.OPEN) {
        reject(new Error("Not connected to Deriv")); return;
      }
      const id = reqId.current++;
      listeners.current.set(id, (r) => {
        if (r.error) reject(new Error((r.error as Record<string, string>)?.message ?? "Deriv API error"));
        else resolve(r);
      });
      ws.current.send(JSON.stringify({ ...msg, req_id: id }));
      setTimeout(() => {
        listeners.current.delete(id);
        reject(new Error("Request timed out"));
      }, 25_000);
    }), []);

  const openSocket = useCallback((token: string) => {
    const socket = new WebSocket(getProxyUrl());
    ws.current   = socket;

    socket.onopen = () => {
      setStatus("connecting");
      socket.send(JSON.stringify({ type: "auth", token }));
    };

    socket.onmessage = (e: MessageEvent<string>) => {
      try {
        const msg     = JSON.parse(e.data) as Record<string, unknown>;
        const type    = msg.type as string | undefined;
        const msgType = msg.msg_type as string | undefined;
        const reqId_  = msg.req_id as number | undefined;

        if (type === "proxy_open") { setStatus("authorizing"); return; }
        if (type === "proxy_reconnecting") {
          setStatus("connecting"); setAccount(null); setBalance(null); return;
        }
        if (type === "proxy_error") {
          setError(String((msg as Record<string, string>).message ?? "Connection error"));
          setStatus("disconnected"); setAccount(null); setBalance(null); return;
        }
        if (type === "proxy_not_ready") return;

        if (reqId_ !== undefined && listeners.current.has(reqId_)) {
          listeners.current.get(reqId_)!(msg);
          listeners.current.delete(reqId_);
        }

        if (msgType === "authorize") {
          const auth    = msg.authorize as Record<string, unknown>;
          const acctList = (auth.account_list as AccountListItem[] | undefined) ?? [];
          setAccountList(acctList);
          setAccount({
            loginid:    auth.loginid    as string,
            currency:   auth.currency   as string,
            balance:    auth.balance    as number,
            is_virtual: (auth.is_virtual as number) === 1,
          });
          setBalance(auth.balance as number);
          setStatus("connected");
          setError(null);
          send({ balance: 1, subscribe: 1, req_id: reqId.current++ });
        }

        if (msgType === "balance") {
          setBalance(((msg.balance as Record<string, unknown>).balance) as number);
        }

        if ((msgType === "error" || msg.error) && !account) {
          const errMsg = (msg.error as Record<string, string>)?.message ?? "Auth error";
          setError(errMsg); setStatus("disconnected");
        }
      } catch { /* ignore */ }
    };

    socket.onclose = (e) => {
      setStatus("disconnected"); setAccount(null); setBalance(null);
      if (e.code !== 1000 && e.code !== 1001) {
        setError(
          e.code === 1006
            ? "Connection dropped (1006) — check your token and network, then reconnect"
            : `Disconnected (${e.code}) — click Connect to retry`
        );
      }
    };

    socket.onerror = () => {
      setError("Cannot reach the backend server — is the API server running?");
      setStatus("disconnected");
    };
  }, [account, send]);

  const connect = useCallback((token: string) => {
    const t = token.trim();
    if (!t) return;
    tokenRef.current = t;
    ws.current?.close(1000);
    setStatus("connecting"); setError(null); setAccount(null); setBalance(null);
    openSocket(t);
  }, [openSocket]);

  const disconnect = useCallback(() => {
    tokenRef.current = "";
    ws.current?.close(1000); ws.current = null;
    setStatus("disconnected"); setAccount(null); setAccountList([]); setBalance(null); setError(null);
  }, []);

  const switchAccount = useCallback(async (item: AccountListItem) => {
    if (!item.token) return;
    // Re-authorize with the specific account's token
    send({ authorize: item.token, req_id: reqId.current++ });
  }, [send]);

  const topupDemo = useCallback(async () => {
    if (status !== "connected" || !account?.is_virtual) return;
    return request({ topup_virtual: 1 });
  }, [status, account, request]);

  useEffect(() => () => { ws.current?.close(1000); }, []);

  return { status, account, accountList, balance, error, connect, disconnect, request, switchAccount, topupDemo, send };
}

// ─── Martingale helper ────────────────────────────────────────────────────────
function nextStake(base: number, mult: number, streak: number) {
  return parseFloat((base * Math.pow(mult, streak)).toFixed(2));
}

// ─── Main component ───────────────────────────────────────────────────────────
interface AutoTradePanelProps {
  signals: TradeSignal[];
  symbol: string;
  pageLabel?: string;
}

export default function AutoTradePanel({ signals, symbol, pageLabel = "Page" }: AutoTradePanelProps) {
  const [open,        setOpen       ] = useState(false);
  const [tokenInput,  setTokenInput ] = useState(() => localStorage.getItem("deriv_token") ?? "");
  const [loginMode,   setLoginMode  ] = useState<"pat" | "oauth">("pat");
  const [showAcctList,setShowAcctList] = useState(false);
  const [resettingDemo, setResettingDemo] = useState(false);
  const [demoResetMsg,  setDemoResetMsg] = useState<string | null>(null);
  const [oauthCfg,    setOauthCfg  ] = useState<OAuthConfig | null>(null);
  const [oauthLoading,setOauthLoading] = useState(false);

  // Settings
  const [baseStake,    setBaseStake   ] = useState(1);
  const [martingaleOn, setMartingaleOn] = useState(false);
  const [martMult,     setMartMult    ] = useState(2);
  const [tpEnabled,    setTpEnabled   ] = useState(false);
  const [tpAmount,     setTpAmount    ] = useState(10);
  const [slEnabled,    setSlEnabled   ] = useState(false);
  const [slAmount,     setSlAmount    ] = useState(5);
  const [autoMode,     setAutoMode    ] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [lossStreak,   setLossStreak  ] = useState(0);
  const [sessionPL,    setSessionPL   ] = useState(0);
  const [trades,       setTrades      ] = useState<TradeResult[]>([]);
  const [executing,    setExecuting   ] = useState(false);
  const [bulkExecuting,setBulkExecuting] = useState(false);

  const deriv = useDerivWS();

  // Fetch OAuth config once when switching to oauth mode
  useEffect(() => {
    if (loginMode === "oauth" && !oauthCfg) {
      fetch("/api/deriv/oauth/config")
        .then((r) => r.json())
        .then((d) => setOauthCfg(d as OAuthConfig))
        .catch(() => {});
    }
  }, [loginMode, oauthCfg]);

  const readySignals = signals
    .filter((s) => s.confidence >= MIN_CONFIDENCE && s.psych_favors_win !== false)
    .sort((a, b) => b.confidence - a.confidence);
  const bestSignal = readySignals[0] ?? null;

  const tpHit   = tpEnabled && sessionPL >= tpAmount;
  const slHit   = slEnabled && sessionPL <= -slAmount;
  const blocked = tpHit || slHit;
  const currentStake = martingaleOn ? nextStake(baseStake, martMult, lossStreak) : baseStake;

  const statusColor = {
    disconnected: "#ef4444", connecting: "#fb8c00",
    authorizing: "#facc15", connected: "#22c55e",
  }[deriv.status];

  const wins   = trades.filter((t) => t.status === "won").length;
  const losses = trades.filter((t) => t.status === "lost").length;
  const total  = wins + losses;
  const wr     = total > 0 ? Math.round((wins / total) * 100) : 0;

  function handleConnect() {
    const t = tokenInput.trim();
    if (!t) return;
    localStorage.setItem("deriv_token", t);
    deriv.connect(t);
  }

  // OAuth 2.0 PKCE login flow
  async function handleOAuthLogin() {
    if (!oauthCfg?.configured) return;
    setOauthLoading(true);
    try {
      const verifier   = generateCodeVerifier();
      const challenge  = await generateCodeChallenge(verifier);
      const state      = generateState();

      sessionStorage.setItem("pkce_code_verifier", verifier);
      sessionStorage.setItem("oauth_state", state);
      sessionStorage.setItem("oauth_redirect_uri", oauthCfg.redirect_uri);

      const params = new URLSearchParams({
        response_type: "code",
        client_id: oauthCfg.client_id,
        redirect_uri: oauthCfg.redirect_uri,
        scope: "trade account_manage",
        state,
        code_challenge: challenge,
        code_challenge_method: "S256",
      });

      window.location.href = `https://auth.deriv.com/oauth2/auth?${params.toString()}`;
    } catch {
      setOauthLoading(false);
    }
  }

  // Reset demo balance via WS (topup_virtual) — works for all connection types
  async function handleDemoReset() {
    if (!deriv.account?.is_virtual) return;
    setResettingDemo(true);
    setDemoResetMsg(null);
    try {
      await deriv.topupDemo();
      setDemoResetMsg("Demo balance topped up!");
      setTimeout(() => setDemoResetMsg(null), 3000);
    } catch (err) {
      setDemoResetMsg(err instanceof Error ? err.message : "Reset failed");
      setTimeout(() => setDemoResetMsg(null), 4000);
    }
    setResettingDemo(false);
  }

  async function executeSingle(sig: TradeSignal, stakeOverride?: number) {
    if (deriv.status !== "connected" || blocked) return null;
    const stake   = stakeOverride ?? currentStake;
    const tradeId = `${Date.now()}-${Math.random()}`;
    const pending: TradeResult = {
      id: tradeId, contract_id: 0, label: sig.label, stake, ticks: sig.ticks,
      status: "pending", profit: null, timestamp: new Date().toISOString(), confidence: sig.confidence,
    };
    setTrades((p) => [pending, ...p.slice(0, 49)]);

    try {
      const proposal: Record<string, unknown> = {
        proposal: 1, amount: stake, basis: "stake",
        contract_type: sig.contract_type,
        currency: deriv.account?.currency ?? "USD",
        duration: sig.ticks, duration_unit: "t", symbol,
        app_markup_percentage: MARKUP_PCT,
      };
      if (sig.contract_type === "HIGHERTICK" || sig.contract_type === "LOWERTICK") {
        proposal.selected_tick = sig.barrier ?? 3;
      } else {
        if (sig.barrier !== undefined) proposal.barrier = String(sig.barrier);
        if (sig.digit   !== undefined) proposal.barrier = String(sig.digit);
      }

      const propResp  = await deriv.request(proposal);
      const prop      = propResp.proposal as Record<string, unknown>;
      const buyResp   = await deriv.request({ buy: prop.id as string, price: stake });
      const buy       = buyResp.buy as Record<string, unknown>;
      const contractId = buy.contract_id as number;
      const buyPrice  = buy.buy_price as number;

      setTrades((p) => p.map((t) => t.id === tradeId ? { ...t, contract_id: contractId, status: "open" } : t));

      return new Promise<{ won: boolean; profit: number }>((resolve) => {
        setTimeout(async () => {
          try {
            const poc = await deriv.request({ proposal_open_contract: 1, contract_id: contractId });
            const c   = poc.proposal_open_contract as Record<string, unknown>;
            const won = (c.is_sold as number) === 1 && (c.profit as number) > 0;
            const profit = parseFloat(((c.profit as number) ?? ((c.sell_price as number) - buyPrice)).toFixed(2));
            setTrades((p) => p.map((t) => t.id === tradeId ? { ...t, status: won ? "won" : "lost", profit } : t));
            setSessionPL((prev) => parseFloat((prev + profit).toFixed(2)));
            resolve({ won, profit });
          } catch {
            setTrades((p) => p.map((t) => t.id === tradeId ? { ...t, status: "lost", profit: -stake } : t));
            setSessionPL((prev) => parseFloat((prev - stake).toFixed(2)));
            resolve({ won: false, profit: -stake });
          }
        }, (sig.ticks + 3) * 1000);
      });
    } catch (err) {
      void err;
      setTrades((p) => p.map((t) => t.id === tradeId ? { ...t, status: "lost", profit: -stake } : t));
      setSessionPL((prev) => parseFloat((prev - stake).toFixed(2)));
      return { won: false, profit: -stake };
    }
  }

  async function handleExecuteBest() {
    if (!bestSignal || executing || blocked || deriv.status !== "connected") return;
    setExecuting(true);
    const result = await executeSingle(bestSignal);
    if (result && martingaleOn) {
      if (result.won) setLossStreak(0);
      else setLossStreak((s) => s + 1);
    }
    setExecuting(false);
  }

  async function handleBulkTrade() {
    if (readySignals.length === 0 || bulkExecuting || blocked || deriv.status !== "connected") return;
    setBulkExecuting(true);
    const results = await Promise.all(readySignals.map((sig) => executeSingle(sig, baseStake)));
    const allWon = results.every((r) => r?.won);
    if (martingaleOn) {
      if (allWon) setLossStreak(0);
      else setLossStreak((s) => s + 1);
    }
    setBulkExecuting(false);
  }

  const lastAutoSigRef = useRef("");
  useEffect(() => {
    if (!autoMode || !bestSignal || deriv.status !== "connected" || executing || blocked) return;
    if (bestSignal.psych_favors_win === false) return;
    if (bestSignal.psych_win_rate_10 !== undefined && bestSignal.psych_win_rate_10 < 50) return;
    const sigKey = `${bestSignal.contract_type}-${bestSignal.confidence.toFixed(1)}-${bestSignal.label}`;
    if (sigKey === lastAutoSigRef.current) return;
    lastAutoSigRef.current = sigKey;
    void handleExecuteBest();
  }, [autoMode, bestSignal, deriv.status, executing, blocked]);

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="w-full flex items-center justify-center gap-2 py-3 rounded-xl font-orbitron text-sm font-bold tracking-wider transition-all border"
        style={{ background: "rgba(0,229,255,0.06)", borderColor: "rgba(0,229,255,0.3)", color: "#00e5ff" }}
      >
        <Bot size={16} />
        AUTO TRADE — {pageLabel}
        {readySignals.length > 0 && (
          <span className="px-1.5 py-0.5 rounded font-orbitron text-[10px]" style={{ background: "#22c55e25", color: "#22c55e" }}>
            {readySignals.length} READY
          </span>
        )}
      </button>
    );
  }

  return (
    <div className="rounded-xl border overflow-hidden" style={{ borderColor: "rgba(0,229,255,0.25)", background: "rgba(0,229,255,0.02)" }}>
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b" style={{ borderColor: "rgba(0,229,255,0.15)", background: "rgba(0,0,0,0.3)" }}>
        <div className="flex items-center gap-2">
          <Bot size={15} className="text-primary" />
          <span className="font-orbitron text-sm font-bold text-primary tracking-wider">AUTO TRADE</span>
          <span className="font-rajdhani text-[10px] text-muted-foreground tracking-widest">· {pageLabel}</span>
          <span className="font-rajdhani text-[9px] px-1.5 py-0.5 rounded" style={{ background: "rgba(0,229,255,0.1)", color: "rgba(0,229,255,0.7)" }}>
            {MARKUP_PCT}% MARKUP
          </span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: statusColor, boxShadow: `0 0 6px ${statusColor}` }} />
          <span className="font-rajdhani text-[10px]" style={{ color: statusColor }}>
            {{ disconnected: "Disconnected", connecting: "Connecting…", authorizing: "Authorizing…", connected: "Connected" }[deriv.status]}
          </span>
          {deriv.account && (
            <button
              onClick={() => setShowAcctList((p) => !p)}
              className="flex items-center gap-1 font-orbitron text-[10px] text-muted-foreground hover:text-primary transition-colors"
            >
              {deriv.account.loginid}
              {deriv.account.is_virtual && <span className="text-yellow-400 ml-0.5">[DEMO]</span>}
              {deriv.accountList.length > 1 && <ChevronDown size={10} />}
            </button>
          )}
          <button onClick={() => setShowSettings((p) => !p)} className="p-1 rounded hover:bg-white/10 transition-all">
            <Settings2 size={13} className="text-muted-foreground" />
          </button>
          <button onClick={() => setOpen(false)} className="p-1 rounded hover:bg-white/10 transition-all">
            <X size={13} className="text-muted-foreground" />
          </button>
        </div>
      </div>

      <div className="p-4 space-y-4">

        {/* ── Account switcher dropdown ───────────────────────────────────────── */}
        {showAcctList && deriv.accountList.length > 1 && (
          <div className="rounded-lg border overflow-hidden" style={{ borderColor: "rgba(0,229,255,0.2)", background: "rgba(0,0,0,0.4)" }}>
            <div className="px-3 py-2 border-b font-rajdhani text-[10px] tracking-widest text-muted-foreground uppercase" style={{ borderColor: "rgba(0,229,255,0.1)" }}>
              Switch Account
            </div>
            {deriv.accountList.map((item) => (
              <button
                key={item.loginid}
                onClick={async () => {
                  if (!item.token) return;
                  await deriv.switchAccount(item);
                  setShowAcctList(false);
                }}
                className="w-full flex items-center justify-between px-3 py-2 hover:bg-white/5 transition-colors"
                style={deriv.account?.loginid === item.loginid ? { background: "rgba(0,229,255,0.08)" } : {}}
              >
                <div className="flex items-center gap-2">
                  <User size={11} className={item.is_virtual ? "text-yellow-400" : "text-green-400"} />
                  <span className="font-orbitron text-xs font-bold" style={{ color: item.is_virtual ? "#facc15" : "#22c55e" }}>
                    {item.loginid}
                  </span>
                  <span className="font-rajdhani text-[10px] text-muted-foreground">
                    {item.is_virtual ? "Demo" : "Real"} · {item.currency}
                  </span>
                </div>
                {deriv.account?.loginid === item.loginid && (
                  <span className="font-rajdhani text-[9px]" style={{ color: "#00e5ff" }}>ACTIVE</span>
                )}
              </button>
            ))}
          </div>
        )}

        {/* ── Connection panel ────────────────────────────────────────────────── */}
        {deriv.status === "disconnected" && (
          <div className="space-y-3">
            {/* Mode tabs */}
            <div className="flex rounded-lg overflow-hidden border" style={{ borderColor: "rgba(0,229,255,0.2)" }}>
              {(["pat", "oauth"] as const).map((m) => (
                <button
                  key={m}
                  onClick={() => setLoginMode(m)}
                  className="flex-1 flex items-center justify-center gap-1.5 py-2 font-orbitron text-[10px] font-bold tracking-wider transition-all"
                  style={loginMode === m
                    ? { background: "#00e5ff", color: "#050a0f" }
                    : { color: "rgba(0,229,255,0.5)", background: "transparent" }}
                >
                  {m === "pat" ? <Wifi size={11} /> : <LogIn size={11} />}
                  {m === "pat" ? "API Token / PAT" : "Login with Deriv"}
                </button>
              ))}
            </div>

            {/* Error */}
            {deriv.error && (
              <div className="flex items-start gap-2 px-3 py-2.5 rounded-lg" style={{ background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.3)" }}>
                <AlertCircle size={13} className="text-red-400 flex-shrink-0 mt-0.5" />
                <div>
                  <div className="font-rajdhani text-xs text-red-400 font-bold">Connection Error</div>
                  <div className="font-rajdhani text-[11px] text-red-300 mt-0.5">{deriv.error}</div>
                  {deriv.error.includes("1006") && (
                    <div className="font-rajdhani text-[10px] text-muted-foreground mt-1">
                      Tip: Check your API token has Trading permissions enabled on Deriv.
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* PAT mode */}
            {loginMode === "pat" && (
              <div className="space-y-2">
                <div className="font-rajdhani text-[10px] text-muted-foreground tracking-widest uppercase">
                  API Connection — Beta/PAT
                </div>
                <div className="flex gap-2">
                  <input
                    type="password"
                    value={tokenInput}
                    onChange={(e) => setTokenInput(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleConnect()}
                    placeholder="Paste your Deriv API token…"
                    className="flex-1 px-3 py-2 rounded-lg font-rajdhani text-xs bg-background border border-border text-foreground focus:outline-none focus:border-primary"
                  />
                  <button
                    onClick={handleConnect}
                    disabled={!tokenInput.trim()}
                    className="px-4 py-2 rounded-lg font-orbitron text-xs font-bold tracking-wider transition-all disabled:opacity-40"
                    style={{ background: "#00e5ff", color: "#050a0f" }}
                  >
                    <Wifi size={13} />
                  </button>
                </div>
                <div className="font-rajdhani text-[10px] text-muted-foreground">
                  Generate a token at <span className="text-primary">app.deriv.com → API Token</span> with Trade permission.
                </div>
              </div>
            )}

            {/* OAuth mode */}
            {loginMode === "oauth" && (
              <div className="space-y-3">
                {oauthCfg === null ? (
                  <div className="flex items-center gap-2 py-2">
                    <Loader size={13} className="animate-spin text-primary" />
                    <span className="font-rajdhani text-xs text-muted-foreground">Loading config…</span>
                  </div>
                ) : !oauthCfg.configured ? (
                  <div className="rounded-lg p-3" style={{ background: "rgba(250,204,21,0.08)", border: "1px solid rgba(250,204,21,0.25)" }}>
                    <div className="font-rajdhani text-xs text-yellow-400 font-bold mb-1">OAuth not configured</div>
                    <div className="font-rajdhani text-[11px] text-muted-foreground leading-relaxed">
                      Set <span className="text-yellow-300 font-bold">DERIV_OAUTH_CLIENT_ID</span> in Replit Secrets to enable Login with Deriv.
                      Register your app at <span className="text-yellow-300">developers.deriv.com</span> to get a client ID.
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="font-rajdhani text-[10px] text-muted-foreground tracking-widest uppercase">
                      Sign in with your Deriv account
                    </div>
                    <button
                      onClick={handleOAuthLogin}
                      disabled={oauthLoading}
                      className="w-full flex items-center justify-center gap-2 py-2.5 rounded-lg font-orbitron text-xs font-bold tracking-wider transition-all disabled:opacity-40"
                      style={{ background: "linear-gradient(135deg, #ff444f, #e91e8c)", color: "#fff", boxShadow: "0 0 20px rgba(233,30,140,0.25)" }}
                    >
                      {oauthLoading ? <Loader size={13} className="animate-spin" /> : <LogIn size={13} />}
                      {oauthLoading ? "Redirecting…" : "Login with Deriv"}
                    </button>
                    <div className="font-rajdhani text-[10px] text-muted-foreground text-center">
                      Supports email + password, 2FA, and all Deriv account types
                    </div>
                  </>
                )}
              </div>
            )}
          </div>
        )}

        {(deriv.status === "connecting" || deriv.status === "authorizing") && (
          <div className="flex items-center gap-3 py-2">
            <Loader size={16} className="animate-spin text-primary" />
            <div>
              <div className="font-rajdhani text-sm text-muted-foreground">
                {deriv.status === "connecting" ? "Connecting to Deriv…" : "Authorizing token…"}
              </div>
              <div className="font-rajdhani text-[10px] text-muted-foreground opacity-60 mt-0.5">
                {deriv.status === "authorizing" && "Verifying your API token with Deriv servers"}
              </div>
            </div>
          </div>
        )}

        {/* ── Connected state ─────────────────────────────────────────────────── */}
        {deriv.status === "connected" && (
          <>
            {/* Balance + account bar */}
            <div className="flex items-center gap-3 p-3 rounded-lg" style={{ background: "rgba(0,229,255,0.05)", border: "1px solid rgba(0,229,255,0.15)" }}>
              <div className="flex items-center gap-1.5 flex-1">
                <DollarSign size={13} className="text-primary" />
                <span className="font-orbitron text-sm font-bold">
                  {deriv.balance?.toFixed(2) ?? "—"} {deriv.account?.currency}
                </span>
                {deriv.account?.is_virtual && (
                  <span className="font-rajdhani text-[10px] px-1.5 py-0.5 rounded font-bold" style={{ background: "rgba(250,204,21,0.15)", color: "#facc15" }}>
                    DEMO
                  </span>
                )}
                {!deriv.account?.is_virtual && (
                  <span className="font-rajdhani text-[10px] px-1.5 py-0.5 rounded font-bold" style={{ background: "rgba(34,197,94,0.15)", color: "#22c55e" }}>
                    REAL
                  </span>
                )}
              </div>
              {/* Demo reset */}
              {deriv.account?.is_virtual && (
                <button
                  onClick={handleDemoReset}
                  disabled={resettingDemo}
                  className="flex items-center gap-1 px-2.5 py-1.5 rounded font-orbitron text-[10px] font-bold tracking-wider transition-all disabled:opacity-40"
                  style={{ background: "rgba(250,204,21,0.12)", border: "1px solid rgba(250,204,21,0.3)", color: "#facc15" }}
                  title="Top up demo balance"
                >
                  {resettingDemo ? <Loader size={10} className="animate-spin" /> : <RotateCcw size={10} />}
                  Reset Demo
                </button>
              )}
              <button
                onClick={deriv.disconnect}
                className="font-rajdhani text-[10px] text-muted-foreground hover:text-foreground tracking-widest uppercase transition-colors"
              >
                Disconnect
              </button>
            </div>

            {/* Demo reset feedback */}
            {demoResetMsg && (
              <div className="font-rajdhani text-xs text-center py-1" style={{ color: demoResetMsg.includes("topped") ? "#22c55e" : "#ef4444" }}>
                {demoResetMsg}
              </div>
            )}

            {/* Stake row */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <div className="font-rajdhani text-[10px] text-muted-foreground tracking-widest uppercase mb-1.5">
                  Stake · Current: <span className="text-primary font-orbitron">${currentStake.toFixed(2)}</span>
                  {martingaleOn && lossStreak > 0 && (
                    <span className="ml-1.5 text-yellow-400">(streak {lossStreak})</span>
                  )}
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {[0.5, 1, 2, 5, 10].map((v) => (
                    <button
                      key={v}
                      onClick={() => { setBaseStake(v); setLossStreak(0); }}
                      className="px-2.5 py-1 rounded font-orbitron text-xs font-bold transition-all"
                      style={baseStake === v
                        ? { background: "#00e5ff", color: "#050a0f" }
                        : { background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.12)", color: "#aaa" }}
                    >
                      ${v}
                    </button>
                  ))}
                  <input
                    type="number" min={0.35} step={0.5} value={baseStake}
                    onChange={(e) => { setBaseStake(parseFloat(e.target.value) || 0.35); setLossStreak(0); }}
                    className="w-16 px-2 py-1 rounded font-orbitron text-xs bg-background border border-border text-foreground focus:outline-none focus:border-primary text-center"
                  />
                </div>
              </div>

              {/* Martingale */}
              <div>
                <div className="flex items-center gap-2 mb-1.5">
                  <div
                    className="w-8 h-4 rounded-full relative cursor-pointer transition-all flex-shrink-0"
                    style={{ background: martingaleOn ? "#facc15" : "rgba(255,255,255,0.15)" }}
                    onClick={() => { setMartingaleOn((p) => !p); setLossStreak(0); }}
                  >
                    <div className="w-3 h-3 rounded-full absolute top-0.5 transition-all bg-white"
                      style={{ left: martingaleOn ? "calc(100% - 14px)" : "2px" }} />
                  </div>
                  <span className="font-rajdhani text-[10px] tracking-widest uppercase" style={{ color: martingaleOn ? "#facc15" : "#666" }}>
                    Martingale {martingaleOn ? "ON" : "OFF"}
                  </span>
                </div>
                {martingaleOn && (
                  <div className="flex gap-1.5 flex-wrap">
                    {[1.5, 2, 2.5, 3].map((v) => (
                      <button
                        key={v}
                        onClick={() => setMartMult(v)}
                        className="px-2 py-1 rounded font-orbitron text-xs font-bold transition-all"
                        style={martMult === v
                          ? { background: "#facc15", color: "#050a0f" }
                          : { background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.12)", color: "#aaa" }}
                      >
                        {v}×
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Settings panel (TP/SL) */}
            {showSettings && (
              <div className="grid grid-cols-2 gap-3 p-3 rounded-lg border" style={{ borderColor: "rgba(255,255,255,0.08)", background: "rgba(0,0,0,0.2)" }}>
                <div className="rounded-lg p-3" style={{ background: "rgba(34,197,94,0.06)", border: "1px solid rgba(34,197,94,0.15)" }}>
                  <div className="flex items-center gap-2 mb-2">
                    <div className="w-7 h-3.5 rounded-full relative cursor-pointer flex-shrink-0"
                      style={{ background: tpEnabled ? "#22c55e" : "rgba(255,255,255,0.15)" }}
                      onClick={() => setTpEnabled((p) => !p)}>
                      <div className="w-2.5 h-2.5 rounded-full absolute top-[1px] bg-white transition-all" style={{ left: tpEnabled ? "calc(100% - 12px)" : "2px" }} />
                    </div>
                    <span className="font-rajdhani text-xs font-bold" style={{ color: tpEnabled ? "#22c55e" : "#888" }}>Take Profit</span>
                  </div>
                  {tpEnabled && (
                    <div className="flex items-center gap-2">
                      <TrendingUp size={11} className="text-green-400" />
                      <input type="number" min={1} step={0.5} value={tpAmount} onChange={(e) => setTpAmount(parseFloat(e.target.value) || 10)}
                        className="w-20 px-2 py-1 rounded font-orbitron text-xs bg-background border border-border text-foreground focus:outline-none focus:border-primary text-center" />
                      <span className="font-rajdhani text-[10px] text-muted-foreground">USD</span>
                    </div>
                  )}
                </div>
                <div className="rounded-lg p-3" style={{ background: "rgba(239,68,68,0.06)", border: "1px solid rgba(239,68,68,0.15)" }}>
                  <div className="flex items-center gap-2 mb-2">
                    <div className="w-7 h-3.5 rounded-full relative cursor-pointer flex-shrink-0"
                      style={{ background: slEnabled ? "#ef4444" : "rgba(255,255,255,0.15)" }}
                      onClick={() => setSlEnabled((p) => !p)}>
                      <div className="w-2.5 h-2.5 rounded-full absolute top-[1px] bg-white transition-all" style={{ left: slEnabled ? "calc(100% - 12px)" : "2px" }} />
                    </div>
                    <span className="font-rajdhani text-xs font-bold" style={{ color: slEnabled ? "#ef4444" : "#888" }}>Stop Loss</span>
                  </div>
                  {slEnabled && (
                    <div className="flex items-center gap-2">
                      <TrendingDown size={11} className="text-red-400" />
                      <input type="number" min={1} step={0.5} value={slAmount} onChange={(e) => setSlAmount(parseFloat(e.target.value) || 5)}
                        className="w-20 px-2 py-1 rounded font-orbitron text-xs bg-background border border-border text-foreground focus:outline-none focus:border-primary text-center" />
                      <span className="font-rajdhani text-[10px] text-muted-foreground">USD</span>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* TP/SL hit warning */}
            {blocked && (
              <div className="flex items-center gap-2 p-3 rounded-lg" style={{ background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.3)" }}>
                <ShieldCheck size={14} className="text-red-400" />
                <span className="font-rajdhani text-xs text-red-400 font-bold">
                  {tpHit ? `Take Profit hit (+$${tpAmount})` : `Stop Loss hit (-$${slAmount})`} — trading paused
                </span>
                <button onClick={() => setSessionPL(0)} className="ml-auto font-rajdhani text-[10px] text-muted-foreground hover:text-foreground underline">
                  Reset
                </button>
              </div>
            )}

            {/* Session stats */}
            {total > 0 && (
              <div className="grid grid-cols-4 gap-2">
                {[
                  { label: "WINS",  val: wins,    color: "#22c55e" },
                  { label: "LOSS",  val: losses,  color: "#ef4444" },
                  { label: "WIN%",  val: `${wr}%`, color: wr >= 60 ? "#22c55e" : wr >= 45 ? "#facc15" : "#ef4444" },
                  { label: "P/L",   val: `${sessionPL >= 0 ? "+" : ""}$${sessionPL.toFixed(2)}`, color: sessionPL >= 0 ? "#22c55e" : "#ef4444" },
                ].map(({ label, val, color }) => (
                  <div key={label} className="text-center p-2 rounded-lg" style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.07)" }}>
                    <div className="font-rajdhani text-[9px] text-muted-foreground tracking-widest">{label}</div>
                    <div className="font-orbitron text-sm font-bold" style={{ color }}>{val}</div>
                  </div>
                ))}
              </div>
            )}

            {/* Ready signals */}
            <div>
              <div className="font-rajdhani text-[10px] text-muted-foreground tracking-widest uppercase mb-2 flex items-center gap-2">
                <Zap size={10} className="text-primary" />
                SIGNALS ≥{MIN_CONFIDENCE}% · PSYCH GATED
                <span className="ml-1 font-orbitron text-[10px]" style={{ color: readySignals.length > 0 ? "#22c55e" : "#888" }}>
                  ({readySignals.length} ready)
                </span>
              </div>
              {(() => {
                const psychBlocked = signals.filter((s) => s.confidence >= MIN_CONFIDENCE && s.psych_favors_win === false);
                return psychBlocked.length > 0 ? (
                  <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg mb-2" style={{ background: "rgba(239,68,68,0.06)", border: "1px solid rgba(239,68,68,0.2)" }}>
                    <AlertCircle size={10} className="text-red-400 flex-shrink-0" />
                    <span className="font-rajdhani text-[10px] text-red-400">
                      {psychBlocked.length} signal{psychBlocked.length > 1 ? "s" : ""} blocked by psychology gate
                    </span>
                  </div>
                ) : null;
              })()}
              {readySignals.length === 0 ? (
                <div className="text-center py-3 font-rajdhani text-xs text-muted-foreground">
                  No signals pass confidence + psychology filters
                </div>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {readySignals.map((sig, i) => (
                    <div key={i} className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg"
                      style={{ background: "rgba(34,197,94,0.08)", border: "1px solid rgba(34,197,94,0.25)" }}>
                      <div className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
                      <span className="font-orbitron text-[10px] font-bold text-green-400">{sig.label}</span>
                      <span className="font-rajdhani text-[9px] text-muted-foreground">{sig.confidence.toFixed(0)}%</span>
                      {sig.psych_score !== undefined && (
                        <span className="font-rajdhani text-[9px] font-bold px-1 rounded"
                          style={{
                            background: sig.psych_score >= 65 ? "rgba(34,197,94,0.15)" : sig.psych_score >= 55 ? "rgba(250,204,21,0.12)" : "rgba(239,68,68,0.12)",
                            color: sig.psych_score >= 65 ? "#22c55e" : sig.psych_score >= 55 ? "#facc15" : "#ef4444",
                          }}>
                          ψ{sig.psych_score.toFixed(0)}
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Action buttons */}
            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => void handleExecuteBest()}
                disabled={!bestSignal || executing || bulkExecuting || blocked}
                className="flex items-center gap-2 px-4 py-2.5 rounded-lg font-orbitron text-xs font-bold tracking-wider transition-all disabled:opacity-40"
                style={{ background: "#00e5ff", color: "#050a0f", boxShadow: "0 0 12px rgba(0,229,255,0.2)" }}
              >
                {executing ? <Loader size={13} className="animate-spin" /> : <Play size={13} />}
                {executing ? "Executing…" : `Execute Best${bestSignal ? ` (${bestSignal.label})` : ""}`}
              </button>
              <button
                onClick={() => void handleBulkTrade()}
                disabled={readySignals.length === 0 || bulkExecuting || executing || blocked}
                className="flex items-center gap-2 px-4 py-2.5 rounded-lg font-orbitron text-xs font-bold tracking-wider transition-all disabled:opacity-40"
                style={{ background: bulkExecuting ? "rgba(233,30,140,0.2)" : "rgba(233,30,140,0.12)", border: "1px solid rgba(233,30,140,0.4)", color: "#e91e8c" }}
              >
                {bulkExecuting ? <Loader size={13} className="animate-spin" /> : <Zap size={13} />}
                {bulkExecuting ? `Trading ${readySignals.length}…` : `Bulk (${readySignals.length})`}
              </button>
              <button
                onClick={() => setAutoMode((p) => !p)}
                disabled={blocked}
                className="flex items-center gap-2 px-4 py-2.5 rounded-lg font-orbitron text-xs font-bold tracking-wider transition-all disabled:opacity-40"
                style={autoMode
                  ? { background: "rgba(239,68,68,0.2)", border: "2px solid #ef4444", color: "#ef4444" }
                  : { background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.15)", color: "#888" }}
              >
                {autoMode ? <><Square size={13} /> Stop Auto</> : <><Bot size={13} /> Auto</>}
              </button>
            </div>

            {autoMode && (
              <div className="space-y-1">
                <div className="flex items-center gap-2 font-rajdhani text-xs" style={{ color: "#22c55e" }}>
                  <div className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
                  Auto-trading active — confidence ≥{MIN_CONFIDENCE}% + psychology OK
                </div>
                {bestSignal?.psych_favors_win === false && (
                  <div className="flex items-center gap-2 font-rajdhani text-xs text-red-400">
                    <AlertCircle size={11} /> Paused — psychology gate: recent digits favor the losing side
                  </div>
                )}
              </div>
            )}
          </>
        )}

        {/* Trade Log */}
        {trades.length > 0 && (
          <div>
            <div className="font-rajdhani text-[10px] text-muted-foreground tracking-widest uppercase mb-2">
              TRADE LOG — {trades.length} trades
            </div>
            <div className="space-y-1.5 max-h-48 overflow-y-auto">
              {trades.map((t) => (
                <div key={t.id} className="flex items-center gap-3 px-3 py-2 rounded-lg"
                  style={{ background: t.status === "won" ? "rgba(34,197,94,0.07)" : t.status === "lost" ? "rgba(239,68,68,0.07)" : "rgba(255,255,255,0.03)" }}>
                  {t.status === "pending" ? <Loader size={12} className="animate-spin text-muted-foreground flex-shrink-0" />
                    : t.status === "open"  ? <Wifi size={12} className="text-yellow-400 flex-shrink-0" />
                    : t.status === "won"   ? <CheckCircle size={12} className="text-green-400 flex-shrink-0" />
                    : <XCircle size={12} className="text-red-400 flex-shrink-0" />}
                  <span className="font-orbitron text-[10px] font-bold flex-1"
                    style={{ color: t.status === "won" ? "#22c55e" : t.status === "lost" ? "#ef4444" : "#aaa" }}>
                    {t.label}
                  </span>
                  <span className="font-rajdhani text-[9px] text-muted-foreground">${t.stake.toFixed(2)} · {t.ticks}T</span>
                  <span className="font-orbitron text-[10px] font-bold flex-shrink-0"
                    style={{ color: t.profit != null ? (t.profit >= 0 ? "#22c55e" : "#ef4444") : "#888" }}>
                    {t.profit != null ? `${t.profit >= 0 ? "+" : ""}$${t.profit.toFixed(2)}` : t.status.toUpperCase()}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
