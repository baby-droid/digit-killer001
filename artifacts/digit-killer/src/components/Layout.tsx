import { useState, useEffect, useRef } from "react";
import { Link, useLocation } from "wouter";
import { useSymbol } from "@/context/SymbolContext";
import { useGetActiveSymbols } from "@workspace/api-client-react";
import logoPath from "@assets/WhatsApp_Image_2026-05-30_at_19.05.28_1780157146139.jpeg";
import {
  LayoutDashboard,
  Eye,
  TrendingUp,
  Divide,
  Shuffle,
  BarChart2,
  Zap,
  Settings,
  ChevronLeft,
  ChevronRight,
  Radio,
  LogIn,
  FileBarChart,
  Menu,
  X,
  ChevronDown,
} from "lucide-react";

const MARKET_GROUPS = [
  {
    label: "Volatility",
    emoji: "📈",
    symbols: [
      { key: "R_10", label: "Vol 10" },
      { key: "R_25", label: "Vol 25" },
      { key: "R_50", label: "Vol 50" },
      { key: "R_75", label: "Vol 75" },
      { key: "R_100", label: "Vol 100" },
      { key: "1HZ10V", label: "1s V10" },
      { key: "1HZ25V", label: "1s V25" },
      { key: "1HZ50V", label: "1s V50" },
      { key: "1HZ75V", label: "1s V75" },
      { key: "1HZ100V", label: "1s V100" },
    ],
  },
  {
    label: "Crash/Boom",
    emoji: "💥",
    symbols: [
      { key: "CRASH300N", label: "Crash 300" },
      { key: "CRASH500", label: "Crash 500" },
      { key: "CRASH1000", label: "Crash 1000" },
      { key: "BOOM300N", label: "Boom 300" },
      { key: "BOOM500", label: "Boom 500" },
      { key: "BOOM1000", label: "Boom 1000" },
    ],
  },
  {
    label: "Jump",
    emoji: "⬆",
    symbols: [
      { key: "JD10", label: "Jump 10" },
      { key: "JD25", label: "Jump 25" },
      { key: "JD50", label: "Jump 50" },
      { key: "JD75", label: "Jump 75" },
      { key: "JD100", label: "Jump 100" },
    ],
  },
];

