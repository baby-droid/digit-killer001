import { Router, type IRouter } from "express";
import { fetchTickHistory, analyseDigits, extractLastDigit, getDigitPipSize } from "../lib/deriv";
import {
  computeOverUnderSignals,
  computeEvenOddAnalysis,
  computeMatchDifferSignals,
  computeTickContracts,
  computeAiSignals,
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

    res.json({
      symbol,
      d_circle_1000: dCircle1000,
      d_circle_custom: dCircleCustom,
      custom_count: customCount,
      over_under: overUnder,
      even_odd: evenOdd,
      current_price: currentPrice,
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
    const signals = computeOverUnderSignals(digits, prices, pipSize);

    res.json({ symbol, digits, ...signals });
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
    res.json({ symbol, ...result });
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
    res.json({ symbol, digits, ...signals });
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

export default router;
