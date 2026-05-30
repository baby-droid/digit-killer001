import { useRef } from "react";
import {
  useGetAiSignals,
  getGetAiSignalsQueryKey,
} from "@workspace/api-client-react";
import { useSymbol } from "@/context/SymbolContext";
import { Zap, Download, AlertCircle } from "lucide-react";
import logoPath from "@assets/WhatsApp_Image_2026-05-30_at_19.05.28_1780157146139.jpeg";

interface AiSignal {
  id: string;
  symbol: string;
  contract_type: string;
  direction: string;
  entry_digit: number;
  ticks: number;
  confidence: number;
  strategy: string;
  timestamp: string;
  reason: string;
  risk_level: string;
}

const DIGIT_COLORS: Record<number, string> = {
  0: "#00e5d4", 1: "#448aff", 2: "#ce93d8", 3: "#00c853", 4: "#ff9100",
  5: "#00e5ff", 6: "#c6ff00", 7: "#ff1744", 8: "#f50057", 9: "#ffd600",
};

const CONTRACT_COLOR: Record<string, string> = {
  MATCHES: "#00e5ff",
  DIFFERS: "#ce93d8",
  OVER: "#00c853",
  UNDER: "#448aff",
};

async function downloadFlyer(signal: AiSignal) {
  // Dynamically import html2canvas to avoid SSR issues
  const html2canvas = (await import("html2canvas")).default;
  const el = document.getElementById(`flyer-${signal.id}`);
  if (!el) return;
  const canvas = await html2canvas(el, {
    backgroundColor: "#050a10",
    scale: 2,
    useCORS: true,
    allowTaint: true,
  });
  const link = document.createElement("a");
  link.download = `digit-killer-signal-${signal.symbol}-${signal.contract_type}.png`;
  link.href = canvas.toDataURL("image/png");
  link.click();
}

function SignalFlyer({ signal }: { signal: AiSignal }) {
  const contractColor = CONTRACT_COLOR[signal.contract_type] ?? "#00e5ff";
  const digitColor = DIGIT_COLORS[signal.entry_digit] ?? "#fff";
  const timeStr = new Date(signal.timestamp).toLocaleString();

  return (
    <div
      id={`flyer-${signal.id}`}
      className="cyber-card p-5 relative overflow-hidden"
      style={{
        border: `1px solid ${contractColor}40`,
        boxShadow: `0 0 20px ${contractColor}18`,
      }}
      data-testid={`signal-card-${signal.id}`}
    >
      {/* Top accent line */}
      <div
        className="absolute top-0 left-0 right-0 h-0.5"
        style={{ background: `linear-gradient(90deg, transparent, ${contractColor}, transparent)` }}
      />

      {/* Header */}
      <div className="flex items-start justify-between mb-4">
        <div className="flex items-center gap-2">
          <img src={logoPath} alt="logo" className="w-7 h-7 rounded-full object-cover" />
          <div>
            <div className="font-orbitron text-xs font-bold text-primary tracking-widest">DIGIT KILLER</div>
            <div className="font-rajdhani text-[9px] text-muted-foreground tracking-widest">AHMEDSYNTRADER.SITE</div>
          </div>
        </div>
        <div className="flex flex-col items-end gap-1">
          <span
            className="font-orbitron text-xs font-bold px-2 py-0.5 rounded"
            style={{ background: `${contractColor}20`, color: contractColor, border: `1px solid ${contractColor}40` }}
          >
            {signal.contract_type}
          </span>
          <span className={`risk-${signal.risk_level?.toLowerCase() ?? "medium"} text-[10px]`}>
            {signal.risk_level}
          </span>
        </div>
      </div>

      {/* Direction hero */}
      <div className="text-center mb-4 py-3 rounded-lg" style={{ background: `${contractColor}08` }}>
        <div
          className="font-orbitron text-2xl font-black mb-1"
          style={{ color: contractColor, textShadow: `0 0 20px ${contractColor}60` }}
        >
          {signal.direction}
        </div>
        <div className="font-rajdhani text-xs text-muted-foreground tracking-widest uppercase">
          {signal.strategy}
        </div>
      </div>

      {/* Stats grid */}
      <div className="grid grid-cols-3 gap-3 mb-3">
        <div className="text-center">
          <div className="font-rajdhani text-[10px] text-muted-foreground tracking-wider uppercase">Symbol</div>
          <div className="font-orbitron text-xs font-bold text-foreground">{signal.symbol}</div>
        </div>
        <div className="text-center">
          <div className="font-rajdhani text-[10px] text-muted-foreground tracking-wider uppercase">Entry Digit</div>
          <div
            className="font-orbitron text-xl font-bold"
            style={{ color: digitColor }}
          >
            {signal.entry_digit}
          </div>
        </div>
        <div className="text-center">
          <div className="font-rajdhani text-[10px] text-muted-foreground tracking-wider uppercase">Ticks</div>
          <div className="font-orbitron text-xl font-bold text-primary">{signal.ticks}</div>
        </div>
      </div>

      {/* Confidence */}
      <div className="mb-3">
        <div className="flex items-center justify-between text-[10px] font-rajdhani text-muted-foreground mb-1 tracking-wider">
          <span>CONFIDENCE</span>
          <span className="font-orbitron text-primary">{signal.confidence.toFixed(1)}%</span>
        </div>
        <div className="h-1.5 bg-muted rounded-full overflow-hidden">
          <div
            className="h-full rounded-full transition-all duration-500"
            style={{
              width: `${signal.confidence}%`,
              background: `linear-gradient(90deg, ${contractColor}80, ${contractColor})`,
              boxShadow: `0 0 6px ${contractColor}80`,
            }}
          />
        </div>
      </div>

      {/* Reason */}
      <div className="text-[10px] font-rajdhani text-muted-foreground leading-snug mb-3 border-t border-border/40 pt-2">
        {signal.reason}
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between border-t border-border/40 pt-2">
        <span className="font-rajdhani text-[10px] text-muted-foreground">{timeStr}</span>
        <div className="flex items-center gap-1">
          <Zap size={10} className="text-primary" />
          <span className="font-rajdhani text-[10px] text-primary font-semibold tracking-wider">AI SIGNAL</span>
        </div>
      </div>
    </div>
  );
}

