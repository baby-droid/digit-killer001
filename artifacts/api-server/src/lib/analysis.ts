import { analyseDigits, extractLastDigit } from "./deriv";

export interface DigitStats {
  digit: number;
  count: number;
  percentage: number;
  rank: number;
  color: string;
}

// Over/Under signal logic based on the strategy documents
export function computeOverUnderSignals(digits: DigitStats[], prices: number[], pipSize: number) {
  const currentPrice = prices[prices.length - 1] ?? 0;
  const currentDigit = extractLastDigit(currentPrice, pipSize);

  const digitMap = Object.fromEntries(digits.map((d) => [d.digit, d]));
  const entries = [];

  // OVER strategies
  const overStrategies = [
    {
      contract: "OVER 1",
      barrier: 1,
      check: () => digitMap[0]?.percentage < 10 && digitMap[1]?.percentage < 10,
      entryDigit: 1,
      ticks: "1-2",
      risk: "Low",
    },
    {
      contract: "OVER 2",
      barrier: 2,
      check: () => [0, 1, 2].every((d) => digitMap[d]?.percentage < 10),
      entryDigit: 2,
      ticks: "2-4",
      risk: "Medium",
    },
    {
      contract: "OVER 3",
      barrier: 3,
      check: () => [0, 1, 2, 3].every((d) => digitMap[d]?.percentage < 10),
      entryDigit: 3,
      ticks: "2-4",
      risk: "Medium",
    },
    {
      contract: "OVER 4",
      barrier: 4,
      check: () => [0, 1, 2, 3].filter((d) => digitMap[d]?.percentage < 10).length >= 3,
      entryDigit: 4,
      ticks: "3-4",
      risk: "Medium",
    },
    {
      contract: "OVER 5",
      barrier: 5,
      check: () => [0, 1, 2, 3, 4].filter((d) => digitMap[d]?.percentage < 10).length >= 3,
      entryDigit: 5,
      ticks: "2-3",
      risk: "High",
    },
  ];

  const underStrategies = [
    {
      contract: "UNDER 9",
      barrier: 9,
      check: () => digitMap[9]?.percentage < 10,
      entryDigit: 9,
      ticks: "1",
      risk: "Low",
    },
    {
      contract: "UNDER 8",
      barrier: 8,
      check: () => digitMap[8]?.percentage < 10 && digitMap[9]?.percentage < 10,
      entryDigit: 8,
      ticks: "1-3",
      risk: "Low",
    },
    {
      contract: "UNDER 7",
      barrier: 7,
      check: () => [7, 8, 9].every((d) => digitMap[d]?.percentage < 10),
      entryDigit: 7,
      ticks: "2-3",
      risk: "Medium",
    },
    {
      contract: "UNDER 6",
      barrier: 6,
      check: () => [6, 7, 8, 9].every((d) => digitMap[d]?.percentage < 10),
      entryDigit: 6,
      ticks: "5",
      risk: "Medium",
    },
    {
      contract: "UNDER 5",
      barrier: 5,
      check: () => [5, 6, 7, 8, 9].filter((d) => digitMap[d]?.percentage < 10).length >= 3,
      entryDigit: 5,
      ticks: "3-5",
      risk: "High",
    },
  ];

  for (const s of [...overStrategies, ...underStrategies]) {
    const conditionsMet = s.check();
    const barrier = s.barrier;

    // Calculate confidence based on how many losing digits are below 10%
    let confidence = 50;
    if (s.contract.startsWith("OVER")) {
      const losingBelow10 = [...Array(barrier + 1).keys()].filter(
        (d) => digitMap[d]?.percentage < 10
      ).length;
      confidence = Math.min(95, 50 + losingBelow10 * 10);
    } else {
      const losingBelow10 = [...Array(10).keys()]
        .slice(barrier)
        .filter((d) => digitMap[d]?.percentage < 10).length;
      confidence = Math.min(95, 50 + losingBelow10 * 10);
    }

    const reason = conditionsMet
      ? `Conditions met: ${s.contract} setup is valid`
      : `Waiting: not all required digits below 10%`;

    entries.push({
      contract: s.contract,
      recommended_ticks: s.ticks,
      risk_level: s.risk,
      entry_digit: s.entryDigit,
      confidence: parseFloat(confidence.toFixed(1)),
      conditions_met: conditionsMet,
      reason,
    });
  }

  // Best over = highest confidence over entry
  const overEntries = entries.filter((e) => e.contract.startsWith("OVER"));
  const underEntries = entries.filter((e) => e.contract.startsWith("UNDER"));

  const bestOver = overEntries.reduce((a, b) =>
    b.conditions_met && b.confidence > a.confidence ? b : a
  );
  const bestUnder = underEntries.reduce((a, b) =>
    b.conditions_met && b.confidence > a.confidence ? b : a
  );

  return {
    best_over: bestOver,
    best_under: bestUnder,
    entries,
    current_price: currentPrice,
    current_digit: currentDigit,
  };
}

