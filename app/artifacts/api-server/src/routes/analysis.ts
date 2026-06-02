import { Router, type IRouter } from "express";
import { fetchTickHistory, analyseDigits, extractLastDigit, getDigitPipSize } from "../lib/deriv";
import {
  computeOverUnderSignals,
  computeEvenOddAnalysis,
  computeMatchDifferSignals,
  computeTickContracts,
  computeAiSignals,
  computeStrategySignal,
  computeEnhancedTickAnalysis,
  computeDigitPsychology,
} from "../lib/analysis";

const router: IRouter = Router();

router.get("/digit-analysis", async (req, res): Promise<void> => {
  const symbol = req.query.symbol as string;
  const count = Math.min(5000, Math.max(10, parseInt(req.query.count as string) || 1000));

  if (!symbol) {
    res.status(400).json({ error: "symbol is required" });
    return;
  }

  try {
    const pipSize = getDigitPipSize(symbol);
    const prices = await fetchTickHistory(symbol, count);

    if (!prices.length) {
      res.status(404).json({ error: "No tick data available for symbol" });
      return;
    }

    const digits = analyseDigits(prices, pipSize);
    const currentPrice = prices[prices.length - 1];
    const currentDigit = extractLastDigit(currentPrice, pipSize);
    const mostFrequent = digits.reduce((a, b) => (b.count > a.count ? b : a)).digit;
    const leastFrequent = digits.reduce((a, b) => (b.count < a.count ? b : a)).digit;

    const evenDigits = [0, 2, 4, 6, 8];
    const evenCount = digits.filter((d) => evenDigits.includes(d.digit)).reduce((s, d) => s + d.count, 0);
    const oddCount = prices.length - evenCount;

    res.json({
      symbol,
      count: prices.length,
      digits,
      current_digit: currentDigit,
      most_frequent: mostFrequent,
      least_frequent: leastFrequent,
      current_price: currentPrice,
      even_count: evenCount,
      odd_count: oddCount,
      even_pct: parseFloat(((evenCount / prices.length) * 100).toFixed(1)),
      odd_pct: parseFloat(((oddCount / prices.length) * 100).toFixed(1)),
    });
  } catch (err) {
    req.log.error({ err, symbol }, "digit-analysis error");
    res.status(500).json({ error: "Failed to fetch analysis" });
  }
});

router.get("/wide-eye-analysis", async (req, res): Promise<void> => {
  const symbol = req.query.symbol as string;
  const customCount = Math.min(500, Math.max(10, parseInt(req.query.count as string) || 100));

  if (!symbol) {
    res.status(400).json({ error: "symbol is required" });
    return;
  }

  try {
    const pipSize = getDigitPipSize(symbol);
    const prices1000 = await fetchTickHistory(symbol, 1000);

    if (!prices1000.length) {
      res.status(404).json({ error: "No tick data" });
      return;
    }

    const currentPrice = prices1000[prices1000.length - 1];
    const currentDigit = extractLastDigit(currentPrice, pipSize);

    // 1000-tick D-circle
    const digits1000 = analyseDigits(prices1000, pipSize);
    const sorted1000 = [...digits1000].sort((a, b) => b.percentage - a.percentage);
    const dCircle1000 = {
      symbol,
      count: prices1000.length,
      digits: digits1000,
      current_digit: currentDigit,
      green_arc: sorted1000[0].digit,
      blue_arc: sorted1000[1].digit,
      red_arc: sorted1000[sorted1000.length - 1].digit,
      yellow_arc: sorted1000[sorted1000.length - 2].digit,
      current_price: currentPrice,
    };

    // Custom count D-circle
    const pricesCustom = prices1000.slice(-customCount);
    const digitsCustom = analyseDigits(pricesCustom, pipSize);
    const sortedCustom = [...digitsCustom].sort((a, b) => b.percentage - a.percentage);
    const dCircleCustom = {
      symbol,
      count: pricesCustom.length,
      digits: digitsCustom,
      current_digit: currentDigit,
      green_arc: sortedCustom[0].digit,
      blue_arc: sortedCustom[1].digit,
      red_arc: sortedCustom[sortedCustom.length - 1].digit,
      yellow_arc: sortedCustom[sortedCustom.length - 2].digit,
      current_price: currentPrice,
    };

    // Over/under summary at threshold 5
    const threshold = 5;
    const digitsList = prices1000.map((p) => extractLastDigit(p, pipSize));
    const underCount = digitsList.filter((d) => d < threshold).length;
    const overCount = digitsList.filter((d) => d > threshold).length;
    const equalCount = digitsList.filter((d) => d === threshold).length;
    const total = digitsList.length;

    const overUnder = {
      threshold,
      under_count: underCount,
      over_count: overCount,
      equal_count: equalCount,
      under_pct: parseFloat(((underCount / total) * 100).toFixed(1)),
      over_pct: parseFloat(((overCount / total) * 100).toFixed(1)),
      equal_pct: parseFloat(((equalCount / total) * 100).toFixed(1)),
    };

    // Even/odd summary
    const evenDigits = [0, 2, 4, 6, 8];
    const evenCount = digitsList.filter((d) => evenDigits.includes(d)).length;
    const oddCount = total - evenCount;

    const evenOdd = {
      even_count: evenCount,
      odd_count: oddCount,
      even_pct: parseFloat(((evenCount / total) * 100).toFixed(1)),
      odd_pct: parseFloat(((oddCount / total) * 100).toFixed(1)),
      current_digit: currentDigit,
    };

    // Rolling digits array for live stream view
    const rolling = digitsList.slice(-customCount);

    res.json({
      symbol,
      d_circle_1000: dCircle1000,
      d_circle_custom: dCircleCustom,
      custom_count: customCount,
      over_under: overUnder,
      even_odd: evenOdd,
      current_price: currentPrice,
      rolling_digits: rolling,
      digits_1000: digitsList,
    });
  } catch (err) {
    req.log.error({ err, symbol }, "wide-eye-analysis error");
    res.status(500).json({ error: "Failed to fetch wide eye analysis" });
  }
});

