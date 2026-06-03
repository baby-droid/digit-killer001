/**
 * Persistent Deriv WebSocket tick subscriptions.
 * Push-based: listeners are notified IMMEDIATELY when Deriv sends a new tick.
 *
 * ACCURACY FIX: pip_size is read directly from each Deriv tick message (the
 * authoritative source) and stored per symbol.  extractDigit() uses it instead
 * of the old hardcoded × 100.  A static fallback table covers the brief window
 * before the first tick arrives.
 */
import WebSocket from "ws";
import { logger } from "./logger";

const DERIV_WS_URLS = [
  "wss://ws.binaryws.com/websockets/v3?app_id=1089",   // legacy (primary)
  "wss://api.derivws.com/trading/v1/options/ws/public", // beta public (fallback)
];
const MAX_BUFFER = 1100;

// Per-symbol reconnect attempt counters for exponential back-off.
// These are reset to 0 on a successful connection, so recovered connections
// immediately go back to fast retries after the next drop.
const reconnectAttempts = new Map<string, number>();

type TickListener = (price: number, digit: number) => void;

const tickBuffers   = new Map<string, number[]>();
const wsConns       = new Map<string, WebSocket>();
const reconnTimers  = new Map<string, ReturnType<typeof setTimeout>>();
const tickListeners = new Map<string, Set<TickListener>>();

/**
 * pip_size authoritative values – populated from Deriv tick messages.
 * Fallback table covers the window before the first tick arrives.
 */
const pipSizes = new Map<string, number>();

/**
 * Static fallback pip_size table.
 * Values come from Deriv's active_symbols API ("pip_size" field).
 * They are only used before the first live tick updates the map.
 */
const FALLBACK_PIP: Record<string, number> = {
  R_10: 3, R_25: 3, R_50: 4, R_75: 4, R_100: 2,
  "1HZ10V": 3, "1HZ15V": 4, "1HZ25V": 4, "1HZ30V": 4,
  "1HZ50V": 4, "1HZ75V": 4, "1HZ90V": 4, "1HZ100V": 2,
  CRASH300N: 2, CRASH500: 2, CRASH1000: 2,
  BOOM300N: 2, BOOM500: 2, BOOM1000: 2,
  JD10: 4, JD25: 3, JD50: 3, JD75: 3, JD100: 2,
  RDBEAR: 4, RDBULL: 4,
};

/** Returns the live pip_size for a symbol (from Deriv tick, or fallback). */
export function getSymbolPipSize(symbol: string): number {
  return pipSizes.get(symbol) ?? FALLBACK_PIP[symbol] ?? 2;
}

function extractDigit(price: number, symbol: string): number {
  const ps = getSymbolPipSize(symbol);
  const factor = Math.pow(10, ps);
  return Math.abs(Math.round(price * factor)) % 10;
}

function connectWithUrl(symbol: string, urlIndex: number): void {
  const url = DERIV_WS_URLS[urlIndex];
  if (!url) {
    logger.error({ symbol }, "All Deriv WS URLs exhausted for tick stream");
    return;
  }

  const ws = new WebSocket(url);
  wsConns.set(symbol, ws);

  let opened = false;

  const openTimeout = setTimeout(() => {
    if (!opened) {
      logger.warn({ symbol, url, urlIndex }, "Tick stream open timeout, trying fallback");
      wsConns.delete(symbol);
      try { ws.terminate(); } catch {}
      connectWithUrl(symbol, urlIndex + 1);
    }
  }, 10000);

  ws.on("open", () => {
    opened = true;
    clearTimeout(openTimeout);
    reconnectAttempts.set(symbol, 0); // reset back-off on success
    ws.send(JSON.stringify({ ticks: symbol, subscribe: 1 }));
    logger.debug({ symbol, urlIndex }, "tick stream subscribed");
  });

  ws.on("message", (raw) => {
    try {
      const msg = JSON.parse(raw.toString()) as Record<string, unknown>;
      if (msg.msg_type === "tick") {
        const tick = msg.tick as Record<string, unknown> | undefined;
        if (typeof tick?.quote === "number") {
          const price = tick.quote;

          // Store authoritative pip_size from Deriv the moment it arrives
          if (typeof tick.pip_size === "number" && tick.pip_size > 0) {
            pipSizes.set(symbol, tick.pip_size);
          }

          // Update rolling buffer
          const buf = tickBuffers.get(symbol) ?? [];
          buf.push(price);
          if (buf.length > MAX_BUFFER) buf.shift();
          tickBuffers.set(symbol, buf);

          // Push to all SSE listeners IMMEDIATELY — no polling latency
          const listeners = tickListeners.get(symbol);
          if (listeners?.size) {
            const digit = extractDigit(price, symbol);
            listeners.forEach((fn) => {
              try { fn(price, digit); } catch { /* ignore listener errors */ }
            });
          }
        }
      }
    } catch {
      /* ignore parse errors */
    }
  });

  ws.on("close", () => {
    clearTimeout(openTimeout);
    wsConns.delete(symbol);

    // Exponential back-off: 2.5 s → 5 s → 10 s → … → 60 s max.
    // After a successful reconnect the counter is reset so next drop is fast again.
    const attempts = reconnectAttempts.get(symbol) ?? 0;
    const delay    = Math.min(2_500 * Math.pow(1.6, Math.min(attempts, 10)), 60_000);
    reconnectAttempts.set(symbol, attempts + 1);

    const timer = setTimeout(() => {
      reconnTimers.delete(symbol);
      connectWithUrl(symbol, 0);
    }, delay);
    reconnTimers.set(symbol, timer);
    logger.debug({ symbol, delay, attempt: attempts + 1 }, "tick stream closed — scheduling reconnect");
  });

  ws.on("error", (err) => {
    clearTimeout(openTimeout);
    if (!opened && urlIndex + 1 < DERIV_WS_URLS.length) {
      logger.warn({ symbol, url, err: String(err) }, "Tick stream error on URL, trying fallback");
      wsConns.delete(symbol);
      try { ws.terminate(); } catch {}
      connectWithUrl(symbol, urlIndex + 1);
    } else {
      ws.terminate();
    }
  });
}

