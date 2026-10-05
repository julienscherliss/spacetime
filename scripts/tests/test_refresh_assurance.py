"""Focused accepted-gap bindings and chronology; local evidence only."""
import copy
from datetime import datetime, timezone, timedelta
import hashlib
from pathlib import Path
import sys
import tempfile
import unittest
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from refresh_common import *
from refresh_assurance import *
from refresh_apply import authorize


class AssuranceTests(unittest.TestCase):
    def setUp(self):
        self.temp=tempfile.TemporaryDirectory();root=Path(self.temp.name).resolve()
        self.accept=root/'accept.json'
        self.accept.write_text(canonical({'procedure':'coordinated-export-then-pause','accepted_gap':True,
            'answer':'Use the coordinated export-then-pause procedure and accept that gap'}))
        self.evidence={'path':str(self.accept),'sha256':hashlib.sha256(self.accept.read_bytes()).hexdigest()}
        t=datetime.now(timezone.utc)-timedelta(minutes=5)
        at=lambda n:(t+timedelta(seconds=n)).isoformat()
        self.source={'snapshot_time':at(10),'freeze_verified':False}
        self.owned={'started_at':at(50),'finished_at':at(60),'cron':[]}
        self.objects={'mode':'final-coordinated','objects':[],'capture_metadata':{
            'capture_start_utc':at(12),'capture_end_utc':at(30),'consistent_snapshot':True,
            'before_inventory_count':0,'after_inventory_count':0}}
        self.r={'format':1,'procedure':'coordinated-export-then-pause','source_project':SOURCE,'owned_project':OWNED,
            'inputs':{'source':digest(self.source),'owned':digest(self.owned),'source_objects':digest(self.objects)},
            'source_snapshot_time':at(10),'files_started_at':at(12),'files_finished_at':at(30),
            'export_completed_at':at(35),'source_pause_confirmed_at':at(40),'clients_closed_at':at(0),
            'owned_hold_started_at':at(45),'owned_snapshot_started_at':at(50),'owned_snapshot_finished_at':at(60),
            'gap_seconds':30,'missed_changes_possible':True,'clients_sync_and_closure_confirmed':True,
            'source_remains_paused':True,'owned_writes_and_jobs_held':True,
            **{k:copy.deepcopy(self.evidence) for k in ('acceptance_evidence','pause_evidence','client_evidence','owned_hold_evidence')}}

    def tearDown(self):self.temp.cleanup()

    def test_actual_metadata_bound_and_weaker_label_preserved(self):
        self.assertEqual(capture_assurance(self.r,self.source,self.owned,self.objects),self.r)
        for key in ('snapshot_time','freeze_verified'):
            changed=dict(self.source);changed[key]=True
            with self.subTest(key=key),self.assertRaises(RefreshError):capture_assurance(self.r,changed,self.owned,self.objects)

    def test_missing_pause_hold_closure_and_gap_acceptance_refuse(self):
        for key in ('clients_sync_and_closure_confirmed','source_remains_paused','owned_writes_and_jobs_held','missed_changes_possible'):
            r=copy.deepcopy(self.r);r[key]=False
            with self.subTest(key=key),self.assertRaises(RefreshError):checked_assurance(r,self.r['inputs'])
        self.accept.write_text('{}')
        with self.assertRaises(RefreshError):checked_assurance(self.r,self.r['inputs'])

    def test_snapshot_binding_chronology_and_measured_gap_refuse(self):
        for key,value in [('inputs',{}),('gap_seconds',0),('source_pause_confirmed_at',self.r['clients_closed_at']),
            ('files_finished_at',self.r['owned_snapshot_finished_at']),('source_snapshot_time','2026-10-05T01:00:00')]:
            r=copy.deepcopy(self.r);r[key]=value
            with self.subTest(key=key),self.assertRaises(RefreshError):checked_assurance(r,self.r['inputs'])

    def test_receipt_alone_never_authorizes_cutover(self):
        pkg={'unresolved_conflict_ids':[],'frozen_inputs':False,'storage_receipt_mode':'final-coordinated',
            'capture_assurance':self.r,'inputs':self.r['inputs']}
        with self.assertRaises(RefreshError):authorize(pkg,{},self.owned,'code')
        now=datetime.now(timezone.utc)
        a={'format':1,'action':'apply-public-refresh','package_sha256':digest(pkg),'code_sha256':'code',
            'source_project':SOURCE,'owned_project':OWNED,'human_cutover_approval_reference':'synthetic-only',
            'maintenance_active':True,'cron_configuration_held_by_procedure':True,'owned_before_sha256':digest(self.owned),
            'issued_at':now.isoformat(),'expires_at':(now+timedelta(minutes=10)).isoformat(),
            'maintenance_evidence':[self.evidence],'capture_assurance_sha256':digest(self.r)}
        authorize(pkg,a,self.owned,'code')
        pkg['frozen_inputs']=True
        with self.assertRaises(RefreshError):authorize(pkg,a,self.owned,'code')


if __name__=='__main__':unittest.main()
