import { Capacitor } from '@capacitor/core';
import { Browser } from '@capacitor/browser';
import { App as CapApp } from '@capacitor/app';
import { supabase } from '@/integrations/supabase/client';

/**
 * HTTPS callback URL (already in the Supabase allow-list).
 * The /auth/callback page acts as a "trampoline": it reads the tokens
 * from the URL and redirects into the native app via custom scheme.
 */
const HTTPS_CALLBACK = 'https://spaacetime.lovable.app/auth/callback';

/** Custom URL scheme the trampoline page redirects to */
const APP_SCHEME_CALLBACK = 'spaacetime://auth/callback';

/** True when running inside a native Capacitor shell (iOS / Android) */
export function isNativePlatform(): boolean {
  return Capacitor.isNativePlatform();
}

/**
 * Open Google OAuth in the system browser (not the in-app webview).
 * Uses the HTTPS callback URL so Supabase accepts it, then the
 * trampoline page bounces back into the app via custom URL scheme.
 */
export async function nativeGoogleSignIn(): Promise<void> {
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo: HTTPS_CALLBACK,
      skipBrowserRedirect: true,
    },
  });

  if (error) throw error;

  if (data.url) {
    await Browser.open({ url: data.url, windowName: '_self' });
  }
}

/**
 * Listen for deep-link callbacks after the trampoline page redirects
 * to the custom URL scheme.  Extracts tokens and sets the Supabase session.
 *
 * Call once on app startup (e.g. in a top-level useEffect).
 * Returns a cleanup function that removes the listener.
 */
export function setupDeepLinkListener(): () => void {
  const handle = CapApp.addListener('appUrlOpen', async ({ url }) => {
    if (!url.includes('auth/callback')) return;

    // Close the external browser tab
    try {
      await Browser.close();
    } catch (_) {
      /* browser may already be closed */
    }

    // Implicit flow: tokens arrive in the hash fragment
    // e.g. spaacetime://auth/callback#access_token=...&refresh_token=...
    const hashPart = url.split('#')[1];
    if (hashPart) {
      const params = new URLSearchParams(hashPart);
      const access_token = params.get('access_token');
      const refresh_token = params.get('refresh_token');

      if (access_token && refresh_token) {
        const { error } = await supabase.auth.setSession({
          access_token,
          refresh_token,
        });
        if (error) {
          console.error('[nativeAuth] setSession error:', error.message);
        }
      }
    }

    // PKCE flow fallback: code arrives as a query parameter
    const codePart = url.split('?')[1]?.split('#')[0];
    if (codePart) {
      const params = new URLSearchParams(codePart);
      const code = params.get('code');
      if (code) {
        const { error } = await supabase.auth.exchangeCodeForSession(code);
        if (error) {
          console.error('[nativeAuth] exchangeCode error:', error.message);
        }
      }
    }
  });

  return () => {
    handle.then((h) => h.remove());
  };
}