function connect(symbol: string): void {
  if (wsConns.has(symbol)) return;
  connectWithUrl(symbol, 0);
}

/** Start/ensure a live subscription. Safe to call many times. */
export function ensureSubscribed(symbol: string): void {
  connect(symbol);
}

/** Returns latest `count` prices from buffer, or null if not enough data yet. */
export function getStreamBuffer(symbol: string, count: number): number[] | null {
  const buf = tickBuffers.get(symbol);
  if (!buf || buf.length < Math.min(count, 20)) return null;
  return buf.slice(-count);
}

/**
 * Register a listener that fires immediately for every incoming tick.
 * Returns a cleanup function — call it when the SSE connection closes.
 */
export function addTickListener(symbol: string, fn: TickListener): () => void {
  if (!tickListeners.has(symbol)) tickListeners.set(symbol, new Set());
  tickListeners.get(symbol)!.add(fn);
  return () => tickListeners.get(symbol)?.delete(fn);
}

export function isReady(symbol: string): boolean {
  return (tickBuffers.get(symbol)?.length ?? 0) >= 20;
}

// Pre-subscribe on startup so buffers are warm immediately
const DEFAULT_SYMBOLS = [
  "R_10", "R_25", "R_50", "R_75", "R_100",
  "1HZ10V", "1HZ15V", "1HZ25V", "1HZ30V", "1HZ50V", "1HZ75V", "1HZ90V", "1HZ100V",
  "RDBEAR", "RDBULL",
  "CRASH300N", "CRASH500", "CRASH1000", "BOOM300N", "BOOM500", "BOOM1000",
  "JD10", "JD25", "JD50", "JD75", "JD100",
];
DEFAULT_SYMBOLS.forEach(connect);

// ─── 15-hour auto-reset: clear all in-memory buffers to prevent growth ─────────
const RESET_INTERVAL_MS = 15 * 60 * 60 * 1000; // 15 hours in milliseconds
export let serverStartTime = Date.now();
export let lastResetTime   = Date.now();
export let resetCount      = 0;

export function clearAllBuffers(): void {
  tickBuffers.clear();
  pipSizes.clear();
  lastResetTime = Date.now();
  resetCount++;
  logger.info({ resetCount }, "Buffer reset: all tick data cleared (15-hour cycle)");
  // Re-subscribe so streams warm back up immediately
  DEFAULT_SYMBOLS.forEach(connect);
}

// Fires every 15 hours — no accumulation, no disk writes, no storage leaks
setInterval(clearAllBuffers, RESET_INTERVAL_MS);

/** Returns a real-time snapshot of server memory and buffer state. */
export function getSystemStats() {
  const mem = process.memoryUsage();
  const totalTicks = Array.from(tickBuffers.values()).reduce((s, b) => s + b.length, 0);
  const totalListeners = Array.from(tickListeners.values()).reduce((s, l) => s + l.size, 0);
  const nextReset = lastResetTime + RESET_INTERVAL_MS;
  const msToReset = Math.max(0, nextReset - Date.now());
  return {
    uptime_seconds:    Math.floor((Date.now() - serverStartTime) / 1000),
    last_reset:        new Date(lastResetTime).toISOString(),
    next_reset:        new Date(nextReset).toISOString(),
    ms_to_next_reset:  msToReset,
    reset_interval_h:  15,
    reset_count:       resetCount,
    storage: {
      policy: "in-memory only — no disk writes for tick data",
      total_symbols_buffered: tickBuffers.size,
      total_ticks_in_memory:  totalTicks,
      estimated_bytes:        totalTicks * 8,
      max_ticks_per_symbol:   MAX_BUFFER,
    },
    connections: {
      active_websockets: wsConns.size,
      active_sse_listeners: totalListeners,
    },
    memory_mb: {
      rss:        Math.round(mem.rss        / 1024 / 1024),
      heap_used:  Math.round(mem.heapUsed   / 1024 / 1024),
      heap_total: Math.round(mem.heapTotal  / 1024 / 1024),
      external:   Math.round(mem.external   / 1024 / 1024),
    },
    buffers_per_symbol: Object.fromEntries(
      Array.from(tickBuffers.entries()).map(([sym, buf]) => [sym, buf.length])
    ),
  };
}
