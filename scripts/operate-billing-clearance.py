#!/usr/bin/env python3
"""Inspect/rehearse or explicitly clear exact approved TEST billing bindings."""
import argparse
import hashlib
import importlib.util
from pathlib import Path
from refresh_common import *
from refresh_apply import authorize, lock_destination, destination_state, check_destination, check_cron_hold, write_durable
from billing_clearance import *


def load_script(name):
    spec = importlib.util.spec_from_file_location(name, Path(__file__).with_name(name + '.py'))
    module = importlib.util.module_from_spec(spec); spec.loader.exec_module(module)
    return module


def code_digest():
    names = ('operate-billing-clearance.py', 'billing_clearance.py', 'billing_activation.py',
             'prepare-billing-activation.py', 'refresh_common.py', 'refresh_apply.py', 'refresh_assurance.py',
             'refresh_resolutions.py', 'refresh_review.py', 'apply-final-refresh.py')
    return digest({name: hashlib.sha256((Path(__file__).parent/name).read_bytes()).hexdigest() for name in names})


def fresh_proof(owned):
    reader_class = load_script('prepare-billing-activation').StripeReader
    values = env_file()
    readers = {'test': reader_class(values['STRIPE_SECRET_KEY'], 'test'),
               'live': reader_class(values['MIGRATION_STRIPE_LIVE_SECRET_KEY'], 'live')}
    proof = {'started_at': now(), 'api_version': load_script('prepare-billing-activation').API_VERSION,
             'accounts': {}, 'customers': []}
    for mode, reader in readers.items():
        account = reader.get('/v1/account')
        if account['status'] != 200 or account['body'].get('id') != ACCOUNTS[mode]:
            raise RefreshError('Provider account changed before clearance')
        proof['accounts'][mode] = account['body']['id']
    proof['live_contracts'] = readers['live'].inventory('/v1/subscriptions', {'status': 'all'})
    for row in owned['public']['subscriptions']:
        customer = row.get('stripe_customer_id')
        if not customer: continue
        # Schema values must never introduce extra provider path components.
        if not re.fullmatch(r'cus_[A-Za-z0-9]+', customer): raise RefreshError('Unexpected customer identity')
        item = {'user_id': row['user_id'], 'customer_id': customer}
        for mode, reader in readers.items():
            item[mode+'_customer'] = reader.get('/v1/customers/'+customer)
        item['test_subscriptions'] = readers['test'].inventory('/v1/subscriptions', {'customer': customer, 'status': 'all'})
        item['live_subscriptions'] = {'complete': True, 'data': [s for s in proof['live_contracts']['data']
            if (s.get('customer', {}).get('id') if isinstance(s.get('customer'), dict) else s.get('customer')) == customer]}
        item['test_sessions'] = readers['test'].inventory('/v1/checkout/sessions', {'customer': customer})
        identity = row.get('stripe_subscription_id')
        if identity:
            if not re.fullmatch(r'sub_[A-Za-z0-9]+', identity): raise RefreshError('Unexpected subscription identity')
            item['historical_subscription'] = {mode: reader.get('/v1/subscriptions/'+identity) for mode,reader in readers.items()}
        proof['customers'].append(item)
    proof['finished_at'] = now()
    return proof


