import { Switch, Route, Router as WouterRouter } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useEffect } from "react";
import { SymbolProvider } from "@/context/SymbolContext";
import { ThemeProvider } from "@/context/ThemeContext";
import { DerivProvider } from "@/context/DerivContext";
import Layout from "@/components/Layout";
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
import TeachingPage from "@/pages/TeachingPage";
import HedgeTradingPage from "@/pages/HedgeTradingPage";
import SpeedLabPage from "@/pages/SpeedLabPage";
import NotFound from "@/pages/not-found";
import DerivCallbackPage from "@/pages/DerivCallbackPage";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { refetchOnWindowFocus: false, retry: 1 },
  },
});

function Router() {
  return (
    <Switch>
      <Route path="/">
        <Layout><DashboardPage /></Layout>
      </Route>
      <Route path="/dashboard">
        <Layout><DashboardPage /></Layout>
      </Route>
      <Route path="/auth/callback" component={DerivCallbackPage} />
      <Route path="/wide-eye"><Layout><WideEyePage /></Layout></Route>
      <Route path="/over-under"><Layout><OverUnderPage /></Layout></Route>
      <Route path="/even-odd"><Layout><EvenOddPage /></Layout></Route>
      <Route path="/match-differ"><Layout><MatchDifferPage /></Layout></Route>
      <Route path="/tick-analyser"><Layout><TickAnalyserPage /></Layout></Route>
      <Route path="/rise-fall"><Layout><RiseFallPage /></Layout></Route>
      <Route path="/only-up-down"><Layout><OnlyUpDownPage /></Layout></Route>
      <Route path="/high-low-tick"><Layout><HighLowTickPage /></Layout></Route>
      <Route path="/ai-signals"><Layout><AiSignalsPage /></Layout></Route>
      <Route path="/ai-trading"><Layout><AiTradingPage /></Layout></Route>
      <Route path="/deriv-trader"><Layout><DerivTraderPage /></Layout></Route>
      <Route path="/hedge-trading"><Layout><HedgeTradingPage /></Layout></Route>
      <Route path="/speed-lab"><Layout><SpeedLabPage /></Layout></Route>
      <Route path="/risk-calculator"><Layout><RiskCalculatorPage /></Layout></Route>
      <Route path="/reports"><Layout><ReportsPage /></Layout></Route>
      <Route path="/teaching"><Layout><TeachingPage /></Layout></Route>
      <Route path="/settings"><Layout><SettingsPage /></Layout></Route>
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
      <ThemeProvider>
        <TooltipProvider>
          <SymbolProvider>
            <DerivProvider>
              <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
                <Router />
              </WouterRouter>
            </DerivProvider>
          </SymbolProvider>
          <Toaster />
        </TooltipProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}

export default App;
