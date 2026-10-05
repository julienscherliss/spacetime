import { describe, expect, it, vi } from 'vitest';
import { createMaintenanceGuard } from '../../supabase/functions/_shared/migrationMaintenance';

describe('draft source Edge maintenance guard', () => {
  const options = { url: 'https://source.supabase.co', expectedProject: 'source', serviceKey: 'fixture-server-key' };
  for (const state of [{ frozen: true, project_ref: 'source' }, { frozen: false, project_ref: 'wrong' }, {}, null]) {
    it(`denies uncertain or frozen state ${JSON.stringify(state)} before handler side effects`, async () => {
      const fetcher = vi.fn(async () => new Response(JSON.stringify(state))) as any;
      const sideEffect = vi.fn();
      const guard = createMaintenanceGuard({ ...options, fetcher });
      const result = await guard(new Request('https://function.test', { method: 'POST', headers: { 'x-maintenance-bypass': 'true', Authorization: 'Bearer service-role-fixture' } }));
      if (!result) sideEffect();
      expect(result?.status).toBe(503); expect(sideEffect).not.toHaveBeenCalled();
    });
  }
  it('allows only exact project and explicit unfrozen state', async () => {
    const fetcher = vi.fn(async () => new Response(JSON.stringify({ frozen: false, project_ref: 'source' }))) as any;
    expect(await createMaintenanceGuard({ ...options, fetcher })(new Request('https://function.test'))).toBeNull();
    expect(fetcher.mock.calls[0][1].redirect).toBe('error');
  });
  it('denies failed lookups and wrong destination without credential forwarding', async () => {
    const fetcher = vi.fn(async () => { throw new Error('network failure'); }) as any;
    const req = new Request('https://function.test');
    expect((await createMaintenanceGuard({ ...options, fetcher })(req))?.status).toBe(503);
    fetcher.mockClear();
    expect((await createMaintenanceGuard({ ...options, url: 'https://wrong.test', fetcher })(req))?.status).toBe(503);
    expect(fetcher).not.toHaveBeenCalled();
  });
  it('answers CORS preflight without calling providers or the gate', async () => {
    const fetcher = vi.fn() as any;
    expect((await createMaintenanceGuard({ ...options, fetcher })(new Request('https://function.test',{method:'OPTIONS'})))?.status).toBe(200);
    expect(fetcher).not.toHaveBeenCalled();
  });
});