const NAV_ITEMS = [
  { path: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { path: "/wide-eye", label: "Wide Eye", icon: Eye },
  { path: "/over-under", label: "Over / Under", icon: TrendingUp },
  { path: "/even-odd", label: "Even / Odd", icon: Divide },
  { path: "/match-differ", label: "Match / Differ", icon: Shuffle },
  { path: "/tick-analyser", label: "Tick Analyser", icon: BarChart2 },
  { path: "/ai-signals", label: "AI Signals", icon: Zap },
  { path: "/reports", label: "ML Reports", icon: FileBarChart },
];

interface LayoutProps {
  children: React.ReactNode;
}

function SymbolDropdown({
  symbol,
  setSymbol,
  activeMarket,
  setActiveMarket,
}: {
  symbol: string;
  setSymbol: (s: string) => void;
  activeMarket: string;
  setActiveMarket: (m: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const currentGroup = MARKET_GROUPS.find((g) => g.label === activeMarket) ?? MARKET_GROUPS[0];
  const currentLabel =
    currentGroup.symbols.find((s) => s.key === symbol)?.label ?? symbol;

  // Close on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-md font-orbitron text-xs font-bold tracking-widest transition-all"
        style={{
          background: "rgba(0,229,255,0.1)",
          border: "1px solid rgba(0,229,255,0.25)",
          color: "#00e5ff",
          minWidth: "110px",
        }}
        data-testid="button-symbol-dropdown"
      >
        <Radio size={10} className="animate-pulse flex-shrink-0" />
        <span className="flex-1 text-left truncate">{currentLabel}</span>
        <ChevronDown size={11} className={`flex-shrink-0 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <div
          className="absolute top-full left-0 mt-1 z-50 rounded-lg overflow-hidden shadow-2xl"
          style={{
            background: "#0a1628",
            border: "1px solid rgba(0,229,255,0.2)",
            minWidth: "200px",
            boxShadow: "0 8px 32px rgba(0,0,0,0.6)",
          }}
        >
          {/* Market group tabs */}
          <div className="flex border-b" style={{ borderColor: "rgba(0,229,255,0.1)" }}>
            {MARKET_GROUPS.map((g) => (
              <button
                key={g.label}
                onClick={() => {
                  setActiveMarket(g.label);
                  if (!g.symbols.find((s) => s.key === symbol)) {
                    setSymbol(g.symbols[0].key);
                  }
                }}
                className="flex-1 py-2 font-rajdhani text-xs font-bold tracking-wider transition-all"
                style={
                  activeMarket === g.label
                    ? { color: "#00e5ff", borderBottom: "2px solid #00e5ff" }
                    : { color: "rgba(255,255,255,0.4)" }
                }
              >
                {g.label.split("/")[0]}
              </button>
            ))}
          </div>
          {/* Symbol list */}
          <div className="py-1 max-h-56 overflow-y-auto">
            {currentGroup.symbols.map((s) => (
              <button
                key={s.key}
                onClick={() => { setSymbol(s.key); setOpen(false); }}
                className="w-full flex items-center justify-between px-4 py-2 font-rajdhani text-sm font-semibold transition-all hover:bg-white/5"
                style={
                  symbol === s.key
                    ? { color: "#00e5ff", background: "rgba(0,229,255,0.08)" }
                    : { color: "rgba(255,255,255,0.7)" }
                }
                data-testid={`option-symbol-${s.key}`}
              >
                <span>{s.label}</span>
                {symbol === s.key && (
                  <div className="w-1.5 h-1.5 rounded-full bg-primary" />
                )}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export default function Layout({ children }: LayoutProps) {
  const [collapsed, setCollapsed] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [location] = useLocation();
  const { symbol, setSymbol } = useSymbol();
  const [activeMarket, setActiveMarket] = useState(() => {
    const g = MARKET_GROUPS.find((g) => g.symbols.find((s) => s.key === symbol));
    return g?.label ?? "Volatility";
  });

  const { data: activeSymbols } = useGetActiveSymbols();

  useEffect(() => {
    setMobileMenuOpen(false);
  }, [location]);

  const displayName = (sym: string) => {
    if (!activeSymbols) return sym;
    const found = (activeSymbols as Array<{ symbol: string; display_name: string }>).find(
      (s) => s.symbol === sym
    );
    return found ? found.display_name : sym;
  };

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      {/* ── Desktop Sidebar ── */}
      <aside
        className="sidebar hidden md:flex flex-col flex-shrink-0 transition-all duration-300 relative"
        style={{ width: collapsed ? 56 : 220 }}
        data-testid="sidebar"
      >
        {/* Logo */}
        <div className="flex items-center gap-3 px-3 py-4 border-b border-sidebar-border min-h-[64px]">
          <img
            src={logoPath}
            alt="Digit Killer"
            className="w-9 h-9 rounded-full flex-shrink-0 object-cover"
          />
          {!collapsed && (
            <div className="flex-1 min-w-0">
              <div className="font-orbitron text-xs font-bold text-primary tracking-wider truncate">
                DIGIT KILLER
              </div>
              <div className="font-rajdhani text-[9px] text-muted-foreground tracking-widest truncate">
                AHMEDSYNTRADER.SITE
              </div>
            </div>
          )}
        </div>

        {/* Nav */}
        <nav className="flex-1 overflow-y-auto py-3 px-1.5 space-y-0.5">
          {NAV_ITEMS.map(({ path, label, icon: Icon }) => {
            const active = location === path || location.startsWith(path + "/");
            return (
              <Link
                key={path}
                href={path}
                className={`flex items-center gap-3 px-2.5 py-2 rounded-md transition-all duration-150 group ${
                  active
                    ? "bg-primary/10 text-primary border border-primary/25"
                    : "text-sidebar-foreground/60 hover:text-sidebar-foreground hover:bg-white/5"
                }`}
              >
                <Icon size={16} className="flex-shrink-0" />
                {!collapsed && (
                  <span className="font-rajdhani font-semibold text-sm tracking-wide truncate">
                    {label}
                  </span>
                )}
              </Link>
            );
          })}
        </nav>

        {/* Bottom */}
        <div className="border-t border-sidebar-border px-1.5 py-3 space-y-0.5">
          <Link
            href="/login"
            className="flex items-center gap-3 px-2.5 py-2 rounded-md text-sidebar-foreground/50 hover:text-sidebar-foreground hover:bg-white/5 transition-all"
          >
            <LogIn size={16} className="flex-shrink-0" />
            {!collapsed && <span className="font-rajdhani font-semibold text-sm">Login</span>}
          </Link>
          <Link
            href="/settings"
            className={`flex items-center gap-3 px-2.5 py-2 rounded-md transition-all duration-150 ${
              location === "/settings"
                ? "bg-primary/10 text-primary border border-primary/25"
                : "text-sidebar-foreground/50 hover:text-sidebar-foreground hover:bg-white/5"
            }`}
          >
            <Settings size={16} className="flex-shrink-0" />
            {!collapsed && <span className="font-rajdhani font-semibold text-sm">Settings</span>}
          </Link>
        </div>

        {/* Collapse toggle */}
        <button
          onClick={() => setCollapsed(!collapsed)}
          className="absolute -right-3 top-16 z-10 w-6 h-6 rounded-full bg-card border border-border flex items-center justify-center text-muted-foreground hover:text-primary transition-colors"
        >
          {collapsed ? <ChevronRight size={12} /> : <ChevronLeft size={12} />}
        </button>
      </aside>

      {/* ── Mobile Overlay ── */}
      {mobileMenuOpen && (
        <div
          className="md:hidden fixed inset-0 z-40 bg-black/70 backdrop-blur-sm"
          onClick={() => setMobileMenuOpen(false)}
        />
      )}

      {/* ── Mobile Drawer ── */}
      <aside
        className={`md:hidden fixed left-0 top-0 bottom-0 z-50 w-64 sidebar flex flex-col transition-transform duration-300 ${
          mobileMenuOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="flex items-center justify-between px-4 py-4 border-b border-sidebar-border">
          <div className="flex items-center gap-3">
            <img src={logoPath} alt="Digit Killer" className="w-9 h-9 rounded-full object-cover" />
            <div>
              <div className="font-orbitron text-xs font-bold text-primary tracking-wider">DIGIT KILLER</div>
              <div className="font-rajdhani text-[9px] text-muted-foreground tracking-widest">AHMEDSYNTRADER.SITE</div>
            </div>
          </div>
          <button onClick={() => setMobileMenuOpen(false)} className="text-muted-foreground hover:text-primary p-1">
            <X size={18} />
          </button>
        </div>

        <nav className="flex-1 overflow-y-auto py-3 px-2 space-y-0.5">
          {NAV_ITEMS.map(({ path, label, icon: Icon }) => {
            const active = location === path;
            return (
              <Link
                key={path}
                href={path}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-md transition-all ${
                  active
                    ? "bg-primary/10 text-primary border border-primary/25"
                    : "text-sidebar-foreground/60 hover:text-sidebar-foreground hover:bg-white/5"
                }`}
              >
                <Icon size={17} className="flex-shrink-0" />
                <span className="font-rajdhani font-semibold text-sm">{label}</span>
              </Link>
            );
          })}
        </nav>

        <div className="border-t border-sidebar-border px-2 py-3 space-y-0.5">
          <Link href="/login" className="flex items-center gap-3 px-3 py-2.5 rounded-md text-sidebar-foreground/50 hover:text-sidebar-foreground hover:bg-white/5">
            <LogIn size={16} />
            <span className="font-rajdhani font-semibold text-sm">Login</span>
          </Link>
          <Link href="/settings" className="flex items-center gap-3 px-3 py-2.5 rounded-md text-sidebar-foreground/50 hover:text-sidebar-foreground hover:bg-white/5">
            <Settings size={16} />
            <span className="font-rajdhani font-semibold text-sm">Settings</span>
          </Link>
        </div>
      </aside>

      {/* ── Main ── */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Top Bar */}
        <header className="flex-shrink-0 border-b border-border bg-card/50 backdrop-blur-sm">
          <div className="flex items-center gap-2 px-3 md:px-4 py-2">
            {/* Mobile hamburger */}
            <button
              className="md:hidden p-1.5 rounded-md text-muted-foreground hover:text-primary hover:bg-white/5 transition-colors mr-1 flex-shrink-0"
              onClick={() => setMobileMenuOpen(true)}
            >
              <Menu size={18} />
            </button>

            {/* Live indicator */}
            <div className="flex items-center gap-1.5 flex-shrink-0">
              <div className="live-dot" />
              <span className="font-rajdhani font-semibold text-xs text-green-400 tracking-widest hidden sm:block">LIVE</span>
            </div>

            {/* Market group tabs — scrollable pills */}
            <div className="flex items-center gap-1 overflow-x-auto scrollbar-hide">
              {MARKET_GROUPS.map((g) => (
                <button
                  key={g.label}
                  onClick={() => {
                    setActiveMarket(g.label);
                    if (!g.symbols.find((s) => s.key === symbol)) setSymbol(g.symbols[0].key);
                  }}
                  className={`market-tab flex-shrink-0 ${activeMarket === g.label ? "active" : ""}`}
                  data-testid={`tab-market-${g.label}`}
                >
                  {g.label}
                </button>
              ))}
            </div>

            <div className="w-px h-5 bg-border mx-1 flex-shrink-0" />

            {/* Symbol dropdown */}
            <SymbolDropdown
              symbol={symbol}
              setSymbol={setSymbol}
              activeMarket={activeMarket}
              setActiveMarket={setActiveMarket}
            />

            <div className="ml-auto flex-shrink-0">
              <span className="font-rajdhani text-xs text-muted-foreground tracking-widest truncate hidden lg:block">
                {displayName(symbol)}
              </span>
            </div>
          </div>
        </header>

        {/* Page content */}
        <main className="flex-1 overflow-y-auto p-3 md:p-4 pb-20 md:pb-4">
          {children}
        </main>

        {/* ── Mobile Bottom Nav ── */}
        <nav className="md:hidden fixed bottom-0 left-0 right-0 z-30 border-t border-border bg-card/95 backdrop-blur-sm">
          <div className="flex overflow-x-auto scrollbar-hide">
            {NAV_ITEMS.map(({ path, label, icon: Icon }) => {
              const active = location === path;
              return (
                <Link
                  key={path}
                  href={path}
                  className={`flex flex-col items-center justify-center gap-0.5 min-w-[52px] py-2 px-1.5 flex-1 relative transition-colors ${
                    active ? "text-primary" : "text-muted-foreground"
                  }`}
                >
                  <Icon size={17} />
                  <span className="font-rajdhani text-[9px] leading-tight text-center whitespace-nowrap">
                    {label.split(" ")[0]}
                  </span>
                  {active && (
                    <div className="absolute bottom-0 inset-x-3 h-0.5 rounded-full bg-primary" />
                  )}
                </Link>
              );
            })}
          </div>
        </nav>
      </div>
    </div>
  );
}
