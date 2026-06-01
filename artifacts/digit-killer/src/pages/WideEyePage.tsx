import { useState, useMemo, useEffect, useRef } from "react";
import {
  useGetWideEyeAnalysis,
  getGetWideEyeAnalysisQueryKey,
} from "@workspace/api-client-react";
import { useSymbol } from "@/context/SymbolContext";
import { Eye, Info, ChevronDown } from "lucide-react";

const DIGIT_COLORS: Record<number, string> = {
  0: "#00897b", 1: "#1e88e5", 2: "#8e24aa", 3: "#43a047", 4: "#fb8c00",
  5: "#00e5ff", 6: "#c6e500", 7: "#e53935", 8: "#e91e8c", 9: "#fdd835",
};
const EVEN_DIGITS = [0, 2, 4, 6, 8];

const MARKET_GROUPS = [
  { label: "Volatility", symbols: [
    { key: "R_10", label: "Volatility 10 Index" }, { key: "R_25", label: "Volatility 25 Index" },
    { key: "R_50", label: "Volatility 50 Index" }, { key: "R_75", label: "Volatility 75 Index" },
    { key: "R_100", label: "Volatility 100 Index" },
    { key: "1HZ10V", label: "Volatility 10 (1s) Index" }, { key: "1HZ15V", label: "Volatility 15 (1s) Index" },
    { key: "1HZ25V", label: "Volatility 25 (1s) Index" }, { key: "1HZ30V", label: "Volatility 30 (1s) Index" },
    { key: "1HZ50V", label: "Volatility 50 (1s) Index" }, { key: "1HZ75V", label: "Volatility 75 (1s) Index" },
    { key: "1HZ90V", label: "Volatility 90 (1s) Index" }, { key: "1HZ100V", label: "Volatility 100 (1s) Index" },
  ]},
  { label: "Daily Reset", symbols: [
    { key: "RDBEAR", label: "Bear Market Index" },
    { key: "RDBULL", label: "Bull Market Index" },
  ]},
  { label: "Crash/Boom", symbols: [
    { key: "CRASH300N", label: "Crash 300 Index" }, { key: "CRASH500", label: "Crash 500 Index" },
    { key: "CRASH1000", label: "Crash 1000 Index" }, { key: "BOOM300N", label: "Boom 300 Index" },
    { key: "BOOM500", label: "Boom 500 Index" }, { key: "BOOM1000", label: "Boom 1000 Index" },
  ]},
  { label: "Jump", symbols: [
    { key: "JD10", label: "Jump 10 Index" }, { key: "JD25", label: "Jump 25 Index" },
    { key: "JD50", label: "Jump 50 Index" }, { key: "JD75", label: "Jump 75 Index" },
    { key: "JD100", label: "Jump 100 Index" },
  ]},
];
const ALL_SYMBOLS = MARKET_GROUPS.flatMap((g) => g.symbols);

interface DigitStat { digit: number; percentage: number; rank: number; count: number; }

/**
 * useRealtimeBuffer
 *
 * Opens ONE SSE connection per symbol. Maintains a local 100-tick rolling
 * buffer that is:
 *   1. Seeded once from the HTTP rolling_digits array (first time it has ≥20 items)
 *   2. Extended by each incoming SSE tick — old ticks drop off when length > 100
 *
 * This means the Even/Odd counts are ALWAYS computed from exactly 100 real
 * ticks and update the instant Deriv sends a new tick — zero polling lag.
 */
