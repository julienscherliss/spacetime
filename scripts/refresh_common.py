"""Read-only snapshots and temporary-only typed migration planning helpers.

No function in this module changes persistent database rows or calls mutation APIs.
Private files contain personal data: stdout must contain aggregate summaries only.
"""
from __future__ import annotations

import csv
from datetime import datetime, timezone
from decimal import Decimal
import hashlib
import json
import os
from pathlib import Path, PurePosixPath
import re
import ssl
from urllib.parse import quote, urlsplit
from urllib.request import Request, HTTPRedirectHandler, HTTPSHandler, build_opener

import psycopg
from psycopg import sql

OWNED = "zzoeywmurqiqticikyaf"
SOURCE = "rhguyvbysqmcwzeuqipr"
VERSION = 1
TABLES = tuple(sorted("""audit_log clients deleted_records_recovery email_send_log email_send_state
email_unsubscribe_tokens feedback google_calendars google_connections invoice_items invoice_style_settings
invoices library_categories library_items live_activity_device_plans live_activity_devices profiles promo_codes
promo_redemptions subscriptions suppressed_emails tag_billing_settings tag_notes tasks user_color_schemes
user_roles""".split()))
PRIVATE_TABLES = tuple(sorted("""apple_revoked_transactions billing_events billing_provider_state
billing_revisions email_dispatch_config pending_stripe_checkouts stripe_checkout_attempts""".split()))
BUCKETS = ("feedback-screenshots", "task-attachments")
REVIEW = {"subscriptions", "user_roles", "promo_codes", "promo_redemptions", "google_connections", "google_calendars"}
HISTORY = {"audit_log", "deleted_records_recovery", "email_send_log"}
RUNTIME = {"live_activity_devices", "live_activity_device_plans", "email_send_state"}
CONSENT = {"suppressed_emails", "email_unsubscribe_tokens"}


class RefreshError(Exception):
    """Message is safe for a public log; never include data or database exceptions."""


def now():
    return datetime.now(timezone.utc).isoformat()


def canonical(value):
    """JSON with exact numbers; jsonb-equivalent 1/1.0/1.00 hash identically."""
    if value is None:
        return "null"
    if isinstance(value, bool):
        return "true" if value else "false"
    if isinstance(value, str):
        return json.dumps(value, ensure_ascii=False)
    if isinstance(value, (int, Decimal)):
        number = Decimal(value)
        if not number.is_finite() or abs(number.adjusted()) > 10000:
            raise RefreshError("Unsupported numeric value")
        text = format(number, "f")
        if "." in text:
            text = text.rstrip("0").rstrip(".")
        return "0" if number == 0 else text
    if isinstance(value, list):
        return "[" + ",".join(canonical(item) for item in value) + "]"
    if isinstance(value, dict) and all(isinstance(k, str) for k in value):
        return "{" + ",".join(canonical(k) + ":" + canonical(value[k]) for k in sorted(value)) + "}"
    raise RefreshError("Unsupported JSON value")


def _pairs(pairs):
    result = {}
    for key, value in pairs:
        if key in result:
            raise RefreshError("Duplicate JSON property")
        result[key] = value
    return result


def loads(text):
    try:
        return json.loads(text, parse_float=Decimal, object_pairs_hook=_pairs,
                          parse_constant=lambda _: (_ for _ in ()).throw(RefreshError("Invalid JSON number")))
    except (ValueError, TypeError):
        raise RefreshError("Invalid JSON document") from None


def digest(value):
    return hashlib.sha256(canonical(value).encode()).hexdigest()


def safe_path(path: Path, *, existing=False):
    path = path.absolute()
    for parent in (path, *path.parents):
        if parent.is_symlink():
            raise RefreshError("Symlink paths are not permitted")
    if existing and not path.is_file():
        raise RefreshError("Input file is missing")
    return path


