import {
  useGetOverUnderSignals,
  getGetOverUnderSignalsQueryKey,
} from "@workspace/api-client-react";
import { useSymbol } from "@/context/SymbolContext";
import { TrendingUp, TrendingDown, AlertCircle, Activity } from "lucide-react";

interface FreqEntry { digit: number; count: number; pct: number }

interface SignalEntry {
  contract: string;
  recommended_ticks: string;
  risk_level: string;
  entry_digit: number;
  confidence: number;
  conditions_met: boolean;
  reason: string;
  reasons?: string[];
  win_probability?: number;
  recent_win_probability?: number;
  short_win_probability?: number;
  at_barrier?: boolean;
  winning_digits?: number[];
  losing_digits?: number[];
  trend?: string;
  lose_heat?: number;
  expected_lose_pct?: number;
}

const DIGIT_COLORS: Record<number, string> = {
  0: "#00e5d4", 1: "#448aff", 2: "#ce93d8", 3: "#00c853", 4: "#ff9100",
  5: "#00e5ff", 6: "#c6ff00", 7: "#e53935", 8: "#e91e8c", 9: "#fdd835",
};

const CONF_COLOR = (c: number) => c >= 70 ? "#00c853" : c >= 55 ? "#ffd600" : "#ff9100";

// ── Digit frequency bar chart ─────────────────────────────────────────────────
function FreqBars({ full, recent, short: shortF }: {
  full: FreqEntry[]; recent: FreqEntry[]; short: FreqEntry[]
}) {
  return (
    <div className="space-y-1">
      {full.map((f) => {
        const r = recent.find((x) => x.digit === f.digit);
        const s = shortF.find((x) => x.digit === f.digit);
        const color = DIGIT_COLORS[f.digit];
        const maxPct = 25; // scale to 25% max for visual clarity
        return (
          <div key={f.digit} className="flex items-center gap-2">
            <div
              className="w-5 h-5 rounded flex items-center justify-center font-orbitron text-[10px] font-bold flex-shrink-0"
              style={{ background: `${color}20`, color, border: `1px solid ${color}40` }}
            >
              {f.digit}
            </div>
            <div className="flex-1 flex flex-col gap-0.5">
              {/* Full history bar */}
              <div className="h-1.5 bg-muted/20 rounded-full overflow-hidden relative" title={`All: ${f.pct.toFixed(1)}%`}>
                <div className="h-full rounded-full" style={{ width: `${Math.min(100, (f.pct / maxPct) * 100)}%`, background: color, opacity: 0.7 }} />
                {/* 10% reference line */}
                <div className="absolute top-0 bottom-0 w-px bg-white/20" style={{ left: `${(10 / maxPct) * 100}%` }} />
              </div>
              {/* Recent bar */}
              <div className="h-1 bg-muted/10 rounded-full overflow-hidden" title={`Last 100: ${r?.pct.toFixed(1)}%`}>
                <div className="h-full rounded-full" style={{ width: `${Math.min(100, ((r?.pct ?? 0) / maxPct) * 100)}%`, background: color, opacity: 0.5 }} />
              </div>
            </div>
            <div className="w-14 flex flex-col text-right flex-shrink-0">
              <span className="font-orbitron text-[10px] font-bold" style={{ color }}>{f.pct.toFixed(1)}%</span>
              <span className="font-rajdhani text-[9px] text-muted-foreground">{r?.pct.toFixed(1)}%</span>
            </div>
          </div>
        );
      })}
      <div className="flex items-center gap-3 mt-2 pt-1 border-t border-border/20">
        <div className="flex items-center gap-1.5">
          <div className="w-8 h-1.5 rounded bg-white/40 opacity-70" />
          <span className="font-rajdhani text-[9px] text-muted-foreground">All {full.reduce((s,f)=>s+f.count,0)} ticks</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-8 h-1 rounded bg-white/25 opacity-50" />
          <span className="font-rajdhani text-[9px] text-muted-foreground">Last 100 ticks</span>
        </div>
        <div className="ml-auto font-rajdhani text-[9px] text-muted-foreground">10% ref line ┆</div>
      </div>
    </div>
  );
}

