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

    // Full digit distribution for D-circle rendering (all 10 digits, ranked)
    digit_distribution: Array.from({ length: 10 }, (_, i) => ({
      digit: i,
      count: counts[i],
      percentage: pcts[i],
      rank: 0, // filled below
    }))
      .sort((a, b) => b.percentage - a.percentage)
      .map((s, i) => ({ ...s, rank: i + 1 }))
      .sort((a, b) => a.digit - b.digit),
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

// ────────────────────────────────────────────────────────────────
//  Universal Strategy Generator — supports all Deriv contract types
// ────────────────────────────────────────────────────────────────

export interface StrategySignal {
  symbol: string;
  contract_type: string;
  contract_category: string;
  signal: string;
  direction: string;
  confidence: number;
  entry_conditions: string[];
  duration_ticks: number;
  duration_label: string;
  barrier?: number;
  digit?: number;
  risk_level: string;
  strategy_name: string;
  reasoning: string;
  market_state: {
    current_digit: number;
    current_price: number;
    trend: string;
    volatility: number;
    even_pct: number;
    odd_pct: number;
    high_digit_pct: number;
    low_digit_pct: number;
    top_digit: number;
    bottom_digit: number;
    streak: number;
    parity_streak: number;
  };
  generated_at: string;
}

export function computeStrategySignal(
  symbol: string,
  contractType: string,
  prices: number[],
  pipSize: number,
  barrierParam?: number,
  digitParam?: number
): StrategySignal {
  const digits = analyseDigits(prices, pipSize);
  const sorted = [...digits].sort((a, b) => b.percentage - a.percentage);
  const currentPrice = prices[prices.length - 1] ?? 0;
  const currentDigit = extractLastDigit(currentPrice, pipSize);
  const now = new Date().toISOString();

  // Compute basic stats
  const EVEN = [0, 2, 4, 6, 8];
  const evenPct = digits.filter((d) => EVEN.includes(d.digit)).reduce((s, d) => s + d.percentage, 0);
  const oddPct = 100 - evenPct;
  const highPct = digits.filter((d) => d.digit >= 6).reduce((s, d) => s + d.percentage, 0);
  const lowPct = digits.filter((d) => d.digit <= 3).reduce((s, d) => s + d.percentage, 0);
  const topDigit = sorted[0].digit;
  const bottomDigit = sorted[sorted.length - 1].digit;

  // Price trend (last 20 prices)
  const recent = prices.slice(-20);
  const trendUp = recent[recent.length - 1] > recent[0];
  const priceRange = Math.max(...recent) - Math.min(...recent);
  const avgPrice = recent.reduce((a, b) => a + b, 0) / recent.length;
  const volatilityPct = (priceRange / avgPrice) * 100;

  // Streak analysis
  let streak = 1;
  const lastDigits = prices.slice(-20).map((p) => extractLastDigit(p, pipSize));
  for (let i = lastDigits.length - 2; i >= 0; i--) {
    if (lastDigits[i] === currentDigit) streak++;
    else break;
  }
  let parityStreak = 1;
  const currentParity = EVEN.includes(currentDigit) ? "even" : "odd";
  for (let i = lastDigits.length - 2; i >= 0; i--) {
    const p = EVEN.includes(lastDigits[i]) ? "even" : "odd";
    if (p === currentParity) parityStreak++;
    else break;
  }

  const marketState = {
    current_digit: currentDigit,
    current_price: currentPrice,
    trend: trendUp ? "UP" : "DOWN",
    volatility: parseFloat(volatilityPct.toFixed(3)),
    even_pct: parseFloat(evenPct.toFixed(1)),
    odd_pct: parseFloat(oddPct.toFixed(1)),
    high_digit_pct: parseFloat(highPct.toFixed(1)),
    low_digit_pct: parseFloat(lowPct.toFixed(1)),
    top_digit: topDigit,
    bottom_digit: bottomDigit,
    streak,
    parity_streak: parityStreak,
  };

  type ContractMap = Record<string, () => StrategySignal>;
  const contractMap: ContractMap = {
    // ── DIGIT contracts ──────────────────────────────────────────
    DIGITEVEN: () => {
      const signal = evenPct > 52 ? "BUY EVEN" : evenPct < 48 ? "SELL EVEN (BUY ODD)" : "WAIT";
      const conf = evenPct > 52 ? Math.min(88, 50 + (evenPct - 50) * 3) : evenPct < 48 ? Math.min(85, 50 + (50 - evenPct) * 3) : 40;
      return {
        symbol, contract_type: "DIGITEVEN", contract_category: "Digits",
        signal, direction: evenPct > 52 ? "EVEN" : "ODD",
        confidence: parseFloat(conf.toFixed(1)),
        entry_conditions: [
          `Even digits: ${evenPct.toFixed(1)}% of last ${prices.length} ticks`,
          `Parity streak: ${parityStreak} consecutive ${currentParity}`,
          parityStreak >= 4 ? `⚠ Streak ${parityStreak}+ → reversion risk` : `Streak within normal range`,
        ],
        duration_ticks: 5, duration_label: "5 ticks",
        risk_level: conf > 70 ? "Medium" : "Low",
        strategy_name: "Parity Frequency Bias",
        reasoning: `Even digits appear ${evenPct.toFixed(1)}% of the time (expected 50%). ${parityStreak >= 4 ? `Current ${parityStreak}-tick ${currentParity} streak suggests possible reversion.` : `Bias is ${evenPct > 50 ? "towards even" : "towards odd"}.`}`,
        market_state: marketState, generated_at: now,
      };
    },
    DIGITODD: () => {
      const signal = oddPct > 52 ? "BUY ODD" : oddPct < 48 ? "SELL ODD (BUY EVEN)" : "WAIT";
      const conf = oddPct > 52 ? Math.min(88, 50 + (oddPct - 50) * 3) : oddPct < 48 ? Math.min(85, 50 + (50 - oddPct) * 3) : 40;
      return {
        symbol, contract_type: "DIGITODD", contract_category: "Digits",
        signal, direction: oddPct > 52 ? "ODD" : "EVEN",
        confidence: parseFloat(conf.toFixed(1)),
        entry_conditions: [
          `Odd digits: ${oddPct.toFixed(1)}% of last ${prices.length} ticks`,
          `Parity streak: ${parityStreak} consecutive ${currentParity}`,
          parityStreak >= 4 ? `⚠ Streak ${parityStreak}+ → mean reversion due` : `No extreme streak detected`,
        ],
        duration_ticks: 5, duration_label: "5 ticks",
        risk_level: conf > 70 ? "Medium" : "Low",
        strategy_name: "Odd Frequency Bias",
        reasoning: `Odd digits appear ${oddPct.toFixed(1)}% (expected 50%). ${parityStreak >= 4 ? `${parityStreak}-tick ${currentParity} streak — statistical reversion in play.` : `Normal distribution.`}`,
        market_state: marketState, generated_at: now,
      };
    },
    DIGITOVER: () => {
      const barrier = barrierParam !== undefined ? barrierParam : 4;
      const overPct = digits.filter((d) => d.digit > barrier).reduce((s, d) => s + d.percentage, 0);
      const expected = ((9 - barrier) / 10) * 100;
      const conf = Math.min(88, 50 + Math.abs(overPct - expected) * 1.5);
      const signal = overPct > expected + 3 ? `BUY OVER ${barrier}` : overPct < expected - 3 ? `AVOID OVER ${barrier}` : `WAIT`;
      return {
        symbol, contract_type: "DIGITOVER", contract_category: "Digits",
        signal, direction: `OVER ${barrier}`, barrier,
        confidence: parseFloat(conf.toFixed(1)),
        entry_conditions: [
          `Digits >${barrier}: ${overPct.toFixed(1)}% (expected ${expected.toFixed(1)}%)`,
          `Low digits (0-${barrier}): ${(100 - overPct).toFixed(1)}%`,
          lowPct > 40 ? `⚠ Low digits oversaturated — over pressure building` : `Balanced distribution`,
        ],
        duration_ticks: 3, duration_label: "3 ticks",
        risk_level: "Medium",
        strategy_name: `Over ${barrier} Frequency`,
        reasoning: `Digits above ${barrier} appear ${overPct.toFixed(1)}% vs expected ${expected.toFixed(1)}%. ${overPct > expected ? "Above expected — over contract has statistical edge." : "Below expected — avoid or wait for reset."}`,
        market_state: marketState, generated_at: now,
      };
    },
    DIGITUNDER: () => {
      const barrier = barrierParam !== undefined ? barrierParam : 5;
      const underPct = digits.filter((d) => d.digit < barrier).reduce((s, d) => s + d.percentage, 0);
      const expected = (barrier / 10) * 100;
      const conf = Math.min(88, 50 + Math.abs(underPct - expected) * 1.5);
      const signal = underPct > expected + 3 ? `BUY UNDER ${barrier}` : underPct < expected - 3 ? `AVOID UNDER ${barrier}` : `WAIT`;
      return {
        symbol, contract_type: "DIGITUNDER", contract_category: "Digits",
        signal, direction: `UNDER ${barrier}`, barrier,
        confidence: parseFloat(conf.toFixed(1)),
        entry_conditions: [
          `Digits <${barrier}: ${underPct.toFixed(1)}% (expected ${expected.toFixed(1)}%)`,
          `High digits: ${highPct.toFixed(1)}%`,
          highPct > 40 ? `⚠ High digits saturated — under reversal likely` : `Normal distribution`,
        ],
        duration_ticks: 3, duration_label: "3 ticks",
        risk_level: "Medium",
        strategy_name: `Under ${barrier} Frequency`,
        reasoning: `Digits below ${barrier} appear ${underPct.toFixed(1)}% vs expected ${expected.toFixed(1)}%. ${underPct > expected ? "Edge confirmed for under contract." : "Wait for better setup."}`,
        market_state: marketState, generated_at: now,
      };
    },
    DIGITMATCH: () => {
      const digit = digitParam !== undefined ? digitParam : topDigit;
      const digitStat = digits.find((d) => d.digit === digit)!;
      const conf = Math.min(90, digitStat.percentage * 5);
      return {
        symbol, contract_type: "DIGITMATCH", contract_category: "Digits",
        signal: conf > 55 ? `MATCH ${digit}` : `LOW CONFIDENCE`,
        direction: `MATCH ${digit}`, digit,
        confidence: parseFloat(conf.toFixed(1)),
        entry_conditions: [
          `Digit ${digit}: ${digitStat.percentage.toFixed(1)}% frequency (rank #${digitStat.rank})`,
          `Sample size: ${prices.length} ticks`,
          streak >= 2 ? `Streak: digit ${currentDigit} × ${streak} — avoid matching current` : `No streak bias`,
        ],
        duration_ticks: 1, duration_label: "1 tick",
        risk_level: digitStat.percentage > 15 ? "High" : "Medium",
        strategy_name: "Digit Frequency Match",
        reasoning: `Digit ${digit} appears ${digitStat.percentage.toFixed(1)}% of the time across ${prices.length} ticks. ${digitStat.rank === 1 ? "It is the most frequent digit." : `Ranked #${digitStat.rank} out of 10.`} 1-tick match contract.`,
        market_state: marketState, generated_at: now,
      };
    },
    DIGITDIFF: () => {
      const digit = digitParam !== undefined ? digitParam : bottomDigit;
      const digitStat = digits.find((d) => d.digit === digit)!;
      const conf = Math.min(90, (10 - digitStat.percentage) * 8);
      return {
        symbol, contract_type: "DIGITDIFF", contract_category: "Digits",
        signal: `DIFFER ${digit}`,
        direction: `DIFFER ${digit}`, digit,
        confidence: parseFloat(conf.toFixed(1)),
        entry_conditions: [
          `Digit ${digit}: ${digitStat.percentage.toFixed(1)}% — least frequent (rank #${digitStat.rank})`,
          `Differ probability: ${(100 - digitStat.percentage).toFixed(1)}%`,
          `Best differ digit: ${bottomDigit} at ${digits.find((d) => d.digit === bottomDigit)!.percentage.toFixed(1)}%`,
        ],
        duration_ticks: 1, duration_label: "1 tick",
        risk_level: "Low",
        strategy_name: "Least Likely Differ",
        reasoning: `Digit ${digit} appears only ${digitStat.percentage.toFixed(1)}% of the time — lowest frequency. Differ contract wins ${(100 - digitStat.percentage).toFixed(1)}% of the time historically.`,
        market_state: marketState, generated_at: now,
      };
    },
    // ── RISE / FALL ───────────────────────────────────────────────
    CALL: () => {
      const signal = trendUp ? "BUY RISE (CALL)" : "WAIT FOR REVERSAL";
      const conf = Math.min(82, 50 + volatilityPct * 3 + (trendUp ? 10 : -10));
      return {
        symbol, contract_type: "CALL", contract_category: "Rise/Fall",
        signal, direction: "RISE",
        confidence: parseFloat(conf.toFixed(1)),
        entry_conditions: [
          `Price trend: ${trendUp ? "⬆ UPWARD" : "⬇ DOWNWARD"} over last 20 ticks`,
          `Price range: ${priceRange.toFixed(pipSize)} (${volatilityPct.toFixed(2)}% of avg)`,
          `Current price: ${currentPrice.toFixed(pipSize)}`,
        ],
        duration_ticks: 5, duration_label: "5 ticks",
        risk_level: volatilityPct > 0.1 ? "High" : "Medium",
        strategy_name: "Trend Momentum Rise",
        reasoning: `Price has moved ${trendUp ? "up" : "down"} over the last 20 ticks with ${volatilityPct.toFixed(3)}% volatility. ${trendUp ? "Upward momentum supports a RISE (CALL) contract." : "Downtrend detected — wait for confirmation before buying RISE."}`,
        market_state: marketState, generated_at: now,
      };
    },
    PUT: () => {
      const signal = !trendUp ? "BUY FALL (PUT)" : "WAIT FOR REVERSAL";
      const conf = Math.min(82, 50 + volatilityPct * 3 + (!trendUp ? 10 : -10));
      return {
        symbol, contract_type: "PUT", contract_category: "Rise/Fall",
        signal, direction: "FALL",
        confidence: parseFloat(conf.toFixed(1)),
        entry_conditions: [
          `Price trend: ${!trendUp ? "⬇ DOWNWARD" : "⬆ UPWARD"} over last 20 ticks`,
          `Price range: ${priceRange.toFixed(pipSize)} (${volatilityPct.toFixed(2)}% of avg)`,
          `Current price: ${currentPrice.toFixed(pipSize)}`,
        ],
        duration_ticks: 5, duration_label: "5 ticks",
        risk_level: volatilityPct > 0.1 ? "High" : "Medium",
        strategy_name: "Trend Momentum Fall",
        reasoning: `Price has moved ${!trendUp ? "down" : "up"} over the last 20 ticks. ${!trendUp ? "Downward momentum supports a FALL (PUT) contract." : "Uptrend detected — wait for bearish confirmation before buying FALL."}`,
        market_state: marketState, generated_at: now,
      };
    },
    // ── TOUCH contracts ──────────────────────────────────────────
    ONETOUCH: () => {
      const factor = Math.pow(10, pipSize);
      const barrier = barrierParam !== undefined ? barrierParam : parseFloat((currentPrice * (trendUp ? 1.002 : 0.998)).toFixed(pipSize));
      const dist = Math.abs(currentPrice - barrier);
      const distPips = Math.round(dist * factor);
      const reachable = distPips < priceRange * factor * 2;
      const conf = reachable ? Math.min(78, 50 + volatilityPct * 5) : 30;
      return {
        symbol, contract_type: "ONETOUCH", contract_category: "Touch",
        signal: reachable ? "BUY ONE TOUCH" : "BARRIER TOO FAR",
        direction: "TOUCH",
        barrier, confidence: parseFloat(conf.toFixed(1)),
        entry_conditions: [
          `Barrier: ${barrier} (${distPips} pips away)`,
          `Recent range: ${(priceRange * factor).toFixed(0)} pips over 20 ticks`,
          reachable ? `✓ Barrier within 2× recent range — reachable` : `✗ Barrier exceeds 2× recent range`,
        ],
        duration_ticks: 10, duration_label: "10 ticks",
        risk_level: "High",
        strategy_name: "Volatility Touch",
        reasoning: `Barrier at ${barrier} is ${distPips} pips from current price ${currentPrice.toFixed(pipSize)}. Recent 20-tick range is ${(priceRange * factor).toFixed(0)} pips. ${reachable ? "Price is likely to reach the barrier." : "Barrier is too far — low probability."}`,
        market_state: marketState, generated_at: now,
      };
    },
    NOTOUCH: () => {
      const factor = Math.pow(10, pipSize);
      const barrier = barrierParam !== undefined ? barrierParam : parseFloat((currentPrice * (trendUp ? 1.005 : 0.995)).toFixed(pipSize));
      const dist = Math.abs(currentPrice - barrier);
      const distPips = Math.round(dist * factor);
      const safe = distPips > priceRange * factor * 2;
      const conf = safe ? Math.min(80, 55 + volatilityPct * 4) : 38;
      return {
        symbol, contract_type: "NOTOUCH", contract_category: "Touch",
        signal: safe ? "BUY NO TOUCH" : "BARRIER TOO CLOSE",
        direction: "NO TOUCH",
        barrier, confidence: parseFloat(conf.toFixed(1)),
        entry_conditions: [
          `Barrier: ${barrier} (${distPips} pips away)`,
          `Recent range: ${(priceRange * factor).toFixed(0)} pips`,
          safe ? `✓ Barrier outside 2× range — unlikely to be hit` : `⚠ Barrier within range — risky`,
        ],
        duration_ticks: 5, duration_label: "5 ticks",
        risk_level: safe ? "Low" : "High",
        strategy_name: "Safe Range No-Touch",
        reasoning: `Barrier at ${barrier} is ${distPips} pips away; recent range is ${(priceRange * factor).toFixed(0)} pips over 20 ticks. ${safe ? "Price unlikely to reach barrier — No Touch has edge." : "Price could reach barrier — risky entry."}`,
        market_state: marketState, generated_at: now,
      };
    },
    // ── IN/OUT contracts ─────────────────────────────────────────
    EXPIRYRANGE: () => {
      const lo = parseFloat((currentPrice * 0.999).toFixed(pipSize));
      const hi = parseFloat((currentPrice * 1.001).toFixed(pipSize));
      const stayIn = volatilityPct < 0.08;
      const conf = Math.min(80, stayIn ? 65 + (0.08 - volatilityPct) * 200 : 40);
      return {
        symbol, contract_type: "EXPIRYRANGE", contract_category: "In/Out",
        signal: stayIn ? "BUY STAYS IN" : "HIGH VOLATILITY — AVOID",
        direction: "STAYS IN",
        confidence: parseFloat(conf.toFixed(1)),
        entry_conditions: [
          `Volatility: ${volatilityPct.toFixed(3)}% (threshold 0.08%)`,
          `Suggested range: ${lo} – ${hi}`,
          stayIn ? `✓ Low volatility — price likely to stay in range` : `✗ High volatility — price may break out`,
        ],
        duration_ticks: 5, duration_label: "5 ticks",
        risk_level: stayIn ? "Low" : "High",
        strategy_name: "Low Volatility Stay-In",
        reasoning: `Volatility is ${volatilityPct.toFixed(3)}% over the last 20 ticks. ${stayIn ? "Low volatility supports a Stays In contract." : "High volatility makes breakout more likely — avoid Stays In."}`,
        market_state: marketState, generated_at: now,
      };
    },
    EXPIRYMISS: () => {
      const lo = parseFloat((currentPrice * 0.999).toFixed(pipSize));
      const hi = parseFloat((currentPrice * 1.001).toFixed(pipSize));
      const breakOut = volatilityPct > 0.1;
      const conf = Math.min(82, breakOut ? 60 + (volatilityPct - 0.1) * 150 : 42);
      return {
        symbol, contract_type: "EXPIRYMISS", contract_category: "In/Out",
        signal: breakOut ? "BUY BREAKS OUT" : "LOW VOLATILITY — AVOID",
        direction: "BREAKS OUT",
        confidence: parseFloat(conf.toFixed(1)),
        entry_conditions: [
          `Volatility: ${volatilityPct.toFixed(3)}% (threshold 0.1%)`,
          `Range: ${lo} – ${hi}`,
          breakOut ? `✓ High volatility — breakout likely` : `✗ Low volatility — price may stay inside range`,
        ],
        duration_ticks: 5, duration_label: "5 ticks",
        risk_level: breakOut ? "Medium" : "High",
        strategy_name: "High Volatility Breakout",
        reasoning: `Volatility is ${volatilityPct.toFixed(3)}%. ${breakOut ? "High volatility supports a Breaks Out contract." : "Volatility too low for breakout strategy."}`,
        market_state: marketState, generated_at: now,
      };
    },
    // ── TICK HIGH/LOW ────────────────────────────────────────────
    HIGHERTICK: () => {
      const bestTick = trendUp ? 5 : 1;
      const conf = Math.min(78, 50 + volatilityPct * 4 + (trendUp ? 8 : 0));
      return {
        symbol, contract_type: "HIGHERTICK", contract_category: "Tick High/Low",
        signal: `HIGHEST TICK AT TICK ${bestTick}`,
        direction: `TICK ${bestTick}`,
        confidence: parseFloat(conf.toFixed(1)),
        entry_conditions: [
          `Trend: ${trendUp ? "⬆ UP" : "⬇ DOWN"}`,
          `Volatility: ${volatilityPct.toFixed(3)}%`,
          trendUp ? `Uptrend → peak expected later (tick 4-5)` : `Downtrend → peak expected early (tick 1-2)`,
        ],
        duration_ticks: 5, duration_label: "5 ticks",
        risk_level: "High",
        strategy_name: "Trend-Based High Tick",
        reasoning: `Price is trending ${trendUp ? "UP" : "DOWN"}. In uptrends, the highest tick tends to occur later (tick 4-5). In downtrends, the highest tick tends to occur earlier (tick 1-2). Recommending tick ${bestTick}.`,
        market_state: marketState, generated_at: now,
      };
    },
    LOWERTICK: () => {
      const bestTick = !trendUp ? 5 : 1;
      const conf = Math.min(78, 50 + volatilityPct * 4 + (!trendUp ? 8 : 0));
      return {
        symbol, contract_type: "LOWERTICK", contract_category: "Tick High/Low",
        signal: `LOWEST TICK AT TICK ${bestTick}`,
        direction: `TICK ${bestTick}`,
        confidence: parseFloat(conf.toFixed(1)),
        entry_conditions: [
          `Trend: ${!trendUp ? "⬇ DOWN" : "⬆ UP"}`,
          `Volatility: ${volatilityPct.toFixed(3)}%`,
          !trendUp ? `Downtrend → low expected later (tick 4-5)` : `Uptrend → low expected early (tick 1-2)`,
        ],
        duration_ticks: 5, duration_label: "5 ticks",
        risk_level: "High",
        strategy_name: "Trend-Based Low Tick",
        reasoning: `Price is trending ${!trendUp ? "DOWN" : "UP"}. In downtrends, the lowest tick tends to occur later. In uptrends, the lowest tick tends to appear early. Recommending tick ${bestTick}.`,
        market_state: marketState, generated_at: now,
      };
    },
    // ── ACCUMULATOR ───────────────────────────────────────────────
    ACCU: () => {
      const growthGrowthOk = volatilityPct < 0.05;
      const conf = growthGrowthOk ? Math.min(75, 60 + (0.05 - volatilityPct) * 300) : 30;
      return {
        symbol, contract_type: "ACCU", contract_category: "Accumulator",
        signal: growthGrowthOk ? "ENTER ACCUMULATOR" : "WAIT — VOLATILITY HIGH",
        direction: "ACCUMULATE",
        confidence: parseFloat(conf.toFixed(1)),
        entry_conditions: [
          `Volatility: ${volatilityPct.toFixed(3)}% (threshold <0.05%)`,
          `Recent range: ${priceRange.toFixed(pipSize)} over 20 ticks`,
          growthGrowthOk ? `✓ Calm market — accumulator can grow safely` : `✗ Volatile — risk of barrier knockout`,
        ],
        duration_ticks: 0, duration_label: "Open-ended",
        risk_level: growthGrowthOk ? "Low" : "High",
        strategy_name: "Low Vol Accumulator Entry",
        reasoning: `Accumulator contracts knock out if price moves beyond the barrier. Current volatility is ${volatilityPct.toFixed(3)}%. ${growthGrowthOk ? "Low volatility is ideal for accumulator entry." : "High volatility increases knockout risk — wait for calmer conditions."}`,
        market_state: marketState, generated_at: now,
      };
    },
    // ── RESET ─────────────────────────────────────────────────────
    RESETCALL: () => {
      const conf = Math.min(72, 50 + volatilityPct * 5);
      return {
        symbol, contract_type: "RESETCALL", contract_category: "Reset",
        signal: trendUp ? "BUY RESET CALL" : "WAIT",
        direction: "RESET RISE",
        confidence: parseFloat(conf.toFixed(1)),
        entry_conditions: [
          `Trend: ${trendUp ? "⬆ UP" : "⬇ DOWN"}`,
          `The strike resets to the lowest mid-point price`,
          `Best entry: after a dip in an uptrend`,
        ],
        duration_ticks: 10, duration_label: "10 ticks",
        risk_level: "Medium",
        strategy_name: "Reset Call on Dip",
        reasoning: `Reset Call wins if price at expiry is above the reset strike (lowest midpoint price). In uptrending markets, entering after a small pullback maximises the reset benefit.`,
        market_state: marketState, generated_at: now,
      };
    },
    RESETPUT: () => {
      const conf = Math.min(72, 50 + volatilityPct * 5);
      return {
        symbol, contract_type: "RESETPUT", contract_category: "Reset",
        signal: !trendUp ? "BUY RESET PUT" : "WAIT",
        direction: "RESET FALL",
        confidence: parseFloat(conf.toFixed(1)),
        entry_conditions: [
          `Trend: ${!trendUp ? "⬇ DOWN" : "⬆ UP"}`,
          `The strike resets to the highest mid-point price`,
          `Best entry: after a rally in a downtrend`,
        ],
        duration_ticks: 10, duration_label: "10 ticks",
        risk_level: "Medium",
        strategy_name: "Reset Put on Rally",
        reasoning: `Reset Put wins if price at expiry is below the reset strike (highest midpoint price). In downtrending markets, entering after a small rally maximises the reset benefit.`,
        market_state: marketState, generated_at: now,
      };
    },
  };

  const handler = contractMap[contractType];
  if (!handler) {
    return {
      symbol, contract_type: contractType, contract_category: "Unknown",
      signal: "UNSUPPORTED CONTRACT",
      direction: "N/A",
      confidence: 0,
      entry_conditions: ["Contract type not supported"],
      duration_ticks: 0, duration_label: "N/A",
      risk_level: "N/A",
      strategy_name: "Unknown",
      reasoning: `Contract type ${contractType} is not yet supported.`,
      market_state: marketState, generated_at: now,
    };
  }
  return handler();
}
