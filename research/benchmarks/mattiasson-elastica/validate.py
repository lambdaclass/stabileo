import hashlib
import json
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[2]
CASE = ROOT / 'engine/tests/benchmarks/mattiasson_elastica.json'
TABLE = HERE / 'reference-results/mattiasson-table.json'
COMMAND = ('cargo run --release --manifest-path research/benchmarks/mattiasson-elastica/Cargo.toml -- <native.json> <mesh.json>; '
           'python3 -I research/benchmarks/mattiasson-elastica/validate.py generate <native.json> <mesh.json>')


def load(path):
    return json.loads(Path(path).read_text())


def tip(case, row, node=None):
    result = row.get('result')
    if not result or not result['converged'] or abs(result['loadFactor'] - 1) > 1e-12:
        return None
    d = next(d for d in result['results']['displacements'] if d['nodeId'] == (node or case['tipNode']))
    return -d['ux'] / case['length'], -d['uz'] / case['length']


def relative(computed, reference):
    return abs(computed - reference) / abs(reference)


def evidence(native, mesh):
    data = load(CASE)
    cases = data['cases']
    tolerance = data['accuracyTolerance']
    by_id = {r['id']: r for r in native}
    assert [r['id'] for r in native] == [c['id'] for c in cases]
    checks = []
    full = sum(tip(c, by_id[c['id']]) is not None for c in cases)
    checks.append({'name': 'Every case reaches full load', 'metric': 'cases short of full load',
                   'observed': len(cases) - full, 'tolerance': 0, 'passed': full == len(cases)})
    computed = {}
    for c in cases:
        values = tip(c, by_id[c['id']])
        computed[c['id']] = values
        if not c['reference'] or values is None:
            continue
        for i, component in enumerate(['u/L', 'v/L']):
            observed = relative(values[i], c['reference'][i])
            label = f'PL²/EI = {c["parameter"]:g}' if c['kind'] == 'force' else 'tip moment, θ = 1 rad'
            checks.append({'name': f'{label}: {component}, 16 elements', 'metric': 'relative difference',
                           'reference': c['reference'][i], 'computed': values[i],
                           'observed': observed, 'tolerance': tolerance, 'passed': observed <= tolerance})
    ceilings = {m['elements']: m['relativeError'] for m in data['meshErrorCeilings']}
    for c in (c for c in cases if c['kind'] == 'force' and c['reference']):
        previous = None
        for elements, ceiling in ceilings.items():
            row = next(r for r in mesh if r['id'] == c['id'] and r['elements'] == elements)
            values = tip(c, row, row['tipNode'])
            errors = [relative(values[i], c['reference'][i]) for i in range(2)] if values else [float('inf')] * 2
            observed = max(errors)
            checks.append({'name': f'PL²/EI = {c["parameter"]:g}: {elements} elements, larger component error', 'metric': 'relative difference',
                           'observed': observed, 'tolerance': ceiling, 'passed': observed <= ceiling})
            if previous:
                shrinks = all(e < p for e, p in zip(errors, previous))
                checks.append({'name': f'PL²/EI = {c["parameter"]:g}: both errors shrink from {elements // 2} to {elements} elements',
                               'metric': 'components whose error grows', 'observed': sum(e >= p for e, p in zip(errors, previous)),
                               'tolerance': 0, 'passed': shrinks})
            previous = errors
    stored = {r['id']: r for r in load(HERE / 'RESULTS.json')['cases']}
    drift = max((abs(stored[i][k] - v[j]) for i, v in computed.items() if v for j, k in enumerate(['u', 'v'])), default=None)
    checks.append({'name': 'RESULTS.json is a fresh native run', 'metric': 'largest absolute difference in u/L, v/L',
                   'observed': drift, 'tolerance': 1e-10, 'passed': drift is not None and drift <= 1e-10})
    table = load(TABLE)
    rows = []
    for entry in table['rows']:
        c = next(c for c in cases if c['kind'] == 'force' and c['parameter'] == entry['parameter'])
        values = computed[c['id']]
        for i, (key, name) in enumerate([('u', 'horizontal tip displacement u/L'), ('v', 'vertical tip displacement v/L')]):
            reference = entry[key]
            rounding = 0.5 * 10 ** -table['decimals'] / reference
            allowed = tolerance + rounding
            observed = relative(values[i], reference)
            rows.append({'id': f'q{entry["parameter"]:g}-{key}', 'name': f'PL²/EI = {entry["parameter"]:g}: {name}, 16 elements',
                         'source': table['source'], 'unit': '', 'reference': reference, 'computed': values[i],
                         'metric': 'relative difference', 'observed': observed, 'tolerance': allowed, 'passed': observed <= allowed})
    return {'command': COMMAND, 'case': 'engine/tests/benchmarks/mattiasson_elastica.json', 'checks': checks}, {'checks': rows}


def dump(value):
    return json.dumps(value, indent=2, ensure_ascii=False) + '\n'


def manifest(files):
    return {'method': 'Mattiasson (1981) table values transcribed by hand from the open copy of Nanakorn & Vu (2006), Table 1 (see mattiasson-table.json); published_comparison.json written by validate.py from a fresh native run.',
            'files_sha256': {name: hashlib.sha256(text.encode()).hexdigest() for name, text in sorted(files.items())}}


def same(a, b):
    if isinstance(a, dict):
        return isinstance(b, dict) and a.keys() == b.keys() and all(same(a[k], b[k]) for k in a)
    if isinstance(a, list):
        return isinstance(b, list) and len(a) == len(b) and all(same(x, y) for x, y in zip(a, b))
    if a is None or b is None:
        return a is b
    if isinstance(a, float) or isinstance(b, float):
        return abs(a - b) <= 1e-9 * max(1.0, abs(a), abs(b))
    return a == b


USAGE = 'usage: validate.py generate|check <native.json> <mesh.json>'


def main(mode, native, mesh):
    if mode not in ('generate', 'check'):
        raise SystemExit(USAGE)
    validation, comparison = evidence(load(native), load(mesh))
    text = dump(comparison)
    files = {'mattiasson-table.json': TABLE.read_text(), 'published_comparison.json': text}
    if mode == 'generate':
        (HERE / 'VALIDATION.json').write_text(dump(validation))
        (HERE / 'reference-results/published_comparison.json').write_text(text)
        (HERE / 'reference-results/MANIFEST.json').write_text(dump(manifest(files)))
    else:
        committed = {name: (HERE / 'reference-results' / name).read_text() for name in files}
        assert same(load(HERE / 'VALIDATION.json'), validation), 'VALIDATION.json is not what the fresh run gives'
        assert same(json.loads(committed['published_comparison.json']), comparison), 'published_comparison.json is stale'
        assert load(HERE / 'reference-results/MANIFEST.json') == manifest(committed), 'MANIFEST.json hashes are stale'
    failed = [c['name'] for c in validation['checks'] + comparison['checks'] if not c['passed']]
    print(json.dumps({'mode': mode, 'checks': len(validation['checks']), 'comparisonRows': len(comparison['checks']), 'failed': failed}, ensure_ascii=False))
    if failed:
        raise SystemExit(1)


if __name__ == '__main__':
    if len(sys.argv) != 4:
        raise SystemExit(USAGE)
    main(*sys.argv[1:4])
