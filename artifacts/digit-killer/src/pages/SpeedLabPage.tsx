/**
 * Speed Lab — AI-powered execution engine.
 * MANUAL MODE: fires all selected contracts × all selected markets in parallel.
 * AI MODE: scans each selected market, picks the single highest-confidence
 *   contract from the user's allowed list, skips markets with no qualifying
 *   signal, then executes winners in one ultra-fast batch.
 */
import { useState, useRef, useCallback, useEffect } from "react";
import {
  Rocket, Play, Square, Bot, CheckCircle, XCircle, Loader,
  ShieldCheck, Zap, Settings2, RefreshCw, Brain, ScanLine,
  TrendingUp, AlertTriangle, BarChart3,
} from "lucide-react";
import { useDerivContext } from "@/context/DerivContext";
import DerivConnectionBar from "@/components/DerivConnectionBar";
import {
  executeBulk, nextStake, bulkGroupId,
  type TradeResult, type TradeSpec,
} from "@/lib/tradeEngine";

// ── Contract definitions ───────────────────────────────────────────────────────
interface ContractDef {
  id: string; label: string; contract_type: string;
  barrier?: number | string; digit?: number;
  defaultTicks: number; color: string; category: string;
}

const ALL_CONTRACTS: ContractDef[] = [
  { id: "EVEN",      label: "Even",                contract_type: "DIGITEVEN",  defaultTicks: 1,  color: "#00e5ff", category: "Digits" },
  { id: "ODD",       label: "Odd",                 contract_type: "DIGITODD",   defaultTicks: 1,  color: "#a78bfa", category: "Digits" },
  { id: "MATCH0",    label: "Match 0",             contract_type: "DIGITMATCH", digit: 0, defaultTicks: 1, color: "#22c55e", category: "Digits" },
  { id: "MATCH1",    label: "Match 1",             contract_type: "DIGITMATCH", digit: 1, defaultTicks: 1, color: "#22c55e", category: "Digits" },
  { id: "MATCH5",    label: "Match 5",             contract_type: "DIGITMATCH", digit: 5, defaultTicks: 1, color: "#22c55e", category: "Digits" },
  { id: "MATCH9",    label: "Match 9",             contract_type: "DIGITMATCH", digit: 9, defaultTicks: 1, color: "#22c55e", category: "Digits" },
  { id: "DIFFER5",   label: "Differ 5",            contract_type: "DIGITDIFF",  digit: 5, defaultTicks: 1, color: "#fb923c", category: "Digits" },
  { id: "OVER4",     label: "Over 4",              contract_type: "DIGITOVER",  barrier: 4, defaultTicks: 1, color: "#f59e0b", category: "Digits" },
  { id: "OVER5",     label: "Over 5",              contract_type: "DIGITOVER",  barrier: 5, defaultTicks: 1, color: "#f59e0b", category: "Digits" },
  { id: "UNDER4",    label: "Under 4",             contract_type: "DIGITUNDER", barrier: 4, defaultTicks: 1, color: "#e91e8c", category: "Digits" },
  { id: "UNDER5",    label: "Under 5",             contract_type: "DIGITUNDER", barrier: 5, defaultTicks: 1, color: "#e91e8c", category: "Digits" },
  // ── AI auto-picks: AI selects the best digit/barrier per market ─────────────
  { id: "AI_MATCH",  label: "AI Match (auto digit)",   contract_type: "DIGITMATCH", defaultTicks: 0, color: "#34d399", category: "AI Picks" },
  { id: "AI_DIFFER", label: "AI Differ (auto digit)",  contract_type: "DIGITDIFF",  defaultTicks: 0, color: "#fb923c", category: "AI Picks" },
  { id: "AI_OVER",   label: "AI Over (auto barrier)",  contract_type: "DIGITOVER",  defaultTicks: 0, color: "#fbbf24", category: "AI Picks" },
  { id: "AI_UNDER",  label: "AI Under (auto barrier)", contract_type: "DIGITUNDER", defaultTicks: 0, color: "#e879f9", category: "AI Picks" },
  { id: "RISE",      label: "Rise",                contract_type: "CALL",       defaultTicks: 5,  color: "#22c55e", category: "Rise/Fall" },
  { id: "FALL",      label: "Fall",                contract_type: "PUT",        defaultTicks: 5,  color: "#ef4444", category: "Rise/Fall" },
  { id: "RUNHIGH",   label: "Only Up",             contract_type: "RUNHIGH",    defaultTicks: 5,  color: "#4ade80", category: "Only" },
  { id: "RUNLOW",    label: "Only Down",           contract_type: "RUNLOW",     defaultTicks: 5,  color: "#f87171", category: "Only" },
  { id: "HIGHTICK",  label: "High Tick",           contract_type: "HIGHERTICK", barrier: 3, defaultTicks: 5, color: "#fbbf24", category: "Tick" },
  { id: "LOWTICK",   label: "Low Tick",            contract_type: "LOWERTICK",  barrier: 3, defaultTicks: 5, color: "#60a5fa", category: "Tick" },
];
const CONTRACT_CATEGORIES = ["Digits", "AI Picks", "Rise/Fall", "Only", "Tick"];

const ALL_MARKETS = [
  { key: "R_10",      label: "Vol 10",     group: "Volatility" },
  { key: "R_25",      label: "Vol 25",     group: "Volatility" },
  { key: "R_50",      label: "Vol 50",     group: "Volatility" },
  { key: "R_75",      label: "Vol 75",     group: "Volatility" },
  { key: "R_100",     label: "Vol 100",    group: "Volatility" },
  { key: "1HZ10V",    label: "V10 (1s)",   group: "Volatility 1s" },
  { key: "1HZ15V",    label: "V15 (1s)",   group: "Volatility 1s" },
  { key: "1HZ25V",    label: "V25 (1s)",   group: "Volatility 1s" },
  { key: "1HZ30V",    label: "V30 (1s)",   group: "Volatility 1s" },
  { key: "1HZ50V",    label: "V50 (1s)",   group: "Volatility 1s" },
  { key: "1HZ75V",    label: "V75 (1s)",   group: "Volatility 1s" },
  { key: "1HZ90V",    label: "V90 (1s)",   group: "Volatility 1s" },
  { key: "1HZ100V",   label: "V100 (1s)",  group: "Volatility 1s" },
  { key: "RDBEAR",    label: "Bear Market",group: "Market" },
  { key: "RDBULL",    label: "Bull Market",group: "Market" },
  { key: "STPINDXV",  label: "Step Index", group: "Market" },
  { key: "CRASH300N", label: "Crash 300",  group: "Crash/Boom" },
  { key: "CRASH500",  label: "Crash 500",  group: "Crash/Boom" },
  { key: "CRASH1000", label: "Crash 1000", group: "Crash/Boom" },
  { key: "BOOM300N",  label: "Boom 300",   group: "Crash/Boom" },
  { key: "BOOM500",   label: "Boom 500",   group: "Crash/Boom" },
  { key: "BOOM1000",  label: "Boom 1000",  group: "Crash/Boom" },
  { key: "JD10",      label: "Jump 10",    group: "Jump" },
  { key: "JD25",      label: "Jump 25",    group: "Jump" },
  { key: "JD50",      label: "Jump 50",    group: "Jump" },
  { key: "JD75",      label: "Jump 75",    group: "Jump" },
  { key: "JD100",     label: "Jump 100",   group: "Jump" },
];

