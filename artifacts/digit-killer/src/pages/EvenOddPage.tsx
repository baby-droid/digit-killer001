import { useState, useEffect, useMemo } from "react";
import {
  useGetEvenOddAnalysis,
  getGetEvenOddAnalysisQueryKey,
} from "@workspace/api-client-react";
import { useSymbol } from "@/context/SymbolContext";
import { Divide, CheckCircle, XCircle, AlertTriangle } from "lucide-react";

const DIGIT_COLORS: Record<number, string> = {
  0: "#00897b", 1: "#1e88e5", 2: "#8e24aa", 3: "#43a047", 4: "#fb8c00",
  5: "#00e5ff", 6: "#c6e500", 7: "#e53935", 8: "#e91e8c", 9: "#fdd835",
};
const EVEN_DIGITS = [0, 2, 4, 6, 8];
const ODD_DIGITS  = [1, 3, 5, 7, 9];
const TICK_PRESETS = [100, 200, 500, 1000, 2000];

const ROLE_COLORS: Record<string, { border: string; label: string; bg: string }> = {
  green:   { border: "#22c55e", label: "MOST",      bg: "rgba(34,197,94,0.15)"  },
  blue:    { border: "#3b82f6", label: "2ND MOST",  bg: "rgba(59,130,246,0.15)" },
  neutral: { border: "rgba(255,255,255,0.25)", label: "MID", bg: "rgba(255,255,255,0.05)" },
  yellow:  { border: "#facc15", label: "2ND LEAST", bg: "rgba(250,204,21,0.12)" },
  red:     { border: "#ef4444", label: "LEAST",     bg: "rgba(239,68,68,0.15)"  },
};

// ── SSE live tick ─────────────────────────────────────────────────────────────
function useLiveTick(symbol: string) {
  const [live, setLive] = useState<{ price: number; digit: number } | null>(null);
  useEffect(() => {
    if (!symbol) return;
    let es: EventSource;
    let dead = false;
    const open = () => {
      es = new EventSource(`/api/live-ticks?symbol=${encodeURIComponent(symbol)}`);
      es.onmessage = (e) => { try { if (!dead) setLive(JSON.parse(e.data)); } catch {} };
      es.onerror = () => { es.close(); if (!dead) setTimeout(open, 2000); };
    };
    open();
    return () => { dead = true; es?.close(); };
  }, [symbol]);
  return live;
}

// ── D-Circle Arc Gauge (same style as Wide Eye) ───────────────────────────────
function DCircleGauge({ digit, percentage, count, isCurrent, isMost, isLeast }: {
  digit: number; percentage: number; count: number;
  isCurrent: boolean; isMost: boolean; isLeast: boolean;
}) {
  const color = DIGIT_COLORS[digit];
  const R = 30; const CX = 36; const CY = 36;
  const circ = 2 * Math.PI * R;
  const filled = circ * (percentage / 100);
  return (
    <div className="flex flex-col items-center select-none min-w-0">
      <div className="h-4 flex items-end justify-center mb-0.5">
        {isMost && !isCurrent && <span style={{ color: "#00e5ff", fontSize: 10, fontWeight: "bold" }}>▲</span>}
        {isLeast && <span style={{ color: "#ff4d4d", fontSize: 10, fontWeight: "bold" }}>▽</span>}
      </div>
      <svg viewBox="0 0 72 72" style={{ width: "clamp(48px,7vw,70px)", height: "clamp(48px,7vw,70px)",
        filter: isCurrent ? `drop-shadow(0 0 8px ${color}cc)` : undefined }}>
        <circle cx={CX} cy={CY} r={R} fill="none" stroke="rgba(255,255,255,0.07)" strokeWidth={6} />
        <circle cx={CX} cy={CY} r={R} fill="none" stroke={color}
          strokeWidth={isCurrent ? 8 : 5.5} strokeLinecap="round"
          strokeDasharray={`${filled} ${circ - filled}`}
          transform={`rotate(-90 ${CX} ${CY})`}
          style={{ transition: "stroke-dasharray 0.5s ease" }} />
        <text x={CX} y={CY + 1} textAnchor="middle" dominantBaseline="middle"
          fill={isCurrent ? "#fff" : "rgba(255,255,255,0.85)"}
          fontFamily="Orbitron,monospace" fontWeight={isCurrent ? "900" : "700"}
          fontSize={isCurrent ? 16 : 14}>
          {digit}
        </text>
      </svg>
      <div className="font-orbitron font-bold text-center"
        style={{ fontSize: "clamp(9px,1.4vw,11px)", color: isCurrent ? color : "rgba(255,255,255,0.55)" }}>
        {percentage.toFixed(1)}%
      </div>
      <div className="font-rajdhani text-center" style={{ fontSize: "9px", color: "rgba(255,255,255,0.25)" }}>
        {count}
      </div>
      <div className="h-3 flex items-start justify-center mt-0.5">
        {isCurrent && <span style={{ color, fontSize: 11, fontWeight: "bold" }}>▲</span>}
      </div>
    </div>
  );
}

