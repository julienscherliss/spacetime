import { Capacitor } from '@capacitor/core';
import { Browser } from '@capacitor/browser';
import { App as CapApp } from '@capacitor/app';
import { supabase } from '@/integrations/supabase/client';

/** Custom URL scheme for deep-link callback */
const CALLBACK_URL = 'spaacetime://auth/callback';

/** True when running inside a native Capacitor shell (iOS / Android) */
export function isNativePlatform(): boolean {
  return Capacitor.isNativePlatform();
}

/**
 * Open Google OAuth in the system browser (not the in-app webview).
 * Supabase returns a redirect URL; we open it externally so the OS can
 * hand the callback deep-link back to the app.
 */
export async function nativeGoogleSignIn(): Promise<void> {
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo: CALLBACK_URL,
      skipBrowserRedirect: true,
    },
  });

  if (error) throw error;

  if (data.url) {
    await Browser.open({ url: data.url, windowName: '_self' });
  }
}

/**
 * Listen for deep-link callbacks after the external browser completes
 * the OAuth flow.  Extracts tokens from the URL hash (implicit grant)
 * and sets the Supabase session.
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
    // e.g. spaacetime://auth/callback?code=...
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
