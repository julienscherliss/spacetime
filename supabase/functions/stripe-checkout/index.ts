import { billingAdmin } from "../_shared/billing.ts";
import { stripeClient, stripeMode, stripePriceId, validateStripePrice, billingOrigin } from "../_shared/stripeBilling.ts";
import { prepareStripeCheckout, CheckoutConflict } from "../_shared/stripeCheckout.ts";
const headers = {"Access-Control-Allow-Origin":"*","Access-Control-Allow-Headers":"authorization,x-client-info,apikey,content-type,x-supabase-client-platform,x-supabase-client-platform-version,x-supabase-client-runtime,x-supabase-client-runtime-version"};
const reply = (body:unknown,status=200) => Response.json(body,{status,headers});
Deno.serve(async req => {
  if(req.method === "OPTIONS") return new Response("ok",{headers});
  if(req.method !== "POST") return reply({error:"Method not allowed"},405);
  try {
    const token=req.headers.get("Authorization")?.match(/^Bearer (.+)$/)?.[1];
    if(!token) return reply({error:"Unauthorized"},401);
    const admin=billingAdmin();
    const {data:{user},error:authError}=await admin.auth.getUser(token);
    if(authError || !user) return reply({error:"Unauthorized"},401);
    const {plan}=await req.json();
    if(!["monthly","yearly"].includes(plan)) return reply({error:"Invalid plan"},400);
    const origin=billingOrigin(req),stripe=stripeClient();
    const price=await stripe.prices.retrieve(stripePriceId(plan));
    validateStripePrice(price,plan,true);
    const {data:sub,error}=await admin.from("subscriptions").select("*").eq("user_id",user.id).single();
    if(error) throw error;
    let customerId=sub.stripe_customer_id;
    if(!customerId) {
      const customer=await stripe.customers.create({email:user.email,metadata:{user_id:user.id}},
        {idempotencyKey:`spacetime-customer-${user.id}`});
      // Compare-and-set avoids replacing an account's already-bound customer.
      const {data:bound,error:writeError}=await admin.from("subscriptions")
        .update({stripe_customer_id:customer.id}).eq("user_id",user.id).is("stripe_customer_id",null)
        .select("stripe_customer_id").maybeSingle();
      if(writeError) throw writeError;
      if(bound) customerId=bound.stripe_customer_id;
      else {
        const {data:existing,error:readError}=await admin.from("subscriptions")
          .select("stripe_customer_id").eq("user_id",user.id).single();
        if(readError || !existing?.stripe_customer_id) throw new Error("Customer binding failed");
        customerId=existing.stripe_customer_id;
      }
    }
    const customer=await stripe.customers.retrieve(customerId);
    if(customer.deleted || customer.livemode !== (stripeMode()==="live")
      || (customer.metadata.user_id && customer.metadata.user_id !== user.id)) throw new Error("Customer identity mismatch");
    const url=await prepareStripeCheckout(stripe,user.id,customerId,plan,price.id,origin);
    return reply({url});
  } catch (error) {
    if(error instanceof CheckoutConflict) return reply({error:error.message},409);
    console.error("Checkout configuration or provider request failed");
    return reply({error:"Unable to start checkout. Please try again."},500);
  }
});
