/**
 * AiMdAutoBlock — self-contained AI Match/Differ auto-trade block.
 * Polls /api/match-differ-signals, gives AI MATCHES ON / AI DIFFERS ON toggles,
 * auto-executes when AI fires with AI-computed ticks (1T/2T/3T).
 * Place on any page that shows Match/Differ analysis.
 */
import { useState, useEffect, useRef, useCallback } from "react";
import { Bot, Loader, AlertCircle } from "lucide-react";
import { useDerivContext } from "@/context/DerivContext";
import { executeBulk, nextStake, type TradeResult, type TradeSpec } from "@/lib/tradeEngine";

const DIGIT_COLORS: Record<number, string> = {
  0: "#00897b", 1: "#1e88e5", 2: "#8e24aa", 3: "#43a047", 4: "#fb8c00",
  5: "#00e5ff", 6: "#c6e500", 7: "#e53935", 8: "#e91e8c", 9: "#fdd835",
};

interface MdSignal {
  matchFire: boolean;
  matchConf: number;
  matchTicks: number;
  bestMatch: number;
  matchStrategy: string;
  differFire: boolean;
  differConf: number;
  differTicks: number;
  bestDiffer: number;
  differStrategy: string;
}

interface AiMdAutoBlockProps {
  symbol: string;
}

