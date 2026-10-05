"""Bounded TEST binding clearance with full private ownership before-images.

Historical identities require exact archived human confirmation as well as
current provider evidence. A provider 404 alone never permits clearance.
"""
from copy import deepcopy
from refresh_common import *
from refresh_apply import public_digest
from billing_activation import cleanup_plan, customer_proof, resource_missing
from refresh_assurance import capture_assurance, evidence_checked

ACCOUNTS = {'test': 'acct_1T8k5C4DAf6jX51s', 'live': 'acct_1T8k503WTu1LBD2m'}
BILLING_TABLES = ('subscriptions', 'user_roles', 'promo_codes', 'promo_redemptions')


def billing_view(owned):
    return {'project': owned['project'], 'public': {t: owned['public'][t] for t in BILLING_TABLES},
            'private': owned['private'], 'auth': owned['auth'], 'catalog': owned['catalog']}


def proof_state(proof):
    state = deepcopy({k: v for k, v in proof.items() if k not in ('started_at', 'finished_at')})
    # Stripe assigns a fresh Dashboard diagnostic link to each missing-resource
    # response. Retain every billing fact and the complete raw proof on disk.
    for customer in state.get('customers', []):
        responses = [customer.get(name, {}) for name in ('test_customer', 'live_customer')]
        responses.extend(customer.get('historical_subscription', {}).get(mode, {}) for mode in ('test', 'live'))
        for response in responses:
            error = response.get('body', {}).get('error', {})
            if (response.get('status') == 404 and error.get('type') == 'invalid_request_error'
                    and error.get('code') == 'resource_missing'):
                error.pop('request_log_url', None)
    return state


def historical_operation(source, owned, proof, choice):
    required={'user_id','id','customer_id','subscription_id','source_before_sha256',
              'owned_before_sha256','test_only_evidence'}
    if set(choice)!=required: raise RefreshError('Exact historical ownership choice required')
    evidence=read_json(evidence_checked(choice['test_only_evidence']))
    confirmation=evidence.get('historical_stripe',{})
    if confirmation.get('answer')!='Yes, it was only a test':
        raise RefreshError('Explicit historical test-only confirmation required')
    uid=choice['user_id']; key=canonical([uid])
    before=index_rows(owned['public']['subscriptions'],['user_id']).get(key)
    prior=index_rows(source['public']['subscriptions'],['user_id']).get(key)
    old_auth=index_rows(source['auth'],['id']).get(key); new_auth=index_rows(owned['auth'],['id']).get(key)
    if (not before or not prior or digest(before)!=choice['owned_before_sha256']
        or digest(prior)!=choice['source_before_sha256'] or before['id']!=choice['id']
        or any(r.get('stripe_customer_id')!=choice['customer_id']
            or r.get('stripe_subscription_id')!=choice['subscription_id'] for r in (before,prior))
        or not old_auth or not new_auth or old_auth['email']!=new_auth['email']
        or new_auth['email']!=confirmation.get('account_email')):
        raise RefreshError('Historical ownership/before-image changed')
    for row in (before,prior):
        if (row.get('status') not in ('cancelled','expired') or row.get('payment_source')!='stripe'
            or row.get('billing_environment') not in (None,'test') or row.get('lifetime_access')
            or row.get('apple_original_transaction_id')):
            raise RefreshError('Historical binding has an active/protected/different provider')
        # Cancelled/expired rows have no provider access under the existing
        # admission policy. Retain their dates even when an old test period
        # end is in the future; clearing a binding must never rewrite history.
    if any(r['user_id']==uid and r['role']=='admin' for r in owned['public']['user_roles']):
        raise RefreshError('Historical account has a protected role')
    for name in ('pending_stripe_checkouts','stripe_checkout_attempts','billing_provider_state'):
        if any(r.get('user_id')==uid for r in owned['private'][name]):
            raise RefreshError('Historical account has private billing ownership/activity')
    if any(r.get('identity')==choice['subscription_id'] for r in owned['private']['billing_events']):
        raise RefreshError('Historical subscription has durable event evidence requiring reconciliation')
    item=index_rows(proof['customers'],['user_id']).get(key)
    if not item or item.get('customer_id')!=choice['customer_id']:
        raise RefreshError('Historical provider proof missing')
    if (not customer_proof(item['test_customer'],choice['customer_id'],uid)
        or not resource_missing(item['live_customer'])
        or any(not resource_missing(item.get('historical_subscription',{}).get(mode,{})) for mode in ('test','live'))
        or any(not item.get(mode+'_subscriptions',{}).get('complete')
            or item[mode+'_subscriptions']['data'] for mode in ('test','live'))
        or not item.get('test_sessions',{}).get('complete')
        or any(s.get('status')=='open' or s.get('payment_status')=='paid'
            or s.get('livemode') is not False for s in item['test_sessions']['data'])):
        raise RefreshError('Historical test-only provider absence/ownership is unproved')
    changes={k:None for k in ('stripe_customer_id','stripe_subscription_id','payment_source','billing_environment')}
    after=deepcopy(before);after.update(changes)
    return {'table':'subscriptions','id':before['id'],'user_id':uid,'before':before,'after':after,
            'set':changes,'expected_before_sha256':digest(before),'evidence_sha256':digest(item),
            'test_only_choice_sha256':digest(choice),'kind':'confirmed-historical-test'}


