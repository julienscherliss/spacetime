import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Bug, Sparkles, HelpCircle, MessageSquare, ImagePlus, Check, Loader2, ChevronLeft } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

type FeedbackType = 'bug' | 'feature' | 'confusion' | 'general';

interface FeedbackModalProps {
  open: boolean;
  onClose: () => void;
}

const TYPE_OPTIONS: { type: FeedbackType; icon: typeof Bug; label: string; sub: string; tone: string }[] = [
  { type: 'bug', icon: Bug, label: 'Report a bug', sub: 'Something broken or wrong', tone: 'text-destructive' },
  { type: 'feature', icon: Sparkles, label: 'Request a feature', sub: 'An idea to make Spacetime better', tone: 'text-primary' },
  { type: 'confusion', icon: HelpCircle, label: 'Something is confusing', sub: 'Hard to find or unclear', tone: 'text-yellow-600' },
  { type: 'general', icon: MessageSquare, label: 'General feedback', sub: 'Anything else on your mind', tone: 'text-foreground' },
];

const SUCCESS_MESSAGES = [
  'Thanks — this helps a lot.',
  "Got it. We'll take a look.",
  'Sent. Thanks for helping improve Spacetime.',
];

const DRAFT_KEY = 'feedback-draft-v1';

interface Draft {
  type?: FeedbackType;
  message?: string;
  expected?: string;
  location?: string;
  email?: string;
}

function loadDraft(): Draft {
  try { return JSON.parse(localStorage.getItem(DRAFT_KEY) || '{}'); } catch { return {}; }
}
function saveDraft(d: Draft) { localStorage.setItem(DRAFT_KEY, JSON.stringify(d)); }
function clearDraft() { localStorage.removeItem(DRAFT_KEY); }