router.get("/over-under-signals", async (req, res): Promise<void> => {
  const symbol = req.query.symbol as string;
  const count = Math.min(5000, Math.max(100, parseInt(req.query.count as string) || 1000));

  if (!symbol) {
    res.status(400).json({ error: "symbol is required" });
    return;
  }

  try {
    const pipSize = getDigitPipSize(symbol);
    const prices = await fetchTickHistory(symbol, count);

    if (!prices.length) {
      res.status(404).json({ error: "No tick data" });
      return;
    }

    const digits = analyseDigits(prices, pipSize);
    const raw = computeOverUnderSignals(digits, prices, pipSize);

    // Augment each entry with digit psychology
    const entriesWithPsych = (raw.entries ?? []).map((entry: Record<string, unknown>) => {
      const ct = (entry.direction as string) === "OVER" ? "DIGITOVER" : "DIGITUNDER";
      const barrier = entry.entry_digit as number | undefined;
      const psych = computeDigitPsychology(prices, pipSize, ct, barrier);
      return {
        ...entry,
        psych_score: psych.psych_score,
        psych_favors_win: psych.favors_win,
        psych_win_rate_10: psych.win_rate_10,
        psych_win_rate_5: psych.win_rate_5,
        psych_streak: psych.streak,
        psych_momentum: psych.momentum,
        psych_reason: psych.reason,
      };
    });

    // Top-level best-entry psychology
    const bestEntryDir = raw.recommendation === "OVER" ? "DIGITOVER" : "DIGITUNDER";
    const bestBarrier  = raw.recommendation === "OVER" ? raw.best_over_barrier : raw.best_under_barrier;
    const overallPsych = computeDigitPsychology(prices, pipSize, bestEntryDir, bestBarrier as number | undefined);

    res.json({
      symbol, digits,
      ...raw,
      entries: entriesWithPsych,
      psych_score: overallPsych.psych_score,
      psych_favors_win: overallPsych.favors_win,
      psych_win_rate_10: overallPsych.win_rate_10,
      psych_streak: overallPsych.streak,
      psych_momentum: overallPsych.momentum,
    });
  } catch (err) {
    req.log.error({ err, symbol }, "over-under-signals error");
    res.status(500).json({ error: "Failed to fetch over/under signals" });
  }
});

