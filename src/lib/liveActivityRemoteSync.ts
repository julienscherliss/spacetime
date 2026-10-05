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

async function syncExistingDevicePlans(userId: string, payload: LiveActivityPayload, signature: string, isCurrent = () => true) {
  if (!isCurrent()) return;
  const { data, error } = await (supabase.from('live_activity_devices' as any) as any)
    .select('device_id')
    .eq('user_id', userId);

  if (error) {
    console.warn('[live-activity] remote device lookup failed', error);
    throw error;
  }

  const deviceIds: string[] = Array.from(
    new Set<string>(
      (data ?? [])
        .map((row: { device_id?: string }) => row.device_id)
        .filter((id): id is string => Boolean(id)),
    ),
  );
  if (deviceIds.length === 0 || !isCurrent()) return;

  const { error: planError } = await (supabase.from('live_activity_device_plans' as any) as any).upsert(
    deviceIds.map((deviceId) => planRow(userId, deviceId, payload, signature)),
    { onConflict: 'user_id,device_id' },
  );
  if (planError) throw planError;
}

export async function syncLiveActivityRemoteState(params: {
  userId: string | null | undefined;
  payload: LiveActivityPayload;
  signature: string;
  tokens?: LiveActivityTokenSnapshot | null;
  activityToken?: string | null;
  localActivityTaskId?: string | null;
  isCurrent?: () => boolean;
}) {
  const isCurrent = params.isCurrent ?? (() => true);
  if (!params.userId || !isCurrent()) return;

  if (!isEligiblePlatform()) {
    await syncExistingDevicePlans(params.userId, params.payload, params.signature, isCurrent);
    return;
  }

  const deviceId = getDeviceId();
  const activityTokens = params.tokens?.activityTokens ?? [];
  const localTaskId = params.localActivityTaskId !== undefined
    ? params.localActivityTaskId : params.payload.taskId ?? null;
  // A fresh snapshot wins even when its token list is empty. A token from an
  // earlier sync result may belong to an activity that ended in the meantime.
  const matchingActivityToken = params.tokens
    ? activityTokens.find((token) => token.taskId === localTaskId)?.token ?? null
    : (localTaskId === params.payload.taskId ? params.activityToken : null) ?? null;

  const devicePatch: Record<string, unknown> = {
    user_id: params.userId,
    device_id: deviceId,
    platform: 'ios',
    apns_environment: params.tokens?.apnsEnvironment ?? 'development',
    bundle_identifier: params.tokens?.bundleIdentifier ?? 'com.spacetimelabs.spacetime',
    last_seen_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  if (params.tokens) {
    // A current native snapshot supersedes any imported token, even before a
    // new token is available. Never preserve a stale credential from the export.
    devicePatch.push_to_start_token = params.tokens.pushToStartToken ?? null;
  }

  if (matchingActivityToken) {
    devicePatch.current_activity_token = matchingActivityToken;
    devicePatch.current_activity_task_id = localTaskId;
  } else if (params.localActivityTaskId !== undefined) {
    devicePatch.current_activity_task_id = params.localActivityTaskId;
    // Retain the known activity marker so dispatch waits for its token, while
    // clearing any credential belonging to the previous activity instance.
    devicePatch.current_activity_token = null;
  } else if (!params.payload.active) {
    devicePatch.current_activity_task_id = null;
    devicePatch.current_activity_token = null;
  }

  if (!isCurrent()) return;
  const { error: deviceError } = await (supabase.from('live_activity_devices' as any) as any).upsert(devicePatch, {
    onConflict: 'user_id,device_id',
  });
  if (deviceError) throw deviceError;
  if (!isCurrent()) return;

  const d = params.tokens?.diagnostics;
  const diagnosticPayload = import.meta.env.VITE_LIVE_ACTIVITY_DIAGNOSTICS === 'true' &&
    import.meta.env.VITE_SUPABASE_PROJECT_ID === 'zzoeywmurqiqticikyaf' && d
    ? { ...params.payload, migrationDiagnostics: {
      // Allowlist only non-secret state; never copy native tokens or arbitrary fields.
      iosVersion: d.iosVersion,
      activitiesEnabled: d.activitiesEnabled,
      observerRunning: d.observerRunning,
      observerPhase: d.observerPhase,
      observerGeneration: d.observerGeneration,
      observerAgeSeconds: d.observerAgeSeconds,
      startUpdateCount: d.startUpdateCount,
      cachedStartTokenPresent: d.cachedStartTokenPresent,
      activeActivityCount: d.activeActivityCount,
      supportsPushToStart: params.tokens?.supportsPushToStart === true,
      startTokenPresent: Boolean(params.tokens?.pushToStartToken),
      checkedAt: new Date().toISOString(),
    } }
    : params.payload;
  const { error: planError } = await (supabase.from('live_activity_device_plans' as any) as any).upsert(planRow(
    params.userId,
    deviceId,
    diagnosticPayload,
    params.signature,
  ), {
    onConflict: 'user_id,device_id',
  });
  if (planError) throw planError;
}

export async function clearLiveActivityRemoteState(userId: string | null | undefined, signature: string) {
  if (!userId) return;

  const payload: LiveActivityPayload = { active: false };

  if (!isEligiblePlatform()) {
    await syncExistingDevicePlans(userId, payload, signature);
    return;
  }

  const deviceId = getDeviceId();
  const { error } = await (supabase.from('live_activity_device_plans' as any) as any).upsert(planRow(userId, deviceId, payload, signature), {
    onConflict: 'user_id,device_id',
  });
  if (error) throw error;
}
