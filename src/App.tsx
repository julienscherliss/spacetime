import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useColorSchemeStore } from "@/store/colorSchemeStore";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes, Navigate } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useAuth } from "@/hooks/useAuth";
import { useTimezoneStore } from "@/store/timezoneStore";
import { useDataSync } from "@/hooks/useDataSync";
import { isNativePlatform, setupDeepLinkListener } from "@/utils/nativeAuth";
import { useSubscription } from "@/hooks/useSubscription";
import { Paywall } from "@/components/Paywall";
import Index from "./pages/Index.tsx";
import Auth from "./pages/Auth.tsx";
import Landing from "./pages/Landing.tsx";
import ResetPassword from "./pages/ResetPassword.tsx";
import AuthCallback from "./pages/AuthCallback.tsx";
import NotFound from "./pages/NotFound.tsx";

const queryClient = new QueryClient();

function AuthGuard({ children }: { children: React.ReactNode }) {
  const { user, loading: authLoading } = useAuth();
  const { hasAccess, trialDaysLeft, loading: subLoading, refresh } = useSubscription();
  const [searchParams, setSearchParams] = useSearchParams();
  const [checkoutPolling, setCheckoutPolling] = useState(false);
  useDataSync(user);

  // Poll subscription after successful checkout to wait for webhook
  useEffect(() => {
    if (searchParams.get("checkout") !== "success") return;
    setCheckoutPolling(true);
    let attempts = 0;
    const maxAttempts = 15;
    const interval = setInterval(async () => {
      attempts++;
      await refresh();
      if (attempts >= maxAttempts) {
        clearInterval(interval);
        setCheckoutPolling(false);
        // Clean up URL
        searchParams.delete("checkout");
        setSearchParams(searchParams, { replace: true });
      }
    }, 2000);

    return () => clearInterval(interval);
  }, [searchParams.get("checkout")]);

  // Stop polling once access is granted
  useEffect(() => {
    if (hasAccess && checkoutPolling) {
      setCheckoutPolling(false);
      searchParams.delete("checkout");
      setSearchParams(searchParams, { replace: true });
    }
  }, [hasAccess, checkoutPolling]);

  if (authLoading || subLoading || checkoutPolling) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-[11px] font-mono text-muted-foreground/40 tracking-widest">
          {checkoutPolling ? 'ACTIVATING YOUR SUBSCRIPTION...' : 'LOADING...'}
        </div>
      </div>
    );
  }
  if (!user) return <Navigate to="/auth" replace />;

  if (!hasAccess) {
    return <Paywall trialDaysLeft={0} trialExpired={true} onAccessGranted={refresh} />;
  }

  return <>{children}</>;
}

function AuthRedirect() {
  const { user, loading } = useAuth();
  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-[11px] font-mono text-muted-foreground/40 tracking-widest">LOADING...</div>
      </div>
    );
  }
  if (user) return <Navigate to="/app" replace />;
  return <Auth />;
}

function LandingRedirect() {
  const { user, loading } = useAuth();
  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-[11px] font-mono text-muted-foreground/40 tracking-widest">LOADING...</div>
      </div>
    );
  }
  if (user) return <Navigate to="/app" replace />;
  return <Landing />;
}

const App = () => {
  const darkMode = useTimezoneStore((s) => s.darkMode);
  useEffect(() => {
    document.documentElement.classList.toggle('dark', darkMode);
    useColorSchemeStore.getState().setDarkMode(darkMode);
  }, [darkMode]);

  useEffect(() => {
    if (!isNativePlatform()) return;
    const cleanup = setupDeepLinkListener();
    return cleanup;
  }, []);

  return (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<LandingRedirect />} />
          <Route path="/auth" element={<AuthRedirect />} />
          <Route path="/auth/callback" element={<AuthCallback />} />
          <Route path="/reset-password" element={<ResetPassword />} />
          <Route path="/app" element={<AuthGuard><Index /></AuthGuard>} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
  );
};

export default App;
