-- Forward-only billing repair. Historical migrations and imported entitlements stay intact.
ALTER TABLE public.subscriptions
  ADD COLUMN billing_environment text,
  ADD COLUMN grace_period_end timestamptz;

CREATE TABLE private.billing_revisions (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  revision bigint NOT NULL DEFAULT 0
);
CREATE TABLE private.billing_provider_state (
  provider text NOT NULL CHECK (provider IN ('stripe','apple_iap')),
  environment text NOT NULL CHECK (environment IN ('test','live','Sandbox','Production')),
  identity text NOT NULL,
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  revision bigint NOT NULL DEFAULT 0,
  signed_date bigint NOT NULL DEFAULT 0,
  PRIMARY KEY (provider, environment, identity)
);
CREATE TABLE private.billing_events (
  provider text NOT NULL,
  environment text NOT NULL,
  event_id text NOT NULL,
  identity text NOT NULL,
  outcome text NOT NULL,
  processed_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (provider, environment, event_id)
);
-- A refunded transaction stays revoked across old signed receipt replays. A new
-- transaction can renew the chain; refund reversals require deliberate reconciliation.
CREATE TABLE private.apple_revoked_transactions (
  environment text NOT NULL,
  transaction_id text NOT NULL,
  original_transaction_id text NOT NULL,
  PRIMARY KEY (environment, transaction_id)
);
ALTER TABLE private.billing_revisions ENABLE ROW LEVEL SECURITY;
ALTER TABLE private.billing_provider_state ENABLE ROW LEVEL SECURITY;
ALTER TABLE private.billing_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE private.apple_revoked_transactions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON private.billing_revisions, private.billing_provider_state,
  private.billing_events, private.apple_revoked_transactions FROM PUBLIC, anon, authenticated;

