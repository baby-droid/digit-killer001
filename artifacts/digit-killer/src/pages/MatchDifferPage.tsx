import {
  useGetMatchDifferSignals,
  getGetMatchDifferSignalsQueryKey,
} from "@workspace/api-client-react";
import { useSymbol } from "@/context/SymbolContext";
import { Target, Crosshair, AlertCircle } from "lucide-react";

const DIGIT_COLORS: Record<number, string> = {
  0: "#00e5d4", 1: "#448aff", 2: "#ce93d8", 3: "#00c853", 4: "#ff9100",
  5: "#00e5ff", 6: "#c6ff00", 7: "#ff1744", 8: "#f50057", 9: "#ffd600",
};

interface DigitStat { digit: number; percentage: number; rank: number; count: number; }

export default function MatchDifferPage() {
  const { symbol } = useSymbol();

  const { data, isLoading } = useGetMatchDifferSignals(
    { symbol },
    {
      query: {
        enabled: !!symbol,
        queryKey: getGetMatchDifferSignalsQueryKey({ symbol }),
        refetchInterval: 2500,
      },
    }
  );

  const d = data as Record<string, unknown> | undefined;
  const bestMatch: number = (d?.best_match as number) ?? 0;
  const bestDiffer: number = (d?.best_differ as number) ?? 9;
  const matchTicks: number = (d?.match_ticks as number) ?? 10;
  const differTicks: number = (d?.differ_ticks as number) ?? 5;
  const matchConfidence: number = (d?.match_confidence as number) ?? 50;
  const differConfidence: number = (d?.differ_confidence as number) ?? 50;
  const reasonMatch: string = (d?.reason_match as string) ?? "";
  const reasonDiffer: string = (d?.reason_differ as string) ?? "";
  const currentDigit: number = (d?.current_digit as number) ?? 0;
  const digits: DigitStat[] = (d?.digits as DigitStat[]) ?? [];

  return (
    <div className="space-y-4 animate-fade-in-up" data-testid="page-match-differ">
      <div>
        <h2 className="font-orbitron text-lg font-bold text-primary tracking-wider">
          MATCH / DIFFER SIGNALS
        </h2>
        <p className="font-rajdhani text-xs text-muted-foreground tracking-widest uppercase mt-0.5">
          Best Digit to Match · Best Digit to Differ
        </p>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-16">
          <div className="w-10 h-10 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
        </div>
      ) : !d ? (
        <div className="cyber-card p-8 flex items-center justify-center gap-3 text-muted-foreground">
          <AlertCircle size={18} />
          <span className="font-rajdhani text-sm">No data. Select a symbol.</span>
        </div>
      ) : (
        <>
          {/* Hero cards */}
          <div className="grid grid-cols-2 gap-4">
            {/* MATCH */}
            <div
              className="cyber-card p-6 border-l-4"
              style={{ borderLeftColor: "#00e5ff", boxShadow: "0 0 20px rgba(0,229,255,0.1)" }}
              data-testid="card-best-match"
            >
              <div className="flex items-center gap-2 mb-4">
                <Target size={16} className="text-[#00e5ff]" />
                <span className="font-rajdhani font-bold text-sm tracking-widest uppercase text-[#00e5ff]">
                  Best Match
                </span>
              </div>
              <div
                className="font-orbitron text-7xl font-black mb-4"
                style={{
                  color: DIGIT_COLORS[bestMatch],
                  textShadow: `0 0 40px ${DIGIT_COLORS[bestMatch]}80`,
                }}
              >
                {bestMatch}
              </div>
              <div className="space-y-2">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-rajdhani text-muted-foreground">CONFIDENCE</span>
                  <span className="font-orbitron text-primary">{matchConfidence}%</span>
                </div>
                <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                  <div
                    className="confidence-fill h-full"
                    style={{ width: `${matchConfidence}%` }}
                  />
                </div>
                <div className="flex items-center justify-between text-xs">
                  <span className="font-rajdhani text-muted-foreground">TICKS</span>
                  <span className="font-orbitron text-foreground">{matchTicks}</span>
                </div>
                <div className="text-[10px] font-rajdhani text-muted-foreground border-t border-border/40 pt-2">
                  {reasonMatch}
                </div>
              </div>
            </div>

            {/* DIFFER */}
            <div
              className="cyber-card p-6 border-l-4"
              style={{ borderLeftColor: "#ce93d8", boxShadow: "0 0 20px rgba(206,147,216,0.1)" }}
              data-testid="card-best-differ"
            >
              <div className="flex items-center gap-2 mb-4">
                <Crosshair size={16} className="text-[#ce93d8]" />
                <span className="font-rajdhani font-bold text-sm tracking-widest uppercase text-[#ce93d8]">
                  Best Differ
                </span>
              </div>
              <div
                className="font-orbitron text-7xl font-black mb-4"
                style={{
                  color: DIGIT_COLORS[bestDiffer],
                  textShadow: `0 0 40px ${DIGIT_COLORS[bestDiffer]}80`,
                }}
              >
                {bestDiffer}
              </div>
              <div className="space-y-2">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-rajdhani text-muted-foreground">CONFIDENCE</span>
                  <span className="font-orbitron text-primary">{differConfidence}%</span>
                </div>
                <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                  <div
                    className="confidence-fill h-full"
                    style={{ width: `${differConfidence}%` }}
                  />
                </div>
                <div className="flex items-center justify-between text-xs">
                  <span className="font-rajdhani text-muted-foreground">TICKS</span>
                  <span className="font-orbitron text-foreground">{differTicks}</span>
                </div>
                <div className="text-[10px] font-rajdhani text-muted-foreground border-t border-border/40 pt-2">
                  {reasonDiffer}
                </div>
              </div>
            </div>
          </div>

          {/* Current digit */}
          <div className="cyber-card p-4 flex items-center gap-4">
            <div className="font-rajdhani text-xs text-muted-foreground tracking-widest uppercase">Current Digit</div>
            <div
              className="font-orbitron text-3xl font-black"
              style={{ color: DIGIT_COLORS[currentDigit], textShadow: `0 0 20px ${DIGIT_COLORS[currentDigit]}80` }}
              data-testid="text-current-digit"
            >
              {currentDigit}
            </div>
            <div className="ml-4 font-rajdhani text-xs text-muted-foreground">
              {currentDigit === bestMatch && <span className="text-[#00e5ff]">= Best Match target</span>}
              {currentDigit === bestDiffer && <span className="text-[#ce93d8]">= Best Differ target</span>}
            </div>
          </div>

          {/* Full digit table */}
          <div className="cyber-card p-4">
            <div className="font-rajdhani font-semibold text-xs text-muted-foreground tracking-widest uppercase mb-3">
              All Digits · Match / Differ Ranking
            </div>
            <div className="grid grid-cols-5 md:grid-cols-10 gap-2">
              {Array.from({ length: 10 }, (_, i) => i).map((digit) => {
                const stat = digits.find((x) => x.digit === digit);
                const pct = stat?.percentage ?? 10;
                const color = DIGIT_COLORS[digit];
                const isMatch = digit === bestMatch;
                const isDiffer = digit === bestDiffer;

                return (
                  <div
                    key={digit}
                    className="flex flex-col items-center gap-1 p-2 rounded-md border transition-all"
                    style={{
                      borderColor: isMatch
                        ? "rgba(0,229,255,0.5)"
                        : isDiffer
                        ? "rgba(206,147,216,0.5)"
                        : "transparent",
                      background: isMatch
                        ? "rgba(0,229,255,0.06)"
                        : isDiffer
                        ? "rgba(206,147,216,0.06)"
                        : "rgba(255,255,255,0.02)",
                      boxShadow: isMatch
                        ? "0 0 12px rgba(0,229,255,0.2)"
                        : isDiffer
                        ? "0 0 12px rgba(206,147,216,0.2)"
                        : undefined,
                    }}
                    data-testid={`digit-card-${digit}`}
                  >
                    <div className="font-orbitron font-bold text-lg" style={{ color }}>
                      {digit}
                    </div>
                    <div className="font-orbitron text-xs" style={{ color }}>
                      {pct.toFixed(1)}%
                    </div>
                    {isMatch && (
                      <span className="text-[9px] font-bold font-rajdhani text-[#00e5ff] tracking-wider">
                        MATCH
                      </span>
                    )}
                    {isDiffer && (
                      <span className="text-[9px] font-bold font-rajdhani text-[#ce93d8] tracking-wider">
                        DIFFER
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
