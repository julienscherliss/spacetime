import { beforeEach, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ device: vi.fn(), plan: vi.fn() }));
vi.mock('@capacitor/core', () => ({ Capacitor: { isNativePlatform: () => true, getPlatform: () => 'ios' } }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: {
  from: (table: string) => ({ upsert: table === 'live_activity_devices' ? mocks.device : mocks.plan }),
} }));
import { syncLiveActivityRemoteState } from '@/lib/liveActivityRemoteSync';
const payload = { active: true, taskId: 'scheduled-task', title: 'Task' };
beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  mocks.device.mockResolvedValue({ error: null });
  mocks.plan.mockResolvedValue({ error: null });
});

it('replaces an imported token and does not claim a failed start exists', async () => {
  await syncLiveActivityRemoteState({ userId: 'user', payload, signature: 'plan',
    tokens: { available: true, activityTaskIds: [] }, localActivityTaskId: null });
  expect(mocks.device).toHaveBeenCalledWith(expect.objectContaining({
    push_to_start_token: null, current_activity_task_id: null, current_activity_token: null,
  }), expect.anything());
});

it('keeps a confirmed local activity marker while its push token is pending', async () => {
  await syncLiveActivityRemoteState({ userId: 'user', payload, signature: 'plan',
    tokens: { available: true, activityTaskIds: ['scheduled-task'] }, localActivityTaskId: 'scheduled-task' });
  expect(mocks.device.mock.calls[0][0].current_activity_task_id).toBe('scheduled-task');
  expect(mocks.device.mock.calls[0][0].current_activity_token).toBeNull();
});

it('records the token for the activity that really started', async () => {
  await syncLiveActivityRemoteState({ userId: 'user', payload, signature: 'plan',
    tokens: { available: true, pushToStartToken: 'new-start', activityTokens: [{ taskId: 'scheduled-task', token: 'new-activity' }] } });
  expect(mocks.device).toHaveBeenCalledWith(expect.objectContaining({
    push_to_start_token: 'new-start', current_activity_task_id: 'scheduled-task', current_activity_token: 'new-activity',
  }), expect.anything());
});

it('reports a failed device write and leaves the plan unsaved for retry', async () => {
  const failure = new Error('offline'); mocks.device.mockResolvedValue({ error: failure });
  await expect(syncLiveActivityRemoteState({ userId: 'user', payload, signature: 'plan' })).rejects.toBe(failure);
  expect(mocks.plan).not.toHaveBeenCalled();
});

it('reports a failed plan write for retry', async () => {
  const failure = new Error('offline'); mocks.plan.mockResolvedValue({ error: failure });
  await expect(syncLiveActivityRemoteState({ userId: 'user', payload, signature: 'plan' })).rejects.toBe(failure);
});

it('uploads only non-secret diagnostic fields in the explicitly enabled owned build', async () => {
  vi.stubEnv('VITE_LIVE_ACTIVITY_DIAGNOSTICS', 'true');
  vi.stubEnv('VITE_SUPABASE_PROJECT_ID', 'zzoeywmurqiqticikyaf');
  try {
    const diagnostics = { iosVersion: '26.5.2', activitiesEnabled: true, observerRunning: true,
      observerAgeSeconds: 60, startUpdateCount: 0, cachedStartTokenPresent: false,
      activeActivityCount: 1, secret: 'must-not-upload' };
    await syncLiveActivityRemoteState({ userId: 'user', payload, signature: 'plan',
      tokens: { available: true, supportsPushToStart: true, diagnostics } });
    const saved = mocks.plan.mock.calls[0][0].payload;
    expect(saved.migrationDiagnostics).toMatchObject({ observerRunning: true, startUpdateCount: 0,
      startTokenPresent: false, supportsPushToStart: true });
    expect(JSON.stringify(saved)).not.toContain('must-not-upload');
    mocks.plan.mockClear();
    vi.stubEnv('VITE_SUPABASE_PROJECT_ID', 'other-project');
    await syncLiveActivityRemoteState({ userId: 'user', payload, signature: 'plan',
      tokens: { available: true, diagnostics } });
    expect(mocks.plan.mock.calls[0][0].payload).not.toHaveProperty('migrationDiagnostics');
    mocks.plan.mockClear();
    vi.stubEnv('VITE_SUPABASE_PROJECT_ID', 'zzoeywmurqiqticikyaf');
    vi.stubEnv('VITE_LIVE_ACTIVITY_DIAGNOSTICS', 'false');
    await syncLiveActivityRemoteState({ userId: 'user', payload, signature: 'plan',
      tokens: { available: true, diagnostics } });
    expect(mocks.plan.mock.calls[0][0].payload).not.toHaveProperty('migrationDiagnostics');
  } finally { vi.unstubAllEnvs(); }
});

