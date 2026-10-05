#!/usr/bin/env python3
"""Read current owned billing and Stripe GET inventories; write private plans only."""
import argparse
import re
from urllib.error import HTTPError
from urllib.parse import urlencode, quote
from refresh_common import *
from billing_activation import cleanup_plan, pending_plan

API_VERSION = '2026-02-25.clover'


class StripeReader:
    def __init__(self, key, mode):
        if mode not in ('test', 'live') or not key.startswith('sk_' + mode + '_'):
            raise RefreshError('Stripe mode/key mismatch')
        self.key = key
        class NoRedirect(HTTPRedirectHandler):
            def redirect_request(self, *args):
                raise RefreshError('Unexpected provider redirect')
        ca = '/etc/ssl/cert.pem' if ssl.get_default_verify_paths().cafile is None else None
        self.opener = build_opener(NoRedirect(), HTTPSHandler(context=ssl.create_default_context(cafile=ca)))

    def get(self, path, parameters=None):
        if not re.fullmatch(r'/v1/[a-z_/0-9A-Z]+', path):
            raise RefreshError('Unexpected provider path')
        url = 'https://api.stripe.com' + path + ('?' + urlencode(parameters) if parameters else '')
        req = Request(url, method='GET', headers={'Authorization': 'Bearer ' + self.key, 'Stripe-Version': API_VERSION})
        try:
            with self.opener.open(req, timeout=20) as response:
                return {'status': response.status, 'body': loads(response.read().decode())}
        except HTTPError as error:
            return {'status': error.code, 'body': loads(error.read().decode())}

    def inventory(self, path, parameters=None):
        values, seen = [], set()
        params = dict(parameters or {}, limit=100)
        for _ in range(100):
            response = self.get(path, params)
            body = response['body']
            if response['status'] != 200 or body.get('object') != 'list' or not isinstance(body.get('data'), list):
                raise RefreshError('Provider inventory failed; no partial plan accepted')
            page = body['data']
            for row in page:
                identity = row.get('id')
                if not identity or identity in seen:
                    raise RefreshError('Provider inventory duplicate or missing identity')
                seen.add(identity)
            values.extend(page)
            if body.get('has_more') is False:
                return {'complete': True, 'data': values}
            if body.get('has_more') is not True or not page:
                raise RefreshError('Provider pagination incomplete')
            params['starting_after'] = page[-1]['id']
        raise RefreshError('Provider inventory page bound reached')


def owned_snapshot():
    with connect() as c:
        cat = catalog(c)
        packet = {'project': OWNED, 'snapshot_at': now(), 'consistency': 'repeatable-read read-only',
                  'public': {name: table_rows(c, 'public', name, keys_for(cat, 'public', name))
                             for name in ('subscriptions', 'user_roles', 'promo_codes', 'promo_redemptions')},
                  'private': {name: table_rows(c, 'private', name, keys_for(cat, 'private', name)) for name in PRIVATE_TABLES},
                  'auth': rows_json(c, AUTH_QUERY), 'catalog': cat}
    return packet


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--source', type=Path, required=True)
    parser.add_argument('--prior-audit', type=Path, required=True)
    parser.add_argument('--output', type=Path, required=True)
    args = parser.parse_args()
    source = read_json(args.source)
    verify_packet(source, SOURCE)
    prior = read_json(args.prior_audit)
    if prior.get('project') != OWNED or not prior['summary']['accountMatches']:
        raise RefreshError('Prior provider account verification is missing')
    output = private_dir(args.output)
    owned = owned_snapshot()
    write_private(output / 'owned-billing-before.json', owned)
    values = env_file()
    readers = {'test': StripeReader(values['STRIPE_SECRET_KEY'], 'test'),
               'live': StripeReader(values['MIGRATION_STRIPE_LIVE_SECRET_KEY'], 'live')}
    accounts = {}
    for mode, reader in readers.items():
        response = reader.get('/v1/account')
        if response['status'] != 200 or response['body'].get('object') != 'account':
            raise RefreshError('Unable to identify provider account')
        accounts[mode] = response['body']['id']
    if accounts['live'] != prior['account']['body']['id']:
        raise RefreshError('Live provider account differs from the verified account')
    live_contracts = readers['live'].inventory('/v1/subscriptions', {'status': 'all'})
    proof = {'started_at': now(), 'api_version': API_VERSION, 'accounts': accounts,
             'live_contracts': live_contracts, 'customers': []}
    for row in owned['public']['subscriptions']:
        customer = row.get('stripe_customer_id')
        if not customer:
            continue
        item = {'user_id': row['user_id'], 'customer_id': customer}
        for mode, reader in readers.items():
            item[mode + '_customer'] = reader.get('/v1/customers/' + quote(customer, safe=''))
        item['test_subscriptions'] = readers['test'].inventory('/v1/subscriptions', {'customer': customer, 'status': 'all'})
        item['live_subscriptions'] = {'complete': True, 'data': [s for s in live_contracts['data']
            if (s.get('customer', {}).get('id') if isinstance(s.get('customer'), dict) else s.get('customer')) == customer]}
        item['test_sessions'] = readers['test'].inventory('/v1/checkout/sessions', {'customer': customer})
        if row.get('stripe_subscription_id'):
            item['historical_subscription'] = {mode: reader.get('/v1/subscriptions/' + quote(row['stripe_subscription_id'], safe=''))
                                                for mode, reader in readers.items()}
        proof['customers'].append(item)
    proof['finished_at'] = now()
    write_private(output / 'provider-get-proof.json', proof)
    after = owned_snapshot()
    sections = ('public', 'private', 'auth', 'catalog')
    unchanged = all(digest(owned[k]) == digest(after[k]) for k in sections)
    write_private(output / 'owned-billing-after.json', after)
    write_private(output / 'readonly-proof.json', {'unchanged': unchanged,
        'sections': {k: {'before': digest(owned[k]), 'after': digest(after[k])} for k in sections}})
    if not unchanged:
        raise RefreshError('Concurrent owned billing change; no rehearsal plan accepted')
    plan = cleanup_plan(source, owned, proof)
    write_private(output / 'cleanup-plan.json', plan)
    for mode in ('test', 'live'):
        write_private(output / ('pending-' + mode + '-plan.json'), pending_plan(owned, proof, mode, accounts[mode]))
    write_private(output / 'manifest.json', {'mode': 'read-only preparation', 'ready_to_apply': False,
        'source_ref': SOURCE, 'owned_ref': OWNED, 'source_snapshot_at': source['snapshot_time'],
        'cleanup_plan_sha256': digest(plan), 'owned_sha256': digest(owned), 'provider_sha256': digest(proof),
        'provider_mutations': 0, 'database_mutations': 0,
        'limitations': ['live pending apply not implemented', 'REFUND_REVERSED support operation not implemented',
            'historical missing subscription remains unresolved', 'final source refresh/freeze/approval still required']})
    print(canonical({'mode': 'plan-only', 'customer_bindings_reviewed': len(proof['customers']),
        'proposed_customer_clearances': len(plan['operations']), 'blocked_bindings': len(plan['conflicts']),
        'live_contracts': len(live_contracts['data']), 'pending_claims': len(owned['private']['pending_stripe_checkouts']),
        'owned_billing_state_unchanged': unchanged, 'mutations': 0}))


if __name__ == '__main__':
    cli_main(main)