function useRealtimeBuffer(symbol: string, seedDigits: number[]) {
  const [buffer, setBuffer]   = useState<number[]>([]);
  const [price,  setPrice]    = useState(0);
  const seededRef = useRef(false);
  const symbolRef = useRef(symbol);

  // Reset when symbol changes
  useEffect(() => {
    if (symbolRef.current !== symbol) {
      symbolRef.current = symbol;
      seededRef.current = false;
      setBuffer([]);
      setPrice(0);
    }
  }, [symbol]);

  // Seed from HTTP data (once per symbol)
  useEffect(() => {
    if (!seededRef.current && seedDigits.length >= 20) {
      setBuffer(seedDigits.slice(-100));
      seededRef.current = true;
    }
  }, [seedDigits]);

  // SSE: append every incoming tick to the buffer
  useEffect(() => {
    if (!symbol) return;
    let es: EventSource;
    let dead = false;

    const open = () => {
      es = new EventSource(`/api/live-ticks?symbol=${encodeURIComponent(symbol)}`);
      es.onmessage = (e) => {
        if (dead) return;
        try {
          const { price: p, digit: dg } = JSON.parse(e.data) as { price: number; digit: number };
          setPrice(p);
          setBuffer((prev) => {
            if (prev.length === 0) return prev; // wait for seed
            const next = [...prev, dg];
            return next.length > 100 ? next.slice(-100) : next;
          });
        } catch {}
      };
      es.onerror = () => { es.close(); if (!dead) setTimeout(open, 2000); };
    };
    open();
    return () => { dead = true; es?.close(); };
  }, [symbol]);

  // Derive Even/Odd stats from the local buffer (computed instantly, no server round-trip)
  const currentDigit  = buffer[buffer.length - 1] ?? 0;
  const evenCount     = buffer.filter((d) => EVEN_DIGITS.includes(d)).length;
  const oddCount      = buffer.length - evenCount;
  const n             = buffer.length || 1;
  const isSeeded      = buffer.length >= 20;

  return {
    buffer,
    price,
    currentDigit,
    evenCount,
    oddCount,
    evenPct:  parseFloat(((evenCount / n) * 100).toFixed(1)),
    oddPct:   parseFloat(((oddCount  / n) * 100).toFixed(1)),
    recent24: buffer.slice(-24),
    isSeeded,
  };
}

// ─── D-Circle Arc Gauge ───────────────────────────────────────────────────────
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

