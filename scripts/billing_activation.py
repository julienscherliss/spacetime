"""Pure billing activation planning. No entitlement or provider mutations."""
from copy import deepcopy
from refresh_common import RefreshError, digest, index_rows, canonical, OWNED, SOURCE


def resource_missing(result):
    return result.get('status') == 404 and result.get('body', {}).get('error', {}).get('code') == 'resource_missing'


def customer_proof(result, customer, owner):
    body = result.get('body', {})
    return (result.get('status') == 200 and body.get('object') == 'customer'
            and body.get('id') == customer and body.get('livemode') is False
            and body.get('deleted') is not True and body.get('metadata', {}).get('user_id') == owner)


def cleanup_plan(source, owned, proof):
    """Propose clearing only positively proved, unused TEST customer bindings.

    Public entitlements, trial dates, Apple claims and every private row survive.
    Full-row/private-state digests must be rechecked under later write gates/locks.
    A final reconciled source snapshot is still required; this is a rehearsal.
    """
    if source['project'] != SOURCE or owned['project'] != OWNED:
        raise RefreshError('Billing rehearsal project mismatch')
    if not proof.get('live_contracts', {}).get('complete') or set(proof.get('accounts', {})) != {'test', 'live'}:
        raise RefreshError('Complete mode-scoped provider evidence required')
    old = index_rows(source['public']['subscriptions'], ['user_id'])
    auth_old = index_rows(source['auth'], ['id'])
    auth_new = index_rows(owned['auth'], ['id'])
    evidence = index_rows(proof['customers'], ['user_id'])
    operations, conflicts = [], []
    for row in owned['public']['subscriptions']:
        customer, uid = row.get('stripe_customer_id'), row['user_id']
        if not customer:
            continue
        key = canonical([uid])
        prior = old.get(key)
        item = evidence.get(key)
        reasons = []
        if (not prior or prior.get('stripe_customer_id') != customer
                or prior.get('stripe_subscription_id') != row.get('stripe_subscription_id')):
            reasons.append('source_binding_changed_or_missing')
        if (not auth_old.get(key) or not auth_new.get(key)
                or auth_old[key].get('email') != auth_new[key].get('email')):
            reasons.append('auth_identity_requires_review')
        if not item or item.get('customer_id') != customer:
            reasons.append('provider_evidence_missing')
        else:
            if not customer_proof(item['test_customer'], customer, uid):
                reasons.append('test_customer_owner_or_mode_unproved')
            if not resource_missing(item['live_customer']):
                reasons.append('live_customer_exists_or_lookup_uncertain')
            for mode in ('test', 'live'):
                inventory = item.get(mode + '_subscriptions', {})
                # Live list cannot filter on a customer which does not exist;
                # complete account inventory establishes absence separately.
                if not inventory.get('complete') or inventory.get('data'):
                    reasons.append(mode + '_contracts_present_or_inventory_incomplete')
            sessions = item.get('test_sessions', {})
            if not sessions.get('complete') or any(s.get('status') == 'open' or s.get('payment_status') == 'paid'
                or s.get('livemode') is not False for s in sessions.get('data', [])):
                reasons.append('open_or_paid_test_checkout_or_inventory_incomplete')
        if row.get('stripe_subscription_id'):
            reasons.append('historical_subscription_unresolved_do_not_clear')
        if row.get('payment_source') == 'stripe' or row.get('billing_environment') == 'live':
            reasons.append('active_provider_binding_requires_review')
        if row.get('apple_original_transaction_id'):
            reasons.append('apple_owner_binding_requires_review')
        state = owned['private']
        if any(r.get('user_id') == uid for name in ('pending_stripe_checkouts', 'stripe_checkout_attempts') for r in state[name]):
            reasons.append('pending_checkout_state_requires_review')
        if any(r.get('user_id') == uid and r.get('provider') == 'stripe' for r in state['billing_provider_state']):
            reasons.append('private_provider_claim_requires_review')
        if reasons:
            conflicts.append({'user_id': uid, 'customer_id': customer, 'reasons': sorted(set(reasons)),
                              'expected_before_sha256': digest(row)})
            continue
        after = deepcopy(row)
        after['stripe_customer_id'] = None
        operations.append({'table': 'subscriptions', 'id': row['id'], 'user_id': uid,
                           'expected_before_sha256': digest(row), 'before': row, 'after': after,
                           'set': {'stripe_customer_id': None},
                           'evidence_sha256': digest(item)})
    return {'mode': 'plan-only', 'ready_to_apply': False, 'operations': operations, 'conflicts': conflicts,
            'source_sha256': digest(source), 'owned_sha256': digest(owned), 'provider_sha256': digest(proof),
            'expected_private_sha256': digest(owned['private']),
            'expected_state_sha256': {k: digest(owned[k]) for k in ('public', 'private', 'auth', 'catalog')},
            'blockers': ['separate approval and active source/target write gates required',
                         'fresh resolved final-refresh subscription state and provider reads required',
                         'full subscription/private/role preconditions must be locked and rechecked',
                         'historical missing subscription ownership remains unresolved'],
            'provider_mutations': 0}


def assert_preconditions(plan, current):
    if current['project'] != OWNED or any(digest(current[k]) != value for k,value in plan['expected_state_sha256'].items()):
        raise RefreshError('Billing state changed; invalidate the rehearsal plan')
    if digest(current['private']) != plan['expected_private_sha256']:
        raise RefreshError('Private billing state changed; invalidate the rehearsal plan')
    rows = index_rows(current['public']['subscriptions'], ['id'])
    for operation in plan['operations']:
        row = rows.get(canonical([operation['id']]))
        if row is None or digest(row) != operation['expected_before_sha256']:
            raise RefreshError('Subscription changed; invalidate the rehearsal plan')


def pending_plan(owned, proof, environment, account):
    if environment not in ('test', 'live') or proof['accounts'].get(environment) != account:
        raise RefreshError('Pending review requires an exact environment/account binding')
    rows = owned['private']['pending_stripe_checkouts']
    claims = [r for r in rows if r['environment'] == environment]
    return {'mode': 'plan-only', 'environment': environment, 'account': account,
            'claims': claims, 'claims_sha256': digest(claims), 'ready_to_apply': False,
            'other_mode_count': len(rows)-len(claims), 'provider_mutations': 0,
            'required_apply_contract': ['exact approved claim identities/digest only',
                'fresh account/mode/provider reads through existing revision-fenced reconciliation',
                'private per-event outcomes and failures; conflicts remain pending',
                'no create, expire, cancel, refund or account reassignment permissions']}
