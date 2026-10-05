#!/usr/bin/env python3
"""Transactionally import and verify the private Spacetime public-table CSV export."""

from __future__ import annotations

import argparse
import csv
import json
import os
from pathlib import Path
import sys
from typing import Iterable
from urllib.parse import urlsplit

import psycopg
from psycopg import sql


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--source", required=True, type=Path, help="Directory containing public-table CSV files")
    parser.add_argument("--dry-run", action="store_true", help="Load and verify inside a transaction, then roll back")
    parser.add_argument("--verify-only", action="store_true", help="Compare the persisted target with the CSVs")
    args = parser.parse_args()
    if args.dry_run and args.verify_only:
        parser.error("use either --dry-run or --verify-only")
    return args


def load_env_file(path: Path) -> None:
    for raw_line in path.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        if key not in os.environ:
            value = value.strip()
            if len(value) >= 2 and value[0] == value[-1] and value[0] in "\"'":
                value = value[1:-1]
            os.environ[key] = value


def identifier_list(names: Iterable[str]) -> sql.Composed:
    return sql.SQL(", ").join(sql.Identifier(name) for name in names)


def table_ref(schema: str, table: str) -> sql.Composed:
    return sql.SQL("{}.{}").format(sql.Identifier(schema), sql.Identifier(table))


def csv_inventory(source: Path) -> dict[str, dict[str, object]]:
    if not source.is_dir():
        raise RuntimeError("--source must be a directory")
    inventory: dict[str, dict[str, object]] = {}
    for path in sorted(source.glob("*.csv")):
        with path.open("r", encoding="utf-8-sig", newline="") as handle:
            reader = csv.reader(handle)
            try:
                header = next(reader)
            except StopIteration as exc:
                raise RuntimeError(f"{path.name} is empty") from exc
            row_count = sum(1 for _ in reader)
        inventory[path.stem] = {"path": path, "header": header, "rows": row_count}
    if not inventory:
        raise RuntimeError("no CSV files found")
    return inventory


def database_columns(cursor: psycopg.Cursor) -> dict[str, list[str]]:
    cursor.execute(
        """
        select table_name, column_name
        from information_schema.columns
        where table_schema = 'public'
          and table_name in (
            select table_name
            from information_schema.tables
            where table_schema = 'public' and table_type = 'BASE TABLE'
          )
        order by table_name, ordinal_position
        """
    )
    result: dict[str, list[str]] = {}
    for table, column in cursor.fetchall():
        result.setdefault(table, []).append(column)
    return result


def primary_keys(cursor: psycopg.Cursor) -> dict[str, list[str]]:
    cursor.execute(
        """
        select cls.relname,
               array_agg(att.attname order by keys.ordinality)
        from pg_constraint con
        join pg_class cls on cls.oid = con.conrelid
        join pg_namespace ns on ns.oid = cls.relnamespace
        cross join lateral unnest(con.conkey) with ordinality as keys(attnum, ordinality)
        join pg_attribute att on att.attrelid = cls.oid and att.attnum = keys.attnum
        where ns.nspname = 'public' and con.contype = 'p'
        group by cls.relname
        order by cls.relname
        """
    )
    return {table: columns for table, columns in cursor.fetchall()}


def foreign_keys(cursor: psycopg.Cursor) -> list[dict[str, object]]:
    cursor.execute(
        """
        select con.conname,
               child_ns.nspname,
               child.relname,
               parent_ns.nspname,
               parent.relname,
               array_agg(child_att.attname order by child_keys.ordinality),
               array_agg(parent_att.attname order by child_keys.ordinality)
        from pg_constraint con
        join pg_class child on child.oid = con.conrelid
        join pg_namespace child_ns on child_ns.oid = child.relnamespace
        join pg_class parent on parent.oid = con.confrelid
        join pg_namespace parent_ns on parent_ns.oid = parent.relnamespace
        cross join lateral unnest(con.conkey) with ordinality as child_keys(attnum, ordinality)
        join lateral unnest(con.confkey) with ordinality as parent_keys(attnum, ordinality)
          on parent_keys.ordinality = child_keys.ordinality
        join pg_attribute child_att on child_att.attrelid = child.oid and child_att.attnum = child_keys.attnum
        join pg_attribute parent_att on parent_att.attrelid = parent.oid and parent_att.attnum = parent_keys.attnum
        where child_ns.nspname = 'public' and con.contype = 'f'
        group by con.conname, child_ns.nspname, child.relname, parent_ns.nspname, parent.relname
        order by child.relname, con.conname
        """
    )
    return [
        {
            "name": name,
            "child_schema": child_schema,
            "child_table": child_table,
            "parent_schema": parent_schema,
            "parent_table": parent_table,
            "child_columns": child_columns,
            "parent_columns": parent_columns,
        }
        for name, child_schema, child_table, parent_schema, parent_table, child_columns, parent_columns in cursor.fetchall()
    ]


