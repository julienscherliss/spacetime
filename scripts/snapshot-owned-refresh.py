#!/usr/bin/env python3
"""Snapshot owned data consistently, then verify downloaded storage against a second inventory."""
import argparse
from pathlib import Path
from refresh_common import *


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    output = private_dir(args.output)
    packet = {"format": VERSION, "project": OWNED, "started_at": now(), "database_consistency": "repeatable-read",
              "freeze_verified": False, "purpose": "rehearsal"}
    with connect() as connection:
        cat = catalog(connection)
        if {r["table_name"] for r in cat["tables"] if r["schema"] == "public"} != set(TABLES):
            raise RefreshError("Owned public schema changed")
        if {r["table_name"] for r in cat["tables"] if r["schema"] == "private"} != set(PRIVATE_TABLES):
            raise RefreshError("Owned private schema changed")
        packet["catalog"] = cat
        packet["public"] = {name: table_rows(connection, "public", name, keys_for(cat,"public",name)) for name in TABLES}
        packet["private"] = {name: table_rows(connection, "private", name, keys_for(cat,"private",name)) for name in PRIVATE_TABLES}
        packet["auth"] = rows_json(connection, AUTH_QUERY)
        packet["identities"] = rows_json(connection, IDENTITIES_QUERY)
        packet["storage_metadata"] = rows_json(connection, STORAGE_QUERY)
        packet["migrations"] = rows_json(connection, "select version from supabase_migrations.schema_migrations order by version")
        # Cron commands can contain secrets; retain names/schedules/active only.
        packet["cron"] = rows_json(connection, "select jobname,schedule,active from cron.job order by jobname")
        packet["database_finished_at"] = now()
        connection.rollback()
    packet["storage_content"] = download_owned_storage(packet["storage_metadata"], output, env_file())
    with connect() as connection:
        after = rows_json(connection, STORAGE_QUERY)
        connection.rollback()
    if digest(after) != digest(packet["storage_metadata"]):
        raise RefreshError("Storage inventory changed during download; rerun snapshot")
    packet["storage_consistency"] = "metadata-checked-before-and-after; content-hashed; no write freeze"
    packet["finished_at"] = now()
    packet["manifest"] = manifest(packet)
    packet["manifest"]["storage_content"] = digest(packet["storage_content"])
    write_private(output / "owned.json", packet)
    print(canonical({"mode":"read-only snapshot","public_tables":len(TABLES),"public_rows":sum(len(r) for r in packet["public"].values()),
                     "auth_users":len(packet["auth"]),"storage_objects":len(packet["storage_content"]),"mutations":0}))


if __name__ == "__main__":
    cli_main(main)
