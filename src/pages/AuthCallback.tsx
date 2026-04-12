import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';

const NATIVE_SCHEME_CALLBACK = 'com.spaacetime.app://auth/callback';

export default function AuthCallback() {
  const navigate = useNavigate();
  const [status, setStatus] = useState<'redirecting' | 'manual' | 'completing' | 'error'>('redirecting');
  const [errorMessage, setErrorMessage] = useState('');

  useEffect(() => {
    const search = window.location.search;
    const hash = window.location.hash;
    const params = new URLSearchParams(search);

    const code = params.get('code');
    const authError = params.get('error');
    const errorDesc = params.get('error_description');
    const nativeBridge = params.get('native') === '1';

    if (authError) {
      setStatus('error');
      setErrorMessage(errorDesc || authError || 'Authentication failed');
      return;
    }

    const hasTokens = hash.includes('access_token');

    if (code) {
      const nativeUrl = `${NATIVE_SCHEME_CALLBACK}?code=${encodeURIComponent(code)}`;

      if (nativeBridge) {
        console.debug('[AuthCallback] native bridge detected, returning to app');
        window.location.replace(nativeUrl);

        const manualTimer = window.setTimeout(() => {
          setStatus('manual');
        }, 1200);

        return () => window.clearTimeout(manualTimer);
      }

      setStatus('completing');
      supabase.auth.exchangeCodeForSession(code)
        .then(({ error }) => {
          if (error) {
            console.error('[AuthCallback] exchangeCodeForSession error:', error.message);
            setStatus('error');
            setErrorMessage(error.message);
            return;
          }
          navigate('/', { replace: true });
        })
        .catch((e: any) => {
          setStatus('error');
          setErrorMessage(e.message || 'Failed to complete sign in');
        });
      return;
    }

    if (hasTokens) {
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

      {status === 'manual' && (
        <>
          <div className="text-[11px] font-mono text-muted-foreground/40 tracking-widest text-center max-w-xs leading-relaxed">
            SIGN-IN FINISHED. TAP BELOW TO RETURN TO THE APP.
          </div>
          {manualOpenUrl && (
            <a
              href={manualOpenUrl}
              className="px-4 py-2.5 rounded-sm border border-primary/20 bg-card text-primary font-mono text-[11px] tracking-wider hover:bg-primary/5 transition-colors text-center"
            >
              OPEN APP
            </a>
          )}
        </>
      )}

      {status === 'completing' && (
        <>
          <div className="text-[11px] font-mono text-muted-foreground/40 tracking-widest text-center">
            COMPLETING SIGN IN...
          </div>
          <div className="w-6 h-6 border-2 border-muted-foreground/20 border-t-primary rounded-full animate-spin" />
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
