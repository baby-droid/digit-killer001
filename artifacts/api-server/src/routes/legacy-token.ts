import { Router, type IRouter } from "express";
import { logger } from "../lib/logger";

const router: IRouter = Router();

/**
 * GET /api/deriv/legacy-token
 * Returns the platform's built-in legacy Deriv trading token so the frontend
 * can offer a one-click "Legacy API" connect button without the token appearing
 * in frontend source code or build artefacts.
 */
router.get("/deriv/legacy-token", (req, res): void => {
  const token = process.env["DERIV_LEGACY_TOKEN"];
  if (!token) {
    req.log.warn("DERIV_LEGACY_TOKEN env var not set");
    res.status(503).json({ error: "Legacy token not configured on this server." });
    return;
  }
  logger.debug({ ip: req.ip }, "Legacy token requested");
  res.json({ token });
});

export default router;
