import { useState } from "react";
import {
  useGetAiSignals,
  getGetAiSignalsQueryKey,
} from "@workspace/api-client-react";
import { useSymbol } from "@/context/SymbolContext";
import { Zap, Download, AlertCircle, Brain, FileText, RefreshCw, ChevronRight } from "lucide-react";
import logoPath from "@assets/WhatsApp_Image_2026-05-30_at_19.05.28_1780157146139.jpeg";

// ─────────────────────────────────────────────────────────────────
//  Types
// ─────────────────────────────────────────────────────────────────
interface AiSignal {
  id: string;
  symbol: string;
  contract_type: string;
  direction: string;
  entry_digit: number;
  ticks: number;
  confidence: number;
  strategy: string;
  timestamp: string;
  reason: string;
  risk_level: string;
}

interface MarketState {
  current_digit: number;
  current_price: number;
  trend: string;
  volatility: number;
  even_pct: number;
  odd_pct: number;
  high_digit_pct: number;
  low_digit_pct: number;
  top_digit: number;
  bottom_digit: number;
  streak: number;
  parity_streak: number;
}

interface StrategySignal {
  symbol: string;
  contract_type: string;
  contract_category: string;
  signal: string;
  direction: string;
  confidence: number;
  entry_conditions: string[];
  duration_ticks: number;
  duration_label: string;
  barrier?: number;
  digit?: number;
  risk_level: string;
  strategy_name: string;
  reasoning: string;
  market_state: MarketState;
  generated_at: string;
}

// ─────────────────────────────────────────────────────────────────
//  Constants
// ─────────────────────────────────────────────────────────────────
const DIGIT_COLORS: Record<number, string> = {
  0: "#00e5d4", 1: "#448aff", 2: "#ce93d8", 3: "#00c853", 4: "#ff9100",
  5: "#00e5ff", 6: "#c6ff00", 7: "#ff1744", 8: "#f50057", 9: "#ffd600",
};

const CONTRACT_TYPES = [
  {
    category: "Digits",
    color: "#00e5ff",
    contracts: [
      { id: "DIGITEVEN", label: "Even", desc: "Last digit is even" },
      { id: "DIGITODD", label: "Odd", desc: "Last digit is odd" },
      { id: "DIGITOVER", label: "Over", desc: "Last digit > barrier", hasBarrier: true },
      { id: "DIGITUNDER", label: "Under", desc: "Last digit < barrier", hasBarrier: true },
      { id: "DIGITMATCH", label: "Match", desc: "Last digit = target", hasDigit: true },
      { id: "DIGITDIFF", label: "Differ", desc: "Last digit ≠ target", hasDigit: true },
    ],
  },
  {
    category: "Rise / Fall",
    color: "#00c853",
    contracts: [
      { id: "CALL", label: "Rise", desc: "Exit price > entry price" },
      { id: "PUT", label: "Fall", desc: "Exit price < entry price" },
    ],
  },
  {
    category: "Touch",
    color: "#ff9100",
    contracts: [
      { id: "ONETOUCH", label: "One Touch", desc: "Price touches barrier", hasBarrier: true },
      { id: "NOTOUCH", label: "No Touch", desc: "Price never hits barrier", hasBarrier: true },
    ],
  },
  {
    category: "In / Out",
    color: "#ce93d8",
    contracts: [
      { id: "EXPIRYRANGE", label: "Stays In", desc: "Exit inside price range" },
      { id: "EXPIRYMISS", label: "Breaks Out", desc: "Exit outside price range" },
    ],
  },
  {
    category: "Tick High/Low",
    color: "#ffd600",
    contracts: [
      { id: "HIGHERTICK", label: "High Tick", desc: "Predict which tick is highest" },
      { id: "LOWERTICK", label: "Low Tick", desc: "Predict which tick is lowest" },
    ],
  },
  {
    category: "Accumulator",
    color: "#e91e8c",
    contracts: [
      { id: "ACCU", label: "Accumulator", desc: "Grow pips without knockout" },
    ],
  },
  {
    category: "Reset",
    color: "#00897b",
    contracts: [
      { id: "RESETCALL", label: "Reset Rise", desc: "Strike resets to lowest mid-price" },
      { id: "RESETPUT", label: "Reset Fall", desc: "Strike resets to highest mid-price" },
    ],
  },
];

