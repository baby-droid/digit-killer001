import {
  useGetEvenOddAnalysis,
  getGetEvenOddAnalysisQueryKey,
} from "@workspace/api-client-react";
import { useSymbol } from "@/context/SymbolContext";
import { AlertCircle } from "lucide-react";

const DIGIT_COLORS: Record<number, string> = {
  0: "#00e5d4", 1: "#448aff", 2: "#ce93d8", 3: "#00c853", 4: "#ff9100",
  5: "#00e5ff", 6: "#c6ff00", 7: "#ff1744", 8: "#f50057", 9: "#ffd600",
};
const EVEN_DIGITS = [0, 2, 4, 6, 8];

export default function EvenOddPage() {
  const { symbol } = useSymbol();

  const { data, isLoading } = useGetEvenOddAnalysis(
    { symbol },
    {
      query: {
        enabled: !!symbol,
        queryKey: getGetEvenOddAnalysisQueryKey({ symbol }),
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

  return (
    <div className="space-y-4 animate-fade-in-up" data-testid="page-even-odd">
      {/* Header */}
      <div>
        <h2 className="font-orbitron text-lg font-bold text-primary tracking-wider">
          EVEN / ODD ANALYSIS
        </h2>
        <p className="font-rajdhani text-xs text-muted-foreground tracking-widest uppercase mt-0.5">
          Parity Distribution · Entry Recommendations
        </p>
      </div>

      {/* Current digit hero */}
      <div className="cyber-card p-6 flex items-center gap-8">
        <div
          className="w-28 h-28 rounded-2xl border-2 flex items-center justify-center flex-shrink-0 animate-pulse-glow"
          style={{
            borderColor: DIGIT_COLORS[currentDigit],
            background: `${DIGIT_COLORS[currentDigit]}12`,
          }}
          data-testid="box-current-digit"
        >
          <span
            className="font-orbitron text-6xl font-black"
            style={{
              color: DIGIT_COLORS[currentDigit],
              textShadow: `0 0 30px ${DIGIT_COLORS[currentDigit]}80`,
            }}
          >
            {currentDigit}
          </span>
        </div>

        <div className="flex-1 space-y-2">
          <div className="flex items-center gap-3">
            <span
              className={`font-orbitron text-2xl font-bold ${isEven ? "text-[#c6ff00]" : "text-[#ff9100]"}`}
            >
              {isEven ? "EVEN" : "ODD"}
            </span>
            <span
              className="text-xs font-bold font-rajdhani px-3 py-1 rounded"
              style={{
                background: isEven ? "rgba(198,255,0,0.12)" : "rgba(255,145,0,0.12)",
                color: isEven ? "#c6ff00" : "#ff9100",
                border: `1px solid ${isEven ? "rgba(198,255,0,0.3)" : "rgba(255,145,0,0.3)"}`,
              }}
            >
              CURRENT
            </span>
          </div>

          <div className="font-rajdhani text-xs text-muted-foreground">
            Digit {currentDigit} is {isEven ? "an even" : "an odd"} number
          </div>

          <div className="mt-3 flex items-center gap-4">
            <div>
              <div className="font-rajdhani text-xs text-muted-foreground tracking-widest">RECOMMENDATION</div>
              <div
                className={`font-orbitron text-lg font-bold ${
                  recommended === "Even" ? "text-[#c6ff00]" : "text-[#ff9100]"
                }`}
                data-testid="text-recommendation"
              >
                {recommended}
              </div>
            </div>
            <div>
              <div className="font-rajdhani text-xs text-muted-foreground tracking-widest">TICKS</div>
              <div className="font-orbitron text-lg font-bold text-primary">{ticks}</div>
            </div>
            <div>
              <div className="font-rajdhani text-xs text-muted-foreground tracking-widest">CONFIDENCE</div>
              <div className="font-orbitron text-lg font-bold text-primary">{confidence}%</div>
            </div>
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
          {/* Percentage bars */}
          <div className="grid grid-cols-2 gap-4">
            {/* Even */}
            <div className="cyber-card p-5">
              <div className="flex items-center justify-between mb-4">
                <span className="badge-even rounded px-3 py-1 text-sm font-bold font-rajdhani tracking-wider">
                  EVEN
                </span>
                <span className="font-orbitron text-2xl font-bold text-[#c6ff00]">
                  {evenPct}%
                </span>
              </div>
              <div className="text-xs font-rajdhani text-muted-foreground mb-2">Digits: 0, 2, 4, 6, 8</div>
              <div className="h-3 bg-muted rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full transition-all duration-700"
                  style={{ width: `${evenPct}%`, background: "linear-gradient(90deg, #8bc34a, #c6ff00)" }}
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
                <span className="font-orbitron text-2xl font-bold text-[#ff9100]">
                  {oddPct}%
                </span>
              </div>
              <div className="text-xs font-rajdhani text-muted-foreground mb-2">Digits: 1, 3, 5, 7, 9</div>
              <div className="h-3 bg-muted rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full transition-all duration-700"
                  style={{ width: `${oddPct}%`, background: "linear-gradient(90deg, #e65100, #ff9100)" }}
                />
              </div>
              <div className="mt-2 font-rajdhani text-xs text-muted-foreground">
                {oddPct > 50 ? "DOMINANT — lean ODD" : "Below average frequency"}
              </div>
            </div>
          </div>

          {/* Recent digit history */}
          <div className="cyber-card p-4 scanlines">
            <div className="font-rajdhani font-semibold text-xs text-muted-foreground tracking-widest uppercase mb-3">
              Recent Digit History
            </div>
            <div className="flex flex-wrap gap-2">
              {recentDigits.length === 0 ? (
                <span className="text-muted-foreground text-xs font-rajdhani">Waiting for data...</span>
              ) : (
                recentDigits.map((d, i) => {
                  const isEvenD = EVEN_DIGITS.includes(d);
                  return (
                    <div
                      key={i}
                      className="flex flex-col items-center gap-0.5"
                      data-testid={`recent-digit-${i}`}
                    >
                      <div
                        className="w-8 h-8 rounded-md border flex items-center justify-center font-orbitron text-sm font-bold"
                        style={{
                          borderColor: DIGIT_COLORS[d],
                          background: `${DIGIT_COLORS[d]}18`,
                          color: DIGIT_COLORS[d],
                        }}
                      >
                        {d}
                      </div>
                      <div
                        className="text-[8px] font-rajdhani font-bold"
                        style={{ color: isEvenD ? "#c6ff00" : "#ff9100" }}
                      >
                        {isEvenD ? "E" : "O"}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {/* Entry recommendation card */}
          <div
            className="cyber-card p-4 border-l-4"
            style={{
              borderLeftColor: recommended === "Even" ? "#c6ff00" : "#ff9100",
            }}
          >
            <div className="font-rajdhani font-semibold text-xs text-muted-foreground tracking-widest uppercase mb-2">
              Entry Recommendation
            </div>
            <div className="flex items-center gap-6">
              <div>
                <div className="font-orbitron text-2xl font-black"
                  style={{ color: recommended === "Even" ? "#c6ff00" : "#ff9100" }}>
                  {recommended.toUpperCase()}
                </div>
                <div className="font-rajdhani text-xs text-muted-foreground">{ticks} tick contract</div>
              </div>
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-1">
                  <span className="font-rajdhani text-xs text-muted-foreground">Confidence</span>
                  <span className="font-orbitron text-xs text-primary">{confidence}%</span>
                </div>
                <div className="h-2 bg-muted rounded-full overflow-hidden">
                  <div
                    className="confidence-fill h-full"
                    style={{ width: `${confidence}%` }}
                  />
                </div>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
