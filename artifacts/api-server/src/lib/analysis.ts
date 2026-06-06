import { analyseDigits, extractLastDigit } from "./deriv";

export interface DigitStats {
  digit: number;
  count: number;
  percentage: number;
  rank: number;
  color: string;
}

// ── Over/Under Signal Engine ─────────────────────────────────────────────────
// Uses 3 time-windows (full history, last 100, last 30) + entry-trigger logic.
// Win probability is computed directly from digit frequencies.
// Signal fires when: (1) win% > 50%, (2) current digit is at/past barrier,
// (3) recent trend does not oppose the position.
export function computeOverUnderSignals(digits: DigitStats[], prices: number[], pipSize: number) {
  const n = prices.length;
  if (!n) {
    return { entries: [], best_over: null, best_under: null,
             current_price: 0, current_digit: 0, sample_size: 0 };
  }

  const currentPrice = prices[n - 1] ?? 0;
  const currentDigit = extractLastDigit(currentPrice, pipSize);

  // ── Compute frequencies for 3 time windows ──────────────────
  const allD = prices.map((p) => extractLastDigit(p, pipSize));
  const mkFreq = (arr: number[]) => {
    const c = new Array(10).fill(0);
    arr.forEach((d) => c[d]++);
    return c.map((v, i) => ({ digit: i, count: v, pct: (v / (arr.length || 1)) * 100 }));
  };
  const fullFreq    = mkFreq(allD);              // full history
  const recentFreq  = mkFreq(allD.slice(-100));  // last 100 ticks
  const shortFreq   = mkFreq(allD.slice(-30));   // last 30 ticks
  const last5Digits = allD.slice(-5);

  // ── Barrier definitions ──────────────────────────────────────
  const OVER_DEFS = [
    { barrier: 0, risk: "Very Low", ticks: "2"   },
    { barrier: 1, risk: "Low",      ticks: "1-2" },
    { barrier: 2, risk: "Low",      ticks: "1-3" },
    { barrier: 3, risk: "Medium",   ticks: "1-3" },
    { barrier: 4, risk: "Medium",   ticks: "2-3" },
    { barrier: 5, risk: "High",     ticks: "1-2" },
  ];
  const UNDER_DEFS = [
    { barrier: 9, risk: "Very Low", ticks: "2"   },
    { barrier: 8, risk: "Low",      ticks: "1-2" },
    { barrier: 7, risk: "Low",      ticks: "1-3" },
    { barrier: 6, risk: "Medium",   ticks: "2-3" },
    { barrier: 5, risk: "High",     ticks: "1-2" },
  ];

  type OverUnderEntry = {
    contract: string; recommended_ticks: string; risk_level: string;
    entry_digit: number; confidence: number; conditions_met: boolean;
    reason: string; reasons: string[];
    win_probability: number; recent_win_probability: number; short_win_probability: number;
    at_barrier: boolean; winning_digits: number[]; losing_digits: number[];
    trend: string; lose_heat: number; expected_lose_pct: number;
  };

  const entries: OverUnderEntry[] = [];

  // ── OVER entries ─────────────────────────────────────────────
  for (const { barrier, risk, ticks } of OVER_DEFS) {
    // Win: digit > barrier  →  winning digits = [barrier+1 … 9]
    const winD  = Array.from({ length: 9 - barrier }, (_, i) => barrier + 1 + i);
    const loseD = Array.from({ length: barrier + 1 }, (_, i) => i);

    const winPct    = winD.reduce((s, d) => s + fullFreq[d].pct, 0);
    const winRecent = winD.reduce((s, d) => s + recentFreq[d].pct, 0);
    const winShort  = winD.reduce((s, d) => s + shortFreq[d].pct, 0);

    const loseRecent  = loseD.reduce((s, d) => s + recentFreq[d].pct, 0);
    const expLosePct  = (barrier + 1) * 10; // expected sum if uniform
    const loseHeat    = parseFloat((loseRecent - expLosePct).toFixed(1)); // +ve = losing digits hot
    const trendDelta  = parseFloat((winRecent - winPct).toFixed(1));      // +ve = win% rising

    // Entry trigger: current digit ≤ barrier means you just got a losing digit → best entry
    const atBarrier = currentDigit <= barrier;

    // Signal fires when win% > 50, entry triggered, and recent trend not strongly against
    const conditionsMet = winPct > 50 && atBarrier && winRecent >= winPct - 8;

    // ── Confidence (multi-factor) ────────────────────────────
    let conf = winPct;                          // base = historical win probability
    if (atBarrier)      conf += 5;              // at entry zone
    if (loseHeat > 1)   conf += Math.min(6, loseHeat * 1.5); // losing digits over-represented → reversion
    if (trendDelta > 1) conf += Math.min(5, trendDelta);     // recent trend strengthening
    if (winShort > winPct + 3) conf += 3;       // short-term momentum matching
    if (!atBarrier)     conf -= 5;              // not at entry yet
    if (winRecent < winPct - 5) conf -= 4;      // recent win% declining
    conf = Math.min(92, Math.max(28, conf));

    const trendLabel = Math.abs(trendDelta) < 1.5 ? "STABLE"
      : trendDelta > 0 ? `▲ +${trendDelta}% recent` : `▼ ${trendDelta}% recent`;

    const reasons: string[] = [
      `Win digits [${winD.join(",")}]: ${winPct.toFixed(1)}% (all ${n}) | ${winRecent.toFixed(1)}% (last 100) | ${winShort.toFixed(1)}% (last 30)`,
      atBarrier
        ? `✅ Entry trigger ACTIVE — current digit ${currentDigit} ≤ barrier ${barrier}`
        : `⏳ Wait — current digit ${currentDigit} > barrier ${barrier}; enter when digit falls to ≤${barrier}`,
      loseHeat > 1
        ? `🔥 Losing digits [${loseD.join(",")}] are +${loseHeat}% above expected — mean reversion likely`
        : `Losing digits [${loseD.join(",")}] at ${loseRecent.toFixed(1)}% (expected ${expLosePct}%)`,
      `Trend: ${trendLabel} | Expected win rate: ${((9 - barrier) * 10).toFixed(0)}%`,
    ];

    entries.push({
      contract: `OVER ${barrier}`,
      recommended_ticks: ticks,
      risk_level: risk,
      entry_digit: barrier,
      confidence: parseFloat(conf.toFixed(1)),
      conditions_met: conditionsMet,
      reason: reasons[0],
      reasons,
      win_probability:        parseFloat(winPct.toFixed(1)),
      recent_win_probability: parseFloat(winRecent.toFixed(1)),
      short_win_probability:  parseFloat(winShort.toFixed(1)),
      at_barrier: atBarrier,
      winning_digits: winD,
      losing_digits: loseD,
      trend: trendDelta > 1.5 ? "UP" : trendDelta < -1.5 ? "DOWN" : "FLAT",
      lose_heat: loseHeat,
      expected_lose_pct: expLosePct,
    });
  }

  // ── UNDER entries ─────────────────────────────────────────────
  for (const { barrier, risk, ticks } of UNDER_DEFS) {
    // Win: digit < barrier  →  winning digits = [0 … barrier-1]
    const winD  = Array.from({ length: barrier }, (_, i) => i);
    const loseD = Array.from({ length: 10 - barrier }, (_, i) => barrier + i);

    const winPct    = winD.reduce((s, d) => s + fullFreq[d].pct, 0);
    const winRecent = winD.reduce((s, d) => s + recentFreq[d].pct, 0);
    const winShort  = winD.reduce((s, d) => s + shortFreq[d].pct, 0);

    const loseRecent = loseD.reduce((s, d) => s + recentFreq[d].pct, 0);
    const expLosePct = (10 - barrier) * 10;
    const loseHeat   = parseFloat((loseRecent - expLosePct).toFixed(1));
    const trendDelta = parseFloat((winRecent - winPct).toFixed(1));

    // Entry trigger: current digit ≥ barrier means you just got a losing digit
    const atBarrier = currentDigit >= barrier;

    const conditionsMet = winPct > 50 && atBarrier && winRecent >= winPct - 8;

    let conf = winPct;
    if (atBarrier)      conf += 5;
    if (loseHeat > 1)   conf += Math.min(6, loseHeat * 1.5);
    if (trendDelta > 1) conf += Math.min(5, trendDelta);
    if (winShort > winPct + 3) conf += 3;
    if (!atBarrier)     conf -= 5;
    if (winRecent < winPct - 5) conf -= 4;
    conf = Math.min(92, Math.max(28, conf));

    const trendLabel = Math.abs(trendDelta) < 1.5 ? "STABLE"
      : trendDelta > 0 ? `▲ +${trendDelta}% recent` : `▼ ${trendDelta}% recent`;

    const reasons: string[] = [
      `Win digits [${winD.join(",")}]: ${winPct.toFixed(1)}% (all ${n}) | ${winRecent.toFixed(1)}% (last 100) | ${winShort.toFixed(1)}% (last 30)`,
      atBarrier
        ? `✅ Entry trigger ACTIVE — current digit ${currentDigit} ≥ barrier ${barrier}`
        : `⏳ Wait — current digit ${currentDigit} < barrier ${barrier}; enter when digit rises to ≥${barrier}`,
      loseHeat > 1
        ? `🔥 Losing digits [${loseD.join(",")}] are +${loseHeat}% above expected — mean reversion likely`
        : `Losing digits [${loseD.join(",")}] at ${loseRecent.toFixed(1)}% (expected ${expLosePct}%)`,
      `Trend: ${trendLabel} | Expected win rate: ${(barrier * 10).toFixed(0)}%`,
    ];

    entries.push({
      contract: `UNDER ${barrier}`,
      recommended_ticks: ticks,
      risk_level: risk,
      entry_digit: barrier,
      confidence: parseFloat(conf.toFixed(1)),
      conditions_met: conditionsMet,
      reason: reasons[0],
      reasons,
      win_probability:        parseFloat(winPct.toFixed(1)),
      recent_win_probability: parseFloat(winRecent.toFixed(1)),
      short_win_probability:  parseFloat(winShort.toFixed(1)),
      at_barrier: atBarrier,
      winning_digits: winD,
      losing_digits: loseD,
      trend: trendDelta > 1.5 ? "UP" : trendDelta < -1.5 ? "DOWN" : "FLAT",
      lose_heat: loseHeat,
      expected_lose_pct: expLosePct,
    });
  }

  const overEntries  = entries.filter((e) => e.contract.startsWith("OVER"));
  const underEntries = entries.filter((e) => e.contract.startsWith("UNDER"));

  const bestOver  = overEntries.reduce((a, b) =>
    b.conditions_met && b.confidence > a.confidence ? b : a, overEntries[0]);
  const bestUnder = underEntries.reduce((a, b) =>
    b.conditions_met && b.confidence > a.confidence ? b : a, underEntries[0]);

  return {
    best_over:    bestOver,
    best_under:   bestUnder,
    entries,
    current_price:  currentPrice,
    current_digit:  currentDigit,
    sample_size:    n,
    full_freq:      fullFreq,
    recent_freq:    recentFreq,
    short_freq:     shortFreq,
    last_5_digits:  last5Digits,
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
  const EVEN_DIGITS  = [0, 2, 4, 6, 8];
  const ODD_DIGITS   = [1, 3, 5, 7, 9];
  const THRESHOLD    = 10.20;   // elevated = above this
  const THRESHOLD_HI = 10.50;   // "well above" threshold

  const digits = prices.map((p) => extractLastDigit(p, pipSize));
  const total   = digits.length || 1;

  // ── Per-digit frequency (guaranteed to sum to 100%) ───────────────────────
  const counts: Record<number, number> = {};
  for (let i = 0; i < 10; i++) counts[i] = 0;
  digits.forEach((d) => counts[d]++);
  const pcts: Record<number, number> = {};
  for (let i = 0; i < 10; i++) pcts[i] = parseFloat(((counts[i] / total) * 100).toFixed(2));

  const currentDigit   = digits[digits.length - 1] ?? 0;
  const precedingDigit = digits[digits.length - 2] ?? -1;

  // ── Even digits ranked ────────────────────────────────────────────────────
  const evenRanked = EVEN_DIGITS
    .map((d) => ({ digit: d, pct: pcts[d], count: counts[d] }))
    .sort((a, b) => b.pct - a.pct)
    .map((s, i, arr) => ({
      ...s,
      role:  i === 0 ? "most" : i === 1 ? "second_most" :
             i === arr.length - 1 ? "least" : i === arr.length - 2 ? "second_least" : "middle",
      color: i === 0 ? "green" : i === 1 ? "blue" :
             i === arr.length - 1 ? "red" : i === arr.length - 2 ? "yellow" : "neutral",
    }));

  // ── Odd digits ranked ─────────────────────────────────────────────────────
  const oddRanked = ODD_DIGITS
    .map((d) => ({ digit: d, pct: pcts[d], count: counts[d] }))
    .sort((a, b) => b.pct - a.pct)
    .map((s, i, arr) => ({
      ...s,
      role:  i === 0 ? "most" : i === 1 ? "second_most" :
             i === arr.length - 1 ? "least" : i === arr.length - 2 ? "second_least" : "middle",
      color: i === 0 ? "green" : i === 1 ? "blue" :
             i === arr.length - 1 ? "red" : i === arr.length - 2 ? "yellow" : "neutral",
    }));

  // ── BUY EVEN SIGNAL: watch ODD digits ────────────────────────────────────
  // Conditions: exactly one odd digit in [THRESHOLD, THRESHOLD_HI] range
  //             AND all other odd digits below THRESHOLD
  //             AND preceding digit is ODD
  const oddStats = ODD_DIGITS.map((d) => ({
    digit: d, pct: pcts[d], count: counts[d],
    is_entry_candidate: pcts[d] >= THRESHOLD,
    is_losing: pcts[d] < THRESHOLD,
  }));
  const oddCandidates      = oddStats.filter((s) => s.is_entry_candidate);
  const exactlyOneOdd      = oddCandidates.length === 1;
  const precedingIsOdd     = ODD_DIGITS.includes(precedingDigit);
  const allOtherOddBelow   = oddStats.filter((s) => !s.is_entry_candidate).every((s) => s.pct < THRESHOLD);
  const evenSignalReady    = exactlyOneOdd && precedingIsOdd && allOtherOddBelow;
  const evenEntryDigit     = oddCandidates[0]?.digit ?? null;
  const evenEntryPct       = evenEntryDigit !== null ? pcts[evenEntryDigit] : 0;

  // ── BUY ODD SIGNAL: watch EVEN digits ────────────────────────────────────
  // Conditions: exactly one even digit in [THRESHOLD, THRESHOLD_HI] range
  //             AND all other even digits below THRESHOLD
  //             AND preceding digit is EVEN
  const evenStats = EVEN_DIGITS.map((d) => ({
    digit: d, pct: pcts[d], count: counts[d],
    is_entry_candidate: pcts[d] >= THRESHOLD,
    is_losing: pcts[d] < THRESHOLD,
  }));
  const evenCandidates     = evenStats.filter((s) => s.is_entry_candidate);
  const exactlyOneEven     = evenCandidates.length === 1;
  const precedingIsEven    = EVEN_DIGITS.includes(precedingDigit);
  const allOtherEvenBelow  = evenStats.filter((s) => !s.is_entry_candidate).every((s) => s.pct < THRESHOLD);
  const oddSignalReady     = exactlyOneEven && precedingIsEven && allOtherEvenBelow;
  const oddEntryDigit      = evenCandidates[0]?.digit ?? null;
  const oddEntryPct        = oddEntryDigit !== null ? pcts[oddEntryDigit] : 0;

  // ── STREAK DETECTION ─────────────────────────────────────────────────────
  // Pattern: 2-4 consecutive same-parity → 2+ opposite → signal
  const parityStream = digits.map((d) => EVEN_DIGITS.includes(d) ? "E" : "O");
  let streakSignal: "buy_even" | "buy_odd" | null = null;
  let streakDesc = "";
  let streakCount = 0;
  const recent = parityStream.slice(-10);
  if (recent.length >= 4) {
    const last = recent[recent.length - 1];
    let newLen = 0, prevLen = 0;
    for (let i = recent.length - 1; i >= 0 && recent[i] === last; i--) newLen++;
    const prev = recent[recent.length - 1 - newLen];
    if (prev && prev !== last) {
      for (let i = recent.length - 1 - newLen; i >= 0 && recent[i] === prev; i--) prevLen++;
    }
    if (prevLen >= 2 && prevLen <= 4 && newLen >= 2) {
      streakCount = newLen;
      if (last === "O") {
        streakSignal = "buy_odd";
        streakDesc   = `${prevLen} even → ${newLen} odd`;
      } else {
        streakSignal = "buy_even";
        streakDesc   = `${prevLen} odd → ${newLen} even`;
      }
    }
  }

  // ── Confidence ────────────────────────────────────────────────────────────
  let confidence = 50;
  if (evenSignalReady && evenEntryDigit !== null) {
    confidence = Math.min(95, 62 + (evenEntryPct - THRESHOLD) * 4);
  } else if (oddSignalReady && oddEntryDigit !== null) {
    confidence = Math.min(95, 62 + (oddEntryPct - THRESHOLD) * 4);
  } else if (streakSignal) {
    confidence = Math.min(78, 55 + streakCount * 5);
  } else if (exactlyOneOdd && !precedingIsOdd) {
    confidence = 45;
  } else if (exactlyOneEven && !precedingIsEven) {
    confidence = 45;
  }

  const activeSignal =
    evenSignalReady ? "BUY EVEN" :
    oddSignalReady  ? "BUY ODD" :
    streakSignal === "buy_even" ? "BUY EVEN (streak)" :
    streakSignal === "buy_odd"  ? "BUY ODD (streak)"  : null;

  const signalReady = evenSignalReady || oddSignalReady || streakSignal !== null;

  // Aggregate parity
  const evenCount = EVEN_DIGITS.reduce((s, d) => s + counts[d], 0);
  const oddCount  = ODD_DIGITS.reduce((s, d) => s + counts[d], 0);

  return {
    even_count: evenCount,
    odd_count:  oddCount,
    even_pct: parseFloat(((evenCount / total) * 100).toFixed(1)),
    odd_pct:  parseFloat(((oddCount  / total) * 100).toFixed(1)),
    current_digit:   currentDigit,
    preceding_digit: precedingDigit,
    ticks:           1,

    // Ranked display arrays
    even_ranked: evenRanked,
    odd_ranked:  oddRanked,

    // ── BUY EVEN analysis (watching ODD digits) ──
    odd_stats:         oddStats,
    even_signal_ready: evenSignalReady,
    even_entry_digit:  evenEntryDigit,
    even_entry_pct:    parseFloat(evenEntryPct.toFixed(2)),
    even_conditions: {
      exactly_one_candidate: exactlyOneOdd,
      preceding_is_odd:      precedingIsOdd,
      all_others_below:      allOtherOddBelow,
    },

    // ── BUY ODD analysis (watching EVEN digits) ──
    even_stats:        evenStats,
    odd_signal_ready:  oddSignalReady,
    odd_entry_digit:   oddEntryDigit,
    odd_entry_pct:     parseFloat(oddEntryPct.toFixed(2)),
    odd_conditions: {
      exactly_one_candidate: exactlyOneEven,
      preceding_is_even:     precedingIsEven,
      all_others_below:      allOtherEvenBelow,
    },

    // ── Streak signal ──
    streak_signal: streakSignal,
    streak_desc:   streakDesc,
    streak_count:  streakCount,

    // ── Combined ──
    signal_ready:    signalReady,
    active_signal:   activeSignal,
    entry_threshold: THRESHOLD,
    recommended:     activeSignal ? (activeSignal.includes("EVEN") ? "Even" : "Odd") : "Wait",
    confidence:      parseFloat(confidence.toFixed(1)),
    recent_digits:   digits.slice(-30),

    // Full digit distribution (all 10, sums to 100%)
    digit_distribution: Array.from({ length: 10 }, (_, i) => ({
      digit: i, count: counts[i], percentage: pcts[i], rank: 0,
    }))
      .sort((a, b) => b.percentage - a.percentage)
      .map((s, i) => ({ ...s, rank: i + 1 }))
      .sort((a, b) => a.digit - b.digit),

    // Legacy compatibility fields
    even_ranked_legacy: evenRanked,
    odd_stats_legacy:   oddStats,
    entry_digit:        evenEntryDigit ?? oddEntryDigit,
    entry_pct:          parseFloat((evenEntryPct || oddEntryPct).toFixed(2)),
    conditions: {
      exactly_one_candidate: exactlyOneOdd,
      preceding_is_odd:      precedingIsOdd,
      all_others_losing:     allOtherOddBelow,
    },
  };
}

// ────────────────────────────────────────────────────────────────────────────
//  AI Confirmation: MATCH strategy engine (PDF strategies)
// ────────────────────────────────────────────────────────────────────────────

export interface MatchAiConfirmation {
  digit: number;
  confidence: number;
  ticks: number;
  strategy: string;
  reason: string;
  fire: boolean;
  strategies_triggered: string[];
}

export function computeMatchAiConfirmation(
  digits: number[],
  currentDigit: number
): MatchAiConfirmation {
  const N = digits.length;
  if (N < 20) {
    return { digit: currentDigit, confidence: 30, ticks: 1, strategy: "Insufficient data", reason: "Need 20+ ticks", fire: false, strategies_triggered: [] };
  }

  const lastSeen = new Array(10).fill(-999);
  for (let i = 0; i < N; i++) lastSeen[digits[i]] = i;
  const ticksSince = lastSeen.map((ls) => N - 1 - ls);

  const last5  = digits.slice(-5);
  const last10 = digits.slice(-10);
  const last15 = digits.slice(-15);

  const strategies: string[] = [];
  const candidates: Array<{ digit: number; conf: number; strategy: string; reason: string; ticks: number }> = [];

  // ── Strategy 1: Delayed Digit Exhaustion (15–25 absent ticks) ──────────────
  let exDigit = -1; let maxAbs = 0;
  for (let d = 0; d <= 9; d++) { if (ticksSince[d] > maxAbs) { maxAbs = ticksSince[d]; exDigit = d; } }
  if (maxAbs >= 15 && exDigit >= 0) {
    const conf = Math.min(86, 50 + (maxAbs - 15) * 2.5);
    strategies.push(`Delayed Exhaustion: digit ${exDigit} absent ${maxAbs} ticks`);
    candidates.push({ digit: exDigit, conf, strategy: "Delayed Digit Exhaustion", ticks: 1,
      reason: `Digit ${exDigit} has been absent for ${maxAbs} ticks — statistical pressure to reappear` });
  }

  // ── Strategy 2: Double Echo (same digit 2× in last 5) ─────────────────────
  const freq5 = new Array(10).fill(0);
  last5.forEach((d) => freq5[d]++);
  for (let d = 0; d <= 9; d++) {
    if (freq5[d] >= 2) {
      strategies.push(`Double Echo: digit ${d} appeared ${freq5[d]}× in last 5`);
      candidates.push({ digit: d, conf: 62, strategy: "Double Echo Return", ticks: 1,
        reason: `Digit ${d} echoed ${freq5[d]}× in last 5 ticks — echo return in 1–2 ticks likely` });
    }
  }

  // ── Strategy 3: Compression Release (≤4 unique digits in last 15) ─────────
  const uniqueIn15 = new Set(last15).size;
  if (uniqueIn15 <= 4) {
    let bestMissing = -1; let bestAbs = 0;
    for (let d = 0; d <= 9; d++) {
      if (!last15.includes(d) && ticksSince[d] > bestAbs) { bestAbs = ticksSince[d]; bestMissing = d; }
    }
    if (bestMissing >= 0) {
      strategies.push(`Compression Release: only ${uniqueIn15} digits in last 15, digit ${bestMissing} overdue`);
      candidates.push({ digit: bestMissing, conf: 56, strategy: "Compression Release", ticks: 1,
        reason: `Only ${uniqueIn15} unique digits in last 15 ticks — digit ${bestMissing} breakout likely` });
    }
  }

  // ── Strategy 4: Triple Repetition Continuation ────────────────────────────
  if (N >= 3) {
    const l3 = digits.slice(-3);
    if (l3[0] === l3[1] && l3[1] === l3[2]) {
      strategies.push(`Triple Repetition: digit ${l3[0]} ×3 consecutive`);
      candidates.push({ digit: l3[0], conf: 48, strategy: "Triple Continuation", ticks: 1,
        reason: `Digit ${l3[0]} appeared 3× consecutively — rare continuation signal (high risk)` });
    }
  }

  // ── Strategy 5: Fractal Mirror (alternating 4-tick pattern) ───────────────
  if (N >= 4) {
    const l4 = digits.slice(-4);
    if (l4[0] === l4[2] && l4[1] === l4[3] && l4[0] !== l4[1]) {
      const nextDigit = currentDigit === l4[0] ? l4[1] : l4[0];
      strategies.push(`Fractal Mirror: alternating pattern …${l4[0]},${l4[1]},${l4[0]},${l4[1]}`);
      candidates.push({ digit: nextDigit, conf: 50, strategy: "Fractal Mirror Pattern", ticks: 1,
        reason: `Alternating pattern detected — digit ${nextDigit} is the next fractal step` });
    }
  }

  candidates.sort((a, b) => b.conf - a.conf);
  const best = candidates[0];
  if (!best) {
    const freq50 = new Array(10).fill(0);
    digits.slice(-50).forEach((d) => freq50[d]++);
    const coldDigit = freq50.indexOf(Math.min(...freq50));
    return { digit: coldDigit, confidence: 35, ticks: 1, strategy: "Statistical Minimum",
      fire: false, reason: `Digit ${coldDigit} least frequent in last 50 ticks`, strategies_triggered: [] };
  }
  return { digit: best.digit, confidence: parseFloat(best.conf.toFixed(1)), ticks: best.ticks,
    strategy: best.strategy, reason: best.reason,
    fire: best.conf >= 65 || (best.conf >= 55 && strategies.length >= 2),
    strategies_triggered: strategies };
}

// ────────────────────────────────────────────────────────────────────────────
//  AI Confirmation: DIFFER strategy engine (PDF strategies)
// ────────────────────────────────────────────────────────────────────────────

export interface DifferAiConfirmation {
  digit: number;
  confidence: number;
  ticks: number;
  strategy: string;
  reason: string;
  fire: boolean;
  strategies_triggered: string[];
}

export function computeDifferAiConfirmation(
  digits: number[],
  currentDigit: number
): DifferAiConfirmation {
  const N = digits.length;
  if (N < 10) {
    return { digit: currentDigit, confidence: 30, ticks: 1, strategy: "Insufficient data", reason: "Need 10+ ticks", fire: false, strategies_triggered: [] };
  }

  const last5  = digits.slice(-5);
  const last10 = digits.slice(-10);
  const last3  = digits.slice(-3);

  const strategies: string[] = [];
  const candidates: Array<{ digit: number; conf: number; strategy: string; reason: string; ticks: number }> = [];

  // ── Strategy 1: Triple Exhaustion (3× same → DIFFER) ─────────────────────
  if (N >= 3 && last3[0] === last3[1] && last3[1] === last3[2]) {
    strategies.push(`Triple Exhaustion: digit ${last3[0]} ×3 consecutive`);
    candidates.push({ digit: last3[0], conf: 84, strategy: "Triple Exhaustion Reversal", ticks: 1,
      reason: `Digit ${last3[0]} appeared 3× in a row — extremely high probability of NOT appearing next` });
  }

  // ── Strategy 2: Double Repetition Reversal (2× in a row → DIFFER) ─────────
  if (N >= 2 && digits[N - 1] === digits[N - 2]) {
    const rep = digits[N - 1];
    if (!candidates.some((c) => c.digit === rep)) {
      strategies.push(`Double Repetition Reversal: digit ${rep} ×2`);
      candidates.push({ digit: rep, conf: 72, strategy: "Double Repetition Reversal", ticks: 1,
        reason: `Digit ${rep} appeared twice consecutively — high probability of NOT appearing next` });
    }
  }

  // ── Strategy 3: Burst Domination (digit 4+ in last 10 → DIFFER) ───────────
  const freq10 = new Array(10).fill(0);
  last10.forEach((d) => freq10[d]++);
  const burstMax = Math.max(...freq10);
  const burstDigit = freq10.indexOf(burstMax);
  if (burstMax >= 4 && !candidates.some((c) => c.digit === burstDigit)) {
    const conf = Math.min(80, 50 + (burstMax - 4) * 8);
    strategies.push(`Burst Domination: digit ${burstDigit} appeared ${burstMax}/10 times`);
    candidates.push({ digit: burstDigit, conf, strategy: "Burst Domination Reversal", ticks: 1,
      reason: `Digit ${burstDigit} appeared ${burstMax}× in last 10 — exhaustion reversal signal` });
  }

  // ── Strategy 4: Cluster Rejection (3+ same digit in last 5) ──────────────
  const freq5 = new Array(10).fill(0);
  last5.forEach((d) => freq5[d]++);
  const clMax = Math.max(...freq5);
  const clDigit = freq5.indexOf(clMax);
  if (clMax >= 3 && !candidates.some((c) => c.digit === clDigit)) {
    strategies.push(`Cluster Rejection: digit ${clDigit} appeared ${clMax}/5 in last 5`);
    candidates.push({ digit: clDigit, conf: 68, strategy: "Cluster Rejection", ticks: 1,
      reason: `Digit ${clDigit} clusters ${clMax}× in last 5 ticks — rejection/differ signal strong` });
  }

  // ── Strategy 5: Fast Rotation (≥8 unique in last 10 → DIFFER current) ─────
  const uniqueIn10 = new Set(last10).size;
  if (uniqueIn10 >= 8 && !candidates.some((c) => c.digit === currentDigit)) {
    strategies.push(`Fast Rotation: ${uniqueIn10}/10 unique digits, no clustering`);
    candidates.push({ digit: currentDigit, conf: 55, strategy: "Fast Rotation Differ", ticks: 1,
      reason: `High digit variety (${uniqueIn10} unique in last 10) — current digit ${currentDigit} unlikely to repeat` });
  }

  candidates.sort((a, b) => b.conf - a.conf);
  const best = candidates[0];
  if (!best) {
    const freq50 = new Array(10).fill(0);
    digits.slice(-50).forEach((d) => freq50[d]++);
    const hotDigit = freq50.indexOf(Math.max(...freq50));
    return { digit: hotDigit, confidence: 38, ticks: 1, strategy: "Statistical Maximum",
      fire: false, reason: `Digit ${hotDigit} most frequent in last 50 — probable DIFFER target`,
      strategies_triggered: [] };
  }
  return { digit: best.digit, confidence: parseFloat(best.conf.toFixed(1)), ticks: best.ticks,
    strategy: best.strategy, reason: best.reason,
    fire: best.conf >= 65 || (best.conf >= 60 && strategies.length >= 2),
    strategies_triggered: strategies };
}

// ────────────────────────────────────────────────────────────────────────────

export function computeMatchDifferSignals(digitStats: DigitStats[], prices: number[], pipSize: number) {
  const currentDigit = extractLastDigit(prices[prices.length - 1] ?? 0, pipSize);
  const allDigits = prices.map((p) => extractLastDigit(p, pipSize));

  // Run PDF-based AI confirmation
  const matchConf = computeMatchAiConfirmation(allDigits, currentDigit);
  const differConf = computeDifferAiConfirmation(allDigits, currentDigit);

  // Legacy frequency stats for fallback/display
  const sorted = [...digitStats].sort((a, b) => b.percentage - a.percentage);
  const legacyMatchPct  = sorted.find((d) => d.digit === matchConf.digit)?.percentage  ?? sorted[0].percentage;
  const legacyDifferPct = sorted.find((d) => d.digit === differConf.digit)?.percentage ?? sorted[sorted.length - 1].percentage;

  return {
    best_match:         matchConf.digit,
    best_differ:        differConf.digit,
    match_ticks:        matchConf.ticks,
    differ_ticks:       differConf.ticks,
    match_confidence:   matchConf.confidence,
    differ_confidence:  differConf.confidence,
    current_digit:      currentDigit,
    reason_match:       matchConf.reason,
    reason_differ:      differConf.reason,
    match_strategy:     matchConf.strategy,
    differ_strategy:    differConf.strategy,
    match_fire:         matchConf.fire,
    differ_fire:        differConf.fire,
    match_strategies_triggered:  matchConf.strategies_triggered,
    differ_strategies_triggered: differConf.strategies_triggered,
    match_confirmation:  matchConf,
    differ_confirmation: differConf,
    // Legacy frequency info
    match_pct:  parseFloat(legacyMatchPct.toFixed(1)),
    differ_pct: parseFloat(legacyDifferPct.toFixed(1)),
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

// ─────────────────────────────────────────────────────────────────────────────
//  Digit Psychology Engine — determines if recent tick history favors the
//  winning side for a given contract type. Used by ALL signal generators.
// ─────────────────────────────────────────────────────────────────────────────
export interface DigitPsychology {
  psych_score: number;      // 0–100; >55 = psychology favors winning
  favors_win: boolean;      // true = recent history supports this trade
  win_rate_5: number;       // % of last 5 outcomes that would have won
  win_rate_10: number;      // % of last 10 outcomes
  win_rate_20: number;      // % of last 20 outcomes
  streak: number;           // positive = consecutive wins, negative = losses
  momentum: string;         // STRONG_WIN | WEAK_WIN | NEUTRAL | WEAK_LOSS | STRONG_LOSS
  should_trade: boolean;    // composite gate (psych + no recent losing streak)
  reason: string;           // human-readable verdict
}

export function computeDigitPsychology(
  prices: number[],
  pipSize: number,
  contractType: string,
  barrier?: number,
  targetDigit?: number,
): DigitPsychology {
  const N = prices.length;
  const EMPTY: DigitPsychology = {
    psych_score: 50, favors_win: false, win_rate_5: 50, win_rate_10: 50,
    win_rate_20: 50, streak: 0, momentum: "NEUTRAL", should_trade: false,
    reason: "Insufficient data",
  };
  if (N < 6) return EMPTY;

  const allDigits = prices.map((p) => extractLastDigit(p, pipSize));
  const ct = contractType.toUpperCase();

  // Build win/loss sequence for each tick
  const wins: boolean[] = [];
  for (let i = 1; i < N; i++) {
    const d = allDigits[i];
    let won = false;
    switch (ct) {
      case "DIGITOVER":  won = barrier !== undefined ? d > barrier  : d > 4; break;
      case "DIGITUNDER": won = barrier !== undefined ? d < barrier  : d < 5; break;
      case "DIGITEVEN":  won = d % 2 === 0; break;
      case "DIGITODD":   won = d % 2 !== 0; break;
      case "DIGITMATCH": won = targetDigit !== undefined && d === targetDigit; break;
      case "DIGITDIFF":  won = targetDigit !== undefined ? d !== targetDigit : true; break;
      case "CALL":       won = prices[i] > prices[i - 1]; break;
      case "PUT":        won = prices[i] < prices[i - 1]; break;
      default:           won = d > 4;
    }
    wins.push(won);
  }

  // Win rates for multiple time windows
  const w5  = wins.slice(-5);
  const w10 = wins.slice(-10);
  const w20 = wins.slice(-20);
  const rate5  = w5.length  > 0 ? (w5.filter(Boolean).length  / w5.length)  * 100 : 50;
  const rate10 = w10.length > 0 ? (w10.filter(Boolean).length / w10.length) * 100 : 50;
  const rate20 = w20.length > 0 ? (w20.filter(Boolean).length / w20.length) * 100 : 50;

  // Streak from end: +N = N consecutive wins, -N = N consecutive losses
  let streak = 0;
  const lastWon = wins[wins.length - 1] ?? false;
  for (let i = wins.length - 1; i >= 0; i--) {
    if (wins[i] === lastWon) streak++;
    else break;
  }
  if (!lastWon) streak = -streak;

  // Psychology score: weighted combination of time windows + streak momentum
  // Primary weight on recent (last 10), with acceleration from last 5
  let score = rate10 * 0.50 + rate5 * 0.30 + rate20 * 0.20;
  const accel = rate5 - rate10;  // positive = win rate accelerating
  score += accel * 0.40;

  // Streak modifiers
  if (streak >= 5)       score += 10;
  else if (streak >= 3)  score += 6;
  else if (streak >= 1)  score += 2;
  if (streak <= -5)      score -= 14;
  else if (streak <= -3) score -= 9;
  else if (streak <= -1) score -= 3;

  // Long-term alignment bonus
  if (rate20 > 58) score += 4;
  if (rate20 < 42) score -= 4;

  score = Math.min(96, Math.max(4, parseFloat(score.toFixed(1))));

  // Gates: wins must dominate recent history; no catastrophic losing streak
  const favorsWin  = score > 55 && rate10 > 52 && streak > -4;
  // Stronger gate for actual auto-trading: also require last-5 not collapsed
  const shouldTrade = favorsWin && rate5 >= 40 && streak > -3;

  // Momentum label
  let momentum = "NEUTRAL";
  if (score >= 72)      momentum = "STRONG_WIN";
  else if (score >= 58) momentum = "WEAK_WIN";
  else if (score <= 28) momentum = "STRONG_LOSS";
  else if (score <= 42) momentum = "WEAK_LOSS";

  const reason = favorsWin
    ? `✅ PSYCH OK — W10:${rate10.toFixed(0)}% W5:${rate5.toFixed(0)}%${streak > 0 ? ` | ${streak}-win streak` : ""}`
    : `⛔ PSYCH BLOCK — W10:${rate10.toFixed(0)}% (need >52%)${streak < 0 ? ` | ${Math.abs(streak)}-loss streak` : ""}${accel < -10 ? " | decelerating" : ""}`;

  return {
    psych_score: score,
    favors_win: favorsWin,
    win_rate_5:  parseFloat(rate5.toFixed(1)),
    win_rate_10: parseFloat(rate10.toFixed(1)),
    win_rate_20: parseFloat(rate20.toFixed(1)),
    streak,
    momentum,
    should_trade: shouldTrade,
    reason,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
//  Comprehensive AI Signal Generator — ALL contract types, psychology-gated.
//  Returns EVEN/ODD, OVER (2-5), UNDER (5-8), MATCH, DIFFER, RISE, FALL.
//  Only signals where digit psychology favors the winning side are emitted.
// ─────────────────────────────────────────────────────────────────────────────
export function computeAiSignals(
  symbol: string,
  digitStats: DigitStats[],
  prices: number[],
  pipSize: number,
) {
  const N = prices.length;
  const allDigits = prices.map((p) => extractLastDigit(p, pipSize));
  const currentDigit = allDigits[N - 1] ?? 0;
  const now = new Date().toISOString();
  let uid = 1;

  // Multi-window frequency tables
  const mkFreq = (arr: number[]) => {
    const c = new Array(10).fill(0) as number[];
    arr.forEach((d) => { if (d >= 0 && d <= 9) c[d]++; });
    return c.map((v, i) => ({ digit: i, pct: (v / (arr.length || 1)) * 100 }));
  };
  const fullFreq = mkFreq(allDigits);
  const last5    = allDigits.slice(-5);
  const last10   = allDigits.slice(-10);

  // Price direction for Rise/Fall
  const dirs: number[] = [];
  for (let i = 1; i < N; i++) dirs.push(prices[i] >= prices[i - 1] ? 1 : 0);
  const up20Pct = dirs.slice(-20).length > 0 ? (dirs.slice(-20).filter((d) => d === 1).length / Math.min(20, dirs.length)) * 100 : 50;
  const up10Pct = dirs.slice(-10).length > 0 ? (dirs.slice(-10).filter((d) => d === 1).length / Math.min(10, dirs.length)) * 100 : 50;

  // Helper to build a signal with psychology assessment
  type SigOut = {
    id: string; symbol: string; contract_type: string; direction: string;
    entry_digit: number; ticks: number; confidence: number; strategy: string;
    timestamp: string; reason: string; risk_level: string;
    barrier?: number; digit?: number;
    psych_score: number; psych_favors_win: boolean;
    win_rate_5: number; win_rate_10: number;
    psych_streak: number; psych_momentum: string;
  };

  function buildSignal(opts: {
    ct: string; dir: string; entryDigit: number; ticks: number;
    baseConf: number; risk: string; strategy: string;
    barrier?: number; digit?: number; analyticsReason: string;
  }): SigOut {
    const psych = computeDigitPsychology(prices, pipSize, opts.ct, opts.barrier, opts.digit);

    // Adjust confidence based on psychology quality
    let conf = opts.baseConf;
    if (psych.psych_score > 65) conf += Math.min(7, (psych.psych_score - 65) * 0.35);
    if (psych.psych_score < 45) conf -= Math.min(10, (45 - psych.psych_score) * 0.5);
    if (psych.streak >= 3)  conf += 3;
    if (psych.streak <= -3) conf -= 6;
    conf = Math.min(94, Math.max(22, parseFloat(conf.toFixed(1))));

    const sig: SigOut = {
      id: `${symbol}-${opts.ct.toLowerCase()}-${uid++}`,
      symbol,
      contract_type: opts.ct,
      direction: opts.dir,
      entry_digit: opts.entryDigit,
      ticks: opts.ticks,
      confidence: conf,
      strategy: opts.strategy,
      timestamp: now,
      reason: `${opts.analyticsReason} | ${psych.reason}`,
      risk_level: opts.risk,
      psych_score: psych.psych_score,
      psych_favors_win: psych.favors_win,
      win_rate_5: psych.win_rate_5,
      win_rate_10: psych.win_rate_10,
      psych_streak: psych.streak,
      psych_momentum: psych.momentum,
    };
    if (opts.barrier !== undefined) sig.barrier = opts.barrier;
    if (opts.digit   !== undefined) sig.digit   = opts.digit;
    return sig;
  }

  const allSignals: SigOut[] = [];

  // ── 1. EVEN / ODD ───────────────────────────────────────────────────────────
  const evenPct = [0, 2, 4, 6, 8].reduce((s, d) => s + fullFreq[d].pct, 0);
  const oddPct  = 100 - evenPct;
  const evenIn10 = last10.filter((d) => d % 2 === 0).length;
  const oddIn10  = last10.length - evenIn10;
  const evenIn5  = last5.filter((d) => d % 2 === 0).length;

  // Entry trigger: alternation tendency — last digit odd → even slightly more likely
  const evenTrigger = currentDigit % 2 !== 0;
  const oddTrigger  = currentDigit % 2 === 0;

  let evenConf = evenPct;
  if (evenIn10 > 6) evenConf += 8;
  if (evenTrigger)  evenConf += 5;
  if (evenIn5 > 3)  evenConf += 3;
  evenConf = Math.min(88, evenConf);

  let oddConf = oddPct;
  if (oddIn10 > 6) oddConf += 8;
  if (oddTrigger)  oddConf += 5;
  if (last5.filter((d) => d % 2 !== 0).length > 3) oddConf += 3;
  oddConf = Math.min(88, oddConf);

  allSignals.push(buildSignal({
    ct: "DIGITEVEN", dir: "EVEN", entryDigit: currentDigit, ticks: 5,
    baseConf: evenConf, risk: evenPct >= 52 ? "Low" : "Medium",
    strategy: "Parity Psychology Gate",
    analyticsReason: `Even: ${evenPct.toFixed(1)}% hist | ${evenIn10 * 10}% last-10 | ${evenTrigger ? "✅ entry" : "⏳ wait"}`,
  }));
  allSignals.push(buildSignal({
    ct: "DIGITODD", dir: "ODD", entryDigit: currentDigit, ticks: 5,
    baseConf: oddConf, risk: oddPct >= 52 ? "Low" : "Medium",
    strategy: "Parity Psychology Gate",
    analyticsReason: `Odd: ${oddPct.toFixed(1)}% hist | ${oddIn10 * 10}% last-10 | ${oddTrigger ? "✅ entry" : "⏳ wait"}`,
  }));

  // ── 2. OVER barriers ────────────────────────────────────────────────────────
  for (const b of [2, 3, 4, 5]) {
    const winPct  = Array.from({ length: 9 - b }, (_, i) => b + 1 + i).reduce((s, d) => s + fullFreq[d].pct, 0);
    const winIn10 = last10.filter((d) => d > b).length;
    const atBarrier = currentDigit <= b; // just got a losing digit → best entry moment

    if (winPct < 48) continue; // not statistically viable

    let conf = winPct;
    if (atBarrier)    conf += 7;
    if (winIn10 > 6)  conf += 5;
    if (winPct > 70)  conf += 4;
    conf = Math.min(91, conf);

    allSignals.push(buildSignal({
      ct: "DIGITOVER", dir: "OVER", entryDigit: b, ticks: 1, barrier: b,
      baseConf: conf,
      risk: winPct > 70 ? "Very Low" : winPct > 60 ? "Low" : "Medium",
      strategy: "Multi-Window Over Psychology",
      analyticsReason: `Over ${b}: ${winPct.toFixed(1)}% hist | last-10: ${winIn10 * 10}% | ${atBarrier ? "✅ at barrier" : "⏳ wait"}`,
    }));
  }

  // ── 3. UNDER barriers ───────────────────────────────────────────────────────
  for (const b of [5, 6, 7, 8]) {
    const winPct  = Array.from({ length: b }, (_, i) => i).reduce((s, d) => s + fullFreq[d].pct, 0);
    const winIn10 = last10.filter((d) => d < b).length;
    const atBarrier = currentDigit >= b;

    if (winPct < 48) continue;

    let conf = winPct;
    if (atBarrier)   conf += 7;
    if (winIn10 > 6) conf += 5;
    if (winPct > 70) conf += 4;
    conf = Math.min(91, conf);

    allSignals.push(buildSignal({
      ct: "DIGITUNDER", dir: "UNDER", entryDigit: b, ticks: 1, barrier: b,
      baseConf: conf,
      risk: winPct > 70 ? "Very Low" : winPct > 60 ? "Low" : "Medium",
      strategy: "Multi-Window Under Psychology",
      analyticsReason: `Under ${b}: ${winPct.toFixed(1)}% hist | last-10: ${winIn10 * 10}% | ${atBarrier ? "✅ at barrier" : "⏳ wait"}`,
    }));
  }

  // ── 4. MATCH — PDF AI Confirmation strategies ────────────────────────────────
  const matchAi = computeMatchAiConfirmation(allDigits, currentDigit);
  allSignals.push(buildSignal({
    ct: "DIGITMATCH", dir: "MATCH", entryDigit: matchAi.digit, ticks: matchAi.ticks, digit: matchAi.digit,
    baseConf: matchAi.confidence, risk: matchAi.confidence >= 70 ? "Medium" : matchAi.confidence >= 60 ? "High" : "Very High",
    strategy: matchAi.strategy,
    analyticsReason: matchAi.reason + (matchAi.strategies_triggered.length ? ` [${matchAi.strategies_triggered.length} strategy triggers]` : ""),
  }));
  // Also emit a signal for the statistically coldest digit (legacy fallback for coverage)
  const scoredDigits = Array.from({ length: 10 }, (_, d) => ({
    digit: d,
    recentPct: mkFreq(last10)[d].pct,
    fullPct:   fullFreq[d].pct,
    score:     mkFreq(last10)[d].pct * 0.60 + fullFreq[d].pct * 0.40,
  })).sort((a, b) => b.score - a.score);
  if (scoredDigits[0].digit !== matchAi.digit) {
    const fb = scoredDigits[0];
    const fbConf = Math.min(68, fb.score * 3 + (last5.includes(fb.digit) ? 5 : 0));
    allSignals.push(buildSignal({
      ct: "DIGITMATCH", dir: "MATCH", entryDigit: fb.digit, ticks: 1, digit: fb.digit,
      baseConf: fbConf, risk: "High",
      strategy: "Frequency Match Fallback",
      analyticsReason: `Match ${fb.digit}: ${fb.recentPct.toFixed(1)}% last-10 | ${fb.fullPct.toFixed(1)}% full`,
    }));
  }

  // ── 5. DIFFER — PDF AI Confirmation strategies ──────────────────────────────
  const differAi = computeDifferAiConfirmation(allDigits, currentDigit);
  allSignals.push(buildSignal({
    ct: "DIGITDIFF", dir: "DIFFER", entryDigit: differAi.digit, ticks: differAi.ticks, digit: differAi.digit,
    baseConf: differAi.confidence, risk: differAi.confidence >= 72 ? "Low" : differAi.confidence >= 60 ? "Medium" : "High",
    strategy: differAi.strategy,
    analyticsReason: differAi.reason + (differAi.strategies_triggered.length ? ` [${differAi.strategies_triggered.length} strategy triggers]` : ""),
  }));
  // Coldest digit differ as coverage fallback
  const worstRecent = scoredDigits[scoredDigits.length - 1];
  if (worstRecent.digit !== differAi.digit) {
    const absentInLast5 = !last5.includes(worstRecent.digit);
    const fallbackDiffConf = Math.min(65, (100 - worstRecent.recentPct) * 0.70 + (absentInLast5 ? 5 : 0));
    allSignals.push(buildSignal({
      ct: "DIGITDIFF", dir: "DIFFER", entryDigit: worstRecent.digit, ticks: 1, digit: worstRecent.digit,
      baseConf: fallbackDiffConf, risk: "Low",
      strategy: "Cold Digit Avoidance",
      analyticsReason: `Differ ${worstRecent.digit}: ${worstRecent.recentPct.toFixed(1)}% recent (cold) | absent last-5: ${absentInLast5}`,
    }));
  }

  // ── 6. RISE (CALL) ───────────────────────────────────────────────────────────
  const riseConf = Math.min(88, 50 + (up20Pct - 50) * 0.70 + (up10Pct > 60 ? 8 : up10Pct < 40 ? -5 : 0));
  allSignals.push(buildSignal({
    ct: "CALL", dir: "RISE", entryDigit: currentDigit, ticks: 5,
    baseConf: parseFloat(riseConf.toFixed(1)),
    risk: riseConf > 70 ? "Medium" : "Low",
    strategy: "Momentum Rise Psychology",
    analyticsReason: `Rise: up ${up20Pct.toFixed(0)}% of last-20 | ${up10Pct.toFixed(0)}% last-10`,
  }));

  // ── 7. FALL (PUT) ─────────────────────────────────────────────────────────────
  const fallConf = Math.min(88, 50 + (50 - up20Pct) * 0.70 + (up10Pct < 40 ? 8 : up10Pct > 60 ? -5 : 0));
  allSignals.push(buildSignal({
    ct: "PUT", dir: "FALL", entryDigit: currentDigit, ticks: 5,
    baseConf: parseFloat(fallConf.toFixed(1)),
    risk: fallConf > 70 ? "Medium" : "Low",
    strategy: "Momentum Fall Psychology",
    analyticsReason: `Fall: down ${(100 - up20Pct).toFixed(0)}% of last-20 | ${(100 - up10Pct).toFixed(0)}% last-10`,
  }));

  // ── Psychology gate: prefer signals where recent history favors winning ──────
  const favorable  = allSignals.filter((s) => s.psych_favors_win);
  const allSorted  = [...allSignals].sort((a, b) => b.confidence - a.confidence);
  // Return favorable signals first; fall back to all if none pass the gate
  const topSignals = (favorable.length > 0 ? [...favorable] : allSorted)
    .sort((a, b) => b.confidence - a.confidence)
    .slice(0, 12);

  const highSum = [6, 7, 8, 9].reduce((s, d) => s + fullFreq[d].pct, 0);
  const lowSum  = [0, 1, 2, 3].reduce((s, d) => s + fullFreq[d].pct, 0);
  const marketCondition = highSum > 44 ? "HIGH_PRESSURE" : lowSum > 44 ? "LOW_PRESSURE" : "BALANCED";

  return {
    symbol,
    signals: topSignals,
    all_signals: allSorted,
    market_condition: marketCondition,
    last_updated: now,
    current_digit: currentDigit,
    psychology_summary: {
      signals_favorable: favorable.length,
      signals_total: allSignals.length,
      psych_gated: favorable.length > 0,
    },
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

// ────────────────────────────────────────────────────────────────
//  Enhanced Tick Analysis — Rise/Fall · Only Up/Down · High/Low Tick
//  Uses Markov (2-state), lag-1 autocorrelation, run-length stats
// ────────────────────────────────────────────────────────────────
export interface EnhancedTickAnalysis {
  symbol: string;
  current_price: number;
  current_digit: number;
  sample_size: number;
  last_updated: string;
  markov: {
    current_state: string;
    p_up_given_up: number;
    p_down_given_up: number;
    p_up_given_down: number;
    p_down_given_down: number;
    predicted: string;
    confidence: number;
  };
  autocorrelation: { lag1: number; interpretation: string; signal: string };
  trend: { direction: string; up_pct: number; down_pct: number; volatility: number };
  rise_fall: {
    rise: { signal: string; confidence: number; duration: number; reasons: string[]; risk_level: string };
    fall: { signal: string; confidence: number; duration: number; reasons: string[]; risk_level: string };
  };
  only_up_down: {
    current_direction: string;
    current_streak: number;
    avg_up_run: number;
    avg_down_run: number;
    prob_extend: number;
    up_run_dist: Array<{ length: number; count: number; pct: number }>;
    down_run_dist: Array<{ length: number; count: number; pct: number }>;
    total_up_runs: number;
    total_down_runs: number;
    only_up: { signal: string; confidence: number; duration: number; reasons: string[]; risk_level: string };
    only_down: { signal: string; confidence: number; duration: number; reasons: string[]; risk_level: string };
  };
  high_low_tick: {
    high_tick_freq: Array<{ tick: number; count: number; pct: number }>;
    low_tick_freq: Array<{ tick: number; count: number; pct: number }>;
    best_high_tick: number;
    best_low_tick: number;
    worst_high_tick: number;
    worst_low_tick: number;
    total_windows: number;
    high_tick: { signal: string; confidence: number; tick_position: number; frequency_pct: number; reasons: string[] };
    low_tick: { signal: string; confidence: number; tick_position: number; frequency_pct: number; reasons: string[] };
  };
  recent_prices: number[];
  price_changes: string[];
}

export function computeEnhancedTickAnalysis(
  symbol: string,
  prices: number[],
  pipSize: number
): EnhancedTickAnalysis {
  const n = prices.length;
  const currentPrice = prices[n - 1] ?? 0;
  const currentDigit = extractLastDigit(currentPrice, pipSize);
  const now = new Date().toISOString();

  // ── 1. Direction sequence: 1=up, 0=down ──────────────────────
  const directions: number[] = [];
  for (let i = 1; i < n; i++) {
    directions.push(prices[i] >= prices[i - 1] ? 1 : 0);
  }

  // ── 2. Markov 2-state transition matrix ──────────────────────
  let uu = 0, ud = 0, du = 0, dd = 0;
  for (let i = 1; i < directions.length; i++) {
    const f = directions[i - 1], t = directions[i];
    if (f === 1 && t === 1) uu++;
    else if (f === 1 && t === 0) ud++;
    else if (f === 0 && t === 1) du++;
    else dd++;
  }
  const tU = uu + ud || 1, tD = du + dd || 1;
  const pUU = (uu / tU) * 100, pDU = (ud / tU) * 100;
  const pUD = (du / tD) * 100, pDD = (dd / tD) * 100;
  const lastDir = directions[directions.length - 1] ?? 0;
  const markovPred = lastDir === 1 ? (pUU >= 50 ? "UP" : "DOWN") : (pUD >= 50 ? "UP" : "DOWN");
  const markovConf = lastDir === 1 ? Math.max(pUU, pDU) : Math.max(pUD, pDD);

  // ── 3. Lag-1 autocorrelation ──────────────────────────────────
  const dMean = directions.reduce((a, b) => a + b, 0) / (directions.length || 1);
  const dVar = directions.reduce((a, b) => a + (b - dMean) ** 2, 0) / (directions.length || 1);
  let cov1 = 0;
  for (let i = 1; i < directions.length; i++) cov1 += (directions[i] - dMean) * (directions[i - 1] - dMean);
  cov1 /= (directions.length - 1 || 1);
  const r1 = dVar > 0 ? cov1 / dVar : 0;
  const autocorrInterp = r1 > 0.05 ? "trending" : r1 < -0.05 ? "mean_reverting" : "random";
  const autocorrSignal = autocorrInterp === "trending" ? "FOLLOW TREND" : autocorrInterp === "mean_reverting" ? "COUNTER TREND" : "NO EDGE";

  // ── 4. Run-length analysis ────────────────────────────────────
  type Run = { dir: number; length: number };
  const runs: Run[] = [];
  if (directions.length > 0) {
    let rDir = directions[0], rLen = 1;
    for (let i = 1; i < directions.length; i++) {
      if (directions[i] === rDir) { rLen++; }
      else { runs.push({ dir: rDir, length: rLen }); rDir = directions[i]; rLen = 1; }
    }
    runs.push({ dir: rDir, length: rLen });
  }
  const upRuns = runs.filter((r) => r.dir === 1).map((r) => r.length);
  const downRuns = runs.filter((r) => r.dir === 0).map((r) => r.length);

  const mkRunDist = (arr: number[]) =>
    Array.from({ length: 10 }, (_, i) => {
      const len = i + 1, cnt = arr.filter((l) => l === len).length;
      return { length: len, count: cnt, pct: arr.length > 0 ? parseFloat(((cnt / arr.length) * 100).toFixed(1)) : 0 };
    });

  const avgUp = upRuns.length > 0 ? upRuns.reduce((a, b) => a + b, 0) / upRuns.length : 0;
  const avgDn = downRuns.length > 0 ? downRuns.reduce((a, b) => a + b, 0) / downRuns.length : 0;

  let streak = 1;
  for (let i = directions.length - 2; i >= 0; i--) {
    if (directions[i] === lastDir) streak++;
    else break;
  }
  const relRuns = lastDir === 1 ? upRuns : downRuns;
  const probExtend = relRuns.length > 0 ? (relRuns.filter((l) => l > streak).length / relRuns.length) * 100 : 50;

  // ── 5. High/Low Tick position frequency (5-tick windows) ──────
  const WS = 5;
  const highCnt = new Array(WS).fill(0);
  const lowCnt = new Array(WS).fill(0);
  const totalWin = Math.floor((prices.length - 1) / WS);
  for (let w = 0; w < totalWin; w++) {
    const s = prices.length - 1 - (w + 1) * WS;
    if (s < 0) break;
    const win = prices.slice(s, s + WS);
    const mx = Math.max(...win), mn = Math.min(...win);
    highCnt[win.indexOf(mx)]++;
    lowCnt[win.indexOf(mn)]++;
  }
  const hiFreq = highCnt.map((c, i) => ({ tick: i + 1, count: c, pct: totalWin > 0 ? parseFloat(((c / totalWin) * 100).toFixed(1)) : 0 }));
  const loFreq = lowCnt.map((c, i) => ({ tick: i + 1, count: c, pct: totalWin > 0 ? parseFloat(((c / totalWin) * 100).toFixed(1)) : 0 }));
  const bestHi = hiFreq.reduce((a, b) => (b.pct > a.pct ? b : a));
  const bestLo = loFreq.reduce((a, b) => (b.pct > a.pct ? b : a));
  const worstHi = hiFreq.reduce((a, b) => (b.pct < a.pct ? b : a));
  const worstLo = loFreq.reduce((a, b) => (b.pct < a.pct ? b : a));

  // ── 6. Trend + momentum ───────────────────────────────────────
  const w20 = prices.slice(-20);
  const trendDir = w20[w20.length - 1] > w20[0] ? "UP" : "DOWN";
  const rng20 = Math.max(...w20) - Math.min(...w20);
  const avg20 = w20.reduce((a, b) => a + b, 0) / w20.length;
  const vol = (rng20 / avg20) * 100;
  const up20 = directions.slice(-20).filter((d) => d === 1).length;
  const upPct = directions.slice(-20).length > 0 ? (up20 / directions.slice(-20).length) * 100 : 50;

  // ── 7. Rise signal ────────────────────────────────────────────
  const riseReasons: string[] = [];
  let riseConf = 50;
  if (markovPred === "UP") { riseReasons.push(`Markov chain predicts UP — P(UP|${lastDir === 1 ? "UP" : "DOWN"}) = ${(lastDir === 1 ? pUU : pUD).toFixed(1)}%`); riseConf += (markovConf - 50) * 0.5; }
  if (r1 > 0.05 && lastDir === 1) { riseReasons.push(`Positive autocorrelation r=${r1.toFixed(3)} → trend persistence`); riseConf += 6; }
  if (trendDir === "UP") { riseReasons.push(`20-tick momentum: UPWARD (${upPct.toFixed(0)}% of moves were up)`); riseConf += 5; }
  if (upPct > 58) { riseReasons.push(`${upPct.toFixed(0)}% of recent ticks rose — bullish bias`); riseConf += 3; }
  if (markovPred === "DOWN") { riseReasons.push("Markov predicts DOWN — rise is counter-trend"); riseConf -= 8; }

  // ── 8. Fall signal ────────────────────────────────────────────
  const fallReasons: string[] = [];
  let fallConf = 50;
  if (markovPred === "DOWN") { fallReasons.push(`Markov chain predicts DOWN — P(DOWN|${lastDir === 1 ? "UP" : "DOWN"}) = ${(lastDir === 1 ? pDU : pDD).toFixed(1)}%`); fallConf += (markovConf - 50) * 0.5; }
  if (r1 < -0.05 && lastDir === 1) { fallReasons.push(`Negative autocorrelation r=${r1.toFixed(3)} → mean reversion after up`); fallConf += 6; }
  if (trendDir === "DOWN") { fallReasons.push(`20-tick momentum: DOWNWARD (${(100 - upPct).toFixed(0)}% of moves fell)`); fallConf += 5; }
  if (upPct < 42) { fallReasons.push(`Only ${upPct.toFixed(0)}% of recent ticks rose — bearish bias`); fallConf += 3; }
  if (markovPred === "UP") { fallReasons.push("Markov predicts UP — fall is counter-trend"); fallConf -= 8; }

  riseConf = parseFloat(Math.min(88, Math.max(33, riseConf)).toFixed(1));
  fallConf = parseFloat(Math.min(88, Math.max(33, fallConf)).toFixed(1));

  // ── 9. Only Up/Down signals ───────────────────────────────────
  let onlyUpConf = 45 + (lastDir === 1 ? 8 : -8) + (r1 > 0.1 ? 8 : 0) + (trendDir === "UP" ? 5 : 0) + (streak >= 3 && lastDir === 1 ? -12 : 0);
  let onlyDnConf = 45 + (lastDir === 0 ? 8 : -8) + (r1 > 0.1 ? 8 : 0) + (trendDir === "DOWN" ? 5 : 0) + (streak >= 3 && lastDir === 0 ? -12 : 0);
  onlyUpConf = parseFloat(Math.min(84, Math.max(28, onlyUpConf)).toFixed(1));
  onlyDnConf = parseFloat(Math.min(84, Math.max(28, onlyDnConf)).toFixed(1));

  // ── 10. High/Low Tick signal confidence ───────────────────────
  const hiConf = parseFloat(Math.min(80, bestHi.pct * 1.2 + (trendDir === "UP" ? 4 : 0)).toFixed(1));
  const loConf = parseFloat(Math.min(80, bestLo.pct * 1.2 + (trendDir === "DOWN" ? 4 : 0)).toFixed(1));

  return {
    symbol,
    current_price: currentPrice,
    current_digit: currentDigit,
    sample_size: n,
    last_updated: now,
    markov: {
      current_state: lastDir === 1 ? "UP" : "DOWN",
      p_up_given_up: parseFloat(pUU.toFixed(1)),
      p_down_given_up: parseFloat(pDU.toFixed(1)),
      p_up_given_down: parseFloat(pUD.toFixed(1)),
      p_down_given_down: parseFloat(pDD.toFixed(1)),
      predicted: markovPred,
      confidence: parseFloat(markovConf.toFixed(1)),
    },
    autocorrelation: { lag1: parseFloat(r1.toFixed(4)), interpretation: autocorrInterp, signal: autocorrSignal },
    trend: {
      direction: trendDir,
      up_pct: parseFloat(upPct.toFixed(1)),
      down_pct: parseFloat((100 - upPct).toFixed(1)),
      volatility: parseFloat(vol.toFixed(3)),
    },
    rise_fall: {
      rise: { signal: riseConf > 55 ? "BUY RISE" : "WAIT", confidence: riseConf, duration: riseConf > 70 ? 3 : 5, reasons: riseReasons.length > 0 ? riseReasons : ["Insufficient trend signal"], risk_level: riseConf > 70 ? "Medium" : "Low" },
      fall: { signal: fallConf > 55 ? "BUY FALL" : "WAIT", confidence: fallConf, duration: fallConf > 70 ? 3 : 5, reasons: fallReasons.length > 0 ? fallReasons : ["Insufficient trend signal"], risk_level: fallConf > 70 ? "Medium" : "Low" },
    },
    only_up_down: {
      current_direction: lastDir === 1 ? "UP" : "DOWN",
      current_streak: streak,
      avg_up_run: parseFloat(avgUp.toFixed(2)),
      avg_down_run: parseFloat(avgDn.toFixed(2)),
      prob_extend: parseFloat(probExtend.toFixed(1)),
      up_run_dist: mkRunDist(upRuns),
      down_run_dist: mkRunDist(downRuns),
      total_up_runs: upRuns.length,
      total_down_runs: downRuns.length,
      only_up: {
        signal: lastDir === 1 && onlyUpConf > 52 ? "BUY ONLY UP" : "WAIT",
        confidence: onlyUpConf, duration: 3,
        reasons: [
          `Streak: ${streak} consecutive ${lastDir === 1 ? "UP" : "DOWN"}`,
          `Avg up-run: ${avgUp.toFixed(1)} ticks | Prob. extend: ${probExtend.toFixed(1)}%`,
          autocorrInterp === "trending" ? "Autocorrelation r=" + r1.toFixed(3) + " — trend persistence detected" : "No autocorrelation edge",
        ],
        risk_level: "High",
      },
      only_down: {
        signal: lastDir === 0 && onlyDnConf > 52 ? "BUY ONLY DOWN" : "WAIT",
        confidence: onlyDnConf, duration: 3,
        reasons: [
          `Streak: ${streak} consecutive ${lastDir === 0 ? "DOWN" : "UP"}`,
          `Avg down-run: ${avgDn.toFixed(1)} ticks | Prob. extend: ${probExtend.toFixed(1)}%`,
          autocorrInterp === "mean_reverting" ? "Mean-reverting regime — caution for ONLY DOWN" : "r=" + r1.toFixed(3),
        ],
        risk_level: "High",
      },
    },
    high_low_tick: {
      high_tick_freq: hiFreq,
      low_tick_freq: loFreq,
      best_high_tick: bestHi.tick,
      best_low_tick: bestLo.tick,
      worst_high_tick: worstHi.tick,
      worst_low_tick: worstLo.tick,
      total_windows: totalWin,
      high_tick: {
        signal: `HIGH TICK AT ${bestHi.tick}`,
        confidence: hiConf,
        tick_position: bestHi.tick,
        frequency_pct: bestHi.pct,
        reasons: [
          `Tick ${bestHi.tick} is the highest ${bestHi.pct}% of 5-tick windows (${bestHi.count} / ${totalWin})`,
          trendDir === "UP" ? "Uptrend → peak tends to appear later in the window" : "Downtrend → peak tends to appear earlier",
          `Avoid tick ${worstHi.tick}: lowest high-tick frequency at ${worstHi.pct}%`,
        ],
      },
      low_tick: {
        signal: `LOW TICK AT ${bestLo.tick}`,
        confidence: loConf,
        tick_position: bestLo.tick,
        frequency_pct: bestLo.pct,
        reasons: [
          `Tick ${bestLo.tick} is the lowest ${bestLo.pct}% of 5-tick windows (${bestLo.count} / ${totalWin})`,
          trendDir === "DOWN" ? "Downtrend → trough tends to appear later" : "Uptrend → trough tends to appear earlier",
          `Avoid tick ${worstLo.tick}: lowest low-tick frequency at ${worstLo.pct}%`,
        ],
      },
    },
    recent_prices: prices.slice(-30),
    price_changes: directions.slice(-50).map((d) => (d === 1 ? "UP" : "DOWN")),
  };
}
