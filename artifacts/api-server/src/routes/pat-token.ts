import { Router, type IRouter } from "express";
import { logger } from "../lib/logger";

const router: IRouter = Router();

/**
 * GET /api/deriv/pat-token
 * Returns the platform's Beta API PAT token so the frontend can use it
 * for authenticated Deriv WebSocket connections without exposing it in
 * frontend source code or build artifacts.
 */
router.get("/deriv/pat-token", (req, res): void => {
  const token = process.env["DERIV_PAT_TOKEN"];
  if (!token) {
    req.log.warn("DERIV_PAT_TOKEN env var not set");
    res.status(503).json({ error: "PAT token not configured on this server." });
    return;
  }
  logger.debug({ ip: req.ip }, "PAT token requested");
  res.json({ token });
});

export default router;
