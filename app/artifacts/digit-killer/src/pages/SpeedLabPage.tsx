/**
 * Speed Lab — execute contracts across multiple markets and multiple contract
 * types simultaneously at maximum speed. All proposals are pre-cached so buy
 * orders fire the instant the user hits Execute.
 *
 * Logic feed: digit N from market tick → all contracts on that market that
 * depend on that digit update correctly (Even/Odd/Match/Differ/Over/Under).
 */
import { useState, useRef, useCallback, useEffect } from "react";
import {
  Rocket, Play, Square, Bot, CheckCircle, XCircle, Loader,
  AlertCircle, ShieldCheck, Plus, X as XIcon, Zap, Settings2, RefreshCw,
} from "lucide-react";
import { useDerivContext } from "@/context/DerivContext";
import DerivConnectionBar from "@/components/DerivConnectionBar";
import {
  executeBulk, nextStake, bulkGroupId,
  type TradeResult, type TradeSpec,
} from "@/lib/tradeEngine";

// ─── All available contract types ─────────────────────────────────────────────
interface ContractDef {
  id: string;
  label: string;
  contract_type: string;
  barrier?: number | string;
  digit?: number;
  defaultTicks: number;
  color: string;
  category: string;
}

const ALL_CONTRACTS: ContractDef[] = [
  { id: "EVEN",      label: "Even",       contract_type: "DIGITEVEN",  defaultTicks: 5, color: "#00e5ff", category: "Digits" },
  { id: "ODD",       label: "Odd",        contract_type: "DIGITODD",   defaultTicks: 5, color: "#a78bfa", category: "Digits" },
  { id: "MATCH0",    label: "Match 0",    contract_type: "DIGITMATCH",  digit: 0, defaultTicks: 5, color: "#22c55e", category: "Digits" },
  { id: "MATCH1",    label: "Match 1",    contract_type: "DIGITMATCH",  digit: 1, defaultTicks: 5, color: "#22c55e", category: "Digits" },
  { id: "MATCH5",    label: "Match 5",    contract_type: "DIGITMATCH",  digit: 5, defaultTicks: 5, color: "#22c55e", category: "Digits" },
  { id: "MATCH9",    label: "Match 9",    contract_type: "DIGITMATCH",  digit: 9, defaultTicks: 5, color: "#22c55e", category: "Digits" },
  { id: "DIFFER5",   label: "Differ 5",   contract_type: "DIGITDIFF",   digit: 5, defaultTicks: 5, color: "#fb923c", category: "Digits" },
  { id: "OVER4",     label: "Over 4",     contract_type: "DIGITOVER",  barrier: 4, defaultTicks: 5, color: "#f59e0b", category: "Digits" },
  { id: "OVER5",     label: "Over 5",     contract_type: "DIGITOVER",  barrier: 5, defaultTicks: 5, color: "#f59e0b", category: "Digits" },
  { id: "UNDER4",    label: "Under 4",    contract_type: "DIGITUNDER", barrier: 4, defaultTicks: 5, color: "#e91e8c", category: "Digits" },
  { id: "UNDER5",    label: "Under 5",    contract_type: "DIGITUNDER", barrier: 5, defaultTicks: 5, color: "#e91e8c", category: "Digits" },
  { id: "RISE",      label: "Rise",       contract_type: "CALL",       defaultTicks: 5, color: "#22c55e", category: "Rise/Fall" },
  { id: "FALL",      label: "Fall",       contract_type: "PUT",        defaultTicks: 5, color: "#ef4444", category: "Rise/Fall" },
  { id: "RUNHIGH",   label: "Only Up",    contract_type: "RUNHIGH",    defaultTicks: 5, color: "#4ade80", category: "Only" },
  { id: "RUNLOW",    label: "Only Down",  contract_type: "RUNLOW",     defaultTicks: 5, color: "#f87171", category: "Only" },
  { id: "HIGHTICK",  label: "High Tick",  contract_type: "HIGHERTICK", barrier: 3, defaultTicks: 5, color: "#fbbf24", category: "Tick" },
  { id: "LOWTICK",   label: "Low Tick",   contract_type: "LOWERTICK",  barrier: 3, defaultTicks: 5, color: "#60a5fa", category: "Tick" },
];

