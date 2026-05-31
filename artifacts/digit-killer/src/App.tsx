import { Switch, Route, Router as WouterRouter, useLocation } from "wouter";
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

function isAuthenticated(): boolean {
  return (
    !!localStorage.getItem("user_token") ||
    !!localStorage.getItem("admin_token")
  );
}

/** Wraps a page with Layout and redirects to /login if not authenticated. */
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
      <Route path="/" component={SplashPage} />
      <Route path="/login" component={LoginPage} />
      <Route path="/dashboard">
        <Protected><DashboardPage /></Protected>
      </Route>
      <Route path="/wide-eye">
        <Protected><WideEyePage /></Protected>
      </Route>
      <Route path="/over-under">
        <Protected><OverUnderPage /></Protected>
      </Route>
      <Route path="/even-odd">
        <Protected><EvenOddPage /></Protected>
      </Route>
      <Route path="/match-differ">
        <Protected><MatchDifferPage /></Protected>
      </Route>
      <Route path="/tick-analyser">
        <Protected><TickAnalyserPage /></Protected>
      </Route>
      <Route path="/ai-signals">
        <Protected><AiSignalsPage /></Protected>
      </Route>
      <Route path="/reports">
        <Protected><ReportsPage /></Protected>
      </Route>
      <Route path="/settings">
        <Protected><SettingsPage /></Protected>
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
