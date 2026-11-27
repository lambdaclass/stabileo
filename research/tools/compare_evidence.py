import json
import math
import sys
from pathlib import Path

USAGE = 'usage: compare_evidence.py <committed.json> <fresh.json>'


def number(value):
    return isinstance(value, (int, float)) and not isinstance(value, bool)


def observation_budget(row):
    observed = row.get('observed')
    if not number(observed) or not math.isfinite(observed):
        return 0
    if row.get('metric') == 'max abs(AD-central difference)/(1+abs(AD)), best of three step sizes':
        return 1e-3 * abs(observed) + 1e-14
    return min(1e-9, 0.1 * abs(row['tolerance']))


def differences(committed, fresh, path='$', budget=None):
    if isinstance(committed, dict) and isinstance(fresh, dict):
        if committed.keys() != fresh.keys():
            return [f'{path}: keys {sorted(committed)} != {sorted(fresh)}']
        found = []
        for key, value in committed.items():
            allowed = None
            if key in ('reference', 'tolerance', 'points'):
                allowed = 0
            elif key == 'computed' and number(fresh[key]):
                allowed = 1e-9 * abs(fresh[key])
            elif key == 'observed' and number(fresh.get('tolerance')):
                allowed = observation_budget(fresh)
            elif isinstance(value, int):
                allowed = 0
            found.extend(differences(value, fresh[key], f'{path}.{key}', allowed))
        return found
    if isinstance(committed, list) and isinstance(fresh, list):
        if len(committed) != len(fresh):
            return [f'{path}: {len(committed)} items != {len(fresh)}']
        return [d for i, (a, b) in enumerate(zip(committed, fresh)) for d in differences(a, b, f'{path}[{i}]', budget)]
    if number(committed) and number(fresh):
        if math.isfinite(committed) and math.isfinite(fresh):
            allowed = budget if budget is not None else 1e-9 * max(abs(committed), abs(fresh), 1.0)
            if abs(committed - fresh) <= allowed:
                return []
        return [f'{path}: {committed!r} != {fresh!r}']
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
