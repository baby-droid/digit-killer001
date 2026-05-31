import { useQuery } from "@tanstack/react-query";
import { useSymbol } from "@/context/SymbolContext";
import { ArrowUpDown, RefreshCw, AlertCircle, Brain, TrendingUp, TrendingDown } from "lucide-react";

interface TickFreq { tick: number; count: number; pct: number }
interface TickSig { signal: string; confidence: number; tick_position: number; frequency_pct: number; reasons: string[] }
interface HighLowTickData {
  symbol: string;
  current_price: number;
  sample_size: number;
  last_updated: string;
  markov: { current_state: string; predicted: string; confidence: number };
  autocorrelation: { lag1: number; interpretation: string; signal: string };
  trend: { direction: string; up_pct: number; volatility: number };
  high_low_tick: {
    high_tick_freq: TickFreq[];
    low_tick_freq: TickFreq[];
    best_high_tick: number;
    best_low_tick: number;
    worst_high_tick: number;
    worst_low_tick: number;
    total_windows: number;
    high_tick: TickSig;
    low_tick: TickSig;
  };
  price_changes: string[];
}

const CONF_COLOR = (c: number) => c >= 65 ? "#00c853" : c >= 50 ? "#ffd600" : "#ff9100";

const TICK_COLORS = ["#00e5ff", "#00c853", "#ffd600", "#ff9100", "#ff1744"];

