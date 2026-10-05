#!/usr/bin/env python3
"""Produce a private, non-executable B/O/N reconciliation plan. Persistent writes are unsupported."""
import argparse
import csv
from pathlib import Path
from refresh_common import *


def auth_plan(base, source, owned):
    b, o, n = (index_rows(rows,["id"]) for rows in (base,source,owned))
    conflicts, additions = [], []
    emails = {}
    for row in owned:
        email = (row.get("email") or "").strip().lower()
        if email:
            if email in emails:
                raise RefreshError("Owned Auth contains a duplicate normalized email")
            emails[email] = row["id"]
    for key in sorted(set(b)|set(o)|set(n)):
        old, new, original = o.get(key), n.get(key), b.get(key)
        reason = None
        if old and new:
            if (old.get("email") or "").lower() != (new.get("email") or "").lower():
                reason = "auth_email_changed"
            if old.get("is_anonymous") or not old.get("email_confirmed_at"):
                reason = "source_auth_not_confirmed"
        elif old and not new:
            reason = "auth_creation_review" if original is None else "owned_user_deleted"
            email = (old.get("email") or "").strip().lower()
            if email in emails and emails[email] != old["id"]:
                reason = "auth_email_uuid_collision"
            additions.append(old["id"])
        elif original and not old and new:
            reason = "source_account_deleted_review"
        if reason:
            conflicts.append({"table":"auth.users","key":[loads(key)[0]],"reason":reason,
                              "base_hash":digest(original),"source_hash":digest(old),"owned_hash":digest(new)})
    return {"conflicts":conflicts,"source_additions":additions,"retained_owned_users":len(owned),
            "existing_identity_policy":"preserve owned identities, passwords and sessions"}


