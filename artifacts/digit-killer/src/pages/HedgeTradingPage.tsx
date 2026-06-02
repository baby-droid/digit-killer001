/**
 * Hedge Trading — execute two contract types simultaneously.
 * AI CONFIRM mode: fetches live signals for each leg before execution,
 * shows per-leg confidence, and auto-weights stakes by AI confidence ratio.
 * Combined session P&L tracked in real time with sparkline history.
 */
import { useState, useRef, useCallback, useEffect } from "react";
import {
  GitMerge, Play, Square, Bot, CheckCircle, XCircle, Loader,
  ShieldCheck, Settings2, Brain, ScanLine, TrendingUp, BarChart3,
  AlertTriangle, Zap,
} from "lucide-react";
import { useDerivContext } from "@/context/DerivContext";
import DerivConnectionBar from "@/components/DerivConnectionBar";
import {
  executeBulk, nextStake, bulkGroupId,
  type TradeResult, type TradeSpec,
} from "@/lib/tradeEngine";

// ── Contract groups ────────────────────────────────────────────────────────────
interface ContractOption {
  label: string; contract_type: string;
  barrier?: number | string; digit?: number; ticks: number;
}

const CONTRACT_GROUPS: { group: string; color: string; colorB: string; options: ContractOption[] }[] = [
  {
    group: "Even / Odd", color: "#00e5ff", colorB: "#a78bfa",
    options: [
      { label: "Even", contract_type: "DIGITEVEN", ticks: 5 },
      { label: "Odd",  contract_type: "DIGITODD",  ticks: 5 },
    ],
  },
  {
    group: "Rise / Fall", color: "#22c55e", colorB: "#ef4444",
    options: [
      { label: "Rise", contract_type: "CALL", ticks: 5 },
      { label: "Fall", contract_type: "PUT",  ticks: 5 },
    ],
  },
  {
    group: "Only Up / Down", color: "#4ade80", colorB: "#f87171",
    options: [
      { label: "Only Up",   contract_type: "RUNHIGH", ticks: 5 },
      { label: "Only Down", contract_type: "RUNLOW",  ticks: 5 },
    ],
  },
  {
    group: "High / Low Tick", color: "#fbbf24", colorB: "#60a5fa",
    options: [
      { label: "High Tick", contract_type: "HIGHERTICK", barrier: 3, ticks: 5 },
      { label: "Low Tick",  contract_type: "LOWERTICK",  barrier: 3, ticks: 5 },
    ],
  },
  {
    group: "Over / Under", color: "#f59e0b", colorB: "#e91e8c",
    options: [
      { label: "Over 4",  contract_type: "DIGITOVER",  barrier: 4, ticks: 5 },
      { label: "Under 5", contract_type: "DIGITUNDER", barrier: 5, ticks: 5 },
    ],
  },
  {
    group: "Match / Differ", color: "#22c55e", colorB: "#fb923c",
    options: [
      { label: "Match 7",  contract_type: "DIGITMATCH", digit: 7, ticks: 5 },
      { label: "Differ 7", contract_type: "DIGITDIFF",  digit: 7, ticks: 5 },
    ],
  },
];

// ── AI types ───────────────────────────────────────────────────────────────────
interface AiSignal {
  contract_type: string; confidence: number;
  barrier?: number; digit?: number; ticks?: number;
  strategy?: string; reason?: string; psych_favors_win?: boolean; psych_score?: number;
}

interface AiLegInfo {
  confidence: number; psych_score: number;
  favors_win: boolean; strategy: string; reason: string;
  found: boolean;
}

// ── Leg config ─────────────────────────────────────────────────────────────────
interface LegConfig {
  contract: ContractOption;
  stake: number; martingaleOn: boolean; martMult: number;
  lossStreak: number; ticks: number;
}

// ── P&L sparkline ──────────────────────────────────────────────────────────────
function PlSparkline({ trades }: { trades: TradeResult[] }) {
  const settled = trades.filter((t) => t.profit !== null).slice(-40);
  if (settled.length < 2) return null;
  let cum = 0;
  const points = settled.map((t) => { cum += t.profit ?? 0; return cum; });
  const min = Math.min(...points, 0);
  const max = Math.max(...points, 0);
  const range = max - min || 1;
  const W = 140; const H = 28;
  const toX = (i: number) => (i / (points.length - 1)) * W;
  const toY = (v: number) => H - ((v - min) / range) * H;
  const d = points.map((v, i) => `${i === 0 ? "M" : "L"}${toX(i).toFixed(1)},${toY(v).toFixed(1)}`).join(" ");
  const last = points[points.length - 1];
  const lineColor = last >= 0 ? "#22c55e" : "#ef4444";
  return (
    <svg width={W} height={H} style={{ overflow: "visible" }}>
      <line x1={0} y1={toY(0).toFixed(1)} x2={W} y2={toY(0).toFixed(1)} stroke="rgba(255,255,255,0.1)" strokeWidth={1} strokeDasharray="3,3" />
      <path d={d} fill="none" stroke={lineColor} strokeWidth={1.5} />
      <circle cx={toX(points.length - 1)} cy={toY(last)} r={2.5} fill={lineColor} />
    </svg>
  );
}

// ── Confidence bar ─────────────────────────────────────────────────────────────
function ConfBar({ value, color }: { value: number; color: string }) {
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1.5 rounded-full" style={{ background: "rgba(255,255,255,0.08)" }}>
        <div className="h-full rounded-full transition-all" style={{ width: `${value}%`, background: color }} />
      </div>
      <span className="font-orbitron text-[10px] font-bold w-8 text-right" style={{ color }}>{value.toFixed(0)}%</span>
    </div>
  );
}

