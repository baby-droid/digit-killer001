/**
 * Global Deriv WebSocket Context
 * Provides a single, shared WS connection across all pages.
 * All trading components use this context instead of maintaining their own sockets.
 *
 * Supports two auth paths:
 *   1. Legacy trading token (from oauth.deriv.com) — sent as {type:"auth",token} to ws-proxy.
 *      Proxy connects to legacy binaryws.com and sends authorize. authorize response populates
 *      account info directly.
 *
 *   2. New API OTP (from auth.deriv.com PKCE + REST OTP endpoint) — sent as
 *      {type:"otp_connect",otp_url} to ws-proxy. Connection is pre-authenticated; account info
 *      is read from localStorage (populated by DerivCallbackPage during PKCE flow).
 *
 * Auto-reconnect: on unexpected WS close (code ≠ 1000/1001) the client automatically
 * re-opens the socket using the last auth payload with exponential back-off (1s → 30s).
 * The back-off cycles indefinitely so the connection is always restored.
 */
import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";

// ─── Types ────────────────────────────────────────────────────────────────────
export interface DerivAccount {
  loginid:    string;
  currency:   string;
  balance:    number;
  is_virtual: boolean;
}

export interface DerivAccountListItem {
  loginid:      string;
  currency:     string;
  is_virtual:   number;
  account_type?: string;
  token?:       string;
}

export type ConnectionStatus = "disconnected" | "connecting" | "authorizing" | "connected";

type Listener = (msg: Record<string, unknown>) => void;

interface DerivContextValue {
  status:      ConnectionStatus;
  account:     DerivAccount | null;
  accountList: DerivAccountListItem[];
  balance:     number | null;
  error:       string | null;
  /** Connect using a legacy trading token (from oauth.deriv.com or API token page) */
  connect:     (token: string) => void;
  /** Connect using a Bearer access_token (new PKCE OAuth) — fetches OTP internally */
  connectOtp:  () => Promise<void>;
  /** One-click connect using the platform's built-in legacy token */
  connectLegacy: () => Promise<void>;
  disconnect:  () => void;
  switchAccount: (item: DerivAccountListItem) => void;
  topupDemo:   () => Promise<Record<string, unknown>>;
  /** Fire-and-forget — does NOT track responses */
  send:        (msg: Record<string, unknown>) => void;
  /** Returns a promise that resolves with the Deriv response */
  request:     (msg: Record<string, unknown>) => Promise<Record<string, unknown>>;
  /** Subscribe to a particular msg_type. Returns unsubscribe fn. */
  subscribe:   (msgType: string, cb: Listener) => () => void;
}

// ─── Context ──────────────────────────────────────────────────────────────────
const DerivContext = createContext<DerivContextValue | null>(null);

export function useDerivContext(): DerivContextValue {
  const ctx = useContext(DerivContext);
  if (!ctx) throw new Error("useDerivContext must be used inside <DerivProvider>");
  return ctx;
}

// ─── Proxy URL ────────────────────────────────────────────────────────────────
function proxyUrl(): string {
  const proto = location.protocol === "https:" ? "wss" : "ws";
  return `${proto}://${location.host}/ws/deriv`;
}

