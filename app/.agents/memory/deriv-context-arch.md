---
name: Global Deriv WS context
description: DerivContext provides a single shared WebSocket for all trading pages; architecture decisions for the context.
---

# Global Deriv WS Context Architecture

**Rule:** ONE WebSocket connection is shared across the entire app via `DerivContext` in `artifacts/digit-killer/src/context/DerivContext.tsx`. All trading components call `useDerivContext()`.

**Why:** Prevents multiple simultaneous WebSocket connections when navigating between pages. The user connects once and all pages benefit.

**How to apply:**
- `DerivProvider` wraps the entire app in `App.tsx` (inside `SymbolProvider`, outside `WouterRouter`).
- Every trading page imports `DerivConnectionBar` from `@/components/DerivConnectionBar` and renders it above its `AutoTradePanel`. This gives the user the connection UI on every page.
- `DerivContext` auto-restores `localStorage.getItem("deriv_token")` on mount — no extra connect call needed.
- `subscribe(msgType, cb)` is used for real-time streams (balance, proposal_open_contract). Returns an unsubscribe function.
- `request(msg)` is promise-based with 25s timeout and proper error propagation.
