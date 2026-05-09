import { supabase } from '@/integrations/supabase/client';

export type AuditAction =
  // task lifecycle
  | 'task.created'
  | 'task.deleted'
  | 'task.restored'
  | 'task.completed'
  | 'task.uncompleted'
  // routine lifecycle
  | 'routine.toggled'
  // auth
  | 'auth.signed_in'
  | 'auth.signed_out'
  | 'auth.session_expired'
  // sync
  | 'sync.failed'
  | 'sync.conflict'
  // notifications
  | 'notification.scheduled'
  | 'notification.cancelled'
  // account
  | 'account.deleted';

interface AuditPayload {
  action: AuditAction;
  objectType?: string;
  objectId?: string;
  prev?: Record<string, unknown>;
  next?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
}

function detectPlatform(): string {
  if (typeof window === 'undefined') return 'server';
  const w = window as any;
  if (w?.Capacitor?.isNativePlatform?.()) {
    return w.Capacitor.getPlatform?.() || 'native';
  }
  return 'web';
}

/**
 * Fire-and-forget audit log writer.
 *
 * - Never throws — failures are swallowed so audit logging cannot break a
 *   user action.
 * - Skips silently if there is no signed-in user (e.g. during sign-out).
 * - Trims state payloads to 4 KB each so a runaway object cannot bloat the
 *   log table.
 */
export function logAudit(payload: AuditPayload): void {
  // Schedule on a microtask so we never block the caller.
  void (async () => {
    try {
      const { data } = await supabase.auth.getUser();
      const userId = data?.user?.id;
      if (!userId) return;
      await supabase.from('audit_log').insert([{
        user_id: userId,
        action: payload.action,
        object_type: payload.objectType ?? '',
        object_id: payload.objectId ?? '',
        prev_state: trim(payload.prev) as any,
        new_state: trim(payload.next) as any,
        platform: detectPlatform(),
        metadata: trim(payload.metadata) as any,
      }]);
    } catch {
      // Intentionally silent.
    }
  })();
}

function trim(obj: Record<string, unknown> | undefined): Record<string, unknown> {
  if (!obj) return {};
  try {
    const json = JSON.stringify(obj);
    if (json.length <= 4096) return obj;
    return { _truncated: true, preview: json.slice(0, 4000) };
  } catch {
    return {};
  }
}