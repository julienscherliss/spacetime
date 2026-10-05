import { beforeEach, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ sync: vi.fn(), purchases: vi.fn(), fetch: vi.fn() }));
vi.mock('@capacitor/core', () => ({ Capacitor: {
  isNativePlatform: () => true, getPlatform: () => 'ios', isPluginAvailable: () => true,
} }));
vi.mock('@capgo/native-purchases', () => ({ NativePurchases: {
  restorePurchases: mocks.sync, getPurchases: mocks.purchases,
}, PURCHASE_TYPE: { SUBS: 'subs' } }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: { auth: {
  getSession: async () => ({ data: { session: { access_token: 'test-session' } } }),
} } }));
import { restorePurchases } from '@/utils/iapClient';

beforeEach(() => {
  vi.resetAllMocks();
  vi.stubGlobal('fetch', mocks.fetch);
  mocks.sync.mockResolvedValue(undefined);
  mocks.purchases.mockResolvedValue({ purchases: [{ jwsRepresentation: 'signed-test' }] });
  mocks.fetch.mockResolvedValue({ ok: true, json: async () => ({ ok: true, status: 'active' }) });
});

it('recovers a sync failure only after backend verification of a current entitlement', async () => {
  mocks.sync.mockRejectedValue(new Error('Unable to Complete Request'));
  await expect(restorePurchases()).resolves.toEqual({ restored: 1 });
  expect(mocks.purchases).toHaveBeenCalledWith({ onlyCurrentEntitlements: true });
  expect(JSON.parse(mocks.fetch.mock.calls[0][1].body)).toEqual({ signedTransaction: 'signed-test' });
});

it('preserves the Apple failure if there is no recoverable current purchase', async () => {
  const error = new Error('Unable to Complete Request');
  mocks.sync.mockRejectedValue(error);
  mocks.purchases.mockResolvedValue({ purchases: [] });
  await expect(restorePurchases()).rejects.toBe(error);
  expect(mocks.fetch).not.toHaveBeenCalled();
});

it('respects cancellation without looking up or restoring purchases', async () => {
  const error = { message: 'User cancelled' };
  mocks.sync.mockRejectedValue(error);
  await expect(restorePurchases()).rejects.toBe(error);
  expect(mocks.purchases).not.toHaveBeenCalled();
});

it('does not call an expired transaction a restored subscription', async () => {
  mocks.fetch.mockResolvedValue({ ok: true, json: async () => ({ ok: true, status: 'expired' }) });
  await expect(restorePurchases()).resolves.toEqual({ restored: 0 });
});

it('surfaces verifier rejection instead of silently reporting no purchases', async () => {
  mocks.fetch.mockResolvedValue({ ok: false, json: async () => ({ error: 'Invalid signature' }) });
  await expect(restorePurchases()).rejects.toThrow('Invalid signature');
});

it('never sends a legacy receipt as a signed restore transaction', async () => {
  mocks.purchases.mockResolvedValue({ purchases: [{ receipt: 'legacy-receipt' }] });
  await expect(restorePurchases()).resolves.toEqual({ restored: 0 });
  expect(mocks.fetch).not.toHaveBeenCalled();
});

 it('restores a verified cancellation that still has paid time remaining', async () => {
  mocks.fetch.mockResolvedValue({ ok: true, json: async () => ({ ok: true, status: 'cancelling' }) });
  await expect(restorePurchases()).resolves.toEqual({ restored: 1 });
});
