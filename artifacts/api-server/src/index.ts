import http from "http";
import app from "./app";
import { attachWsProxy } from "./lib/ws-proxy";
import { logger } from "./lib/logger";

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error("PORT environment variable is required but was not provided.");
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

// ── Global crash guards — keep the server alive under any unhandled error ─────
process.on("uncaughtException", (err) => {
  logger.error({ err: err.message, stack: err.stack }, "Uncaught exception — server continuing");
});

process.on("unhandledRejection", (reason) => {
  logger.error({ reason: String(reason) }, "Unhandled promise rejection — server continuing");
});

const server = http.createServer(app);
attachWsProxy(server);

server.listen(port, () => {
  logger.info({ port }, "Server listening");
});

// ── Keep-alive tuning to prevent idle disconnects ─────────────────────────────
server.keepAliveTimeout = 65_000;
server.headersTimeout   = 70_000;
