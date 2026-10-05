#!/usr/bin/env python3
"""Prepare bound choices or a resolved rehearsal; there is no apply mode."""
import argparse
from pathlib import Path
from refresh_common import read_json, private_dir, write_private, canonical, cli_main
from refresh_resolutions import choice_template, resolve_rehearsal


def main():
    p = argparse.ArgumentParser(description=__doc__)
    for name in ('plan', 'source', 'owned', 'output'):
        p.add_argument('--' + name, type=Path, required=True)
    p.add_argument('--choices', type=Path)
    args = p.parse_args()
    plan, source, owned = (read_json(getattr(args, x)) for x in ('plan', 'source', 'owned'))
    result = (resolve_rehearsal(plan, source, owned, read_json(args.choices)) if args.choices
              else choice_template(plan, source, owned))
    out = private_dir(args.output)
    write_private(out / ('resolved-rehearsal.json' if args.choices else 'choices-template.json'), result)
    if args.choices:
        write_private(out / 'summary.json', result['summary'])
        print(canonical(result['summary']))
    else:
        print(canonical({'choices_unset': len(result['choices']), 'mutations': 0}))


if __name__ == '__main__':
    cli_main(main)