CREATE FUNCTION private.begin_billing_reconcile(p_user_id uuid, p_provider text,
  p_environment text, p_identity text, p_event_id text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE st private.billing_provider_state; ur bigint;
BEGIN
  IF p_provider NOT IN ('stripe','apple_iap') OR p_identity IS NULL OR p_identity = ''
     OR p_event_id IS NULL OR p_event_id = ''
     OR (p_provider='stripe' AND p_environment NOT IN ('test','live'))
     OR (p_provider='apple_iap' AND p_environment NOT IN ('Sandbox','Production')) THEN
    RAISE EXCEPTION 'Invalid billing identity';
  END IF;
  -- Identity lock precedes account lock consistently in both RPCs.
  PERFORM pg_advisory_xact_lock(hashtextextended(p_provider||p_environment||p_identity, 0));
  IF EXISTS (SELECT 1 FROM private.billing_events WHERE provider=p_provider
    AND environment=p_environment AND event_id=p_event_id) THEN
    RETURN jsonb_build_object('duplicate',true);
  END IF;
  INSERT INTO private.billing_provider_state(provider,environment,identity,user_id)
    VALUES(p_provider,p_environment,p_identity,NULL) ON CONFLICT DO NOTHING;
  SELECT * INTO st FROM private.billing_provider_state WHERE provider=p_provider
    AND environment=p_environment AND identity=p_identity FOR UPDATE;
  IF st.user_id IS NOT NULL AND p_user_id IS DISTINCT FROM st.user_id THEN
    RETURN jsonb_build_object('conflict','ownership');
  END IF;
  IF p_user_id IS NOT NULL THEN
    -- The historical unique index remains, and protects legacy first claims.
    IF p_provider='apple_iap' AND EXISTS(SELECT 1 FROM public.subscriptions
      WHERE apple_original_transaction_id=p_identity AND user_id<>p_user_id) THEN
      RETURN jsonb_build_object('conflict','ownership');
    END IF;
    INSERT INTO private.billing_revisions(user_id) VALUES(p_user_id) ON CONFLICT DO NOTHING;
    UPDATE private.billing_revisions SET revision=revision+1 WHERE user_id=p_user_id
      RETURNING revision INTO ur;
  END IF;
  UPDATE private.billing_provider_state SET revision=revision+1
    WHERE provider=p_provider AND environment=p_environment AND identity=p_identity
    RETURNING * INTO st;
  RETURN jsonb_build_object('revision',st.revision,'user_revision',ur);
END $$;

CREATE FUNCTION private.commit_billing_reconcile(p_user_id uuid, p_provider text,
  p_environment text, p_identity text, p_event_id text, p_ticket jsonb,
  p_snapshot jsonb, p_claim boolean DEFAULT false)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE st private.billing_provider_state; sub public.subscriptions;
  outcome text := 'applied'; tx text; version bigint; next_status text;
  paid_end timestamptz; grace_end timestamptz; protected boolean; same_identity boolean;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended(p_provider||p_environment||p_identity,0));
  IF EXISTS(SELECT 1 FROM private.billing_events WHERE provider=p_provider
    AND environment=p_environment AND event_id=p_event_id) THEN
    RETURN jsonb_build_object('duplicate',true);
  END IF;
  SELECT * INTO st FROM private.billing_provider_state WHERE provider=p_provider
    AND environment=p_environment AND identity=p_identity FOR UPDATE;
  IF NOT FOUND OR (st.user_id IS NOT NULL AND st.user_id IS DISTINCT FROM p_user_id)
    OR st.revision IS DISTINCT FROM (p_ticket->>'revision')::bigint THEN
    RETURN jsonb_build_object('retry',true);
  END IF;
  IF p_user_id IS NOT NULL THEN
    PERFORM 1 FROM private.billing_revisions WHERE user_id=p_user_id
      AND revision=(p_ticket->>'user_revision')::bigint FOR UPDATE;
    IF NOT FOUND THEN RETURN jsonb_build_object('retry',true); END IF;
    SELECT * INTO sub FROM public.subscriptions WHERE user_id=p_user_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Subscription row missing'; END IF;
  END IF;
  tx := p_snapshot->>'transaction_id';
  version := coalesce((p_snapshot->>'signed_date')::bigint,0);
  next_status := p_snapshot->>'status';
  paid_end := (p_snapshot->>'period_end')::timestamptz;
  grace_end := (p_snapshot->>'grace_end')::timestamptz;
  IF next_status NOT IN ('active','cancelling','trialing','expired','cancelled')
    OR p_snapshot->>'plan' NOT IN ('monthly','yearly') THEN
    RAISE EXCEPTION 'Invalid entitlement snapshot';
  END IF;
  IF p_provider='apple_iap' THEN
    IF tx IS NULL OR version<=0 THEN RAISE EXCEPTION 'Missing transaction version'; END IF;
    IF p_snapshot->>'revoked_transaction' IS NOT NULL THEN
      INSERT INTO private.apple_revoked_transactions VALUES(p_environment,p_snapshot->>'revoked_transaction',p_identity)
        ON CONFLICT DO NOTHING;
    END IF;
    IF EXISTS(SELECT 1 FROM private.apple_revoked_transactions
      WHERE environment=p_environment AND transaction_id=tx) THEN
      next_status := 'expired'; grace_end := NULL;
    END IF;
    IF version<st.signed_date THEN outcome := 'stale'; END IF;
  END IF;
  IF next_status IN ('active','cancelling') AND greatest(paid_end,grace_end)<=now() THEN
    next_status := 'expired';
  END IF;
  IF next_status IN ('active','cancelling') AND paid_end IS NULL THEN
    RAISE EXCEPTION 'Paid entitlement requires an expiry';
  END IF;
  IF p_user_id IS NULL THEN
    outcome := 'unclaimed';
  ELSIF outcome='applied' THEN
    protected := sub.lifetime_access OR sub.payment_source IN ('admin','promo')
      OR EXISTS(SELECT 1 FROM public.user_roles WHERE user_id=p_user_id AND role='admin');
    same_identity := CASE WHEN p_provider='stripe' THEN
      sub.payment_source='stripe' AND sub.stripe_subscription_id=p_identity
      AND sub.stripe_customer_id=p_snapshot->>'customer_id'
      ELSE sub.payment_source='apple_iap' AND sub.apple_original_transaction_id=p_identity END;
    IF protected THEN outcome := 'protected';
    ELSIF sub.billing_environment IS NOT NULL AND same_identity
      AND sub.billing_environment<>p_environment THEN outcome := 'environment_conflict';
    ELSIF NOT coalesce(same_identity,false) AND NOT p_claim THEN outcome := 'identity_conflict';
    ELSIF NOT coalesce(same_identity,false) AND
      sub.payment_source IN ('stripe','apple_iap') AND sub.status IN ('active','cancelling','trialing')
      AND greatest(sub.current_period_end,sub.grace_period_end)>now() THEN outcome := 'provider_conflict';
    ELSIF p_provider='stripe' AND sub.stripe_customer_id IS DISTINCT FROM p_snapshot->>'customer_id'
      THEN outcome := 'customer_conflict';
    ELSIF NOT coalesce(same_identity,false) AND next_status NOT IN ('active','cancelling','trialing')
      THEN outcome := 'inactive_claim';
    END IF;
  END IF;
  IF outcome='applied' THEN
    UPDATE public.subscriptions SET payment_source=p_provider,billing_environment=p_environment,
      status=next_status,plan=p_snapshot->>'plan',
      current_period_start=(p_snapshot->>'period_start')::timestamptz,
      current_period_end=paid_end,grace_period_end=grace_end,
      trial_end=coalesce((p_snapshot->>'trial_end')::timestamptz,trial_end),
      stripe_subscription_id=CASE WHEN p_provider='stripe' THEN p_identity ELSE stripe_subscription_id END,
      apple_original_transaction_id=CASE WHEN p_provider='apple_iap' THEN p_identity ELSE apple_original_transaction_id END,
      apple_latest_transaction_id=CASE WHEN p_provider='apple_iap' THEN tx ELSE apple_latest_transaction_id END,
      apple_environment=CASE WHEN p_provider='apple_iap' THEN p_environment ELSE apple_environment END,
      apple_product_id=CASE WHEN p_provider='apple_iap' THEN p_snapshot->>'product_id' ELSE apple_product_id END,
      apple_expires_at=CASE WHEN p_provider='apple_iap' THEN paid_end ELSE apple_expires_at END,
      apple_auto_renew=CASE WHEN p_provider='apple_iap' THEN (p_snapshot->>'auto_renew')::boolean ELSE apple_auto_renew END,
      updated_at=now() WHERE user_id=p_user_id;
  END IF;
  UPDATE private.billing_provider_state SET signed_date=greatest(signed_date,version),
    user_id=CASE WHEN outcome='applied' THEN coalesce(user_id,p_user_id) ELSE user_id END
    WHERE provider=p_provider AND environment=p_environment AND identity=p_identity;
  INSERT INTO private.billing_events(provider,environment,event_id,identity,outcome)
    VALUES(p_provider,p_environment,p_event_id,p_identity,outcome);
  IF outcome='stale' AND p_user_id IS NOT NULL THEN
    SELECT * INTO sub FROM public.subscriptions WHERE user_id=p_user_id;
    next_status := sub.status; paid_end := sub.current_period_end;
  END IF;
  RETURN jsonb_build_object('outcome',outcome,'status',next_status,'expiresAt',paid_end);
