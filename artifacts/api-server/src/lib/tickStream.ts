/**
 * Persistent Deriv WebSocket tick subscriptions.
 * Push-based: listeners are notified IMMEDIATELY when Deriv sends a new tick.
 * No polling anywhere in this path.
 */
import WebSocket from "ws";
import { logger } from "./logger";

const DERIV_WS_URL = "wss://ws.binaryws.com/websockets/v3?app_id=1089";
const MAX_BUFFER = 1100;

type TickListener = (price: number, digit: number) => void;

const tickBuffers  = new Map<string, number[]>();
const wsConns      = new Map<string, WebSocket>();
const reconnTimers = new Map<string, ReturnType<typeof setTimeout>>();
const tickListeners = new Map<string, Set<TickListener>>();

function extractDigit(price: number): number {
  return Math.abs(Math.round(price * 100)) % 10;
}

function connect(symbol: string): void {
  if (wsConns.has(symbol)) return;

  const ws = new WebSocket(DERIV_WS_URL);
  wsConns.set(symbol, ws);

  ws.on("open", () => {
    ws.send(JSON.stringify({ ticks: symbol, subscribe: 1 }));
    logger.debug({ symbol }, "tick stream subscribed");
  });

  ws.on("message", (raw) => {
    try {
      const msg = JSON.parse(raw.toString()) as Record<string, unknown>;
      if (msg.msg_type === "tick") {
        const tick = msg.tick as Record<string, unknown> | undefined;
        if (typeof tick?.quote === "number") {
          const price = tick.quote;

          // Update rolling buffer
          const buf = tickBuffers.get(symbol) ?? [];
          buf.push(price);
          if (buf.length > MAX_BUFFER) buf.shift();
          tickBuffers.set(symbol, buf);

          // Push to all SSE listeners IMMEDIATELY — no polling latency
          const listeners = tickListeners.get(symbol);
          if (listeners?.size) {
            const digit = extractDigit(price);
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
    wsConns.delete(symbol);
    const timer = setTimeout(() => {
      reconnTimers.delete(symbol);
      connect(symbol);
    }, 2500);
    reconnTimers.set(symbol, timer);
    logger.debug({ symbol }, "tick stream closed — reconnecting");
  });

  ws.on("error", () => { ws.terminate(); });
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
