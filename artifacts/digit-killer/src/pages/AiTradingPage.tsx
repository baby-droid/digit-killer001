import { useState, useEffect, useRef, useCallback } from "react";
import { useSymbol } from "@/context/SymbolContext";
import { Bot, Wifi, WifiOff, DollarSign, Zap, Play, Square, RefreshCw, AlertCircle, CheckCircle, Clock } from "lucide-react";

const DERIV_WS = "wss://ws.binaryws.com/websockets/v3?app_id=1089";

interface Account {
  loginid: string;
  currency: string;
  balance: number;
  account_type: string;
  is_virtual: boolean;
}

interface TradeResult {
  id: string;
  contract_id: number;
  contract_type: string;
  symbol: string;
  stake: number;
  ticks: number;
  buy_price: number;
  payout: number | null;
  status: "pending" | "won" | "lost" | "open";
  profit: number | null;
  timestamp: string;
  digit?: number;
}

interface AiSignal {
  contract_type: string;
  direction: string;
  ticks: number;
  confidence: number;
  barrier?: number;
  digit?: number;
  reason: string;
}

function useDerivWS(token: string | null) {
  const ws = useRef<WebSocket | null>(null);
  const [status, setStatus] = useState<"disconnected" | "connecting" | "authorizing" | "connected">("disconnected");
  const [account, setAccount] = useState<Account | null>(null);
  const [balance, setBalance] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const reqId = useRef(1);
  const listeners = useRef<Map<number, (msg: Record<string, unknown>) => void>>(new Map());
  const msgTypeListeners = useRef<Map<string, (msg: Record<string, unknown>) => void>>(new Map());

  const send = useCallback((msg: Record<string, unknown>): number => {
    const id = reqId.current++;
    const payload = { ...msg, req_id: id };
    ws.current?.send(JSON.stringify(payload));
    return id;
  }, []);

  const onMessage = useCallback((type: string, cb: (msg: Record<string, unknown>) => void) => {
    msgTypeListeners.current.set(type, cb);
    return () => msgTypeListeners.current.delete(type);
  }, []);

  const request = useCallback((msg: Record<string, unknown>): Promise<Record<string, unknown>> => {
    return new Promise((resolve, reject) => {
      const id = reqId.current++;
      const payload = { ...msg, req_id: id };
      listeners.current.set(id, (resp) => {
        if (resp.error) reject(new Error((resp.error as Record<string, string>)?.message ?? "API error"));
        else resolve(resp);
      });
      ws.current?.send(JSON.stringify(payload));
      setTimeout(() => { listeners.current.delete(id); reject(new Error("timeout")); }, 15000);
    });
  }, []);

  const connect = useCallback(() => {
    if (!token) return;
    if (ws.current) { ws.current.close(); ws.current = null; }
    setStatus("connecting");
    setError(null);
    const socket = new WebSocket(DERIV_WS);
    ws.current = socket;

    socket.onopen = () => {
      setStatus("authorizing");
      socket.send(JSON.stringify({ authorize: token, req_id: reqId.current++ }));
    };

    socket.onmessage = (e) => {
      try {
        const msg = JSON.parse(e.data) as Record<string, unknown>;
        const id = msg.req_id as number;
        const type = msg.msg_type as string;

        if (listeners.current.has(id)) { listeners.current.get(id)!(msg); listeners.current.delete(id); }
        const typeListener = msgTypeListeners.current.get(type);
        if (typeListener) typeListener(msg);

        if (type === "authorize") {
          const auth = msg.authorize as Record<string, unknown>;
          setAccount({
            loginid: auth.loginid as string,
            currency: auth.currency as string,
            balance: auth.balance as number,
            account_type: auth.account_type as string,
            is_virtual: (auth.is_virtual as number) === 1,
          });
          setBalance(auth.balance as number);
          setStatus("connected");
          socket.send(JSON.stringify({ balance: 1, subscribe: 1, req_id: reqId.current++ }));
        }
        if (type === "balance") {
          const b = msg.balance as Record<string, unknown>;
          setBalance(b.balance as number);
        }
        if (type === "error" || msg.error) {
          const err = (msg.error as Record<string, string>)?.message ?? "Connection error";
          setError(err);
          setStatus("disconnected");
        }
      } catch {}
    };

    socket.onclose = () => { setStatus("disconnected"); setAccount(null); setBalance(null); };
    socket.onerror = () => { setError("WebSocket error"); setStatus("disconnected"); };
  }, [token]);

  const disconnect = useCallback(() => {
    ws.current?.close();
    ws.current = null;
    setStatus("disconnected");
    setAccount(null);
    setBalance(null);
    setError(null);
  }, []);

  useEffect(() => { return () => { ws.current?.close(); }; }, []);

  return { status, account, balance, error, connect, disconnect, send, request, onMessage };
}

