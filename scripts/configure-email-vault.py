#!/usr/bin/env python3
"""Configure the owned email dispatcher from ignored local credentials, without logging secrets."""
import json
import os
from pathlib import Path
import subprocess
import tempfile

root = Path(__file__).resolve().parents[1]
env = {}
for line in (root / '.env.local').read_text().splitlines():
    if line and not line.startswith('#') and '=' in line:
        key, value = line.split('=', 1)
        env[key] = value.strip().strip('"').strip("'")
project = env.get('SUPABASE_PROJECT_REF')
if project != 'zzoeywmurqiqticikyaf' or (root / 'supabase/.temp/project-ref').read_text().strip() != project:
    raise SystemExit('Unexpected target project')
secret = env.get('SUPABASE_SERVICE_ROLE_KEY')
if not secret or secret.count('.') != 2:
    raise SystemExit('The existing verify_jwt=true email worker requires the legacy service-role JWT')
url = env.get('SUPABASE_URL')
if url != f'https://{project}.supabase.co':
    raise SystemExit('Unexpected project URL')
def literal(value):
    return "'" + value.replace("'", "''") + "'"

sql = """DO $configure$ DECLARE secret_id uuid; BEGIN
 SELECT id INTO secret_id FROM vault.secrets WHERE name='email_queue_service_role_key';
 IF secret_id IS NULL THEN
   PERFORM vault.create_secret(%s, 'email_queue_service_role_key', 'Owned Spacetime email dispatcher');
 ELSE
   PERFORM vault.update_secret(secret_id, %s, 'email_queue_service_role_key', 'Owned Spacetime email dispatcher');
 END IF;
 UPDATE private.email_dispatch_config SET project_url=%s WHERE id;
END $configure$;
SELECT enabled, project_url,
 EXISTS (SELECT 1 FROM vault.secrets WHERE name='email_queue_service_role_key') AS vault_configured
FROM private.email_dispatch_config WHERE id;
""" % (literal(secret), literal(secret), literal(url))

with tempfile.NamedTemporaryFile(mode='w', suffix='.sql', dir=root / '.migration-private') as f:
    os.chmod(f.name, 0o600)
    f.write(sql)
    f.flush()
    result = subprocess.run(['supabase','db','query','--linked','--file',f.name], cwd=root,
                            capture_output=True, text=True)
    try:
        response = json.loads(result.stdout)
        row = response['rows'][0]
        assert not result.returncode and row['vault_configured']
    except Exception:
        # Do not print SQL/API errors, which could contain secret query text.
        raise SystemExit('Vault configuration failed; inspect locally without logging credentials') from None
    print(json.dumps(row))
