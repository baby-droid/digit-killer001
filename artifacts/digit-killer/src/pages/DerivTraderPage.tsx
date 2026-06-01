import { useState, useEffect, useRef, useMemo } from "react";
import { useSymbol } from "@/context/SymbolContext";
import { LineChart, RefreshCw, TrendingUp, TrendingDown, Wifi } from "lucide-react";

const DIGIT_COLORS: Record<number, string> = {
  0: "#00897b", 1: "#1e88e5", 2: "#8e24aa", 3: "#43a047", 4: "#fb8c00",
  5: "#00e5ff", 6: "#c6e500", 7: "#e53935", 8: "#e91e8c", 9: "#fdd835",
};

const TRACKED_SYMBOLS = [
  { key: "R_10",      label: "Volatility 10",     group: "Vol" },
  { key: "R_25",      label: "Volatility 25",     group: "Vol" },
  { key: "R_50",      label: "Volatility 50",     group: "Vol" },
  { key: "R_75",      label: "Volatility 75",     group: "Vol" },
  { key: "R_100",     label: "Volatility 100",    group: "Vol" },
  { key: "1HZ10V",    label: "Vol 10 (1s)",       group: "1s" },
  { key: "1HZ25V",    label: "Vol 25 (1s)",       group: "1s" },
  { key: "1HZ50V",    label: "Vol 50 (1s)",       group: "1s" },
  { key: "1HZ75V",    label: "Vol 75 (1s)",       group: "1s" },
  { key: "1HZ100V",   label: "Vol 100 (1s)",      group: "1s" },
  { key: "CRASH300N", label: "Crash 300",         group: "C/B" },
  { key: "CRASH500",  label: "Crash 500",         group: "C/B" },
  { key: "CRASH1000", label: "Crash 1000",        group: "C/B" },
  { key: "BOOM300N",  label: "Boom 300",          group: "C/B" },
  { key: "BOOM500",   label: "Boom 500",          group: "C/B" },
  { key: "BOOM1000",  label: "Boom 1000",         group: "C/B" },
  { key: "JD10",      label: "Jump 10",           group: "Jmp" },
  { key: "JD25",      label: "Jump 25",           group: "Jmp" },
  { key: "JD50",      label: "Jump 50",           group: "Jmp" },
  { key: "JD75",      label: "Jump 75",           group: "Jmp" },
  { key: "JD100",     label: "Jump 100",          group: "Jmp" },
];

interface SymbolStat {
  key: string;
  label: string;
  group: string;
  price: number;
  digit: number;
  digitFreq: number[];
  tickCount: number;
  lastUpdate: number;
}

function useMultiSymbolFeed(symbols: typeof TRACKED_SYMBOLS, activeGroup: string) {
  const [stats, setStats] = useState<Map<string, SymbolStat>>(() => new Map());
  const esSources = useRef<Map<string, EventSource>>(new Map());
  const dead = useRef(false);

  useEffect(() => {
    dead.current = false;
    const group = symbols.filter((s) => s.group === activeGroup);

    // Close connections not in active group
    for (const [key, es] of esSources.current) {
      if (!group.some((s) => s.key === key)) { es.close(); esSources.current.delete(key); }
    }

    // Open connections for active group
    group.forEach(({ key, label, group: grp }) => {
      if (esSources.current.has(key)) return;
      const open = () => {
        if (dead.current) return;
        const es = new EventSource(`/api/live-ticks?symbol=${encodeURIComponent(key)}`);
        esSources.current.set(key, es);
        es.onmessage = (e) => {
          if (dead.current) return;
          try {
            const { price, digit } = JSON.parse(e.data) as { price: number; digit: number };
            setStats((prev) => {
              const next = new Map(prev);
              const existing = next.get(key);
              const freq = existing?.digitFreq ?? Array(10).fill(0);
              const newFreq = [...freq];
              newFreq[digit] = (newFreq[digit] ?? 0) + 1;
              // Cap at 200 samples — reset if too large
              const total = newFreq.reduce((s, v) => s + v, 0);
              const cappedFreq = total > 200 ? newFreq.map((v) => Math.round((v / total) * 200)) : newFreq;
              next.set(key, { key, label, group: grp, price, digit,
                digitFreq: cappedFreq, tickCount: Math.min(total, 200), lastUpdate: Date.now() });
              return next;
            });
          } catch {}
        };
        es.onerror = () => { es.close(); esSources.current.delete(key); if (!dead.current) setTimeout(() => open(), 3000); };
      };
      open();
    });

    return () => {
      dead.current = true;
      for (const es of esSources.current.values()) es.close();
      esSources.current.clear();
    };
  }, [activeGroup, symbols]);

  return stats;
}

