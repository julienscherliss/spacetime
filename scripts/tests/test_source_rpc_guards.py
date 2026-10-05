"""Source RPC guard syntax and exception-boundary verification on temp objects only."""
import importlib.util
import copy
from pathlib import Path
import sys
import unittest
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from refresh_common import *
spec=importlib.util.spec_from_file_location('rpc_guard',Path(__file__).resolve().parents[1]/'prepare-source-rpc-guards.py')
guard=importlib.util.module_from_spec(spec);spec.loader.exec_module(guard)


class RPCGuardTests(unittest.TestCase):
    def test_exact_current_bodies_inverse_and_installation_blocked(self):
        audit=read_json(Path('.migration-private/final-refresh/20261004-source-control-audit/source-audit.json'))
        content=guard.drafts(audit)
        self.assertEqual(content['install-rpc-blocked.sql'].count('PERFORM migration_guard.assert_not_frozen();'),8)
        self.assertIn('RAISE EXCEPTION',content['install-rpc-blocked.sql'])
        for r in audit['routines']:
            if r['name'] in guard.ROUTINES:
                self.assertIn(r['definition'], content['inverse-rpc-blocked.sql'])
                self.assertIn(r['definition'].split('AS $function$')[0], content['install-rpc-blocked.sql'])
        self.assertNotIn('CASCADE', content['inverse-rpc-blocked.sql'])
        edited=copy.deepcopy(audit)
        next(r for r in edited['routines'] if r['name']=='email_queue_wake')['definition']+='\n-- stale edit'
        with self.assertRaises(RefreshError):guard.drafts(edited)

    def test_guard_error_cannot_be_swallowed_by_original_exception_handler(self):
        c=connect(readonly=False)
        try:
            c.execute('create temp table rpc_guard_control(id int primary key,active boolean) on commit drop')
            c.execute('insert into pg_temp.rpc_guard_control values (1,false)')
            c.execute('create temp table rpc_effects(id int) on commit drop')
            c.execute(guard.check_function('pg_temp','rpc_guard_control'))
            source="""CREATE OR REPLACE FUNCTION pg_temp.rpc_fixture() RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $function$
DECLARE marker integer;
BEGIN
  INSERT INTO pg_temp.rpc_effects VALUES(1);
  RAISE EXCEPTION 'Original handled failure';
EXCEPTION WHEN OTHERS THEN
  INSERT INTO pg_temp.rpc_effects VALUES(2);
END;
$function$;"""
            c.execute(guard.wrap_definition(source,'pg_temp.assert_not_frozen'))
            c.execute('select pg_temp.rpc_fixture()')
            self.assertEqual(c.execute('select count(*) from pg_temp.rpc_effects').fetchone()[0],1)
            c.execute('update pg_temp.rpc_guard_control set active=true')
            for role in ('anon','authenticated','service_role','postgres'):
                c.execute(sql.SQL('set local role {}').format(sql.Identifier(role)))
                c.execute('savepoint frozen')
                with self.assertRaises(psycopg.Error) as raised:c.execute('select pg_temp.rpc_fixture()')
                self.assertEqual(raised.exception.sqlstate,'55000')
                c.execute('rollback to savepoint frozen')
                c.execute('reset role')
            self.assertEqual(c.execute('select count(*) from pg_temp.rpc_effects').fetchone()[0],1)
            c.execute('delete from pg_temp.rpc_guard_control')
            c.execute('savepoint missing')
            with self.assertRaises(psycopg.Error):c.execute('select pg_temp.rpc_fixture()')
            c.execute('rollback to savepoint missing')
        finally:c.rollback();c.close()

    def test_all_eight_actual_source_wrappers_compile_in_temporary_schema_without_execution(self):
        audit=read_json(Path('.migration-private/final-refresh/20261004-source-control-audit/source-audit.json'))
        c=connect(readonly=False)
        try:
            c.execute('create temp table rpc_guard_compile_control(id int primary key,active boolean) on commit drop')
            c.execute(guard.check_function('pg_temp','rpc_guard_compile_control'))
            for row in audit['routines']:
                if row['name'] not in guard.ROUTINES:continue
                definition=guard.wrap_definition(row['definition'],'pg_temp.assert_not_frozen')
                definition=definition.replace('FUNCTION public.'+row['name']+'(', 'FUNCTION pg_temp.'+row['name']+'(',1)
                self.assertTrue(definition.startswith('CREATE OR REPLACE FUNCTION pg_temp.'))
                c.execute(definition)
            # No actual source routine or cloned routine is invoked. Network,
            # queue and scheduler calls in the saved bodies never execute.
            self.assertEqual(c.execute("select count(*) from pg_proc where pronamespace=pg_my_temp_schema() and proname=any(%s)",(list(guard.ROUTINES),)).fetchone()[0],8)
        finally:c.rollback();c.close()


if __name__=='__main__':unittest.main()
