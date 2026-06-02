import { useState, useEffect, useRef, useCallback } from "react";
import { useSymbol } from "@/context/SymbolContext";
import { useDerivContext } from "@/context/DerivContext";
import type { DerivAccountListItem } from "@/context/DerivContext";
import {
  executeBulk, nextStake, bulkGroupId,
  type TradeResult, type TradeSpec, MARKUP_PCT,
} from "@/lib/tradeEngine";
import DerivConnectionBar from "@/components/DerivConnectionBar";
import {
  Bot, DollarSign, Zap, Play, Square, AlertCircle,
  RefreshCw, TrendingUp, TrendingDown, SkipForward, User,
  Settings2, X, Shield, Loader, CheckCircle, XCircle,
  SlidersHorizontal, Filter, Clock, FlaskConical,
} from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────
interface AiSignal {
  contract_type: string;
  direction: string;
  ticks: number;
  confidence: number;
  barrier?: number;
  digit?: number;
  reasoning?: string;
  reason?: string;
  psych_favors_win?: boolean;
  psych_score?: number;
}

interface LogicCfg {
  minConfidence: number;
  allowedTypes: Set<string>;
  tickOverride: "ai" | 1 | 2 | 3 | 5 | 10;
  refreshMs: number;
  requirePsych: boolean;
  bulkCount: number;
}

// ─── Constants ────────────────────────────────────────────────────────────────
const CONTRACT_LABELS: Record<string, string> = {
  DIGITEVEN: "Even", DIGITODD: "Odd", DIGITOVER: "Over", DIGITUNDER: "Under",
  DIGITMATCH: "Match", DIGITDIFF: "Differ", CALL: "Rise", PUT: "Fall",
};
const ALL_CONTRACT_TYPES = [
  { id: "DIGITEVEN", label: "Even" }, { id: "DIGITODD", label: "Odd" },
  { id: "DIGITOVER", label: "Over" }, { id: "DIGITUNDER", label: "Under" },
  { id: "DIGITMATCH", label: "Match" }, { id: "DIGITDIFF", label: "Differ" },
  { id: "CALL", label: "Rise" }, { id: "PUT", label: "Fall" },
];
const DIGIT_COLORS: Record<number, string> = {
  0: "#00897b", 1: "#1e88e5", 2: "#8e24aa", 3: "#43a047", 4: "#fb8c00",
  5: "#00e5ff", 6: "#c6e500", 7: "#e53935", 8: "#e91e8c", 9: "#fdd835",
};

// ─── Live tick hook (SSE, doesn't need Deriv WS) ─────────────────────────────
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

// ─── AI Signal fetcher with configurable interval ────────────────────────────
function useAiSignal(symbol: string, intervalMs: number) {
  const [signals, setSignals] = useState<AiSignal[]>([]);
  useEffect(() => {
    if (!symbol) return;
    let dead = false;
    const fetch_ = () => {
      fetch(`/api/ai-signals?symbol=${encodeURIComponent(symbol)}`)
        .then((r) => r.json())
        .then((data: Record<string, unknown>) => {
          if (!dead) {
            const sigs = (data.signals as AiSignal[] | undefined) ?? [];
            setSignals(sigs.sort((a, b) => b.confidence - a.confidence));
          }
        })
        .catch(() => {});
    };
    fetch_();
    const t = setInterval(fetch_, intervalMs);
    return () => { dead = true; clearInterval(t); };
  }, [symbol, intervalMs]);
  return signals;
}

