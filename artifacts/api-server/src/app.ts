import express, { type Express } from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import type { IncomingMessage, ServerResponse } from "http";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import router from "./routes";
import { logger } from "./lib/logger";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const app: Express = express();

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req: IncomingMessage & { id?: unknown }) {
        return {
          id: req.id,
          method: req.method,
          url: (req.url ?? "").split("?")[0],
        };
      },
      res(res: ServerResponse) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);

// Allow the Vite dev-server origin to call the API in development.
// In production both frontend and API are on the same origin, so CORS is not
// strictly required — but keeping it enabled is harmless.
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use("/api", router);

// ── Static frontend ───────────────────────────────────────────────────────────
// In production, always serve the built Vite output from this server.
// In development, also serve it if the build output already exists — this lets
// the preview pane at port 8080 match the published app exactly.
// The catch-all must come AFTER all /api routes.
const staticDir   = path.resolve(__dirname, "../../digit-killer/dist/public");
const isProduction = process.env["NODE_ENV"] === "production";
const buildExists  = fs.existsSync(path.join(staticDir, "index.html"));

if (isProduction || buildExists) {
  app.use(express.static(staticDir, {
    maxAge: isProduction ? "1d" : "0",
    etag:   true,
  }));

  // SPA fallback — let React Router handle all non-asset routes
  app.get("*splat", (_req, res) => {
    res.sendFile(path.join(staticDir, "index.html"));
  });

  logger.info({ staticDir, isProduction, buildExists }, "Serving frontend static files");
}

export default app;
