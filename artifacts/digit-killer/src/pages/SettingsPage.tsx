import { useState, useEffect, useCallback } from "react";
import { useTheme, THEMES, FONTS, SIZES } from "@/context/ThemeContext";
import {
  useAdminLogin,
  useGetUsers,
  useCreateUser,
  useDeleteUser,
  useRevokeUser,
  getGetUsersQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import {
  Shield, Users, Trash2, UserX, Copy, Check, RefreshCw, AlertCircle, KeyRound,
  Activity, Database, Clock, Wifi, WifiOff, Zap, CheckCircle, XCircle,
  Server, MemoryStick, Radio, RotateCcw, Play, ChevronDown, ChevronUp, Info,
  Bot, Eye, Divide, Shuffle, BarChart2, TrendingUp, ArrowUpDown, LineChart, Calculator,
} from "lucide-react";

interface User {
  id: number; user_id: string; username: string; active: boolean;
  created_at: string; revoked_at: string | null; generated_password?: string;
}

interface SystemHealth {
  uptime_seconds: number; last_reset: string; next_reset: string;
  ms_to_next_reset: number; reset_interval_h: number; reset_count: number;
  storage: { policy: string; total_symbols_buffered: number; total_ticks_in_memory: number; estimated_bytes: number; max_ticks_per_symbol: number; };
  connections: { active_websockets: number; active_sse_listeners: number; };
  memory_mb: { rss: number; heap_used: number; heap_total: number; external: number; };
  buffers_per_symbol: Record<string, number>;
}

interface EndpointResult {
  name: string; ok: boolean; status: number; latency_ms: number; error?: string;
}

interface DiagnosticsResult {
  system: SystemHealth;
  endpoints: EndpointResult[];
}

// ─── Admin API helpers ────────────────────────────────────────────────────────
async function adminFetch(path: string, opts: RequestInit = {}) {
  const token = localStorage.getItem("admin_token");
  const res = await fetch(path, {
    ...opts,
    headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(opts.headers ?? {}) },
  });
  return res;
}