function detectPlatform(): { platform: string; browser: string; os: string } {
  const ua = navigator.userAgent;
  let os = 'unknown';
  if (/Windows/i.test(ua)) os = 'Windows';
  else if (/Mac OS/i.test(ua)) os = 'macOS';
  else if (/iPhone|iPad/i.test(ua)) os = 'iOS';
  else if (/Android/i.test(ua)) os = 'Android';
  else if (/Linux/i.test(ua)) os = 'Linux';
  let browser = 'unknown';
  if (/Edg\//.test(ua)) browser = 'Edge';
  else if (/Chrome\//.test(ua)) browser = 'Chrome';
  else if (/Firefox\//.test(ua)) browser = 'Firefox';
  else if (/Safari\//.test(ua)) browser = 'Safari';
  const platform = /Mobi|Android|iPhone|iPad/i.test(ua) ? 'mobile' : 'desktop';
  return { platform, browser, os };
}

export function FeedbackModal({ open, onClose }: FeedbackModalProps) {
  const [step, setStep] = useState<'choose' | 'form' | 'success'>('choose');
  const [type, setType] = useState<FeedbackType | null>(null);
  const [message, setMessage] = useState('');
  const [expected, setExpected] = useState('');
  const [location, setLocation] = useState('');
  const [email, setEmail] = useState('');
  const [screenshot, setScreenshot] = useState<File | null>(null);
  const [screenshotPreview, setScreenshotPreview] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [successMsg, setSuccessMsg] = useState(SUCCESS_MESSAGES[0]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Restore draft on open
  useEffect(() => {
    if (!open) return;
    const d = loadDraft();
    if (d.type) {
      setType(d.type);
      setStep('form');
      setMessage(d.message || '');
      setExpected(d.expected || '');
      setLocation(d.location || '');
      setEmail(d.email || '');
    } else {
      setStep('choose');
      setType(null);
      setMessage(''); setExpected(''); setLocation(''); setEmail('');
    }
    setScreenshot(null);
    setScreenshotPreview(null);
  }, [open]);

  // Persist draft
  useEffect(() => {
    if (!open || step !== 'form' || !type) return;
    saveDraft({ type, message, expected, location, email });
  }, [open, step, type, message, expected, location, email]);

  const handlePickType = (t: FeedbackType) => {
    setType(t);
    setStep('form');
  };

  const handleScreenshot = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      toast.error('Image too large (max 5MB)');
      return;
    }
    setScreenshot(file);
    const reader = new FileReader();
    reader.onload = (ev) => setScreenshotPreview(ev.target?.result as string);
    reader.readAsDataURL(file);
  };

  const handleSubmit = async () => {
    if (!type || !message.trim()) {
      toast.error('Please add a message');
      return;
    }
    setSubmitting(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const { platform, browser, os } = detectPlatform();

      // Upload screenshot if present
      let screenshotUrl: string | null = null;
      if (screenshot) {
        const ext = screenshot.name.split('.').pop() || 'png';
        const path = `${user?.id || 'anon'}/${Date.now()}.${ext}`;
        const { data: up, error: upErr } = await supabase.storage
          .from('feedback-screenshots')
          .upload(path, screenshot, { contentType: screenshot.type });
        if (upErr) throw upErr;
        const { data: pub } = supabase.storage.from('feedback-screenshots').getPublicUrl(up.path);
        screenshotUrl = pub.publicUrl;
      }

      const metadata = {
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        userAgent: navigator.userAgent,
        language: navigator.language,
        referrer: document.referrer,
        viewport: `${window.innerWidth}x${window.innerHeight}`,
      };

      const { error } = await supabase.from('feedback').insert({
        user_id: user?.id || null,
        followup_email: email.trim() || user?.email || null,
        type,
        message: message.trim(),
        expected_behavior: expected.trim() || null,
        location_context: location.trim() || null,
        screenshot_url: screenshotUrl,
        current_route: window.location.pathname + window.location.search,
        app_version: 'web-1.0',
        platform,
        browser,
        os,
        screen_size: `${window.screen.width}x${window.screen.height}`,
        metadata,
      });

      if (error) throw error;

      clearDraft();
      setSuccessMsg(SUCCESS_MESSAGES[Math.floor(Math.random() * SUCCESS_MESSAGES.length)]);
      setStep('success');
      // Auto-close after a moment
      setTimeout(() => { onClose(); }, 2200);
    } catch (err: any) {
      console.error('[Feedback] submit failed', err);
      toast.error(err.message || 'Could not send. Try again?');
    } finally {
      setSubmitting(false);
    }
  };

  if (!open) return null;

  const currentType = TYPE_OPTIONS.find((t) => t.type === type);

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-[120] flex items-end sm:items-center justify-center p-0 sm:p-4">
        <motion.div
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          className="absolute inset-0 bg-background/70 backdrop-blur-sm"
          onClick={() => !submitting && onClose()}
        />
        <motion.div
          initial={{ opacity: 0, y: 20, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 20, scale: 0.98 }}
          transition={{ type: 'spring', damping: 26, stiffness: 320 }}
          className="relative w-full sm:max-w-md bg-card border border-border rounded-t-xl sm:rounded-xl shadow-2xl flex flex-col max-h-[90vh]"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex items-center justify-between px-5 py-3.5 border-b border-border/40">
            <div className="flex items-center gap-2">
              {step === 'form' && (
                <button
                  onClick={() => { setStep('choose'); setType(null); }}
                  className="p-1 -ml-1 text-muted-foreground hover:text-foreground transition-colors rounded-md"
                  disabled={submitting}
                >
                  <ChevronLeft size={16} strokeWidth={1.5} />
                </button>
              )}
              <h2 className="font-display font-bold text-foreground tracking-tight text-[14px]">
                {step === 'choose' && 'Send feedback'}
                {step === 'form' && currentType?.label}
                {step === 'success' && 'Thank you'}
              </h2>
            </div>
            <button
              onClick={onClose}
              disabled={submitting}
              className="text-muted-foreground hover:text-foreground transition-colors p-1 -mr-1"
            >
              <X size={16} strokeWidth={1.5} />
            </button>
          </div>

          {/* Body */}
          <div className="flex-1 overflow-y-auto p-5">
            {step === 'choose' && (
              <div className="space-y-3">
                <p className="text-[12px] font-mono text-muted-foreground leading-relaxed">
                  What would you like to share?
                </p>
                <div className="space-y-1.5">
                  {TYPE_OPTIONS.map(({ type: t, icon: Icon, label, sub, tone }) => (
                    <button
                      key={t}
                      onClick={() => handlePickType(t)}
                      className="w-full flex items-start gap-3 p-3 rounded-lg border border-border/50 hover:border-border hover:bg-muted/40 transition-colors text-left group"
                    >
                      <Icon size={16} strokeWidth={1.5} className={`${tone} mt-0.5 shrink-0`} />
                      <div className="flex-1 min-w-0">
                        <div className="text-[13px] font-mono font-medium text-foreground">{label}</div>
                        <div className="text-[11px] font-mono text-muted-foreground/70 mt-0.5">{sub}</div>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {step === 'form' && type && (
              <div className="space-y-4">
                {/* Primary message */}
                <FieldLabel>
                  {type === 'bug' && 'What went wrong?'}
                  {type === 'feature' && 'What would you like Spacetime to do?'}
                  {type === 'confusion' && 'What felt confusing?'}
                  {type === 'general' && "What's on your mind?"}
                </FieldLabel>
                <textarea
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  placeholder={
                    type === 'bug' ? 'Drag-and-drop on the timeline froze when…' :
                    type === 'feature' ? 'It would help if…' :
                    type === 'confusion' ? "I wasn't sure how to…" :
                    'Anything you want to share…'
                  }
                  rows={4}
                  className="w-full bg-muted/30 border border-border/60 rounded-md px-3 py-2.5 text-[13px] font-mono text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:border-primary/50 resize-y -mt-2"
                  autoFocus
                />

                {/* Bug: expected behavior */}
                {type === 'bug' && (
                  <>
                    <FieldLabel>What did you expect instead? <Optional /></FieldLabel>
                    <textarea
                      value={expected}
                      onChange={(e) => setExpected(e.target.value)}
                      placeholder="I expected…"
                      rows={2}
                      className="w-full bg-muted/30 border border-border/60 rounded-md px-3 py-2.5 text-[13px] font-mono text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:border-primary/50 resize-y -mt-2"
                    />
                  </>
                )}

                {/* Feature: why */}
                {type === 'feature' && (
                  <>
                    <FieldLabel>Why would that help? <Optional /></FieldLabel>
                    <textarea
                      value={expected}
                      onChange={(e) => setExpected(e.target.value)}
                      placeholder="It would let me…"
                      rows={2}
                      className="w-full bg-muted/30 border border-border/60 rounded-md px-3 py-2.5 text-[13px] font-mono text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:border-primary/50 resize-y -mt-2"
                    />
                  </>
                )}

                {/* Confusion: where */}
                {type === 'confusion' && (
                  <>
                    <FieldLabel>Where were you when this happened? <Optional /></FieldLabel>
                    <input
                      type="text"
                      value={location}
                      onChange={(e) => setLocation(e.target.value)}
                      placeholder="e.g. Week view, Library, Settings…"
                      className="w-full bg-muted/30 border border-border/60 rounded-md px-3 py-2.5 text-[13px] font-mono text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:border-primary/50 -mt-2"
                    />
                  </>
                )}

                {/* Screenshot for bug & confusion */}
                {(type === 'bug' || type === 'confusion') && (
                  <div>
                    <FieldLabel>Screenshot <Optional /></FieldLabel>
                    {screenshotPreview ? (
                      <div className="relative -mt-2 rounded-md border border-border/60 overflow-hidden bg-muted/30">
                        <img src={screenshotPreview} alt="Screenshot preview" className="w-full max-h-48 object-contain" />
                        <button
                          onClick={() => { setScreenshot(null); setScreenshotPreview(null); if (fileInputRef.current) fileInputRef.current.value = ''; }}
                          className="absolute top-1.5 right-1.5 bg-background/90 border border-border rounded-full p-1 text-muted-foreground hover:text-foreground"
                        >
                          <X size={12} strokeWidth={1.5} />
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => fileInputRef.current?.click()}
                        className="w-full -mt-2 flex items-center justify-center gap-2 bg-muted/30 border border-dashed border-border/60 rounded-md py-3 text-[12px] font-mono text-muted-foreground hover:text-foreground hover:border-border transition-colors"
                      >
                        <ImagePlus size={14} strokeWidth={1.5} />
                        Attach a screenshot
                      </button>
                    )}
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/*"
                      onChange={handleScreenshot}
                      className="hidden"
                    />
                  </div>
                )}

                {/* Email */}
                <div>
                  <FieldLabel>Email for follow-up <Optional /></FieldLabel>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@example.com"
                    className="w-full bg-muted/30 border border-border/60 rounded-md px-3 py-2.5 text-[13px] font-mono text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:border-primary/50 -mt-2"
                  />
                </div>

                <p className="text-[10.5px] font-mono text-muted-foreground/60 leading-relaxed pt-1">
                  Technical details (page, browser, version) will be included automatically.
                </p>
              </div>
            )}

            {step === 'success' && (
              <div className="py-10 flex flex-col items-center text-center">
                <motion.div
                  initial={{ scale: 0.5, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  transition={{ type: 'spring', damping: 12, stiffness: 200 }}
                  className="w-12 h-12 rounded-full bg-primary/10 border border-primary/30 flex items-center justify-center mb-4"
                >
                  <Check size={20} strokeWidth={2} className="text-primary" />
                </motion.div>
                <p className="text-[14px] font-mono text-foreground">{successMsg}</p>
                <p className="text-[11px] font-mono text-muted-foreground/60 mt-2">
                  {email ? "We'll reach out if we need more info." : 'Closing…'}
                </p>
              </div>
            )}
          </div>

          {/* Footer */}
          {step === 'form' && (
            <div className="px-5 py-3 border-t border-border/40 flex items-center justify-between gap-3">
              <span className="text-[10.5px] font-mono text-muted-foreground/60">
                Drafts are saved automatically.
              </span>
              <button
                onClick={handleSubmit}
                disabled={submitting || !message.trim()}
                className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground text-[12px] font-mono font-medium tracking-wide rounded-md hover:bg-primary/90 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                {submitting ? <Loader2 size={13} className="animate-spin" /> : null}
                {submitting ? 'Sending…' : 'Send'}
              </button>
            </div>
          )}
        </motion.div>
      </div>
    </AnimatePresence>
  );
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <label className="block text-[11px] font-mono tracking-[0.08em] text-muted-foreground mb-1.5">
      {children}
    </label>
  );
}
function Optional() {
  return <span className="text-muted-foreground/40 ml-1">(optional)</span>;
}