// ── Leg card ───────────────────────────────────────────────────────────────────
function LegCard({
  leg, label, color, allOptions, aiInfo, aiConfirm, onChange,
}: {
  leg: LegConfig; label: string; color: string;
  allOptions: ContractOption[]; aiInfo?: AiLegInfo | null;
  aiConfirm: boolean; onChange: (l: Partial<LegConfig>) => void;
}) {
  const currentStake = leg.martingaleOn ? nextStake(leg.stake, leg.martMult, leg.lossStreak) : leg.stake;

  return (
    <div className="flex-1 min-w-0 rounded-xl border p-4 space-y-3"
      style={{ borderColor: `${color}40`, background: `${color}08` }}>
      <div className="flex items-center gap-2">
        <div className="w-2 h-2 rounded-full" style={{ background: color, boxShadow: `0 0 6px ${color}` }} />
        <span className="font-orbitron text-xs font-bold tracking-wider" style={{ color }}>{label}</span>
        {aiConfirm && aiInfo && (
          <span className="ml-auto px-1.5 py-0.5 rounded font-orbitron text-[8px] font-bold"
            style={{
              background: aiInfo.found ? (aiInfo.confidence >= 70 ? "rgba(34,197,94,0.2)" : "rgba(250,204,21,0.2)") : "rgba(255,255,255,0.08)",
              color: aiInfo.found ? (aiInfo.confidence >= 70 ? "#22c55e" : "#facc15") : "#666",
              border: `1px solid ${aiInfo.found ? (aiInfo.confidence >= 70 ? "rgba(34,197,94,0.3)" : "rgba(250,204,21,0.3)") : "rgba(255,255,255,0.1)"}`,
            }}>
            {aiInfo.found ? `AI ${aiInfo.confidence.toFixed(0)}%` : "no signal"}
          </span>
        )}
      </div>

      {/* AI confidence info */}
      {aiConfirm && aiInfo?.found && (
        <div className="p-2 rounded-lg space-y-1.5" style={{ background: "rgba(0,0,0,0.3)", border: "1px solid rgba(255,255,255,0.06)" }}>
          <ConfBar value={aiInfo.confidence} color={color} />
          <div className="flex items-center gap-1.5">
            {aiInfo.favors_win
              ? <CheckCircle size={9} className="text-green-400 flex-shrink-0" />
              : <AlertTriangle size={9} className="text-yellow-500 flex-shrink-0" />}
            <span className="font-rajdhani text-[9px] text-muted-foreground truncate">
              {aiInfo.strategy ?? ""}
            </span>
          </div>
          {aiInfo.psych_score > 0 && (
            <div className="font-rajdhani text-[9px] text-muted-foreground">
              ψ psych score: <span style={{ color }} className="font-bold">{aiInfo.psych_score.toFixed(0)}</span>
            </div>
          )}
        </div>
      )}

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
          <div className="cursor-pointer flex-shrink-0"
            style={{ width: 32, height: 16, background: leg.martingaleOn ? "#facc15" : "rgba(255,255,255,0.15)", borderRadius: 8, position: "relative" }}
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

// ── Market definitions (module-level) ──────────────────────────────────────────
const HEDGE_MARKETS = [
  { key: "R_10",     label: "V10",      group: "Volatility" },
  { key: "R_25",     label: "V25",      group: "Volatility" },
  { key: "R_50",     label: "V50",      group: "Volatility" },
  { key: "R_75",     label: "V75",      group: "Volatility" },
  { key: "R_100",    label: "V100",     group: "Volatility" },
  { key: "1HZ10V",   label: "V10 1s",  group: "Vol 1s" },
  { key: "1HZ25V",   label: "V25 1s",  group: "Vol 1s" },
  { key: "1HZ50V",   label: "V50 1s",  group: "Vol 1s" },
  { key: "1HZ75V",   label: "V75 1s",  group: "Vol 1s" },
  { key: "1HZ100V",  label: "V100 1s", group: "Vol 1s" },
  { key: "CRASH300N",label: "C300",    group: "Crash/Boom" },
  { key: "CRASH500", label: "C500",    group: "Crash/Boom" },
  { key: "CRASH1000",label: "C1000",   group: "Crash/Boom" },
  { key: "BOOM300N", label: "B300",    group: "Crash/Boom" },
  { key: "BOOM500",  label: "B500",    group: "Crash/Boom" },
  { key: "BOOM1000", label: "B1000",   group: "Crash/Boom" },
  { key: "JD10",     label: "Jump 10", group: "Jump" },
  { key: "JD25",     label: "Jump 25", group: "Jump" },
  { key: "JD50",     label: "Jump 50", group: "Jump" },
  { key: "JD75",     label: "Jump 75", group: "Jump" },
  { key: "JD100",    label: "Jump 100",group: "Jump" },
];

interface MarketScan {
  legA: AiLegInfo;
  legB: AiLegInfo;
}

function HedgeScanPanel({
  scans, markets, onExecute, colorA, colorB, labelA, labelB,
}: {
  scans: Record<string, MarketScan>;
  markets: string[];
  onExecute?: (mkt: string) => void;
  colorA: string; colorB: string; labelA: string; labelB: string;
}) {
  const ranked = markets
    .filter((m) => scans[m])
    .map((m) => {
      const sc = scans[m]!;
      return { key: m, label: HEDGE_MARKETS.find((x) => x.key === m)?.label ?? m, sc,
        combined: (sc.legA.confidence + sc.legB.confidence) / 2 };
    })
    .sort((a, b) => b.combined - a.combined);

  if (ranked.length === 0) return null;

  return (
    <div className="rounded-xl border overflow-hidden" style={{ borderColor: "rgba(0,229,255,0.2)" }}>
      <div className="px-3 py-2 flex items-center gap-2" style={{ background: "rgba(0,229,255,0.06)", borderBottom: "1px solid rgba(0,229,255,0.12)" }}>
        <ScanLine size={12} className="text-primary" />
        <span className="font-orbitron text-[10px] font-bold text-primary tracking-wider">MULTI-MARKET SCAN RESULTS</span>
        <span className="ml-auto font-rajdhani text-[9px] text-muted-foreground">{ranked.length} markets · sorted by combined confidence</span>
      </div>
      <div className="divide-y" style={{ borderColor: "rgba(255,255,255,0.04)" }}>
        {ranked.map(({ key, label, sc, combined }, idx) => (
          <div key={key} className="flex items-center gap-3 px-3 py-2 hover:bg-white/2 transition-colors">
            {/* Rank */}
            <div className="w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0"
              style={{ background: idx === 0 ? "#00e5ff" : "rgba(255,255,255,0.06)", color: idx === 0 ? "#050a0f" : "#888" }}>
              <span className="font-orbitron text-[8px] font-bold">{idx + 1}</span>
            </div>
            {/* Market label */}
            <span className="font-orbitron text-[10px] font-bold w-14 flex-shrink-0" style={{ color: idx === 0 ? "#00e5ff" : "#aaa" }}>{label}</span>
            {/* Leg A bar */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1 mb-0.5">
                <span className="font-rajdhani text-[8px] text-muted-foreground w-8">A</span>
                <div className="flex-1 h-1 rounded-full" style={{ background: "rgba(255,255,255,0.08)" }}>
                  <div className="h-full rounded-full" style={{ width: `${sc.legA.confidence}%`, background: colorA }} />
                </div>
                <span className="font-orbitron text-[8px] font-bold w-7 text-right" style={{ color: colorA }}>{sc.legA.confidence.toFixed(0)}%</span>
              </div>
              <div className="flex items-center gap-1">
                <span className="font-rajdhani text-[8px] text-muted-foreground w-8">B</span>
                <div className="flex-1 h-1 rounded-full" style={{ background: "rgba(255,255,255,0.08)" }}>
                  <div className="h-full rounded-full" style={{ width: `${sc.legB.confidence}%`, background: colorB }} />
                </div>
                <span className="font-orbitron text-[8px] font-bold w-7 text-right" style={{ color: colorB }}>{sc.legB.confidence.toFixed(0)}%</span>
              </div>
            </div>
            {/* Combined */}
            <div className="text-center flex-shrink-0 w-12">
              <div className="font-orbitron text-[10px] font-bold" style={{ color: combined >= 70 ? "#22c55e" : combined >= 55 ? "#facc15" : "#888" }}>
                {combined.toFixed(0)}%
              </div>
              <div className="font-rajdhani text-[8px] text-muted-foreground">avg</div>
            </div>
            {/* Best badge or execute */}
            {idx === 0 ? (
              <span className="px-1.5 py-0.5 rounded font-orbitron text-[8px] font-bold flex-shrink-0"
                style={{ background: "rgba(0,229,255,0.15)", border: "1px solid rgba(0,229,255,0.35)", color: "#00e5ff" }}>BEST</span>
            ) : onExecute ? (
              <button onClick={() => onExecute(key)}
                className="px-2 py-0.5 rounded font-orbitron text-[8px] font-bold transition-all flex-shrink-0"
                style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.12)", color: "#aaa" }}>
                USE
              </button>
            ) : <div className="w-10 flex-shrink-0" />}
          </div>
        ))}
      </div>
      <div className="px-3 py-1.5 text-center font-rajdhani text-[9px] text-muted-foreground" style={{ background: "rgba(0,0,0,0.2)" }}>
        {labelA} vs {labelB} · Best market auto-selected for execution
      </div>
    </div>
  );
}

// ── Main page ──────────────────────────────────────────────────────────────────
export default function HedgeTradingPage() {
  const deriv = useDerivContext();
  const [symbol, setHedgeSymbol] = useState("R_50");
  const [selectedGroup, setSelectedGroup] = useState(0);
  const group = CONTRACT_GROUPS[selectedGroup];

  const [legA, setLegA] = useState<LegConfig>({
    contract: group.options[0], stake: 1, martingaleOn: false, martMult: 2, lossStreak: 0, ticks: 5,
  });
  const [legB, setLegB] = useState<LegConfig>({
    contract: group.options[1], stake: 1, martingaleOn: false, martMult: 2, lossStreak: 0, ticks: 5,
  });

  useEffect(() => {
    const g = CONTRACT_GROUPS[selectedGroup];
    setLegA((p) => ({ ...p, contract: g.options[0], ticks: g.options[0].ticks }));
    setLegB((p) => ({ ...p, contract: g.options[1], ticks: g.options[1].ticks }));
  }, [selectedGroup]);

  // ── AI state ──────────────────────────────────────────────────────────────────
  const [aiConfirm,     setAiConfirm    ] = useState(false);
  const [aiStakeWeight, setAiStakeWeight] = useState(false);
  const [fetchingAI,    setFetchingAI   ] = useState(false);
  const [aiLegA,        setAiLegA       ] = useState<AiLegInfo | null>(null);
  const [aiLegB,        setAiLegB       ] = useState<AiLegInfo | null>(null);

  // ── Session ────────────────────────────────────────────────────────────────────
  const [tpEnabled,      setTpEnabled     ] = useState(false);
  const [tpAmount,       setTpAmount      ] = useState(10);
  const [slEnabled,      setSlEnabled     ] = useState(false);
  const [slAmount,       setSlAmount      ] = useState(5);
  const [sessionPL,      setSessionPL     ] = useState(0);
  const [tradeLimit,     setTradeLimit    ] = useState(0);
  const [tradesExecuted, setTradesExecuted] = useState(0);
  const [autoMode,       setAutoMode      ] = useState(false);
  const [executing,      setExecuting     ] = useState(false);
  const [trades,         setTrades        ] = useState<TradeResult[]>([]);
  const [showSettings,   setShowSettings  ] = useState(false);

  // ── Multi-market scanner ──────────────────────────────────────────────────────
  const [multiScan,       setMultiScan      ] = useState(false);
  const [scanMarkets,     setScanMarkets    ] = useState<string[]>(["R_10","R_25","R_50","R_75","R_100"]);
  const [marketScans,     setMarketScans    ] = useState<Record<string, MarketScan>>({});
  const [scanning,        setScanning       ] = useState(false);

  // ── 3-win cool-off ────────────────────────────────────────────────────────────
  const consecutiveWinsRef = useRef(0);
  const [coolingOff, setCoolingOff] = useState(false);

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
      if (!existing) return [update as TradeResult, ...prev.slice(0, 199)];
      return prev.map((t) => t.id === update.id ? { ...t, ...update } : t);
    });
  }, []);

  /** Find best matching signal from a list for a given contract */
  function findBestSignal(signals: AiSignal[], contract: ContractOption): AiLegInfo {
    const matches = signals.filter((s) => {
      if (s.contract_type !== contract.contract_type) return false;
      if (contract.barrier !== undefined && s.barrier !== undefined && String(s.barrier) !== String(contract.barrier)) return false;
      if (contract.digit !== undefined && s.digit !== undefined && s.digit !== contract.digit) return false;
      return true;
    });
    if (matches.length === 0) return { confidence: 50, psych_score: 50, favors_win: false, strategy: "", reason: "", found: false };
    const best = matches.reduce((a, b) => (b.confidence > a.confidence ? b : a));
    return {
      confidence: best.confidence, psych_score: best.psych_score ?? 50,
      favors_win: best.psych_favors_win ?? false,
      strategy: best.strategy ?? "", reason: best.reason ?? "", found: true,
    };
  }

  /** Fetch AI signals and compute per-leg confidence */
  async function fetchAiForLegs(): Promise<{ infoA: AiLegInfo; infoB: AiLegInfo }> {
    const res = await fetch(`/api/ai-signals?symbol=${symbol}`);
    if (!res.ok) throw new Error("AI signal fetch failed");
    const data = await res.json() as { signals?: AiSignal[]; all_signals?: AiSignal[] };
    const signals: AiSignal[] = [...(data.signals ?? []), ...(data.all_signals ?? [])];
    return {
      infoA: findBestSignal(signals, legA.contract),
      infoB: findBestSignal(signals, legB.contract),
    };
  }

  /** Multi-market scan: fetch signals for all selected markets in parallel */
  async function scanAllMarkets() {
    if (scanMarkets.length === 0 || scanning) return;
    setScanning(true);
    const results: Record<string, MarketScan> = {};
    await Promise.all(
      scanMarkets.map(async (mkt) => {
        try {
          const res = await fetch(`/api/ai-signals?symbol=${mkt}`);
          if (!res.ok) return;
          const data = await res.json() as { signals?: AiSignal[]; all_signals?: AiSignal[] };
          const signals: AiSignal[] = [...(data.signals ?? []), ...(data.all_signals ?? [])];
          results[mkt] = {
            legA: findBestSignal(signals, legA.contract),
            legB: findBestSignal(signals, legB.contract),
          };
        } catch { /* silently skip failed markets */ }
      })
    );
    setMarketScans(results);
    // Auto-select best market (highest combined confidence)
    const best = Object.entries(results)
      .map(([mkt, sc]) => ({ mkt, combined: (sc.legA.confidence + sc.legB.confidence) / 2 }))
      .sort((a, b) => b.combined - a.combined)[0];
    if (best) setHedgeSymbol(best.mkt);
    setScanning(false);
  }

  async function executeHedge() {
    if (deriv.status !== "connected" || blocked || executing) return;
    const currency = deriv.account?.currency ?? "USD";
    const gid = bulkGroupId();

    let stakeA = legA.martingaleOn ? nextStake(legA.stake, legA.martMult, legA.lossStreak) : legA.stake;
    let stakeB = legB.martingaleOn ? nextStake(legB.stake, legB.martMult, legB.lossStreak) : legB.stake;

    if (aiConfirm) {
      setFetchingAI(true);
      try {
        const { infoA, infoB } = await fetchAiForLegs();
        setAiLegA(infoA); setAiLegB(infoB);

        // Optional: auto-weight stakes by confidence ratio
        if (aiStakeWeight && infoA.found && infoB.found) {
          const total = infoA.confidence + infoB.confidence;
          const baseTotal = stakeA + stakeB;
          stakeA = parseFloat(((infoA.confidence / total) * baseTotal * 2).toFixed(2));
          stakeB = parseFloat(((infoB.confidence / total) * baseTotal * 2).toFixed(2));
          // Enforce Deriv minimum stake
          stakeA = Math.max(0.35, stakeA);
          stakeB = Math.max(0.35, stakeB);
        }
      } catch {
        setAiLegA(null); setAiLegB(null);
      }
      setFetchingAI(false);
    }

    const specs: TradeSpec[] = [
      {
        contract_type: legA.contract.contract_type, symbol, stake: stakeA,
        ticks: legA.ticks, barrier: legA.contract.barrier, digit: legA.contract.digit,
        label: `A: ${legA.contract.label}${aiConfirm && aiLegA?.found ? ` [AI ${aiLegA.confidence.toFixed(0)}%]` : ""}`,
        confidence: aiLegA?.confidence ?? 100, bulk_group: gid, bulk_index: 0, bulk_total: 2,
      },
      {
        contract_type: legB.contract.contract_type, symbol, stake: stakeB,
        ticks: legB.ticks, barrier: legB.contract.barrier, digit: legB.contract.digit,
        label: `B: ${legB.contract.label}${aiConfirm && aiLegB?.found ? ` [AI ${aiLegB.confidence.toFixed(0)}%]` : ""}`,
        confidence: aiLegB?.confidence ?? 100, bulk_group: gid, bulk_index: 1, bulk_total: 2,
      },
    ];

    setExecuting(true);
    try {
      const results = await executeBulk(specs, deriv.request, deriv.subscribe, currency, updateTrade);
      const profit = results.reduce((s, r) => s + (r.profit ?? 0), 0);
      setSessionPL((p) => parseFloat((p + profit).toFixed(2)));
      setTradesExecuted((p) => p + 2);

      const [rA, rB] = results;
      if (legA.martingaleOn) setLegA((p) => ({ ...p, lossStreak: rA?.status === "lost" ? p.lossStreak + 1 : 0 }));
      if (legB.martingaleOn) setLegB((p) => ({ ...p, lossStreak: rB?.status === "lost" ? p.lossStreak + 1 : 0 }));
      // ── 3-win cool-off ───────────────────────────────────────────────────────
      const allWon = results.every((r) => r.status === "won");
      if (allWon) {
        consecutiveWinsRef.current += 1;
        if (consecutiveWinsRef.current >= 3) {
          consecutiveWinsRef.current = 0;
          setCoolingOff(true);
          setTimeout(() => setCoolingOff(false), 2000);
        }
      } else {
        consecutiveWinsRef.current = 0;
      }
    } catch { /* individual errors handled inside executeBulk */ }
    setExecuting(false);
  }

  // ── Auto mode ──────────────────────────────────────────────────────────────────
  const autoRef = useRef<ReturnType<typeof setInterval> | null>(null);
  useEffect(() => {
    if (!autoMode || deriv.status !== "connected" || blocked) {
      if (autoRef.current) { clearInterval(autoRef.current); autoRef.current = null; }
      return;
    }
    if (autoRef.current) return;
    autoRef.current = setInterval(() => {
      if (!executing && !fetchingAI && !blocked && !coolingOff) void executeHedge();
    }, (Math.min(legA.ticks, legB.ticks) + 5) * 1000);
    return () => { if (autoRef.current) { clearInterval(autoRef.current); autoRef.current = null; } };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoMode, deriv.status, blocked, executing, fetchingAI, legA.ticks, legB.ticks]);

  const isBusy = executing || fetchingAI || scanning;

  return (
    <div className="space-y-4 max-w-5xl mx-auto">

      {/* ── Header ──────────────────────────────────────────────────────────── */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="p-2.5 rounded-xl" style={{ background: "rgba(0,229,255,0.1)", border: "1px solid rgba(0,229,255,0.25)" }}>
          <GitMerge size={22} className="text-primary" />
        </div>
        <div>
          <h1 className="font-orbitron text-xl font-bold text-foreground tracking-wider">HEDGE TRADING</h1>
          <p className="font-rajdhani text-sm text-muted-foreground">
            {aiConfirm ? "AI confirms signal strength per leg before each execution" : "Execute two contract types simultaneously · accurate real-time P&L"}
          </p>
        </div>
        {/* AI Confirm toggle */}
        <div className="ml-auto flex items-center gap-2">
          <button
            onClick={() => { setAiConfirm((p) => !p); setAiLegA(null); setAiLegB(null); }}
            className="flex items-center gap-2 px-3 py-1.5 rounded-lg font-orbitron text-[10px] font-bold transition-all border"
            style={aiConfirm
              ? { background: "rgba(0,229,255,0.15)", borderColor: "#00e5ff", color: "#00e5ff" }
              : { background: "rgba(255,255,255,0.04)", borderColor: "rgba(255,255,255,0.12)", color: "#888" }}>
            <Brain size={11} /> {aiConfirm ? "AI CONFIRM ON" : "AI CONFIRM OFF"}
          </button>
        </div>
      </div>

      <DerivConnectionBar />

      {/* ── AI Config panel ──────────────────────────────────────────────────── */}
      {aiConfirm && (
        <div className="rounded-xl border p-4 space-y-3" style={{ borderColor: "rgba(0,229,255,0.25)", background: "rgba(0,229,255,0.04)" }}>
          <div className="flex items-center gap-2">
            <Brain size={13} className="text-primary" />
            <span className="font-orbitron text-xs font-bold text-primary tracking-wider">AI HEDGE CONFIRM</span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <p className="font-rajdhani text-[10px] text-muted-foreground">
                Before each execution, the AI scans live signals for both legs and displays confidence scores. High confidence = green, medium = yellow.
              </p>
              {/* Auto stake weighting */}
              <div className="flex items-center gap-3 p-2.5 rounded-lg" style={{ background: "rgba(0,0,0,0.3)", border: "1px solid rgba(255,255,255,0.06)" }}>
                <div className="cursor-pointer flex-shrink-0"
                  style={{ width: 32, height: 16, background: aiStakeWeight ? "#00e5ff" : "rgba(255,255,255,0.15)", borderRadius: 8, position: "relative" }}
                  onClick={() => setAiStakeWeight((p) => !p)}>
                  <div style={{ width: 12, height: 12, background: "#fff", borderRadius: "50%", position: "absolute", top: 2, left: aiStakeWeight ? 18 : 2, transition: "left .15s" }} />
                </div>
                <div>
                  <div className="font-rajdhani text-[10px] font-bold" style={{ color: aiStakeWeight ? "#00e5ff" : "#666" }}>
                    AI Stake Weighting {aiStakeWeight ? "ON" : "OFF"}
                  </div>
                  <div className="font-rajdhani text-[9px] text-muted-foreground">
                    Distributes total stake proportionally to each leg's AI confidence
                  </div>
                </div>
              </div>
            </div>
            {/* Live AI confidence display */}
            {(aiLegA || aiLegB) && (
              <div className="p-3 rounded-lg space-y-2" style={{ background: "rgba(0,0,0,0.3)", border: "1px solid rgba(255,255,255,0.06)" }}>
                <div className="font-rajdhani text-[9px] text-muted-foreground tracking-widest uppercase">Last Scan Results</div>
                {aiLegA && (
                  <div className="space-y-0.5">
                    <div className="font-orbitron text-[9px] font-bold" style={{ color: group.color }}>LEG A · {legA.contract.label}</div>
                    <ConfBar value={aiLegA.confidence} color={group.color} />
                    {aiLegA.found && <div className="font-rajdhani text-[8px] text-muted-foreground truncate">{aiLegA.strategy}</div>}
                  </div>
                )}
                {aiLegB && (
                  <div className="space-y-0.5">
                    <div className="font-orbitron text-[9px] font-bold" style={{ color: group.colorB }}>LEG B · {legB.contract.label}</div>
                    <ConfBar value={aiLegB.confidence} color={group.colorB} />
                    {aiLegB.found && <div className="font-rajdhani text-[8px] text-muted-foreground truncate">{aiLegB.strategy}</div>}
                  </div>
                )}
                {aiLegA && aiLegB && aiLegA.found && aiLegB.found && (
                  <div className="pt-1 border-t" style={{ borderColor: "rgba(255,255,255,0.08)" }}>
                    <span className="font-rajdhani text-[9px] font-bold" style={{ color: aiLegA.confidence >= aiLegB.confidence ? group.color : group.colorB }}>
                      AI favors {aiLegA.confidence >= aiLegB.confidence ? "LEG A" : "LEG B"} ({Math.max(aiLegA.confidence, aiLegB.confidence).toFixed(0)}% vs {Math.min(aiLegA.confidence, aiLegB.confidence).toFixed(0)}%)
                    </span>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Market selector / Multi-market scanner ──────────────────────────── */}
      <div className="rounded-xl border p-3 space-y-3" style={{ borderColor: "rgba(0,229,255,0.2)", background: "rgba(0,229,255,0.02)" }}>
        <div className="flex items-center gap-2 flex-wrap">
          <div className="font-rajdhani text-[10px] text-muted-foreground tracking-widest uppercase">
            Market · <span className="font-orbitron text-primary font-bold">{HEDGE_MARKETS.find((m) => m.key === symbol)?.label ?? symbol}</span>
          </div>
          <div className="ml-auto flex items-center gap-2">
            {/* Multi-scan toggle */}
            <button
              onClick={() => { setMultiScan((p) => !p); setMarketScans({}); }}
              className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg font-orbitron text-[9px] font-bold transition-all border"
              style={multiScan
                ? { background: "rgba(0,229,255,0.15)", borderColor: "#00e5ff", color: "#00e5ff" }
                : { background: "rgba(255,255,255,0.04)", borderColor: "rgba(255,255,255,0.12)", color: "#666" }}>
              <ScanLine size={9} /> {multiScan ? "SCANNER ON" : "MULTI SCAN"}
            </button>
            {/* Scan button (visible when multiScan is on) */}
            {multiScan && (
              <button
                onClick={() => void scanAllMarkets()}
                disabled={scanning || scanMarkets.length === 0}
                className="flex items-center gap-1.5 px-3 py-1 rounded-lg font-orbitron text-[9px] font-bold transition-all disabled:opacity-50"
                style={{ background: "rgba(0,229,255,0.12)", border: "1px solid rgba(0,229,255,0.35)", color: "#00e5ff" }}>
                {scanning ? <><Loader size={9} className="animate-spin" /> Scanning…</> : <><Zap size={9} /> Scan {scanMarkets.length} Markets</>}
              </button>
            )}
          </div>
        </div>

        {/* Single market selector — always visible */}
        <div className="flex flex-wrap gap-1.5">
          {HEDGE_MARKETS.map(({ key: k, label: l }) => (
            <button key={k} onClick={() => { setHedgeSymbol(k); setAiLegA(null); setAiLegB(null); }}
              className="px-2.5 py-1 rounded font-orbitron text-[9px] font-bold tracking-wider transition-all"
              style={symbol === k
                ? { background: "#00e5ff", color: "#050a0f" }
                : { background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", color: "rgba(255,255,255,0.55)" }}>
              {l}
            </button>
          ))}
        </div>

        {/* Multi-market scanner — additional panel when MULTI SCAN is ON */}
        {multiScan && (
          <div className="pt-2 border-t space-y-2" style={{ borderColor: "rgba(0,229,255,0.15)" }}>
            <div className="flex items-center gap-2">
              <span className="font-rajdhani text-[9px] text-muted-foreground tracking-widest uppercase">Scanner markets:</span>
              <button onClick={() => setScanMarkets(HEDGE_MARKETS.slice(0, 5).map((m) => m.key))}
                className="font-rajdhani text-[9px] text-primary hover:underline">Vol only</button>
              <button onClick={() => setScanMarkets(HEDGE_MARKETS.map((m) => m.key))}
                className="font-rajdhani text-[9px] text-primary hover:underline">All</button>
              <button onClick={() => setScanMarkets([])}
                className="font-rajdhani text-[9px] text-muted-foreground hover:underline">Clear</button>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {HEDGE_MARKETS.map(({ key: k, label: l }) => {
                const inScan = scanMarkets.includes(k);
                const sc = marketScans[k];
                const combined = sc ? (sc.legA.confidence + sc.legB.confidence) / 2 : null;
                return (
                  <button key={k}
                    onClick={() => setScanMarkets((p) => inScan ? p.filter((x) => x !== k) : [...p, k])}
                    className="px-2.5 py-1 rounded font-orbitron text-[9px] font-bold tracking-wider transition-all relative"
                    style={inScan
                      ? { background: "rgba(0,229,255,0.15)", border: `1px solid ${combined !== null ? (combined >= 70 ? "#22c55e" : combined >= 55 ? "#facc15" : "#00e5ff") : "#00e5ff"}`, color: "#00e5ff" }
                      : { background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", color: "#555" }}>
                    {l}
                    {combined !== null && inScan && (
                      <span className="absolute -top-1.5 -right-1.5 px-1 rounded font-orbitron text-[7px] font-bold"
                        style={{ background: combined >= 70 ? "#22c55e" : combined >= 55 ? "#facc15" : "#888", color: "#050a0f" }}>
                        {combined.toFixed(0)}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* ── Multi-market scan results panel ─────────────────────────────────── */}
      {multiScan && Object.keys(marketScans).length > 0 && (
        <HedgeScanPanel
          scans={marketScans}
          markets={scanMarkets}
          colorA={group.color}
          colorB={group.colorB}
          labelA={legA.contract.label}
          labelB={legB.contract.label}
          onExecute={(mkt) => { setHedgeSymbol(mkt); setAiLegA(null); setAiLegB(null); }}
        />
      )}

      {/* ── Contract group selector ──────────────────────────────────────────── */}
      <div className="flex flex-wrap gap-2">
        {CONTRACT_GROUPS.map((g, i) => (
          <button key={g.group} onClick={() => { setSelectedGroup(i); setAiLegA(null); setAiLegB(null); }}
            className="px-3 py-1.5 rounded-lg font-orbitron text-[10px] font-bold tracking-wider transition-all border"
            style={selectedGroup === i
              ? { background: g.color, color: "#050a0f", borderColor: g.color }
              : { background: `${g.color}10`, borderColor: `${g.color}40`, color: g.color }}>
            {g.group}
          </button>
        ))}
      </div>

      {/* ── Two legs side by side ────────────────────────────────────────────── */}
      <div className="flex gap-4 flex-col md:flex-row">
        <LegCard
          leg={legA} label="LEG A" color={group.color}
          allOptions={group.options} aiInfo={aiLegA} aiConfirm={aiConfirm}
          onChange={(u) => setLegA((p) => ({ ...p, ...u }))}
        />
        <div className="flex items-center justify-center flex-shrink-0">
          <div className="w-8 h-8 rounded-full border flex items-center justify-center font-orbitron text-[10px] font-bold text-muted-foreground"
            style={{ borderColor: "rgba(0,229,255,0.25)", background: "rgba(0,229,255,0.06)" }}>
            VS
          </div>
        </div>
        <LegCard
          leg={legB} label="LEG B" color={group.colorB}
          allOptions={group.options} aiInfo={aiLegB} aiConfirm={aiConfirm}
          onChange={(u) => setLegB((p) => ({ ...p, ...u }))}
        />
      </div>

      {/* ── Settings toggle ──────────────────────────────────────────────────── */}
      <button onClick={() => setShowSettings((p) => !p)}
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-orbitron text-[10px] font-bold transition-all border"
        style={{ borderColor: "rgba(255,255,255,0.1)", color: showSettings ? "#00e5ff" : "#888" }}>
        <Settings2 size={11} /> Settings (TP / SL / Limit)
      </button>

      {showSettings && (
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3 p-4 rounded-xl border" style={{ borderColor: "rgba(255,255,255,0.08)", background: "rgba(0,0,0,0.2)" }}>
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
                <input type="number" min={1} step={0.5} value={tpAmount}
                  onChange={(e) => setTpAmount(parseFloat(e.target.value) || 10)}
                  className="w-20 px-2 py-1 rounded font-orbitron text-xs bg-background border border-border focus:outline-none text-center" />
                <span className="font-rajdhani text-[10px] text-muted-foreground">USD</span>
              </div>
            )}
          </div>
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
                <input type="number" min={1} step={0.5} value={slAmount}
                  onChange={(e) => setSlAmount(parseFloat(e.target.value) || 5)}
                  className="w-20 px-2 py-1 rounded font-orbitron text-xs bg-background border border-border focus:outline-none text-center" />
                <span className="font-rajdhani text-[10px] text-muted-foreground">USD</span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Blocked ───────────────────────────────────────────────────────────── */}
      {blocked && (
        <div className="flex items-center gap-2 p-3 rounded-lg" style={{ background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.3)" }}>
          <ShieldCheck size={14} className="text-red-400 flex-shrink-0" />
          <span className="font-rajdhani text-xs text-red-400 font-bold">
            {tpHit ? `Take Profit hit (+$${tpAmount})` : slHit ? `Stop Loss hit (-$${slAmount})` : `Trade limit (${tradeLimit})`} — paused
          </span>
          <button
            onClick={() => { setSessionPL(0); setTradesExecuted(0); setLegA((p) => ({ ...p, lossStreak: 0 })); setLegB((p) => ({ ...p, lossStreak: 0 })); }}
            className="ml-auto font-rajdhani text-[10px] text-muted-foreground hover:text-foreground underline">Reset</button>
        </div>
      )}

      {/* ── Session stats ─────────────────────────────────────────────────────── */}
      {total > 0 && (
        <div className="rounded-xl border p-3" style={{ borderColor: "rgba(255,255,255,0.08)", background: "rgba(0,0,0,0.2)" }}>
          <div className="flex items-center gap-3 flex-wrap">
            <div className="grid grid-cols-4 gap-2 flex-1">
              {[
                { label: "WINS",    val: wins,    color: "#22c55e" },
                { label: "LOSSES",  val: losses,  color: "#ef4444" },
                { label: "WIN%",    val: `${wr}%`, color: wr >= 60 ? "#22c55e" : wr >= 45 ? "#facc15" : "#ef4444" },
                { label: "P/L",     val: `${sessionPL >= 0 ? "+" : ""}$${sessionPL.toFixed(2)}`, color: sessionPL >= 0 ? "#22c55e" : "#ef4444" },
              ].map(({ label, val, color }) => (
                <div key={label} className="text-center p-2.5 rounded-lg" style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.07)" }}>
                  <div className="font-rajdhani text-[9px] text-muted-foreground tracking-widest">{label}</div>
                  <div className="font-orbitron text-base font-bold" style={{ color }}>{val}</div>
                </div>
              ))}
            </div>
            <div className="flex flex-col items-end gap-1 flex-shrink-0">
              <div className="flex items-center gap-1">
                <BarChart3 size={9} className="text-muted-foreground" />
                <span className="font-rajdhani text-[9px] text-muted-foreground">P&L curve</span>
              </div>
              <PlSparkline trades={trades} />
            </div>
          </div>
        </div>
      )}

      {/* ── Execute buttons ───────────────────────────────────────────────────── */}
      <div className="flex flex-wrap gap-3">
        <button
          onClick={() => void executeHedge()}
          disabled={deriv.status !== "connected" || isBusy || blocked}
          className="flex items-center gap-2 px-6 py-3 rounded-xl font-orbitron text-sm font-bold tracking-wider transition-all disabled:opacity-40"
          style={{ background: "linear-gradient(135deg, #00e5ff, #e91e8c)", color: "#050a0f", boxShadow: "0 0 20px rgba(0,229,255,0.15)" }}>
          {fetchingAI
            ? <><ScanLine size={16} className="animate-pulse" /> Scanning signals…</>
            : executing
              ? <><Loader size={16} className="animate-spin" /> Executing hedge…</>
              : <><Play size={16} /> {aiConfirm ? "AI Confirm + Execute" : `Execute Hedge · ${group.group}`}</>}
        </button>
        <button
          onClick={() => setAutoMode((p) => !p)}
          disabled={deriv.status !== "connected" || blocked}
          className="flex items-center gap-2 px-6 py-3 rounded-xl font-orbitron text-sm font-bold tracking-wider transition-all disabled:opacity-40"
          style={autoMode
            ? { background: "rgba(239,68,68,0.15)", border: "2px solid #ef4444", color: "#ef4444" }
            : { background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.15)", color: "#888" }}>
          {autoMode ? <><Square size={16} /> Stop Auto</> : <><Bot size={16} /> Auto Hedge</>}
        </button>
      </div>

      {autoMode && !coolingOff && (
        <div className="flex items-center gap-3 font-rajdhani text-sm" style={{ color: "#00e5ff" }}>
          <div className="w-2.5 h-2.5 rounded-full animate-pulse" style={{ background: "#00e5ff" }} />
          Hedge auto-running{aiConfirm ? " with AI confirmation" : ""} · every {Math.min(legA.ticks, legB.ticks) + 5}s
        </div>
      )}

      {coolingOff && (
        <div className="flex items-center gap-3 px-3 py-2 rounded-lg font-rajdhani text-sm animate-pulse"
          style={{ background: "rgba(250,204,21,0.08)", border: "1px solid rgba(250,204,21,0.25)", color: "#facc15" }}>
          <TrendingUp size={14} />
          3 clean wins — cooling off · scanning for clean setup…
        </div>
      )}

      {/* ── Trade log ─────────────────────────────────────────────────────────── */}
      {trades.length > 0 && (
        <div className="rounded-xl border overflow-hidden" style={{ borderColor: "rgba(0,229,255,0.2)" }}>
          <div className="px-4 py-2.5 border-b flex items-center justify-between" style={{ borderColor: "rgba(0,229,255,0.12)", background: "rgba(0,0,0,0.3)" }}>
            <span className="font-orbitron text-xs font-bold tracking-wider text-primary">
              HEDGE LOG · {trades.length} entries · {wins}W / {losses}L
            </span>
            <button onClick={() => { setTrades([]); setAiLegA(null); setAiLegB(null); }}
              className="font-rajdhani text-[10px] text-muted-foreground hover:text-foreground">clear</button>
          </div>
          <div className="max-h-96 overflow-y-auto">
            {Object.entries(
              trades.reduce((acc, t) => {
                const gid = t.bulk_group ?? t.id;
                if (!acc[gid]) acc[gid] = [];
                acc[gid].push(t);
                return acc;
              }, {} as Record<string, TradeResult[]>)
            ).map(([gid, batch]) => {
              const batchPL = batch.reduce((s, t) => s + (t.profit ?? 0), 0);
              const batchWins = batch.filter((t) => t.status === "won").length;
              return (
                <div key={gid} className="border-b last:border-0" style={{ borderColor: "rgba(0,229,255,0.06)" }}>
                  <div className="px-3 py-1.5 flex items-center gap-2" style={{ background: "rgba(0,229,255,0.03)" }}>
                    <Zap size={9} className="text-primary" />
                    <span className="font-orbitron text-[9px] font-bold text-primary">HEDGE PAIR</span>
                    <span className="font-rajdhani text-[9px] text-muted-foreground ml-auto">
                      {batchWins}W / {batch.length - batchWins}L
                      <span className="ml-1.5 font-orbitron font-bold" style={{ color: batchPL >= 0 ? "#22c55e" : "#ef4444" }}>
                        {batchPL >= 0 ? "+" : ""}${batchPL.toFixed(2)}
                      </span>
                    </span>
                  </div>
                  {batch.map((t, ti) => (
                    <div key={t.id} className="flex items-center gap-2 px-4 py-2 border-b last:border-0 hover:bg-white/2 transition-colors"
                      style={{ borderColor: "rgba(255,255,255,0.04)" }}>
                      <div className="w-1.5 h-1.5 rounded-full flex-shrink-0"
                        style={{ background: ti === 0 ? group.color : group.colorB }} />
                      {(t.status === "pending" || t.status === "open") ? (
                        <Loader size={10} className="animate-spin text-muted-foreground flex-shrink-0" />
                      ) : t.status === "won" ? (
                        <CheckCircle size={10} className="text-green-400 flex-shrink-0" />
                      ) : (
                        <XCircle size={10} className="text-red-400 flex-shrink-0" />
                      )}
                      <span className="font-orbitron text-[10px] font-bold flex-1 truncate"
                        style={{ color: t.status === "won" ? "#22c55e" : t.status === "lost" ? "#ef4444" : "#aaa" }}>
                        {t.label}
                      </span>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <span className="font-rajdhani text-[9px] text-muted-foreground">${t.stake.toFixed(2)}</span>
                        {t.entry_spot && <span className="font-rajdhani text-[9px] text-muted-foreground">e:{t.entry_spot}</span>}
                        {t.exit_spot  && <span className="font-rajdhani text-[9px] text-muted-foreground">x:{t.exit_spot}</span>}
                        {t.profit !== null && (
                          <span className="font-orbitron text-[10px] font-bold w-14 text-right"
                            style={{ color: (t.profit ?? 0) >= 0 ? "#22c55e" : "#ef4444" }}>
                            {(t.profit ?? 0) >= 0 ? "+" : ""}${(t.profit ?? 0).toFixed(2)}
                          </span>
                        )}
                        {(t.status === "pending" || t.status === "open") && (
                          <span className="font-rajdhani text-[9px] animate-pulse text-primary">{t.status}…</span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {trades.length === 0 && !isBusy && (
        <div className="text-center py-10">
          <TrendingUp size={32} className="mx-auto mb-2 text-muted-foreground opacity-30" />
          <p className="font-rajdhani text-sm text-muted-foreground">
            {aiConfirm ? "Connect to Deriv · AI will confirm each leg before execution" : "Connect to Deriv and hit Execute Hedge to start"}
          </p>
        </div>
      )}
    </div>
  );
}
