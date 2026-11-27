import hashlib
import json
import math
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[2]
CASE = ROOT / 'engine/tests/benchmarks/dadeppo_arch.json'
REPLAY = HERE / 'results/stabileo_results.json'
QUANTITIES = [
    ('limit-load', 'loadFactor', 'Limit load PR²/EI'),
    ('crown-u', 'uOverR', 'Crown horizontal displacement u/R at the limit point'),
    ('crown-v', 'vOverR', 'Crown vertical displacement v/R at the limit point'),
    ('crown-rotation', 'rotation', 'Crown rotation magnitude at the limit point'),
]
EXTRAPOLATION_CEILINGS = {
    'loadFactor': 0.0019418224410364838,
    'uOverR': 0.00030645931246425805,
    'vOverR': 0.00022911597743576926,
    'rotation': 0.010315309692828298,
}
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
        if not (a.keys() == b.keys()):
            raise ValueError(path)
        return max([max_relative(a[k], b[k], f'{path}.{k}') for k in a] or [0.0])
    if isinstance(a, list):
        if not (len(a) == len(b)):
            raise ValueError(path)
        return max([max_relative(x, y, f'{path}[{i}]') for i, (x, y) in enumerate(zip(a, b))] or [0.0])
    if isinstance(a, bool) or not isinstance(a, (int, float)):
        if not (a == b):
            raise ValueError((path, a, b))
        return 0.0
    return abs(a - b) / max(abs(a), abs(b), 1.0)


def observed_order(q20, q40, q80):
    if q40 == q80 or (q20 - q40) / (q40 - q80) <= 0:
        return None
    return math.log2((q20 - q40) / (q40 - q80))


def unconverged(name, reference):
    return [
        {'name': f'{name}: observed order of mesh convergence', 'metric': 'absolute difference from 2',
         'observed': None, 'tolerance': 0.5, 'passed': False},
        {'name': f'{name}: extrapolated to zero element length', 'metric': 'relative difference',
         'observed': None, 'tolerance': None, 'passed': False, 'reference': reference, 'computed': None},
        {'name': f'{name}: tolerance within 1.25 × its 40-element budget', 'metric': 'tolerance / budget − 1',
         'observed': None, 'tolerance': 0.25, 'passed': False},
    ]


def evidence(fresh):
    case = load(CASE)
    published = load(HERE / 'reference-results/limit-load.json')
    reference = {'loadFactor': case['reference'], **case['crownReference']}
    tolerance = {'loadFactor': case['relativeTolerance'], **case['crownRelativeTolerance']}
    if not (published['normalizedLimitLoad'] == reference['loadFactor']):
        raise ValueError("Invalid benchmark data: published['normalizedLimitLoad'] == reference['loadFactor']")
    if not (published['crownAtLimitPoint'] == case['crownReference']):
        raise ValueError("Invalid benchmark data: published['crownAtLimitPoint'] == case['crownReference']")
    limit = fresh['limitPoint']
    computed = {'loadFactor': limit['loadFactor'], **limit['crown']}
    computed['rotation'] = abs(computed['rotation'])
    reference['rotation'] = abs(reference['rotation'])
    rows, checks = [], []
    for row_id, key, name in QUANTITIES:
        observed = relative(computed[key], reference[key])
        row = {'id': row_id, 'name': f'{name}, 40 elements', 'source': SOURCE, 'unit': UNITS[key],
               'reference': reference[key], 'computed': computed[key], 'metric': 'relative difference',
               'observed': observed, 'tolerance': tolerance[key], 'passed': observed <= tolerance[key]}
        rows.append(row)
        checks.append({k: row[k] for k in ('name', 'metric', 'observed', 'tolerance', 'passed', 'reference', 'computed')})
    loads = [s['loadFactor'] for s in fresh['steps']]
    peak = max(loads)
    checks.append({'name': 'The path passes the limit point and descends', 'metric': 'final load / largest load',
                   'observed': loads[-1] / peak, 'tolerance': 0.95, 'passed': loads[-1] / peak <= 0.95})
    meshes = fresh['convergence']['meshes']
    safety = fresh['convergence']['gciSafetyFactor']
    if not ([m['elements'] for m in meshes] == [20, 40, 80]):
        raise ValueError("Invalid benchmark data: [m['elements'] for m in meshes] == [20, 40, 80]")
    for row_id, key, name in QUANTITIES:
        q20, q40, q80 = (m[key] for m in meshes)
        if key == 'rotation':
            q20, q40, q80 = abs(q20), abs(q40), abs(q80)
        order = observed_order(q20, q40, q80)
        if order is None:
            checks.extend(unconverged(name, reference[key]))
            continue
        checks.append({'name': f'{name}: observed order of mesh convergence', 'metric': 'absolute difference from 2',
                       'observed': abs(order - 2), 'tolerance': 0.5, 'passed': abs(order - 2) <= 0.5})
        extrapolated = q80 + (q80 - q40) / (2 ** order - 1)
        estimated = safety * abs((q80 - extrapolated) / extrapolated) + rounding(reference[key])
        allowed = min(estimated, EXTRAPOLATION_CEILINGS[key])
        observed = relative(extrapolated, reference[key])
        checks.append({'name': f'{name}: extrapolated to zero element length', 'metric': 'relative difference',
                       'observed': observed, 'tolerance': allowed, 'passed': observed <= allowed,
                       'reference': reference[key], 'computed': extrapolated})
        budget = safety * abs((q40 - extrapolated) / extrapolated) + rounding(reference[key])
        checks.append({'name': f'{name}: tolerance within 1.25 × its 40-element budget', 'metric': 'tolerance / budget − 1',
                       'observed': tolerance[key] / budget - 1, 'tolerance': 0.25,
                       'passed': 0 <= tolerance[key] / budget - 1 <= 0.25})
    replay = load(REPLAY)
    steps = range(20, case['input']['maxSteps'] + 1, 20)
    node_ids = {node['id'] for node in case['input']['solver']['nodes'].values()}
    for run in (replay, fresh):
        if [frame['step'] for frame in run['frames']] != list(steps):
            raise ValueError('Incomplete displacement frame coverage')
        for frame in run['frames']:
            field = frame['displacements']
            if len(field) != len(node_ids) or {d['nodeId'] for d in field} != node_ids:
                raise ValueError(f"Wrong displacement nodes at frame {frame['step']}")
            if not all(math.isfinite(d[key]) for d in field for key in ('ux', 'uz', 'ry')):
                raise ValueError(f"Nonfinite displacement at frame {frame['step']}")
    drift = max(max_relative(replay['steps'], fresh['steps']), max_relative(replay['frames'], fresh['frames']),
                max_relative(replay['limitPoint'], fresh['limitPoint']), max_relative(replay['convergence'], fresh['convergence']))
    checks.append({'name': 'The page replay is a fresh native run', 'metric': 'largest difference over every stored value, relative to max(|stored|, |fresh|, 1)',
                   'observed': drift, 'tolerance': 1e-9, 'passed': drift <= 1e-9})
    validation = {'command': COMMAND, 'case': 'engine/tests/benchmarks/dadeppo_arch.json', 'checks': checks}
    return validation, {'checks': rows}


