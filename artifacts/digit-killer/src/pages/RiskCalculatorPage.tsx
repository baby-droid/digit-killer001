import { useState, useMemo } from "react";
import { Calculator, TrendingUp, TrendingDown, AlertTriangle, Info } from "lucide-react";

// ─── Martingale Calculator (styled to match design spec) ──────────────────────
function MartingaleCalculator() {
  const [capital, setCapital] = useState<string>("");
  const num = parseFloat(capital) || 0;
  const stake = parseFloat((num * 0.02).toFixed(2));
  const takeProfit = parseFloat((stake * 5).toFixed(2));
  const stopLoss = parseFloat((stake * 4).toFixed(2));

  return (
    <div
      className="rounded-2xl p-6 space-y-4"
      style={{ background: "linear-gradient(135deg,#0d1b2a 0%,#0a1520 100%)", border: "1.5px solid rgba(0,180,255,0.18)", boxShadow: "0 8px 40px rgba(0,120,200,0.15)" }}
    >
      <h2 className="text-center font-orbitron font-bold tracking-[0.25em] text-lg" style={{ color: "#00cfff", letterSpacing: "0.25em" }}>
        MARTINGALE CALCULATOR
      </h2>

      {/* Capital input */}
      <div className="flex items-center gap-3">
        <label className="font-rajdhani text-sm font-bold whitespace-nowrap" style={{ color: "#b0c8e8", minWidth: "9rem" }}>
          Initial Capital ($):
        </label>
        <input
          type="number"
          min={0}
          step={10}
          value={capital}
          onChange={(e) => setCapital(e.target.value)}
          placeholder="Enter capital"
          className="flex-1 px-4 py-2.5 rounded-xl font-rajdhani text-sm text-center"
          style={{
            background: "rgba(0,150,255,0.07)",
            border: "1.5px solid rgba(0,180,255,0.25)",
            color: "#c8dff5",
            outline: "none",
          }}
          onFocus={(e) => (e.currentTarget.style.borderColor = "rgba(0,200,255,0.55)")}
          onBlur={(e) => (e.currentTarget.style.borderColor = "rgba(0,180,255,0.25)")}
        />
      </div>

      {/* Output rows */}
      {[
        { label: "Stake (2% of Capital):", value: stake.toFixed(2), accent: "#00cfff" },
        { label: "Take Profit (5× Stake):", value: takeProfit.toFixed(2), accent: "#00e5a0" },
        { label: "Stop Loss (4 Losses Sum):", value: stopLoss.toFixed(2), accent: "#ff5c7c" },
      ].map(({ label, value, accent }) => (
        <div
          key={label}
          className="flex items-center justify-between px-5 py-3 rounded-xl"
          style={{ background: "rgba(0,120,180,0.10)", border: "1px solid rgba(0,160,220,0.15)" }}
        >
          <span className="font-rajdhani text-sm font-semibold" style={{ color: "#8ab4d8" }}>{label}</span>
          <span className="font-orbitron text-base font-bold" style={{ color: accent }}>
            {num > 0 ? value : "0.00"}
          </span>
        </div>
      ))}

      {num > 0 && (
        <div className="pt-1 space-y-1">
          <p className="font-rajdhani text-[11px] text-center" style={{ color: "rgba(140,180,220,0.6)" }}>
            Risk {((stopLoss / num) * 100).toFixed(1)}% of capital · Target +{((takeProfit / num) * 100).toFixed(1)}% of capital
          </p>
        </div>
      )}
    </div>
  );
}

const CONTRACT_TYPES = [
  { id: "DIGITEVEN",  label: "Even",   payout: 95  },
  { id: "DIGITODD",   label: "Odd",    payout: 95  },
  { id: "DIGITOVER",  label: "Over",   payout: 95  },
  { id: "DIGITUNDER", label: "Under",  payout: 95  },
  { id: "DIGITMATCH", label: "Match",  payout: 800 },
  { id: "DIGITDIFF",  label: "Differ", payout: 5   },
  { id: "CALL",       label: "Rise",   payout: 85  },
  { id: "PUT",        label: "Fall",   payout: 85  },
];

