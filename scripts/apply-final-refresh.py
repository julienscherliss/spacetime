#!/usr/bin/env python3
"""Inspect, temporarily rehearse or explicitly apply the bounded public refresh."""
import argparse
import hashlib
import importlib.util
from pathlib import Path
from refresh_common import *
from refresh_apply import *


def code_digest():
    names = ('apply-final-refresh.py', 'refresh_apply.py', 'refresh_common.py',
             'refresh_resolutions.py', 'refresh_review.py', 'plan-final-refresh.py', 'refresh_assurance.py')
    return digest({name: hashlib.sha256((Path(__file__).parent/name).read_bytes()).hexdigest() for name in names})


def planner():
    spec = importlib.util.spec_from_file_location('refresh_validator', Path(__file__).with_name('plan-final-refresh.py'))
    module = importlib.util.module_from_spec(spec); spec.loader.exec_module(module)
    return module


def restore_status(attempt, output):
    attempt = safe_path(attempt)
    intent, package, owned = (read_json(attempt / name) for name in ('transaction-intent.json', 'package.json', 'before-state.json'))
    if intent['package_sha256'] != digest(package) or intent['before_state_sha256'] != digest(owned):
        raise RefreshError('Attempt artifacts differ from the durable intent')
    verify_packet(owned, OWNED)
    if package['owned_project'] != OWNED or package['inputs']['owned'] != digest(owned):
        raise RefreshError('Attempt project/before-state binding differs')
    with connect() as c:
        current = destination_state(c); c.rollback()
    result = 'ambiguous-or-later-changes'
    try:
        check_destination(current, owned, package['expected']); result = 'matches-exact-after'
    except RefreshError:
        try: check_destination(current, owned); result = 'matches-exact-before'
        except RefreshError: pass
    summary = {'mode': 'read-only-status', 'state': result, 'automatic_retry': False, 'mutations': 0}
    write_durable(output / 'status.json', summary)
    print(canonical(summary))


def main():
    p = argparse.ArgumentParser(description=__doc__)
    modes = p.add_mutually_exclusive_group()
    modes.add_argument('--rehearse', action='store_true')
    modes.add_argument('--apply', action='store_true')
    modes.add_argument('--status', action='store_true')
    for name in ('plan', 'source', 'owned', 'choices', 'source-objects', 'baseline', 'authorization', 'attempt-dir', 'capture-assurance'):
        p.add_argument('--'+name, type=Path)
    p.add_argument('--plan-sha256')
    p.add_argument('--output', type=Path, required=True)
    args = p.parse_args()
    output = safe_path(args.output)
    if output.exists(): raise RefreshError('Use a new private output directory for each attempt')
    if args.status:
        if not args.attempt_dir: p.error('--status requires --attempt-dir')
        return restore_status(args.attempt_dir, private_dir(output))
    if args.attempt_dir: p.error('--attempt-dir is only valid with --status')
    if not all(getattr(args, name) for name in ('plan', 'source', 'owned', 'choices', 'source_objects', 'baseline', 'plan_sha256')):
        p.error('Plan, snapshots, choices, file receipt, baseline and exact plan hash are required')
    if bool(args.authorization) != args.apply: p.error('--authorization is required only for --apply')
    plan, source, owned, choices, objects = (read_json(getattr(args, name))
        for name in ('plan', 'source', 'owned', 'choices', 'source_objects'))
    assurance = read_json(args.capture_assurance) if args.capture_assurance else None
    package = build_package(plan, source, owned, choices, args.baseline, objects, args.plan_sha256, assurance)
    code = code_digest()
    authorization = read_json(args.authorization) if args.apply else None
    if args.apply: authorize(package, authorization, owned, code) # Refuse before any connection.
    output = private_dir(output)
    write_durable(output / 'package.json', package)
    write_durable(output / 'code-receipt.json', {'code_sha256': code})
    summary = {'mode': 'inspection', 'operations': len(package['operations']),
               'unresolved_conflicts': len(package['unresolved_conflict_ids']),
               'package_sha256': digest(package), 'frozen_inputs': package['frozen_inputs'], 'persistent_mutations': 0}
    if not args.rehearse and not args.apply:
        write_durable(output / 'summary.json', summary); print(canonical(summary)); return
    c = connect(readonly=False)
    commit_started = False
    try:
        if args.apply: lock_destination(c) # Must precede the first SELECT.
        current_catalog = catalog(c)
        if digest(current_catalog) != digest(owned['catalog']):
            raise RefreshError('Destination schema changed since the bound snapshot')
        expected = deepcopy(package['expected'])
        problems = planner().validate_expected(c, expected, current_catalog, owned['auth'])
        if problems or public_digest(expected, current_catalog) != package['after_public_sha256']:
            raise RefreshError('Typed dependency validation changed or rejected the expected data')
        if args.apply:
            before = destination_state(c)
            check_destination(before, owned)
            write_durable(output / 'before-state.json', owned)
            write_durable(output / 'authorization.json', authorization)
            txid = c.execute('select txid_current()::text').fetchone()[0]
            write_durable(output / 'transaction-intent.json', {'package_sha256': digest(package),
                'before_state_sha256': digest(owned), 'code_sha256': code, 'transaction_id': txid,
                'action': 'bounded-public-insert-update', 'started_at': now()})
            totals = run_operations(c, package, current_catalog)
            check_destination(destination_state(c), owned, expected)
            # The supported maintenance procedure stays active beyond commit;
            # this authorization is an operator record, not a write-stop mechanism.
            authorize(package, authorization, owned, code)
            check_cron_hold(owned)
            commit_started = True
            c.commit()
            write_durable(output / 'commit-receipt.json', {'committed_response_received': True,
                'package_sha256': digest(package), 'transaction_id': txid,
                'after_public_sha256': package['after_public_sha256'], 'operations': totals, 'finished_at': now()})
            summary.update(mode='applied', persistent_mutations=sum(totals.values()))
        else:
            create_rehearsal(c, owned)
            totals = run_operations(c, package, current_catalog, 'pg_temp', 'rf_apply_')
            if public_digest(rehearsal_rows(c, current_catalog), current_catalog) != package['after_public_sha256']:
                raise RefreshError('Actual temporary SQL/trigger result differs from the expected data')
            c.rollback()
            summary.update(mode='temporary-rehearsal', temporary_operations=totals, rolled_back=True,
                           final_apply_ready=False)
        write_durable(output / 'summary.json', summary)
        print(canonical(summary))
    except Exception:
        try: c.rollback()
        except Exception: pass
        if commit_started:
            # Even a missing response/receipt can follow an accepted COMMIT.
            try: write_durable(output / 'uncertain-commit.json', {'state': 'uncertain',
                'action': 'keep maintenance active; use --status; do not replay automatically'})
            except Exception: pass
            raise RefreshError('Commit outcome needs inspection; keep maintenance active and use --status') from None
        raise
    finally: c.close()


if __name__ == '__main__': cli_main(main)