router.get("/even-odd-analysis", async (req, res): Promise<void> => {
  const symbol = req.query.symbol as string;
  const count = Math.min(5000, Math.max(10, parseInt(req.query.count as string) || 1000));

  if (!symbol) {
    res.status(400).json({ error: "symbol is required" });
    return;
  }

  try {
    const pipSize = getDigitPipSize(symbol);
    const prices = await fetchTickHistory(symbol, count);

    if (!prices.length) {
      res.status(404).json({ error: "No tick data" });
      return;
    }

    const result = computeEvenOddAnalysis(prices, pipSize);
    const evenPsych = computeDigitPsychology(prices, pipSize, "DIGITEVEN");
    const oddPsych  = computeDigitPsychology(prices, pipSize, "DIGITODD");
    res.json({
      symbol, ...result,
      even_psychology: {
        psych_score: evenPsych.psych_score,
        favors_win: evenPsych.favors_win,
        win_rate_10: evenPsych.win_rate_10,
        win_rate_5: evenPsych.win_rate_5,
        streak: evenPsych.streak,
        momentum: evenPsych.momentum,
        reason: evenPsych.reason,
      },
      odd_psychology: {
        psych_score: oddPsych.psych_score,
        favors_win: oddPsych.favors_win,
        win_rate_10: oddPsych.win_rate_10,
        win_rate_5: oddPsych.win_rate_5,
        streak: oddPsych.streak,
        momentum: oddPsych.momentum,
        reason: oddPsych.reason,
      },
    });
  } catch (err) {
    req.log.error({ err, symbol }, "even-odd-analysis error");
    res.status(500).json({ error: "Failed to fetch even/odd analysis" });
  }
});

router.get("/match-differ-signals", async (req, res): Promise<void> => {
  const symbol = req.query.symbol as string;
  const count = Math.min(5000, Math.max(10, parseInt(req.query.count as string) || 1000));

  if (!symbol) {
    res.status(400).json({ error: "symbol is required" });
    return;
  }

  try {
    const pipSize = getDigitPipSize(symbol);
    const prices = await fetchTickHistory(symbol, count);

    if (!prices.length) {
      res.status(404).json({ error: "No tick data" });
      return;
    }

    const digits = analyseDigits(prices, pipSize);
    const signals = computeMatchDifferSignals(digits, prices, pipSize);

    // Augment best match and differ with psychology
    const bestMatch  = (signals as Record<string, unknown>).best_match_digit as number | undefined;
    const bestDiffer = (signals as Record<string, unknown>).best_differ_digit as number | undefined;
    const matchPsych  = bestMatch  !== undefined ? computeDigitPsychology(prices, pipSize, "DIGITMATCH",  undefined, bestMatch)  : null;
    const differPsych = bestDiffer !== undefined ? computeDigitPsychology(prices, pipSize, "DIGITDIFF", undefined, bestDiffer) : null;

    res.json({
      symbol, digits, ...signals,
      match_psychology:  matchPsych  ? { psych_score: matchPsych.psych_score,  favors_win: matchPsych.favors_win,  win_rate_10: matchPsych.win_rate_10,  win_rate_5: matchPsych.win_rate_5,  streak: matchPsych.streak,  momentum: matchPsych.momentum,  reason: matchPsych.reason  } : null,
      differ_psychology: differPsych ? { psych_score: differPsych.psych_score, favors_win: differPsych.favors_win, win_rate_10: differPsych.win_rate_10, win_rate_5: differPsych.win_rate_5, streak: differPsych.streak, momentum: differPsych.momentum, reason: differPsych.reason } : null,
    });
  } catch (err) {
    req.log.error({ err, symbol }, "match-differ-signals error");
    res.status(500).json({ error: "Failed to fetch match/differ signals" });
  }
});

router.get("/tick-contracts", async (req, res): Promise<void> => {
  const symbol = req.query.symbol as string;
  const count = Math.min(5000, Math.max(20, parseInt(req.query.count as string) || 1000));

  if (!symbol) {
    res.status(400).json({ error: "symbol is required" });
    return;
  }

  try {
    const pipSize = getDigitPipSize(symbol);
    const prices = await fetchTickHistory(symbol, count);

    if (!prices.length) {
      res.status(404).json({ error: "No tick data" });
      return;
    }

    const result = computeTickContracts(prices, pipSize);
    res.json({ symbol, ...result });
  } catch (err) {
    req.log.error({ err, symbol }, "tick-contracts error");
    res.status(500).json({ error: "Failed to fetch tick contracts" });
  }
});

