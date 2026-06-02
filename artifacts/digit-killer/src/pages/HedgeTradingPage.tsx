/**
 * Hedge Trading Page — execute TWO different contract types simultaneously.
 * Each leg has its own contract type, stake, martingale multiplier, and
 * optional per-leg TP/SL. Combined session P&L is tracked in real time.
 *
 * Supported pairs: Even+Odd, Rise+Fall, Only Up+Only Down, High Tick+Low Tick,
 * Match+Differ, Over+Under (configurable)
 */
import { useState, useRef, useCallback, useEffect } from "react";
import {
  GitMerge, Play, Square, Bot, CheckCircle, XCircle, Loader,
  AlertCircle, ShieldCheck, DollarSign, Settings2, RefreshCw, X,
} from "lucide-react";
import { useSymbol } from "@/context/SymbolContext";
import { useDerivContext } from "@/context/DerivContext";
import DerivConnectionBar from "@/components/DerivConnectionBar";
import {
  executeBulk, nextStake, bulkGroupId,
  type TradeResult, type TradeSpec, MARKUP_PCT,
} from "@/lib/tradeEngine";

// ─── Contract type definitions ─────────────────────────────────────────────────
interface ContractOption {
  label: string;
  contract_type: string;
  barrier?: number | string;
  digit?: number;
  ticks: number;
}

const CONTRACT_GROUPS: { group: string; color: string; options: ContractOption[] }[] = [
  {
    group: "Even / Odd", color: "#00e5ff",
    options: [
      { label: "Even",   contract_type: "DIGITEVEN", ticks: 5 },
      { label: "Odd",    contract_type: "DIGITODD",  ticks: 5 },
    ],
  },
  {
    group: "Rise / Fall", color: "#22c55e",
    options: [
      { label: "Rise",   contract_type: "CALL", ticks: 5 },
      { label: "Fall",   contract_type: "PUT",  ticks: 5 },
    ],
  },
  {
    group: "Only Up / Down", color: "#a78bfa",
    options: [
      { label: "Only Up",   contract_type: "RUNHIGH", ticks: 5 },
      { label: "Only Down", contract_type: "RUNLOW",  ticks: 5 },
    ],
  },
  {
    group: "High / Low Tick", color: "#f59e0b",
    options: [
      { label: "High Tick", contract_type: "HIGHERTICK", barrier: 3, ticks: 5 },
      { label: "Low Tick",  contract_type: "LOWERTICK",  barrier: 3, ticks: 5 },
    ],
  },
  {
    group: "Over / Under", color: "#e91e8c",
    options: [
      { label: "Over 4",  contract_type: "DIGITOVER",  barrier: 4, ticks: 5 },
      { label: "Under 5", contract_type: "DIGITUNDER", barrier: 5, ticks: 5 },
    ],
  },
  {
    group: "Match / Differ", color: "#fb923c",
    options: [
      { label: "Match 7",  contract_type: "DIGITMATCH",  digit: 7, ticks: 5 },
      { label: "Differ 7", contract_type: "DIGITDIFF",   digit: 7, ticks: 5 },
    ],
  },
];

// ─── Leg component ─────────────────────────────────────────────────────────────
interface LegConfig {
  contract: ContractOption;
  stake: number;
  martingaleOn: boolean;
  martMult: number;
  lossStreak: number;
  ticks: number;
}