// ─── Custom dark-green Market Dropdown ───────────────────────────────────────
function MarketSelect({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState({ top: 0, left: 0, width: 0 });
  const [activeGroup, setActiveGroup] = useState(() =>
    MARKET_GROUPS.find((g) => g.symbols.some((s) => s.key === value))?.label ?? "Volatility"
  );
  const btnRef = useRef<HTMLButtonElement>(null);
  const currentLabel = ALL_SYMBOLS.find((s) => s.key === value)?.label ?? value;
  const currentGroup = MARKET_GROUPS.find((g) => g.label === activeGroup) ?? MARKET_GROUPS[0];

  const openMenu = () => {
    const r = btnRef.current?.getBoundingClientRect();
    if (r) setPos({ top: r.bottom + 4, left: r.left, width: r.width });
    setOpen(true);
  };

  useEffect(() => {
    if (!open) return;
    const h = (e: MouseEvent) => {
      if (!(e.target as HTMLElement).closest("[data-mkt-dd]")) setOpen(false);
    };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [open]);

  return (
    <div data-mkt-dd>
      <button ref={btnRef} onClick={open ? () => setOpen(false) : openMenu}
        className="w-full flex items-center justify-between px-4 py-3 rounded-lg font-rajdhani text-sm font-bold transition-all"
        style={{ background: "#0a2818", border: "1px solid #1a5c30", color: "#7fff7f" }}
        data-testid="btn-market-select"
      >
        <span className="truncate">{currentLabel}</span>
        <ChevronDown size={14} className={`flex-shrink-0 ml-2 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <div data-mkt-dd className="rounded-xl overflow-hidden shadow-2xl"
          style={{ position: "fixed", top: pos.top, left: pos.left, width: Math.max(pos.width, 300),
            zIndex: 99999, background: "#051a0e", border: "1px solid #1a5c30",
            boxShadow: "0 16px 48px rgba(0,0,0,0.9)" }}>
          {/* Group tabs */}
          <div className="flex border-b" style={{ borderColor: "#1a5c30" }}>
            {MARKET_GROUPS.map((g) => (
              <button key={g.label} data-mkt-dd
                onClick={() => {
                  setActiveGroup(g.label);
                  if (!g.symbols.some((s) => s.key === value)) { onChange(g.symbols[0].key); }
                }}
                className="flex-1 py-2.5 font-rajdhani text-xs font-bold tracking-wider transition-all"
                style={activeGroup === g.label
                  ? { color: "#7fff7f", borderBottom: "2px solid #4ade80", background: "rgba(74,222,128,0.08)" }
                  : { color: "rgba(255,255,255,0.35)" }}>
                {g.label.split("/")[0]}
              </button>
            ))}
          </div>
          {/* Options */}
          <div className="py-1 max-h-64 overflow-y-auto">
            {currentGroup.symbols.map((s) => (
              <button key={s.key} data-mkt-dd
                onClick={() => { onChange(s.key); setOpen(false); }}
                className="w-full flex items-center justify-between px-4 py-2.5 font-rajdhani text-sm font-semibold transition-all"
                style={value === s.key
                  ? { color: "#4ade80", background: "rgba(74,222,128,0.12)" }
                  : { color: "#a3e8b5" }}
                data-testid={`opt-${s.key}`}
              >
                <span>{s.label}</span>
                {value === s.key && <div className="w-2 h-2 rounded-full bg-green-400 flex-shrink-0" />}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────
export default function WideEyePage() {
  const { symbol, setSymbol } = useSymbol();
  const [tickCount, setTickCount] = useState(1000);
  const [tickInput, setTickInput] = useState("1000");
  const [ouThreshold, setOuThreshold] = useState(5);

  // HTTP polling: D-circle distribution + rolling stream (heavier analysis)
  const { data, isLoading } = useGetWideEyeAnalysis(
    { symbol, count: tickCount },
    {
      query: {
        enabled: !!symbol,
        queryKey: getGetWideEyeAnalysisQueryKey({ symbol, count: tickCount }),
        refetchInterval: 2000,
      },
    }
  );

  const d = data as Record<string, unknown> | undefined;
  const circleCustom  = (d?.d_circle_custom as { digits?: DigitStat[]; current_digit?: number; count?: number }) ?? {};
  const rollingDigits: number[] = (d?.rolling_digits as number[]) ?? [];

  // ── Realtime 100-tick buffer (SSE-fed, seeded from HTTP rolling_digits) ──────
  // This single hook maintains exactly 100 digits locally, updated the instant
  // each Deriv tick arrives — no HTTP round-trip for Even/Odd stats.
  const rt = useRealtimeBuffer(symbol, rollingDigits);

  // Price + current digit: SSE buffer is authoritative; fall back to HTTP
  const currentPrice  = rt.price || ((d?.current_price as number) ?? 0);
  const currentDigit  = rt.isSeeded ? rt.currentDigit : (circleCustom.current_digit ?? 0);

  const digits: DigitStat[] = circleCustom.digits ??
    Array.from({ length: 10 }, (_, i) => ({ digit: i, percentage: 10, rank: i + 1, count: 0 }));
  const loadedCount   = circleCustom.count ?? 0;
  const currentLabel  = ALL_SYMBOLS.find((s) => s.key === symbol)?.label ?? symbol;

  const sortedDigits  = useMemo(() => [...digits].sort((a, b) => b.percentage - a.percentage), [digits]);
  const mostFrequent  = sortedDigits[0]?.digit ?? -1;
  const leastFrequent = sortedDigits[sortedDigits.length - 1]?.digit ?? -1;

  // Even/Odd stats come entirely from the local SSE buffer — always 100 ticks, always current
  const isCurrentEven = EVEN_DIGITS.includes(currentDigit);
  const recentEO      = rt.recent24.map((dv) => (EVEN_DIGITS.includes(dv) ? "E" : "O"));

  // ── Over/Under (uses full rolling stream from HTTP for more context) ──────────
  const ouStats = useMemo(() => {
    const arr = rollingDigits.length > 0 ? rollingDigits : rt.buffer;
    const n = arr.length || 1;
    const under = arr.filter((dv) => dv < ouThreshold).length;
    const equal = arr.filter((dv) => dv === ouThreshold).length;
    const over  = arr.filter((dv) => dv > ouThreshold).length;
    return { under, equal, over,
      underPct: parseFloat(((under / n) * 100).toFixed(1)),
      equalPct: parseFloat(((equal / n) * 100).toFixed(1)),
      overPct:  parseFloat(((over  / n) * 100).toFixed(1)),
    };
  }, [rollingDigits, rt.buffer, ouThreshold]);
  const recentUO = useMemo(() => {
    const arr = rollingDigits.length > 0 ? rollingDigits : rt.buffer;
    return arr.slice(-20).map((dv) => (dv < ouThreshold ? "U" : dv === ouThreshold ? "=" : "O"));
  }, [rollingDigits, rt.buffer, ouThreshold]);

  const applyTickInput = () => {
    const v = parseInt(tickInput);
    if (!isNaN(v) && v >= 50 && v <= 5000) setTickCount(v);
  };

  return (
    <div className="space-y-3 animate-fade-in-up max-w-5xl" data-testid="page-wide-eye">

      {/* ─── Title bar ─── */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <button className="flex items-center gap-1.5 px-3 py-1.5 rounded-full font-rajdhani text-sm font-bold"
            style={{ background: "rgba(0,229,255,0.12)", border: "1px solid rgba(0,229,255,0.3)", color: "#00e5ff" }}>
            <Eye size={14} /> Wide Eye
          </button>
          <div className="w-7 h-7 rounded-full bg-muted/40 border border-border flex items-center justify-center cursor-pointer">
            <Info size={12} className="text-muted-foreground" />
          </div>
        </div>
        <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold"
          style={{ background: "rgba(0,200,83,0.12)", border: "1px solid rgba(0,200,83,0.35)", color: "#00c853" }}>
          <div className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
          {rt.isSeeded ? `Live SSE ✓ (${rt.buffer.length})` : "Connecting…"}
        </div>
      </div>

      {/* ─── Select Market (dark green) ─── */}
      <div className="rounded-xl p-3" style={{ background: "#071a0e", border: "1px solid #1a5c30" }}>
        <div className="font-rajdhani text-xs font-bold tracking-widest uppercase mb-2" style={{ color: "#4ade80" }}>
          Select Market:
        </div>
        <MarketSelect value={symbol} onChange={setSymbol} />
      </div>

      {/* ─── Price + Current Digit (SSE-powered) ─── */}
      <div className="cyber-card p-4">
        <div className="flex items-center justify-between gap-4">
          <div>
            <div className="font-rajdhani text-xs text-muted-foreground tracking-widest uppercase mb-1">
              {currentLabel}
            </div>
            <div className="font-orbitron text-3xl md:text-4xl font-bold text-foreground transition-all">
              {currentPrice
                ? currentPrice.toFixed(currentPrice > 100 ? 2 : 4)
                : isLoading ? "—" : "—"}
            </div>
          </div>
          <div className="flex flex-col items-center gap-1 flex-shrink-0">
            <div className="font-rajdhani text-[10px] text-muted-foreground tracking-widest uppercase">Now</div>
            <div
              className="w-16 h-16 md:w-20 md:h-20 rounded-full flex items-center justify-center font-orbitron font-black transition-all duration-200"
              style={{ background: DIGIT_COLORS[currentDigit], fontSize: "clamp(28px,5vw,36px)",
                color: "#fff", boxShadow: `0 0 28px ${DIGIT_COLORS[currentDigit]}80` }}
              data-testid="current-digit-badge">
              {currentDigit}
            </div>
          </div>
        </div>
      </div>

      {/* ─── Ticks Window ─── */}
      <div className="cyber-card p-3 flex flex-wrap items-center gap-4">
        <div className="flex items-center gap-3">
          <label className="font-rajdhani text-sm text-foreground font-semibold">Ticks window:</label>
          <input type="number" min={50} max={5000} value={tickInput}
            onChange={(e) => setTickInput(e.target.value)}
            onBlur={applyTickInput} onKeyDown={(e) => e.key === "Enter" && applyTickInput()}
            className="w-28 px-3 py-2 rounded-md font-orbitron text-sm bg-background border border-border text-foreground focus:outline-none focus:border-primary text-center"
            data-testid="input-tick-count" />
          <span className="font-rajdhani text-xs text-muted-foreground">(50 – 5000)</span>
        </div>
        <div className="ml-auto font-orbitron text-xs text-muted-foreground">
          {loadedCount > 0 ? `${loadedCount}/${tickCount}` : ""}
        </div>
      </div>

      {/* ─── D-Circle Distribution ─── */}
      <div className="cyber-card p-3 md:p-4">
        <div className="flex items-center justify-between mb-1">
          <div className="font-rajdhani text-sm text-foreground font-semibold">
            Last {tickCount} ticks digit distribution
          </div>
          <div className="flex items-center gap-4 text-[10px] font-rajdhani">
            <span className="text-primary">▲ current / most</span>
            <span className="text-red-400">▽ least</span>
          </div>
        </div>
        <div className="grid mt-2" style={{ gridTemplateColumns: "repeat(10, minmax(0, 1fr))", gap: "4px" }}>
          {Array.from({ length: 10 }, (_, i) => i).map((dv) => {
            const stat = digits.find((x) => x.digit === dv) ?? { digit: dv, percentage: 10, rank: dv + 1, count: 0 };
            return (
              <DCircleGauge key={dv} digit={dv} percentage={stat.percentage} count={stat.count}
                isCurrent={dv === currentDigit} isMost={dv === mostFrequent} isLeast={dv === leastFrequent} />
            );
          })}
        </div>
      </div>

      {/* ─── Even/Odd — ALWAYS 100 ticks, current digit IN MIDDLE ─── */}
      <div className="cyber-card p-3 md:p-4" data-testid="section-even-odd-100">
        <div className="flex items-center justify-between mb-3">
          <div className="font-rajdhani text-sm text-foreground font-semibold">Even / Odd</div>
          <div className="font-rajdhani text-[10px] text-muted-foreground">Last 100 ticks · live</div>
        </div>

        {/* Three-column layout: Even | Current Digit | Odd */}
        <div className="grid grid-cols-3 gap-3 items-center mb-4">
          {/* Even column */}
          <div>
            <div className="flex items-baseline gap-2 mb-1">
              <span className="font-bold text-base" style={{ color: "#43a047" }}>Even</span>
              <span className="font-orbitron text-2xl font-bold text-foreground">{rt.evenCount}</span>
            </div>
            <div className="font-rajdhani text-xs text-muted-foreground mb-1.5">({rt.evenPct}%)</div>
            <div className="h-2.5 rounded-full overflow-hidden" style={{ background: "rgba(255,255,255,0.08)" }}>
              <div className="h-full rounded-full transition-all duration-300" style={{ width: `${rt.evenPct}%`, background: "#43a047" }} />
            </div>
          </div>

          {/* Current digit — CENTRE (SSE-driven, matches live market) */}
          <div className="flex flex-col items-center gap-1">
            <div
              className="w-16 h-16 rounded-full flex items-center justify-center font-orbitron text-2xl font-black transition-all duration-150"
              style={{ background: DIGIT_COLORS[currentDigit], color: "#fff",
                boxShadow: `0 0 22px ${DIGIT_COLORS[currentDigit]}90` }}
            >
              {currentDigit}
            </div>
            <div className="font-orbitron text-[10px] font-bold"
              style={{ color: isCurrentEven ? "#43a047" : "#e53935" }}>
              {isCurrentEven ? "EVEN" : "ODD"}
            </div>
          </div>

          {/* Odd column */}
          <div>
            <div className="flex items-baseline gap-2 mb-1 justify-end">
              <span className="font-orbitron text-2xl font-bold text-foreground">{rt.oddCount}</span>
              <span className="font-bold text-base" style={{ color: "#e53935" }}>Odd</span>
            </div>
            <div className="font-rajdhani text-xs text-muted-foreground mb-1.5 text-right">({rt.oddPct}%)</div>
            <div className="h-2.5 rounded-full overflow-hidden" style={{ background: "rgba(255,255,255,0.08)" }}>
              <div className="h-full rounded-full transition-all duration-300 ml-auto" style={{ width: `${rt.oddPct}%`, background: "#e53935" }} />
            </div>
          </div>
        </div>

        {/* Recent E/O dots */}
        {recentEO.length > 0 && (
          <div>
            <div className="font-rajdhani text-[10px] text-muted-foreground tracking-widest uppercase mb-1.5">Recent E/O</div>
            <div className="flex flex-wrap gap-1">
              {recentEO.map((lbl, i) => {
                const isLast = i === recentEO.length - 1;
                return (
                  <div key={i}
                    className="w-7 h-7 rounded-full flex items-center justify-center font-orbitron text-[10px] font-bold text-white transition-all"
                    style={{
                      background: lbl === "E" ? "#43a047" : "#e53935",
                      boxShadow: isLast ? `0 0 8px ${lbl === "E" ? "#43a047" : "#e53935"}` : undefined,
                      border: isLast ? "2px solid #fff" : undefined,
                    }}>
                    {lbl}
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* ─── Rolling Tick Stream (last 50 digits) ─── */}
      <div className="cyber-card p-3 md:p-4">
        <div className="flex items-center justify-between mb-2">
          <div className="font-rajdhani text-sm text-foreground font-semibold">
            Live Tick Stream — Last 50 Digits
          </div>
          <div className="flex items-center gap-1.5 text-xs font-rajdhani text-green-400">
            <div className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" /> live
          </div>
        </div>
        {rollingDigits.length === 0 ? (
          <div className="flex items-center justify-center h-12 text-muted-foreground font-rajdhani text-sm">
            {isLoading ? "Loading…" : "No data"}
          </div>
        ) : (
          <div className="flex flex-wrap gap-1">
            {rollingDigits.slice(-50).map((dv, i, arr) => {
              const isLatest = i === arr.length - 1;
              const c = DIGIT_COLORS[dv];
              const age = i / arr.length;
              return (
                <div key={i}
                  className="flex items-center justify-center rounded-full font-orbitron font-bold text-white flex-shrink-0"
                  style={{ width: isLatest ? "28px" : "22px", height: isLatest ? "28px" : "22px",
                    fontSize: isLatest ? "12px" : "10px", background: c,
                    border: isLatest ? "2px solid #fff" : undefined,
                    boxShadow: isLatest ? `0 0 10px ${c}` : undefined,
                    opacity: Math.max(0.4, 0.4 + age * 0.6) }}>
                  {dv}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ─── Over / Under ─── */}
      <div className="cyber-card p-3 md:p-4">
        <div className="flex items-center justify-between mb-3">
          <div className="font-rajdhani text-sm text-foreground font-semibold">Over / Under</div>
          <div className="flex items-center gap-2">
            <span className="font-rajdhani text-xs text-muted-foreground">Threshold:</span>
            <select value={ouThreshold} onChange={(e) => setOuThreshold(parseInt(e.target.value))}
              className="px-2 py-1 rounded bg-background border border-border text-primary font-orbitron text-xs focus:outline-none focus:border-primary cursor-pointer"
              data-testid="select-ou-threshold">
              {[1,2,3,4,5,6,7,8].map((v) => <option key={v} value={v}>{v}</option>)}
            </select>
          </div>
        </div>
        <div className="grid grid-cols-3 gap-3 mb-3">
          {[
            { label: "Under", count: ouStats.under, pct: ouStats.underPct, color: "#1e88e5" },
            { label: "Equal", count: ouStats.equal, pct: ouStats.equalPct, color: "#78909c" },
            { label: "Over",  count: ouStats.over,  pct: ouStats.overPct,  color: "#e53935" },
          ].map(({ label, count, pct, color }) => (
            <div key={label}>
              <div className="flex items-baseline gap-1.5">
                <span className="font-bold text-sm" style={{ color }}>{label}</span>
              </div>
              <div className="flex items-baseline gap-1">
                <span className="font-orbitron text-xl font-bold text-foreground">{count}</span>
                <span className="font-rajdhani text-xs text-muted-foreground">({pct}%)</span>
              </div>
              <div className="h-1.5 rounded-full overflow-hidden mt-1" style={{ background: "rgba(255,255,255,0.08)" }}>
                <div className="h-full rounded-full transition-all duration-500" style={{ width: `${pct}%`, background: color }} />
              </div>
            </div>
          ))}
        </div>
        {recentUO.length > 0 && (
          <div>
            <div className="font-rajdhani text-[10px] text-muted-foreground tracking-widest uppercase mb-1.5">Recent U/=/O</div>
            <div className="flex flex-wrap gap-1">
              {recentUO.map((lbl, i) => (
                <div key={i}
                  className="w-6 h-6 rounded-full flex items-center justify-center font-orbitron text-[10px] font-bold text-white"
                  style={{ background: lbl === "U" ? "#1e88e5" : lbl === "=" ? "#546e7a" : "#e53935" }}>
                  {lbl}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

    </div>
  );
}
