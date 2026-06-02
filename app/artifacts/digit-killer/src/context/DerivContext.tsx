/**
 * Global Deriv WebSocket Context
 * Provides a single, shared WS connection across all pages.
 * All trading components use this context instead of maintaining their own sockets.
 */
import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";

// ─── Types ────────────────────────────────────────────────────────────────────
export interface DerivAccount {
  loginid: string;
  currency: string;
  balance: number;
  is_virtual: boolean;
}

export interface DerivAccountListItem {
  loginid: string;
  currency: string;
  is_virtual: number;
  account_type?: string;
  token?: string;
}

export type ConnectionStatus = "disconnected" | "connecting" | "authorizing" | "connected";

type Listener = (msg: Record<string, unknown>) => void;

interface DerivContextValue {
  status: ConnectionStatus;
  account: DerivAccount | null;
  accountList: DerivAccountListItem[];
  balance: number | null;
  error: string | null;
  connect: (token: string) => void;
  disconnect: () => void;
  switchAccount: (item: DerivAccountListItem) => void;
  topupDemo: () => Promise<Record<string, unknown>>;
  /** Fire-and-forget — does NOT track responses */
  send: (msg: Record<string, unknown>) => void;
  /** Returns a promise that resolves with the Deriv response */
  request: (msg: Record<string, unknown>) => Promise<Record<string, unknown>>;
  /** Subscribe to a particular msg_type. Returns unsubscribe fn. */
  subscribe: (msgType: string, cb: Listener) => () => void;
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
  const ws              = useRef<WebSocket | null>(null);
  const reqIdRef        = useRef(2);
  const listeners       = useRef<Map<number, Listener>>(new Map());
  const typeListeners   = useRef<Map<string, Set<Listener>>>(new Map());
  const tokenRef        = useRef<string>("");
  // Use a ref to track authorized state inside the socket message handler
  // (avoids stale-closure bug where account state is always null inside onmessage)
  const authorizedRef   = useRef(false);

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
          const errMsg = (r.error as Record<string, string>)?.message ?? "Deriv API error";
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

  // openSocket has NO dependency on account state — we use authorizedRef instead
  const openSocket = useCallback((token: string) => {
    ws.current?.close(1000);
    authorizedRef.current = false;
    const socket = new WebSocket(proxyUrl());
    ws.current = socket;

    socket.onopen = () => {
      setStatus("connecting");
      socket.send(JSON.stringify({ type: "auth", token }));
    };

    socket.onmessage = (e: MessageEvent<string>) => {
      try {
        const msg     = JSON.parse(e.data) as Record<string, unknown>;
        const type    = msg.type as string | undefined;
        const msgType = msg.msg_type as string | undefined;

        if (type === "proxy_open") { setStatus("authorizing"); return; }
        if (type === "proxy_reconnecting") {
          setStatus("connecting"); setAccount(null); setBalance(null);
          authorizedRef.current = false;
          return;
        }
        if (type === "proxy_error") {
          setError(String((msg as Record<string, string>).message ?? "Connection error"));
          setStatus("disconnected"); setAccount(null); setBalance(null);
          authorizedRef.current = false;
          return;
        }
        if (type === "proxy_not_ready") return;

        // Dispatch to req_id listeners and type-based subscribers
        dispatch(msg);

        if (msgType === "authorize") {
          const auth = msg.authorize as Record<string, unknown>;
          const acctList = (auth.account_list as DerivAccountListItem[] | undefined) ?? [];
          setAccountList(acctList);
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
          // Subscribe to live balance updates
          socket.send(JSON.stringify({ balance: 1, subscribe: 1, req_id: reqIdRef.current++ }));
        }

        if (msgType === "balance") {
          const b = msg.balance as Record<string, unknown>;
          setBalance(b.balance as number);
          setAccount((prev) => prev ? { ...prev, balance: b.balance as number } : null);
        }

        // Only treat errors as fatal auth errors if we haven't been authorized yet.
        // Using authorizedRef (not stale account state) to check this correctly.
        if (msg.error && !authorizedRef.current) {
          const errMsg = (msg.error as Record<string, string>)?.message ?? "Auth error";
          // Only disconnect for auth-related errors, not proposal/trade errors
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
      setStatus("disconnected"); setAccount(null); setBalance(null);
      authorizedRef.current = false;
      if (e.code !== 1000 && e.code !== 1001) {
        setError(
          e.code === 1006
            ? "Connection dropped (1006) — check your internet, then reconnect."
            : `Disconnected (${e.code}) — click Connect to retry`
        );
      }
    };

    socket.onerror = () => {
      setError("Cannot reach the backend server — check the API Server workflow.");
      setStatus("disconnected");
    };
  }, [dispatch]); // removed 'account' dependency — use authorizedRef instead

  const connect = useCallback((token: string) => {
    const t = token.trim();
    if (!t) return;
    tokenRef.current = t;
    setStatus("connecting"); setError(null); setAccount(null); setAccountList([]); setBalance(null);
    openSocket(t);
  }, [openSocket]);

  const disconnect = useCallback(() => {
    tokenRef.current = "";
    ws.current?.close(1000); ws.current = null;
    setStatus("disconnected"); setAccount(null); setAccountList([]); setBalance(null); setError(null);
    authorizedRef.current = false;
    listeners.current.clear();
  }, []);

  const switchAccount = useCallback((item: DerivAccountListItem) => {
    if (!item.token) return;
    const id = reqIdRef.current++;
    send({ authorize: item.token, req_id: id });
  }, [send]);

  const topupDemo = useCallback(() => request({ topup_virtual: 1 }), [request]);

  useEffect(() => () => { ws.current?.close(1000); }, []);

  // Auto-restore last token on mount (shared across all pages via localStorage)
  useEffect(() => {
    const token = localStorage.getItem("deriv_token");
    if (token) connect(token);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <DerivContext.Provider value={{
      status, account, accountList, balance, error,
      connect, disconnect, switchAccount, topupDemo,
      send, request, subscribe,
    }}>
      {children}
    </DerivContext.Provider>
  );
}
