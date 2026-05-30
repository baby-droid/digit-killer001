import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useSymbol } from "@/context/SymbolContext";
import { Activity, Brain, BarChart3, TrendingUp, Download, RefreshCw } from "lucide-react";

const DIGIT_COLORS: Record<number, string> = {
  0: "#00e5d4", 1: "#448aff", 2: "#ce93d8", 3: "#00c853", 4: "#ff9100",
  5: "#00e5ff", 6: "#c6ff00", 7: "#ff1744", 8: "#f50057", 9: "#ffd600",
};

const HEAT_STOPS = ["#0a1628", "#0d2545", "#0e3d6e", "#0e5b9e", "#0e7cd6", "#00a8ff", "#00d4ff", "#00ffcc", "#aaff00", "#ffcc00", "#ff6600", "#ff2200"];

function heatColor(v: number) {
  const idx = Math.min(HEAT_STOPS.length - 1, Math.floor((v / 100) * HEAT_STOPS.length));
  return HEAT_STOPS[idx];
}

interface AdvancedData {
  symbol: string;
  sample_size: number;
  last_updated: string;
  markov: {
    transition_matrix: number[][];
    current_digit: number;
    predicted_next: number;
    predicted_probability: number;
    steady_state: number[];
    next_predictions: Array<{ from: number; next: number; probability: number }>;
  };
  autocorrelation: {
    correlations: Array<{ lag: number; r: number; significant: boolean }>;
    critical_value: number;
    has_pattern: boolean;
    mean_digit: number;
    ljung_box_q: number;
    pacf: Array<{ lag: number; pacf: number }>;
  };
  hurst: {
    hurst: number;
    interpretation: string;
    regime: "trending" | "random" | "mean_reverting";
    r_s_values: Array<{ n: number; rs: number }>;
  };
  run_length: {
    current_digit: number;
    current_streak: number;
    parity_streak: number;
    parity_type: string;
    over_under_streak: number;
    over_under_type: string;
    avg_run_lengths: Record<string, number>;
    streak_signal: string;
  };
  conditional_probability: {
    current_prediction: { key: string; best: number; bestProb: number; probs: number[] } | null;
    predictable_pairs: Array<{ after: string; predict: number; confidence: number }>;
  };
  ensemble_signals: Array<{ type: string; direction: string; confidence: number; reasoning: string }>;
}