def private_dir(path):
    path = safe_path(Path(path))
    root = (Path.cwd() / ".migration-private" / "final-refresh").absolute()
    if not path.is_relative_to(root) or path == root:
        raise RefreshError("Output must be a run below .migration-private/final-refresh")
    root.mkdir(parents=True, exist_ok=True, mode=0o700)
    os.chmod(root, 0o700)
    path.mkdir(parents=True, exist_ok=True, mode=0o700)
    os.chmod(path, 0o700)
    # A synced journal file is insufficient if its newly created run folder
    # disappears after a crash. Persist each directory entry up to the app.
    directory = path
    while True:
        fd = os.open(directory, os.O_RDONLY)
        try: os.fsync(fd)
        finally: os.close(fd)
        if directory == Path.cwd().absolute():
            break
        directory = directory.parent
    return path


def write_private(path, value, *, raw=False):
    path = safe_path(Path(path))
    # Exclusive creation prevents silent replacement of snapshots/receipts.
    fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    with os.fdopen(fd, "w", encoding="utf-8") as handle:
        handle.write(value if raw else canonical(value) + "\n")


def read_json(path):
    return loads(safe_path(Path(path), existing=True).read_text())


def env_file():
    values = {}
    for line in safe_path(Path(".env.local"), existing=True).read_text().splitlines():
        match = re.match(r"^([A-Za-z_][A-Za-z0-9_]*)=(.*)$", line.strip())
        if not match:
            continue
        value = match[2].strip()
        if len(value) >= 2 and value[0] == value[-1] and value[0] in "\"'":
            value = value[1:-1]
        values[match[1]] = value
    if values.get("SUPABASE_PROJECT_REF") != OWNED or values.get("SUPABASE_URL") != f"https://{OWNED}.supabase.co":
        raise RefreshError("Owned-project credentials do not match the approved project")
    return values


def connect(*, readonly=True):
    values = env_file()
    url = safe_path(Path("supabase/.temp/pooler-url"), existing=True).read_text().strip()
    if urlsplit(url).username != f"postgres.{OWNED}":
        raise RefreshError("Pooler does not match the owned project")
    connection = psycopg.connect(url, password=values["SUPABASE_DB_PASSWORD"], connect_timeout=15)
    connection.execute("set transaction isolation level repeatable read" + (" read only" if readonly else ""))
    connection.execute("set local statement_timeout = '60s'")
    connection.execute("set local lock_timeout = '5s'")
    connection.execute("set local timezone = 'UTC'")
    connection.execute("set local datestyle = 'ISO, YMD'")
    return connection


