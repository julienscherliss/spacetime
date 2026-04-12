import { Capacitor } from '@capacitor/core';

/**
 * Auth environment detection & redirect URL generation.
 *
 * Environments:
 *   production-web  → https://launchspacetime.com
 *   preview-web     → *.lovable.app (preview/sandbox)
 *   local-dev       → http://localhost:*
 *   native-ios      → uses production domain for OAuth proxy, deep-links back via custom scheme
 */

const PRODUCTION_DOMAIN = 'https://launchspacetime.com';

/** The Lovable-managed OAuth proxy domain (used only for native flows) */
const LOVABLE_PROXY_DOMAIN = 'https://spaacetime.lovable.app';

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
 */
export function getAuthRedirectOrigin(): string {
  const env = detectAuthEnv();
  switch (env) {
    case 'production-web':
      return PRODUCTION_DOMAIN;
    case 'native-ios':
      // Native uses the production domain's OAuth proxy
      return PRODUCTION_DOMAIN;
    case 'preview-web':
    case 'local-dev':
      return window.location.origin;
  }
}

/**
 * Returns the full callback URL for OAuth flows (web).
 */
export function getAuthCallbackUrl(): string {
  return `${getAuthRedirectOrigin()}/auth/callback`;
}

/**
 * Returns the domain to use for the Lovable managed OAuth proxy (`/~oauth/initiate`).
 *
 * For production & preview, this is the same origin (the proxy works on custom domains).
 * For native iOS, we use the production custom domain.
 * For localhost, we fall back to the lovable.app proxy since localhost can't host it.
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
      // The /~oauth proxy doesn't run on localhost; use the lovable.app domain
      return LOVABLE_PROXY_DOMAIN;
  }
}

/**
 * Log auth environment info for debugging.
 */
export function debugLogAuthEnv(context: string): void {
  if (import.meta.env.DEV || import.meta.env.MODE === 'development') {
    const env = detectAuthEnv();
    console.debug(`[auth:${context}] environment: ${env}`);
    console.debug(`[auth:${context}] redirectOrigin: ${getAuthRedirectOrigin()}`);
    console.debug(`[auth:${context}] callbackUrl: ${getAuthCallbackUrl()}`);
    console.debug(`[auth:${context}] oauthProxy: ${getOAuthProxyDomain()}`);
  }
}
