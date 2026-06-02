import { Router } from "express";
import { logger } from "../lib/logger";

const router = Router();

const DERIV_API_BASE = "https://api.derivws.com";
const DERIV_AUTH_TOKEN_URL = "https://auth.deriv.com/oauth2/token";

router.get("/deriv/oauth/config", (req, res): void => {
  const clientId = process.env.DERIV_OAUTH_CLIENT_ID ?? "";
  const appId = process.env.DERIV_APP_ID ?? "1089";
  const host = req.headers["x-forwarded-host"] ?? req.get("host") ?? "";
  const proto = req.headers["x-forwarded-proto"] ?? req.protocol ?? "https";
  const redirectUri = `${proto}://${host}/auth/callback`;
  res.json({ client_id: clientId, app_id: appId, redirect_uri: redirectUri, configured: !!clientId });
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

  const clientId = process.env.DERIV_OAUTH_CLIENT_ID;
  if (!clientId) {
    res.status(500).json({ error: "DERIV_OAUTH_CLIENT_ID is not configured on the server. Set it in Replit Secrets." });
    return;
  }

  try {
    const params = new URLSearchParams({
      grant_type: "authorization_code",
      client_id: clientId,
      code,
      code_verifier,
      redirect_uri,
    });

    const response = await fetch(DERIV_AUTH_TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: params.toString(),
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

router.get("/deriv/accounts", async (req, res): Promise<void> => {
  const authHeader = req.headers.authorization;
  const appId = process.env.DERIV_APP_ID ?? "1089";

  if (!authHeader) {
    res.status(401).json({ error: "Authorization header required" });
    return;
  }

  try {
    const response = await fetch(`${DERIV_API_BASE}/trading/v1/options/accounts`, {
      headers: {
        Authorization: authHeader,
        "Deriv-App-ID": appId,
      },
    });

    const data = await response.json() as Record<string, unknown>;

    if (!response.ok) {
      res.status(response.status).json(data);
      return;
    }

    res.json(data);
  } catch (err) {
    logger.error({ err }, "Deriv accounts fetch error");
    res.status(500).json({ error: "Failed to fetch accounts" });
  }
});

router.post("/deriv/accounts/:accountId/reset-balance", async (req, res): Promise<void> => {
  const authHeader = req.headers.authorization;
  const accountId = Array.isArray(req.params.accountId) ? req.params.accountId[0] : req.params.accountId;
  const appId = process.env.DERIV_APP_ID ?? "1089";

  if (!authHeader) {
    res.status(401).json({ error: "Authorization header required" });
    return;
  }

  try {
    const response = await fetch(
      `${DERIV_API_BASE}/trading/v1/options/accounts/${accountId}/reset-balance`,
      {
        method: "POST",
        headers: {
          Authorization: authHeader,
          "Deriv-App-ID": appId,
          "Content-Type": "application/json",
        },
      }
    );

    const data = await response.json() as Record<string, unknown>;

    if (!response.ok) {
      res.status(response.status).json(data);
      return;
    }

    res.json(data);
  } catch (err) {
    logger.error({ err }, "Demo balance reset error");
    res.status(500).json({ error: "Failed to reset demo balance" });
  }
});

export default router;
