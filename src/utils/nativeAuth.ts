import { Capacitor } from '@capacitor/core';
import { Browser } from '@capacitor/browser';
import { App as CapApp } from '@capacitor/app';
import { supabase } from '@/integrations/supabase/client';

/** Custom URL scheme registered in iOS Info.plist */
const NATIVE_SCHEME = 'com.spaacetime.app';
const NATIVE_CALLBACK = `${NATIVE_SCHEME}://auth/callback`;

/** HTTPS callback — the only redirect URL allowed by Lovable Cloud */
const HTTPS_CALLBACK = 'https://launchspacetime.com/auth/callback';

/** True when running inside a native Capacitor shell (iOS / Android) */
export function isNativePlatform(): boolean {
  return Capacitor.isNativePlatform();
}

/**
 * Open Google OAuth via the Lovable OAuth proxy in the in-app browser.
 *
 * The native app can't use supabase.auth.signInWithOAuth directly because
 * Google OAuth secrets are managed by the Lovable proxy, not set in Supabase.
 * Instead, we hit the /~oauth/initiate endpoint on the production domain,
 * which handles the full OAuth flow and redirects back to our HTTPS callback.
 */
export async function nativeGoogleSignIn(): Promise<void> {
  console.debug('[nativeAuth] starting Google sign-in via Lovable proxy');

  // Build the OAuth initiate URL through the Lovable proxy
  const redirectUri = encodeURIComponent(HTTPS_CALLBACK);
  const oauthUrl = `https://launchspacetime.com/~oauth/initiate?provider=google&redirect_uri=${redirectUri}`;

  console.debug('[nativeAuth] opening OAuth URL in browser:', oauthUrl);
  await Browser.open({ url: oauthUrl, windowName: '_self' });
}

/**
 * Listen for deep-link callbacks after the bridge page redirects
 * to com.spaacetime.app://auth/callback?code=...
 *
 * Call once on app startup. Returns a cleanup function.
 */
export function setupDeepLinkListener(): () => void {
  console.debug('[nativeAuth] registering deep-link listener');

  const handle = CapApp.addListener('appUrlOpen', async ({ url }) => {
    console.debug('[nativeAuth] appUrlOpen fired:', url);

    if (!url.startsWith(`${NATIVE_SCHEME}://auth/callback`)) {
      console.debug('[nativeAuth] ignoring non-auth deep link');
      return;
    }

    // Close the in-app browser
    try {
      await Browser.close();
      console.debug('[nativeAuth] browser closed');
    } catch (_) {
      console.debug('[nativeAuth] browser already closed or failed to close');
    }

    // Extract code from query params
    try {
      const parsed = new URL(url);
      const code = parsed.searchParams.get('code');
      const error_desc = parsed.searchParams.get('error_description');

      if (error_desc) {
        console.error('[nativeAuth] OAuth error:', error_desc);
        return;
      }

      if (code) {
        console.debug('[nativeAuth] code received, exchanging for session...');
        const { data, error } = await supabase.auth.exchangeCodeForSession(code);
        if (error) {
          console.error('[nativeAuth] exchangeCodeForSession error:', error.message);
        } else {
          console.debug('[nativeAuth] session established, user:', data.session?.user?.email);
          // Verify session is available
          const { data: sessionData } = await supabase.auth.getSession();
          console.debug('[nativeAuth] getSession confirms:', !!sessionData.session);
        }
        return;
      }

      console.warn('[nativeAuth] no code found in callback URL');
    } catch (e) {
      console.error('[nativeAuth] error parsing callback URL:', e);
    }

    // Implicit flow fallback: tokens in hash fragment
    const hashPart = url.split('#')[1];
    if (hashPart) {
      const params = new URLSearchParams(hashPart);
      const access_token = params.get('access_token');
      const refresh_token = params.get('refresh_token');
      if (access_token && refresh_token) {
        console.debug('[nativeAuth] setting session from hash tokens');
        const { error } = await supabase.auth.setSession({ access_token, refresh_token });
        if (error) {
          console.error('[nativeAuth] setSession error:', error.message);
        }
      }
    }
  });

  return () => {
    handle.then((h) => h.remove());
  };
}