// ── Even digit circle ─────────────────────────────────────────────────────────
function EvenDigitCircle({ digit, pct, color, label, isCurrent }: {
  digit: number; pct: number; color: string; label: string; isCurrent: boolean;
}) {
  const style = ROLE_COLORS[color];
  return (
    <div className="flex flex-col items-center gap-1.5">
      <div className="font-rajdhani text-[9px] font-bold tracking-wider text-center"
        style={{ color: style.border }}>{label}</div>
      <div
        className="w-14 h-14 rounded-full flex items-center justify-center font-orbitron text-xl font-black transition-all duration-300"
        style={{
          background: isCurrent ? style.border : style.bg,
          border: `3px solid ${style.border}`,
          color: isCurrent ? "#000" : "#fff",
          boxShadow: isCurrent ? `0 0 18px ${style.border}` : `0 0 8px ${style.border}50`,
        }}
      >{digit}</div>
      <div className="font-orbitron text-xs font-bold" style={{ color: style.border }}>
        {pct.toFixed(2)}%
      </div>
    </div>
  );
}

// ── Odd digit circle ──────────────────────────────────────────────────────────
function OddDigitCircle({ digit, pct, isCandidate, isLosing, threshold }: {
  digit: number; pct: number; isCandidate: boolean; isLosing: boolean; threshold: number;
}) {
  return (
    <div className="flex flex-col items-center gap-1.5">
      <div className="font-rajdhani text-[9px] font-bold tracking-wider"
        style={{ color: isCandidate ? "#facc15" : "rgba(255,255,255,0.35)" }}>
        {isCandidate ? "ENTRY" : "LOSING"}
      </div>
      <div
        className="w-14 h-14 rounded-full flex items-center justify-center font-orbitron text-xl font-black transition-all duration-300 relative"
        style={{
          background: isCandidate ? "rgba(250,204,21,0.2)" : "rgba(255,255,255,0.04)",
          border: isCandidate ? "3px solid #facc15" : "2px solid rgba(255,255,255,0.15)",
          color: isCandidate ? "#facc15" : "rgba(255,255,255,0.45)",
          boxShadow: isCandidate ? "0 0 20px rgba(250,204,21,0.6)" : undefined,
        }}
      >
        {digit}
        {isCandidate && (
          <div className="absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full bg-yellow-400 flex items-center justify-center">
            <span style={{ fontSize: 8, color: "#000", fontWeight: "bold" }}>!</span>
          </div>
        )}
      </div>
      <div className="font-orbitron text-xs font-bold"
        style={{ color: isCandidate ? "#facc15" : isLosing ? "#ef4444" : "#fff" }}>
        {pct.toFixed(2)}%
      </div>
      <div className="font-rajdhani text-[8px]"
        style={{ color: isCandidate ? "#facc15" : "rgba(255,255,255,0.25)" }}>
        ({isCandidate ? `>${threshold}%` : `<${threshold}%`})
      </div>
    </div>
  );
}

