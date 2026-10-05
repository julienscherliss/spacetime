import type Stripe from "https://esm.sh/stripe@18.5.0";
import { billingAdmin, reconcileBilling } from "./billing.ts";
import { stripeMode, currentStripeSnapshot } from "./stripeBilling.ts";

export class CheckoutConflict extends Error {}
interface Attempt {
  id: string; plan: string; price_id: string; customer_id: string; origin: string;
  expires_at: number; created_at: number; session_id?: string;
}
interface PendingCheckout { user_id: string; environment: string; identity: string; customer_id: string; event_id: string }

// A paid conflict is never discarded. This may be called on an authenticated
// checkout retry or by the operator tool; the provider is reread after fencing.
export async function recoverPendingStripeCheckouts(stripe: Stripe, userId?: string) {
  const { data, error } = await billingAdmin().rpc("pending_stripe_checkouts", {
    p_environment: stripeMode(), p_user_id: userId ?? null,
  });
  if (error) throw error;
  const outcomes: string[] = [];
  for (const pending of data as PendingCheckout[]) {
    const result = await reconcileBilling({ p_user_id: pending.user_id, p_provider: "stripe",
      p_environment: pending.environment, p_identity: pending.identity, p_event_id: pending.event_id },
      () => currentStripeSnapshot(stripe, pending.identity, pending.customer_id, pending.user_id), true);
    outcomes.push(result.outcome ?? (result.duplicate ? "duplicate" : "unknown"));
  }
  return outcomes;
}

