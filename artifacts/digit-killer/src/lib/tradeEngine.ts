/**
 * Trade Engine — handles accurate contract execution, settlement detection,
 * bulk trades, and timing. Used by AutoTradePanel, HedgeTradingPage, SpeedLabPage.
 */

export interface TradeResult {
  id: string;
  contract_id: number;
  label: string;
  symbol: string;
  contract_type: string;
  stake: number;
  ticks: number;
  status: "pending" | "open" | "settling" | "won" | "lost" | "error";
  profit: number | null;
  entry_spot?: number | string;
  exit_spot?: number | string;
  entry_tick_time?: number;
  exit_tick_time?: number;
  timestamp: string;
  confidence: number;
  bulk_group?: string;
  bulk_index?: number;
  bulk_total?: number;
}

export interface TradeSpec {
  contract_type: string;
  symbol: string;
  stake: number;
  ticks: number;
  barrier?: number | string;
  digit?: number;
  label: string;
  confidence: number;
  /** bulk_group ties multiple contracts together visually */
  bulk_group?: string;
  bulk_index?: number;
  bulk_total?: number;
}

/** Maximum parallel proposals/buys to avoid overwhelming the WS connection */
const PROPOSAL_CHUNK_SIZE = 5;

/** Send an array of promises in chunks, collecting allSettled results */
async function chunkedAllSettled<T>(
  items: Array<() => Promise<T>>,
  chunkSize: number,
): Promise<PromiseSettledResult<T>[]> {
  const results: PromiseSettledResult<T>[] = [];
  for (let i = 0; i < items.length; i += chunkSize) {
    const chunk = items.slice(i, i + chunkSize).map((fn) => fn());
    const chunkResults = await Promise.allSettled(chunk);
    results.push(...chunkResults);
    // Small delay between chunks to avoid WS message burst
    if (i + chunkSize < items.length) {
      await new Promise((r) => setTimeout(r, 80));
    }
  }
  return results;
}

