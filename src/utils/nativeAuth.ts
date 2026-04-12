import { Capacitor } from '@capacitor/core';
import { Browser } from '@capacitor/browser';
import { App as CapApp } from '@capacitor/app';
import { supabase } from '@/integrations/supabase/client';
import { getOAuthProxyDomain, getAuthCallbackUrl, debugLogAuthEnv } from '@/utils/authEnvironment';

/** Custom URL scheme the trampoline page redirects to */
const APP_SCHEME_CALLBACK = 'spaacetime://auth/callback';

/** True when running inside a native Capacitor shell (iOS / Android) */
export function isNativePlatform(): boolean {
  return Capacitor.isNativePlatform();
}

/**
 * Open Google OAuth in the system browser using the Lovable managed OAuth proxy.
 * Routes through the production domain's /~oauth/initiate path which handles
 * credentials automatically via Lovable's managed OAuth broker.
 */
export async function nativeGoogleSignIn(): Promise<void> {
  const proxyDomain = getOAuthProxyDomain();
  const callbackUrl = getAuthCallbackUrl();

  debugLogAuthEnv('nativeGoogleSignIn');
  console.debug('[nativeAuth] oauthProxy:', proxyDomain, 'callback:', callbackUrl);

  const oauthUrl = `${proxyDomain}/~oauth/initiate?provider=google&redirect_uri=${encodeURIComponent(callbackUrl)}`;
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

    console.debug('[nativeAuth] deep-link received:', url);

    // Close the external browser tab
    try {
      await Browser.close();
    } catch (_) {
      /* browser may already be closed */
    }

    // Implicit flow: tokens arrive in the hash fragment
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
