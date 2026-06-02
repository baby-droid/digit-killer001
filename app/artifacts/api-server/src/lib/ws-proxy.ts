import WebSocket, { WebSocketServer } from "ws";
import type { IncomingMessage } from "http";
import type { Server } from "http";
import { logger } from "./logger";

const APP_ID            = process.env.DERIV_APP_ID ?? "1089";
const DERIV_WS_PRIMARY  = `wss://ws.binaryws.com/websockets/v3?app_id=${APP_ID}`;
const DERIV_WS_ALT      = `wss://ws.derivws.com/websockets/v3?app_id=${APP_ID}`;
const PING_INTERVAL_MS  = 25_000;
const PONG_TIMEOUT_MS   = 10_000;
const MAX_RECONNECTS    = 8;

interface Session {
  clientWs:    WebSocket;
  derivWs:     WebSocket | null;
  token:       string | null;
  authorized:  boolean;
  authFailed:  boolean;   // set true when Deriv rejects the token — stops reconnect loop
  dead:        boolean;
  reconnects:  number;
  pingTimer:   ReturnType<typeof setInterval> | null;
  pongTimer:   ReturnType<typeof setTimeout>  | null;
  ip:          string;
}

function createSession(clientWs: WebSocket, ip: string): Session {
  return {
    clientWs, derivWs: null,
    token: null, authorized: false, authFailed: false, dead: false,
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

function connectToDeriv(session: Session, url: string, fallback?: string): void {
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
      if (fallback) {
        logger.warn({ url }, "WS proxy: primary timed out, trying fallback");
        connectToDeriv(session, fallback);
      } else {
        sendToClient(session, { type: "proxy_error", message: "Deriv connection timed out — please reconnect" });
      }
    }
  }, 12_000);

  derivWs.on("open", () => {
    clearTimeout(connectionTimeout);
    if (session.dead) { derivWs.close(); return; }

    logger.info({ url, ip: session.ip, app_id: APP_ID }, "WS proxy: connected to Deriv");
    session.reconnects = 0;

    if (session.token) {
      derivWs.send(JSON.stringify({ authorize: session.token, req_id: 1 }));
    }

    sendToClient(session, { type: "proxy_open" });
  });

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

        // Mark auth as failed so we do NOT auto-reconnect (invalid token won't work on retry)
        session.authFailed = true;

        const userMsg = errCode === "AuthorizationRequired"
          ? "Token rejected — please check your Deriv API token and try again"
          : errCode === "InvalidToken"
          ? "Invalid token — generate a new Deriv API token with Trading permissions"
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
    clearTimeout(connectionTimeout);
    if (session.dead) return;

    logger.warn({ code, reason: reason.toString(), ip: session.ip }, "WS proxy: Deriv closed");
    session.derivWs = null;
    session.authorized = false;

    if (session.authFailed) {
      // Auth failed — don't reconnect, the token won't work
      logger.info({ ip: session.ip }, "WS proxy: auth failed, not reconnecting");
      return;
    }

    if (code === 1006) {
      // Abnormal closure — usually a transient network issue, reconnect
      sendToClient(session, { type: "proxy_reconnecting", attempt: session.reconnects + 1, max: MAX_RECONNECTS, reason: "Network interruption" });
    }

    scheduleReconnect(session);
  });

  derivWs.on("error", (err) => {
    clearTimeout(connectionTimeout);
    logger.error({ err: err.message, url, ip: session.ip }, "WS proxy: Deriv WS error");

    if (fallback && !session.authorized && !session.authFailed) {
      logger.info("WS proxy: trying fallback URL");
      connectToDeriv(session, fallback);
    }
  });
}

function scheduleReconnect(session: Session) {
  if (session.dead || session.authFailed) return;
  if (session.reconnects >= MAX_RECONNECTS) {
    sendToClient(session, {
      type: "proxy_error",
      message: `Connection lost — max reconnect attempts (${MAX_RECONNECTS}) reached. Click Connect to retry.`,
    });
    return;
  }

  const delay = Math.min(500 * Math.pow(2, session.reconnects), 30_000);
  session.reconnects++;

  sendToClient(session, {
    type: "proxy_reconnecting",
    attempt: session.reconnects,
    max: MAX_RECONNECTS,
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

        // ── auth: connect to Deriv with user-supplied token ──────────────
        if (msg.type === "auth") {
          const token = typeof msg.token === "string" ? msg.token.trim() : "";
          if (!token) {
            sendToClient(session, { type: "proxy_error", message: "No token provided" });
            return;
          }
          // Reset auth state on new connection attempt
          session.token      = token;
          session.authFailed = false;
          session.authorized = false;
          session.reconnects = 0;

          // Close existing Deriv connection if switching tokens
          if (session.derivWs) {
            try { session.derivWs.close(1000); } catch {}
            session.derivWs = null;
          }

          logger.info({ ip }, "WS proxy: received auth token, connecting to Deriv");
          connectToDeriv(session, DERIV_WS_PRIMARY, DERIV_WS_ALT);
          return;
        }

        if (!session.token) {
          sendToClient(session, { type: "proxy_error", message: "Send {type:'auth',token:'...'} first" });
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
