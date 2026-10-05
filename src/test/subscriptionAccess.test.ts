import { describe, expect, it } from 'vitest';
import { subscriptionHasAccess, type Entitlement } from '@/lib/subscriptionAccess';
const now = Date.now();
const sub = (patch: Partial<Entitlement> = {}): Entitlement => ({ status:'active', lifetime_access:false,
  payment_source:'stripe', current_period_end:new Date(now+1000).toISOString(),trial_end:new Date(now-1000).toISOString(), ...patch });
describe('finite paid entitlement', () => {
  it('expires without a webhook, including cancellation', () => {
    for(const status of ['active','cancelling']) {
      expect(subscriptionHasAccess(sub({status}),false,now)).toBe(true);
      expect(subscriptionHasAccess(sub({status}),false,now+1001)).toBe(false);
    }
  });
  it('rejects active rows without a valid paid boundary', () => {
    expect(subscriptionHasAccess(sub({current_period_end:null}),false,now)).toBe(false);
    expect(subscriptionHasAccess(sub({current_period_end:'invalid'}),false,now)).toBe(false);
  });
  it('allows only explicit unexpired provider grace', () => {
    const value=sub({current_period_end:new Date(now-1000).toISOString(),grace_period_end:new Date(now+1000).toISOString()});
    expect(subscriptionHasAccess(value,false,now)).toBe(true);
    expect(subscriptionHasAccess(value,false,now+1001)).toBe(false);
    expect(subscriptionHasAccess({...value,status:'expired'},false,now)).toBe(false);
  });
  it('recognizes renewal and finite trial', () => {
    expect(subscriptionHasAccess(sub(),false,now+1001)).toBe(false);
    expect(subscriptionHasAccess(sub({current_period_end:new Date(now+2000).toISOString()}),false,now+1001)).toBe(true);
    expect(subscriptionHasAccess(sub({status:'trialing',trial_end:new Date(now+1000).toISOString()}),false,now)).toBe(true);
    expect(subscriptionHasAccess(sub({status:'trialing'}),false,now)).toBe(false);
  });
  it('preserves lifetime and admin privileges', () => {
    expect(subscriptionHasAccess(sub({status:'expired',lifetime_access:true}),false,now)).toBe(true);
    expect(subscriptionHasAccess(null,true,now)).toBe(true);
  });
  it('isolates test payments unless the rehearsal explicitly opts in', () => {
    for(const patch of [{billing_environment:'test'},{payment_source:'apple_iap',apple_environment:'Sandbox'}]) {
      expect(subscriptionHasAccess(sub(patch),false,now)).toBe(false);
      expect(subscriptionHasAccess(sub(patch),false,now,true)).toBe(true);
    }
  });
  it('uses the current provider after a switch while retaining Apple history', () => {
    expect(subscriptionHasAccess(sub({billing_environment:'live',apple_environment:'Sandbox'}),false,now)).toBe(true);
    expect(subscriptionHasAccess(sub({billing_environment:null,apple_environment:'Sandbox'}),false,now)).toBe(true);
    expect(subscriptionHasAccess(sub({payment_source:'apple_iap',billing_environment:'Production',apple_environment:'Sandbox'}),false,now)).toBe(true);
    expect(subscriptionHasAccess(sub({payment_source:'apple_iap',billing_environment:null,apple_environment:'Sandbox'}),false,now)).toBe(false);
    expect(subscriptionHasAccess(sub({payment_source:'apple_iap',billing_environment:null,apple_environment:'Production'}),false,now)).toBe(true);
    expect(subscriptionHasAccess(sub({payment_source:null,billing_environment:null,apple_environment:'Sandbox'}),false,now)).toBe(false);
    expect(subscriptionHasAccess(sub({billing_environment:'test',apple_environment:'Production'}),false,now)).toBe(false);
  });
  it('allows verified Apple Sandbox on iOS while excluding it from web and keeping Stripe TEST excluded', () => {
    const apple=sub({payment_source:'apple_iap',billing_environment:'Sandbox'});
    expect(subscriptionHasAccess(apple,false,now,false,true)).toBe(true);
    expect(subscriptionHasAccess(apple,false,now,false,false)).toBe(false);
    expect(subscriptionHasAccess(apple,false,now+1001,false,true)).toBe(false);
    expect(subscriptionHasAccess(sub({billing_environment:'test'}),false,now,false,true)).toBe(false);
  });
});
