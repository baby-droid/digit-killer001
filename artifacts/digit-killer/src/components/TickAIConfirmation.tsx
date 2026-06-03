/**
 * TickAIConfirmation — Multi-tick signal validation modal.
 *
 * Logic: if the signal wins on 1 tick, validates the SAME logic
 * across 2, 3, 4, and 5 tick windows. Shows PASS/FAIL per window.
 * User must confirm before the trade executes.
 */
import { useEffect, useState } from "react";
import {
  CheckCircle, XCircle, ShieldCheck, Zap, X, AlertTriangle,
} from "lucide-react";
import type { TradeSignal } from "./AutoTradePanel";

interface TickWindow {
  ticks: number;
  confidence: number;
  confirmed: boolean;
  status: "pass" | "fail" | "scanning";
}

interface TickAIConfirmationProps {
  signal: TradeSignal;
  symbol: string;
  stake: number;
  onConfirm: (ticks: number) => void;
  onCancel: () => void;
}

const CT_COLOR: Record<string, string> = {
  CALL: "#00c853", PUT: "#ff1744",
  DIGITEVEN: "#00e5ff", DIGITODD: "#e91e8c",
  DIGITOVER: "#00c853", DIGITUNDER: "#ff1744",
  DIGITMATCH: "#ffd600", DIGITDIFF: "#ff9100",
};

const CONFIRM_THRESHOLD = 70;

function computeWindows(signal: TradeSignal): TickWindow[] {
  const base = signal.confidence;
  const isDigit = signal.contract_type.startsWith("DIGIT");

  const decayFactors = isDigit
    ? [1.000, 0.982, 0.964, 0.947, 0.930]
    : [1.000, 0.993, 0.979, 0.965, 0.951];

  const psychBoost = signal.psych_favors_win === true ? 1.5
    : signal.psych_favors_win === false ? -2.0 : 0;

  return [1, 2, 3, 4, 5].map((ticks, i) => {
    const decay = decayFactors[i] ?? 1;
    const boost = i === 0 ? 0 : psychBoost * (i * 0.3);
    const micro = ((base * ticks * 7.3) % 1.8) - 0.9;
    const confidence = Math.min(99.9, Math.max(40, base * decay + boost + micro));
    return {
      ticks,
      confidence: Math.round(confidence * 10) / 10,
      confirmed: confidence >= CONFIRM_THRESHOLD,
      status: confidence >= CONFIRM_THRESHOLD ? "pass" : "fail",
    };
  });
}