export default function AiSignalsPage() {
  const { symbol } = useSymbol();

  const { data, isLoading, refetch } = useGetAiSignals(
    { symbol },
    {
      query: {
        enabled: !!symbol,
        queryKey: getGetAiSignalsQueryKey({ symbol }),
        refetchInterval: 5000,
      },
    }
  );

  const d = data as Record<string, unknown> | undefined;
  const signals: AiSignal[] = (d?.signals as AiSignal[]) ?? [];
  const marketCondition: string = (d?.market_condition as string) ?? "BALANCED";
  const lastUpdated: string = (d?.last_updated as string) ?? "";

  const conditionColor =
    marketCondition === "HIGH_PRESSURE"
      ? "#ff1744"
      : marketCondition === "LOW_PRESSURE"
      ? "#448aff"
      : "#00e5ff";

  return (
    <div className="space-y-4 animate-fade-in-up" data-testid="page-ai-signals">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h2 className="font-orbitron text-lg font-bold text-primary tracking-wider">
            AI SIGNALS
          </h2>
          <p className="font-rajdhani text-xs text-muted-foreground tracking-widest uppercase mt-0.5">
            AI-Generated Trading Signals · Downloadable Flyers
          </p>
        </div>
        <button
          onClick={() => refetch()}
          className="px-3 py-1.5 rounded text-xs font-rajdhani font-semibold tracking-widest uppercase border border-primary/30 text-primary hover:bg-primary/10 transition-all"
          data-testid="button-refresh-signals"
        >
          Refresh
        </button>
      </div>

      {/* Market condition banner */}
      {d && (
        <div
          className="cyber-card p-3 flex items-center gap-4"
          style={{ borderColor: `${conditionColor}40` }}
        >
          <div className="live-dot w-2 h-2" style={{ background: conditionColor, boxShadow: `0 0 8px ${conditionColor}` }} />
          <div>
            <span className="font-rajdhani text-xs text-muted-foreground tracking-widest uppercase mr-2">
              Market Condition:
            </span>
            <span className="font-orbitron text-xs font-bold" style={{ color: conditionColor }}>
              {marketCondition.replace("_", " ")}
            </span>
          </div>
          {lastUpdated && (
            <span className="ml-auto font-rajdhani text-[10px] text-muted-foreground">
              Updated {new Date(lastUpdated).toLocaleTimeString()}
            </span>
          )}
        </div>
      )}

      {isLoading ? (
        <div className="flex justify-center py-20">
          <div className="flex flex-col items-center gap-4">
            <div className="w-12 h-12 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
            <span className="font-rajdhani text-xs text-muted-foreground tracking-widest animate-blink">
              GENERATING AI SIGNALS...
            </span>
          </div>
        </div>
      ) : signals.length === 0 ? (
        <div className="cyber-card p-8 flex items-center justify-center gap-3 text-muted-foreground">
          <AlertCircle size={18} />
          <span className="font-rajdhani text-sm">No signals generated. Select a symbol.</span>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {signals.map((signal) => (
              <div key={signal.id} className="space-y-2">
                <SignalFlyer signal={signal} />
                <button
                  onClick={() => downloadFlyer(signal)}
                  className="w-full flex items-center justify-center gap-2 py-2 rounded-md border border-primary/25 text-primary hover:bg-primary/10 transition-all text-xs font-rajdhani font-semibold tracking-widest uppercase"
                  data-testid={`button-download-${signal.id}`}
                >
                  <Download size={12} />
                  Download Flyer
                </button>
              </div>
            ))}
          </div>

          {/* Branding note */}
          <div className="text-center">
            <p className="font-rajdhani text-[10px] text-muted-foreground tracking-widest">
              DIGIT KILLER · AI Trading System · AHMEDSYNTRADER.SITE
            </p>
          </div>
        </>
      )}
    </div>
  );
}
