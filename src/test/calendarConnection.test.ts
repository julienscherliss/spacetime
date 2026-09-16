import { beforeEach, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ invoke: vi.fn(), error: vi.fn(), success: vi.fn() }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: {
  auth: { onAuthStateChange: vi.fn(), getSession: async () => ({ data: { session: { access_token: 'test', user: { id: 'user' } } } }) },
  functions: { invoke: mocks.invoke },
} }));
vi.mock('sonner', () => ({ toast: { error: mocks.error, success: mocks.success } }));
import { useCalendarStore } from '@/store/calendarStore';

beforeEach(() => {
  vi.clearAllMocks();
  useCalendarStore.setState({ connected: false, loading: false, calendars: [] });
});

it('shows the server error when saving the connection fails', async () => {
  mocks.invoke.mockResolvedValue({ error: {
    message: 'Edge Function returned a non-2xx status code',
    context: new Response(JSON.stringify({ error: 'DB error: connection could not be saved' })),
  } });
  await useCalendarStore.getState().handleAuthCallback('code');
  expect(mocks.error).toHaveBeenCalledWith('Google Calendar could not connect', expect.objectContaining({
    description: 'DB error: connection could not be saved',
  }));
  expect(useCalendarStore.getState().loading).toBe(false);
  expect(useCalendarStore.getState().connected).toBe(false);
});

it('does not let an old disconnected response overwrite a successful connection', async () => {
  let finishStatus!: (value: unknown) => void;
  mocks.invoke.mockImplementation((_name, { body }) => {
    if (body.action === 'status') return new Promise(resolve => { finishStatus = resolve; });
    if (body.action === 'calendars') return Promise.resolve({ data: [] });
    return Promise.resolve({ data: {} });
  });
  const status = useCalendarStore.getState().checkStatus();
  await vi.waitFor(() => expect(finishStatus).toBeDefined());
  await useCalendarStore.getState().handleAuthCallback('code');
  finishStatus({ data: { connected: false } });
  await status;
  expect(useCalendarStore.getState().connected).toBe(true);
  expect(mocks.success).toHaveBeenCalledWith('Google Calendar connected');
});
