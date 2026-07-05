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

interface LiveActivitiesPlugin {
  isAvailable(): Promise<{ available: boolean; reason?: string }>;
  sync(options: LiveActivityPayload): Promise<{ active: boolean }>;
  end(): Promise<{ active: boolean }>;
}

const LiveActivities = registerPlugin<LiveActivitiesPlugin>('LiveActivities');

export async function syncLiveActivity(payload: LiveActivityPayload) {
  if (!Capacitor.isNativePlatform() || Capacitor.getPlatform() !== 'ios') return;
  try {
    await LiveActivities.sync(payload);
  } catch (error) {
    console.warn('[live-activity] sync failed', error);
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