CATALOG_QUERIES = {
    "columns": """select n.nspname as schema, c.relname as table_name, a.attname as column_name,
      a.attnum as position, pg_catalog.format_type(a.atttypid,a.atttypmod) as sql_type,
      a.attnotnull as not_null, a.attgenerated as generated, a.attidentity as identity,
      pg_get_expr(d.adbin,d.adrelid) as default_value
      from pg_attribute a join pg_class c on c.oid=a.attrelid
      join pg_namespace n on n.oid=c.relnamespace
      left join pg_attrdef d on d.adrelid=c.oid and d.adnum=a.attnum
      where n.nspname in ('public','private') and c.relkind='r' and a.attnum>0 and not a.attisdropped
      order by n.nspname,c.relname,a.attnum""",
    "keys": """select n.nspname as schema,c.relname as table_name,con.conname as name,
      con.contype as kind, array(select a.attname from unnest(con.conkey) with ordinality k(num,ord)
      join pg_attribute a on a.attrelid=c.oid and a.attnum=k.num order by k.ord) as columns,
      pn.nspname as parent_schema,pc.relname as parent_table,
      array(select a.attname from unnest(con.confkey) with ordinality k(num,ord)
      join pg_attribute a on a.attrelid=pc.oid and a.attnum=k.num order by k.ord) as parent_columns,
      con.confdeltype as delete_action, pg_get_constraintdef(con.oid) as definition
      from pg_constraint con join pg_class c on c.oid=con.conrelid
      join pg_namespace n on n.oid=c.relnamespace
      left join pg_class pc on pc.oid=con.confrelid left join pg_namespace pn on pn.oid=pc.relnamespace
      where n.nspname in ('public','private') order by n.nspname,c.relname,con.conname""",
    "indexes": """select n.nspname as schema,t.relname as table_name,c.relname as name,
      i.indisunique as is_unique,i.indisprimary as is_primary,
      pg_get_indexdef(i.indexrelid) as definition,pg_get_expr(i.indpred,i.indrelid) as predicate,
      array(select a.attname from unnest(i.indkey::smallint[]) with ordinality k(num,ord)
      join pg_attribute a on a.attrelid=t.oid and a.attnum=k.num
      where k.ord<=i.indnkeyatts order by k.ord) as columns,
      i.indexprs is not null as expression
      from pg_index i join pg_class t on t.oid=i.indrelid join pg_class c on c.oid=i.indexrelid
      join pg_namespace n on n.oid=t.relnamespace where n.nspname in ('public','private')
      order by n.nspname,t.relname,c.relname""",
    "triggers": """select n.nspname as schema,c.relname as table_name,t.tgname as name,
      t.tgenabled as enabled,pg_get_triggerdef(t.oid) as definition,md5(pg_get_functiondef(p.oid)) as function_md5
      from pg_trigger t join pg_class c on c.oid=t.tgrelid join pg_namespace n on n.oid=c.relnamespace
      join pg_proc p on p.oid=t.tgfoid where n.nspname in ('public','private') and not t.tgisinternal
      order by n.nspname,c.relname,t.tgname""",
    "policies": "select * from pg_policies where schemaname in ('public','private','storage') order by schemaname,tablename,policyname",
    "routines": """select n.nspname as schema,p.proname as name,pg_get_function_identity_arguments(p.oid) as arguments,
      p.prosecdef as security_definer,p.proacl::text as grants,md5(pg_get_functiondef(p.oid)) as definition_md5
      from pg_proc p join pg_namespace n on n.oid=p.pronamespace
      where n.nspname in ('public','private') and p.prokind='f' order by n.nspname,p.proname,arguments""",
    "tables": """select n.nspname as schema,c.relname as table_name,c.relrowsecurity as rls,
      c.relforcerowsecurity as force_rls,c.relacl::text as grants
      from pg_class c join pg_namespace n on n.oid=c.relnamespace
      where n.nspname in ('public','private') and c.relkind='r' order by 1,2""",
}
AUTH_QUERY = """select id,email,email_confirmed_at,created_at,updated_at,is_anonymous,
 raw_app_meta_data as app_metadata,
 jsonb_build_object('full_name',raw_user_meta_data->'full_name','name',raw_user_meta_data->'name',
 'avatar_url',raw_user_meta_data->'avatar_url') as user_metadata
 from auth.users order by id"""
# Metadata only; excludes password hashes, refresh tokens and provider access tokens.
IDENTITIES_QUERY = "select id::text,user_id,provider,provider_id,created_at,updated_at from auth.identities order by id"
STORAGE_QUERY = """select id,bucket_id,name,metadata,owner_id,created_at,updated_at
 from storage.objects where bucket_id in ('feedback-screenshots','task-attachments') order by bucket_id,name"""


def rows_json(connection, query):
    text = connection.execute("select coalesce(jsonb_agg(to_jsonb(q)), '[]'::jsonb)::text from (" + query + ") q").fetchone()[0]
    return loads(text)


def catalog(connection):
    return {name: rows_json(connection, query) for name, query in CATALOG_QUERIES.items()}


def keys_for(cat, schema, table):
    keys = [row["columns"] for row in cat["keys"] if row["schema"] == schema and row["table_name"] == table and row["kind"] == "p"]
    if len(keys) != 1 or not keys[0]:
        raise RefreshError("A migration table lacks an unambiguous primary key")
    return keys[0]


def table_rows(connection, schema, table, pk):
    query = sql.SQL("select to_jsonb(t)::text from {}.{} t order by {}").format(
        sql.Identifier(schema), sql.Identifier(table), sql.SQL(",").join(map(sql.Identifier, pk)))
    return [loads(row[0]) for row in connection.execute(query)]


def object_key(row):
    bucket, name = row["bucket_id"], row["name"]
    parts = PurePosixPath(name).parts
    if bucket not in BUCKETS or not parts or name.startswith("/") or any(part in (".", "..") for part in name.split("/")) or "\\" in name:
        raise RefreshError("Unsafe storage object path")
    return bucket + "/" + name


