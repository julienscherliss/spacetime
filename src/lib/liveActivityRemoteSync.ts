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

function planRow(userId: string, deviceId: string, payload: LiveActivityPayload, signature: string) {
  return {
    user_id: userId,
    device_id: deviceId,
    plan_signature: signature,
    active: payload.active,
    task_id: payload.taskId ?? null,
    title: payload.title ?? null,
    category: payload.category ?? null,
    symbol_name: payload.symbolName ?? null,
    is_free_time: payload.isFreeTime ?? false,
    start_at: payload.startAt ?? null,
    end_at: payload.endAt ?? null,
    next_title: payload.nextTitle ?? null,
    next_start_at: payload.nextStartAt ?? null,
    payload,
    updated_at: new Date().toISOString(),
  };
}

async function syncExistingDevicePlans(userId: string, payload: LiveActivityPayload, signature: string) {
  const { data, error } = await (supabase.from('live_activity_devices' as any) as any)
    .select('device_id')
    .eq('user_id', userId);

  if (error) {
    console.warn('[live-activity] remote device lookup failed', error);
    return;
  }

  const deviceIds = Array.from(new Set((data ?? []).map((row: { device_id?: string }) => row.device_id).filter(Boolean)));
  if (deviceIds.length === 0) return;

  await (supabase.from('live_activity_device_plans' as any) as any).upsert(
    deviceIds.map((deviceId) => planRow(userId, deviceId, payload, signature)),
    { onConflict: 'user_id,device_id' },
  );
}

export async function syncLiveActivityRemoteState(params: {
  userId: string | null | undefined;
  payload: LiveActivityPayload;
  signature: string;
  tokens?: LiveActivityTokenSnapshot | null;
  activityToken?: string | null;
}) {
  if (!params.userId) return;

  if (!isEligiblePlatform()) {
    await syncExistingDevicePlans(params.userId, params.payload, params.signature);
    return;
  }

  const deviceId = getDeviceId();
  const activityTokens = params.tokens?.activityTokens ?? [];
  const matchingActivityToken =
    params.activityToken ||
    (params.payload.taskId
      ? activityTokens.find((token) => token.taskId === params.payload.taskId)?.token
      : null) ||
    null;

  const devicePatch: Record<string, unknown> = {
    user_id: params.userId,
    device_id: deviceId,
    platform: 'ios',
    apns_environment: params.tokens?.apnsEnvironment ?? 'development',
    bundle_identifier: params.tokens?.bundleIdentifier ?? 'com.spacetimelabs.spacetime',
    current_activity_task_id: params.payload.active ? params.payload.taskId ?? null : null,
    last_seen_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  if (params.tokens?.pushToStartToken) {
    devicePatch.push_to_start_token = params.tokens.pushToStartToken;
  }

  if (matchingActivityToken) {
    devicePatch.current_activity_token = matchingActivityToken;
  } else if (!params.payload.active) {
    devicePatch.current_activity_token = null;
  }

  await (supabase.from('live_activity_devices' as any) as any).upsert(devicePatch, {
    onConflict: 'user_id,device_id',
  });

  await (supabase.from('live_activity_device_plans' as any) as any).upsert(planRow(
    params.userId,
    deviceId,
    params.payload,
    params.signature,
  ), {
    onConflict: 'user_id,device_id',
  });
}

export async function clearLiveActivityRemoteState(userId: string | null | undefined, signature: string) {
  if (!userId) return;

  const payload: LiveActivityPayload = { active: false };

  if (!isEligiblePlatform()) {
    await syncExistingDevicePlans(userId, payload, signature);
    return;
  }

  const deviceId = getDeviceId();
  await (supabase.from('live_activity_device_plans' as any) as any).upsert(planRow(userId, deviceId, payload, signature), {
    onConflict: 'user_id,device_id',
  });
}
