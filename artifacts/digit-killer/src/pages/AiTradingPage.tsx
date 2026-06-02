import { useState, useEffect, useRef, useCallback } from "react";
import { useSymbol } from "@/context/SymbolContext";
import {
  Bot, Wifi, WifiOff, DollarSign, Zap, Play, Square, AlertCircle,
  RefreshCw, TrendingUp, TrendingDown, SkipForward, User, Shield,
  Settings2, X,
} from "lucide-react";

function getProxyWsUrl(): string {
  const proto = location.protocol === "https:" ? "wss" : "ws";
  return `${proto}://${location.host}/ws/deriv`;
}

const MIN_CONFIDENCE = 85;

interface Account { loginid: string; currency: string; balance: number; account_type: string; is_virtual: boolean; token?: string; }
interface TradeResult {
  id: string; contract_id: number; contract_type: string; symbol: string;
  stake: number; ticks: number; buy_price: number; payout: number | null;
  status: "pending" | "won" | "lost" | "open"; profit: number | null;
  timestamp: string; digit?: number; confidence: number;
}
interface AiSignal {
  contract_type: string; direction: string; ticks: number; confidence: number;
  barrier?: number; digit?: number; reason: string;
}
interface AccountListItem { loginid: string; currency: string; account_type: string; is_virtual: number; token?: string; }

const CONTRACT_LABELS: Record<string, string> = {
  DIGITEVEN: "Even", DIGITODD: "Odd", DIGITOVER: "Over", DIGITUNDER: "Under",
  DIGITMATCH: "Match", DIGITDIFF: "Differ", CALL: "Rise", PUT: "Fall",
};
const DIGIT_COLORS: Record<number, string> = {
  0: "#00897b", 1: "#1e88e5", 2: "#8e24aa", 3: "#43a047", 4: "#fb8c00",
  5: "#00e5ff", 6: "#c6e500", 7: "#e53935", 8: "#e91e8c", 9: "#fdd835",
};

function useDerivWS(token: string | null) {
  const ws           = useRef<WebSocket | null>(null);
  const reqId        = useRef(2);
  const listeners    = useRef<Map<number, (m: Record<string, unknown>) => void>>(new Map());
  const typeListeners = useRef<Map<string, (m: Record<string, unknown>) => void>>(new Map());
  const currentToken = useRef<string>("");

  const [status,      setStatus     ] = useState<"disconnected"|"connecting"|"authorizing"|"connected">("disconnected");
  const [account,     setAccount    ] = useState<Account | null>(null);
  const [accountList, setAccountList] = useState<AccountListItem[]>([]);
  const [balance,     setBalance    ] = useState<number | null>(null);
  const [error,       setError      ] = useState<string | null>(null);

  const send = useCallback((msg: Record<string, unknown>) => {
    const id = reqId.current++;
    if (ws.current?.readyState === WebSocket.OPEN) ws.current.send(JSON.stringify({ ...msg, req_id: id }));
    return id;
  }, []);

  const request = useCallback((msg: Record<string, unknown>): Promise<Record<string, unknown>> =>
    new Promise((resolve, reject) => {
      if (ws.current?.readyState !== WebSocket.OPEN) { reject(new Error("Not connected")); return; }
      const id = reqId.current++;
      listeners.current.set(id, (r) => {
        if (r.error) reject(new Error((r.error as Record<string,string>)?.message ?? "API error"));
        else resolve(r);
      });
      ws.current.send(JSON.stringify({ ...msg, req_id: id }));
      setTimeout(() => { listeners.current.delete(id); reject(new Error("timeout")); }, 25_000);
    }), []);

  const onMessage = useCallback((type: string, cb: (m: Record<string, unknown>) => void) => {
    typeListeners.current.set(type, cb);
    return () => typeListeners.current.delete(type);
  }, []);

  const openSocket = useCallback((t: string, onAuthorized?: () => void) => {
    const socket = new WebSocket(getProxyWsUrl());
    ws.current = socket;

    socket.onopen = () => {
      setStatus("connecting");
      socket.send(JSON.stringify({ type: "auth", token: t }));
    };

    socket.onmessage = (e) => {
      try {
        const msg       = JSON.parse(e.data as string) as Record<string, unknown>;
        const proxyType = msg.type as string | undefined;
        const msgType   = msg.msg_type as string | undefined;
        const id        = msg.req_id as number | undefined;

        if (proxyType === "proxy_open")         { setStatus("authorizing"); return; }
        if (proxyType === "proxy_reconnecting") { setStatus("connecting"); setAccount(null); setBalance(null); return; }
        if (proxyType === "proxy_error")        { setError(String((msg as Record<string,string>).message ?? "Proxy error")); setStatus("disconnected"); return; }
        if (proxyType === "proxy_not_ready")    { return; }

        if (id !== undefined && listeners.current.has(id)) { listeners.current.get(id)!(msg); listeners.current.delete(id); }
        if (msgType) typeListeners.current.get(msgType)?.(msg);

        if (msgType === "authorize") {
          const auth = msg.authorize as Record<string, unknown>;
          setAccount({ loginid: auth.loginid as string, currency: auth.currency as string,
            balance: auth.balance as number, account_type: auth.account_type as string,
            is_virtual: (auth.is_virtual as number) === 1 });
          setBalance(auth.balance as number);
          setStatus("connected"); setError(null);
          setAccountList((auth.account_list as AccountListItem[]) ?? []);
          socket.send(JSON.stringify({ balance: 1, subscribe: 1, req_id: reqId.current++ }));
          onAuthorized?.();
        }
        if (msgType === "balance") setBalance(((msg.balance as Record<string,unknown>).balance) as number);
        if ((msgType === "error" || msg.error) && status !== "connected") {
          setError((msg.error as Record<string,string>)?.message ?? "Connection error");
          setStatus("disconnected");
        }
      } catch {}
    };

    socket.onclose = (ev) => {
      setStatus("disconnected"); setAccount(null); setBalance(null);
      if (ev.code !== 1000 && ev.code !== 1001) setError(`Disconnected (${ev.code}) — reconnect to resume`);
    };
    socket.onerror = () => { setError("Cannot reach backend proxy"); setStatus("disconnected"); };
  }, [status]);

  const connect = useCallback((overrideToken?: string) => {
    const t = (overrideToken !== undefined ? overrideToken : token ?? "").trim();
    if (!t) return;
    currentToken.current = t;
    ws.current?.close(1000);
    setStatus("connecting"); setError(null); setAccount(null); setBalance(null);
    openSocket(t);
  }, [token, openSocket]);

  const disconnect = useCallback(() => {
    currentToken.current = "";
    ws.current?.close(1000); ws.current = null;
    setStatus("disconnected"); setAccount(null); setBalance(null); setError(null);
  }, []);

  const switchAccount = useCallback(async (loginid: string, switchToken?: string) => {
    const t = (switchToken ?? currentToken.current ?? "").trim();
    if (!t) return;
    void loginid;
    currentToken.current = t;
    ws.current?.close(1000);
    setStatus("connecting"); setAccount(null); setBalance(null);
    openSocket(t);
  }, [openSocket]);

  const sellContract = useCallback(async (contractId: number, price: number) => {
    return request({ sell: contractId, price });
  }, [request]);

  useEffect(() => () => { ws.current?.close(1000); }, []);
  return { status, account, accountList, balance, error, connect, disconnect, send, request, onMessage, switchAccount, sellContract };
}

