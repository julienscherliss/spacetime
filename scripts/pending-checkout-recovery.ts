// Local operator policy; no credentials or transports. The runner supplies the
// existing revision-fenced reconciliation and current-provider snapshot helpers.
export type Claim = {
  environment: string; identity: string; user_id: string; customer_id: string;
  event_id: string; reason: string; created_at: string; updated_at: string;
};
export type Binding = {
  project: string; environment: string; account: string; monthly: string; yearly: string;
};
export type RecoveryPlan = {
  format: number; mode: string; binding: Binding; claims: Claim[]; claims_sha256: string;
};
export class RecoveryRefused extends Error {}
const require = (condition: unknown) => {
  if (!condition) throw new RecoveryRefused('Recovery precondition failed; prepare a fresh plan');
};
export function canonical(value: unknown): string {
  if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']';
  if (value !== null && typeof value === 'object') return '{' + Object.entries(value)
    .sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0)
    .map(([key, item]) => JSON.stringify(key) + ':' + canonical(item)).join(',') + '}';
  require(value !== undefined && (typeof value !== 'number' || Number.isFinite(value)));
  return JSON.stringify(value);
}
export async function sha256(value: unknown) {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(canonical(value)));
  return Array.from(new Uint8Array(bytes), byte => byte.toString(16).padStart(2, '0')).join('');
}
export function validateBinding(binding: Binding) {
  require(Object.keys(binding).sort().join(',') === 'account,environment,monthly,project,yearly');
  require(binding.project === 'zzoeywmurqiqticikyaf');
  require(['test', 'live'].includes(binding.environment) && /^acct_[A-Za-z0-9]+$/.test(binding.account));
  require(/^price_[A-Za-z0-9]+$/.test(binding.monthly) && /^price_[A-Za-z0-9]+$/.test(binding.yearly)
    && binding.monthly !== binding.yearly);
}
export function claimsChecked(rows: unknown, environment: string): Claim[] {
  require(Array.isArray(rows));
  const seen = new Set<string>(), events = new Set<string>();
  for (const row of rows as Claim[]) {
    require(row && Object.keys(row).sort().join(',') ===
      'created_at,customer_id,environment,event_id,identity,reason,updated_at,user_id');
    require(row.environment === environment && /^sub_[A-Za-z0-9]+$/.test(row.identity)
      && /^cus_[A-Za-z0-9]+$/.test(row.customer_id) && /^evt_[A-Za-z0-9]+$/.test(row.event_id)
      && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(row.user_id)
      && typeof row.reason === 'string' && row.reason.length > 0
      && typeof row.created_at === 'string' && typeof row.updated_at === 'string'
      && Number.isFinite(Date.parse(row.created_at)) && Number.isFinite(Date.parse(row.updated_at)));
    require(!seen.has(row.identity) && !events.has(row.event_id));
    seen.add(row.identity); events.add(row.event_id);
  }
  return structuredClone(rows as Claim[]).sort((a, b) => a.identity < b.identity ? -1 : a.identity > b.identity ? 1 : 0);
}
export async function prepareRecovery(binding: Binding, rows: unknown, events: string[]) {
  validateBinding(binding);
  const inventory = claimsChecked(rows, binding.environment);
  require(events.length > 0 && new Set(events).size === events.length);
  const claims = inventory.filter(row => events.includes(row.event_id));
  require(claims.length === events.length);
  return {format: 1, mode: 'selected-pending-recovery', binding: structuredClone(binding), claims,
    claims_sha256: await sha256(claims)} satisfies RecoveryPlan;
}
type Dependencies = {
  account: () => Promise<{id: string; object: string}>;
  claims: () => Promise<unknown>;
  customer: (id: string) => Promise<{id: string; livemode?: boolean; deleted?: boolean; metadata?: {user_id?: string}}>;
  snapshot: (claim: Claim) => Promise<Record<string, unknown>>;
  reconcile: (context: Record<string, string>, retrieve: () => Promise<Record<string, unknown>>,
    claim: boolean) => Promise<{duplicate?: boolean; outcome?: string}>;
  // Must durably persist each record before resolving. Failure stops the batch.
  record: (entry: Record<string, unknown>) => Promise<void>;
};
export async function checkAccount(binding: Binding, deps: Pick<Dependencies, 'account'>) {
  validateBinding(binding);
  const account = await deps.account();
  require(account?.object === 'account' && account.id === binding.account);
}
export async function applyRecovery(plan: RecoveryPlan, binding: Binding, approvedHash: string, deps: Dependencies) {
  validateBinding(binding);
  require(plan && Object.keys(plan).sort().join(',') === 'binding,claims,claims_sha256,format,mode');
  require(plan.format === 1 && plan.mode === 'selected-pending-recovery'
    && canonical(plan.binding) === canonical(binding) && /^[a-f0-9]{64}$/.test(approvedHash)
    && await sha256(plan) === approvedHash);
  const selected = claimsChecked(plan.claims, binding.environment);
  require(selected.length > 0 && canonical(selected) === canonical(plan.claims)
    && await sha256(selected) === plan.claims_sha256);
  await checkAccount(binding, deps);
  const checkSelected = async (claims: Claim[]) => {
    const current = claimsChecked(await deps.claims(), binding.environment);
    for (const claim of claims) require(canonical(current.find(row => row.identity === claim.identity)) === canonical(claim));
  };
  await checkSelected(selected); // Validate all selected before the first write.
  let completed = 0;
  for (const claim of selected) {
    await checkSelected([claim]);
    await deps.record({event_id: claim.event_id, identity: claim.identity, phase: 'attempt-started'});
    try {
      const result = await deps.reconcile({p_user_id: claim.user_id, p_provider: 'stripe',
        p_environment: claim.environment, p_identity: claim.identity, p_event_id: claim.event_id}, async () => {
        // Executed after begin_billing_reconcile and again for each revision retry.
        await checkSelected([claim]);
        const customer = await deps.customer(claim.customer_id);
        require(customer.id === claim.customer_id && customer.deleted !== true
          && customer.livemode === (binding.environment === 'live') && customer.metadata?.user_id === claim.user_id);
        const snapshot = await deps.snapshot(claim);
        await checkSelected([claim]);
        return snapshot;
      }, true);
      require(result.duplicate === true || typeof result.outcome === 'string');
      await deps.record({event_id: claim.event_id, identity: claim.identity, phase: 'result',
        outcome: result.duplicate ? 'duplicate' : result.outcome});
      completed++;
    } catch {
      // A failed response can follow a successful commit. Never claim rollback
      // or automatically reuse the plan. Existing durable events resolve retries.
      await deps.record({event_id: claim.event_id, identity: claim.identity,
        phase: 'uncertain-or-refused', action: 'inspect durable billing state and prepare a fresh plan'});
      throw new RecoveryRefused('Recovery stopped; inspect private journal and durable billing state');
    }
  }
  return {completed, providerMutations: 0};
}