const CONTRACT_COLOR: Record<string, string> = {
  MATCHES: "#00e5ff", DIFFERS: "#ce93d8",
  OVER: "#00c853", UNDER: "#448aff",
  EVEN: "#00e5d4", ODD: "#ff9100",
};

const CONFIDENCE_COLOR = (c: number) =>
  c >= 70 ? "#00c853" : c >= 55 ? "#ffd600" : "#ff9100";

// ─────────────────────────────────────────────────────────────────
//  PDF / Word export helpers
// ─────────────────────────────────────────────────────────────────
function exportStrategyPDF(s: StrategySignal) {
  const ts = new Date(s.generated_at).toLocaleString();
  const ms = s.market_state;
  const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8"/>
  <title>Digit Killer Strategy — ${s.symbol} ${s.contract_type}</title>
  <style>
    body{font-family:Arial,sans-serif;font-size:12px;color:#111;padding:24px;max-width:800px;margin:auto}
    h1{font-size:22px;color:#0056d2;margin:0 0 4px}
    h2{font-size:14px;color:#0056d2;border-bottom:2px solid #0056d2;padding-bottom:4px;margin:18px 0 8px}
    .meta{color:#666;font-size:11px;margin-bottom:16px}
    .hero{background:#f0f4ff;border-radius:8px;padding:16px;margin-bottom:16px;text-align:center}
    .signal-text{font-size:26px;font-weight:bold;color:#0056d2}
    .conf{color:#00a854;font-weight:bold;font-size:16px}
    .grid{display:grid;grid-template-columns:1fr 1fr;gap:12px}
    .card{border:1px solid #ddd;border-radius:6px;padding:10px}
    ul{margin:6px 0;padding-left:16px}
    li{margin:3px 0}
    .badge{display:inline-block;padding:2px 8px;border-radius:4px;font-size:11px;font-weight:bold}
    .low{background:#e8f5e9;color:#2e7d32}
    .medium{background:#fff8e1;color:#f57f17}
    .high{background:#fce4ec;color:#c62828}
    @media print{body{padding:0}}
  </style>
</head>
<body>
  <h1>DIGIT KILLER — AI Strategy Report</h1>
  <div class="meta">
    Symbol: <b>${s.symbol}</b> &nbsp;|&nbsp;
    Contract: <b>${s.contract_type}</b> &nbsp;|&nbsp;
    Category: <b>${s.contract_category}</b> &nbsp;|&nbsp;
    Generated: ${ts}
  </div>
  <div class="hero">
    <div class="signal-text">${s.signal}</div>
    <div style="margin-top:8px">
      <span class="conf">${s.confidence.toFixed(1)}% confidence</span>
      &nbsp;&nbsp;
      <span class="badge ${s.risk_level.toLowerCase()}">${s.risk_level} Risk</span>
    </div>
    <div style="margin-top:6px;color:#555;font-style:italic">${s.strategy_name} · ${s.duration_label}</div>
  </div>

  <h2>Strategy Reasoning</h2>
  <p>${s.reasoning}</p>

  <h2>Entry Conditions</h2>
  <ul>${s.entry_conditions.map((c) => `<li>${c}</li>`).join("")}</ul>

  <h2>Market State (at signal time)</h2>
  <div class="grid">
    <div class="card">
      <b>Current Price:</b> ${ms.current_price}<br/>
      <b>Current Digit:</b> ${ms.current_digit}<br/>
      <b>Price Trend:</b> ${ms.trend}<br/>
      <b>Volatility:</b> ${ms.volatility}%
    </div>
    <div class="card">
      <b>Even/Odd:</b> ${ms.even_pct}% / ${ms.odd_pct}%<br/>
      <b>High Digits (6-9):</b> ${ms.high_digit_pct}%<br/>
      <b>Low Digits (0-3):</b> ${ms.low_digit_pct}%<br/>
      <b>Top Digit:</b> ${ms.top_digit} &nbsp; <b>Bottom:</b> ${ms.bottom_digit}
    </div>
    <div class="card">
      <b>Digit Streak:</b> ${ms.streak}× digit ${ms.current_digit}<br/>
      <b>Parity Streak:</b> ${ms.parity_streak} consecutive
    </div>
    ${s.barrier !== undefined ? `<div class="card"><b>Barrier:</b> ${s.barrier}</div>` : ""}
    ${s.digit !== undefined ? `<div class="card"><b>Target Digit:</b> ${s.digit}</div>` : ""}
  </div>

  <p style="margin-top:24px;font-size:10px;color:#999;text-align:center">
    DIGIT KILLER · AI Trading System · AHMEDSYNTRADER.SITE · Not financial advice
  </p>
</body>
</html>`;
  const blob = new Blob([html], { type: "text/html" });
  const url = URL.createObjectURL(blob);
  const win = window.open(url, "_blank");
  if (win) win.addEventListener("load", () => win.print());
}

function exportStrategyWord(s: StrategySignal) {
  const ts = new Date(s.generated_at).toLocaleString();
  const ms = s.market_state;
  const wordHtml = `<html xmlns:o='urn:schemas-microsoft-com:office:office' xmlns:w='urn:schemas-microsoft-com:office:word' xmlns='http://www.w3.org/TR/REC-html40'>
<head><meta charset="utf-8"/><title>Digit Killer Strategy — ${s.symbol} ${s.contract_type}</title></head>
<body style="font-family:Calibri,Arial;font-size:12pt;color:#111;padding:24pt">
  <h1 style="color:#0056d2;font-size:20pt">DIGIT KILLER — AI Strategy Report</h1>
  <p style="color:#666;font-size:10pt">Symbol: <b>${s.symbol}</b> | Contract: <b>${s.contract_type}</b> | Category: <b>${s.contract_category}</b> | Generated: ${ts}</p>
  <p style="font-size:22pt;font-weight:bold;color:#0056d2;text-align:center;border:1pt solid #0056d2;padding:12pt">${s.signal}</p>
  <p>Confidence: <b style="color:#00a854">${s.confidence.toFixed(1)}%</b> | Risk: <b>${s.risk_level}</b> | Strategy: <b>${s.strategy_name}</b> | Duration: <b>${s.duration_label}</b></p>
  <h2 style="color:#0056d2;border-bottom:1pt solid #0056d2">Strategy Reasoning</h2>
  <p>${s.reasoning}</p>
  <h2 style="color:#0056d2;border-bottom:1pt solid #0056d2">Entry Conditions</h2>
  <ul>${s.entry_conditions.map((c) => `<li>${c}</li>`).join("")}</ul>
  <h2 style="color:#0056d2;border-bottom:1pt solid #0056d2">Market State</h2>
  <p>Price: <b>${ms.current_price}</b> | Digit: <b>${ms.current_digit}</b> | Trend: <b>${ms.trend}</b> | Volatility: <b>${ms.volatility}%</b></p>
  <p>Even: <b>${ms.even_pct}%</b> | Odd: <b>${ms.odd_pct}%</b> | High digits: <b>${ms.high_digit_pct}%</b> | Low digits: <b>${ms.low_digit_pct}%</b></p>
  <p>Streak: <b>${ms.streak}×</b> digit ${ms.current_digit} | Parity streak: <b>${ms.parity_streak}</b> consecutive</p>
  ${s.barrier !== undefined ? `<p>Barrier: <b>${s.barrier}</b></p>` : ""}
  ${s.digit !== undefined ? `<p>Target Digit: <b>${s.digit}</b></p>` : ""}
  <p style="font-size:9pt;color:#999;text-align:center;margin-top:24pt">DIGIT KILLER · AI Trading System · AHMEDSYNTRADER.SITE · Not financial advice</p>
</body></html>`;
  const blob = new Blob(["\ufeff", wordHtml], { type: "application/msword" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `digit-killer-strategy-${s.symbol}-${s.contract_type}-${Date.now()}.doc`;
  a.click();
}

// ─────────────────────────────────────────────────────────────────
//  Existing signal flyer (PNG download)
// ─────────────────────────────────────────────────────────────────
async function downloadFlyer(signal: AiSignal) {
  const html2canvas = (await import("html2canvas")).default;
  const el = document.getElementById(`flyer-${signal.id}`);
  if (!el) return;
  const canvas = await html2canvas(el, {
    backgroundColor: "#050a10", scale: 2, useCORS: true, allowTaint: true,
  });
  const link = document.createElement("a");
  link.download = `digit-killer-signal-${signal.symbol}-${signal.contract_type}.png`;
  link.href = canvas.toDataURL("image/png");
  link.click();
}

function SignalFlyer({ signal }: { signal: AiSignal }) {
  const contractColor = CONTRACT_COLOR[signal.contract_type] ?? "#00e5ff";
  const digitColor = DIGIT_COLORS[signal.entry_digit] ?? "#fff";
  const timeStr = new Date(signal.timestamp).toLocaleString();
  return (
    <div
      id={`flyer-${signal.id}`}
      className="cyber-card p-5 relative overflow-hidden"
      style={{ border: `1px solid ${contractColor}40`, boxShadow: `0 0 20px ${contractColor}18` }}
    >
      <div className="absolute top-0 left-0 right-0 h-0.5" style={{ background: `linear-gradient(90deg, transparent, ${contractColor}, transparent)` }} />
      <div className="flex items-start justify-between mb-4">
        <div className="flex items-center gap-2">
          <img src={logoPath} alt="logo" className="w-7 h-7 rounded-full object-cover" />
          <div>
            <div className="font-orbitron text-xs font-bold text-primary tracking-widest">DIGIT KILLER</div>
            <div className="font-rajdhani text-[9px] text-muted-foreground tracking-widest">AHMEDSYNTRADER.SITE</div>
          </div>
        </div>
        <div className="flex flex-col items-end gap-1">
          <span className="font-orbitron text-xs font-bold px-2 py-0.5 rounded" style={{ background: `${contractColor}20`, color: contractColor, border: `1px solid ${contractColor}40` }}>{signal.contract_type}</span>
          <span className={`risk-${signal.risk_level?.toLowerCase() ?? "medium"} text-[10px]`}>{signal.risk_level}</span>
        </div>
      </div>
      <div className="text-center mb-4 py-3 rounded-lg" style={{ background: `${contractColor}08` }}>
        <div className="font-orbitron text-2xl font-black mb-1" style={{ color: contractColor, textShadow: `0 0 20px ${contractColor}60` }}>{signal.direction}</div>
        <div className="font-rajdhani text-xs text-muted-foreground tracking-widest uppercase">{signal.strategy}</div>
      </div>
      <div className="grid grid-cols-3 gap-3 mb-3">
        <div className="text-center">
          <div className="font-rajdhani text-[10px] text-muted-foreground tracking-wider uppercase">Symbol</div>
          <div className="font-orbitron text-xs font-bold text-foreground">{signal.symbol}</div>
        </div>
        <div className="text-center">
          <div className="font-rajdhani text-[10px] text-muted-foreground tracking-wider uppercase">Entry Digit</div>
          <div className="font-orbitron text-xl font-bold" style={{ color: digitColor }}>{signal.entry_digit}</div>
        </div>
        <div className="text-center">
          <div className="font-rajdhani text-[10px] text-muted-foreground tracking-wider uppercase">Ticks</div>
          <div className="font-orbitron text-xl font-bold text-primary">{signal.ticks}</div>
        </div>
      </div>
      <div className="mb-3">
        <div className="flex items-center justify-between text-[10px] font-rajdhani text-muted-foreground mb-1 tracking-wider">
          <span>CONFIDENCE</span>
          <span className="font-orbitron text-primary">{signal.confidence.toFixed(1)}%</span>
        </div>
        <div className="h-1.5 bg-muted rounded-full overflow-hidden">
          <div className="h-full rounded-full transition-all duration-500" style={{ width: `${signal.confidence}%`, background: `linear-gradient(90deg, ${contractColor}80, ${contractColor})`, boxShadow: `0 0 6px ${contractColor}80` }} />
        </div>
      </div>
      <div className="text-[10px] font-rajdhani text-muted-foreground leading-snug mb-3 border-t border-border/40 pt-2">{signal.reason}</div>
      <div className="flex items-center justify-between border-t border-border/40 pt-2">
        <span className="font-rajdhani text-[10px] text-muted-foreground">{timeStr}</span>
        <div className="flex items-center gap-1">
          <Zap size={10} className="text-primary" />
          <span className="font-rajdhani text-[10px] text-primary font-semibold tracking-wider">AI SIGNAL</span>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────
//  Strategy Generator Panel
// ─────────────────────────────────────────────────────────────────
function StrategyGeneratorPanel({ symbol }: { symbol: string }) {
  const [selectedContract, setSelectedContract] = useState("DIGITEVEN");
  const [barrier, setBarrier] = useState<string>("");
  const [digit, setDigit] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<StrategySignal | null>(null);
  const [error, setError] = useState<string | null>(null);

  const selectedMeta = CONTRACT_TYPES.flatMap((g) => g.contracts).find((c) => c.id === selectedContract);
  const categoryColor = CONTRACT_TYPES.find((g) => g.contracts.some((c) => c.id === selectedContract))?.color ?? "#00e5ff";

  async function generate() {
    if (!symbol) return;
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const params = new URLSearchParams({ symbol, contract_type: selectedContract, count: "500" });
      if (selectedMeta?.hasBarrier && barrier) params.set("barrier", barrier);
      if (selectedMeta?.hasDigit && digit !== "") params.set("digit", digit);
      const res = await fetch(`/api/generate-strategy?${params}`);
      if (!res.ok) throw new Error((await res.json()).error ?? "Failed");
      const data: StrategySignal = await res.json();
      setResult(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="cyber-card p-5 space-y-5">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Brain size={18} className="text-primary" />
        <div>
          <h3 className="font-orbitron text-sm font-bold text-primary tracking-wider">AI STRATEGY GENERATOR</h3>
          <p className="font-rajdhani text-xs text-muted-foreground tracking-widest">Generate signals for any Deriv contract type</p>
        </div>
      </div>

      {/* Contract type grid */}
      <div className="space-y-3">
        {CONTRACT_TYPES.map((group) => (
          <div key={group.category}>
            <div className="font-rajdhani text-[10px] tracking-widest uppercase mb-1.5" style={{ color: group.color }}>
              {group.category}
            </div>
            <div className="flex flex-wrap gap-1.5">
              {group.contracts.map((ct) => {
                const active = selectedContract === ct.id;
                return (
                  <button
                    key={ct.id}
                    onClick={() => { setSelectedContract(ct.id); setResult(null); setError(null); }}
                    className="px-3 py-1.5 rounded-lg text-xs font-rajdhani font-semibold transition-all"
                    style={{
                      background: active ? `${group.color}22` : "rgba(255,255,255,0.04)",
                      border: `1px solid ${active ? group.color : "rgba(255,255,255,0.1)"}`,
                      color: active ? group.color : "#aaa",
                      boxShadow: active ? `0 0 8px ${group.color}30` : "none",
                    }}
                    title={ct.desc}
                  >
                    {ct.label}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      {/* Optional params */}
      <div className="flex flex-wrap items-end gap-3">
        {selectedMeta?.hasBarrier && (
          <div>
            <label className="block font-rajdhani text-[10px] text-muted-foreground tracking-widest uppercase mb-1">
              {selectedContract.startsWith("DIGIT") ? "Barrier Digit (0–9)" : "Price Barrier"}
            </label>
            <input
              type={selectedContract.startsWith("DIGIT") ? "number" : "text"}
              min={0} max={9}
              placeholder={selectedContract.startsWith("DIGIT") ? "0–9" : "e.g. 95.4500"}
              value={barrier}
              onChange={(e) => setBarrier(e.target.value)}
              className="w-28 px-3 py-1.5 rounded-md bg-background border border-border font-orbitron text-sm text-foreground focus:outline-none focus:border-primary"
            />
          </div>
        )}
        {selectedMeta?.hasDigit && (
          <div>
            <label className="block font-rajdhani text-[10px] text-muted-foreground tracking-widest uppercase mb-1">Target Digit (0–9)</label>
            <select
              value={digit}
              onChange={(e) => setDigit(e.target.value)}
              className="px-3 py-1.5 rounded-md bg-background border border-border font-orbitron text-sm text-foreground focus:outline-none focus:border-primary"
            >
              <option value="">Auto (best)</option>
              {Array.from({ length: 10 }, (_, i) => (
                <option key={i} value={i}>{i}</option>
              ))}
            </select>
          </div>
        )}
        <button
          onClick={generate}
          disabled={loading || !symbol}
          className="flex items-center gap-2 px-5 py-2 rounded-lg font-rajdhani font-bold text-sm tracking-widest uppercase transition-all disabled:opacity-40"
          style={{ background: `${categoryColor}22`, border: `1px solid ${categoryColor}60`, color: categoryColor, boxShadow: loading ? "none" : `0 0 12px ${categoryColor}30` }}
        >
          {loading ? <RefreshCw size={14} className="animate-spin" /> : <ChevronRight size={14} />}
          {loading ? "Generating…" : "Generate Signal"}
        </button>
      </div>

      {/* Error */}
      {error && (
        <div className="flex items-center gap-2 p-3 rounded-lg bg-red-500/10 border border-red-500/30 text-red-400 text-xs font-rajdhani">
          <AlertCircle size={14} />
          {error}
        </div>
      )}

      {/* Result card */}
      {result && (
        <div
          className="rounded-xl p-5 space-y-4 animate-fade-in-up"
          style={{ background: `${categoryColor}08`, border: `1px solid ${categoryColor}30` }}
        >
          {/* Top accent */}
          <div className="h-0.5 -mt-5 -mx-5 mb-3 rounded-t-xl" style={{ background: `linear-gradient(90deg, transparent, ${categoryColor}, transparent)` }} />

          {/* Hero signal */}
          <div className="text-center py-3">
            <div className="font-rajdhani text-[10px] text-muted-foreground tracking-widest uppercase mb-2">
              {result.contract_category} · {result.strategy_name}
            </div>
            <div
              className="font-orbitron text-3xl font-black"
              style={{ color: categoryColor, textShadow: `0 0 24px ${categoryColor}60` }}
            >
              {result.signal}
            </div>
            <div className="flex items-center justify-center gap-4 mt-3 flex-wrap">
              <div className="text-center">
                <div className="font-rajdhani text-[9px] text-muted-foreground tracking-widest uppercase">Confidence</div>
                <div className="font-orbitron text-lg font-bold" style={{ color: CONFIDENCE_COLOR(result.confidence) }}>
                  {result.confidence.toFixed(1)}%
                </div>
              </div>
              <div className="text-center">
                <div className="font-rajdhani text-[9px] text-muted-foreground tracking-widest uppercase">Duration</div>
                <div className="font-orbitron text-lg font-bold text-primary">{result.duration_label}</div>
              </div>
              <div className="text-center">
                <div className="font-rajdhani text-[9px] text-muted-foreground tracking-widest uppercase">Risk</div>
                <div className={`font-orbitron text-lg font-bold risk-${result.risk_level.toLowerCase()}`}>{result.risk_level}</div>
              </div>
              {result.barrier !== undefined && (
                <div className="text-center">
                  <div className="font-rajdhani text-[9px] text-muted-foreground tracking-widest uppercase">Barrier</div>
                  <div className="font-orbitron text-lg font-bold text-primary">{result.barrier}</div>
                </div>
              )}
              {result.digit !== undefined && (
                <div className="text-center">
                  <div className="font-rajdhani text-[9px] text-muted-foreground tracking-widest uppercase">Target Digit</div>
                  <div className="font-orbitron text-lg font-bold" style={{ color: DIGIT_COLORS[result.digit] }}>{result.digit}</div>
                </div>
              )}
            </div>
          </div>

          {/* Confidence bar */}
          <div>
            <div className="h-2 bg-muted/30 rounded-full overflow-hidden">
              <div
                className="h-full rounded-full transition-all duration-700"
                style={{
                  width: `${result.confidence}%`,
                  background: `linear-gradient(90deg, ${categoryColor}60, ${categoryColor})`,
                  boxShadow: `0 0 8px ${categoryColor}60`,
                }}
              />
            </div>
          </div>

          {/* Reasoning */}
          <div className="border-t border-border/30 pt-3">
            <div className="font-rajdhani text-[10px] text-muted-foreground tracking-widest uppercase mb-1.5">REASONING</div>
            <p className="font-rajdhani text-xs text-foreground/80 leading-relaxed">{result.reasoning}</p>
          </div>

          {/* Entry conditions */}
          <div>
            <div className="font-rajdhani text-[10px] text-muted-foreground tracking-widest uppercase mb-2">ENTRY CONDITIONS</div>
            <div className="space-y-1.5">
              {result.entry_conditions.map((cond, i) => (
                <div key={i} className="flex items-start gap-2">
                  <div className="w-1 h-1 rounded-full mt-1.5 flex-shrink-0" style={{ background: categoryColor }} />
                  <span className="font-rajdhani text-xs text-foreground/80">{cond}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Market state mini grid */}
          <div className="border-t border-border/30 pt-3">
            <div className="font-rajdhani text-[10px] text-muted-foreground tracking-widest uppercase mb-2">MARKET SNAPSHOT</div>
            <div className="grid grid-cols-3 md:grid-cols-6 gap-2">
              {[
                { label: "Price", val: String(result.market_state.current_price) },
                { label: "Digit", val: String(result.market_state.current_digit), color: DIGIT_COLORS[result.market_state.current_digit] },
                { label: "Trend", val: result.market_state.trend, color: result.market_state.trend === "UP" ? "#00c853" : "#ff1744" },
                { label: "Even%", val: `${result.market_state.even_pct}%` },
                { label: "High%", val: `${result.market_state.high_digit_pct}%` },
                { label: "Streak", val: `${result.market_state.streak}×` },
              ].map(({ label, val, color }) => (
                <div key={label} className="text-center p-2 rounded-lg" style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)" }}>
                  <div className="font-rajdhani text-[9px] text-muted-foreground tracking-wider uppercase">{label}</div>
                  <div className="font-orbitron text-xs font-bold mt-0.5" style={{ color: color ?? "#00e5ff" }}>{val}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Export buttons */}
          <div className="flex flex-wrap gap-2 pt-2 border-t border-border/30">
            <button
              onClick={() => exportStrategyPDF(result)}
              className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-rajdhani font-semibold tracking-widest uppercase transition-all"
              style={{ background: "rgba(233,30,140,0.12)", border: "1px solid rgba(233,30,140,0.4)", color: "#e91e8c" }}
            >
              <FileText size={12} /> Export PDF
            </button>
            <button
              onClick={() => exportStrategyWord(result)}
              className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-rajdhani font-semibold tracking-widest uppercase transition-all"
              style={{ background: "rgba(68,138,255,0.12)", border: "1px solid rgba(68,138,255,0.4)", color: "#448aff" }}
            >
              <Download size={12} /> Export Word
            </button>
            <div className="ml-auto font-rajdhani text-[10px] text-muted-foreground self-center">
              Generated {new Date(result.generated_at).toLocaleTimeString()}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────
//  Main Page
// ─────────────────────────────────────────────────────────────────
export default function AiSignalsPage() {
  const { symbol } = useSymbol();

  const { data, isLoading, refetch } = useGetAiSignals(
    { symbol },
    {
      query: {
        enabled: !!symbol,
        queryKey: getGetAiSignalsQueryKey({ symbol }),
        refetchInterval: 5000,
      },
    }
  );

  const d = data as Record<string, unknown> | undefined;
  const signals: AiSignal[] = (d?.signals as AiSignal[]) ?? [];
  const marketCondition: string = (d?.market_condition as string) ?? "BALANCED";
  const lastUpdated: string = (d?.last_updated as string) ?? "";

  const conditionColor =
    marketCondition === "HIGH_PRESSURE" ? "#ff1744" :
    marketCondition === "LOW_PRESSURE" ? "#448aff" : "#00e5ff";

  return (
    <div className="space-y-5 animate-fade-in-up" data-testid="page-ai-signals">
      {/* Page header */}
      <div className="flex items-start justify-between">
        <div>
          <h2 className="font-orbitron text-lg font-bold text-primary tracking-wider">AI SIGNALS</h2>
          <p className="font-rajdhani text-xs text-muted-foreground tracking-widest uppercase mt-0.5">
            AI-Generated Signals & Strategy Builder for any Deriv contract
          </p>
        </div>
        <button
          onClick={() => refetch()}
          className="px-3 py-1.5 rounded text-xs font-rajdhani font-semibold tracking-widest uppercase border border-primary/30 text-primary hover:bg-primary/10 transition-all"
        >
          Refresh
        </button>
      </div>

      {/* ── Strategy Generator ── */}
      {symbol ? (
        <StrategyGeneratorPanel symbol={symbol} />
      ) : (
        <div className="cyber-card p-6 flex items-center gap-3 text-muted-foreground">
          <AlertCircle size={16} />
          <span className="font-rajdhani text-sm">Select a symbol from the sidebar to use the strategy generator.</span>
        </div>
      )}

      {/* ── Market condition banner ── */}
      {d && (
        <div className="cyber-card p-3 flex items-center gap-4" style={{ borderColor: `${conditionColor}40` }}>
          <div className="live-dot w-2 h-2" style={{ background: conditionColor, boxShadow: `0 0 8px ${conditionColor}` }} />
          <div>
            <span className="font-rajdhani text-xs text-muted-foreground tracking-widest uppercase mr-2">Market Condition:</span>
            <span className="font-orbitron text-xs font-bold" style={{ color: conditionColor }}>
              {marketCondition.replace("_", " ")}
            </span>
          </div>
          {lastUpdated && (
            <span className="ml-auto font-rajdhani text-[10px] text-muted-foreground">
              Updated {new Date(lastUpdated).toLocaleTimeString()}
            </span>
          )}
        </div>
      )}

      {/* ── Quick AI signals ── */}
      <div>
        <div className="font-rajdhani text-[10px] text-muted-foreground tracking-widest uppercase mb-3 flex items-center gap-2">
          <Zap size={12} className="text-primary" />
          QUICK AI SIGNALS — DOWNLOADABLE FLYERS
        </div>
        {isLoading ? (
          <div className="flex justify-center py-12">
            <div className="flex flex-col items-center gap-4">
              <div className="w-10 h-10 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
              <span className="font-rajdhani text-xs text-muted-foreground tracking-widest animate-blink">GENERATING AI SIGNALS…</span>
            </div>
          </div>
        ) : signals.length === 0 ? (
          <div className="cyber-card p-6 flex items-center justify-center gap-3 text-muted-foreground">
            <AlertCircle size={16} />
            <span className="font-rajdhani text-sm">No signals generated. Select a symbol.</span>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {signals.map((signal) => (
                <div key={signal.id} className="space-y-2">
                  <SignalFlyer signal={signal} />
                  <button
                    onClick={() => downloadFlyer(signal)}
                    className="w-full flex items-center justify-center gap-2 py-2 rounded-md border border-primary/25 text-primary hover:bg-primary/10 transition-all text-xs font-rajdhani font-semibold tracking-widest uppercase"
                  >
                    <Download size={12} />
                    Download PNG Flyer
                  </button>
                </div>
              ))}
            </div>
            <div className="text-center mt-3">
              <p className="font-rajdhani text-[10px] text-muted-foreground tracking-widest">
                DIGIT KILLER · AI Trading System · AHMEDSYNTRADER.SITE
              </p>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
