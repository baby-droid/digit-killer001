import { useQuery } from "@tanstack/react-query";
import { useSymbol } from "@/context/SymbolContext";
import { ArrowUp, ArrowDown, RefreshCw, AlertCircle, Brain, BarChart2 } from "lucide-react";
import AutoTradePanel from "@/components/AutoTradePanel";
import DerivConnectionBar from "@/components/DerivConnectionBar";

interface RunDist { length: number; count: number; pct: number }
interface ContractSig { signal: string; confidence: number; duration: number; reasons: string[]; risk_level: string; psych_score?: number; psych_favors_win?: boolean; psych_win_rate_10?: number; psych_streak?: number; }
interface OnlyUpDownData {
  symbol: string;
  current_price: number;
  sample_size: number;
  last_updated: string;
  autocorrelation: { lag1: number; interpretation: string; signal: string };
  trend: { direction: string; up_pct: number; down_pct: number };
  only_up_down: {
    current_direction: string;
    current_streak: number;
    avg_up_run: number;
    avg_down_run: number;
    prob_extend: number;
    up_run_dist: RunDist[];
    down_run_dist: RunDist[];
    total_up_runs: number;
    total_down_runs: number;
    only_up: ContractSig;
    only_down: ContractSig;
  };
  price_changes: string[];
}

const CONF_COLOR = (c: number) => c >= 70 ? "#00c853" : c >= 52 ? "#ffd600" : "#ff9100";

