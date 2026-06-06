import { useState, useEffect, useMemo } from "react";
import {
  useGetMatchDifferSignals,
  getGetMatchDifferSignalsQueryKey,
} from "@workspace/api-client-react";
import { useSymbol } from "@/context/SymbolContext";
import { Target, Crosshair, AlertCircle, ChevronDown } from "lucide-react";
import AutoTradePanel, { type TradeSignal } from "@/components/AutoTradePanel";
import DerivConnectionBar from "@/components/DerivConnectionBar";

const DIGIT_COLORS: Record<number, string> = {
  0: "#00897b", 1: "#1e88e5", 2: "#8e24aa", 3: "#43a047", 4: "#fb8c00",
  5: "#00e5ff", 6: "#c6e500", 7: "#e53935", 8: "#e91e8c", 9: "#fdd835",
};

interface DigitStat { digit: number; percentage: number; rank: number; count: number; }

const TICK_PRESETS = [200, 500, 1000, 2000];

const MARKET_GROUPS = [
  { label: "Volatility", symbols: [
    { key: "R_10", label: "Volatility 10" }, { key: "R_25", label: "Volatility 25" },
    { key: "R_50", label: "Volatility 50" }, { key: "R_75", label: "Volatility 75" },
    { key: "R_100", label: "Volatility 100" },
    { key: "1HZ10V", label: "Vol 10 (1s)" }, { key: "1HZ25V", label: "Vol 25 (1s)" },
    { key: "1HZ50V", label: "Vol 50 (1s)" }, { key: "1HZ75V", label: "Vol 75 (1s)" },
    { key: "1HZ100V", label: "Vol 100 (1s)" },
  ]},
  { label: "Crash/Boom", symbols: [
    { key: "CRASH300N", label: "Crash 300" }, { key: "CRASH500", label: "Crash 500" },
    { key: "CRASH1000", label: "Crash 1000" }, { key: "BOOM300N", label: "Boom 300" },
    { key: "BOOM500", label: "Boom 500" }, { key: "BOOM1000", label: "Boom 1000" },
  ]},
  { label: "Jump", symbols: [
    { key: "JD10", label: "Jump 10" }, { key: "JD25", label: "Jump 25" },
    { key: "JD50", label: "Jump 50" }, { key: "JD75", label: "Jump 75" },
    { key: "JD100", label: "Jump 100" },
  ]},
];
const ALL_SYMBOLS = MARKET_GROUPS.flatMap((g) => g.symbols);

function useLiveTick(symbol: string) {
  const [live, setLive] = useState<{ price: number; digit: number } | null>(null);
  useEffect(() => {
    if (!symbol) return;
    let es: EventSource; let dead = false;
    const open = () => {
      es = new EventSource(`/api/live-ticks?symbol=${encodeURIComponent(symbol)}`);
      es.onmessage = (e) => { try { if (!dead) setLive(JSON.parse(e.data)); } catch {} };
      es.onerror   = () => { es.close(); if (!dead) setTimeout(open, 2000); };
    };
    open();
    return () => { dead = true; es?.close(); };
  }, [symbol]);
  return live;
}

