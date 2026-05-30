import { Switch, Route, Router as WouterRouter } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useEffect } from "react";
import { SymbolProvider } from "@/context/SymbolContext";
import Layout from "@/components/Layout";
import SplashPage from "@/pages/SplashPage";
import DashboardPage from "@/pages/DashboardPage";
import WideEyePage from "@/pages/WideEyePage";
import OverUnderPage from "@/pages/OverUnderPage";
import EvenOddPage from "@/pages/EvenOddPage";
import MatchDifferPage from "@/pages/MatchDifferPage";
import TickAnalyserPage from "@/pages/TickAnalyserPage";
import AiSignalsPage from "@/pages/AiSignalsPage";
import SettingsPage from "@/pages/SettingsPage";
import LoginPage from "@/pages/LoginPage";
import ReportsPage from "@/pages/ReportsPage";
import NotFound from "@/pages/not-found";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
});

function WithLayout({ children }: { children: React.ReactNode }) {
  return <Layout>{children}</Layout>;
}

function Router() {
  return (
    <Switch>
      <Route path="/" component={SplashPage} />
      <Route path="/login" component={LoginPage} />
      <Route path="/dashboard">
        <WithLayout><DashboardPage /></WithLayout>
      </Route>
      <Route path="/wide-eye">
        <WithLayout><WideEyePage /></WithLayout>
      </Route>
      <Route path="/over-under">
        <WithLayout><OverUnderPage /></WithLayout>
      </Route>
      <Route path="/even-odd">
        <WithLayout><EvenOddPage /></WithLayout>
      </Route>
      <Route path="/match-differ">
        <WithLayout><MatchDifferPage /></WithLayout>
      </Route>
      <Route path="/tick-analyser">
        <WithLayout><TickAnalyserPage /></WithLayout>
      </Route>
      <Route path="/ai-signals">
        <WithLayout><AiSignalsPage /></WithLayout>
      </Route>
      <Route path="/reports">
        <WithLayout><ReportsPage /></WithLayout>
      </Route>
      <Route path="/settings">
        <WithLayout><SettingsPage /></WithLayout>
      </Route>
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
