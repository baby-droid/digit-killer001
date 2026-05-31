import { useState, useMemo } from "react";
import {
  useGetWideEyeAnalysis,
  getGetWideEyeAnalysisQueryKey,
} from "@workspace/api-client-react";
import { useSymbol } from "@/context/SymbolContext";
import { Eye, Info } from "lucide-react";

const DIGIT_COLORS: Record<number, string> = {
  0: "#00897b", 1: "#1e88e5", 2: "#8e24aa", 3: "#43a047", 4: "#fb8c00",
  5: "#00e5ff", 6: "#c6e500", 7: "#e53935", 8: "#e91e8c", 9: "#fdd835",
};

const EVEN_DIGITS = [0, 2, 4, 6, 8];

const MARKET_GROUPS = [
  { label: "Volatility", symbols: [
    { key: "R_10", label: "Volatility 10 Index" }, { key: "R_25", label: "Volatility 25 Index" },
    { key: "R_50", label: "Volatility 50 Index" }, { key: "R_75", label: "Volatility 75 Index" },
    { key: "R_100", label: "Volatility 100 Index" },
    { key: "1HZ10V", label: "Volatility 10 (1s) Index" }, { key: "1HZ15V", label: "Volatility 15 (1s) Index" },
    { key: "1HZ25V", label: "Volatility 25 (1s) Index" }, { key: "1HZ30V", label: "Volatility 30 (1s) Index" },
    { key: "1HZ50V", label: "Volatility 50 (1s) Index" }, { key: "1HZ75V", label: "Volatility 75 (1s) Index" },
    { key: "1HZ90V", label: "Volatility 90 (1s) Index" }, { key: "1HZ100V", label: "Volatility 100 (1s) Index" },
  ]},
  { label: "Crash/Boom", symbols: [
    { key: "CRASH300N", label: "Crash 300 Index" }, { key: "CRASH500", label: "Crash 500 Index" },
    { key: "CRASH1000", label: "Crash 1000 Index" }, { key: "BOOM300N", label: "Boom 300 Index" },
    { key: "BOOM500", label: "Boom 500 Index" }, { key: "BOOM1000", label: "Boom 1000 Index" },
  ]},
  { label: "Jump", symbols: [
    { key: "JD10", label: "Jump 10 Index" }, { key: "JD25", label: "Jump 25 Index" },
    { key: "JD50", label: "Jump 50 Index" }, { key: "JD75", label: "Jump 75 Index" },
    { key: "JD100", label: "Jump 100 Index" },
  ]},
];

interface DigitStat { digit: number; percentage: number; rank: number; count: number; }

