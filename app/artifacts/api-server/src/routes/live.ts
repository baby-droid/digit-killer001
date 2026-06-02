/**
 * GET /api/live-ticks?symbol=R_50
 *
 * Server-Sent Events stream. Each event is pushed the instant Deriv sends
 * a new tick — zero polling latency on the server side.
 */
import { Router } from "express";
import { ensureSubscribed, addTickListener, getStreamBuffer } from "../lib/tickStream";

const router = Router();

router.get("/live-ticks", (req, res) => {
  const symbol = String(req.query.symbol ?? "R_50").trim();

  // SSE headers
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no"); // disable Nginx buffering
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.flushHeaders();

  // Kick off subscription if not already running
  ensureSubscribed(symbol);

  // Send one synthetic event immediately from buffer so the client has data
  // without waiting for the next real tick
  const existing = getStreamBuffer(symbol, 1);
  if (existing && existing.length > 0) {
    const price = existing[existing.length - 1];
    const digit = Math.abs(Math.round(price * 100)) % 10;
    res.write(`data: ${JSON.stringify({ price, digit })}\n\n`);
  }

  // Wire up the push listener — fires the instant Deriv sends a new tick
  const cleanup = addTickListener(symbol, (price, digit) => {
    res.write(`data: ${JSON.stringify({ price, digit })}\n\n`);
  });

  // Heartbeat every 25s to prevent proxies from closing the connection
  const heartbeat = setInterval(() => {
    res.write(": ping\n\n");
  }, 25000);

  req.on("close", () => {
    cleanup();
    clearInterval(heartbeat);
  });
});

export default router;
