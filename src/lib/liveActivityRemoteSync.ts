import { Capacitor } from '@capacitor/core';
import { supabase } from '@/integrations/supabase/client';
import type { LiveActivityPayload, LiveActivityTokenSnapshot } from '@/native/liveActivities';

const DEVICE_ID_KEY = 'spacetime.liveActivityDeviceId';

function getDeviceId() {
  const existing = localStorage.getItem(DEVICE_ID_KEY);
  if (existing) return existing;

  const generated = crypto.randomUUID();
  localStorage.setItem(DEVICE_ID_KEY, generated);
  return generated;
}

function isEligiblePlatform() {
  return Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'ios';
}

export async function syncLiveActivityRemoteState(params: {
  userId: string | null | undefined;
  payload: LiveActivityPayload;
  signature: string;
  tokens?: LiveActivityTokenSnapshot | null;
  activityToken?: string | null;
}) {
  if (!isEligiblePlatform() || !params.userId) return;

  const deviceId = getDeviceId();
  const activityTokens = params.tokens?.activityTokens ?? [];
  const matchingActivityToken =
    params.activityToken ||
    (params.payload.taskId
      ? activityTokens.find((token) => token.taskId === params.payload.taskId)?.token
      : null) ||
    null;

  await (supabase.from('live_activity_devices' as any) as any).upsert({
    user_id: params.userId,
    device_id: deviceId,
    platform: 'ios',
    push_to_start_token: params.tokens?.pushToStartToken ?? null,
    current_activity_token: matchingActivityToken,
    current_activity_task_id: params.payload.active ? params.payload.taskId ?? null : null,
    last_seen_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }, {
    onConflict: 'user_id,device_id',
  });

  await (supabase.from('live_activity_device_plans' as any) as any).upsert({
    user_id: params.userId,
    device_id: deviceId,
    plan_signature: params.signature,
    active: params.payload.active,
    task_id: params.payload.taskId ?? null,
    title: params.payload.title ?? null,
    category: params.payload.category ?? null,
    symbol_name: params.payload.symbolName ?? null,
    is_free_time: params.payload.isFreeTime ?? false,
    start_at: params.payload.startAt ?? null,
    end_at: params.payload.endAt ?? null,
    next_title: params.payload.nextTitle ?? null,
    next_start_at: params.payload.nextStartAt ?? null,
    payload: params.payload,
    updated_at: new Date().toISOString(),
  }, {
    onConflict: 'user_id,device_id',
  });
}

export async function clearLiveActivityRemoteState(userId: string | null | undefined, signature: string) {
  if (!isEligiblePlatform() || !userId) return;

  const deviceId = getDeviceId();
  await (supabase.from('live_activity_device_plans' as any) as any).upsert({
    user_id: userId,
    device_id: deviceId,
    plan_signature: signature,
    active: false,
    task_id: null,
    title: null,
    category: null,
    symbol_name: null,
    is_free_time: false,
    start_at: null,
    end_at: null,
    next_title: null,
    next_start_at: null,
    payload: { active: false },
    updated_at: new Date().toISOString(),
  }, {
    onConflict: 'user_id,device_id',
  });
}
