/**
 * Tick Confirmation Logic
 * Analyses recent last-digit history to recommend the best tick duration.
 *
 *  Even / Odd     → 1T default; only go 2T if 1T historically underperforms
 *  Over 0/Under 9 → 2-3T confirmation (extreme-barrier safety)
 *  Other Over/Under → 1-3T based on simulated recent win rate
 *  Match / Differ → 1T default
 */

function wouldWin(
  digit: number,
  contractType: string,
  barrier: number | undefined,
): boolean {
  switch (contractType) {
    case "DIGITEVEN":  return digit % 2 === 0;
    case "DIGITODD":   return digit % 2 !== 0;
    case "DIGITOVER":  return barrier !== undefined ? digit > barrier : false;
    case "DIGITUNDER": return barrier !== undefined ? digit < barrier : false;
    case "DIGITMATCH": return digit === barrier;
    case "DIGITDIFF":  return digit !== barrier;
    default:           return false;
  }
}

/**
 * Simulate historical win rate for N-tick contracts on a recent digit sequence.
 * Treats each position in `digits` as a potential contract entry point; the exit
 * digit is at position i + (n-1).
 */
function simulateWinRate(
  n: number,
  digits: number[],
  contractType: string,
  barrier: number | undefined,
): number {
  let wins = 0;
  let count = 0;
  for (let i = 0; i + n - 1 < digits.length; i++) {
    if (wouldWin(digits[i + n - 1], contractType, barrier)) wins++;
    count++;
  }
  return count > 0 ? wins / count : 0.5;
}

/**
 * Compute the recommended tick duration based on contract type, barrier, and
 * recent digit history.  Returns 1, 2, or 3.
 *
 * @param contractType  Deriv contract type (DIGITEVEN, DIGITOVER, etc.)
 * @param barrier       Barrier / digit for the contract
 * @param recentDigits  Recent last-digit sequence, newest LAST
 */
export function computeSmartTicks(
  contractType: string,
  barrier: number | undefined,
  recentDigits: number[],
): number {
  const DIGIT_TYPES = [
    "DIGITEVEN","DIGITODD","DIGITOVER","DIGITUNDER","DIGITMATCH","DIGITDIFF",
  ];
  if (!DIGIT_TYPES.includes(contractType)) return 1;

  if (recentDigits.length < 2) {
    if (contractType === "DIGITEVEN" || contractType === "DIGITODD") return 1;
    if (
      (contractType === "DIGITOVER"  && (barrier ?? 99) <= 0) ||
      (contractType === "DIGITUNDER" && (barrier ?? 0)  >= 9)
    ) return 2;
    return 1;
  }

  // ── Even / Odd — fast contracts, prefer 1T ──────────────────────────────
  if (contractType === "DIGITEVEN" || contractType === "DIGITODD") {
    const wr1 = simulateWinRate(1, recentDigits, contractType, barrier);
    if (recentDigits.length < 3) return 1;
    const wr2 = simulateWinRate(2, recentDigits, contractType, barrier);
    // Only switch to 2T if it's meaningfully better (>5 ppt improvement)
    return wr2 > wr1 + 0.05 ? 2 : 1;
  }

  // ── Extreme barriers: Over 0 / Under 9 — always 2-3T ───────────────────
  const isExtreme =
    (contractType === "DIGITOVER"  && (barrier ?? 99) === 0) ||
    (contractType === "DIGITUNDER" && (barrier ?? 0)  === 9);

  if (isExtreme) {
    if (recentDigits.length < 3) return 2;
    const wr2 = simulateWinRate(2, recentDigits, contractType, barrier);
    const wr3 = simulateWinRate(3, recentDigits, contractType, barrier);
    return wr2 >= wr3 ? 2 : 3;
  }

  // ── General Over / Under / Match / Differ — pick best of 1-3T ──────────
  const wr1 = simulateWinRate(1, recentDigits, contractType, barrier);
  const wr2 = recentDigits.length >= 2 ? simulateWinRate(2, recentDigits, contractType, barrier) : 0;
  const wr3 = recentDigits.length >= 3 ? simulateWinRate(3, recentDigits, contractType, barrier) : 0;

  const best = Math.max(wr1, wr2, wr3);
  if (wr1 === best) return 1;
  if (wr2 === best) return 2;
  return 3;
}
