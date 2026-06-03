import WebSocket from "ws";
import { logger } from "./logger";
import {
  ensureSubscribed,
  getStreamBuffer,
  getSymbolPipSize,
} from "./tickStream";

const DERIV_WS_PRIMARY = "wss://ws.binaryws.com/websockets/v3?app_id=1089";
const DERIV_WS_ALT     = "wss://ws.derivws.com/websockets/v3?app_id=1089";

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

// ─── Persistent connection pool ───────────────────────────────────────────────
// Keeps N ready-to-use connections open so one-shot requests (active_symbols,
// ticks_history) don't pay a fresh TCP+TLS+WS handshake every call.

const POOL_SIZE = 3;
const POOL_PING_MS = 20_000;

interface PoolConn {
  ws: WebSocket;
  ready: boolean;
  pingTimer?: ReturnType<typeof setInterval>;
}

const pool: PoolConn[] = [];

function spawnPoolConn(): void {
  const entry: PoolConn = { ws: new WebSocket(DERIV_WS_PRIMARY), ready: false };
  pool.push(entry);

  entry.ws.on("open", () => {
    entry.ready = true;
    entry.pingTimer = setInterval(() => {
      if (entry.ws.readyState === WebSocket.OPEN) entry.ws.ping();
    }, POOL_PING_MS);
    logger.debug("Deriv pool: connection ready");
  });

  const recycle = () => {
    entry.ready = false;
    if (entry.pingTimer) clearInterval(entry.pingTimer);
    const idx = pool.indexOf(entry);
    if (idx >= 0) pool.splice(idx, 1);
    // Reconnect after a short delay
    setTimeout(spawnPoolConn, 2500);
  };

  entry.ws.on("close", recycle);
  entry.ws.on("error", () => {
    try { entry.ws.terminate(); } catch {}
    recycle();
  });
}

// Initialise pool on module load
for (let i = 0; i < POOL_SIZE; i++) spawnPoolConn();

function getPoolConn(): WebSocket | null {
  const conn = pool.find((c) => c.ready && c.ws.readyState === WebSocket.OPEN);
  return conn?.ws ?? null;
}

// ─── One-shot fallback (when pool is not ready yet) ───────────────────────────

function createFreshConnection(): Promise<WebSocket> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(DERIV_WS_PRIMARY);
    const timeout = setTimeout(() => {
      ws.removeAllListeners();
      try { ws.close(); } catch {}
      // Try alt URL
      const ws2 = new WebSocket(DERIV_WS_ALT);
      const t2 = setTimeout(() => {
        ws2.removeAllListeners();
        try { ws2.close(); } catch {}
        reject(new Error("Deriv WebSocket connection timeout"));
      }, 6_000);
      ws2.on("open", () => { clearTimeout(t2); resolve(ws2); });
      ws2.on("error", (e) => { clearTimeout(t2); reject(e); });
    }, 5_000);

    ws.on("open", () => { clearTimeout(timeout); resolve(ws); });
    ws.on("error", (e) => { clearTimeout(timeout); reject(e); });
  });
}

// ─── sendAndReceive ───────────────────────────────────────────────────────────

async function sendAndReceive(request: object): Promise<DerivMessage> {
  const reqId = Date.now() + Math.floor(Math.random() * 1000);
  const reqWithId = { ...request, req_id: reqId };

  // Prefer a pool connection (no handshake cost)
  const poolWs = getPoolConn();
  if (poolWs) {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        poolWs.off("message", handler);
        reject(new Error("Deriv request timeout"));
      }, 12_000);

      const handler = (data: WebSocket.Data) => {
        try {
          const msg = JSON.parse(data.toString()) as DerivMessage & Record<string, unknown>;
          if (msg.req_id === reqId) {
            clearTimeout(timeout);
            poolWs.off("message", handler);
            if (msg.error) {
              reject(new Error(String((msg.error as Record<string, unknown>)?.message ?? "API error")));
            } else {
              resolve(msg);
            }
          }
        } catch { /* ignore */ }
      };

      poolWs.on("message", handler);
      poolWs.send(JSON.stringify(reqWithId));
    });
  }

  // Fall back: open a fresh connection (first startup, pool not warm yet)
  let ws: WebSocket | null = null;
  try {
    ws = await createFreshConnection();
    return await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        ws!.off("message", handler);
        reject(new Error("Deriv request timeout"));
      }, 12_000);

      const handler = (data: WebSocket.Data) => {
        try {
          const msg = JSON.parse(data.toString()) as DerivMessage & Record<string, unknown>;
          if (msg.req_id === reqId) {
            clearTimeout(timeout);
            ws!.off("message", handler);
            if (msg.error) {
              reject(new Error(String((msg.error as Record<string, unknown>)?.message ?? "API error")));
            } else {
              resolve(msg);
            }
          }
        } catch { /* ignore */ }
      };

      ws!.on("message", handler);
      ws!.send(JSON.stringify(reqWithId));
    });
  } finally {
    ws?.close();
  }
}