// ─── D-Circle Arc Gauge (Deriv-style) ────────────────────────────────────────
function DCircleGauge({ digit, percentage, count, isCurrent, isMost, isLeast }: {
  digit: number; percentage: number; count: number;
  isCurrent: boolean; isMost: boolean; isLeast: boolean;
}) {
  const color = DIGIT_COLORS[digit];
  const R = 30; const CX = 36; const CY = 36;
  const circ = 2 * Math.PI * R;
  const filled = circ * (percentage / 100);

  return (
    <div className="flex flex-col items-center gap-0 select-none min-w-0">
      <div className="h-4 flex items-end justify-center mb-0.5">
        {isMost && <span className="font-bold text-xs" style={{ color: "#00e5ff" }}>▲</span>}
        {isLeast && <span className="font-bold text-xs" style={{ color: "#ff4d4d" }}>▽</span>}
      </div>
      <svg viewBox="0 0 72 72" style={{ width: "clamp(48px,7vw,70px)", height: "clamp(48px,7vw,70px)",
        filter: isCurrent ? `drop-shadow(0 0 6px ${color}cc)` : undefined }}>
        <circle cx={CX} cy={CY} r={R} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth={6} />
        <circle cx={CX} cy={CY} r={R} fill="none" stroke={color}
          strokeWidth={isCurrent ? 7 : 5.5} strokeLinecap="round"
          strokeDasharray={`${filled} ${circ - filled}`}
          transform={`rotate(-90 ${CX} ${CY})`}
          style={{ transition: "stroke-dasharray 0.5s ease" }} />
        <text x={CX} y={CY + 1} textAnchor="middle" dominantBaseline="middle"
          fill={isCurrent ? color : "rgba(255,255,255,0.85)"}
          fontFamily="Orbitron,monospace" fontWeight={isCurrent ? "900" : "700"}
          fontSize={isCurrent ? 16 : 14} style={{ transition: "all 0.3s" }}>
          {digit}
        </text>
      </svg>
      <div className="font-orbitron font-bold text-center mt-0.5"
        style={{ fontSize: "clamp(9px,1.4vw,11px)", color: isCurrent ? color : "rgba(255,255,255,0.6)" }}>
        {percentage.toFixed(1)}%
      </div>
      <div className="font-rajdhani text-center" style={{ fontSize: "9px", color: "rgba(255,255,255,0.3)" }}>
        {count}
      </div>
      <div className="h-3 flex items-start justify-center mt-0.5">
        {isCurrent && <span className="font-bold" style={{ color, fontSize: 11 }}>▲</span>}
      </div>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────
export default function WideEyePage() {
  const { symbol, setSymbol } = useSymbol();
  const [tickCount, setTickCount] = useState(1000);
  const [tickInput, setTickInput] = useState("1000");
  const [ouThreshold, setOuThreshold] = useState(5);

  const { data, isLoading } = useGetWideEyeAnalysis(
    { symbol, count: tickCount },
    {
      query: {
        enabled: !!symbol,
        queryKey: getGetWideEyeAnalysisQueryKey({ symbol, count: tickCount }),
        refetchInterval: 1000, // 1-second polling for real-time feel
      },
    }
  );

  const d = data as Record<string, unknown> | undefined;
  const circleCustom = (d?.d_circle_custom as { digits?: DigitStat[]; current_digit?: number; count?: number }) ?? {};
  const rollingDigits: number[] = (d?.rolling_digits as number[]) ?? [];
  const currentPrice = (d?.current_price as number) ?? 0;

  const digits: DigitStat[] = circleCustom.digits ??
    Array.from({ length: 10 }, (_, i) => ({ digit: i, percentage: 10, rank: i + 1, count: 0 }));
  const currentDigit = circleCustom.current_digit ?? 0;
  const loadedCount = circleCustom.count ?? 0;

  const sortedDigits = useMemo(() => [...digits].sort((a, b) => b.percentage - a.percentage), [digits]);
  const mostFrequent = sortedDigits[0]?.digit ?? -1;
  const leastFrequent = sortedDigits[sortedDigits.length - 1]?.digit ?? -1;

  // Even/Odd for last 100 ticks from rolling stream
  const last100 = useMemo(() => rollingDigits.slice(-100), [rollingDigits]);
  const eo100 = useMemo(() => {
    if (!last100.length) return { even: 0, odd: 0, evenPct: 50, oddPct: 50 };
    const even = last100.filter((d) => EVEN_DIGITS.includes(d)).length;
    const odd = last100.length - even;
    return {
      even, odd,
      evenPct: parseFloat(((even / last100.length) * 100).toFixed(1)),
      oddPct: parseFloat(((odd / last100.length) * 100).toFixed(1)),
    };
  }, [last100]);

  // Recent E/O dots (last 20)
  const recentEO = useMemo(() => last100.slice(-20).map((d) => EVEN_DIGITS.includes(d) ? "E" : "O"), [last100]);

  // Over/Under (adjustable threshold)
  const ouStats = useMemo(() => {
    if (!rollingDigits.length) return { under: 0, equal: 0, over: 0, underPct: 0, equalPct: 0, overPct: 0 };
    const n = rollingDigits.length;
    const under = rollingDigits.filter((d) => d < ouThreshold).length;
    const equal = rollingDigits.filter((d) => d === ouThreshold).length;
    const over = rollingDigits.filter((d) => d > ouThreshold).length;
    return {
      under, equal, over,
      underPct: parseFloat(((under / n) * 100).toFixed(1)),
      equalPct: parseFloat(((equal / n) * 100).toFixed(1)),
      overPct: parseFloat(((over / n) * 100).toFixed(1)),
    };
  }, [rollingDigits, ouThreshold]);

  const recentUO = useMemo(
    () => rollingDigits.slice(-20).map((d) => d < ouThreshold ? "U" : d === ouThreshold ? "=" : "O"),
    [rollingDigits, ouThreshold]
  );

  // All symbols for the select dropdown (flat list with group labels)
  const allSymbols = MARKET_GROUPS.flatMap((g) => g.symbols);
  const currentLabel = allSymbols.find((s) => s.key === symbol)?.label ?? symbol;

  const applyTickInput = () => {
    const v = parseInt(tickInput);
    if (!isNaN(v) && v >= 50 && v <= 5000) setTickCount(v);
  };

  return (
    <div className="space-y-3 animate-fade-in-up max-w-5xl" data-testid="page-wide-eye">

      {/* ─── Title ─── */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <button
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-full font-rajdhani text-sm font-bold"
            style={{ background: "rgba(0,229,255,0.12)", border: "1px solid rgba(0,229,255,0.3)", color: "#00e5ff" }}
          >
            <Eye size={14} /> Wide Eye
          </button>
          <button
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-full font-rajdhani text-sm font-bold"
            style={{ background: "rgba(59,130,246,0.12)", border: "1px solid rgba(59,130,246,0.3)", color: "#60a5fa" }}
          >
            Launch AI
          </button>
          <div className="w-7 h-7 rounded-full bg-muted/40 border border-border flex items-center justify-center cursor-pointer">
            <Info size={12} className="text-muted-foreground" />
          </div>
        </div>
        <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold"
          style={{ background: "rgba(0,200,83,0.12)", border: "1px solid rgba(0,200,83,0.35)", color: "#00c853" }}>
          <div className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
          Live
        </div>
      </div>

      {/* ─── Select Market ─── */}
      <div className="cyber-card p-3">
        <label className="block font-rajdhani text-sm text-foreground mb-2 font-semibold">Select Market:</label>
        <select
          value={symbol}
          onChange={(e) => setSymbol(e.target.value)}
          className="w-full px-3 py-2.5 rounded-md font-rajdhani text-sm font-semibold bg-background border border-border text-foreground focus:outline-none focus:border-primary appearance-none cursor-pointer"
          data-testid="select-market"
          style={{ background: "var(--background)" }}
        >
          {MARKET_GROUPS.map((g) => (
            <optgroup key={g.label} label={`── ${g.label} ──`}>
              {g.symbols.map((s) => (
                <option key={s.key} value={s.key}>{s.label}</option>
              ))}
            </optgroup>
          ))}
        </select>
      </div>

      {/* ─── Price + Current Digit ─── */}
      <div className="cyber-card p-4">
        <div className="flex items-center justify-between gap-4">
          {/* Price */}
          <div>
            <div className="font-rajdhani text-xs text-muted-foreground tracking-widest uppercase mb-1">
              {currentLabel}
            </div>
            <div className="font-orbitron text-3xl md:text-4xl font-bold text-foreground">
              {currentPrice
                ? currentPrice.toFixed(currentPrice > 100 ? 2 : 4)
                : isLoading ? "Loading…" : "—"}
            </div>
          </div>

          {/* Current digit — large badge on right */}
          <div className="flex flex-col items-center gap-1">
            <div className="font-rajdhani text-[10px] text-muted-foreground tracking-widest uppercase">Current</div>
            {isLoading && !d ? (
              <div className="w-16 h-16 rounded-full border-2 border-primary/30 border-t-primary animate-spin" />
            ) : (
              <div
                className="w-16 h-16 md:w-20 md:h-20 rounded-full flex items-center justify-center font-orbitron font-black transition-all duration-300"
                style={{
                  background: DIGIT_COLORS[currentDigit],
                  fontSize: "clamp(28px,5vw,36px)",
                  color: "#fff",
                  boxShadow: `0 0 24px ${DIGIT_COLORS[currentDigit]}70`,
                }}
                data-testid="current-digit-badge"
              >
                {currentDigit}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ─── Ticks Window ─── */}
      <div className="cyber-card p-3 flex flex-wrap items-center gap-4">
        <div className="flex items-center gap-3">
          <label className="font-rajdhani text-sm text-foreground font-semibold">Ticks window:</label>
          <input
            type="number" min={50} max={5000}
            value={tickInput}
            onChange={(e) => setTickInput(e.target.value)}
            onBlur={applyTickInput}
            onKeyDown={(e) => e.key === "Enter" && applyTickInput()}
            className="w-28 px-3 py-2 rounded-md font-orbitron text-sm bg-background border border-border text-foreground focus:outline-none focus:border-primary text-center"
            data-testid="input-tick-count"
          />
          <span className="font-rajdhani text-xs text-muted-foreground">(50 – 5000)</span>
        </div>
        <div className="ml-auto font-orbitron text-xs text-muted-foreground">
          {loadedCount > 0 ? `${loadedCount}/${tickCount}` : ""}
        </div>
      </div>

      {/* ─── D-Circle Distribution ─── */}
      <div className="cyber-card p-3 md:p-4">
        <div className="flex items-center justify-between mb-1">
          <div className="font-rajdhani text-sm text-foreground font-semibold">
            Last {tickCount} ticks digit distribution
          </div>
          <div className="flex items-center gap-4 text-[10px] font-rajdhani">
            <span className="text-primary">▲ current digit / most</span>
            <span className="text-red-400">▽ least frequency</span>
          </div>
        </div>

        <div className="grid mt-2" style={{ gridTemplateColumns: "repeat(10, minmax(0, 1fr))", gap: "4px" }}>
          {Array.from({ length: 10 }, (_, i) => i).map((d) => {
            const stat = digits.find((x) => x.digit === d) ?? { digit: d, percentage: 10, rank: d + 1, count: 0 };
            return (
              <DCircleGauge
                key={d} digit={d}
                percentage={stat.percentage} count={stat.count}
                isCurrent={d === currentDigit}
                isMost={d === mostFrequent}
                isLeast={d === leastFrequent}
              />
            );
          })}
        </div>
      </div>

      {/* ─── Even/Odd — 100 ticks, current digit in corner ─── */}
      <div className="cyber-card p-3 md:p-4">
        <div className="flex items-start justify-between gap-3 mb-3">
          <div>
            <div className="font-rajdhani text-sm text-foreground font-semibold">Even/Odd</div>
            <div className="font-rajdhani text-[10px] text-muted-foreground mt-0.5">
              Last 100 ticks · live analysis
            </div>
          </div>
          {/* Current digit corner */}
          <div className="flex flex-col items-center flex-shrink-0">
            <div
              className="w-12 h-12 rounded-full flex items-center justify-center font-orbitron text-xl font-black transition-all duration-300"
              style={{
                background: DIGIT_COLORS[currentDigit],
                color: "#fff",
                boxShadow: `0 0 12px ${DIGIT_COLORS[currentDigit]}70`,
              }}
            >
              {currentDigit}
            </div>
            <div className="font-orbitron text-[9px] mt-1 font-bold"
              style={{ color: EVEN_DIGITS.includes(currentDigit) ? "#c6e500" : "#fb8c00" }}>
              {EVEN_DIGITS.includes(currentDigit) ? "EVEN" : "ODD"}
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3 mb-3">
          {[
            { label: "Even", count: eo100.even, pct: eo100.evenPct, color: "#43a047" },
            { label: "Odd",  count: eo100.odd,  pct: eo100.oddPct,  color: "#e53935" },
          ].map(({ label, count, pct, color }) => (
            <div key={label}>
              <div className="flex items-baseline gap-2">
                <span className="font-bold text-base" style={{ color }}>{label}</span>
                <span className="font-orbitron text-xl font-bold text-foreground">{count}</span>
                <span className="font-rajdhani text-xs text-muted-foreground">({pct}%)</span>
              </div>
              <div className="h-2 rounded-full overflow-hidden mt-1" style={{ background: "rgba(255,255,255,0.08)" }}>
                <div className="h-full rounded-full transition-all duration-500" style={{ width: `${pct}%`, background: color }} />
              </div>
            </div>
          ))}
        </div>

        {recentEO.length > 0 && (
          <div>
            <div className="font-rajdhani text-[10px] text-muted-foreground tracking-widest uppercase mb-1.5">Recent E/O</div>
            <div className="flex flex-wrap gap-1">
              {recentEO.map((lbl, i) => (
                <div key={i} className="w-6 h-6 rounded-full flex items-center justify-center font-orbitron text-[10px] font-bold text-white"
                  style={{ background: lbl === "E" ? "#43a047" : "#e53935" }}>{lbl}</div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* ─── Rolling Tick Stream ─── */}
      <div className="cyber-card p-3 md:p-4">
        <div className="flex items-center justify-between mb-2">
          <div className="font-rajdhani text-sm text-foreground font-semibold">Rolling {tickCount}-Tick Stream</div>
          <div className="flex items-center gap-1.5 text-xs font-rajdhani text-green-400">
            <div className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />live
          </div>
        </div>
        {rollingDigits.length === 0 ? (
          <div className="flex items-center justify-center h-12 text-muted-foreground font-rajdhani text-sm">
            {isLoading ? "Loading…" : "No data"}
          </div>
        ) : (
          <div className="flex flex-wrap gap-1">
            {rollingDigits.map((dv, i) => {
              const isLatest = i === rollingDigits.length - 1;
              const c = DIGIT_COLORS[dv];
              const age = i / rollingDigits.length;
              return (
                <div key={i}
                  className="flex items-center justify-center rounded-full font-orbitron font-bold text-white flex-shrink-0"
                  style={{
                    width: isLatest ? "26px" : "20px", height: isLatest ? "26px" : "20px",
                    fontSize: isLatest ? "12px" : "9px",
                    background: c,
                    border: isLatest ? "2px solid #fff" : undefined,
                    boxShadow: isLatest ? `0 0 8px ${c}` : undefined,
                    opacity: Math.max(0.35, 0.35 + age * 0.65),
                  }}
                >{dv}</div>
              );
            })}
          </div>
        )}
      </div>

      {/* ─── Over / Under ─── */}
      <div className="cyber-card p-3 md:p-4">
        <div className="flex items-center justify-between mb-3">
          <div className="font-rajdhani text-sm text-foreground font-semibold">Over / Under</div>
          <div className="flex items-center gap-2">
            <span className="font-rajdhani text-xs text-muted-foreground">Threshold:</span>
            <select value={ouThreshold} onChange={(e) => setOuThreshold(parseInt(e.target.value))}
              className="px-2 py-1 rounded bg-background border border-border text-primary font-orbitron text-xs focus:outline-none focus:border-primary cursor-pointer"
              data-testid="select-ou-threshold">
              {[1,2,3,4,5,6,7,8].map((v) => <option key={v} value={v}>{v}</option>)}
            </select>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-3 mb-3">
          {[
            { label: "Under", count: ouStats.under, pct: ouStats.underPct, color: "#1e88e5" },
            { label: "Equal", count: ouStats.equal, pct: ouStats.equalPct, color: "#78909c" },
            { label: "Over",  count: ouStats.over,  pct: ouStats.overPct,  color: "#e53935" },
          ].map(({ label, count, pct, color }) => (
            <div key={label}>
              <div className="flex items-baseline gap-1.5">
                <span className="font-bold text-sm" style={{ color }}>{label}</span>
              </div>
              <div className="flex items-baseline gap-1">
                <span className="font-orbitron text-xl font-bold text-foreground">{count}</span>
                <span className="font-rajdhani text-xs text-muted-foreground">({pct}%)</span>
              </div>
              <div className="h-1.5 rounded-full overflow-hidden mt-1" style={{ background: "rgba(255,255,255,0.08)" }}>
                <div className="h-full rounded-full transition-all duration-500" style={{ width: `${pct}%`, background: color }} />
              </div>
            </div>
          ))}
        </div>

        {recentUO.length > 0 && (
          <div>
            <div className="font-rajdhani text-[10px] text-muted-foreground tracking-widest uppercase mb-1.5">Recent U/=/O</div>
            <div className="flex flex-wrap gap-1">
              {recentUO.map((lbl, i) => (
                <div key={i} className="w-6 h-6 rounded-full flex items-center justify-center font-orbitron text-[10px] font-bold text-white"
                  style={{ background: lbl === "U" ? "#1e88e5" : lbl === "=" ? "#546e7a" : "#e53935" }}>
                  {lbl}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

    </div>
  );
}
