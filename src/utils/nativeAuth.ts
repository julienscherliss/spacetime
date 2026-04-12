import { Capacitor } from '@capacitor/core';
import { Browser } from '@capacitor/browser';
import { App as CapApp } from '@capacitor/app';
import { supabase } from '@/integrations/supabase/client';

/**
 * Published app domain — used to route through the Lovable managed OAuth proxy.
 */
const APP_DOMAIN = 'https://spaacetime.lovable.app';

/**
 * HTTPS callback URL (already in the Supabase allow-list).
 * The /auth/callback page acts as a "trampoline": it reads the tokens
 * from the URL and redirects into the native app via custom scheme.
 */
const HTTPS_CALLBACK = `${APP_DOMAIN}/auth/callback`;

/** Custom URL scheme the trampoline page redirects to */
const APP_SCHEME_CALLBACK = 'spaacetime://auth/callback';

/** True when running inside a native Capacitor shell (iOS / Android) */
export function isNativePlatform(): boolean {
  return Capacitor.isNativePlatform();
}

/**
 * Open Google OAuth in the system browser using the Lovable managed OAuth proxy.
 * This avoids requiring Google OAuth secrets in the Supabase auth config directly —
 * the /~oauth/initiate path on the published domain routes through Lovable's
 * managed OAuth broker which handles credentials automatically.
 */
export async function nativeGoogleSignIn(): Promise<void> {
  const oauthUrl = `${APP_DOMAIN}/~oauth/initiate?provider=google&redirect_uri=${encodeURIComponent(HTTPS_CALLBACK)}`;
  await Browser.open({ url: oauthUrl, windowName: '_self' });
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
