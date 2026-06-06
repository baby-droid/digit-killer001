import WebSocket, { WebSocketServer } from "ws";
import type { IncomingMessage } from "http";
import type { Server } from "http";
import { logger } from "./logger";

const APP_ID            = process.env.DERIV_APP_ID ?? "1089";
const DERIV_WS_PRIMARY  = `wss://ws.binaryws.com/websockets/v3?app_id=${APP_ID}`;
const DERIV_WS_ALT      = `wss://ws.derivws.com/websockets/v3?app_id=${APP_ID}`;
const DERIV_WS_PUBLIC   = `wss://api.derivws.com/trading/v1/options/ws/public`;
const PING_INTERVAL_MS  = 20_000;
const PONG_TIMEOUT_MS   = 15_000;
const MAX_RECONNECTS    = 8;
const RACE_TIMEOUT_MS   = 8_000; // total time to wait when racing both servers

interface Session {
  clientWs:    WebSocket;
  derivWs:     WebSocket | null;
  token:       string | null;
  otpUrl:      string | null;
  authorized:  boolean;
  authFailed:  boolean;
  dead:        boolean;
  reconnects:  number;
  pingTimer:   ReturnType<typeof setInterval> | null;
  pongTimer:   ReturnType<typeof setTimeout>  | null;
  ip:          string;
}

function createSession(clientWs: WebSocket, ip: string): Session {
  return {
    clientWs, derivWs: null,
    token: null, otpUrl: null,
    authorized: false, authFailed: false, dead: false,
    reconnects: 0, pingTimer: null, pongTimer: null, ip,
  };
}

function sendToClient(session: Session, msg: Record<string, unknown>) {
  if (!session.dead && session.clientWs.readyState === WebSocket.OPEN) {
    session.clientWs.send(JSON.stringify(msg));
  }
}

function cleanup(session: Session) {
  if (session.dead) return;
  session.dead = true;
  if (session.pingTimer) clearInterval(session.pingTimer);
  if (session.pongTimer) clearTimeout(session.pongTimer);
  try { session.derivWs?.close(1000); } catch {}
  session.derivWs = null;
  logger.info({ ip: session.ip }, "WS proxy: session cleaned up");
}

// ── Attach the live derivWs to the session and wire up its ongoing handlers ──
function attachDerivSocket(session: Session, derivWs: WebSocket, url: string): void {
  session.derivWs = derivWs;

  derivWs.on("message", (raw) => {
    if (session.dead) return;

    const text = raw.toString();

    try {
      const msg = JSON.parse(text) as Record<string, unknown>;

      if (msg.msg_type === "authorize" && !msg.error) {
        session.authorized = true;
        session.authFailed  = false;
        logger.info({ ip: session.ip }, "WS proxy: Deriv authorized OK");
      }

      if (msg.error && msg.msg_type === "authorize") {
        const errCode = (msg.error as Record<string, unknown>)?.code as string | undefined;
        const errMsg  = (msg.error as Record<string, string>)?.message ?? "Authorization failed";
        logger.warn({ errMsg, errCode, ip: session.ip }, "WS proxy: Deriv auth error");

        session.authFailed = true;

        const userMsg = errCode === "AuthorizationRequired"
          ? "Token rejected — please check your Deriv API token and try again"
          : errCode === "InvalidToken"
          ? "Invalid token — please log in again with Deriv"
          : `Auth error: ${errMsg}`;

        sendToClient(session, { type: "proxy_error", message: userMsg, code: errCode });
        cleanup(session);
        return;
      }
    } catch {}

    if (session.clientWs.readyState === WebSocket.OPEN) {
      session.clientWs.send(text);
    }
  });

  derivWs.on("close", (code, reason) => {
    if (session.dead || session.derivWs !== derivWs) return;

    logger.warn({ code, reason: reason.toString(), ip: session.ip }, "WS proxy: Deriv closed");
    session.derivWs = null;
    session.authorized = false;

    if (session.authFailed) {
      logger.info({ ip: session.ip }, "WS proxy: auth failed, not reconnecting");
      return;
    }

    if (session.otpUrl) {
      sendToClient(session, {
        type: "proxy_error",
        message: "Authenticated session expired — please reconnect",
      });
      return;
    }

    if (code === 1006) {
      sendToClient(session, {
        type: "proxy_reconnecting",
        attempt: session.reconnects + 1,
        max: MAX_RECONNECTS,
        reason: "Network interruption",
      });
    }

    scheduleReconnect(session);
  });

  derivWs.on("error", (err) => {
    logger.error({ err: err.message, url, ip: session.ip }, "WS proxy: Deriv WS error");
  });
}

