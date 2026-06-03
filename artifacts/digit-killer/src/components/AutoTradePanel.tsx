/**
 * AutoTradePanel — rewritten to use DerivContext (shared WS connection),
 * accurate win/loss via proposal_open_contract subscription, bulk trade with
 * count, number of trades limit, and fully adjustable martingale.
 */
import { useState, useEffect, useRef, useCallback } from "react";
import {
  Bot, Play, Square, DollarSign, Zap, CheckCircle, XCircle,
  Loader, AlertCircle, ShieldCheck, X, Settings2, RefreshCw,
  SlidersHorizontal, Filter,
} from "lucide-react";
import { useDerivContext } from "@/context/DerivContext";
import { computeSmartTicks } from "@/lib/tickConfirmation";
import {
  executeBulk, nextStake, bulkGroupId,
  type TradeResult, type TradeSpec,
} from "@/lib/tradeEngine";

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

interface AutoTradePanelProps {
  signals: TradeSignal[];
  symbol: string;
  pageLabel?: string;
  /** Recent last-digit sequence (newest last) used for smart tick confirmation */
  recentDigits?: number[];
}

const DEFAULT_MIN_CONFIDENCE = 87;

export default function AutoTradePanel({ signals, symbol, pageLabel = "Page", recentDigits = [] }: AutoTradePanelProps) {
  const deriv = useDerivContext();

  const [open,          setOpen         ] = useState(false);
  const [showSettings,  setShowSettings ] = useState(false);
  const [showLogic,     setShowLogic    ] = useState(false);

  // ── Logic settings ──────────────────────────────────────────────────────────
  const [minConfidence,  setMinConfidence ] = useState(DEFAULT_MIN_CONFIDENCE);
  const [tickOverride,   setTickOverride  ] = useState<"signal" | 1 | 2 | 3 | 5 | 10>("signal");
  const [allowedTypes,   setAllowedTypes  ] = useState<Set<string>>(new Set());

  // ── Stake + Martingale ──────────────────────────────────────────────────────
  const [baseStake,    setBaseStake   ] = useState(1);
  const [martingaleOn, setMartingaleOn] = useState(false);
  const [martMult,     setMartMult    ] = useState(2);
  const [lossStreak,   setLossStreak  ] = useState(0);

  // ── Bulk count ──────────────────────────────────────────────────────────────
  const [bulkCount, setBulkCount] = useState(1);

  // ── Trade limit (auto-stop) ─────────────────────────────────────────────────
  const [tradeLimit,    setTradeLimit  ] = useState(0);   // 0 = unlimited
  const [tradesExecuted, setTradesExecuted] = useState(0);

  // ── TP / SL ─────────────────────────────────────────────────────────────────
  const [tpEnabled, setTpEnabled] = useState(false);
  const [tpAmount,  setTpAmount ] = useState(10);
  const [slEnabled, setSlEnabled] = useState(false);
  const [slAmount,  setSlAmount ] = useState(5);
  const [sessionPL, setSessionPL] = useState(0);

  // ── Auto mode ────────────────────────────────────────────────────────────────
  const [autoMode, setAutoMode] = useState(false);

  // ── Execution state ──────────────────────────────────────────────────────────
  const [executing,     setExecuting    ] = useState(false);
  const [trades,        setTrades       ] = useState<TradeResult[]>([]);

  const lastAutoKeyRef = useRef("");
  const currentStake   = martingaleOn ? nextStake(baseStake, martMult, lossStreak) : baseStake;
  const tpHit    = tpEnabled && sessionPL >= tpAmount;
  const slHit    = slEnabled && sessionPL <= -slAmount;
  const limitHit = tradeLimit > 0 && tradesExecuted >= tradeLimit;
  const blocked  = tpHit || slHit || limitHit;

  const readySignals = signals
    .filter((s) => {
      if (s.confidence < minConfidence) return false;
      if (s.psych_favors_win === false) return false;
      if (allowedTypes.size > 0 && !allowedTypes.has(s.contract_type)) return false;
      return true;
    })
    .sort((a, b) => b.confidence - a.confidence);
  const bestSignal = readySignals[0] ?? null;

  const wins   = trades.filter((t) => t.status === "won").length;
  const losses = trades.filter((t) => t.status === "lost").length;
  const total  = wins + losses;
  const wr     = total > 0 ? Math.round((wins / total) * 100) : 0;

  const updateTrade = useCallback((update: Partial<TradeResult> & { id: string }) => {
    setTrades((prev) => {
      const existing = prev.find((t) => t.id === update.id);
      if (!existing) return [update as TradeResult, ...prev.slice(0, 99)];
      return prev.map((t) => t.id === update.id ? { ...t, ...update } : t);
    });
  }, []);

  const applyResults = useCallback((results: TradeResult[]) => {
    const profit = results.reduce((sum, r) => sum + (r.profit ?? 0), 0);
    setSessionPL((prev) => parseFloat((prev + profit).toFixed(2)));
    setTradesExecuted((prev) => prev + results.length);

    if (martingaleOn) {
      const anyLoss = results.some((r) => r.status === "lost" || r.status === "error");
      if (anyLoss) setLossStreak((s) => s + 1);
      else setLossStreak(0);
    }
  }, [martingaleOn]);

  async function execute(sig: TradeSignal) {
    if (deriv.status !== "connected" || blocked || executing) return;
    const currency = deriv.account?.currency ?? "USD";
    const groupId  = bulkGroupId();
    const count    = Math.max(1, bulkCount);
    const stake    = currentStake;
    const ticks    = tickOverride === "signal"
      ? computeSmartTicks(sig.contract_type, sig.barrier, recentDigits)
      : tickOverride;

    setExecuting(true);
    const specs: TradeSpec[] = Array.from({ length: count }, (_, i) => ({
      contract_type: sig.contract_type,
      symbol,
      stake,
      ticks,
      barrier: sig.barrier,
      digit: sig.digit,
      label: count > 1 ? `${sig.label} ×${i + 1}/${count}` : sig.label,
      confidence: sig.confidence,
      bulk_group: groupId,
      bulk_index: i,
      bulk_total: count,
    }));

    try {
      const results = await executeBulk(specs, deriv.request, deriv.subscribe, currency, updateTrade);
      applyResults(results);
    } catch { /* individual trade errors are handled inside executeBulk */ }
    setExecuting(false);
  }

  async function handleExecuteBest() {
    if (!bestSignal) return;
    await execute(bestSignal);
  }

  async function handleBulkAll() {
    if (readySignals.length === 0 || executing || blocked || deriv.status !== "connected") return;
    const currency = deriv.account?.currency ?? "USD";
    const groupId  = bulkGroupId();
    const count    = Math.max(1, bulkCount);
    const stake    = currentStake;

    setExecuting(true);
    const specs: TradeSpec[] = readySignals.flatMap((sig) =>
      Array.from({ length: count }, (_, i) => ({
        contract_type: sig.contract_type,
        symbol,
        stake,
        ticks: tickOverride === "signal"
          ? computeSmartTicks(sig.contract_type, sig.barrier, recentDigits)
          : tickOverride,
        barrier: sig.barrier,
        digit: sig.digit,
        label: count > 1 ? `${sig.label} ×${i + 1}` : sig.label,
        confidence: sig.confidence,
        bulk_group: groupId,
        bulk_index: i,
        bulk_total: count,
      }))
    );

    try {
      const results = await executeBulk(specs, deriv.request, deriv.subscribe, currency, updateTrade);
      applyResults(results);
    } catch { /* handled inside */ }
    setExecuting(false);
  }

  // ── Auto mode: fire ALL ready signals whenever the set changes ───────────
  useEffect(() => {
    if (!autoMode || readySignals.length === 0 || deriv.status !== "connected" || executing || blocked) return;
    if (limitHit) { setAutoMode(false); return; }
    const key = readySignals
      .map((s) => `${s.contract_type}:${s.barrier ?? ""}:${s.confidence.toFixed(1)}`)
      .join("|");
    if (key === lastAutoKeyRef.current) return;
    lastAutoKeyRef.current = key;
    void handleBulkAll();
  });

  // ── Collapsed button ──────────────────────────────────────────────────────
  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="w-full flex items-center justify-center gap-2 py-3 rounded-xl font-orbitron text-sm font-bold tracking-wider transition-all border"
        style={{ background: "rgba(0,229,255,0.06)", borderColor: "rgba(0,229,255,0.3)", color: "#00e5ff" }}
      >
        <Bot size={16} /> AUTO TRADE — {pageLabel}
        {readySignals.length > 0 && (
          <span className="px-1.5 py-0.5 rounded font-orbitron text-[10px]" style={{ background: "#22c55e25", color: "#22c55e" }}>
            {readySignals.length} READY
          </span>
        )}
        {deriv.status === "connected" && (
          <span className="px-1.5 py-0.5 rounded font-rajdhani text-[10px]" style={{ background: "rgba(34,197,94,0.15)", color: "#22c55e" }}>
            {deriv.account?.is_virtual ? "DEMO" : "REAL"}
          </span>
        )}
      </button>
    );
  }

  return (
    <div className="rounded-xl border overflow-hidden" style={{ borderColor: "rgba(0,229,255,0.25)", background: "rgba(0,229,255,0.02)" }}>
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b" style={{ borderColor: "rgba(0,229,255,0.15)", background: "rgba(0,0,0,0.3)" }}>
        <div className="flex items-center gap-2 flex-wrap">
          <Bot size={15} className="text-primary" />
          <span className="font-orbitron text-sm font-bold text-primary tracking-wider">AUTO TRADE</span>
          <span className="font-rajdhani text-[10px] text-muted-foreground">· {pageLabel}</span>
          <span className="font-rajdhani text-[9px] px-1.5 py-0.5 rounded" style={{ background: "rgba(34,197,94,0.1)", color: "rgba(34,197,94,0.7)" }}>
            REAL P&amp;L
          </span>
          {limitHit && (
            <span className="font-rajdhani text-[9px] px-1.5 py-0.5 rounded" style={{ background: "rgba(239,68,68,0.15)", color: "#ef4444" }}>
              TRADE LIMIT HIT
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setShowLogic((p) => !p)} className="p-1 rounded hover:bg-white/10 transition-all" title="Logic Settings">
            <SlidersHorizontal size={13} className={showLogic ? "text-primary" : "text-muted-foreground"} />
          </button>
          <button onClick={() => setShowSettings((p) => !p)} className="p-1 rounded hover:bg-white/10 transition-all">
            <Settings2 size={13} className="text-muted-foreground" />
          </button>
          <button onClick={() => setOpen(false)} className="p-1 rounded hover:bg-white/10 transition-all">
            <X size={13} className="text-muted-foreground" />
          </button>
        </div>
      </div>

      <div className="p-4 space-y-4">

        {/* ── Logic Settings Panel ──────────────────────────────────────── */}
        {showLogic && (
          <div className="rounded-xl p-3 space-y-4 border" style={{ background: "rgba(0,0,0,0.3)", borderColor: "rgba(0,229,255,0.2)" }}>
            <div className="flex items-center gap-2">
              <SlidersHorizontal size={12} className="text-primary" />
              <span className="font-rajdhani font-bold text-[10px] tracking-widest uppercase text-muted-foreground">Logic Settings</span>
            </div>

            {/* Confidence gate */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="font-rajdhani text-[9px] text-muted-foreground tracking-widest uppercase">
                  Min Confidence Gate
                </label>
                <span className="font-orbitron text-xs font-bold text-primary">{minConfidence}%</span>
              </div>
              <input type="range" min={50} max={99} step={1} value={minConfidence}
                onChange={(e) => setMinConfidence(parseInt(e.target.value))}
                className="w-full accent-primary" />
              <div className="flex gap-1.5 mt-1.5">
                {[70, 80, 87, 90, 95].map((v) => (
                  <button key={v} onClick={() => setMinConfidence(v)}
                    className="px-2 py-0.5 rounded font-orbitron text-[9px] font-bold transition-all"
                    style={minConfidence === v
                      ? { background: "#00e5ff", color: "#050a0f" }
                      : { background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)", color: "#888" }}>
                    {v}%
                  </button>
                ))}
              </div>
            </div>

            {/* Tick override */}
            <div>
              <label className="font-rajdhani text-[9px] text-muted-foreground tracking-widest uppercase block mb-1.5">
                Tick Duration Override
              </label>
              <div className="flex flex-wrap gap-1.5">
                {(["signal", 1, 2, 3, 5, 10] as const).map((v) => (
                  <button key={v} onClick={() => setTickOverride(v)}
                    className="px-2.5 py-1 rounded font-orbitron text-[10px] font-bold transition-all"
                    style={tickOverride === v
                      ? { background: "#00e5ff", color: "#050a0f" }
                      : { background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", color: "#aaa" }}>
                    {v === "signal" ? "Signal" : `${v}T`}
                  </button>
                ))}
              </div>
            </div>

            {/* Contract type filter */}
            <div>
              <div className="flex items-center gap-2 mb-1.5">
                <Filter size={10} className="text-muted-foreground" />
                <label className="font-rajdhani text-[9px] text-muted-foreground tracking-widest uppercase">
                  Contract Type Filter
                </label>
                <span className="font-rajdhani text-[9px] text-muted-foreground">
                  ({allowedTypes.size === 0 ? "all" : `${allowedTypes.size} selected`})
                </span>
                {allowedTypes.size > 0 && (
                  <button onClick={() => setAllowedTypes(new Set())}
                    className="ml-auto font-rajdhani text-[9px] text-muted-foreground hover:text-foreground underline">
                    Clear (all)
                  </button>
                )}
              </div>
              <div className="flex flex-wrap gap-1.5">
                {[
                  { id: "DIGITEVEN", label: "Even" }, { id: "DIGITODD", label: "Odd" },
                  { id: "DIGITOVER", label: "Over" }, { id: "DIGITUNDER", label: "Under" },
                  { id: "DIGITMATCH", label: "Match" }, { id: "DIGITDIFF", label: "Differ" },
                  { id: "CALL", label: "Rise" }, { id: "PUT", label: "Fall" },
                ].map(({ id, label }) => {
                  const active = allowedTypes.size === 0 || allowedTypes.has(id);
                  return (
                    <button key={id}
                      onClick={() => {
                        const s = new Set(allowedTypes);
                        if (s.has(id)) s.delete(id); else s.add(id);
                        setAllowedTypes(s);
                      }}
                      className="px-2 py-0.5 rounded font-orbitron text-[9px] font-bold transition-all"
                      style={active
                        ? { background: "rgba(0,229,255,0.12)", border: "1px solid rgba(0,229,255,0.4)", color: "#00e5ff" }
                        : { background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)", color: "#555" }}>
                      {label}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {/* Not connected notice */}
        {deriv.status !== "connected" && (
          <div className="flex items-center gap-2 px-3 py-2 rounded-lg" style={{ background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.2)" }}>
            <AlertCircle size={12} className="text-red-400 flex-shrink-0" />
            <span className="font-rajdhani text-xs text-red-400">Connect your Deriv account above to enable trading.</span>
          </div>
        )}

        {/* Connected state */}
        {deriv.status === "connected" && (
          <>
            {/* ── Stake + Bulk + Martingale row ──────────────────────────────── */}
            <div className="grid grid-cols-2 gap-3">
              {/* Stake */}
              <div>
                <div className="font-rajdhani text-[10px] text-muted-foreground tracking-widest uppercase mb-1.5">
                  Stake · <span className="text-primary font-orbitron">${currentStake.toFixed(2)}</span>
                  {martingaleOn && lossStreak > 0 && <span className="ml-1 text-yellow-400">(streak {lossStreak})</span>}
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {[0.5, 1, 2, 5, 10].map((v) => (
                    <button key={v} onClick={() => { setBaseStake(v); setLossStreak(0); }}
                      className="px-2.5 py-1 rounded font-orbitron text-xs font-bold transition-all"
                      style={baseStake === v
                        ? { background: "#00e5ff", color: "#050a0f" }
                        : { background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.12)", color: "#aaa" }}>
                      ${v}
                    </button>
                  ))}
                  <input type="number" min={0.35} step={0.5} value={baseStake}
                    onChange={(e) => { setBaseStake(parseFloat(e.target.value) || 0.35); setLossStreak(0); }}
                    className="w-16 px-2 py-1 rounded font-orbitron text-xs bg-background border border-border text-foreground focus:outline-none focus:border-primary text-center" />
                </div>
              </div>

              {/* Bulk count */}
              <div>
                <div className="font-rajdhani text-[10px] text-muted-foreground tracking-widest uppercase mb-1.5">
                  Bulk Count · <span className="text-primary font-orbitron">{bulkCount}</span> contracts
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {[1, 2, 3, 5, 10].map((v) => (
                    <button key={v} onClick={() => setBulkCount(v)}
                      className="px-2.5 py-1 rounded font-orbitron text-xs font-bold transition-all"
                      style={bulkCount === v
                        ? { background: "#e91e8c", color: "#fff" }
                        : { background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.12)", color: "#aaa" }}>
                      ×{v}
                    </button>
                  ))}
                  <input type="number" min={1} max={20} value={bulkCount}
                    onChange={(e) => setBulkCount(Math.max(1, parseInt(e.target.value) || 1))}
                    className="w-14 px-2 py-1 rounded font-orbitron text-xs bg-background border border-border text-foreground focus:outline-none focus:border-primary text-center" />
                </div>
              </div>
            </div>

            {/* ── Martingale ─────────────────────────────────────────────────── */}
            <div className="flex items-center gap-4 p-3 rounded-lg border" style={{ borderColor: "rgba(250,204,21,0.15)", background: "rgba(250,204,21,0.04)" }}>
              <div className="w-9 h-4.5 rounded-full relative cursor-pointer flex-shrink-0"
                style={{ background: martingaleOn ? "#facc15" : "rgba(255,255,255,0.15)", height: "18px", width: "36px" }}
                onClick={() => { setMartingaleOn((p) => !p); setLossStreak(0); }}>
                <div className="w-3.5 h-3.5 rounded-full absolute top-[2px] transition-all bg-white"
                  style={{ left: martingaleOn ? "calc(100% - 16px)" : "2px" }} />
              </div>
              <span className="font-rajdhani text-xs font-bold tracking-widest" style={{ color: martingaleOn ? "#facc15" : "#666" }}>
                MARTINGALE {martingaleOn ? "ON" : "OFF"}
              </span>
              {martingaleOn && (
                <>
                  <div className="flex items-center gap-2 ml-auto">
                    <span className="font-rajdhani text-[10px] text-muted-foreground">Multiplier:</span>
                    <input type="range" min={1.2} max={5} step={0.1} value={martMult}
                      onChange={(e) => setMartMult(parseFloat(e.target.value))}
                      className="w-24 accent-yellow-400" />
                    <span className="font-orbitron text-xs font-bold text-yellow-400 w-8">{martMult.toFixed(1)}×</span>
                  </div>
                  <div className="flex gap-1">
                    {[1.5, 2, 2.5, 3].map((v) => (
                      <button key={v} onClick={() => setMartMult(v)}
                        className="px-1.5 py-0.5 rounded font-orbitron text-[10px] font-bold transition-all"
                        style={Math.abs(martMult - v) < 0.05
                          ? { background: "#facc15", color: "#050a0f" }
                          : { background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)", color: "#888" }}>
                        {v}×
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>

            {/* ── Settings: Trade Limit + TP/SL ─────────────────────────────── */}
            {showSettings && (
              <div className="space-y-3 p-3 rounded-lg border" style={{ borderColor: "rgba(255,255,255,0.08)", background: "rgba(0,0,0,0.2)" }}>
                {/* Trade limit */}
                <div>
                  <div className="font-rajdhani text-[10px] text-muted-foreground tracking-widest uppercase mb-1.5 flex items-center gap-2">
                    Auto-Stop After N Trades
                    {tradesExecuted > 0 && (
                      <span className="text-primary font-orbitron">{tradesExecuted}{tradeLimit > 0 ? `/${tradeLimit}` : ""} executed</span>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="flex gap-1.5 flex-wrap">
                      {[0, 5, 10, 20, 50, 100].map((v) => (
                        <button key={v} onClick={() => setTradeLimit(v)}
                          className="px-2.5 py-1 rounded font-orbitron text-xs font-bold transition-all"
                          style={tradeLimit === v
                            ? { background: "#00e5ff", color: "#050a0f" }
                            : { background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.12)", color: "#aaa" }}>
                          {v === 0 ? "∞" : v}
                        </button>
                      ))}
                      <input type="number" min={0} value={tradeLimit}
                        onChange={(e) => setTradeLimit(Math.max(0, parseInt(e.target.value) || 0))}
                        className="w-16 px-2 py-1 rounded font-orbitron text-xs bg-background border border-border text-foreground focus:outline-none focus:border-primary text-center" />
                    </div>
                    {tradesExecuted > 0 && (
                      <button onClick={() => { setTradesExecuted(0); setLossStreak(0); }}
                        className="flex items-center gap-1 px-2 py-1 rounded font-rajdhani text-[10px] text-muted-foreground hover:text-foreground transition-colors">
                        <RefreshCw size={10} /> Reset count
                      </button>
                    )}
                  </div>
                </div>

                {/* TP / SL */}
                <div className="grid grid-cols-2 gap-3">
                  <div className="rounded-lg p-2.5" style={{ background: "rgba(34,197,94,0.06)", border: "1px solid rgba(34,197,94,0.15)" }}>
                    <div className="flex items-center gap-2 mb-2">
                      <div className="w-7 h-3.5 rounded-full relative cursor-pointer flex-shrink-0"
                        style={{ background: tpEnabled ? "#22c55e" : "rgba(255,255,255,0.15)" }}
                        onClick={() => setTpEnabled((p) => !p)}>
                        <div className="w-2.5 h-2.5 rounded-full absolute top-[1px] bg-white transition-all" style={{ left: tpEnabled ? "calc(100% - 12px)" : "2px" }} />
                      </div>
                      <span className="font-rajdhani text-xs font-bold" style={{ color: tpEnabled ? "#22c55e" : "#888" }}>Take Profit</span>
                    </div>
                    {tpEnabled && (
                      <div className="flex items-center gap-1.5">
                        <input type="number" min={1} step={0.5} value={tpAmount} onChange={(e) => setTpAmount(parseFloat(e.target.value) || 10)}
                          className="w-20 px-2 py-1 rounded font-orbitron text-xs bg-background border border-border text-foreground focus:outline-none text-center" />
                        <span className="font-rajdhani text-[10px] text-muted-foreground">USD</span>
                      </div>
                    )}
                  </div>
                  <div className="rounded-lg p-2.5" style={{ background: "rgba(239,68,68,0.06)", border: "1px solid rgba(239,68,68,0.15)" }}>
                    <div className="flex items-center gap-2 mb-2">
                      <div className="w-7 h-3.5 rounded-full relative cursor-pointer flex-shrink-0"
                        style={{ background: slEnabled ? "#ef4444" : "rgba(255,255,255,0.15)" }}
                        onClick={() => setSlEnabled((p) => !p)}>
                        <div className="w-2.5 h-2.5 rounded-full absolute top-[1px] bg-white transition-all" style={{ left: slEnabled ? "calc(100% - 12px)" : "2px" }} />
                      </div>
                      <span className="font-rajdhani text-xs font-bold" style={{ color: slEnabled ? "#ef4444" : "#888" }}>Stop Loss</span>
                    </div>
                    {slEnabled && (
                      <div className="flex items-center gap-1.5">
                        <input type="number" min={1} step={0.5} value={slAmount} onChange={(e) => setSlAmount(parseFloat(e.target.value) || 5)}
                          className="w-20 px-2 py-1 rounded font-orbitron text-xs bg-background border border-border text-foreground focus:outline-none text-center" />
                        <span className="font-rajdhani text-[10px] text-muted-foreground">USD</span>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* ── Blocked / paused ──────────────────────────────────────────── */}
            {blocked && (
              <div className="flex items-center gap-2 p-3 rounded-lg" style={{ background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.3)" }}>
                <ShieldCheck size={14} className="text-red-400 flex-shrink-0" />
                <span className="font-rajdhani text-xs text-red-400 font-bold">
                  {tpHit ? `Take Profit hit (+$${tpAmount})` : slHit ? `Stop Loss hit (-$${slAmount})` : `Trade limit reached (${tradeLimit})`} — trading paused
                </span>
                <button onClick={() => { setSessionPL(0); setTradesExecuted(0); }}
                  className="ml-auto font-rajdhani text-[10px] text-muted-foreground hover:text-foreground underline">
                  Reset
                </button>
              </div>
            )}

            {/* ── Session stats ─────────────────────────────────────────────── */}
            {total > 0 && (
              <div className="grid grid-cols-4 gap-2">
                {[
                  { label: "WINS",   val: wins,    color: "#22c55e" },
                  { label: "LOSS",   val: losses,  color: "#ef4444" },
                  { label: "WIN%",   val: `${wr}%`, color: wr >= 60 ? "#22c55e" : wr >= 45 ? "#facc15" : "#ef4444" },
                  { label: "P/L",    val: `${sessionPL >= 0 ? "+" : ""}$${sessionPL.toFixed(2)}`, color: sessionPL >= 0 ? "#22c55e" : "#ef4444" },
                ].map(({ label, val, color }) => (
                  <div key={label} className="text-center p-2 rounded-lg" style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.07)" }}>
                    <div className="font-rajdhani text-[9px] text-muted-foreground tracking-widest">{label}</div>
                    <div className="font-orbitron text-sm font-bold" style={{ color }}>{val}</div>
                  </div>
                ))}
              </div>
            )}

            {/* ── Ready signals ─────────────────────────────────────────────── */}
            <div>
              <div className="font-rajdhani text-[10px] text-muted-foreground tracking-widest uppercase mb-2 flex items-center gap-2">
                <Zap size={10} className="text-primary" />
                READY SIGNALS ≥{minConfidence}%
                <span className="font-orbitron text-[10px]" style={{ color: readySignals.length > 0 ? "#22c55e" : "#888" }}>
                  ({readySignals.length})
                </span>
              </div>
              {readySignals.length === 0 ? (
                <div className="text-center py-2 font-rajdhani text-xs text-muted-foreground">
                  No signals meet confidence + psychology thresholds
                </div>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {readySignals.map((sig, i) => (
                    <div key={i} className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg"
                      style={{ background: "rgba(34,197,94,0.08)", border: "1px solid rgba(34,197,94,0.25)" }}>
                      <div className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
                      <span className="font-orbitron text-[10px] font-bold text-green-400">{sig.label}</span>
                      <span className="font-rajdhani text-[9px] text-muted-foreground">{sig.confidence.toFixed(0)}%</span>
                      {bulkCount > 1 && <span className="font-orbitron text-[9px] text-pink-400">×{bulkCount}</span>}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* ── Action buttons ─────────────────────────────────────────────── */}
            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => void handleExecuteBest()}
                disabled={!bestSignal || executing || blocked}
                className="flex items-center gap-2 px-4 py-2.5 rounded-lg font-orbitron text-xs font-bold tracking-wider transition-all disabled:opacity-40"
                style={{ background: "#00e5ff", color: "#050a0f", boxShadow: "0 0 12px rgba(0,229,255,0.2)" }}
              >
                {executing ? <Loader size={13} className="animate-spin" /> : <Play size={13} />}
                {executing ? "Executing…" : `Execute${bulkCount > 1 ? ` ×${bulkCount}` : ""}${bestSignal ? ` (${bestSignal.label})` : ""}`}
              </button>
              {readySignals.length > 1 && (
                <button
                  onClick={() => void handleBulkAll()}
                  disabled={executing || blocked}
                  className="flex items-center gap-2 px-4 py-2.5 rounded-lg font-orbitron text-xs font-bold tracking-wider transition-all disabled:opacity-40"
                  style={{ background: "rgba(233,30,140,0.12)", border: "1px solid rgba(233,30,140,0.4)", color: "#e91e8c" }}
                >
                  <Zap size={13} />
                  All Signals ({readySignals.length}{bulkCount > 1 ? ` ×${bulkCount}` : ""})
                </button>
              )}
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
              <div className="flex items-center gap-2 font-rajdhani text-xs" style={{ color: "#22c55e" }}>
                <div className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
                Auto-trading · ≥{minConfidence}% signals{bulkCount > 1 ? ` · ×${bulkCount} bulk` : ""}
                {tradeLimit > 0 && <span className="text-muted-foreground">· {tradesExecuted}/{tradeLimit} trades</span>}
              </div>
            )}
          </>
        )}

        {/* ── Trade log ─────────────────────────────────────────────────────── */}
        {trades.length > 0 && (
          <div>
            <div className="font-rajdhani text-[10px] text-muted-foreground tracking-widest uppercase mb-2 flex items-center justify-between">
              <span>TRADE LOG</span>
              <button onClick={() => setTrades([])} className="hover:text-foreground transition-colors">clear</button>
            </div>
            <div className="space-y-1 max-h-52 overflow-y-auto">
              {trades.map((t) => (
                <div key={t.id}
                  className="flex items-center gap-2 px-3 py-2 rounded-lg text-xs"
                  style={{
                    background: t.status === "won" ? "rgba(34,197,94,0.08)"
                      : t.status === "lost" ? "rgba(239,68,68,0.08)"
                      : "rgba(255,255,255,0.03)",
                  }}>
                  {(t.status === "pending" || t.status === "settling") ? (
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
                    <span className="font-rajdhani text-[9px] text-pink-400">{t.bulk_index! + 1}/{t.bulk_total}</span>
                  )}
                  <span className="font-rajdhani text-[9px] text-muted-foreground">
                    ${t.stake.toFixed(2)} · {t.ticks}T
                    {t.entry_spot ? ` · e:${t.entry_spot}` : ""}
                    {t.exit_spot  ? ` x:${t.exit_spot}` : ""}
                  </span>
                  <span className="font-orbitron text-[10px] font-bold flex-shrink-0"
                    style={{ color: t.profit != null ? (t.profit >= 0 ? "#22c55e" : "#ef4444") : "#888" }}>
                    {t.profit != null
                      ? `${t.profit >= 0 ? "+" : ""}$${t.profit.toFixed(2)}`
                      : t.status.toUpperCase()}
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