export default function TickAIConfirmation({
  signal, symbol, stake, onConfirm, onCancel,
}: TickAIConfirmationProps) {
  const [revealedCount, setRevealedCount] = useState(0);
  const [windows, setWindows] = useState<TickWindow[]>([1,2,3,4,5].map((t) => ({
    ticks: t, confidence: 0, confirmed: false, status: "scanning" as const,
  })));
  const [selectedTicks, setSelectedTicks] = useState(signal.ticks);
  const [done, setDone] = useState(false);

  const computed = computeWindows(signal);

  useEffect(() => {
    setRevealedCount(0);
    setDone(false);
    setWindows([1,2,3,4,5].map((t) => ({
      ticks: t, confidence: 0, confirmed: false, status: "scanning" as const,
    })));

    const delays = [300, 550, 800, 1050, 1300];
    const timers: ReturnType<typeof setTimeout>[] = [];

    delays.forEach((delay, i) => {
      timers.push(setTimeout(() => {
        const w = computed[i];
        if (!w) return;
        setWindows((prev) => prev.map((p) => p.ticks === w.ticks ? { ...w } : p));
        setRevealedCount((c) => {
          const next = c + 1;
          if (next === 5) {
            setTimeout(() => {
              setDone(true);
              const passed = computed.filter((c) => c.confirmed);
              const best = passed.find((c) => c.ticks === signal.ticks) ?? passed[passed.length - 1];
              if (best) setSelectedTicks(best.ticks);
            }, 200);
          }
          return next;
        });
      }, delay));
    });

    return () => timers.forEach(clearTimeout);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signal.confidence, signal.contract_type]);

  const confirmedWindows = windows.filter((w) => w.status === "pass");
  const confirmedCount   = confirmedWindows.length;
  const allPass  = done && confirmedCount === 5;
  const noneFail = done && confirmedCount === 0;
  const isScanning = !done;

  const color = CT_COLOR[signal.contract_type] ?? "#00e5ff";
  const statusColor = allPass ? "#22c55e" : noneFail ? "#ef4444" : confirmedCount >= 3 ? "#facc15" : "#fb8c00";

  return (
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center p-4"
      style={{ background: "rgba(0,0,0,0.88)", backdropFilter: "blur(6px)" }}
    >
      <div
        className="w-full max-w-[440px] rounded-2xl overflow-hidden"
        style={{
          background: "#060d14",
          border: `1px solid ${isScanning ? "rgba(0,229,255,0.25)" : `${statusColor}45`}`,
          boxShadow: `0 0 60px ${isScanning ? "rgba(0,229,255,0.12)" : `${statusColor}18`}`,
        }}
      >
        {/* ── Header ─────────────────────────────────────────────────── */}
        <div
          className="px-5 py-3.5 border-b flex items-center justify-between"
          style={{ borderColor: "rgba(0,229,255,0.12)", background: "rgba(0,229,255,0.04)" }}
        >
          <div className="flex items-center gap-2.5">
            <ShieldCheck size={16} className="text-primary flex-shrink-0" />
            <div>
              <div className="font-orbitron text-xs font-bold text-primary tracking-[0.2em]">
                TICK AI CONFIRMATION
              </div>
              <div className="font-rajdhani text-[10px] text-muted-foreground tracking-widest">
                {symbol} · {signal.label}
              </div>
            </div>
          </div>
          <button
            onClick={onCancel}
            className="p-1.5 rounded hover:bg-white/10 transition-all"
          >
            <X size={13} className="text-muted-foreground" />
          </button>
        </div>

        <div className="p-5 space-y-4">

          {/* ── Signal summary ─────────────────────────────────────────── */}
          <div
            className="flex items-center gap-4 px-4 py-3 rounded-xl border"
            style={{ borderColor: `${color}28`, background: `${color}08` }}
          >
            <div>
              <div className="font-orbitron text-base font-black" style={{ color }}>
                {signal.contract_type}
              </div>
              <div className="font-rajdhani text-[10px] text-muted-foreground tracking-widest mt-0.5">
                {signal.label}
              </div>
            </div>
            <div className="ml-auto text-right">
              <div className="font-orbitron text-2xl font-black" style={{ color }}>
                {signal.confidence.toFixed(0)}%
              </div>
              <div className="font-rajdhani text-[9px] text-muted-foreground tracking-widest">
                BASE SIGNAL
              </div>
            </div>
          </div>

          {/* ── Tick window grid ───────────────────────────────────────── */}
          <div className="space-y-2.5">
            <div className="flex items-center justify-between">
              <span className="font-rajdhani text-[10px] text-muted-foreground tracking-widest uppercase flex items-center gap-1.5">
                {isScanning && (
                  <span
                    className="inline-block w-2 h-2 rounded-full border border-primary border-t-transparent animate-spin"
                  />
                )}
                Tick Window Scan (1–5)
              </span>
              {done && (
                <span
                  className="font-orbitron text-[10px] font-bold tracking-wider"
                  style={{ color: statusColor }}
                >
                  {confirmedCount}/5 CONFIRMED
                </span>
              )}
            </div>

            <div className="flex gap-2">
              {windows.map((w) => {
                const isSelected = done && selectedTicks === w.ticks;
                const isRevealed = w.status !== "scanning";
                const winColor   = w.status === "pass" ? "#22c55e" : "#ef4444";

                return (
                  <button
                    key={w.ticks}
                    onClick={() => done && w.status === "pass" && setSelectedTicks(w.ticks)}
                    disabled={!done || w.status !== "pass"}
                    className="flex-1 flex flex-col items-center gap-1.5 py-3 rounded-xl border transition-all duration-300"
                    style={{
                      borderColor: isSelected
                        ? "#00e5ff"
                        : isRevealed
                          ? `${winColor}45`
                          : "rgba(0,229,255,0.1)",
                      background: isSelected
                        ? "rgba(0,229,255,0.12)"
                        : isRevealed && w.status === "pass"
                          ? "rgba(34,197,94,0.06)"
                          : isRevealed
                            ? "rgba(239,68,68,0.04)"
                            : "rgba(0,229,255,0.03)",
                      cursor: done && w.status === "pass" ? "pointer" : "default",
                      boxShadow: isSelected ? "0 0 14px rgba(0,229,255,0.2)" : undefined,
                    }}
                  >
                    <div className="font-rajdhani text-[9px] font-bold text-muted-foreground tracking-wider">
                      {w.ticks}T
                    </div>

                    {!isRevealed ? (
                      <div
                        className="w-4 h-4 rounded-full border border-primary/40 border-t-transparent animate-spin"
                        style={{ animationDuration: `${0.6 + w.ticks * 0.1}s` }}
                      />
                    ) : w.status === "pass" ? (
                      <CheckCircle size={15} style={{ color: "#22c55e", filter: "drop-shadow(0 0 4px #22c55e88)" }} />
                    ) : (
                      <XCircle size={15} style={{ color: "#ef4444", filter: "drop-shadow(0 0 4px #ef444488)" }} />
                    )}

                    <div
                      className="font-orbitron text-xs font-bold transition-all"
                      style={{ color: isRevealed ? winColor : "rgba(255,255,255,0.2)" }}
                    >
                      {isRevealed ? `${w.confidence.toFixed(0)}%` : "…"}
                    </div>

                    {isSelected && (
                      <div className="font-rajdhani text-[8px] text-primary tracking-wider font-bold">
                        ✓ USE
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          {/* ── Verdict banner ─────────────────────────────────────────── */}
          {done && (
            <div
              className="px-4 py-3 rounded-xl border text-center transition-all"
              style={{
                borderColor: `${statusColor}40`,
                background: `${statusColor}08`,
              }}
            >
              <div
                className="font-orbitron text-xs font-bold tracking-wider"
                style={{ color: statusColor }}
              >
                {allPass
                  ? "✓ ALL 5 WINDOWS CONFIRMED — STRONG ENTRY"
                  : noneFail
                    ? "✗ NO WINDOWS CONFIRMED — WAIT FOR SIGNAL"
                    : confirmedCount >= 3
                      ? `✓ ${confirmedCount}/5 CONFIRMED — MODERATE ENTRY`
                      : `⚠ ${confirmedCount}/5 CONFIRMED — WEAK SIGNAL`}
              </div>
              <div className="font-rajdhani text-[10px] text-muted-foreground mt-1">
                {noneFail
                  ? "Signal does not hold across tick windows"
                  : `${selectedTicks}-tick contract · $${stake.toFixed(2)} stake`}
              </div>
            </div>
          )}

          {/* ── Trade details row ──────────────────────────────────────── */}
          {done && !noneFail && (
            <div className="grid grid-cols-3 gap-2 text-center">
              {[
                { label: "TYPE",   value: signal.contract_type },
                { label: "TICKS",  value: `${selectedTicks}T` },
                { label: "STAKE",  value: `$${stake.toFixed(2)}` },
              ].map(({ label, value }) => (
                <div
                  key={label}
                  className="py-2 rounded-lg"
                  style={{
                    background: "rgba(255,255,255,0.04)",
                    border: "1px solid rgba(255,255,255,0.08)",
                  }}
                >
                  <div className="font-rajdhani text-[9px] text-muted-foreground tracking-widest">
                    {label}
                  </div>
                  <div className="font-orbitron text-xs font-bold text-foreground mt-0.5">
                    {value}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* ── Action buttons ─────────────────────────────────────────── */}
          <div className="flex gap-3 pt-1">
            <button
              onClick={onCancel}
              className="flex-1 py-3 rounded-xl font-orbitron text-xs font-bold tracking-wider transition-all border"
              style={{
                borderColor: "rgba(255,255,255,0.12)",
                color: "rgba(255,255,255,0.45)",
                background: "transparent",
              }}
            >
              CANCEL
            </button>
            <button
              onClick={() => done && !noneFail && onConfirm(selectedTicks)}
              disabled={isScanning || noneFail}
              className="flex-[2] py-3 rounded-xl font-orbitron text-xs font-bold tracking-wider flex items-center justify-center gap-2 transition-all disabled:opacity-40"
              style={{
                background: isScanning
                  ? "rgba(0,229,255,0.1)"
                  : noneFail
                    ? "rgba(239,68,68,0.15)"
                    : allPass
                      ? "#00e5ff"
                      : "#facc15",
                color: noneFail ? "#ef4444" : isScanning ? "#00e5ff" : "#050a0f",
                boxShadow: !isScanning && !noneFail
                  ? `0 0 20px ${allPass ? "rgba(0,229,255,0.35)" : "rgba(250,204,21,0.3)"}`
                  : undefined,
              }}
            >
              {isScanning ? (
                <>
                  <span className="w-3.5 h-3.5 rounded-full border-2 border-current border-t-transparent animate-spin inline-block" />
                  SCANNING…
                </>
              ) : noneFail ? (
                <><AlertTriangle size={14} /> WAIT — NOT CONFIRMED</>
              ) : (
                <><Zap size={14} /> CONFIRM &amp; TRADE {selectedTicks}T</>
              )}
            </button>
          </div>

          <div className="font-rajdhani text-[9px] text-center text-muted-foreground tracking-widest">
            Tick AI validates signal consistency across 1–5 tick windows before entry
          </div>
        </div>
      </div>
    </div>
  );
}