def clearance_package(source, owned, proof, objects, assurance=None, historical=None):
    verify_packet(source, SOURCE); verify_packet(owned, OWNED)
    if proof.get('accounts') != ACCOUNTS or set(owned.get('private', {})) != set(PRIVATE_TABLES):
        raise RefreshError('Exact provider accounts and complete private inventory are required')
    if any(t['schema'] == 'public' and t['table_name'] == 'subscriptions' for t in owned['catalog']['triggers']):
        raise RefreshError('Subscription triggers require explicit clearance review')
    plan = cleanup_plan(source, billing_view(owned), proof)
    if historical:
        operation=historical_operation(source,owned,proof,historical)
        plan['operations'].append(operation)
        plan['conflicts']=[c for c in plan['conflicts'] if c['user_id']!=operation['user_id']]
    # Reject an unrelated contract on the live account rather than silently
    # assuming the two rehearsed Stripe accounts still describe every owner.
    if proof['live_contracts']['data']:
        raise RefreshError('Live contract inventory requires a fresh ownership review')
    expected = deepcopy(owned['public']); rows = index_rows(expected['subscriptions'], ['id'])
    for op in plan['operations']:
        before = rows.get(canonical([op['id']]))
        after = deepcopy(before); after.update(op['set'])
        customer_only=op['set']=={'stripe_customer_id':None}
        confirmed_history=op.get('kind')=='confirmed-historical-test' and historical is not None
        if (before != op['before'] or after != op['after'] or not (customer_only or confirmed_history)
                or customer_only and (before['stripe_subscription_id'] or before['payment_source']=='stripe')):
            raise RefreshError('Clearance differs from its exact allowed change')
        rows[canonical([op['id']])] = after
    expected['subscriptions'] = [rows[k] for k in sorted(rows)]
    return {'format': 1, 'mode': 'test-billing-clearance-package', 'source_project': SOURCE,
            'owned_project': OWNED, 'inputs': {'source': digest(source), 'owned': digest(owned),
                'provider': digest(proof), 'source_objects': digest(objects),
                'historical_choice':digest(historical)},
            'operations': plan['operations'], 'blocked_bindings': plan['conflicts'],
            'expected': expected, 'before_public_sha256': public_digest(owned['public'], owned['catalog']),
            'after_public_sha256': public_digest(expected, owned['catalog']),
            'unresolved_conflict_ids': [],
            'frozen_inputs': source.get('freeze_verified') is True and owned.get('freeze_verified') is True,
            'storage_receipt_mode': objects['mode'], 'provider_mutations': 0,
            'capture_assurance': capture_assurance(assurance, source, owned, objects),
            'limitations': ['unapproved historical bindings remain intact',
                           'confirmed test ownership archived; grants/trials/Apple/history preserved; no provider mutation']}


def clear_customers(connection, package, schema='public', name='subscriptions'):
    if (schema, name) not in (('public', 'subscriptions'), ('pg_temp', 'rf_clear_subscriptions')):
        raise RefreshError('Unsupported clearance destination')
    for op in package['operations']:
        allowed={'stripe_customer_id'} if op.get('kind')!='confirmed-historical-test' else {
            'stripe_customer_id','stripe_subscription_id','payment_source','billing_environment'}
        if set(op['set'])!=allowed or any(v is not None for v in op['set'].values()):
            raise RefreshError('Unsupported billing field change')
        assignments=sql.SQL(',').join(sql.SQL('{}=null').format(sql.Identifier(k)) for k in sorted(allowed))
        row = connection.execute(sql.SQL('update {} set {} where id=%s and user_id=%s and to_jsonb({})=%s::jsonb returning to_jsonb({})').format(
            sql.Identifier(schema, name),assignments,sql.Identifier(name),sql.Identifier(name)),
            (op['id'],op['user_id'],canonical(op['before']))).fetchone()
        if row is None or loads(canonical(row[0])) != op['after']:
            raise RefreshError('Billing write differs from its exact approved before/after-image')
    return len(package['operations'])
