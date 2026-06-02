/**
 * Advanced ML Analysis Engine
 * Markov Chain, Autocorrelation, Hurst Exponent, Run-Length, Conditional Entropy
 */

import { extractLastDigit } from "./deriv";

// ─── Markov Chain ────────────────────────────────────────────────────────────

export function computeMarkovChain(prices: number[], pipSize: number) {
  const digits = prices.map((p) => extractLastDigit(p, pipSize));

  // Transition count matrix [from][to]
  const counts: number[][] = Array.from({ length: 10 }, () => new Array(10).fill(0));
  for (let i = 0; i < digits.length - 1; i++) {
    counts[digits[i]][digits[i + 1]]++;
  }

  // Normalize to probabilities
  const matrix: number[][] = counts.map((row) => {
    const total = row.reduce((a, b) => a + b, 0) || 1;
    return row.map((v) => parseFloat(((v / total) * 100).toFixed(2)));
  });

  // Most likely next digit for each current digit
  const nextPredictions = matrix.map((row, from) => {
    const maxProb = Math.max(...row);
    const nextDigit = row.indexOf(maxProb);
    return { from, next: nextDigit, probability: maxProb };
  });

  // Current next digit prediction
  const currentDigit = digits[digits.length - 1] ?? 0;
  const currentRow = matrix[currentDigit];
  const predictedNext = currentRow.indexOf(Math.max(...currentRow));
  const predictedProb = Math.max(...currentRow);

  // Steady-state distribution (power iteration)
  let state = new Array(10).fill(0.1);
  for (let iter = 0; iter < 1000; iter++) {
    const next = new Array(10).fill(0);
    for (let i = 0; i < 10; i++) {
      for (let j = 0; j < 10; j++) {
        next[j] += state[i] * (matrix[i][j] / 100);
      }
    }
    state = next;
  }
  const steadyState = state.map((v) => parseFloat((v * 100).toFixed(2)));

  return {
    transition_matrix: matrix,
    next_predictions: nextPredictions,
    current_digit: currentDigit,
    predicted_next: predictedNext,
    predicted_probability: predictedProb,
    steady_state: steadyState,
    sample_size: digits.length,
  };
}

// ─── Autocorrelation ─────────────────────────────────────────────────────────

export function computeAutocorrelation(prices: number[], pipSize: number, maxLag = 20) {
  const digits = prices.map((p) => extractLastDigit(p, pipSize));
  const n = digits.length;
  const mean = digits.reduce((a, b) => a + b, 0) / n;
  const variance = digits.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / n;

  const correlations: Array<{ lag: number; r: number; significant: boolean }> = [];
  const criticalValue = 1.96 / Math.sqrt(n); // 95% confidence

  for (let lag = 1; lag <= Math.min(maxLag, Math.floor(n / 4)); lag++) {
    let cov = 0;
    for (let i = lag; i < n; i++) {
      cov += (digits[i] - mean) * (digits[i - lag] - mean);
    }
    cov /= n;
    const r = variance > 0 ? parseFloat((cov / variance).toFixed(4)) : 0;
    correlations.push({ lag, r, significant: Math.abs(r) > criticalValue });
  }

  // Ljung-Box Q statistic for whiteness test
  let Q = 0;
  for (const { lag, r } of correlations.slice(0, 10)) {
    Q += (r * r) / (n - lag);
  }
  Q *= n * (n + 2);

  // Partial autocorrelation (Yule-Walker for lag 1-5)
  const pacf = correlations.slice(0, 5).map((c, i) => ({
    lag: i + 1,
    pacf: i === 0 ? c.r : parseFloat((c.r - correlations.slice(0, i).reduce((a, b) => a + b.r, 0) / i).toFixed(4)),
  }));

  return {
    correlations,
    critical_value: parseFloat(criticalValue.toFixed(4)),
    ljung_box_q: parseFloat(Q.toFixed(4)),
    has_pattern: correlations.some((c) => c.significant),
    pacf,
    mean_digit: parseFloat(mean.toFixed(2)),
    sample_size: n,
  };
}

// ─── Hurst Exponent ──────────────────────────────────────────────────────────

