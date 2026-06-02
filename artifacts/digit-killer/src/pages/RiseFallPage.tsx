import { useQuery } from "@tanstack/react-query";
import { useSymbol } from "@/context/SymbolContext";
import { TrendingUp, TrendingDown, RefreshCw, AlertCircle, Brain, Activity } from "lucide-react";
import AutoTradePanel from "@/components/AutoTradePanel";

interface MarkovState {
  current_state: string;
  p_up_given_up: number;
  p_down_given_up: number;
  p_up_given_down: number;
  p_down_given_down: number;
  predicted: string;
  confidence: number;
}
interface AutoCorr { lag1: number; interpretation: string; signal: string }
interface TrendInfo { direction: string; up_pct: number; down_pct: number; volatility: number }
interface ContractSig { signal: string; confidence: number; duration: number; reasons: string[]; risk_level: string; psych_score?: number; psych_favors_win?: boolean; psych_win_rate_10?: number; psych_win_rate_5?: number; psych_streak?: number; psych_momentum?: string; psych_reason?: string; }
interface RiseFallData {
  symbol: string;
  current_price: number;
  current_digit: number;
  sample_size: number;
  last_updated: string;
  markov: MarkovState;
  autocorrelation: AutoCorr;
  trend: TrendInfo;
  rise_fall: { rise: ContractSig; fall: ContractSig };
  recent_prices: number[];
  price_changes: string[];
}

const CONF_COLOR = (c: number) => c >= 70 ? "#00c853" : c >= 55 ? "#ffd600" : "#ff9100";

function MarkovTable({ m }: { m: MarkovState }) {
  const cells = [
    { label: "UP → UP", val: m.p_up_given_up, highlight: m.current_state === "UP" && m.predicted === "UP" },
    { label: "UP → DOWN", val: m.p_down_given_up, highlight: m.current_state === "UP" && m.predicted === "DOWN" },
    { label: "DOWN → UP", val: m.p_up_given_down, highlight: m.current_state === "DOWN" && m.predicted === "UP" },
    { label: "DOWN → DOWN", val: m.p_down_given_down, highlight: m.current_state === "DOWN" && m.predicted === "DOWN" },
  ];
  return (
    <div className="grid grid-cols-2 gap-2">
      {cells.map(({ label, val, highlight }) => (
        <div
          key={label}
          className="p-3 rounded-lg text-center"
          style={{
            background: highlight ? "rgba(0,229,255,0.12)" : "rgba(255,255,255,0.03)",
            border: `1px solid ${highlight ? "rgba(0,229,255,0.4)" : "rgba(255,255,255,0.07)"}`,
            boxShadow: highlight ? "0 0 10px rgba(0,229,255,0.2)" : "none",
          }}
        >
          <div className="font-rajdhani text-[9px] text-muted-foreground tracking-widest uppercase mb-1">{label}</div>
          <div className="font-orbitron text-lg font-bold" style={{ color: highlight ? "#00e5ff" : "#aaa" }}>
            {val.toFixed(1)}%
          </div>
        </div>
      ))}
    </div>
  );
}