// ── Signal card ────────────────────────────────────────────────────────────────
function SignalCard({ entry, type }: { entry: SignalEntry; type: "over" | "under" }) {
  const isOver = type === "over";
  const accentColor = isOver ? "#00c853" : "#448aff";
  const isBuy = entry.conditions_met;
  const winPct = entry.win_probability ?? 0;
  const recentPct = entry.recent_win_probability ?? 0;
  const shortPct = entry.short_win_probability ?? 0;
  const trendDelta = recentPct - winPct;

  return (
    <div
      className="rounded-lg p-4 border transition-all relative overflow-hidden"
      style={{
        borderColor: isBuy ? `${accentColor}50` : "rgba(255,255,255,0.08)",
        background: isBuy ? `${accentColor}06` : "rgba(255,255,255,0.02)",
        boxShadow: isBuy ? `0 0 18px ${accentColor}15` : undefined,
      }}
      data-testid={`signal-card-${entry.contract.replace(" ", "-").toLowerCase()}`}
    >
      {/* Active glow top bar */}
      {isBuy && (
        <div className="absolute top-0 left-0 right-0 h-0.5"
          style={{ background: `linear-gradient(90deg,transparent,${accentColor},transparent)` }} />
      )}

      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          {isOver
            ? <TrendingUp size={14} style={{ color: accentColor }} />
            : <TrendingDown size={14} style={{ color: accentColor }} />}
          <span className="font-orbitron text-sm font-bold" style={{ color: accentColor }}>
            {entry.contract}
          </span>
          {isBuy && (
            <span className="text-[9px] font-bold font-rajdhani tracking-wider px-1.5 py-0.5 rounded animate-pulse"
              style={{ background: `${accentColor}25`, color: accentColor }}>
              ENTER NOW
            </span>
          )}
          {!isBuy && entry.at_barrier && (
            <span className="text-[9px] font-bold font-rajdhani tracking-wider px-1.5 py-0.5 rounded"
              style={{ background: "rgba(255,157,0,0.15)", color: "#ff9100" }}>
              NEAR
            </span>
          )}
        </div>
        <span className={`risk-${entry.risk_level.toLowerCase().replace(" ", "-")} text-xs`}>
          {entry.risk_level}
        </span>
      </div>

      {/* Win probability 3-window */}
      <div className="grid grid-cols-3 gap-2 mb-3">
        {[
          { label: "HIST", val: winPct, sub: "all ticks" },
          { label: "RECENT", val: recentPct, sub: "last 100" },
          { label: "SHORT", val: shortPct, sub: "last 30" },
        ].map(({ label, val, sub }) => (
          <div key={label} className="text-center rounded p-1.5"
            style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)" }}>
            <div className="font-rajdhani text-[8px] text-muted-foreground tracking-widest">{label}</div>
            <div className="font-orbitron text-sm font-bold" style={{ color: CONF_COLOR(val) }}>{val.toFixed(1)}%</div>
            <div className="font-rajdhani text-[8px] text-muted-foreground">{sub}</div>
          </div>
        ))}
      </div>

      {/* Confidence bar */}
      <div className="mb-3">
        <div className="flex items-center justify-between mb-1">
          <span className="font-rajdhani text-[10px] text-muted-foreground tracking-widest">SIGNAL STRENGTH</span>
          <span className="font-orbitron text-xs font-bold" style={{ color: CONF_COLOR(entry.confidence) }}>
            {entry.confidence}%
          </span>
        </div>
        <div className="h-2 bg-muted/30 rounded-full overflow-hidden">
          <div className="h-full rounded-full transition-all duration-700"
            style={{
              width: `${entry.confidence}%`,
              background: `linear-gradient(90deg,${accentColor}60,${accentColor})`,
              boxShadow: isBuy ? `0 0 8px ${accentColor}60` : undefined,
            }} />
        </div>
      </div>

      {/* Entry / Wait status + barrier */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-1.5">
          <div className="w-2 h-2 rounded-full flex-shrink-0"
            style={{ background: isBuy ? "#00c853" : "#ff9100", boxShadow: isBuy ? "0 0 6px #00c853" : undefined }} />
          <span className="font-orbitron text-xs font-bold"
            style={{ color: isBuy ? "#00c853" : "#ff9100" }}>
            {isBuy ? "ENTER" : "WAIT"}
          </span>
        </div>
        <div className="flex items-center gap-3 text-xs">
          <div>
            <span className="font-rajdhani text-muted-foreground">TICKS </span>
            <span className="font-orbitron font-bold text-foreground">{entry.recommended_ticks}</span>
          </div>
          <div>
            <span className="font-rajdhani text-muted-foreground">TREND </span>
            <span className="font-orbitron font-bold"
              style={{ color: entry.trend === "UP" ? "#00c853" : entry.trend === "DOWN" ? "#ff1744" : "#ffd600" }}>
              {entry.trend === "UP" ? "▲" : entry.trend === "DOWN" ? "▼" : "━"}
              {Math.abs(trendDelta) >= 1 ? ` ${Math.abs(trendDelta).toFixed(1)}%` : ""}
            </span>
          </div>
        </div>
      </div>

      {/* Winning / losing digit groups */}
      {entry.winning_digits && entry.losing_digits && (
        <div className="flex gap-2 mb-3">
          <div className="flex-1 rounded p-2"
            style={{ background: `${accentColor}08`, border: `1px solid ${accentColor}20` }}>
            <div className="font-rajdhani text-[8px] text-muted-foreground tracking-widest mb-1">WIN DIGITS</div>
            <div className="flex gap-1 flex-wrap">
              {entry.winning_digits.map((d) => (
                <span key={d} className="w-5 h-5 rounded flex items-center justify-center font-orbitron text-[10px] font-bold"
                  style={{ background: `${DIGIT_COLORS[d]}25`, color: DIGIT_COLORS[d] }}>
                  {d}
                </span>
              ))}
            </div>
          </div>
          <div className="flex-1 rounded p-2"
            style={{ background: "rgba(255,23,68,0.04)", border: "1px solid rgba(255,23,68,0.12)" }}>
            <div className="font-rajdhani text-[8px] text-muted-foreground tracking-widest mb-1">LOSE DIGITS</div>
            <div className="flex gap-1 flex-wrap">
              {entry.losing_digits.map((d) => (
                <span key={d} className="w-5 h-5 rounded flex items-center justify-center font-orbitron text-[10px] font-bold text-red-400/60"
                  style={{ background: "rgba(255,23,68,0.1)" }}>
                  {d}
                </span>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Reasons */}
      {(entry.reasons ?? [entry.reason]).map((r, i) => (
        <div key={i} className="flex items-start gap-1.5 mt-1">
          <div className="w-1 h-1 rounded-full mt-1.5 flex-shrink-0"
            style={{ background: i === 0 ? accentColor : "rgba(255,255,255,0.3)" }} />
          <span className="font-rajdhani text-[10px] leading-relaxed"
            style={{ color: i === 0 ? "rgba(255,255,255,0.8)" : "rgba(255,255,255,0.5)" }}>
            {r}
          </span>
        </div>
      ))}
    </div>
  );
}

// ── Last N digit stream ───────────────────────────────────────────────────────
function DigitStream({ digits }: { digits: number[] }) {
  return (
    <div className="flex gap-1 flex-wrap">
      {digits.map((d, i) => {
        const isLast = i === digits.length - 1;
        return (
          <div key={i}
            className="w-7 h-7 rounded flex items-center justify-center font-orbitron text-xs font-bold"
            style={{
              background: `${DIGIT_COLORS[d]}${isLast ? "40" : "15"}`,
              border: `1px solid ${DIGIT_COLORS[d]}${isLast ? "80" : "30"}`,
              color: DIGIT_COLORS[d],
              boxShadow: isLast ? `0 0 10px ${DIGIT_COLORS[d]}60` : undefined,
            }}>
            {d}
          </div>
        );
      })}
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────
export default function OverUnderPage() {
  const { symbol } = useSymbol();

  const { data, isLoading } = useGetOverUnderSignals(
    { symbol },
    {
      query: {
        enabled: !!symbol,
        queryKey: getGetOverUnderSignalsQueryKey({ symbol }),
        refetchInterval: 2000,
      },
    }
  );

  const d = data as Record<string, unknown> | undefined;
  const entries: SignalEntry[] = (d?.entries as SignalEntry[]) ?? [];
  const bestOver = d?.best_over as SignalEntry | undefined;
  const bestUnder = d?.best_under as SignalEntry | undefined;
  const currentDigit = (d?.current_digit as number) ?? 0;
  const currentPrice = (d?.current_price as number) ?? 0;
  const sampleSize = (d?.sample_size as number) ?? 0;
  const fullFreq = (d?.full_freq as FreqEntry[]) ?? [];
  const recentFreq = (d?.recent_freq as FreqEntry[]) ?? [];
  const shortFreq = (d?.short_freq as FreqEntry[]) ?? [];
  const last5 = (d?.last_5_digits as number[]) ?? [];

  const overEntries  = entries.filter((e) => e.contract.startsWith("OVER"));
  const underEntries = entries.filter((e) => e.contract.startsWith("UNDER"));

  const enterCount = entries.filter((e) => e.conditions_met).length;

  return (
    <div className="space-y-4 animate-fade-in-up" data-testid="page-over-under">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h2 className="font-orbitron text-lg font-bold text-primary tracking-wider">
            OVER / UNDER ANALYSIS
          </h2>
          <p className="font-rajdhani text-xs text-muted-foreground tracking-widest uppercase mt-0.5">
            3-Window Win Probability · Entry Trigger · Mean Reversion
          </p>
        </div>
        {!isLoading && sampleSize > 0 && (
          <div className="text-right">
            <div className="font-orbitron text-[10px] text-primary">{sampleSize.toLocaleString()} ticks</div>
            <div className="font-rajdhani text-[9px] text-muted-foreground">{enterCount} signals active</div>
          </div>
        )}
      </div>

      {/* Current state strip */}
      <div className="cyber-card p-4">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div>
            <div className="font-rajdhani text-[10px] text-muted-foreground tracking-widest uppercase">Current Price</div>
            <div className="font-orbitron text-xl font-bold mt-1">{currentPrice || "—"}</div>
          </div>
          <div>
            <div className="font-rajdhani text-[10px] text-muted-foreground tracking-widest uppercase">Current Digit</div>
            <div className="font-orbitron text-5xl font-black mt-0.5"
              style={{ color: DIGIT_COLORS[currentDigit], textShadow: `0 0 24px ${DIGIT_COLORS[currentDigit]}70` }}
              data-testid="text-current-digit">
              {currentDigit}
            </div>
          </div>
          <div>
            <div className="font-rajdhani text-[10px] text-muted-foreground tracking-widest uppercase mb-1.5">Best OVER</div>
            <div className="font-orbitron text-base font-bold text-green-400">{bestOver?.contract ?? "—"}</div>
            {bestOver && (
              <div className="font-rajdhani text-[10px] text-muted-foreground">
                {bestOver.win_probability?.toFixed(1)}% win rate
              </div>
            )}
          </div>
          <div>
            <div className="font-rajdhani text-[10px] text-muted-foreground tracking-widest uppercase mb-1.5">Best UNDER</div>
            <div className="font-orbitron text-base font-bold text-blue-400">{bestUnder?.contract ?? "—"}</div>
            {bestUnder && (
              <div className="font-rajdhani text-[10px] text-muted-foreground">
                {bestUnder.win_probability?.toFixed(1)}% win rate
              </div>
            )}
          </div>
        </div>

        {/* Last 5 digits stream */}
        {last5.length > 0 && (
          <div className="mt-3 pt-3 border-t border-border/20">
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-1.5 flex-shrink-0">
                <Activity size={11} className="text-primary" />
                <span className="font-rajdhani text-[10px] text-muted-foreground tracking-widest uppercase">Last digits</span>
              </div>
              <DigitStream digits={last5} />
            </div>
          </div>
        )}
      </div>

      {/* Digit frequency chart */}
      {fullFreq.length > 0 && (
        <div className="cyber-card p-4">
          <div className="font-rajdhani font-semibold text-xs text-muted-foreground tracking-widest uppercase mb-3">
            Digit Frequency Distribution
          </div>
          <FreqBars full={fullFreq} recent={recentFreq} short={shortFreq} />
        </div>
      )}

      {isLoading ? (
        <div className="flex items-center justify-center h-48">
          <div className="w-10 h-10 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
        </div>
      ) : entries.length === 0 ? (
        <div className="cyber-card p-8 flex items-center justify-center gap-3 text-muted-foreground">
          <AlertCircle size={18} />
          <span className="font-rajdhani text-sm">No signal data. Select a symbol.</span>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* OVER column */}
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <TrendingUp size={14} className="text-green-400" />
              <span className="font-rajdhani font-bold text-xs tracking-widest uppercase text-green-400">
                OVER Contracts
              </span>
              <span className="ml-auto font-rajdhani text-[10px] text-muted-foreground">
                {overEntries.filter((e) => e.conditions_met).length} ready
              </span>
            </div>
            {overEntries.map((entry) => (
              <SignalCard key={entry.contract} entry={entry} type="over" />
            ))}
          </div>

          {/* UNDER column */}
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <TrendingDown size={14} className="text-blue-400" />
              <span className="font-rajdhani font-bold text-xs tracking-widest uppercase text-blue-400">
                UNDER Contracts
              </span>
              <span className="ml-auto font-rajdhani text-[10px] text-muted-foreground">
                {underEntries.filter((e) => e.conditions_met).length} ready
              </span>
            </div>
            {underEntries.map((entry) => (
              <SignalCard key={entry.contract} entry={entry} type="under" />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