function RunDistChart({ dist, color, label }: { dist: RunDist[]; color: string; label: string }) {
  const maxPct = Math.max(...dist.map((d) => d.pct), 1);
  return (
    <div>
      <div className="font-rajdhani text-[10px] tracking-widest uppercase mb-2" style={{ color }}>{label} Run Distribution</div>
      <div className="space-y-1.5">
        {dist.filter((d) => d.count > 0 || d.length <= 6).map((d) => (
          <div key={d.length} className="flex items-center gap-2">
            <span className="w-5 text-right font-orbitron text-[10px] text-muted-foreground">{d.length}</span>
            <div className="flex-1 h-4 bg-muted/20 rounded relative overflow-hidden">
              <div
                className="h-full rounded transition-all duration-500"
                style={{ width: `${(d.pct / maxPct) * 100}%`, background: color, opacity: d.count > 0 ? 0.75 : 0.2 }}
              />
            </div>
            <span className="w-12 text-right font-orbitron text-[10px]" style={{ color: d.count > 0 ? color : "#444" }}>
              {d.pct.toFixed(1)}%
            </span>
            <span className="w-8 text-right font-rajdhani text-[9px] text-muted-foreground">{d.count}×</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function SignalCard({ data, type }: { data: ContractSig; type: "up" | "down" }) {
  const color = type === "up" ? "#00c853" : "#ff1744";
  const isBuy = data.signal.startsWith("BUY");
  return (
    <div className="cyber-card p-5 space-y-4 relative"
      style={{ border: `1px solid ${color}30`, boxShadow: isBuy ? `0 0 20px ${color}10` : "none" }}>
      <div className="absolute top-0 left-0 right-0 h-0.5 rounded-t"
        style={{ background: isBuy ? `linear-gradient(90deg,transparent,${color},transparent)` : "none" }} />
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {type === "up" ? <ArrowUp size={18} style={{ color }} /> : <ArrowDown size={18} style={{ color }} />}
          <span className="font-orbitron text-sm font-bold" style={{ color }}>
            ONLY {type === "up" ? "UP" : "DOWN"}
          </span>
        </div>
        <span className={`risk-${data.risk_level.toLowerCase()} text-xs`}>{data.risk_level}</span>
      </div>

      <div className="text-center py-3 rounded-lg" style={{ background: isBuy ? `${color}0a` : "rgba(255,255,255,0.02)" }}>
        <div className="font-orbitron text-2xl font-black"
          style={{ color: isBuy ? color : "#555", textShadow: isBuy ? `0 0 16px ${color}60` : "none" }}>
          {data.signal}
        </div>
        <div className="font-rajdhani text-[10px] text-muted-foreground mt-1 tracking-wider">{data.duration} TICK CONTRACT</div>
      </div>

      <div>
        <div className="flex justify-between text-[10px] font-rajdhani text-muted-foreground mb-1.5 tracking-widest">
          <span>CONFIDENCE</span>
          <span className="font-orbitron" style={{ color: CONF_COLOR(data.confidence) }}>{data.confidence.toFixed(1)}%</span>
        </div>
        <div className="h-2 bg-muted/30 rounded-full overflow-hidden">
          <div className="h-full rounded-full transition-all duration-700"
            style={{ width: `${data.confidence}%`, background: `linear-gradient(90deg,${color}60,${color})`, boxShadow: `0 0 8px ${color}60` }} />
        </div>
      </div>

      <div className="space-y-1.5">
        {data.reasons.map((r, i) => (
          <div key={i} className="flex items-start gap-2">
            <div className="w-1 h-1 rounded-full mt-1.5 flex-shrink-0" style={{ background: color }} />
            <span className="font-rajdhani text-[11px] text-foreground/75">{r}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function DirectionStream({ changes }: { changes: string[] }) {
  const last40 = changes.slice(-40);
  return (
    <div className="cyber-card p-4">
      <div className="flex items-center gap-2 mb-3">
        <BarChart2 size={13} className="text-primary" />
        <span className="font-rajdhani text-xs text-muted-foreground tracking-widest uppercase">
          Direction Stream — Last {last40.length} Moves
        </span>
      </div>
      <div className="flex flex-wrap gap-1">
        {last40.map((d, i) => {
          const isLast = i === last40.length - 1;
          return (
            <div
              key={i}
              className="w-6 h-6 rounded flex items-center justify-center text-[10px] font-orbitron font-bold transition-all"
              style={{
                background: d === "UP" ? "rgba(0,200,83,0.15)" : "rgba(255,23,68,0.15)",
                border: `1px solid ${d === "UP" ? "rgba(0,200,83,0.3)" : "rgba(255,23,68,0.3)"}`,
                color: d === "UP" ? "#00c853" : "#ff1744",
                boxShadow: isLast ? `0 0 8px ${d === "UP" ? "#00c853" : "#ff1744"}` : "none",
              }}
            >
              {d === "UP" ? "▲" : "▼"}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default function OnlyUpDownPage() {
  const { symbol } = useSymbol();

  const { data, isLoading, refetch } = useQuery<OnlyUpDownData>({
    queryKey: ["/api/enhanced-tick-analysis", symbol, "only"],
    queryFn: async () => {
      const res = await fetch(`/api/enhanced-tick-analysis?symbol=${symbol}&count=500`);
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
    enabled: !!symbol,
    refetchInterval: 3000,
    staleTime: 2000,
  });

  const oud = data?.only_up_down;
  const streakColor = oud?.current_direction === "UP" ? "#00c853" : "#ff1744";
  const autocorrColor = data?.autocorrelation.interpretation === "trending" ? "#00c853"
    : data?.autocorrelation.interpretation === "mean_reverting" ? "#448aff" : "#ffd600";

  return (
    <div className="space-y-4 animate-fade-in-up" data-testid="page-only-up-down">
      <div className="flex items-start justify-between">
        <div>
          <h2 className="font-orbitron text-lg font-bold text-primary tracking-wider">ONLY UP / ONLY DOWN</h2>
          <p className="font-rajdhani text-xs text-muted-foreground tracking-widest uppercase mt-0.5">
            Run-Length Analysis · Autocorrelation · Streak Statistics
          </p>
        </div>
        <button onClick={() => refetch()} className="p-2 rounded-md bg-primary/10 border border-primary/30 text-primary hover:bg-primary/20 transition-colors">
          <RefreshCw size={14} className={isLoading ? "animate-spin" : ""} />
        </button>
      </div>

      {!symbol && (
        <div className="cyber-card p-6 flex items-center gap-3 text-muted-foreground">
          <AlertCircle size={16} /><span className="font-rajdhani text-sm">Select a symbol.</span>
        </div>
      )}

      {isLoading && !data && (
        <div className="flex justify-center py-16 flex-col items-center gap-4">
          <Brain size={36} className="text-primary animate-pulse" />
          <span className="font-rajdhani text-xs text-muted-foreground tracking-widest">COMPUTING RUN-LENGTH STATISTICS…</span>
        </div>
      )}

      {data && oud && (
        <>
          {/* Stats strip */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div className="cyber-card p-3">
              <div className="font-rajdhani text-[10px] text-muted-foreground tracking-widest uppercase">Current Streak</div>
              <div className="font-orbitron text-3xl font-black mt-1" style={{ color: streakColor }}>
                {oud.current_streak}×
              </div>
              <div className="font-rajdhani text-[10px] mt-0.5" style={{ color: streakColor }}>
                {oud.current_direction}
              </div>
            </div>
            <div className="cyber-card p-3">
              <div className="font-rajdhani text-[10px] text-muted-foreground tracking-widest uppercase">Prob. Extend</div>
              <div className="font-orbitron text-xl font-bold mt-1" style={{ color: CONF_COLOR(oud.prob_extend) }}>
                {oud.prob_extend.toFixed(1)}%
              </div>
              <div className="font-rajdhani text-[10px] text-muted-foreground">of continuing</div>
            </div>
            <div className="cyber-card p-3">
              <div className="font-rajdhani text-[10px] text-muted-foreground tracking-widest uppercase">Avg Run Length</div>
              <div className="font-orbitron text-xl font-bold text-primary mt-1">
                {oud.current_direction === "UP" ? oud.avg_up_run.toFixed(1) : oud.avg_down_run.toFixed(1)}
              </div>
              <div className="font-rajdhani text-[10px] text-muted-foreground">ticks avg ({oud.current_direction})</div>
            </div>
            <div className="cyber-card p-3">
              <div className="font-rajdhani text-[10px] text-muted-foreground tracking-widest uppercase">Autocorrelation</div>
              <div className="font-orbitron text-sm font-bold mt-1" style={{ color: autocorrColor }}>
                {data.autocorrelation.signal}
              </div>
              <div className="font-rajdhani text-[10px] text-muted-foreground">r={data.autocorrelation.lag1}</div>
            </div>
          </div>

          {/* Direction stream */}
          <DirectionStream changes={data.price_changes} />

          {/* Run distributions */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="cyber-card p-4">
              <RunDistChart dist={oud.up_run_dist} color="#00c853" label="UP" />
              <div className="mt-3 pt-3 border-t border-border/30 flex justify-between font-rajdhani text-[10px] text-muted-foreground">
                <span>Total up-runs: <span className="text-green-400 font-bold">{oud.total_up_runs}</span></span>
                <span>Avg: <span className="text-green-400 font-bold">{oud.avg_up_run.toFixed(1)} ticks</span></span>
              </div>
            </div>
            <div className="cyber-card p-4">
              <RunDistChart dist={oud.down_run_dist} color="#ff1744" label="DOWN" />
              <div className="mt-3 pt-3 border-t border-border/30 flex justify-between font-rajdhani text-[10px] text-muted-foreground">
                <span>Total down-runs: <span className="text-red-400 font-bold">{oud.total_down_runs}</span></span>
                <span>Avg: <span className="text-red-400 font-bold">{oud.avg_down_run.toFixed(1)} ticks</span></span>
              </div>
            </div>
          </div>

          {/* Signal cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <SignalCard data={oud.only_up} type="up" />
            <SignalCard data={oud.only_down} type="down" />
          </div>

          {/* Deriv Connection + Auto Trade */}
          <DerivConnectionBar />
          <AutoTradePanel
            symbol={symbol}
            pageLabel="Only Up / Only Down"
            signals={[
              {
                label: "Only Up (CALL)", contract_type: "CALL",
                confidence: oud.only_up.confidence, ticks: oud.only_up.duration,
                psych_favors_win: oud.only_up.psych_favors_win,
                psych_score: oud.only_up.psych_score,
                psych_win_rate_10: oud.only_up.psych_win_rate_10,
                psych_streak: oud.only_up.psych_streak,
              },
              {
                label: "Only Down (PUT)", contract_type: "PUT",
                confidence: oud.only_down.confidence, ticks: oud.only_down.duration,
                psych_favors_win: oud.only_down.psych_favors_win,
                psych_score: oud.only_down.psych_score,
                psych_win_rate_10: oud.only_down.psych_win_rate_10,
                psych_streak: oud.only_down.psych_streak,
              },
            ]}
          />

          <div className="text-center">
            <p className="font-rajdhani text-[10px] text-muted-foreground tracking-widest">
              Updated {new Date(data.last_updated).toLocaleTimeString()} · {data.sample_size.toLocaleString()} ticks · Not financial advice
            </p>
          </div>
        </>
      )}
    </div>
  );
}
