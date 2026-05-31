/**
 * Persistent Deriv WebSocket tick subscriptions.
 * Maintains an in-memory rolling buffer per symbol so analysis routes
 * can serve data instantly without opening a new WS on every request.
 */
import WebSocket from "ws";
import { logger } from "./logger";

const DERIV_WS_URL = "wss://ws.binaryws.com/websockets/v3?app_id=1089";
const MAX_BUFFER = 1100; // keep slightly more than max useful window

const tickBuffers = new Map<string, number[]>();
const wsConns = new Map<string, WebSocket>();
const reconnTimers = new Map<string, ReturnType<typeof setTimeout>>();

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
          const buf = tickBuffers.get(symbol) ?? [];
          buf.push(tick.quote);
          if (buf.length > MAX_BUFFER) buf.shift();
          tickBuffers.set(symbol, buf);
        }
      }
    } catch {
      /* ignore parse errors */
    }
  });

  ws.on("close", () => {
    wsConns.delete(symbol);
    // reconnect with back-off
    const timer = setTimeout(() => {
      reconnTimers.delete(symbol);
      connect(symbol);
    }, 2500);
    reconnTimers.set(symbol, timer);
    logger.debug({ symbol }, "tick stream closed — will reconnect");
  });

  ws.on("error", () => {
    ws.terminate();
  });
}

/** Ensure a live subscription exists for this symbol. Safe to call multiple times. */
export function ensureSubscribed(symbol: string): void {
  connect(symbol);
}

/**
 * Returns up to `count` prices from the live buffer, or null if the buffer
 * hasn't accumulated enough ticks yet.
 */
export function getStreamBuffer(symbol: string, count: number): number[] | null {
  const buf = tickBuffers.get(symbol);
  if (!buf || buf.length < Math.min(count, 20)) return null;
  return buf.slice(-count);
}

/** True once the buffer has at least 20 ticks for this symbol. */
export function isReady(symbol: string): boolean {
  return (tickBuffers.get(symbol)?.length ?? 0) >= 20;
}

// Pre-subscribe to the most common symbols on startup so they're warm immediately
const DEFAULT_SYMBOLS = [
  "R_10", "R_25", "R_50", "R_75", "R_100",
  "1HZ10V", "1HZ25V", "1HZ50V", "1HZ75V", "1HZ100V",
  "1HZ15V", "1HZ30V", "1HZ90V",
];
DEFAULT_SYMBOLS.forEach(connect);
