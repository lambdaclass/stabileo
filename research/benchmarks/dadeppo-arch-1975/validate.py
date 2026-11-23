import hashlib
import json
import math
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[2]
CASE = ROOT / 'engine/tests/benchmarks/dadeppo_arch.json'
QUANTITIES = [
    ('limit-load', 'loadFactor', 'Limit load PR²/EI'),
    ('crown-u', 'uOverR', 'Crown horizontal displacement u/R at the limit point'),
    ('crown-v', 'vOverR', 'Crown vertical displacement v/R at the limit point'),
    ('crown-rotation', 'rotation', 'Crown rotation at the limit point'),
]
SOURCE = 'DaDeppo & Schmidt (1975), Table 1, as quoted by R. Schmidt (2000), J. Eng. Mech. 126(12), p. 1308'
UNITS = {'loadFactor': '', 'uOverR': '', 'vOverR': '', 'rotation': ''}
COMMAND = ('DADEPPO_EXPORT=<fresh.json> cargo test --release --manifest-path engine/Cargo.toml --test solver dadeppo_arch; '
           'python3 -I research/benchmarks/dadeppo-arch-1975/validate.py generate <fresh.json>')


def load(path):
    return json.loads(Path(path).read_text())


def rounding(value):
    decimals = len(repr(value).split('.')[1]) if '.' in repr(value) else 0
    return 0.5 * 10 ** -decimals / abs(value)


def relative(computed, reference):
    return abs(computed - reference) / abs(reference)


def max_relative(a, b, path='$'):
    if isinstance(a, dict):
        assert a.keys() == b.keys(), path
        return max([max_relative(a[k], b[k], f'{path}.{k}') for k in a] or [0.0])
    if isinstance(a, list):
        assert len(a) == len(b), path
        return max([max_relative(x, y, f'{path}[{i}]') for i, (x, y) in enumerate(zip(a, b))] or [0.0])
    if isinstance(a, bool) or not isinstance(a, (int, float)):
        assert a == b, (path, a, b)
        return 0.0
    return abs(a - b) / max(abs(a), abs(b), 1e-300) if a != b else 0.0


def evidence(fresh):
    case = load(CASE)
    published = load(HERE / 'reference-results/limit-load.json')
    reference = {'loadFactor': case['reference'], **case['crownReference']}
    tolerance = {'loadFactor': case['relativeTolerance'], **case['crownRelativeTolerance']}
    assert published['normalizedLimitLoad'] == reference['loadFactor']
    assert published['crownAtLimitPoint'] == case['crownReference']
    limit = fresh['limitPoint']
    computed = {'loadFactor': limit['loadFactor'], **limit['crown']}
    rows, checks = [], []
    for row_id, key, name in QUANTITIES:
        observed = relative(computed[key], reference[key])
        row = {'id': row_id, 'name': f'{name}, 40 elements', 'source': SOURCE, 'unit': UNITS[key],
               'reference': reference[key], 'computed': computed[key], 'metric': 'relative difference',
               'observed': observed, 'tolerance': tolerance[key], 'passed': observed < tolerance[key]}
        rows.append(row)
        checks.append({k: row[k] for k in ('name', 'metric', 'observed', 'tolerance', 'passed', 'reference', 'computed')})
    loads = [s['loadFactor'] for s in fresh['steps']]
    peak = max(loads)
    checks.append({'name': 'The path passes the limit point and descends', 'metric': 'final load / largest load',
                   'observed': loads[-1] / peak, 'tolerance': 0.95, 'passed': loads[-1] / peak < 0.95})
    meshes = fresh['convergence']['meshes']
    safety = fresh['convergence']['gciSafetyFactor']
    assert [m['elements'] for m in meshes] == [20, 40, 80]
    for row_id, key, name in QUANTITIES:
        q20, q40, q80 = (m[key] for m in meshes)
        order = math.log2((q20 - q40) / (q40 - q80))
        checks.append({'name': f'{name}: observed order of mesh convergence', 'metric': 'absolute difference from 2',
                       'observed': abs(order - 2), 'tolerance': 0.5, 'passed': abs(order - 2) <= 0.5})
        extrapolated = q80 + (q80 - q40) / (2 ** order - 1)
        allowed = safety * abs((q80 - extrapolated) / extrapolated) + rounding(reference[key])
        observed = relative(extrapolated, reference[key])
        checks.append({'name': f'{name}: extrapolated to zero element length', 'metric': 'relative difference',
                       'observed': observed, 'tolerance': allowed, 'passed': observed < allowed,
                       'reference': reference[key], 'computed': extrapolated})
        budget = safety * abs((q40 - extrapolated) / extrapolated) + rounding(reference[key])
        checks.append({'name': f'{name}: tolerance within 1.25 × its 40-element budget', 'metric': 'tolerance / budget − 1',
                       'observed': tolerance[key] / budget - 1, 'tolerance': 0.25,
                       'passed': 0 <= tolerance[key] / budget - 1 <= 0.25})
    replay = load(HERE / 'results/stabileo_results.json')
    drift = max(max_relative(replay['steps'], fresh['steps']), max_relative(replay['frames'], fresh['frames']),
                max_relative(replay['limitPoint'], fresh['limitPoint']), max_relative(replay['convergence'], fresh['convergence']))
    checks.append({'name': 'The page replay is a fresh native run', 'metric': 'largest relative difference over every stored value',
                   'observed': drift, 'tolerance': 1e-9, 'passed': drift <= 1e-9})
    validation = {'command': COMMAND, 'case': 'engine/tests/benchmarks/dadeppo_arch.json', 'checks': checks}
    return validation, {'checks': rows}


