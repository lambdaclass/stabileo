import json
import sys
from pathlib import Path

USAGE = 'usage: compare_evidence.py <committed.json> <fresh.json>'


def number(value):
    return isinstance(value, (int, float)) and not isinstance(value, bool)


def check_scale(value):
    if 'passed' in value and number(value.get('tolerance')):
        return abs(value['tolerance'])
    return None


def differences(committed, fresh, path='$', scale=None):
    if isinstance(committed, dict) and isinstance(fresh, dict):
        if committed.keys() != fresh.keys():
            return [f'{path}: keys {sorted(committed)} != {sorted(fresh)}']
        own = check_scale(committed)
        if own is not None and check_scale(fresh) is None:
            return [f'{path}: a check in the committed file is not a check in the fresh one']
        inner = scale if own is None else own
        found = []
        for key in committed:
            if key == 'tolerance' and own is not None:
                if abs(committed[key] - fresh[key]) > 1e-12 * max(abs(committed[key]), abs(fresh[key])):
                    found.append(f'{path}.{key}: {committed[key]!r} != {fresh[key]!r}')
                continue
            found.extend(differences(committed[key], fresh[key], f'{path}.{key}', inner))
        return found
    if isinstance(committed, list) and isinstance(fresh, list):
        if len(committed) != len(fresh):
            return [f'{path}: {len(committed)} items != {len(fresh)}']
        return [d for i, (a, b) in enumerate(zip(committed, fresh)) for d in differences(a, b, f'{path}[{i}]', scale)]
    if number(committed) and number(fresh):
        allowed = 1e-9 * max(abs(committed), abs(fresh), 1.0)
        if scale is not None:
            allowed = max(allowed, 0.1 * scale)
        return [] if abs(committed - fresh) <= allowed else [f'{path}: {committed!r} != {fresh!r}']
    if committed == fresh and type(committed) is type(fresh):
        return []
    return [f'{path}: {committed!r} != {fresh!r}']


def main(argv):
    if len(argv) != 2:
        raise SystemExit(USAGE)
    committed, fresh = (json.loads(Path(p).read_text()) for p in argv)
    found = differences(committed, fresh)
    for line in found:
        print(line)
    if found:
        raise SystemExit(f'{argv[0]} is not what the fresh run gives: {len(found)} differences')
    print(f'{argv[0]} matches the fresh run')


if __name__ == '__main__':
    main(sys.argv[1:])
