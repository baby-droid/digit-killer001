import { useState } from "react";
import { useLocation } from "wouter";
import { useUserLogin, useAdminLogin } from "@workspace/api-client-react";
import { Eye, EyeOff, Shield, User, Mail, KeyRound, ChevronRight } from "lucide-react";
import logoPath from "@assets/WhatsApp_Image_2026-05-30_at_19.05.28_1780157146139.jpeg";

export default function LoginPage() {
  const [, setLocation] = useLocation();
  const [mode, setMode] = useState<"user" | "admin">("user");
  const [email, setEmail]     = useState("");
  const [userId, setUserId]   = useState("");
  const [password, setPassword] = useState("");
  const [pin, setPin]         = useState("");
  const [showPw, setShowPw]   = useState(false);
  const [showPin, setShowPin] = useState(false);
  const [error, setError]     = useState("");

  const adminLogin = useAdminLogin();
  const userLogin  = useUserLogin();

  const handleAuth = (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (mode === "admin") {
      adminLogin.mutate(
        { data: { password: pin } },
        {
          onSuccess: (res: unknown) => {
            const r = res as { token: string };
            localStorage.setItem("admin_token", r.token);
            setLocation("/settings");
          },
          onError: () => setError("Incorrect admin PIN — try again"),
        }
      );
    } else {
      // Support both email (as identifier) and direct user ID
      const identifier = email.trim() || userId.trim();
      userLogin.mutate(
        { data: { user_id: identifier, password } },
        {
          onSuccess: (res: unknown) => {
            const r = res as { token: string; user_id: string };
            localStorage.setItem("user_token", r.token);
            localStorage.setItem("user_id", r.user_id);
            setLocation("/dashboard");
          },
          onError: () => setError("Email or password is incorrect"),
        }
      );
    }
  };

  const isPending = adminLogin.isPending || userLogin.isPending;
  const canSubmit = mode === "admin"
    ? !!pin
    : !!(email.trim() || userId.trim()) && !!password;

  return (
    <div
      className="min-h-screen flex flex-col items-center justify-center relative overflow-hidden"
      style={{ background: "#050a0f" }}
      data-testid="page-login"
    >
      {/* Grid background */}
      <div className="absolute inset-0 pointer-events-none"
        style={{
          backgroundImage:
            "linear-gradient(rgba(0,229,255,0.05) 1px, transparent 1px), linear-gradient(90deg, rgba(0,229,255,0.05) 1px, transparent 1px)",
          backgroundSize: "52px 52px",
        }}
      />
      {/* Ambient glow */}
      <div className="absolute top-1/3 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[480px] h-[480px] rounded-full pointer-events-none"
        style={{ background: "radial-gradient(circle, rgba(0,229,255,0.07) 0%, transparent 70%)" }} />
      <div className="absolute bottom-0 right-0 w-64 h-64 rounded-full pointer-events-none"
        style={{ background: "radial-gradient(circle, rgba(139,92,246,0.07) 0%, transparent 70%)" }} />

      <div className="relative z-10 w-full max-w-[360px] px-5 flex flex-col items-center gap-7">

        {/* ── Brand ─────────────────────────────────────────────────────── */}
        <div className="flex flex-col items-center gap-3">
          <div className="relative">
            <div className="absolute -inset-2 rounded-full animate-spin-slow"
              style={{ background: "conic-gradient(from 0deg, transparent 65%, rgba(0,229,255,0.55) 82%, transparent 100%)" }} />
            <img src={logoPath} alt="Digit Killer"
              className="w-20 h-20 rounded-full object-cover relative z-10 border-2"
              style={{ borderColor: "rgba(0,229,255,0.45)", boxShadow: "0 0 28px rgba(0,229,255,0.22)" }}
            />
          </div>
          <div className="text-center">
            <div className="font-orbitron text-2xl font-black tracking-[0.28em]"
              style={{ color: "#00e5ff", textShadow: "0 0 22px rgba(0,229,255,0.45)" }}>
              DIGIT KILLER
            </div>
            <div className="font-rajdhani text-[11px] tracking-[0.22em] mt-0.5" style={{ color: "rgba(0,229,255,0.55)" }}>
              AHMED SYNTRADER · AI SYSTEM
            </div>
          </div>
        </div>

        {/* ── Login card ────────────────────────────────────────────────── */}
        <div className="w-full rounded-2xl overflow-hidden"
          style={{ background: "rgba(0,0,0,0.5)", border: "1px solid rgba(0,229,255,0.15)", backdropFilter: "blur(12px)" }}>

          {/* Tab strip */}
          <div className="flex border-b" style={{ borderColor: "rgba(0,229,255,0.12)" }}>
            {([
              { id: "user" as const,  label: "Sign In",   icon: <User size={12} /> },
              { id: "admin" as const, label: "Admin",     icon: <Shield size={12} /> },
            ]).map((m) => (
              <button key={m.id} onClick={() => { setMode(m.id); setError(""); }}
                className="flex-1 flex items-center justify-center gap-1.5 py-3 font-orbitron text-[10px] font-bold tracking-widest transition-all"
                style={mode === m.id
                  ? { color: "#00e5ff", borderBottom: "2px solid #00e5ff" }
                  : { color: "rgba(0,229,255,0.4)" }}>
                {m.icon} {m.label}
              </button>
            ))}
          </div>

          <div className="p-5">
            <form onSubmit={handleAuth} className="space-y-4">

              {mode === "user" ? (
                <>
                  {/* Email field (Deriv-style) */}
                  <div>
                    <label className="block font-rajdhani text-[10px] tracking-[0.22em] uppercase mb-1.5"
                      style={{ color: "rgba(0,229,255,0.5)" }}>
                      Email or Access ID
                    </label>
                    <div className="relative">
                      <Mail size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                      <input
                        type="text"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        placeholder="your@email.com or DK1A2B3C"
                        autoComplete="username"
                        className="w-full pl-9 pr-4 py-3 rounded-lg font-rajdhani text-sm focus:outline-none transition-all"
                        style={{
                          background: "rgba(0,229,255,0.05)",
                          border: "1px solid rgba(0,229,255,0.18)",
                          color: "#fff", caretColor: "#00e5ff",
                        }}
                        data-testid="input-email"
                      />
                    </div>
                  </div>

                  {/* Password field */}
                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <label className="font-rajdhani text-[10px] tracking-[0.22em] uppercase"
                        style={{ color: "rgba(0,229,255,0.5)" }}>
                        Password
                      </label>
                    </div>
                    <div className="relative">
                      <KeyRound size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                      <input
                        type={showPw ? "text" : "password"}
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder="Enter your password"
                        autoComplete="current-password"
                        className="w-full pl-9 pr-10 py-3 rounded-lg font-rajdhani text-sm focus:outline-none transition-all"
                        style={{
                          background: "rgba(0,229,255,0.05)",
                          border: "1px solid rgba(0,229,255,0.18)",
                          color: "#fff", caretColor: "#00e5ff",
                        }}
                        data-testid="input-password"
                      />
                      <button type="button" onClick={() => setShowPw(!showPw)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-primary transition-colors">
                        {showPw ? <EyeOff size={14} /> : <Eye size={14} />}
                      </button>
                    </div>
                  </div>
                </>
              ) : (
                /* Admin PIN */
                <div>
                  <label className="block font-rajdhani text-[10px] tracking-[0.22em] uppercase mb-1.5"
                    style={{ color: "rgba(0,229,255,0.5)" }}>
                    Admin PIN
                  </label>
                  <div className="relative">
                    <Shield size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                    <input
                      type={showPin ? "text" : "password"}
                      value={pin}
                      onChange={(e) => setPin(e.target.value)}
                      placeholder="Enter admin PIN"
                      autoComplete="off"
                      className="w-full pl-9 pr-10 py-3 rounded-lg font-orbitron text-sm tracking-widest focus:outline-none"
                      style={{
                        background: "rgba(0,229,255,0.05)",
                        border: "1px solid rgba(0,229,255,0.18)",
                        color: "#fff", caretColor: "#00e5ff",
                      }}
                      data-testid="input-admin-pin"
                    />
                    <button type="button" onClick={() => setShowPin(!showPin)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-primary transition-colors">
                      {showPin ? <EyeOff size={14} /> : <Eye size={14} />}
                    </button>
                  </div>
                </div>
              )}

              {/* Error */}
              {error && (
                <div className="flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-rajdhani text-red-400"
                  style={{ background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.25)" }}>
                  <span>⚠</span> {error}
                </div>
              )}

              {/* Submit */}
              <button
                type="submit"
                disabled={isPending || !canSubmit}
                className="w-full py-3 rounded-lg font-orbitron text-sm font-bold tracking-[0.18em] flex items-center justify-center gap-2 transition-all disabled:opacity-40"
                style={{ background: isPending ? "rgba(0,229,255,0.5)" : "#00e5ff", color: "#050a0f", boxShadow: "0 0 20px rgba(0,229,255,0.2)" }}
                data-testid="button-authenticate"
              >
                {isPending ? (
                  <span className="inline-block w-4 h-4 rounded-full border-2 border-current border-t-transparent animate-spin" />
                ) : (
                  <ChevronRight size={16} />
                )}
                {isPending ? "AUTHENTICATING…" : mode === "admin" ? "ADMIN ACCESS" : "SIGN IN"}
              </button>
            </form>
          </div>
        </div>

        <div className="font-rajdhani text-[10px] tracking-widest text-center" style={{ color: "rgba(0,229,255,0.3)" }}>
          SECURE ACCESS · DIGIT KILLER v2.1
        </div>
      </div>
    </div>
  );
}
