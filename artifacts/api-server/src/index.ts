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

// Handle port-already-in-use gracefully: another instance (e.g. the deployment
// workflow) is already running — exit cleanly so the workflow does not show FAILED.
server.on("error", (err: NodeJS.ErrnoException) => {
  if (err.code === "EADDRINUSE") {
    logger.warn(
      { port },
      "Port already in use — another instance is running on this port. Exiting cleanly.",
    );
    process.exit(0);
  }
  logger.error({ err: err.message, code: err.code }, "Server fatal error");
  process.exit(1);
});

server.listen(port, () => {
  logger.info({ port }, "Server listening");
});
