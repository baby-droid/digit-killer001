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

const server = http.createServer(app);
attachWsProxy(server);

server.listen(port, () => {
  logger.info({ port }, "Server listening");
});
