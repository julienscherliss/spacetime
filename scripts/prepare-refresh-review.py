#!/usr/bin/env python3
"""Prepare a private conflict worksheet and attachment audit from existing rehearsal snapshots."""
import argparse
from pathlib import Path
from refresh_common import read_json, private_dir, write_private, canonical, cli_main
from refresh_review import review_bundle


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    for name in ('plan', 'source', 'owned', 'output'):
        parser.add_argument('--' + name, type=Path, required=True)
    args = parser.parse_args()
    result = review_bundle(read_json(args.plan), read_json(args.source), read_json(args.owned))
    output = private_dir(args.output)
    write_private(output/'review.json', result)
    write_private(output/'summary.json', result['summary'])
    print(canonical(dict(result['summary'], mutations=0)))


if __name__ == '__main__':
    cli_main(main)
