"""Rehearse draft guard logic on temporary relations only; no source installation."""
import importlib.util
from pathlib import Path
import sys
import unittest

sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from refresh_common import *
spec=importlib.util.spec_from_file_location('maintenance',Path(__file__).resolve().parents[1]/'prepare-maintenance-artifacts.py')
module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)


class DraftTests(unittest.TestCase):
    def test_private_drafts_cover_operations_roles_and_exact_inverse(self):
        packet=read_json(Path('.migration-private/final-refresh/20261004-rehearsal/source.json'))
        drafts=module.prepare_sql(packet)
        self.assertEqual(drafts['install.sql'].count('CREATE TRIGGER '),30)
        self.assertEqual(drafts['inverse.sql'].count('DROP TRIGGER '),30)
        self.assertEqual(drafts['install.sql'].count('ENABLE ALWAYS TRIGGER'),30)
        self.assertIn("VALUES (1,false,",drafts['install.sql'])
        self.assertNotIn('current_setting',module.guard_function())
        self.assertNotIn('auth.role()',module.guard_function())
        self.assertNotIn('CASCADE',drafts['inverse.sql'])
        self.assertIn("RAISE EXCEPTION 'Maintenance activation draft is blocked",drafts['activate-blocked.sql'])
        for job in packet['cron']: self.assertIn(job['jobname'],drafts['restore-jobs.sql'])

    def test_actual_postgres_roles_replica_and_missing_control_fail_closed(self):
        c=connect(readonly=False)
        try:
            c.execute('create temp table rf_guard_control(id integer primary key,active boolean not null) on commit drop')
            c.execute('insert into pg_temp.rf_guard_control values (1,false)')
            c.execute('create temp table rf_guard_data(id integer) on commit drop')
            c.execute(module.guard_function('pg_temp','rf_guard_control'))
            c.execute('create trigger rf_guard before insert or update or delete or truncate on pg_temp.rf_guard_data for each statement execute function pg_temp.reject_mutation()')
            c.execute('alter table pg_temp.rf_guard_data enable always trigger rf_guard')
            c.execute('grant select,insert,update,delete,truncate on pg_temp.rf_guard_data to anon,authenticated,service_role')
            for role in ('anon','authenticated','service_role'):
                c.execute(sql.SQL('set local role {}').format(sql.Identifier(role)))
                c.execute('insert into pg_temp.rf_guard_data values (1)')
                c.execute('reset role')
            c.execute('update pg_temp.rf_guard_control set active=true')
            for role in ('anon','authenticated','service_role','postgres'):
                c.execute(sql.SQL('set local role {}').format(sql.Identifier(role)))
                for operation in ('insert into pg_temp.rf_guard_data values (2)',
                                  'update pg_temp.rf_guard_data set id=3',
                                  'delete from pg_temp.rf_guard_data',
                                  'truncate pg_temp.rf_guard_data'):
                    c.execute('savepoint probe')
                    with self.assertRaises(psycopg.Error) as raised: c.execute(operation)
                    self.assertEqual(raised.exception.sqlstate,'55000')
                    c.execute('rollback to savepoint probe')
                self.assertEqual(c.execute('select count(*) from pg_temp.rf_guard_data').fetchone()[0],3)
                c.execute('reset role')
            c.execute("set local session_replication_role='replica'")
            c.execute('savepoint replica_probe')
            with self.assertRaises(psycopg.Error): c.execute('insert into pg_temp.rf_guard_data values (9)')
            c.execute('rollback to savepoint replica_probe')
            c.execute("set local session_replication_role='origin'")
            c.execute('delete from pg_temp.rf_guard_control')
            c.execute('savepoint missing_probe')
            with self.assertRaises(psycopg.Error): c.execute('insert into pg_temp.rf_guard_data values (9)')
            c.execute('rollback to savepoint missing_probe')
        finally: c.rollback();c.close()


if __name__=='__main__': unittest.main()
