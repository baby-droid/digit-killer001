import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { Loader, CheckCircle, XCircle, LogIn } from "lucide-react";
import logoPath from "@assets/WhatsApp_Image_2026-05-30_at_19.05.28_1780157146139.jpeg";

type Stage = "verifying" | "success" | "error";

export default function DerivCallbackPage() {
  const [, setLocation] = useLocation();
  const [stage, setStage] = useState<Stage>("verifying");
  const [errorMsg, setErrorMsg] = useState("");

  useEffect(() => {
    // Deriv OAuth (oauth.deriv.com) returns tokens directly as URL params:
    // ?token1=TOKEN&loginid1=LOGINID&acct1=LOGINID&cur1=USD (may have multiple accounts)
    const params = new URLSearchParams(window.location.search);
    const error  = params.get("error");

    if (error) {
      const desc = params.get("error_description") ?? error;
      setErrorMsg(decodeURIComponent(desc.replace(/\+/g, " ")));
      setStage("error");
      return;
    }

    // Pick the first non-demo token (or fall back to the first available)
    let chosenToken: string | null = null;
    for (let i = 1; i <= 10; i++) {
      const token   = params.get(`token${i}`);
      const loginid = params.get(`loginid${i}`) ?? params.get(`acct${i}`);
      if (token) {
        // Prefer real accounts (loginid not starting with VR)
        if (!chosenToken) chosenToken = token;
        if (loginid && !loginid.startsWith("VR")) {
          chosenToken = token;
          break;
        }
      }
    }

    // Also handle plain ?token=... format
    if (!chosenToken) chosenToken = params.get("token");

    if (!chosenToken) {
      setErrorMsg("No token received from Deriv. Please try again.");
      setStage("error");
      return;
    }

    localStorage.setItem("deriv_token", chosenToken);
    setStage("success");
    setTimeout(() => setLocation("/dashboard"), 1500);
  }, []);

  return (
    <div
      className="min-h-screen flex flex-col items-center justify-center relative overflow-hidden"
      style={{ background: "#050a0f" }}
    >
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          backgroundImage:
            "linear-gradient(rgba(0,229,255,0.05) 1px, transparent 1px), linear-gradient(90deg, rgba(0,229,255,0.05) 1px, transparent 1px)",
          backgroundSize: "48px 48px",
        }}
      />
      <div className="relative z-10 w-full max-w-sm px-6 flex flex-col items-center gap-8">
        <div className="relative">
          <div
            className="absolute -inset-2 rounded-full animate-spin-slow"
            style={{ background: "conic-gradient(from 0deg, transparent 60%, rgba(0,229,255,0.5) 80%, transparent 100%)" }}
          />
          <img
            src={logoPath}
            alt="Digit Killer"
            className="w-20 h-20 rounded-full object-cover relative z-10 border-2"
            style={{ borderColor: "rgba(0,229,255,0.4)", boxShadow: "0 0 32px rgba(0,229,255,0.25)" }}
          />
        </div>

        <div
          className="w-full rounded-xl p-6 flex flex-col items-center gap-4 text-center border"
          style={{ background: "rgba(0,229,255,0.04)", borderColor: "rgba(0,229,255,0.2)" }}
        >
          {stage === "verifying" && (
            <>
              <Loader size={32} className="animate-spin text-primary" />
              <div>
                <div className="font-orbitron text-sm font-bold text-primary tracking-wider">VERIFYING</div>
                <div className="font-rajdhani text-xs text-muted-foreground mt-1">Checking authorization…</div>
              </div>
            </>
          )}

          {stage === "success" && (
            <>
              <CheckCircle size={32} className="text-green-400" style={{ filter: "drop-shadow(0 0 8px #22c55e)" }} />
              <div>
                <div className="font-orbitron text-sm font-bold tracking-wider" style={{ color: "#22c55e" }}>AUTHENTICATED</div>
                <div className="font-rajdhani text-xs text-muted-foreground mt-1">Redirecting to dashboard…</div>
              </div>
            </>
          )}

          {stage === "error" && (
            <>
              <XCircle size={32} className="text-red-400" style={{ filter: "drop-shadow(0 0 8px #ef4444)" }} />
              <div>
                <div className="font-orbitron text-sm font-bold text-red-400 tracking-wider">AUTH FAILED</div>
                <div className="font-rajdhani text-xs text-red-300 mt-2 leading-relaxed">{errorMsg}</div>
              </div>
              <button
                onClick={() => setLocation("/login")}
                className="flex items-center gap-2 px-5 py-2.5 rounded-lg font-orbitron text-xs font-bold tracking-wider transition-all"
                style={{ background: "#00e5ff", color: "#050a0f" }}
              >
                <LogIn size={13} />
                Try Again
              </button>
            </>
          )}
        </div>

        <div className="font-rajdhani text-[10px] tracking-widest text-center" style={{ color: "rgba(0,229,255,0.3)" }}>
          DIGIT KILLER · AHMED SYNTRADER
        </div>
      </div>
    </div>
  );
}
