export interface Entitlement {
  status: string;
  lifetime_access: boolean;
  payment_source?: string | null;
  current_period_end: string | null;
  grace_period_end?: string | null;
  trial_end: string;
  apple_environment?: string | null;
  billing_environment?: string | null;
}
export function subscriptionHasAccess(sub: Entitlement | null, admin: boolean, now: number,
  allowSandbox = false, allowNativeAppleSandbox = false): boolean {
  if (admin || sub?.lifetime_access) return true;
  if (!sub) return false;
  // Historical fields remain for ownership checks after a provider switch.
  // Only the current provider's environment controls the current entitlement.
  const environment = sub.billing_environment ??
    (sub.payment_source === 'apple_iap' || !sub.payment_source ? sub.apple_environment : null);
  const nativeAppleTest = allowNativeAppleSandbox && sub.payment_source === 'apple_iap' && environment === 'Sandbox';
  if (!allowSandbox && !nativeAppleTest && (environment === 'test' || environment === 'Sandbox')) return false;
  if (sub.status === 'trialing') return Date.parse(sub.trial_end) > now;
  if (!['active','cancelling'].includes(sub.status)) return false;
  // Paid access always has a finite boundary. Grace must be explicitly verified
  // by the provider; there is no implicit extra time after a payment failure.
  return Math.max(Date.parse(sub.current_period_end ?? '') || 0, Date.parse(sub.grace_period_end ?? '') || 0) > now;
}