export async function prepareStripeCheckout(stripe: Stripe, userId: string, customerId: string, plan: string,
  priceId: string, origin: string) {
  const admin = billingAdmin(), token = crypto.randomUUID(), environment = stripeMode();
  const manage = async (action: string, attempt: Attempt | null = null) => {
    const { data, error } = await admin.rpc("manage_stripe_checkout", {
      p_user_id: userId, p_environment: environment, p_token: token, p_action: action, p_attempt: attempt,
    });
    if (error) throw error;
    if (data.conflict) throw new CheckoutConflict(data.conflict === "busy"
      ? "Checkout is being prepared. Please try again in a moment."
      : data.conflict === "payment_review" ? "A payment needs review. Please contact support before paying again."
      : "An entitlement is already active. Manage the existing subscription first.");
    return data;
  };
  // Resolve an earlier paid conflict before offering any additional payment.
  await recoverPendingStripeCheckouts(stripe, userId);
  const reserved = await manage("reserve");
  let attempt = reserved.attempt as Attempt | null;
  const validate = (session: Stripe.Checkout.Session, a: Attempt) => {
    const customer = typeof session.customer === "string" ? session.customer : session.customer?.id;
    if (a.customer_id !== customerId || customer !== a.customer_id || session.livemode !== (environment === "live") || session.mode !== "subscription"
      || session.metadata?.user_id !== userId || session.metadata?.checkout_attempt !== a.id
      || session.metadata?.plan !== a.plan) throw new Error("Checkout identity mismatch");
  };
  const create = (a: Attempt) => stripe.checkout.sessions.create({customer:a.customer_id,mode:"subscription",
    line_items:[{price:a.price_id,quantity:1}],success_url:`${a.origin}/app?checkout=success`,
    cancel_url:`${a.origin}/app?checkout=cancelled`,expires_at:a.expires_at,
    metadata:{user_id:userId,plan:a.plan,checkout_attempt:a.id},subscription_data:{metadata:{user_id:userId,plan:a.plan}}},
    {idempotencyKey:`spacetime-checkout-${a.id}`});
  const recoverSession = async (a: Attempt): Promise<Stripe.Checkout.Session | null> => {
    if (a.session_id) return stripe.checkout.sessions.retrieve(a.session_id);
    // A timeout may have created a session without returning its ID. Locate it
    // before retrying; after the idempotency window, never recreate an old attempt.
    for await (const candidate of stripe.checkout.sessions.list({customer:a.customer_id,
      created:{gte:a.created_at-5},limit:100})) {
      if (candidate.metadata?.checkout_attempt === a.id) return candidate;
    }
    if (a.expires_at < Math.floor(Date.now()/1000)+1801) return null;
    return create(a);
  };
  const expire = async (session: Stripe.Checkout.Session) => {
    if (session.status !== "open") return session;
    try { return await stripe.checkout.sessions.expire(session.id); }
    catch {
      // Completion can race expiration. Only retire after confirmed expiration;
      // a completed or still-open page is not permission to create another one.
      const current = await stripe.checkout.sessions.retrieve(session.id);
      if (current.status !== "expired") throw new CheckoutConflict("The existing checkout needs review before starting another payment.");
      return current;
    }
  };
  try {
    let session = attempt ? await recoverSession(attempt) : null;
    if (session && attempt) {
      validate(session, attempt);
      attempt = {...attempt,session_id:session.id};
      await manage("save",attempt);
      if (session.status === "complete") {
        const identity = typeof session.subscription === "string" ? session.subscription : session.subscription?.id;
        if (!identity) throw new CheckoutConflict("Your payment is still processing. Please try again shortly.");
        const result = await reconcileBilling({p_user_id:userId,p_provider:"stripe",p_environment:environment,
          p_identity:identity,p_event_id:`checkout-recovery:${session.id}`},
          () => currentStripeSnapshot(stripe,identity,customerId,userId),true);
        if (result.outcome === "pending_checkout") throw new CheckoutConflict("A payment needs review. Please contact support before paying again.");
        const admission = await manage("save",attempt);
        if (admission.blocked) throw new CheckoutConflict("An entitlement is already active. Manage the existing subscription first.");
        // A completed but now inactive subscription may be replaced.
        session = null;
      } else if (session.status === "open" && (attempt.plan !== plan || attempt.price_id !== priceId || attempt.origin !== origin)) {
        session = await expire(session);
      }
      if (!session || session.status === "expired") {
        await manage("save",null); attempt = null; session = null;
      }
    } else if (attempt) {
      await manage("save",null); attempt = null;
    }
    // Do not rely on a delayed webhook to discover an existing Stripe contract.
    for await (const existing of stripe.subscriptions.list({customer:customerId,status:"all",limit:100})) {
      if (["active","trialing","past_due","unpaid","paused","incomplete"].includes(existing.status)) {
        if (session?.status === "open") await expire(session);
        throw new CheckoutConflict("A Stripe subscription is already linked. Manage it in the billing portal before paying again.");
      }
    }
    // Refresh an expired-looking Apple row before offering another provider.
    const {data:sub,error} = await admin.from("subscriptions").select("payment_source,apple_original_transaction_id,apple_environment")
      .eq("user_id",userId).single();
    if (error) throw error;
    if (sub.payment_source === "apple_iap" && sub.apple_original_transaction_id) {
      const {currentAppleSnapshot} = await import("./appleBilling.ts");
      const {assertEnvironment} = await import("./appleJws.ts");
      const appleEnvironment = assertEnvironment(sub.apple_environment);
      await reconcileBilling({p_user_id:userId,p_provider:"apple_iap",p_environment:appleEnvironment,
        p_identity:sub.apple_original_transaction_id,p_event_id:`checkout-preflight:${crypto.randomUUID()}`},
        () => currentAppleSnapshot(sub.apple_original_transaction_id,appleEnvironment,userId));
    }
    if (!attempt) {
      const createdAt = Math.floor(Date.now()/1000);
      attempt = {id:crypto.randomUUID(),plan,price_id:priceId,customer_id:customerId,origin,created_at:createdAt,expires_at:createdAt+3600};
      const admission = await manage("save",attempt);
      if (admission.blocked) throw new CheckoutConflict("An entitlement is already active. Manage the existing subscription first.");
      session = await create(attempt);
    }
    if (!session) throw new Error("Checkout session unavailable");
    validate(session,attempt);
    attempt = {...attempt,session_id:session.id};
    const admission = await manage("save",attempt);
    if (admission.blocked) {
      await expire(session);
      throw new CheckoutConflict("An entitlement is already active. Manage the existing subscription first.");
    }
    if (session.status !== "open" || !session.url) throw new CheckoutConflict("Your checkout is no longer open. Please try again.");
    return session.url;
  } finally {
    await manage("release");
  }
}