export function computeHurstExponent(prices: number[], pipSize: number): {
  hurst: number;
  interpretation: string;
  regime: "trending" | "random" | "mean_reverting";
  r_s_values: Array<{ n: number; rs: number }>;
} {
  const digits = prices.map((p) => extractLastDigit(p, pipSize));
  const n = digits.length;

  const rsList: Array<{ n: number; rs: number }> = [];
  const sizes = [10, 20, 50, 100, 200, 500].filter((s) => s <= Math.floor(n / 2));

  for (const size of sizes) {
    const rsValues: number[] = [];
    const numChunks = Math.floor(n / size);
    for (let chunk = 0; chunk < numChunks; chunk++) {
      const seg = digits.slice(chunk * size, (chunk + 1) * size);
      const mean = seg.reduce((a, b) => a + b, 0) / seg.length;
      const deviations = seg.map((x) => x - mean);
      let cumSum = 0;
      const cumSums: number[] = [];
      for (const d of deviations) {
        cumSum += d;
        cumSums.push(cumSum);
      }
      const R = Math.max(...cumSums) - Math.min(...cumSums);
      const S = Math.sqrt(deviations.reduce((a, b) => a + b * b, 0) / seg.length) || 1;
      rsValues.push(R / S);
    }
    if (rsValues.length > 0) {
      rsList.push({
        n: size,
        rs: parseFloat((rsValues.reduce((a, b) => a + b, 0) / rsValues.length).toFixed(3)),
      });
    }
  }

  // Linear regression on log(n) vs log(R/S) to get Hurst
  let hurst = 0.5;
  if (rsList.length >= 2) {
    const logN = rsList.map((r) => Math.log(r.n));
    const logRS = rsList.map((r) => Math.log(r.rs));
    const nPts = logN.length;
    const meanX = logN.reduce((a, b) => a + b, 0) / nPts;
    const meanY = logRS.reduce((a, b) => a + b, 0) / nPts;
    let num = 0, den = 0;
    for (let i = 0; i < nPts; i++) {
      num += (logN[i] - meanX) * (logRS[i] - meanY);
      den += (logN[i] - meanX) ** 2;
    }
    hurst = den > 0 ? parseFloat((num / den).toFixed(3)) : 0.5;
    hurst = Math.max(0, Math.min(1, hurst));
  }

  const regime: "trending" | "random" | "mean_reverting" =
    hurst > 0.55 ? "trending" : hurst < 0.45 ? "mean_reverting" : "random";

  const interpretation =
    regime === "trending"
      ? `Hurst=${hurst} — Persistent trend. Digits tend to follow runs.`
      : regime === "mean_reverting"
      ? `Hurst=${hurst} — Mean-reverting. Digits tend to alternate/cycle.`
      : `Hurst=${hurst} — Random walk. No exploitable persistence.`;

  return { hurst, interpretation, regime, r_s_values: rsList };
}

// ─── Run-Length Analysis ─────────────────────────────────────────────────────

export function computeRunLengthAnalysis(prices: number[], pipSize: number) {
  const digits = prices.map((p) => extractLastDigit(p, pipSize));

  // Current streak
  let streak = 1;
  const lastDigit = digits[digits.length - 1] ?? 0;
  for (let i = digits.length - 2; i >= 0; i--) {
    if (digits[i] === lastDigit) streak++;
    else break;
  }

  // Even/odd streak
  const isEven = [0, 2, 4, 6, 8];
  const lastIsEven = isEven.includes(lastDigit);
  let parityStreak = 1;
  for (let i = digits.length - 2; i >= 0; i--) {
    if (isEven.includes(digits[i]) === lastIsEven) parityStreak++;
    else break;
  }

  // Over/under streak (threshold 5)
  const lastIsOver = lastDigit > 5;
  let overUnderStreak = 1;
  for (let i = digits.length - 2; i >= 0; i--) {
    const d = digits[i];
    const isOver = d > 5;
    if (isOver === lastIsOver) overUnderStreak++;
    else break;
  }

  // Compute average run lengths for each digit
  const runLengths: Record<number, number[]> = {};
  for (let d = 0; d < 10; d++) runLengths[d] = [];
  let currentRun = { digit: digits[0], length: 1 };
  for (let i = 1; i < digits.length; i++) {
    if (digits[i] === currentRun.digit) {
      currentRun.length++;
    } else {
      runLengths[currentRun.digit].push(currentRun.length);
      currentRun = { digit: digits[i], length: 1 };
    }
  }
  runLengths[currentRun.digit].push(currentRun.length);

  const avgRunLengths = Object.fromEntries(
    Object.entries(runLengths).map(([d, runs]) => [
      d,
      runs.length > 0 ? parseFloat((runs.reduce((a, b) => a + b, 0) / runs.length).toFixed(2)) : 0,
    ])
  );

  return {
    current_digit: lastDigit,
    current_streak: streak,
    parity_streak: parityStreak,
    parity_type: lastIsEven ? "even" : "odd",
    over_under_streak: overUnderStreak,
    over_under_type: lastIsOver ? "over" : "under",
    avg_run_lengths: avgRunLengths,
    streak_signal:
      streak >= 3
        ? `DIFFER ${lastDigit} — digit ${lastDigit} has appeared ${streak}x in a row`
        : streak === 2
        ? `WATCH — digit ${lastDigit} appeared twice consecutively`
        : "No streak",
  };
}

// ─── Conditional Probability ─────────────────────────────────────────────────

