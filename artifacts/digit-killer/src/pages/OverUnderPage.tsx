import {
  useGetOverUnderSignals,
  getGetOverUnderSignalsQueryKey,
} from "@workspace/api-client-react";
import { useSymbol } from "@/context/SymbolContext";
import { TrendingUp, TrendingDown, AlertCircle } from "lucide-react";

interface SignalEntry {
  contract: string;
  recommended_ticks: string;
  risk_level: string;
  entry_digit: number;
  confidence: number;
  conditions_met: boolean;
  reason: string;
}

const DIGIT_COLORS: Record<number, string> = {
  0: "#00e5d4", 1: "#448aff", 2: "#ce93d8", 3: "#00c853", 4: "#ff9100",
  5: "#00e5ff", 6: "#c6ff00", 7: "#ff1744", 8: "#f50057", 9: "#ffd600",
};

function ConfidenceBar({ value }: { value: number }) {
  return (
    <div className="flex items-center gap-2 w-full">
      <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
        <div
          className="confidence-fill h-full rounded-full"
          style={{ width: `${value}%` }}
        />
      </div>
      <span className="font-orbitron text-xs text-primary w-10 text-right">{value}%</span>
    </div>
  );
}

function SignalCard({ entry, type }: { entry: SignalEntry; type: "over" | "under" }) {
  const isOver = type === "over";
  const borderColor = isOver ? "#00c853" : "#448aff";
  const bgColor = isOver ? "rgba(0,200,83,0.06)" : "rgba(68,138,255,0.06)";

  return (
    <div
      className="rounded-lg p-3 border transition-all"
      style={{
        borderColor: entry.conditions_met ? borderColor : "rgba(255,255,255,0.08)",
        background: entry.conditions_met ? bgColor : "rgba(255,255,255,0.02)",
        boxShadow: entry.conditions_met ? `0 0 12px ${borderColor}30` : undefined,
      }}
      data-testid={`signal-card-${entry.contract.replace(" ", "-").toLowerCase()}`}
    >
      <div className="flex items-start justify-between mb-2">
        <div className="flex items-center gap-2">
          {isOver ? (
            <TrendingUp size={14} style={{ color: borderColor }} />
          ) : (
            <TrendingDown size={14} style={{ color: borderColor }} />
          )}
          <span
            className="font-orbitron text-sm font-bold"
            style={{ color: borderColor }}
          >
            {entry.contract}
          </span>
          {entry.conditions_met && (
            <span
              className="text-[9px] font-bold font-rajdhani tracking-wider px-1.5 py-0.5 rounded"
              style={{ background: `${borderColor}30`, color: borderColor }}
            >
              READY
            </span>
          )}
        </div>
        <span className={`risk-${entry.risk_level.toLowerCase()}`}>{entry.risk_level}</span>
      </div>

      <ConfidenceBar value={entry.confidence} />

      <div className="grid grid-cols-3 gap-2 mt-2 text-xs">
        <div>
          <div className="font-rajdhani text-muted-foreground tracking-wider">ENTRY DIGIT</div>
          <div
            className="font-orbitron font-bold"
            style={{ color: DIGIT_COLORS[entry.entry_digit] }}
          >
            {entry.entry_digit}
          </div>
        </div>
        <div>
          <div className="font-rajdhani text-muted-foreground tracking-wider">TICKS</div>
          <div className="font-orbitron font-bold text-foreground">{entry.recommended_ticks}</div>
        </div>
        <div>
          <div className="font-rajdhani text-muted-foreground tracking-wider">SIGNAL</div>
          <div
            className="font-rajdhani font-bold"
            style={{ color: entry.conditions_met ? "#00e5ff" : "#ff9100" }}
          >
            {entry.conditions_met ? "ENTER" : "WAIT"}
          </div>
        </div>
      </div>

      <div className="mt-2 text-[10px] font-rajdhani text-muted-foreground leading-relaxed border-t border-border/40 pt-1.5">
        {entry.reason}
      </div>
    </div>
  );
}