def validate_expected(connection, expected, cat, auth_users):
    """Validate against typed temp relations, including unique keys and FK closure.

    Public rows, RPCs and external services are never written/called. Only known
    simple partial-index predicates are evaluated; unknown expressions block.
    """
    problems, stages = [], {}
    for table in TABLES:
        stage = stage_json(connection,table,"e",expected[table])
        stages[table] = stage
        expected[table] = normalized_rows(connection,stage,[r["column_name"] for r in cat["columns"] if r["schema"]=="public" and r["table_name"]==table],keys_for(cat,"public",table))
    known_predicates = {"(apple_original_transaction_id IS NOT NULL)","(status = 'sent'::text)"}
    for idx in cat["indexes"]:
        if idx["schema"] != "public" or not idx["is_unique"]:
            continue
        if idx["expression"] or "NULLS NOT DISTINCT" in idx["definition"] or idx["predicate"] and idx["predicate"] not in known_predicates:
            problems.append({"table":idx["table_name"],"reason":"unsupported_unique_index","constraint":idx["name"]})
            continue
        cols = idx["columns"]
        nonnull = sql.SQL(" and ").join(sql.SQL("{} is not null").format(sql.Identifier(col)) for col in cols)
        predicate = sql.SQL(idx["predicate"] or "true")
        statement = sql.SQL("select {} from pg_temp.{} where {} and {} group by {} having count(*)>1").format(
            sql.SQL(",").join(map(sql.Identifier,cols)),sql.Identifier(stages[idx["table_name"]]),nonnull,predicate,
            sql.SQL(",").join(map(sql.Identifier,cols)))
        collisions = connection.execute(statement).fetchall()
        if collisions:
            problems.append({"table":idx["table_name"],"reason":"unique_key_collision","constraint":idx["name"],
                             "groups":len(collisions)})
    # Only explicit, known scalar checks are evaluated; arbitrary catalog SQL
    # is never executed. Changed/new expressions block until reviewed.
    checks = {
        "email_send_log_status_check": ("status", {"pending","sent","suppressed","failed","bounced","complained","dlq"}),
        "email_send_state_id_check": ("id", {1}),
        "feedback_priority_check": ("priority", {"low","medium","high"}),
        "feedback_status_check": ("status", {"unreviewed","in_process","resolved","closed","duplicate","need_more_info"}),
        "feedback_type_check": ("type", {"bug","feature","confusion","general"}),
        "invoice_items_rate_type_check": ("rate_type", {"hourly","flat"}),
        "invoices_status_check": ("status", {"invoiced","paid"}),
        "subscriptions_payment_source_check": ("payment_source", {"stripe","apple_iap","promo","admin"}),
        "suppressed_emails_reason_check": ("reason", {"unsubscribe","bounce","complaint"}),
        "tag_billing_settings_rate_type_check": ("rate_type", {"hourly","flat"}),
    }
    for key in cat["keys"]:
        if key["schema"] != "public" or key["kind"] != "c":
            continue
        rule = checks.get(key["name"])
        if rule is None:
            problems.append({"table":key["table_name"],"reason":"unsupported_check_constraint","constraint":key["name"]})
            continue
        field, allowed = rule
        literals = sorted(allowed)
        if isinstance(literals[0], int):
            known = "CHECK ((id = 1))"
        else:
            # Array order is immaterial, but the full definition must match a
            # known grammar and exactly this set of allowed literals.
            definition = key["definition"]
            import re
            values = re.findall(r"'([^']*)'::text",definition)
            expression = field + " = ANY (ARRAY[" + ", ".join("'"+v+"'::text" for v in values) + "])"
            known = "CHECK ((" + expression + "))"
            if field == "payment_source":
                known = "CHECK (((payment_source IS NULL) OR (" + expression + ")))"
            if set(values) != allowed or len(values) != len(allowed):
                known = None
        if key["definition"] != known:
            problems.append({"table":key["table_name"],"reason":"unsupported_check_constraint","constraint":key["name"]})
            continue
        invalid = sum(row.get(field) is not None and row[field] not in allowed for row in expected[key["table_name"]])
        if invalid:
            problems.append({"table":key["table_name"],"reason":"check_constraint_violation","constraint":key["name"],"rows":invalid})
    for key in cat["keys"]:
        if key["schema"] != "public" or key["kind"] != "f":
            continue
        child, parent = key["table_name"],key["parent_table"]
        rows = expected[child]
        parent_rows = auth_users if key["parent_schema"]=="auth" and parent=="users" else expected.get(parent)
        if parent_rows is None:
            problems.append({"table":child,"reason":"unknown_fk_parent","constraint":key["name"]})
            continue
        parents = {canonical([row[column] for column in key["parent_columns"]]) for row in parent_rows}
        orphan_count = sum(1 for row in rows if all(row.get(col) is not None for col in key["columns"])
                           and canonical([row[col] for col in key["columns"]]) not in parents)
        if orphan_count:
            problems.append({"table":child,"reason":"foreign_key_orphan","constraint":key["name"],"rows":orphan_count})
    # Live user_id fields often have no declared FK. Keep only documented history exceptions.
    users = {row["id"] for row in auth_users}
    for table, rows in expected.items():
        if table in {"audit_log","deleted_records_recovery"}:
            continue
        missing = sum(1 for row in rows if row.get("user_id") is not None and row["user_id"] not in users)
        if missing:
            problems.append({"table":table,"reason":"undeclared_auth_orphan","rows":missing})
    for child,parent,child_col,parent_col in (("invoice_items","invoices","invoice_id","id"),
            ("invoices","clients","client_id","id"),("tag_billing_settings","clients","client_id","id"),
            ("google_calendars","google_connections","connection_id","id")):
        parents = {row[parent_col]:row for row in expected[parent]}
        bad = sum(1 for row in expected[child] if row.get(child_col) in parents and row.get("user_id") is not None
                  and row["user_id"] != parents[row[child_col]].get("user_id"))
        if bad:
            problems.append({"table":child,"reason":"cross_user_parent","rows":bad})
    tasks = {row["id"]:row for row in expected["tasks"]}
    for field in ("group_id","recurrence_parent_id"):
        bad = 0
        for row in tasks.values():
            reference = row.get(field)
            if reference is None:
                continue
            parent = tasks.get(str(reference))
            # Recurrence parent IDs can outlive deleted root rows; linked_group_id
            # is a stable series identity, not a FK to an extant task row.
            if (field == "group_id" and (parent is None or parent.get("type") != "group")) or (parent is not None and parent["user_id"] != row["user_id"]):
                bad += 1
        if bad:
            problems.append({"table":"tasks","reason":"task_relationship","field":field,"rows":bad})
    problems.extend(task_normalization_problems(list(tasks.values())))
    return problems


