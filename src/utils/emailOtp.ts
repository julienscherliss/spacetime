/**
 * ============================================================================
 *  EMAIL OTP — UNIFIED SOURCE OF TRUTH
 * ============================================================================
 *
 *  This is the ONLY place in the app that sends or verifies email OTP codes.
 *  Both web and native platforms call these functions. Do NOT duplicate this
 *  logic in components — import sendEmailOtp / verifyEmailOtp from here.
 *
 *  ── How the OTP flow works ──────────────────────────────────────────────────
 *
 *  1. User enters email and taps "Send me a code"
 *  2. We call supabase.auth.signInWithOtp({ email, options: { shouldCreateUser } })
 *     - This causes Supabase to send an auth email with `action_type = "magiclink"`
 *       (for both new and existing users — Supabase does NOT use "recovery" here)
 *     - The email payload contains `data.token` (a 6-digit code)
 *  3. Our auth-email-hook edge function renders the MagicLinkEmail template,
 *     which displays {token} as the visible 6-digit code. NO link, NO
 *     ConfirmationURL — pure in-app entry.
 *  4. User types the 6 digits in the app
 *  5. We call supabase.auth.verifyOtp({ email, token, type: 'email' })
 *     - This creates a session in-app. NO redirect, NO deep link, NO browser
 *       handoff, NO callback page.
 *  6. onAuthStateChange in useAuth() fires SIGNED_IN and routes the user.
 *
 *  ── HARD RULES (do NOT break) ───────────────────────────────────────────────
 *
 *  • OTP must NEVER call resetPasswordForEmail (that is the password-reset flow)
 *  • OTP must NEVER pass `emailRedirectTo` (that turns it into a magic-link)
 *  • OTP must NEVER depend on AuthCallback or any /auth/callback route
 *  • OTP must NEVER depend on Capacitor deep links (those are OAuth-only)
 *  • OTP must NEVER call exchangeCodeForSession
 *
 *  ── If users see a LINK in their email instead of a CODE ────────────────────
 *
 *  The app code is correct. The issue is the email TEMPLATE rendering
 *  {ConfirmationURL} instead of {token}. Check:
 *  supabase/functions/_shared/email-templates/magic-link.tsx
 *  supabase/functions/_shared/email-templates/recovery.tsx (defensive — see below)
 *
 *  ── Why "recovery" template also renders a token ────────────────────────────
 *
 *  In rare auth configurations the backend may label the send action as
 *  "magiclink" or "recovery", but the in-app code entry flow must still verify
 *  as `type: 'email'` when the user is entering the numeric token.
 *
 *  ============================================================================
 */
import { supabase } from '@/integrations/supabase/client';

type OtpAttemptMeta = {
  email: string;
  source: string;
  startedAt: number;
};

let lastSendAttempt: OtpAttemptMeta | null = null;
let activeSendRequest: Promise<{ error: Error | null }> | null = null;

function maskEmail(email: string) {
  const normalized = email.trim().toLowerCase();
  const [name, domain] = normalized.split('@');
  if (!name || !domain) return normalized;
  if (name.length <= 2) return `${name[0] ?? ''}•@${domain}`;
  return `${name[0]}${'•'.repeat(Math.max(name.length - 2, 1))}${name[name.length - 1]}@${domain}`;
}

function maskOtpSuffix(token: string) {
  if (!token) return '';
  const normalized = token.replace(/\s+/g, '').trim();
  if (normalized.length <= 2) return normalized;
  return `${'•'.repeat(normalized.length - 2)}${normalized.slice(-2)}`;
}

function getProjectRefFromUrl(url?: string | null) {
  if (!url) return null;
  const match = url.match(/^https?:\/\/([^.]+)\.supabase\.co/i);
  return match?.[1] ?? null;
}

export function getLastOtpSendMeta() {
  return lastSendAttempt;
}

