import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useColorSchemeStore, loadColorSchemeFromRemote, subscribeColorSchemeRealtime, setColorSchemeUser } from "@/store/colorSchemeStore";
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
import { useLibraryStore } from "@/store/libraryStore";
import { Paywall } from "@/components/Paywall";
import { SetPasswordPrompt } from "@/components/SetPasswordPrompt";
import { primeSoundEngine } from "@/utils/soundEngine";
import Index from "./pages/Index.tsx";
import Auth from "./pages/Auth.tsx";
import Landing from "./pages/Landing.tsx";
import ResetPassword from "./pages/ResetPassword.tsx";
import AuthCallback from "./pages/AuthCallback.tsx";
import NotFound from "./pages/NotFound.tsx";
import Privacy from "./pages/Privacy.tsx";
import Terms from "./pages/Terms.tsx";
import { LibraryDueDatePrompt } from "@/components/LibraryDueDatePrompt";
import { ErrorBoundary } from "@/components/ErrorBoundary";

const queryClient = new QueryClient();

function AuthGuard({ children }: { children: React.ReactNode }) {
  const { user, loading: authLoading } = useAuth();
  const { hasAccess, trialDaysLeft, loading: subLoading, refresh } = useSubscription(user?.id ?? null, !authLoading);
  const [searchParams, setSearchParams] = useSearchParams();
  const [checkoutPolling, setCheckoutPolling] = useState(false);
  const [showPasswordPrompt, setShowPasswordPrompt] = useState(false);
  useDataSync(user);

  // Sync color schemes across devices/tabs
  useEffect(() => {
    if (!user) {
      setColorSchemeUser(null);
      return;
    }
    // Set user ID synchronously so any local changes made during the
    // remote-load round-trip still get queued for save.
    setColorSchemeUser(user.id);
    loadColorSchemeFromRemote(user.id);
    const unsub = subscribeColorSchemeRealtime(user.id);
    return () => { unsub(); };
  }, [user?.id]);

  // Self-heal any tag value/label drift after data loads.
  useEffect(() => {
    if (!user) return;
    const t = setTimeout(() => {
      useLibraryStore.getState().repairCategoryDrift();
    }, 1500);
    return () => clearTimeout(t);
  }, [user?.id]);

  // Check if user logged in via OTP and has no password — show password prompt once
  useEffect(() => {
    if (!user) return;
    // Check if this is a passwordless user who hasn't been prompted yet
    const prompted = localStorage.getItem('password-prompt-dismissed');
    if (prompted) return;

    // If the user's app_metadata or identities indicate no password identity, prompt
    const hasPasswordIdentity = user.identities?.some(
      (i) => i.provider === 'email'
    );
    // Users who signed in via OTP without a password get an 'email' identity
    // but we check if their last sign-in was via OTP
    const lastSignIn = user.last_sign_in_at;
    const factors = user.factors;
    // Simple heuristic: if user was created via OTP (no password set),
    // the user_metadata won't have a password-related flag.
    // We check the amr claim from the session instead.
    // For now, we use a simpler approach: check if session has 'otp' in amr
  }, [user]);

  // Listen for OTP-based auth to trigger password prompt
  useEffect(() => {
    if (!user) return;
    const prompted = localStorage.getItem('password-prompt-dismissed');
    if (prompted) return;

    // Check the current session's amr (authentication methods reference)
    const checkAmr = async () => {
      const { data: { session } } = await (await import('@/integrations/supabase/client')).supabase.auth.getSession();
      if (!session) return;
      const amr = (session as any).amr;
      if (Array.isArray(amr) && amr.some((m: any) => m.method === 'otp')) {
        setShowPasswordPrompt(true);
      }
    };
    checkAmr();
  }, [user]);

  const handleDismissPasswordPrompt = () => {
    setShowPasswordPrompt(false);
    localStorage.setItem('password-prompt-dismissed', 'true');
  };

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

  return (
    <>
      {children}
      <SetPasswordPrompt open={showPasswordPrompt} onClose={handleDismissPasswordPrompt} />
    </>
  );
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
  const comfortMode = useTimezoneStore((s) => s.comfortMode);
  useEffect(() => {
    document.documentElement.classList.toggle('dark', darkMode);
    useColorSchemeStore.getState().setDarkMode(darkMode);
  }, [darkMode]);

  // Apply comfort mode class
  useEffect(() => {
    document.documentElement.classList.toggle('comfort', comfortMode);
  }, [comfortMode]);

  useEffect(() => {
    if (!isNativePlatform()) return;
    const cleanup = setupDeepLinkListener();
    return cleanup;
  }, []);

  useEffect(() => {
    const unlock = () => {
      void primeSoundEngine();
    };

    window.addEventListener('pointerdown', unlock, { passive: true });
    window.addEventListener('keydown', unlock, { passive: true });
    window.addEventListener('touchstart', unlock, { passive: true });

    return () => {
      window.removeEventListener('pointerdown', unlock);
      window.removeEventListener('keydown', unlock);
      window.removeEventListener('touchstart', unlock);
    };
  }, []);

  return (
  <ErrorBoundary>
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <LibraryDueDatePrompt />
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<LandingRedirect />} />
          <Route path="/auth" element={<AuthRedirect />} />
          <Route path="/auth/callback" element={<AuthCallback />} />
          <Route path="/reset-password" element={<ResetPassword />} />
          <Route path="/app" element={<AuthGuard><Index /></AuthGuard>} />
          <Route path="/privacy" element={<Privacy />} />
          <Route path="/terms" element={<Terms />} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
  </ErrorBoundary>
  );
};

export default App;
