import { useState } from "react";
import {
  useGetEvenOddAnalysis,
  getGetEvenOddAnalysisQueryKey,
} from "@workspace/api-client-react";
import { useSymbol } from "@/context/SymbolContext";
import { AlertCircle, Divide } from "lucide-react";

const DIGIT_COLORS: Record<number, string> = {
  0: "#00897b", 1: "#1e88e5", 2: "#8e24aa", 3: "#43a047", 4: "#fb8c00",
  5: "#00e5ff", 6: "#c6e500", 7: "#e53935", 8: "#e91e8c", 9: "#fdd835",
};
const EVEN_DIGITS = [0, 2, 4, 6, 8];

const TICK_PRESETS = [100, 200, 500, 1000, 2000];

export default function EvenOddPage() {
  const { symbol } = useSymbol();
  const [tickCount, setTickCount] = useState(1000);
  const [customInput, setCustomInput] = useState("1000");

  const { data, isLoading } = useGetEvenOddAnalysis(
    { symbol, count: tickCount },
    {
      query: {
        enabled: !!symbol,
        queryKey: getGetEvenOddAnalysisQueryKey({ symbol, count: tickCount }),
        refetchInterval: 2000,
      },
    }
  );

  const d = data as Record<string, unknown> | undefined;
  const evenPct: number = (d?.even_pct as number) ?? 50;
  const oddPct: number = (d?.odd_pct as number) ?? 50;
  const currentDigit: number = (d?.current_digit as number) ?? 0;
  const recommended: string = (d?.recommended as string) ?? "—";
  const confidence: number = (d?.confidence as number) ?? 50;
  const ticks: number = (d?.ticks as number) ?? 3;
  const recentDigits: number[] = (d?.recent_digits as number[]) ?? [];

  const isEven = EVEN_DIGITS.includes(currentDigit);
  const digitColor = DIGIT_COLORS[currentDigit];

  const applyCustom = () => {
    const v = parseInt(customInput);
    if (!isNaN(v) && v >= 10 && v <= 5000) setTickCount(v);
  };

  return (
    <div className="space-y-4 animate-fade-in-up" data-testid="page-even-odd">

      {/* ─── Header ─── */}
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <Divide size={18} className="text-primary" />
            <h2 className="font-orbitron text-lg font-bold text-primary tracking-wider">
              EVEN / ODD ANALYSIS
            </h2>
          </div>
          <p className="font-rajdhani text-xs text-muted-foreground tracking-widest uppercase mt-0.5">
            Parity Distribution · Entry Recommendations · {tickCount} Ticks
          </p>
        </div>

        {/* Current digit corner badge */}
        <div className="flex flex-col items-center flex-shrink-0" data-testid="corner-current-digit">
          <div
            className="w-16 h-16 rounded-xl flex items-center justify-center font-orbitron text-3xl font-black transition-all duration-300"
            style={{
              background: `${digitColor}18`,
              border: `2px solid ${digitColor}`,
              color: digitColor,
              boxShadow: `0 0 16px ${digitColor}50`,
            }}
          >
            {currentDigit}
          </div>
          <div
            className="mt-1 font-orbitron text-[10px] font-bold tracking-widest"
            style={{ color: isEven ? "#c6e500" : "#fb8c00" }}
          >
            {isEven ? "EVEN" : "ODD"}
          </div>
        </div>
      </div>

      {/* ─── Tick Count Controls ─── */}
      <div className="cyber-card p-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-rajdhani text-[10px] text-muted-foreground tracking-widest uppercase flex-shrink-0">
            Tick Window:
          </span>
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
              data-testid={`preset-${p}`}
            >
              {p}
            </button>
          ))}
          <input
            type="number"
            min={10}
            max={5000}
            value={customInput}
            onChange={(e) => setCustomInput(e.target.value)}
            onBlur={applyCustom}
            onKeyDown={(e) => e.key === "Enter" && applyCustom()}
            className="w-20 px-2 py-1.5 rounded text-xs font-orbitron bg-background border border-border text-foreground focus:outline-none focus:border-primary"
            placeholder="custom"
            data-testid="input-tick-count"
          />
          <span className="text-xs text-muted-foreground font-rajdhani hidden sm:inline">
            (10 – 5000)
          </span>
          <div
            className="ml-auto flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold"
            style={{ background: "rgba(0,200,83,0.12)", border: "1px solid rgba(0,200,83,0.35)", color: "#00c853" }}
          >
            <div className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
            {isLoading ? "Updating…" : `${tickCount} ticks`}
          </div>
        </div>
      </div>

      {/* ─── Even / Odd parity bars ─── */}
      <div className="grid grid-cols-2 gap-4">
        {/* Even */}
        <div className="cyber-card p-5">
          <div className="flex items-center justify-between mb-4">
            <span className="badge-even rounded px-3 py-1 text-sm font-bold font-rajdhani tracking-wider">
              EVEN
            </span>
            <span className="font-orbitron text-2xl font-bold" style={{ color: "#c6e500" }}>
              {evenPct}%
            </span>
          </div>
          <div className="text-xs font-rajdhani text-muted-foreground mb-2">Digits: 0, 2, 4, 6, 8</div>
          <div className="h-3 bg-muted rounded-full overflow-hidden">
            <div
              className="h-full rounded-full transition-all duration-700"
              style={{ width: `${evenPct}%`, background: "linear-gradient(90deg, #8bc34a, #c6e500)" }}
            />
          </div>
          <div className="mt-2 font-rajdhani text-xs text-muted-foreground">
            {evenPct > 50 ? "DOMINANT — lean EVEN" : "Below average frequency"}
          </div>
        </div>

        {/* Odd */}
        <div className="cyber-card p-5">
          <div className="flex items-center justify-between mb-4">
            <span className="badge-odd rounded px-3 py-1 text-sm font-bold font-rajdhani tracking-wider">
              ODD
            </span>
            <span className="font-orbitron text-2xl font-bold" style={{ color: "#fb8c00" }}>
              {oddPct}%
            </span>
          </div>
          <div className="text-xs font-rajdhani text-muted-foreground mb-2">Digits: 1, 3, 5, 7, 9</div>
          <div className="h-3 bg-muted rounded-full overflow-hidden">
            <div
              className="h-full rounded-full transition-all duration-700"
              style={{ width: `${oddPct}%`, background: "linear-gradient(90deg, #e65100, #fb8c00)" }}
            />
          </div>
          <div className="mt-2 font-rajdhani text-xs text-muted-foreground">
            {oddPct > 50 ? "DOMINANT — lean ODD" : "Below average frequency"}
          </div>
        </div>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-12">
          <div className="w-10 h-10 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
        </div>
      ) : !d ? (
        <div className="cyber-card p-8 flex items-center justify-center gap-3 text-muted-foreground">
          <AlertCircle size={18} />
          <span className="font-rajdhani text-sm">No data. Select a symbol.</span>
        </div>
      ) : (
        <>
          {/* Recent digit history */}
          <div className="cyber-card p-4 scanlines">
            <div className="font-rajdhani font-semibold text-xs text-muted-foreground tracking-widest uppercase mb-3">
              Recent Digit History
            </div>
            <div className="flex flex-wrap gap-2">
              {recentDigits.length === 0 ? (
                <span className="text-muted-foreground text-xs font-rajdhani">Waiting for data…</span>
              ) : (
                recentDigits.map((dVal, i) => {
                  const isEvenD = EVEN_DIGITS.includes(dVal);
                  const isLast = i === recentDigits.length - 1;
                  return (
                    <div
                      key={i}
                      className="flex flex-col items-center gap-0.5"
                      data-testid={`recent-digit-${i}`}
                    >
                      <div
                        className="w-8 h-8 rounded-md border flex items-center justify-center font-orbitron text-sm font-bold transition-all"
                        style={{
                          borderColor: DIGIT_COLORS[dVal],
                          background: isLast
                            ? DIGIT_COLORS[dVal]
                            : `${DIGIT_COLORS[dVal]}18`,
                          color: isLast ? "#fff" : DIGIT_COLORS[dVal],
                          boxShadow: isLast ? `0 0 8px ${DIGIT_COLORS[dVal]}80` : undefined,
                        }}
                      >
                        {dVal}
                      </div>
                      <div
                        className="text-[8px] font-orbitron font-bold"
                        style={{ color: isEvenD ? "#c6e500" : "#fb8c00" }}
                      >
                        {isEvenD ? "E" : "O"}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {/* Entry recommendation */}
          <div
            className="cyber-card p-4 border-l-4"
            style={{ borderLeftColor: recommended === "Even" ? "#c6e500" : "#fb8c00" }}
          >
            <div className="font-rajdhani font-semibold text-xs text-muted-foreground tracking-widest uppercase mb-3">
              Entry Recommendation
            </div>
            <div className="flex items-center gap-6">
              <div className="flex-shrink-0">
                <div
                  className="font-orbitron text-2xl font-black"
                  style={{ color: recommended === "Even" ? "#c6e500" : "#fb8c00" }}
                  data-testid="text-recommendation"
                >
                  {recommended.toUpperCase()}
                </div>
                <div className="font-rajdhani text-xs text-muted-foreground">{ticks} tick contract</div>
              </div>
              <div className="flex-1">
                <div className="flex items-center justify-between mb-1">
                  <span className="font-rajdhani text-xs text-muted-foreground">Confidence</span>
                  <span className="font-orbitron text-xs text-primary font-bold">{confidence}%</span>
                </div>
                <div className="h-2 bg-muted rounded-full overflow-hidden">
                  <div className="confidence-fill h-full" style={{ width: `${confidence}%` }} />
                </div>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