export default function OverUnderPage() {
  const { symbol } = useSymbol();

  const { data, isLoading } = useGetOverUnderSignals(
    { symbol },
    {
      query: {
        enabled: !!symbol,
        queryKey: getGetOverUnderSignalsQueryKey({ symbol }),
        refetchInterval: 3000,
      },
    }
  );

  const d = data as Record<string, unknown> | undefined;
  const entries: SignalEntry[] = (d?.entries as SignalEntry[]) ?? [];
  const bestOver = d?.best_over as SignalEntry | undefined;
  const bestUnder = d?.best_under as SignalEntry | undefined;
  const currentDigit = (d?.current_digit as number) ?? 0;
  const currentPrice = (d?.current_price as number) ?? 0;

  const overEntries = entries.filter((e) => e.contract.startsWith("OVER"));
  const underEntries = entries.filter((e) => e.contract.startsWith("UNDER"));

  return (
    <div className="space-y-4 animate-fade-in-up" data-testid="page-over-under">
      {/* Header */}
      <div>
        <h2 className="font-orbitron text-lg font-bold text-primary tracking-wider">
          OVER / UNDER ANALYSIS
        </h2>
        <p className="font-rajdhani text-xs text-muted-foreground tracking-widest uppercase mt-0.5">
          Entry Signals · Contract Recommendations
        </p>
      </div>

      {/* Current state */}
      <div className="cyber-card p-4">
        <div className="flex items-center gap-6">
          <div>
            <div className="font-rajdhani text-xs text-muted-foreground tracking-widest uppercase mb-1">Current Price</div>
            <div className="font-orbitron text-xl font-bold">{currentPrice.toFixed(4) || "—"}</div>
          </div>
          <div>
            <div className="font-rajdhani text-xs text-muted-foreground tracking-widest uppercase mb-1">Current Digit</div>
            <div
              className="font-orbitron text-4xl font-black"
              style={{ color: DIGIT_COLORS[currentDigit], textShadow: `0 0 20px ${DIGIT_COLORS[currentDigit]}80` }}
              data-testid="text-current-digit"
            >
              {currentDigit}
            </div>
          </div>
          <div className="ml-auto text-right">
            <div className="font-rajdhani text-xs text-muted-foreground tracking-widest uppercase mb-1">Best OVER Setup</div>
            <div className="font-orbitron text-sm font-bold text-green-400">{bestOver?.contract ?? "—"}</div>
          </div>
          <div className="text-right">
            <div className="font-rajdhani text-xs text-muted-foreground tracking-widest uppercase mb-1">Best UNDER Setup</div>
            <div className="font-orbitron text-sm font-bold text-blue-400">{bestUnder?.contract ?? "—"}</div>
          </div>
        </div>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center h-48">
          <div className="w-10 h-10 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
        </div>
      ) : entries.length === 0 ? (
        <div className="cyber-card p-8 flex items-center justify-center gap-3 text-muted-foreground">
          <AlertCircle size={18} />
          <span className="font-rajdhani text-sm">No signal data available. Select a symbol.</span>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Over signals */}
          <div className="space-y-3">
            <div className="flex items-center gap-2 mb-1">
              <TrendingUp size={14} className="text-green-400" />
              <span className="font-rajdhani font-bold text-xs tracking-widest uppercase text-green-400">
                OVER Contracts
              </span>
            </div>
            {overEntries.map((entry) => (
              <SignalCard key={entry.contract} entry={entry} type="over" />
            ))}
          </div>

          {/* Under signals */}
          <div className="space-y-3">
            <div className="flex items-center gap-2 mb-1">
              <TrendingDown size={14} className="text-blue-400" />
              <span className="font-rajdhani font-bold text-xs tracking-widest uppercase text-blue-400">
                UNDER Contracts
              </span>
            </div>
            {underEntries.map((entry) => (
              <SignalCard key={entry.contract} entry={entry} type="under" />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
