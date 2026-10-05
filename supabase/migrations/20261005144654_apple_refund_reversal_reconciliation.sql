-- Ordered refund/reversal tombstones; no historical ledger entries are deleted.
-- Only the existing service-only reconciliation RPC can change this state.
ALTER TABLE private.apple_revoked_transactions
  ADD COLUMN last_event_signed_date bigint NOT NULL DEFAULT 0 CHECK(last_event_signed_date>=0),
  ADD COLUMN reversed boolean NOT NULL DEFAULT false;

CREATE OR REPLACE FUNCTION private.commit_billing_reconcile(p_user_id uuid, p_provider text,
  p_environment text, p_identity text, p_event_id text, p_ticket jsonb,
  p_snapshot jsonb, p_claim boolean DEFAULT false)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE st private.billing_provider_state; sub public.subscriptions;
  outcome text := 'applied'; tx text; version bigint; next_status text;
  paid_end timestamptz; grace_end timestamptz; protected boolean; same_identity boolean; effective_claim boolean;
  event_version bigint; reversed_tx text; reversal jsonb;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended(p_provider||p_environment||p_identity,0));
  IF EXISTS(SELECT 1 FROM private.billing_events e WHERE e.provider=p_provider
    AND e.environment=p_environment AND e.event_id=p_event_id AND e.outcome<>'pending_checkout') THEN
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
  effective_claim := p_claim OR (p_provider='stripe' AND EXISTS(SELECT 1 FROM private.pending_stripe_checkouts
    WHERE environment=p_environment AND identity=p_identity AND user_id=p_user_id));
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
      event_version := coalesce((p_snapshot->'revocation_event'->>'signed_date')::bigint,version);
      IF event_version<=0 OR (p_snapshot->'revocation_event'->>'event_id' IS NOT NULL
        AND p_snapshot->'revocation_event'->>'event_id'<>p_event_id) THEN
        RAISE EXCEPTION 'Invalid revocation event';
      END IF;
      INSERT INTO private.apple_revoked_transactions(environment,transaction_id,original_transaction_id,last_event_signed_date,reversed)
        VALUES(p_environment,p_snapshot->>'revoked_transaction',p_identity,event_version,false)
        ON CONFLICT(environment,transaction_id) DO UPDATE SET
          last_event_signed_date=greatest(private.apple_revoked_transactions.last_event_signed_date,excluded.last_event_signed_date),
          reversed=CASE WHEN excluded.last_event_signed_date>=private.apple_revoked_transactions.last_event_signed_date
            THEN false ELSE private.apple_revoked_transactions.reversed END
        WHERE private.apple_revoked_transactions.original_transaction_id=excluded.original_transaction_id;
      IF NOT FOUND THEN RAISE EXCEPTION 'Revoked transaction identity conflict'; END IF;
    END IF;
    reversal := p_snapshot->'refund_reversal';
    IF reversal IS NOT NULL AND reversal<>'null'::jsonb THEN
      reversed_tx := reversal->>'transaction_id';
      event_version := (reversal->>'signed_date')::bigint;
      IF reversed_tx IS NULL OR reversed_tx='' OR event_version IS NULL OR event_version<=0
        OR reversal->>'original_transaction_id' IS DISTINCT FROM p_identity
        OR reversal->>'environment' IS DISTINCT FROM p_environment
        OR reversal->>'event_id' IS DISTINCT FROM p_event_id
        OR coalesce((reversal->>'transaction_signed_date')::bigint,0)<event_version
        OR p_snapshot->>'revoked_transaction'=reversed_tx THEN
        RAISE EXCEPTION 'Invalid verified refund reversal';
      END IF;
      -- Preserve a tombstone: an older refund delivered later must not reinstate
      -- revocation. Equal signed dates fail closed in favor of revocation.
      INSERT INTO private.apple_revoked_transactions(environment,transaction_id,original_transaction_id,last_event_signed_date,reversed)
        VALUES(p_environment,reversed_tx,p_identity,event_version,true)
        ON CONFLICT(environment,transaction_id) DO UPDATE SET
          reversed=CASE WHEN excluded.last_event_signed_date>private.apple_revoked_transactions.last_event_signed_date
            THEN true ELSE private.apple_revoked_transactions.reversed END,
          last_event_signed_date=greatest(private.apple_revoked_transactions.last_event_signed_date,excluded.last_event_signed_date)
        WHERE private.apple_revoked_transactions.original_transaction_id=excluded.original_transaction_id;
      IF NOT FOUND THEN RAISE EXCEPTION 'Reversed transaction identity conflict'; END IF;
    END IF;
    IF EXISTS(SELECT 1 FROM private.apple_revoked_transactions
      WHERE environment=p_environment AND transaction_id=tx AND NOT reversed) THEN
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
    ELSIF p_environment IN ('Sandbox','test') AND sub.payment_source IN ('stripe','apple_iap')
      AND coalesce(sub.billing_environment,CASE WHEN sub.payment_source='apple_iap' THEN sub.apple_environment END,'')
        NOT IN ('Sandbox','test')
      THEN outcome := 'environment_conflict';
    ELSIF sub.billing_environment IS NOT NULL AND same_identity
      AND sub.billing_environment<>p_environment
      AND NOT (p_environment IN ('Production','live') AND sub.billing_environment IN ('Sandbox','test'))
      THEN outcome := 'environment_conflict';
    ELSIF NOT coalesce(same_identity,false) AND NOT effective_claim THEN outcome := 'identity_conflict';
    ELSIF NOT coalesce(same_identity,false) AND
      private.billing_has_provider_access(sub)
      AND NOT (p_environment IN ('Production','live') AND coalesce(sub.billing_environment,
        CASE WHEN sub.payment_source='apple_iap' THEN sub.apple_environment END,'') IN ('Sandbox','test'))
      THEN outcome := 'provider_conflict';
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
  -- A verified completed checkout remains recoverable if another entitlement
  -- wins the race. Later current-state events or an operator retry may claim it.
  IF p_provider='stripe' AND effective_claim AND p_user_id IS NOT NULL THEN
    IF next_status NOT IN ('active','cancelling','trialing') AND outcome<>'applied'
      AND p_snapshot->>'provider_status' IN ('canceled','incomplete_expired') THEN
      DELETE FROM private.pending_stripe_checkouts WHERE environment=p_environment AND identity=p_identity AND user_id=p_user_id;
      UPDATE private.billing_events e SET outcome='checkout_inactive' WHERE e.provider=p_provider
        AND e.environment=p_environment AND e.identity=p_identity AND e.outcome='pending_checkout';
      outcome := 'checkout_inactive';
    ELSIF outcome IN ('protected','provider_conflict','environment_conflict','customer_conflict','identity_conflict','inactive_claim') THEN
      INSERT INTO private.pending_stripe_checkouts(environment,identity,user_id,customer_id,event_id,reason)
        VALUES(p_environment,p_identity,p_user_id,p_snapshot->>'customer_id',p_event_id,outcome)
        ON CONFLICT(environment,identity) DO UPDATE SET reason=excluded.reason,updated_at=now()
        WHERE private.pending_stripe_checkouts.user_id=excluded.user_id;
      outcome := 'pending_checkout';
    ELSIF outcome IN ('applied','inactive_claim') THEN
      DELETE FROM private.pending_stripe_checkouts WHERE environment=p_environment AND identity=p_identity AND user_id=p_user_id;
      UPDATE private.billing_events e SET outcome=CASE WHEN next_status IN ('active','cancelling','trialing') THEN 'applied' ELSE 'checkout_inactive' END
        WHERE e.provider=p_provider AND e.environment=p_environment AND e.identity=p_identity AND e.outcome='pending_checkout';
    END IF;
  END IF;
  INSERT INTO private.billing_events(provider,environment,event_id,identity,outcome)
    VALUES(p_provider,p_environment,p_event_id,p_identity,outcome)
    ON CONFLICT(provider,environment,event_id) DO UPDATE SET outcome=excluded.outcome,processed_at=now();
  IF outcome='stale' AND p_user_id IS NOT NULL THEN
    SELECT * INTO sub FROM public.subscriptions WHERE user_id=p_user_id;
    next_status := sub.status; paid_end := sub.current_period_end;
  END IF;
  RETURN jsonb_build_object('outcome',outcome,'status',next_status,'expiresAt',paid_end);
