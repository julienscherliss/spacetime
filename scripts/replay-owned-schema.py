#!/usr/bin/env python3
"""Replay immutable Lovable history on the empty owned project using Supabase CLI.

Three documented compatibility projections are applied only to temporary copies.
The source history and version IDs remain unchanged; db push stores the SQL that
actually ran. See docs/OWNED_SCHEMA_REPLAY.md. No migration repair is used.
"""
import hashlib
import json
import os
from pathlib import Path
import re
import shutil
import subprocess
import tempfile

ROOT = Path(__file__).resolve().parents[1]
PROJECT = "zzoeywmurqiqticikyaf"
FOUNDATION = "20260924144209_owned_schema_foundation.sql"


def cli(*args, cwd=ROOT):
    result = subprocess.run(["supabase", *args], cwd=cwd, env=os.environ,
                            text=True, capture_output=True)
    if result.returncode or '"_tag":"Error"' in result.stdout:
        raise RuntimeError(result.stderr + result.stdout)
    return result.stdout


def main():
    # Parse the literal dotenv values without evaluating shell syntax.
    for line in (ROOT / ".env.local").read_text().splitlines():
        if line and not line.startswith("#") and "=" in line:
            key, value = line.split("=", 1)
            os.environ[key] = value.strip().strip('"').strip("'")
    if os.environ.get("SUPABASE_PROJECT_REF") != PROJECT:
        raise RuntimeError("Unexpected project in credentials file")
    if (ROOT / "supabase/.temp/project-ref").read_text().strip() != PROJECT:
        raise RuntimeError("Unexpected linked project")
    preflight = json.loads(cli("db", "query", "--linked", """
      select (select count(*) from auth.users) as users,
        (select relrowsecurity from pg_class where oid='realtime.messages'::regclass) as realtime_rls;
    """))["rows"][0]
    if preflight["users"] != 0 or preflight["realtime_rls"] is not True:
        raise RuntimeError("Replay requires an empty auth project and existing Realtime RLS")

    # Historical audit policies depend on this out-of-band Lovable table.
    cli("db", "query", "--linked", "--file", str(ROOT / "supabase/migrations" / FOUNDATION))
    stage_parent = ROOT / ".migration-private"
    stage_parent.mkdir(exist_ok=True, mode=0o700)
    stage = Path(tempfile.mkdtemp(prefix="schema-replay-", dir=stage_parent))
    (stage / "supabase/migrations").mkdir(parents=True)
    shutil.copy2(ROOT / "supabase/config.toml", stage / "supabase/config.toml")
    shutil.copytree(ROOT / "supabase/.temp", stage / "supabase/.temp")
    manifest = []
    for source in sorted((ROOT / "supabase/migrations").glob("*.sql")):
        original = source.read_text()
        replay = original
        adjustment = None
        if source.name.startswith("20260528143250_"):
            needle = "ALTER TABLE realtime.messages ENABLE ROW LEVEL SECURITY;"
            if replay.count(needle) != 1:
                raise RuntimeError("Realtime compatibility precondition changed")
            replay = replay.replace(needle, """DO $$ BEGIN
  IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid='realtime.messages'::regclass) THEN
    RAISE EXCEPTION 'Realtime messages must already have RLS enabled';
  END IF;
END $$;""")
            adjustment = "Assert existing RLS instead of forbidden redundant ALTER TABLE"
        elif source.name.startswith("20260706161818_"):
            pattern = r'CREATE POLICY ("[^"]+")\s+ON (public\.live_activity_\w+)'
            policies = re.findall(pattern, replay)
            if len(policies) != 8:
                raise RuntimeError("Expected exactly eight duplicated Live Activity policies")
            replay = "\n".join(f"DROP POLICY IF EXISTS {p} ON {t};" for p, t in policies) + "\n" + replay
            adjustment = "Atomically replace eight policies repeated from 20260706010000"
        elif source.name.startswith("20260916162412_"):
            needle = "CREATE UNIQUE INDEX google_connections_user_id_upsert_key"
            if replay.count(needle) != 1:
                raise RuntimeError("Google index compatibility precondition changed")
            replay = replay.replace(needle, "CREATE UNIQUE INDEX IF NOT EXISTS google_connections_user_id_upsert_key")
            adjustment = "Tolerate identical unique index created by 20260916000000"
        (stage / "supabase/migrations" / source.name).write_text(replay)
        manifest.append({"file": source.name, "source_sha256": hashlib.sha256(original.encode()).hexdigest(),
                         "replay_sha256": hashlib.sha256(replay.encode()).hexdigest(), "adjustment": adjustment})
    (stage / "manifest.json").write_text(json.dumps(manifest, indent=2) + "\n")
    print(f"Replay directory: {stage}", flush=True)
    print(cli("db", "push", "--linked", "--yes", "--skip-vault", cwd=stage), flush=True)
    for item in manifest:
        actual = hashlib.sha256((ROOT / "supabase/migrations" / item["file"]).read_bytes()).hexdigest()
        if actual != item["source_sha256"]:
            raise RuntimeError("A source migration changed during replay")
    print(f"Verified {len(manifest)} source files unchanged; manifest: {stage / 'manifest.json'}")


if __name__ == "__main__":
    main()
