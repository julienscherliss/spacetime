import * as React from 'npm:react@18.3.1'
import { renderAsync } from 'npm:@react-email/components@0.0.22'
import { Webhook } from 'https://esm.sh/standardwebhooks@1.0.0'
import { createClient } from 'npm:@supabase/supabase-js@2'
import { SignupEmail } from '../_shared/email-templates/signup.tsx'
import { InviteEmail } from '../_shared/email-templates/invite.tsx'
import { MagicLinkEmail } from '../_shared/email-templates/magic-link.tsx'
import { RecoveryEmail } from '../_shared/email-templates/recovery.tsx'
import { EmailChangeEmail } from '../_shared/email-templates/email-change.tsx'
import { ReauthenticationEmail } from '../_shared/email-templates/reauthentication.tsx'

type EmailAction = 'signup' | 'invite' | 'magiclink' | 'recovery' | 'email_change' | 'reauthentication'

interface HookPayload {
  user: { email?: string; new_email?: string }
  email_data: {
    email_action_type: EmailAction
    token?: string
    token_hash?: string
    token_new?: string
    token_hash_new?: string
    redirect_to?: string
  }
}

const SITE_NAME = 'spaacetime'
const SITE_URL = 'https://launchspacetime.com'
const SUBJECTS: Record<EmailAction, string> = {
  signup: 'Confirm your email',
  invite: "You've been invited",
  magiclink: 'Your spaacetime sign-in code',
  recovery: 'Reset your password',
  email_change: 'Confirm your new email',
  reauthentication: 'Your verification code',
}

function verificationUrl(supabaseUrl: string, tokenHash: string, action: EmailAction, redirectTo?: string): string {
  const url = new URL('/auth/v1/verify', supabaseUrl)
  url.searchParams.set('token', tokenHash)
  url.searchParams.set('type', action)
  if (redirectTo) url.searchParams.set('redirect_to', redirectTo)
  return url.toString()
}

async function enqueueEmail(
  supabase: ReturnType<typeof createClient>,
  params: {
    webhookId: string | null
    recipient: string
    action: EmailAction
    token?: string
    confirmationUrl?: string
    oldEmail?: string
    newEmail?: string
    from: string
  },
): Promise<void> {
  const { webhookId, recipient, action, token, confirmationUrl, oldEmail, newEmail, from } = params
  const props = {
    siteName: SITE_NAME,
    siteUrl: SITE_URL,
    recipient,
    confirmationUrl,
    token,
    email: oldEmail,
    newEmail,
  }
  const templates: Record<EmailAction, React.ComponentType<any>> = {
    signup: SignupEmail,
    invite: InviteEmail,
    magiclink: MagicLinkEmail,
    recovery: RecoveryEmail,
    email_change: EmailChangeEmail,
    reauthentication: ReauthenticationEmail,
  }
  const element = React.createElement(templates[action], props)
  const html = await renderAsync(element)
  const text = await renderAsync(element, { plainText: true })
  const id = webhookId ? `${webhookId}:${recipient.toLowerCase()}` : crypto.randomUUID()

  const { data: previous, error: lookupError } = await supabase
    .from('email_send_log')
    .select('id')
    .eq('message_id', id)
    .in('status', ['pending', 'sent'])
    .limit(1)
  if (lookupError) throw lookupError
  if (previous?.length) return

  const { error: enqueueError } = await supabase.rpc('enqueue_email', {
    queue_name: 'auth_emails',
    payload: {
      message_id: id,
      to: recipient,
      from,
      subject: SUBJECTS[action],
      html,
      text,
      purpose: 'transactional',
      label: action,
      queued_at: new Date().toISOString(),
    },
  })
  if (enqueueError) throw enqueueError

  const { error: logError } = await supabase.from('email_send_log').insert({
    message_id: id,
    template_name: action,
    recipient_email: recipient,
    status: 'pending',
  })
  if (logError) console.error('Auth email enqueued but pending log failed', { action, error: logError.message })
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 })

  const secret = Deno.env.get('SEND_EMAIL_HOOK_SECRET')
  const from = Deno.env.get('EMAIL_FROM_ADDRESS')
  const provider = Deno.env.get('EMAIL_PROVIDER')
  const providerKey = provider === 'resend'
    ? Deno.env.get('RESEND_API_KEY')
    : provider === 'postmark'
      ? Deno.env.get('POSTMARK_SERVER_TOKEN')
      : null
  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (!secret || !from || !providerKey || !supabaseUrl || !serviceRoleKey) {
    console.error('Auth email hook is missing required configuration')
    return Response.json({ error: 'Server configuration error' }, { status: 503 })
  }

  let payload: HookPayload
  try {
    payload = new Webhook(secret.replace(/^v1,whsec_/, '')).verify(
      await req.text(),
      Object.fromEntries(req.headers),
    ) as HookPayload
  } catch {
    return Response.json({ error: 'Invalid hook signature' }, { status: 401 })
  }

  const action = payload.email_data?.email_action_type
  const currentEmail = payload.user?.email
  const newEmail = payload.user?.new_email
  if (!action || !(action in SUBJECTS) || !currentEmail) {
    return Response.json({ error: 'Invalid hook payload' }, { status: 400 })
  }

  const data = payload.email_data
  const supabase = createClient(supabaseUrl, serviceRoleKey)
  const webhookId = req.headers.get('webhook-id')

  try {
    if (action === 'email_change') {
      if (!newEmail || !data.token_hash || !(data.token_new || data.token)) {
        return Response.json({ error: 'Incomplete email change payload' }, { status: 400 })
      }
      if (data.token_hash_new) {
        if (!data.token) return Response.json({ error: 'Incomplete current-email token' }, { status: 400 })
        await enqueueEmail(supabase, {
          webhookId, recipient: currentEmail, action, token: data.token,
          confirmationUrl: verificationUrl(supabaseUrl, data.token_hash_new, action, data.redirect_to),
          oldEmail: currentEmail, newEmail, from,
        })
      }
      await enqueueEmail(supabase, {
        webhookId, recipient: newEmail, action, token: data.token_new || data.token,
        confirmationUrl: verificationUrl(supabaseUrl, data.token_hash, action, data.redirect_to),
        oldEmail: currentEmail, newEmail, from,
      })
    } else {
      if (!data.token || (!data.token_hash && !['magiclink', 'reauthentication'].includes(action))) {
        return Response.json({ error: 'Incomplete email token' }, { status: 400 })
      }
      await enqueueEmail(supabase, {
        webhookId, recipient: currentEmail, action, token: data.token,
        confirmationUrl: data.token_hash
          ? verificationUrl(supabaseUrl, data.token_hash, action, data.redirect_to)
          : undefined,
        from,
      })
    }
  } catch (error) {
    console.error('Auth email enqueue failed', { action, error: error instanceof Error ? error.message : String(error) })
    return Response.json({ error: 'Email enqueue failed' }, { status: 503 })
  }

  return Response.json({})
})