function useLiveTick(symbol: string) {
  const [digit, setDigit] = useState(0);
  useEffect(() => {
    if (!symbol) return;
    let es: EventSource; let dead = false;
    const open = () => {
      es = new EventSource(`/api/live-ticks?symbol=${encodeURIComponent(symbol)}`);
      es.onmessage = (e) => { try { if (!dead) setDigit(JSON.parse(e.data).digit); } catch {} };
      es.onerror   = () => { es.close(); if (!dead) setTimeout(open, 2000); };
    };
    open();
    return () => { dead = true; es?.close(); };
  }, [symbol]);
  return digit;
}

function useAiSignal(symbol: string) {
  const [signal, setSignal] = useState<AiSignal | null>(null);
  useEffect(() => {
    if (!symbol) return;
    const fetch_ = () => {
      fetch(`/api/ai-signals?symbol=${encodeURIComponent(symbol)}`)
        .then((r) => r.json())
        .then((data: Record<string, unknown>) => {
          const sigs = data.signals as Array<{ contract_type: string; direction: string; ticks: number; confidence: number; barrier?: number; digit?: number; reasoning?: string; reason?: string }> | undefined;
          if (sigs?.length) {
            const best = sigs.sort((a, b) => b.confidence - a.confidence)[0];
            setSignal({ ...best, reason: best.reasoning ?? best.reason ?? "AI analysis" });
          }
        })
        .catch(() => {});
    };
    fetch_();
    const t = setInterval(fetch_, 6000);
    return () => clearInterval(t);
  }, [symbol]);
  return signal;
}