// ── AI signal types ────────────────────────────────────────────────────────────
interface AiSignal {
  contract_type: string; confidence: number;
  barrier?: number; digit?: number; ticks?: number;
  strategy?: string; reason?: string; risk_level?: string;
  psych_favors_win?: boolean; psych_score?: number;
}

interface AiScanResult {
  status: "picked" | "no_signal" | "error";
  contractId?: string; contract_type?: string;
  confidence?: number; reason?: string; strategy?: string;
  errorMsg?: string;
  digit?: number; barrier?: number;
}

/** Map an AI signal → ALL_CONTRACTS id.
 *  For exact-match contracts (MATCH0 etc.) keep specific id for manual mode.
 *  For dynamic AI-picked digits/barriers, always map to AI_* category. */
function signalToContractId(sig: AiSignal): string | null {
  const ct = sig.contract_type;
  if (ct === "DIGITEVEN")  return "EVEN";
  if (ct === "DIGITODD")   return "ODD";
  if (ct === "CALL")       return "RISE";
  if (ct === "PUT")        return "FALL";
  if (ct === "RUNHIGH")    return "RUNHIGH";
  if (ct === "RUNLOW")     return "RUNLOW";
  if (ct === "HIGHERTICK") return "HIGHTICK";
  if (ct === "LOWERTICK")  return "LOWTICK";
  // Over/Under: exact known barriers keep named id, all others → AI_OVER/AI_UNDER
  if (ct === "DIGITOVER")  {
    if (sig.barrier === 4) return "OVER4";
    if (sig.barrier === 5) return "OVER5";
    return "AI_OVER";
  }
  if (ct === "DIGITUNDER") {
    if (sig.barrier === 4) return "UNDER4";
    if (sig.barrier === 5) return "UNDER5";
    return "AI_UNDER";
  }
  // Match: exact known digits keep named id, all others → AI_MATCH
  if (ct === "DIGITMATCH") {
    if (sig.digit === 0) return "MATCH0";
    if (sig.digit === 1) return "MATCH1";
    if (sig.digit === 5) return "MATCH5";
    if (sig.digit === 9) return "MATCH9";
    return "AI_MATCH";
  }
  // Differ: digit 5 keeps DIFFER5, all others → AI_DIFFER
  if (ct === "DIGITDIFF")  {
    if (sig.digit === 5) return "DIFFER5";
    return "AI_DIFFER";
  }
  return null;
}

// ── P&L sparkline ─────────────────────────────────────────────────────────────
function PlSparkline({ trades }: { trades: TradeResult[] }) {
  const settled = trades.filter((t) => t.profit !== null).slice(-40);
  if (settled.length < 2) return null;
  let cum = 0;
  const points = settled.map((t) => { cum += t.profit ?? 0; return cum; });
  const min = Math.min(...points, 0);
  const max = Math.max(...points, 0);
  const range = max - min || 1;
  const W = 160; const H = 32;
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

// ── AI Scan Results Panel ──────────────────────────────────────────────────────
function AiScanPanel({ scans, markets }: { scans: Record<string, AiScanResult>; markets: string[] }) {
  if (Object.keys(scans).length === 0) return null;
  const picked = markets.filter((m) => scans[m]?.status === "picked");
  const skipped = markets.filter((m) => scans[m]?.status !== "picked");

  function contractLabel(scan: AiScanResult): string {
    const def = ALL_CONTRACTS.find((c) => c.id === scan.contractId);
    const ct = scan.contract_type ?? "";
    if (ct === "DIGITMATCH") return `Match ${scan.digit ?? "?"}`;
    if (ct === "DIGITDIFF")  return `Differ ${scan.digit ?? "?"}`;
    if (ct === "DIGITOVER")  return `Over ${scan.barrier ?? "?"}`;
    if (ct === "DIGITUNDER") return `Under ${scan.barrier ?? "?"}`;
    return def?.label ?? ct;
  }

  function contractColor(scan: AiScanResult): string {
    const ct = scan.contract_type ?? "";
    if (ct === "DIGITMATCH") return "#34d399";
    if (ct === "DIGITDIFF")  return "#fb923c";
    if (ct === "DIGITOVER")  return "#fbbf24";
    if (ct === "DIGITUNDER") return "#e879f9";
    return ALL_CONTRACTS.find((c) => c.id === scan.contractId)?.color ?? "#00e5ff";
  }

  return (
    <div className="rounded-xl border p-3 space-y-2" style={{ borderColor: "rgba(0,229,255,0.2)", background: "rgba(0,229,255,0.03)" }}>
      <div className="flex items-center gap-2">
        <Brain size={12} style={{ color: "#00e5ff" }} />
        <span className="font-orbitron text-[10px] font-bold text-primary tracking-wider">
          AI SCAN · {picked.length}/{markets.length} markets qualified
        </span>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
        {markets.map((mkt) => {
          const scan = scans[mkt];
          const mktLabel = ALL_MARKETS.find((m) => m.key === mkt)?.label ?? mkt;
          if (!scan) return null;
          if (scan.status === "picked") {
            return (
              <div key={mkt} className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg"
                style={{ background: "rgba(34,197,94,0.08)", border: "1px solid rgba(34,197,94,0.2)" }}>
                <CheckCircle size={10} className="text-green-400 flex-shrink-0" />
                <span className="font-orbitron text-[9px] font-bold text-foreground truncate flex-1">{mktLabel}</span>
                <span className="font-rajdhani text-[9px] font-bold truncate" style={{ color: contractColor(scan) }}>
                  {contractLabel(scan)}
                </span>
                {scan.strategy && (
                  <span className="font-rajdhani text-[8px] text-muted-foreground hidden sm:inline truncate max-w-20" title={scan.strategy}>
                    {scan.strategy.split(" ").slice(0, 2).join(" ")}
                  </span>
                )}
                <span className="font-orbitron text-[9px] font-bold text-green-400 flex-shrink-0">
                  {scan.confidence?.toFixed(0)}%
                </span>
              </div>
            );
          }
          return (
            <div key={mkt} className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg"
              style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)" }}>
              <AlertTriangle size={10} className="text-yellow-500 flex-shrink-0" />
              <span className="font-orbitron text-[9px] text-muted-foreground truncate flex-1">{mktLabel}</span>
              <span className="font-rajdhani text-[9px] text-muted-foreground truncate">{scan.reason ?? scan.errorMsg}</span>
            </div>
          );
        })}
      </div>
      {skipped.length > 0 && (
        <p className="font-rajdhani text-[9px] text-muted-foreground">
          {skipped.length} market{skipped.length > 1 ? "s" : ""} skipped — no qualifying signal above threshold
        </p>
      )}
    </div>
  );
}