export function computeConditionalProbability(prices: number[], pipSize: number) {
  const digits = prices.map((p) => extractLastDigit(p, pipSize));
  const n = digits.length;

  // P(next=j | last two = i,k) — 2nd order Markov
  const counts2: Record<string, number[]> = {};
  for (let i = 0; i < n - 2; i++) {
    const key = `${digits[i]},${digits[i + 1]}`;
    if (!counts2[key]) counts2[key] = new Array(10).fill(0);
    counts2[key][digits[i + 2]]++;
  }

  const cond2: Record<string, { probs: number[]; best: number; bestProb: number }> = {};
  for (const [key, cnts] of Object.entries(counts2)) {
    const total = cnts.reduce((a, b) => a + b, 0) || 1;
    const probs = cnts.map((c) => parseFloat(((c / total) * 100).toFixed(1)));
    const best = probs.indexOf(Math.max(...probs));
    cond2[key] = { probs, best, bestProb: Math.max(...probs) };
  }

  // Current prediction using last 2 digits
  const last2 = digits.slice(-2);
  const currentKey = last2.length === 2 ? `${last2[0]},${last2[1]}` : null;
  const currentPrediction = currentKey && cond2[currentKey]
    ? { key: currentKey, ...cond2[currentKey] }
    : null;

  // Most predictable pairs
  const predictablePairs = Object.entries(cond2)
    .filter(([, v]) => v.bestProb > 20)
    .sort((a, b) => b[1].bestProb - a[1].bestProb)
    .slice(0, 10)
    .map(([key, v]) => ({ after: key, predict: v.best, confidence: v.bestProb }));

  return {
    current_prediction: currentPrediction,
    predictable_pairs: predictablePairs,
    second_order_sample: n,
  };
}

// ─── Full Advanced Analysis ───────────────────────────────────────────────────

export function computeAdvancedAnalysis(prices: number[], pipSize: number, symbol: string) {
  const markov = computeMarkovChain(prices, pipSize);
  const autocorr = computeAutocorrelation(prices, pipSize, 20);
  const hurst = computeHurstExponent(prices, pipSize);
  const runLength = computeRunLengthAnalysis(prices, pipSize);
  const conditional = computeConditionalProbability(prices, pipSize);

  // Combined signal confidence (ensemble)
  const signals: Array<{ type: string; direction: string; confidence: number; reasoning: string }> = [];

  // Markov signal
  if (markov.predicted_probability > 15) {
    signals.push({
      type: "MARKOV",
      direction: `MATCH ${markov.predicted_next}`,
      confidence: parseFloat(Math.min(85, markov.predicted_probability * 2).toFixed(1)),
      reasoning: `Markov chain: from digit ${markov.current_digit}, most likely next is ${markov.predicted_next} (${markov.predicted_probability}%)`,
    });
  }

  // Streak signal
  if (runLength.current_streak >= 3) {
    signals.push({
      type: "STREAK",
      direction: `DIFFER ${runLength.current_digit}`,
      confidence: Math.min(80, 50 + runLength.current_streak * 8),
      reasoning: runLength.streak_signal,
    });
  }

  // Hurst signal
  if (hurst.regime === "trending") {
    signals.push({
      type: "HURST",
      direction: `TREND FOLLOW`,
      confidence: parseFloat(Math.min(70, (hurst.hurst - 0.5) * 200 + 50).toFixed(1)),
      reasoning: hurst.interpretation,
    });
  } else if (hurst.regime === "mean_reverting") {
    signals.push({
      type: "HURST",
      direction: `MEAN REVERT`,
      confidence: parseFloat(Math.min(70, (0.5 - hurst.hurst) * 200 + 50).toFixed(1)),
      reasoning: hurst.interpretation,
    });
  }

  // Conditional probability signal
  if (conditional.current_prediction && conditional.current_prediction.bestProb > 18) {
    signals.push({
      type: "CONDITIONAL",
      direction: `MATCH ${conditional.current_prediction.best}`,
      confidence: parseFloat(Math.min(80, conditional.current_prediction.bestProb * 1.5).toFixed(1)),
      reasoning: `2nd-order Markov after digits ${conditional.current_prediction.key}: digit ${conditional.current_prediction.best} most likely (${conditional.current_prediction.bestProb}%)`,
    });
  }

  // Autocorrelation signal
  const sig1 = autocorr.correlations[0];
  if (sig1?.significant) {
    const direction = sig1.r > 0 ? `MATCH ${markov.current_digit}` : `DIFFER ${markov.current_digit}`;
    signals.push({
      type: "AUTOCORR",
      direction,
      confidence: parseFloat(Math.min(75, Math.abs(sig1.r) * 300).toFixed(1)),
      reasoning: `Lag-1 autocorrelation r=${sig1.r} is statistically significant`,
    });
  }

  return {
    symbol,
    sample_size: prices.length,
    markov,
    autocorrelation: autocorr,
    hurst,
    run_length: runLength,
    conditional_probability: conditional,
    ensemble_signals: signals,
    last_updated: new Date().toISOString(),
  };
}
