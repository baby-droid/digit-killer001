import WebSocket, { WebSocketServer } from "ws";
import type { IncomingMessage } from "http";
import type { Server } from "http";
import { logger } from "./logger";

const DERIV_WS_PRIMARY = "wss://ws.binaryws.com/websockets/v3?app_id=1089";
const DERIV_WS_ALT     = "wss://ws.derivws.com/websockets/v3?app_id=1089";
const PING_INTERVAL_MS = 25_000;
const PONG_TIMEOUT_MS  = 10_000;
const MAX_RECONNECTS   = 8;

interface Session {
  clientWs:      WebSocket;
  derivWs:       WebSocket | null;
  token:         string | null;
  authorized:    boolean;
  dead:          boolean;
  reconnects:    number;
  pingTimer:     ReturnType<typeof setInterval> | null;
  pongTimer:     ReturnType<typeof setTimeout>  | null;
  ip:            string;
}

function createSession(clientWs: WebSocket, ip: string): Session {
  return {
    clientWs, derivWs: null,
    token: null, authorized: false, dead: false,
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
  if (session.dead) return;

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
        sendToClient(session, { type: "proxy_error", message: "Deriv connection timed out" });
      }
    }
  }, 12_000);

  derivWs.on("open", () => {
    clearTimeout(connectionTimeout);
    if (session.dead) { derivWs.close(); return; }

    logger.info({ url, ip: session.ip }, "WS proxy: connected to Deriv");
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

      if (msg.msg_type === "authorize") {
        session.authorized = true;
        logger.info({ ip: session.ip }, "WS proxy: Deriv authorized OK");
      }

      if (msg.error && msg.msg_type === "authorize") {
        const errMsg = (msg.error as Record<string, string>)?.message ?? "Authorization failed";
        logger.warn({ errMsg, ip: session.ip }, "WS proxy: Deriv auth error");
        sendToClient(session, { type: "proxy_error", message: errMsg });
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
    scheduleReconnect(session);
  });

  derivWs.on("error", (err) => {
    clearTimeout(connectionTimeout);
    logger.error({ err: err.message, url, ip: session.ip }, "WS proxy: Deriv WS error");

    if (fallback && !session.authorized) {
      logger.info("WS proxy: trying fallback URL");
      connectToDeriv(session, fallback);
    }
  });
}

function scheduleReconnect(session: Session) {
  if (session.dead) return;
  if (session.reconnects >= MAX_RECONNECTS) {
    sendToClient(session, {
      type: "proxy_error",
      message: `Deriv disconnected — max reconnect attempts (${MAX_RECONNECTS}) reached. Please reconnect.`,
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
    if (!session.dead && session.token) {
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

        if (msg.type === "auth") {
          const token = typeof msg.token === "string" ? msg.token.trim() : "";
          if (!token) {
            sendToClient(session, { type: "proxy_error", message: "No token provided" });
            return;
          }
          session.token = token;
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
          sendToClient(session, { type: "proxy_not_ready", message: "Connecting to Deriv — please wait" });
        }
      } catch {
        sendToClient(session, { type: "proxy_error", message: "Invalid JSON" });
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

  logger.info("WS proxy: attached at /ws/deriv");
}
