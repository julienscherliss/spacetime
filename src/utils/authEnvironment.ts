import { Capacitor } from '@capacitor/core';

/**
 * Auth environment detection & redirect URL generation.
 *
 * Environments:
 *   production-web  → https://launchspacetime.com
 *   preview-web     → *.lovable.app (preview/sandbox)
 *   local-dev       → http://localhost:*
 *   native-ios      → uses Supabase PKCE with custom URL scheme
 */

const PRODUCTION_DOMAIN = 'https://launchspacetime.com';

/** The Lovable-managed OAuth proxy domain (used for localhost web dev only) */
const LOVABLE_PROXY_DOMAIN = 'https://spaacetime.lovable.app';

/** Custom URL scheme for native deep linking */
const NATIVE_SCHEME_CALLBACK = 'com.spaacetime.app://auth/callback';

export type AuthEnv = 'production-web' | 'preview-web' | 'local-dev' | 'native-ios';

export function detectAuthEnv(): AuthEnv {
  if (Capacitor.isNativePlatform()) return 'native-ios';

  const host = window.location.hostname;
  if (host === 'launchspacetime.com' || host === 'www.launchspacetime.com') return 'production-web';
  if (host.includes('lovable.app') || host.includes('lovableproject.com')) return 'preview-web';
  return 'local-dev';
}

/**
 * Returns the base origin to use for auth redirects in the current environment.
 * For native iOS this returns the custom scheme callback URL.
 */
export function getAuthRedirectOrigin(): string {
  const env = detectAuthEnv();
  switch (env) {
    case 'production-web':
      return PRODUCTION_DOMAIN;
    case 'native-ios':
      return NATIVE_SCHEME_CALLBACK; // full callback URL for native
    case 'preview-web':
    case 'local-dev':
      return window.location.origin;
  }
}

/**
 * Returns the full callback URL for OAuth flows.
 */
export function getAuthCallbackUrl(): string {
  const env = detectAuthEnv();
  if (env === 'native-ios') return NATIVE_SCHEME_CALLBACK;
  return `${getAuthRedirectOrigin()}/auth/callback`;
}

/**
 * Returns the domain to use for the Lovable managed OAuth proxy (`/~oauth/initiate`).
 * Only used for web flows. Native iOS uses Supabase PKCE directly.
 */
export function getOAuthProxyDomain(): string {
  const env = detectAuthEnv();
  switch (env) {
    case 'production-web':
      return PRODUCTION_DOMAIN;
    case 'preview-web':
      return window.location.origin;
    case 'native-ios':
      return PRODUCTION_DOMAIN;
    case 'local-dev':
      return LOVABLE_PROXY_DOMAIN;
  }
}

/**
 * Log auth environment info for debugging.
 */
export function debugLogAuthEnv(context: string): void {
  const env = detectAuthEnv();
  console.debug(`[auth:${context}] environment: ${env}`);
  console.debug(`[auth:${context}] redirectOrigin: ${getAuthRedirectOrigin()}`);
  console.debug(`[auth:${context}] callbackUrl: ${getAuthCallbackUrl()}`);
}
