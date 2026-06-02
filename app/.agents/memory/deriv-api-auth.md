---
name: Deriv API authorization
description: Which Deriv WebSocket endpoints require the API token vs. not
---

The Deriv API token (stored as DERIV_API_TOKEN secret) is NOT needed for:
- `ticks_history` — public, works without `authorize`
- `active_symbols` — public, works without `authorize`

Using `authorize` on these endpoints causes "The token is invalid." errors
even with a valid token (the token scope may be demo/read-only and these
endpoints don't accept it at all).

**Why:** Deriv's public market data endpoints are unauthenticated. Token-based
auth is only needed for account, trading, and portfolio operations.

**How to apply:** Skip the `await sendAndReceive(ws, { authorize: API_TOKEN })`
call before `ticks_history` and `active_symbols` requests. Only call authorize
before account/trading endpoints.
