---
name: Trade engine accuracy
description: How accurate win/loss detection works; bulk trade logic; tradeEngine.ts conventions.
---

# Trade Engine — Win/Loss Accuracy and Bulk Trades

**Rule:** Never use time-based polling for contract settlement. Always use `proposal_open_contract` subscription.

**Why:** Time polling guesses when a contract settles and may read stale state. The subscription receives `is_sold: 1` exactly when Deriv settles the contract, giving accurate `profit` values.

**Implementation in `artifacts/digit-killer/src/lib/tradeEngine.ts`:**
1. `buy` → get `contract_id`
2. Send `{ proposal_open_contract: 1, subscribe: 1, contract_id }` via `request()`
3. In the `subscribe("proposal_open_contract", cb)` listener, check `poc.contract_id === contract_id && poc.is_sold === 1`
4. `profit > 0` = WON, `profit <= 0` = LOST — never infer from anything else
5. Fallback: if the `request()` for subscription rejects (WS not ready), poll once after `(ticks + 5) * 1000ms`

**Bulk trades:**
- `executeBulk(specs, request, subscribe, currency, onUpdate)` fires ALL proposals in parallel via `Promise.allSettled`, then ALL buys in parallel, then subscribes to ALL contracts simultaneously.
- Same market → same tick stream → all N contracts on the same market reflect the same current digit.
- Each contract gets its own subscription listener keyed by `contract_id`.

**DerivConnectionBar:**
- Required on every trading page above `AutoTradePanel`.
- Imports: `import DerivConnectionBar from "@/components/DerivConnectionBar";`
- Placement: directly before `<AutoTradePanel ... />`