/**
 * Even-Odd Strategy (Analyst Kim / profitap.site method)
 *
 * EVEN side = winning side (digits 0,2,4,6,8)
 * ODD side  = entry zone  (digits 1,3,5,7,9)
 *
 * Entry signal fires when:
 *  1. ALL odd digits are below 10.50% EXCEPT exactly ONE
 *  2. That one odd digit is ABOVE 10.50% → Entry Candidate
 *  3. The PRECEDING digit (2nd-to-last in the stream) is also ODD
 *
 * When all three conditions are met → trade on the EVEN side.
 */
export function computeEvenOddAnalysis(prices: number[], pipSize: number) {
  const EVEN_DIGITS = [0, 2, 4, 6, 8];
  const ODD_DIGITS  = [1, 3, 5, 7, 9];
  const THRESHOLD   = 10.50;

  const digits = prices.map((p) => extractLastDigit(p, pipSize));
  const total   = digits.length || 1;

  // Per-digit frequency
  const counts: Record<number, number> = {};
  for (let i = 0; i < 10; i++) counts[i] = 0;
  digits.forEach((d) => counts[d]++);

  const pcts: Record<number, number> = {};
  for (let i = 0; i < 10; i++) {
    pcts[i] = parseFloat(((counts[i] / total) * 100).toFixed(2));
  }

  // ── Even side: rank by frequency, assign color labels ────────────────────────
  const evenRanked = EVEN_DIGITS
    .map((d) => ({ digit: d, pct: pcts[d], count: counts[d] }))
    .sort((a, b) => b.pct - a.pct)
    .map((s, i, arr) => ({
      ...s,
      role:  i === 0 ? "most"         : i === 1 ? "second_most"  :
             i === arr.length - 1 ? "least" : i === arr.length - 2 ? "second_least" : "middle",
      color: i === 0 ? "green"  : i === 1 ? "blue"   :
             i === arr.length - 1 ? "red" : i === arr.length - 2 ? "yellow" : "neutral",
    }));

  // ── Odd side: threshold analysis ──────────────────────────────────────────────
  const oddStats = ODD_DIGITS.map((d) => ({
    digit: d,
    pct: pcts[d],
    count: counts[d],
    is_entry_candidate: pcts[d] > THRESHOLD,
    is_losing: pcts[d] <= THRESHOLD,
  }));

  // ── Entry signal detection ────────────────────────────────────────────────────
  const currentDigit   = digits[digits.length - 1] ?? 0;
  const precedingDigit = digits[digits.length - 2] ?? -1;

  const candidates      = oddStats.filter((s) => s.is_entry_candidate);
  const exactlyOne      = candidates.length === 1;
  const precedingIsOdd  = ODD_DIGITS.includes(precedingDigit);
  const allOthersLosing = oddStats.filter((s) => !s.is_entry_candidate).every((s) => s.pct < THRESHOLD);
  const signalReady     = exactlyOne && precedingIsOdd && allOthersLosing;

  const entryDigit = candidates[0]?.digit ?? null;
  const entryPct   = entryDigit !== null ? pcts[entryDigit] : 0;

  // Confidence: how far above threshold the entry digit is
  let confidence = 50;
  if (signalReady && entryDigit !== null) {
    const excess = entryPct - THRESHOLD;
    confidence = Math.min(95, 62 + excess * 3.5);
  } else if (exactlyOne && !precedingIsOdd) {
    // Almost there — one condition missing
    confidence = 45;
  }

  // Aggregate even / odd
  const evenCount = EVEN_DIGITS.reduce((s, d) => s + counts[d], 0);
  const oddCount  = ODD_DIGITS.reduce((s, d) => s + counts[d], 0);

  return {
    even_count: evenCount,
    odd_count:  oddCount,
    even_pct:   parseFloat(((evenCount / total) * 100).toFixed(1)),
    odd_pct:    parseFloat(((oddCount  / total) * 100).toFixed(1)),
    current_digit:   currentDigit,
    preceding_digit: precedingDigit,

    // Strategy data
    even_ranked:       evenRanked,
    odd_stats:         oddStats,
    entry_threshold:   THRESHOLD,
    entry_candidates:  candidates,
    entry_digit:       entryDigit,
    entry_pct:         parseFloat(entryPct.toFixed(2)),
    signal_ready:      signalReady,
    conditions: {
      exactly_one_candidate: exactlyOne,
      preceding_is_odd:      precedingIsOdd,
      all_others_losing:     allOthersLosing,
    },

    recommended: signalReady ? "Even" : (evenCount >= oddCount ? "Even" : "Odd"),
    confidence:  parseFloat(confidence.toFixed(1)),
    ticks:       signalReady ? 5 : 3,
    recent_digits: digits.slice(-30),
  };
}

