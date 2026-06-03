import express, { type Express } from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import path from "path";
import { existsSync } from "fs";
import { fileURLToPath } from "url";
import router from "./routes";
import { logger } from "./lib/logger";

const app: Express = express();

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use("/api", router);

// ── Production static file serving ─────────────────────────────────────────
// When the frontend has been built (pnpm --filter @workspace/digit-killer run build),
// serve it from the same Express process so that relative /api and /ws calls work
// without the Vite dev-proxy.  This is what makes the published app work the same
// as the preview.
const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);

// From artifacts/api-server/dist/ → artifacts/digit-killer/dist/public/
const FRONTEND_DIST = path.resolve(__dirname, "../../digit-killer/dist/public");

if (existsSync(path.join(FRONTEND_DIST, "index.html"))) {
  app.use(express.static(FRONTEND_DIST));

  // SPA catch-all: any path that isn't a file falls through to index.html
  app.use((_req, res) => {
    res.sendFile(path.join(FRONTEND_DIST, "index.html"));
  });

  logger.info({ path: FRONTEND_DIST }, "Serving frontend static files");
}

export default app;
