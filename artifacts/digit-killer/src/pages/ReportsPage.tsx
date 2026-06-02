import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useSymbol } from "@/context/SymbolContext";
import { Activity, Brain, BarChart3, TrendingUp, Download, RefreshCw, FileText, Target } from "lucide-react";

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

interface Strategy {
  name: string;
  signal: string;
  digit?: number;
  ticks: number;
  confidence: number;
  reasoning: string;
}

function generateStrategies(data: AdvancedData): Strategy[] {
  const strats: Strategy[] = [];
  const EVEN = [0, 2, 4, 6, 8];

  // 1. Markov: predict next digit
  const { predicted_next, predicted_probability, current_digit } = data.markov;
  if (predicted_probability > 14) {
    strats.push({
      name: "Markov Digit Match",
      signal: "MATCH",
      digit: predicted_next,
      ticks: 1,
      confidence: Math.min(93, predicted_probability * 4),
      reasoning: `From digit ${current_digit}, Markov predicts ${predicted_next} with ${predicted_probability}% probability.`,
    });
  }

  // 2. Parity streak → mean reversion
  const { parity_streak, parity_type } = data.run_length;
  if (parity_streak >= 3) {
    const flip = parity_type === "even" ? "ODD" : "EVEN";
    strats.push({
      name: "Parity Mean Reversion",
      signal: flip,
      ticks: 3,
      confidence: Math.min(88, 48 + parity_streak * 8),
      reasoning: `${parity_streak} consecutive ${parity_type} digits — statistical reversion favours ${flip}.`,
    });
  }

  // 3. Even/Odd bias from steady state
  const evenSS = data.markov.steady_state
    .filter((_, i) => EVEN.includes(i))
    .reduce((a, b) => a + b, 0);
  if (evenSS > 53) {
    strats.push({
      name: "Steady-State Even Bias",
      signal: "EVEN",
      ticks: 5,
      confidence: Math.min(80, 50 + (evenSS - 50) * 2),
      reasoning: `Long-run Markov steady state: Even digits average ${evenSS.toFixed(1)}%, above 50%.`,
    });
  } else if (evenSS < 47) {
    strats.push({
      name: "Steady-State Odd Bias",
      signal: "ODD",
      ticks: 5,
      confidence: Math.min(80, 50 + (50 - evenSS) * 2),
      reasoning: `Long-run Markov steady state: Odd digits average ${(100 - evenSS).toFixed(1)}%, above 50%.`,
    });
  }

  // 4. Hurst trend continuation
  if (data.hurst.regime === "trending" && data.run_length.current_streak >= 2) {
    strats.push({
      name: "Trend Continuation Match",
      signal: "MATCH",
      digit: data.run_length.current_digit,
      ticks: 2,
      confidence: 62,
      reasoning: `H=${data.hurst.hurst} (trending). Digit ${data.run_length.current_digit} streak of ${data.run_length.current_streak} may persist.`,
    });
  }

  // 5. Mean-reverting regime → Differ
  if (data.hurst.regime === "mean_reverting") {
    strats.push({
      name: "Mean-Reversion Differ",
      signal: "DIFFER",
      digit: data.markov.current_digit,
      ticks: 1,
      confidence: 60,
      reasoning: `H=${data.hurst.hurst} (mean-reverting). Digit ${data.markov.current_digit} is unlikely to repeat.`,
    });
  }

  // 6. Conditional probability
  const cp = data.conditional_probability.current_prediction;
  if (cp && cp.bestProb > 20) {
    strats.push({
      name: "Sequence Pattern Match",
      signal: "MATCH",
      digit: cp.best,
      ticks: 1,
      confidence: Math.min(90, cp.bestProb * 2.5),
      reasoning: `After sequence ${cp.key}: digit ${cp.best} follows ${cp.bestProb}% of time.`,
    });
  }

  // 7. Over/Under streak
  const { over_under_streak, over_under_type } = data.run_length;
  if (over_under_streak >= 4) {
    const flip = over_under_type === "over" ? "UNDER 5" : "OVER 5";
    strats.push({
      name: "Over/Under Mean Reversion",
      signal: flip,
      ticks: 3,
      confidence: Math.min(85, 50 + over_under_streak * 7),
      reasoning: `${over_under_streak} consecutive ${over_under_type} digits — reversion to ${flip} likely.`,
    });
  }

  return strats.sort((a, b) => b.confidence - a.confidence).slice(0, 6);
}

