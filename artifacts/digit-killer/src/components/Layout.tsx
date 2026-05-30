import { useState, useEffect } from "react";
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

export default function Layout({ children }: LayoutProps) {
  const [collapsed, setCollapsed] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [location] = useLocation();
  const { symbol, setSymbol } = useSymbol();
  const [activeMarket, setActiveMarket] = useState("Volatility");

  const { data: activeSymbols } = useGetActiveSymbols();

  // Close mobile menu on navigation
  useEffect(() => {
    setMobileMenuOpen(false);
  }, [location]);

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
            {!collapsed && <span className="font-rajdhani font-semibold text-sm">Admin</span>}
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

      {/* ── Mobile Drawer Overlay ── */}
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
        {/* Logo + close */}
        <div className="flex items-center justify-between px-4 py-4 border-b border-sidebar-border">
          <div className="flex items-center gap-3">
            <img src={logoPath} alt="Digit Killer" className="w-9 h-9 rounded-full object-cover" />
            <div>
              <div className="font-orbitron text-xs font-bold text-primary tracking-wider">DIGIT KILLER</div>
              <div className="font-rajdhani text-[9px] text-muted-foreground tracking-widest">AHMEDSYNTRADER.SITE</div>
            </div>
          </div>
          <button
            onClick={() => setMobileMenuOpen(false)}
            className="text-muted-foreground hover:text-primary p-1"
          >
            <X size={18} />
          </button>
        </div>

        {/* Mobile Nav */}
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
            <span className="font-rajdhani font-semibold text-sm">Admin</span>
          </Link>
        </div>
      </aside>

      {/* ── Main Content ── */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Top Bar */}
        <header className="flex-shrink-0 border-b border-border bg-card/50 backdrop-blur-sm">
          {/* Market tabs + symbol selector row */}
          <div className="flex items-center gap-2 px-3 md:px-4 py-2 border-b border-border/50">
            {/* Mobile hamburger */}
            <button
              className="md:hidden p-1.5 rounded-md text-muted-foreground hover:text-primary hover:bg-white/5 transition-colors mr-1"
              onClick={() => setMobileMenuOpen(true)}
            >
              <Menu size={18} />
            </button>

            {/* Live indicator */}
            <div className="flex items-center gap-1.5">
              <div className="live-dot" />
              <span className="font-rajdhani font-semibold text-xs text-green-400 tracking-widest">LIVE</span>
            </div>

            {/* Market type tabs */}
            <div className="flex items-center gap-1 overflow-x-auto scrollbar-hide">
              {MARKET_GROUPS.map((g) => (
                <button
                  key={g.label}
                  onClick={() => {
                    setActiveMarket(g.label);
                    if (!g.symbols.includes(symbol)) setSymbol(g.symbols[0]);
                  }}
                  className={`market-tab flex-shrink-0 ${activeMarket === g.label ? "active" : ""}`}
                >
                  {g.label}
                </button>
              ))}
            </div>

            <div className="w-px h-5 bg-border mx-0.5 flex-shrink-0" />

            {/* Symbol selector */}
            <div className="flex items-center gap-1 overflow-x-auto scrollbar-hide flex-1 min-w-0">
              {symbolList.map((sym) => (
                <button
                  key={sym}
                  onClick={() => setSymbol(sym)}
                  className={`market-tab flex-shrink-0 ${symbol === sym ? "active" : ""}`}
                >
                  {sym}
                </button>
              ))}
            </div>

            <div className="ml-1 flex items-center gap-1.5 flex-shrink-0">
              <Radio size={12} className="text-primary animate-pulse" />
              <span className="font-orbitron text-xs text-primary/80 tracking-widest hidden sm:block">
                {symbol}
              </span>
            </div>
          </div>

          {/* Page label row */}
          <div className="px-3 md:px-4 py-1.5">
            <span className="font-rajdhani text-xs text-muted-foreground tracking-widest uppercase">
              {displayName(symbol)}
            </span>
          </div>
        </header>

        {/* Page Content */}
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
                  className={`flex flex-col items-center justify-center gap-0.5 min-w-[56px] py-2 px-2 flex-1 transition-colors ${
                    active ? "text-primary" : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  <Icon size={18} />
                  <span className="font-rajdhani text-[9px] tracking-wide leading-tight text-center whitespace-nowrap">
                    {label.split(" ")[0]}
                  </span>
                  {active && (
                    <div className="absolute bottom-0 w-4 h-0.5 rounded-full bg-primary" />
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
