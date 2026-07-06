import { Capacitor, registerPlugin } from '@capacitor/core';

export interface LiveActivityPayload {
  active: boolean;
  taskId?: string;
  title?: string;
  category?: string | null;
  symbolName?: string;
  isFreeTime?: boolean;
  startAt?: string;
  endAt?: string;
  nextTitle?: string | null;
  nextStartAt?: string | null;
}

export interface LiveActivityTokenSnapshot {
  available: boolean;
  reason?: string;
  pushToStartToken?: string;
  activityTokens?: Array<{
    taskId: string;
    token: string;
  }>;
}

interface LiveActivitiesPlugin {
  isAvailable(): Promise<{ available: boolean; reason?: string }>;
  getPushTokens(): Promise<LiveActivityTokenSnapshot>;
  sync(options: LiveActivityPayload): Promise<{ active: boolean }>;
  end(): Promise<{ active: boolean }>;
}

const LiveActivities = registerPlugin<LiveActivitiesPlugin>('LiveActivities');

export async function syncLiveActivity(payload: LiveActivityPayload): Promise<{ active: boolean; activityToken?: string } | null> {
  if (!Capacitor.isNativePlatform() || Capacitor.getPlatform() !== 'ios') return null;
  try {
    return await LiveActivities.sync(payload) as { active: boolean; activityToken?: string };
  } catch (error) {
    console.warn('[live-activity] sync failed', error);
  }
  return null;
}

export async function getLiveActivityPushTokens(): Promise<LiveActivityTokenSnapshot | null> {
  if (!Capacitor.isNativePlatform() || Capacitor.getPlatform() !== 'ios') return null;
  try {
    return await LiveActivities.getPushTokens();
  } catch (error) {
    console.warn('[live-activity] token lookup failed', error);
    return null;
  }
}

export async function endLiveActivity() {
  if (!Capacitor.isNativePlatform() || Capacitor.getPlatform() !== 'ios') return;
  try {
    await LiveActivities.end();
  } catch (error) {
    console.warn('[live-activity] end failed', error);
  }
}