const MARTINGALE_MULTIPLIERS = [1.5, 2, 2.5, 3] as const;

function fmt(n: number, dec = 2) {
  return n.toFixed(dec);
}

function Stat({ label, value, color, sub }: { label: string; value: string; color?: string; sub?: string }) {
  return (
    <div className="rounded-lg p-3" style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }}>
      <div className="font-rajdhani text-[10px] text-muted-foreground tracking-widest uppercase">{label}</div>
      <div className="font-orbitron text-lg font-bold mt-0.5" style={{ color: color ?? "#fff" }}>{value}</div>
      {sub && <div className="font-rajdhani text-[9px] text-muted-foreground mt-0.5">{sub}</div>}
    </div>
  );
}

function InfoRow({ label, detail }: { label: string; detail: string }) {
  return (
    <div className="flex items-start gap-2 py-1.5">
      <Info size={12} className="text-muted-foreground flex-shrink-0 mt-0.5" />
      <div>
        <span className="font-rajdhani text-xs font-bold text-foreground">{label}: </span>
        <span className="font-rajdhani text-xs text-muted-foreground">{detail}</span>
      </div>
    </div>
  );
}

export default function RiskCalculatorPage() {
  const [stake, setStake]           = useState(1);
  const [winRate, setWinRate]       = useState(52);
  const [payoutPct, setPayoutPct]   = useState(95);
  const [numTrades, setNumTrades]   = useState(100);
  const [contractType, setContractType] = useState("DIGITEVEN");
  const [martingale, setMartingale] = useState<number | null>(null);
  const [martMultiplier, setMartMultiplier] = useState<number>(2);
  const [maxLossStreak, setMaxLossStreak] = useState(5);

  const selectedContract = CONTRACT_TYPES.find((c) => c.id === contractType) ?? CONTRACT_TYPES[0];

  const calc = useMemo(() => {
    const p = winRate / 100;
    const q = 1 - p;
    const payoutRatio = payoutPct / 100;

    // Expected value per trade
    const ev = p * (stake * payoutRatio) - q * stake;
    const evPct = (ev / stake) * 100;

    // Expected total profit after N trades
    const expectedProfit = ev * numTrades;
    const expectedReturn = (expectedProfit / (stake * numTrades)) * 100;

    // Standard deviation (binomial)
    const stdPerTrade = stake * Math.sqrt(p * q) * Math.sqrt(1 + payoutRatio * payoutRatio);
    const stdTotal    = stdPerTrade * Math.sqrt(numTrades);

    // Kelly criterion: f* = (b*p - q) / b where b = payout ratio
    const b = payoutRatio;
    const kelly = Math.max(0, (b * p - q) / b);
    const kellyStake = kelly * 100; // as % of bankroll

    // Risk of ruin (simplified Gambler's Ruin)
    let riskOfRuin = 0;
    if (ev < 0) {
      // Negative EV — approaches 100% over enough trades
      const r = q / (p * payoutRatio);
      riskOfRuin = Math.min(99.9, 100 * (r > 1 ? 1 : r));
    } else {
      // Positive EV — small but nonzero ruin probability
      riskOfRuin = Math.max(0.1, (q / p) * 100 * (1 / numTrades) * 10);
    }

    // Sharpe ratio (simplified, risk-free = 0)
    const sharpe = stdTotal > 0 ? (expectedProfit / stdTotal) : 0;

    // Break-even win rate
    const breakEvenWR = (1 / (1 + payoutRatio)) * 100;

    // Maximum drawdown estimate (normal approximation)
    const maxDD = stdTotal * 2.5; // ~99% CI

    // Martingale analysis
    let martTotal = 0;
    let martRuin  = false;
    if (martingale !== null) {
      let balance  = 1000; // virtual bankroll
      let lossStreak = 0;
      let tradeStake = stake;
      for (let i = 0; i < numTrades; i++) {
        const win = Math.random() < p;
        if (win) { balance += tradeStake * payoutRatio; lossStreak = 0; tradeStake = stake; }
        else { balance -= tradeStake; lossStreak++; tradeStake *= martMultiplier; }
        if (lossStreak >= maxLossStreak || balance < 0) { martRuin = true; break; }
      }
      martTotal = balance - 1000;
    }

    return { ev, evPct, expectedProfit, expectedReturn, stdTotal, kelly, kellyStake,
      riskOfRuin, sharpe, breakEvenWR, maxDD, martTotal, martRuin };
  }, [stake, winRate, payoutPct, numTrades, martingale, martMultiplier, maxLossStreak]);

  const evIsPositive = calc.ev >= 0;

  return (
    <div className="space-y-6 animate-fade-in-up max-w-4xl" data-testid="page-risk-calculator">

      {/* Martingale Calculator (top section) */}
      <MartingaleCalculator />

      {/* Header */}
      <div className="flex items-center gap-2">
        <Calculator size={20} className="text-primary" />
        <div>
          <h2 className="font-orbitron text-lg font-bold text-primary tracking-wider">ADVANCED RISK CALCULATOR</h2>
          <p className="font-rajdhani text-[10px] text-muted-foreground tracking-widest uppercase">
            Expected Value · Kelly Criterion · Risk of Ruin
          </p>
        </div>
      </div>

      {/* Inputs */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Left column */}
        <div className="cyber-card p-4 space-y-4">
          <div className="font-rajdhani text-xs font-bold tracking-widest uppercase text-muted-foreground">
            Trade Parameters
          </div>

          {/* Contract type */}
          <div>
            <label className="block font-rajdhani text-[10px] text-muted-foreground tracking-widest uppercase mb-1.5">Contract Type</label>
            <div className="flex flex-wrap gap-1.5">
              {CONTRACT_TYPES.map((c) => (
                <button key={c.id} onClick={() => { setContractType(c.id); setPayoutPct(c.payout); }}
                  className="px-2.5 py-1 rounded font-rajdhani text-xs font-bold transition-all"
                  style={contractType === c.id
                    ? { background: "#00e5ff", color: "#050a0f" }
                    : { background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.12)", color: "#aaa" }}>
                  {c.label}
                </button>
              ))}
            </div>
          </div>

          {/* Stake */}
          <div>
            <label className="block font-rajdhani text-[10px] text-muted-foreground tracking-widest uppercase mb-1.5">
              Stake Per Trade: <span className="text-primary font-orbitron">${fmt(stake)}</span>
            </label>
            <input type="range" min={0.35} max={50} step={0.5} value={stake} onChange={(e) => setStake(parseFloat(e.target.value))}
              className="w-full accent-primary" />
            <div className="flex justify-between font-rajdhani text-[9px] text-muted-foreground mt-0.5">
              <span>$0.35</span><span>$50</span>
            </div>
          </div>

          {/* Payout % */}
          <div>
            <label className="block font-rajdhani text-[10px] text-muted-foreground tracking-widest uppercase mb-1.5">
              Payout %: <span className="text-primary font-orbitron">{payoutPct}%</span>
            </label>
            <input type="range" min={5} max={900} step={5} value={payoutPct} onChange={(e) => setPayoutPct(parseInt(e.target.value))}
              className="w-full accent-primary" />
            <div className="flex justify-between font-rajdhani text-[9px] text-muted-foreground mt-0.5">
              <span>5%</span><span className="text-muted-foreground">Default: {selectedContract.payout}%</span><span>900%</span>
            </div>
          </div>

          {/* Win rate */}
          <div>
            <label className="block font-rajdhani text-[10px] text-muted-foreground tracking-widest uppercase mb-1.5">
              Win Rate: <span className="font-orbitron" style={{ color: winRate > calc.breakEvenWR ? "#22c55e" : "#ef4444" }}>{winRate}%</span>
            </label>
            <input type="range" min={1} max={99} step={0.5} value={winRate} onChange={(e) => setWinRate(parseFloat(e.target.value))}
              className="w-full accent-primary" />
            <div className="flex justify-between font-rajdhani text-[9px] text-muted-foreground mt-0.5">
              <span>1%</span>
              <span style={{ color: "#facc15" }}>Break-even: {fmt(calc.breakEvenWR, 1)}%</span>
              <span>99%</span>
            </div>
          </div>

          {/* Number of trades */}
          <div>
            <label className="block font-rajdhani text-[10px] text-muted-foreground tracking-widest uppercase mb-1.5">
              Number of Trades: <span className="text-primary font-orbitron">{numTrades}</span>
            </label>
            <div className="flex gap-2 flex-wrap">
              {[10, 50, 100, 250, 500, 1000].map((n) => (
                <button key={n} onClick={() => setNumTrades(n)}
                  className="px-2.5 py-1 rounded font-orbitron text-xs font-bold transition-all"
                  style={numTrades === n
                    ? { background: "#00e5ff", color: "#050a0f" }
                    : { background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.12)", color: "#aaa" }}>
                  {n}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Right column — results */}
        <div className="space-y-3">
          {/* EV Alert */}
          <div className="rounded-xl p-4 border-2"
            style={{ background: evIsPositive ? "rgba(34,197,94,0.08)" : "rgba(239,68,68,0.08)",
              borderColor: evIsPositive ? "#22c55e" : "#ef4444" }}>
            <div className="flex items-center gap-2 mb-1">
              {evIsPositive ? <TrendingUp size={18} style={{ color: "#22c55e" }} /> : <TrendingDown size={18} style={{ color: "#ef4444" }} />}
              <span className="font-orbitron text-sm font-bold" style={{ color: evIsPositive ? "#22c55e" : "#ef4444" }}>
                {evIsPositive ? "POSITIVE EDGE" : "NEGATIVE EDGE"}
              </span>
            </div>
            <div className="font-orbitron text-2xl font-black" style={{ color: evIsPositive ? "#22c55e" : "#ef4444" }}>
              EV: {calc.ev >= 0 ? "+" : ""}{fmt(calc.ev)} / trade
            </div>
            <div className="font-rajdhani text-xs text-muted-foreground mt-1">
              {fmt(calc.evPct, 2)}% of stake per trade
            </div>
          </div>

          {/* Key metrics */}
          <div className="grid grid-cols-2 gap-2">
            <Stat label="Expected Profit" value={`${calc.expectedProfit >= 0 ? "+" : ""}$${fmt(calc.expectedProfit)}`}
              color={calc.expectedProfit >= 0 ? "#22c55e" : "#ef4444"}
              sub={`${fmt(calc.expectedReturn)}% return`} />
            <Stat label="Risk of Ruin" value={`${fmt(calc.riskOfRuin, 1)}%`}
              color={calc.riskOfRuin > 20 ? "#ef4444" : calc.riskOfRuin > 5 ? "#facc15" : "#22c55e"}
              sub="over all trades" />
            <Stat label="Kelly Fraction" value={`${fmt(calc.kellyStake, 1)}%`}
              color="#00e5ff"
              sub="of bankroll per trade" />
            <Stat label="Sharpe Ratio" value={fmt(calc.sharpe, 2)}
              color={calc.sharpe > 1 ? "#22c55e" : calc.sharpe > 0 ? "#facc15" : "#ef4444"}
              sub=">1 is good" />
            <Stat label="Std Deviation" value={`$${fmt(calc.stdTotal)}`}
              color="#fb8c00"
              sub={`over ${numTrades} trades`} />
            <Stat label="Max Drawdown Est" value={`$${fmt(calc.maxDD)}`}
              color="#e53935"
              sub="99% confidence" />
          </div>
        </div>
      </div>

      {/* Martingale section */}
      <div className="cyber-card p-4">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <AlertTriangle size={14} className="text-yellow-400" />
            <span className="font-rajdhani font-bold text-xs tracking-widest uppercase text-muted-foreground">
              Martingale Simulation
            </span>
          </div>
          <button onClick={() => setMartingale((p) => p === null ? Date.now() : null)}
            className="px-3 py-1 rounded font-orbitron text-xs font-bold transition-all"
            style={martingale !== null
              ? { background: "#facc15", color: "#000" }
              : { background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.12)", color: "#aaa" }}>
            {martingale !== null ? "ON" : "OFF"}
          </button>
        </div>
        {martingale !== null && (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block font-rajdhani text-[10px] text-muted-foreground tracking-widest uppercase mb-1.5">
                  Multiplier: <span className="text-primary font-orbitron">{martMultiplier}×</span>
                </label>
                <div className="flex gap-2">
                  {MARTINGALE_MULTIPLIERS.map((m) => (
                    <button key={m} onClick={() => setMartMultiplier(m)}
                      className="px-2.5 py-1 rounded font-orbitron text-xs font-bold transition-all"
                      style={martMultiplier === m
                        ? { background: "#facc15", color: "#000" }
                        : { background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.12)", color: "#aaa" }}>
                      {m}×
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="block font-rajdhani text-[10px] text-muted-foreground tracking-widest uppercase mb-1.5">
                  Max Loss Streak: <span className="text-primary font-orbitron">{maxLossStreak}</span>
                </label>
                <input type="range" min={3} max={15} step={1} value={maxLossStreak}
                  onChange={(e) => setMaxLossStreak(parseInt(e.target.value))}
                  className="w-full accent-yellow-400" />
              </div>
            </div>

            <div className={`rounded-xl p-3 border ${calc.martRuin ? "border-red-500" : "border-green-500"}`}
              style={{ background: calc.martRuin ? "rgba(239,68,68,0.08)" : "rgba(34,197,94,0.08)" }}>
              {calc.martRuin ? (
                <div className="font-orbitron text-sm font-bold text-red-400">
                  ⚠ RUIN — Bankroll blown within {numTrades} trades at {martMultiplier}× multiplier after {maxLossStreak} losses
                </div>
              ) : (
                <div className="font-orbitron text-sm font-bold text-green-400">
                  Estimated P/L: {calc.martTotal >= 0 ? "+" : ""}${fmt(calc.martTotal)} on $1,000 bankroll
                </div>
              )}
              <div className="font-rajdhani text-[10px] text-muted-foreground mt-1">
                Monte Carlo simulation · results vary each render
              </div>
            </div>

            {/* Required bankroll for martingale */}
            <div className="font-rajdhani text-xs text-muted-foreground">
              Bankroll needed for {maxLossStreak} consecutive losses at {martMultiplier}× multiplier:
              <span className="font-orbitron text-sm font-bold text-yellow-400 ml-2">
                ${fmt(stake * ((Math.pow(martMultiplier, maxLossStreak) - 1) / (martMultiplier - 1)))}
              </span>
            </div>
          </div>
        )}
      </div>

      {/* Educational info */}
      <div className="cyber-card p-4">
        <div className="font-rajdhani text-xs font-bold tracking-widest uppercase text-muted-foreground mb-2">
          How to Interpret
        </div>
        <div className="space-y-0.5">
          <InfoRow label="Expected Value (EV)" detail="Average profit per trade. Positive = mathematical edge in your favor." />
          <InfoRow label="Kelly Fraction" detail="Optimal stake as % of bankroll to maximize long-run growth. Full Kelly is aggressive — use ¼ or ½ Kelly in practice." />
          <InfoRow label="Risk of Ruin" detail="Probability of losing your entire bankroll over the defined trade count." />
          <InfoRow label="Break-even Win Rate" detail="The minimum win rate needed to not lose money at the current payout %." />
          <InfoRow label="Sharpe Ratio" detail="Return per unit of risk. >1 = good, >2 = great, <0 = losing proposition." />
          <InfoRow label="Max Drawdown" detail="Estimated worst-case loss from peak to trough (99% confidence interval)." />
        </div>
      </div>
    </div>
  );
}