def import_order(tables: set[str], fks: list[dict[str, object]]) -> list[str]:
    dependencies = {table: set() for table in tables}
    for fk in fks:
        child = str(fk["child_table"])
        parent = str(fk["parent_table"])
        if child in tables and parent in tables and child != parent:
            dependencies[child].add(parent)

    ordered: list[str] = []
    remaining = set(tables)
    while remaining:
        ready = sorted(table for table in remaining if not (dependencies[table] & remaining))
        if not ready:
            raise RuntimeError("public foreign-key graph contains a cycle")
        ordered.extend(ready)
        remaining.difference_update(ready)
    return ordered


def trigger_state(cursor: psycopg.Cursor) -> list[tuple[str, str, str]]:
    cursor.execute(
        """
        select cls.relname, trg.tgname, trg.tgenabled
        from pg_trigger trg
        join pg_class cls on cls.oid = trg.tgrelid
        join pg_namespace ns on ns.oid = cls.relnamespace
        where ns.nspname = 'public' and not trg.tgisinternal
        order by cls.relname, trg.tgname
        """
    )
    return cursor.fetchall()


def create_and_load_staging(
    cursor: psycopg.Cursor,
    inventory: dict[str, dict[str, object]],
    order: list[str],
) -> None:
    for table in order:
        staging = f"migration_source_{table}"
        cursor.execute(
            sql.SQL("create temp table {} (like {} including all) on commit drop").format(
                table_ref("pg_temp", staging), table_ref("public", table)
            )
        )
        columns = inventory[table]["header"]
        copy_sql = sql.SQL("copy {} ({}) from stdin with (format csv, header true)").format(
            table_ref("pg_temp", staging), identifier_list(columns)
        )
        with cursor.copy(copy_sql) as copy:
            with Path(inventory[table]["path"]).open("r", encoding="utf-8-sig", newline="") as handle:
                while chunk := handle.read(1024 * 1024):
                    copy.write(chunk)


def replace_target(
    cursor: psycopg.Cursor,
    inventory: dict[str, dict[str, object]],
    order: list[str],
) -> None:
    cursor.execute("set local session_replication_role = replica")
    cursor.execute(
        sql.SQL("truncate table {}")
        .format(sql.SQL(", ").join(table_ref("public", table) for table in sorted(inventory)))
    )
    for table in order:
        columns = inventory[table]["header"]
        cursor.execute(
            sql.SQL("insert into {} ({}) select {} from {}").format(
                table_ref("public", table),
                identifier_list(columns),
                identifier_list(columns),
                table_ref("pg_temp", f"migration_source_{table}"),
            )
        )
    cursor.execute("set local session_replication_role = origin")


def verify_rows(
    cursor: psycopg.Cursor,
    inventory: dict[str, dict[str, object]],
    order: list[str],
) -> dict[str, dict[str, int]]:
    results: dict[str, dict[str, int]] = {}
    for table in order:
        columns = inventory[table]["header"]
        cursor.execute(sql.SQL("select count(*) from {}").format(table_ref("public", table)))
        target_count = cursor.fetchone()[0]
        cursor.execute(sql.SQL("select count(*) from {}").format(table_ref("pg_temp", f"migration_source_{table}")))
        source_count = cursor.fetchone()[0]
        difference_query = sql.SQL(
            """
            select count(*) from (
              (select {columns} from {source} except all select {columns} from {target})
              union all
              (select {columns} from {target} except all select {columns} from {source})
            ) differences
            """
        ).format(
            columns=identifier_list(columns),
            source=table_ref("pg_temp", f"migration_source_{table}"),
            target=table_ref("public", table),
        )
        cursor.execute(difference_query)
        differences = cursor.fetchone()[0]
        if source_count != inventory[table]["rows"]:
            raise RuntimeError(f"staging row count mismatch for {table}")
        if target_count != source_count or differences != 0:
            raise RuntimeError(f"persisted data mismatch for {table}")
        results[table] = {"rows": target_count, "differences": differences}
    return results


def verify_foreign_keys(cursor: psycopg.Cursor, fks: list[dict[str, object]]) -> int:
    checked = 0
    for fk in fks:
        child_columns = list(fk["child_columns"])
        parent_columns = list(fk["parent_columns"])
        joins = sql.SQL(" and ").join(
            sql.SQL("child.{} = parent.{}").format(sql.Identifier(child), sql.Identifier(parent))
            for child, parent in zip(child_columns, parent_columns)
        )
        non_null = sql.SQL(" and ").join(
            sql.SQL("child.{} is not null").format(sql.Identifier(column)) for column in child_columns
        )
        missing_parent = sql.SQL("parent.{} is null").format(sql.Identifier(parent_columns[0]))
        cursor.execute(
            sql.SQL(
                "select count(*) from {} child left join {} parent on {} where {} and {}"
            ).format(
                table_ref(str(fk["child_schema"]), str(fk["child_table"])),
                table_ref(str(fk["parent_schema"]), str(fk["parent_table"])),
                joins,
                non_null,
                missing_parent,
            )
        )
        if cursor.fetchone()[0] != 0:
            raise RuntimeError(f"foreign-key orphan detected for {fk['name']}")
        checked += 1
    return checked