// ─── Provider ─────────────────────────────────────────────────────────────────
export function DerivProvider({ children }: { children: React.ReactNode }) {
  const ws             = useRef<WebSocket | null>(null);
  const reqIdRef       = useRef(2);
  const listeners      = useRef<Map<number, Listener>>(new Map());
  const typeListeners  = useRef<Map<string, Set<Listener>>>(new Map());
  const tokenRef       = useRef<string>("");
  const isOtpModeRef   = useRef(false);
  const authorizedRef  = useRef(false);

  // ── Auto-reconnect state ────────────────────────────────────────────────────
  /** Last auth payload sent so reconnect can replay it */
  const lastAuthPayloadRef      = useRef<Record<string, unknown> | null>(null);
  /** Set to true when the user explicitly disconnects — suppresses auto-reconnect */
  const intentionalDisconnectRef = useRef(false);
  /** Pending reconnect timer */
  const reconnectTimerRef       = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** Total reconnect attempts (never reset, used for back-off calculation) */
  const reconnectAttemptsRef    = useRef(0);

  const [status,      setStatus     ] = useState<ConnectionStatus>("disconnected");
  const [account,     setAccount    ] = useState<DerivAccount | null>(null);
  const [accountList, setAccountList] = useState<DerivAccountListItem[]>([]);
  const [balance,     setBalance    ] = useState<number | null>(null);
  const [error,       setError      ] = useState<string | null>(null);

  const dispatch = useCallback((msg: Record<string, unknown>) => {
    const msgType = msg.msg_type as string | undefined;
    if (msgType) {
      const subs = typeListeners.current.get(msgType);
      if (subs) subs.forEach((cb) => cb(msg));
    }
    const reqId = msg.req_id as number | undefined;
    if (reqId !== undefined && listeners.current.has(reqId)) {
      listeners.current.get(reqId)!(msg);
      listeners.current.delete(reqId);
    }
  }, []);

  const send = useCallback((msg: Record<string, unknown>) => {
    if (ws.current?.readyState === WebSocket.OPEN) {
      ws.current.send(JSON.stringify(msg));
    }
  }, []);

  const request = useCallback((msg: Record<string, unknown>): Promise<Record<string, unknown>> =>
    new Promise((resolve, reject) => {
      if (ws.current?.readyState !== WebSocket.OPEN) {
        reject(new Error("Not connected to Deriv")); return;
      }
      const id = reqIdRef.current++;
      listeners.current.set(id, (r) => {
        if (r.error) {
          const errMsg  = (r.error as Record<string, string>)?.message ?? "Deriv API error";
          const errCode = (r.error as Record<string, string>)?.code ?? "";
          reject(new Error(`${errMsg}${errCode ? ` (${errCode})` : ""}`));
        } else resolve(r);
      });
      ws.current!.send(JSON.stringify({ ...msg, req_id: id }));
      setTimeout(() => {
        if (listeners.current.has(id)) {
          listeners.current.delete(id);
          reject(new Error("Request timed out after 25s"));
        }
      }, 25_000);
    }), []);

  const subscribe = useCallback((msgType: string, cb: Listener): (() => void) => {
    if (!typeListeners.current.has(msgType)) {
      typeListeners.current.set(msgType, new Set());
    }
    typeListeners.current.get(msgType)!.add(cb);
    return () => {
      typeListeners.current.get(msgType)?.delete(cb);
    };
  }, []);

  // ── Cancel any pending reconnect timer ──────────────────────────────────────
  const cancelReconnect = useCallback(() => {
    if (reconnectTimerRef.current) {
      clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
    }
  }, []);

  // ── Core socket open ────────────────────────────────────────────────────────
  // Defined as a plain function stored in a ref so it can call itself recursively
  // from the onclose handler without stale-closure issues.
  const openSocketRef = useRef<((authPayload: Record<string, unknown>) => void) | null>(null);

  const openSocket = useCallback((authPayload: Record<string, unknown>) => {
    cancelReconnect();
    intentionalDisconnectRef.current = false;
    lastAuthPayloadRef.current = authPayload;

    // Close any previous socket cleanly
    if (ws.current && ws.current.readyState !== WebSocket.CLOSED) {
      ws.current.onclose = null; // prevent the old socket's onclose from firing
      ws.current.close(1000);
    }

    authorizedRef.current = false;
    const socket = new WebSocket(proxyUrl());
    ws.current = socket;

    socket.onopen = () => {
      reconnectAttemptsRef.current = 0; // reset back-off on successful open
      setStatus("connecting");
      socket.send(JSON.stringify(authPayload));
    };

    socket.onmessage = (e: MessageEvent<string>) => {
      try {
        const msg     = JSON.parse(e.data) as Record<string, unknown>;
        const type    = msg.type    as string | undefined;
        const msgType = msg.msg_type as string | undefined;

        if (type === "proxy_open") {
          if (isOtpModeRef.current) {
            const loginid   = localStorage.getItem("deriv_otp_loginid")  ?? "OTP_ACCOUNT";
            const currency  = localStorage.getItem("deriv_otp_currency") ?? "USD";
            const isVirtual = localStorage.getItem("deriv_otp_virtual")  === "1";

            const acct: DerivAccount = { loginid, currency, balance: 0, is_virtual: isVirtual };
            setAccount(acct);
            setAccountList([{ loginid, currency, is_virtual: isVirtual ? 1 : 0 }]);
            setStatus("connected");
            setError(null);
            authorizedRef.current = true;
            socket.send(JSON.stringify({ balance: 1, subscribe: 1, req_id: reqIdRef.current++ }));
          } else {
            setStatus("authorizing");
          }
          return;
        }

        if (type === "proxy_reconnecting") {
          setStatus("connecting"); setAccount(null); setBalance(null);
          authorizedRef.current = false;
          return;
        }
        if (type === "proxy_error") {
          const msg_ = String((msg as Record<string, string>).message ?? "Connection error");
          setError(msg_);
          setStatus("disconnected"); setAccount(null); setBalance(null);
          authorizedRef.current = false;
          return;
        }
        if (type === "proxy_not_ready") return;

        dispatch(msg);

        if (msgType === "authorize") {
          const auth     = msg.authorize as Record<string, unknown>;
          const raw      = (auth.account_list as DerivAccountListItem[] | undefined) ?? [];
          // Merge any tokens stored from the OAuth callback (token1/token2/…)
          // so switchAccount works even when Deriv omits tokens in account_list
          const merged   = mergeStoredTokens(raw);
          setAccountList(merged);
          const acct: DerivAccount = {
            loginid:    auth.loginid    as string,
            currency:   auth.currency   as string,
            balance:    auth.balance    as number,
            is_virtual: (auth.is_virtual as number) === 1,
          };
          setAccount(acct);
          setBalance(auth.balance as number);
          setStatus("connected");
          setError(null);
          authorizedRef.current = true;
          socket.send(JSON.stringify({ balance: 1, subscribe: 1, req_id: reqIdRef.current++ }));
        }

        if (msgType === "balance") {
          const b = msg.balance as Record<string, unknown>;
          setBalance(b.balance as number);
          setAccount((prev) => prev ? { ...prev, balance: b.balance as number } : null);
        }

        if (msg.error && !authorizedRef.current) {
          const errMsg  = (msg.error as Record<string, string>)?.message ?? "Auth error";
          const errCode = (msg.error as Record<string, string>)?.code ?? "";
          const isAuthError = errCode === "AuthorizationRequired" || errCode === "InvalidToken"
            || errCode === "AuthorizationFailed" || msgType === "authorize";
          if (isAuthError) {
            setError(errMsg);
            setStatus("disconnected");
          }
        }
      } catch { /* ignore parse errors */ }
    };

    socket.onclose = (e) => {
      setAccount(null); setBalance(null);
      authorizedRef.current = false;

      // ── Intentional / clean close — do not reconnect ──────────────────────
      if (intentionalDisconnectRef.current || e.code === 1000 || e.code === 1001) {
        setStatus("disconnected");
        return;
      }

      // ── Unexpected close — auto-reconnect with exponential back-off ────────
      if (lastAuthPayloadRef.current && !intentionalDisconnectRef.current) {
        const attempt = ++reconnectAttemptsRef.current;
        // Cap the exponent at 6 so max delay ≈ 30 s; cycle forever
        const exp     = (attempt - 1) % 7;
        const delay   = Math.min(1_000 * Math.pow(2, exp), 30_000);
        const secs    = Math.round(delay / 1_000);

        const reason  = e.code === 1006
          ? `Network drop (1006)`
          : `Disconnected (${e.code})`;

        setError(`${reason} — reconnecting in ${secs}s… (attempt ${attempt})`);
        setStatus("connecting");

        reconnectTimerRef.current = setTimeout(() => {
          reconnectTimerRef.current = null;
          if (lastAuthPayloadRef.current && !intentionalDisconnectRef.current) {
            openSocketRef.current?.(lastAuthPayloadRef.current);
          }
        }, delay);
        return;
      }

      setStatus("disconnected");
      setError(
        e.code === 1006
          ? "Connection dropped (1006) — reconnecting…"
          : `Disconnected (${e.code}) — click Connect to retry`
      );
    };

    socket.onerror = () => {
      // onerror is always followed by onclose — let onclose handle reconnect
      // Only set error if no reconnect will happen (intentional disconnect)
      if (intentionalDisconnectRef.current) {
        setError("Cannot reach the backend server — check the API Server workflow.");
        setStatus("disconnected");
      }
    };
  }, [dispatch, cancelReconnect]);

  // Keep the ref in sync so the onclose closure always calls the latest version
  useEffect(() => { openSocketRef.current = openSocket; }, [openSocket]);

  // ── connect: legacy trading token ──────────────────────────────────────────
  const connect = useCallback((token: string) => {
    const t = token.trim();
    if (!t) return;
    tokenRef.current     = t;
    isOtpModeRef.current = false;
    reconnectAttemptsRef.current = 0;
    setStatus("connecting"); setError(null); setAccount(null); setAccountList([]); setBalance(null);
    openSocket({ type: "auth", token: t });
  }, [openSocket]);

  // ── connectLegacy: one-click platform token ─────────────────────────────────
  const connectLegacy = useCallback(async () => {
    setStatus("connecting"); setError(null); setAccount(null); setAccountList([]); setBalance(null);
    try {
      const res  = await fetch("/api/deriv/legacy-token");
      const data = await res.json() as { token?: string; error?: string };
      if (!res.ok || !data.token) {
        setError(data.error ?? "Legacy token not configured on server.");
        setStatus("disconnected");
        return;
      }
      tokenRef.current     = data.token;
      isOtpModeRef.current = false;
      reconnectAttemptsRef.current = 0;
      localStorage.setItem("deriv_token", data.token);
      openSocket({ type: "auth", token: data.token });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to reach server");
      setStatus("disconnected");
    }
  }, [openSocket]);

  // ── connectOtp: new API via Bearer access_token + REST OTP ─────────────────
  const connectOtp = useCallback(async () => {
    const accessToken = localStorage.getItem("deriv_access_token");
    const accountId   = localStorage.getItem("deriv_otp_account_id");

    if (!accessToken || !accountId) {
      setError("No Deriv OAuth session found. Please log in again.");
      setStatus("disconnected");
      return;
    }

    tokenRef.current     = "";
    isOtpModeRef.current = true;
    reconnectAttemptsRef.current = 0;
    setStatus("connecting"); setError(null); setAccount(null); setAccountList([]); setBalance(null);

    try {
      const resp = await fetch("/api/deriv/oauth/otp", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ access_token: accessToken, account_id: accountId }),
      });

      const data = await resp.json() as Record<string, unknown>;

      if (!resp.ok || !data.otp_url) {
        const msg = String(data.error ?? "Failed to get OTP for Deriv connection");
        setError(msg);
        setStatus("disconnected");
        localStorage.removeItem("deriv_access_token");
        localStorage.removeItem("deriv_otp_account_id");
        return;
      }

      openSocket({ type: "otp_connect", otp_url: String(data.otp_url) });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Network error connecting to Deriv";
      setError(msg);
      setStatus("disconnected");
    }
  }, [openSocket]);

  const disconnect = useCallback(() => {
    intentionalDisconnectRef.current = true;
    cancelReconnect();
    lastAuthPayloadRef.current   = null;
    reconnectAttemptsRef.current = 0;
    tokenRef.current     = "";
    isOtpModeRef.current = false;
    if (ws.current) {
      ws.current.onclose = null;
      ws.current.close(1000);
      ws.current = null;
    }
    // Clear all stored auth state
    localStorage.removeItem("deriv_token");
    localStorage.removeItem("deriv_account_tokens");
    localStorage.removeItem("deriv_active_loginid");
    localStorage.removeItem("deriv_access_token");
    localStorage.removeItem("deriv_otp_account_id");
    localStorage.removeItem("deriv_otp_loginid");
    localStorage.removeItem("deriv_otp_currency");
    localStorage.removeItem("deriv_otp_virtual");
    setStatus("disconnected"); setAccount(null); setAccountList([]); setBalance(null); setError(null);
    authorizedRef.current = false;
    listeners.current.clear();
  }, [cancelReconnect]);

  // ── Token helpers ───────────────────────────────────────────────────────────
  function getStoredTokens(): Record<string, string> {
    try { return JSON.parse(localStorage.getItem("deriv_account_tokens") ?? "{}") as Record<string, string>; }
    catch { return {}; }
  }
  function mergeStoredTokens(list: DerivAccountListItem[]): DerivAccountListItem[] {
    const stored = getStoredTokens();
    return list.map((a) => ({ ...a, token: a.token ?? stored[a.loginid] }));
  }

  const switchAccount = useCallback((item: DerivAccountListItem) => {
    const stored = getStoredTokens();
    const token  = item.token ?? stored[item.loginid];
    if (!token) return;
    // Update active token so reconnect and auto-restore use the switched account
    localStorage.setItem("deriv_token", token);
    localStorage.setItem("deriv_active_loginid", item.loginid);
    lastAuthPayloadRef.current = { type: "auth", token };
    send({ authorize: token, req_id: reqIdRef.current++ });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [send]);

  const topupDemo = useCallback(() => request({ topup_virtual: 1 }), [request]);

  useEffect(() => () => {
    cancelReconnect();
    if (ws.current) { ws.current.onclose = null; ws.current.close(1000); }
  }, [cancelReconnect]);

  // ── Reconnect on internet restore / tab refocus ─────────────────────────────
  useEffect(() => {
    const handleOnline = () => {
      if (
        lastAuthPayloadRef.current &&
        !intentionalDisconnectRef.current &&
        (ws.current == null || ws.current.readyState === WebSocket.CLOSED || ws.current.readyState === WebSocket.CLOSING)
      ) {
        cancelReconnect();
        reconnectAttemptsRef.current = 0;
        setError(null);
        openSocketRef.current?.(lastAuthPayloadRef.current);
      }
    };

    const handleVisibility = () => {
      if (
        document.visibilityState === "visible" &&
        lastAuthPayloadRef.current &&
        !intentionalDisconnectRef.current &&
        (ws.current == null || ws.current.readyState === WebSocket.CLOSED || ws.current.readyState === WebSocket.CLOSING)
      ) {
        cancelReconnect();
        reconnectAttemptsRef.current = 0;
        setError(null);
        openSocketRef.current?.(lastAuthPayloadRef.current);
      }
    };

    window.addEventListener("online", handleOnline);
    document.addEventListener("visibilitychange", handleVisibility);
    return () => {
      window.removeEventListener("online", handleOnline);
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, [cancelReconnect]);

  // ── Auto-restore session on mount ──────────────────────────────────────────
  useEffect(() => {
    const legacyToken = localStorage.getItem("deriv_token");
    const accessToken = localStorage.getItem("deriv_access_token");
    const accountId   = localStorage.getItem("deriv_otp_account_id");

    if (legacyToken) {
      connect(legacyToken);
    } else if (accessToken && accountId) {
      void connectOtp();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <DerivContext.Provider value={{
      status, account, accountList, balance, error,
      connect, connectOtp, connectLegacy, disconnect, switchAccount, topupDemo,
      send, request, subscribe,
    }}>
      {children}
    </DerivContext.Provider>
  );
}
