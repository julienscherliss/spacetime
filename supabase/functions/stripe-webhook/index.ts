import { createClient } from "https://esm.sh/@supabase/supabase-js@2.101.1";
import Stripe from "https://esm.sh/stripe@18.5.0";

const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY")!, { apiVersion: "2025-08-27.basil" });

Deno.serve(async (req) => {
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  const body = await req.text();
  const sig = req.headers.get("stripe-signature");
  const webhookSecret = Deno.env.get("STRIPE_WEBHOOK_SECRET");

  if (!webhookSecret || !sig) {
    return new Response("Missing webhook secret or signature", { status: 400 });
  }

  let event: Stripe.Event;
  try {
    event = await stripe.webhooks.constructEventAsync(body, sig, webhookSecret);
  } catch (err) {
    console.error("Webhook signature verification failed:", err);
    return new Response("Invalid signature", { status: 400 });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  function safeTimestamp(ts: unknown): string | null {
    if (typeof ts !== "number" || ts <= 0) return null;
    try {
      return new Date(ts * 1000).toISOString();
    } catch {
      return null;
    }
  }

  // Live-mode safety: warn loudly if a test-mode event hits the live webhook
  if ((event as any).livemode === false) {
    console.warn("[stripe-webhook] Received TEST-MODE event on live webhook:", event.type, event.id);
  }

  try {
    console.log("Processing webhook event:", event.type, "livemode=", (event as any).livemode);

    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;
        const userId = session.metadata?.user_id;
        const plan = session.metadata?.plan;
        console.log("Checkout completed:", { userId, plan, subscription: session.subscription, customerId: session.customer });

        if (userId && session.subscription) {
          const { error } = await supabase.from("subscriptions").upsert(
            {
              user_id: userId,
              status: "active",
              plan,
              stripe_customer_id: session.customer as string,
              stripe_subscription_id: session.subscription as string,
              current_period_start: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            },
            { onConflict: "user_id" }
          );
          console.log("Subscription upsert result:", { userId, error });
        }
        break;
      }
      case "customer.subscription.updated": {
        const sub = event.data.object as Stripe.Subscription;
        const customerId = sub.customer as string;

        let { data: subRow } = await supabase
          .from("subscriptions")
          .select("user_id")
          .eq("stripe_customer_id", customerId)
          .maybeSingle();

        if (!subRow) {
          const result = await supabase
            .from("subscriptions")
            .select("user_id")
            .eq("stripe_subscription_id", sub.id)
            .maybeSingle();
          subRow = result.data;
        }

        if (subRow) {
          // Determine status: if cancel_at_period_end is true, user cancelled but still has access
          let status: string;
          if (sub.cancel_at_period_end) {
            status = "cancelling";
          } else if (sub.status === "active") {
            status = "active";
          } else if (sub.status === "trialing") {
            status = "trialing";
          } else {
            status = "cancelled";
          }

          const updateData: Record<string, unknown> = {
            status,
            updated_at: new Date().toISOString(),
          };

          const periodStart = safeTimestamp((sub as any).current_period_start);
          const periodEnd = safeTimestamp((sub as any).current_period_end);
          if (periodStart) updateData.current_period_start = periodStart;
          if (periodEnd) updateData.current_period_end = periodEnd;

          await supabase.from("subscriptions").update(updateData).eq("user_id", subRow.user_id);
          console.log("Subscription updated:", { userId: subRow.user_id, status, periodEnd });
        } else {
          console.warn("No subscription row found for customer:", customerId);
        }
        break;
      }
      case "customer.subscription.deleted": {
        const sub = event.data.object as Stripe.Subscription;
        const customerId = sub.customer as string;

        const { data: subRow } = await supabase
          .from("subscriptions")
          .select("user_id")
          .eq("stripe_customer_id", customerId)
          .maybeSingle();

        if (subRow) {
          await supabase.from("subscriptions").update({
            status: "cancelled",
            updated_at: new Date().toISOString(),
          }).eq("user_id", subRow.user_id);
          console.log("Subscription cancelled:", { userId: subRow.user_id });
        }
        break;
      }
      case "invoice.paid": {
        // Fired on initial purchase AND every renewal. Ensures access stays active.
        const invoice = event.data.object as Stripe.Invoice;
        const customerId = invoice.customer as string;
        const subscriptionId = (invoice as any).subscription as string | null;
        if (!subscriptionId) break;

        const { data: subRow } = await supabase
          .from("subscriptions")
          .select("user_id, status")
          .eq("stripe_customer_id", customerId)
          .maybeSingle();

        if (subRow) {
          // Only flip to "active" if not in a "cancelling" wind-down state
          const newStatus = subRow.status === "cancelling" ? "cancelling" : "active";
          const periodEnd = safeTimestamp((invoice as any).period_end);
          await supabase.from("subscriptions").update({
            status: newStatus,
            stripe_subscription_id: subscriptionId,
            ...(periodEnd ? { current_period_end: periodEnd } : {}),
            updated_at: new Date().toISOString(),
          }).eq("user_id", subRow.user_id);
          console.log("Invoice paid → access confirmed:", { userId: subRow.user_id, status: newStatus });
        } else {
          console.warn("invoice.paid for unknown customer:", customerId);
        }
        break;
      }
      case "invoice.payment_failed": {
        const invoice = event.data.object as Stripe.Invoice;
        const customerId = invoice.customer as string;
        console.warn("Invoice payment failed:", { customerId, invoiceId: invoice.id });
        // We do NOT immediately revoke access — Stripe will retry per dunning settings,
        // and customer.subscription.updated will move status to past_due/cancelled if it ultimately fails.
        break;
      }
    }
  } catch (err) {
    console.error("Webhook processing error:", err, "event:", event.type, event.id);
  }

  return new Response(JSON.stringify({ received: true }), {
    headers: { "Content-Type": "application/json" },
  });
});