function DigitBar({ digit, count, total, isCurrent, role }: {
  digit: number; count: number; total: number; isCurrent: boolean;
  role: "most" | "second" | "second-least" | "least" | "mid";
}) {
  const pct = total > 0 ? (count / total) * 100 : 10;
  const barColor = role === "most" ? "#22c55e" : role === "second" ? "#3b82f6"
    : role === "second-least" ? "#facc15" : role === "least" ? "#ef4444"
    : "rgba(255,255,255,0.25)";
  return (
    <div className="flex flex-col items-center gap-0.5" style={{ flex: 1 }}>
      <div className="font-orbitron text-[9px] font-bold" style={{ color: barColor }}>
        {pct.toFixed(0)}
      </div>
      <div className="w-full rounded-t-sm relative overflow-hidden" style={{ height: "36px", background: "rgba(255,255,255,0.05)" }}>
        <div className="absolute bottom-0 w-full rounded-t-sm transition-all duration-500"
          style={{ height: `${Math.max(4, pct)}%`, background: barColor,
            boxShadow: isCurrent ? `0 0 6px ${barColor}` : undefined }} />
      </div>
      <div className="w-5 h-5 rounded-full flex items-center justify-center font-orbitron text-[9px] font-black text-white"
        style={{ background: DIGIT_COLORS[digit],
          border: isCurrent ? "1.5px solid #fff" : undefined,
          boxShadow: isCurrent ? `0 0 6px ${DIGIT_COLORS[digit]}` : undefined }}>
        {digit}
      </div>
    </div>
  );
}

function SymbolCard({ stat, isSelected, onClick }: {
  stat: SymbolStat; isSelected: boolean; onClick: () => void;
}) {
  const { digitFreq, digit: currentDigit, price, label, tickCount } = stat;
  const total = tickCount;

  const sorted = useMemo(() => {
    return digitFreq
      .map((count, d) => ({ digit: d, count }))
      .sort((a, b) => b.count - a.count);
  }, [digitFreq]);

  const getRole = (d: number): "most" | "second" | "second-least" | "least" | "mid" => {
    const idx = sorted.findIndex((x) => x.digit === d);
    if (idx === 0) return "most";
    if (idx === 1) return "second";
    if (idx === sorted.length - 1) return "least";
    if (idx === sorted.length - 2) return "second-least";
    return "mid";
  };

  const priceStr = price > 100 ? price.toFixed(2) : price.toFixed(4);
  const isStale = Date.now() - stat.lastUpdate > 5000;

  return (
    <div onClick={onClick} className="cyber-card p-3 cursor-pointer transition-all hover:scale-[1.01]"
      style={{ border: isSelected ? "1px solid rgba(0,229,255,0.5)" : undefined,
        boxShadow: isSelected ? "0 0 16px rgba(0,229,255,0.1)" : undefined }}>
      <div className="flex items-center justify-between mb-2">
        <div className="font-rajdhani text-xs font-semibold text-muted-foreground truncate">{label}</div>
        <div className="flex items-center gap-1.5 flex-shrink-0">
          <div className="w-1.5 h-1.5 rounded-full"
            style={{ background: isStale ? "#ef4444" : "#22c55e",
              animation: isStale ? undefined : "pulse 2s infinite" }} />
          <div className="w-8 h-8 rounded-full flex items-center justify-center font-orbitron text-base font-black text-white"
            style={{ background: DIGIT_COLORS[currentDigit], boxShadow: `0 0 10px ${DIGIT_COLORS[currentDigit]}70` }}>
            {currentDigit}
          </div>
        </div>
      </div>

      <div className="font-orbitron text-sm font-bold text-foreground mb-2">{priceStr}</div>

      {/* Digit bars — green=highest, red=lowest, yellow=2nd lowest, blue=2nd highest */}
      <div className="flex gap-0.5 items-end">
        {Array.from({ length: 10 }, (_, d) => (
          <DigitBar key={d} digit={d} count={digitFreq[d] ?? 0} total={total}
            isCurrent={d === currentDigit} role={getRole(d)} />
        ))}
      </div>
      <div className="mt-1 font-rajdhani text-[9px] text-muted-foreground text-right">
        {tickCount} ticks
      </div>
    </div>
  );
}

