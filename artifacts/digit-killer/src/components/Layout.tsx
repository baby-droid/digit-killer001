import { useState } from "react";
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
} from "lucide-react";

const MARKET_GROUPS = [
  {
    label: "Volatility",
    symbols: ["R_10", "R_25", "R_50", "R_75", "R_100", "1HZ10V", "1HZ25V", "1HZ50V", "1HZ75V", "1HZ100V"],
  },
  {
    label: "Crash/Boom",
    symbols: ["CRASH300N", "CRASH500", "CRASH1000", "BOOM300N", "BOOM500", "BOOM1000"],
  },
  {
    label: "Jump",
    symbols: ["JD10", "JD25", "JD50", "JD75", "JD100"],
  },
];

const NAV_ITEMS = [
  { path: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { path: "/wide-eye", label: "Wide Eye View", icon: Eye },
  { path: "/over-under", label: "Over / Under", icon: TrendingUp },
  { path: "/even-odd", label: "Even / Odd", icon: Divide },
  { path: "/match-differ", label: "Match / Differ", icon: Shuffle },
  { path: "/tick-analyser", label: "Tick Analyser", icon: BarChart2 },
  { path: "/ai-signals", label: "AI Signals", icon: Zap },
];

interface LayoutProps {
  children: React.ReactNode;
}

export default function Layout({ children }: LayoutProps) {
  const [collapsed, setCollapsed] = useState(false);
  const [location] = useLocation();
  const { symbol, setSymbol } = useSymbol();
  const [activeMarket, setActiveMarket] = useState("Volatility");

  const { data: activeSymbols } = useGetActiveSymbols();

  const currentMarket = MARKET_GROUPS.find((g) => g.label === activeMarket);
  const symbolList = currentMarket?.symbols ?? [];

  const displayName = (sym: string) => {
    if (!activeSymbols) return sym;
    const found = (activeSymbols as Array<{ symbol: string; display_name: string }>).find(
      (s) => s.symbol === sym
    );
    return found ? found.display_name : sym;
  };

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      {/* Sidebar */}
      <aside
        className="sidebar flex flex-col flex-shrink-0 transition-all duration-300 relative"
        style={{ width: collapsed ? 56 : 220 }}
        data-testid="sidebar"
      >
        {/* Logo */}
        <div className="flex items-center gap-3 px-3 py-4 border-b border-sidebar-border min-h-[64px]">
          <img
            src={logoPath}
            alt="Digit Killer"
            className="w-9 h-9 rounded-full flex-shrink-0 object-cover"
            data-testid="img-logo"
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
                data-testid={`nav-${label.toLowerCase().replace(/\s+\//g, "-").replace(/\s+/g, "-")}`}
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

        {/* Bottom: Settings / Login */}
        <div className="border-t border-sidebar-border px-1.5 py-3 space-y-0.5">
          <Link
            href="/login"
            className="flex items-center gap-3 px-2.5 py-2 rounded-md text-sidebar-foreground/50 hover:text-sidebar-foreground hover:bg-white/5 transition-all"
            data-testid="nav-login"
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
            data-testid="nav-settings"
          >
            <Settings size={16} className="flex-shrink-0" />
            {!collapsed && <span className="font-rajdhani font-semibold text-sm">Admin</span>}
          </Link>
        </div>

        {/* Collapse toggle */}
        <button
          onClick={() => setCollapsed(!collapsed)}
          className="absolute -right-3 top-16 z-10 w-6 h-6 rounded-full bg-card border border-border flex items-center justify-center text-muted-foreground hover:text-primary transition-colors"
          data-testid="button-collapse-sidebar"
        >
          {collapsed ? <ChevronRight size={12} /> : <ChevronLeft size={12} />}
        </button>
      </aside>

      {/* Main */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Top Bar */}
        <header className="flex-shrink-0 border-b border-border bg-card/50 backdrop-blur-sm">
          {/* Market tabs + symbol selector */}
          <div className="flex items-center gap-3 px-4 py-2 border-b border-border/50">
            {/* Live indicator */}
            <div className="flex items-center gap-1.5 mr-2">
              <div className="live-dot" />
              <span className="font-rajdhani font-semibold text-xs text-green-400 tracking-widest">LIVE</span>
            </div>

            {/* Market type tabs */}
            <div className="flex items-center gap-1 overflow-x-auto">
              {MARKET_GROUPS.map((g) => (
                <button
                  key={g.label}
                  onClick={() => {
                    setActiveMarket(g.label);
                    if (!g.symbols.includes(symbol)) setSymbol(g.symbols[0]);
                  }}
                  className={`market-tab ${activeMarket === g.label ? "active" : ""}`}
                  data-testid={`tab-market-${g.label.toLowerCase().replace(/\//g, "-")}`}
                >
                  {g.label}
                </button>
              ))}
            </div>

            <div className="w-px h-5 bg-border mx-1" />

            {/* Symbol selector */}
            <div className="flex items-center gap-1 overflow-x-auto max-w-xl">
              {symbolList.map((sym) => (
                <button
                  key={sym}
                  onClick={() => setSymbol(sym)}
                  className={`market-tab ${symbol === sym ? "active" : ""}`}
                  data-testid={`tab-symbol-${sym}`}
                >
                  {sym}
                </button>
              ))}
            </div>

            <div className="ml-auto flex items-center gap-2 flex-shrink-0">
              <Radio size={12} className="text-primary animate-pulse" />
              <span className="font-orbitron text-xs text-primary/80 tracking-widest">
                {symbol}
              </span>
            </div>
          </div>

          {/* Page label row */}
          <div className="px-4 py-1.5">
            <span className="font-rajdhani text-xs text-muted-foreground tracking-widest uppercase">
              {displayName(symbol)}
            </span>
          </div>
        </header>

        {/* Page Content */}
        <main className="flex-1 overflow-y-auto p-4">
          {children}
        </main>
      </div>
    </div>
  );
}