// ── Condition row ─────────────────────────────────────────────────────────────
function CondRow({ met, label, detail }: { met: boolean; label: string; detail: string }) {
  return (
    <div className="flex items-center gap-2 py-1.5 px-3 rounded-lg"
      style={{ background: met ? "rgba(34,197,94,0.08)" : "rgba(239,68,68,0.08)" }}>
      {met
        ? <CheckCircle size={15} className="flex-shrink-0" style={{ color: "#22c55e" }} />
        : <XCircle    size={15} className="flex-shrink-0" style={{ color: "#ef4444" }} />}
      <div className="flex-1 min-w-0">
        <div className="font-rajdhani text-xs font-bold" style={{ color: met ? "#22c55e" : "#ef4444" }}>
          {label}
        </div>
        <div className="font-rajdhani text-[10px] text-muted-foreground">{detail}</div>
      </div>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────
export default function EvenOddPage() {
  const { symbol } = useSymbol();
  const [tickCount, setTickCount] = useState(1000);
  const [customInput, setCustomInput] = useState("1000");

  const liveTick = useLiveTick(symbol);

  const { data, isLoading } = useGetEvenOddAnalysis(
    { symbol, count: tickCount },
    {
      query: {
        enabled: !!symbol,
        queryKey: getGetEvenOddAnalysisQueryKey({ symbol, count: tickCount }),
        refetchInterval: 1000,
      },
    }
  );

  const d = data as Record<string, unknown> | undefined;

  const evenRanked      = (d?.even_ranked  as Array<{ digit: number; pct: number; role: string; color: string }>) ?? [];
  const oddStats        = (d?.odd_stats    as Array<{ digit: number; pct: number; is_entry_candidate: boolean; is_losing: boolean }>) ?? [];
  const conditions      = (d?.conditions  as { exactly_one_candidate: boolean; preceding_is_odd: boolean; all_others_losing: boolean }) ??
                          { exactly_one_candidate: false, preceding_is_odd: false, all_others_losing: false };
  const signalReady     = (d?.signal_ready     as boolean) ?? false;
  const entryDigit      = (d?.entry_digit      as number | null) ?? null;
  const entryPct        = (d?.entry_pct        as number) ?? 0;
  const threshold       = (d?.entry_threshold  as number) ?? 10.5;
  const confidence      = (d?.confidence       as number) ?? 50;
  const ticks           = (d?.ticks            as number) ?? 3;
  const evenPct         = (d?.even_pct         as number) ?? 50;
  const oddPct          = (d?.odd_pct          as number) ?? 50;
  const precedingDigit  = (d?.preceding_digit  as number) ?? -1;

  // D-circle distribution — all 10 digits from the same tick window
  const digitDist = (d?.digit_distribution as Array<{
    digit: number; count: number; percentage: number; rank: number;
  }>) ?? [];

  const httpCurrentDigit = (d?.current_digit as number) ?? 0;
  const currentDigit     = liveTick?.digit ?? httpCurrentDigit;
  const isEven           = EVEN_DIGITS.includes(currentDigit);

  const hasStrategyData  = evenRanked.length > 0 && oddStats.length > 0;

  const sortedDist = useMemo(() => [...digitDist].sort((a, b) => b.percentage - a.percentage), [digitDist]);
  const mostFrequent  = sortedDist[0]?.digit ?? -1;
  const leastFrequent = sortedDist[sortedDist.length - 1]?.digit ?? -1;

  const applyCustom = () => {
    const v = parseInt(customInput);
    if (!isNaN(v) && v >= 10 && v <= 5000) setTickCount(v);
  };

  return (
    <div className="space-y-4 animate-fade-in-up max-w-4xl" data-testid="page-even-odd">

      {/* ─── Header ─── */}
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <Divide size={18} className="text-primary" />
            <h2 className="font-orbitron text-lg font-bold text-primary tracking-wider">
              EVEN / ODD STRATEGY
            </h2>
          </div>
          <p className="font-rajdhani text-xs text-muted-foreground tracking-widest uppercase mt-0.5">
            Even / Odd Signal Strategy · Entry Analysis · {tickCount} Ticks
          </p>
        </div>
        <div className="flex flex-col items-center flex-shrink-0" data-testid="corner-current-digit">
          <div
            className="w-16 h-16 rounded-xl flex items-center justify-center font-orbitron text-3xl font-black transition-all duration-200"
            style={{ background: DIGIT_COLORS[currentDigit], color: "#fff",
              boxShadow: `0 0 18px ${DIGIT_COLORS[currentDigit]}70` }}
          >{currentDigit}</div>
          <div className="mt-1 font-orbitron text-[10px] font-bold tracking-widest"
            style={{ color: isEven ? "#22c55e" : "#fb8c00" }}>
            {isEven ? "EVEN" : "ODD"}
          </div>
          <div className="mt-0.5 font-rajdhani text-[9px] text-muted-foreground">
            {liveTick ? "live ●" : "…"}
          </div>
        </div>
      </div>

      {/* ─── Tick Window ─── */}
      <div className="cyber-card p-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-rajdhani text-[10px] text-muted-foreground tracking-widest uppercase flex-shrink-0">
            Tick Window:
          </span>
          {TICK_PRESETS.map((p) => (
            <button key={p} onClick={() => { setTickCount(p); setCustomInput(String(p)); }}
              className="px-3 py-1.5 rounded text-xs font-orbitron font-bold transition-all"
              style={tickCount === p
                ? { background: "#00e5ff", color: "#050a0f" }
                : { background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.12)", color: "#aaa" }}
              data-testid={`preset-${p}`}>
              {p}
            </button>
          ))}
          <input type="number" min={10} max={5000} value={customInput}
            onChange={(e) => setCustomInput(e.target.value)}
            onBlur={applyCustom} onKeyDown={(e) => e.key === "Enter" && applyCustom()}
            className="w-20 px-2 py-1.5 rounded text-xs font-orbitron bg-background border border-border text-foreground focus:outline-none focus:border-primary"
            placeholder="custom" data-testid="input-tick-count" />
          <div className="ml-auto flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold"
            style={{ background: "rgba(0,200,83,0.12)", border: "1px solid rgba(0,200,83,0.35)", color: "#00c853" }}>
            <div className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
            {isLoading ? "Updating…" : `${tickCount} ticks`}
          </div>
        </div>
      </div>

      {/* ─── STRATEGY PANELS (Even | Odd) ─── */}
      {isLoading && !d ? (
        <div className="flex justify-center py-12">
          <div className="w-10 h-10 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">

          {/* EVEN SIDE */}
          <div className="cyber-card p-4" data-testid="panel-even-side">
            <div className="flex items-center justify-between mb-1">
              <div>
                <div className="font-orbitron text-sm font-bold" style={{ color: "#22c55e" }}>
                  1. EVEN SIDE — WINNING
                </div>
                <div className="font-rajdhani text-[10px] text-muted-foreground mt-0.5">
                  Digits: 0, 2, 4, 6, 8 · Trade on this side
                </div>
              </div>
              <div className="font-orbitron text-xl font-black" style={{ color: "#22c55e" }}>
                {evenPct}%
              </div>
            </div>
            <div className="h-1.5 rounded-full overflow-hidden mb-4" style={{ background: "rgba(255,255,255,0.08)" }}>
              <div className="h-full rounded-full transition-all duration-700"
                style={{ width: `${evenPct}%`, background: "linear-gradient(90deg,#16a34a,#22c55e)" }} />
            </div>
            {hasStrategyData ? (
              <div className="flex justify-between px-1">
                {evenRanked.map((e) => (
                  <EvenDigitCircle key={e.digit} digit={e.digit} pct={e.pct} color={e.color}
                    label={ROLE_COLORS[e.color]?.label ?? ""} isCurrent={currentDigit === e.digit} />
                ))}
              </div>
            ) : (
              <div className="flex justify-between px-1">
                {EVEN_DIGITS.map((dv) => (
                  <div key={dv} className="w-14 h-14 rounded-full bg-muted/20 animate-pulse" />
                ))}
              </div>
            )}
            <div className="mt-3 flex flex-wrap gap-2 justify-center">
              {[
                { color: "#22c55e", label: "Most appearing" },
                { color: "#3b82f6", label: "2nd most" },
                { color: "#facc15", label: "2nd least" },
                { color: "#ef4444", label: "Least appearing" },
              ].map(({ color, label }) => (
                <div key={label} className="flex items-center gap-1">
                  <div className="w-2.5 h-2.5 rounded-full" style={{ background: color }} />
                  <span className="font-rajdhani text-[9px] text-muted-foreground">{label}</span>
                </div>
              ))}
            </div>
          </div>

          {/* ODD SIDE */}
          <div className="cyber-card p-4" data-testid="panel-odd-side">
            <div className="flex items-center justify-between mb-1">
              <div>
                <div className="font-orbitron text-sm font-bold" style={{ color: "#fb8c00" }}>
                  2. ODD SIDE — ENTRY ZONE
                </div>
                <div className="font-rajdhani text-[10px] text-muted-foreground mt-0.5">
                  Digits: 1, 3, 5, 7, 9 · Watch for ONE above {threshold}%
                </div>
              </div>
              <div className="font-orbitron text-xl font-black" style={{ color: "#fb8c00" }}>
                {oddPct}%
              </div>
            </div>
            <div className="h-1.5 rounded-full overflow-hidden mb-4" style={{ background: "rgba(255,255,255,0.08)" }}>
              <div className="h-full rounded-full transition-all duration-700"
                style={{ width: `${oddPct}%`, background: "linear-gradient(90deg,#b45309,#fb8c00)" }} />
            </div>
            {hasStrategyData ? (
              <div className="flex justify-between px-1">
                {oddStats.map((s) => (
                  <OddDigitCircle key={s.digit} digit={s.digit} pct={s.pct}
                    isCandidate={s.is_entry_candidate} isLosing={s.is_losing} threshold={threshold} />
                ))}
              </div>
            ) : (
              <div className="flex justify-between px-1">
                {ODD_DIGITS.map((dv) => (
                  <div key={dv} className="w-14 h-14 rounded-full bg-muted/20 animate-pulse" />
                ))}
              </div>
            )}
            <div className="mt-3 flex items-center justify-center gap-3">
              <div className="h-px flex-1" style={{ background: "rgba(250,204,21,0.4)" }} />
              <span className="font-rajdhani text-[10px] font-bold" style={{ color: "#facc15" }}>
                Threshold: {threshold}%
              </span>
              <div className="h-px flex-1" style={{ background: "rgba(250,204,21,0.4)" }} />
            </div>
          </div>
        </div>
      )}

      {/* ─── ENTRY SIGNAL BANNER ─── */}
      {signalReady && (
        <div className="rounded-xl p-4 border-2 animate-pulse"
          style={{ background: "rgba(34,197,94,0.12)", borderColor: "#22c55e",
            boxShadow: "0 0 32px rgba(34,197,94,0.3)" }}
          data-testid="banner-signal-ready">
          <div className="flex items-center gap-3">
            <CheckCircle size={28} style={{ color: "#22c55e", flexShrink: 0 }} />
            <div className="flex-1">
              <div className="font-orbitron text-lg font-black" style={{ color: "#22c55e" }}>
                ✦ ENTRY SIGNAL — TRADE EVEN SIDE
              </div>
              <div className="font-rajdhani text-sm mt-0.5" style={{ color: "rgba(34,197,94,0.8)" }}>
                Entry digit: <strong>{entryDigit}</strong> ({entryPct.toFixed(2)}% &gt; {threshold}%)
                · Preceding digit: <strong>{precedingDigit}</strong> (ODD ✓)
                · Contract: {ticks} ticks
              </div>
            </div>
            <div className="flex-shrink-0 text-right">
              <div className="font-orbitron text-2xl font-black" style={{ color: "#22c55e" }}>{confidence}%</div>
              <div className="font-rajdhani text-xs text-muted-foreground">confidence</div>
            </div>
          </div>
        </div>
      )}

      {/* ─── WAITING BANNER ─── */}
      {!signalReady && hasStrategyData && (
        <div className="rounded-xl p-3 border"
          style={{ background: "rgba(255,255,255,0.03)", borderColor: "rgba(255,255,255,0.12)" }}>
          <div className="flex items-center gap-2">
            <AlertTriangle size={16} style={{ color: "#fb8c00", flexShrink: 0 }} />
            <div className="font-rajdhani text-sm" style={{ color: "rgba(255,200,100,0.8)" }}>
              <strong>WAITING FOR ENTRY CONDITIONS</strong> — Monitor the ODD zone.
              All 5 odd digits must be below {threshold}% except exactly ONE.
            </div>
          </div>
        </div>
      )}

      {/* ─── Conditions Checklist ─── */}
      {hasStrategyData && (
        <div className="cyber-card p-4" data-testid="conditions-panel">
          <div className="font-rajdhani text-xs font-bold tracking-widest uppercase text-muted-foreground mb-3">
            Entry Conditions (all 3 required)
          </div>
          <div className="space-y-2">
            <CondRow
              met={conditions.exactly_one_candidate}
              label="Exactly ONE odd digit above 10.50%"
              detail={conditions.exactly_one_candidate
                ? `Digit ${entryDigit} at ${entryPct.toFixed(2)}% — ENTRY CANDIDATE`
                : "No odd digit (or multiple) above threshold — wait"}
            />
            <CondRow
              met={conditions.all_others_losing}
              label="All other odd digits below 10.50%"
              detail={conditions.all_others_losing
                ? "All remaining odd digits in LOSING zone"
                : `Some odd digits still above ${threshold}% — not ready`}
            />
            <CondRow
              met={conditions.preceding_is_odd}
              label="Preceding digit is ODD"
              detail={precedingDigit >= 0
                ? `Preceding digit: ${precedingDigit} (${ODD_DIGITS.includes(precedingDigit) ? "ODD ✓" : "EVEN — wait for ODD preceding digit"})`
                : "Waiting for digit stream…"}
            />
          </div>
          <div className="mt-3">
            <div className="flex items-center justify-between mb-1">
              <span className="font-rajdhani text-xs text-muted-foreground">Signal strength</span>
              <span className="font-orbitron text-xs font-bold"
                style={{ color: confidence >= 70 ? "#22c55e" : confidence >= 50 ? "#facc15" : "#ef4444" }}>
                {confidence}%
              </span>
            </div>
            <div className="h-2 rounded-full overflow-hidden" style={{ background: "rgba(255,255,255,0.08)" }}>
              <div className="h-full rounded-full transition-all duration-700"
                style={{
                  width: `${confidence}%`,
                  background: confidence >= 70 ? "linear-gradient(90deg,#16a34a,#22c55e)"
                    : confidence >= 50 ? "linear-gradient(90deg,#b45309,#facc15)"
                    : "linear-gradient(90deg,#7f1d1d,#ef4444)"
                }} />
            </div>
          </div>
        </div>
      )}

      {/* ─── D-Circle Distribution (all 10 digits, arc gauge, below analysis) ─── */}
      <div className="cyber-card p-3 md:p-4" data-testid="section-dcircle">
        <div className="flex items-center justify-between mb-1">
          <div className="font-rajdhani text-sm text-foreground font-semibold">
            Digit Distribution — Last {tickCount} Ticks
          </div>
          <div className="flex items-center gap-3 text-[10px] font-rajdhani">
            <span className="text-primary">▲ current / most</span>
            <span className="text-red-400">▽ least</span>
          </div>
        </div>
        {digitDist.length === 0 ? (
          <div className="grid mt-2" style={{ gridTemplateColumns: "repeat(10, minmax(0, 1fr))", gap: "4px" }}>
            {Array.from({ length: 10 }).map((_, i) => (
              <div key={i} className="flex flex-col items-center gap-1">
                <div className="rounded-full bg-muted/20 animate-pulse"
                  style={{ width: "clamp(48px,7vw,70px)", height: "clamp(48px,7vw,70px)" }} />
              </div>
            ))}
          </div>
        ) : (
          <div className="grid mt-2" style={{ gridTemplateColumns: "repeat(10, minmax(0, 1fr))", gap: "4px" }}>
            {Array.from({ length: 10 }, (_, i) => i).map((dv) => {
              const stat = digitDist.find((x) => x.digit === dv) ??
                { digit: dv, percentage: 10, rank: dv + 1, count: 0 };
              return (
                <DCircleGauge key={dv} digit={dv} percentage={stat.percentage} count={stat.count}
                  isCurrent={dv === currentDigit} isMost={dv === mostFrequent} isLeast={dv === leastFrequent} />
              );
            })}
          </div>
        )}
        {/* Even / Odd group summary under D-circles */}
        <div className="mt-3 pt-3 border-t grid grid-cols-2 gap-3" style={{ borderColor: "rgba(255,255,255,0.08)" }}>
          {[
            { label: "EVEN (0,2,4,6,8)", pct: evenPct, color: "#22c55e" },
            { label: "ODD  (1,3,5,7,9)", pct: oddPct,  color: "#fb8c00" },
          ].map(({ label, pct, color }) => (
            <div key={label} className="flex items-center gap-2">
              <span className="font-orbitron text-[10px] font-bold whitespace-nowrap" style={{ color }}>{pct}%</span>
              <div className="flex-1 h-1.5 rounded-full overflow-hidden" style={{ background: "rgba(255,255,255,0.08)" }}>
                <div className="h-full rounded-full transition-all duration-700" style={{ width: `${pct}%`, background: color }} />
              </div>
              <span className="font-rajdhani text-[9px] text-muted-foreground whitespace-nowrap">{label}</span>
            </div>
          ))}
        </div>
      </div>

    </div>
  );
}
