import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { debugLogAuthEnv } from '@/utils/authEnvironment';

/**
 * OAuth callback page for WEB flows only.
 *
 * Native Capacitor flows use the custom URL scheme (com.spaacetime.app://)
 * and never hit this page — they're handled by the deep-link listener in nativeAuth.ts.
 *
 * This page handles:
 * - Hash-based implicit flow tokens
 * - PKCE authorization codes
 */
export default function AuthCallback() {
  const navigate = useNavigate();

  useEffect(() => {
    debugLogAuthEnv('AuthCallback');

    const hash = window.location.hash;
    const search = window.location.search;

    const hasTokens = hash.includes('access_token');
    const hasCode = search.includes('code=');

    const handleCallback = async () => {
      if (hasTokens) {
        const params = new URLSearchParams(hash.slice(1));
        const access_token = params.get('access_token');
        const refresh_token = params.get('refresh_token');
        if (access_token && refresh_token) {
          await supabase.auth.setSession({ access_token, refresh_token });
        }
      } else if (hasCode) {
        const params = new URLSearchParams(search.slice(1));
        const code = params.get('code');
        if (code) {
          await supabase.auth.exchangeCodeForSession(code);
        }
      }
      navigate('/', { replace: true });
    };

    // Small delay to allow any native scheme redirect to fire first
    const timer = setTimeout(handleCallback, 300);
    return () => clearTimeout(timer);
  }, [navigate]);

  return (
    <div className="min-h-screen bg-background flex items-center justify-center">
      <div className="text-[11px] font-mono text-muted-foreground/40 tracking-widest">
        COMPLETING SIGN IN...
      </div>
    </div>
  );
}