function exportPDF(data: AdvancedData, strategies: Strategy[]) {
  const ts = new Date().toLocaleString();
  const topSig = strategies[0];
  const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8"/>
  <title>Digit Killer ML Report — ${data.symbol}</title>
  <style>
    body { font-family: Arial, sans-serif; font-size: 12px; color: #111; padding: 24px; }
    h1 { font-size: 20px; color: #005fd4; margin: 0 0 4px; }
    h2 { font-size: 14px; color: #005fd4; border-bottom: 2px solid #005fd4; padding-bottom: 4px; margin: 18px 0 8px; }
    h3 { font-size: 12px; color: #333; margin: 10px 0 4px; }
    .meta { color: #666; font-size: 11px; margin-bottom: 16px; }
    .grid2 { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
    .card { border: 1px solid #ddd; border-radius: 6px; padding: 10px; }
    .signal { font-size: 18px; font-weight: bold; color: #005fd4; }
    .conf { color: #00a854; font-weight: bold; }
    table { width: 100%; border-collapse: collapse; font-size: 11px; }
    th, td { border: 1px solid #ddd; padding: 4px 6px; text-align: center; }
    th { background: #f0f4ff; }
    .strat { border: 1px solid #ddd; border-radius: 6px; padding: 8px; margin-bottom: 8px; }
    .strat-name { font-weight: bold; color: #005fd4; }
    @media print { body { padding: 0; } }
  </style>
</head>
<body>
  <h1>DIGIT KILLER — ML Analysis Report</h1>
  <div class="meta">Symbol: <b>${data.symbol}</b> &nbsp;|&nbsp; Sample: <b>${data.sample_size.toLocaleString()} ticks</b> &nbsp;|&nbsp; Generated: ${ts}</div>

  <h2>Top Trade Signal</h2>
  ${topSig ? `
  <div class="card">
    <div class="signal">${topSig.signal}${topSig.digit !== undefined ? ` (digit ${topSig.digit})` : ""}</div>
    <div>Contract duration: <b>${topSig.ticks} tick${topSig.ticks > 1 ? "s" : ""}</b></div>
    <div>Confidence: <span class="conf">${topSig.confidence.toFixed(0)}%</span></div>
    <div style="margin-top:6px;color:#444">${topSig.reasoning}</div>
  </div>` : "<p>No signal generated.</p>"}

  <h2>Generated Strategies (${strategies.length})</h2>
  ${strategies.map((s) => `
  <div class="strat">
    <div class="strat-name">${s.name} — ${s.signal}${s.digit !== undefined ? ` digit ${s.digit}` : ""} · ${s.ticks}T · ${s.confidence.toFixed(0)}%</div>
    <div style="color:#555;margin-top:3px">${s.reasoning}</div>
  </div>`).join("")}

  <h2>Market Regime</h2>
  <div class="grid2">
    <div class="card"><b>Hurst H = ${data.hurst.hurst}</b><br/>${data.hurst.interpretation}</div>
    <div class="card">Regime: <b>${data.hurst.regime.replace("_"," ").toUpperCase()}</b><br/>
    Markov Next: <b>${data.markov.predicted_next}</b> (${data.markov.predicted_probability}% conf)</div>
  </div>

  <h2>Run-Length Analysis</h2>
  <div class="grid2">
    <div class="card">Current streak: <b>${data.run_length.current_streak}×</b> digit ${data.run_length.current_digit}<br/>${data.run_length.streak_signal}</div>
    <div class="card">Parity streak: <b>${data.run_length.parity_streak}×</b> ${data.run_length.parity_type.toUpperCase()}<br/>O/U streak: <b>${data.run_length.over_under_streak}×</b> ${data.run_length.over_under_type.toUpperCase()}</div>
  </div>

  <h2>Markov Steady State (%)</h2>
  <table>
    <tr>${data.markov.steady_state.map((_, i) => `<th>${i}</th>`).join("")}</tr>
    <tr>${data.markov.steady_state.map((v) => `<td>${v}</td>`).join("")}</tr>
  </table>

  <h2>Ensemble ML Signals</h2>
  ${data.ensemble_signals.length === 0 ? "<p>None</p>" : data.ensemble_signals.map((s) => `
  <div class="strat"><div class="strat-name">${s.type} — ${s.direction} · ${s.confidence.toFixed(0)}%</div>
  <div style="color:#555">${s.reasoning}</div></div>`).join("")}
</body>
</html>`;
  const blob = new Blob([html], { type: "text/html" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `digit-killer-ml-report-${data.symbol}-${Date.now()}.html`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

function exportWord(data: AdvancedData, strategies: Strategy[]) {
  const ts = new Date().toLocaleString();
  const wordHtml = `<html xmlns:o='urn:schemas-microsoft-com:office:office' xmlns:w='urn:schemas-microsoft-com:office:word' xmlns='http://www.w3.org/TR/REC-html40'>
<head><meta charset="utf-8"/><title>Digit Killer ML Report</title></head>
<body style="font-family:Calibri,Arial;font-size:12pt;color:#111;padding:24pt;">
  <h1 style="color:#005fd4;">DIGIT KILLER — ML Analysis Report</h1>
  <p style="color:#666;">Symbol: <b>${data.symbol}</b> | Sample: <b>${data.sample_size.toLocaleString()} ticks</b> | Generated: ${ts}</p>
  <h2 style="color:#005fd4;border-bottom:2pt solid #005fd4;">Top Trade Signal</h2>
  ${strategies[0] ? `<p><b style="font-size:16pt;color:#005fd4;">${strategies[0].signal}${strategies[0].digit !== undefined ? ` — digit ${strategies[0].digit}` : ""}</b></p>
  <p>Contract duration: <b>${strategies[0].ticks} tick(s)</b> &nbsp;|&nbsp; Confidence: <b>${strategies[0].confidence.toFixed(0)}%</b></p>
  <p>${strategies[0].reasoning}</p>` : "<p>No signal.</p>"}
  <h2 style="color:#005fd4;border-bottom:2pt solid #005fd4;">Generated Strategies</h2>
  ${strategies.map((s) => `<p><b>${s.name}</b> — ${s.signal}${s.digit !== undefined ? ` digit ${s.digit}` : ""} | ${s.ticks}T | ${s.confidence.toFixed(0)}%<br/><span style="color:#555">${s.reasoning}</span></p>`).join("")}
  <h2 style="color:#005fd4;border-bottom:2pt solid #005fd4;">Market Regime</h2>
  <p>Hurst H = <b>${data.hurst.hurst}</b> — ${data.hurst.regime.replace("_"," ").toUpperCase()}<br/>${data.hurst.interpretation}</p>
  <h2 style="color:#005fd4;border-bottom:2pt solid #005fd4;">Ensemble ML Signals</h2>
  ${data.ensemble_signals.map((s) => `<p><b>${s.type} — ${s.direction}</b> (${s.confidence.toFixed(0)}%)<br/>${s.reasoning}</p>`).join("")}
</body></html>`;
  const blob = new Blob(["\ufeff", wordHtml], { type: "application/msword" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `digit-killer-report-${data.symbol}-${Date.now()}.doc`;
  a.click();
}

export default function ReportsPage() {
  const { symbol } = useSymbol();
  const [sampleSize, setSampleSize] = useState(1000);
  const [inputVal, setInputVal] = useState("1000");

  const { data, isLoading, refetch } = useQuery<AdvancedData>({
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

  const strategies = useMemo(() => (data ? generateStrategies(data) : []), [data]);

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
        <div className="flex flex-wrap items-center gap-2 flex-shrink-0">
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
            title="Refresh"
          >
            <RefreshCw size={14} className={isLoading ? "animate-spin" : ""} />
          </button>
          {data && (
            <>
              <button
                onClick={() => exportPDF(data, strategies)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-rajdhani font-semibold transition-colors"
                style={{ background: "rgba(233,30,140,0.12)", border: "1px solid rgba(233,30,140,0.3)", color: "#e91e8c" }}
                title="Export as PDF (opens print dialog)"
              >
                <FileText size={12} /> PDF
              </button>
              <button
                onClick={() => exportWord(data, strategies)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-rajdhani font-semibold transition-colors"
                style={{ background: "rgba(68,138,255,0.12)", border: "1px solid rgba(68,138,255,0.3)", color: "#448aff" }}
                title="Download Word (.doc)"
              >
                <Download size={12} /> Word
              </button>
            </>
          )}
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

          {/* ─── Trade Signals & Generated Strategies ─── */}
          {strategies.length > 0 && (
            <div className="cyber-card p-4">
              <div className="flex items-center gap-2 mb-4">
                <Target size={14} className="text-primary" />
                <span className="font-rajdhani font-semibold text-xs text-muted-foreground tracking-widest uppercase">
                  Generated Trading Strategies ({strategies.length})
                </span>
                <span className="ml-auto text-[10px] font-rajdhani text-muted-foreground">Based on ML analysis · not financial advice</span>
              </div>

              {/* Top signal hero */}
              {strategies[0] && (
                <div
                  className="p-4 rounded-xl mb-4 flex flex-wrap items-center gap-4"
                  style={{ background: "linear-gradient(135deg, rgba(0,229,255,0.08), rgba(0,200,83,0.06))", border: "1px solid rgba(0,229,255,0.25)" }}
                >
                  <div>
                    <div className="font-rajdhani text-[10px] text-muted-foreground tracking-widest uppercase mb-1">Top Signal</div>
                    <div className="font-orbitron text-2xl font-black text-primary">
                      {strategies[0].signal}
                      {strategies[0].digit !== undefined && (
                        <span className="ml-2 text-xl" style={{ color: DIGIT_COLORS[strategies[0].digit] }}>
                          digit {strategies[0].digit}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex gap-6">
                    <div>
                      <div className="font-rajdhani text-[10px] text-muted-foreground">Contract</div>
                      <div className="font-orbitron font-bold text-lg text-foreground">{strategies[0].ticks} tick{strategies[0].ticks > 1 ? "s" : ""}</div>
                    </div>
                    <div>
                      <div className="font-rajdhani text-[10px] text-muted-foreground">Confidence</div>
                      <div className="font-orbitron font-bold text-lg" style={{ color: strategies[0].confidence > 70 ? "#00c853" : strategies[0].confidence > 55 ? "#ffd600" : "#ff9100" }}>
                        {strategies[0].confidence.toFixed(0)}%
                      </div>
                    </div>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-rajdhani text-xs text-muted-foreground">{strategies[0].reasoning}</div>
                  </div>
                </div>
              )}

              {/* All strategies grid */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {strategies.map((s, i) => {
                  const confColor = s.confidence > 70 ? "#00c853" : s.confidence > 55 ? "#ffd600" : "#ff9100";
                  return (
                    <div
                      key={i}
                      className="p-3 rounded-lg flex flex-col gap-2"
                      style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)" }}
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-rajdhani font-bold text-xs text-muted-foreground tracking-widest">{s.name}</span>
                        <span className="font-orbitron text-xs font-bold" style={{ color: confColor }}>{s.confidence.toFixed(0)}%</span>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="font-orbitron font-black text-base text-primary">{s.signal}</span>
                        {s.digit !== undefined && (
                          <span className="font-orbitron font-bold text-base" style={{ color: DIGIT_COLORS[s.digit] }}>digit {s.digit}</span>
                        )}
                        <span className="ml-auto font-rajdhani text-xs text-muted-foreground">{s.ticks}T contract</span>
                      </div>
                      <div className="h-1 bg-muted rounded-full overflow-hidden">
                        <div className="h-full rounded-full transition-all" style={{ width: `${s.confidence}%`, background: confColor }} />
                      </div>
                      <div className="font-rajdhani text-[11px] text-muted-foreground">{s.reasoning}</div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

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
            <div className="flex items-center gap-2">
              <button
                onClick={() => exportPDF(data, strategies)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-rajdhani font-semibold transition-colors"
                style={{ background: "rgba(233,30,140,0.12)", border: "1px solid rgba(233,30,140,0.3)", color: "#e91e8c" }}
                title="Export as PDF (opens print dialog)"
              >
                <FileText size={12} /> Export PDF
              </button>
              <button
                onClick={() => exportWord(data, strategies)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-rajdhani font-semibold transition-colors"
                style={{ background: "rgba(68,138,255,0.12)", border: "1px solid rgba(68,138,255,0.3)", color: "#448aff" }}
                title="Download Word (.doc)"
              >
                <Download size={12} /> Export Word
              </button>
            </div>
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
