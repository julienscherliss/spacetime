import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';

/** Custom URL scheme for native app handoff */
const NATIVE_SCHEME_CALLBACK = 'com.spaacetime.app://auth/callback';

/**
 * OAuth callback bridge page.
 *
 * Serves two purposes:
 * 1. NATIVE bridge — receives ?code=... from Google OAuth, immediately redirects
 *    to the custom URL scheme so the native app picks up the code via deep link.
 * 2. WEB fallback — if the native redirect doesn't fire (desktop browser),
 *    exchanges the code for a session directly and navigates to /.
 */
export default function AuthCallback() {
  const navigate = useNavigate();
  const [status, setStatus] = useState<'redirecting' | 'fallback' | 'error'>('redirecting');
  const [errorMessage, setErrorMessage] = useState('');

  useEffect(() => {
    const search = window.location.search;
    const hash = window.location.hash;
    const params = new URLSearchParams(search);

    const code = params.get('code');
    const authError = params.get('error');
    const errorDesc = params.get('error_description');

    // Handle OAuth error
    if (authError) {
      setStatus('error');
      setErrorMessage(errorDesc || authError || 'Authentication failed');
      return;
    }

    const hasTokens = hash.includes('access_token');

    if (code) {
      // Build the native deep link URL with the code
      const nativeUrl = `${NATIVE_SCHEME_CALLBACK}?code=${encodeURIComponent(code)}`;

      // Attempt native handoff immediately
      window.location.href = nativeUrl;

      // If we're still here after 1.5s, the native app didn't open.
      // Fall back to web session handling.
      const fallbackTimer = setTimeout(async () => {
        setStatus('fallback');

        // Web fallback: exchange code for session in the browser
        try {
          const { error } = await supabase.auth.exchangeCodeForSession(code);
          if (error) {
            console.error('[AuthCallback] web fallback exchangeCode error:', error.message);
            setStatus('error');
            setErrorMessage(error.message);
            return;
          }
          navigate('/', { replace: true });
        } catch (e: any) {
          setStatus('error');
          setErrorMessage(e.message || 'Failed to complete sign in');
        }
      }, 1500);

      return () => clearTimeout(fallbackTimer);
    }

    if (hasTokens) {
      // Implicit flow — handle tokens directly (web only)
      const hashParams = new URLSearchParams(hash.slice(1));
      const access_token = hashParams.get('access_token');
      const refresh_token = hashParams.get('refresh_token');

      if (access_token && refresh_token) {
        supabase.auth.setSession({ access_token, refresh_token }).then(({ error }) => {
          if (error) {
            setStatus('error');
            setErrorMessage(error.message);
          } else {
            navigate('/', { replace: true });
          }
        });
      } else {
        navigate('/', { replace: true });
      }
      return;
    }

    // No code or tokens — just redirect home
    navigate('/', { replace: true });
  }, [navigate]);

  const manualOpenUrl = (() => {
    const params = new URLSearchParams(window.location.search);
    const code = params.get('code');
    if (code) return `${NATIVE_SCHEME_CALLBACK}?code=${encodeURIComponent(code)}`;
    return null;
  })();

  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center px-6 gap-6">
      {status === 'redirecting' && (
        <>
          <div className="text-[11px] font-mono text-muted-foreground/40 tracking-widest">
            RETURNING TO APP...
          </div>
          <div className="w-6 h-6 border-2 border-muted-foreground/20 border-t-primary rounded-full animate-spin" />
        </>
      )}

      {status === 'fallback' && (
        <>
          <div className="text-[11px] font-mono text-muted-foreground/40 tracking-widest text-center">
            COMPLETING SIGN IN...
          </div>
          <div className="w-6 h-6 border-2 border-muted-foreground/20 border-t-primary rounded-full animate-spin" />
          {manualOpenUrl && (
            <a
              href={manualOpenUrl}
              className="mt-4 px-4 py-2.5 rounded-sm border border-border bg-card text-foreground font-mono text-[11px] tracking-wider hover:bg-muted/50 transition-colors text-center"
            >
              TAP HERE TO OPEN APP
            </a>
          )}
        </>
      )}

      {status === 'error' && (
        <>
          <div className="text-[11px] font-mono text-destructive tracking-widest">
            SIGN IN FAILED
          </div>
          <p className="text-[10px] font-mono text-muted-foreground/60 text-center max-w-xs">
            {errorMessage}
          </p>
          <button
            onClick={() => navigate('/auth', { replace: true })}
            className="mt-2 px-4 py-2.5 rounded-sm bg-primary text-primary-foreground font-mono text-[11px] tracking-widest hover:bg-primary/90 transition-colors"
          >
            TRY AGAIN
          </button>
        </>
      )}
    </div>
  );
}
