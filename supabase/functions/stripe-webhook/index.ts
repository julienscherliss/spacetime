import { billingAdmin, reconcileBilling } from "../_shared/billing.ts";
import { stripeClient, stripeMode, currentStripeSnapshot } from "../_shared/stripeBilling.ts";
Deno.serve(async (req) => {
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405 });
  const secret = Deno.env.get("STRIPE_WEBHOOK_SECRET"), signature = req.headers.get("stripe-signature");
  if (!secret || !Deno.env.get("STRIPE_SECRET_KEY")) return new Response("Webhook unavailable", { status: 503 });
  if (!signature) return new Response("Missing signature", { status: 400 });
  const stripe = stripeClient();
  let event;
  try { event = await stripe.webhooks.constructEventAsync(await req.text(), signature, secret); }
  catch { return new Response("Invalid signature", { status: 400 }); }
  if (event.livemode !== (stripeMode() === "live")) return new Response("Webhook mode mismatch", { status: 400 });
  try {
    const object = event.data.object as unknown as Record<string, any>;
    const ref = (value: any): string | null => typeof value === "string" ? value : value?.id ?? null;
    const checkout = event.type === "checkout.session.completed";
    const subscriptionEvent = event.type.startsWith("customer.subscription.");
    const invoiceEvent = ["invoice.paid","invoice.payment_failed"].includes(event.type);
    const identity = subscriptionEvent ? ref(object.id) : checkout ? ref(object.subscription)
      : invoiceEvent ? ref(object.subscription ?? object.parent?.subscription_details?.subscription) : null;
    const customerId = ref(object.customer);
    if (!identity || !customerId) return Response.json({ received: true, ignored: true });
    // Customer lookup identifies an account only. The atomic commit separately
    // checks exact subscription, provider, mode and authenticated checkout claim.
    const { data: row, error } = await billingAdmin().from("subscriptions").select("user_id,stripe_customer_id")
      .eq("stripe_customer_id",customerId).maybeSingle();
    if (error) throw error;
    if (!row) return Response.json({ received: true, ignored: true });
    if (checkout && (object.metadata?.user_id !== row.user_id || object.mode !== "subscription"))
      throw new Error("Checkout identity mismatch");
    const result = await reconcileBilling({ p_user_id: row.user_id,p_provider: "stripe",p_environment: stripeMode(),
      p_identity: identity,p_event_id: event.id }, () => currentStripeSnapshot(stripe,identity,customerId,row.user_id),checkout);
    // Pending claims are durably retained for later provider events/operator
    // reconciliation. Acknowledging transport does not discard a paid conflict.
    return Response.json({ received: true, ...result, pending: result.outcome === "pending_checkout" });
  } catch {
    console.error("Stripe reconciliation failed; provider retry required");
    return new Response("Webhook processing failed", { status: 500 });
  }
});