// ── Race primary and fallback simultaneously — use whichever opens first ─────
function connectToDeriv(session: Session, url: string, fallback?: string): void {
  if (session.dead || session.authFailed) return;

  const isOtp = url.includes("otp=") || url.includes("/ws/demo") || url.includes("/ws/real");

  // OTP is single-use — no racing, just connect directly
  if (isOtp || !fallback) {
    connectSingle(session, url, isOtp);
    return;
  }

  // ── Race: open both URLs at the same time, use the faster one ─────────────
  let won = false;
  const candidates: WebSocket[] = [];

  const raceTimeout = setTimeout(() => {
    if (!won && !session.dead) {
      candidates.forEach((c) => { try { c.terminate(); } catch {} });
      sendToClient(session, { type: "proxy_error", message: "Deriv connection timed out — please reconnect" });
      logger.warn({ ip: session.ip }, "WS proxy: race timed out, all candidates failed");
    }
  }, RACE_TIMEOUT_MS);

  function tryUrl(candidateUrl: string) {
    let ws: WebSocket;
    try { ws = new WebSocket(candidateUrl); }
    catch (e) {
      logger.error({ e, url: candidateUrl }, "WS proxy: failed to create Deriv socket");
      return;
    }
    candidates.push(ws);

    ws.on("open", () => {
      if (won || session.dead) {
        // Lost the race — discard this socket
        try { ws.close(1000); } catch {}
        return;
      }
      won = true;
      clearTimeout(raceTimeout);

      // Discard the other candidate(s)
      candidates.forEach((c) => { if (c !== ws) { try { c.terminate(); } catch {} } });

      logger.info({ url: candidateUrl, ip: session.ip, app_id: APP_ID }, "WS proxy: connected to Deriv (race winner)");
      session.reconnects = 0;

      if (session.token) {
        ws.send(JSON.stringify({ authorize: session.token, req_id: 1 }));
      }
      sendToClient(session, { type: "proxy_open" });
      attachDerivSocket(session, ws, candidateUrl);
    });

    ws.on("error", (err) => {
      logger.warn({ err: err.message, url: candidateUrl, ip: session.ip }, "WS proxy: race candidate error");
      try { ws.terminate(); } catch {}
    });
  }

  tryUrl(url);
  // Stagger the fallback by 300 ms so the primary gets a head start but we
  // don't wait for it to fully time out before trying the alt.
  setTimeout(() => { if (!won && !session.dead) tryUrl(fallback); }, 300);
}

// ── Single (non-racing) connect — used for OTP and reconnects ─────────────────
function connectSingle(session: Session, url: string, isOtp = false): void {
  if (session.dead || session.authFailed) return;

  let derivWs: WebSocket;
  try {
    derivWs = new WebSocket(url);
  } catch (e) {
    logger.error({ e, url }, "WS proxy: failed to create Deriv socket");
    sendToClient(session, { type: "proxy_error", message: "Failed to reach Deriv servers" });
    return;
  }

  session.derivWs = derivWs;

  const connectionTimeout = setTimeout(() => {
    if (derivWs.readyState === WebSocket.CONNECTING) {
      derivWs.terminate();
      sendToClient(session, { type: "proxy_error", message: "Deriv connection timed out — please reconnect" });
    }
  }, RACE_TIMEOUT_MS);

  derivWs.on("open", () => {
    clearTimeout(connectionTimeout);
    if (session.dead) { derivWs.close(); return; }

    logger.info({ url, ip: session.ip, app_id: APP_ID }, "WS proxy: connected to Deriv");
    session.reconnects = 0;

    if (isOtp) {
      session.authorized = true;
      session.authFailed  = false;
      sendToClient(session, { type: "proxy_open" });
      logger.info({ ip: session.ip }, "WS proxy: OTP connection established (pre-authenticated)");
    } else if (session.token) {
      derivWs.send(JSON.stringify({ authorize: session.token, req_id: 1 }));
      sendToClient(session, { type: "proxy_open" });
    } else {
      sendToClient(session, { type: "proxy_open" });
    }

    attachDerivSocket(session, derivWs, url);
  });

  derivWs.on("error", (err) => {
    clearTimeout(connectionTimeout);
    logger.error({ err: err.message, url, ip: session.ip }, "WS proxy: Deriv WS error");
  });
}