END $$;

-- Public entry points are invokers; only the service role can call the private definers.
CREATE FUNCTION public.begin_billing_reconcile(p_user_id uuid,p_provider text,
  p_environment text,p_identity text,p_event_id text) RETURNS jsonb
LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$
 SELECT private.begin_billing_reconcile(p_user_id,p_provider,p_environment,p_identity,p_event_id) $$;
CREATE FUNCTION public.commit_billing_reconcile(p_user_id uuid,p_provider text,
  p_environment text,p_identity text,p_event_id text,p_ticket jsonb,p_snapshot jsonb,p_claim boolean DEFAULT false)
RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$
 SELECT private.commit_billing_reconcile(p_user_id,p_provider,p_environment,p_identity,p_event_id,p_ticket,p_snapshot,p_claim) $$;
REVOKE ALL ON FUNCTION private.begin_billing_reconcile(uuid,text,text,text,text),
 private.commit_billing_reconcile(uuid,text,text,text,text,jsonb,jsonb,boolean),
 public.begin_billing_reconcile(uuid,text,text,text,text),
 public.commit_billing_reconcile(uuid,text,text,text,text,jsonb,jsonb,boolean) FROM PUBLIC,anon,authenticated;
GRANT USAGE ON SCHEMA private TO service_role;
GRANT EXECUTE ON FUNCTION private.begin_billing_reconcile(uuid,text,text,text,text),
 private.commit_billing_reconcile(uuid,text,text,text,text,jsonb,jsonb,boolean),
 public.begin_billing_reconcile(uuid,text,text,text,text),
 public.commit_billing_reconcile(uuid,text,text,text,text,jsonb,jsonb,boolean) TO service_role;

CREATE FUNCTION private.billing_owner(p_provider text,p_environment text,p_identity text)
RETURNS uuid LANGUAGE sql SECURITY DEFINER SET search_path='' AS $$
 SELECT user_id FROM private.billing_provider_state WHERE provider=p_provider AND environment=p_environment AND identity=p_identity $$;
CREATE FUNCTION public.billing_owner(p_provider text,p_environment text,p_identity text)
RETURNS uuid LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$
 SELECT private.billing_owner(p_provider,p_environment,p_identity) $$;
REVOKE ALL ON FUNCTION private.billing_owner(text,text,text),public.billing_owner(text,text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION private.billing_owner(text,text,text),public.billing_owner(text,text,text) TO service_role;
