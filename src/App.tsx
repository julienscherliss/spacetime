import { useEffect } from "react";
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
import Index from "./pages/Index.tsx";
import Auth from "./pages/Auth.tsx";
import ResetPassword from "./pages/ResetPassword.tsx";
import AuthCallback from "./pages/AuthCallback.tsx";
import NotFound from "./pages/NotFound.tsx";

const queryClient = new QueryClient();

function AuthGuard({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  useDataSync(user);
  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-[11px] font-mono text-muted-foreground/40 tracking-widest">LOADING...</div>
      </div>
    );
  }
  if (!user) return <Navigate to="/auth" replace />;
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
  if (user) return <Navigate to="/" replace />;
  return <Auth />;
}

const App = () => {
  const darkMode = useTimezoneStore((s) => s.darkMode);
  useEffect(() => {
    document.documentElement.classList.toggle('dark', darkMode);
    // Sync color scheme store with dark mode and apply matching scheme
    useColorSchemeStore.getState().setDarkMode(darkMode);
  }, [darkMode]);

  // Register deep-link listener for native OAuth callback
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
          <Route path="/auth" element={<AuthRedirect />} />
          <Route path="/auth/callback" element={<AuthCallback />} />
          <Route path="/reset-password" element={<ResetPassword />} />
          <Route path="/" element={<AuthGuard><Index /></AuthGuard>} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
  );
};

export default App;