router.get("/ai-signals", async (req, res): Promise<void> => {
  const symbol = req.query.symbol as string;

  if (!symbol) {
    res.status(400).json({ error: "symbol is required" });
    return;
  }

  try {
    const pipSize = getDigitPipSize(symbol);
    const prices = await fetchTickHistory(symbol, 1000);

    if (!prices.length) {
      res.status(404).json({ error: "No tick data" });
      return;
    }

    const digits = analyseDigits(prices, pipSize);
    const result = computeAiSignals(symbol, digits, prices, pipSize);
    res.json(result);
  } catch (err) {
    req.log.error({ err, symbol }, "ai-signals error");
    res.status(500).json({ error: "Failed to fetch AI signals" });
  }
});

router.get("/enhanced-tick-analysis", async (req, res): Promise<void> => {
  const symbol = req.query.symbol as string;
  const count = Math.min(1000, Math.max(100, parseInt(req.query.count as string) || 500));
  if (!symbol) { res.status(400).json({ error: "symbol is required" }); return; }
  try {
    const pipSize = getDigitPipSize(symbol);
    const prices = await fetchTickHistory(symbol, count);
    if (!prices.length) { res.status(404).json({ error: "No tick data" }); return; }
    const result = computeEnhancedTickAnalysis(symbol, prices, pipSize);

    // Add psychology to each trade signal in the enhanced analysis
    const risePsych    = computeDigitPsychology(prices, pipSize, "CALL");
    const fallPsych    = computeDigitPsychology(prices, pipSize, "PUT");
    const onlyUpPsych  = computeDigitPsychology(prices, pipSize, "CALL");
    const onlyDnPsych  = computeDigitPsychology(prices, pipSize, "PUT");

    res.json({
      ...result,
      rise_fall: {
        rise: {
          ...result.rise_fall.rise,
          psych_score: risePsych.psych_score,
          psych_favors_win: risePsych.favors_win,
          psych_win_rate_10: risePsych.win_rate_10,
          psych_win_rate_5: risePsych.win_rate_5,
          psych_streak: risePsych.streak,
          psych_momentum: risePsych.momentum,
          psych_reason: risePsych.reason,
        },
        fall: {
          ...result.rise_fall.fall,
          psych_score: fallPsych.psych_score,
          psych_favors_win: fallPsych.favors_win,
          psych_win_rate_10: fallPsych.win_rate_10,
          psych_win_rate_5: fallPsych.win_rate_5,
          psych_streak: fallPsych.streak,
          psych_momentum: fallPsych.momentum,
          psych_reason: fallPsych.reason,
        },
      },
      only_up_down: {
        ...result.only_up_down,
        only_up: {
          ...result.only_up_down.only_up,
          psych_score: onlyUpPsych.psych_score,
          psych_favors_win: onlyUpPsych.favors_win,
          psych_win_rate_10: onlyUpPsych.win_rate_10,
          psych_streak: onlyUpPsych.streak,
        },
        only_down: {
          ...result.only_up_down.only_down,
          psych_score: onlyDnPsych.psych_score,
          psych_favors_win: onlyDnPsych.favors_win,
          psych_win_rate_10: onlyDnPsych.win_rate_10,
          psych_streak: onlyDnPsych.streak,
        },
      },
    });
  } catch (err) {
    req.log.error({ err, symbol }, "enhanced-tick-analysis error");
    res.status(500).json({ error: "Failed to compute enhanced tick analysis" });
  }
});

router.get("/generate-strategy", async (req, res): Promise<void> => {
  const symbol = req.query.symbol as string;
  const contractType = (req.query.contract_type as string)?.toUpperCase();
  const barrier = req.query.barrier ? parseFloat(req.query.barrier as string) : undefined;
  const digit = req.query.digit !== undefined ? parseInt(req.query.digit as string) : undefined;
  const count = Math.min(1000, Math.max(50, parseInt(req.query.count as string) || 500));

  if (!symbol) { res.status(400).json({ error: "symbol is required" }); return; }
  if (!contractType) { res.status(400).json({ error: "contract_type is required" }); return; }

  try {
    const pipSize = getDigitPipSize(symbol);
    const prices = await fetchTickHistory(symbol, count);
    if (!prices.length) { res.status(404).json({ error: "No tick data" }); return; }
    const result = computeStrategySignal(symbol, contractType, prices, pipSize, barrier, digit);
    res.json(result);
  } catch (err) {
    req.log.error({ err, symbol, contractType }, "generate-strategy error");
    res.status(500).json({ error: "Failed to generate strategy" });
  }
});

export default router;
