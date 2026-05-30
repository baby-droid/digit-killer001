import { useState, useMemo } from "react";
import {
  useGetWideEyeAnalysis,
  getGetWideEyeAnalysisQueryKey,
} from "@workspace/api-client-react";
import { useSymbol } from "@/context/SymbolContext";
import { Eye } from "lucide-react";

const DIGIT_COLORS: Record<number, string> = {
  0: "#e74c3c", 1: "#3498db", 2: "#1abc9c", 3: "#2ecc71", 4: "#3498db",
  5: "#e67e22", 6: "#e67e22", 7: "#e74c3c", 8: "#9b59b6", 9: "#f39c12",
};

// Reference-style palette — brighter, more colorful
const BRIGHT_COLORS: Record<number, string> = {
  0: "#e74c3c",  // red
  1: "#3498db",  // blue
  2: "#1abc9c",  // teal
  3: "#2ecc71",  // green
  4: "#3498db",  // blue
  5: "#e67e22",  // orange
  6: "#e67e22",  // orange/yellow
  7: "#e74c3c",  // red
  8: "#9b59b6",  // purple
  9: "#f39c12",  // yellow
};

const TICK_PRESETS = [100, 120, 200, 300, 500];

interface DigitStat {
  digit: number;
  percentage: number;
  rank: number;
  count: number;
}

