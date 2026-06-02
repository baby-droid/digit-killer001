---
name: Deriv OAuth token types
description: Two incompatible token types — legacy trading token vs PKCE Bearer token; routing and storage differ.
---

## The rule
There are two Deriv OAuth flows that produce **incompatible token types**. Never store both in `deriv_token` or they will silently fail each other.

### Legacy OAuth (`oauth.deriv.com/oauth2/authorize?app_id=1089`)
- Returns `?token1=TRADING_TOKEN&loginid1=CR...` directly in the callback URL.
- **Token works directly** with the legacy WS `authorize: token` call on `wss://ws.binaryws.com`.
- Works with **any** `redirect_uri` — no pre-registration needed because app_id=1089 is the public Deriv app.
- Stored in `localStorage.deriv_token`. DerivContext picks this up and sends `{type:"auth",token}` to ws-proxy.

### PKCE OAuth (`auth.deriv.com/oauth2/auth` with client_id)
- Returns `?code=...&state=...`. Code is exchanged for a **Bearer access_token** via POST to `auth.deriv.com/oauth2/token`.
- Bearer token is for the **new REST API** (`api.derivws.com`), NOT for legacy WS `authorize`.
- Requires `redirect_uri` to be **pre-registered** in Deriv developer dashboard for the specific `client_id`.
- After exchange: call `POST /api/deriv/oauth/accounts` (Bearer) to get account_id, then `POST /api/deriv/oauth/otp` to get an OTP WS URL.
- Stored in `localStorage.deriv_access_token` + `deriv_otp_account_id`. DerivContext uses `connectOtp()` path.

## WS Proxy message types
- Legacy path: `{type:"auth",token:TRADING_TOKEN}` → proxy sends `authorize` to legacy WS.
- OTP path: `{type:"otp_connect",otp_url:"wss://api.derivws.com/...?otp=..."}` → proxy connects directly, pre-authenticated.

## Why
`buildPkceUrl()` never throws (crypto is always available), so a try/catch around it will NEVER fall back to legacy. The PKCE flow was always running and storing a Bearer token as `deriv_token`, which then failed with `InvalidToken` on the legacy WS. Fix: make legacy the UI default; offer PKCE as an opt-in toggle.

## How to apply
- Default OAuth login button → legacy flow (no pre-registration needed, works everywhere).
- PKCE toggle shown as "advanced" option with a warning about redirect_uri registration.
- On mount: if `deriv_token` → `connect(token)`; else if `deriv_access_token`+`deriv_otp_account_id` → `connectOtp()`.