function LegCard({
  leg, label, color, allOptions, onChange,
}: {
  leg: LegConfig; label: string; color: string;
  allOptions: ContractOption[]; onChange: (l: Partial<LegConfig>) => void;
}) {
  const currentStake = leg.martingaleOn ? nextStake(leg.stake, leg.martMult, leg.lossStreak) : leg.stake;

  return (
    <div className="flex-1 min-w-0 rounded-xl border p-4 space-y-3"
      style={{ borderColor: `${color}40`, background: `${color}08` }}>
      <div className="flex items-center gap-2">
        <div className="w-2 h-2 rounded-full" style={{ background: color, boxShadow: `0 0 6px ${color}` }} />
        <span className="font-orbitron text-xs font-bold tracking-wider" style={{ color }}>{label}</span>
      </div>

      {/* Contract type */}
      <div>
        <div className="font-rajdhani text-[10px] text-muted-foreground tracking-widest uppercase mb-1.5">Contract Type</div>
        <div className="flex flex-wrap gap-1.5">
          {allOptions.map((opt) => (
            <button key={opt.contract_type}
              onClick={() => onChange({ contract: opt, ticks: opt.ticks })}
              className="px-2.5 py-1 rounded font-orbitron text-[10px] font-bold transition-all"
              style={leg.contract.contract_type === opt.contract_type
                ? { background: color, color: "#050a0f" }
                : { background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.12)", color: "#aaa" }}>
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* Ticks */}
      <div>
        <div className="font-rajdhani text-[10px] text-muted-foreground tracking-widest uppercase mb-1.5">
          Duration · <span style={{ color }} className="font-orbitron">{leg.ticks}T</span>
        </div>
        <div className="flex gap-1.5">
          {[1, 2, 3, 5, 10].map((v) => (
            <button key={v} onClick={() => onChange({ ticks: v })}
              className="px-2 py-1 rounded font-orbitron text-[10px] font-bold transition-all"
              style={leg.ticks === v
                ? { background: color, color: "#050a0f" }
                : { background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.12)", color: "#aaa" }}>
              {v}T
            </button>
          ))}
        </div>
      </div>

      {/* Stake */}
      <div>
        <div className="font-rajdhani text-[10px] text-muted-foreground tracking-widest uppercase mb-1.5">
          Stake · <span style={{ color }} className="font-orbitron">${currentStake.toFixed(2)}</span>
          {leg.martingaleOn && leg.lossStreak > 0 && <span className="ml-1 text-yellow-400">(streak {leg.lossStreak})</span>}
        </div>
        <div className="flex flex-wrap gap-1.5">
          {[0.5, 1, 2, 5].map((v) => (
            <button key={v} onClick={() => onChange({ stake: v, lossStreak: 0 })}
              className="px-2 py-1 rounded font-orbitron text-[10px] font-bold transition-all"
              style={leg.stake === v
                ? { background: color, color: "#050a0f" }
                : { background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.12)", color: "#aaa" }}>
              ${v}
            </button>
          ))}
          <input type="number" min={0.35} step={0.5} value={leg.stake}
            onChange={(e) => onChange({ stake: parseFloat(e.target.value) || 0.35, lossStreak: 0 })}
            className="w-14 px-2 py-1 rounded font-orbitron text-[10px] bg-background border border-border text-foreground focus:outline-none text-center" />
        </div>
      </div>

      {/* Martingale */}
      <div className="p-2 rounded-lg" style={{ background: "rgba(250,204,21,0.05)", border: "1px solid rgba(250,204,21,0.15)" }}>
        <div className="flex items-center gap-2 mb-2">
          <div className="cursor-pointer flex-shrink-0" style={{ width: 32, height: 16, background: leg.martingaleOn ? "#facc15" : "rgba(255,255,255,0.15)", borderRadius: 8, position: "relative" }}
            onClick={() => onChange({ martingaleOn: !leg.martingaleOn, lossStreak: 0 })}>
            <div style={{ width: 12, height: 12, background: "#fff", borderRadius: "50%", position: "absolute", top: 2, left: leg.martingaleOn ? 18 : 2, transition: "left .15s" }} />
          </div>
          <span className="font-rajdhani text-[10px] font-bold" style={{ color: leg.martingaleOn ? "#facc15" : "#666" }}>
            Martingale {leg.martingaleOn ? "ON" : "OFF"}
          </span>
        </div>
        {leg.martingaleOn && (
          <div className="flex items-center gap-2">
            <input type="range" min={1.2} max={5} step={0.1} value={leg.martMult}
              onChange={(e) => onChange({ martMult: parseFloat(e.target.value) })}
              className="flex-1 accent-yellow-400" />
            <span className="font-orbitron text-xs font-bold text-yellow-400 w-10">{leg.martMult.toFixed(1)}×</span>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Main page ─────────────────────────────────────────────────────────────────
export default function HedgeTradingPage() {
  const { symbol } = useSymbol();
  const deriv = useDerivContext();

  const [selectedGroup, setSelectedGroup] = useState(0);
  const group = CONTRACT_GROUPS[selectedGroup];

  const [legA, setLegA] = useState<LegConfig>({
    contract: group.options[0], stake: 1, martingaleOn: false, martMult: 2, lossStreak: 0, ticks: 5,
  });
  const [legB, setLegB] = useState<LegConfig>({
    contract: group.options[1], stake: 1, martingaleOn: false, martMult: 2, lossStreak: 0, ticks: 5,
  });

  // Sync legs when group changes
  useEffect(() => {
    const g = CONTRACT_GROUPS[selectedGroup];
    setLegA((p) => ({ ...p, contract: g.options[0], ticks: g.options[0].ticks }));
    setLegB((p) => ({ ...p, contract: g.options[1], ticks: g.options[1].ticks }));
  }, [selectedGroup]);

  // TP/SL shared
  const [tpEnabled, setTpEnabled] = useState(false);
  const [tpAmount,  setTpAmount ] = useState(10);
  const [slEnabled, setSlEnabled] = useState(false);
  const [slAmount,  setSlAmount ] = useState(5);
  const [sessionPL, setSessionPL] = useState(0);

  const [tradeLimit,     setTradeLimit    ] = useState(0);
  const [tradesExecuted, setTradesExecuted] = useState(0);
  const [autoMode,       setAutoMode      ] = useState(false);
  const [executing,      setExecuting     ] = useState(false);
  const [trades,         setTrades        ] = useState<TradeResult[]>([]);
  const [showSettings,   setShowSettings  ] = useState(false);

  const tpHit    = tpEnabled && sessionPL >= tpAmount;
  const slHit    = slEnabled && sessionPL <= -slAmount;
  const limitHit = tradeLimit > 0 && tradesExecuted >= tradeLimit;
  const blocked  = tpHit || slHit || limitHit;

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

  async function executeHedge() {
    if (deriv.status !== "connected" || blocked || executing) return;
    const currency = deriv.account?.currency ?? "USD";
    const gid = bulkGroupId();
    const stakeA = legA.martingaleOn ? nextStake(legA.stake, legA.martMult, legA.lossStreak) : legA.stake;
    const stakeB = legB.martingaleOn ? nextStake(legB.stake, legB.martMult, legB.lossStreak) : legB.stake;

    const specs: TradeSpec[] = [
      {
        contract_type: legA.contract.contract_type, symbol, stake: stakeA,
        ticks: legA.ticks, barrier: legA.contract.barrier, digit: legA.contract.digit,
        label: `A: ${legA.contract.label}`, confidence: 100, bulk_group: gid, bulk_index: 0, bulk_total: 2,
      },
      {
        contract_type: legB.contract.contract_type, symbol, stake: stakeB,
        ticks: legB.ticks, barrier: legB.contract.barrier, digit: legB.contract.digit,
        label: `B: ${legB.contract.label}`, confidence: 100, bulk_group: gid, bulk_index: 1, bulk_total: 2,
      },
    ];

    setExecuting(true);
    try {
      const results = await executeBulk(specs, deriv.request, deriv.subscribe, currency, updateTrade);
      const profit = results.reduce((s, r) => s + (r.profit ?? 0), 0);
      setSessionPL((p) => parseFloat((p + profit).toFixed(2)));
      setTradesExecuted((p) => p + 2);

      // Martingale per leg
      const [rA, rB] = results;
      if (legA.martingaleOn) {
        setLegA((p) => ({ ...p, lossStreak: rA.status === "lost" ? p.lossStreak + 1 : 0 }));
      }
      if (legB.martingaleOn) {
        setLegB((p) => ({ ...p, lossStreak: rB.status === "lost" ? p.lossStreak + 1 : 0 }));
      }
    } catch { /* individual errors handled inside */ }
    setExecuting(false);
  }

  // Auto mode — fire on interval
  const autoRef = useRef<ReturnType<typeof setInterval> | null>(null);
  useEffect(() => {
    if (!autoMode || deriv.status !== "connected" || blocked) {
      if (autoRef.current) { clearInterval(autoRef.current); autoRef.current = null; }
      return;
    }
    if (autoRef.current) return;
    autoRef.current = setInterval(() => {
      if (!executing && !blocked) void executeHedge();
    }, (Math.min(legA.ticks, legB.ticks) + 5) * 1000);
    return () => { if (autoRef.current) { clearInterval(autoRef.current); autoRef.current = null; } };
  }, [autoMode, deriv.status, blocked, executing, legA.ticks, legB.ticks]);

  return (
    <div className="space-y-4 max-w-5xl mx-auto">
      {/* Page header */}
      <div className="flex items-center gap-3">
        <div className="p-2.5 rounded-xl" style={{ background: "rgba(0,229,255,0.1)", border: "1px solid rgba(0,229,255,0.25)" }}>
          <GitMerge size={22} className="text-primary" />
        </div>
        <div>
          <h1 className="font-orbitron text-xl font-bold text-foreground tracking-wider">HEDGE TRADING</h1>
          <p className="font-rajdhani text-sm text-muted-foreground">
            Execute two contract types simultaneously · {MARKUP_PCT}% markup
          </p>
        </div>
      </div>

      {/* Deriv connection bar */}
      <DerivConnectionBar />

      {/* Contract group selector */}
      <div className="flex flex-wrap gap-2">
        {CONTRACT_GROUPS.map((g, i) => (
          <button key={g.group} onClick={() => setSelectedGroup(i)}
            className="px-3 py-1.5 rounded-lg font-orbitron text-[10px] font-bold tracking-wider transition-all border"
            style={selectedGroup === i
              ? { background: g.color, color: "#050a0f", borderColor: g.color }
              : { background: `${g.color}10`, borderColor: `${g.color}40`, color: g.color }}>
            {g.group}
          </button>
        ))}
      </div>

      {/* Two legs */}
      <div className="flex gap-4 flex-col md:flex-row">
        <LegCard
          leg={legA} label="LEG A" color={group.color}
          allOptions={group.options}
          onChange={(u) => setLegA((p) => ({ ...p, ...u }))}
        />
        <div className="flex items-center justify-center flex-shrink-0">
          <div className="w-px h-full bg-border hidden md:block" />
          <div className="w-8 h-8 rounded-full border flex items-center justify-center font-orbitron text-[10px] font-bold text-muted-foreground"
            style={{ borderColor: "rgba(0,229,255,0.25)", background: "rgba(0,229,255,0.06)" }}>
            VS
          </div>
        </div>
        <LegCard
          leg={legB} label="LEG B" color="#e91e8c"
          allOptions={group.options}
          onChange={(u) => setLegB((p) => ({ ...p, ...u }))}
        />
      </div>

      {/* Settings toggle */}
      <div className="flex items-center gap-2">
        <button onClick={() => setShowSettings((p) => !p)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-orbitron text-[10px] font-bold transition-all border"
          style={{ borderColor: "rgba(255,255,255,0.1)", color: showSettings ? "#00e5ff" : "#888" }}>
          <Settings2 size={11} /> Settings (TP/SL/Limit)
        </button>
      </div>

      {showSettings && (
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3 p-4 rounded-xl border" style={{ borderColor: "rgba(255,255,255,0.08)", background: "rgba(0,0,0,0.2)" }}>
          {/* Trade limit */}
          <div>
            <div className="font-rajdhani text-[10px] text-muted-foreground tracking-widest uppercase mb-1.5">
              Trade Limit · <span className="text-primary font-orbitron">{tradesExecuted}{tradeLimit > 0 ? `/${tradeLimit}` : ""}</span>
            </div>
            <div className="flex gap-1.5 flex-wrap">
              {[0, 10, 20, 50].map((v) => (
                <button key={v} onClick={() => setTradeLimit(v)}
                  className="px-2.5 py-1 rounded font-orbitron text-[10px] font-bold transition-all"
                  style={tradeLimit === v
                    ? { background: "#00e5ff", color: "#050a0f" }
                    : { background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.12)", color: "#aaa" }}>
                  {v === 0 ? "∞" : v}
                </button>
              ))}
            </div>
          </div>

          {/* Take Profit */}
          <div className="p-2.5 rounded-lg" style={{ background: "rgba(34,197,94,0.06)", border: "1px solid rgba(34,197,94,0.15)" }}>
            <div className="flex items-center gap-2 mb-2">
              <div className="cursor-pointer flex-shrink-0" style={{ width: 28, height: 14, background: tpEnabled ? "#22c55e" : "rgba(255,255,255,0.15)", borderRadius: 7, position: "relative" }}
                onClick={() => setTpEnabled((p) => !p)}>
                <div style={{ width: 10, height: 10, background: "#fff", borderRadius: "50%", position: "absolute", top: 2, left: tpEnabled ? 16 : 2, transition: "left .15s" }} />
              </div>
              <span className="font-rajdhani text-xs font-bold" style={{ color: tpEnabled ? "#22c55e" : "#888" }}>Take Profit</span>
            </div>
            {tpEnabled && (
              <div className="flex items-center gap-1.5">
                <input type="number" min={1} step={0.5} value={tpAmount} onChange={(e) => setTpAmount(parseFloat(e.target.value) || 10)}
                  className="w-20 px-2 py-1 rounded font-orbitron text-xs bg-background border border-border focus:outline-none text-center" />
                <span className="font-rajdhani text-[10px] text-muted-foreground">USD</span>
              </div>
            )}
          </div>

          {/* Stop Loss */}
          <div className="p-2.5 rounded-lg" style={{ background: "rgba(239,68,68,0.06)", border: "1px solid rgba(239,68,68,0.15)" }}>
            <div className="flex items-center gap-2 mb-2">
              <div className="cursor-pointer flex-shrink-0" style={{ width: 28, height: 14, background: slEnabled ? "#ef4444" : "rgba(255,255,255,0.15)", borderRadius: 7, position: "relative" }}
                onClick={() => setSlEnabled((p) => !p)}>
                <div style={{ width: 10, height: 10, background: "#fff", borderRadius: "50%", position: "absolute", top: 2, left: slEnabled ? 16 : 2, transition: "left .15s" }} />
              </div>
              <span className="font-rajdhani text-xs font-bold" style={{ color: slEnabled ? "#ef4444" : "#888" }}>Stop Loss</span>
            </div>
            {slEnabled && (
              <div className="flex items-center gap-1.5">
                <input type="number" min={1} step={0.5} value={slAmount} onChange={(e) => setSlAmount(parseFloat(e.target.value) || 5)}
                  className="w-20 px-2 py-1 rounded font-orbitron text-xs bg-background border border-border focus:outline-none text-center" />
                <span className="font-rajdhani text-[10px] text-muted-foreground">USD</span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* TP/SL/Limit hit */}
      {blocked && (
        <div className="flex items-center gap-2 p-3 rounded-lg" style={{ background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.3)" }}>
          <ShieldCheck size={14} className="text-red-400 flex-shrink-0" />
          <span className="font-rajdhani text-xs text-red-400 font-bold">
            {tpHit ? `Take Profit hit (+$${tpAmount})` : slHit ? `Stop Loss hit (-$${slAmount})` : `Trade limit reached (${tradeLimit})`} — paused
          </span>
          <button onClick={() => { setSessionPL(0); setTradesExecuted(0); setLegA((p) => ({ ...p, lossStreak: 0 })); setLegB((p) => ({ ...p, lossStreak: 0 })); }}
            className="ml-auto font-rajdhani text-[10px] text-muted-foreground hover:text-foreground underline">Reset</button>
        </div>
      )}

      {/* Session stats */}
      {total > 0 && (
        <div className="grid grid-cols-4 gap-2">
          {[
            { label: "WINS", val: wins, color: "#22c55e" },
            { label: "LOSS", val: losses, color: "#ef4444" },
            { label: "WIN%", val: `${wr}%`, color: wr >= 60 ? "#22c55e" : wr >= 45 ? "#facc15" : "#ef4444" },
            { label: "P/L",  val: `${sessionPL >= 0 ? "+" : ""}$${sessionPL.toFixed(2)}`, color: sessionPL >= 0 ? "#22c55e" : "#ef4444" },
          ].map(({ label, val, color }) => (
            <div key={label} className="text-center p-3 rounded-lg" style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.07)" }}>
              <div className="font-rajdhani text-[10px] text-muted-foreground tracking-widest">{label}</div>
              <div className="font-orbitron text-lg font-bold" style={{ color }}>{val}</div>
            </div>
          ))}
        </div>
      )}

      {/* Execute buttons */}
      <div className="flex flex-wrap gap-3">
        <button
          onClick={() => void executeHedge()}
          disabled={deriv.status !== "connected" || executing || blocked}
          className="flex items-center gap-2 px-6 py-3 rounded-xl font-orbitron text-sm font-bold tracking-wider transition-all disabled:opacity-40"
          style={{ background: "linear-gradient(135deg, #00e5ff, #e91e8c)", color: "#050a0f", boxShadow: "0 0 20px rgba(0,229,255,0.15)" }}>
          {executing ? <Loader size={16} className="animate-spin" /> : <Play size={16} />}
          {executing ? "Executing Hedge…" : `Execute Hedge (A+B) — ${group.group}`}
        </button>
        <button
          onClick={() => setAutoMode((p) => !p)}
          disabled={deriv.status !== "connected" || blocked}
          className="flex items-center gap-2 px-6 py-3 rounded-xl font-orbitron text-sm font-bold tracking-wider transition-all disabled:opacity-40"
          style={autoMode
            ? { background: "rgba(239,68,68,0.15)", border: "2px solid #ef4444", color: "#ef4444" }
            : { background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.15)", color: "#888" }}>
          {autoMode ? <><Square size={16} /> Stop Auto</> : <><Bot size={16} /> Auto Hedge</>}
        </button>
      </div>

      {autoMode && (
        <div className="flex items-center gap-2 font-rajdhani text-sm" style={{ color: "#22c55e" }}>
          <div className="w-2.5 h-2.5 rounded-full bg-green-400 animate-pulse" />
          Auto-hedging · fires every {Math.min(legA.ticks, legB.ticks) + 5}s
          {tradeLimit > 0 && <span className="text-muted-foreground ml-2">{tradesExecuted}/{tradeLimit} trades</span>}
        </div>
      )}

      {/* Trade log */}
      {trades.length > 0 && (
        <div className="rounded-xl border overflow-hidden" style={{ borderColor: "rgba(0,229,255,0.15)" }}>
          <div className="px-4 py-2.5 border-b flex items-center justify-between" style={{ borderColor: "rgba(0,229,255,0.1)", background: "rgba(0,0,0,0.25)" }}>
            <span className="font-orbitron text-xs font-bold text-primary tracking-wider">TRADE LOG · {trades.length} entries</span>
            <button onClick={() => setTrades([])} className="font-rajdhani text-[10px] text-muted-foreground hover:text-foreground transition-colors">clear</button>
          </div>
          <div className="max-h-64 overflow-y-auto divide-y" style={{ divideColor: "rgba(0,229,255,0.05)" }}>
            {trades.map((t) => (
              <div key={t.id} className="flex items-center gap-3 px-4 py-2.5"
                style={{ background: t.status === "won" ? "rgba(34,197,94,0.05)" : t.status === "lost" ? "rgba(239,68,68,0.05)" : "transparent" }}>
                {(t.status === "pending" || t.status === "open") ? (
                  <Loader size={12} className="animate-spin text-muted-foreground flex-shrink-0" />
                ) : t.status === "won" ? (
                  <CheckCircle size={12} className="text-green-400 flex-shrink-0" />
                ) : (
                  <XCircle size={12} className="text-red-400 flex-shrink-0" />
                )}
                <span className="font-orbitron text-xs font-bold flex-1"
                  style={{ color: t.status === "won" ? "#22c55e" : t.status === "lost" ? "#ef4444" : "#aaa" }}>
                  {t.label}
                </span>
                <span className="font-rajdhani text-[10px] text-muted-foreground">
                  ${t.stake.toFixed(2)} · {t.ticks}T
                  {t.entry_spot ? ` · entry: ${t.entry_spot}` : ""}
                  {t.exit_spot  ? ` · exit: ${t.exit_spot}` : ""}
                </span>
                <span className="font-orbitron text-xs font-bold flex-shrink-0 ml-2"
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