def verify_user_references(cursor: psycopg.Cursor, tables: set[str]) -> dict[str, int]:
    cursor.execute(
        """
        select table_name, column_name
        from information_schema.columns
        where table_schema = 'public'
          and table_name = any(%s)
          and udt_name = 'uuid'
          and column_name in ('user_id', 'created_by', 'deleted_by')
        order by table_name, column_name
        """,
        (sorted(tables),),
    )
    references = cursor.fetchall()
    historical_tables = {"audit_log", "deleted_records_recovery"}
    historical_orphan_rows = 0
    for table, column in references:
        cursor.execute(
            sql.SQL(
                "select count(*) from {} child left join auth.users parent on child.{} = parent.id "
                "where child.{} is not null and parent.id is null"
            ).format(table_ref("public", table), sql.Identifier(column), sql.Identifier(column))
        )
        orphan_rows = cursor.fetchone()[0]
        if table in historical_tables:
            historical_orphan_rows += orphan_rows
        elif orphan_rows != 0:
            raise RuntimeError(f"Auth user orphan detected for {table}.{column}")
    return {"checked": len(references), "historicalOrphanRows": historical_orphan_rows}


def main() -> None:
    args = parse_args()
    worktree = Path.cwd()
    load_env_file(worktree / ".env.local")
    project_ref = os.environ.get("SUPABASE_PROJECT_REF")
    password = os.environ.get("SUPABASE_DB_PASSWORD")
    if not project_ref or not password:
        raise RuntimeError("missing SUPABASE_PROJECT_REF or SUPABASE_DB_PASSWORD in .env.local")

    pooler_url = (worktree / "supabase/.temp/pooler-url").read_text(encoding="utf-8").strip()
    parsed_url = urlsplit(pooler_url)
    if not parsed_url.username or project_ref not in parsed_url.username:
        raise RuntimeError("linked pooler URL does not match SUPABASE_PROJECT_REF")

    inventory = csv_inventory(args.source.resolve())
    connection = psycopg.connect(pooler_url, password=password, connect_timeout=15)
    try:
        with connection.cursor() as cursor:
            cursor.execute("select pg_advisory_xact_lock(hashtext('spacetime-public-data-import'))")
            cursor.execute("set local lock_timeout = '15s'")
            cursor.execute("set local statement_timeout = 0")

            columns = database_columns(cursor)
            if set(columns) != set(inventory):
                missing = sorted(set(columns) - set(inventory))
                extra = sorted(set(inventory) - set(columns))
                raise RuntimeError(f"CSV/public table mismatch; missing={missing}, extra={extra}")
            for table, details in inventory.items():
                if details["header"] != columns[table]:
                    raise RuntimeError(f"CSV header does not exactly match the applied schema for {table}")

            keys = primary_keys(cursor)
            if set(keys) != set(inventory):
                raise RuntimeError("every imported table must have a primary key")
            fks = foreign_keys(cursor)
            order = import_order(set(inventory), fks)
            triggers_before = trigger_state(cursor)

            create_and_load_staging(cursor, inventory, order)
            if not args.verify_only:
                replace_target(cursor, inventory, order)

            results = verify_rows(cursor, inventory, order)
            fk_checks = verify_foreign_keys(cursor, fks)
            user_reference_checks = verify_user_references(cursor, set(inventory))
            if trigger_state(cursor) != triggers_before:
                raise RuntimeError("trigger catalog state changed during import")
            cursor.execute("show session_replication_role")
            if cursor.fetchone()[0] != "origin":
                raise RuntimeError("session_replication_role was not restored")

            summary = {
                "mode": "verify-only" if args.verify_only else ("dry-run" if args.dry_run else "import"),
                "tables": len(results),
                "rows": sum(value["rows"] for value in results.values()),
                "foreignKeysChecked": fk_checks,
                "authUserReferencesChecked": user_reference_checks["checked"],
                "historicalAuthOrphanRows": user_reference_checks["historicalOrphanRows"],
                "rowDifferences": sum(value["differences"] for value in results.values()),
                "importOrder": order,
                "tableCounts": {table: results[table]["rows"] for table in sorted(results)},
            }

            if args.dry_run or args.verify_only:
                connection.rollback()
            else:
                connection.commit()
            print(json.dumps(summary, indent=2))
    finally:
        connection.close()


if __name__ == "__main__":
    try:
        main()
    except Exception as error:
        print(f"Public data import failed: {error}", file=sys.stderr)
        raise SystemExit(1)
