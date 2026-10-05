import Stripe from "https://esm.sh/stripe@18.5.0";
import { isoMillis } from "./billing.ts";
export function stripeClient() {
  const key = Deno.env.get("STRIPE_SECRET_KEY");
  if (!key) throw new Error("Stripe configuration unavailable");
  // Pin the request schema to the installed SDK. Webhook snapshots are only
  // identity hints, never entitlement state, so their API version is immaterial.
  return new Stripe(key, { apiVersion: "2025-08-27.basil" });
}
export function stripeMode() { return Deno.env.get("STRIPE_SECRET_KEY")?.startsWith("sk_live_") ? "live" : "test"; }
export function stripePriceId(plan: string) {
  const id = Deno.env.get(plan === "monthly" ? "STRIPE_MONTHLY_PRICE_ID" : "STRIPE_YEARLY_PRICE_ID");
  if (!id) throw new Error("Subscription prices unavailable");
  return id;
}
export function validateStripePrice(price: Stripe.Price, plan: string, checkout = false) {
  const interval = plan === "monthly" ? "month" : "year";
  if (price.id !== stripePriceId(plan) || price.livemode !== (stripeMode() === "live")
    || price.currency !== "usd" || price.type !== "recurring" || price.recurring?.interval !== interval
    || price.recurring.interval_count !== 1 || !price.unit_amount || (checkout && !price.active))
    throw new Error("Subscription price configuration mismatch");
}
export function billingOrigin(req: Request) {
  const origin = req.headers.get("origin");
  if (!origin || origin === "capacitor://localhost") return "https://launchspacetime.com";
  const allowed = new Set(["https://launchspacetime.com", "https://www.launchspacetime.com"]);
  if (stripeMode() === "test") ["http://localhost:5173","http://localhost:5175"].forEach(v => allowed.add(v));
  if (!allowed.has(origin)) throw new Error("Unapproved billing return origin");
  return origin;
}
export async function currentStripeSnapshot(stripe: Stripe, identity: string, customerId: string, userId: string) {
  const sub = await stripe.subscriptions.retrieve(identity);
  const customer = typeof sub.customer === "string" ? sub.customer : sub.customer.id;
  if (sub.id !== identity || customer !== customerId || sub.livemode !== (stripeMode() === "live")
    || (sub.metadata.user_id && sub.metadata.user_id !== userId)) throw new Error("Stripe subscription identity mismatch");
  const items = sub.items.data;
  if (items.length !== 1 || items[0].quantity !== 1) throw new Error("Unsupported subscription items");
  const item = items[0];
  const plan = item.price.id === stripePriceId("monthly") ? "monthly" : "yearly";
  validateStripePrice(item.price, plan);
  const active = sub.status === "active" && item.current_period_end * 1000 > Date.now();
  return { customer_id: customer, plan, provider_status: sub.status,
    status: sub.status === "trialing" ? "trialing" : active ? (sub.cancel_at_period_end ? "cancelling" : "active") : "cancelled",
    period_start: isoMillis(item.current_period_start * 1000), period_end: isoMillis(item.current_period_end * 1000),
    trial_end: isoMillis(sub.trial_end ? sub.trial_end * 1000 : null), grace_end: null };
}