function SignalCard({ data, type }: { data: ContractSig; type: "rise" | "fall" }) {
  const color = type === "rise" ? "#00c853" : "#ff1744";
  const isBuy = data.signal.startsWith("BUY");
  return (
    <div
      className="cyber-card p-5 space-y-4"
      style={{ border: `1px solid ${color}30`, boxShadow: isBuy ? `0 0 20px ${color}10` : "none" }}
    >
      <div className="absolute top-0 left-0 right-0 h-0.5 rounded-t" style={{ background: isBuy ? `linear-gradient(90deg,transparent,${color},transparent)` : "none" }} />
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {type === "rise" ? <TrendingUp size={18} style={{ color }} /> : <TrendingDown size={18} style={{ color }} />}
          <span className="font-orbitron text-sm font-bold" style={{ color }}>
            {type === "rise" ? "RISE (CALL)" : "FALL (PUT)"}
          </span>
        </div>
        <span className={`risk-${data.risk_level.toLowerCase()} text-xs`}>{data.risk_level}</span>
      </div>

      <div className="text-center py-3 rounded-lg" style={{ background: isBuy ? `${color}0a` : "rgba(255,255,255,0.02)" }}>
        <div className="font-orbitron text-2xl font-black" style={{ color: isBuy ? color : "#555", textShadow: isBuy ? `0 0 16px ${color}60` : "none" }}>
          {data.signal}
        </div>
        <div className="font-rajdhani text-[10px] text-muted-foreground mt-1 tracking-wider">{data.duration} TICK CONTRACT</div>
      </div>

      <div>
        <div className="flex justify-between text-[10px] font-rajdhani text-muted-foreground mb-1.5 tracking-widest">
          <span>CONFIDENCE</span>
          <span className="font-orbitron" style={{ color: CONF_COLOR(data.confidence) }}>{data.confidence.toFixed(1)}%</span>
        </div>
        <div className="h-2 bg-muted/30 rounded-full overflow-hidden">
          <div className="h-full rounded-full transition-all duration-700"
            style={{ width: `${data.confidence}%`, background: `linear-gradient(90deg,${color}60,${color})`, boxShadow: `0 0 8px ${color}60` }} />
        </div>
      </div>

      <div className="space-y-1.5">
        {data.reasons.map((r, i) => (
          <div key={i} className="flex items-start gap-2">
            <div className="w-1 h-1 rounded-full mt-1.5 flex-shrink-0" style={{ background: color }} />
            <span className="font-rajdhani text-[11px] text-foreground/75">{r}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function PriceChart({ prices, changes }: { prices: number[]; changes: string[] }) {
  if (!prices.length) return null;
  const mn = Math.min(...prices), mx = Math.max(...prices);
  const range = mx - mn || 1;
  return (
    <div className="cyber-card p-4">
      <div className="flex items-center gap-2 mb-3">
        <Activity size={13} className="text-primary" />
        <span className="font-rajdhani text-xs text-muted-foreground tracking-widest uppercase">Recent Price Action (last 30 ticks)</span>
        <div className="ml-auto flex items-center gap-3 text-[10px] font-rajdhani">
          <span className="text-green-400">● UP</span>
          <span className="text-red-400">● DOWN</span>
        </div>
      </div>
      <div className="flex items-end gap-0.5 h-20">
        {prices.map((p, i) => {
          const h = ((p - mn) / range) * 100;
          const dir = changes[changes.length - prices.length + i];
          const isLast = i === prices.length - 1;
          return (
            <div key={i} className="flex-1 flex flex-col justify-end" title={String(p)}>
              <div className="w-full rounded-sm min-h-[2px] transition-all"
                style={{
                  height: `${Math.max(h, 4)}%`,
                  background: isLast ? "#00e5ff" : dir === "UP" ? "rgba(0,200,83,0.7)" : "rgba(255,23,68,0.6)",
                  boxShadow: isLast ? "0 0 6px #00e5ff" : "none",
                }}
              />
            </div>
          );
        })}
      </div>
      <div className="flex items-center gap-1 mt-2 flex-wrap">
        {changes.slice(-30).map((d, i) => (
          <span key={i} className="font-orbitron text-[9px] font-bold"
            style={{ color: d === "UP" ? "#00c853" : "#ff1744" }}>
            {d === "UP" ? "▲" : "▼"}
          </span>
        ))}
      </div>
    </div>
  );
}

export default function RiseFallPage() {
  const { symbol } = useSymbol();

  const { data, isLoading, refetch } = useQuery<RiseFallData>({
    queryKey: ["/api/enhanced-tick-analysis", symbol],
    queryFn: async () => {
      const res = await fetch(`/api/enhanced-tick-analysis?symbol=${symbol}&count=500`);
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
    enabled: !!symbol,
    refetchInterval: 3000,
    staleTime: 2000,
  });

  const trendColor = data?.trend.direction === "UP" ? "#00c853" : "#ff1744";
  const autocorrColor = data?.autocorrelation.interpretation === "trending" ? "#00c853"
    : data?.autocorrelation.interpretation === "mean_reverting" ? "#448aff" : "#ffd600";
  const markovColor = data?.markov.predicted === "UP" ? "#00c853" : "#ff1744";

  return (
    <div className="space-y-4 animate-fade-in-up" data-testid="page-rise-fall">
      <div className="flex items-start justify-between">
        <div>
          <h2 className="font-orbitron text-lg font-bold text-primary tracking-wider">RISE / FALL</h2>
          <p className="font-rajdhani text-xs text-muted-foreground tracking-widest uppercase mt-0.5">
            Markov Chain · Autocorrelation · Momentum Analysis
          </p>
        </div>
        <button onClick={() => refetch()} className="p-2 rounded-md bg-primary/10 border border-primary/30 text-primary hover:bg-primary/20 transition-colors">
          <RefreshCw size={14} className={isLoading ? "animate-spin" : ""} />
        </button>
      </div>

      {!symbol && (
        <div className="cyber-card p-6 flex items-center gap-3 text-muted-foreground">
          <AlertCircle size={16} /><span className="font-rajdhani text-sm">Select a symbol to start.</span>
        </div>
      )}

      {isLoading && !data && (
        <div className="flex justify-center py-16 flex-col items-center gap-4">
          <Brain size={36} className="text-primary animate-pulse" />
          <span className="font-rajdhani text-xs text-muted-foreground tracking-widest">RUNNING MARKOV + AUTOCORRELATION…</span>
        </div>
      )}

      {data && (
        <>
          {/* Status strip */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div className="cyber-card p-3">
              <div className="font-rajdhani text-[10px] text-muted-foreground tracking-widest uppercase">Current Price</div>
              <div className="font-orbitron text-lg font-bold text-foreground mt-1">{data.current_price}</div>
              <div className="font-rajdhani text-[10px] text-muted-foreground">{data.sample_size.toLocaleString()} ticks sampled</div>
            </div>
            <div className="cyber-card p-3">
              <div className="font-rajdhani text-[10px] text-muted-foreground tracking-widest uppercase">Trend</div>
              <div className="font-orbitron text-lg font-bold mt-1 flex items-center gap-1" style={{ color: trendColor }}>
                {data.trend.direction === "UP" ? <TrendingUp size={16} /> : <TrendingDown size={16} />}
                {data.trend.direction}
              </div>
              <div className="font-rajdhani text-[10px] text-muted-foreground">{data.trend.up_pct}% up / {data.trend.down_pct}% down</div>
            </div>
            <div className="cyber-card p-3">
              <div className="font-rajdhani text-[10px] text-muted-foreground tracking-widest uppercase">Markov Next</div>
              <div className="font-orbitron text-lg font-bold mt-1" style={{ color: markovColor }}>
                {data.markov.predicted}
              </div>
              <div className="font-rajdhani text-[10px] text-muted-foreground">{data.markov.confidence.toFixed(1)}% confidence</div>
            </div>
            <div className="cyber-card p-3">
              <div className="font-rajdhani text-[10px] text-muted-foreground tracking-widest uppercase">Autocorrelation</div>
              <div className="font-orbitron text-sm font-bold mt-1" style={{ color: autocorrColor }}>
                {data.autocorrelation.signal}
              </div>
              <div className="font-rajdhani text-[10px] text-muted-foreground">r={data.autocorrelation.lag1} ({data.autocorrelation.interpretation})</div>
            </div>
          </div>

          {/* Markov matrix */}
          <div className="cyber-card p-4">
            <div className="flex items-center gap-2 mb-4">
              <Brain size={14} className="text-primary" />
              <span className="font-rajdhani font-semibold text-xs text-muted-foreground tracking-widest uppercase">
                Markov Transition Matrix — Current State: <span style={{ color: markovColor }}>{data.markov.current_state}</span>
              </span>
              <span className="ml-auto font-rajdhani text-[10px] text-muted-foreground">
                Predicted next: <span className="font-orbitron font-bold" style={{ color: markovColor }}>{data.markov.predicted}</span>
              </span>
            </div>
            <MarkovTable m={data.markov} />
            <p className="font-rajdhani text-[10px] text-muted-foreground mt-3">
              Highlighted cell = current state → predicted next state. Based on {data.sample_size.toLocaleString()} price ticks.
            </p>
          </div>

          {/* Price chart */}
          <PriceChart prices={data.recent_prices} changes={data.price_changes} />

          {/* Signal cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="relative"><SignalCard data={data.rise_fall.rise} type="rise" /></div>
            <div className="relative"><SignalCard data={data.rise_fall.fall} type="fall" /></div>
          </div>

          {/* Auto Trade */}
          <AutoTradePanel
            symbol={symbol}
            pageLabel="Rise / Fall"
            signals={[
              {
                label: "Rise (CALL)", contract_type: "CALL",
                confidence: data.rise_fall.rise.confidence, ticks: data.rise_fall.rise.duration,
                psych_favors_win: data.rise_fall.rise.psych_favors_win,
                psych_score: data.rise_fall.rise.psych_score,
                psych_win_rate_10: data.rise_fall.rise.psych_win_rate_10,
                psych_streak: data.rise_fall.rise.psych_streak,
              },
              {
                label: "Fall (PUT)", contract_type: "PUT",
                confidence: data.rise_fall.fall.confidence, ticks: data.rise_fall.fall.duration,
                psych_favors_win: data.rise_fall.fall.psych_favors_win,
                psych_score: data.rise_fall.fall.psych_score,
                psych_win_rate_10: data.rise_fall.fall.psych_win_rate_10,
                psych_streak: data.rise_fall.fall.psych_streak,
              },
            ]}
          />

          <div className="text-center">
            <p className="font-rajdhani text-[10px] text-muted-foreground tracking-widest">
              Updated {new Date(data.last_updated).toLocaleTimeString()} · {data.sample_size.toLocaleString()} ticks · Not financial advice
            </p>
          </div>
        </>
      )}
    </div>
  );
}
