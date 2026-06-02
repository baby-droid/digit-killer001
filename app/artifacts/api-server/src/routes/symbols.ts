import { Router, type IRouter } from "express";
import { fetchActiveSymbols } from "../lib/deriv";

const router: IRouter = Router();

let cachedSymbols: unknown[] = [];
let symbolsCacheTime = 0;
const SYMBOLS_TTL = 60000; // 1 minute

router.get("/active-symbols", async (req, res): Promise<void> => {
  try {
    const now = Date.now();
    if (cachedSymbols.length && now - symbolsCacheTime < SYMBOLS_TTL) {
      res.json(cachedSymbols);
      return;
    }
    const symbols = await fetchActiveSymbols();
    cachedSymbols = symbols;
    symbolsCacheTime = now;
    res.json(symbols);
  } catch (err) {
    req.log.error({ err }, "Failed to fetch active symbols");
    // Return fallback symbols if API fails
    res.json([
      { symbol: "R_10", display_name: "Volatility 10 Index", market: "synthetic_index", submarket: "random_index", is_open: 1, pip_size: 3 },
      { symbol: "R_25", display_name: "Volatility 25 Index", market: "synthetic_index", submarket: "random_index", is_open: 1, pip_size: 3 },
      { symbol: "R_50", display_name: "Volatility 50 Index", market: "synthetic_index", submarket: "random_index", is_open: 1, pip_size: 4 },
      { symbol: "R_75", display_name: "Volatility 75 Index", market: "synthetic_index", submarket: "random_index", is_open: 1, pip_size: 4 },
      { symbol: "R_100", display_name: "Volatility 100 Index", market: "synthetic_index", submarket: "random_index", is_open: 1, pip_size: 2 },
      { symbol: "1HZ10V", display_name: "Volatility 10 (1s) Index", market: "synthetic_index", submarket: "random_index", is_open: 1, pip_size: 3 },
      { symbol: "1HZ25V", display_name: "Volatility 25 (1s) Index", market: "synthetic_index", submarket: "random_index", is_open: 1, pip_size: 3 },
      { symbol: "1HZ50V", display_name: "Volatility 50 (1s) Index", market: "synthetic_index", submarket: "random_index", is_open: 1, pip_size: 4 },
      { symbol: "1HZ75V", display_name: "Volatility 75 (1s) Index", market: "synthetic_index", submarket: "random_index", is_open: 1, pip_size: 4 },
      { symbol: "1HZ100V", display_name: "Volatility 100 (1s) Index", market: "synthetic_index", submarket: "random_index", is_open: 1, pip_size: 2 },
      { symbol: "CRASH300N", display_name: "Crash 300 Index", market: "synthetic_index", submarket: "crash_index", is_open: 1, pip_size: 4 },
      { symbol: "CRASH500", display_name: "Crash 500 Index", market: "synthetic_index", submarket: "crash_index", is_open: 1, pip_size: 4 },
      { symbol: "CRASH1000", display_name: "Crash 1000 Index", market: "synthetic_index", submarket: "crash_index", is_open: 1, pip_size: 4 },
      { symbol: "BOOM300N", display_name: "Boom 300 Index", market: "synthetic_index", submarket: "boom_index", is_open: 1, pip_size: 4 },
      { symbol: "BOOM500", display_name: "Boom 500 Index", market: "synthetic_index", submarket: "boom_index", is_open: 1, pip_size: 4 },
      { symbol: "BOOM1000", display_name: "Boom 1000 Index", market: "synthetic_index", submarket: "boom_index", is_open: 1, pip_size: 4 },
      { symbol: "JD10", display_name: "Jump 10 Index", market: "synthetic_index", submarket: "jump_index", is_open: 1, pip_size: 2 },
      { symbol: "JD25", display_name: "Jump 25 Index", market: "synthetic_index", submarket: "jump_index", is_open: 1, pip_size: 2 },
      { symbol: "JD50", display_name: "Jump 50 Index", market: "synthetic_index", submarket: "jump_index", is_open: 1, pip_size: 2 },
      { symbol: "JD75", display_name: "Jump 75 Index", market: "synthetic_index", submarket: "jump_index", is_open: 1, pip_size: 2 },
      { symbol: "JD100", display_name: "Jump 100 Index", market: "synthetic_index", submarket: "jump_index", is_open: 1, pip_size: 2 },
    ]);
  }
});

export default router;
