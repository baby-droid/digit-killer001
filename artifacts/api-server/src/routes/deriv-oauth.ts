import { Router } from "express";
import { logger } from "../lib/logger";

const router = Router();

const DERIV_AUTH_TOKEN_URL = "https://auth.deriv.com/oauth2/token";

const CLIENT_ID = process.env.DERIV_OAUTH_CLIENT_ID ?? "33rtqtfBfgRZqEpvayxel";
const APP_ID    = process.env.DERIV_APP_ID ?? "1089";

router.get("/deriv/oauth/config", (req, res): void => {
  const host  = req.headers["x-forwarded-host"] ?? req.get("host") ?? "";
  const proto = req.headers["x-forwarded-proto"] ?? req.protocol ?? "https";
  const redirectUri = `${proto}://${host}/callback`;
  res.json({ client_id: CLIENT_ID, app_id: APP_ID, redirect_uri: redirectUri, configured: !!CLIENT_ID });
});

router.post("/deriv/oauth/exchange", async (req, res): Promise<void> => {
  const { code, code_verifier, redirect_uri } = req.body as {
    code?: string;
    code_verifier?: string;
    redirect_uri?: string;
  };

  if (!code || !code_verifier || !redirect_uri) {
    res.status(400).json({ error: "code, code_verifier, and redirect_uri are required" });
    return;
  }

  try {
    const params = new URLSearchParams({
      grant_type:    "authorization_code",
      client_id:     CLIENT_ID,
      code,
      code_verifier,
      redirect_uri,
    });

    const response = await fetch(DERIV_AUTH_TOKEN_URL, {
      method:  "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body:    params.toString(),
    });

    const data = await response.json() as Record<string, unknown>;

    if (!response.ok) {
      const errMsg = String(data.error_description ?? data.error ?? "Token exchange failed");
      logger.warn({ errMsg, status: response.status }, "OAuth token exchange failed");
      res.status(response.status).json({ error: errMsg });
      return;
    }

    res.json({ access_token: data.access_token, expires_in: data.expires_in });
  } catch (err) {
    logger.error({ err }, "OAuth token exchange error");
    res.status(500).json({ error: "Token exchange failed — check server logs" });
  }
});

export default router;