const GROUPS = ["Vol", "1s", "C/B", "Jmp"] as const;

export default function DerivTraderPage() {
  const { symbol, setSymbol } = useSymbol();
  const [activeGroup, setActiveGroup] = useState<string>("Vol");

  const groupSymbols = useMemo(() =>
    TRACKED_SYMBOLS.filter((s) => s.group === activeGroup),
    [activeGroup]
  );

  const statsMap = useMultiSymbolFeed(TRACKED_SYMBOLS, activeGroup);

  const groupStats = useMemo(() => {
    const result: SymbolStat[] = [];
    groupSymbols.forEach((s) => {
      const stat = statsMap.get(s.key);
      if (stat) result.push(stat);
      else result.push({ key: s.key, label: s.label, group: s.group, price: 0, digit: 0, digitFreq: Array(10).fill(0), tickCount: 0, lastUpdate: 0 });
    });
    return result;
  }, [groupSymbols, statsMap]);

  const selectedStat = statsMap.get(symbol) ?? groupStats[0];

  const groupLabels: Record<string, string> = { Vol: "Volatility", "1s": "Volatility 1s", "C/B": "Crash / Boom", Jmp: "Jump" };

  return (
    <div className="space-y-4 animate-fade-in-up" data-testid="page-deriv-trader">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <LineChart size={20} className="text-primary" />
          <div>
            <h2 className="font-orbitron text-lg font-bold text-primary tracking-wider">DERIV TRADER</h2>
            <p className="font-rajdhani text-[10px] text-muted-foreground tracking-widest uppercase">
              Live Markets · Real-Time Digit Distribution
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 px-2.5 py-1 rounded-full text-xs font-bold"
          style={{ background: "rgba(0,200,83,0.12)", border: "1px solid rgba(0,200,83,0.35)", color: "#00c853" }}>
          <Wifi size={10} />
          {statsMap.size} live
        </div>
      </div>

      {/* Color Legend */}
      <div className="flex flex-wrap items-center gap-4 px-1">
        {[
          { color: "#22c55e", label: "Highest digit %" },
          { color: "#3b82f6", label: "2nd Highest" },
          { color: "#facc15", label: "2nd Lowest" },
          { color: "#ef4444", label: "Lowest digit %" },
        ].map(({ color, label }) => (
          <div key={label} className="flex items-center gap-1.5">
            <div className="w-3 h-3 rounded-sm" style={{ background: color }} />
            <span className="font-rajdhani text-[10px] text-muted-foreground">{label}</span>
          </div>
        ))}
      </div>

      {/* Group tabs */}
      <div className="flex gap-2 border-b" style={{ borderColor: "rgba(255,255,255,0.08)" }}>
        {GROUPS.map((g) => (
          <button key={g} onClick={() => setActiveGroup(g)}
            className="px-4 py-2 font-rajdhani text-sm font-bold transition-all"
            style={activeGroup === g
              ? { color: "#00e5ff", borderBottom: "2px solid #00e5ff" }
              : { color: "rgba(255,255,255,0.4)" }}>
            {groupLabels[g]}
          </button>
        ))}
      </div>

      {/* Focussed symbol detail */}
      {selectedStat && selectedStat.tickCount > 0 && (
        <div className="cyber-card p-4" style={{ border: "1px solid rgba(0,229,255,0.3)" }}>
          <div className="flex items-center justify-between mb-3">
            <div>
              <div className="font-rajdhani text-[10px] text-muted-foreground tracking-widest uppercase">
                Selected · {selectedStat.label}
              </div>
              <div className="font-orbitron text-2xl font-bold text-foreground mt-0.5">
                {selectedStat.price > 100 ? selectedStat.price.toFixed(2) : selectedStat.price.toFixed(4)}
              </div>
            </div>
            <div className="flex flex-col items-center gap-1">
              <div className="font-rajdhani text-[10px] text-muted-foreground">Now</div>
              <div className="w-14 h-14 rounded-full flex items-center justify-center font-orbitron text-2xl font-black text-white"
                style={{ background: DIGIT_COLORS[selectedStat.digit], boxShadow: `0 0 20px ${DIGIT_COLORS[selectedStat.digit]}80` }}>
                {selectedStat.digit}
              </div>
            </div>
          </div>

          {/* Horizontal digit bars sorted by frequency */}
          <div className="space-y-1.5 mt-2">
            {[...Array.from({ length: 10 }, (_, d) => ({
              digit: d, count: selectedStat.digitFreq[d] ?? 0
            }))].sort((a, b) => b.count - a.count).map((item, idx) => {
              const total = selectedStat.tickCount || 1;
              const pct = (item.count / total) * 100;
              const barColor = idx === 0 ? "#22c55e" : idx === 1 ? "#3b82f6"
                : idx === 9 ? "#ef4444" : idx === 8 ? "#facc15" : "rgba(255,255,255,0.2)";
              return (
                <div key={item.digit} className="flex items-center gap-2">
                  <div className="w-6 h-6 rounded-full flex items-center justify-center font-orbitron text-xs font-black text-white flex-shrink-0"
                    style={{ background: DIGIT_COLORS[item.digit],
                      border: item.digit === selectedStat.digit ? "2px solid #fff" : undefined }}>
                    {item.digit}
                  </div>
                  <div className="flex-1 h-2.5 rounded-full overflow-hidden" style={{ background: "rgba(255,255,255,0.08)" }}>
                    <div className="h-full rounded-full transition-all duration-500"
                      style={{ width: `${pct}%`, background: barColor }} />
                  </div>
                  <div className="font-orbitron text-xs font-bold w-12 text-right" style={{ color: barColor }}>
                    {pct.toFixed(1)}%
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Symbol grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {groupStats.map((stat) => (
          <SymbolCard key={stat.key} stat={stat}
            isSelected={stat.key === symbol}
            onClick={() => setSymbol(stat.key)} />
        ))}
      </div>

      {groupStats.every((s) => s.tickCount === 0) && (
        <div className="flex flex-col items-center justify-center py-16 gap-3 text-muted-foreground">
          <RefreshCw size={28} className="animate-spin" />
          <div className="font-rajdhani text-sm">Connecting to live feeds…</div>
        </div>
      )}

      {/* Market summary */}
      {groupStats.some((s) => s.tickCount > 0) && (
        <div className="cyber-card p-4">
          <div className="font-rajdhani text-xs font-bold tracking-widest uppercase text-muted-foreground mb-3">
            Market Summary — Current Digits
          </div>
          <div className="flex flex-wrap gap-2">
            {groupStats.filter((s) => s.tickCount > 0).map((s) => (
              <button key={s.key} onClick={() => setSymbol(s.key)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-rajdhani text-xs font-semibold transition-all"
                style={s.key === symbol
                  ? { background: "rgba(0,229,255,0.15)", border: "1px solid rgba(0,229,255,0.4)", color: "#00e5ff" }
                  : { background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.1)", color: "rgba(255,255,255,0.6)" }}>
                <div className="w-5 h-5 rounded-full flex items-center justify-center font-orbitron text-[9px] font-black text-white"
                  style={{ background: DIGIT_COLORS[s.digit] }}>
                  {s.digit}
                </div>
                {s.label.split(" ").slice(-1)[0]}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Legend below */}
      <div className="cyber-card p-3">
        <div className="font-rajdhani text-[10px] text-muted-foreground font-bold tracking-widest uppercase mb-2">
          How to read:
        </div>
        <div className="space-y-1 font-rajdhani text-[10px] text-muted-foreground">
          <div><span style={{ color: "#22c55e" }}>■ Green bar</span> = digit with highest appearance % in recent ticks</div>
          <div><span style={{ color: "#3b82f6" }}>■ Blue bar</span> = 2nd most frequent digit</div>
          <div><span style={{ color: "#facc15" }}>■ Yellow bar</span> = 2nd least frequent digit</div>
          <div><span style={{ color: "#ef4444" }}>■ Red bar</span> = digit with lowest appearance % (least frequent)</div>
          <div className="mt-1 text-muted-foreground/60">Large circle = current live digit. Bars update on every new tick from Deriv.</div>
        </div>
      </div>

      <div className="flex items-center gap-2">
        <TrendingUp size={12} className="text-green-400" />
        <TrendingDown size={12} className="text-red-400" />
        <span className="font-rajdhani text-[10px] text-muted-foreground">
          All data is real-time from Deriv WebSocket · in-memory only · no storage used
        </span>
      </div>
    </div>
  );
}