function DCircleGauge({ digit, percentage, count, isCurrent, role }: {
  digit: number; percentage: number; count: number; isCurrent: boolean;
  role: "most" | "second" | "second-least" | "least" | "mid";
}) {
  const color = DIGIT_COLORS[digit];
  const R = 30; const CX = 36; const CY = 36;
  const circ = 2 * Math.PI * R;
  const filled = circ * (percentage / 100);

  const barColor = role === "most"         ? "#22c55e"
    : role === "second"      ? "#3b82f6"
    : role === "second-least"? "#facc15"
    : role === "least"       ? "#ef4444"
    : "rgba(255,255,255,0.3)";

  return (
    <div className="flex flex-col items-center select-none min-w-0">
      <div className="h-4 flex items-end justify-center mb-0.5">
        {role === "most"          && <span style={{ color: "#22c55e",  fontSize: 9, fontWeight: "bold" }}>●</span>}
        {role === "second"        && <span style={{ color: "#3b82f6",  fontSize: 9, fontWeight: "bold" }}>●</span>}
        {role === "least"         && <span style={{ color: "#ef4444",  fontSize: 9, fontWeight: "bold" }}>●</span>}
        {role === "second-least"  && <span style={{ color: "#facc15",  fontSize: 9, fontWeight: "bold" }}>●</span>}
      </div>
      <svg viewBox="0 0 72 72" style={{ width: "clamp(46px,6.5vw,68px)", height: "clamp(46px,6.5vw,68px)",
        filter: isCurrent ? `drop-shadow(0 0 10px ${color}cc)` : undefined }}>
        <circle cx={CX} cy={CY} r={R} fill="none" stroke="rgba(255,255,255,0.07)" strokeWidth={6} />
        <circle cx={CX} cy={CY} r={R} fill="none" stroke={color}
          strokeWidth={isCurrent ? 8 : 5.5} strokeLinecap="round"
          strokeDasharray={`${filled} ${circ - filled}`}
          transform={`rotate(-90 ${CX} ${CY})`}
          style={{ transition: "stroke-dasharray 0.5s ease" }} />
        <text x={CX} y={CY + 1} textAnchor="middle" dominantBaseline="middle"
          fill={isCurrent ? "#fff" : "rgba(255,255,255,0.85)"}
          fontFamily="Orbitron,monospace" fontWeight={isCurrent ? "900" : "700"}
          fontSize={isCurrent ? 16 : 14}>{digit}</text>
      </svg>
      <div className="font-orbitron font-bold text-center mt-0.5"
        style={{ fontSize: "clamp(9px,1.3vw,11px)", color: isCurrent ? color : "rgba(255,255,255,0.6)" }}>
        {percentage.toFixed(2)}%
      </div>
      <div className="font-rajdhani text-center" style={{ fontSize: "9px", color: "rgba(255,255,255,0.25)" }}>
        {count}
      </div>
      {/* Colored bar below */}
      <div className="mt-1 rounded-full" style={{ width: "clamp(30px,4vw,50px)", height: "3px", background: barColor, opacity: 0.8 }} />
      <div className="h-3 flex items-start justify-center mt-0.5">
        {isCurrent && <span style={{ color, fontSize: 10, fontWeight: "bold" }}>▲</span>}
      </div>
    </div>
  );
}