def manifest(files):
    old = load(HERE / 'reference-results/MANIFEST.json')
    hashes = {name: hashlib.sha256(text.encode()).hexdigest() for name, text in sorted(files.items())}
    return {**old, 'files_sha256': hashes}


def dump(value):
    return json.dumps(value, indent=2, ensure_ascii=False) + '\n'


def differences(a, b, path='$', scale=None):
    if isinstance(a, dict) and isinstance(b, dict):
        if a.keys() != b.keys():
            return [f'{path}: keys {sorted(a)} != {sorted(b)}']
        tolerance = a.get('tolerance') if isinstance(a.get('tolerance'), (int, float)) and 'passed' in a else scale
        return [d for k in a for d in differences(a[k], b[k], f'{path}.{k}', None if k == 'tolerance' else tolerance)]
    if isinstance(a, list) and isinstance(b, list):
        if len(a) != len(b):
            return [f'{path}: {len(a)} items != {len(b)}']
        return [d for i, (x, y) in enumerate(zip(a, b)) for d in differences(x, y, f'{path}[{i}]', scale)]
    if isinstance(a, bool) or isinstance(b, bool) or not isinstance(a, (int, float)) or not isinstance(b, (int, float)):
        return [] if a == b else [f'{path}: {a!r} != {b!r}']
    allowed = 0.1 * scale if scale else 1e-9 * max(abs(a), abs(b))
    return [] if abs(a - b) <= allowed else [f'{path}: {a!r} != {b!r}']


def main(mode, export):
    validation, comparison = evidence(load(export))
    comparison_text = dump(comparison)
    files = {'limit-load.json': (HERE / 'reference-results/limit-load.json').read_text(), 'published_comparison.json': comparison_text}
    if mode == 'generate':
        (HERE / 'VALIDATION.json').write_text(dump(validation))
        (HERE / 'reference-results/published_comparison.json').write_text(comparison_text)
        (HERE / 'reference-results/MANIFEST.json').write_text(dump(manifest(files)))
    elif mode == 'check':
        committed = {name: (HERE / 'reference-results' / name).read_text() for name in files}
        stale = differences(load(HERE / 'VALIDATION.json'), validation)
        assert not stale, 'VALIDATION.json is not what the fresh run gives: ' + '; '.join(stale[:5])
        stale = differences(json.loads(committed['published_comparison.json']), comparison)
        assert not stale, 'published_comparison.json is stale: ' + '; '.join(stale[:5])
        assert load(HERE / 'reference-results/MANIFEST.json') == manifest(committed), 'MANIFEST.json hashes are stale'
    else:
        raise SystemExit('usage: validate.py generate|check <fresh export>')
    failed = [c['name'] for c in validation['checks'] + comparison['checks'] if not c['passed']]
    print(json.dumps({'mode': mode, 'checks': len(validation['checks']), 'comparisonRows': len(comparison['checks']), 'failed': failed}))
    if failed:
        raise SystemExit(1)


if __name__ == '__main__':
    main(*sys.argv[1:3])
