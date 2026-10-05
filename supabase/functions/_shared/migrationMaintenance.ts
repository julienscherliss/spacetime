/** Draft source-only maintenance guard. Not installed/deployed anywhere. */
type GuardOptions = { url: string; serviceKey: string; expectedProject: string; fetcher?: typeof fetch };
const headers = { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-dispatch-secret',
  'Retry-After': '120', 'Cache-Control': 'no-store' };

export function createMaintenanceGuard(options: GuardOptions) {
  return async (req: Request): Promise<Response | null> => {
    if (req.method === 'OPTIONS') return new Response('ok', { headers });
    try {
      if (!options.expectedProject || options.url !== `https://${options.expectedProject}.supabase.co`
        || !options.serviceKey) throw new Error('Unconfigured maintenance guard');
      const response = await (options.fetcher ?? fetch)(`${options.url}/rest/v1/rpc/migration_maintenance_status`, {
        method: 'POST', headers: { apikey: options.serviceKey, Authorization: `Bearer ${options.serviceKey}`,
          'Content-Type': 'application/json' }, body: '{}', redirect: 'error', signal: AbortSignal.timeout(5000),
      });
      if (!response.ok) throw new Error('Maintenance lookup failed');
      const state = await response.json();
      if (state.project_ref === options.expectedProject && state.frozen === false) return null;
    } catch { /* No fallback, role/header bypass, cached allowance or secret logs. */ }
    return new Response(JSON.stringify({ error: 'Spacetime is temporarily unavailable. Your device data should be kept intact.' }),
      { status: 503, headers });
  };
}
