import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { Loader, CheckCircle, XCircle, LogIn } from "lucide-react";
import logoPath from "@assets/WhatsApp_Image_2026-05-30_at_19.05.28_1780157146139.jpeg";

type Stage = "verifying" | "exchanging" | "success" | "error";

export default function DerivCallbackPage() {
  const [, setLocation] = useLocation();
  const [stage, setStage] = useState<Stage>("verifying");
  const [errorMsg, setErrorMsg] = useState("");

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const code  = params.get("code");
    const state = params.get("state");
    const error = params.get("error");

    if (error) {
      const desc = params.get("error_description") ?? error;
      setErrorMsg(decodeURIComponent(desc.replace(/\+/g, " ")));
      setStage("error");
      return;
    }

    if (!code || !state) {
      setErrorMsg("Missing authorization code or state parameter.");
      setStage("error");
      return;
    }

    const storedState    = sessionStorage.getItem("oauth_state");
    const codeVerifier   = sessionStorage.getItem("pkce_code_verifier");
    const redirectUri    = sessionStorage.getItem("oauth_redirect_uri");

    if (!storedState || state !== storedState) {
      setErrorMsg("State mismatch — possible CSRF attempt. Please try logging in again.");
      setStage("error");
      sessionStorage.removeItem("oauth_state");
      sessionStorage.removeItem("pkce_code_verifier");
      sessionStorage.removeItem("oauth_redirect_uri");
      return;
    }

    if (!codeVerifier || !redirectUri) {
      setErrorMsg("Missing PKCE verifier. Please try logging in again.");
      setStage("error");
      return;
    }

    sessionStorage.removeItem("oauth_state");
    sessionStorage.removeItem("pkce_code_verifier");
    sessionStorage.removeItem("oauth_redirect_uri");

    setStage("exchanging");

    fetch("/api/deriv/oauth/exchange", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code, code_verifier: codeVerifier, redirect_uri: redirectUri }),
    })
      .then(async (r) => {
        const data = await r.json() as Record<string, unknown>;
        if (!r.ok) {
          throw new Error(String(data.error ?? "Token exchange failed"));
        }
        const token = data.access_token as string;
        if (!token) throw new Error("No access token in response");
        localStorage.setItem("deriv_token", token);
        setStage("success");
        setTimeout(() => setLocation("/dashboard"), 1500);
      })
      .catch((err: unknown) => {
        const msg = err instanceof Error ? err.message : "Token exchange failed";
        setErrorMsg(msg);
        setStage("error");
      });
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

          {stage === "exchanging" && (
            <>
              <Loader size={32} className="animate-spin text-primary" />
              <div>
                <div className="font-orbitron text-sm font-bold text-primary tracking-wider">CONNECTING</div>
                <div className="font-rajdhani text-xs text-muted-foreground mt-1">Exchanging token with Deriv…</div>
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
