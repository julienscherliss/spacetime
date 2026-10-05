import { createClient } from "npm:@supabase/supabase-js@2.101.1";
export function billingAdmin() {
  return createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false, autoRefreshToken: false } });
}
export type BillingContext = {
  p_user_id: string | null; p_provider: "stripe" | "apple_iap";
  p_environment: string; p_identity: string; p_event_id: string;
};
export class BillingConflict extends Error {}
export async function reconcileBilling(context: BillingContext,
  retrieve: () => Promise<Record<string, unknown>>, claim = false) {
  const admin = billingAdmin();
  // Revision acquired BEFORE provider read. The commit checks both the identity
  // and account revisions, fencing interleaved reads across providers.
  for (let attempt = 0; attempt < 3; attempt++) {
    const { data: ticket, error } = await admin.rpc("begin_billing_reconcile", context);
    if (error) throw error;
    if (ticket.conflict) throw new BillingConflict("Purchase belongs to another account");
    if (ticket.duplicate) return { duplicate: true };
    const snapshot = await retrieve();
    const { data: result, error: commitError } = await admin.rpc("commit_billing_reconcile", {
      ...context, p_ticket: ticket, p_snapshot: snapshot, p_claim: claim,
    });
    if (commitError) throw commitError;
    if (!result.retry) return result;
  }
  throw new Error("Concurrent billing change; retry required");
}
export function isoMillis(value?: number | null) {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? new Date(value).toISOString() : null;
}