function scheduleReconnect(session: Session) {
  if (session.dead || session.authFailed || session.otpUrl) return;

  const exp   = session.reconnects % MAX_RECONNECTS;
  const delay = Math.min(500 * Math.pow(2, exp), 30_000);
  session.reconnects++;

  sendToClient(session, {
    type: "proxy_reconnecting",
    attempt: session.reconnects,
    delay_ms: delay,
  });

  logger.info({ delay, attempt: session.reconnects, ip: session.ip }, "WS proxy: scheduling reconnect");

  setTimeout(() => {
    if (!session.dead && !session.authFailed && session.token) {
      connectToDeriv(session, DERIV_WS_PRIMARY, DERIV_WS_ALT);
    }
  }, delay);
}

function startHeartbeat(session: Session) {
  session.pingTimer = setInterval(() => {
    if (session.dead || session.clientWs.readyState !== WebSocket.OPEN) return;
    session.clientWs.ping();
    session.pongTimer = setTimeout(() => {
      if (!session.dead) {
        logger.warn({ ip: session.ip }, "WS proxy: pong timeout — terminating client");
        session.clientWs.terminate();
      }
    }, PONG_TIMEOUT_MS);
  }, PING_INTERVAL_MS);
}

export function attachWsProxy(server: Server): void {
  const wss = new WebSocketServer({ server, path: "/ws/deriv" });

  wss.on("connection", (clientWs: WebSocket, req: IncomingMessage) => {
    const ip = (req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim()
             ?? req.socket.remoteAddress
             ?? "unknown";

    logger.info({ ip }, "WS proxy: client connected");

    const session = createSession(clientWs, ip);
    startHeartbeat(session);

    clientWs.on("pong", () => {
      if (session.pongTimer) {
        clearTimeout(session.pongTimer);
        session.pongTimer = null;
      }
    });

    clientWs.on("message", (raw) => {
      const text = raw.toString();

      try {
        const msg = JSON.parse(text) as Record<string, unknown>;

        // ── Legacy auth: trading token from oauth.deriv.com ──────────────
        if (msg.type === "auth") {
          const token = typeof msg.token === "string" ? msg.token.trim() : "";
          if (!token) {
            sendToClient(session, { type: "proxy_error", message: "No token provided" });
            return;
          }
          session.token      = token;
          session.otpUrl     = null;
          session.authFailed = false;
          session.authorized = false;
          session.reconnects = 0;

          if (session.derivWs) {
            try { session.derivWs.close(1000); } catch {}
            session.derivWs = null;
          }

          logger.info({ ip }, "WS proxy: legacy auth token received, racing Deriv servers");
          connectToDeriv(session, DERIV_WS_PRIMARY, DERIV_WS_ALT);
          return;
        }

        // ── New API auth: OTP WebSocket URL from REST API ─────────────────
        if (msg.type === "otp_connect") {
          const otpUrl = typeof msg.otp_url === "string" ? msg.otp_url.trim() : "";
          if (!otpUrl || !otpUrl.startsWith("wss://")) {
            sendToClient(session, { type: "proxy_error", message: "Invalid OTP URL" });
            return;
          }
          session.token      = null;
          session.otpUrl     = otpUrl;
          session.authFailed = false;
          session.authorized = false;
          session.reconnects = 0;

          if (session.derivWs) {
            try { session.derivWs.close(1000); } catch {}
            session.derivWs = null;
          }

          logger.info({ ip }, "WS proxy: OTP connect received, connecting to new Deriv API");
          connectToDeriv(session, otpUrl);
          return;
        }

        if (!session.token && !session.otpUrl) {
          sendToClient(session, {
            type: "proxy_error",
            message: "Send {type:'auth',token:'...'} for legacy login or {type:'otp_connect',otp_url:'...'} for new API first",
          });
          return;
        }

        if (session.derivWs?.readyState === WebSocket.OPEN) {
          session.derivWs.send(text);
        } else {
          sendToClient(session, { type: "proxy_not_ready", message: "Connecting to Deriv — please wait a moment" });
        }
      } catch {
        sendToClient(session, { type: "proxy_error", message: "Invalid JSON message" });
      }
    });

    clientWs.on("close", (code) => {
      logger.info({ code, ip }, "WS proxy: client disconnected");
      cleanup(session);
    });

    clientWs.on("error", (err) => {
      logger.error({ err: err.message, ip }, "WS proxy: client socket error");
      cleanup(session);
    });
  });

  logger.info({ app_id: APP_ID }, "WS proxy: attached at /ws/deriv");
}

// Export for use in deriv.ts public data connections
export { DERIV_WS_PUBLIC };