/** Fire N proposals (chunked) then N buys (chunked) — returns all settled results */
export async function executeBulk(
  specs: TradeSpec[],
  request: (msg: Record<string, unknown>) => Promise<Record<string, unknown>>,
  subscribe: (msgType: string, cb: (m: Record<string, unknown>) => void) => () => void,
  currency: string,
  onUpdate: (update: Partial<TradeResult> & { id: string }) => void,
): Promise<TradeResult[]> {
  const tradeId = () => `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

  // Create pending records immediately so UI shows them
  const records: TradeResult[] = specs.map((spec, i) => ({
    id: tradeId(),
    contract_id: 0,
    label: spec.label,
    symbol: spec.symbol,
    contract_type: spec.contract_type,
    stake: spec.stake,
    ticks: spec.ticks,
    status: "pending",
    profit: null,
    timestamp: new Date().toISOString(),
    confidence: spec.confidence,
    bulk_group: spec.bulk_group,
    bulk_index: spec.bulk_index ?? i,
    bulk_total: spec.bulk_total ?? specs.length,
  }));

  records.forEach((r) => onUpdate(r));

  // ── Step 1: Get all proposals in chunks (max 5 at a time) ─────────────────
  const proposalFns = specs.map((spec, i) => () => {
    const msg: Record<string, unknown> = {
      proposal: 1,
      amount: spec.stake,
      basis: "stake",
      contract_type: spec.contract_type,
      currency,
      duration: spec.ticks,
      duration_unit: "t",
      symbol: spec.symbol,
      // No app_markup_percentage — not supported on this app_id and causes validation errors
    };
    if (spec.barrier !== undefined)  msg.barrier = String(spec.barrier);
    if (spec.digit   !== undefined)  msg.barrier = String(spec.digit);
    // For HIGHERTICK/LOWERTICK use selected_tick
    if (spec.contract_type === "HIGHERTICK" || spec.contract_type === "LOWERTICK") {
      delete msg.barrier;
      msg.selected_tick = spec.barrier ?? 3;
    }
    onUpdate({ id: records[i].id, status: "pending" });
    return request(msg);
  });

  const proposalResults = await chunkedAllSettled(proposalFns, PROPOSAL_CHUNK_SIZE);

  // ── Step 2: Buy all valid proposals in chunks (max speed) ─────────────────
  const buyResults = await chunkedAllSettled(
    proposalResults.map((result, i) => () => {
      if (result.status === "rejected") {
        onUpdate({ id: records[i].id, status: "error", profit: -specs[i].stake });
        return Promise.reject(result.reason as Error);
      }
      const prop = result.value.proposal as Record<string, unknown>;
      return request({ buy: prop.id as string, price: specs[i].stake });
    }),
    PROPOSAL_CHUNK_SIZE,
  );

  // ── Step 3: Subscribe to each contract for accurate settlement ────────────
  const settlePromises = buyResults.map((result, i) => {
    const rec = records[i];
    if (result.status === "rejected") {
      const settled: TradeResult = { ...rec, status: "error", profit: -specs[i].stake };
      onUpdate(settled);
      return Promise.resolve(settled);
    }

    const buy = result.value.buy as Record<string, unknown>;
    const contract_id = buy.contract_id as number;
    const entry_spot = buy.spot as number | undefined;
    const entry_tick_time = buy.purchase_time as number | undefined;

    onUpdate({ id: rec.id, contract_id, status: "open", entry_spot, entry_tick_time });

    return new Promise<TradeResult>((resolve) => {
      let unsub: (() => void) | null = null;

      unsub = subscribe("proposal_open_contract", (msg) => {
        const poc = msg.proposal_open_contract as Record<string, unknown> | undefined;
        if (!poc || (poc.contract_id as number) !== contract_id) return;

        if ((poc.is_sold as number) === 1 || poc.status === "sold") {
          const profit  = parseFloat(String(poc.profit ?? 0));
          const won     = profit > 0;
          const exit_spot = poc.exit_tick as number | string | undefined;
          const exit_tick_time = poc.exit_tick_time as number | undefined;
          const settled: TradeResult = {
            ...rec, contract_id, status: won ? "won" : "lost",
            profit: parseFloat(profit.toFixed(2)),
            entry_spot, exit_spot, entry_tick_time, exit_tick_time,
          };
          onUpdate(settled);
          unsub?.();
          resolve(settled);
        }
      });

      // Subscribe to contract stream from Deriv
      request({ proposal_open_contract: 1, subscribe: 1, contract_id })
        .catch(() => {
          // Fallback: poll once after expected duration
          setTimeout(async () => {
            try {
              const r = await request({ proposal_open_contract: 1, contract_id });
              const poc = r.proposal_open_contract as Record<string, unknown>;
              const profit = parseFloat(String(poc.profit ?? 0));
              const won = profit > 0;
              const settled: TradeResult = {
                ...rec, contract_id, status: won ? "won" : "lost",
                profit: parseFloat(profit.toFixed(2)),
                entry_spot,
              };
              onUpdate(settled);
              unsub?.();
              resolve(settled);
            } catch {
              const settled: TradeResult = { ...rec, contract_id, status: "lost", profit: -specs[i].stake, entry_spot };
              onUpdate(settled);
              unsub?.();
              resolve(settled);
            }
          }, (specs[i].ticks + 5) * 1000);
        });

      // Safety timeout — 3 minutes max
      setTimeout(() => {
        unsub?.();
        resolve({ ...rec, contract_id, status: "lost", profit: -specs[i].stake, entry_spot });
      }, 180_000);
    });
  });

  return Promise.all(settlePromises);
}

/** Next martingale stake */
export function nextStake(base: number, mult: number, streak: number): number {
  return parseFloat((base * Math.pow(mult, streak)).toFixed(2));
}

/** Generate a bulk group ID */
export function bulkGroupId(): string {
  return `bulk-${Date.now()}`;
}
