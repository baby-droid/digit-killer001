import {
  useGetTickContracts,
  getGetTickContractsQueryKey,
} from "@workspace/api-client-react";
import { useSymbol } from "@/context/SymbolContext";
import { TrendingUp, TrendingDown, ArrowUpDown, ArrowUp, ArrowDown, AlertCircle } from "lucide-react";
import AutoTradePanel, { type TradeSignal } from "@/components/AutoTradePanel";

interface ContractSignal {
  contract_type: string;
  recommended_ticks: number;
  confidence: number;
  entry_signal: string;
  description: string;
  risk_level: string;
}

const CONTRACT_ICONS: Record<string, React.ReactNode> = {
  Rise: <TrendingUp size={16} className="text-green-400" />,
  Fall: <TrendingDown size={16} className="text-red-400" />,
  "Only Up": <ArrowUp size={16} className="text-green-400" />,
  "Only Down": <ArrowDown size={16} className="text-red-400" />,
  "High Tick": <ArrowUpDown size={16} className="text-yellow-400" />,
  "Low Tick": <ArrowUpDown size={16} className="text-yellow-400" />,
};

const CONTRACT_COLORS: Record<string, string> = {
  Rise: "#00c853",
  Fall: "#ff1744",
  "Only Up": "#00c853",
  "Only Down": "#ff1744",
  "High Tick": "#ffd600",
  "Low Tick": "#ffd600",
};

const DIGIT_COLORS: Record<number, string> = {
  0: "#00e5d4", 1: "#448aff", 2: "#ce93d8", 3: "#00c853", 4: "#ff9100",
  5: "#00e5ff", 6: "#c6ff00", 7: "#ff1744", 8: "#f50057", 9: "#ffd600",
};