it('registers an idle device without inventing an active plan', async () => {
  await syncLiveActivityRemoteState({ userId: 'user', payload: { active: false }, signature: 'none',
    tokens: { available: true, pushToStartToken: 'start', activityTaskIds: [] }, localActivityTaskId: null });
  expect(mocks.device.mock.calls[0][0]).toMatchObject({ push_to_start_token: 'start', current_activity_token: null });
  expect(mocks.plan.mock.calls[0][0]).toMatchObject({ active: false, task_id: null, start_at: null });
});

it('prefers the rotated snapshot token and binds it to the local activity rather than a future plan', async () => {
  await syncLiveActivityRemoteState({ userId: 'user', payload, signature: 'future', activityToken: 'earlier',
    localActivityTaskId: 'local-task', tokens: { available: true,
      activityTokens: [{ taskId: 'local-task', token: 'rotated' }] } });
  expect(mocks.device.mock.calls[0][0]).toMatchObject({
    current_activity_token: 'rotated', current_activity_task_id: 'local-task',
  });
  expect(mocks.plan.mock.calls[0][0].task_id).toBe('scheduled-task');
});

it('blocks the follow-up plan write if ownership changes during device registration', async () => {
  let current = true;
  mocks.device.mockImplementation(async () => { current = false; return { error: null }; });
  await syncLiveActivityRemoteState({ userId: 'user', payload, signature: 'plan', isCurrent: () => current });
  expect(mocks.device).toHaveBeenCalledTimes(1);
  expect(mocks.plan).not.toHaveBeenCalled();
  mocks.device.mockClear();
  await syncLiveActivityRemoteState({ userId: 'user', payload, signature: 'plan', isCurrent: () => false });
  expect(mocks.device).not.toHaveBeenCalled();
});

it('never relabels the previous activity token as a new tokenless activity', async () => {
  let saved: Record<string, unknown> = {};
  mocks.device.mockImplementation(async (patch: Record<string, unknown>) => {
    saved = { ...saved, ...patch };
    return { error: null };
  });
  await syncLiveActivityRemoteState({ userId: 'user',
    payload: { active: true, taskId: 'old-task' }, signature: 'old-plan',
    localActivityTaskId: 'old-task', tokens: { available: true,
      activityTaskIds: ['old-task'], activityTokens: [{ taskId: 'old-task', token: 'old-update-token' }] } });
  expect(saved.current_activity_token).toBe('old-update-token');
  await syncLiveActivityRemoteState({ userId: 'user',
    payload: { active: true, taskId: 'new-task' }, signature: 'new-plan',
    localActivityTaskId: 'new-task', tokens: { available: true,
      activityTaskIds: ['new-task'], activityTokens: [] } });
  expect(saved.current_activity_task_id).toBe('new-task');
  expect(saved.current_activity_token).toBeNull();
  await syncLiveActivityRemoteState({ userId: 'user',
    payload: { active: true, taskId: 'new-task' }, signature: 'new-plan',
    localActivityTaskId: 'new-task', tokens: { available: true,
      activityTaskIds: ['new-task'], activityTokens: [{ taskId: 'new-task', token: 'late-new-token' }] } });
  expect(saved.current_activity_task_id).toBe('new-task');
  expect(saved.current_activity_token).toBe('late-new-token');
});

it('does not reuse an earlier sync token when the fresh native snapshot has no token', async () => {
  await syncLiveActivityRemoteState({ userId: 'user', payload, signature: 'same-task',
    activityToken: 'earlier-instance-token', localActivityTaskId: payload.taskId,
    tokens: { available: true, activityTaskIds: [payload.taskId], activityTokens: [] } });
  expect(mocks.device.mock.calls[0][0]).toMatchObject({
    current_activity_task_id: payload.taskId, current_activity_token: null,
  });
});
