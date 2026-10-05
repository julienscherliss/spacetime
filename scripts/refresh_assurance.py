"""Verify bindings for the explicitly accepted export-then-pause gap.

Operator evidence does not establish platform-level absence of writes.
"""
from datetime import datetime, timezone
from pathlib import Path
import hashlib
from decimal import Decimal
from refresh_common import RefreshError, SOURCE, OWNED, digest, read_json, safe_path


def evidence_checked(entry):
    if set(entry) != {'path', 'sha256'}:
        raise RefreshError('Exact private evidence path/hash required')
    path = safe_path(Path(entry['path']), existing=True)
    if hashlib.sha256(path.read_bytes()).hexdigest() != entry['sha256']:
        raise RefreshError('Capture evidence changed')
    return path


def capture_assurance(receipt, source, owned, objects):
    if receipt is None:
        return None
    checked_assurance(receipt, {'source': digest(source), 'owned': digest(owned), 'source_objects': digest(objects)})
    if (receipt['source_snapshot_time'] != source.get('snapshot_time')
            or receipt['owned_snapshot_started_at'] != owned.get('started_at')
            or receipt['owned_snapshot_finished_at'] != owned.get('finished_at')
            or source.get('freeze_verified') is True or objects['mode'] != 'final-coordinated'):
        raise RefreshError('Coordinated receipt differs from actual capture metadata')
    metadata=objects.get('capture_metadata',{})
    if (metadata.get('capture_start_utc')!=receipt['files_started_at']
            or metadata.get('capture_end_utc')!=receipt['files_finished_at']
            or metadata.get('consistent_snapshot') is not True
            or metadata.get('before_inventory_count')!=len(objects.get('objects',[]))
            or metadata.get('after_inventory_count')!=len(objects.get('objects',[]))):
        raise RefreshError('Final file-capture metadata is incomplete or differs')
    return receipt


def checked_assurance(receipt, bindings):
    fields = {'format', 'procedure', 'source_project', 'owned_project', 'inputs',
              'source_snapshot_time', 'files_started_at', 'files_finished_at',
              'export_completed_at', 'source_pause_confirmed_at', 'clients_closed_at',
              'owned_hold_started_at', 'owned_snapshot_started_at', 'owned_snapshot_finished_at',
              'gap_seconds', 'missed_changes_possible', 'clients_sync_and_closure_confirmed',
              'source_remains_paused', 'owned_writes_and_jobs_held', 'acceptance_evidence',
              'pause_evidence', 'client_evidence', 'owned_hold_evidence'}
    if (set(receipt) != fields or receipt['format'] != 1
            or receipt['procedure'] != 'coordinated-export-then-pause'
            or receipt['source_project'] != SOURCE or receipt['owned_project'] != OWNED
            or receipt['inputs'] != bindings or receipt['missed_changes_possible'] is not True
            or any(receipt[k] is not True for k in ('clients_sync_and_closure_confirmed',
                'source_remains_paused', 'owned_writes_and_jobs_held'))):
        raise RefreshError('Complete coordinated capture/hold evidence required')
    acceptance = read_json(evidence_checked(receipt['acceptance_evidence']))
    if (acceptance.get('procedure') != receipt['procedure'] or acceptance.get('accepted_gap') is not True
            or acceptance.get('answer') != 'Use the coordinated export-then-pause procedure and accept that gap'):
        raise RefreshError('Explicit human acceptance of this capture gap required')
    for key in ('pause_evidence', 'client_evidence', 'owned_hold_evidence'):
        evidence_checked(receipt[key])
    try:
        names = ('source_snapshot_time', 'files_started_at', 'files_finished_at', 'export_completed_at',
                 'source_pause_confirmed_at', 'clients_closed_at', 'owned_hold_started_at',
                 'owned_snapshot_started_at', 'owned_snapshot_finished_at')
        t = {k: datetime.fromisoformat(receipt[k]) for k in names}
        if any(v.tzinfo is None for v in t.values()): raise ValueError()
        if not (t['clients_closed_at'] <= t['source_snapshot_time'] <= t['export_completed_at']
                <= t['source_pause_confirmed_at'] <= t['owned_snapshot_started_at']
                <= t['owned_snapshot_finished_at'] <= datetime.now(timezone.utc)
                and t['clients_closed_at'] <= t['files_started_at'] <= t['files_finished_at']
                <= t['export_completed_at'] and t['owned_hold_started_at'] <= t['owned_snapshot_started_at']):
            raise ValueError()
        interval = t['source_pause_confirmed_at'] - min(t['source_snapshot_time'], t['files_started_at'])
        gap = Decimal(interval.days*86400+interval.seconds)+Decimal(interval.microseconds)/1000000
        if receipt['gap_seconds'] != gap: raise ValueError()
    except (TypeError, ValueError):
        raise RefreshError('Capture/hold chronology or measured gap is invalid') from None
