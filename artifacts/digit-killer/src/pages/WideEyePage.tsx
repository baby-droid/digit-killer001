import { useState } from "react";
import {
  useGetWideEyeAnalysis,
  getGetWideEyeAnalysisQueryKey,
} from "@workspace/api-client-react";
import { useSymbol } from "@/context/SymbolContext";

const DIGIT_COLORS: Record<number, string> = {
  0: "#00e5d4", 1: "#448aff", 2: "#ce93d8", 3: "#00c853", 4: "#ff9100",
  5: "#00e5ff", 6: "#c6ff00", 7: "#ff1744", 8: "#f50057", 9: "#ffd600",
};

interface DigitStat { digit: number; percentage: number; rank: number; count: number; }

function DigitCircle({
  stat,
  isCurrent,
  isHighest,
  isLowest,
  totalCount,
}: {
  stat: DigitStat;
  isCurrent: boolean;
  isHighest: boolean;
  isLowest: boolean;
  totalCount: number;
}) {
  const color = DIGIT_COLORS[stat.digit];
  const filled = isHighest || isLowest || isCurrent;

  return (
    <div className="flex flex-col items-center gap-1 flex-1 min-w-0" data-testid={`digit-circle-${stat.digit}`}>
      {/* Pointer triangle above current digit */}
      <div className="h-4 flex items-end justify-center">
        {isCurrent && (
          <div
            className="w-0 h-0"
            style={{
              borderLeft: "6px solid transparent",
              borderRight: "6px solid transparent",
              borderTop: `8px solid ${color}`,
            }}
          />
        )}
      </div>

      {/* Circle */}
      <div
        className="relative flex items-center justify-center rounded-full transition-all duration-300"
        style={{
          width: "clamp(40px, 8vw, 72px)",
          height: "clamp(40px, 8vw, 72px)",
          background: filled ? `${color}22` : "rgba(255,255,255,0.04)",
          border: `2px solid ${filled ? color : "rgba(255,255,255,0.12)"}`,
          boxShadow: filled ? `0 0 16px ${color}55, inset 0 0 12px ${color}18` : undefined,
        }}
      >
        <span
          className="font-orbitron font-black"
          style={{
            fontSize: "clamp(14px, 3vw, 24px)",
            color: filled ? color : "#888",
          }}
        >
          {stat.digit}
        </span>
        {isCurrent && (
          <div
            className="absolute -top-1 -right-1 w-3 h-3 rounded-full animate-ping"
            style={{ background: color, opacity: 0.6 }}
          />
        )}
      </div>

      {/* Percentage */}
      <div
        className="font-orbitron font-bold text-center"
        style={{
          fontSize: "clamp(10px, 2vw, 13px)",
          color: filled ? color : "#666",
        }}
      >
        {stat.percentage.toFixed(1)}%
      </div>

      {/* Count */}
      <div className="font-rajdhani text-muted-foreground text-center" style={{ fontSize: "10px" }}>
        {stat.count}
      </div>
    </div>
  );
}

