import { Router } from "express";
import { logger } from "../lib/logger";

const router = Router();

const DERIV_AUTH_TOKEN_URL = "https://auth.deriv.com/oauth2/token";
const DERIV_REST_BASE      = "https://api.derivws.com";

const CLIENT_ID = process.env.DERIV_OAUTH_CLIENT_ID ?? "33rtqtfBfgRZqEpvayxel";
const APP_ID    = process.env.DERIV_APP_ID ?? "1089";

function getRedirectUri(req: Parameters<typeof router.get>[1] extends (req: infer R, ...args: unknown[]) => unknown ? R : never): string {
  const host  = req.headers["x-forwarded-host"] ?? req.get("host") ?? "";
  const proto = (req.headers["x-forwarded-proto"] as string | undefined)?.split(",")[0]?.trim()
    ?? req.protocol
    ?? "https";
  return `${proto}://${host}/callback`;
}

// ── GET /api/deriv/oauth/config ──────────────────────────────────────────────
// Returns OAuth configuration including the server-side redirect_uri.
router.get("/deriv/oauth/config", (req, res): void => {
  const redirectUri = getRedirectUri(req);
  res.json({
    client_id:    CLIENT_ID,
    app_id:       APP_ID,
    redirect_uri: redirectUri,
    configured:   !!CLIENT_ID,
  });
});

// ── GET /api/deriv/oauth/login-url ───────────────────────────────────────────
// Returns a ready-to-use legacy OAuth login URL (works with any redirect_uri —
// no pre-registration needed because we use the public app_id 1089).
router.get("/deriv/oauth/login-url", (req, res): void => {
  const redirectUri = getRedirectUri(req);
  const legacyUrl =
    `https://oauth.deriv.com/oauth2/authorize` +
    `?app_id=${APP_ID}` +
    `&redirect_uri=${encodeURIComponent(redirectUri)}`;

  res.json({ url: legacyUrl, redirect_uri: redirectUri, app_id: APP_ID });
});

// ── POST /api/deriv/oauth/exchange ───────────────────────────────────────────
// Exchanges an OAuth 2.0 PKCE authorization code for an access_token.
// Used by the new auth.deriv.com OAuth 2.0 PKCE flow only.
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

// ── GET /api/deriv/oauth/accounts ────────────────────────────────────────────
// Lists Deriv accounts associated with the given Bearer access_token.
// Used after PKCE OAuth to discover the accountId needed for OTP.
router.get("/deriv/oauth/accounts", async (req, res): Promise<void> => {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) {
    res.status(401).json({ error: "Bearer token required in Authorization header" });
    return;
  }

  try {
    const response = await fetch(`${DERIV_REST_BASE}/trading/v1/options/accounts`, {
      headers: {
        "Deriv-App-ID":  APP_ID,
        "Authorization": authHeader,
      },
    });

    const data = await response.json() as Record<string, unknown>;

    if (!response.ok) {
      const errMsg = String((data as Record<string, Record<string, unknown>>).error?.message ?? "Failed to fetch accounts");
      logger.warn({ errMsg, status: response.status }, "Deriv accounts fetch failed");
      res.status(response.status).json({ error: errMsg });
      return;
    }

    res.json(data);
  } catch (err) {
    logger.error({ err }, "Deriv accounts fetch error");
    res.status(500).json({ error: "Failed to fetch Deriv accounts" });
  }
});

// ── POST /api/deriv/oauth/otp ────────────────────────────────────────────────
// Obtains a One-Time Password (OTP) WebSocket URL for an account.
// This is required for the new authenticated Deriv WebSocket API.
// The returned `otp_url` can be used directly to open an authenticated WS.
router.post("/deriv/oauth/otp", async (req, res): Promise<void> => {
  const { access_token, account_id } = req.body as {
    access_token?: string;
    account_id?: string;
  };

  if (!access_token || !account_id) {
    res.status(400).json({ error: "access_token and account_id are required" });
    return;
  }

  try {
    const response = await fetch(
      `${DERIV_REST_BASE}/trading/v1/options/accounts/${account_id}/otp`,
      {
        method:  "POST",
        headers: {
          "Deriv-App-ID":  APP_ID,
          "Authorization": `Bearer ${access_token}`,
          "Content-Type":  "application/json",
        },
      }
    );

    const data = await response.json() as Record<string, unknown>;

    if (!response.ok) {
      const errMsg = String((data as Record<string, Record<string, unknown>>).error?.message ?? "OTP generation failed");
      logger.warn({ errMsg, status: response.status, account_id }, "OTP generation failed");
      res.status(response.status).json({ error: errMsg });
      return;
    }

    const otpData = (data as Record<string, Record<string, unknown>>).data ?? data;
    logger.info({ account_id }, "OTP generated successfully");
    res.json({ otp_url: otpData.url, account_id });
  } catch (err) {
    logger.error({ err }, "OTP generation error");
    res.status(500).json({ error: "OTP generation failed — check server logs" });
  }
});

export default router;
