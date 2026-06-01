import { Switch, Route, Router as WouterRouter, useLocation } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useEffect } from "react";
import { SymbolProvider } from "@/context/SymbolContext";
import Layout from "@/components/Layout";
import LoginPage from "@/pages/LoginPage";
import DashboardPage from "@/pages/DashboardPage";
import WideEyePage from "@/pages/WideEyePage";
import OverUnderPage from "@/pages/OverUnderPage";
import EvenOddPage from "@/pages/EvenOddPage";
import MatchDifferPage from "@/pages/MatchDifferPage";
import TickAnalyserPage from "@/pages/TickAnalyserPage";
import RiseFallPage from "@/pages/RiseFallPage";
import OnlyUpDownPage from "@/pages/OnlyUpDownPage";
import HighLowTickPage from "@/pages/HighLowTickPage";
import AiSignalsPage from "@/pages/AiSignalsPage";
import AiTradingPage from "@/pages/AiTradingPage";
import DerivTraderPage from "@/pages/DerivTraderPage";
import RiskCalculatorPage from "@/pages/RiskCalculatorPage";
import SettingsPage from "@/pages/SettingsPage";
import ReportsPage from "@/pages/ReportsPage";
import NotFound from "@/pages/not-found";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { refetchOnWindowFocus: false, retry: 1 },
  },
});

function isAuthenticated(): boolean {
  return (
    !!localStorage.getItem("user_token") ||
    !!localStorage.getItem("admin_token")
  );
}

/** Wraps a page with Layout; redirects to /login if not authenticated. */
function Protected({ children }: { children: React.ReactNode }) {
  const [, navigate] = useLocation();
  useEffect(() => {
    if (!isAuthenticated()) navigate("/login");
  });
  if (!isAuthenticated()) return null;
  return <Layout>{children}</Layout>;
}

function Router() {
  return (
    <Switch>
      {/* Root → Login page always (no splash) */}
      <Route path="/" component={LoginPage} />
      <Route path="/login" component={LoginPage} />

      <Route path="/dashboard"><Protected><DashboardPage /></Protected></Route>
      <Route path="/wide-eye"><Protected><WideEyePage /></Protected></Route>
      <Route path="/over-under"><Protected><OverUnderPage /></Protected></Route>
      <Route path="/even-odd"><Protected><EvenOddPage /></Protected></Route>
      <Route path="/match-differ"><Protected><MatchDifferPage /></Protected></Route>
      <Route path="/tick-analyser"><Protected><TickAnalyserPage /></Protected></Route>
      <Route path="/rise-fall"><Protected><RiseFallPage /></Protected></Route>
      <Route path="/only-up-down"><Protected><OnlyUpDownPage /></Protected></Route>
      <Route path="/high-low-tick"><Protected><HighLowTickPage /></Protected></Route>
      <Route path="/ai-signals"><Protected><AiSignalsPage /></Protected></Route>
      <Route path="/ai-trading"><Protected><AiTradingPage /></Protected></Route>
      <Route path="/deriv-trader"><Protected><DerivTraderPage /></Protected></Route>
      <Route path="/risk-calculator"><Protected><RiskCalculatorPage /></Protected></Route>
      <Route path="/reports"><Protected><ReportsPage /></Protected></Route>
      <Route path="/settings"><Protected><SettingsPage /></Protected></Route>
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  useEffect(() => {
    document.documentElement.classList.add("dark");
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <SymbolProvider>
          <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
            <Router />
          </WouterRouter>
        </SymbolProvider>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
