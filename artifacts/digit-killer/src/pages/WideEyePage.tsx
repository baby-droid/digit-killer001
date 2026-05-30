import { useState } from "react";
import {
  useGetWideEyeAnalysis,
  getGetWideEyeAnalysisQueryKey,
} from "@workspace/api-client-react";
import { useSymbol } from "@/context/SymbolContext";
import DCircle from "@/components/DCircle";
import { Slider } from "@/components/ui/slider";

const DIGIT_COLORS: Record<number, string> = {
  0: "#00e5d4", 1: "#448aff", 2: "#ce93d8", 3: "#00c853", 4: "#ff9100",
  5: "#00e5ff", 6: "#c6ff00", 7: "#ff1744", 8: "#f50057", 9: "#ffd600",
};

interface DigitStat { digit: number; percentage: number; rank: number; count: number; }

export default function WideEyePage() {
  const { symbol } = useSymbol();
  const [customCount, setCustomCount] = useState(100);

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
  const overUnder = (d?.over_under as { under_pct?: number; over_pct?: number; equal_pct?: number; threshold?: number }) ?? {};
  const evenOdd = (d?.even_odd as { even_pct?: number; odd_pct?: number; current_digit?: number }) ?? {};

  const digits1000: DigitStat[] = circle1.digits ?? Array.from({ length: 10 }, (_, i) => ({ digit: i, percentage: 10, rank: i + 1, count: 0 }));
  const digitsCustom: DigitStat[] = circleCustom.digits ?? Array.from({ length: 10 }, (_, i) => ({ digit: i, percentage: 10, rank: i + 1, count: 0 }));
  const currentDigit = circle1.current_digit ?? 0;
  const currentPrice = circle1.current_price ?? 0;

  return (
    <div className="space-y-6 animate-fade-in-up" data-testid="page-wide-eye">
      {/* Title */}
      <div className="flex items-center gap-3">
        <div>
          <h2 className="font-orbitron text-lg font-bold text-primary tracking-wider">
            WIDE EYE VIEW
          </h2>
          <p className="font-rajdhani text-xs text-muted-foreground tracking-widest uppercase mt-0.5">
            Dual D-Circle Analysis · Real-Time Digit Distribution
          </p>
        </div>
      </div>

      {/* D-Circles row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* D-Circle 1000 */}
        <div className="cyber-card p-6 scanlines flex flex-col items-center gap-4">
          <div className="w-full flex items-center justify-between">
            <span className="font-rajdhani font-semibold text-xs text-muted-foreground tracking-widest uppercase">
              D-Circle · Fixed 1000 Ticks
            </span>
            <span className="badge-match rounded px-2 py-0.5 text-xs font-bold font-rajdhani">
              1000
            </span>
          </div>
          {isLoading ? (
            <div className="w-72 h-72 flex items-center justify-center">
              <div className="w-12 h-12 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
            </div>
          ) : (
            <DCircle
              digits={digits1000}
              currentDigit={currentDigit}
              currentPrice={currentPrice}
              size={288}
              label="1000-TICK D-CIRCLE"
              tickCount={circle1.count}
            />
          )}

          {/* Legend */}
          <div className="w-full grid grid-cols-2 gap-1.5 text-xs">
            {[
              { rank: 1, label: "Highest", color: "#00ff88" },
              { rank: 2, label: "2nd High", color: "#00b4ff" },
              { rank: 9, label: "2nd Low", color: "#ffcc00" },
              { rank: 10, label: "Lowest", color: "#ff3b3b" },
            ].map(({ rank, label, color }) => {
              const d = digits1000.find((x) => x.rank === rank);
              return (
                <div key={rank} className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: color }} />
                  <span className="font-rajdhani text-muted-foreground">{label}:</span>
                  <span className="font-orbitron font-bold" style={{ color }}>
                    {d?.digit ?? "—"}
                  </span>
                  <span className="text-muted-foreground">({d?.percentage?.toFixed(1) ?? "—"}%)</span>
                </div>
              );
            })}
          </div>
        </div>

        {/* D-Circle Custom */}
        <div className="cyber-card p-6 scanlines flex flex-col items-center gap-4">
          <div className="w-full flex items-center justify-between">
            <span className="font-rajdhani font-semibold text-xs text-muted-foreground tracking-widest uppercase">
              D-Circle · Custom {customCount} Ticks
            </span>
            <span className="badge-match rounded px-2 py-0.5 text-xs font-bold font-rajdhani">
              {customCount}
            </span>
          </div>

          {/* Slider */}
          <div className="w-full space-y-2">
            <div className="flex items-center justify-between text-xs font-rajdhani text-muted-foreground">
              <span>10 ticks</span>
              <span className="text-primary font-semibold">{customCount} ticks</span>
              <span>500 ticks</span>
            </div>
            <Slider
              min={10}
              max={500}
              step={10}
              value={[customCount]}
              onValueChange={([v]) => setCustomCount(v)}
              data-testid="slider-custom-count"
            />
          </div>

          {isLoading ? (
            <div className="w-72 h-72 flex items-center justify-center">
              <div className="w-12 h-12 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
            </div>
          ) : (
            <DCircle
              digits={digitsCustom}
              currentDigit={currentDigit}
              currentPrice={currentPrice}
              size={288}
              label="CUSTOM D-CIRCLE"
              tickCount={circleCustom.count}
            />
          )}

          {/* Legend */}
          <div className="w-full grid grid-cols-2 gap-1.5 text-xs">
            {[
              { rank: 1, label: "Highest", color: "#00ff88" },
              { rank: 2, label: "2nd High", color: "#00b4ff" },
              { rank: 9, label: "2nd Low", color: "#ffcc00" },
              { rank: 10, label: "Lowest", color: "#ff3b3b" },
            ].map(({ rank, label, color }) => {
              const d = digitsCustom.find((x) => x.rank === rank);
              return (
                <div key={rank} className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: color }} />
                  <span className="font-rajdhani text-muted-foreground">{label}:</span>
                  <span className="font-orbitron font-bold" style={{ color }}>
                    {d?.digit ?? "—"}
                  </span>
                  <span className="text-muted-foreground">({d?.percentage?.toFixed(1) ?? "—"}%)</span>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Distribution Table */}
      <div className="cyber-card p-4">
        <div className="font-rajdhani font-semibold text-xs text-muted-foreground tracking-widest uppercase mb-3">
          Full Distribution Table · 1000 Ticks
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border">
                {["Digit", "Count", "Percentage", "Rank", "Status"].map((h) => (
                  <th
                    key={h}
                    className="text-left pb-2 font-rajdhani text-xs tracking-wider text-muted-foreground font-semibold"
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {Array.from({ length: 10 }, (_, i) => i).map((d) => {
                const stat = digits1000.find((x) => x.digit === d);
                const color = DIGIT_COLORS[d];
                const rank = stat?.rank ?? d + 1;
                return (
                  <tr key={d} className="border-b border-border/40 hover:bg-muted/20 transition-colors">
                    <td className="py-1.5">
                      <span
                        className="font-orbitron font-bold text-base"
                        style={{ color }}
                      >
                        {d}
                      </span>
                    </td>
                    <td className="py-1.5 font-rajdhani text-foreground/80">{stat?.count ?? 0}</td>
                    <td className="py-1.5">
                      <div className="flex items-center gap-2">
                        <div className="w-24 h-2 bg-muted rounded-full overflow-hidden">
                          <div
                            className="h-full rounded-full transition-all duration-500"
                            style={{
                              width: `${(stat?.percentage ?? 10) * 10}%`,
                              background: color,
                            }}
                          />
                        </div>
                        <span className="font-orbitron text-xs" style={{ color }}>
                          {stat?.percentage?.toFixed(2) ?? "10.00"}%
                        </span>
                      </div>
                    </td>
                    <td className="py-1.5">
                      <span className={`font-orbitron text-xs ${rank === 1 ? "text-green-400" : rank === 10 ? "text-red-400" : "text-muted-foreground"}`}>
                        #{rank}
                      </span>
                    </td>
                    <td className="py-1.5">
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

      {/* Over/Under + Even/Odd summary */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Over/Under */}
        <div className="cyber-card p-4">
          <div className="font-rajdhani font-semibold text-xs text-muted-foreground tracking-widest uppercase mb-3">
            Over / Under Summary · Threshold 5
          </div>
          <div className="space-y-3">
            <div>
              <div className="flex justify-between text-xs mb-1 font-rajdhani">
                <span className="text-green-400 font-semibold">OVER</span>
                <span className="font-orbitron text-green-400">{overUnder.over_pct ?? 0}%</span>
              </div>
              <div className="h-2 bg-muted rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full transition-all duration-500"
                  style={{ width: `${overUnder.over_pct ?? 0}%`, background: "#00c853" }}
                />
              </div>
            </div>
            <div>
              <div className="flex justify-between text-xs mb-1 font-rajdhani">
                <span className="text-blue-400 font-semibold">UNDER</span>
                <span className="font-orbitron text-blue-400">{overUnder.under_pct ?? 0}%</span>
              </div>
              <div className="h-2 bg-muted rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full transition-all duration-500"
                  style={{ width: `${overUnder.under_pct ?? 0}%`, background: "#448aff" }}
                />
              </div>
            </div>
            <div>
              <div className="flex justify-between text-xs mb-1 font-rajdhani">
                <span className="text-yellow-400 font-semibold">EQUAL (5)</span>
                <span className="font-orbitron text-yellow-400">{overUnder.equal_pct ?? 0}%</span>
              </div>
              <div className="h-2 bg-muted rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full transition-all duration-500"
                  style={{ width: `${overUnder.equal_pct ?? 0}%`, background: "#ffd600" }}
                />
              </div>
            </div>
          </div>
        </div>

        {/* Even/Odd with current digit display */}
        <div className="cyber-card p-4">
          <div className="font-rajdhani font-semibold text-xs text-muted-foreground tracking-widest uppercase mb-3">
            Even / Odd Summary
          </div>
          <div className="flex items-center gap-6">
            {/* Current digit big box */}
            <div
              className="flex-shrink-0 w-20 h-20 rounded-lg border-2 flex items-center justify-center"
              style={{
                borderColor: DIGIT_COLORS[evenOdd.current_digit ?? currentDigit],
                background: `${DIGIT_COLORS[evenOdd.current_digit ?? currentDigit]}18`,
                boxShadow: `0 0 20px ${DIGIT_COLORS[evenOdd.current_digit ?? currentDigit]}40`,
              }}
              data-testid="box-current-digit-evenodd"
            >
              <span
                className="font-orbitron text-4xl font-black"
                style={{
                  color: DIGIT_COLORS[evenOdd.current_digit ?? currentDigit],
                }}
              >
                {evenOdd.current_digit ?? currentDigit}
              </span>
            </div>

            <div className="flex-1 space-y-3">
              <div>
                <div className="flex justify-between text-xs mb-1 font-rajdhani">
                  <span className="badge-even rounded px-2 py-0.5 text-xs font-bold">EVEN</span>
                  <span className="font-orbitron text-xs" style={{ color: "#c6ff00" }}>{evenOdd.even_pct ?? 50}%</span>
                </div>
                <div className="h-2 bg-muted rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all duration-500"
                    style={{ width: `${evenOdd.even_pct ?? 50}%`, background: "#c6ff00" }}
                  />
                </div>
              </div>
              <div>
                <div className="flex justify-between text-xs mb-1 font-rajdhani">
                  <span className="badge-odd rounded px-2 py-0.5 text-xs font-bold">ODD</span>
                  <span className="font-orbitron text-xs" style={{ color: "#ff9100" }}>{evenOdd.odd_pct ?? 50}%</span>
                </div>
                <div className="h-2 bg-muted rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all duration-500"
                    style={{ width: `${evenOdd.odd_pct ?? 50}%`, background: "#ff9100" }}
                  />
                </div>
              </div>
              <div className="font-rajdhani text-xs text-muted-foreground">
                Current digit is <span className={`font-bold ${[0,2,4,6,8].includes(evenOdd.current_digit ?? currentDigit) ? "text-[#c6ff00]" : "text-[#ff9100]"}`}>
                  {[0,2,4,6,8].includes(evenOdd.current_digit ?? currentDigit) ? "EVEN" : "ODD"}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