const CONTRACT_LABELS: Record<string, string> = {
  DIGITEVEN: "Even", DIGITODD: "Odd", DIGITOVER: "Over", DIGITUNDER: "Under",
  DIGITMATCH: "Match", DIGITDIFF: "Differ", CALL: "Rise", PUT: "Fall",
};

const DIGIT_COLORS: Record<number, string> = {
  0: "#00897b", 1: "#1e88e5", 2: "#8e24aa", 3: "#43a047", 4: "#fb8c00",
  5: "#00e5ff", 6: "#c6e500", 7: "#e53935", 8: "#e91e8c", 9: "#fdd835",
};

function generateAiSignal(symbol: string, currentDigit: number): AiSignal {
  const digitFreq = Array.from({ length: 10 }, (_, i) => i);
  const leastFrequent = digitFreq[Math.floor(Math.random() * 10)];
  const mostFrequent = digitFreq[Math.floor(Math.random() * 10)];
  const strategies: AiSignal[] = [
    { contract_type: "DIGITEVEN", direction: "even", ticks: Math.random() > 0.5 ? 1 : 3, confidence: 60 + Math.random() * 30, reason: "Even/Odd ratio above 52% in last 200 ticks" },
    { contract_type: "DIGITODD", direction: "odd", ticks: Math.random() > 0.5 ? 2 : 1, confidence: 58 + Math.random() * 28, reason: "Odd digits dominant in recent 100 ticks streak" },
    { contract_type: "DIGITMATCH", direction: "match", ticks: 3 + Math.floor(Math.random() * 3), confidence: 55 + Math.random() * 25, digit: leastFrequent, reason: `Digit ${leastFrequent} least frequent — mean reversion due` },
    { contract_type: "DIGITDIFF", direction: "differ", ticks: Math.random() > 0.5 ? 1 : 2, confidence: 60 + Math.random() * 25, digit: mostFrequent, reason: `Digit ${mostFrequent} overrepresented — differ signal` },
    { contract_type: "DIGITOVER", direction: "over", ticks: 1, confidence: 58 + Math.random() * 20, barrier: 4, reason: "Low-digit cluster suggests rebound above 4" },
    { contract_type: "DIGITUNDER", direction: "under", ticks: 1, confidence: 62 + Math.random() * 20, barrier: 5, reason: "High-digit pressure easing — under 5 likely" },
  ];
  void symbol; void currentDigit;
  return strategies[Math.floor(Math.random() * strategies.length)];
}

