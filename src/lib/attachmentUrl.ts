import { supabase } from '@/integrations/supabase/client';

const BUCKET = 'task-attachments';
const cache = new Map<string, string>();

async function getSignedAttachmentUrl(path: string): Promise<string | null> {
  const { data, error } = await supabase.functions.invoke('attachment-access', {
    body: { action: 'sign', path },
  });

  if (error) {
    console.warn('[attachment] sign failed', path, error);
    return null;
  }

  return data?.url ?? null;
}

/** Extract the storage path from an attachment (handles legacy `url`-only records). */
export function getAttachmentPath(att: { path?: string; url?: string }): string | null {
  if (att.path) return att.path;
  if (!att.url) return null;
  // Signed URL form: /storage/v1/object/sign/task-attachments/<path>?token=...
  // Public URL form: /storage/v1/object/public/task-attachments/<path>
  // Fallback (broken): just the raw path
  const m = att.url.match(/task-attachments\/(.+?)(?:\?|$)/);
  if (m) return m[1];
  // If url isn't a URL at all, assume it's already the path
  if (!/^https?:\/\//.test(att.url)) return att.url;
  return null;
}

/** Resolve an attachment to a displayable blob URL. Uses SELECT-only download endpoint. */
export async function resolveAttachmentUrl(att: { path?: string; url?: string }): Promise<string | null> {
  const path = getAttachmentPath(att);
  if (!path) return att.url ?? null;
  const cached = cache.get(path);
  if (cached) return cached;

  const url = await getSignedAttachmentUrl(path);
  if (!url) return null;

  cache.set(path, url);
  return url;
}

export async function removeAttachmentFile(att: { path?: string; url?: string }): Promise<void> {
  const path = getAttachmentPath(att);
  if (!path) return;

  const { error } = await supabase.functions.invoke('attachment-access', {
    body: { action: 'delete', path },
  });

  if (error) {
    throw error;
  }

  cache.delete(path);
}