/** Send a 6-digit code to the given email address. */
export async function sendEmailOtp(email: string, source = 'unknown'): Promise<{ error: Error | null }> {
  const normalizedEmail = email.trim().toLowerCase();
  const now = Date.now();

  if (activeSendRequest) {
    console.warn('[AUTH/OTP] sendEmailOtp blocked — request already in flight', {
      source,
      email: maskEmail(normalizedEmail),
    });
    return activeSendRequest;
  }

  lastSendAttempt = {
    email: normalizedEmail,
    source,
    startedAt: now,
  };

  console.log('[AUTH/OTP] sendEmailOtp called', {
    source,
    email: maskEmail(normalizedEmail),
    timestamp: new Date(now).toISOString(),
    resendCooldownSeconds: 60,
    projectRef: getProjectRefFromUrl(import.meta.env.VITE_SUPABASE_URL),
    shouldCreateUser: true,
    hasEmailRedirectTo: false,
  });

  // GUARD: must NOT pass emailRedirectTo — that turns it into a magic-link.
  // GUARD: must NOT call resetPasswordForEmail.
  activeSendRequest = supabase.auth.signInWithOtp({
    email: normalizedEmail,
    options: {
      shouldCreateUser: true,
      // emailRedirectTo intentionally OMITTED. Do not add this.
    },
  }).then(({ error }) => {
    const finishedAt = Date.now();
    if (error) {
      console.warn('[AUTH/OTP] sendEmailOtp failed', {
        source,
        email: maskEmail(normalizedEmail),
        timestamp: new Date(finishedAt).toISOString(),
        durationMs: finishedAt - now,
        result: 'error',
        message: error.message,
        code: (error as any)?.code ?? null,
      });
    } else {
      console.log('[AUTH/OTP] sendEmailOtp success', {
        source,
        email: maskEmail(normalizedEmail),
        timestamp: new Date(finishedAt).toISOString(),
        durationMs: finishedAt - now,
        result: 'queued',
      });
    }

    return { error: error as Error | null };
  }).finally(() => {
    activeSendRequest = null;
  });

  return activeSendRequest;
}

/**
 * Verify a 6-digit code in-app. Creates a session on success.
 *
 * HARD RULE: this performs exactly ONE verification attempt with
 * `type: 'email'`. There is no fallback to `recovery`, `magiclink`, or any
 * other alternate type.
 */
export async function verifyEmailOtp(
  email: string,
  token: string,
): Promise<{ error: Error | null }> {
  const normalizedEmail = email.trim().toLowerCase();
  const normalizedToken = token.replace(/\s+/g, '').trim();
  const maskedToken = maskOtpSuffix(normalizedToken);
  const verifyStartedAt = Date.now();
  const elapsedSinceSendSeconds = lastSendAttempt?.email === normalizedEmail
    ? Math.round((verifyStartedAt - lastSendAttempt.startedAt) / 1000)
    : null;

  console.log('[AUTH/OTP] verifyEmailOtp called', {
    email: maskEmail(normalizedEmail),
    timestamp: new Date(verifyStartedAt).toISOString(),
    tokenLength: normalizedToken.length,
    tokenFormat: /^\d+$/.test(normalizedToken) ? 'numeric' : 'non-numeric',
    tokenSuffix: maskedToken,
    verifyType: 'email',
    elapsedSinceSendSeconds,
    originalLength: token.length,
    normalizedLength: normalizedToken.length,
    whitespaceRemoved: token !== normalizedToken,
    projectRef: getProjectRefFromUrl(import.meta.env.VITE_SUPABASE_URL),
  });

  const { error } = await supabase.auth.verifyOtp({
    email: normalizedEmail,
    token: normalizedToken,
    type: 'email',
  });

  if (error) {
    console.warn('[AUTH/OTP] verifyEmailOtp failed', {
      email: maskEmail(normalizedEmail),
      timestamp: new Date().toISOString(),
      verifyType: 'email',
      elapsedSinceSendSeconds,
      tokenLength: normalizedToken.length,
      tokenFormat: /^\d+$/.test(normalizedToken) ? 'numeric' : 'non-numeric',
      tokenSuffix: maskedToken,
      message: error.message,
      code: (error as any)?.code ?? null,
      status: (error as any)?.status ?? null,
    });
    console.warn('[AUTH/OTP] hard stop after type=email failure');
    return { error: error as Error };
  }

  console.log('[AUTH/OTP] verifyEmailOtp success', {
    email: maskEmail(normalizedEmail),
    timestamp: new Date().toISOString(),
    verifyType: 'email',
    elapsedSinceSendSeconds,
  });
  return { error: null };
}