function ContractCard({ contract }: { contract: ContractSignal }) {
  const color = CONTRACT_COLORS[contract.contract_type] ?? "#00e5ff";
  const isBuy = contract.entry_signal.startsWith("BUY");
  const isWait = contract.entry_signal === "WAIT";

  return (
    <div
      className={`cyber-card p-4 ${isBuy ? "signal-buy" : isWait ? "signal-wait" : "signal-sell"}`}
      data-testid={`contract-card-${contract.contract_type.replace(" ", "-").toLowerCase()}`}
    >
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          {CONTRACT_ICONS[contract.contract_type]}
          <span className="font-orbitron text-sm font-bold" style={{ color }}>
            {contract.contract_type.toUpperCase()}
          </span>
        </div>
        <span className={`risk-${contract.risk_level.toLowerCase()}`}>
          {contract.risk_level}
        </span>
      </div>

      {/* Entry signal */}
      <div
        className="font-orbitron text-base font-bold mb-3"
        style={{
          color: isBuy ? "#00e5ff" : "#ff9100",
          textShadow: isBuy ? "0 0 12px rgba(0,229,255,0.5)" : undefined,
        }}
      >
        {contract.entry_signal}
      </div>

      {/* Confidence */}
      <div className="space-y-1 mb-3">
        <div className="flex items-center justify-between text-xs">
          <span className="font-rajdhani text-muted-foreground tracking-wider">CONFIDENCE</span>
          <span className="font-orbitron text-primary">{contract.confidence}%</span>
        </div>
        <div className="h-1.5 bg-muted rounded-full overflow-hidden">
          <div
            className="confidence-fill h-full rounded-full"
            style={{ width: `${contract.confidence}%` }}
          />
        </div>
      </div>

      {/* Ticks */}
      <div className="flex items-center justify-between">
        <div>
          <div className="font-rajdhani text-[10px] text-muted-foreground tracking-wider">RECOMMENDED TICKS</div>
          <div className="font-orbitron text-lg font-bold" style={{ color }}>
            {contract.recommended_ticks}
          </div>
        </div>
        <div className="text-right max-w-[140px]">
          <div className="font-rajdhani text-[10px] text-muted-foreground leading-snug">
            {contract.description}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function TickAnalyserPage() {
  const { symbol } = useSymbol();

  const { data, isLoading } = useGetTickContracts(
    { symbol },
    {
      query: {
        enabled: !!symbol,
        queryKey: getGetTickContractsQueryKey({ symbol }),
        refetchInterval: 3000,
      },
    }
  );

  const d = data as Record<string, unknown> | undefined;
  const contracts: ContractSignal[] = (d?.contracts as ContractSignal[]) ?? [];
  const currentPrice: number = (d?.current_price as number) ?? 0;
  const currentDigit: number = (d?.current_digit as number) ?? 0;
  const trend: string = (d?.trend as string) ?? "NEUTRAL";
  const volatility: number = (d?.volatility_score as number) ?? 0;
  const recentTicks: number[] = (d?.recent_ticks as number[]) ?? [];

  return (
    <div className="space-y-4 animate-fade-in-up" data-testid="page-tick-analyser">
      <div>
        <h2 className="font-orbitron text-lg font-bold text-primary tracking-wider">
          TICK ANALYSER
        </h2>
        <p className="font-rajdhani text-xs text-muted-foreground tracking-widest uppercase mt-0.5">
          Contract Signals · Rise / Fall · Only Up/Down · High/Low Tick
        </p>
      </div>

      {/* Market status */}
      <div className="cyber-card p-4">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div>
            <div className="font-rajdhani text-xs text-muted-foreground tracking-widest uppercase">Current Price</div>
            <div className="font-orbitron text-xl font-bold mt-1">{currentPrice.toFixed(4) || "—"}</div>
          </div>
          <div>
            <div className="font-rajdhani text-xs text-muted-foreground tracking-widest uppercase">Current Digit</div>
            <div
              className="font-orbitron text-4xl font-black mt-1"
              style={{ color: DIGIT_COLORS[currentDigit] }}
              data-testid="text-current-digit"
            >
              {currentDigit}
            </div>
          </div>
          <div>
            <div className="font-rajdhani text-xs text-muted-foreground tracking-widest uppercase">Trend</div>
            <div
              className={`font-orbitron text-xl font-bold mt-1 flex items-center gap-2 ${
                trend === "UP" ? "text-green-400" : trend === "DOWN" ? "text-red-400" : "text-yellow-400"
              }`}
            >
              {trend === "UP" ? <TrendingUp size={18} /> : trend === "DOWN" ? <TrendingDown size={18} /> : <ArrowUpDown size={18} />}
              {trend}
            </div>
          </div>
          <div>
            <div className="font-rajdhani text-xs text-muted-foreground tracking-widest uppercase">Volatility</div>
            <div className="mt-1">
              <div className="font-orbitron text-xl font-bold text-yellow-400">{volatility}%</div>
              <div className="h-1.5 bg-muted rounded-full overflow-hidden mt-1">
                <div
                  className="h-full rounded-full"
                  style={{
                    width: `${volatility}%`,
                    background: volatility > 70 ? "#ff1744" : volatility > 40 ? "#ff9100" : "#00c853",
                  }}
                />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Recent tick prices */}
      {recentTicks.length > 0 && (
        <div className="cyber-card p-4 scanlines">
          <div className="font-rajdhani font-semibold text-xs text-muted-foreground tracking-widest uppercase mb-3">
            Recent Tick Prices
          </div>
          <div className="flex items-end gap-1 h-16">
            {recentTicks.slice(-20).map((tick, i) => {
              const min = Math.min(...recentTicks.slice(-20));
              const max = Math.max(...recentTicks.slice(-20));
              const range = max - min || 1;
              const heightPct = ((tick - min) / range) * 100;
              const isLatest = i === recentTicks.slice(-20).length - 1;

              return (
                <div
                  key={i}
                  className="flex-1 flex flex-col justify-end"
                  title={tick.toFixed(4)}
                >
                  <div
                    className="w-full rounded-sm transition-all duration-300 min-h-[2px]"
                    style={{
                      height: `${Math.max(heightPct, 5)}%`,
                      background: isLatest ? "#00e5ff" : "rgba(0,180,255,0.4)",
                      boxShadow: isLatest ? "0 0 6px rgba(0,229,255,0.8)" : undefined,
                    }}
                  />
                </div>
              );
            })}
          </div>
        </div>
      )}

      {isLoading ? (
        <div className="flex justify-center py-16">
          <div className="w-10 h-10 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
        </div>
      ) : contracts.length === 0 ? (
        <div className="cyber-card p-8 flex items-center justify-center gap-3 text-muted-foreground">
          <AlertCircle size={18} />
          <span className="font-rajdhani text-sm">No contract data. Select a symbol.</span>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {contracts.map((contract) => (
            <ContractCard key={contract.contract_type} contract={contract} />
          ))}
        </div>
      )}

      {/* Auto Trade Panel */}
      <AutoTradePanel
        symbol={symbol}
        pageLabel="Tick Analyser"
        signals={contracts
          .filter((c) => ["Rise", "Fall", "Only Up", "Only Down"].includes(c.contract_type))
          .map((c): TradeSignal => ({
            contract_type: (c.contract_type === "Rise" || c.contract_type === "Only Up") ? "CALL" : "PUT",
            confidence: c.confidence,
            ticks: c.recommended_ticks,
            label: c.contract_type,
          }))}
      />
    </div>
  );
}
