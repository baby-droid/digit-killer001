import WebSocket from "ws";
import { logger } from "./logger";
import {
  ensureSubscribed,
  getStreamBuffer,
  getSymbolPipSize,
} from "./tickStream";

const DERIV_WS_URL = "wss://ws.binaryws.com/websockets/v3?app_id=1089";

interface DerivMessage {
  msg_type: string;
  [key: string]: unknown;
}

interface TickData {
  epoch: number;
  quote: number;
  symbol: string;
  pip_size: number;
}

interface HistoryResponse {
  prices: number[];
  times: number[];
}

interface ActiveSymbol {
  symbol: string;
  display_name: string;
  market: string;
  submarket: string;
  is_open: number;
  pip_size: number;
}

// Cache for tick history per symbol
const tickCache = new Map<string, number[]>();
const CACHE_TTL = 1500; // 1.5 seconds — keep fresh for real-time feel
const cacheTimestamps = new Map<string, number>();

function createWsConnection(): Promise<WebSocket> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(DERIV_WS_URL);
    const timeout = setTimeout(() => {
      ws.close();
      reject(new Error("WebSocket connection timeout"));
    }, 15000);

    ws.on("open", () => {
      clearTimeout(timeout);
      resolve(ws);
    });

    ws.on("error", (err) => {
      clearTimeout(timeout);
      reject(err);
    });
  });
}

async function sendAndReceive(ws: WebSocket, request: object): Promise<DerivMessage> {
  return new Promise((resolve, reject) => {
    const reqId = Date.now();
    const reqWithId = { ...request, req_id: reqId };
    const timeout = setTimeout(() => reject(new Error("Request timeout")), 15000);

    const handler = (data: WebSocket.Data) => {
      try {
        const msg: DerivMessage = JSON.parse(data.toString());
        if ((msg as Record<string, unknown>).req_id === reqId) {
          clearTimeout(timeout);
          ws.off("message", handler);
          if ((msg as Record<string, unknown>).error) {
            reject(new Error(String(((msg as Record<string, unknown>).error as Record<string, unknown>)?.message || "API error")));
          } else {
            resolve(msg);
          }
        }
      } catch {
        // ignore parse errors for other messages
      }
    };

    ws.on("message", handler);
    ws.send(JSON.stringify(reqWithId));
  });
}

export async function fetchActiveSymbols(): Promise<ActiveSymbol[]> {
  let ws: WebSocket | null = null;
  try {
    ws = await createWsConnection();
    const response = await sendAndReceive(ws, { active_symbols: "brief" });
    const symbols = (response.active_symbols as ActiveSymbol[]) || [];
    return symbols.map((s) => ({
      symbol: s.symbol,
      display_name: s.display_name,
      market: s.market,
      submarket: s.submarket,
      is_open: s.is_open ?? 1,
      pip_size: s.pip_size ?? 2,
    }));
  } finally {
    ws?.close();
  }
}

export async function fetchTickHistory(symbol: string, count: number = 1000): Promise<number[]> {
  // Kick off a live subscription so future calls are instant
  ensureSubscribed(symbol);

  // If the stream buffer already has enough data, serve it instantly
  const streamData = getStreamBuffer(symbol, count);
  if (streamData && streamData.length >= Math.min(count, 20)) {
    return streamData;
  }

  // Fall back to on-demand WebSocket request (first-load or uncommon symbol)
  const cacheKey = `${symbol}_${count}`;
  const now = Date.now();
  const cached = tickCache.get(cacheKey);
  const ts = cacheTimestamps.get(cacheKey) ?? 0;

  if (cached && now - ts < CACHE_TTL) {
    return cached;
  }

  let ws: WebSocket | null = null;
  try {
    ws = await createWsConnection();
    const response = await sendAndReceive(ws, {
      ticks_history: symbol,
      end: "latest",
      count,
      style: "ticks",
    });

    const history = response.history as HistoryResponse;
    const prices = history?.prices ?? [];

    tickCache.set(cacheKey, prices);
    cacheTimestamps.set(cacheKey, now);
    return prices;
  } finally {
    ws?.close();
  }
}

export async function fetchLatestTick(symbol: string): Promise<TickData | null> {
  let ws: WebSocket | null = null;
  try {
    ws = await createWsConnection();
    const response = await sendAndReceive(ws, {
      ticks_history: symbol,
      end: "latest",
      count: 1,
      style: "ticks",
    });

    const history = response.history as HistoryResponse;
    const prices = history?.prices ?? [];
    const times = history?.times ?? [];

    if (prices.length === 0) return null;

    const pipSize = getSymbolPipSize(symbol);
    return {
      epoch: times[times.length - 1] ?? Date.now() / 1000,
      quote: prices[prices.length - 1],
      symbol,
      pip_size: pipSize,
    };
  } finally {
    ws?.close();
  }
}

/**
 * Extract the last digit of a price using the correct pip_size.
 * pip_size comes from the live Deriv tick stream (authoritative) via
 * getSymbolPipSize(), so this will always match what Deriv.com shows.
 */
export function extractLastDigit(price: number, pipSize: number): number {
  const factor = Math.pow(10, pipSize);
  const intPart = Math.round(price * factor);
  return Math.abs(intPart) % 10;
}

/**
 * Returns the pip_size for a symbol.
 * Uses the live value from Deriv tick messages (set by tickStream.ts),
 * falling back to the static table if the symbol hasn't ticked yet.
 */
export function getDigitPipSize(symbol: string): number {
  return getSymbolPipSize(symbol);
}

export function analyseDigits(prices: number[], pipSize: number = 2): Array<{
  digit: number;
  count: number;
  percentage: number;
  rank: number;
  color: string;
}> {
  const counts = new Array(10).fill(0);
  for (const price of prices) {
    const d = extractLastDigit(price, pipSize);
    counts[d]++;
  }

  const total = prices.length || 1;
  const digits = counts.map((count, digit) => ({
    digit,
    count,
    percentage: parseFloat(((count / total) * 100).toFixed(2)),
    rank: 0,
    color: "",
  }));

  // Rank: 1 = highest
  const sorted = [...digits].sort((a, b) => b.percentage - a.percentage);
  sorted.forEach((d, i) => {
    d.rank = i + 1;
  });

  // Assign colors based on rank
  const colorMap: Record<number, string> = {
    1: "green",
    2: "blue",
    9: "red",
    10: "yellow",
  };

  digits.forEach((d) => {
    d.color = colorMap[d.rank] ?? "grey";
  });

  return digits;
}
