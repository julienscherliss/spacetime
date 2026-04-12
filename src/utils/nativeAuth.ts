import { Capacitor } from '@capacitor/core';
import { Browser } from '@capacitor/browser';
import { App as CapApp } from '@capacitor/app';
import { supabase } from '@/integrations/supabase/client';

/** Custom URL scheme registered in iOS Info.plist */
const NATIVE_SCHEME = 'com.spaacetime.app';
const NATIVE_CALLBACK = `${NATIVE_SCHEME}://auth/callback`;

/** True when running inside a native Capacitor shell (iOS / Android) */
export function isNativePlatform(): boolean {
  return Capacitor.isNativePlatform();
}

/**
 * Open Google OAuth via Supabase PKCE flow in the in-app browser.
 *
 * Uses `skipBrowserRedirect: true` so we get the URL back and open it
 * ourselves with Capacitor Browser. The `redirectTo` points to the custom
 * URL scheme so the OS routes the callback directly back into the app —
 * no web trampoline page needed.
 */
export async function nativeGoogleSignIn(): Promise<void> {
  console.debug('[nativeAuth] starting Google sign-in, redirectTo:', NATIVE_CALLBACK);

  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo: NATIVE_CALLBACK,
      skipBrowserRedirect: true,
    },
  });

  if (error) {
    console.error('[nativeAuth] signInWithOAuth error:', error.message);
    throw error;
  }

  if (data?.url) {
    console.debug('[nativeAuth] opening OAuth URL in browser');
    await Browser.open({ url: data.url, windowName: '_self' });
  }
}

/**
 * Listen for deep-link callbacks after OAuth completes.
 * The OS routes `com.spaacetime.app://auth/callback?code=...` back to the app.
 * We extract the PKCE code, exchange it for a session, and close the browser.
 *
 * Call once on app startup (e.g. in a top-level useEffect).
 * Returns a cleanup function that removes the listener.
 */
export function setupDeepLinkListener(): () => void {
  const handle = CapApp.addListener('appUrlOpen', async ({ url }) => {
    console.debug('[nativeAuth] deep-link received:', url);

    if (!url.startsWith(`${NATIVE_SCHEME}://auth/callback`)) return;

    // Close the in-app browser
    try {
      await Browser.close();
    } catch (_) {
      /* browser may already be closed */
    }

    // PKCE flow: code arrives as a query parameter
    try {
      const parsed = new URL(url);
      const code = parsed.searchParams.get('code');

      if (code) {
        console.debug('[nativeAuth] exchanging code for session');
        const { error } = await supabase.auth.exchangeCodeForSession(code);
        if (error) {
          console.error('[nativeAuth] exchangeCode error:', error.message);
        } else {
          console.debug('[nativeAuth] session established successfully');
        }
        return;
      }
    } catch (_) {
      /* URL parsing may fail for hash-based URLs */
    }

    // Implicit flow fallback: tokens in hash fragment
    const hashPart = url.split('#')[1];
    if (hashPart) {
      const params = new URLSearchParams(hashPart);
      const access_token = params.get('access_token');
      const refresh_token = params.get('refresh_token');

      if (access_token && refresh_token) {
        console.debug('[nativeAuth] setting session from hash tokens');
        const { error } = await supabase.auth.setSession({
          access_token,
          refresh_token,
        });
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