const CONTRACT_CATEGORIES = ["Digits", "Rise/Fall", "Only", "Tick"];

// All Deriv synthetic markets available for Speed Lab
const ALL_MARKETS = [
  // Volatility standard
  { key: "R_10",     label: "Vol 10",      group: "Volatility" },
  { key: "R_25",     label: "Vol 25",      group: "Volatility" },
  { key: "R_50",     label: "Vol 50",      group: "Volatility" },
  { key: "R_75",     label: "Vol 75",      group: "Volatility" },
  { key: "R_100",    label: "Vol 100",     group: "Volatility" },
  // Volatility 1s
  { key: "1HZ10V",   label: "V10 (1s)",    group: "Volatility 1s" },
  { key: "1HZ15V",   label: "V15 (1s)",    group: "Volatility 1s" },
  { key: "1HZ25V",   label: "V25 (1s)",    group: "Volatility 1s" },
  { key: "1HZ30V",   label: "V30 (1s)",    group: "Volatility 1s" },
  { key: "1HZ50V",   label: "V50 (1s)",    group: "Volatility 1s" },
  { key: "1HZ75V",   label: "V75 (1s)",    group: "Volatility 1s" },
  { key: "1HZ90V",   label: "V90 (1s)",    group: "Volatility 1s" },
  { key: "1HZ100V",  label: "V100 (1s)",   group: "Volatility 1s" },
  // Daily Reset / Market Indices
  { key: "RDBEAR",   label: "Bear Market", group: "Market" },
  { key: "RDBULL",   label: "Bull Market", group: "Market" },
  { key: "STPINDXV", label: "Step Index",  group: "Market" },
  // Crash / Boom
  { key: "CRASH300N", label: "Crash 300",  group: "Crash/Boom" },
  { key: "CRASH500",  label: "Crash 500",  group: "Crash/Boom" },
  { key: "CRASH1000", label: "Crash 1000", group: "Crash/Boom" },
  { key: "BOOM300N",  label: "Boom 300",   group: "Crash/Boom" },
  { key: "BOOM500",   label: "Boom 500",   group: "Crash/Boom" },
  { key: "BOOM1000",  label: "Boom 1000",  group: "Crash/Boom" },
  // Jump
  { key: "JD10",     label: "Jump 10",     group: "Jump" },
  { key: "JD25",     label: "Jump 25",     group: "Jump" },
  { key: "JD50",     label: "Jump 50",     group: "Jump" },
  { key: "JD75",     label: "Jump 75",     group: "Jump" },
  { key: "JD100",    label: "Jump 100",    group: "Jump" },
];