function PositionHeatmap({ freq, type, best, worst }: {
  freq: TickFreq[]; type: "high" | "low"; best: number; worst: number;
}) {
  const color = type === "high" ? "#ffd600" : "#448aff";
  const maxPct = Math.max(...freq.map((f) => f.pct), 1);

  return (
    <div>
      <div className="font-rajdhani text-[10px] tracking-widest uppercase mb-3" style={{ color }}>
        {type === "high" ? "⬆ HIGH TICK" : "⬇ LOW TICK"} Position Frequency
      </div>
      <div className="flex gap-2">
        {freq.map((f) => {
          const isBest = f.tick === best;
          const isWorst = f.tick === worst;
          const intensity = (f.pct / maxPct);
          return (
            <div key={f.tick} className="flex-1 flex flex-col items-center gap-1">
              {/* Bar */}
              <div className="w-full h-24 flex flex-col justify-end">
                <div
                  className="w-full rounded-t transition-all duration-700"
                  style={{
                    height: `${Math.max(intensity * 100, 4)}%`,
                    background: isBest
                      ? `linear-gradient(180deg, ${color}, ${color}80)`
                      : isWorst
                      ? "rgba(255,23,68,0.3)"
                      : `${color}${Math.round(intensity * 200).toString(16).padStart(2, "0")}`,
                    boxShadow: isBest ? `0 0 12px ${color}60` : "none",
                  }}
                />
              </div>
              {/* Label */}
              <div
                className="font-orbitron text-xs font-bold text-center"
                style={{ color: isBest ? color : isWorst ? "#ff1744" : "#666" }}
              >
                T{f.tick}
              </div>
              <div className="font-orbitron text-[10px] text-center" style={{ color: isBest ? color : "#555" }}>
                {f.pct.toFixed(1)}%
              </div>
              {isBest && (
                <div className="font-rajdhani text-[8px] tracking-widest uppercase" style={{ color }}>BEST</div>
              )}
              {isWorst && (
                <div className="font-rajdhani text-[8px] tracking-widest uppercase text-red-400">AVOID</div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function SignalCard({ data, type }: { data: TickSig; type: "high" | "low" }) {
  const color = type === "high" ? "#ffd600" : "#448aff";
  return (
    <div className="cyber-card p-5 space-y-4 relative"
      style={{ border: `1px solid ${color}30`, boxShadow: `0 0 16px ${color}08` }}>
      <div className="absolute top-0 left-0 right-0 h-0.5 rounded-t"
        style={{ background: `linear-gradient(90deg,transparent,${color},transparent)` }} />
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <ArrowUpDown size={18} style={{ color }} />
          <span className="font-orbitron text-sm font-bold" style={{ color }}>
            {type === "high" ? "HIGH TICK" : "LOW TICK"}
          </span>
        </div>
        <div className="font-rajdhani text-[9px] tracking-widest uppercase text-muted-foreground">
          {data.frequency_pct.toFixed(1)}% historical
        </div>
      </div>

      <div className="text-center py-4 rounded-lg" style={{ background: `${color}0a` }}>
        <div className="font-rajdhani text-[10px] text-muted-foreground tracking-widest uppercase mb-1">RECOMMENDED</div>
        <div className="font-orbitron text-3xl font-black" style={{ color, textShadow: `0 0 20px ${color}60` }}>
          TICK {data.tick_position}
        </div>
        <div className="font-rajdhani text-xs text-muted-foreground mt-1">{data.signal}</div>
      </div>

      {/* Tick selector visual */}
      <div className="flex gap-1.5 justify-center">
        {[1, 2, 3, 4, 5].map((t) => {
          const isBest = t === data.tick_position;
          return (
            <div
              key={t}
              className="w-10 h-10 rounded-lg flex items-center justify-center font-orbitron text-sm font-bold transition-all"
              style={{
                background: isBest ? `${color}25` : "rgba(255,255,255,0.03)",
                border: `2px solid ${isBest ? color : "rgba(255,255,255,0.08)"}`,
                color: isBest ? color : "#555",
                boxShadow: isBest ? `0 0 12px ${color}50` : "none",
              }}
            >
              {t}
            </div>
          );
        })}
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

      <div className="space-y-1.5 pt-1 border-t border-border/30">
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

function RecentPriceStream({ changes }: { changes: string[] }) {
  const last20 = changes.slice(-20);
  return (
    <div className="flex items-center gap-1 flex-wrap">
      {last20.map((d, i) => {
        const color = TICK_COLORS[i % 5];
        return (
          <div key={i} className="flex flex-col items-center gap-0.5">
            <div className="w-1.5 h-1.5 rounded-full" style={{ background: d === "UP" ? "#00c853" : "#ff1744" }} />
          </div>
        );
      })}
    </div>
  );
}

export default function HighLowTickPage() {
  const { symbol } = useSymbol();

  const { data, isLoading, refetch } = useQuery<HighLowTickData>({
    queryKey: ["/api/enhanced-tick-analysis", symbol, "hlt"],
    queryFn: async () => {
      const res = await fetch(`/api/enhanced-tick-analysis?symbol=${symbol}&count=500`);
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
    enabled: !!symbol,
    refetchInterval: 3000,
    staleTime: 2000,
  });

  const hlt = data?.high_low_tick;
  const trendColor = data?.trend.direction === "UP" ? "#00c853" : "#ff1744";
  const markovColor = data?.markov.predicted === "UP" ? "#00c853" : "#ff1744";

  return (
    <div className="space-y-4 animate-fade-in-up" data-testid="page-high-low-tick">
      <div className="flex items-start justify-between">
        <div>
          <h2 className="font-orbitron text-lg font-bold text-primary tracking-wider">HIGH TICK / LOW TICK</h2>
          <p className="font-rajdhani text-xs text-muted-foreground tracking-widest uppercase mt-0.5">
            Position Frequency Analysis · Markov · Trend Momentum
          </p>
        </div>
        <button onClick={() => refetch()} className="p-2 rounded-md bg-primary/10 border border-primary/30 text-primary hover:bg-primary/20 transition-colors">
          <RefreshCw size={14} className={isLoading ? "animate-spin" : ""} />
        </button>
      </div>

      {!symbol && (
        <div className="cyber-card p-6 flex items-center gap-3 text-muted-foreground">
          <AlertCircle size={16} /><span className="font-rajdhani text-sm">Select a symbol.</span>
        </div>
      )}

      {isLoading && !data && (
        <div className="flex justify-center py-16 flex-col items-center gap-4">
          <Brain size={36} className="text-primary animate-pulse" />
          <span className="font-rajdhani text-xs text-muted-foreground tracking-widest">COMPUTING TICK POSITION FREQUENCIES…</span>
        </div>
      )}

      {data && hlt && (
        <>
          {/* Stats strip */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div className="cyber-card p-3">
              <div className="font-rajdhani text-[10px] text-muted-foreground tracking-widest uppercase">Price</div>
              <div className="font-orbitron text-lg font-bold text-foreground mt-1">{data.current_price}</div>
              <div className="font-rajdhani text-[10px] text-muted-foreground">{hlt.total_windows} windows analyzed</div>
            </div>
            <div className="cyber-card p-3">
              <div className="font-rajdhani text-[10px] text-muted-foreground tracking-widest uppercase">Trend</div>
              <div className="font-orbitron text-lg font-bold mt-1 flex items-center gap-1" style={{ color: trendColor }}>
                {data.trend.direction === "UP" ? <TrendingUp size={16} /> : <TrendingDown size={16} />}
                {data.trend.direction}
              </div>
              <div className="font-rajdhani text-[10px] text-muted-foreground">{data.trend.up_pct}% up-moves</div>
            </div>
            <div className="cyber-card p-3">
              <div className="font-rajdhani text-[10px] text-muted-foreground tracking-widest uppercase">Best High Tick</div>
              <div className="font-orbitron text-3xl font-black mt-1 text-yellow-400">{hlt.best_high_tick}</div>
              <div className="font-rajdhani text-[10px] text-muted-foreground">
                {hlt.high_tick_freq.find((f) => f.tick === hlt.best_high_tick)?.pct}% frequency
              </div>
            </div>
            <div className="cyber-card p-3">
              <div className="font-rajdhani text-[10px] text-muted-foreground tracking-widest uppercase">Best Low Tick</div>
              <div className="font-orbitron text-3xl font-black mt-1 text-blue-400">{hlt.best_low_tick}</div>
              <div className="font-rajdhani text-[10px] text-muted-foreground">
                {hlt.low_tick_freq.find((f) => f.tick === hlt.best_low_tick)?.pct}% frequency
              </div>
            </div>
          </div>

          {/* Heatmaps */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="cyber-card p-5">
              <PositionHeatmap
                freq={hlt.high_tick_freq}
                type="high"
                best={hlt.best_high_tick}
                worst={hlt.worst_high_tick}
              />
              <p className="font-rajdhani text-[10px] text-muted-foreground mt-3">
                Based on {hlt.total_windows} complete 5-tick windows from {data.sample_size.toLocaleString()} price samples.
              </p>
            </div>
            <div className="cyber-card p-5">
              <PositionHeatmap
                freq={hlt.low_tick_freq}
                type="low"
                best={hlt.best_low_tick}
                worst={hlt.worst_low_tick}
              />
              <p className="font-rajdhani text-[10px] text-muted-foreground mt-3">
                Tick 1 = first tick after entry. Each window is non-overlapping.
              </p>
            </div>
          </div>

          {/* Combined matrix */}
          <div className="cyber-card p-4">
            <div className="flex items-center gap-2 mb-4">
              <ArrowUpDown size={14} className="text-primary" />
              <span className="font-rajdhani font-semibold text-xs text-muted-foreground tracking-widest uppercase">
                Full Position Table — {hlt.total_windows} Windows
              </span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs font-orbitron">
                <thead>
                  <tr>
                    <th className="text-left font-rajdhani text-muted-foreground pb-2 tracking-widest">TICK</th>
                    {[1, 2, 3, 4, 5].map((t) => (
                      <th key={t} className="text-center pb-2 font-bold" style={{ color: TICK_COLORS[t - 1] }}>T{t}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/20">
                  <tr>
                    <td className="py-2 font-rajdhani text-yellow-400 tracking-widest uppercase text-[10px]">HIGH %</td>
                    {hlt.high_tick_freq.map((f) => (
                      <td key={f.tick} className="py-2 text-center">
                        <span className={`font-bold ${f.tick === hlt.best_high_tick ? "text-yellow-400" : f.tick === hlt.worst_high_tick ? "text-red-500/60" : "text-muted-foreground"}`}>
                          {f.pct}
                        </span>
                      </td>
                    ))}
                  </tr>
                  <tr>
                    <td className="py-2 font-rajdhani text-blue-400 tracking-widest uppercase text-[10px]">LOW %</td>
                    {hlt.low_tick_freq.map((f) => (
                      <td key={f.tick} className="py-2 text-center">
                        <span className={`font-bold ${f.tick === hlt.best_low_tick ? "text-blue-400" : f.tick === hlt.worst_low_tick ? "text-red-500/60" : "text-muted-foreground"}`}>
                          {f.pct}
                        </span>
                      </td>
                    ))}
                  </tr>
                  <tr>
                    <td className="py-2 font-rajdhani text-muted-foreground tracking-widest uppercase text-[10px]">HIGH #</td>
                    {hlt.high_tick_freq.map((f) => (
                      <td key={f.tick} className="py-2 text-center text-muted-foreground/60">{f.count}</td>
                    ))}
                  </tr>
                  <tr>
                    <td className="py-2 font-rajdhani text-muted-foreground tracking-widest uppercase text-[10px]">LOW #</td>
                    {hlt.low_tick_freq.map((f) => (
                      <td key={f.tick} className="py-2 text-center text-muted-foreground/60">{f.count}</td>
                    ))}
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          {/* AI signal cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <SignalCard data={hlt.high_tick} type="high" />
            <SignalCard data={hlt.low_tick} type="low" />
          </div>

          {/* Markov + autocorr summary */}
          <div className="cyber-card p-4">
            <div className="font-rajdhani text-xs text-muted-foreground tracking-widest uppercase mb-3">AI MODEL SUMMARY</div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div className="p-3 rounded-lg" style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)" }}>
                <div className="font-rajdhani text-[9px] text-muted-foreground tracking-widest uppercase mb-1">Markov Prediction</div>
                <div className="font-orbitron text-sm font-bold" style={{ color: markovColor }}>{data.markov.predicted}</div>
                <div className="font-rajdhani text-[10px] text-muted-foreground">{data.markov.confidence.toFixed(1)}% confidence</div>
              </div>
              <div className="p-3 rounded-lg" style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)" }}>
                <div className="font-rajdhani text-[9px] text-muted-foreground tracking-widest uppercase mb-1">Autocorrelation</div>
                <div className="font-orbitron text-sm font-bold" style={{ color: data.autocorrelation.interpretation === "trending" ? "#00c853" : data.autocorrelation.interpretation === "mean_reverting" ? "#448aff" : "#ffd600" }}>
                  {data.autocorrelation.signal}
                </div>
                <div className="font-rajdhani text-[10px] text-muted-foreground">r={data.autocorrelation.lag1} ({data.autocorrelation.interpretation})</div>
              </div>
              <div className="p-3 rounded-lg" style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)" }}>
                <div className="font-rajdhani text-[9px] text-muted-foreground tracking-widest uppercase mb-1">Volatility</div>
                <div className="font-orbitron text-sm font-bold text-primary">{data.trend.volatility.toFixed(3)}%</div>
                <div className="font-rajdhani text-[10px] text-muted-foreground">20-tick range</div>
              </div>
            </div>
          </div>

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
