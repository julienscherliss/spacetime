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
 *  In rare auth configurations Supabase may route signInWithOtp through the
 *  "recovery" action_type instead of "magiclink". To be defensive, BOTH the
 *  magic-link AND recovery templates render `{token}` as a 6-digit code so
 *  the user always sees a code, never a link. The actual flow we use is
 *  magiclink — recovery is a defensive fallback only.
 *
 *  ============================================================================
 */
import { supabase } from '@/integrations/supabase/client';

/** Send a 6-digit code to the given email address. */
export async function sendEmailOtp(email: string): Promise<{ error: Error | null }> {
  console.log('[AUTH/OTP] sendEmailOtp →', email);

  // GUARD: must NOT pass emailRedirectTo — that turns it into a magic-link.
  // GUARD: must NOT call resetPasswordForEmail.
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: {
      shouldCreateUser: true,
      // emailRedirectTo intentionally OMITTED. Do not add this.
    },
  });

  if (error) {
    console.warn('[AUTH/OTP] sendEmailOtp failed:', error.message);
  } else {
    console.log('[AUTH/OTP] sendEmailOtp success — email queued');
  }

  return { error: error as Error | null };
}

/**
 * Verify a 6-digit code in-app. Creates a session on success.
 *
 * IMPORTANT — Supabase routes `signInWithOtp` differently depending on whether
 * the user already exists:
 *   - NEW user → action_type "magiclink" → verify with type: 'email'
 *   - EXISTING user → action_type "recovery" (we observed this in auth logs:
 *     `user_recovery_requested`) → verify with type: 'recovery'
 *
 * Because the app cannot know in advance which path Supabase took, we try
 * `email` first and fall back to `recovery` on failure. Both paths produce
 * a real session — there is NO password reset side effect from verifying
 * a recovery OTP without then calling updateUser({ password }).
 */
export async function verifyEmailOtp(
  email: string,
  token: string,
): Promise<{ error: Error | null }> {
  console.log('[AUTH/OTP] verifyEmailOtp →', email, 'token.length=', token.length);

  // Attempt 1: standard email OTP (new users / magiclink path)
  const first = await supabase.auth.verifyOtp({ email, token, type: 'email' });
  if (!first.error) {
    console.log('[AUTH/OTP] verifyEmailOtp success via type=email');
    return { error: null };
  }
  console.warn('[AUTH/OTP] type=email failed:', first.error.message, '— trying recovery');

  // Attempt 2: recovery OTP (existing users — Supabase routes signInWithOtp
  // through user_recovery_requested for already-registered emails).
  const second = await supabase.auth.verifyOtp({ email, token, type: 'recovery' });
  if (!second.error) {
    console.log('[AUTH/OTP] verifyEmailOtp success via type=recovery');
    return { error: null };
  }
  console.warn('[AUTH/OTP] type=recovery also failed:', second.error.message);

  return { error: second.error as Error | null };
}
