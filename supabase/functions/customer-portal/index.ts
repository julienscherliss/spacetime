import { billingAdmin } from "../_shared/billing.ts";
import { stripeClient,stripeMode,billingOrigin } from "../_shared/stripeBilling.ts";
const headers={"Access-Control-Allow-Origin":"*","Access-Control-Allow-Headers":"authorization,x-client-info,apikey,content-type,x-supabase-client-platform,x-supabase-client-platform-version,x-supabase-client-runtime,x-supabase-client-runtime-version"};
const reply=(body:unknown,status=200)=>Response.json(body,{status,headers});
Deno.serve(async req=>{
  if(req.method==="OPTIONS") return new Response("ok",{headers});
  if(req.method!=="POST") return reply({error:"Method not allowed"},405);
  try {
    const token=req.headers.get("Authorization")?.match(/^Bearer (.+)$/)?.[1];
    if(!token) return reply({error:"Unauthorized"},401);
    const admin=billingAdmin();
    const {data:{user},error:authError}=await admin.auth.getUser(token);
    if(authError || !user) return reply({error:"Unauthorized"},401);
    const origin=billingOrigin(req);
    const {data:sub,error}=await admin.from("subscriptions").select("stripe_customer_id").eq("user_id",user.id).maybeSingle();
    if(error) throw error;
    if(!sub?.stripe_customer_id) return reply({error:"No billing account is linked to this account"},404);
    const stripe=stripeClient(),customer=await stripe.customers.retrieve(sub.stripe_customer_id);
    if(customer.deleted || customer.livemode !== (stripeMode()==="live")
      || (customer.metadata.user_id && customer.metadata.user_id!==user.id)) throw new Error("Customer identity mismatch");
    const session=await stripe.billingPortal.sessions.create({customer:customer.id,return_url:`${origin}/`});
    return reply({url:session.url});
  } catch {
    console.error("Billing portal identity or provider request failed");
    return reply({error:"Unable to open billing portal. Please try again."},500);
  }
});