def catalog_drift(source, owned):
    """List differences without copying private function bodies into reports.

    Forward migrations intentionally changed the owned catalog. Differences
    are a review inventory, not a claim that either catalog is the desired one.
    """
    keys = {"columns":("schema","table_name","column_name"),"keys":("schema","table_name","name"),
            "indexes":("schema","table_name","name"),"triggers":("schema","table_name","name"),
            "policies":("schemaname","tablename","policyname"),"routines":("schema","name","arguments"),
            "tables":("schema","table_name")}
    result = {}
    for section, fields in keys.items():
        scope = lambda row: row.get("schema",row.get("schemaname")) in {"public","storage"}
        old = index_rows([r for r in source[section] if scope(r)],fields)
        new = index_rows([r for r in owned[section] if scope(r)],fields)
        changed = [loads(k) for k in sorted(set(old)&set(new)) if digest(old[k]) != digest(new[k])]
        result[section] = {"source_only":[loads(k) for k in sorted(set(old)-set(new))],
                           "owned_only":[loads(k) for k in sorted(set(new)-set(old))],"different":changed}
    return result


def task_normalization_problems(tasks):
    invalid = sum(1 for row in tasks if row.get("series_id") is None
                  or row.get("type") == "group" and row.get("group_id") is not None
                  or row.get("linked") and (row.get("linked_group_id") is None or row.get("detached_from_series"))
                  or not row.get("linked") and (row.get("linked_group_id") is not None
                     or row.get("recurrence_parent_id") is not None and not row.get("detached_from_series")))
    problems = [{"table":"tasks","reason":"normalization_invariant","rows":invalid}] if invalid else []
    for field in ("series_id","linked_group_id"):
        owners = {}
        for row in tasks:
            if row.get(field) is not None:
                owners.setdefault(row[field],set()).add(row["user_id"])
        collisions = sum(len(value)>1 for value in owners.values())
        if collisions:
            problems.append({"table":"tasks","reason":"cross_user_series","field":field,"groups":collisions})
    return problems


def baseline_storage(root):
    root = safe_path(root)
    entries = []
    manifest_paths = set(safe_path(root/"manifest.txt",existing=True).read_text().splitlines())
    for bucket in BUCKETS:
        for path in sorted((root/bucket).rglob("*")):
            safe_path(path)
            if not path.is_file():
                continue
            name = path.relative_to(root/bucket).as_posix()
            key = object_key({"bucket_id":bucket,"name":name})
            data = path.read_bytes()
            entries.append({"key":key,"sha256":__import__("hashlib").sha256(data).hexdigest(),"size":len(data)})
    if {row["key"] for row in entries} != manifest_paths:
        raise RefreshError("Original storage manifest is incomplete")
    return entries