function formatUptime(s: number) {
  const h = Math.floor(s / 3600); const m = Math.floor((s % 3600) / 60);
  return `${h}h ${m}m`;
}
function formatBytes(b: number) {
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`;
  return `${(b / 1024 / 1024).toFixed(2)} MB`;
}
function formatCountdown(ms: number) {
  const h = Math.floor(ms / 3600000); const m = Math.floor((ms % 3600000) / 60000); const s = Math.floor((ms % 60000) / 1000);
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

// ─── CopyBox ─────────────────────────────────────────────────────────────────
function CopyBox({ value, label }: { value: string; label: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="flex items-center gap-2 bg-muted/40 rounded-md px-3 py-2 border border-border/60">
      <div className="flex-1 min-w-0">
        <div className="font-rajdhani text-[10px] text-muted-foreground tracking-widest uppercase">{label}</div>
        <div className="font-orbitron text-sm font-bold text-primary truncate">{value}</div>
      </div>
      <button onClick={() => { navigator.clipboard.writeText(value); setCopied(true); setTimeout(() => setCopied(false), 2000); }}
        className="flex-shrink-0 text-muted-foreground hover:text-primary transition-colors">
        {copied ? <Check size={14} className="text-green-400" /> : <Copy size={14} />}
      </button>
    </div>
  );
}

// ─── Login form ───────────────────────────────────────────────────────────────
function LoginForm({ onSuccess }: { onSuccess: (token: string) => void }) {
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const adminLogin = useAdminLogin();
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault(); setError("");
    adminLogin.mutate({ data: { password } }, {
      onSuccess: (res: unknown) => { const r = res as { token: string }; onSuccess(r.token); },
      onError: () => setError("Invalid admin PIN"),
    });
  };
  return (
    <div className="max-w-sm mx-auto">
      <div className="cyber-card p-8 flex flex-col items-center gap-6">
        <div className="w-16 h-16 rounded-full bg-primary/10 border border-primary/30 flex items-center justify-center">
          <Shield size={28} className="text-primary" />
        </div>
        <div className="text-center">
          <div className="font-orbitron text-lg font-bold text-primary tracking-wider">ADMIN ACCESS</div>
          <div className="font-rajdhani text-xs text-muted-foreground tracking-widest mt-1">Enter admin PIN to continue</div>
        </div>
        <form onSubmit={handleSubmit} className="w-full space-y-4">
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)}
            placeholder="Admin PIN"
            className="w-full bg-muted/40 border border-border/60 rounded-md px-4 py-2.5 text-sm font-rajdhani text-foreground placeholder-muted-foreground focus:outline-none focus:border-primary/50"
            data-testid="input-admin-password" />
          {error && <div className="flex items-center gap-2 text-destructive text-xs font-rajdhani"><AlertCircle size={12} />{error}</div>}
          <button type="submit" disabled={adminLogin.isPending || !password}
            className="w-full py-2.5 rounded-md font-orbitron text-sm font-bold tracking-widest bg-primary/10 border border-primary/30 text-primary hover:bg-primary/20 transition-all disabled:opacity-50"
            data-testid="button-admin-login">
            {adminLogin.isPending ? "VERIFYING..." : "ACCESS CONTROL PANEL"}
          </button>
        </form>
      </div>
    </div>
  );
}

// ─── Change PIN ───────────────────────────────────────────────────────────────
function ChangePinSection() {
  const [newPin, setNewPin] = useState(""); const [confirmPin, setConfirmPin] = useState("");
  const [status, setStatus] = useState<"idle" | "success" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState(""); const [loading, setLoading] = useState(false);
  const handleChange = async (e: React.FormEvent) => {
    e.preventDefault(); setStatus("idle"); setErrorMsg("");
    if (newPin.length < 4) { setStatus("error"); setErrorMsg("PIN must be at least 4 characters"); return; }
    if (newPin !== confirmPin) { setStatus("error"); setErrorMsg("PINs do not match"); return; }
    setLoading(true);
    try {
      const res = await adminFetch("/api/admin/pin", { method: "PATCH", body: JSON.stringify({ new_pin: newPin }) });
      if (!res.ok) { const d = await res.json().catch(() => ({})); setStatus("error"); setErrorMsg((d as { error?: string }).error ?? "Failed to update PIN"); }
      else { setStatus("success"); setNewPin(""); setConfirmPin(""); }
    } catch { setStatus("error"); setErrorMsg("Network error"); }
    finally { setLoading(false); }
  };
  return (
    <div className="cyber-card p-4">
      <div className="flex items-center gap-2 mb-3"><KeyRound size={14} className="text-primary" />
        <span className="font-rajdhani font-semibold text-xs tracking-widest uppercase text-muted-foreground">Change Admin PIN</span>
      </div>
      <form onSubmit={handleChange} className="space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <input type="password" value={newPin} onChange={(e) => setNewPin(e.target.value)} placeholder="New PIN"
            className="bg-muted/40 border border-border/60 rounded-md px-3 py-2 text-sm font-rajdhani text-foreground placeholder-muted-foreground focus:outline-none focus:border-primary/50"
            data-testid="input-new-pin" />
          <input type="password" value={confirmPin} onChange={(e) => setConfirmPin(e.target.value)} placeholder="Confirm PIN"
            className="bg-muted/40 border border-border/60 rounded-md px-3 py-2 text-sm font-rajdhani text-foreground placeholder-muted-foreground focus:outline-none focus:border-primary/50"
            data-testid="input-confirm-pin" />
        </div>
        {status === "error" && <div className="flex items-center gap-2 text-destructive text-xs font-rajdhani"><AlertCircle size={12} />{errorMsg}</div>}
        {status === "success" && <div className="flex items-center gap-2 text-green-400 text-xs font-rajdhani"><Check size={12} />PIN updated successfully</div>}
        <button type="submit" disabled={loading || !newPin || !confirmPin}
          className="px-4 py-2 rounded-md font-rajdhani font-bold text-xs tracking-widest uppercase bg-primary/10 border border-primary/30 text-primary hover:bg-primary/20 transition-all disabled:opacity-50"
          data-testid="button-change-pin">
          {loading ? "UPDATING..." : "UPDATE PIN"}
        </button>
      </form>
    </div>
  );
}

// ─── System Health Panel ──────────────────────────────────────────────────────
function SystemHealthPanel() {
  const [health, setHealth] = useState<SystemHealth | null>(null);
  const [loading, setLoading] = useState(false);
  const [countdown, setCountdown] = useState("");
  const [clearing, setClearing] = useState(false);
  const [clearMsg, setClearMsg] = useState("");
  const [showBuffers, setShowBuffers] = useState(false);

  const fetchHealth = useCallback(async () => {
    setLoading(true);
    try {
      const res = await adminFetch("/api/admin/system-health");
      if (res.ok) setHealth(await res.json() as SystemHealth);
    } catch {}
    finally { setLoading(false); }
  }, []);

  useEffect(() => { void fetchHealth(); }, [fetchHealth]);

  // Live countdown timer
  useEffect(() => {
    if (!health) return;
    const tick = () => {
      const remaining = new Date(health.next_reset).getTime() - Date.now();
      setCountdown(remaining > 0 ? formatCountdown(remaining) : "resetting…");
    };
    tick();
    const t = setInterval(tick, 1000);
    return () => clearInterval(t);
  }, [health]);

  const handleClear = async () => {
    setClearing(true); setClearMsg("");
    try {
      const res = await adminFetch("/api/admin/clear-cache", { method: "POST" });
      const d = await res.json() as { message?: string };
      setClearMsg(d.message ?? "Cleared.");
      await fetchHealth();
    } catch { setClearMsg("Error clearing cache."); }
    finally { setClearing(false); }
  };

  return (
    <div className="cyber-card p-4 space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Activity size={14} className="text-primary" />
          <span className="font-rajdhani font-bold text-xs tracking-widest uppercase text-muted-foreground">System Health & Memory</span>
        </div>
        <button onClick={() => void fetchHealth()} disabled={loading}
          className="text-muted-foreground hover:text-primary transition-colors disabled:opacity-40">
          <RefreshCw size={13} className={loading ? "animate-spin" : ""} />
        </button>
      </div>

      {/* Storage policy badge */}
      <div className="flex items-center gap-2 px-3 py-2 rounded-lg"
        style={{ background: "rgba(34,197,94,0.08)", border: "1px solid rgba(34,197,94,0.2)" }}>
        <Database size={13} style={{ color: "#22c55e" }} />
        <span className="font-rajdhani text-xs" style={{ color: "#22c55e" }}>
          In-memory only · No disk writes for tick data · 15-hour auto-reset · Safe for 1 month+ operation
        </span>
      </div>

      {health ? (
        <>
          {/* Metrics grid */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
            {[
              { label: "Uptime",      value: formatUptime(health.uptime_seconds), icon: Clock, color: "#00e5ff" },
              { label: "Heap Used",   value: `${health.memory_mb.heap_used} MB`, icon: MemoryStick, color: "#fb8c00" },
              { label: "RSS Memory",  value: `${health.memory_mb.rss} MB`, icon: Server, color: "#8e24aa" },
              { label: "Resets Done", value: String(health.reset_count), icon: RotateCcw, color: "#facc15" },
            ].map(({ label, value, icon: Icon, color }) => (
              <div key={label} className="rounded-lg p-2.5" style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }}>
                <div className="flex items-center gap-1.5 mb-1"><Icon size={11} style={{ color }} /><span className="font-rajdhani text-[9px] text-muted-foreground tracking-wider uppercase">{label}</span></div>
                <div className="font-orbitron text-sm font-bold" style={{ color }}>{value}</div>
              </div>
            ))}
          </div>

          {/* Buffer stats */}
          <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
            {[
              { label: "Symbols Buffered", value: health.storage.total_symbols_buffered },
              { label: "Total Ticks in RAM", value: health.storage.total_ticks_in_memory.toLocaleString() },
              { label: "Estimated RAM", value: formatBytes(health.storage.estimated_bytes) },
              { label: "Max Ticks/Symbol", value: health.storage.max_ticks_per_symbol },
              { label: "Active WS Conns", value: health.connections.active_websockets },
              { label: "SSE Listeners", value: health.connections.active_sse_listeners },
            ].map(({ label, value }) => (
              <div key={label} className="rounded-lg p-2 bg-muted/20">
                <div className="font-rajdhani text-[9px] text-muted-foreground tracking-wider uppercase">{label}</div>
                <div className="font-orbitron text-xs font-bold text-foreground mt-0.5">{value}</div>
              </div>
            ))}
          </div>

          {/* 15-hour reset countdown */}
          <div className="rounded-xl p-3 border" style={{ background: "rgba(0,229,255,0.05)", borderColor: "rgba(0,229,255,0.2)" }}>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Clock size={13} className="text-primary" />
                <span className="font-rajdhani text-xs text-muted-foreground tracking-wider uppercase">Next Auto-Reset</span>
              </div>
              <span className="font-orbitron text-lg font-black text-primary">{countdown}</span>
            </div>
            <div className="font-rajdhani text-[9px] text-muted-foreground mt-1">
              Resets every {health.reset_interval_h}h · Last reset: {new Date(health.last_reset).toLocaleTimeString()}
            </div>
          </div>

          {/* Per-symbol buffers toggle */}
          <div>
            <button onClick={() => setShowBuffers((p) => !p)}
              className="flex items-center gap-1.5 text-xs font-rajdhani text-muted-foreground hover:text-foreground transition-colors">
              {showBuffers ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
              Per-symbol buffer sizes ({Object.keys(health.buffers_per_symbol).length} symbols)
            </button>
            {showBuffers && (
              <div className="mt-2 grid grid-cols-3 md:grid-cols-5 gap-1.5">
                {Object.entries(health.buffers_per_symbol).sort((a, b) => b[1] - a[1]).map(([sym, cnt]) => (
                  <div key={sym} className="rounded px-2 py-1 bg-muted/20 flex items-center justify-between gap-1">
                    <span className="font-orbitron text-[9px] text-muted-foreground truncate">{sym}</span>
                    <span className="font-orbitron text-[9px] font-bold text-primary flex-shrink-0">{cnt}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Manual reset button */}
          <div className="flex items-center gap-3">
            <button onClick={() => void handleClear()} disabled={clearing}
              className="flex items-center gap-2 px-4 py-2 rounded-lg font-rajdhani font-bold text-xs tracking-widest uppercase transition-all disabled:opacity-40"
              style={{ background: "rgba(239,68,68,0.12)", border: "1px solid rgba(239,68,68,0.35)", color: "#ef4444" }}>
              <RotateCcw size={13} className={clearing ? "animate-spin" : ""} />
              {clearing ? "Clearing…" : "Clear All Buffers Now"}
            </button>
            {clearMsg && <span className="font-rajdhani text-xs text-green-400">{clearMsg}</span>}
          </div>
        </>
      ) : (
        <div className="flex items-center gap-2 py-4 text-muted-foreground font-rajdhani text-sm">
          <RefreshCw size={14} className="animate-spin" /> Loading system stats…
        </div>
      )}
    </div>
  );
}

// ─── Page Troubleshooter ──────────────────────────────────────────────────────
const PAGE_TESTS = [
  { name: "Health Check",           path: "/api/health",                                              icon: Activity,    page: "System" },
  { name: "Active Symbols",         path: "/api/active-symbols",                                      icon: Radio,       page: "System" },
  { name: "Wide Eye (R_50)",        path: "/api/wide-eye-analysis?symbol=R_50&count=200",             icon: Eye,         page: "Wide Eye" },
  { name: "Over/Under (R_50)",      path: "/api/over-under-signals?symbol=R_50&count=200",            icon: TrendingUp,  page: "Over/Under" },
  { name: "Even/Odd (R_50)",        path: "/api/even-odd-analysis?symbol=R_50&count=200",             icon: Divide,      page: "Even/Odd" },
  { name: "Match/Differ (R_50)",    path: "/api/match-differ-signals?symbol=R_50",                    icon: Shuffle,     page: "Match/Differ" },
  { name: "Tick Analyser (R_50)",   path: "/api/tick-contracts?symbol=R_50",                         icon: BarChart2,   page: "Tick Analyser" },
  { name: "Rise/Fall (R_50)",       path: "/api/ai-signals?symbol=R_50",                             icon: TrendingUp,  page: "Rise/Fall" },
  { name: "Only Up/Down (R_50)",    path: "/api/rise-fall-signals?symbol=R_50",                      icon: ArrowUpDown, page: "Only Up/Down" },
  { name: "AI Signals (R_50)",      path: "/api/ai-signals?symbol=R_50",                             icon: Zap,         page: "AI Signals" },
  { name: "Digit Analysis (R_50)",  path: "/api/digit-analysis?symbol=R_50&count=200",               icon: BarChart2,   page: "Digit Analysis" },
  { name: "Advanced Analysis",      path: "/api/advanced-analysis?symbol=R_50&count=200",            icon: LineChart,   page: "Reports" },
  { name: "AI Trading (test)",      path: "/api/health",                                              icon: Bot,         page: "AI Trading" },
  { name: "Risk Calculator",        path: "/api/health",                                              icon: Calculator,  page: "Risk Calc" },
];

interface TestResult { ok: boolean; status: number; latency_ms: number; error?: string; keys?: string[]; }

function PageTroubleshooter() {
  const [results, setResults] = useState<Map<string, TestResult>>(new Map());
  const [running, setRunning] = useState<Set<string>>(new Set());
  const [runningAll, setRunningAll] = useState(false);

  const testEndpoint = useCallback(async (path: string, name: string) => {
    setRunning((p) => new Set([...p, name]));
    const start = Date.now();
    try {
      const res = await fetch(path, { signal: AbortSignal.timeout(8000) });
      const latency = Date.now() - start;
      let keys: string[] = [];
      try { const d = await res.json(); keys = d && typeof d === "object" ? Object.keys(d) : []; } catch {}
      setResults((prev) => new Map(prev).set(name, { ok: res.ok, status: res.status, latency_ms: latency, keys }));
    } catch (err) {
      setResults((prev) => new Map(prev).set(name, { ok: false, status: 0, latency_ms: Date.now() - start, error: String(err) }));
    }
    setRunning((p) => { const n = new Set(p); n.delete(name); return n; });
  }, []);

  const testAll = async () => {
    setRunningAll(true);
    await Promise.allSettled(PAGE_TESTS.map((t) => testEndpoint(t.path, t.name)));
    setRunningAll(false);
  };

  const totalOk = [...results.values()].filter((r) => r.ok).length;
  const totalFail = [...results.values()].filter((r) => !r.ok).length;

  return (
    <div className="cyber-card p-4 space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Wifi size={14} className="text-primary" />
          <span className="font-rajdhani font-bold text-xs tracking-widest uppercase text-muted-foreground">
            Page & API Troubleshooter
          </span>
        </div>
        <div className="flex items-center gap-3">
          {results.size > 0 && (
            <div className="flex items-center gap-2 text-xs font-rajdhani">
              <span style={{ color: "#22c55e" }}>✓ {totalOk}</span>
              <span style={{ color: "#ef4444" }}>✗ {totalFail}</span>
            </div>
          )}
          <button onClick={() => void testAll()} disabled={runningAll}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-rajdhani font-bold text-xs tracking-widest uppercase transition-all disabled:opacity-40"
            style={{ background: "rgba(0,229,255,0.12)", border: "1px solid rgba(0,229,255,0.3)", color: "#00e5ff" }}>
            <Play size={11} className={runningAll ? "animate-pulse" : ""} />
            {runningAll ? "Testing All…" : "Test All"}
          </button>
        </div>
      </div>

      <div className="space-y-1.5">
        {PAGE_TESTS.map(({ name, path, icon: Icon, page }) => {
          const result = results.get(name);
          const isRunning = running.has(name);
          const latencyColor = !result ? "#78909c"
            : result.latency_ms < 200 ? "#22c55e"
            : result.latency_ms < 800 ? "#facc15"
            : "#ef4444";

          return (
            <div key={name} className="flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all"
              style={{ background: result ? (result.ok ? "rgba(34,197,94,0.04)" : "rgba(239,68,68,0.06)") : "rgba(255,255,255,0.02)" }}>
              <Icon size={13} className="flex-shrink-0 text-muted-foreground" />
              <div className="flex-1 min-w-0">
                <div className="font-rajdhani text-xs font-semibold text-foreground">{name}</div>
                <div className="font-rajdhani text-[9px] text-muted-foreground truncate">{path}</div>
              </div>
              {/* Page badge */}
              <div className="font-rajdhani text-[9px] px-1.5 py-0.5 rounded bg-muted/30 text-muted-foreground hidden md:block flex-shrink-0">
                {page}
              </div>
              {/* Result */}
              {result && (
                <div className="flex items-center gap-2 flex-shrink-0">
                  <span className="font-orbitron text-[10px] font-bold" style={{ color: latencyColor }}>
                    {result.latency_ms}ms
                  </span>
                  {result.ok
                    ? <CheckCircle size={13} style={{ color: "#22c55e" }} />
                    : <XCircle size={13} style={{ color: "#ef4444" }} />}
                </div>
              )}
              {result?.error && (
                <div className="font-rajdhani text-[9px] text-red-400 truncate max-w-24" title={result.error}>
                  {result.error.slice(0, 30)}
                </div>
              )}
              <button onClick={() => void testEndpoint(path, name)} disabled={isRunning}
                className="flex-shrink-0 px-2.5 py-1 rounded font-rajdhani text-[10px] font-bold transition-all disabled:opacity-40"
                style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)", color: "#aaa" }}>
                {isRunning ? <RefreshCw size={10} className="animate-spin" /> : "Test"}
              </button>
            </div>
          );
        })}
      </div>

      {/* SSE connectivity */}
      <SseTest />
    </div>
  );
}

function SseTest() {
  const [status, setStatus] = useState<"idle" | "connecting" | "ok" | "fail">("idle");
  const [firstTick, setFirstTick] = useState<string | null>(null);
  const [latency, setLatency] = useState<number | null>(null);

  const test = () => {
    setStatus("connecting"); setFirstTick(null); setLatency(null);
    const start = Date.now();
    const es = new EventSource("/api/live-ticks?symbol=R_50");
    const timeout = setTimeout(() => { es.close(); setStatus("fail"); }, 8000);
    es.onmessage = (e) => {
      clearTimeout(timeout); es.close();
      setStatus("ok"); setLatency(Date.now() - start);
      try { const d = JSON.parse(e.data) as { price: number; digit: number }; setFirstTick(`price=${d.price.toFixed(4)}, digit=${d.digit}`); } catch {}
    };
    es.onerror = () => { clearTimeout(timeout); es.close(); setStatus("fail"); };
  };

  return (
    <div className="flex items-center gap-3 px-3 py-2.5 rounded-lg"
      style={{ background: status === "ok" ? "rgba(34,197,94,0.04)" : status === "fail" ? "rgba(239,68,68,0.06)" : "rgba(255,255,255,0.02)" }}>
      <Radio size={13} className="flex-shrink-0 text-muted-foreground" />
      <div className="flex-1 min-w-0">
        <div className="font-rajdhani text-xs font-semibold text-foreground">SSE Live Ticks (R_50)</div>
        <div className="font-rajdhani text-[9px] text-muted-foreground">/api/live-ticks?symbol=R_50 · SSE stream</div>
        {firstTick && <div className="font-rajdhani text-[9px] text-green-400 mt-0.5">{firstTick}</div>}
      </div>
      {latency !== null && (
        <span className="font-orbitron text-[10px] font-bold flex-shrink-0"
          style={{ color: latency < 500 ? "#22c55e" : "#facc15" }}>{latency}ms</span>
      )}
      {status === "ok" && <CheckCircle size={13} style={{ color: "#22c55e" }} />}
      {status === "fail" && <XCircle size={13} style={{ color: "#ef4444" }} />}
      {status === "connecting" && <RefreshCw size={13} className="animate-spin text-primary" />}
      <button onClick={test} disabled={status === "connecting"}
        className="flex-shrink-0 px-2.5 py-1 rounded font-rajdhani text-[10px] font-bold transition-all disabled:opacity-40"
        style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)", color: "#aaa" }}>
        Test
      </button>
    </div>
  );
}

// ─── Full diagnostics runner ──────────────────────────────────────────────────
function FullDiagnosticsPanel() {
  const [result, setResult] = useState<DiagnosticsResult | null>(null);
  const [loading, setLoading] = useState(false);

  const run = async () => {
    setLoading(true);
    try {
      const res = await adminFetch("/api/admin/diagnostics");
      if (res.ok) setResult(await res.json() as DiagnosticsResult);
    } catch {}
    finally { setLoading(false); }
  };

  return (
    <div className="cyber-card p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Server size={14} className="text-primary" />
          <span className="font-rajdhani font-bold text-xs tracking-widest uppercase text-muted-foreground">
            Full Server Diagnostics
          </span>
        </div>
        <button onClick={() => void run()} disabled={loading}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-rajdhani font-bold text-xs tracking-widest uppercase transition-all disabled:opacity-40"
          style={{ background: "rgba(139,92,246,0.12)", border: "1px solid rgba(139,92,246,0.3)", color: "#a78bfa" }}>
          <Zap size={11} className={loading ? "animate-pulse" : ""} />
          {loading ? "Running…" : "Run Full Diagnostics"}
        </button>
      </div>

      {result && (
        <div className="space-y-2">
          {result.endpoints.map((ep) => (
            <div key={ep.name} className="flex items-center gap-3 px-3 py-2 rounded-lg"
              style={{ background: ep.ok ? "rgba(34,197,94,0.04)" : "rgba(239,68,68,0.06)" }}>
              {ep.ok ? <CheckCircle size={13} style={{ color: "#22c55e" }} /> : <XCircle size={13} style={{ color: "#ef4444" }} />}
              <span className="font-rajdhani text-xs font-semibold flex-1 text-foreground">{ep.name}</span>
              <span className="font-orbitron text-[10px] font-bold"
                style={{ color: ep.latency_ms < 300 ? "#22c55e" : ep.latency_ms < 1000 ? "#facc15" : "#ef4444" }}>
                {ep.latency_ms}ms
              </span>
              <span className="font-rajdhani text-[10px] text-muted-foreground">HTTP {ep.status || "—"}</span>
              {ep.error && <span className="font-rajdhani text-[9px] text-red-400">{ep.error.slice(0, 30)}</span>}
            </div>
          ))}
          <div className="font-rajdhani text-[9px] text-muted-foreground pt-1">
            Heap: {result.system.memory_mb.heap_used}/{result.system.memory_mb.heap_total} MB ·
            Uptime: {formatUptime(result.system.uptime_seconds)} ·
            Resets: {result.system.reset_count}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Storage Policy Info ──────────────────────────────────────────────────────
function StoragePolicyPanel() {
  return (
    <div className="cyber-card p-4 space-y-3">
      <div className="flex items-center gap-2">
        <Info size={14} className="text-primary" />
        <span className="font-rajdhani font-bold text-xs tracking-widest uppercase text-muted-foreground">
          Storage & Data Policy
        </span>
      </div>
      <div className="space-y-2 font-rajdhani text-xs text-muted-foreground">
        {[
          { icon: "✅", title: "Tick Data", detail: "In-memory only (RAM). Never written to disk. Max 1,100 ticks per symbol (~220 KB total for 25 symbols)." },
          { icon: "✅", title: "Auto-Reset Every 15 Hours", detail: "All tick buffers are automatically cleared every 15 hours. WebSocket streams reconnect instantly. Session data stays fresh." },
          { icon: "✅", title: "LocalStorage", detail: "Only stores auth tokens (user_token, admin_token, deriv_token). Never tick or trade data." },
          { icon: "✅", title: "PostgreSQL DB", detail: "Only stores user accounts (username, hashed password). Tick data never touches the database." },
          { icon: "✅", title: "1-Month Safety", detail: "With a 15-hour reset cycle, the app can run indefinitely without any storage accumulation. Memory stays under 50 MB at all times." },
          { icon: "⚠️", title: "Trade History", detail: "AI Trading page trade history is held in React state only. It resets on page refresh or navigation — no persistence." },
        ].map(({ icon, title, detail }) => (
          <div key={title} className="flex items-start gap-2 py-1.5 border-b" style={{ borderColor: "rgba(255,255,255,0.05)" }}>
            <span className="text-sm flex-shrink-0">{icon}</span>
            <div>
              <div className="font-bold text-foreground">{title}</div>
              <div className="text-[10px] mt-0.5">{detail}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── User management ─────────────────────────────────────────────────────────
function UserManagementPanel() {
  const qc = useQueryClient();
  const [username, setUsername] = useState("");
  const [newUser, setNewUser] = useState<User | null>(null);
  const { data: users, isLoading: usersLoading, refetch } = useGetUsers({
    query: { queryKey: getGetUsersQueryKey(), refetchInterval: 15000 },
  } as Parameters<typeof useGetUsers>[0]);
  const createUser = useCreateUser(); const deleteUser = useDeleteUser(); const revokeUser = useRevokeUser();
  const usersList = (users as User[]) ?? [];

  const handleCreate = () => {
    if (!username.trim()) return;
    createUser.mutate({ data: { username: username.trim() } }, {
      onSuccess: (res: unknown) => { setNewUser(res as User); setUsername(""); qc.invalidateQueries({ queryKey: getGetUsersQueryKey() }); },
    });
  };
  const handleDelete = (id: number) => {
    deleteUser.mutate({ id: String(id) } as Parameters<typeof deleteUser.mutate>[0],
      { onSuccess: () => qc.invalidateQueries({ queryKey: getGetUsersQueryKey() }) });
  };
  const handleRevoke = (id: number) => {
    revokeUser.mutate({ id: String(id) } as Parameters<typeof revokeUser.mutate>[0],
      { onSuccess: () => qc.invalidateQueries({ queryKey: getGetUsersQueryKey() }) });
  };

  return (
    <div className="space-y-4">
      {/* Generate user */}
      <div className="cyber-card p-4">
        <div className="flex items-center gap-2 mb-3"><Users size={14} className="text-primary" />
          <span className="font-rajdhani font-semibold text-xs tracking-widest uppercase text-muted-foreground">Generate New User ID</span>
        </div>
        <div className="flex items-center gap-3">
          <input type="text" value={username} onChange={(e) => setUsername(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleCreate()} placeholder="Enter username"
            className="flex-1 bg-muted/40 border border-border/60 rounded-md px-3 py-2 text-sm font-rajdhani text-foreground placeholder-muted-foreground focus:outline-none focus:border-primary/50"
            data-testid="input-new-username" />
          <button onClick={handleCreate} disabled={createUser.isPending || !username.trim()}
            className="px-4 py-2 rounded-md font-rajdhani font-bold text-xs tracking-widest uppercase bg-primary/10 border border-primary/30 text-primary hover:bg-primary/20 transition-all disabled:opacity-50"
            data-testid="button-generate-user">
            {createUser.isPending ? "..." : "Generate"}
          </button>
        </div>
        {newUser && (
          <div className="mt-4 p-4 rounded-lg border border-green-500/30 space-y-2" data-testid="box-new-user">
            <div className="font-rajdhani text-xs text-green-400 font-bold tracking-widest uppercase mb-2">User Created Successfully</div>
            <CopyBox value={newUser.user_id} label="User ID" />
            {newUser.generated_password && <CopyBox value={newUser.generated_password} label="Password" />}
            <CopyBox value={newUser.username} label="Username" />
          </div>
        )}
      </div>

      {/* User list */}
      <div className="cyber-card p-4">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2"><Users size={14} className="text-muted-foreground" />
            <span className="font-rajdhani font-semibold text-xs tracking-widest uppercase text-muted-foreground">
              User Accounts ({usersList.length})
            </span>
          </div>
          <button onClick={() => refetch()} className="text-muted-foreground hover:text-primary transition-colors" data-testid="button-refresh-users">
            <RefreshCw size={12} />
          </button>
        </div>
        {usersLoading ? (
          <div className="flex justify-center py-8"><div className="w-6 h-6 border-2 border-primary/30 border-t-primary rounded-full animate-spin" /></div>
        ) : usersList.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground font-rajdhani text-sm">No users yet.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-border/60">
                  {["Username", "User ID", "Status", "Created", "Actions"].map((h) => (
                    <th key={h} className="text-left pb-2 font-rajdhani text-muted-foreground tracking-wider font-semibold">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {usersList.map((user) => (
                  <tr key={user.id} className="border-b border-border/30 hover:bg-muted/20 transition-colors" data-testid={`row-user-${user.id}`}>
                    <td className="py-2 font-rajdhani font-semibold text-foreground">{user.username}</td>
                    <td className="py-2 font-orbitron text-primary/80">{user.user_id}</td>
                    <td className="py-2">{user.active ? <span className="risk-low">ACTIVE</span> : <span className="risk-high">REVOKED</span>}</td>
                    <td className="py-2 text-muted-foreground font-rajdhani">{new Date(user.created_at).toLocaleDateString()}</td>
                    <td className="py-2">
                      <div className="flex items-center gap-2">
                        {user.active && (
                          <button onClick={() => handleRevoke(user.id)} className="text-yellow-500/70 hover:text-yellow-400 transition-colors" title="Revoke" data-testid={`button-revoke-${user.id}`}>
                            <UserX size={14} />
                          </button>
                        )}
                        <button onClick={() => handleDelete(user.id)} className="text-destructive/70 hover:text-destructive transition-colors" title="Delete" data-testid={`button-delete-${user.id}`}>
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── API Connection Guide ──────────────────────────────────────────────────────
function ApiConnectionGuide() {
  const steps = [
    {
      title: "Generate a Deriv API Token",
      color: "#00e5ff",
      steps: [
        "Go to app.deriv.com → Accounts → API token",
        "Click 'Create new token'",
        "Enable: Read, Trade, Payments, Admin (all 4)",
        "Copy the token — it only appears once",
      ],
    },
    {
      title: "Connect in Speed Lab or Hedge Trading",
      color: "#22c55e",
      steps: [
        "Open Speed Lab or Hedge Trading page",
        "Paste the token in the 'Deriv API Token' field",
        "Click 'Connect' — status should show 'CONNECTED'",
        "Your account balance will appear when connected",
      ],
    },
    {
      title: "Common Issues & Fixes",
      color: "#facc15",
      steps: [
        "InvalidToken → Regenerate token with ALL permissions checked",
        "Connecting then disconnecting → Token missing Trading permissions",
        "Proposal errors → Ensure symbol is active on your Deriv account",
        "Connection drops → Check internet, click Connect again to retry",
      ],
    },
    {
      title: "Token Permissions Checklist",
      color: "#a78bfa",
      steps: [
        "✅ Read — required to see account info",
        "✅ Trade — required to place contracts",
        "✅ Payments — required for balance updates",
        "✅ Admin — required for account switching",
      ],
    },
  ];

  return (
    <div className="space-y-3">
      <div className="cyber-card p-4">
        <div className="flex items-center gap-2 mb-4">
          <Wifi size={14} className="text-primary" />
          <span className="font-orbitron text-xs font-bold tracking-widest text-primary uppercase">
            Speed Lab & Hedge Trading — Connection Guide
          </span>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          {steps.map((section) => (
            <div key={section.title} className="rounded-xl p-3"
              style={{ background: `${section.color}08`, border: `1px solid ${section.color}30` }}>
              <div className="font-orbitron text-[10px] font-bold tracking-wider mb-2"
                style={{ color: section.color }}>
                {section.title}
              </div>
              <ul className="space-y-1.5">
                {section.steps.map((s, i) => (
                  <li key={i} className="flex items-start gap-2">
                    <span className="font-orbitron text-[9px] font-bold mt-0.5 flex-shrink-0"
                      style={{ color: section.color }}>{i + 1}.</span>
                    <span className="font-rajdhani text-[11px] text-muted-foreground leading-tight">{s}</span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>

      <div className="cyber-card p-4">
        <div className="flex items-center gap-2 mb-3">
          <AlertCircle size={13} className="text-yellow-400" />
          <span className="font-orbitron text-[10px] font-bold tracking-widest uppercase text-yellow-400">
            Error Code Reference
          </span>
        </div>
        <div className="space-y-2">
          {[
            { code: "InvalidToken",          color: "#ef4444", fix: "Regenerate PAT with all 4 permissions. Old tokens expire or are revoked." },
            { code: "AuthorizationRequired", color: "#f97316", fix: "Send the auth token first before making requests. Reconnect." },
            { code: "RateLimit",             color: "#facc15", fix: "Too many requests. Wait 30s then reconnect." },
            { code: "proxy_error",           color: "#a78bfa", fix: "Server cannot reach Deriv WS. Check API Server workflow is running." },
            { code: "1006 Abnormal Close",   color: "#64748b", fix: "Network interruption. The proxy auto-reconnects; if it fails, click Connect." },
          ].map(({ code, color, fix }) => (
            <div key={code} className="flex items-start gap-3 px-3 py-2 rounded-lg"
              style={{ background: "rgba(255,255,255,0.025)" }}>
              <code className="font-orbitron text-[9px] font-bold flex-shrink-0 mt-0.5 px-1.5 py-0.5 rounded"
                style={{ background: `${color}18`, color, border: `1px solid ${color}40` }}>
                {code}
              </code>
              <span className="font-rajdhani text-[11px] text-muted-foreground leading-tight">{fix}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── Admin Panel with tabs ────────────────────────────────────────────────────
type Tab = "health" | "troubleshoot" | "diagnostics" | "policy" | "users" | "pin" | "commission" | "api-guide";

function AdminPanel() {
  const [tab, setTab] = useState<Tab>("health");

  const tabs: { id: Tab; label: string; icon: React.ReactNode }[] = [
    { id: "health",       label: "System Health",    icon: <Activity size={12} /> },
    { id: "troubleshoot", label: "Troubleshoot",     icon: <Wifi size={12} /> },
    { id: "api-guide",    label: "API Connection",   icon: <Shield size={12} /> },
    { id: "diagnostics",  label: "Diagnostics",      icon: <Server size={12} /> },
    { id: "policy",       label: "Storage Policy",   icon: <Database size={12} /> },
    { id: "users",        label: "Users",            icon: <Users size={12} /> },
    { id: "pin",          label: "Admin PIN",        icon: <KeyRound size={12} /> },
    { id: "commission",   label: "Commission",       icon: <TrendingUp size={12} /> },
  ];

  return (
    <div className="space-y-4">
      {/* Tab bar */}
      <div className="flex flex-wrap gap-1.5">
        {tabs.map(({ id, label, icon }) => (
          <button key={id} onClick={() => setTab(id)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-rajdhani text-xs font-bold tracking-wider uppercase transition-all"
            style={tab === id
              ? { background: "rgba(0,229,255,0.15)", border: "1px solid rgba(0,229,255,0.4)", color: "#00e5ff" }
              : { background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", color: "rgba(255,255,255,0.45)" }}>
            {icon} {label}
          </button>
        ))}
      </div>

      {tab === "health"       && <SystemHealthPanel />}
      {tab === "troubleshoot" && <PageTroubleshooter />}
      {tab === "api-guide"    && <ApiConnectionGuide />}
      {tab === "diagnostics"  && <FullDiagnosticsPanel />}
      {tab === "policy"       && <StoragePolicyPanel />}
      {tab === "users"        && <UserManagementPanel />}
      {tab === "pin"          && <ChangePinSection />}
      {tab === "commission"   && <CommissionPanel />}
    </div>
  );
}

// ─── Commission Panel ─────────────────────────────────────────────────────────
interface CommissionStats {
  total_trades: number;
  total_commission_usd: number;
  total_volume_usd: number;
  by_contract_type: Array<{ type: string; count: number; commission: number; volume: number }>;
  by_symbol: Array<{ symbol: string; count: number; commission: number }>;
  by_day: Array<{ day: string; count: number; commission: number }>;
  recent_trades: Array<{
    id: string; symbol: string; contract_type: string;
    stake: number; buy_price: number; payout: number; markup_pct: number;
    commission_usd: number; timestamp: string;
  }>;
}

function CommissionPanel() {
  const [data, setData]         = useState<CommissionStats | null>(null);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState("");
  const [clearing, setClearing] = useState(false);

  const adminToken = typeof window !== "undefined" ? localStorage.getItem("admin_token") ?? "" : "";

  const load = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const r = await fetch("/api/admin/commissions", { headers: { Authorization: `Bearer ${adminToken}` } });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      setData(await r.json());
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }, [adminToken]);

  useEffect(() => { void load(); }, [load]);

  async function clearCommissions() {
    if (!confirm("Clear all commission records? This cannot be undone.")) return;
    setClearing(true);
    try {
      await fetch("/api/admin/commissions", { method: "DELETE", headers: { Authorization: `Bearer ${adminToken}` } });
      await load();
    } catch {}
    setClearing(false);
  }

  if (loading) return (
    <div className="cyber-card p-6 flex items-center gap-3">
      <RefreshCw size={14} className="animate-spin text-muted-foreground" />
      <span className="font-rajdhani text-sm text-muted-foreground">Loading commission data…</span>
    </div>
  );

  if (error) return (
    <div className="cyber-card p-4 flex items-center gap-3">
      <AlertCircle size={14} className="text-red-400" />
      <span className="font-rajdhani text-sm text-red-400">Error: {error}</span>
      <button onClick={() => void load()} className="ml-auto font-rajdhani text-xs text-primary underline">Retry</button>
    </div>
  );

  if (!data) return null;

  const maxTypeComm = Math.max(...data.by_contract_type.map((v) => v.commission), 0.0001);
  const maxSymComm  = Math.max(...data.by_symbol.map((v) => v.commission), 0.0001);

  return (
    <div className="space-y-4">
      {/* ── Summary cards ─────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        {[
          { label: "Total Trades",      value: String(data.total_trades),                    color: "#00e5ff" },
          { label: "Total Volume",      value: `$${data.total_volume_usd.toFixed(2)}`,        color: "#facc15" },
          { label: "Total Commission",  value: `$${data.total_commission_usd.toFixed(4)}`,    color: "#22c55e" },
        ].map(({ label, value, color }) => (
          <div key={label} className="cyber-card p-4">
            <div className="font-rajdhani text-[10px] text-muted-foreground tracking-widest uppercase">{label}</div>
            <div className="font-orbitron text-lg font-black mt-1" style={{ color }}>{value}</div>
          </div>
        ))}
      </div>

      {data.total_trades === 0 && (
        <div className="cyber-card p-6 text-center">
          <TrendingUp size={28} className="mx-auto text-muted-foreground mb-2 opacity-30" />
          <div className="font-rajdhani text-sm text-muted-foreground">No trades recorded yet.</div>
          <div className="font-rajdhani text-[10px] text-muted-foreground mt-1">Commission is tracked automatically whenever a trade is placed from any trading page.</div>
        </div>
      )}

      {data.total_trades > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* ── By contract type ──────────────────────────────────────────── */}
          {data.by_contract_type.length > 0 && (
            <div className="cyber-card p-4">
              <div className="font-rajdhani text-[10px] text-muted-foreground tracking-widest uppercase mb-3 flex items-center gap-2">
                <BarChart2 size={11} className="text-primary" /> By Contract Type
              </div>
              <div className="space-y-2">
                {data.by_contract_type.map((row) => (
                  <div key={row.type}>
                    <div className="flex items-center justify-between mb-0.5">
                      <span className="font-orbitron text-[10px] font-bold text-foreground">{row.type}</span>
                      <div className="flex items-center gap-3 font-rajdhani text-[10px] text-muted-foreground">
                        <span>{row.count} trades</span>
                        <span className="text-green-400 font-bold">${row.commission.toFixed(4)}</span>
                      </div>
                    </div>
                    <div className="h-1.5 rounded-full" style={{ background: "rgba(255,255,255,0.06)" }}>
                      <div className="h-full rounded-full transition-all" style={{ width: `${(row.commission / maxTypeComm) * 100}%`, background: "rgba(0,229,255,0.7)" }} />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ── By symbol ──────────────────────────────────────────────────── */}
          {data.by_symbol.length > 0 && (
            <div className="cyber-card p-4">
              <div className="font-rajdhani text-[10px] text-muted-foreground tracking-widest uppercase mb-3 flex items-center gap-2">
                <LineChart size={11} className="text-primary" /> By Symbol
              </div>
              <div className="space-y-2">
                {data.by_symbol.slice(0, 8).map((row) => (
                  <div key={row.symbol}>
                    <div className="flex items-center justify-between mb-0.5">
                      <span className="font-orbitron text-[10px] font-bold text-foreground">{row.symbol}</span>
                      <div className="flex items-center gap-3 font-rajdhani text-[10px] text-muted-foreground">
                        <span>{row.count} trades</span>
                        <span className="text-green-400 font-bold">${row.commission.toFixed(4)}</span>
                      </div>
                    </div>
                    <div className="h-1.5 rounded-full" style={{ background: "rgba(255,255,255,0.06)" }}>
                      <div className="h-full rounded-full transition-all" style={{ width: `${(row.commission / maxSymComm) * 100}%`, background: "rgba(34,197,94,0.7)" }} />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Recent trades ─────────────────────────────────────────────── */}
      {data.recent_trades.length > 0 && (
        <div className="cyber-card p-4">
          <div className="font-rajdhani text-[10px] text-muted-foreground tracking-widest uppercase mb-3 flex items-center gap-2">
            <Clock size={11} className="text-primary" /> Recent Trades (last {data.recent_trades.length})
          </div>
          <div className="space-y-1 max-h-64 overflow-y-auto">
            {data.recent_trades.map((t) => (
              <div key={t.id} className="flex items-center gap-3 px-3 py-2 rounded-lg text-xs"
                style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)" }}>
                <div className="flex flex-col min-w-0 flex-1">
                  <span className="font-orbitron text-[10px] font-bold truncate text-foreground">
                    {t.symbol} · {t.contract_type}
                  </span>
                  <span className="font-rajdhani text-[9px] text-muted-foreground">
                    {new Date(t.timestamp).toLocaleTimeString()}
                  </span>
                </div>
                <div className="text-right flex-shrink-0">
                  <div className="font-rajdhani text-[10px] text-muted-foreground">buy ${t.buy_price.toFixed(2)} · {t.markup_pct}%</div>
                  <div className="font-orbitron text-[10px] font-bold text-green-400">+${t.commission_usd.toFixed(4)}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Actions ──────────────────────────────────────────────────── */}
      <div className="flex items-center gap-3 flex-wrap">
        <button onClick={() => void load()} disabled={loading}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-rajdhani text-xs font-bold transition-all"
          style={{ background: "rgba(0,229,255,0.1)", border: "1px solid rgba(0,229,255,0.3)", color: "#00e5ff" }}>
          <RefreshCw size={11} className={loading ? "animate-spin" : ""} /> Refresh
        </button>
        {data.total_trades > 0 && (
          <button onClick={() => void clearCommissions()} disabled={clearing}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-rajdhani text-xs font-bold transition-all"
            style={{ background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.3)", color: "#ef4444" }}>
            <Trash2 size={11} /> {clearing ? "Clearing…" : "Clear Records"}
          </button>
        )}
        <span className="font-rajdhani text-[10px] text-muted-foreground ml-auto">
          Commission ≈ stake × markup% (4% default) · Resets on server restart
        </span>
      </div>
    </div>
  );
}

// ─── Appearance Panel ──────────────────────────────────────────────────────────
function AppearancePanel() {
  const { themeId, fontId, sizeId, setTheme, setFont, setSize } = useTheme();
  const [open, setOpen] = useState(true);

  return (
    <div className="cyber-card overflow-hidden">
      <button onClick={() => setOpen(p => !p)} className="w-full flex items-center justify-between p-4">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded-md flex items-center justify-center" style={{ background: "rgba(0,229,255,0.12)" }}>
            <span className="text-primary text-sm">🎨</span>
          </div>
          <div className="text-left">
            <div className="font-orbitron text-sm font-bold text-primary tracking-wider">APPEARANCE</div>
            <div className="font-rajdhani text-[10px] text-muted-foreground tracking-widest uppercase">Themes · Fonts · Size — visible to all users</div>
          </div>
        </div>
        <div className="text-muted-foreground">{open ? <ChevronUp size={14} /> : <ChevronDown size={14} />}</div>
      </button>

      {open && (
        <div className="px-4 pb-4 space-y-5 border-t" style={{ borderColor: "rgba(0,229,255,0.1)" }}>
          {/* Themes — 12 options */}
          <div className="pt-4">
            <div className="font-rajdhani text-[10px] text-muted-foreground tracking-widest uppercase mb-3">Theme ({THEMES.length} options)</div>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
              {THEMES.map((t) => (
                <button key={t.id} onClick={() => setTheme(t.id)}
                  className="relative flex items-center gap-2 p-2.5 rounded-xl text-left transition-all"
                  style={themeId === t.id
                    ? { background: `${t.preview}18`, border: `1.5px solid ${t.preview}60`, boxShadow: `0 0 12px ${t.preview}30` }
                    : { background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)" }}>
                  <div className="w-7 h-7 rounded-lg flex-shrink-0 flex items-center justify-center" style={{ background: `${t.preview}22`, border: `1.5px solid ${t.preview}50` }}>
                    <div className="w-3 h-3 rounded-full" style={{ background: t.preview, boxShadow: `0 0 6px ${t.preview}` }} />
                  </div>
                  <div className="min-w-0">
                    <div className="font-rajdhani text-xs font-bold truncate" style={{ color: themeId === t.id ? t.preview : "rgba(255,255,255,0.75)" }}>{t.name}</div>
                    <div className="font-rajdhani text-[9px] text-muted-foreground truncate">{t.description}</div>
                  </div>
                  {themeId === t.id && (
                    <div className="absolute top-1.5 right-1.5 w-1.5 h-1.5 rounded-full" style={{ background: t.preview }} />
                  )}
                </button>
              ))}
            </div>
          </div>

          {/* Fonts — 5 options */}
          <div>
            <div className="font-rajdhani text-[10px] text-muted-foreground tracking-widest uppercase mb-3">Font Style ({FONTS.length} options)</div>
            <div className="flex flex-wrap gap-2">
              {FONTS.map((f) => (
                <button key={f.id} onClick={() => setFont(f.id)}
                  className="px-3 py-2 rounded-xl transition-all"
                  style={fontId === f.id
                    ? { background: "rgba(0,229,255,0.15)", border: "1.5px solid rgba(0,229,255,0.5)", color: "#00e5ff" }
                    : { background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.1)", color: "rgba(255,255,255,0.6)" }}>
                  <div className="font-rajdhani text-xs font-bold">{f.name}</div>
                  <div className="font-rajdhani text-[9px] text-muted-foreground mt-0.5">{f.bodyFamily.split(",")[0].replace(/'/g, "")}</div>
                </button>
              ))}
            </div>
          </div>

          {/* Sizes — 5 options */}
          <div>
            <div className="font-rajdhani text-[10px] text-muted-foreground tracking-widest uppercase mb-3">Text Size ({SIZES.length} options)</div>
            <div className="flex flex-wrap gap-2">
              {SIZES.map((s) => (
                <button key={s.id} onClick={() => setSize(s.id)}
                  className="px-3 py-2 rounded-xl transition-all"
                  style={sizeId === s.id
                    ? { background: "rgba(0,229,255,0.15)", border: "1.5px solid rgba(0,229,255,0.5)", color: "#00e5ff" }
                    : { background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.1)", color: "rgba(255,255,255,0.6)" }}>
                  <div className="font-rajdhani text-xs font-bold">{s.name}</div>
                  <div className="font-rajdhani text-[9px] text-muted-foreground">×{s.scale}</div>
                </button>
              ))}
            </div>
          </div>

          {/* Preview */}
          <div className="rounded-xl p-3" style={{ background: "rgba(0,229,255,0.04)", border: "1px solid rgba(0,229,255,0.12)" }}>
            <div className="font-rajdhani text-[9px] text-muted-foreground tracking-widest uppercase mb-2">Live Preview</div>
            <div className="font-orbitron text-base font-bold text-primary">DIGIT KILLER</div>
            <div className="font-rajdhani text-xs text-muted-foreground mt-0.5">Signal · Analyse · Trade</div>
            <div className="font-rajdhani text-xs text-foreground mt-1">↑ Rise 94.2% · ↓ Fall 87.6% · Even 89.1%</div>
          </div>

          <div className="flex items-center gap-2 text-[10px] font-rajdhani text-muted-foreground">
            <span>💾</span> Preferences saved automatically to this device — no account needed.
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────
export default function SettingsPage() {
  const [token, setToken] = useState<string | null>(() => localStorage.getItem("admin_token"));
  const handleLogin = (t: string) => { localStorage.setItem("admin_token", t); setToken(t); };

  return (
    <div className="space-y-4 animate-fade-in-up max-w-5xl" data-testid="page-settings">
      <div>
        <h2 className="font-orbitron text-lg font-bold text-primary tracking-wider">ADMIN CONTROL PANEL</h2>
        <p className="font-rajdhani text-xs text-muted-foreground tracking-widest uppercase mt-0.5">
          System Health · Troubleshooting · Storage Policy · User Management
        </p>
      </div>
      <AppearancePanel />
      {!token ? <LoginForm onSuccess={handleLogin} /> : <AdminPanel />}
    </div>
  );
}
