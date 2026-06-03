import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { Loader, CheckCircle, XCircle, LogIn } from "lucide-react";
import logoPath from "@assets/WhatsApp_Image_2026-05-30_at_19.05.28_1780157146139.jpeg";

type Stage = "verifying" | "success" | "error";

interface AccountEntry {
  id: string;
  type: string;
  currency: string;
  loginid?: string;
}

interface AccountsResponse {
  data?: AccountEntry[];
  accounts?: AccountEntry[];
}

export default function DerivCallbackPage() {
  const [, setLocation] = useLocation();
  const [stage, setStage] = useState<Stage>("verifying");
  const [errorMsg, setErrorMsg] = useState("");
  const [statusMsg, setStatusMsg] = useState("Completing Deriv login…");

  useEffect(() => {
    void handleCallback();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleCallback() {
    const params = new URLSearchParams(window.location.search);
    const error = params.get("error");

    if (error) {
      const desc = params.get("error_description") ?? error;
      setErrorMsg(decodeURIComponent(desc.replace(/\+/g, " ")));
      setStage("error");
      return;
    }

    // ── PKCE OAuth 2.0 flow ──────────────────────────────────────────────────
    // auth.deriv.com returns: ?code=...&state=...
    // The Bearer access_token is NOT usable for the legacy WS authorize call.
    // We need to: exchange code → access_token → accounts list → OTP WS URL.
    const code = params.get("code");
    const returnedState = params.get("state");

    if (code && returnedState) {
      const savedState   = sessionStorage.getItem("oauth_state");
      const codeVerifier = sessionStorage.getItem("pkce_verifier");

      if (!savedState || returnedState !== savedState) {
        setErrorMsg("Security check failed (state mismatch). Please try again.");
        setStage("error");
        return;
      }

      if (!codeVerifier) {
        setErrorMsg("PKCE verifier missing. Please start the login flow again.");
        setStage("error");
        return;
      }

      try {
        // Step 1: Exchange authorization code for Bearer access_token
        setStatusMsg("Exchanging authorization code…");
        const redirectUri = `${window.location.origin}/callback`;
        const exchResp = await fetch("/api/deriv/oauth/exchange", {
          method:  "POST",
          headers: { "Content-Type": "application/json" },
          body:    JSON.stringify({ code, code_verifier: codeVerifier, redirect_uri: redirectUri }),
        });
        const exchData = await exchResp.json() as Record<string, unknown>;

        if (!exchResp.ok || !exchData.access_token) {
          const msg = String(exchData.error ?? "Token exchange failed. Please try again.");
          setErrorMsg(msg);
          setStage("error");
          return;
        }

        const accessToken = String(exchData.access_token);
        sessionStorage.removeItem("pkce_verifier");
        sessionStorage.removeItem("oauth_state");

        // Step 2: Get the accounts list from Deriv REST API
        setStatusMsg("Fetching account details…");
        let accountId  = "";
        let accountCurrency = "USD";
        let accountVirtual  = false;
        let accountLoginid  = "";

        try {
          const acctResp = await fetch("/api/deriv/oauth/accounts", {
            headers: { Authorization: `Bearer ${accessToken}` },
          });
          if (acctResp.ok) {
            const acctData = await acctResp.json() as AccountsResponse;
            const accounts = acctData.data ?? acctData.accounts ?? [];
            // Prefer first real account; fallback to demo
            const realAcct = accounts.find((a) => a.type === "real") ?? accounts[0];
            if (realAcct) {
              accountId       = realAcct.id ?? realAcct.loginid ?? "";
              accountCurrency = realAcct.currency ?? "USD";
              accountVirtual  = realAcct.type === "demo" || realAcct.type === "virtual";
              accountLoginid  = realAcct.loginid ?? realAcct.id ?? "";
            }
          }
        } catch {
          // Accounts fetch failed — continue without account info
        }

        // Step 3: Store Bearer token and account info for reconnect
        // NOTE: stored separately from deriv_token (legacy trading token) to avoid
        // DerivContext trying to use a Bearer token with the legacy WS authorize call.
        localStorage.setItem("deriv_access_token",   accessToken);
        if (accountId)       localStorage.setItem("deriv_otp_account_id",    accountId);
        if (accountLoginid)  localStorage.setItem("deriv_otp_loginid",       accountLoginid);
        if (accountCurrency) localStorage.setItem("deriv_otp_currency",      accountCurrency);
        localStorage.setItem("deriv_otp_virtual", accountVirtual ? "1" : "0");
        // Clear any stale legacy token so DerivContext uses the new API path
        localStorage.removeItem("deriv_token");

        setStage("success");
        setStatusMsg("Redirecting to dashboard…");
        setTimeout(() => setLocation("/dashboard"), 1200);
        return;
      } catch (e) {
        setErrorMsg(e instanceof Error ? e.message : "Network error during login. Please try again.");
        setStage("error");
        return;
      }
    }

    // ── Legacy OAuth flow ────────────────────────────────────────────────────
    // oauth.deriv.com returns: ?token1=TRADING_TOKEN&loginid1=CR123456[&token2=...&loginid2=...]
    // The token here IS a direct WS trading token compatible with authorize.
    let chosenToken: string | null = null;
    let foundReal = false;
    // Collect ALL tokens for account switching (don't break early)
    const tokenMap: Record<string, string> = {};

    for (let i = 1; i <= 10; i++) {
      const token   = params.get(`token${i}`);
      const loginid = params.get(`loginid${i}`) ?? params.get(`acct${i}`);
      if (token) {
        if (!chosenToken) chosenToken = token;
        if (loginid) tokenMap[loginid] = token;
        // Prefer first real (non-VR) account as the primary token
        if (loginid && !loginid.startsWith("VR") && !foundReal) {
          chosenToken = token;
          foundReal = true;
          // Do NOT break — continue collecting remaining tokens for account switching
        }
      }
    }
    // Fallback: plain ?token= param
    if (!chosenToken) chosenToken = params.get("token");

    if (chosenToken) {
      // Clear any previous new-API credentials to avoid confusion
      localStorage.removeItem("deriv_access_token");
      localStorage.removeItem("deriv_otp_account_id");
      localStorage.removeItem("deriv_otp_loginid");
      localStorage.removeItem("deriv_otp_currency");
      localStorage.removeItem("deriv_otp_virtual");

      // Store token map so DerivContext can switch between accounts
      if (Object.keys(tokenMap).length > 0) {
        localStorage.setItem("deriv_token_map", JSON.stringify(tokenMap));
      }

      localStorage.setItem("deriv_token", chosenToken);
      setStage("success");
      setTimeout(() => setLocation("/dashboard"), 1200);
      return;
    }

    setErrorMsg("No token received from Deriv. Please try again.");
    setStage("error");
  }

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
                <div className="font-orbitron text-sm font-bold text-primary tracking-wider">PROCESSING</div>
                <div className="font-rajdhani text-xs text-muted-foreground mt-1">{statusMsg}</div>
              </div>
            </>
          )}

          {stage === "success" && (
            <>
              <CheckCircle size={32} className="text-green-400" style={{ filter: "drop-shadow(0 0 8px #22c55e)" }} />
              <div>
                <div className="font-orbitron text-sm font-bold tracking-wider" style={{ color: "#22c55e" }}>AUTHENTICATED</div>
                <div className="font-rajdhani text-xs text-muted-foreground mt-1">{statusMsg}</div>
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
                onClick={() => setLocation("/dashboard")}
                className="flex items-center gap-2 px-5 py-2.5 rounded-lg font-orbitron text-xs font-bold tracking-wider transition-all"
                style={{ background: "#00e5ff", color: "#050a0f" }}
              >
                <LogIn size={13} />
                Back to Dashboard
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