def download_owned_storage(metadata, output, values):
    class NoRedirect(HTTPRedirectHandler):
        def redirect_request(self, req, fp, code, msg, headers, newurl):
            raise RefreshError("Storage redirects are not permitted")
    # Python.org's macOS build may lack its optional certifi bootstrap. Use the
    # system's trusted CA bundle while retaining certificate/hostname checks.
    ca_path = "/etc/ssl/cert.pem" if ssl.get_default_verify_paths().cafile is None and Path("/etc/ssl/cert.pem").is_file() else None
    opener = build_opener(NoRedirect(), HTTPSHandler(context=ssl.create_default_context(cafile=ca_path)))
    result = []
    for row in metadata:
        key = object_key(row)
        url = f"https://{OWNED}.supabase.co/storage/v1/object/authenticated/" + quote(key, safe="/")
        request = Request(url, headers={"apikey": values["SUPABASE_SERVICE_ROLE_KEY"],
                                       "Authorization": "Bearer " + values["SUPABASE_SERVICE_ROLE_KEY"]})
        try:
            with opener.open(request, timeout=45) as response:
                if urlsplit(response.url).hostname != f"{OWNED}.supabase.co":
                    raise RefreshError("Unexpected storage download destination")
                data = response.read(100 * 1024 * 1024 + 1)
                mime = response.headers.get("Content-Type")
        except Exception:
            raise RefreshError("Owned storage download failed; snapshot is incomplete") from None
        if len(data) > 100 * 1024 * 1024 or len(data) != int(row["metadata"]["size"]):
            raise RefreshError("Storage content size differs from its database inventory")
        content_hash = hashlib.sha256(data).hexdigest()
        # Content-addressed private files avoid interpreting object paths as local paths.
        path = output / "objects" / content_hash
        path.parent.mkdir(mode=0o700, exist_ok=True)
        if not path.exists():
            fd = os.open(safe_path(path), os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
            with os.fdopen(fd, "wb") as handle:
                handle.write(data)
        result.append({"key": key, "sha256": content_hash, "size": len(data), "content_type": mime,
                       "metadata": row["metadata"], "object_id": row["id"]})
    return result


def index_rows(rows, columns):
    result = {}
    for row in rows:
        if not isinstance(row, dict) or any(row.get(column) is None for column in columns):
            raise RefreshError("A row has an invalid primary key")
        key = canonical([row[column] for column in columns])
        if key in result:
            raise RefreshError("Duplicate primary key")
        result[key] = row
    return result


def compare_row(base, old, new):
    if canonical(old) == canonical(new):
        return "shared", new
    if canonical(old) == canonical(base):
        return "keep_owned", new
    if canonical(new) == canonical(base):
        return "apply_source", old
    return "conflict", new


def plan_table(table, base_rows, old_rows, new_rows, columns, pk):
    base = index_rows(base_rows, pk)
    old = index_rows(old_rows, pk)
    new = index_rows(new_rows, pk)
    expected = dict(new)
    operations, conflicts, totals = [], [], {}
    project = lambda row: None if row is None else {column: row[column] for column in columns}
    for key in sorted(set(base) | set(old) | set(new)):
        b, o, n = base.get(key), old.get(key), new.get(key)
        outcome, proposed = compare_row(project(b), project(o), project(n))
        if table in RUNTIME:
            outcome, proposed = "keep_runtime", n
        elif table in HISTORY:
            if n is None and o is not None:
                outcome, proposed = "import_history", o
            elif n is not None and o is not None and canonical(project(o)) != canonical(project(n)):
                outcome, proposed = "history_collision", n
            else:
                outcome, proposed = "keep_history", n
        elif table in REVIEW and canonical(project(o)) != canonical(project(b)) and canonical(project(o)) != canonical(project(n)):
            outcome, proposed = "review_special", n
        elif table in CONSENT and canonical(o) != canonical(b) and canonical(o) != canonical(n) and (o is None or b is not None):
            outcome, proposed = "review_consent", n
        if outcome in {"conflict", "history_collision", "review_special", "review_consent"}:
            changed = [col for col in columns if len({canonical(row.get(col)) if row is not None else "<absent>" for row in (b,o,n)}) > 1]
            conflicts.append({"table": table, "key": loads(key), "reason": outcome, "changed_columns": changed,
                              "base_hash": digest(b), "source_hash": digest(o), "owned_hash": digest(n),
                              "base": b, "source": o, "owned": n})
        elif outcome in {"apply_source", "import_history"}:
            # Updates touch only original columns, preserving target-only values.
            final = None if proposed is None else {**(n or {}), **proposed}
            if final is None:
                expected.pop(key, None)
            else:
                expected[key] = final
            if canonical(final) != canonical(n):
                operations.append({"table": table, "key": loads(key), "action": "delete" if final is None else "insert" if n is None else "update",
                                   "before_hash": digest(n), "after": final})
        totals[outcome] = totals.get(outcome, 0) + 1
    return {"expected": list(expected.values()), "operations": operations, "conflicts": conflicts, "outcomes": totals}


def stage_csv(connection, path, table, columns):
    stage = "rf_b_" + table
    connection.execute(sql.SQL("create temp table {} (like public.{}) on commit drop").format(sql.Identifier(stage), sql.Identifier(table)))
    statement = sql.SQL("copy {} ({}) from stdin with (format csv, header true)").format(
        sql.Identifier(stage), sql.SQL(",").join(map(sql.Identifier, columns)))
    with connection.cursor().copy(statement) as copy:
        with safe_path(path, existing=True).open(encoding="utf-8-sig", newline="") as handle:
            while chunk := handle.read(1024 * 1024):
                copy.write(chunk)
    return stage


def stage_json(connection, table, label, rows):
    stage = "rf_" + label + "_" + table
    connection.execute(sql.SQL("create temp table {} (like public.{}) on commit drop").format(sql.Identifier(stage), sql.Identifier(table)))
    statement = sql.SQL("insert into {} select * from jsonb_populate_recordset(null::{}, %s::jsonb)").format(sql.Identifier(stage), sql.Identifier(stage))
    connection.execute(statement, (canonical(rows),))
    return stage


def normalized_rows(connection, stage, columns, pk):
    statement = sql.SQL("select to_jsonb(q)::text from (select {} from pg_temp.{} order by {}) q").format(
        sql.SQL(",").join(map(sql.Identifier, columns)), sql.Identifier(stage), sql.SQL(",").join(map(sql.Identifier, pk)))
    return [loads(row[0]) for row in connection.execute(statement)]


def verify_packet(packet, project):
    if packet.get("format") != VERSION or packet.get("project") != project:
        raise RefreshError("Snapshot format or project mismatch")
    if set(packet.get("public", {})) != set(TABLES):
        raise RefreshError("Snapshot public-table inventory is incomplete")
    for name, rows in packet["public"].items():
        if not isinstance(rows, list) or packet["manifest"]["public"][name] != {"rows": len(rows), "sha256": digest(rows)}:
            raise RefreshError("Snapshot table checksum/count mismatch")
    for section in ("catalog", "auth", "identities", "storage_metadata"):
        if packet["manifest"].get(section) != digest(packet[section]):
            raise RefreshError("Snapshot section checksum mismatch")
    if packet.get("private") is not None and packet["manifest"].get("private") != digest(packet["private"]):
        raise RefreshError("Private snapshot checksum mismatch")


def manifest(packet):
    result = {"public": {name: {"rows": len(rows), "sha256": digest(rows)} for name, rows in packet["public"].items()}}
    for name in ("catalog", "auth", "identities", "storage_metadata", "private"):
        if name in packet:
            result[name] = digest(packet[name])
    return result


def cli_main(callback):
    try:
        callback()
    except RefreshError as error:
        print("Refresh stopped: " + str(error), file=__import__("sys").stderr)
        raise SystemExit(1)
    except Exception:
        print("Refresh stopped: operation failed; private inputs were not printed", file=__import__("sys").stderr)
        raise SystemExit(1)