def storage_plan(base, source, owned):
    b, n = ({row["key"]:row for row in rows} for rows in (base,owned))
    if source is None:
        return {"verified":False,"reason":"source_storage_bytes_missing","baseline_objects":len(b),
                "owned_objects":len(n),"owned_only_objects":len(set(n)-set(b)),"operations":[]}
    o = {row["key"]:row for row in source}
    if len(o) != len(source):
        raise RefreshError("Duplicate storage path")
    operations, conflicts = [], []
    content = lambda row: None if row is None else [row["sha256"],row["size"]]
    for key in sorted(set(b)|set(o)|set(n)):
        outcome, _ = compare_row(content(b.get(key)),content(o.get(key)),content(n.get(key)))
        if outcome == "conflict":
            conflicts.append({"key":key,"reason":"storage_conflict"})
        elif outcome == "apply_source":
            operations.append({"key":key,"action":"delete" if key not in o else "upload",
                               "before_hash":digest(n.get(key)),"after":o.get(key)})
    return {"verified":True,"operations":operations,"conflicts":conflicts}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--baseline",type=Path,required=True)
    parser.add_argument("--source",type=Path,required=True)
    parser.add_argument("--owned",type=Path,required=True)
    parser.add_argument("--output",type=Path,required=True)
    args = parser.parse_args()
    output = private_dir(args.output)
    source,owned = read_json(args.source),read_json(args.owned)
    verify_packet(source,SOURCE); verify_packet(owned,OWNED)
    if owned["manifest"].get("storage_content") != digest(owned.get("storage_content")):
        raise RefreshError("Owned storage content checksum mismatch")
    baseline = safe_path(args.baseline)
    if {path.stem for path in (baseline/"data").glob("*.csv")} != set(TABLES):
        raise RefreshError("Original baseline is incomplete")
    base_auth = read_json(baseline/"auth"/"users.json")
    tables,expected,conflicts,operations,original_hashes = {},{},{},[],{}
    # RW transaction is required only to CREATE/INSERT temporary relations.
    # All persistent reads use repeatable-read; transaction is always rolled back.
    connection = connect(readonly=False)
    try:
        cat = catalog(connection)
        if digest(cat) != digest(owned["catalog"]):
            raise RefreshError("Owned schema changed since snapshot")
        for table in TABLES:
            path = safe_path(baseline/"data"/(table+".csv"),existing=True)
            original_hashes[table] = __import__("hashlib").sha256(path.read_bytes()).hexdigest()
            with path.open(encoding="utf-8-sig",newline="") as handle:
                columns = next(csv.reader(handle))
            source_cols = [r["column_name"] for r in source["catalog"]["columns"] if r["schema"]=="public" and r["table_name"]==table]
            if columns != source_cols:
                raise RefreshError("Source columns drifted from baseline; review required")
            owned_columns = {r["column_name"]:r for r in cat["columns"] if r["schema"]=="public" and r["table_name"]==table}
            for column in source["catalog"]["columns"]:
                if column["schema"]=="public" and column["table_name"]==table and column["sql_type"] != owned_columns.get(column["column_name"],{}).get("sql_type"):
                    raise RefreshError("Source column types differ from owned schema")
            pk = keys_for(cat,"public",table)
            if pk != keys_for(source["catalog"],"public",table):
                raise RefreshError("Source primary key differs from owned schema")
            for row in source["public"][table]:
                if set(row) != set(columns):
                    raise RefreshError("Source row fields are incomplete or unknown")
            bstage = stage_csv(connection,path,table,columns)
            ostage = stage_json(connection,table,"o",source["public"][table])
            nstage = stage_json(connection,table,"n",owned["public"][table])
            brows = normalized_rows(connection,bstage,columns,pk)
            orows = normalized_rows(connection,ostage,columns,pk)
            nrows = normalized_rows(connection,nstage,list(owned_columns),pk)
            result = plan_table(table,brows,orows,nrows,columns,pk)
            tables[table] = {"baseline":len(brows),"source":len(orows),"owned":len(nrows),
                             "provisional_expected":len(result["expected"]),"outcomes":result["outcomes"]}
            expected[table]=result["expected"]; conflicts[table]=result["conflicts"]; operations.extend(result["operations"])
        auth = auth_plan(base_auth,source["auth"],owned["auth"])
        validation = validate_expected(connection,expected,cat,owned["auth"])
    finally:
        connection.rollback(); connection.close()
    storage = storage_plan(baseline_storage(baseline/"storage"),source.get("storage_content"),owned["storage_content"])
    drift = catalog_drift(source["catalog"],owned["catalog"])
    all_conflicts = [item for rows in conflicts.values() for item in rows] + auth["conflicts"]
    plan = {"format":VERSION,"mode":"plan-only","executable":False,"source_project":SOURCE,"owned_project":OWNED,
            "snapshot_preconditions":{"source":digest(source),"owned":digest(owned),"baseline_files":original_hashes,"schema":digest(cat)},
            "tables":tables,"operations":operations,"conflicts":all_conflicts,"validation":validation,
            "auth":auth,"storage":storage,"catalog_drift":drift,"provisional_expected":expected,
            "private_preconditions":owned["manifest"]["private"],
            "gates":["no apply command implemented","source and owned write freezes unverified","provider identity/entitlement review required",
                     "catalog differences need forward-migration and source-drift review",
                     "attachment references and legacy device-plan dependencies need a scoped review",
                     "source storage bytes missing" if not storage["verified"] else "storage operations need review",
                     "public release and cutover require separate approval"]}
    write_private(output/"plan.json",plan)
    summary = {"mode":"plan-only","executable":False,"tables":len(tables),
               "proposed_public_operations":len(operations),"row_conflicts":len(all_conflicts),
               "validation_groups":len(validation),"storage_bytes_verified":storage["verified"],"mutations":0,
               "table_counts":tables,"plan_sha256":digest(plan)}
    write_private(output/"summary.json",summary)
    print(canonical({k:v for k,v in summary.items() if k != "table_counts"}))


if __name__ == "__main__":
    cli_main(main)
