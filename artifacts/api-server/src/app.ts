import express, { type Express } from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import path from "path";
import { fileURLToPath } from "url";
import router from "./routes";
import { logger } from "./lib/logger";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

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

// Allow the Vite dev-server origin to call the API in development.
// In production both frontend and API are on the same origin, so CORS is not
// strictly required — but keeping it enabled is harmless.
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use("/api", router);

// ── Static frontend in production ────────────────────────────────────────────
// When NODE_ENV=production the API server also serves the built Vite output so
// that a single port handles everything — making the deployed app identical to
// the local preview.  The catch-all must come AFTER all /api routes.
if (process.env["NODE_ENV"] === "production") {
  const staticDir = path.resolve(__dirname, "../../digit-killer/dist/public");
  app.use(express.static(staticDir, { maxAge: "1d" }));

  // SPA fallback — let React Router handle all non-asset routes
  app.get("*", (_req, res) => {
    res.sendFile(path.join(staticDir, "index.html"));
  });

  logger.info({ staticDir }, "Serving frontend static files");
}

export default app;
