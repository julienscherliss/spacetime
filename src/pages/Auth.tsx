import { useState, useRef, useEffect, useCallback } from 'react';
import { useLocation } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { supabase } from '@/integrations/supabase/client';
import { lovable } from '@/integrations/lovable/index';
import { isNativePlatform } from '@/utils/nativeAuth';
import { Mail, Lock, User, ArrowRight, ArrowLeft } from 'lucide-react';
import { toast } from 'sonner';
import { getAuthRedirectOrigin, debugLogAuthEnv } from '@/utils/authEnvironment';

type Step = 'entry' | 'otp' | 'password-login';

export default function Auth() {
  const location = useLocation();
  const fromLanding = (location.state as any)?.plan;
  const [mode, setMode] = useState<'login' | 'signup'>(fromLanding ? 'signup' : 'login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [loading, setLoading] = useState(false);
  const native = isNativePlatform();

  // OTP state (mobile)
  const [step, setStep] = useState<Step>('entry');
  const [otpDigits, setOtpDigits] = useState<string[]>(['', '', '', '', '', '']);
  const [otpAttempts, setOtpAttempts] = useState(0);
  const [resendCooldown, setResendCooldown] = useState(0);
  const otpRefs = useRef<(HTMLInputElement | null)[]>([]);
  const cooldownRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Cooldown timer
  useEffect(() => {
    if (resendCooldown <= 0) {
      if (cooldownRef.current) clearInterval(cooldownRef.current);
      return;
    }
    cooldownRef.current = setInterval(() => {
      setResendCooldown((c) => {
        if (c <= 1) {
          if (cooldownRef.current) clearInterval(cooldownRef.current);
          return 0;
        }
        return c - 1;
      });
    }, 1000);
    return () => { if (cooldownRef.current) clearInterval(cooldownRef.current); };
  }, [resendCooldown > 0]);

  // Auto-focus first OTP input
  useEffect(() => {
    if (step === 'otp') {
      setTimeout(() => otpRefs.current[0]?.focus(), 100);
    }
  }, [step]);

  const sendOtp = useCallback(async () => {
    if (!email) { toast.error('Enter your email first'); return; }
    setLoading(true);
    try {
      // Email OTP flow — Supabase sends an email containing the {{ .Token }}
      // (configured in Auth → Email Templates → Magic Link).
      // We do NOT use ConfirmationURL / magic-link redirect for this flow;
      // the user enters the 6-digit token in-app and we verify with verifyOtp.
      const { error } = await supabase.auth.signInWithOtp({
        email,
        options: { shouldCreateUser: true },
      });
      if (error) {
        const msg = (error.message || '').toLowerCase();
        if (msg.includes('rate') || msg.includes('too many')) {
          toast.error('Too many requests. Please wait a moment before trying again.');
        } else {
          toast.error(error.message || 'Failed to send code');
        }
        return;
      }
      setStep('otp');
      setOtpDigits(['', '', '', '', '', '']);
      setOtpAttempts(0);
      setResendCooldown(30);
      toast.success('Check your email for a one-time code');
    } catch (err: any) {
      toast.error(err.message || 'Network error. Check your connection and try again.');
    } finally {
      setLoading(false);
    }
  }, [email]);

  const handleOtpChange = (index: number, value: string) => {
    if (!/^\d*$/.test(value)) return;
    const next = [...otpDigits];
    if (value.length > 1) {
      // Handle paste
      const chars = value.slice(0, 6).split('');
      chars.forEach((c, i) => { if (i + index < 6) next[i + index] = c; });
      setOtpDigits(next);
      const focusIdx = Math.min(index + chars.length, 5);
      otpRefs.current[focusIdx]?.focus();
      return;
    }
    next[index] = value;
    setOtpDigits(next);
    if (value && index < 5) otpRefs.current[index + 1]?.focus();
  };

  const handleOtpKeyDown = (index: number, e: React.KeyboardEvent) => {
    if (e.key === 'Backspace' && !otpDigits[index] && index > 0) {
      otpRefs.current[index - 1]?.focus();
    }
  };

  const verifyOtp = async () => {
    const token = otpDigits.join('');
    if (token.length !== 6) { toast.error('Enter all 6 digits'); return; }
    if (otpAttempts >= 5) { toast.error('Too many attempts. Request a new code.'); return; }

    setLoading(true);
    setOtpAttempts((a) => a + 1);
    try {
      // type: 'email' is the correct type for the 6-digit code sent via signInWithOtp.
      // This creates a session in-app — no redirect / deep link / browser handoff needed.
      const { error } = await supabase.auth.verifyOtp({
        email,
        token,
        type: 'email',
      });
      if (error) {
        const msg = (error.message || '').toLowerCase();
        if (msg.includes('expired')) {
          toast.error('Code expired. Request a new one.');
        } else if (msg.includes('rate') || msg.includes('too many')) {
          toast.error('Too many attempts. Please wait before trying again.');
        } else if (msg.includes('invalid') || msg.includes('token')) {
          toast.error('Invalid code. Try again.');
        } else {
          toast.error(error.message || 'Verification failed');
        }
        return;
      }
      // Success — onAuthStateChange in useAuth() handles routing.
    } catch (err: any) {
      toast.error(err.message || 'Network error. Check your connection and try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleEmailAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) return;
    setLoading(true);
    debugLogAuthEnv('emailAuth');
    try {
      if (mode === 'signup') {
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            data: { full_name: name },
            emailRedirectTo: getAuthRedirectOrigin(),
          },
        });
        if (error) throw error;
        if (data.user && data.user.identities && data.user.identities.length === 0) {
          toast.error('An account with this email already exists. Try signing in or resetting your password.');
          setMode('login');
          return;
        }
        toast.success('Check your email to verify your account');
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
      }
    } catch (err: any) {
      toast.error(err.message || 'Authentication failed');
    } finally {
      setLoading(false);
    }
  };

  const handleGoogle = async () => {
    setLoading(true);
    debugLogAuthEnv('googleSignIn');
    try {
      if (native) {
        toast.error('Google sign-in is not yet available on mobile. Please use email/password or sign in on the web app.');
        setLoading(false);
        return;
      }
      const redirectOrigin = getAuthRedirectOrigin();
      const result = await lovable.auth.signInWithOAuth('google', { redirect_uri: redirectOrigin });
      if (result.error) {
        toast.error(result.error.message || 'Google sign-in failed');
        setLoading(false);
        return;
      }
      if (result.redirected) return;
    } catch (err: any) {
      toast.error(err.message || 'Google sign-in failed');
      setLoading(false);
    }
  };

  const transition = { duration: 0.35, ease: [0.22, 1, 0.36, 1] as const };

  // ─── OTP code entry screen (mobile + web) ───
  if (step === 'otp') {
    return (
      <div
        className="min-h-screen bg-background flex items-center justify-center px-4"
        style={{
          paddingTop: 'max(4rem, calc(env(safe-area-inset-top, 0px) + 3rem))',
          paddingBottom: 'max(1rem, env(safe-area-inset-bottom, 0px))',
        }}
      >
        <motion.div
          key="otp"
          initial={{ opacity: 0, x: 40 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -40 }}
          transition={transition}
          className="w-full max-w-xs"
        >
          <button
            onClick={() => setStep('entry')}
            className="flex items-center gap-1 text-[10px] font-mono text-muted-foreground/50 tracking-widest mb-6 hover:text-foreground transition-colors"
          >
            <ArrowLeft size={10} /> BACK
          </button>

          <div className="text-center mb-6">
            <h1 className="text-2xl font-display font-bold text-foreground tracking-tight">
              ENTER CODE
            </h1>
            <p className="text-[10px] font-mono text-muted-foreground/50 tracking-wide mt-2 leading-relaxed max-w-[240px] mx-auto">
              We sent a 6-digit code to {email}. It expires in 10 minutes.
            </p>
          </div>

          {/* 6-digit inputs */}
          <div className="flex justify-center gap-2 mb-6">
            {otpDigits.map((digit, i) => (
              <input
                key={i}
                ref={(el) => { otpRefs.current[i] = el; }}
                type="text"
                inputMode="numeric"
                maxLength={i === 0 ? 6 : 1}
                value={digit}
                onChange={(e) => handleOtpChange(i, e.target.value)}
                onKeyDown={(e) => handleOtpKeyDown(i, e)}
                className="w-11 h-12 text-center text-lg font-mono font-bold bg-muted/40 border border-border rounded-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary/30 transition-all"
                autoComplete="one-time-code"
              />
            ))}
          </div>

          <button
            onClick={verifyOtp}
            disabled={loading || otpDigits.join('').length !== 6}
            className="w-full flex items-center justify-center gap-2 py-3 rounded-sm bg-primary text-primary-foreground font-mono text-[11px] tracking-widest hover:bg-primary/90 disabled:opacity-50 transition-colors"
          >
            VERIFY
            <ArrowRight size={12} />
          </button>

          <div className="text-center mt-4">
            <button
              onClick={sendOtp}
              disabled={loading || resendCooldown > 0}
              className="text-[10px] font-mono text-primary/60 hover:text-primary transition-colors disabled:opacity-30"
            >
              {resendCooldown > 0 ? `RESEND CODE (${resendCooldown}s)` : 'RESEND CODE'}
            </button>
          </div>

          {otpAttempts >= 5 && (
            <p className="text-center mt-3 text-[9px] font-mono text-destructive/80">
              Too many attempts. Please request a new code.
            </p>
          )}
        </motion.div>
      </div>
    );
  }

  // ─── Password login screen (mobile) ───
  if (native && step === 'password-login') {
    return (
      <div
        className="min-h-screen bg-background flex items-center justify-center px-4"
        style={{
          paddingTop: 'max(4rem, calc(env(safe-area-inset-top, 0px) + 3rem))',
          paddingBottom: 'max(1rem, env(safe-area-inset-bottom, 0px))',
        }}
      >
        <motion.div
          key="pw"
          initial={{ opacity: 0, x: 40 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -40 }}
          transition={transition}
          className="w-full max-w-xs"
        >
          <button
            onClick={() => setStep('entry')}
            className="flex items-center gap-1 text-[10px] font-mono text-muted-foreground/50 tracking-widest mb-6 hover:text-foreground transition-colors"
          >
            <ArrowLeft size={10} /> BACK
          </button>

          <div className="text-center mb-6">
            <h1 className="text-2xl font-display font-bold text-foreground tracking-tight">
              SPACETIME
            </h1>
            <p className="text-[10px] font-mono text-muted-foreground/50 tracking-widest mt-1">
              {mode === 'login' ? 'SIGN IN WITH PASSWORD' : 'CREATE ACCOUNT'}
            </p>
          </div>

          <form onSubmit={handleEmailAuth} className="space-y-3">
            {mode === 'signup' && (
              <div className="relative">
                <User size={12} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground/40" />
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Name"
                  className="w-full bg-muted/40 border border-border rounded-sm pl-8 pr-3 py-2.5 text-sm font-mono text-foreground placeholder:text-muted-foreground/30 focus:outline-none focus:ring-1 focus:ring-primary/30"
                />
              </div>
            )}
            <div className="relative">
              <Mail size={12} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground/40" />
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="Email"
                required
                className="w-full bg-muted/40 border border-border rounded-sm pl-8 pr-3 py-2.5 text-sm font-mono text-foreground placeholder:text-muted-foreground/30 focus:outline-none focus:ring-1 focus:ring-primary/30"
              />
            </div>
            <div className="relative">
              <Lock size={12} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground/40" />
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Password"
                required
                minLength={6}
                className="w-full bg-muted/40 border border-border rounded-sm pl-8 pr-3 py-2.5 text-sm font-mono text-foreground placeholder:text-muted-foreground/30 focus:outline-none focus:ring-1 focus:ring-primary/30"
              />
            </div>
            {mode === 'login' && (
              <div className="text-right">
                <button
                  type="button"
                  onClick={() => { setStep('entry'); sendOtp(); }}
                  disabled={loading || !email}
                  className="text-[9px] font-mono text-primary/60 hover:text-primary hover:underline transition-colors disabled:opacity-50"
                >
                  FORGOT? EMAIL ME A CODE
                </button>
              </div>
            )}
            <button
              type="submit"
              disabled={loading}
              className="w-full flex items-center justify-center gap-2 py-2.5 rounded-sm bg-primary text-primary-foreground font-mono text-[11px] tracking-widest hover:bg-primary/90 disabled:opacity-50 transition-colors"
            >
              {mode === 'login' ? 'SIGN IN' : 'CREATE ACCOUNT'}
              <ArrowRight size={12} />
            </button>
          </form>

          <p className="text-center mt-4 text-[10px] font-mono text-muted-foreground/40">
            {mode === 'login' ? "Don't have an account?" : 'Already have an account?'}{' '}
            <button onClick={() => setMode(mode === 'login' ? 'signup' : 'login')} className="text-primary hover:underline">
              {mode === 'login' ? 'Sign up' : 'Sign in'}
            </button>
          </p>
        </motion.div>
      </div>
    );
  }

  // ─── Native mobile entry screen ───
  if (native && step === 'entry') {
    return (
      <div
        className="min-h-screen bg-background flex items-center justify-center px-4"
        style={{
          paddingTop: 'max(4rem, calc(env(safe-area-inset-top, 0px) + 3rem))',
          paddingBottom: 'max(1rem, env(safe-area-inset-bottom, 0px))',
        }}
      >
        <motion.div
          key="entry"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={transition}
          className="w-full max-w-xs"
        >
          <div className="text-center mb-8">
            <h1 className="text-2xl font-display font-bold text-foreground tracking-tight">
              SPACETIME
            </h1>
            <p className="text-[11px] font-mono text-muted-foreground/50 tracking-widest mt-1">
              SIGN IN
            </p>
          </div>

          {/* Email input */}
          <div className="relative mb-4">
            <Mail size={12} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground/40" />
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Email"
              className="w-full bg-muted/40 border border-border rounded-sm pl-8 pr-3 py-2.5 text-sm font-mono text-foreground placeholder:text-muted-foreground/30 focus:outline-none focus:ring-1 focus:ring-primary/30"
            />
          </div>

          {/* Primary: Send code */}
          <button
            onClick={sendOtp}
            disabled={loading || !email}
            className="w-full flex items-center justify-center gap-2 py-3 rounded-sm bg-primary text-primary-foreground font-mono text-[11px] tracking-widest hover:bg-primary/90 disabled:opacity-50 transition-colors mb-3"
          >
            SEND ME A CODE
            <ArrowRight size={12} />
          </button>

          {/* Secondary: Password login */}
          <button
            onClick={() => setStep('password-login')}
            className="w-full py-2.5 rounded-sm border border-border text-muted-foreground font-mono text-[10px] tracking-widest hover:bg-muted/30 transition-colors"
          >
            SIGN IN WITH PASSWORD
          </button>
        </motion.div>
      </div>
    );
  }

  // ─── Web (desktop) auth — unchanged ───
  return (
    <div
      className="min-h-screen bg-background flex items-center justify-center px-4"
      style={{
        paddingTop: 'max(4rem, calc(env(safe-area-inset-top, 0px) + 3rem))',
        paddingBottom: 'max(1rem, env(safe-area-inset-bottom, 0px))',
      }}
    >
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={transition}
        className="w-full max-w-xs"
      >
        <div className="text-center mb-8">
          <h1 className="text-2xl font-display font-bold text-foreground tracking-tight">
            SPACETIME
          </h1>
          <p className="text-[11px] font-mono text-muted-foreground/50 tracking-widest mt-1">
            {mode === 'login' ? 'SIGN IN' : 'CREATE ACCOUNT'}
          </p>
        </div>

        {/* Google */}
        <>
          <button
            onClick={handleGoogle}
            disabled={loading}
            className="w-full flex items-center justify-center gap-2 py-2.5 rounded-sm border border-border bg-card text-foreground font-mono text-[11px] tracking-wider hover:bg-muted/50 transition-colors disabled:opacity-50 mb-4"
          >
            <svg viewBox="0 0 24 24" width="14" height="14">
              <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"/>
              <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
              <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
              <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
            </svg>
            Continue with Google
          </button>

          <div className="flex items-center gap-3 mb-4">
            <div className="flex-1 h-px bg-border/50" />
            <span className="text-[9px] font-mono text-muted-foreground/30 tracking-widest">OR</span>
            <div className="flex-1 h-px bg-border/50" />
          </div>
        </>

        {/* Email form */}
        <form onSubmit={handleEmailAuth} className="space-y-3">
          {mode === 'signup' && (
            <div className="relative">
              <User size={12} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground/40" />
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Name"
                className="w-full bg-muted/40 border border-border rounded-sm pl-8 pr-3 py-2.5 text-sm font-mono text-foreground placeholder:text-muted-foreground/30 focus:outline-none focus:ring-1 focus:ring-primary/30"
              />
            </div>
          )}
          <div className="relative">
            <Mail size={12} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground/40" />
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Email"
              required
              className="w-full bg-muted/40 border border-border rounded-sm pl-8 pr-3 py-2.5 text-sm font-mono text-foreground placeholder:text-muted-foreground/30 focus:outline-none focus:ring-1 focus:ring-primary/30"
            />
          </div>
          <div className="relative">
            <Lock size={12} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground/40" />
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Password"
              required
              minLength={6}
              className="w-full bg-muted/40 border border-border rounded-sm pl-8 pr-3 py-2.5 text-sm font-mono text-foreground placeholder:text-muted-foreground/30 focus:outline-none focus:ring-1 focus:ring-primary/30"
            />
          </div>
          {mode === 'login' && (
            <div className="text-right">
              <button
                type="button"
                onClick={sendOtp}
                disabled={loading || !email}
                className="text-[9px] font-mono text-primary/60 hover:text-primary hover:underline transition-colors disabled:opacity-50"
              >
                FORGOT? EMAIL ME A CODE
              </button>
            </div>
          )}
          <button
            type="submit"
            disabled={loading}
            className="w-full flex items-center justify-center gap-2 py-2.5 rounded-sm bg-primary text-primary-foreground font-mono text-[11px] tracking-widest hover:bg-primary/90 disabled:opacity-50 transition-colors"
          >
            {mode === 'login' ? 'SIGN IN' : 'CREATE ACCOUNT'}
            <ArrowRight size={12} />
          </button>
        </form>

        {/* Email me a code instead — passwordless OTP */}
        {mode === 'login' && (
          <button
            type="button"
            onClick={sendOtp}
            disabled={loading || !email}
            className="w-full mt-3 py-2.5 rounded-sm border border-border text-muted-foreground hover:text-foreground font-mono text-[10px] tracking-widest hover:bg-muted/30 transition-colors disabled:opacity-50"
          >
            EMAIL ME A CODE INSTEAD
          </button>
        )}

        <p className="text-center mt-4 text-[10px] font-mono text-muted-foreground/40">
          {mode === 'login' ? "Don't have an account?" : 'Already have an account?'}{' '}
          <button onClick={() => setMode(mode === 'login' ? 'signup' : 'login')} className="text-primary hover:underline">
            {mode === 'login' ? 'Sign up' : 'Sign in'}
          </button>
        </p>
      </motion.div>
    </div>
  );
}
