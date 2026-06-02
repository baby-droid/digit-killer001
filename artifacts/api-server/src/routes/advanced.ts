import { Router, type IRouter } from "express";
import { fetchTickHistory, analyseDigits, getDigitPipSize } from "../lib/deriv";
import { computeAdvancedAnalysis } from "../lib/ml";

const router: IRouter = Router();

router.get("/advanced-analysis", async (req, res): Promise<void> => {
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
      res.status(404).json({ error: "No tick data available for symbol" });
      return;
    }

    const result = computeAdvancedAnalysis(prices, pipSize, symbol);
    res.json(result);
  } catch (err) {
    req.log.error({ err, symbol }, "advanced-analysis error");
    res.status(500).json({ error: "Failed to compute advanced analysis" });
  }
});

// Report endpoint — returns full combined analysis package
router.get("/report", async (req, res): Promise<void> => {
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
    const advanced = computeAdvancedAnalysis(prices, pipSize, symbol);

    const currentPrice = prices[prices.length - 1];

    const { symbol: _s, sample_size: _ss, ...advancedRest } = advanced;
    res.json({
      symbol,
      current_price: currentPrice,
      sample_size: prices.length,
      generated_at: new Date().toISOString(),
      digit_distribution: digits,
      ...advancedRest,
      summary: {
        most_frequent: digits.reduce((a, b) => (b.count > a.count ? b : a)).digit,
        least_frequent: digits.reduce((a, b) => (b.count < a.count ? b : a)).digit,
        regime: advanced.hurst.regime,
        hurst: advanced.hurst.hurst,
        has_pattern: advanced.autocorrelation.has_pattern,
        top_signal: advanced.ensemble_signals[0] ?? null,
        signal_count: advanced.ensemble_signals.length,
      },
    });
  } catch (err) {
    req.log.error({ err, symbol }, "report error");
    res.status(500).json({ error: "Failed to generate report" });
  }
});

export default router;
