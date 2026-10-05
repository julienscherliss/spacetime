import Stripe from 'https://esm.sh/stripe@18.5.0';
import {billingAdmin, reconcileBilling, type BillingContext} from '../supabase/functions/_shared/billing.ts';
import {currentStripeSnapshot} from '../supabase/functions/_shared/stripeBilling.ts';
import {applyRecovery, checkAccount, claimsChecked, prepareRecovery, sha256,
  type Binding, type Claim, type RecoveryPlan} from './pending-checkout-recovery.ts';

// Invoked only by the Node wrapper, which validates paths, keys and options.
try {
  const options = JSON.parse(Deno.env.get('SPACETIME_RECOVERY_OPTIONS')!);
  const binding: Binding = options.binding;
  if (!['count', 'prepare', 'apply'].includes(options.action)
    || Deno.env.get('SUPABASE_URL') !== 'https://zzoeywmurqiqticikyaf.supabase.co'
    || !Deno.env.get('STRIPE_SECRET_KEY')?.startsWith('sk_' + binding.environment + '_')
    || Deno.env.get('STRIPE_MONTHLY_PRICE_ID') !== binding.monthly
    || Deno.env.get('STRIPE_YEARLY_PRICE_ID') !== binding.yearly)
    throw new Error('Operator environment binding mismatch');
  const fetchGetOnly: typeof fetch = async (input, init) => {
    const request = new Request(input, init), url = new URL(request.url);
    if (request.method !== 'GET' || url.origin !== 'https://api.stripe.com'
      || !/^\/v1\/(account|customers\/cus_[A-Za-z0-9]+|subscriptions\/sub_[A-Za-z0-9]+)$/.test(url.pathname))
      throw new Error('Disallowed provider operation');
    return await fetch(request, {redirect: 'error'});
  };
  const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY')!, {apiVersion: '2025-08-27.basil',
    maxNetworkRetries: 0, timeout: 20000, httpClient: Stripe.createFetchHttpClient(fetchGetOnly)});
  const admin = billingAdmin();
  const claims = async () => {
    const {data, error} = await admin.rpc('pending_stripe_checkouts', {p_environment: binding.environment, p_user_id: null});
    if (error) throw new Error('Pending claim read failed');
    return claimsChecked(data, binding.environment);
  };
  const write = async (name: string, value: unknown) => {
    const file = await Deno.open(options.output + '/' + name, {write: true, createNew: true, mode: 0o600});
    try {
      const bytes = new TextEncoder().encode(JSON.stringify(value, null, 2) + '\n');
      let offset = 0;
      while (offset < bytes.length) {
        const written = await file.write(bytes.subarray(offset));
        if (written <= 0) throw new Error('Private evidence write interrupted');
        offset += written;
      }
      await file.sync();
    }
    finally {file.close();}
    const directory = await Deno.open(options.output, {read: true});
    try {await directory.sync();}
    finally {directory.close();}
  };
  let sequence = 0;
  const deps = {
    account: () => stripe.accounts.retrieve(), claims,
    customer: (id: string) => stripe.customers.retrieve(id),
    snapshot: (claim: Claim) =>
      currentStripeSnapshot(stripe, claim.identity, claim.customer_id, claim.user_id),
    reconcile: (context: Record<string, string>, retrieve: () => Promise<Record<string, unknown>>, claim: boolean) =>
      reconcileBilling(context as BillingContext, retrieve, claim),
    record: async (entry: Record<string, unknown>) => write(`journal-${String(++sequence).padStart(4, '0')}.json`,
      {...entry, at: new Date().toISOString(), binding}),
  };
  await checkAccount(binding, deps);
  await write('binding.json', {binding, account_verified: true, at: new Date().toISOString()});
  let summary: Record<string, unknown>;
  if (options.action === 'apply') {
    const plan: RecoveryPlan = JSON.parse(await Deno.readTextFile(options.plan));
    await write('attempt.json', {binding, approved_sha256: options.approvedHash, started_at: new Date().toISOString()});
    summary = {mode: 'selected-recovery', ...await applyRecovery(plan, binding, options.approvedHash, deps)};
  } else {
    const rows = await claims();
    if (options.action === 'prepare') {
      const plan = await prepareRecovery(binding, rows, options.events);
      await write('plan.json', plan);
      summary = {mode: 'plan-only', selected: plan.claims.length, plan_sha256: await sha256(plan), providerMutations: 0};
    } else summary = {mode: 'count-only', environment: binding.environment, pending: rows.length,
      providerMutations: 0, databaseMutations: 0};
  }
  await write('summary.json', summary);
  console.log(JSON.stringify(summary));
} catch {
  console.error('Recovery stopped. Inspect private evidence; no provider mutation was permitted.');
  Deno.exit(1);
}