const MARKET_GROUPS = [
  { label: "Volatility", symbols: [
    { key: "R_10", label: "Vol 10" }, { key: "R_25", label: "Vol 25" },
    { key: "R_50", label: "Vol 50" }, { key: "R_75", label: "Vol 75" },
    { key: "R_100", label: "Vol 100" }, { key: "1HZ10V", label: "1s V10" },
    { key: "1HZ25V", label: "1s V25" }, { key: "1HZ50V", label: "1s V50" },
    { key: "1HZ75V", label: "1s V75" }, { key: "1HZ100V", label: "1s V100" },
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

export default function WideEyePage() {
  const { symbol, setSymbol } = useSymbol();
  const [tickCount, setTickCount] = useState(100);
  const [customInput, setCustomInput] = useState("100");
  const [ouThreshold, setOuThreshold] = useState(5);

  const { data, isLoading } = useGetWideEyeAnalysis(
    { symbol, count: tickCount },
    {
      query: {
        enabled: !!symbol,
        queryKey: getGetWideEyeAnalysisQueryKey({ symbol, count: tickCount }),
        refetchInterval: 2000,
      },
    }
  );

  const d = data as Record<string, unknown> | undefined;
  const circleCustom = (d?.d_circle_custom as { digits?: DigitStat[]; current_digit?: number; current_price?: number; count?: number }) ?? {};
  const rollingDigits: number[] = (d?.rolling_digits as number[]) ?? [];
  const evenOdd = (d?.even_odd as { even_count?: number; odd_count?: number; even_pct?: number; odd_pct?: number; current_digit?: number }) ?? {};
  const currentPrice = (d?.current_price as number) ?? 0;

  const digits: DigitStat[] = circleCustom.digits ?? Array.from({ length: 10 }, (_, i) => ({ digit: i, percentage: 10, rank: i + 1, count: 0 }));
  const currentDigit = circleCustom.current_digit ?? 0;

  const sortedDigits = useMemo(() => [...digits].sort((a, b) => b.percentage - a.percentage), [digits]);
  const mostFrequent = sortedDigits[0]?.digit ?? -1;
  const leastFrequent = sortedDigits[sortedDigits.length - 1]?.digit ?? -1;

  // Over/under with adjustable threshold
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

  // Recent E/O and U/O from rolling digits
  const recentEO = useMemo(() => rollingDigits.slice(-25).map((d) => ([0, 2, 4, 6, 8].includes(d) ? "E" : "O")), [rollingDigits]);
  const recentUO = useMemo(() => rollingDigits.slice(-25).map((d) => d < ouThreshold ? "U" : d === ouThreshold ? "=" : "O"), [rollingDigits, ouThreshold]);

  // Current group label for dropdown display
  const allGroups = MARKET_GROUPS;
  const currentGroup = allGroups.find((g) => g.symbols.find((s) => s.key === symbol));
  const currentLabel = currentGroup?.symbols.find((s) => s.key === symbol)?.label ?? symbol;

  return (
    <div className="space-y-3 animate-fade-in-up" data-testid="page-wide-eye">

      {/* ─── Title row ─── */}
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <Eye size={18} className="text-primary" />
            <h2 className="font-bold text-foreground text-lg" style={{ fontFamily: "inherit" }}>
              Wide Eye View
            </h2>
          </div>
          <p className="text-xs text-muted-foreground mt-0.5" style={{ fontFamily: "Space Grotesk, sans-serif" }}>
            {tickCount} tick real-time digit analysis with live triangle indicator
          </p>
        </div>
        <div
          className="flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold flex-shrink-0"
          style={{ background: "rgba(0,200,83,0.15)", border: "1px solid rgba(0,200,83,0.4)", color: "#00c853" }}
        >
          <div className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
          Live
        </div>
      </div>

      {/* ─── Controls + Price ─── */}
      <div className="cyber-card p-3 md:p-4">
        <div className="flex flex-wrap gap-3 items-center">
          {/* SELECT MARKET */}
          <div className="flex flex-col gap-1 min-w-[140px]">
            <label className="font-rajdhani text-[10px] text-muted-foreground tracking-widest uppercase">
              Select Market
            </label>
            <select
              value={symbol}
              onChange={(e) => setSymbol(e.target.value)}
              className="px-3 py-2 rounded-md font-rajdhani text-sm font-semibold bg-background border border-border text-foreground focus:outline-none focus:border-primary appearance-none cursor-pointer"
              style={{ minWidth: "140px" }}
              data-testid="select-market"
            >
              {allGroups.map((g) => (
                <optgroup key={g.label} label={g.label}>
                  {g.symbols.map((s) => (
                    <option key={s.key} value={s.key}>{s.label}</option>
                  ))}
                </optgroup>
              ))}
            </select>
          </div>

          {/* TICK WINDOW */}
          <div className="flex flex-col gap-1">
            <div className="font-rajdhani text-[10px] text-muted-foreground tracking-widest uppercase">
              Tick Window — <span className="text-primary font-bold">{tickCount} Ticks</span>
            </div>
            <div className="flex items-center gap-1.5 flex-wrap">
              {TICK_PRESETS.map((p) => (
                <button
                  key={p}
                  onClick={() => { setTickCount(p); setCustomInput(String(p)); }}
                  className="px-3 py-1.5 rounded text-xs font-orbitron font-bold transition-all"
                  style={
                    tickCount === p
                      ? { background: "#00e5ff", color: "#050a0f" }
                      : { background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.12)", color: "#aaa" }
                  }
                >
                  {p}
                </button>
              ))}
              <input
                type="number"
                min={50}
                max={1000}
                value={customInput}
                onChange={(e) => setCustomInput(e.target.value)}
                onBlur={() => {
                  const v = parseInt(customInput);
                  if (!isNaN(v) && v >= 50 && v <= 1000) setTickCount(v);
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    const v = parseInt(customInput);
                    if (!isNaN(v) && v >= 50 && v <= 1000) setTickCount(v);
                  }
                }}
                className="w-20 px-2 py-1.5 rounded text-xs font-orbitron bg-background border border-border text-foreground focus:outline-none focus:border-primary"
                placeholder="custom"
                data-testid="input-tick-count"
              />
              <span className="text-xs text-muted-foreground font-rajdhani">custom (50–1000)</span>
            </div>
          </div>

          {/* Price + current digit */}
          <div className="ml-auto flex items-center gap-4 flex-shrink-0">
            <span className="font-orbitron text-xl md:text-2xl font-bold text-foreground">
              {currentPrice ? currentPrice.toFixed(currentPrice > 100 ? 2 : 4) : "—"}
            </span>
            {isLoading ? (
              <div className="w-10 h-10 rounded-full border-2 border-primary/30 border-t-primary animate-spin" />
            ) : (
              <div
                className="w-10 h-10 md:w-12 md:h-12 rounded-full flex items-center justify-center font-orbitron text-lg font-black shadow-lg"
                style={{
                  background: BRIGHT_COLORS[currentDigit] ?? "#aaa",
                  boxShadow: `0 0 16px ${BRIGHT_COLORS[currentDigit] ?? "#aaa"}80`,
                  color: "#fff",
                }}
              >
                {currentDigit}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ─── Live Digit Indicator ─── */}
      <div className="cyber-card p-3 md:p-4">
        <div className="font-rajdhani font-semibold text-xs text-muted-foreground tracking-widest uppercase mb-4">
          Live Digit Indicator
        </div>
        <div className="relative px-2">
          {/* Labels 0–9 */}
          <div className="flex justify-between mb-1">
            {Array.from({ length: 10 }, (_, i) => (
              <div key={i} className="flex-1 flex justify-center">
                <span
                  className="font-orbitron text-xs font-bold"
                  style={{ color: BRIGHT_COLORS[i] }}
                >
                  {i}
                </span>
              </div>
            ))}
          </div>

          {/* The indicator bar */}
          <div className="relative h-2 rounded-full overflow-hidden" style={{
            background: "linear-gradient(to right, #e74c3c, #3498db, #1abc9c, #2ecc71, #3498db, #e67e22, #e67e22, #e74c3c, #9b59b6, #f39c12)"
          }}>
            {/* Dot positions */}
            {Array.from({ length: 10 }, (_, i) => (
              <div
                key={i}
                className="absolute top-1/2 -translate-y-1/2 w-2.5 h-2.5 rounded-full border-2 border-background transition-all duration-300"
                style={{
                  left: `calc(${(i / 9) * 100}% - 5px)`,
                  background: BRIGHT_COLORS[i],
                  transform: i === currentDigit ? "translateY(-50%) scale(1.4)" : "translateY(-50%)",
                  boxShadow: i === currentDigit ? `0 0 10px ${BRIGHT_COLORS[i]}` : undefined,
                  zIndex: i === currentDigit ? 10 : 1,
                }}
              />
            ))}
          </div>

          {/* Triangle pointer above current digit */}
          <div
            className="absolute -top-0.5 transition-all duration-300"
            style={{
              left: `calc(${(currentDigit / 9) * 100}% + 8px - 6px)`,
              transform: "translateX(-50%)",
            }}
          >
            <div
              className="w-0 h-0"
              style={{
                borderLeft: "5px solid transparent",
                borderRight: "5px solid transparent",
                borderTop: `7px solid ${BRIGHT_COLORS[currentDigit]}`,
              }}
            />
          </div>

          {/* Current digit bubble below */}
          <div
            className="mt-4 mx-auto w-14 h-14 rounded-full flex items-center justify-center font-orbitron text-2xl font-black shadow-xl transition-all duration-300"
            style={{
              background: BRIGHT_COLORS[currentDigit],
              boxShadow: `0 0 24px ${BRIGHT_COLORS[currentDigit]}80`,
              color: "#fff",
              marginLeft: `calc(${(currentDigit / 9) * 100}% - 28px + 8px)`,
            }}
          >
            {currentDigit}
          </div>
        </div>
      </div>

      {/* ─── Rolling Tick Stream ─── */}
      <div className="cyber-card p-3 md:p-4">
        <div className="flex items-center justify-between mb-3">
          <div className="font-rajdhani font-semibold text-xs text-muted-foreground tracking-widest uppercase">
            Rolling {tickCount}-Tick Stream
          </div>
          <div className="flex items-center gap-1.5 text-xs font-rajdhani text-green-400">
            <div className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
            live rolling window
          </div>
        </div>

        {rollingDigits.length === 0 ? (
          <div className="flex items-center justify-center h-16 text-muted-foreground font-rajdhani text-sm">
            Loading tick stream…
          </div>
        ) : (
          <div className="flex flex-wrap gap-1">
            {rollingDigits.map((d, i) => {
              const isLatest = i === rollingDigits.length - 1;
              const color = BRIGHT_COLORS[d];
              return (
                <div
                  key={i}
                  className="flex items-center justify-center rounded-full font-orbitron font-bold text-white flex-shrink-0 transition-all"
                  style={{
                    width: isLatest ? "28px" : "22px",
                    height: isLatest ? "28px" : "22px",
                    fontSize: isLatest ? "13px" : "10px",
                    background: color,
                    boxShadow: isLatest ? `0 0 10px ${color}90` : undefined,
                    border: isLatest ? "2px solid #fff" : undefined,
                  }}
                >
                  {d}
                </div>
              );
            })}
          </div>
        )}

        <div className="flex flex-wrap items-center gap-4 mt-3 text-[10px] font-rajdhani text-muted-foreground">
          <span>▼ = latest digit</span>
          <span>· color = digit value (0 red → 9 yellow)</span>
          <span>· empty = awaiting ticks</span>
        </div>
      </div>

      {/* ─── Last N Ticks Digit Distribution ─── */}
      <div className="cyber-card p-3 md:p-4">
        <div className="flex items-center justify-between mb-4">
          <div className="font-rajdhani font-semibold text-xs text-muted-foreground tracking-widest uppercase">
            Last {tickCount} Ticks Digit Distribution
          </div>
          <div className="flex items-center gap-3 text-[10px] font-rajdhani">
            <span className="text-green-400 font-semibold">▲ = most frequent</span>
            <span className="text-red-400 font-semibold">▼ = least frequent</span>
          </div>
        </div>

        <div className="flex gap-2 md:gap-4 flex-wrap justify-between">
          {Array.from({ length: 10 }, (_, i) => i).map((d) => {
            const stat = digits.find((x) => x.digit === d) ?? { digit: d, percentage: 0, rank: d + 1, count: 0 };
            const color = BRIGHT_COLORS[d];
            const isMost = d === mostFrequent;
            const isLeast = d === leastFrequent;
            const isCurrent = d === currentDigit;

            return (
              <div key={d} className="flex flex-col items-center gap-1 flex-1 min-w-[48px]" data-testid={`dist-digit-${d}`}>
                {/* Arrow indicator */}
                <div className="h-4 flex items-end justify-center">
                  {isMost && <span className="text-green-400 text-sm font-bold">▲</span>}
                  {isLeast && <span className="text-red-400 text-sm font-bold">▼</span>}
                </div>

                {/* Circle */}
                <div
                  className="flex items-center justify-center rounded-full font-orbitron font-black text-white transition-all duration-300"
                  style={{
                    width: "clamp(40px, 8vw, 60px)",
                    height: "clamp(40px, 8vw, 60px)",
                    fontSize: "clamp(14px, 3vw, 22px)",
                    background: color,
                    boxShadow: isCurrent
                      ? `0 0 20px ${color}90, 0 0 40px ${color}40`
                      : `0 2px 8px ${color}50`,
                    border: isCurrent ? "3px solid #fff" : undefined,
                    transform: isCurrent ? "scale(1.12)" : undefined,
                  }}
                >
                  {d}
                </div>

                {/* Percentage */}
                <div className="font-orbitron font-bold text-center" style={{ fontSize: "11px", color }}>
                  {stat.percentage.toFixed(1)}%
                </div>

                {/* Count */}
                <div className="font-rajdhani text-muted-foreground text-center" style={{ fontSize: "10px" }}>
                  {stat.count}
                </div>

                {/* Bar */}
                <div className="w-full h-1 rounded-full overflow-hidden" style={{ background: "rgba(255,255,255,0.08)" }}>
                  <div
                    className="h-full rounded-full transition-all duration-500"
                    style={{ width: `${stat.percentage * 10}%`, background: color }}
                  />
                </div>
              </div>
            );
          })}
        </div>

        {/* Current/most/least legend */}
        <div className="mt-3 font-rajdhani text-xs text-muted-foreground">
          current digit /{" "}
          <span className="text-green-400">most frequent = {mostFrequent} ({digits.find((x) => x.digit === mostFrequent)?.percentage.toFixed(1)}%)</span>
          {" / "}
          <span className="text-red-400">least frequent = {leastFrequent} ({digits.find((x) => x.digit === leastFrequent)?.percentage.toFixed(1)}%)</span>
        </div>
      </div>

      {/* ─── Even / Odd ─── */}
      <div className="cyber-card p-3 md:p-4">
        <div className="font-rajdhani font-semibold text-xs text-muted-foreground tracking-widest uppercase mb-3">
          Even / Odd
        </div>
        <div className="grid grid-cols-2 gap-4 mb-3">
          <div>
            <div className="flex items-baseline gap-2">
              <span className="font-bold text-lg text-green-400" style={{ fontFamily: "Space Grotesk, sans-serif" }}>Even</span>
              <span className="font-orbitron text-2xl font-bold text-foreground">{evenOdd.even_count ?? 0}</span>
              <span className="font-rajdhani text-sm text-muted-foreground">({evenOdd.even_pct ?? 50}%)</span>
            </div>
            <div className="h-1.5 rounded-full overflow-hidden mt-1.5" style={{ background: "rgba(255,255,255,0.08)" }}>
              <div className="h-full rounded-full bg-green-400 transition-all duration-700" style={{ width: `${evenOdd.even_pct ?? 50}%` }} />
            </div>
          </div>
          <div>
            <div className="flex items-baseline gap-2">
              <span className="font-bold text-lg text-red-400" style={{ fontFamily: "Space Grotesk, sans-serif" }}>Odd</span>
              <span className="font-orbitron text-2xl font-bold text-foreground">{evenOdd.odd_count ?? 0}</span>
              <span className="font-rajdhani text-sm text-muted-foreground">({evenOdd.odd_pct ?? 50}%)</span>
            </div>
            <div className="h-1.5 rounded-full overflow-hidden mt-1.5" style={{ background: "rgba(255,255,255,0.08)" }}>
              <div className="h-full rounded-full bg-red-400 transition-all duration-700" style={{ width: `${evenOdd.odd_pct ?? 50}%` }} />
            </div>
          </div>
        </div>

        {/* Recent E/O row */}
        {recentEO.length > 0 && (
          <div>
            <div className="font-rajdhani text-[10px] text-muted-foreground tracking-widest uppercase mb-1.5">
              Recent E/O
            </div>
            <div className="flex flex-wrap gap-1">
              {recentEO.map((label, i) => (
                <div
                  key={i}
                  className="w-6 h-6 rounded-full flex items-center justify-center font-orbitron text-[10px] font-bold text-white"
                  style={{ background: label === "E" ? "#2ecc71" : "#e74c3c" }}
                >
                  {label}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* ─── Over / Under ─── */}
      <div className="cyber-card p-3 md:p-4">
        <div className="flex items-center justify-between mb-3">
          <div className="font-rajdhani font-semibold text-xs text-muted-foreground tracking-widest uppercase">
            Over / Under
          </div>
          <div className="flex items-center gap-2">
            <span className="font-rajdhani text-xs text-muted-foreground">Threshold:</span>
            <select
              value={ouThreshold}
              onChange={(e) => setOuThreshold(parseInt(e.target.value))}
              className="px-2 py-1 rounded bg-background border border-border text-primary font-orbitron text-xs focus:outline-none focus:border-primary cursor-pointer"
              data-testid="select-ou-threshold"
            >
              {[1, 2, 3, 4, 5, 6, 7, 8].map((v) => (
                <option key={v} value={v}>{v}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-3 mb-3">
          {[
            { label: "Under", count: ouStats.under, pct: ouStats.underPct, color: "#3498db" },
            { label: "Equal", count: ouStats.equal, pct: ouStats.equalPct, color: "#95a5a6" },
            { label: "Over", count: ouStats.over, pct: ouStats.overPct, color: "#e74c3c" },
          ].map(({ label, count, pct, color }) => (
            <div key={label}>
              <div className="flex items-baseline gap-1.5">
                <span className="font-bold text-base" style={{ fontFamily: "Space Grotesk, sans-serif", color }}>
                  {label}
                </span>
              </div>
              <div className="flex items-baseline gap-1">
                <span className="font-orbitron text-xl font-bold text-foreground">{count}</span>
                <span className="font-rajdhani text-xs text-muted-foreground">({pct}%)</span>
              </div>
              <div className="h-1.5 rounded-full overflow-hidden mt-1" style={{ background: "rgba(255,255,255,0.08)" }}>
                <div className="h-full rounded-full transition-all duration-700" style={{ width: `${pct}%`, background: color }} />
              </div>
            </div>
          ))}
        </div>

        {/* Recent U/=/O row */}
        {recentUO.length > 0 && (
          <div>
            <div className="font-rajdhani text-[10px] text-muted-foreground tracking-widest uppercase mb-1.5">
              Recent U/=/O
            </div>
            <div className="flex flex-wrap gap-1">
              {recentUO.map((label, i) => (
                <div
                  key={i}
                  className="w-6 h-6 rounded-full flex items-center justify-center font-orbitron text-[10px] font-bold text-white"
                  style={{
                    background: label === "U" ? "#3498db" : label === "=" ? "#555" : "#e74c3c",
                  }}
                >
                  {label}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

    </div>
  );
}