// ─── Exported API functions ───────────────────────────────────────────────────

// Cache active symbols — they rarely change
let activeSymbolsCache: ActiveSymbol[] | null = null;
let activeSymbolsCacheTs = 0;
const ACTIVE_SYMBOLS_TTL = 30_000; // 30 s

export async function fetchActiveSymbols(): Promise<ActiveSymbol[]> {
  const now = Date.now();
  if (activeSymbolsCache && now - activeSymbolsCacheTs < ACTIVE_SYMBOLS_TTL) {
    return activeSymbolsCache;
  }

  const response = await sendAndReceive({ active_symbols: "brief" });
  const symbols = (response.active_symbols as ActiveSymbol[]) ?? [];
  const result = symbols.map((s) => ({
    symbol:       s.symbol,
    display_name: s.display_name,
    market:       s.market,
    submarket:    s.submarket,
    is_open:      s.is_open ?? 1,
    pip_size:     s.pip_size ?? 2,
  }));

  activeSymbolsCache   = result;
  activeSymbolsCacheTs = now;
  return result;
}

const tickCache       = new Map<string, number[]>();
const cacheTimestamps = new Map<string, number>();
const CACHE_TTL       = 1500;

export async function fetchTickHistory(symbol: string, count: number = 1000): Promise<number[]> {
  ensureSubscribed(symbol);

  const streamData = getStreamBuffer(symbol, count);
  if (streamData && streamData.length >= Math.min(count, 20)) {
    return streamData;
  }

  const cacheKey = `${symbol}_${count}`;
  const now = Date.now();
  const cached = tickCache.get(cacheKey);
  const ts = cacheTimestamps.get(cacheKey) ?? 0;

  if (cached && now - ts < CACHE_TTL) return cached;

  const response = await sendAndReceive({
    ticks_history: symbol,
    end:   "latest",
    count,
    style: "ticks",
  });

  const history = response.history as HistoryResponse;
  const prices  = history?.prices ?? [];

  tickCache.set(cacheKey, prices);
  cacheTimestamps.set(cacheKey, now);
  return prices;
}

export async function fetchLatestTick(symbol: string): Promise<TickData | null> {
  const response = await sendAndReceive({
    ticks_history: symbol,
    end:   "latest",
    count: 1,
    style: "ticks",
  });

  const history = response.history as HistoryResponse;
  const prices  = history?.prices ?? [];
  const times   = history?.times  ?? [];

  if (prices.length === 0) return null;

  const pipSize = getSymbolPipSize(symbol);
  return {
    epoch:    times[times.length - 1] ?? Date.now() / 1000,
    quote:    prices[prices.length - 1],
    symbol,
    pip_size: pipSize,
  };
}

export function extractLastDigit(price: number, pipSize: number): number {
  const factor = Math.pow(10, pipSize);
  const intPart = Math.round(price * factor);
  return Math.abs(intPart) % 10;
}

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

  const sorted = [...digits].sort((a, b) => b.percentage - a.percentage);
  sorted.forEach((d, i) => { d.rank = i + 1; });

  const colorMap: Record<number, string> = {
    1: "green", 2: "blue", 9: "red", 10: "yellow",
  };

  digits.forEach((d) => { d.color = colorMap[d.rank] ?? "grey"; });

  return digits;
}