// ─── Speed Lab Page ────────────────────────────────────────────────────────────
export default function SpeedLabPage() {
  const deriv = useDerivContext();

  // ── Market selection ─────────────────────────────────────────────────────────
  const [selectedMarkets, setSelectedMarkets] = useState<string[]>(["R_50"]);

  const toggleMarket = (key: string) => {
    setSelectedMarkets((p) => p.includes(key) ? p.filter((m) => m !== key) : [...p, key]);
  };

  // ── Contract selection ───────────────────────────────────────────────────────
  const [selectedContracts, setSelectedContracts] = useState<string[]>(["EVEN", "ODD"]);

  const toggleContract = (id: string) => {
    setSelectedContracts((p) => p.includes(id) ? p.filter((c) => c !== id) : [...p, id]);
  };

  // ── Duration per contract type ───────────────────────────────────────────────
  const [ticksMap, setTicksMap] = useState<Record<string, number>>(() =>
    Object.fromEntries(ALL_CONTRACTS.map((c) => [c.id, c.defaultTicks]))
  );

  // ── Stake + Martingale ───────────────────────────────────────────────────────
  const [baseStake,    setBaseStake   ] = useState(1);
  const [martingaleOn, setMartingaleOn] = useState(false);
  const [martMult,     setMartMult    ] = useState(2);
  const [lossStreak,   setLossStreak  ] = useState(0);

  // ── TP / SL ──────────────────────────────────────────────────────────────────
  const [tpEnabled, setTpEnabled] = useState(false);
  const [tpAmount,  setTpAmount ] = useState(50);
  const [slEnabled, setSlEnabled] = useState(false);
  const [slAmount,  setSlAmount ] = useState(20);
  const [sessionPL, setSessionPL] = useState(0);

  // ── Trade limit ──────────────────────────────────────────────────────────────
  const [tradeLimit,     setTradeLimit    ] = useState(0);
  const [tradesExecuted, setTradesExecuted] = useState(0);

  // ── Auto mode ────────────────────────────────────────────────────────────────
  const [autoMode, setAutoMode] = useState(false);
  const [autoInterval, setAutoInterval] = useState(10); // seconds between batches

  // ── State ────────────────────────────────────────────────────────────────────
  const [executing,    setExecuting  ] = useState(false);
  const [trades,       setTrades     ] = useState<TradeResult[]>([]);
  const [showSettings, setShowSettings] = useState(false);
  const [activeCategory, setActiveCategory] = useState("Digits");

  const currentStake = martingaleOn ? nextStake(baseStake, martMult, lossStreak) : baseStake;
  const tpHit    = tpEnabled && sessionPL >= tpAmount;
  const slHit    = slEnabled && sessionPL <= -slAmount;
  const limitHit = tradeLimit > 0 && tradesExecuted >= tradeLimit;
  const blocked  = tpHit || slHit || limitHit;

  const wins   = trades.filter((t) => t.status === "won").length;
  const losses = trades.filter((t) => t.status === "lost").length;
  const total  = wins + losses;
  const wr     = total > 0 ? Math.round((wins / total) * 100) : 0;

  // How many contracts will fire per execute
  const contractCount = selectedMarkets.length * selectedContracts.length;

  const updateTrade = useCallback((update: Partial<TradeResult> & { id: string }) => {
    setTrades((prev) => {
      const existing = prev.find((t) => t.id === update.id);
      if (!existing) return [update as TradeResult, ...prev.slice(0, 199)];
      return prev.map((t) => t.id === update.id ? { ...t, ...update } : t);
    });
  }, []);

  async function executeLab() {
    if (deriv.status !== "connected" || blocked || executing) return;
    if (selectedMarkets.length === 0 || selectedContracts.length === 0) return;
    const currency = deriv.account?.currency ?? "USD";
    const gid = bulkGroupId();
    const stake = currentStake;
    const total_count = selectedMarkets.length * selectedContracts.length;

    // Build ALL specs: every market × every selected contract type
    const specs: TradeSpec[] = [];
    let idx = 0;
    for (const mkt of selectedMarkets) {
      for (const cid of selectedContracts) {
        const def = ALL_CONTRACTS.find((c) => c.id === cid);
        if (!def) continue;
        specs.push({
          contract_type: def.contract_type,
          symbol: mkt,
          stake,
          ticks: ticksMap[cid] ?? def.defaultTicks,
          barrier: def.barrier,
          digit: def.digit,
          label: `${ALL_MARKETS.find((m) => m.key === mkt)?.label ?? mkt} · ${def.label}`,
          confidence: 100,
          bulk_group: gid,
          bulk_index: idx++,
          bulk_total: total_count,
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
    } catch { /* handled per-trade */ }
    setExecuting(false);
  }

  // Auto mode — fires repeatedly
  const autoRef = useRef<ReturnType<typeof setInterval> | null>(null);
  useEffect(() => {
    if (!autoMode || deriv.status !== "connected" || blocked || limitHit) {
      if (autoRef.current) { clearInterval(autoRef.current); autoRef.current = null; }
      if (limitHit) setAutoMode(false);
      return;
    }
    if (autoRef.current) return;
    autoRef.current = setInterval(() => {
      if (!executing && !blocked) void executeLab();
    }, autoInterval * 1000);
    return () => { if (autoRef.current) { clearInterval(autoRef.current); autoRef.current = null; } };
  }, [autoMode, deriv.status, blocked, executing, autoInterval, limitHit]);

  return (
    <div className="space-y-4 max-w-5xl mx-auto">
      {/* Page header */}
      <div className="flex items-center gap-3">
        <div className="p-2.5 rounded-xl" style={{ background: "rgba(233,30,140,0.1)", border: "1px solid rgba(233,30,140,0.3)" }}>
          <Rocket size={22} style={{ color: "#e91e8c" }} />
        </div>
        <div>
          <h1 className="font-orbitron text-xl font-bold text-foreground tracking-wider">SPEED LAB</h1>
          <p className="font-rajdhani text-sm text-muted-foreground">
            All selected contracts × all selected markets in parallel · accurate real-time P&amp;L
          </p>
        </div>
        <div className="ml-auto flex items-center gap-2 px-3 py-1.5 rounded-lg"
          style={{ background: "rgba(233,30,140,0.1)", border: "1px solid rgba(233,30,140,0.25)" }}>
          <Zap size={12} style={{ color: "#e91e8c" }} />
          <span className="font-orbitron text-xs font-bold" style={{ color: "#e91e8c" }}>
            {contractCount} contracts / batch
          </span>
        </div>
      </div>

      {/* Connection bar */}
      <DerivConnectionBar />

      {/* ── Market selection ──────────────────────────────────────────────────── */}
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
            <button key={m.key} onClick={() => toggleMarket(m.key)}
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
        <div className="flex items-center justify-between mb-3">
          <span className="font-orbitron text-xs font-bold tracking-wider" style={{ color: "#e91e8c" }}>
            CONTRACTS ({selectedContracts.length} selected)
          </span>
          <div className="flex gap-2">
            <button onClick={() => setSelectedContracts(ALL_CONTRACTS.map((c) => c.id))}
              className="font-rajdhani text-[10px] text-muted-foreground hover:text-pink-400 transition-colors">All</button>
            <button onClick={() => setSelectedContracts([])}
              className="font-rajdhani text-[10px] text-muted-foreground hover:text-red-400 transition-colors">Clear</button>
          </div>
        </div>

        {/* Category tabs */}
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
              <button onClick={() => toggleContract(def.id)}
                className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg font-orbitron text-[10px] font-bold transition-all border"
                style={selectedContracts.includes(def.id)
                  ? { background: def.color, color: "#050a0f", borderColor: def.color }
                  : { background: `${def.color}10`, borderColor: `${def.color}30`, color: def.color }}>
                {selectedContracts.includes(def.id) && <CheckCircle size={9} />}
                {def.label}
              </button>
              {selectedContracts.includes(def.id) && (
                <div className="flex items-center gap-1">
                  <span className="font-rajdhani text-[9px] text-muted-foreground">T:</span>
                  <select
                    value={ticksMap[def.id] ?? def.defaultTicks}
                    onChange={(e) => setTicksMap((p) => ({ ...p, [def.id]: parseInt(e.target.value) }))}
                    className="text-[10px] font-orbitron bg-background border border-border rounded px-1 py-0.5 text-foreground focus:outline-none"
                  >
                    {[1, 2, 3, 5, 10].map((t) => <option key={t} value={t}>{t}T</option>)}
                  </select>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* ── Stake + Martingale row ────────────────────────────────────────────── */}
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
          <div className="font-rajdhani text-[10px] text-muted-foreground">
            Total per batch: <span className="text-primary font-orbitron">${(currentStake * contractCount).toFixed(2)}</span>
          </div>
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
                  onChange={(e) => setMartMult(parseFloat(e.target.value))}
                  className="flex-1 accent-yellow-400" />
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
          {/* TP */}
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
                <input type="number" min={1} step={1} value={tpAmount} onChange={(e) => setTpAmount(parseFloat(e.target.value) || 50)}
                  className="flex-1 px-2 py-1 rounded font-orbitron text-xs bg-background border border-border focus:outline-none text-center" />
              </div>
            )}
          </div>

          {/* SL */}
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
                <input type="number" min={1} step={1} value={slAmount} onChange={(e) => setSlAmount(parseFloat(e.target.value) || 20)}
                  className="flex-1 px-2 py-1 rounded font-orbitron text-xs bg-background border border-border focus:outline-none text-center" />
              </div>
            )}
          </div>

          {/* Trade limit */}
          <div className="p-3 rounded-lg" style={{ background: "rgba(0,229,255,0.05)", border: "1px solid rgba(0,229,255,0.15)" }}>
            <div className="font-rajdhani text-xs font-bold text-primary mb-2">
              Limit · {tradesExecuted}{tradeLimit > 0 ? `/${tradeLimit}` : ""}
            </div>
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

          {/* Auto interval */}
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
              <span className="font-rajdhani text-[10px] text-muted-foreground">seconds</span>
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
          <button onClick={() => { setSessionPL(0); setTradesExecuted(0); setLossStreak(0); setAutoMode(false); }}
            className="ml-auto font-rajdhani text-[10px] text-muted-foreground hover:text-foreground underline">Reset & Resume</button>
        </div>
      )}

      {/* ── Stats ─────────────────────────────────────────────────────────────── */}
      {total > 0 && (
        <div className="grid grid-cols-4 md:grid-cols-6 gap-2">
          {[
            { label: "WINS",    val: wins,    color: "#22c55e" },
            { label: "LOSSES",  val: losses,  color: "#ef4444" },
            { label: "WIN%",    val: `${wr}%`, color: wr >= 60 ? "#22c55e" : wr >= 45 ? "#facc15" : "#ef4444" },
            { label: "TRADES",  val: total,   color: "#00e5ff" },
            { label: "SESSION", val: `${sessionPL >= 0 ? "+" : ""}$${sessionPL.toFixed(2)}`, color: sessionPL >= 0 ? "#22c55e" : "#ef4444" },
            { label: "BATCHES", val: Math.ceil(total / Math.max(1, contractCount)), color: "#a78bfa" },
          ].map(({ label, val, color }) => (
            <div key={label} className="text-center p-2 rounded-lg" style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.07)" }}>
              <div className="font-rajdhani text-[9px] text-muted-foreground tracking-widest">{label}</div>
              <div className="font-orbitron text-sm font-bold" style={{ color }}>{val}</div>
            </div>
          ))}
        </div>
      )}

      {/* ── Execute buttons ───────────────────────────────────────────────────── */}
      <div className="flex flex-wrap gap-3">
        <button
          onClick={() => void executeLab()}
          disabled={deriv.status !== "connected" || executing || blocked || contractCount === 0}
          className="flex items-center gap-2 px-6 py-3.5 rounded-xl font-orbitron text-sm font-bold tracking-wider transition-all disabled:opacity-40"
          style={{ background: "linear-gradient(135deg, #e91e8c, #7c3aed)", color: "#fff", boxShadow: "0 0 24px rgba(233,30,140,0.25)" }}>
          {executing ? <Loader size={16} className="animate-spin" /> : <Rocket size={16} />}
          {executing
            ? `Executing ${contractCount} contracts…`
            : `Execute All · ${contractCount} Contracts · $${(currentStake * contractCount).toFixed(2)}`}
        </button>
        <button
          onClick={() => setAutoMode((p) => !p)}
          disabled={deriv.status !== "connected" || blocked || contractCount === 0}
          className="flex items-center gap-2 px-6 py-3.5 rounded-xl font-orbitron text-sm font-bold tracking-wider transition-all disabled:opacity-40"
          style={autoMode
            ? { background: "rgba(239,68,68,0.15)", border: "2px solid #ef4444", color: "#ef4444" }
            : { background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.15)", color: "#888" }}>
          {autoMode ? <><Square size={16} /> Stop Auto Lab</> : <><Bot size={16} /> Auto Lab</>}
        </button>
      </div>

      {autoMode && (
        <div className="flex items-center gap-3 font-rajdhani text-sm" style={{ color: "#e91e8c" }}>
          <div className="w-2.5 h-2.5 rounded-full animate-pulse" style={{ background: "#e91e8c" }} />
          Speed Lab running · {contractCount} contracts every {autoInterval}s
          {tradeLimit > 0 && <span className="text-muted-foreground">· {tradesExecuted}/{tradeLimit} trades</span>}
        </div>
      )}

      {/* ── Trade log ─────────────────────────────────────────────────────────── */}
      {trades.length > 0 && (
        <div className="rounded-xl border overflow-hidden" style={{ borderColor: "rgba(233,30,140,0.2)" }}>
          <div className="px-4 py-2.5 border-b flex items-center justify-between" style={{ borderColor: "rgba(233,30,140,0.15)", background: "rgba(0,0,0,0.3)" }}>
            <span className="font-orbitron text-xs font-bold tracking-wider" style={{ color: "#e91e8c" }}>
              SPEED LAB LOG · {trades.length} entries · {wins}W / {losses}L
            </span>
            <button onClick={() => setTrades([])} className="font-rajdhani text-[10px] text-muted-foreground hover:text-foreground transition-colors">clear</button>
          </div>
          <div className="max-h-80 overflow-y-auto">
            {/* Group by bulk_group */}
            {Object.entries(
              trades.reduce((acc, t) => {
                const gid = t.bulk_group ?? t.id;
                if (!acc[gid]) acc[gid] = [];
                acc[gid].push(t);
                return acc;
              }, {} as Record<string, TradeResult[]>)
            ).map(([gid, batch]) => (
              <div key={gid} className="border-b last:border-0" style={{ borderColor: "rgba(233,30,140,0.08)" }}>
                <div className="px-3 py-1.5 flex items-center gap-2" style={{ background: "rgba(233,30,140,0.05)" }}>
                  <Zap size={9} style={{ color: "#e91e8c" }} />
                  <span className="font-orbitron text-[9px] font-bold" style={{ color: "#e91e8c" }}>
                    BATCH · {batch.length} contracts
                  </span>
                  <span className="font-rajdhani text-[9px] text-muted-foreground ml-auto">
                    W:{batch.filter((t) => t.status === "won").length} /
                    L:{batch.filter((t) => t.status === "lost").length}
                    {" · "}P/L: {
                      (() => {
                        const p = batch.reduce((s, t) => s + (t.profit ?? 0), 0);
                        return `${p >= 0 ? "+" : ""}$${p.toFixed(2)}`;
                      })()
                    }
                  </span>
                </div>
                {batch.map((t) => (
                  <div key={t.id} className="flex items-center gap-2 px-4 py-1.5 border-b last:border-0 hover:bg-white/2 transition-colors"
                    style={{ borderColor: "rgba(255,255,255,0.04)" }}>
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
                    <span className="font-rajdhani text-[9px] text-muted-foreground flex-shrink-0">
                      ${t.stake.toFixed(2)}
                      {t.entry_spot ? ` e:${t.entry_spot}` : ""}
                      {t.exit_spot  ? ` x:${t.exit_spot}` : ""}
                    </span>
                    <span className="font-orbitron text-[10px] font-bold flex-shrink-0 w-16 text-right"
                      style={{ color: t.profit != null ? (t.profit >= 0 ? "#22c55e" : "#ef4444") : "#888" }}>
                      {t.profit != null ? `${t.profit >= 0 ? "+" : ""}$${t.profit.toFixed(2)}` : t.status.toUpperCase()}
                    </span>
                  </div>
                ))}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