END $$;

-- Live checkout may replace a test entitlement; protected/live access still blocks it.
CREATE OR REPLACE FUNCTION private.manage_stripe_checkout(p_user_id uuid,p_environment text,
  p_token uuid,p_action text,p_attempt jsonb DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE state private.stripe_checkout_attempts; sub public.subscriptions; blocked boolean;
BEGIN
  IF p_user_id IS NULL OR p_token IS NULL OR p_environment IS NULL OR p_environment NOT IN ('test','live')
    OR p_action IS NULL OR p_action NOT IN ('reserve','save','release') THEN RAISE EXCEPTION 'Invalid checkout request'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('checkout:'||p_user_id::text||':'||p_environment,0));
  INSERT INTO private.stripe_checkout_attempts(user_id,environment) VALUES(p_user_id,p_environment) ON CONFLICT DO NOTHING;
  SELECT * INTO state FROM private.stripe_checkout_attempts WHERE user_id=p_user_id AND environment=p_environment FOR UPDATE;
  IF p_action='release' THEN
    UPDATE private.stripe_checkout_attempts SET lease_token=NULL,lease_until=NULL
      WHERE user_id=p_user_id AND environment=p_environment AND lease_token=p_token;
    RETURN '{}'::jsonb;
  END IF;
  IF p_action='save' AND (state.lease_token IS DISTINCT FROM p_token OR state.lease_until<=now()) THEN
    RETURN jsonb_build_object('conflict','lease');
  END IF;
  IF p_action='reserve' AND state.lease_until>now() THEN RETURN jsonb_build_object('conflict','busy'); END IF;
  SELECT * INTO sub FROM public.subscriptions WHERE user_id=p_user_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Subscription row missing'; END IF;
  blocked := sub.lifetime_access OR coalesce(sub.payment_source IN ('admin','promo'),false)
    OR EXISTS(SELECT 1 FROM public.user_roles WHERE user_id=p_user_id AND role='admin')
    OR (private.billing_has_provider_access(sub) AND NOT (p_environment='live' AND coalesce(sub.billing_environment,
      CASE WHEN sub.payment_source='apple_iap' THEN sub.apple_environment END,'') IN ('Sandbox','test')));
  IF p_action='reserve' AND blocked THEN RETURN jsonb_build_object('conflict','entitlement'); END IF;
  IF p_action='reserve' AND EXISTS(SELECT 1 FROM private.pending_stripe_checkouts
    WHERE user_id=p_user_id AND environment=p_environment) THEN RETURN jsonb_build_object('conflict','payment_review'); END IF;
  IF p_action='reserve' THEN
    UPDATE private.stripe_checkout_attempts SET lease_token=p_token,lease_until=now()+interval '2 minutes'
      WHERE user_id=p_user_id AND environment=p_environment;
  ELSE
    IF p_attempt IS NOT NULL AND (jsonb_typeof(p_attempt)<>'object' OR p_attempt->>'id' IS NULL
      OR p_attempt->>'plan' NOT IN ('monthly','yearly') OR p_attempt->>'customer_id' IS NULL
      OR p_attempt->>'price_id' IS NULL OR p_attempt->>'origin' IS NULL OR p_attempt->>'expires_at' IS NULL) THEN
      RAISE EXCEPTION 'Invalid checkout attempt';
    END IF;
    UPDATE private.stripe_checkout_attempts SET attempt=p_attempt
      WHERE user_id=p_user_id AND environment=p_environment;
  END IF;
  RETURN jsonb_build_object('attempt',CASE WHEN p_action='save' THEN p_attempt ELSE state.attempt END,
    'blocked',blocked OR EXISTS(SELECT 1 FROM private.pending_stripe_checkouts WHERE user_id=p_user_id AND environment=p_environment));
END $$;
