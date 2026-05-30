import { useState } from "react";
import { useLocation } from "wouter";
import { useUserLogin } from "@workspace/api-client-react";
import { LogIn, AlertCircle } from "lucide-react";
import logoPath from "@assets/WhatsApp_Image_2026-05-30_at_19.05.28_1780157146139.jpeg";

export default function LoginPage() {
  const [, setLocation] = useLocation();
  const [userId, setUserId] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");

  const userLogin = useUserLogin();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
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
  };

  return (
    <div
      className="min-h-screen flex items-center justify-center bg-background relative"
      data-testid="page-login"
    >
      {/* Grid bg */}
      <div
        className="absolute inset-0 opacity-5 pointer-events-none"
        style={{
          backgroundImage:
            "linear-gradient(rgba(0,229,255,0.5) 1px, transparent 1px), linear-gradient(90deg, rgba(0,229,255,0.5) 1px, transparent 1px)",
          backgroundSize: "60px 60px",
        }}
      />

      <div className="relative z-10 w-full max-w-sm px-4">
        <div className="cyber-card p-8 flex flex-col items-center gap-6">
          {/* Logo */}
          <div className="relative">
            <div
              className="absolute inset-0 rounded-full animate-spin-slow opacity-50"
              style={{
                background:
                  "conic-gradient(from 0deg, transparent 70%, rgba(0,229,255,0.6) 85%, transparent 100%)",
              }}
            />
            <img
              src={logoPath}
              alt="Digit Killer"
              className="w-20 h-20 rounded-full object-cover relative z-10 border-2 border-primary/30"
              style={{ boxShadow: "0 0 20px rgba(0,229,255,0.3)" }}
              data-testid="img-login-logo"
            />
          </div>

          {/* Title */}
          <div className="text-center">
            <div className="font-orbitron text-xl font-black text-primary tracking-widest">
              DIGIT KILLER
            </div>
            <div className="font-rajdhani text-xs text-muted-foreground tracking-[0.3em] mt-1">
              USER ACCESS PORTAL
            </div>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="w-full space-y-4">
            <div>
              <label className="block font-rajdhani text-[10px] text-muted-foreground tracking-widest uppercase mb-1.5">
                User ID
              </label>
              <input
                type="text"
                value={userId}
                onChange={(e) => setUserId(e.target.value)}
                placeholder="e.g. DK1A2B3C"
                className="w-full bg-muted/40 border border-border/60 rounded-md px-4 py-2.5 text-sm font-orbitron text-foreground placeholder-muted-foreground focus:outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/20 tracking-widest"
                data-testid="input-user-id"
              />
            </div>

            <div>
              <label className="block font-rajdhani text-[10px] text-muted-foreground tracking-widest uppercase mb-1.5">
                Password
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Your access password"
                className="w-full bg-muted/40 border border-border/60 rounded-md px-4 py-2.5 text-sm font-rajdhani text-foreground placeholder-muted-foreground focus:outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/20"
                data-testid="input-password"
              />
            </div>

            {error && (
              <div className="flex items-center gap-2 text-destructive text-xs font-rajdhani">
                <AlertCircle size={12} />
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={userLogin.isPending || !userId || !password}
              className="w-full py-3 rounded-md font-orbitron text-sm font-bold tracking-widest bg-primary/10 border border-primary/30 text-primary hover:bg-primary/20 transition-all disabled:opacity-50 flex items-center justify-center gap-2"
              data-testid="button-login"
            >
              <LogIn size={14} />
              {userLogin.isPending ? "VERIFYING..." : "ACCESS SYSTEM"}
            </button>
          </form>

          {/* Divider */}
          <div className="w-full border-t border-border/50 pt-4 text-center">
            <p className="font-rajdhani text-[10px] text-muted-foreground tracking-widest">
              Contact admin for access credentials
            </p>
            <p className="font-rajdhani text-[9px] text-muted-foreground/50 tracking-widest mt-1">
              AHMEDSYNTRADER.SITE
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