function MarketDropdown({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [open, setOpen] = useState(false);
  const [group, setGroup] = useState(() =>
    MARKET_GROUPS.find((g) => g.symbols.some((s) => s.key === value))?.label ?? "Volatility"
  );
  const label = ALL_SYMBOLS.find((s) => s.key === value)?.label ?? value;
  const currentGroup = MARKET_GROUPS.find((g) => g.label === group) ?? MARKET_GROUPS[0];

  useEffect(() => {
    if (!open) return;
    const h = (e: MouseEvent) => { if (!(e.target as HTMLElement).closest("[data-md-dd]")) setOpen(false); };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [open]);

  return (
    <div data-md-dd className="relative">
      <button onClick={() => setOpen((p) => !p)}
        className="w-full flex items-center justify-between px-4 py-2.5 rounded-lg font-rajdhani text-sm font-bold"
        style={{ background: "#071a20", border: "1px solid rgba(0,229,255,0.25)", color: "#00e5ff" }}>
        <span className="truncate">{label}</span>
        <ChevronDown size={13} className={`flex-shrink-0 ml-2 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <div data-md-dd className="absolute left-0 right-0 mt-1 rounded-xl overflow-hidden shadow-2xl z-50"
          style={{ background: "#050f14", border: "1px solid rgba(0,229,255,0.2)" }}>
          <div className="flex border-b" style={{ borderColor: "rgba(0,229,255,0.15)" }}>
            {MARKET_GROUPS.map((g) => (
              <button key={g.label} data-md-dd onClick={() => setGroup(g.label)}
                className="flex-1 py-2 font-rajdhani text-xs font-bold"
                style={group === g.label ? { color: "#00e5ff", borderBottom: "2px solid #00e5ff" } : { color: "rgba(255,255,255,0.35)" }}>
                {g.label.split("/")[0]}
              </button>
            ))}
          </div>
          <div className="py-1 max-h-56 overflow-y-auto">
            {currentGroup.symbols.map((s) => (
              <button key={s.key} data-md-dd onClick={() => { onChange(s.key); setOpen(false); }}
                className="w-full flex items-center justify-between px-4 py-2 font-rajdhani text-sm font-semibold"
                style={value === s.key ? { color: "#00e5ff", background: "rgba(0,229,255,0.08)" } : { color: "#a0c8d0" }}>
                {s.label}
                {value === s.key && <div className="w-2 h-2 rounded-full bg-cyan-400 flex-shrink-0" />}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export default function MatchDifferPage() {
  const { symbol, setSymbol } = useSymbol();
  const [tickCount, setTickCount] = useState(1000);
  const liveTick = useLiveTick(symbol);

  const { data, isLoading } = useGetMatchDifferSignals(
    { symbol, count: tickCount } as Parameters<typeof useGetMatchDifferSignals>[0],
    {
      query: {
        enabled: !!symbol,
        queryKey: [...getGetMatchDifferSignalsQueryKey({ symbol }), tickCount],
        refetchInterval: 2000,
      },
    }
  );

  const d = data as Record<string, unknown> | undefined;
  const bestMatch: number    = (d?.best_match as number)      ?? 0;
  const bestDiffer: number   = (d?.best_differ as number)     ?? 9;
  const matchConf: number    = (d?.match_confidence as number) ?? 50;
  const differConf: number   = (d?.differ_confidence as number) ?? 50;
  const reasonMatch: string  = (d?.reason_match as string)    ?? "";
  const reasonDiffer: string = (d?.reason_differ as string)   ?? "";
  const matchStrategy: string  = (d?.match_strategy as string)  ?? "";
  const differStrategy: string = (d?.differ_strategy as string) ?? "";
  const matchFire: boolean     = (d?.match_fire as boolean)     ?? false;
  const differFire: boolean    = (d?.differ_fire as boolean)    ?? false;
  const matchStrategies: string[]  = (d?.match_strategies_triggered as string[])  ?? [];
  const differStrategies: string[] = (d?.differ_strategies_triggered as string[]) ?? [];
  const matchTicks: number  = (d?.match_ticks as number)  ?? 1;
  const differTicks: number = (d?.differ_ticks as number) ?? 1;
  const httpDigit: number    = (d?.current_digit as number)   ?? 0;
  const currentDigit         = liveTick?.digit ?? httpDigit;
  const currentPrice: number = (d?.current_price as number)   ?? 0;

  const rawDigits = (d?.digits as DigitStat[]) ?? [];

  // Assign roles based on rank across full tick count
  const sortedByPct = useMemo(() =>
    [...rawDigits].sort((a, b) => b.percentage - a.percentage),
    [rawDigits]
  );

  const getRole = (digit: number): "most" | "second" | "second-least" | "least" | "mid" => {
    const idx = sortedByPct.findIndex((x) => x.digit === digit);
    if (idx === 0) return "most";
    if (idx === 1) return "second";
    if (idx === sortedByPct.length - 1) return "least";
    if (idx === sortedByPct.length - 2) return "second-least";
    return "mid";
  };

  const digits: DigitStat[] = rawDigits.length > 0
    ? rawDigits
    : Array.from({ length: 10 }, (_, i) => ({ digit: i, percentage: 10, rank: i + 1, count: 0 }));

  const symbolLabel = ALL_SYMBOLS.find((s) => s.key === symbol)?.label ?? symbol;

  return (
    <div className="space-y-4 animate-fade-in-up max-w-4xl" data-testid="page-match-differ">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Target size={18} className="text-primary" />
          <div>
            <h2 className="font-orbitron text-lg font-bold text-primary tracking-wider">MATCH / DIFFER</h2>
            <p className="font-rajdhani text-[10px] text-muted-foreground tracking-widest uppercase">
              Digit Analysis · Best Match & Differ Signals
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 px-2.5 py-1 rounded-full text-xs font-bold"
          style={{ background: "rgba(0,200,83,0.12)", border: "1px solid rgba(0,200,83,0.35)", color: "#00c853" }}>
          <div className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
          {liveTick ? "Live ✓" : "Connecting…"}
        </div>
      </div>

      {/* Market selector */}
      <div className="cyber-card p-3" style={{ background: "#071a20", border: "1px solid rgba(0,229,255,0.15)" }}>
        <div className="font-rajdhani text-[10px] font-bold tracking-widest uppercase mb-2" style={{ color: "#00e5ff" }}>
          Select Market:
        </div>
        <MarketDropdown value={symbol} onChange={setSymbol} />
      </div>

      {/* Price + Digit + Ticks */}
      <div className="grid grid-cols-3 gap-3">
        <div className="cyber-card p-3 col-span-2">
          <div className="font-rajdhani text-[10px] text-muted-foreground tracking-widest uppercase">{symbolLabel}</div>
          <div className="font-orbitron text-2xl md:text-3xl font-bold text-foreground mt-1">
            {currentPrice ? currentPrice.toFixed(currentPrice > 100 ? 2 : 4) : "—"}
          </div>
        </div>
        <div className="cyber-card p-3 flex flex-col items-center justify-center gap-1">
          <div className="font-rajdhani text-[10px] text-muted-foreground tracking-widest uppercase">Now</div>
          <div className="w-12 h-12 rounded-full flex items-center justify-center font-orbitron text-xl font-black text-white transition-all"
            style={{ background: DIGIT_COLORS[currentDigit], boxShadow: `0 0 18px ${DIGIT_COLORS[currentDigit]}80` }}>
            {currentDigit}
          </div>
        </div>
      </div>

      {/* Tick count presets */}
      <div className="cyber-card p-3 flex flex-wrap items-center gap-2">
        <span className="font-rajdhani text-[10px] text-muted-foreground tracking-widest uppercase">Ticks:</span>
        {TICK_PRESETS.map((p) => (
          <button key={p} onClick={() => setTickCount(p)}
            className="px-3 py-1 rounded font-orbitron text-xs font-bold transition-all"
            style={tickCount === p
              ? { background: "#00e5ff", color: "#050a0f" }
              : { background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.12)", color: "#aaa" }}>
            {p}
          </button>
        ))}
        <span className="font-rajdhani text-[10px] text-muted-foreground ml-auto">
          {rawDigits[0]?.count ? `${rawDigits.reduce((s, d) => s + d.count, 0)} loaded` : ""}
        </span>
      </div>

      {/* D-Circle Distribution */}
      <div className="cyber-card p-3 md:p-4">
        <div className="flex items-center justify-between mb-2">
          <div className="font-rajdhani text-sm text-foreground font-semibold">
            Digit Distribution — {tickCount} Ticks
          </div>
          <div className="flex items-center gap-3 text-[9px] font-rajdhani">
            {[
              { color: "#22c55e", label: "Most" },
              { color: "#3b82f6", label: "2nd" },
              { color: "#facc15", label: "2nd Least" },
              { color: "#ef4444", label: "Least" },
            ].map(({ color, label }) => (
              <span key={label} className="flex items-center gap-1">
                <span className="w-2 h-2 rounded-full inline-block" style={{ background: color }} />
                {label}
              </span>
            ))}
          </div>
        </div>

        {isLoading && digits[0]?.count === 0 ? (
          <div className="grid mt-2" style={{ gridTemplateColumns: "repeat(10, minmax(0, 1fr))", gap: "4px" }}>
            {Array.from({ length: 10 }).map((_, i) => (
              <div key={i} className="flex flex-col items-center gap-1">
                <div className="rounded-full bg-muted/20 animate-pulse"
                  style={{ width: "clamp(46px,6.5vw,68px)", height: "clamp(46px,6.5vw,68px)" }} />
              </div>
            ))}
          </div>
        ) : (
          <div className="grid mt-2" style={{ gridTemplateColumns: "repeat(10, minmax(0, 1fr))", gap: "4px" }}>
            {Array.from({ length: 10 }, (_, i) => i).map((dv) => {
              const stat = digits.find((x) => x.digit === dv) ??
                { digit: dv, percentage: 10, rank: dv + 1, count: 0 };
              return (
                <DCircleGauge key={dv} digit={dv} percentage={stat.percentage} count={stat.count}
                  isCurrent={dv === currentDigit} role={getRole(dv)} />
              );
            })}
          </div>
        )}

        {/* Percentage sum check */}
        {rawDigits.length > 0 && (
          <div className="mt-2 text-right font-rajdhani text-[9px] text-muted-foreground">
            Total: {rawDigits.reduce((s, d) => s + d.percentage, 0).toFixed(1)}%
          </div>
        )}
      </div>

      {!d && !isLoading ? (
        <div className="cyber-card p-8 flex items-center justify-center gap-3 text-muted-foreground">
          <AlertCircle size={18} />
          <span className="font-rajdhani text-sm">No data. Select a symbol.</span>
        </div>
      ) : (
        <>
          {/* Match / Differ Hero Cards */}
          <div className="grid grid-cols-2 gap-4">
            {/* MATCH */}
            <div className="cyber-card p-4 border-l-4" style={{ borderLeftColor: "#22c55e" }}>
              <div className="flex items-center gap-2 mb-2">
                <Target size={14} style={{ color: "#22c55e" }} />
                <span className="font-rajdhani font-bold text-xs tracking-widest uppercase" style={{ color: "#22c55e" }}>
                  Best MATCH
                </span>
                <div className="ml-auto flex items-center gap-1 px-2 py-0.5 rounded-full" style={{ background: "rgba(0,229,255,0.12)", border: "1px solid rgba(0,229,255,0.3)" }}>
                  <div className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-pulse" />
                  <span className="font-orbitron text-[8px] font-bold" style={{ color: "#00e5ff" }}>AUTO AI</span>
                  {matchFire && <span className="text-[9px]">🔥</span>}
                </div>
              </div>
              {matchStrategy && (
                <div className="mb-2 px-2 py-1 rounded font-rajdhani text-[9px] font-bold" style={{ background: "rgba(0,229,255,0.06)", color: "#00e5ff", border: "1px solid rgba(0,229,255,0.15)" }}>
                  {matchStrategy} · {matchTicks}T
                </div>
              )}
              <div className="flex items-center gap-4 mb-3">
                <div className="w-20 h-20 rounded-full flex items-center justify-center font-orbitron text-5xl font-black"
                  style={{ background: DIGIT_COLORS[bestMatch], color: "#fff",
                    boxShadow: `0 0 28px ${DIGIT_COLORS[bestMatch]}80` }}>
                  {bestMatch}
                </div>
                <div>
                  <div className="font-orbitron text-3xl font-black" style={{ color: "#22c55e" }}>
                    {matchConf}%
                  </div>
                  <div className="font-rajdhani text-xs text-muted-foreground">confidence</div>
                </div>
              </div>
              <div className="h-1.5 rounded-full overflow-hidden mb-2" style={{ background: "rgba(255,255,255,0.08)" }}>
                <div className="h-full rounded-full transition-all" style={{ width: `${matchConf}%`, background: "#22c55e" }} />
              </div>
              {reasonMatch && (
                <div className="font-rajdhani text-[10px] text-muted-foreground leading-relaxed">{reasonMatch}</div>
              )}
              {matchStrategies.length > 0 && (
                <div className="mt-2 pt-2 border-t space-y-0.5" style={{ borderColor: "rgba(255,255,255,0.06)" }}>
                  {matchStrategies.map((s, i) => (
                    <div key={i} className="flex items-center gap-1 font-rajdhani text-[9px] text-muted-foreground">
                      <div className="w-1 h-1 rounded-full flex-shrink-0" style={{ background: "#22c55e" }} />
                      {s}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* DIFFER */}
            <div className="cyber-card p-4 border-l-4" style={{ borderLeftColor: "#ef4444" }}>
              <div className="flex items-center gap-2 mb-2">
                <Crosshair size={14} style={{ color: "#ef4444" }} />
                <span className="font-rajdhani font-bold text-xs tracking-widest uppercase" style={{ color: "#ef4444" }}>
                  Best DIFFER
                </span>
                <div className="ml-auto flex items-center gap-1 px-2 py-0.5 rounded-full" style={{ background: "rgba(239,68,68,0.12)", border: "1px solid rgba(239,68,68,0.3)" }}>
                  <div className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: "#ef4444" }} />
                  <span className="font-orbitron text-[8px] font-bold" style={{ color: "#ef4444" }}>AUTO AI</span>
                  {differFire && <span className="text-[9px]">🔥</span>}
                </div>
              </div>
              {differStrategy && (
                <div className="mb-2 px-2 py-1 rounded font-rajdhani text-[9px] font-bold" style={{ background: "rgba(239,68,68,0.06)", color: "#ef4444", border: "1px solid rgba(239,68,68,0.15)" }}>
                  {differStrategy} · {differTicks}T
                </div>
              )}
              <div className="flex items-center gap-4 mb-3">
                <div className="w-20 h-20 rounded-full flex items-center justify-center font-orbitron text-5xl font-black"
                  style={{ background: DIGIT_COLORS[bestDiffer], color: "#fff",
                    boxShadow: `0 0 28px ${DIGIT_COLORS[bestDiffer]}80` }}>
                  {bestDiffer}
                </div>
                <div>
                  <div className="font-orbitron text-3xl font-black" style={{ color: "#ef4444" }}>
                    {differConf}%
                  </div>
                  <div className="font-rajdhani text-xs text-muted-foreground">confidence</div>
                </div>
              </div>
              <div className="h-1.5 rounded-full overflow-hidden mb-2" style={{ background: "rgba(255,255,255,0.08)" }}>
                <div className="h-full rounded-full transition-all" style={{ width: `${differConf}%`, background: "#ef4444" }} />
              </div>
              {reasonDiffer && (
                <div className="font-rajdhani text-[10px] text-muted-foreground leading-relaxed">{reasonDiffer}</div>
              )}
              {differStrategies.length > 0 && (
                <div className="mt-2 pt-2 border-t space-y-0.5" style={{ borderColor: "rgba(255,255,255,0.06)" }}>
                  {differStrategies.map((s, i) => (
                    <div key={i} className="flex items-center gap-1 font-rajdhani text-[9px] text-muted-foreground">
                      <div className="w-1 h-1 rounded-full flex-shrink-0" style={{ background: "#ef4444" }} />
                      {s}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* All digit percentages list (sorted by appearance) */}
          {sortedByPct.length > 0 && (
            <div className="cyber-card p-4">
              <div className="font-rajdhani text-xs font-bold tracking-widest uppercase text-muted-foreground mb-3">
                All Digits Ranked · {tickCount} Ticks
              </div>
              <div className="space-y-1.5">
                {sortedByPct.map((stat, idx) => {
                  const role = getRole(stat.digit);
                  const barColor = role === "most" ? "#22c55e" : role === "second" ? "#3b82f6"
                    : role === "second-least" ? "#facc15" : role === "least" ? "#ef4444"
                    : "rgba(255,255,255,0.3)";
                  return (
                    <div key={stat.digit} className="flex items-center gap-3">
                      <div className="font-orbitron text-xs font-bold w-4 text-muted-foreground text-right">
                        {idx + 1}.
                      </div>
                      <div className="w-7 h-7 rounded-full flex items-center justify-center font-orbitron text-xs font-black text-white flex-shrink-0"
                        style={{ background: DIGIT_COLORS[stat.digit],
                          border: stat.digit === currentDigit ? "2px solid #fff" : undefined,
                          boxShadow: stat.digit === currentDigit ? `0 0 10px ${DIGIT_COLORS[stat.digit]}` : undefined }}>
                        {stat.digit}
                      </div>
                      <div className="flex-1 h-2 rounded-full overflow-hidden" style={{ background: "rgba(255,255,255,0.08)" }}>
                        <div className="h-full rounded-full transition-all duration-500"
                          style={{ width: `${stat.percentage}%`, background: barColor }} />
                      </div>
                      <div className="font-orbitron text-xs font-bold w-12 text-right" style={{ color: barColor }}>
                        {stat.percentage.toFixed(2)}%
                      </div>
                      <div className="font-rajdhani text-[9px] text-muted-foreground w-10 text-right">
                        {stat.count}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </>
      )}

      {/* Deriv Connection + Auto Trade Panel */}
      <DerivConnectionBar />
      <AutoTradePanel
        symbol={symbol}
        pageLabel="Match/Differ"
        signals={[
          ...(matchConf > 0 ? [{
            contract_type: "DIGITMATCH",
            confidence: matchConf,
            ticks: 5,
            digit: bestMatch,
            label: `Match ${bestMatch}`,
          } satisfies TradeSignal] : []),
          ...(differConf > 0 ? [{
            contract_type: "DIGITDIFF",
            confidence: differConf,
            ticks: 5,
            digit: bestDiffer,
            label: `Differ ${bestDiffer}`,
          } satisfies TradeSignal] : []),
        ]}
      />
    </div>
  );
}