// ── Main page ──────────────────────────────────────────────────────────────────
export default function SpeedLabPage() {
  const deriv = useDerivContext();

  const [selectedMarkets,   setSelectedMarkets  ] = useState<string[]>(["R_50"]);
  const [selectedContracts, setSelectedContracts] = useState<string[]>(["EVEN", "ODD"]);
  const [activeCategory,    setActiveCategory   ] = useState("Digits");
  const [ticksMap, setTicksMap] = useState<Record<string, number>>(() =>
    Object.fromEntries(ALL_CONTRACTS.map((c) => [c.id, c.defaultTicks]))
  );

  // ── AI mode ──────────────────────────────────────────────────────────────────
  const [aiMode,            setAiMode           ] = useState(false);
  const [confidenceThresh,  setConfidenceThresh ] = useState(65);
  const [aiScans,           setAiScans          ] = useState<Record<string, AiScanResult>>({});
  const [fetchingSignals,   setFetchingSignals  ] = useState(false);

  // ── Stake + Martingale ───────────────────────────────────────────────────────
  const [baseStake,    setBaseStake   ] = useState(1);
  const [martingaleOn, setMartingaleOn] = useState(false);
  const [martMult,     setMartMult    ] = useState(2);
  const [lossStreak,   setLossStreak  ] = useState(0);

  // ── TP / SL / Limit / Auto ───────────────────────────────────────────────────
  const [tpEnabled,      setTpEnabled     ] = useState(false);
  const [tpAmount,       setTpAmount      ] = useState(50);
  const [slEnabled,      setSlEnabled     ] = useState(false);
  const [slAmount,       setSlAmount      ] = useState(20);
  const [sessionPL,      setSessionPL     ] = useState(0);
  const [tradeLimit,     setTradeLimit    ] = useState(0);
  const [tradesExecuted, setTradesExecuted] = useState(0);
  const [autoMode,       setAutoMode      ] = useState(false);
  const [autoInterval,   setAutoInterval  ] = useState(10);

  // ── Execution state ──────────────────────────────────────────────────────────
  const [executing,    setExecuting  ] = useState(false);
  const [trades,       setTrades     ] = useState<TradeResult[]>([]);
  const [showSettings, setShowSettings] = useState(false);

  // ── 3-win cool-off ────────────────────────────────────────────────────────────
  const consecutiveWinsRef = useRef(0);
  const [coolingOff, setCoolingOff] = useState(false);

  const currentStake  = martingaleOn ? nextStake(baseStake, martMult, lossStreak) : baseStake;
  const tpHit         = tpEnabled && sessionPL >= tpAmount;
  const slHit         = slEnabled && sessionPL <= -slAmount;
  const limitHit      = tradeLimit > 0 && tradesExecuted >= tradeLimit;
  const blocked       = tpHit || slHit || limitHit;

  const wins   = trades.filter((t) => t.status === "won").length;
  const losses = trades.filter((t) => t.status === "lost").length;
  const total  = wins + losses;
  const wr     = total > 0 ? Math.round((wins / total) * 100) : 0;

  const manualContractCount = selectedMarkets.length * selectedContracts.length;

  const updateTrade = useCallback((update: Partial<TradeResult> & { id: string }) => {
    setTrades((prev) => {
      const existing = prev.find((t) => t.id === update.id);
      if (!existing) return [update as TradeResult, ...prev.slice(0, 299)];
      return prev.map((t) => t.id === update.id ? { ...t, ...update } : t);
    });
  }, []);

  /** Reset ALL settings + session state back to defaults */
  const resetAll = useCallback(() => {
    setTrades([]);
    setAiScans({});
    setSessionPL(0);
    setTradesExecuted(0);
    setLossStreak(0);
    setBaseStake(1);
    setMartingaleOn(false);
    setMartMult(2);
    setTpEnabled(false);
    setTpAmount(50);
    setSlEnabled(false);
    setSlAmount(20);
    setAutoMode(false);
    setAutoInterval(10);
    consecutiveWinsRef.current = 0;
  }, []);

  // ── Execute: Manual ───────────────────────────────────────────────────────────
  async function executeManual() {
    if (deriv.status !== "connected" || blocked || executing) return;
    if (selectedMarkets.length === 0 || selectedContracts.length === 0) return;
    const currency = deriv.account?.currency ?? "USD";
    const gid   = bulkGroupId();
    const stake  = currentStake;
    const total_count = selectedMarkets.length * selectedContracts.length;
    const specs: TradeSpec[] = [];
    let idx = 0;
    for (const mkt of selectedMarkets) {
      for (const cid of selectedContracts) {
        const def = ALL_CONTRACTS.find((c) => c.id === cid);
        if (!def) continue;
        specs.push({
          contract_type: def.contract_type, symbol: mkt, stake,
          ticks: (ticksMap[cid] === 0 || def.defaultTicks === 0) ? 1 : (ticksMap[cid] ?? def.defaultTicks),
          barrier: def.barrier, digit: def.digit,
          label: `${ALL_MARKETS.find((m) => m.key === mkt)?.label ?? mkt} · ${def.label}`,
          confidence: 100, bulk_group: gid, bulk_index: idx++, bulk_total: total_count,
        });
      }
    }
    setExecuting(true);
    try {
      const results = await executeBulk(specs, deriv.request, deriv.subscribe, currency, updateTrade);
      const profit = results.reduce((s, r) => s + (r.profit ?? 0), 0);
      setSessionPL((p) => parseFloat((p + profit).toFixed(2)));
      setTradesExecuted((p) => p + results.length);
      if (martingaleOn) {
        const anyLoss = results.some((r) => r.status === "lost" || r.status === "error");
        setLossStreak(anyLoss ? (s) => s + 1 : 0);
      }
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
    } catch { /* handled per-trade */ }
    setExecuting(false);
  }

  // ── Execute: AI Mode ──────────────────────────────────────────────────────────
  async function executeAI() {
    if (deriv.status !== "connected" || blocked || executing) return;
    if (selectedMarkets.length === 0 || selectedContracts.length === 0) return;

    setFetchingSignals(true);
    setAiScans({});

    // Fetch AI signals for all selected markets in parallel
    const signalResults = await Promise.allSettled(
      selectedMarkets.map(async (mkt) => {
        const res = await fetch(`/api/ai-signals?symbol=${mkt}`);
        if (!res.ok) throw new Error("HTTP " + res.status);
        const data = await res.json() as { signals?: AiSignal[] };
        return { mkt, signals: data.signals ?? [] };
      })
    );

    const newScans: Record<string, AiScanResult> = {};
    const specs: TradeSpec[] = [];

    for (let i = 0; i < selectedMarkets.length; i++) {
      const mkt = selectedMarkets[i];
      const result = signalResults[i];

      if (result.status === "rejected") {
        newScans[mkt] = { status: "error", errorMsg: "Signal fetch failed" };
        continue;
      }

      const { signals } = result.value;

      // Collect ALL qualifying signals matching selected contracts above threshold
      const qualifyingSigs: Array<{ sig: AiSignal; cid: string; def: NonNullable<ReturnType<typeof ALL_CONTRACTS.find>> }> = [];
      for (const sig of signals) {
        if (sig.confidence < confidenceThresh) continue;
        const cid = signalToContractId(sig);
        if (!cid || !selectedContracts.includes(cid)) continue;
        const def = ALL_CONTRACTS.find((c) => c.id === cid);
        if (!def) continue;
        qualifyingSigs.push({ sig, cid, def });
      }

      if (qualifyingSigs.length === 0) {
        newScans[mkt] = {
          status: "no_signal",
          reason: `No signal ≥${confidenceThresh}% in your contract list`,
        };
        continue;
      }

      // Record the best (first = highest confidence) for scan display
      const { sig: topSig, cid: topCid } = qualifyingSigs[0];
      newScans[mkt] = {
        status: "picked", contractId: topCid,
        contract_type: topSig.contract_type,
        confidence: topSig.confidence,
        reason: topSig.reason ?? "",
        strategy: topSig.strategy ?? "",
        digit: topSig.digit,
        barrier: typeof topSig.barrier === "number" ? topSig.barrier : undefined,
      };

      // Use the same tick duration for all signals in this batch → same exit spot
      const batchTicks = topSig.ticks ?? ticksMap[topCid] ?? qualifyingSigs[0].def.defaultTicks;
      const mktLabel = ALL_MARKETS.find((m) => m.key === mkt)?.label ?? mkt;
      for (const { sig, def } of qualifyingSigs) {
        specs.push({
          contract_type: sig.contract_type, symbol: mkt, stake: currentStake,
          ticks: batchTicks,
          barrier: sig.barrier, digit: sig.digit,
          label: `[AI ${sig.confidence.toFixed(0)}%] ${mktLabel} · ${def.label}`,
          confidence: sig.confidence,
          bulk_group: undefined as unknown as string,
          bulk_index: 0, bulk_total: 0,
        });
      }
    }

    setAiScans(newScans);
    setFetchingSignals(false);

    if (specs.length === 0) return;

    const gid = bulkGroupId();
    const finalSpecs = specs.map((s, i) => ({ ...s, bulk_group: gid, bulk_index: i, bulk_total: specs.length }));

    setExecuting(true);
    const currency = deriv.account?.currency ?? "USD";
    try {
      const results = await executeBulk(finalSpecs, deriv.request, deriv.subscribe, currency, updateTrade);
      const profit = results.reduce((s, r) => s + (r.profit ?? 0), 0);
      setSessionPL((p) => parseFloat((p + profit).toFixed(2)));
      setTradesExecuted((p) => p + results.length);
      if (martingaleOn) {
        const anyLoss = results.some((r) => r.status === "lost" || r.status === "error");
        setLossStreak(anyLoss ? (s) => s + 1 : 0);
      }
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
    } catch { /* handled per-trade */ }
    setExecuting(false);
  }

  async function executeLab() {
    if (aiMode) await executeAI();
    else await executeManual();
  }

  // ── Auto mode ─────────────────────────────────────────────────────────────────
  const autoRef = useRef<ReturnType<typeof setInterval> | null>(null);
  useEffect(() => {
    if (!autoMode || deriv.status !== "connected" || blocked || limitHit) {
      if (autoRef.current) { clearInterval(autoRef.current); autoRef.current = null; }
      if (limitHit) setAutoMode(false);
      return;
    }
    if (autoRef.current) return;
    autoRef.current = setInterval(() => {
      if (!executing && !blocked && !coolingOff) void executeLab();
    }, autoInterval * 1000);
    return () => { if (autoRef.current) { clearInterval(autoRef.current); autoRef.current = null; } };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoMode, deriv.status, blocked, executing, autoInterval, limitHit]);

  const isBusy = executing || fetchingSignals;

  return (
    <div className="space-y-4 max-w-5xl mx-auto">

      {/* ── Header ──────────────────────────────────────────────────────────── */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="p-2.5 rounded-xl" style={{ background: "rgba(233,30,140,0.1)", border: "1px solid rgba(233,30,140,0.3)" }}>
          <Rocket size={22} style={{ color: "#e91e8c" }} />
        </div>
        <div>
          <h1 className="font-orbitron text-xl font-bold text-foreground tracking-wider">SPEED LAB</h1>
          <p className="font-rajdhani text-sm text-muted-foreground">
            {aiMode ? "AI picks highest-confidence contract per market · executes in parallel" : "All contracts × all markets in parallel · accurate real-time P&L"}
          </p>
        </div>
        <div className="ml-auto flex items-center gap-2">
          {/* AI / Manual toggle */}
          <button
            onClick={() => { setAiMode((p) => !p); setAiScans({}); }}
            className="flex items-center gap-2 px-3 py-1.5 rounded-lg font-orbitron text-[10px] font-bold transition-all border"
            style={aiMode
              ? { background: "rgba(0,229,255,0.15)", borderColor: "#00e5ff", color: "#00e5ff" }
              : { background: "rgba(255,255,255,0.04)", borderColor: "rgba(255,255,255,0.12)", color: "#888" }}>
            <Brain size={11} /> {aiMode ? "AI MODE ON" : "AI MODE OFF"}
          </button>
          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg"
            style={{ background: "rgba(233,30,140,0.1)", border: "1px solid rgba(233,30,140,0.25)" }}>
            <Zap size={11} style={{ color: "#e91e8c" }} />
            <span className="font-orbitron text-[10px] font-bold" style={{ color: "#e91e8c" }}>
              {aiMode ? `${selectedMarkets.length} markets` : `${manualContractCount} contracts/batch`}
            </span>
          </div>
        </div>
      </div>

      {/* Connection bar */}
      <DerivConnectionBar />

      {/* ── AI Config (visible only in AI mode) ─────────────────────────────── */}
      {aiMode && (
        <div className="rounded-xl border p-4 space-y-3" style={{ borderColor: "rgba(0,229,255,0.25)", background: "rgba(0,229,255,0.04)" }}>
          <div className="flex items-center gap-2">
            <Brain size={13} className="text-primary" />
            <span className="font-orbitron text-xs font-bold text-primary tracking-wider">AI SIGNAL CONFIG</span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <div className="font-rajdhani text-[10px] text-muted-foreground tracking-widest uppercase mb-2">
                Confidence Threshold · <span className="text-primary font-orbitron font-bold">{confidenceThresh}%</span>
              </div>
              <div className="flex items-center gap-3">
                <input type="range" min={50} max={90} step={1} value={confidenceThresh}
                  onChange={(e) => setConfidenceThresh(parseInt(e.target.value))}
                  className="flex-1 accent-cyan-400" />
                <div className="flex gap-1">
                  {[60, 65, 70, 75, 80].map((v) => (
                    <button key={v} onClick={() => setConfidenceThresh(v)}
                      className="px-1.5 py-0.5 rounded font-orbitron text-[9px] font-bold transition-all"
                      style={confidenceThresh === v
                        ? { background: "#00e5ff", color: "#050a0f" }
                        : { background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)", color: "#888" }}>
                      {v}%
                    </button>
                  ))}
                </div>
              </div>
              <p className="font-rajdhani text-[9px] text-muted-foreground mt-1">
                Only trade signals with AI confidence ≥ {confidenceThresh}%. Higher = fewer but stronger entries.
              </p>
            </div>
            <div className="p-3 rounded-lg" style={{ background: "rgba(0,0,0,0.3)", border: "1px solid rgba(255,255,255,0.06)" }}>
              <div className="font-rajdhani text-[10px] text-muted-foreground tracking-widest uppercase mb-1.5">HOW IT WORKS</div>
              <ul className="space-y-0.5 font-rajdhani text-[10px] text-muted-foreground">
                <li>1. Scans all selected markets in parallel via AI signals API</li>
                <li>2. For each market, picks the highest-confidence signal that matches your selected contract types</li>
                <li>3. Skips markets with no qualifying signal above threshold</li>
                <li>4. Fires all qualifying contracts simultaneously</li>
              </ul>
            </div>
          </div>
        </div>
      )}

      {/* ── Market selection ─────────────────────────────────────────────────── */}
      <div className="rounded-xl border p-4" style={{ borderColor: "rgba(0,229,255,0.2)", background: "rgba(0,229,255,0.02)" }}>
        <div className="flex items-center justify-between mb-3">
          <span className="font-orbitron text-xs font-bold text-primary tracking-wider">MARKETS ({selectedMarkets.length} selected)</span>
          <div className="flex gap-2">
            <button onClick={() => setSelectedMarkets(ALL_MARKETS.slice(0, 5).map((m) => m.key))}
              className="font-rajdhani text-[10px] text-muted-foreground hover:text-primary transition-colors">Vol only</button>
            <button onClick={() => setSelectedMarkets(ALL_MARKETS.map((m) => m.key))}
              className="font-rajdhani text-[10px] text-muted-foreground hover:text-primary transition-colors">All</button>
            <button onClick={() => setSelectedMarkets([])}
              className="font-rajdhani text-[10px] text-muted-foreground hover:text-red-400 transition-colors">Clear</button>
          </div>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {ALL_MARKETS.map((m) => (
            <button key={m.key} onClick={() => setSelectedMarkets((p) => p.includes(m.key) ? p.filter((x) => x !== m.key) : [...p, m.key])}
              className="px-2.5 py-1 rounded-lg font-orbitron text-[10px] font-bold tracking-wider transition-all border"
              style={selectedMarkets.includes(m.key)
                ? { background: "#00e5ff", color: "#050a0f", borderColor: "#00e5ff" }
                : { background: "rgba(0,229,255,0.05)", borderColor: "rgba(0,229,255,0.2)", color: "rgba(0,229,255,0.6)" }}>
              {m.label}
            </button>
          ))}
        </div>
      </div>

      {/* ── Contract type selection ───────────────────────────────────────────── */}
      <div className="rounded-xl border p-4" style={{ borderColor: "rgba(233,30,140,0.2)", background: "rgba(233,30,140,0.02)" }}>
        <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
          <span className="font-orbitron text-xs font-bold tracking-wider" style={{ color: "#e91e8c" }}>
            {aiMode ? "ALLOWED CONTRACT TYPES (AI picks best from these)" : `CONTRACTS (${selectedContracts.length} selected)`}
          </span>
          <div className="flex gap-2 flex-wrap items-center">
            {!aiMode && (
              <button
                onClick={() => setTicksMap((p) => {
                  const upd = { ...p };
                  ["AI_MATCH", "AI_DIFFER", "AI_OVER", "AI_UNDER"].forEach((id) => { upd[id] = 0; });
                  return upd;
                })}
                className="px-2 py-1 rounded font-orbitron text-[9px] font-bold transition-all"
                style={{ background: "rgba(52,211,153,0.15)", border: "1px solid rgba(52,211,153,0.4)", color: "#34d399" }}
                title="Set AI Picks contracts to use AI-determined tick count">
                🤖 AI TICKS
              </button>
            )}
            <button onClick={() => setSelectedContracts(ALL_CONTRACTS.map((c) => c.id))}
              className="font-rajdhani text-[10px] text-muted-foreground hover:text-pink-400 transition-colors">All</button>
            <button onClick={() => setSelectedContracts([])}
              className="font-rajdhani text-[10px] text-muted-foreground hover:text-red-400 transition-colors">Clear</button>
          </div>
        </div>
        <div className="flex gap-2 mb-3 flex-wrap">
          {CONTRACT_CATEGORIES.map((cat) => (
            <button key={cat} onClick={() => setActiveCategory(cat)}
              className="px-2.5 py-1 rounded font-orbitron text-[10px] font-bold transition-all"
              style={activeCategory === cat
                ? { background: "#e91e8c", color: "#fff" }
                : { background: "rgba(233,30,140,0.1)", color: "#e91e8c", border: "1px solid rgba(233,30,140,0.25)" }}>
              {cat}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap gap-2">
          {ALL_CONTRACTS.filter((c) => c.category === activeCategory).map((def) => (
            <div key={def.id} className="flex flex-col gap-1">
              <button onClick={() => setSelectedContracts((p) => p.includes(def.id) ? p.filter((x) => x !== def.id) : [...p, def.id])}
                className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg font-orbitron text-[10px] font-bold transition-all border"
                style={selectedContracts.includes(def.id)
                  ? { background: def.color, color: "#050a0f", borderColor: def.color }
                  : { background: `${def.color}10`, borderColor: `${def.color}30`, color: def.color }}>
                {selectedContracts.includes(def.id) && <CheckCircle size={9} />}
                {def.label}
              </button>
              {selectedContracts.includes(def.id) && !aiMode && (
                <div className="flex items-center gap-1">
                  <span className="font-rajdhani text-[9px] text-muted-foreground">T:</span>
                  <select value={ticksMap[def.id] ?? def.defaultTicks}
                    onChange={(e) => setTicksMap((p) => ({ ...p, [def.id]: parseInt(e.target.value) }))}
                    className="text-[10px] font-orbitron bg-background border border-border rounded px-1 py-0.5 text-foreground focus:outline-none">
                    <option value={0}>AI</option>
                    {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((t) => <option key={t} value={t}>{t}T</option>)}
                  </select>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* ── Stake + Martingale ────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="rounded-xl border p-4 space-y-3" style={{ borderColor: "rgba(255,255,255,0.1)", background: "rgba(255,255,255,0.02)" }}>
          <div className="font-rajdhani text-[10px] text-muted-foreground tracking-widest uppercase">
            Stake Per Contract · <span className="font-orbitron text-primary">${currentStake.toFixed(2)}</span>
            {martingaleOn && lossStreak > 0 && <span className="ml-1 text-yellow-400">(streak {lossStreak})</span>}
          </div>
          <div className="flex flex-wrap gap-1.5">
            {[0.35, 0.5, 1, 2, 5].map((v) => (
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
              className="w-16 px-2 py-1 rounded font-orbitron text-xs bg-background border border-border text-foreground focus:outline-none text-center" />
          </div>
          {!aiMode && (
            <div className="font-rajdhani text-[10px] text-muted-foreground">
              Total per batch: <span className="text-primary font-orbitron">${(currentStake * manualContractCount).toFixed(2)}</span>
            </div>
          )}
        </div>

        <div className="rounded-xl border p-4 space-y-3" style={{ borderColor: "rgba(250,204,21,0.2)", background: "rgba(250,204,21,0.03)" }}>
          <div className="flex items-center gap-3">
            <div className="cursor-pointer flex-shrink-0"
              style={{ width: 36, height: 18, background: martingaleOn ? "#facc15" : "rgba(255,255,255,0.15)", borderRadius: 9, position: "relative" }}
              onClick={() => { setMartingaleOn((p) => !p); setLossStreak(0); }}>
              <div style={{ width: 14, height: 14, background: "#fff", borderRadius: "50%", position: "absolute", top: 2, left: martingaleOn ? 20 : 2, transition: "left .15s" }} />
            </div>
            <span className="font-rajdhani text-xs font-bold tracking-widest" style={{ color: martingaleOn ? "#facc15" : "#666" }}>
              MARTINGALE {martingaleOn ? "ON" : "OFF"}
            </span>
          </div>
          {martingaleOn && (
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <span className="font-rajdhani text-[10px] text-muted-foreground">Multiplier:</span>
                <input type="range" min={1.2} max={5} step={0.1} value={martMult}
                  onChange={(e) => setMartMult(parseFloat(e.target.value))} className="flex-1 accent-yellow-400" />
                <span className="font-orbitron text-sm font-bold text-yellow-400 w-10">{martMult.toFixed(1)}×</span>
              </div>
              <div className="flex gap-1.5">
                {[1.5, 2, 2.5, 3, 4].map((v) => (
                  <button key={v} onClick={() => setMartMult(v)}
                    className="px-2 py-0.5 rounded font-orbitron text-[10px] font-bold transition-all"
                    style={Math.abs(martMult - v) < 0.05
                      ? { background: "#facc15", color: "#050a0f" }
                      : { background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)", color: "#888" }}>
                    {v}×
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── Settings toggle ───────────────────────────────────────────────────── */}
      <button onClick={() => setShowSettings((p) => !p)}
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-orbitron text-[10px] font-bold transition-all border"
        style={{ borderColor: "rgba(255,255,255,0.1)", color: showSettings ? "#00e5ff" : "#888" }}>
        <Settings2 size={11} /> TP / SL / Trade Limit / Auto Interval
      </button>

      {showSettings && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 p-4 rounded-xl border" style={{ borderColor: "rgba(255,255,255,0.08)", background: "rgba(0,0,0,0.2)" }}>
          <div className="p-3 rounded-lg" style={{ background: "rgba(34,197,94,0.06)", border: "1px solid rgba(34,197,94,0.15)" }}>
            <div className="flex items-center gap-2 mb-2">
              <div className="cursor-pointer flex-shrink-0" style={{ width: 28, height: 14, background: tpEnabled ? "#22c55e" : "rgba(255,255,255,0.15)", borderRadius: 7, position: "relative" }}
                onClick={() => setTpEnabled((p) => !p)}>
                <div style={{ width: 10, height: 10, background: "#fff", borderRadius: "50%", position: "absolute", top: 2, left: tpEnabled ? 16 : 2, transition: "left .15s" }} />
              </div>
              <span className="font-rajdhani text-xs font-bold" style={{ color: tpEnabled ? "#22c55e" : "#888" }}>Take Profit</span>
            </div>
            {tpEnabled && (
              <div className="flex items-center gap-1">
                <span className="font-rajdhani text-[10px] text-muted-foreground">$</span>
                <input type="number" min={1} step={1} value={tpAmount}
                  onChange={(e) => setTpAmount(parseFloat(e.target.value) || 50)}
                  className="flex-1 px-2 py-1 rounded font-orbitron text-xs bg-background border border-border focus:outline-none text-center" />
              </div>
            )}
          </div>
          <div className="p-3 rounded-lg" style={{ background: "rgba(239,68,68,0.06)", border: "1px solid rgba(239,68,68,0.15)" }}>
            <div className="flex items-center gap-2 mb-2">
              <div className="cursor-pointer flex-shrink-0" style={{ width: 28, height: 14, background: slEnabled ? "#ef4444" : "rgba(255,255,255,0.15)", borderRadius: 7, position: "relative" }}
                onClick={() => setSlEnabled((p) => !p)}>
                <div style={{ width: 10, height: 10, background: "#fff", borderRadius: "50%", position: "absolute", top: 2, left: slEnabled ? 16 : 2, transition: "left .15s" }} />
              </div>
              <span className="font-rajdhani text-xs font-bold" style={{ color: slEnabled ? "#ef4444" : "#888" }}>Stop Loss</span>
            </div>
            {slEnabled && (
              <div className="flex items-center gap-1">
                <span className="font-rajdhani text-[10px] text-muted-foreground">$</span>
                <input type="number" min={1} step={1} value={slAmount}
                  onChange={(e) => setSlAmount(parseFloat(e.target.value) || 20)}
                  className="flex-1 px-2 py-1 rounded font-orbitron text-xs bg-background border border-border focus:outline-none text-center" />
              </div>
            )}
          </div>
          <div className="p-3 rounded-lg" style={{ background: "rgba(0,229,255,0.05)", border: "1px solid rgba(0,229,255,0.15)" }}>
            <div className="font-rajdhani text-xs font-bold text-primary mb-2">Limit · {tradesExecuted}{tradeLimit > 0 ? `/${tradeLimit}` : ""}</div>
            <div className="flex gap-1 flex-wrap">
              {[0, 20, 50, 100].map((v) => (
                <button key={v} onClick={() => setTradeLimit(v)}
                  className="px-2 py-0.5 rounded font-orbitron text-[10px] font-bold transition-all"
                  style={tradeLimit === v
                    ? { background: "#00e5ff", color: "#050a0f" }
                    : { background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)", color: "#888" }}>
                  {v === 0 ? "∞" : v}
                </button>
              ))}
            </div>
            {tradesExecuted > 0 && (
              <button onClick={() => { setTradesExecuted(0); setLossStreak(0); }}
                className="mt-1 flex items-center gap-1 font-rajdhani text-[10px] text-muted-foreground hover:text-foreground">
                <RefreshCw size={9} /> Reset
              </button>
            )}
          </div>
          <div className="p-3 rounded-lg" style={{ background: "rgba(250,204,21,0.05)", border: "1px solid rgba(250,204,21,0.15)" }}>
            <div className="font-rajdhani text-xs font-bold text-yellow-400 mb-2">Auto Interval</div>
            <div className="flex gap-1 flex-wrap mb-1">
              {[5, 10, 15, 30].map((v) => (
                <button key={v} onClick={() => setAutoInterval(v)}
                  className="px-2 py-0.5 rounded font-orbitron text-[10px] font-bold transition-all"
                  style={autoInterval === v
                    ? { background: "#facc15", color: "#050a0f" }
                    : { background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)", color: "#888" }}>
                  {v}s
                </button>
              ))}
            </div>
            <div className="flex items-center gap-1">
              <input type="number" min={3} max={300} value={autoInterval}
                onChange={(e) => setAutoInterval(Math.max(3, parseInt(e.target.value) || 10))}
                className="w-16 px-2 py-1 rounded font-orbitron text-[10px] bg-background border border-border focus:outline-none text-center" />
              <span className="font-rajdhani text-[10px] text-muted-foreground">s</span>
            </div>
          </div>
        </div>
      )}

      {/* ── Blocked ───────────────────────────────────────────────────────────── */}
      {blocked && (
        <div className="flex items-center gap-2 p-3 rounded-lg" style={{ background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.3)" }}>
          <ShieldCheck size={14} className="text-red-400 flex-shrink-0" />
          <span className="font-rajdhani text-xs text-red-400 font-bold">
            {tpHit ? `Take Profit +$${tpAmount}` : slHit ? `Stop Loss -$${slAmount}` : `Trade limit (${tradeLimit})`} — Speed Lab paused
          </span>
          <button onClick={() => resetAll()}
            className="ml-auto font-rajdhani text-[10px] text-muted-foreground hover:text-foreground underline">Reset & Resume</button>
        </div>
      )}

      {/* ── Session Stats ─────────────────────────────────────────────────────── */}
      {total > 0 && (
        <div className="rounded-xl border p-3" style={{ borderColor: "rgba(255,255,255,0.08)", background: "rgba(0,0,0,0.2)" }}>
          <div className="flex items-center gap-3 flex-wrap">
            <div className="grid grid-cols-3 md:grid-cols-6 gap-2 flex-1">
              {[
                { label: "WINS",    val: wins,    color: "#22c55e" },
                { label: "LOSSES",  val: losses,  color: "#ef4444" },
                { label: "WIN%",    val: `${wr}%`, color: wr >= 60 ? "#22c55e" : wr >= 45 ? "#facc15" : "#ef4444" },
                { label: "TRADES",  val: total,   color: "#00e5ff" },
                { label: "SESSION", val: `${sessionPL >= 0 ? "+" : ""}$${sessionPL.toFixed(2)}`, color: sessionPL >= 0 ? "#22c55e" : "#ef4444" },
                { label: "BATCHES", val: Math.ceil(tradesExecuted / Math.max(1, aiMode ? selectedMarkets.length : manualContractCount)), color: "#a78bfa" },
              ].map(({ label, val, color }) => (
                <div key={label} className="text-center p-2 rounded-lg" style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.07)" }}>
                  <div className="font-rajdhani text-[9px] text-muted-foreground tracking-widest">{label}</div>
                  <div className="font-orbitron text-sm font-bold" style={{ color }}>{val}</div>
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

      {/* ── Execute Buttons ───────────────────────────────────────────────────── */}
      <div className="flex flex-wrap gap-3">
        <button
          onClick={() => void executeLab()}
          disabled={deriv.status !== "connected" || isBusy || blocked || (aiMode ? selectedMarkets.length === 0 || selectedContracts.length === 0 : manualContractCount === 0)}
          className="flex items-center gap-2 px-6 py-3.5 rounded-xl font-orbitron text-sm font-bold tracking-wider transition-all disabled:opacity-40"
          style={{ background: aiMode ? "linear-gradient(135deg, #00e5ff, #7c3aed)" : "linear-gradient(135deg, #e91e8c, #7c3aed)", color: "#fff", boxShadow: aiMode ? "0 0 24px rgba(0,229,255,0.25)" : "0 0 24px rgba(233,30,140,0.25)" }}>
          {fetchingSignals
            ? <><ScanLine size={16} className="animate-pulse" /> Scanning {selectedMarkets.length} markets…</>
            : executing
              ? <><Loader size={16} className="animate-spin" /> Executing…</>
              : aiMode
                ? <><Brain size={16} /> AI Execute · {selectedMarkets.length} markets</>
                : <><Rocket size={16} /> Execute All · {manualContractCount} contracts · ${(currentStake * manualContractCount).toFixed(2)}</>}
        </button>
        <button
          onClick={() => {
            if (autoMode) {
              // Stopping auto → full reset to defaults
              resetAll();
            } else {
              setAutoMode(true);
            }
          }}
          disabled={deriv.status !== "connected" || blocked || (aiMode ? selectedMarkets.length === 0 : manualContractCount === 0)}
          className="flex items-center gap-2 px-6 py-3.5 rounded-xl font-orbitron text-sm font-bold tracking-wider transition-all disabled:opacity-40"
          style={autoMode
            ? { background: "rgba(239,68,68,0.15)", border: "2px solid #ef4444", color: "#ef4444" }
            : { background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.15)", color: "#888" }}>
          {autoMode ? <><Square size={16} /> Stop & Reset</> : <><Bot size={16} /> Auto Lab</>}
        </button>
      </div>

      {autoMode && !coolingOff && (
        <div className="flex items-center gap-3 font-rajdhani text-sm" style={{ color: "#e91e8c" }}>
          <div className="w-2.5 h-2.5 rounded-full animate-pulse" style={{ background: "#e91e8c" }} />
          {aiMode ? `AI Lab scanning · ${selectedMarkets.length} markets every ${autoInterval}s` : `Speed Lab · ${manualContractCount} contracts every ${autoInterval}s`}
          {tradeLimit > 0 && <span className="text-muted-foreground">· {tradesExecuted}/{tradeLimit} trades</span>}
        </div>
      )}

      {coolingOff && (
        <div className="flex items-center gap-3 px-3 py-2 rounded-lg font-rajdhani text-sm animate-pulse"
          style={{ background: "rgba(250,204,21,0.08)", border: "1px solid rgba(250,204,21,0.25)", color: "#facc15" }}>
          <ScanLine size={14} />
          3 clean wins — cooling off · scanning for next setup…
        </div>
      )}

      {/* ── AI Scan Results ───────────────────────────────────────────────────── */}
      {aiMode && Object.keys(aiScans).length > 0 && (
        <AiScanPanel scans={aiScans} markets={selectedMarkets} />
      )}

      {/* ── Trade Log ─────────────────────────────────────────────────────────── */}
      {trades.length > 0 && (
        <div className="rounded-xl border overflow-hidden" style={{ borderColor: "rgba(233,30,140,0.2)" }}>
          <div className="px-4 py-2.5 border-b flex items-center justify-between" style={{ borderColor: "rgba(233,30,140,0.15)", background: "rgba(0,0,0,0.3)" }}>
            <span className="font-orbitron text-xs font-bold tracking-wider" style={{ color: "#e91e8c" }}>
              TRADE LOG · {trades.length} entries · {wins}W / {losses}L
            </span>
            <button onClick={() => resetAll()}
              className="font-rajdhani text-[10px] text-muted-foreground hover:text-foreground transition-colors">clear &amp; reset</button>
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
              const batchLoss = batch.filter((t) => t.status === "lost").length;
              return (
                <div key={gid} className="border-b last:border-0" style={{ borderColor: "rgba(233,30,140,0.08)" }}>
                  <div className="px-3 py-1.5 flex items-center gap-2" style={{ background: "rgba(233,30,140,0.05)" }}>
                    <Zap size={9} style={{ color: "#e91e8c" }} />
                    <span className="font-orbitron text-[9px] font-bold" style={{ color: "#e91e8c" }}>
                      BATCH · {batch.length} contracts
                    </span>
                    <span className="font-rajdhani text-[9px] text-muted-foreground ml-auto">
                      {batchWins}W / {batchLoss}L
                      <span className="ml-1.5 font-orbitron font-bold" style={{ color: batchPL >= 0 ? "#22c55e" : "#ef4444" }}>
                        {batchPL >= 0 ? "+" : ""}${batchPL.toFixed(2)}
                      </span>
                    </span>
                  </div>
                  {batch.map((t) => {
                    const isAI = t.label.startsWith("[AI");
                    const aiMatch = t.label.match(/\[AI (\d+)%\]/);
                    const aiConf = aiMatch ? parseInt(aiMatch[1]) : null;
                    return (
                      <div key={t.id} className="flex items-center gap-2 px-4 py-2 border-b last:border-0 hover:bg-white/2 transition-colors"
                        style={{ borderColor: "rgba(255,255,255,0.04)" }}>
                        {(t.status === "pending" || t.status === "open") ? (
                          <Loader size={10} className="animate-spin text-muted-foreground flex-shrink-0" />
                        ) : t.status === "won" ? (
                          <CheckCircle size={10} className="text-green-400 flex-shrink-0" />
                        ) : (
                          <XCircle size={10} className="text-red-400 flex-shrink-0" />
                        )}
                        {isAI && aiConf !== null && (
                          <span className="px-1.5 py-0.5 rounded font-orbitron text-[8px] font-bold flex-shrink-0"
                            style={{ background: aiConf >= 75 ? "rgba(34,197,94,0.2)" : aiConf >= 65 ? "rgba(250,204,21,0.2)" : "rgba(255,255,255,0.1)", color: aiConf >= 75 ? "#22c55e" : aiConf >= 65 ? "#facc15" : "#aaa", border: `1px solid ${aiConf >= 75 ? "rgba(34,197,94,0.3)" : "rgba(255,255,255,0.1)"}` }}>
                            AI {aiConf}%
                          </span>
                        )}
                        <span className="font-orbitron text-[10px] font-bold flex-1 truncate"
                          style={{ color: t.status === "won" ? "#22c55e" : t.status === "lost" ? "#ef4444" : "#aaa" }}>
                          {t.label.replace(/\[AI \d+%\] /, "")}
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
                          {(t.status === "pending" || t.status === "open" || t.status === "settling") && (
                            <span className="font-rajdhani text-[9px] animate-pulse" style={{ color: "#e91e8c" }}>
                              {t.status === "open" ? "open" : t.status === "settling" ? "settling…" : "pending…"}
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Empty state ───────────────────────────────────────────────────────── */}
      {trades.length === 0 && !isBusy && (
        <div className="text-center py-10">
          <TrendingUp size={32} className="mx-auto mb-2 text-muted-foreground opacity-30" />
          <p className="font-rajdhani text-sm text-muted-foreground">
            {aiMode ? "Connect to Deriv, select markets & contract types, then hit AI Execute" : "Connect to Deriv and select markets + contracts to start"}
          </p>
        </div>
      )}
    </div>
  );
}
