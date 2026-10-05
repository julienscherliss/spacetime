#!/usr/bin/env python3
"""Generate a single-statement source export, or validate its privately downloaded CSV."""
import argparse
import csv
import hashlib
from pathlib import Path
from refresh_common import *


def export_query():
    # Every arm belongs to one SELECT statement, giving a single database MVCC snapshot.
    queries = {"public." + table: f'select * from public."{table}" order by ' + ('user_id' if table == 'user_color_schemes' else 'id') for table in TABLES}
    queries.update({"catalog."+name: query for name,query in CATALOG_QUERIES.items()})
    queries.update({"auth": AUTH_QUERY, "identities": IDENTITIES_QUERY, "storage_metadata": STORAGE_QUERY,
                    "cron": "select jobname,schedule,active from cron.job order by jobname",
                    "meta": f"select '{SOURCE}'::text as project,statement_timestamp() as snapshot_time,current_user as query_role"})
    arms = [f"select '{name}'::text as dataset, coalesce(jsonb_agg(to_jsonb(q)), '[]'::jsonb) as payload from ({query}) q" for name,query in queries.items()]
    return "with datasets as (\n" + "\nunion all\n".join(arms) + "\n)\nselect dataset, payload::text as payload_json, jsonb_array_length(payload) as row_count, md5(payload::text) as transport_md5 from datasets order by dataset;\n"


def import_csv(path):
    csv.field_size_limit(64 * 1024 * 1024)
    datasets = {}
    with safe_path(path, existing=True).open(encoding="utf-8-sig", newline="") as handle:
        header = handle.readline()
        try:
            delimiter = csv.Sniffer().sniff(header, delimiters=",;\t").delimiter
        except csv.Error:
            raise RefreshError("Source export CSV has an unsupported delimiter") from None
        handle.seek(0)
        reader = csv.DictReader(handle, delimiter=delimiter)
        if set(reader.fieldnames or []) != {"dataset","payload_json","row_count","transport_md5"}:
            raise RefreshError("Source export CSV has unexpected headers")
        for row in reader:
            name, text = row["dataset"], row["payload_json"]
            if name in datasets or hashlib.md5(text.encode()).hexdigest() != row["transport_md5"]:
                raise RefreshError("Source dataset is duplicate or truncated")
            payload = loads(text)
            if not isinstance(payload, list) or len(payload) != int(row["row_count"]):
                raise RefreshError("Source dataset count mismatch")
            datasets[name] = payload
    expected = {"public."+table for table in TABLES} | {"catalog."+name for name in CATALOG_QUERIES} | {"auth","identities","storage_metadata","cron","meta"}
    if set(datasets) != expected or len(datasets["meta"]) != 1 or datasets["meta"][0]["project"] != SOURCE:
        raise RefreshError("Source export is missing datasets or has the wrong project")
    packet = {"format": VERSION,"project": SOURCE,"purpose":"rehearsal","freeze_verified":False,
              "database_consistency":"single SELECT statement", "snapshot_time":datasets["meta"][0]["snapshot_time"],
              "public":{name:datasets["public."+name] for name in TABLES},
              "catalog":{name:datasets["catalog."+name] for name in CATALOG_QUERIES},
              "auth":datasets["auth"],"identities":datasets["identities"],"storage_metadata":datasets["storage_metadata"],
              "cron":datasets["cron"],"storage_content":None,"storage_consistency":"bytes not captured"}
    if {r["table_name"] for r in packet["catalog"]["tables"] if r["schema"] == "public"} != set(TABLES):
        raise RefreshError("Source public table set changed")
    for name in TABLES:
        index_rows(packet["public"][name], keys_for(packet["catalog"],"public",name))
    packet["manifest"] = manifest(packet)
    return packet


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--import-csv", type=Path)
    args = parser.parse_args()
    output = private_dir(args.output)
    if args.import_csv:
        packet = import_csv(args.import_csv)
        write_private(output/"source.json",packet)
        print(canonical({"mode":"validated source snapshot","tables":len(TABLES),"rows":sum(len(r) for r in packet["public"].values()),
                         "auth_users":len(packet["auth"]),"storage_objects":len(packet["storage_metadata"]),"storage_bytes_verified":False}))
    else:
        write_private(output/"source-export.sql",export_query(),raw=True)
        print(canonical({"mode":"query preparation","statements":1,"public_tables":len(TABLES),"mutations":0}))


if __name__ == "__main__":
    cli_main(main)