export function computeMatchDifferSignals(digitStats: DigitStats[], prices: number[], pipSize: number) {
  const currentDigit = extractLastDigit(prices[prices.length - 1] ?? 0, pipSize);

  // Best match: most frequent digit (likely to appear again in short window)
  const sorted = [...digitStats].sort((a, b) => b.percentage - a.percentage);
  const bestMatch = sorted[0].digit;
  const bestDiffer = sorted[sorted.length - 1].digit;

  const matchPct = sorted[0].percentage;
  const differPct = sorted[sorted.length - 1].percentage;

  // Ticks: higher confidence needs fewer ticks
  const matchTicks = matchPct > 15 ? 5 : matchPct > 12 ? 7 : 10;
  const differTicks = differPct < 7 ? 5 : differPct < 9 ? 7 : 10;

  const matchConfidence = Math.min(95, matchPct * 5);
  const differConfidence = Math.min(95, (10 - differPct) * 10);

  return {
    best_match: bestMatch,
    best_differ: bestDiffer,
    match_ticks: matchTicks,
    differ_ticks: differTicks,
    match_confidence: parseFloat(matchConfidence.toFixed(1)),
    differ_confidence: parseFloat(differConfidence.toFixed(1)),
    current_digit: currentDigit,
    reason_match: `Digit ${bestMatch} has highest frequency at ${matchPct}%`,
    reason_differ: `Digit ${bestDiffer} has lowest frequency at ${differPct}%`,
  };
}

export function computeTickContracts(prices: number[], pipSize: number) {
  const recentTicks = prices.slice(-20);
  const currentPrice = prices[prices.length - 1] ?? 0;
  const currentDigit = extractLastDigit(currentPrice, pipSize);

  // Trend detection
  const firstHalf = recentTicks.slice(0, 10);
  const secondHalf = recentTicks.slice(10);
  const firstAvg = firstHalf.reduce((a, b) => a + b, 0) / (firstHalf.length || 1);
  const secondAvg = secondHalf.reduce((a, b) => a + b, 0) / (secondHalf.length || 1);
  const trend = secondAvg > firstAvg ? "UP" : secondAvg < firstAvg ? "DOWN" : "NEUTRAL";

  // Volatility score
  const mean = recentTicks.reduce((a, b) => a + b, 0) / (recentTicks.length || 1);
  const variance = recentTicks.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / (recentTicks.length || 1);
  const volatilityScore = parseFloat(Math.min(100, Math.sqrt(variance) * 100).toFixed(1));

  const contracts = [
    {
      contract_type: "Rise",
      recommended_ticks: trend === "UP" ? 3 : 5,
      confidence: trend === "UP" ? 72 : 45,
      entry_signal: trend === "UP" ? "BUY RISE" : "WAIT",
      description: "Price expected to be higher than entry after ticks",
      risk_level: "Medium",
    },
    {
      contract_type: "Fall",
      recommended_ticks: trend === "DOWN" ? 3 : 5,
      confidence: trend === "DOWN" ? 72 : 45,
      entry_signal: trend === "DOWN" ? "BUY FALL" : "WAIT",
      description: "Price expected to be lower than entry after ticks",
      risk_level: "Medium",
    },
    {
      contract_type: "Only Up",
      recommended_ticks: 5,
      confidence: trend === "UP" ? 65 : 40,
      entry_signal: trend === "UP" ? "BUY ONLY UP" : "WAIT",
      description: "Every tick must be higher than previous",
      risk_level: "High",
    },
    {
      contract_type: "Only Down",
      recommended_ticks: 5,
      confidence: trend === "DOWN" ? 65 : 40,
      entry_signal: trend === "DOWN" ? "BUY ONLY DOWN" : "WAIT",
      description: "Every tick must be lower than previous",
      risk_level: "High",
    },
    {
      contract_type: "High Tick",
      recommended_ticks: 5,
      confidence: 60,
      entry_signal: "BUY HIGH TICK",
      description: "Predict which tick will be the highest in the series",
      risk_level: "Medium",
    },
    {
      contract_type: "Low Tick",
      recommended_ticks: 5,
      confidence: 60,
      entry_signal: "BUY LOW TICK",
      description: "Predict which tick will be the lowest in the series",
      risk_level: "Medium",
    },
  ];

  return {
    current_price: currentPrice,
    current_digit: currentDigit,
    contracts,
    trend,
    volatility_score: volatilityScore,
    recent_ticks: recentTicks,
  };
}