function DistributionRow({
  digits,
  currentDigit,
  label,
  count,
}: {
  digits: DigitStat[];
  currentDigit: number;
  label: string;
  count: number;
}) {
  const sorted = [...digits].sort((a, b) => b.percentage - a.percentage);
  const highest = sorted[0]?.digit ?? -1;
  const lowest = sorted[sorted.length - 1]?.digit ?? -1;

  return (
    <div className="cyber-card p-4 md:p-6 scanlines">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="font-rajdhani font-semibold text-sm text-muted-foreground tracking-widest uppercase">
          {label}
        </div>
        <div className="font-orbitron text-xs text-primary/80 tracking-widest">
          {count}/{count}
        </div>
      </div>

      {/* Digit circles */}
      <div className="flex gap-1 md:gap-2 w-full">
        {Array.from({ length: 10 }, (_, i) => i).map((d) => {
          const stat = digits.find((x) => x.digit === d) ?? { digit: d, percentage: 0, rank: d + 1, count: 0 };
          return (
            <DigitCircle
              key={d}
              stat={stat}
              isCurrent={d === currentDigit}
              isHighest={d === highest}
              isLowest={d === lowest}
              totalCount={count}
            />
          );
        })}
      </div>

      {/* Legend */}
      <div className="flex items-center justify-center gap-6 mt-3 text-xs font-rajdhani text-muted-foreground">
        <span>
          <span className="text-green-400 font-semibold">● </span>current digit / most frequent
        </span>
        <span>
          <span className="text-orange-400 font-semibold">● </span>least frequency
        </span>
      </div>

      {/* Ranked badges */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mt-4">
        {[
          { label: "🔥 Hottest", digit: highest, rank: 1 },
          { label: "🔵 2nd High", digit: sorted[1]?.digit ?? -1, rank: 2 },
          { label: "🟡 2nd Low", digit: sorted[sorted.length - 2]?.digit ?? -1, rank: 9 },
          { label: "❄️ Coldest", digit: lowest, rank: 10 },
        ].map(({ label: lbl, digit, rank }) => {
          const color = DIGIT_COLORS[digit] ?? "#888";
          const stat = digits.find((x) => x.digit === digit);
          return (
            <div
              key={rank}
              className="flex items-center gap-2 px-3 py-1.5 rounded-lg"
              style={{ background: `${color}12`, border: `1px solid ${color}30` }}
            >
              <span className="font-rajdhani text-xs text-muted-foreground">{lbl}:</span>
              <span className="font-orbitron font-bold text-sm" style={{ color }}>
                {digit >= 0 ? digit : "—"}
              </span>
              <span className="font-rajdhani text-xs text-muted-foreground ml-auto">
                {stat?.percentage.toFixed(1) ?? "—"}%
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default function WideEyePage() {
  const { symbol } = useSymbol();
  const [customCount, setCustomCount] = useState(1000);
  const [inputVal, setInputVal] = useState("1000");

  const { data, isLoading } = useGetWideEyeAnalysis(
    { symbol, count: customCount },
    {
      query: {
        enabled: !!symbol,
        queryKey: getGetWideEyeAnalysisQueryKey({ symbol, count: customCount }),
        refetchInterval: 2000,
      },
    }
  );

  const d = data as Record<string, unknown> | undefined;
  const circle1 = (d?.d_circle_1000 as { digits?: DigitStat[]; current_digit?: number; current_price?: number; count?: number }) ?? {};
  const circleCustom = (d?.d_circle_custom as { digits?: DigitStat[]; current_digit?: number; current_price?: number; count?: number }) ?? {};
  const overUnder = (d?.over_under as { under_pct?: number; over_pct?: number; equal_pct?: number }) ?? {};
  const evenOdd = (d?.even_odd as { even_pct?: number; odd_pct?: number; current_digit?: number }) ?? {};

  const digits1000: DigitStat[] = circle1.digits ?? Array.from({ length: 10 }, (_, i) => ({ digit: i, percentage: 10, rank: i + 1, count: 0 }));
  const digitsCustom: DigitStat[] = circleCustom.digits ?? Array.from({ length: 10 }, (_, i) => ({ digit: i, percentage: 10, rank: i + 1, count: 0 }));
  const currentDigit = circle1.current_digit ?? 0;
  const currentPrice = circle1.current_price ?? 0;

  function applyCount() {
    const v = parseInt(inputVal);
    if (!isNaN(v) && v >= 50 && v <= 5000) setCustomCount(v);
  }

  return (
    <div className="space-y-5 animate-fade-in-up" data-testid="page-wide-eye">
      {/* Header row — price + digit */}
      <div
        className="cyber-card px-4 py-3 flex items-center justify-between"
        style={{ background: "rgba(0,229,255,0.04)", borderColor: "rgba(0,229,255,0.15)" }}
      >
        <div className="font-orbitron text-2xl md:text-3xl font-bold text-foreground tracking-wider">
          {currentPrice.toFixed(4)}
        </div>
        <div
          className="font-orbitron text-3xl font-black"
          style={{ color: DIGIT_COLORS[currentDigit] }}
          data-testid="current-digit-display"
        >
          {currentDigit}
        </div>
      </div>

      {/* Ticks window control */}
      <div className="cyber-card px-4 py-3 flex flex-wrap items-center gap-4">
        <span className="font-rajdhani font-semibold text-sm text-muted-foreground tracking-wide">
          Ticks window:
        </span>
        <div className="flex items-center gap-2">
          <input
            type="number"
            min={50}
            max={5000}
            value={inputVal}
            onChange={(e) => setInputVal(e.target.value)}
            onBlur={applyCount}
            onKeyDown={(e) => e.key === "Enter" && applyCount()}
            className="w-24 px-3 py-1.5 rounded-md bg-background border border-border font-orbitron text-sm text-foreground focus:outline-none focus:border-primary"
            data-testid="input-ticks-window"
          />
          <span className="font-rajdhani text-xs text-muted-foreground">(50–5000)</span>
        </div>
        {isLoading && (
          <div className="ml-auto flex items-center gap-2">
            <div className="w-3 h-3 border border-primary/40 border-t-primary rounded-full animate-spin" />
            <span className="font-rajdhani text-xs text-muted-foreground">Loading…</span>
          </div>
        )}
        <div className="ml-auto font-orbitron text-xs text-primary/60">
          {customCount}/{customCount}
        </div>
      </div>

      {/* 1000-tick distribution row */}
      <DistributionRow
        digits={digits1000}
        currentDigit={currentDigit}
        label={`Last 1000 ticks digit distribution`}
        count={circle1.count ?? 1000}
      />

      {/* Custom tick distribution */}
      {customCount !== 1000 && (
        <DistributionRow
          digits={digitsCustom}
          currentDigit={circleCustom.current_digit ?? currentDigit}
          label={`Last ${customCount} ticks digit distribution`}
          count={circleCustom.count ?? customCount}
        />
      )}

      {/* Summary cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Over/Under */}
        <div className="cyber-card p-4">
          <div className="font-rajdhani font-semibold text-xs text-muted-foreground tracking-widest uppercase mb-3">
            Over / Under Summary · Threshold 5
          </div>
          <div className="space-y-2">
            {[
              { label: "OVER", value: overUnder.over_pct ?? 0, color: "#00c853" },
              { label: "UNDER", value: overUnder.under_pct ?? 0, color: "#448aff" },
              { label: "EQUAL (5)", value: overUnder.equal_pct ?? 0, color: "#ffd600" },
            ].map(({ label, value, color }) => (
              <div key={label}>
                <div className="flex justify-between text-xs mb-1 font-rajdhani">
                  <span className="font-semibold" style={{ color }}>{label}</span>
                  <span className="font-orbitron" style={{ color }}>{value}%</span>
                </div>
                <div className="h-2 bg-muted rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all duration-700"
                    style={{ width: `${value}%`, background: color }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Even/Odd */}
        <div className="cyber-card p-4">
          <div className="font-rajdhani font-semibold text-xs text-muted-foreground tracking-widest uppercase mb-3">
            Even / Odd Summary
          </div>
          <div className="flex items-center gap-4">
            <div
              className="flex-shrink-0 w-16 h-16 rounded-xl border-2 flex items-center justify-center"
              style={{
                borderColor: DIGIT_COLORS[evenOdd.current_digit ?? currentDigit],
                background: `${DIGIT_COLORS[evenOdd.current_digit ?? currentDigit]}18`,
              }}
            >
              <span className="font-orbitron text-3xl font-black" style={{ color: DIGIT_COLORS[evenOdd.current_digit ?? currentDigit] }}>
                {evenOdd.current_digit ?? currentDigit}
              </span>
            </div>
            <div className="flex-1 space-y-2">
              {[
                { label: "EVEN", value: evenOdd.even_pct ?? 50, color: "#c6ff00" },
                { label: "ODD", value: evenOdd.odd_pct ?? 50, color: "#ff9100" },
              ].map(({ label, value, color }) => (
                <div key={label}>
                  <div className="flex justify-between text-xs mb-1 font-rajdhani">
                    <span className="font-semibold" style={{ color }}>{label}</span>
                    <span className="font-orbitron text-xs" style={{ color }}>{value}%</span>
                  </div>
                  <div className="h-2 bg-muted rounded-full overflow-hidden">
                    <div className="h-full rounded-full transition-all duration-700" style={{ width: `${value}%`, background: color }} />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Full distribution table */}
      <div className="cyber-card p-4">
        <div className="font-rajdhani font-semibold text-xs text-muted-foreground tracking-widest uppercase mb-3">
          Full Distribution Table · {customCount} Ticks
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[400px]">
            <thead>
              <tr className="border-b border-border">
                {["Digit", "Count", "Frequency", "Rank", "Status"].map((h) => (
                  <th key={h} className="text-left pb-2 font-rajdhani text-xs tracking-wider text-muted-foreground font-semibold">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {Array.from({ length: 10 }, (_, i) => i).map((d) => {
                const stat = digitsCustom.find((x) => x.digit === d);
                const color = DIGIT_COLORS[d];
                const rank = stat?.rank ?? d + 1;
                const isCurr = d === currentDigit;
                return (
                  <tr
                    key={d}
                    className="border-b border-border/30 hover:bg-muted/20 transition-colors"
                    style={isCurr ? { background: `${color}08` } : undefined}
                  >
                    <td className="py-2">
                      <div className="flex items-center gap-2">
                        <span className="font-orbitron font-bold text-lg" style={{ color }}>{d}</span>
                        {isCurr && <span className="text-[10px] font-rajdhani text-primary font-bold tracking-widest">← NOW</span>}
                      </div>
                    </td>
                    <td className="py-2 font-rajdhani text-foreground/70">{stat?.count ?? 0}</td>
                    <td className="py-2">
                      <div className="flex items-center gap-2">
                        <div className="w-20 md:w-32 h-1.5 bg-muted rounded-full overflow-hidden">
                          <div className="h-full rounded-full transition-all duration-500" style={{ width: `${(stat?.percentage ?? 10) * 10}%`, background: color }} />
                        </div>
                        <span className="font-orbitron text-xs" style={{ color }}>{stat?.percentage?.toFixed(2) ?? "10.00"}%</span>
                      </div>
                    </td>
                    <td className="py-2">
                      <span className={`font-orbitron text-xs ${rank === 1 ? "text-green-400" : rank === 10 ? "text-red-400" : "text-muted-foreground"}`}>
                        #{rank}
                      </span>
                    </td>
                    <td className="py-2">
                      {rank === 1 && <span className="risk-low">HOTTEST</span>}
                      {rank === 2 && <span className="badge-match rounded px-2 text-xs font-rajdhani font-bold">2ND HIGH</span>}
                      {rank === 10 && <span className="risk-high">COLDEST</span>}
                      {rank === 9 && <span className="badge-odd rounded px-2 text-xs font-rajdhani font-bold">2ND LOW</span>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