function MarkovMatrix({ matrix, currentDigit }: { matrix: number[][]; currentDigit: number }) {
  return (
    <div className="overflow-x-auto">
      <table className="text-xs w-full min-w-[480px]" data-testid="markov-matrix">
        <thead>
          <tr>
            <th className="font-rajdhani text-muted-foreground p-1 text-right">From↓ To→</th>
            {Array.from({ length: 10 }, (_, i) => (
              <th key={i} className="p-1 w-9 font-orbitron" style={{ color: DIGIT_COLORS[i] }}>{i}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {matrix.map((row, from) => (
            <tr key={from} className={from === currentDigit ? "ring-1 ring-primary/40 bg-primary/5" : ""}>
              <td className="p-1 text-right font-orbitron font-bold" style={{ color: DIGIT_COLORS[from] }}>{from}</td>
              {row.map((v, to) => {
                const bg = heatColor(v);
                const isMax = v === Math.max(...row);
                return (
                  <td
                    key={to}
                    className="p-0.5 text-center"
                    title={`P(${to}|${from}) = ${v}%`}
                  >
                    <div
                      className="flex items-center justify-center rounded text-[10px] font-orbitron w-8 h-6 mx-auto"
                      style={{
                        background: bg,
                        color: v > 14 ? "#fff" : "#888",
                        border: isMax ? "1px solid rgba(255,255,255,0.3)" : "1px solid transparent",
                        fontWeight: isMax ? "bold" : "normal",
                      }}
                    >
                      {v}
                    </div>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function AutocorrChart({ correlations, criticalValue }: { correlations: Array<{ lag: number; r: number; significant: boolean }>; criticalValue: number }) {
  const maxR = Math.max(...correlations.map((c) => Math.abs(c.r)), criticalValue, 0.1);

  return (
    <div className="space-y-2" data-testid="autocorr-chart">
      {correlations.slice(0, 15).map(({ lag, r, significant }) => {
        const pct = (Math.abs(r) / maxR) * 100;
        const critPct = (criticalValue / maxR) * 100;
        return (
          <div key={lag} className="flex items-center gap-2">
            <span className="w-6 text-right font-orbitron text-xs text-muted-foreground">{lag}</span>
            <div className="flex-1 h-4 bg-muted/30 rounded relative overflow-hidden">
              {/* Critical value line */}
              <div
                className="absolute top-0 bottom-0 w-px bg-yellow-400/50"
                style={{ left: `${critPct}%` }}
              />
              {/* Bar */}
              <div
                className="h-full rounded transition-all duration-500"
                style={{
                  width: `${pct}%`,
                  background: significant ? (r > 0 ? "#00c853" : "#ff1744") : "#444",
                  opacity: significant ? 1 : 0.5,
                }}
              />
            </div>
            <span
              className="w-14 text-right font-orbitron text-xs"
              style={{ color: significant ? (r > 0 ? "#00c853" : "#ff1744") : "#555" }}
            >
              {r > 0 ? "+" : ""}{r.toFixed(3)}
            </span>
            {significant && (
              <span className="text-[10px] font-rajdhani text-yellow-400 tracking-wider">SIG</span>
            )}
          </div>
        );
      })}
      <div className="flex items-center gap-2 mt-2 text-xs font-rajdhani text-muted-foreground">
        <div className="w-3 h-2 rounded bg-yellow-400/50" />
        <span>95% significance threshold (±{criticalValue.toFixed(3)})</span>
      </div>
    </div>
  );
}

export default function ReportsPage() {
  const { symbol } = useSymbol();
  const [sampleSize, setSampleSize] = useState(1000);
  const [inputVal, setInputVal] = useState("1000");

  const { data, isLoading, refetch, dataUpdatedAt } = useQuery<AdvancedData>({
    queryKey: ["/api/advanced-analysis", symbol, sampleSize],
    queryFn: async () => {
      const res = await fetch(`/api/advanced-analysis?symbol=${symbol}&count=${sampleSize}`);
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
    enabled: !!symbol,
    refetchInterval: 10000,
    staleTime: 8000,
  });

  function applySize() {
    const v = parseInt(inputVal);
    if (!isNaN(v) && v >= 100 && v <= 5000) setSampleSize(v);
  }

  const regime = data?.hurst?.regime ?? "random";
  const regimeColors: Record<string, string> = {
    trending: "#00c853",
    random: "#ffd600",
    mean_reverting: "#448aff",
  };

  return (
    <div className="space-y-5 animate-fade-in-up" data-testid="page-reports">
      {/* Title */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex-1 min-w-0">
          <h2 className="font-orbitron text-lg font-bold text-primary tracking-wider">
            ML ANALYSIS REPORTS
          </h2>
          <p className="font-rajdhani text-xs text-muted-foreground tracking-widest uppercase mt-0.5">
            Markov Chain · Autocorrelation · Hurst Exponent · Run-Length · Conditional Probability
          </p>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <input
            type="number"
            min={100}
            max={5000}
            value={inputVal}
            onChange={(e) => setInputVal(e.target.value)}
            onBlur={applySize}
            onKeyDown={(e) => e.key === "Enter" && applySize()}
            className="w-24 px-3 py-1.5 rounded-md bg-background border border-border font-orbitron text-sm text-foreground focus:outline-none focus:border-primary"
          />
          <span className="font-rajdhani text-xs text-muted-foreground">ticks</span>
          <button
            onClick={() => refetch()}
            className="p-2 rounded-md bg-primary/10 border border-primary/30 text-primary hover:bg-primary/20 transition-colors"
            title="Refresh analysis"
          >
            <RefreshCw size={14} className={isLoading ? "animate-spin" : ""} />
          </button>
        </div>
      </div>

      {isLoading && !data && (
        <div className="cyber-card p-12 flex flex-col items-center gap-4">
          <Brain size={40} className="text-primary animate-pulse" />
          <div className="font-orbitron text-sm text-primary tracking-widest">COMPUTING ML MODELS…</div>
          <div className="font-rajdhani text-xs text-muted-foreground">Running Markov chain, Hurst exponent, autocorrelation…</div>
        </div>
      )}

      {data && (
        <>
          {/* Summary strip */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div className="cyber-card p-3 flex flex-col gap-1">
              <div className="font-rajdhani text-xs text-muted-foreground tracking-widest uppercase">Market Regime</div>
              <div className="font-orbitron font-bold text-sm" style={{ color: regimeColors[regime] }}>
                {regime.replace("_", " ").toUpperCase()}
              </div>
              <div className="font-rajdhani text-xs text-muted-foreground">Hurst = {data.hurst.hurst}</div>
            </div>
            <div className="cyber-card p-3 flex flex-col gap-1">
              <div className="font-rajdhani text-xs text-muted-foreground tracking-widest uppercase">Markov Next</div>
              <div className="font-orbitron font-bold text-2xl" style={{ color: DIGIT_COLORS[data.markov.predicted_next] }}>
                {data.markov.predicted_next}
              </div>
              <div className="font-rajdhani text-xs text-muted-foreground">{data.markov.predicted_probability}% confidence</div>
            </div>
            <div className="cyber-card p-3 flex flex-col gap-1">
              <div className="font-rajdhani text-xs text-muted-foreground tracking-widest uppercase">Pattern Detected</div>
              <div className={`font-orbitron font-bold text-sm ${data.autocorrelation.has_pattern ? "text-yellow-400" : "text-green-400"}`}>
                {data.autocorrelation.has_pattern ? "YES" : "NONE"}
              </div>
              <div className="font-rajdhani text-xs text-muted-foreground">Ljung-Box Q={data.autocorrelation.ljung_box_q.toFixed(1)}</div>
            </div>
            <div className="cyber-card p-3 flex flex-col gap-1">
              <div className="font-rajdhani text-xs text-muted-foreground tracking-widest uppercase">Current Streak</div>
              <div className="font-orbitron font-bold text-sm text-primary">{data.run_length.current_streak}x</div>
              <div className="font-rajdhani text-xs text-muted-foreground truncate">{data.run_length.streak_signal}</div>
            </div>
          </div>

          {/* Ensemble signals */}
          {data.ensemble_signals.length > 0 && (
            <div className="cyber-card p-4">
              <div className="flex items-center gap-2 mb-3">
                <Zap size={14} className="text-primary" />
                <span className="font-rajdhani font-semibold text-xs text-muted-foreground tracking-widest uppercase">
                  Ensemble ML Signals ({data.ensemble_signals.length})
                </span>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {data.ensemble_signals.map((sig, i) => (
                  <div
                    key={i}
                    className="p-3 rounded-lg"
                    style={{ background: "rgba(0,229,255,0.05)", border: "1px solid rgba(0,229,255,0.15)" }}
                  >
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="font-rajdhani font-bold text-xs text-muted-foreground tracking-widest">{sig.type}</span>
                      <span className="font-orbitron font-bold text-sm text-primary">{sig.direction}</span>
                    </div>
                    <div className="h-1.5 bg-muted rounded-full overflow-hidden mb-1.5">
                      <div
                        className="h-full rounded-full transition-all"
                        style={{
                          width: `${sig.confidence}%`,
                          background: sig.confidence > 65 ? "#00c853" : sig.confidence > 45 ? "#ffd600" : "#ff9100",
                        }}
                      />
                    </div>
                    <div className="flex justify-between">
                      <span className="font-rajdhani text-xs text-muted-foreground truncate pr-2">{sig.reasoning}</span>
                      <span className="font-orbitron text-xs text-primary flex-shrink-0">{sig.confidence.toFixed(0)}%</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Markov Chain Matrix */}
          <div className="cyber-card p-4">
            <div className="flex items-center gap-2 mb-3">
              <Brain size={14} className="text-primary" />
              <span className="font-rajdhani font-semibold text-xs text-muted-foreground tracking-widest uppercase">
                Markov Transition Matrix (%) — Current Digit: {data.markov.current_digit}
              </span>
            </div>
            <p className="font-rajdhani text-xs text-muted-foreground mb-3">
              Each cell shows P(column | row). Row = current digit, Column = next digit. Brighter = more likely.
            </p>
            <MarkovMatrix matrix={data.markov.transition_matrix} currentDigit={data.markov.current_digit} />

            {/* Steady state */}
            <div className="mt-4">
              <div className="font-rajdhani text-xs text-muted-foreground tracking-widest uppercase mb-2">
                Steady-State Distribution (long-run probabilities)
              </div>
              <div className="flex gap-1 flex-wrap">
                {data.markov.steady_state.map((v, d) => (
                  <div
                    key={d}
                    className="flex flex-col items-center gap-0.5 px-2 py-1.5 rounded"
                    style={{ background: `${DIGIT_COLORS[d]}14`, border: `1px solid ${DIGIT_COLORS[d]}30` }}
                  >
                    <span className="font-orbitron font-bold text-sm" style={{ color: DIGIT_COLORS[d] }}>{d}</span>
                    <span className="font-orbitron text-[10px] text-muted-foreground">{v}%</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Autocorrelation */}
          <div className="cyber-card p-4">
            <div className="flex items-center gap-2 mb-1">
              <Activity size={14} className="text-primary" />
              <span className="font-rajdhani font-semibold text-xs text-muted-foreground tracking-widest uppercase">
                Autocorrelation Function (ACF)
              </span>
              {data.autocorrelation.has_pattern && (
                <span className="ml-auto badge-match rounded px-2 text-[10px] font-bold font-rajdhani">
                  PATTERN DETECTED
                </span>
              )}
            </div>
            <p className="font-rajdhani text-xs text-muted-foreground mb-3">
              Lag-k correlation r(k). Yellow line = 95% significance threshold. Green = positive correlation, Red = negative.
            </p>
            <AutocorrChart
              correlations={data.autocorrelation.correlations}
              criticalValue={data.autocorrelation.critical_value}
            />
          </div>

          {/* Hurst Exponent */}
          <div className="cyber-card p-4">
            <div className="flex items-center gap-2 mb-3">
              <TrendingUp size={14} className="text-primary" />
              <span className="font-rajdhani font-semibold text-xs text-muted-foreground tracking-widest uppercase">
                Hurst Exponent · R/S Analysis
              </span>
            </div>

            <div className="flex flex-wrap gap-6 items-start">
              {/* H gauge */}
              <div className="flex flex-col items-center gap-2">
                <div className="relative w-32 h-16">
                  <svg viewBox="0 0 100 50" className="w-full">
                    {/* Background arc */}
                    <path d="M 5 48 A 45 45 0 0 1 95 48" stroke="#1a2a40" strokeWidth="8" fill="none" strokeLinecap="round" />
                    {/* Color segments */}
                    <path d="M 5 48 A 45 45 0 0 1 50 3" stroke="#448aff" strokeWidth="8" fill="none" strokeLinecap="round" opacity="0.4" />
                    <path d="M 50 3 A 45 45 0 0 1 95 48" stroke="#00c853" strokeWidth="8" fill="none" strokeLinecap="round" opacity="0.4" />
                    {/* Needle */}
                    {(() => {
                      const H = data.hurst.hurst;
                      const angle = (H * 180) - 180;
                      const rad = (angle * Math.PI) / 180;
                      const x = 50 + 38 * Math.cos(rad);
                      const y = 48 + 38 * Math.sin(rad);
                      return <line x1="50" y1="48" x2={x} y2={y} stroke={regimeColors[regime]} strokeWidth="2.5" strokeLinecap="round" />;
                    })()}
                    <circle cx="50" cy="48" r="3" fill={regimeColors[regime]} />
                    <text x="5" y="58" fill="#555" fontSize="7" fontFamily="monospace">0</text>
                    <text x="46" y="10" fill="#555" fontSize="7" fontFamily="monospace">.5</text>
                    <text x="90" y="58" fill="#555" fontSize="7" fontFamily="monospace">1</text>
                  </svg>
                </div>
                <div className="font-orbitron text-2xl font-bold" style={{ color: regimeColors[regime] }}>
                  H = {data.hurst.hurst}
                </div>
                <div className="font-rajdhani font-bold text-sm tracking-wider" style={{ color: regimeColors[regime] }}>
                  {regime.replace("_", " ").toUpperCase()}
                </div>
              </div>

              <div className="flex-1 min-w-0 space-y-2">
                <p className="font-rajdhani text-sm text-muted-foreground">{data.hurst.interpretation}</p>
                <div className="grid grid-cols-3 gap-2 mt-2">
                  <div className="p-2 rounded" style={{ background: "rgba(68,138,255,0.1)", border: "1px solid rgba(68,138,255,0.2)" }}>
                    <div className="font-rajdhani text-xs text-muted-foreground">H &lt; 0.45</div>
                    <div className="font-orbitron text-xs text-blue-400">Mean Reverting</div>
                    <div className="font-rajdhani text-[10px] text-muted-foreground">Digits cycle back</div>
                  </div>
                  <div className="p-2 rounded" style={{ background: "rgba(255,214,0,0.1)", border: "1px solid rgba(255,214,0,0.2)" }}>
                    <div className="font-rajdhani text-xs text-muted-foreground">0.45–0.55</div>
                    <div className="font-orbitron text-xs text-yellow-400">Random Walk</div>
                    <div className="font-rajdhani text-[10px] text-muted-foreground">No pattern</div>
                  </div>
                  <div className="p-2 rounded" style={{ background: "rgba(0,200,83,0.1)", border: "1px solid rgba(0,200,83,0.2)" }}>
                    <div className="font-rajdhani text-xs text-muted-foreground">H &gt; 0.55</div>
                    <div className="font-orbitron text-xs text-green-400">Trending</div>
                    <div className="font-rajdhani text-[10px] text-muted-foreground">Runs persist</div>
                  </div>
                </div>
                {/* R/S values */}
                <div className="mt-2">
                  <div className="font-rajdhani text-xs text-muted-foreground mb-1">R/S values at different window sizes:</div>
                  <div className="flex flex-wrap gap-2">
                    {data.hurst.r_s_values.map(({ n, rs }) => (
                      <span
                        key={n}
                        className="font-orbitron text-[11px] px-2 py-0.5 rounded"
                        style={{ background: "rgba(0,229,255,0.08)", border: "1px solid rgba(0,229,255,0.15)", color: "#aaa" }}
                      >
                        n={n}: {rs}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Run-Length Analysis */}
          <div className="cyber-card p-4">
            <div className="flex items-center gap-2 mb-3">
              <BarChart3 size={14} className="text-primary" />
              <span className="font-rajdhani font-semibold text-xs text-muted-foreground tracking-widest uppercase">
                Run-Length Analysis
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
              <div className="p-3 rounded-lg" style={{ background: "rgba(0,229,255,0.06)", border: "1px solid rgba(0,229,255,0.15)" }}>
                <div className="font-rajdhani text-xs text-muted-foreground mb-1">Current Streak</div>
                <div className="font-orbitron text-2xl font-bold text-primary">{data.run_length.current_streak}×</div>
                <div className="font-rajdhani text-xs mt-1" style={{ color: DIGIT_COLORS[data.run_length.current_digit] }}>
                  Digit {data.run_length.current_digit} in a row
                </div>
                {data.run_length.current_streak >= 3 && (
                  <div className="mt-2 font-rajdhani text-xs text-yellow-400 font-bold">⚡ {data.run_length.streak_signal}</div>
                )}
              </div>
              <div className="p-3 rounded-lg" style={{ background: "rgba(198,255,0,0.06)", border: "1px solid rgba(198,255,0,0.15)" }}>
                <div className="font-rajdhani text-xs text-muted-foreground mb-1">Parity Streak</div>
                <div className="font-orbitron text-2xl font-bold" style={{ color: data.run_length.parity_type === "even" ? "#c6ff00" : "#ff9100" }}>
                  {data.run_length.parity_streak}×
                </div>
                <div className="font-rajdhani text-xs mt-1 text-muted-foreground">
                  {data.run_length.parity_type.toUpperCase()} digits consecutive
                </div>
              </div>
              <div className="p-3 rounded-lg" style={{ background: "rgba(0,200,83,0.06)", border: "1px solid rgba(0,200,83,0.15)" }}>
                <div className="font-rajdhani text-xs text-muted-foreground mb-1">Over/Under Streak</div>
                <div className="font-orbitron text-2xl font-bold" style={{ color: data.run_length.over_under_type === "over" ? "#00c853" : "#448aff" }}>
                  {data.run_length.over_under_streak}×
                </div>
                <div className="font-rajdhani text-xs mt-1 text-muted-foreground">
                  {data.run_length.over_under_type.toUpperCase()} ({data.run_length.over_under_type === "over" ? ">5" : "≤5"})
                </div>
              </div>
            </div>

            {/* Avg run lengths */}
            <div className="font-rajdhani text-xs text-muted-foreground tracking-widest uppercase mb-2">
              Average Run Length Per Digit
            </div>
            <div className="flex flex-wrap gap-2">
              {Array.from({ length: 10 }, (_, d) => ({ d, avg: data.run_length.avg_run_lengths[d] ?? 0 })).map(({ d, avg }) => (
                <div
                  key={d}
                  className="flex flex-col items-center px-3 py-2 rounded-lg"
                  style={{ background: `${DIGIT_COLORS[d]}12`, border: `1px solid ${DIGIT_COLORS[d]}30` }}
                >
                  <span className="font-orbitron font-bold text-lg" style={{ color: DIGIT_COLORS[d] }}>{d}</span>
                  <span className="font-orbitron text-xs text-muted-foreground">{avg.toFixed(1)}x</span>
                </div>
              ))}
            </div>
          </div>

          {/* Conditional Probability */}
          {data.conditional_probability.predictable_pairs.length > 0 && (
            <div className="cyber-card p-4">
              <div className="flex items-center gap-2 mb-3">
                <Brain size={14} className="text-primary" />
                <span className="font-rajdhani font-semibold text-xs text-muted-foreground tracking-widest uppercase">
                  2nd-Order Conditional Probability (Most Predictable Pairs)
                </span>
              </div>
              {data.conditional_probability.current_prediction && (
                <div
                  className="p-3 rounded-lg mb-3"
                  style={{ background: "rgba(0,229,255,0.08)", border: "1px solid rgba(0,229,255,0.25)" }}
                >
                  <div className="font-rajdhani text-xs text-muted-foreground mb-1">CURRENT PREDICTION (last two digits: {data.conditional_probability.current_prediction.key})</div>
                  <div className="flex items-baseline gap-2">
                    <span className="font-rajdhani text-sm text-muted-foreground">Most likely next:</span>
                    <span className="font-orbitron text-2xl font-bold" style={{ color: DIGIT_COLORS[data.conditional_probability.current_prediction.best] }}>
                      {data.conditional_probability.current_prediction.best}
                    </span>
                    <span className="font-orbitron text-sm text-primary">{data.conditional_probability.current_prediction.bestProb}%</span>
                  </div>
                </div>
              )}
              <div className="overflow-x-auto">
                <table className="w-full text-xs min-w-[360px]">
                  <thead>
                    <tr className="border-b border-border">
                      <th className="text-left pb-2 font-rajdhani text-muted-foreground tracking-wider">After Digits</th>
                      <th className="text-left pb-2 font-rajdhani text-muted-foreground tracking-wider">Predict Next</th>
                      <th className="text-left pb-2 font-rajdhani text-muted-foreground tracking-wider">Confidence</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.conditional_probability.predictable_pairs.map(({ after, predict, confidence }) => (
                      <tr key={after} className="border-b border-border/30 hover:bg-muted/10">
                        <td className="py-1.5 font-orbitron">
                          {after.split(",").map((d, i) => (
                            <span key={i} className="font-bold mr-1" style={{ color: DIGIT_COLORS[parseInt(d)] }}>
                              {d}
                            </span>
                          ))}
                        </td>
                        <td className="py-1.5">
                          <span className="font-orbitron font-bold text-base" style={{ color: DIGIT_COLORS[predict] }}>{predict}</span>
                        </td>
                        <td className="py-1.5">
                          <div className="flex items-center gap-2">
                            <div className="w-24 h-1.5 bg-muted rounded-full overflow-hidden">
                              <div
                                className="h-full rounded-full"
                                style={{
                                  width: `${confidence}%`,
                                  background: confidence > 25 ? "#00c853" : "#ffd600",
                                }}
                              />
                            </div>
                            <span className="font-orbitron text-xs text-primary">{confidence}%</span>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Footer */}
          <div className="cyber-card p-3 flex flex-wrap items-center justify-between gap-2">
            <div className="font-rajdhani text-xs text-muted-foreground">
              Sample: <span className="text-primary font-bold">{data.sample_size.toLocaleString()}</span> ticks ·
              Symbol: <span className="text-primary font-bold">{data.symbol}</span> ·
              Updated: <span className="text-primary font-bold">{new Date(data.last_updated).toLocaleTimeString()}</span>
            </div>
            <button
              onClick={() => {
                const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
                const a = document.createElement("a");
                a.href = URL.createObjectURL(blob);
                a.download = `digit-killer-report-${data.symbol}-${Date.now()}.json`;
                a.click();
              }}
              className="flex items-center gap-2 px-3 py-1.5 rounded-md bg-primary/10 border border-primary/30 text-primary text-xs font-rajdhani font-semibold hover:bg-primary/20 transition-colors"
            >
              <Download size={12} />
              Export JSON Report
            </button>
          </div>
        </>
      )}
    </div>
  );
}

// Inline Zap icon since it's used inside
function Zap({ size, className }: { size: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
    </svg>
  );
}
