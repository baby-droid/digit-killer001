import { useState, useEffect, useMemo } from "react";
import {
  useGetEvenOddAnalysis,
  getGetEvenOddAnalysisQueryKey,
} from "@workspace/api-client-react";
import { useSymbol } from "@/context/SymbolContext";
import { Divide, CheckCircle, XCircle, AlertTriangle, TrendingUp, TrendingDown, Zap } from "lucide-react";

const DIGIT_COLORS: Record<number, string> = {
  0: "#00897b", 1: "#1e88e5", 2: "#8e24aa", 3: "#43a047", 4: "#fb8c00",
  5: "#00e5ff", 6: "#c6e500", 7: "#e53935", 8: "#e91e8c", 9: "#fdd835",
};
const EVEN_DIGITS = [0, 2, 4, 6, 8];
const ODD_DIGITS  = [1, 3, 5, 7, 9];
const TICK_PRESETS = [200, 500, 1000, 2000];

function useLiveTick(symbol: string) {
  const [live, setLive] = useState<{ price: number; digit: number } | null>(null);
  useEffect(() => {
    if (!symbol) return;
    let es: EventSource; let dead = false;
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

// ── Floating circle with pink cursor (Deriv.com style) ────────────────────────
function FloatingDigitCircle({
  digit, pct, isCurrent, isElevated, isLeast, isMost,
}: {
  digit: number; pct: number; isCurrent: boolean;
  isElevated: boolean; isLeast: boolean; isMost: boolean;
}) {
  const color = DIGIT_COLORS[digit];
  const R = 28; const CX = 34; const CY = 34;
  const circ = 2 * Math.PI * R;
  const filled = circ * (pct / 100);
  // Arc-tip cursor: dot lives at the END of the filled arc (Deriv.com accurate style)
  const tipAngle = -Math.PI / 2 + (pct / 100) * 2 * Math.PI;
  const tipX = CX + R * Math.cos(tipAngle);
  const tipY = CY + R * Math.sin(tipAngle);
  return (
    <div className="flex flex-col items-center select-none" style={{ minWidth: 0 }}>
      <svg viewBox="0 0 68 68"
        style={{ width: "clamp(44px,6.5vw,64px)", height: "clamp(44px,6.5vw,64px)",
          filter: isCurrent ? `drop-shadow(0 0 8px ${color}cc)` : undefined }}>
        <circle cx={CX} cy={CY} r={R} fill="rgba(255,255,255,0.04)" stroke="rgba(255,255,255,0.10)" strokeWidth={4} />
        <circle cx={CX} cy={CY} r={R} fill="none" stroke={color}
          strokeWidth={isCurrent ? 7 : 5} strokeLinecap="round"
          strokeDasharray={`${filled} ${circ - filled}`}
          transform={`rotate(-90 ${CX} ${CY})`}
          style={{ transition: "stroke-dasharray 0.6s ease" }} />
        <text x={CX} y={CY + 1} textAnchor="middle" dominantBaseline="middle"
          fill={isCurrent ? "#fff" : "rgba(255,255,255,0.8)"}
          fontFamily="Orbitron,monospace" fontWeight={isCurrent ? "900" : "700"}
          fontSize={isCurrent ? 15 : 13}>
          {digit}
        </text>
        {/* Accurate arc-tip cursor dot on circumference (Deriv.com style) */}
        {isCurrent && (
          <circle cx={tipX} cy={tipY} r={4.5} fill="#ff1e9e"
            style={{ filter: "drop-shadow(0 0 6px #ff1e9e)", transition: "cx 0.6s ease, cy 0.6s ease" }} />
        )}
        {isMost && !isCurrent && (
          <circle cx={tipX} cy={tipY} r={3} fill="#22c55e" opacity={0.85} />
        )}
        {isLeast && !isCurrent && (
          <circle cx={tipX} cy={tipY} r={3} fill="#ef4444" opacity={0.85} />
        )}
      </svg>
      <div className="font-orbitron font-bold text-center mt-0.5"
        style={{ fontSize: "clamp(8px,1.2vw,11px)",
          color: isMost ? "#22c55e" : isLeast ? "#ef4444" : isCurrent ? color : "rgba(255,255,255,0.5)" }}>
        {pct.toFixed(1)}%
      </div>
      <div style={{ height: 10 }} />
    </div>
  );
}

// ── Signal condition row ───────────────────────────────────────────────────────
function CondRow({ met, label, detail }: { met: boolean; label: string; detail: string }) {
  return (
    <div className="flex items-start gap-2 py-1.5 px-3 rounded-lg"
      style={{ background: met ? "rgba(34,197,94,0.08)" : "rgba(239,68,68,0.08)" }}>
      {met ? <CheckCircle size={14} className="flex-shrink-0 mt-0.5" style={{ color: "#22c55e" }} />
           : <XCircle    size={14} className="flex-shrink-0 mt-0.5" style={{ color: "#ef4444" }} />}
      <div className="flex-1 min-w-0">
        <div className="font-rajdhani text-xs font-bold" style={{ color: met ? "#22c55e" : "#ef4444" }}>{label}</div>
        <div className="font-rajdhani text-[10px] text-muted-foreground">{detail}</div>
      </div>
    </div>
  );
}

// ── Threshold digit circle for signal panels ──────────────────────────────────
function ThresholdCircle({ digit, pct, isCandidate, threshold }: {
  digit: number; pct: number; isCandidate: boolean; threshold: number;
}) {
  return (
    <div className="flex flex-col items-center gap-1">
      <div className="w-12 h-12 rounded-full flex items-center justify-center font-orbitron text-lg font-black transition-all"
        style={{
          background: isCandidate ? "rgba(250,204,21,0.2)" : "rgba(255,255,255,0.04)",
          border: isCandidate ? "2.5px solid #facc15" : "2px solid rgba(255,255,255,0.12)",
          color: isCandidate ? "#facc15" : "rgba(255,255,255,0.4)",
          boxShadow: isCandidate ? "0 0 16px rgba(250,204,21,0.5)" : undefined,
        }}>
        {digit}
      </div>
      <div className="font-orbitron text-[10px] font-bold" style={{ color: isCandidate ? "#facc15" : "rgba(255,255,255,0.35)" }}>
        {pct.toFixed(2)}%
      </div>
      <div className="font-rajdhani text-[9px]" style={{ color: isCandidate ? "#facc15" : "rgba(255,255,255,0.2)" }}>
        {isCandidate ? `≥${threshold}%` : `<${threshold}%`}
      </div>
    </div>
  );
}

// ── Main page ──────────────────────────────────────────────────────────────────
export default function EvenOddPage() {
  const { symbol } = useSymbol();
  const [tickCount, setTickCount] = useState(1000);

  const liveTick = useLiveTick(symbol);

  const { data, isLoading } = useGetEvenOddAnalysis(
    { symbol, count: tickCount },
    {
      query: {
        enabled: !!symbol,
        queryKey: getGetEvenOddAnalysisQueryKey({ symbol, count: tickCount }),
        refetchInterval: 1300,
      },
    }
  );

  const d = data as Record<string, unknown> | undefined;

  const digitDist     = (d?.digit_distribution as Array<{ digit: number; count: number; percentage: number; rank: number }>) ?? [];
  const oddStats      = (d?.odd_stats    as Array<{ digit: number; pct: number; is_entry_candidate: boolean; is_losing: boolean }>) ?? [];
  const evenStats     = (d?.even_stats   as Array<{ digit: number; pct: number; is_entry_candidate: boolean; is_losing: boolean }>) ?? [];
  const evenRanked    = (d?.even_ranked  as Array<{ digit: number; pct: number; color: string }>) ?? [];
  const oddRanked     = (d?.odd_ranked   as Array<{ digit: number; pct: number; color: string }>) ?? [];

  const evenSignalReady  = (d?.even_signal_ready as boolean) ?? false;
  const oddSignalReady   = (d?.odd_signal_ready  as boolean) ?? false;
  const evenEntryDigit   = (d?.even_entry_digit  as number | null) ?? null;
  const oddEntryDigit    = (d?.odd_entry_digit   as number | null) ?? null;
  const evenEntryPct     = (d?.even_entry_pct    as number) ?? 0;
  const oddEntryPct      = (d?.odd_entry_pct     as number) ?? 0;
  const evenConds        = (d?.even_conditions   as { exactly_one_candidate: boolean; preceding_is_odd: boolean; all_others_below: boolean }) ??
                           { exactly_one_candidate: false, preceding_is_odd: false, all_others_below: false };
  const oddConds         = (d?.odd_conditions    as { exactly_one_candidate: boolean; preceding_is_even: boolean; all_others_below: boolean }) ??
                           { exactly_one_candidate: false, preceding_is_even: false, all_others_below: false };

  const streakSignal  = (d?.streak_signal as string | null) ?? null;
  const streakDesc    = (d?.streak_desc   as string) ?? "";
  const streakCount   = (d?.streak_count  as number) ?? 0;

  const confidence    = (d?.confidence    as number) ?? 50;
  const activeSignal  = (d?.active_signal as string | null) ?? null;
  const signalReady   = (d?.signal_ready  as boolean) ?? false;
  const threshold     = (d?.entry_threshold as number) ?? 10.20;
  const ticks         = (d?.ticks as number) ?? 3;
  const evenPct       = (d?.even_pct as number) ?? 50;
  const oddPct        = (d?.odd_pct  as number) ?? 50;
  const precedingDigit = (d?.preceding_digit as number) ?? -1;

  const httpCurrentDigit = (d?.current_digit as number) ?? 0;
  const currentDigit     = liveTick?.digit ?? httpCurrentDigit;
  const isEven           = EVEN_DIGITS.includes(currentDigit);

  // Sort dist for cursor rendering
  const sortedDist = useMemo(() => [...digitDist].sort((a, b) => a.digit - b.digit), [digitDist]);
  const mostFreq = digitDist.length ? [...digitDist].sort((a, b) => b.percentage - a.percentage)[0]?.digit : -1;
  const leastFreq = digitDist.length ? [...digitDist].sort((a, b) => a.percentage - b.percentage)[0]?.digit : -1;

  const hasData = digitDist.length > 0;

  return (
    <div className="space-y-4 animate-fade-in-up max-w-4xl" data-testid="page-even-odd">

      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <Divide size={18} className="text-primary" />
            <h2 className="font-orbitron text-lg font-bold text-primary tracking-wider">EVEN / ODD STRATEGY</h2>
          </div>
          <p className="font-rajdhani text-xs text-muted-foreground tracking-widest uppercase mt-0.5">
            Bidirectional Signal · Buy Even + Buy Odd · {tickCount} Ticks
          </p>
        </div>
        {/* Live digit corner */}
        <div className="flex flex-col items-center flex-shrink-0">
          <div className="w-16 h-16 rounded-xl flex items-center justify-center font-orbitron text-3xl font-black"
            style={{ background: DIGIT_COLORS[currentDigit], color: "#fff", boxShadow: `0 0 18px ${DIGIT_COLORS[currentDigit]}70` }}>
            {currentDigit}
          </div>
          <div className="mt-1 font-orbitron text-[10px] font-bold" style={{ color: isEven ? "#22c55e" : "#fb8c00" }}>
            {isEven ? "EVEN" : "ODD"}
          </div>
          <div className="mt-0.5 font-rajdhani text-[9px] text-muted-foreground">{liveTick ? "live ●" : "…"}</div>
        </div>
      </div>

      {/* Tick window */}
      <div className="cyber-card p-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-rajdhani text-[10px] text-muted-foreground tracking-widest uppercase flex-shrink-0">Tick Window:</span>
          {TICK_PRESETS.map((p) => (
            <button key={p} onClick={() => setTickCount(p)}
              className="px-3 py-1.5 rounded text-xs font-orbitron font-bold transition-all"
              style={tickCount === p
                ? { background: "#00e5ff", color: "#050a0f" }
                : { background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.12)", color: "#aaa" }}>
              {p}
            </button>
          ))}
          <div className="ml-auto flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold"
            style={{ background: "rgba(0,200,83,0.12)", border: "1px solid rgba(0,200,83,0.35)", color: "#00c853" }}>
            <div className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
            {isLoading ? "Updating…" : `${tickCount} ticks`}
          </div>
        </div>
      </div>

      {/* Floating digit circles — Deriv.com style with pink moving cursor */}
      <div className="cyber-card p-4">
        <div className="flex items-center justify-between mb-3">
          <span className="font-rajdhani text-[10px] font-bold tracking-widest uppercase text-muted-foreground">
            {tickCount}-Tick Digit Distribution (sums to 100%)
          </span>
          <div className="flex items-center gap-2 text-[9px] font-rajdhani text-muted-foreground">
            <div className="flex items-center gap-1"><svg width={8} height={6} viewBox="0 0 8 6"><polygon points="4,0 8,6 0,6" fill="#ff1e9e"/></svg> Current</div>
            <div className="flex items-center gap-1"><div style={{ width: 10, height: 2, background: "#22c55e" }} /> Highest</div>
            <div className="flex items-center gap-1"><div style={{ width: 10, height: 2, background: "#ef4444" }} /> Lowest</div>
          </div>
        </div>
        {isLoading && !hasData ? (
          <div className="flex gap-2 justify-center py-4">
            {Array.from({ length: 10 }, (_, i) => (
              <div key={i} className="rounded-full bg-muted/20 animate-pulse" style={{ width: 52, height: 52 }} />
            ))}
          </div>
        ) : (
          <div className="flex justify-between px-1 overflow-x-auto">
            {sortedDist.map((item) => (
              <FloatingDigitCircle key={item.digit}
                digit={item.digit} pct={item.percentage}
                isCurrent={item.digit === currentDigit}
                isElevated={item.percentage >= threshold}
                isMost={item.digit === mostFreq}
                isLeast={item.digit === leastFreq} />
            ))}
          </div>
        )}
        {/* Even / Odd parity bar */}
        <div className="mt-3 grid grid-cols-2 gap-2">
          {[
            { label: "EVEN (0,2,4,6,8)", pct: evenPct, color: "#22c55e" },
            { label: "ODD (1,3,5,7,9)", pct: oddPct, color: "#fb8c00" },
          ].map(({ label, pct, color }) => (
            <div key={label}>
              <div className="flex justify-between mb-0.5">
                <span className="font-rajdhani text-[9px] text-muted-foreground">{label}</span>
                <span className="font-orbitron text-[10px] font-bold" style={{ color }}>{pct}%</span>
              </div>
              <div className="h-1.5 rounded-full overflow-hidden" style={{ background: "rgba(255,255,255,0.08)" }}>
                <div className="h-full rounded-full" style={{ width: `${pct}%`, background: color, transition: "width 0.7s" }} />
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Active signal banner */}
      {signalReady && activeSignal && (
        <div className="rounded-xl p-4 border-2 animate-pulse"
          style={{
            background: activeSignal.includes("EVEN") ? "rgba(34,197,94,0.12)" : "rgba(251,140,0,0.12)",
            borderColor: activeSignal.includes("EVEN") ? "#22c55e" : "#fb8c00",
            boxShadow: `0 0 32px ${activeSignal.includes("EVEN") ? "rgba(34,197,94,0.3)" : "rgba(251,140,0,0.3)"}`,
          }}>
          <div className="flex items-center gap-3">
            <Zap size={28} style={{ color: activeSignal.includes("EVEN") ? "#22c55e" : "#fb8c00", flexShrink: 0 }} />
            <div className="flex-1">
              <div className="font-orbitron text-xl font-black" style={{ color: activeSignal.includes("EVEN") ? "#22c55e" : "#fb8c00" }}>
                ✦ {activeSignal}
              </div>
              <div className="font-rajdhani text-sm mt-0.5 text-muted-foreground">
                {streakSignal
                  ? `Streak pattern: ${streakDesc} · ${streakCount} ticks into reversal`
                  : activeSignal.includes("EVEN")
                    ? `Watching: odd digit ${evenEntryDigit} at ${evenEntryPct.toFixed(2)}% (≥${threshold}%) · Preceding: ${precedingDigit} (ODD ✓)`
                    : `Watching: even digit ${oddEntryDigit} at ${oddEntryPct.toFixed(2)}% (≥${threshold}%) · Preceding: ${precedingDigit} (EVEN ✓)`}
                {" "}· Contract: {ticks} ticks
              </div>
            </div>
            <div className="flex-shrink-0 text-right">
              <div className="font-orbitron text-2xl font-black" style={{ color: activeSignal.includes("EVEN") ? "#22c55e" : "#fb8c00" }}>
                {confidence}%
              </div>
              <div className="font-rajdhani text-xs text-muted-foreground">confidence</div>
            </div>
          </div>
        </div>
      )}

      {/* Waiting */}
      {!signalReady && hasData && (
        <div className="rounded-xl p-3 border" style={{ background: "rgba(255,255,255,0.03)", borderColor: "rgba(255,255,255,0.10)" }}>
          <div className="flex items-center gap-2">
            <AlertTriangle size={15} style={{ color: "#fb8c00", flexShrink: 0 }} />
            <div className="font-rajdhani text-sm" style={{ color: "rgba(255,200,100,0.8)" }}>
              <strong>WAITING FOR ENTRY</strong> — Monitor both signal panels below. Preceding: <strong>{precedingDigit >= 0 ? `${precedingDigit} (${EVEN_DIGITS.includes(precedingDigit) ? "EVEN" : "ODD"})` : "…"}</strong>
            </div>
          </div>
        </div>
      )}

      {/* ── TWO SIGNAL PANELS ── */}
      {hasData && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">

          {/* BUY EVEN SIGNAL — watch ODD digits */}
          <div className="cyber-card p-4" style={{ border: evenSignalReady ? "1.5px solid #22c55e" : undefined }}>
            <div className="flex items-center gap-2 mb-2">
              <TrendingUp size={14} style={{ color: "#22c55e" }} />
              <div>
                <div className="font-orbitron text-sm font-bold" style={{ color: "#22c55e" }}>BUY EVEN SIGNAL</div>
                <div className="font-rajdhani text-[9px] text-muted-foreground">Watch ODD digits (1,3,5,7,9) — one must be elevated</div>
              </div>
            </div>

            <div className="flex justify-between px-1 mb-3">
              {oddStats.length > 0 ? oddStats.map((s) => (
                <ThresholdCircle key={s.digit} digit={s.digit} pct={s.pct} isCandidate={s.is_entry_candidate} threshold={threshold} />
              )) : ODD_DIGITS.map((d) => (
                <div key={d} className="w-12 h-12 rounded-full bg-muted/20 animate-pulse" />
              ))}
            </div>

            <div className="space-y-1.5">
              <CondRow met={evenConds.exactly_one_candidate}
                label={`Exactly ONE odd digit ≥${threshold}%`}
                detail={evenConds.exactly_one_candidate
                  ? `Digit ${evenEntryDigit} at ${evenEntryPct.toFixed(2)}% — elevated`
                  : `${oddStats.filter((s) => s.is_entry_candidate).length} candidate(s) — need exactly 1`} />
              <CondRow met={evenConds.all_others_below}
                label={`All other odd digits <${threshold}%`}
                detail={evenConds.all_others_below ? "All remaining odd digits below threshold" : "Multiple odd digits elevated — wait"} />
              <CondRow met={evenConds.preceding_is_odd}
                label="Preceding digit is ODD"
                detail={precedingDigit >= 0
                  ? `Preceding: ${precedingDigit} (${ODD_DIGITS.includes(precedingDigit) ? "ODD ✓" : "EVEN — wait for ODD"})`
                  : "Waiting for stream…"} />
            </div>

            {evenSignalReady && (
              <div className="mt-2 p-2 rounded-lg text-center font-orbitron text-sm font-black"
                style={{ background: "rgba(34,197,94,0.15)", color: "#22c55e", border: "1px solid rgba(34,197,94,0.4)" }}>
                ✓ TRADE EVEN NOW
              </div>
            )}
          </div>

          {/* BUY ODD SIGNAL — watch EVEN digits */}
          <div className="cyber-card p-4" style={{ border: oddSignalReady ? "1.5px solid #fb8c00" : undefined }}>
            <div className="flex items-center gap-2 mb-2">
              <TrendingDown size={14} style={{ color: "#fb8c00" }} />
              <div>
                <div className="font-orbitron text-sm font-bold" style={{ color: "#fb8c00" }}>BUY ODD SIGNAL</div>
                <div className="font-rajdhani text-[9px] text-muted-foreground">Watch EVEN digits (0,2,4,6,8) — one must be elevated</div>
              </div>
            </div>

            <div className="flex justify-between px-1 mb-3">
              {evenStats.length > 0 ? evenStats.map((s) => (
                <ThresholdCircle key={s.digit} digit={s.digit} pct={s.pct} isCandidate={s.is_entry_candidate} threshold={threshold} />
              )) : EVEN_DIGITS.map((d) => (
                <div key={d} className="w-12 h-12 rounded-full bg-muted/20 animate-pulse" />
              ))}
            </div>

            <div className="space-y-1.5">
              <CondRow met={oddConds.exactly_one_candidate}
                label={`Exactly ONE even digit ≥${threshold}%`}
                detail={oddConds.exactly_one_candidate
                  ? `Digit ${oddEntryDigit} at ${oddEntryPct.toFixed(2)}% — elevated`
                  : `${evenStats.filter((s) => s.is_entry_candidate).length} candidate(s) — need exactly 1`} />
              <CondRow met={oddConds.all_others_below}
                label={`All other even digits <${threshold}%`}
                detail={oddConds.all_others_below ? "All remaining even digits below threshold" : "Multiple even digits elevated — wait"} />
              <CondRow met={oddConds.preceding_is_even}
                label="Preceding digit is EVEN"
                detail={precedingDigit >= 0
                  ? `Preceding: ${precedingDigit} (${EVEN_DIGITS.includes(precedingDigit) ? "EVEN ✓" : "ODD — wait for EVEN"})`
                  : "Waiting for stream…"} />
            </div>

            {oddSignalReady && (
              <div className="mt-2 p-2 rounded-lg text-center font-orbitron text-sm font-black"
                style={{ background: "rgba(251,140,0,0.15)", color: "#fb8c00", border: "1px solid rgba(251,140,0,0.4)" }}>
                ✓ TRADE ODD NOW
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── STREAK PANEL ── */}
      {hasData && (
        <div className="cyber-card p-4">
          <div className="font-rajdhani text-[10px] font-bold tracking-widest uppercase text-muted-foreground mb-3">
            Streak Pattern Detector
          </div>
          {streakSignal ? (
            <div className="flex items-center gap-3 p-3 rounded-xl"
              style={{
                background: streakSignal === "buy_even" ? "rgba(34,197,94,0.1)" : "rgba(251,140,0,0.1)",
                border: `1px solid ${streakSignal === "buy_even" ? "rgba(34,197,94,0.4)" : "rgba(251,140,0,0.4)"}`,
              }}>
              <Zap size={18} style={{ color: streakSignal === "buy_even" ? "#22c55e" : "#fb8c00" }} />
              <div>
                <div className="font-orbitron text-sm font-bold" style={{ color: streakSignal === "buy_even" ? "#22c55e" : "#fb8c00" }}>
                  {streakSignal === "buy_even" ? "STREAK → BUY EVEN" : "STREAK → BUY ODD"}
                </div>
                <div className="font-rajdhani text-xs text-muted-foreground">
                  Pattern: {streakDesc} · Reversal streak: {streakCount} ticks strong
                </div>
              </div>
            </div>
          ) : (
            <div>
              <div className="font-rajdhani text-xs text-muted-foreground mb-2">
                Watching for: 2–4 consecutive EVEN/ODD outcomes followed by 2+ of the opposite
              </div>
              {/* Recent parity strip */}
              <div className="flex gap-1 flex-wrap">
                {(d?.recent_digits as number[] ?? []).slice(-20).map((dv, i) => (
                  <div key={i}
                    className="w-7 h-7 rounded flex items-center justify-center font-orbitron text-xs font-bold"
                    style={{
                      background: EVEN_DIGITS.includes(dv) ? "rgba(34,197,94,0.2)" : "rgba(251,140,0,0.2)",
                      border: `1px solid ${EVEN_DIGITS.includes(dv) ? "rgba(34,197,94,0.5)" : "rgba(251,140,0,0.5)"}`,
                      color: EVEN_DIGITS.includes(dv) ? "#22c55e" : "#fb8c00",
                    }}>
                    {dv}
                  </div>
                ))}
                {(!d?.recent_digits || (d.recent_digits as number[]).length === 0) && (
                  <span className="font-rajdhani text-xs text-muted-foreground">Warming up stream…</span>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Signal strength bar */}
      {hasData && (
        <div className="cyber-card p-3">
          <div className="flex items-center justify-between mb-1">
            <span className="font-rajdhani text-xs text-muted-foreground">Signal strength — {activeSignal ?? "No signal"}</span>
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
                  : "linear-gradient(90deg,#7f1d1d,#ef4444)",
              }} />
          </div>
        </div>
      )}

      {/* Even side full ranked display */}
      {hasData && evenRanked.length > 0 && (
        <div className="cyber-card p-4">
          <div className="font-rajdhani text-[10px] font-bold tracking-widest uppercase text-muted-foreground mb-3">
            Even Digits Ranked (0,2,4,6,8)
          </div>
          <div className="flex justify-around">
            {evenRanked.map((item) => {
              const colors: Record<string, string> = { green: "#22c55e", blue: "#3b82f6", red: "#ef4444", yellow: "#facc15", neutral: "rgba(255,255,255,0.3)" };
              const c = colors[item.color] ?? "#fff";
              return (
                <div key={item.digit} className="flex flex-col items-center gap-1">
                  <div className="w-12 h-12 rounded-full flex items-center justify-center font-orbitron text-lg font-black"
                    style={{ background: `${c}20`, border: `2.5px solid ${c}`, color: "#fff" }}>
                    {item.digit}
                  </div>
                  <div className="font-orbitron text-xs font-bold" style={{ color: c }}>{item.pct.toFixed(1)}%</div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Odd side full ranked display */}
      {hasData && oddRanked.length > 0 && (
        <div className="cyber-card p-4">
          <div className="font-rajdhani text-[10px] font-bold tracking-widest uppercase text-muted-foreground mb-3">
            Odd Digits Ranked (1,3,5,7,9)
          </div>
          <div className="flex justify-around">
            {oddRanked.map((item) => {
              const colors: Record<string, string> = { green: "#22c55e", blue: "#3b82f6", red: "#ef4444", yellow: "#facc15", neutral: "rgba(255,255,255,0.3)" };
              const c = colors[item.color] ?? "#fff";
              return (
                <div key={item.digit} className="flex flex-col items-center gap-1">
                  <div className="w-12 h-12 rounded-full flex items-center justify-center font-orbitron text-lg font-black"
                    style={{ background: `${c}20`, border: `2.5px solid ${c}`, color: "#fff" }}>
                    {item.digit}
                  </div>
                  <div className="font-orbitron text-xs font-bold" style={{ color: c }}>{item.pct.toFixed(1)}%</div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