export function computeAiSignals(
  symbol: string,
  digitStats: DigitStats[],
  prices: number[],
  pipSize: number
) {
  const currentDigit = extractLastDigit(prices[prices.length - 1] ?? 0, pipSize);
  const sorted = [...digitStats].sort((a, b) => b.percentage - a.percentage);
  const signals = [];
  const now = new Date().toISOString();

  // Signal 1: Under if high digits are dominant
  const highDigitPct = [6, 7, 8, 9].map((d) => sorted.find((s) => s.digit === d)?.percentage ?? 0);
  const highSum = highDigitPct.reduce((a, b) => a + b, 0);
  if (highSum > 44) {
    signals.push({
      id: `${symbol}-under-${Date.now()}`,
      symbol,
      contract_type: "UNDER",
      direction: "UNDER 6",
      entry_digit: 9,
      ticks: 5,
      confidence: Math.min(95, highSum * 1.5),
      strategy: "High Digit Exhaustion",
      timestamp: now,
      reason: `Digits 6-9 dominate at ${highSum.toFixed(1)}% - exhaustion likely`,
      risk_level: "Medium",
    });
  }

  // Signal 2: Over if low digits are dominant
  const lowDigitPct = [0, 1, 2, 3].map((d) => sorted.find((s) => s.digit === d)?.percentage ?? 0);
  const lowSum = lowDigitPct.reduce((a, b) => a + b, 0);
  if (lowSum > 44) {
    signals.push({
      id: `${symbol}-over-${Date.now() + 1}`,
      symbol,
      contract_type: "OVER",
      direction: "OVER 4",
      entry_digit: 1,
      ticks: 3,
      confidence: Math.min(95, lowSum * 1.5),
      strategy: "Low Digit Exhaustion",
      timestamp: now,
      reason: `Digits 0-3 dominate at ${lowSum.toFixed(1)}% - over pressure building`,
      risk_level: "Medium",
    });
  }

  // Signal 3: Match best digit
  const bestMatch = sorted[0];
  signals.push({
    id: `${symbol}-match-${Date.now() + 2}`,
    symbol,
    contract_type: "MATCHES",
    direction: `MATCH ${bestMatch.digit}`,
    entry_digit: bestMatch.digit,
    ticks: 10,
    confidence: Math.min(90, bestMatch.percentage * 4),
    strategy: "Frequency Dominance",
    timestamp: now,
    reason: `Digit ${bestMatch.digit} at ${bestMatch.percentage}% - highest frequency`,
    risk_level: "High",
  });

  // Signal 4: Differ worst digit
  const worstDigit = sorted[sorted.length - 1];
  signals.push({
    id: `${symbol}-differ-${Date.now() + 3}`,
    symbol,
    contract_type: "DIFFERS",
    direction: `DIFFER ${worstDigit.digit}`,
    entry_digit: worstDigit.digit,
    ticks: 5,
    confidence: Math.min(90, (10 - worstDigit.percentage) * 8),
    strategy: "Least Likely Digit",
    timestamp: now,
    reason: `Digit ${worstDigit.digit} at ${worstDigit.percentage}% - least frequent, best to differ`,
    risk_level: "Low",
  });

  const marketCondition = highSum > 44 ? "HIGH_PRESSURE" : lowSum > 44 ? "LOW_PRESSURE" : "BALANCED";

  return {
    symbol,
    signals,
    last_updated: now,
    market_condition: marketCondition,
  };
}
