import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';

/**
 * OAuth callback trampoline page.
 *
 * On the WEB this page simply extracts the hash tokens and sets the session,
 * then redirects to /.
 *
 * On a NATIVE Capacitor build the external browser lands here (HTTPS URL).
 * We redirect to the custom URL scheme so the OS hands control back to the
 * native app, which picks up the tokens via the deep-link listener.
 */
export default function AuthCallback() {
  const navigate = useNavigate();

  useEffect(() => {
    const hash = window.location.hash;
    const search = window.location.search;

    // Detect if we should bounce to the native app.
    // The native app opens this page in the *system browser*, not inside
    // the Capacitor webview, so Capacitor.isNativePlatform() would be false.
    // Instead we check for a `native=1` query param that we append when
    // building the redirect URL (or we can check the User-Agent, but
    // the simplest reliable method is: if the page is being served at
    // spaacetime.lovable.app AND there are auth tokens in the hash,
    // attempt the native redirect).  If the custom scheme isn't handled
    // (i.e. user is on desktop web), we just fall through to the normal
    // web session flow.

    const hasTokens = hash.includes('access_token');
    const hasCode = search.includes('code=');

    // Try native redirect — if the custom scheme is registered, the OS
    // will open the app.  If not (desktop browser), nothing happens and
    // we fall through to the web flow below.
    if (hasTokens || hasCode) {
      const nativeUrl = `spaacetime://auth/callback${search}${hash}`;

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
        // Implicit flow — Supabase client auto-detects hash tokens
        // on page load, but we can also force it:
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