def main():
    p = argparse.ArgumentParser(description=__doc__)
    modes = p.add_mutually_exclusive_group()
    modes.add_argument('--rehearse', action='store_true'); modes.add_argument('--apply', action='store_true')
    modes.add_argument('--status', action='store_true')
    for name in ('source','owned','provider','source-objects','authorization','attempt-dir','capture-assurance','historical-choice'):
        p.add_argument('--'+name,type=Path)
    p.add_argument('--package-sha256'); p.add_argument('--output',type=Path,required=True)
    args = p.parse_args()
    if safe_path(args.output).exists(): raise RefreshError('Use a fresh private output directory')
    output = private_dir(args.output)
    if args.status:
        if not args.attempt_dir: p.error('--status requires --attempt-dir')
        return load_script('apply-final-refresh').restore_status(args.attempt_dir,output)
    if args.attempt_dir: p.error('--attempt-dir is only valid with --status')
    if not all((args.source,args.owned,args.provider,args.source_objects)):
        p.error('Exact source, owned, provider and file receipts are required')
    if bool(args.authorization) != args.apply: p.error('--authorization is required only with --apply')
    source,owned,proof,objects = [read_json(path) for path in (args.source,args.owned,args.provider,args.source_objects)]
    assurance = read_json(args.capture_assurance) if args.capture_assurance else None
    historical = read_json(args.historical_choice) if args.historical_choice else None
    package = clearance_package(source,owned,proof,objects,assurance,historical); code = code_digest()
    if args.package_sha256 and args.package_sha256 != digest(package): raise RefreshError('Clearance package differs from approval')
    authorization = read_json(args.authorization) if args.apply else None
    if args.apply:
        if not args.package_sha256: p.error('--apply requires the exact approved --package-sha256')
        authorize(package,authorization,owned,code,'clear-test-billing-bindings')
        check_cron_hold(owned)
        current_proof = fresh_proof(owned)
        write_durable(output/'fresh-provider-proof.json',current_proof)
        if digest(proof_state(current_proof)) != digest(proof_state(proof)):
            raise RefreshError('Provider state changed; prepare and approve a new clearance package')
    write_durable(output/'package.json',package); write_durable(output/'code-receipt.json',{'code_sha256':code})
    summary={'mode':'inspection','customer_only_clearances':sum(op.get('kind')!='confirmed-historical-test' for op in package['operations']),
             'historical_test_clearances':sum(op.get('kind')=='confirmed-historical-test' for op in package['operations']),
             'blocked_bindings_preserved':len(package['blocked_bindings']),
             'package_sha256':digest(package),'provider_mutations':0,'persistent_mutations':0,'paid_launch_ready':False}
    if not args.apply and not args.rehearse:
        write_durable(output/'summary.json',summary);print(canonical(summary));return
    c=connect(readonly=False);commit_started=False
    try:
        if args.apply: lock_destination(c)
        if digest(catalog(c))!=digest(owned['catalog']):raise RefreshError('Schema changed before clearance')
        if args.rehearse:
            c.execute('create temp table rf_clear_subscriptions (like public.subscriptions including constraints including indexes) on commit drop')
            c.execute('insert into rf_clear_subscriptions select * from jsonb_populate_recordset(null::rf_clear_subscriptions,%s::jsonb)',(canonical(owned['public']['subscriptions']),))
            count=clear_customers(c,package,'pg_temp','rf_clear_subscriptions')
            actual=table_rows(c,'pg_temp','rf_clear_subscriptions',['id'])
            if digest(index_rows(actual,['id']))!=digest(index_rows(package['expected']['subscriptions'],['id'])):
                raise RefreshError('Complete temporary billing result differs')
            c.rollback();summary.update(mode='temporary-rehearsal',temporary_clearances=count,rolled_back=True)
            write_durable(output/'summary.json',summary);print(canonical(summary));return
        check_destination(destination_state(c),owned)
        write_durable(output/'before-state.json',owned);write_durable(output/'authorization.json',authorization)
        txid=c.execute('select txid_current()').fetchone()[0]
        write_durable(output/'transaction-intent.json',{'txid':txid,'package_sha256':digest(package),'code_sha256':code,'before_state_sha256':digest(owned)})
        count=clear_customers(c,package)
        check_destination(destination_state(c),owned,package['expected'])
        authorize(package,authorization,owned,code,'clear-test-billing-bindings')
        check_cron_hold(owned)
        # The supported maintenance procedure must stop old Checkout traffic;
        # DB locks cannot stop a provider session that was created externally.
        if (datetime.now(timezone.utc)-datetime.fromisoformat(current_proof['finished_at'])).total_seconds()>300:
            raise RefreshError('Provider precondition is too old; no clearance committed')
        commit_started=True;c.commit()
        summary.update(mode='committed-customer-clearance',persistent_mutations=count,txid=txid)
        write_durable(output/'commit-receipt.json',summary);print(canonical(summary))
    except Exception:
        try:c.rollback()
        except Exception:pass
        if commit_started:
            try:write_durable(output/'uncertain-commit.json',{'automatic_retry':False,'maintenance_must_remain_active':True})
            except Exception:pass
            raise RefreshError('Commit response/receipt uncertain; keep maintenance active and use --status, never automatically retry') from None
        raise
    finally:c.close()


if __name__=='__main__':cli_main(main)
