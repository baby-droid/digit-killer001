import { useState } from "react";
import { useLocation } from "wouter";
import { useUserLogin, useAdminLogin } from "@workspace/api-client-react";
import { Eye, EyeOff, Shield, User } from "lucide-react";
import logoPath from "@assets/WhatsApp_Image_2026-05-30_at_19.05.28_1780157146139.jpeg";

export default function LoginPage() {
  const [, setLocation] = useLocation();
  const [mode, setMode] = useState<"admin" | "user">("admin");
  const [pin, setPin] = useState("");
  const [userId, setUserId] = useState("");
  const [password, setPassword] = useState("");
  const [showPin, setShowPin] = useState(false);
  const [showPw, setShowPw] = useState(false);
  const [error, setError] = useState("");

  const adminLogin = useAdminLogin();
  const userLogin = useUserLogin();

  const handleAuth = (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (mode === "admin") {
      adminLogin.mutate(
        { data: { password: pin } },
        {
          onSuccess: (res) => {
            const r = res as { token: string };
            localStorage.setItem("admin_token", r.token);
            setLocation("/settings");
          },
          onError: () => setError("Invalid admin PIN"),
        }
      );
    } else {
      userLogin.mutate(
        { data: { user_id: userId, password } },
        {
          onSuccess: (res) => {
            const r = res as { token: string; user_id: string };
            localStorage.setItem("user_token", r.token);
            localStorage.setItem("user_id", r.user_id);
            setLocation("/dashboard");
          },
          onError: () => setError("Invalid user ID or password"),
        }
      );
    }
  };

  const isPending = adminLogin.isPending || userLogin.isPending;

  return (
    <div
      className="min-h-screen flex flex-col items-center justify-center relative overflow-hidden"
      style={{ background: "#050a0f" }}
      data-testid="page-login"
    >
      {/* Animated grid bg */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          backgroundImage:
            "linear-gradient(rgba(0,229,255,0.06) 1px, transparent 1px), linear-gradient(90deg, rgba(0,229,255,0.06) 1px, transparent 1px)",
          backgroundSize: "48px 48px",
        }}
      />
      {/* Glow blobs */}
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-96 h-96 rounded-full pointer-events-none"
        style={{ background: "radial-gradient(circle, rgba(0,229,255,0.08) 0%, transparent 70%)" }} />

      <div className="relative z-10 w-full max-w-[340px] px-4 flex flex-col items-center gap-6">
        {/* Logo */}
        <div className="relative flex flex-col items-center gap-3">
          <div className="relative">
            <div
              className="absolute -inset-2 rounded-full animate-spin-slow"
              style={{
                background: "conic-gradient(from 0deg, transparent 60%, rgba(0,229,255,0.5) 80%, transparent 100%)",
              }}
            />
            <img
              src={logoPath}
              alt="Digit Killer"
              className="w-20 h-20 rounded-full object-cover relative z-10 border-2"
              style={{ borderColor: "rgba(0,229,255,0.4)", boxShadow: "0 0 32px rgba(0,229,255,0.25)" }}
            />
          </div>
          <div className="text-center">
            <div
              className="font-orbitron text-2xl font-black tracking-[0.3em]"
              style={{ color: "#00e5ff", textShadow: "0 0 20px rgba(0,229,255,0.5)" }}
            >
              DIGIT KILLER
            </div>
            <div className="font-rajdhani text-xs tracking-[0.25em] mt-1" style={{ color: "rgba(0,229,255,0.6)" }}>
              AHMED SYNTRADER · AI SYSTEM
            </div>
          </div>
        </div>

        {/* Mode toggle */}
        <div
          className="flex rounded-lg w-full overflow-hidden"
          style={{ border: "1px solid rgba(0,229,255,0.2)", background: "rgba(0,229,255,0.04)" }}
        >
          {(["admin", "user"] as const).map((m) => (
            <button
              key={m}
              onClick={() => { setMode(m); setError(""); }}
              className="flex-1 flex items-center justify-center gap-2 py-2.5 font-orbitron text-xs font-bold tracking-widest transition-all"
              style={
                mode === m
                  ? { background: "#00e5ff", color: "#050a0f" }
                  : { color: "rgba(0,229,255,0.6)" }
              }
            >
              {m === "admin" ? <Shield size={13} /> : <User size={13} />}
              {m.toUpperCase()}
            </button>
          ))}
        </div>

        {/* Form */}
        <form onSubmit={handleAuth} className="w-full space-y-4">
          {mode === "admin" ? (
            <div>
              <label
                className="block font-rajdhani text-[11px] tracking-[0.2em] uppercase mb-2"
                style={{ color: "rgba(0,229,255,0.5)" }}
              >
                Admin PIN
              </label>
              <div className="relative">
                <input
                  type={showPin ? "text" : "password"}
                  value={pin}
                  onChange={(e) => setPin(e.target.value)}
                  placeholder="Enter PIN..."
                  autoComplete="new-password"
                  className="w-full pr-10 px-4 py-3 rounded-lg font-orbitron text-sm tracking-widest focus:outline-none transition-all"
                  style={{
                    background: "rgba(0,229,255,0.06)",
                    border: "1px solid rgba(0,229,255,0.2)",
                    color: "#fff",
                    caretColor: "#00e5ff",
                  }}
                  data-testid="input-admin-pin"
                />
                <button
                  type="button"
                  onClick={() => setShowPin(!showPin)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-primary transition-colors"
                >
                  {showPin ? <EyeOff size={15} /> : <Eye size={15} />}
                </button>
              </div>
            </div>
          ) : (
            <>
              <div>
                <label className="block font-rajdhani text-[11px] tracking-[0.2em] uppercase mb-2" style={{ color: "rgba(0,229,255,0.5)" }}>
                  User ID
                </label>
                <input
                  type="text"
                  value={userId}
                  onChange={(e) => setUserId(e.target.value)}
                  placeholder="e.g. DK1A2B3C"
                  className="w-full px-4 py-3 rounded-lg font-orbitron text-sm tracking-widest focus:outline-none"
                  style={{ background: "rgba(0,229,255,0.06)", border: "1px solid rgba(0,229,255,0.2)", color: "#fff", caretColor: "#00e5ff" }}
                  data-testid="input-user-id"
                />
              </div>
              <div>
                <label className="block font-rajdhani text-[11px] tracking-[0.2em] uppercase mb-2" style={{ color: "rgba(0,229,255,0.5)" }}>
                  Password
                </label>
                <div className="relative">
                  <input
                    type={showPw ? "text" : "password"}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Access password"
                    autoComplete="new-password"
                    className="w-full pr-10 px-4 py-3 rounded-lg font-orbitron text-sm tracking-widest focus:outline-none"
                    style={{ background: "rgba(0,229,255,0.06)", border: "1px solid rgba(0,229,255,0.2)", color: "#fff", caretColor: "#00e5ff" }}
                    data-testid="input-password"
                  />
                  <button type="button" onClick={() => setShowPw(!showPw)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-primary transition-colors">
                    {showPw ? <EyeOff size={15} /> : <Eye size={15} />}
                  </button>
                </div>
              </div>
            </>
          )}

          {error && (
            <div className="text-xs font-rajdhani text-red-400 tracking-wide">{error}</div>
          )}

          <button
            type="submit"
            disabled={isPending || (mode === "admin" ? !pin : !userId || !password)}
            className="w-full py-3 rounded-lg font-orbitron text-sm font-bold tracking-[0.2em] flex items-center justify-center gap-2 transition-all disabled:opacity-40"
            style={{ background: "#00e5ff", color: "#050a0f", boxShadow: "0 0 20px rgba(0,229,255,0.25)" }}
            data-testid="button-authenticate"
          >
            <Shield size={14} />
            {isPending ? "VERIFYING..." : "AUTHENTICATE"}
          </button>
        </form>

        <div className="font-rajdhani text-[10px] tracking-widest text-center" style={{ color: "rgba(0,229,255,0.3)" }}>
          AHMED AI v2.1.0 · SECURE ACCESS ONLY
        </div>
      </div>
    </div>
  );
}