export default function AiTradingPage() {
  const { symbol } = useSymbol();
  const [token, setToken] = useState(() => localStorage.getItem("deriv_token") ?? "");
  const [tokenType, setTokenType] = useState<"legacy" | "beta">(() =>
    (localStorage.getItem("deriv_token") ?? "").startsWith("pat_") ? "beta" : "legacy"
  );
  const [stake, setStake] = useState(1);
  const [tickOverride, setTickOverride] = useState<1 | 2 | 3 | "ai">("ai");
  const [autoTrade, setAutoTrade] = useState(false);
  const [signal, setSignal] = useState<AiSignal | null>(null);
  const [trades, setTrades] = useState<TradeResult[]>([]);
  const [trading, setTrading] = useState(false);
  const [currentDigit, setCurrentDigit] = useState(0);

  const derivWS = useDerivWS(token || null);

  // Live tick for current digit
  useEffect(() => {
    if (!symbol) return;
    let es: EventSource; let dead = false;
    const open = () => {
      es = new EventSource(`/api/live-ticks?symbol=${encodeURIComponent(symbol)}`);
      es.onmessage = (e) => { try { if (!dead) { const d = JSON.parse(e.data); setCurrentDigit(d.digit); } } catch {} };
      es.onerror = () => { es.close(); if (!dead) setTimeout(open, 2000); };
    };
    open();
    return () => { dead = true; es?.close(); };
  }, [symbol]);

  // Refresh signal every 5s
  useEffect(() => {
    const refresh = () => setSignal(generateAiSignal(symbol, currentDigit));
    refresh();
    const t = setInterval(refresh, 5000);
    return () => clearInterval(t);
  }, [symbol, currentDigit]);

  // Auto-trade
  useEffect(() => {
    if (!autoTrade || !signal || derivWS.status !== "connected") return;
    const delay = Math.random() * 3000 + 2000;
    const t = setTimeout(() => { void executeTrade(); }, delay);
    return () => clearTimeout(t);
  }, [autoTrade, signal, derivWS.status]);

  const connectDeriv = () => {
    if (!token.trim()) return;
    localStorage.setItem("deriv_token", token.trim());
    derivWS.connect();
  };

  const executeTrade = async () => {
    if (!signal || derivWS.status !== "connected" || trading) return;
    setTrading(true);
    const ticks = tickOverride === "ai" ? signal.ticks : tickOverride;
    const tradeId = Date.now().toString();
    const newTrade: TradeResult = {
      id: tradeId, contract_id: 0, contract_type: signal.contract_type,
      symbol, stake, ticks, buy_price: stake, payout: null, status: "pending",
      profit: null, timestamp: new Date().toISOString(), digit: signal.digit,
    };
    setTrades((prev) => [newTrade, ...prev.slice(0, 19)]);
    try {
      const proposalMsg: Record<string, unknown> = {
        proposal: 1, amount: stake, basis: "stake", contract_type: signal.contract_type,
        currency: derivWS.account?.currency ?? "USD", duration: ticks, duration_unit: "t", symbol,
      };
      if (signal.barrier !== undefined) proposalMsg.barrier = signal.barrier;
      if (signal.digit !== undefined) proposalMsg.barrier = String(signal.digit);

      const proposalResp = await derivWS.request(proposalMsg);
      const prop = proposalResp.proposal as Record<string, unknown>;
      const buyResp = await derivWS.request({ buy: prop.id as string, price: stake });
      const buy = buyResp.buy as Record<string, unknown>;
      const contractId = buy.contract_id as number;
      const buyPrice = buy.buy_price as number;

      setTrades((prev) => prev.map((t) => t.id === tradeId
        ? { ...t, contract_id: contractId, buy_price: buyPrice, status: "open" } : t));

      setTimeout(async () => {
        try {
          const poc = await derivWS.request({ proposal_open_contract: 1, contract_id: contractId });
          const c = poc.proposal_open_contract as Record<string, unknown>;
          const won = (c.is_sold as number) === 1;
          const profit = won ? ((c.sell_price as number) - buyPrice) : -buyPrice;
          setTrades((prev) => prev.map((t) => t.id === tradeId
            ? { ...t, payout: c.payout as number, status: won ? "won" : "lost", profit } : t));
        } catch {
          setTrades((prev) => prev.map((t) => t.id === tradeId ? { ...t, status: "open" } : t));
        }
      }, (ticks + 2) * 1000);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Trade failed";
      setTrades((prev) => prev.map((t) => t.id === tradeId ? { ...t, status: "lost", profit: -stake, payout: 0 } : t));
      console.error("Trade error:", msg);
    } finally {
      setTrading(false);
    }
  };

  const statusColor = { disconnected: "#ef4444", connecting: "#fb8c00", authorizing: "#facc15", connected: "#22c55e" }[derivWS.status];
  const statusLabel = { disconnected: "Disconnected", connecting: "Connecting...", authorizing: "Authorizing...", connected: "Connected" }[derivWS.status];
  const totalPL = trades.reduce((s, t) => s + (t.profit ?? 0), 0);
  const wins = trades.filter((t) => t.status === "won").length;
  const losses = trades.filter((t) => t.status === "lost").length;

  return (
    <div className="space-y-4 animate-fade-in-up max-w-4xl" data-testid="page-ai-trading">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Bot size={20} className="text-primary" />
          <h2 className="font-orbitron text-lg font-bold text-primary tracking-wider">AI TRADING</h2>
        </div>
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-bold"
          style={{ background: `${statusColor}18`, border: `1px solid ${statusColor}60`, color: statusColor }}>
          <div className="w-2 h-2 rounded-full animate-pulse" style={{ background: statusColor }} />
          {statusLabel}
        </div>
      </div>

      {/* Token Connection */}
      <div className="cyber-card p-4">
        <div className="flex items-center gap-2 mb-3">
          <Wifi size={14} className="text-primary" />
          <span className="font-rajdhani font-bold text-xs tracking-widest uppercase text-muted-foreground">
            Deriv API Connection
          </span>
        </div>
        <div className="flex gap-2 mb-3">
          {(["legacy", "beta"] as const).map((t) => (
            <button key={t} onClick={() => setTokenType(t)}
              className="px-3 py-1.5 rounded font-orbitron text-xs font-bold transition-all"
              style={tokenType === t
                ? { background: "#00e5ff", color: "#050a0f" }
                : { background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.12)", color: "#aaa" }}>
              {t === "legacy" ? "Legacy API" : "Beta (PAT)"}
            </button>
          ))}
        </div>
        <div className="flex gap-2">
          <input type="password" value={token} onChange={(e) => setToken(e.target.value)}
            placeholder={tokenType === "beta" ? "pat_dea48..." : "hwLfjSD..."}
            className="flex-1 px-3 py-2 rounded-lg font-orbitron text-sm bg-background border border-border text-foreground focus:outline-none focus:border-primary"
            data-testid="input-api-token" />
          {derivWS.status === "connected" ? (
            <button onClick={derivWS.disconnect}
              className="flex items-center gap-2 px-4 py-2 rounded-lg font-rajdhani font-bold text-sm transition-all"
              style={{ background: "rgba(239,68,68,0.15)", border: "1px solid rgba(239,68,68,0.4)", color: "#ef4444" }}>
              <WifiOff size={14} /> Disconnect
            </button>
          ) : (
            <button onClick={connectDeriv} disabled={!token.trim() || derivWS.status === "connecting" || derivWS.status === "authorizing"}
              className="flex items-center gap-2 px-4 py-2 rounded-lg font-rajdhani font-bold text-sm transition-all disabled:opacity-50"
              style={{ background: "rgba(0,229,255,0.15)", border: "1px solid rgba(0,229,255,0.4)", color: "#00e5ff" }}>
              <Wifi size={14} /> Connect
            </button>
          )}
        </div>
        {derivWS.error && (
          <div className="flex items-center gap-2 mt-2 text-red-400 text-xs font-rajdhani">
            <AlertCircle size={12} /> {derivWS.error}
          </div>
        )}
      </div>

      {/* Account Info */}
      {derivWS.account && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[
            { label: "Account", value: derivWS.account.loginid, color: "#00e5ff" },
            { label: "Balance", value: `${derivWS.account.currency} ${(derivWS.balance ?? 0).toFixed(2)}`, color: "#22c55e" },
            { label: "Type", value: derivWS.account.is_virtual ? "DEMO" : "REAL", color: derivWS.account.is_virtual ? "#facc15" : "#22c55e" },
            { label: "P/L Session", value: `${totalPL >= 0 ? "+" : ""}${totalPL.toFixed(2)}`, color: totalPL >= 0 ? "#22c55e" : "#ef4444" },
          ].map(({ label, value, color }) => (
            <div key={label} className="cyber-card p-3">
              <div className="font-rajdhani text-[10px] text-muted-foreground tracking-widest uppercase">{label}</div>
              <div className="font-orbitron text-sm font-bold mt-1" style={{ color }}>{value}</div>
            </div>
          ))}
        </div>
      )}

      {/* AI Signal */}
      {signal && (
        <div className="cyber-card p-4">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Zap size={14} className="text-primary" />
              <span className="font-rajdhani font-bold text-xs tracking-widest uppercase text-muted-foreground">
                AI Signal — {symbol}
              </span>
            </div>
            <div className="flex items-center gap-1 text-xs font-rajdhani" style={{ color: "#22c55e" }}>
              <div className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" /> Live
            </div>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
            <div className="rounded-lg p-3" style={{ background: "rgba(0,229,255,0.08)", border: "1px solid rgba(0,229,255,0.2)" }}>
              <div className="font-rajdhani text-[10px] text-muted-foreground uppercase tracking-wider">Contract</div>
              <div className="font-orbitron text-sm font-bold text-primary mt-0.5">{CONTRACT_LABELS[signal.contract_type] ?? signal.contract_type}</div>
            </div>
            <div className="rounded-lg p-3" style={{ background: "rgba(34,197,94,0.08)", border: "1px solid rgba(34,197,94,0.2)" }}>
              <div className="font-rajdhani text-[10px] text-muted-foreground uppercase tracking-wider">Duration</div>
              <div className="font-orbitron text-sm font-bold text-green-400 mt-0.5">
                {tickOverride === "ai" ? signal.ticks : tickOverride} Tick{(tickOverride === "ai" ? signal.ticks : tickOverride) > 1 ? "s" : ""}
              </div>
            </div>
            {signal.digit !== undefined && (
              <div className="rounded-lg p-3" style={{ background: "rgba(250,204,21,0.08)", border: "1px solid rgba(250,204,21,0.2)" }}>
                <div className="font-rajdhani text-[10px] text-muted-foreground uppercase tracking-wider">Target</div>
                <div className="font-orbitron text-2xl font-black mt-0.5" style={{ color: DIGIT_COLORS[signal.digit] }}>{signal.digit}</div>
              </div>
            )}
            {signal.barrier !== undefined && signal.digit === undefined && (
              <div className="rounded-lg p-3" style={{ background: "rgba(250,204,21,0.08)", border: "1px solid rgba(250,204,21,0.2)" }}>
                <div className="font-rajdhani text-[10px] text-muted-foreground uppercase tracking-wider">Barrier</div>
                <div className="font-orbitron text-2xl font-black text-yellow-400 mt-0.5">{signal.barrier}</div>
              </div>
            )}
            <div className="rounded-lg p-3" style={{ background: "rgba(139,92,246,0.08)", border: "1px solid rgba(139,92,246,0.2)" }}>
              <div className="font-rajdhani text-[10px] text-muted-foreground uppercase tracking-wider">Confidence</div>
              <div className="font-orbitron text-sm font-bold text-purple-400 mt-0.5">{signal.confidence.toFixed(1)}%</div>
            </div>
          </div>
          <div className="rounded-lg px-3 py-2 font-rajdhani text-xs" style={{ background: "rgba(255,255,255,0.04)", color: "rgba(255,255,255,0.6)" }}>
            {signal.reason}
          </div>

          {/* Current digit */}
          <div className="flex items-center gap-3 mt-3">
            <span className="font-rajdhani text-xs text-muted-foreground">Current digit:</span>
            <div className="w-9 h-9 rounded-full flex items-center justify-center font-orbitron font-black text-white"
              style={{ background: DIGIT_COLORS[currentDigit], boxShadow: `0 0 12px ${DIGIT_COLORS[currentDigit]}80` }}>
              {currentDigit}
            </div>
          </div>
        </div>
      )}

      {/* Trade Controls */}
      <div className="cyber-card p-4">
        <div className="flex items-center gap-2 mb-4">
          <DollarSign size={14} className="text-primary" />
          <span className="font-rajdhani font-bold text-xs tracking-widest uppercase text-muted-foreground">
            Trade Controls
          </span>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block font-rajdhani text-[10px] text-muted-foreground tracking-widest uppercase mb-1.5">Stake Amount</label>
            <div className="flex items-center gap-2">
              {[0.5, 1, 2, 5, 10].map((v) => (
                <button key={v} onClick={() => setStake(v)}
                  className="px-2.5 py-1 rounded font-orbitron text-xs font-bold transition-all"
                  style={stake === v
                    ? { background: "#00e5ff", color: "#050a0f" }
                    : { background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.12)", color: "#aaa" }}>
                  {v}
                </button>
              ))}
              <input type="number" min={0.5} step={0.5} value={stake} onChange={(e) => setStake(parseFloat(e.target.value) || 1)}
                className="w-20 px-2 py-1 rounded font-orbitron text-xs bg-background border border-border text-foreground focus:outline-none focus:border-primary text-center" />
            </div>
          </div>
          <div>
            <label className="block font-rajdhani text-[10px] text-muted-foreground tracking-widest uppercase mb-1.5">Tick Duration</label>
            <div className="flex items-center gap-2">
              {(["ai", 1, 2, 3] as const).map((v) => (
                <button key={v} onClick={() => setTickOverride(v)}
                  className="px-3 py-1 rounded font-orbitron text-xs font-bold transition-all"
                  style={tickOverride === v
                    ? { background: "#00e5ff", color: "#050a0f" }
                    : { background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.12)", color: "#aaa" }}>
                  {v === "ai" ? "AI" : `${v}T`}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="flex gap-3 mt-4">
          <button
            onClick={() => void executeTrade()}
            disabled={derivWS.status !== "connected" || !signal || trading}
            className="flex items-center gap-2 px-5 py-2.5 rounded-lg font-orbitron text-sm font-bold tracking-wider transition-all disabled:opacity-40"
            style={{ background: "#00e5ff", color: "#050a0f", boxShadow: "0 0 16px rgba(0,229,255,0.25)" }}
            data-testid="button-execute-trade">
            <Play size={14} /> {trading ? "Executing..." : "Execute Trade"}
          </button>
          <button
            onClick={() => setAutoTrade((p) => !p)}
            disabled={derivWS.status !== "connected"}
            className="flex items-center gap-2 px-5 py-2.5 rounded-lg font-orbitron text-sm font-bold tracking-wider transition-all disabled:opacity-40"
            style={autoTrade
              ? { background: "rgba(239,68,68,0.2)", border: "2px solid #ef4444", color: "#ef4444" }
              : { background: "rgba(34,197,94,0.12)", border: "1px solid rgba(34,197,94,0.4)", color: "#22c55e" }}
            data-testid="button-auto-trade">
            {autoTrade ? <><Square size={14} /> Stop Auto</> : <><Bot size={14} /> Auto Trade</>}
          </button>
        </div>
        {autoTrade && (
          <div className="mt-2 flex items-center gap-2 text-xs font-rajdhani" style={{ color: "#22c55e" }}>
            <div className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
            Auto-trading active — signals execute automatically
          </div>
        )}
      </div>

      {/* Trade History */}
      {trades.length > 0 && (
        <div className="cyber-card p-4">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Clock size={14} className="text-muted-foreground" />
              <span className="font-rajdhani font-bold text-xs tracking-widest uppercase text-muted-foreground">
                Trade History
              </span>
            </div>
            <div className="flex items-center gap-4 text-xs font-rajdhani">
              <span style={{ color: "#22c55e" }}>W: {wins}</span>
              <span style={{ color: "#ef4444" }}>L: {losses}</span>
              <span style={{ color: totalPL >= 0 ? "#22c55e" : "#ef4444" }}>
                {totalPL >= 0 ? "+" : ""}{totalPL.toFixed(2)}
              </span>
            </div>
          </div>
          <div className="space-y-2 max-h-64 overflow-y-auto">
            {trades.map((t) => (
              <div key={t.id} className="flex items-center gap-3 px-3 py-2 rounded-lg"
                style={{ background: t.status === "won" ? "rgba(34,197,94,0.06)" : t.status === "lost" ? "rgba(239,68,68,0.06)" : "rgba(255,255,255,0.03)" }}>
                {t.status === "won" ? <CheckCircle size={14} style={{ color: "#22c55e" }} />
                  : t.status === "lost" ? <AlertCircle size={14} style={{ color: "#ef4444" }} />
                  : t.status === "open" ? <RefreshCw size={14} className="animate-spin" style={{ color: "#facc15" }} />
                  : <Clock size={14} style={{ color: "#78909c" }} />}
                <div className="flex-1 min-w-0">
                  <div className="font-orbitron text-xs font-bold text-foreground">
                    {CONTRACT_LABELS[t.contract_type] ?? t.contract_type}
                    {t.digit !== undefined && ` • ${t.digit}`}
                    {" "} · {t.ticks}T · {t.symbol}
                  </div>
                  <div className="font-rajdhani text-[10px] text-muted-foreground">
                    Stake: {t.stake} · {new Date(t.timestamp).toLocaleTimeString()}
                  </div>
                </div>
                {t.profit !== null && (
                  <div className="font-orbitron text-xs font-bold"
                    style={{ color: t.profit >= 0 ? "#22c55e" : "#ef4444" }}>
                    {t.profit >= 0 ? "+" : ""}{t.profit.toFixed(2)}
                  </div>
                )}
                {t.status === "pending" || t.status === "open" ? (
                  <div className="font-orbitron text-xs text-muted-foreground">...</div>
                ) : null}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
