import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { debugLogAuthEnv } from '@/utils/authEnvironment';

/**
 * OAuth callback trampoline page.
 *
 * On the WEB this page extracts the hash tokens and sets the session,
 * then redirects to /.
 *
 * On a NATIVE Capacitor build the external browser lands here (HTTPS URL).
 * We redirect to the custom URL scheme so the OS hands control back to the
 * native app, which picks up the tokens via the deep-link listener.
 */
export default function AuthCallback() {
  const navigate = useNavigate();

  useEffect(() => {
    debugLogAuthEnv('AuthCallback');

    const hash = window.location.hash;
    const search = window.location.search;

    const hasTokens = hash.includes('access_token');
    const hasCode = search.includes('code=');

    // Try native redirect — if the custom scheme is registered, the OS
    // will open the app.  If not (desktop browser), nothing happens and
    // we fall through to the web flow below.
    if (hasTokens || hasCode) {
      const nativeUrl = `spaacetime://auth/callback${search}${hash}`;

      console.debug('[AuthCallback] attempting native redirect:', nativeUrl);

      // Attempt to open the native app
      const iframe = document.createElement('iframe');
      iframe.style.display = 'none';
      iframe.src = nativeUrl;
      document.body.appendChild(iframe);

      // Also try window.location for browsers that block iframe schemes
      setTimeout(() => {
        window.location.href = nativeUrl;
      }, 100);
    }

    // Web fallback: if we're still here after a moment, handle tokens
    // directly in the browser session.
    const timer = setTimeout(async () => {
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
    }, 500);

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