def manifest(files):
    old = load(HERE / 'reference-results/MANIFEST.json')
    hashes = {name: hashlib.sha256(text.encode()).hexdigest() for name, text in sorted(files.items())}
    return {**old, 'files_sha256': hashes}


def replay_metadata():
    replay = load(REPLAY)
    return {
        'case_sha256': hashlib.sha256(CASE.read_bytes()).hexdigest(),
        'files_sha256': {REPLAY.name: hashlib.sha256(REPLAY.read_bytes()).hexdigest()},
        'peak': max(replay['steps'], key=lambda step: step['loadFactor']),
        'limitPoint': replay['limitPoint'],
    }


def dump(value):
    return json.dumps(value, indent=2, ensure_ascii=False) + '\n'


def differences(a, b, path='$', scale=None):
    if isinstance(a, dict) and isinstance(b, dict):
        if a.keys() != b.keys():
            return [f'{path}: keys {sorted(a)} != {sorted(b)}']
        tolerance = a.get('tolerance') if isinstance(a.get('tolerance'), (int, float)) and 'passed' in a else scale
        return [d for k in a for d in differences(a[k], b[k], f'{path}.{k}', 0 if k in ('reference', 'tolerance') else tolerance if k == 'observed' else None)]
    if isinstance(a, list) and isinstance(b, list):
        if len(a) != len(b):
            return [f'{path}: {len(a)} items != {len(b)}']
        return [d for i, (x, y) in enumerate(zip(a, b)) for d in differences(x, y, f'{path}[{i}]', scale)]
    if isinstance(a, bool) or isinstance(b, bool) or not isinstance(a, (int, float)) or not isinstance(b, (int, float)):
        return [] if a == b else [f'{path}: {a!r} != {b!r}']
    allowed = 0.1 * scale if scale is not None else 1e-9 * max(abs(a), abs(b))
    return [] if abs(a - b) <= allowed else [f'{path}: {a!r} != {b!r}']


USAGE = 'usage: validate.py generate|check <fresh export>'


def main(mode, export):
    if mode not in ('generate', 'check'):
        raise SystemExit(USAGE)
    validation, comparison = evidence(load(export))
    comparison_text = dump(comparison)
    files = {'limit-load.json': (HERE / 'reference-results/limit-load.json').read_text(), 'published_comparison.json': comparison_text}
    failed = [c['name'] for c in validation['checks'] + comparison['checks'] if not c['passed']]
    if failed:
        raise SystemExit('failed checks: ' + ', '.join(failed))
    replay_manifest = REPLAY.with_name('MANIFEST.json')
    recorded = load(replay_manifest)
    metadata = replay_metadata()
    if mode == 'generate':
        replay_manifest.write_text(dump({**recorded, **metadata}))
        (HERE / 'VALIDATION.json').write_text(dump(validation))
        (HERE / 'reference-results/published_comparison.json').write_text(comparison_text)
        (HERE / 'reference-results/MANIFEST.json').write_text(dump(manifest(files)))
    else:
        if not (all(recorded.get(key) == value for key, value in metadata.items())):
            raise ValueError('replay manifest is stale')
        committed = {name: (HERE / 'reference-results' / name).read_text() for name in files}
        stale = differences(load(HERE / 'VALIDATION.json'), validation)
        if not (not stale):
            raise ValueError('VALIDATION.json is not what the fresh run gives: ' + '; '.join(stale[:5]))
        stale = differences(json.loads(committed['published_comparison.json']), comparison)
        if not (not stale):
            raise ValueError('published_comparison.json is stale: ' + '; '.join(stale[:5]))
        if not (load(HERE / 'reference-results/MANIFEST.json') == manifest(committed)):
            raise ValueError('MANIFEST.json hashes are stale')
    print(json.dumps({'mode': mode, 'checks': len(validation['checks']), 'comparisonRows': len(comparison['checks']), 'failed': failed}))


if __name__ == '__main__':
    if len(sys.argv) != 3:
        raise SystemExit(USAGE)
    main(*sys.argv[1:3])
