import { act, renderHook } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  sync: vi.fn(), tokens: vi.fn(), remote: vi.fn(), clear: vi.fn(),
  now: new Date('2026-10-01T21:15:00Z'),
  foreground: null as null | ((state: { isActive: boolean }) => void),
  authChange: null as null | ((_event: string, session: { user: { id: string } } | null) => void),
}));
vi.mock('@capacitor/core', () => ({ Capacitor: { isNativePlatform: () => true, getPlatform: () => 'ios' } }));
vi.mock('@capacitor/app', () => ({ App: { addListener: async (_name: string, callback: typeof mocks.foreground) => {
  mocks.foreground = callback;
  return { remove: vi.fn() };
} } }));
vi.mock('@/native/liveActivities', () => ({ syncLiveActivity: mocks.sync, getLiveActivityPushTokens: mocks.tokens }));
vi.mock('@/lib/liveActivityRemoteSync', () => ({ syncLiveActivityRemoteState: mocks.remote, clearLiveActivityRemoteState: mocks.clear }));
vi.mock('@/hooks/useCurrentTime', () => ({
  useCurrentTime: () => ({ now: mocks.now, minutes: 14 * 60 + 15, dateStr: '2026-10-01' }),
  timeToMinutes: (time: string) => Number(time.split(':')[0]) * 60 + Number(time.split(':')[1]),
}));
vi.mock('@/integrations/supabase/client', () => ({ supabase: { auth: {
  getUser: async () => ({ data: { user: { id: 'user' } } }),
  onAuthStateChange: (callback: typeof mocks.authChange) => {
    mocks.authChange = callback;
    return { data: { subscription: { unsubscribe: vi.fn() } } };
  },
} } }));
import { useLiveActivities } from '@/hooks/useLiveActivities';
import { useTaskStore, type Task } from '@/store/taskStore';

beforeEach(() => {
  vi.clearAllMocks();
  mocks.now = new Date('2026-10-01T21:15:00Z');
  mocks.tokens.mockResolvedValue({ available: true, activityTaskIds: [], supportsPushToStart: true, pushToStartToken: 'fresh' });
  mocks.sync.mockResolvedValue({ active: true, activityToken: 'activity-token' });
  mocks.remote.mockResolvedValue(undefined);
  useTaskStore.setState({ tasks: [{
    id: 'task', title: 'Task', type: 'one-time', priority: 0, originalPriority: 0,
    date: '2026-10-01', time: '14:15', duration: 45, completed: false,
    createdAt: '2026-10-01T00:00:00Z', moveCount: 0,
  } as Task], routinesEnabled: true });
});

async function mount() {
  let hook!: ReturnType<typeof renderHook>;
  await act(async () => { hook = renderHook(() => useLiveActivities()); });
  return hook;
}
async function tick(hook: ReturnType<typeof renderHook>) {
  mocks.now = new Date(mocks.now.getTime() + 15000);
  await act(async () => { hook.rerender(); });
}

it('retries a failed native start without requiring a task edit', async () => {
  mocks.sync.mockResolvedValue(null);
  const hook = await mount();
  const first = mocks.sync.mock.calls.length;
  expect(first).toBeGreaterThan(0);
  mocks.sync.mockResolvedValue({ active: true, activityToken: 'activity-token' });
  await tick(hook);
  expect(mocks.sync.mock.calls.length).toBeGreaterThan(first);
  const recovered = mocks.sync.mock.calls.length;
  await tick(hook);
  expect(mocks.sync).toHaveBeenCalledTimes(recovered);
  hook.unmount();
});

it('refreshes a token that becomes available after the initial start', async () => {
  mocks.sync.mockResolvedValue({ active: true });
  mocks.tokens.mockResolvedValue({ available: true, activityTaskIds: ['task'], supportsPushToStart: true });
  const hook = await mount();
  const initial = mocks.remote.mock.calls.length;
  mocks.sync.mockResolvedValue({ active: true, activityToken: 'late-token' });
  mocks.tokens.mockResolvedValue({ available: true, activityTaskIds: ['task'], supportsPushToStart: true, pushToStartToken: 'late-start-token' });
  await tick(hook);
  expect(mocks.remote.mock.calls.length).toBeGreaterThan(initial);
  expect(mocks.remote).toHaveBeenLastCalledWith(expect.objectContaining({ activityToken: 'late-token', localActivityTaskId: 'task' }));
  hook.unmount();
});