// ── Martingale helper ─────────────────────────────────────────────────────────
function nextStake(base: number, mult: number, lossStreak: number, maxMult: number) {
  return Math.min(base * Math.pow(mult, lossStreak), base * maxMult);
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function AiTradingPage() {
  const { symbol } = useSymbol();
  const [token, setToken] = useState(() => localStorage.getItem("deriv_token") ?? "");
  const [tokenInput, setTokenInput] = useState(() => localStorage.getItem("deriv_token") ?? "");

  // Trade settings
  const [baseStake, setBaseStake] = useState(1);
  const [tickOverride, setTickOverride] = useState<1|2|3|"ai">("ai");
  const [autoTrade, setAutoTrade] = useState(false);

  // Martingale settings
  const [martingaleOn, setMartingaleOn] = useState(false);
  const [martMult, setMartMult] = useState(2);
  const [martMax, setMartMax] = useState(8);
  const [lossStreak, setLossStreak] = useState(0);

  // TP / SL
  const [tpEnabled, setTpEnabled] = useState(false);
  const [slEnabled, setSlEnabled] = useState(false);
  const [tpAmount, setTpAmount] = useState(10);
  const [slAmount, setSlAmount] = useState(5);
  const [sessionPL, setSessionPL] = useState(0);
  const [sessionDate, setSessionDate] = useState(() => new Date().toDateString());

  // State
  const [trades, setTrades] = useState<TradeResult[]>([]);
  const [trading, setTrading] = useState(false);
  const [openContracts, setOpenContracts] = useState<Array<{ contract_id: number; price: number }>>([]);
  const [showSettings, setShowSettings] = useState(false);
  const [selectedAccount, setSelectedAccount] = useState<string | null>(null);
  const [killActive, setKillActive] = useState(false);

  const derivWS = useDerivWS(token || null);
  const currentDigit = useLiveTick(symbol);
  const signal = useAiSignal(symbol);

  // Daily reset
  useEffect(() => {
    const today = new Date().toDateString();
    if (today !== sessionDate) {
      setSessionPL(0); setSessionDate(today); setLossStreak(0);
    }
  }, [sessionDate]);

  // Status info
  const statusColor = { disconnected: "#ef4444", connecting: "#fb8c00", authorizing: "#facc15", connected: "#22c55e" }[derivWS.status];
  const statusLabel = { disconnected: "Disconnected", connecting: "Connecting…", authorizing: "Authorizing…", connected: "Connected" }[derivWS.status];

  const wins    = trades.filter((t) => t.status === "won").length;
  const losses  = trades.filter((t) => t.status === "lost").length;
  const total   = wins + losses;
  const winRate = total > 0 ? Math.round((wins / total) * 100) : 0;

  // TP/SL auto-stop
  const tpHit = tpEnabled && sessionPL >= tpAmount;
  const slHit = slEnabled && sessionPL <= -slAmount;
  const tradingBlocked = tpHit || slHit;

  // Current martingale stake
  const currentStake = martingaleOn ? nextStake(baseStake, martMult, lossStreak, martMax) : baseStake;

  const connectDeriv = () => {
    const t = tokenInput.trim();
    if (!t) return;
    setToken(t);
    localStorage.setItem("deriv_token", t);
    derivWS.connect(t);
  };

  useEffect(() => {
    if (token) derivWS.connect(token);
  }, [token]);

  // Auto-trade trigger
  useEffect(() => {
    if (!autoTrade || !signal || derivWS.status !== "connected" || trading || tradingBlocked) return;
    if (signal.confidence < MIN_CONFIDENCE) return;
    const delay = 1500 + Math.random() * 2000;
    const t = setTimeout(() => { void executeTrade(); }, delay);
    return () => clearTimeout(t);
  }, [autoTrade, signal, derivWS.status, trading, tradingBlocked]);

  const executeTrade = async () => {
    if (!signal || derivWS.status !== "connected" || trading || tradingBlocked) return;
    setTrading(true);
    const ticks = tickOverride === "ai" ? signal.ticks : tickOverride;
    const stake  = currentStake;
    const tradeId = Date.now().toString();
    const newTrade: TradeResult = {
      id: tradeId, contract_id: 0, contract_type: signal.contract_type,
      symbol, stake, ticks, buy_price: stake, payout: null, status: "pending",
      profit: null, timestamp: new Date().toISOString(), digit: signal.digit, confidence: signal.confidence,
    };
    setTrades((p) => [newTrade, ...p.slice(0, 29)]);

    try {
      const proposal: Record<string, unknown> = {
        proposal: 1, amount: stake, basis: "stake", contract_type: signal.contract_type,
        currency: derivWS.account?.currency ?? "USD", duration: ticks, duration_unit: "t", symbol,
      };
      if (signal.barrier !== undefined) proposal.barrier = signal.barrier;
      if (signal.digit   !== undefined) proposal.barrier = String(signal.digit);

      const propResp = await derivWS.request(proposal);
      const prop = propResp.proposal as Record<string, unknown>;
      const buyResp = await derivWS.request({ buy: prop.id as string, price: stake });
      const buy = buyResp.buy as Record<string, unknown>;
      const contractId = buy.contract_id as number;
      const buyPrice   = buy.buy_price   as number;

      setOpenContracts((p) => [...p, { contract_id: contractId, price: buyPrice }]);
      setTrades((p) => p.map((t) => t.id === tradeId ? { ...t, contract_id: contractId, buy_price: buyPrice, status: "open" } : t));

      setTimeout(async () => {
        try {
          const poc = await derivWS.request({ proposal_open_contract: 1, contract_id: contractId });
          const c = poc.proposal_open_contract as Record<string, unknown>;
          const won    = (c.is_sold as number) === 1 && (c.profit as number) > 0;
          const profit = (c.profit as number) ?? ((c.sell_price as number) - buyPrice);
          setOpenContracts((p) => p.filter((x) => x.contract_id !== contractId));
          setTrades((p) => p.map((t) => t.id === tradeId ? { ...t, payout: c.payout as number, status: won ? "won" : "lost", profit } : t));
          setSessionPL((prev) => prev + profit);
          if (martingaleOn) {
            if (won) setLossStreak(0);
            else setLossStreak((ls) => ls + 1);
          }
        } catch {
          setOpenContracts((p) => p.filter((x) => x.contract_id !== contractId));
          setTrades((p) => p.map((t) => t.id === tradeId ? { ...t, status: "open" } : t));
        }
      }, (ticks + 3) * 1000);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Trade failed";
      setTrades((p) => p.map((t) => t.id === tradeId ? { ...t, status: "lost", profit: -stake, payout: 0 } : t));
      setSessionPL((prev) => prev - stake);
      if (martingaleOn) setLossStreak((ls) => ls + 1);
      console.error("Trade error:", msg);
    } finally {
      setTrading(false);
    }
  };

  // Kill switch — sell all open contracts
  const killSwitch = async () => {
    if (killActive || openContracts.length === 0) return;
    setKillActive(true);
    setAutoTrade(false);
    for (const c of openContracts) {
      try { await derivWS.sellContract(c.contract_id, 0); } catch {}
    }
    setOpenContracts([]);
    setKillActive(false);
  };

  const confColor = !signal ? "#888"
    : signal.confidence >= 85 ? "#22c55e"
    : signal.confidence >= 70 ? "#facc15"
    : "#ef4444";

  return (
    <div className="space-y-4 animate-fade-in-up max-w-4xl" data-testid="page-ai-trading">

      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <Bot size={20} className="text-primary" />
          <div>
            <h2 className="font-orbitron text-lg font-bold text-primary tracking-wider">AI TRADING</h2>
            <p className="font-rajdhani text-[10px] text-muted-foreground">Min. {MIN_CONFIDENCE}% confidence gate · Real-time signals</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {derivWS.status === "connected" && openContracts.length > 0 && (
            <button onClick={killSwitch} disabled={killActive}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-orbitron text-xs font-black animate-pulse"
              style={{ background: "rgba(239,68,68,0.2)", border: "2px solid #ef4444", color: "#ef4444" }}>
              <X size={12} /> KILL ({openContracts.length})
            </button>
          )}
          <button onClick={() => setShowSettings((p) => !p)}
            className="p-2 rounded-lg transition-all"
            style={{ background: showSettings ? "rgba(0,229,255,0.15)" : "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.12)", color: showSettings ? "#00e5ff" : "#888" }}>
            <Settings2 size={15} />
          </button>
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-bold"
            style={{ background: `${statusColor}18`, border: `1px solid ${statusColor}60`, color: statusColor }}>
            <div className="w-2 h-2 rounded-full animate-pulse" style={{ background: statusColor }} />
            {statusLabel}
          </div>
        </div>
      </div>

      {/* TP/SL Alert */}
      {tradingBlocked && (
        <div className="rounded-xl p-3 flex items-center gap-3 border"
          style={{ background: tpHit ? "rgba(34,197,94,0.1)" : "rgba(239,68,68,0.1)", borderColor: tpHit ? "#22c55e" : "#ef4444" }}>
          <Shield size={16} style={{ color: tpHit ? "#22c55e" : "#ef4444" }} />
          <div className="font-rajdhani text-sm font-bold" style={{ color: tpHit ? "#22c55e" : "#ef4444" }}>
            {tpHit ? `✓ TAKE PROFIT HIT — +${sessionPL.toFixed(2)}. Auto-trade paused.`
                   : `✗ STOP LOSS HIT — ${sessionPL.toFixed(2)}. Auto-trade paused.`}
          </div>
          <button onClick={() => { setSessionPL(0); setLossStreak(0); }}
            className="ml-auto px-2 py-1 rounded text-xs font-rajdhani font-bold"
            style={{ background: "rgba(255,255,255,0.1)", color: "#fff" }}>Reset</button>
        </div>
      )}

      {/* Connection panel */}
      <div className="cyber-card p-4">
        <div className="flex items-center gap-2 mb-3">
          <Wifi size={14} className="text-primary" />
          <span className="font-rajdhani font-bold text-xs tracking-widest uppercase text-muted-foreground">Deriv API Connection</span>
          {token.startsWith("pat_") && (
            <span className="px-2 py-0.5 rounded-full font-rajdhani text-[9px] font-bold" style={{ background: "rgba(250,204,21,0.15)", color: "#facc15", border: "1px solid rgba(250,204,21,0.3)" }}>
              Beta/PAT · ws.derivws.com
            </span>
          )}
        </div>
        <div className="flex gap-2">
          <input type="password" value={tokenInput} onChange={(e) => setTokenInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && connectDeriv()}
            placeholder="API token or pat_... for beta accounts"
            className="flex-1 px-3 py-2 rounded-lg font-orbitron text-sm bg-background border border-border text-foreground focus:outline-none focus:border-primary"
            data-testid="input-api-token" />
          {derivWS.status === "connected"
            ? <button onClick={derivWS.disconnect} className="flex items-center gap-2 px-4 py-2 rounded-lg font-rajdhani font-bold text-sm" style={{ background: "rgba(239,68,68,0.15)", border: "1px solid rgba(239,68,68,0.4)", color: "#ef4444" }}><WifiOff size={14} /> Disconnect</button>
            : <button onClick={connectDeriv} disabled={!tokenInput.trim() || derivWS.status === "connecting" || derivWS.status === "authorizing"}
                className="flex items-center gap-2 px-4 py-2 rounded-lg font-rajdhani font-bold text-sm disabled:opacity-50"
                style={{ background: "rgba(0,229,255,0.15)", border: "1px solid rgba(0,229,255,0.4)", color: "#00e5ff" }}><Wifi size={14} /> Connect</button>}
        </div>
        {derivWS.error && <div className="flex items-center gap-2 mt-2 text-red-400 text-xs font-rajdhani"><AlertCircle size={12} /> {derivWS.error}</div>}
      </div>

      {/* Account info + switcher */}
      {derivWS.account && (
        <div className="cyber-card p-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-3">
            {[
              { label: "Account", value: derivWS.account.loginid, color: "#00e5ff" },
              { label: "Balance", value: `${derivWS.account.currency} ${(derivWS.balance ?? 0).toFixed(2)}`, color: "#22c55e" },
              { label: "Type", value: derivWS.account.is_virtual ? "DEMO" : "REAL", color: derivWS.account.is_virtual ? "#facc15" : "#22c55e" },
              { label: "Session P/L", value: `${sessionPL >= 0 ? "+" : ""}${sessionPL.toFixed(2)}`, color: sessionPL >= 0 ? "#22c55e" : "#ef4444" },
            ].map(({ label, value, color }) => (
              <div key={label} className="rounded-lg p-3" style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }}>
                <div className="font-rajdhani text-[10px] text-muted-foreground tracking-widest uppercase">{label}</div>
                <div className="font-orbitron text-sm font-bold mt-1" style={{ color }}>{value}</div>
              </div>
            ))}
          </div>

          {/* Account switcher */}
          {derivWS.accountList.length > 1 && (
            <div>
              <div className="font-rajdhani text-[10px] text-muted-foreground tracking-widest uppercase mb-2">Switch Account</div>
              <div className="flex flex-wrap gap-2">
                {derivWS.accountList.map((acc) => (
                  <button key={acc.loginid}
                    onClick={() => { setSelectedAccount(acc.loginid); derivWS.switchAccount(acc.loginid, acc.token); }}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-rajdhani text-xs font-bold transition-all"
                    style={acc.loginid === (selectedAccount ?? derivWS.account?.loginid)
                      ? { background: "rgba(0,229,255,0.15)", border: "1px solid rgba(0,229,255,0.5)", color: "#00e5ff" }
                      : { background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.12)", color: "#888" }}>
                    {acc.is_virtual ? <Bot size={10} /> : <User size={10} />}
                    {acc.loginid} · {acc.currency}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* AI Signal */}
      {signal && (
        <div className="cyber-card p-4">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Zap size={14} className="text-primary" />
              <span className="font-rajdhani font-bold text-xs tracking-widest uppercase text-muted-foreground">AI Signal — {symbol}</span>
            </div>
            <div className="flex items-center gap-2">
              {signal.confidence < MIN_CONFIDENCE && (
                <span className="px-2 py-0.5 rounded-full text-[9px] font-rajdhani font-bold" style={{ background: "rgba(239,68,68,0.15)", color: "#ef4444", border: "1px solid rgba(239,68,68,0.3)" }}>
                  Below {MIN_CONFIDENCE}% gate
                </span>
              )}
              <div className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
            </div>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-3">
            <div className="rounded-lg p-3" style={{ background: "rgba(0,229,255,0.08)", border: "1px solid rgba(0,229,255,0.2)" }}>
              <div className="font-rajdhani text-[10px] text-muted-foreground uppercase">Contract</div>
              <div className="font-orbitron text-sm font-bold text-primary mt-0.5">{CONTRACT_LABELS[signal.contract_type] ?? signal.contract_type}</div>
            </div>
            <div className="rounded-lg p-3" style={{ background: "rgba(34,197,94,0.08)", border: "1px solid rgba(34,197,94,0.2)" }}>
              <div className="font-rajdhani text-[10px] text-muted-foreground uppercase">Duration</div>
              <div className="font-orbitron text-sm font-bold text-green-400 mt-0.5">
                {tickOverride === "ai" ? signal.ticks : tickOverride}T
              </div>
            </div>
            {signal.digit !== undefined && (
              <div className="rounded-lg p-3" style={{ background: "rgba(250,204,21,0.08)", border: "1px solid rgba(250,204,21,0.2)" }}>
                <div className="font-rajdhani text-[10px] text-muted-foreground uppercase">Target</div>
                <div className="font-orbitron text-2xl font-black mt-0.5" style={{ color: DIGIT_COLORS[signal.digit] }}>{signal.digit}</div>
              </div>
            )}
            {signal.barrier !== undefined && signal.digit === undefined && (
              <div className="rounded-lg p-3" style={{ background: "rgba(250,204,21,0.08)", border: "1px solid rgba(250,204,21,0.2)" }}>
                <div className="font-rajdhani text-[10px] text-muted-foreground uppercase">Barrier</div>
                <div className="font-orbitron text-2xl font-black text-yellow-400 mt-0.5">{signal.barrier}</div>
              </div>
            )}
            <div className="rounded-lg p-3" style={{ background: `${confColor}12`, border: `1px solid ${confColor}40` }}>
              <div className="font-rajdhani text-[10px] text-muted-foreground uppercase">Confidence</div>
              <div className="font-orbitron text-sm font-bold mt-0.5" style={{ color: confColor }}>{signal.confidence.toFixed(1)}%</div>
              <div className="h-1 mt-1 rounded-full overflow-hidden" style={{ background: "rgba(255,255,255,0.1)" }}>
                <div className="h-full rounded-full" style={{ width: `${signal.confidence}%`, background: confColor, transition: "width 0.5s" }} />
              </div>
            </div>
          </div>
          <div className="rounded-lg px-3 py-2 font-rajdhani text-xs flex items-center gap-2" style={{ background: "rgba(255,255,255,0.04)", color: "rgba(255,255,255,0.6)" }}>
            <div className="w-6 h-6 rounded-full flex items-center justify-center font-orbitron text-xs font-black flex-shrink-0 text-white" style={{ background: DIGIT_COLORS[currentDigit] }}>{currentDigit}</div>
            {signal.reason}
          </div>
        </div>
      )}
      {!signal && (
        <div className="cyber-card p-4 flex items-center gap-3">
          <RefreshCw size={14} className="animate-spin text-muted-foreground" />
          <span className="font-rajdhani text-sm text-muted-foreground">Loading AI signals for {symbol}…</span>
        </div>
      )}

      {/* Trade Controls */}
      <div className="cyber-card p-4">
        <div className="flex items-center gap-2 mb-4">
          <DollarSign size={14} className="text-primary" />
          <span className="font-rajdhani font-bold text-xs tracking-widest uppercase text-muted-foreground">Trade Controls</span>
          {martingaleOn && lossStreak > 0 && (
            <span className="px-2 py-0.5 rounded-full text-[9px] font-bold font-rajdhani" style={{ background: "rgba(250,204,21,0.15)", color: "#facc15", border: "1px solid rgba(250,204,21,0.3)" }}>
              Martingale streak: {lossStreak}× → stake {currentStake.toFixed(2)}
            </span>
          )}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
          <div>
            <label className="block font-rajdhani text-[10px] text-muted-foreground tracking-widest uppercase mb-1.5">Base Stake</label>
            <div className="flex items-center gap-2 flex-wrap">
              {[0.5,1,2,5,10].map((v) => (
                <button key={v} onClick={() => setBaseStake(v)}
                  className="px-2.5 py-1 rounded font-orbitron text-xs font-bold transition-all"
                  style={baseStake === v ? { background: "#00e5ff", color: "#050a0f" } : { background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.12)", color: "#aaa" }}>
                  {v}
                </button>
              ))}
              <input type="number" min={0.35} step={0.5} value={baseStake} onChange={(e) => setBaseStake(parseFloat(e.target.value)||1)}
                className="w-20 px-2 py-1 rounded font-orbitron text-xs bg-background border border-border text-foreground focus:outline-none focus:border-primary text-center" />
            </div>
          </div>
          <div>
            <label className="block font-rajdhani text-[10px] text-muted-foreground tracking-widest uppercase mb-1.5">Tick Duration</label>
            <div className="flex items-center gap-2">
              {(["ai",1,2,3] as const).map((v) => (
                <button key={v} onClick={() => setTickOverride(v)}
                  className="px-3 py-1 rounded font-orbitron text-xs font-bold transition-all"
                  style={tickOverride === v ? { background: "#00e5ff", color: "#050a0f" } : { background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.12)", color: "#aaa" }}>
                  {v === "ai" ? "AI" : `${v}T`}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Execute + Auto Trade */}
        <div className="flex flex-wrap gap-3 mb-4">
          <button onClick={() => void executeTrade()}
            disabled={derivWS.status !== "connected" || !signal || trading || tradingBlocked || (signal?.confidence ?? 0) < MIN_CONFIDENCE}
            className="flex items-center gap-2 px-5 py-2.5 rounded-lg font-orbitron text-sm font-bold tracking-wider transition-all disabled:opacity-40"
            style={{ background: "#00e5ff", color: "#050a0f", boxShadow: "0 0 16px rgba(0,229,255,0.25)" }}
            data-testid="button-execute-trade">
            <Play size={14} /> {trading ? "Executing…" : "Execute Trade"}
          </button>
          <button onClick={() => setAutoTrade((p) => !p)}
            disabled={derivWS.status !== "connected" || tradingBlocked}
            className="flex items-center gap-2 px-5 py-2.5 rounded-lg font-orbitron text-sm font-bold tracking-wider transition-all disabled:opacity-40"
            style={autoTrade
              ? { background: "rgba(239,68,68,0.2)", border: "2px solid #ef4444", color: "#ef4444" }
              : { background: "rgba(34,197,94,0.12)", border: "1px solid rgba(34,197,94,0.4)", color: "#22c55e" }}
            data-testid="button-auto-trade">
            {autoTrade ? <><Square size={14} /> Stop Auto</> : <><Bot size={14} /> Auto Trade</>}
          </button>
        </div>

        {autoTrade && (
          <div className="flex items-center gap-2 text-xs font-rajdhani mb-2" style={{ color: "#22c55e" }}>
            <div className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
            Auto-trading — executes only when confidence ≥{MIN_CONFIDENCE}%
          </div>
        )}

        {/* Settings panel */}
        {showSettings && (
          <div className="border-t border-border/50 pt-4 mt-4 space-y-4">
            {/* Martingale */}
            <div>
              <div className="flex items-center gap-3 mb-2">
                <div className="w-8 h-4 rounded-full relative cursor-pointer transition-all"
                  style={{ background: martingaleOn ? "#22c55e" : "rgba(255,255,255,0.15)" }}
                  onClick={() => { setMartingaleOn((p) => !p); setLossStreak(0); }}>
                  <div className="w-3 h-3 rounded-full absolute top-0.5 transition-all"
                    style={{ left: martingaleOn ? "calc(100% - 14px)" : "2px", background: "#fff" }} />
                </div>
                <span className="font-rajdhani text-xs font-bold tracking-widest uppercase" style={{ color: martingaleOn ? "#22c55e" : "#888" }}>
                  Martingale {martingaleOn ? "ON" : "OFF"}
                </span>
                {martingaleOn && <span className="font-rajdhani text-xs text-muted-foreground">Multiply stake on loss</span>}
              </div>
              {martingaleOn && (
                <div className="grid grid-cols-2 gap-3 pl-11">
                  <div>
                    <label className="font-rajdhani text-[10px] text-muted-foreground tracking-widest uppercase block mb-1">Multiplier</label>
                    <div className="flex gap-2">
                      {[1.5,2,2.5,3].map((v) => (
                        <button key={v} onClick={() => setMartMult(v)}
                          className="px-2 py-1 rounded font-orbitron text-xs font-bold"
                          style={martMult === v ? { background: "#00e5ff", color: "#050a0f" } : { background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.12)", color: "#aaa" }}>
                          {v}×
                        </button>
                      ))}
                    </div>
                  </div>
                  <div>
                    <label className="font-rajdhani text-[10px] text-muted-foreground tracking-widest uppercase block mb-1">Max multiplier cap</label>
                    <div className="flex gap-2">
                      {[4,8,16,32].map((v) => (
                        <button key={v} onClick={() => setMartMax(v)}
                          className="px-2 py-1 rounded font-orbitron text-xs font-bold"
                          style={martMax === v ? { background: "#facc15", color: "#050a0f" } : { background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.12)", color: "#aaa" }}>
                          {v}×
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* TP / SL */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="rounded-lg p-3" style={{ background: "rgba(34,197,94,0.06)", border: "1px solid rgba(34,197,94,0.15)" }}>
                <div className="flex items-center gap-2 mb-2">
                  <div className="w-8 h-4 rounded-full relative cursor-pointer"
                    style={{ background: tpEnabled ? "#22c55e" : "rgba(255,255,255,0.15)" }}
                    onClick={() => setTpEnabled((p) => !p)}>
                    <div className="w-3 h-3 rounded-full absolute top-0.5 transition-all" style={{ left: tpEnabled ? "calc(100% - 14px)" : "2px", background: "#fff" }} />
                  </div>
                  <span className="font-rajdhani text-xs font-bold" style={{ color: tpEnabled ? "#22c55e" : "#888" }}>
                    Take Profit {tpEnabled ? "ON" : "OFF"}
                  </span>
                </div>
                {tpEnabled && (
                  <div className="flex items-center gap-2">
                    <TrendingUp size={12} className="text-green-400" />
                    <input type="number" min={1} step={0.5} value={tpAmount} onChange={(e) => setTpAmount(parseFloat(e.target.value)||10)}
                      className="w-24 px-2 py-1 rounded font-orbitron text-xs bg-background border border-border text-foreground focus:outline-none focus:border-primary text-center" />
                    <span className="font-rajdhani text-xs text-muted-foreground">USD</span>
                  </div>
                )}
              </div>
              <div className="rounded-lg p-3" style={{ background: "rgba(239,68,68,0.06)", border: "1px solid rgba(239,68,68,0.15)" }}>
                <div className="flex items-center gap-2 mb-2">
                  <div className="w-8 h-4 rounded-full relative cursor-pointer"
                    style={{ background: slEnabled ? "#ef4444" : "rgba(255,255,255,0.15)" }}
                    onClick={() => setSlEnabled((p) => !p)}>
                    <div className="w-3 h-3 rounded-full absolute top-0.5 transition-all" style={{ left: slEnabled ? "calc(100% - 14px)" : "2px", background: "#fff" }} />
                  </div>
                  <span className="font-rajdhani text-xs font-bold" style={{ color: slEnabled ? "#ef4444" : "#888" }}>
                    Stop Loss {slEnabled ? "ON" : "OFF"}
                  </span>
                </div>
                {slEnabled && (
                  <div className="flex items-center gap-2">
                    <TrendingDown size={12} className="text-red-400" />
                    <input type="number" min={1} step={0.5} value={slAmount} onChange={(e) => setSlAmount(parseFloat(e.target.value)||5)}
                      className="w-24 px-2 py-1 rounded font-orbitron text-xs bg-background border border-border text-foreground focus:outline-none focus:border-primary text-center" />
                    <span className="font-rajdhani text-xs text-muted-foreground">USD</span>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Session stats */}
      {trades.length > 0 && (
        <div className="grid grid-cols-4 gap-3">
          {[
            { label: "Wins", value: wins, color: "#22c55e" },
            { label: "Losses", value: losses, color: "#ef4444" },
            { label: "Win Rate", value: `${winRate}%`, color: winRate >= 60 ? "#22c55e" : winRate >= 45 ? "#facc15" : "#ef4444" },
            { label: "Session P/L", value: `${sessionPL >= 0 ? "+" : ""}${sessionPL.toFixed(2)}`, color: sessionPL >= 0 ? "#22c55e" : "#ef4444" },
          ].map(({ label, value, color }) => (
            <div key={label} className="cyber-card p-3 text-center">
              <div className="font-rajdhani text-[10px] text-muted-foreground tracking-widest uppercase">{label}</div>
              <div className="font-orbitron text-lg font-black mt-1" style={{ color }}>{value}</div>
            </div>
          ))}
        </div>
      )}

      {/* Trade History */}
      {trades.length > 0 && (
        <div className="cyber-card p-4">
          <div className="flex items-center gap-2 mb-3">
            <SkipForward size={14} className="text-primary" />
            <span className="font-rajdhani font-bold text-xs tracking-widest uppercase text-muted-foreground">Trade History</span>
          </div>
          <div className="space-y-2 max-h-64 overflow-y-auto">
            {trades.map((t) => (
              <div key={t.id} className="flex items-center gap-3 px-3 py-2 rounded-lg"
                style={{ background: t.status === "won" ? "rgba(34,197,94,0.08)" : t.status === "lost" ? "rgba(239,68,68,0.08)" : "rgba(255,255,255,0.04)" }}>
                <div className="w-6 h-6 rounded-full flex items-center justify-center font-orbitron text-xs font-black flex-shrink-0 text-white"
                  style={{ background: DIGIT_COLORS[t.digit ?? 0] }}>
                  {t.digit ?? "?"}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-orbitron text-xs font-bold" style={{ color: t.status === "won" ? "#22c55e" : t.status === "lost" ? "#ef4444" : "#aaa" }}>
                      {CONTRACT_LABELS[t.contract_type] ?? t.contract_type}
                    </span>
                    <span className="font-rajdhani text-[10px] text-muted-foreground">{t.stake.toFixed(2)} · {t.ticks}T</span>
                    {t.confidence >= MIN_CONFIDENCE && <span className="font-rajdhani text-[9px]" style={{ color: "#22c55e" }}>✓{t.confidence.toFixed(0)}%</span>}
                  </div>
                </div>
                <div className="font-orbitron text-xs font-bold flex-shrink-0" style={{ color: t.profit != null ? (t.profit >= 0 ? "#22c55e" : "#ef4444") : "#888" }}>
                  {t.profit != null ? `${t.profit >= 0 ? "+" : ""}${t.profit.toFixed(2)}` : t.status.toUpperCase()}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
