/**
 * In-memory commission store.
 * Records every contract bought through this app's markup percentage.
 * Resets on server restart — this is intentional (ephemeral analytics only).
 */

export interface CommissionRecord {
  id: string;
  timestamp: string;
  symbol: string;
  contract_type: string;
  stake: number;
  buy_price: number;
  payout: number;
  markup_pct: number;
  commission_usd: number;
}

const MAX_RECORDS = 5_000;
const _records: CommissionRecord[] = [];
let _totalCommission = 0;
let _totalTrades     = 0;
let _totalVolume     = 0;

const CONTRACT_LABELS: Record<string, string> = {
  DIGITEVEN: "Even", DIGITODD: "Odd", DIGITOVER: "Over", DIGITUNDER: "Under",
  DIGITMATCH: "Match", DIGITDIFF: "Differ", CALL: "Rise", PUT: "Fall",
  HIGHERTICK: "High Tick", LOWERTICK: "Low Tick",
};

export function recordTrade(
  data: Omit<CommissionRecord, "id" | "timestamp" | "commission_usd">,
): void {
  // App markup is charged on the buy_price itself: commission ≈ buy_price × markup / (100 + markup)
  // Simpler approximation used here: markup_pct % of stake (close enough for analytics)
  const commission = parseFloat((data.stake * (data.markup_pct / 100)).toFixed(6));
  const record: CommissionRecord = {
    ...data,
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    timestamp: new Date().toISOString(),
    commission_usd: commission,
  };
  _records.unshift(record);
  if (_records.length > MAX_RECORDS) _records.pop();
  _totalCommission += commission;
  _totalTrades++;
  _totalVolume += data.stake;
}

export function getCommissionStats() {
  const byType:   Record<string, { count: number; commission: number; volume: number }> = {};
  const bySymbol: Record<string, { count: number; commission: number }>                 = {};
  const byDay:    Record<string, { count: number; commission: number }>                 = {};

  for (const r of _records) {
    const label = CONTRACT_LABELS[r.contract_type] ?? r.contract_type;

    if (!byType[label]) byType[label] = { count: 0, commission: 0, volume: 0 };
    byType[label].count++;
    byType[label].commission += r.commission_usd;
    byType[label].volume     += r.stake;

    if (!bySymbol[r.symbol]) bySymbol[r.symbol] = { count: 0, commission: 0 };
    bySymbol[r.symbol].count++;
    bySymbol[r.symbol].commission += r.commission_usd;

    const day = r.timestamp.slice(0, 10);
    if (!byDay[day]) byDay[day] = { count: 0, commission: 0 };
    byDay[day].count++;
    byDay[day].commission += r.commission_usd;
  }

  const r4 = (n: number) => parseFloat(n.toFixed(4));

  return {
    total_trades:          _totalTrades,
    total_commission_usd:  r4(_totalCommission),
    total_volume_usd:      r4(_totalVolume),
    by_contract_type: Object.entries(byType)
      .sort((a, b) => b[1].count - a[1].count)
      .map(([type, v]) => ({ type, count: v.count, commission: r4(v.commission), volume: r4(v.volume) })),
    by_symbol: Object.entries(bySymbol)
      .sort((a, b) => b[1].count - a[1].count)
      .map(([symbol, v]) => ({ symbol, count: v.count, commission: r4(v.commission) })),
    by_day: Object.entries(byDay)
      .sort((a, b) => b[0].localeCompare(a[0]))
      .slice(0, 30)
      .map(([day, v]) => ({ day, count: v.count, commission: r4(v.commission) })),
    recent_trades: _records.slice(0, 100),
  };
}

export function clearCommissionStore(): void {
  _records.length  = 0;
  _totalCommission = 0;
  _totalTrades     = 0;
  _totalVolume     = 0;
}