it('checks native state again when the app returns to the foreground', async () => {
  const hook = await mount();
  const initial = mocks.sync.mock.calls.length;
  await act(async () => { mocks.foreground?.({ isActive: true }); });
  expect(mocks.sync.mock.calls.length).toBeGreaterThan(initial);
  hook.unmount();
});

it('retries failed remote registration on the next tick', async () => {
  const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
  mocks.remote.mockRejectedValue(new Error('network unavailable'));
  const hook = await mount();
  const initial = mocks.remote.mock.calls.length;
  mocks.remote.mockResolvedValue(undefined);
  await tick(hook);
  expect(mocks.remote.mock.calls.length).toBeGreaterThan(initial);
  hook.unmount();
  warn.mockRestore();
});

it('forwards rotated tokens with unchanged tasks and foreground, without redundant uploads', async () => {
  const hook = await mount();
  const initial = mocks.remote.mock.calls.length;
  await tick(hook);
  expect(mocks.remote).toHaveBeenCalledTimes(initial);
  mocks.tokens.mockResolvedValue({ available: true, activityTaskIds: ['task'], supportsPushToStart: true,
    pushToStartToken: 'rotated-start', activityTokens: [{ taskId: 'task', token: 'rotated-update' }] });
  for (let i = 0; i < 4; i++) await tick(hook);
  expect(mocks.remote).toHaveBeenCalledTimes(initial + 1);
  expect(mocks.remote).toHaveBeenLastCalledWith(expect.objectContaining({
    tokens: expect.objectContaining({ pushToStartToken: 'rotated-start' }), localActivityTaskId: 'task',
  }));
  hook.unmount();
});

it('registers push-to-start credentials while there is no task to schedule', async () => {
  useTaskStore.setState({ tasks: [] });
  mocks.sync.mockResolvedValue({ active: false });
  const hook = await mount();
  expect(mocks.remote).toHaveBeenCalledWith(expect.objectContaining({
    payload: { active: false }, tokens: expect.objectContaining({ pushToStartToken: 'fresh' }),
  }));
  expect(mocks.clear).not.toHaveBeenCalled();
  hook.unmount();
});

it('does not register an old snapshot after an account switch during token lookup', async () => {
  let release!: (value: unknown) => void;
  mocks.tokens.mockReturnValueOnce(new Promise((resolve) => { release = resolve; }));
  const hook = await mount();
  await act(async () => { mocks.authChange?.('SIGNED_IN', { user: { id: 'other-user' } }); });
  await act(async () => { release({ available: true, pushToStartToken: 'old-snapshot' }); });
  expect(mocks.remote.mock.calls.every(([args]) => args.userId === 'other-user')).toBe(true);
  expect(mocks.remote).toHaveBeenCalledWith(expect.objectContaining({ userId: 'other-user' }));
  hook.unmount();
});

it('drops token lookup results after hook cleanup', async () => {
  let release!: (value: unknown) => void;
  mocks.tokens.mockReturnValueOnce(new Promise((resolve) => { release = resolve; }));
  const hook = await mount();
  hook.unmount();
  await act(async () => { release({ available: true, pushToStartToken: 'late' }); });
  expect(mocks.remote).not.toHaveBeenCalled();
});

it('retries an unavailable native snapshot without overwriting device credentials', async () => {
  mocks.tokens.mockResolvedValue(null);
  const hook = await mount();
  expect(mocks.remote).not.toHaveBeenCalled();
  mocks.tokens.mockResolvedValue({ available: true, pushToStartToken: 'recovered' });
  await tick(hook);
  expect(mocks.remote).toHaveBeenCalledWith(expect.objectContaining({
    tokens: expect.objectContaining({ pushToStartToken: 'recovered' }),
  }));
  hook.unmount();
});