// ── Toggle switch helper ──────────────────────────────────────────────────────
function Toggle({ on, onChange, color = "#22c55e" }: { on: boolean; onChange: () => void; color?: string }) {
  return (
    <div className="w-9 rounded-full relative cursor-pointer flex-shrink-0 transition-all"
      style={{ background: on ? color : "rgba(255,255,255,0.15)", height: "18px" }}
      onClick={onChange}>
      <div className="w-3.5 h-3.5 rounded-full absolute top-[2px] bg-white transition-all"
        style={{ left: on ? "calc(100% - 16px)" : "2px" }} />
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function AiTradingPage() {
  const { symbol } = useSymbol();
  const deriv = useDerivContext();

  // ── Logic configuration ────────────────────────────────────────────────────
  const [logicCfg, setLogicCfg] = useState<LogicCfg>({
    minConfidence: 85,
    allowedTypes: new Set<string>(),    // empty = all allowed
    tickOverride: "ai",
    refreshMs: 6000,
    requirePsych: false,
    bulkCount: 1,
  });
  const [showLogic, setShowLogic] = useState(false);

  // ── Stake + Martingale ─────────────────────────────────────────────────────
  const [baseStake,    setBaseStake   ] = useState(1);
  const [martingaleOn, setMartingaleOn] = useState(false);
  const [martMult,     setMartMult    ] = useState(2);
  const [lossStreak,   setLossStreak  ] = useState(0);

  // ── TP / SL ───────────────────────────────────────────────────────────────
  const [tpEnabled, setTpEnabled] = useState(false);
  const [tpAmount,  setTpAmount ] = useState(10);
  const [slEnabled, setSlEnabled] = useState(false);
  const [slAmount,  setSlAmount ] = useState(5);
  const [sessionPL, setSessionPL] = useState(0);

  // ── Trade limit ───────────────────────────────────────────────────────────
  const [tradeLimit,     setTradeLimit    ] = useState(0);
  const [tradesExecuted, setTradesExecuted] = useState(0);

  // ── State ─────────────────────────────────────────────────────────────────
  const [autoTrade,  setAutoTrade ] = useState(false);
  const [executing,  setExecuting ] = useState(false);
  const [trades,     setTrades    ] = useState<TradeResult[]>([]);
  const [openContracts, setOpenContracts] = useState<number[]>([]);
  const [killActive, setKillActive] = useState(false);

  const lastAutoKeyRef = useRef("");
  const currentDigit = useLiveTick(symbol);
  const allSignals   = useAiSignal(symbol, logicCfg.refreshMs);

  // ── Apply logic filters to signals ────────────────────────────────────────
  const filteredSignals = allSignals.filter((s) => {
    if (s.confidence < logicCfg.minConfidence) return false;
    if (logicCfg.allowedTypes.size > 0 && !logicCfg.allowedTypes.has(s.contract_type)) return false;
    if (logicCfg.requirePsych && s.psych_favors_win === false) return false;
    return true;
  });
  const bestSignal = filteredSignals[0] ?? null;

  const currentStake = martingaleOn ? nextStake(baseStake, martMult, lossStreak) : baseStake;
  const tpHit    = tpEnabled && sessionPL >= tpAmount;
  const slHit    = slEnabled && sessionPL <= -slAmount;
  const limitHit = tradeLimit > 0 && tradesExecuted >= tradeLimit;
  const blocked  = tpHit || slHit || limitHit;

  const wins    = trades.filter((t) => t.status === "won").length;
  const losses  = trades.filter((t) => t.status === "lost").length;
  const total   = wins + losses;
  const winRate = total > 0 ? Math.round((wins / total) * 100) : 0;

  const updateTrade = useCallback((update: Partial<TradeResult> & { id: string }) => {
    setTrades((prev) => {
      const existing = prev.find((t) => t.id === update.id);
      if (!existing) return [update as TradeResult, ...prev.slice(0, 99)];
      return prev.map((t) => t.id === update.id ? { ...t, ...update } : t);
    });
    if (update.status === "open" && update.contract_id) {
      setOpenContracts((p) => [...new Set([...p, update.contract_id!])]);
    }
    if ((update.status === "won" || update.status === "lost" || update.status === "error") && update.contract_id) {
      setOpenContracts((p) => p.filter((id) => id !== update.contract_id));
    }
  }, []);

  // ── Execute trade(s) ───────────────────────────────────────────────────────
  async function executeTrade(signal: AiSignal) {
    if (deriv.status !== "connected" || executing || blocked) return;
    const currency = deriv.account?.currency ?? "USD";
    const groupId  = bulkGroupId();
    const count    = logicCfg.bulkCount;
    const ticks    = logicCfg.tickOverride === "ai" ? signal.ticks : logicCfg.tickOverride;
    const stake    = currentStake;

    setExecuting(true);
    const specs: TradeSpec[] = Array.from({ length: count }, (_, i) => ({
      contract_type: signal.contract_type,
      symbol,
      stake,
      ticks,
      barrier: signal.barrier,
      digit: signal.digit,
      label: `${CONTRACT_LABELS[signal.contract_type] ?? signal.contract_type}${count > 1 ? ` ×${i + 1}/${count}` : ""}`,
      confidence: signal.confidence,
      bulk_group: count > 1 ? groupId : undefined,
      bulk_index: i,
      bulk_total: count,
    }));

    try {
      const results = await executeBulk(specs, deriv.request, deriv.subscribe, currency, updateTrade);
      const profit = results.reduce((s, r) => s + (r.profit ?? 0), 0);
      setSessionPL((prev) => parseFloat((prev + profit).toFixed(2)));
      setTradesExecuted((prev) => prev + results.length);
      if (martingaleOn) {
        const anyLoss = results.some((r) => r.status === "lost" || r.status === "error");
        if (anyLoss) setLossStreak((s) => s + 1); else setLossStreak(0);
      }
    } catch {}
    setExecuting(false);
  }

  // ── Auto-trade trigger ─────────────────────────────────────────────────────
  useEffect(() => {
    if (!autoTrade || !bestSignal || deriv.status !== "connected" || executing || blocked) return;
    if (limitHit) { setAutoTrade(false); return; }
    const key = `${bestSignal.contract_type}-${bestSignal.confidence.toFixed(1)}`;
    if (key === lastAutoKeyRef.current) return;
    lastAutoKeyRef.current = key;
    const delay = 1200 + Math.random() * 1500;
    const t = setTimeout(() => { void executeTrade(bestSignal); }, delay);
    return () => clearTimeout(t);
  });

  // ── Kill switch — sell all open contracts ──────────────────────────────────
  const killSwitch = async () => {
    if (killActive || openContracts.length === 0) return;
    setKillActive(true);
    setAutoTrade(false);
    for (const cid of openContracts) {
      try { await deriv.request({ sell: cid, price: 0 }); } catch {}
    }
    setOpenContracts([]);
    setKillActive(false);
  };

  // ── Logic settings helpers ─────────────────────────────────────────────────
  function toggleType(id: string) {
    setLogicCfg((cfg) => {
      const s = new Set(cfg.allowedTypes);
      if (s.has(id)) s.delete(id); else s.add(id);
      return { ...cfg, allowedTypes: s };
    });
  }

  const confColor = !bestSignal ? "#888"
    : bestSignal.confidence >= 90 ? "#22c55e"
    : bestSignal.confidence >= 75 ? "#facc15"
    : "#ef4444";

  const statusColor = { disconnected: "#ef4444", connecting: "#fb8c00", authorizing: "#facc15", connected: "#22c55e" }[deriv.status];

  return (
    <div className="space-y-4 animate-fade-in-up max-w-4xl" data-testid="page-ai-trading">

      {/* ── Header ──────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <Bot size={20} className="text-primary" />
          <div>
            <h2 className="font-orbitron text-lg font-bold text-primary tracking-wider">AI TRADING</h2>
            <p className="font-rajdhani text-[10px] text-muted-foreground">
              ≥{logicCfg.minConfidence}% confidence gate · {logicCfg.refreshMs / 1000}s refresh · {MARKUP_PCT}% markup
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {deriv.status === "connected" && openContracts.length > 0 && (
            <button onClick={() => void killSwitch()} disabled={killActive}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-orbitron text-xs font-black animate-pulse"
              style={{ background: "rgba(239,68,68,0.2)", border: "2px solid #ef4444", color: "#ef4444" }}>
              <X size={12} /> KILL ({openContracts.length})
            </button>
          )}
          <button onClick={() => setShowLogic((p) => !p)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-rajdhani font-bold text-xs transition-all"
            style={showLogic
              ? { background: "rgba(0,229,255,0.15)", border: "1px solid rgba(0,229,255,0.4)", color: "#00e5ff" }
              : { background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.12)", color: "#888" }}>
            <SlidersHorizontal size={13} /> Logic
          </button>
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-bold"
            style={{ background: `${statusColor}18`, border: `1px solid ${statusColor}60`, color: statusColor }}>
            <div className="w-2 h-2 rounded-full animate-pulse" style={{ background: statusColor }} />
            {deriv.status === "connected" ? (deriv.account?.is_virtual ? "DEMO" : "REAL") : deriv.status}
          </div>
        </div>
      </div>

      {/* ── TP/SL / Limit Alert ─────────────────────────────────────────── */}
      {blocked && (
        <div className="rounded-xl p-3 flex items-center gap-3 border"
          style={{ background: tpHit ? "rgba(34,197,94,0.1)" : "rgba(239,68,68,0.1)", borderColor: tpHit ? "#22c55e" : "#ef4444" }}>
          <Shield size={16} style={{ color: tpHit ? "#22c55e" : "#ef4444" }} />
          <div className="font-rajdhani text-sm font-bold" style={{ color: tpHit ? "#22c55e" : "#ef4444" }}>
            {tpHit ? `✓ Take Profit +$${sessionPL.toFixed(2)} — auto-trade paused`
              : slHit ? `✗ Stop Loss -$${Math.abs(sessionPL).toFixed(2)} — auto-trade paused`
              : `Trade limit ${tradeLimit} reached — auto-trade paused`}
          </div>
          <button onClick={() => { setSessionPL(0); setLossStreak(0); setTradesExecuted(0); }}
            className="ml-auto px-2 py-1 rounded text-xs font-rajdhani font-bold"
            style={{ background: "rgba(255,255,255,0.1)", color: "#fff" }}>Reset</button>
        </div>
      )}

      {/* ── Deriv Connection Bar ────────────────────────────────────────── */}
      <DerivConnectionBar />

      {/* ── Account info ────────────────────────────────────────────────── */}
      {deriv.account && (
        <div className="cyber-card p-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-3">
            {[
              { label: "Account", value: deriv.account.loginid, color: "#00e5ff" },
              { label: "Balance", value: `${deriv.account.currency} ${(deriv.balance ?? 0).toFixed(2)}`, color: "#22c55e" },
              { label: "Type", value: deriv.account.is_virtual ? "DEMO" : "REAL", color: deriv.account.is_virtual ? "#facc15" : "#22c55e" },
              { label: "Session P/L", value: `${sessionPL >= 0 ? "+" : ""}$${sessionPL.toFixed(2)}`, color: sessionPL >= 0 ? "#22c55e" : "#ef4444" },
            ].map(({ label, value, color }) => (
              <div key={label} className="rounded-lg p-3" style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }}>
                <div className="font-rajdhani text-[10px] text-muted-foreground tracking-widest uppercase">{label}</div>
                <div className="font-orbitron text-sm font-bold mt-1" style={{ color }}>{value}</div>
              </div>
            ))}
          </div>
          {deriv.accountList.length > 1 && (
            <div className="flex flex-wrap gap-2">
              {deriv.accountList.map((acc: DerivAccountListItem) => (
                <button key={acc.loginid} onClick={() => deriv.switchAccount(acc)}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-rajdhani text-xs font-bold transition-all"
                  style={acc.loginid === deriv.account?.loginid
                    ? { background: "rgba(0,229,255,0.15)", border: "1px solid rgba(0,229,255,0.5)", color: "#00e5ff" }
                    : { background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.12)", color: "#888" }}>
                  <User size={10} /> {acc.loginid} · {acc.currency}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Logic Settings Panel ─────────────────────────────────────────── */}
      {showLogic && (
        <div className="cyber-card p-4 space-y-5" style={{ borderColor: "rgba(0,229,255,0.3)" }}>
          <div className="flex items-center gap-2">
            <FlaskConical size={14} className="text-primary" />
            <span className="font-rajdhani font-bold text-xs tracking-widest uppercase text-muted-foreground">Logic Settings</span>
            <span className="font-rajdhani text-[10px] text-muted-foreground ml-1">Customize analysis filters for this page</span>
          </div>

          {/* Confidence gate */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="font-rajdhani text-[10px] text-muted-foreground tracking-widest uppercase">
                Min Confidence Gate
              </label>
              <span className="font-orbitron text-sm font-bold text-primary">{logicCfg.minConfidence}%</span>
            </div>
            <input type="range" min={50} max={99} step={1} value={logicCfg.minConfidence}
              onChange={(e) => setLogicCfg((c) => ({ ...c, minConfidence: parseInt(e.target.value) }))}
              className="w-full accent-primary" />
            <div className="flex justify-between font-rajdhani text-[9px] text-muted-foreground mt-1">
              <span>50% (aggressive)</span><span>75% (balanced)</span><span>99% (ultra-safe)</span>
            </div>
            <div className="flex gap-2 mt-2">
              {[70, 80, 85, 90, 95].map((v) => (
                <button key={v} onClick={() => setLogicCfg((c) => ({ ...c, minConfidence: v }))}
                  className="px-2 py-1 rounded font-orbitron text-[10px] font-bold transition-all"
                  style={logicCfg.minConfidence === v
                    ? { background: "#00e5ff", color: "#050a0f" }
                    : { background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)", color: "#888" }}>
                  {v}%
                </button>
              ))}
            </div>
          </div>

          {/* Contract type whitelist */}
          <div>
            <div className="flex items-center gap-2 mb-2">
              <Filter size={11} className="text-muted-foreground" />
              <label className="font-rajdhani text-[10px] text-muted-foreground tracking-widest uppercase">
                Allowed Contract Types
              </label>
              <span className="font-rajdhani text-[10px] text-muted-foreground">
                ({logicCfg.allowedTypes.size === 0 ? "all" : `${logicCfg.allowedTypes.size} selected`})
              </span>
              {logicCfg.allowedTypes.size > 0 && (
                <button onClick={() => setLogicCfg((c) => ({ ...c, allowedTypes: new Set() }))}
                  className="ml-auto font-rajdhani text-[10px] text-muted-foreground hover:text-foreground underline">
                  Clear (all)
                </button>
              )}
            </div>
            <div className="flex flex-wrap gap-2">
              {ALL_CONTRACT_TYPES.map(({ id, label }) => {
                const active = logicCfg.allowedTypes.size === 0 || logicCfg.allowedTypes.has(id);
                return (
                  <button key={id} onClick={() => toggleType(id)}
                    className="px-2.5 py-1 rounded font-orbitron text-[10px] font-bold transition-all"
                    style={active
                      ? { background: "rgba(0,229,255,0.12)", border: "1px solid rgba(0,229,255,0.5)", color: "#00e5ff" }
                      : { background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)", color: "#555" }}>
                    {label}
                  </button>
                );
              })}
            </div>
            <div className="font-rajdhani text-[9px] text-muted-foreground mt-1">
              Deselect any type to block the AI from trading it. All selected = no filter.
            </div>
          </div>

          {/* Tick duration override */}
          <div>
            <label className="font-rajdhani text-[10px] text-muted-foreground tracking-widest uppercase block mb-2">
              Tick Duration Override
            </label>
            <div className="flex items-center gap-2">
              {(["ai", 1, 2, 3, 5, 10] as const).map((v) => (
                <button key={v} onClick={() => setLogicCfg((c) => ({ ...c, tickOverride: v }))}
                  className="px-3 py-1 rounded font-orbitron text-xs font-bold transition-all"
                  style={logicCfg.tickOverride === v
                    ? { background: "#00e5ff", color: "#050a0f" }
                    : { background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.12)", color: "#aaa" }}>
                  {v === "ai" ? "AI" : `${v}T`}
                </button>
              ))}
            </div>
          </div>

          {/* Bulk count */}
          <div>
            <label className="font-rajdhani text-[10px] text-muted-foreground tracking-widest uppercase block mb-2">
              Bulk Contracts · <span className="text-primary font-orbitron">{logicCfg.bulkCount}</span> per signal
            </label>
            <div className="flex items-center gap-2">
              {[1, 2, 3, 5, 10].map((v) => (
                <button key={v} onClick={() => setLogicCfg((c) => ({ ...c, bulkCount: v }))}
                  className="px-3 py-1 rounded font-orbitron text-xs font-bold transition-all"
                  style={logicCfg.bulkCount === v
                    ? { background: "#e91e8c", color: "#fff" }
                    : { background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.12)", color: "#aaa" }}>
                  ×{v}
                </button>
              ))}
              <input type="number" min={1} max={20} value={logicCfg.bulkCount}
                onChange={(e) => setLogicCfg((c) => ({ ...c, bulkCount: Math.max(1, parseInt(e.target.value) || 1) }))}
                className="w-14 px-2 py-1 rounded font-orbitron text-xs bg-background border border-border text-foreground focus:outline-none text-center" />
            </div>
          </div>

          {/* Signal refresh interval */}
          <div>
            <div className="flex items-center gap-2 mb-2">
              <Clock size={11} className="text-muted-foreground" />
              <label className="font-rajdhani text-[10px] text-muted-foreground tracking-widest uppercase">
                Signal Refresh Interval
              </label>
            </div>
            <div className="flex items-center gap-2">
              {[3000, 6000, 10000, 30000].map((v) => (
                <button key={v} onClick={() => setLogicCfg((c) => ({ ...c, refreshMs: v }))}
                  className="px-3 py-1 rounded font-orbitron text-xs font-bold transition-all"
                  style={logicCfg.refreshMs === v
                    ? { background: "#00e5ff", color: "#050a0f" }
                    : { background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.12)", color: "#aaa" }}>
                  {v / 1000}s
                </button>
              ))}
            </div>
          </div>

          {/* Psych filter */}
          <div className="flex items-center gap-3">
            <Toggle on={logicCfg.requirePsych} onChange={() => setLogicCfg((c) => ({ ...c, requirePsych: !c.requirePsych }))} color="#8e24aa" />
            <div>
              <span className="font-rajdhani text-xs font-bold" style={{ color: logicCfg.requirePsych ? "#a78bfa" : "#888" }}>
                Require Psychology Score Favorable
              </span>
              <div className="font-rajdhani text-[9px] text-muted-foreground">Only trade when psych analysis supports the signal direction</div>
            </div>
          </div>
        </div>
      )}

      {/* ── AI Signal display ────────────────────────────────────────────── */}
      {bestSignal ? (
        <div className="cyber-card p-4">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Zap size={14} className="text-primary" />
              <span className="font-rajdhani font-bold text-xs tracking-widest uppercase text-muted-foreground">
                Best Signal — {symbol}
              </span>
              <span className="font-rajdhani text-[10px] text-muted-foreground">
                ({filteredSignals.length} pass filter / {allSignals.length} total)
              </span>
            </div>
            <div className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-3">
            <div className="rounded-lg p-3" style={{ background: "rgba(0,229,255,0.08)", border: "1px solid rgba(0,229,255,0.2)" }}>
              <div className="font-rajdhani text-[10px] text-muted-foreground uppercase">Contract</div>
              <div className="font-orbitron text-sm font-bold text-primary mt-0.5">{CONTRACT_LABELS[bestSignal.contract_type] ?? bestSignal.contract_type}</div>
            </div>
            <div className="rounded-lg p-3" style={{ background: "rgba(34,197,94,0.08)", border: "1px solid rgba(34,197,94,0.2)" }}>
              <div className="font-rajdhani text-[10px] text-muted-foreground uppercase">Duration</div>
              <div className="font-orbitron text-sm font-bold text-green-400 mt-0.5">
                {logicCfg.tickOverride === "ai" ? bestSignal.ticks : logicCfg.tickOverride}T
              </div>
            </div>
            {bestSignal.digit !== undefined && (
              <div className="rounded-lg p-3" style={{ background: "rgba(250,204,21,0.08)", border: "1px solid rgba(250,204,21,0.2)" }}>
                <div className="font-rajdhani text-[10px] text-muted-foreground uppercase">Target</div>
                <div className="font-orbitron text-2xl font-black mt-0.5" style={{ color: DIGIT_COLORS[bestSignal.digit] }}>{bestSignal.digit}</div>
              </div>
            )}
            <div className="rounded-lg p-3" style={{ background: `${confColor}12`, border: `1px solid ${confColor}40` }}>
              <div className="font-rajdhani text-[10px] text-muted-foreground uppercase">Confidence</div>
              <div className="font-orbitron text-sm font-bold mt-0.5" style={{ color: confColor }}>{bestSignal.confidence.toFixed(1)}%</div>
              <div className="h-1 mt-1 rounded-full overflow-hidden" style={{ background: "rgba(255,255,255,0.1)" }}>
                <div className="h-full rounded-full transition-all" style={{ width: `${bestSignal.confidence}%`, background: confColor }} />
              </div>
            </div>
          </div>
          <div className="rounded-lg px-3 py-2 font-rajdhani text-xs flex items-center gap-2" style={{ background: "rgba(255,255,255,0.04)", color: "rgba(255,255,255,0.6)" }}>
            <div className="w-6 h-6 rounded-full flex items-center justify-center font-orbitron text-xs font-black flex-shrink-0 text-white" style={{ background: DIGIT_COLORS[currentDigit] }}>{currentDigit}</div>
            {bestSignal.reasoning ?? bestSignal.reason ?? "AI analysis"}
          </div>
          {/* Other passing signals */}
          {filteredSignals.length > 1 && (
            <div className="flex flex-wrap gap-1.5 mt-3 pt-3 border-t" style={{ borderColor: "rgba(255,255,255,0.06)" }}>
              {filteredSignals.slice(1, 5).map((s, i) => (
                <div key={i} className="flex items-center gap-1 px-2 py-1 rounded"
                  style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }}>
                  <span className="font-orbitron text-[10px] font-bold text-muted-foreground">{CONTRACT_LABELS[s.contract_type] ?? s.contract_type}</span>
                  <span className="font-rajdhani text-[9px]" style={{ color: "#888" }}>{s.confidence.toFixed(0)}%</span>
                </div>
              ))}
              {filteredSignals.length > 5 && (
                <span className="font-rajdhani text-[10px] text-muted-foreground px-2 py-1">+{filteredSignals.length - 5} more</span>
              )}
            </div>
          )}
        </div>
      ) : allSignals.length === 0 ? (
        <div className="cyber-card p-4 flex items-center gap-3">
          <RefreshCw size={14} className="animate-spin text-muted-foreground" />
          <span className="font-rajdhani text-sm text-muted-foreground">Loading AI signals for {symbol}…</span>
        </div>
      ) : (
        <div className="cyber-card p-4 flex items-center gap-3">
          <AlertCircle size={14} className="text-yellow-400" />
          <span className="font-rajdhani text-sm text-yellow-400">
            {allSignals.length} signals available — none pass ≥{logicCfg.minConfidence}% confidence gate
            {logicCfg.allowedTypes.size > 0 ? " + type filter" : ""}.
            <button onClick={() => setLogicCfg((c) => ({ ...c, minConfidence: Math.max(50, c.minConfidence - 5) }))}
              className="ml-2 underline text-primary">Lower threshold by 5%</button>
          </span>
        </div>
      )}

      {/* ── Trade Controls ───────────────────────────────────────────────── */}
      <div className="cyber-card p-4 space-y-4">
        <div className="flex items-center gap-2">
          <DollarSign size={14} className="text-primary" />
          <span className="font-rajdhani font-bold text-xs tracking-widest uppercase text-muted-foreground">Trade Controls</span>
          {martingaleOn && lossStreak > 0 && (
            <span className="px-2 py-0.5 rounded-full text-[9px] font-bold font-rajdhani" style={{ background: "rgba(250,204,21,0.15)", color: "#facc15", border: "1px solid rgba(250,204,21,0.3)" }}>
              Streak {lossStreak} → ${currentStake.toFixed(2)}
            </span>
          )}
        </div>

        {/* Stake */}
        <div>
          <label className="block font-rajdhani text-[10px] text-muted-foreground tracking-widest uppercase mb-1.5">
            Base Stake · <span className="text-primary font-orbitron">${currentStake.toFixed(2)}</span>
          </label>
          <div className="flex items-center gap-2 flex-wrap">
            {[0.5, 1, 2, 5, 10].map((v) => (
              <button key={v} onClick={() => { setBaseStake(v); setLossStreak(0); }}
                className="px-2.5 py-1 rounded font-orbitron text-xs font-bold transition-all"
                style={baseStake === v ? { background: "#00e5ff", color: "#050a0f" } : { background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.12)", color: "#aaa" }}>
                ${v}
              </button>
            ))}
            <input type="number" min={0.35} step={0.5} value={baseStake} onChange={(e) => { setBaseStake(parseFloat(e.target.value) || 1); setLossStreak(0); }}
              className="w-20 px-2 py-1 rounded font-orbitron text-xs bg-background border border-border text-foreground focus:outline-none focus:border-primary text-center" />
          </div>
        </div>

        {/* Martingale */}
        <div className="flex items-center gap-3 p-3 rounded-lg border" style={{ borderColor: "rgba(250,204,21,0.15)", background: "rgba(250,204,21,0.04)" }}>
          <Toggle on={martingaleOn} onChange={() => { setMartingaleOn((p) => !p); setLossStreak(0); }} color="#facc15" />
          <span className="font-rajdhani text-xs font-bold tracking-widest" style={{ color: martingaleOn ? "#facc15" : "#666" }}>
            MARTINGALE {martingaleOn ? "ON" : "OFF"}
          </span>
          {martingaleOn && (
            <>
              <div className="flex items-center gap-2 ml-auto">
                <span className="font-rajdhani text-[10px] text-muted-foreground">×</span>
                <input type="range" min={1.2} max={5} step={0.1} value={martMult}
                  onChange={(e) => setMartMult(parseFloat(e.target.value))}
                  className="w-24 accent-yellow-400" />
                <span className="font-orbitron text-xs font-bold text-yellow-400 w-8">{martMult.toFixed(1)}×</span>
              </div>
              <div className="flex gap-1">
                {[1.5, 2, 2.5, 3].map((v) => (
                  <button key={v} onClick={() => setMartMult(v)}
                    className="px-1.5 py-0.5 rounded font-orbitron text-[10px] font-bold"
                    style={Math.abs(martMult - v) < 0.05 ? { background: "#facc15", color: "#050a0f" } : { background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)", color: "#888" }}>
                    {v}×
                  </button>
                ))}
              </div>
            </>
          )}
        </div>

        {/* TP / SL */}
        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-lg p-2.5" style={{ background: "rgba(34,197,94,0.06)", border: "1px solid rgba(34,197,94,0.15)" }}>
            <div className="flex items-center gap-2 mb-2">
              <Toggle on={tpEnabled} onChange={() => setTpEnabled((p) => !p)} />
              <span className="font-rajdhani text-xs font-bold" style={{ color: tpEnabled ? "#22c55e" : "#888" }}>Take Profit</span>
            </div>
            {tpEnabled && (
              <div className="flex items-center gap-1.5">
                <TrendingUp size={12} className="text-green-400" />
                <input type="number" min={1} step={0.5} value={tpAmount} onChange={(e) => setTpAmount(parseFloat(e.target.value) || 10)}
                  className="w-20 px-2 py-1 rounded font-orbitron text-xs bg-background border border-border focus:outline-none text-center" />
                <span className="font-rajdhani text-[10px] text-muted-foreground">USD</span>
              </div>
            )}
          </div>
          <div className="rounded-lg p-2.5" style={{ background: "rgba(239,68,68,0.06)", border: "1px solid rgba(239,68,68,0.15)" }}>
            <div className="flex items-center gap-2 mb-2">
              <Toggle on={slEnabled} onChange={() => setSlEnabled((p) => !p)} color="#ef4444" />
              <span className="font-rajdhani text-xs font-bold" style={{ color: slEnabled ? "#ef4444" : "#888" }}>Stop Loss</span>
            </div>
            {slEnabled && (
              <div className="flex items-center gap-1.5">
                <TrendingDown size={12} className="text-red-400" />
                <input type="number" min={1} step={0.5} value={slAmount} onChange={(e) => setSlAmount(parseFloat(e.target.value) || 5)}
                  className="w-20 px-2 py-1 rounded font-orbitron text-xs bg-background border border-border focus:outline-none text-center" />
                <span className="font-rajdhani text-[10px] text-muted-foreground">USD</span>
              </div>
            )}
          </div>
        </div>

        {/* Trade Limit */}
        <div>
          <div className="font-rajdhani text-[10px] text-muted-foreground tracking-widest uppercase mb-1.5 flex items-center gap-2">
            Auto-Stop After N Trades
            {tradesExecuted > 0 && <span className="text-primary font-orbitron">{tradesExecuted}{tradeLimit > 0 ? `/${tradeLimit}` : ""}</span>}
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            {[0, 5, 10, 20, 50, 100].map((v) => (
              <button key={v} onClick={() => setTradeLimit(v)}
                className="px-2.5 py-1 rounded font-orbitron text-xs font-bold transition-all"
                style={tradeLimit === v ? { background: "#00e5ff", color: "#050a0f" } : { background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.12)", color: "#aaa" }}>
                {v === 0 ? "∞" : v}
              </button>
            ))}
            <input type="number" min={0} value={tradeLimit} onChange={(e) => setTradeLimit(Math.max(0, parseInt(e.target.value) || 0))}
              className="w-16 px-2 py-1 rounded font-orbitron text-xs bg-background border border-border focus:outline-none text-center" />
            {tradesExecuted > 0 && (
              <button onClick={() => { setTradesExecuted(0); setLossStreak(0); }}
                className="font-rajdhani text-[10px] text-muted-foreground hover:text-foreground underline">Reset</button>
            )}
          </div>
        </div>

        {/* Action buttons */}
        <div className="flex flex-wrap gap-3">
          <button onClick={() => bestSignal && void executeTrade(bestSignal)}
            disabled={deriv.status !== "connected" || !bestSignal || executing || blocked}
            className="flex items-center gap-2 px-5 py-2.5 rounded-lg font-orbitron text-sm font-bold tracking-wider transition-all disabled:opacity-40"
            style={{ background: "#00e5ff", color: "#050a0f", boxShadow: "0 0 16px rgba(0,229,255,0.25)" }}>
            {executing ? <Loader size={14} className="animate-spin" /> : <Play size={14} />}
            {executing ? "Executing…" : `Execute${logicCfg.bulkCount > 1 ? ` ×${logicCfg.bulkCount}` : ""}${bestSignal ? ` (${CONTRACT_LABELS[bestSignal.contract_type] ?? bestSignal.contract_type})` : ""}`}
          </button>
          <button onClick={() => setAutoTrade((p) => !p)}
            disabled={deriv.status !== "connected" || blocked}
            className="flex items-center gap-2 px-5 py-2.5 rounded-lg font-orbitron text-sm font-bold tracking-wider transition-all disabled:opacity-40"
            style={autoTrade
              ? { background: "rgba(239,68,68,0.2)", border: "2px solid #ef4444", color: "#ef4444" }
              : { background: "rgba(34,197,94,0.12)", border: "1px solid rgba(34,197,94,0.4)", color: "#22c55e" }}>
            {autoTrade ? <><Square size={14} /> Stop Auto</> : <><Bot size={14} /> Auto Trade</>}
          </button>
        </div>

        {autoTrade && (
          <div className="flex items-center gap-2 text-xs font-rajdhani" style={{ color: "#22c55e" }}>
            <div className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
            Auto-trading · ≥{logicCfg.minConfidence}% · {logicCfg.refreshMs / 1000}s refresh
            {logicCfg.bulkCount > 1 && <span>· ×{logicCfg.bulkCount} bulk</span>}
            {tradeLimit > 0 && <span className="text-muted-foreground">· {tradesExecuted}/{tradeLimit} trades</span>}
          </div>
        )}
      </div>

      {/* ── Session stats ─────────────────────────────────────────────────── */}
      {trades.length > 0 && (
        <div className="grid grid-cols-4 gap-3">
          {[
            { label: "Wins",      value: wins,    color: "#22c55e" },
            { label: "Losses",    value: losses,  color: "#ef4444" },
            { label: "Win Rate",  value: `${winRate}%`, color: winRate >= 60 ? "#22c55e" : winRate >= 45 ? "#facc15" : "#ef4444" },
            { label: "Session P/L", value: `${sessionPL >= 0 ? "+" : ""}$${sessionPL.toFixed(2)}`, color: sessionPL >= 0 ? "#22c55e" : "#ef4444" },
          ].map(({ label, value, color }) => (
            <div key={label} className="cyber-card p-3 text-center">
              <div className="font-rajdhani text-[10px] text-muted-foreground tracking-widest uppercase">{label}</div>
              <div className="font-orbitron text-lg font-black mt-1" style={{ color }}>{value}</div>
            </div>
          ))}
        </div>
      )}

      {/* ── Trade History ─────────────────────────────────────────────────── */}
      {trades.length > 0 && (
        <div className="cyber-card p-4">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <SkipForward size={14} className="text-primary" />
              <span className="font-rajdhani font-bold text-xs tracking-widest uppercase text-muted-foreground">Trade History</span>
            </div>
            <button onClick={() => setTrades([])} className="font-rajdhani text-[10px] text-muted-foreground hover:text-foreground transition-colors">clear</button>
          </div>
          <div className="space-y-1.5 max-h-72 overflow-y-auto">
            {trades.map((t) => (
              <div key={t.id} className="flex items-center gap-2 px-3 py-2 rounded-lg text-xs"
                style={{ background: t.status === "won" ? "rgba(34,197,94,0.08)" : t.status === "lost" ? "rgba(239,68,68,0.08)" : "rgba(255,255,255,0.03)" }}>
                {t.status === "pending" || t.status === "open" ? (
                  <Loader size={11} className="animate-spin text-muted-foreground flex-shrink-0" />
                ) : t.status === "won" ? (
                  <CheckCircle size={11} className="text-green-400 flex-shrink-0" />
                ) : t.status === "lost" ? (
                  <XCircle size={11} className="text-red-400 flex-shrink-0" />
                ) : (
                  <AlertCircle size={11} className="text-yellow-400 flex-shrink-0" />
                )}
                <span className="font-orbitron text-[10px] font-bold flex-1 truncate"
                  style={{ color: t.status === "won" ? "#22c55e" : t.status === "lost" ? "#ef4444" : "#aaa" }}>
                  {t.label}
                </span>
                {t.bulk_total && t.bulk_total > 1 && (
                  <span className="font-rajdhani text-[9px] text-pink-400">{(t.bulk_index ?? 0) + 1}/{t.bulk_total}</span>
                )}
                <span className="font-rajdhani text-[9px] text-muted-foreground">
                  ${t.stake.toFixed(2)} · {t.ticks}T
                  {t.entry_spot ? ` · e:${t.entry_spot}` : ""}
                  {t.exit_spot  ? ` x:${t.exit_spot}` : ""}
                </span>
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
  );
}