export default function AiMdAutoBlock({ symbol }: AiMdAutoBlockProps) {
  const deriv = useDerivContext();

  // ── Poll match-differ signals ──────────────────────────────────────────────
  const [sig, setSig] = useState<MdSignal>({
    matchFire: false, matchConf: 0, matchTicks: 1, bestMatch: 0, matchStrategy: "",
    differFire: false, differConf: 0, differTicks: 1, bestDiffer: 9, differStrategy: "",
  });

  useEffect(() => {
    if (!symbol) return;
    let dead = false;
    const run = () => {
      fetch(`/api/match-differ-signals?symbol=${encodeURIComponent(symbol)}`)
        .then((r) => r.json())
        .then((d: Record<string, unknown>) => {
          if (dead) return;
          const mc = d.match_confirmation as { digit: number; confidence: number; ticks: number; strategy: string; fire: boolean } | undefined;
          const dc = d.differ_confirmation as { digit: number; confidence: number; ticks: number; strategy: string; fire: boolean } | undefined;
          if (mc && dc) {
            setSig({
              matchFire: mc.fire,
              matchConf: mc.confidence,
              matchTicks: (d.match_ticks as number) ?? mc.ticks ?? 1,
              bestMatch: mc.digit,
              matchStrategy: mc.strategy,
              differFire: dc.fire,
              differConf: dc.confidence,
              differTicks: (d.differ_ticks as number) ?? dc.ticks ?? 1,
              bestDiffer: dc.digit,
              differStrategy: dc.strategy,
            });
          }
        })
        .catch(() => {});
    };
    run();
    const t = setInterval(run, 2000);
    return () => { dead = true; clearInterval(t); };
  }, [symbol]);

  // ── Toggle state ───────────────────────────────────────────────────────────
  const [aiMatchOn,    setAiMatchOn   ] = useState(false);
  const [aiDifferOn,   setAiDifferOn  ] = useState(false);

  // ── Stake / Martingale ─────────────────────────────────────────────────────
  const [mdStake,      setMdStake     ] = useState(1);
  const [mdMartOn,     setMdMartOn    ] = useState(false);
  const [mdMartMult,   setMdMartMult  ] = useState(2);
  const [mdLossStreak, setMdLossStreak] = useState(0);

  // ── Execution state ────────────────────────────────────────────────────────
  const [mdExecuting,  setMdExecuting ] = useState(false);
  const [mdTrades,     setMdTrades    ] = useState<TradeResult[]>([]);
  const [mdSessionPL,  setMdSessionPL ] = useState(0);

  // ── Refs for cooloff / dedup (separate per direction so match doesn't block differ) ─
  const mdMatchExecRef  = useRef(false);
  const mdDifferExecRef = useRef(false);
  const mdMatchKeyRef   = useRef("");
  const mdDifferKeyRef  = useRef("");
  const mdMatchCoolRef  = useRef(0);
  const mdDifferCoolRef = useRef(0);

  const mdOnUpdate = useCallback((upd: Partial<TradeResult> & { id: string }) => {
    setMdTrades((prev) => {
      const existing = prev.find((t) => t.id === upd.id);
      if (!existing) return [upd as TradeResult, ...prev.slice(0, 49)];
      return prev.map((t) => t.id === upd.id ? { ...t, ...upd } : t);
    });
  }, []);

  // ── Auto-fire MATCH ────────────────────────────────────────────────────────
  useEffect(() => {
    if (!aiMatchOn || deriv.status !== "connected" || mdMatchExecRef.current) return;
    if (!sig.matchFire || sig.matchConf < 60) return;
    const now = Date.now();
    if (now - mdMatchCoolRef.current < 2000) return;
    const key = `m-${sig.bestMatch}-${sig.matchConf.toFixed(0)}-${sig.matchStrategy}`;
    if (key === mdMatchKeyRef.current) return;
    mdMatchKeyRef.current  = key;
    mdMatchCoolRef.current = now;
    mdMatchExecRef.current = true;
    setMdExecuting(true);
    const stake    = mdMartOn ? nextStake(mdStake, mdMartMult, mdLossStreak) : mdStake;
    const aiTicks  = sig.matchTicks > 0 ? sig.matchTicks : 1;
    const currency = deriv.account?.currency ?? "USD";
    const specs: TradeSpec[] = [{
      contract_type: "DIGITMATCH", symbol, stake, ticks: aiTicks,
      digit: sig.bestMatch,
      label: `MATCHES D${sig.bestMatch} ${aiTicks}T @ ${sig.matchConf.toFixed(0)}%`,
      confidence: sig.matchConf,
    }];
    void executeBulk(specs, deriv.request, deriv.subscribe, currency, mdOnUpdate)
      .then((results) => {
        const pl = results.reduce((s, r) => s + (r.profit ?? 0), 0);
        setMdSessionPL((p) => parseFloat((p + pl).toFixed(2)));
        if (mdMartOn) {
          if (results.some((r) => r.status === "lost" || r.status === "error")) setMdLossStreak((s) => s + 1);
          else setMdLossStreak(0);
        }
      })
      .finally(() => { mdMatchExecRef.current = false; setMdExecuting(false); });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aiMatchOn, deriv.status, sig.matchFire, sig.matchConf, sig.bestMatch, sig.matchStrategy, sig.matchTicks, mdStake, mdMartOn, mdMartMult, mdLossStreak, symbol]);

  // ── Auto-fire DIFFER ───────────────────────────────────────────────────────
  useEffect(() => {
    if (!aiDifferOn || deriv.status !== "connected" || mdDifferExecRef.current) return;
    if (!sig.differFire || sig.differConf < 65) return;
    const now = Date.now();
    if (now - mdDifferCoolRef.current < 2000) return;
    const key = `d-${sig.bestDiffer}-${sig.differConf.toFixed(0)}-${sig.differStrategy}`;
    if (key === mdDifferKeyRef.current) return;
    mdDifferKeyRef.current  = key;
    mdDifferCoolRef.current = now;
    mdDifferExecRef.current = true;
    setMdExecuting(true);
    const stake    = mdMartOn ? nextStake(mdStake, mdMartMult, mdLossStreak) : mdStake;
    const aiTicks  = sig.differTicks > 0 ? sig.differTicks : 1;
    const currency = deriv.account?.currency ?? "USD";
    const specs: TradeSpec[] = [{
      contract_type: "DIGITDIFF", symbol, stake, ticks: aiTicks,
      digit: sig.bestDiffer,
      label: `DIFFERS D${sig.bestDiffer} ${aiTicks}T @ ${sig.differConf.toFixed(0)}%`,
      confidence: sig.differConf,
    }];
    void executeBulk(specs, deriv.request, deriv.subscribe, currency, mdOnUpdate)
      .then((results) => {
        const pl = results.reduce((s, r) => s + (r.profit ?? 0), 0);
        setMdSessionPL((p) => parseFloat((p + pl).toFixed(2)));
        if (mdMartOn) {
          if (results.some((r) => r.status === "lost" || r.status === "error")) setMdLossStreak((s) => s + 1);
          else setMdLossStreak(0);
        }
      })
      .finally(() => { mdDifferExecRef.current = false; setMdExecuting(false); });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aiDifferOn, deriv.status, sig.differFire, sig.differConf, sig.bestDiffer, sig.differStrategy, sig.differTicks, mdStake, mdMartOn, mdMartMult, mdLossStreak, symbol]);

  // ── JSX ───────────────────────────────────────────────────────────────────
  return (
    <div className="cyber-card p-4 space-y-4" style={{ border: "1px solid rgba(0,229,255,0.3)" }}>
      {/* Header */}
      <div className="flex items-center gap-2 flex-wrap">
        <Bot size={14} className="text-primary" />
        <span className="font-orbitron text-sm font-bold text-primary tracking-wider">AI AUTO TRADE</span>
        <span className="font-rajdhani text-[10px] text-muted-foreground">· Match / Differ</span>
        {deriv.status === "connected" && (
          <span className="ml-auto px-2 py-0.5 rounded font-orbitron text-[9px] font-bold"
            style={{ background: "rgba(34,197,94,0.15)", color: "#22c55e" }}>
            {deriv.account?.is_virtual ? "DEMO" : "REAL"} · {(deriv.balance ?? 0).toFixed(2)} {deriv.account?.currency}
          </span>
        )}
        {mdSessionPL !== 0 && (
          <span className="px-2 py-0.5 rounded font-orbitron text-[9px] font-bold"
            style={{ color: mdSessionPL >= 0 ? "#22c55e" : "#ef4444" }}>
            P/L: {mdSessionPL >= 0 ? "+" : ""}{mdSessionPL.toFixed(2)}
          </span>
        )}
      </div>

      {/* ON/OFF Toggle Buttons */}
      <div className="grid grid-cols-2 gap-3">
        <button onClick={() => setAiMatchOn((p) => !p)}
          className="py-4 rounded-xl font-orbitron text-sm font-black tracking-widest transition-all text-center"
          style={aiMatchOn
            ? { background: "rgba(34,197,94,0.18)", border: "2px solid #22c55e", color: "#22c55e", boxShadow: "0 0 28px rgba(34,197,94,0.35)" }
            : { background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.15)", color: "#555" }}>
          🎯 AI MATCHES<br />
          <span className="text-[11px] font-rajdhani mt-0.5 block">{aiMatchOn ? "● ACTIVE" : "○ OFF"}</span>
        </button>
        <button onClick={() => setAiDifferOn((p) => !p)}
          className="py-4 rounded-xl font-orbitron text-sm font-black tracking-widest transition-all text-center"
          style={aiDifferOn
            ? { background: "rgba(239,68,68,0.18)", border: "2px solid #ef4444", color: "#ef4444", boxShadow: "0 0 28px rgba(239,68,68,0.35)" }
            : { background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.15)", color: "#555" }}>
          ✕ AI DIFFERS<br />
          <span className="text-[11px] font-rajdhani mt-0.5 block">{aiDifferOn ? "● ACTIVE" : "○ OFF"}</span>
        </button>
      </div>

      {/* Not connected warning */}
      {deriv.status !== "connected" && (aiMatchOn || aiDifferOn) && (
        <div className="flex items-center gap-2 px-3 py-2 rounded-lg"
          style={{ background: "rgba(239,68,68,0.07)", border: "1px solid rgba(239,68,68,0.2)" }}>
          <AlertCircle size={12} className="text-red-400 flex-shrink-0" />
          <span className="font-rajdhani text-xs text-red-400">
            Connect Deriv account to enable auto-trading.
          </span>
        </div>
      )}

      {/* Signal status cards — shown when any toggle is ON and connected */}
      {(aiMatchOn || aiDifferOn) && deriv.status === "connected" && (
        <div className="space-y-2">
          {aiMatchOn && (
            <div className="p-3 rounded-xl space-y-1.5"
              style={{ background: sig.matchFire ? "rgba(34,197,94,0.07)" : "rgba(255,255,255,0.02)", border: `1px solid ${sig.matchFire ? "rgba(34,197,94,0.4)" : "rgba(255,255,255,0.07)"}` }}>
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-orbitron text-[10px] font-bold tracking-widest" style={{ color: "#22c55e" }}>DIRECTION: MATCHES</span>
                <div className="w-7 h-7 rounded-full flex items-center justify-center font-orbitron text-sm font-black text-white flex-shrink-0"
                  style={{ background: DIGIT_COLORS[sig.bestMatch], boxShadow: `0 0 10px ${DIGIT_COLORS[sig.bestMatch]}60` }}>
                  {sig.bestMatch}
                </div>
                <span className="font-rajdhani text-[10px] text-muted-foreground">AI BARRIER: Digit {sig.bestMatch}</span>
                <span className="font-rajdhani text-[10px] text-muted-foreground">· AI TICKS: {sig.matchTicks || 1}T</span>
                <span className="ml-auto font-orbitron text-xs font-bold"
                  style={{ color: sig.matchConf >= 70 ? "#22c55e" : sig.matchConf >= 55 ? "#facc15" : "#ef4444" }}>
                  {sig.matchConf.toFixed(0)}%
                </span>
                {sig.matchFire ? (
                  <span className="px-1.5 py-0.5 rounded text-[9px] font-bold font-orbitron animate-pulse"
                    style={{ background: "rgba(0,200,83,0.2)", color: "#00c853", border: "1px solid rgba(0,200,83,0.4)" }}>
                    🔥 FIRE
                  </span>
                ) : (
                  <span className="font-rajdhani text-[9px] text-muted-foreground">Scanning…</span>
                )}
              </div>
              {sig.matchStrategy && (
                <div className="font-rajdhani text-[9px] font-bold" style={{ color: "#00e5ff" }}>{sig.matchStrategy}</div>
              )}
              {mdExecuting && (
                <div className="flex items-center gap-1 font-rajdhani text-[9px]" style={{ color: "#22c55e" }}>
                  <Loader size={9} className="animate-spin" /> Executing…
                </div>
              )}
            </div>
          )}
          {aiDifferOn && (
            <div className="p-3 rounded-xl space-y-1.5"
              style={{ background: sig.differFire ? "rgba(239,68,68,0.07)" : "rgba(255,255,255,0.02)", border: `1px solid ${sig.differFire ? "rgba(239,68,68,0.4)" : "rgba(255,255,255,0.07)"}` }}>
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-orbitron text-[10px] font-bold tracking-widest" style={{ color: "#ef4444" }}>DIRECTION: DIFFERS</span>
                <div className="w-7 h-7 rounded-full flex items-center justify-center font-orbitron text-sm font-black text-white flex-shrink-0"
                  style={{ background: DIGIT_COLORS[sig.bestDiffer], boxShadow: `0 0 10px ${DIGIT_COLORS[sig.bestDiffer]}60` }}>
                  {sig.bestDiffer}
                </div>
                <span className="font-rajdhani text-[10px] text-muted-foreground">AI BARRIER: Digit {sig.bestDiffer}</span>
                <span className="font-rajdhani text-[10px] text-muted-foreground">· AI TICKS: {sig.differTicks || 1}T</span>
                <span className="ml-auto font-orbitron text-xs font-bold"
                  style={{ color: sig.differConf >= 70 ? "#22c55e" : sig.differConf >= 55 ? "#facc15" : "#ef4444" }}>
                  {sig.differConf.toFixed(0)}%
                </span>
                {sig.differFire ? (
                  <span className="px-1.5 py-0.5 rounded text-[9px] font-bold font-orbitron animate-pulse"
                    style={{ background: "rgba(239,68,68,0.2)", color: "#ef4444", border: "1px solid rgba(239,68,68,0.4)" }}>
                    🔥 FIRE
                  </span>
                ) : (
                  <span className="font-rajdhani text-[9px] text-muted-foreground">Scanning…</span>
                )}
              </div>
              {sig.differStrategy && (
                <div className="font-rajdhani text-[9px] font-bold" style={{ color: "#ef4444" }}>{sig.differStrategy}</div>
              )}
              {mdExecuting && (
                <div className="flex items-center gap-1 font-rajdhani text-[9px]" style={{ color: "#ef4444" }}>
                  <Loader size={9} className="animate-spin" /> Executing…
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Stake + Martingale — shown when any toggle is ON */}
      {(aiMatchOn || aiDifferOn) && (
        <div className="space-y-3 pt-2 border-t" style={{ borderColor: "rgba(255,255,255,0.06)" }}>
          <div>
            <div className="font-rajdhani text-[10px] text-muted-foreground tracking-widest uppercase mb-1.5">
              Stake ·{" "}
              <span className="text-primary font-orbitron">
                ${(mdMartOn ? nextStake(mdStake, mdMartMult, mdLossStreak) : mdStake).toFixed(2)}
              </span>
              {mdMartOn && mdLossStreak > 0 && <span className="ml-2 text-yellow-400">Streak: {mdLossStreak}</span>}
            </div>
            <div className="flex gap-1.5 flex-wrap">
              {[0.5, 1, 2, 5, 10].map((v) => (
                <button key={v} onClick={() => { setMdStake(v); setMdLossStreak(0); }}
                  className="px-2.5 py-1 rounded font-orbitron text-xs font-bold transition-all"
                  style={mdStake === v
                    ? { background: "#00e5ff", color: "#050a0f" }
                    : { background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.12)", color: "#aaa" }}>
                  ${v}
                </button>
              ))}
              <input type="number" min={0.35} step={0.5} value={mdStake}
                onChange={(e) => { setMdStake(parseFloat(e.target.value) || 0.35); setMdLossStreak(0); }}
                className="w-16 px-2 py-1 rounded font-orbitron text-xs bg-background border border-border text-foreground focus:outline-none text-center" />
            </div>
          </div>
          <div className="flex items-center gap-3 flex-wrap">
            <div className="cursor-pointer flex-shrink-0"
              style={{ width: 36, height: 18, background: mdMartOn ? "#facc15" : "rgba(255,255,255,0.15)", borderRadius: 9, position: "relative" }}
              onClick={() => { setMdMartOn((p) => !p); setMdLossStreak(0); }}>
              <div className="rounded-full bg-white absolute transition-all"
                style={{ width: 14, height: 14, top: 2, left: mdMartOn ? "calc(100% - 16px)" : 2 }} />
            </div>
            <span className="font-rajdhani text-xs font-bold" style={{ color: mdMartOn ? "#facc15" : "#888" }}>
              MARTINGALE {mdMartOn ? "ON" : "OFF"}
            </span>
            {mdMartOn && (
              <div className="flex gap-1 ml-auto">
                {[1.5, 2, 2.5, 3].map((v) => (
                  <button key={v} onClick={() => setMdMartMult(v)}
                    className="px-1.5 py-0.5 rounded font-orbitron text-[9px] font-bold"
                    style={mdMartMult === v
                      ? { background: "#facc15", color: "#050a0f" }
                      : { background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)", color: "#888" }}>
                    {v}×
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Trade Log */}
      {mdTrades.length > 0 && (
        <div className="space-y-1.5 pt-2 border-t" style={{ borderColor: "rgba(255,255,255,0.06)" }}>
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <span className="font-rajdhani text-[10px] font-bold tracking-widest uppercase text-muted-foreground">TRADE LOG</span>
              {(() => {
                const w   = mdTrades.filter((t) => t.status === "won").length;
                const tot = mdTrades.filter((t) => t.status === "won" || t.status === "lost").length;
                return tot > 0 ? (
                  <span className="font-orbitron text-[9px] font-bold px-1.5 py-0.5 rounded"
                    style={{ background: "rgba(34,197,94,0.12)", color: "#22c55e" }}>
                    {w}/{tot} · {Math.round((w / tot) * 100)}% WR
                  </span>
                ) : null;
              })()}
            </div>
            <button onClick={() => { setMdTrades([]); setMdSessionPL(0); setMdLossStreak(0); }}
              className="font-rajdhani text-[9px] text-muted-foreground hover:text-foreground transition-colors">
              Clear
            </button>
          </div>
          {mdTrades.slice(0, 20).map((t, i) => (
            <div key={t.id ?? String(i)} className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg"
              style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.05)" }}>
              <span className="font-orbitron text-[9px] font-bold w-14 flex-shrink-0"
                style={{ color: t.contract_type === "DIGITMATCH" ? "#22c55e" : "#ef4444" }}>
                {t.contract_type === "DIGITMATCH" ? "MATCHES" : "DIFFERS"}
              </span>
              <span className="font-rajdhani text-[9px] text-muted-foreground flex-1 truncate">{t.label}</span>
              <span className="font-orbitron text-[10px] font-bold flex-shrink-0"
                style={{ color: t.status === "won" ? "#22c55e" : t.status === "lost" ? "#ef4444" : t.status === "open" || t.status === "pending" || t.status === "settling" ? "#facc15" : "#888" }}>
                {t.status === "won"     ? `+${(t.profit ?? 0).toFixed(2)}`
                  : t.status === "lost"  ? `${(t.profit ?? 0).toFixed(2)}`
                  : t.status === "open" || t.status === "pending" || t.status === "settling" ? "LIVE"
                  : t.status}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
