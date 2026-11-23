import hashlib
import json
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[2]
CASE = ROOT / 'engine/tests/benchmarks/lee_frame.json'
READING = HERE / 'reference-results/published-peaks.json'
COMMAND = ('LEE_REPLAY_OUTPUT=<fresh.json> cargo test --release --manifest-path engine/Cargo.toml --test solver lee_frame; '
           'python3 -I research/benchmarks/lee-frame-1968/validate.py generate <fresh.json>')


def load(path):
    return json.loads(Path(path).read_text())


def first_peak(frames):
    for before, frame, after in zip(frames, frames[1:], frames[2:]):
        if before['load'] < frame['load'] > after['load']:
            return frame
    return None


def evidence(fresh):
    case = load(CASE)
    frames = fresh['frames']
    checks = []
    steps = case['input']['maxSteps']
    checks.append({'name': 'The production solver converges at every one of the 90 arc-length steps', 'metric': 'steps short of the full path',
                   'observed': steps - len(frames), 'tolerance': 0, 'passed': len(frames) == steps})
    peak = first_peak(frames)
    regression = case['regression']
    drift = abs(peak['load'] - regression['firstLimitLoad'])
    checks.append({'name': 'Regression: first sampled peak, 20 elements', 'metric': 'absolute difference (kN)',
                   'observed': drift, 'tolerance': regression['absoluteTolerance'],
                   'passed': drift < regression['absoluteTolerance'] and peak['step'] == regression['firstPeakStep']})
    study = case['convergence']['cases']
    finest = {}
    for split in (1, 2, 4):
        values = [c['firstPeak'] for c in study if c['split'] == split]
        spread = max(values) - min(values)
        checks.append({'name': f'{20 * split} elements: smaller arc-length steps move the first peak', 'metric': 'largest change (kN)',
                       'observed': spread, 'tolerance': case['convergence']['stepEffectBound'], 'passed': spread < case['convergence']['stepEffectBound']})
        finest[split] = values[-1]
    p20, p40, p80 = finest[1], finest[2], finest[4]
    ratio = (p20 - p40) / (p40 - p80)
    checks.append({'name': 'Mesh refinement: ratio of successive changes (4 for second order)', 'metric': 'absolute difference from 4',
                   'observed': abs(ratio - 4), 'tolerance': 1, 'passed': abs(ratio - 4) < 1})
    extrapolated = p80 + (p80 - p40) / (ratio - 1)
    stored = load(HERE / 'results/stabileo_results.json')['frames']
    drift = float('inf')
    if len(stored) == len(frames):
        drift = max(max(abs(a['load'] - b['load']), *(abs(x[k] - y[k]) for x, y in zip(a['displacement'], b['displacement']) for k in ('ux', 'uz', 'ry')))
                    for a, b in zip(stored, frames))
    checks.append({'name': 'The page replay is a fresh native run', 'metric': 'largest absolute difference in load (kN) and displacement (m)',
                   'observed': drift, 'tolerance': 1e-9, 'passed': drift <= 1e-9})
    reading = load(READING)
    computed = {'elements20': peak['load'], 'elements80': p80, 'extrapolated': extrapolated}
    labels = {'elements20': 'First peak load, 20 elements', 'elements80': 'First peak load, 80 elements',
              'extrapolated': 'First peak load, extrapolated to zero element length'}
    rows = []
    for entry in reading['rows']:
        value = computed[entry['computed']]
        observed = abs(value - entry['reference'])
        row = {'id': entry['id'], 'name': f'{labels[entry["computed"]]} against {entry["label"]}', 'source': entry['source'], 'unit': 'kN',
               'reference': entry['reference'], 'computed': value, 'metric': 'absolute difference',
               'observed': observed, 'tolerance': entry['uncertainty'], 'passed': observed <= entry['uncertainty']}
        rows.append(row)
        checks.append({k: row[k] for k in ('name', 'metric', 'reference', 'computed', 'observed', 'tolerance', 'passed')})
    return {'command': COMMAND, 'case': 'engine/tests/benchmarks/lee_frame.json', 'checks': checks}, {'checks': rows}


def dump(value):
    return json.dumps(value, indent=2, ensure_ascii=False) + '\n'


def manifest(files):
    return {'method': 'published-peaks.json transcribed by hand from the cited figures and texts; published_comparison.json written by validate.py from a fresh native run.',
            'files_sha256': {name: hashlib.sha256(text.encode()).hexdigest() for name, text in sorted(files.items())}}


def same(a, b):
    if isinstance(a, dict):
        return isinstance(b, dict) and a.keys() == b.keys() and all(same(a[k], b[k]) for k in a)
    if isinstance(a, list):
        return isinstance(b, list) and len(a) == len(b) and all(same(x, y) for x, y in zip(a, b))
    if isinstance(a, float) or isinstance(b, float):
        return abs(a - b) <= 1e-9 * max(1.0, abs(a), abs(b))
    return a == b


def main(mode, export):
    validation, comparison = evidence(load(export))
    text = dump(comparison)
    files = {'published-peaks.json': READING.read_text(), 'published_comparison.json': text}
    if mode == 'generate':
        (HERE / 'VALIDATION.json').write_text(dump(validation))
        (HERE / 'reference-results/published_comparison.json').write_text(text)
        (HERE / 'reference-results/MANIFEST.json').write_text(dump(manifest(files)))
    elif mode == 'check':
        committed = {name: (HERE / 'reference-results' / name).read_text() for name in files}
        assert same(load(HERE / 'VALIDATION.json'), validation), 'VALIDATION.json is not what the fresh run gives'
        assert same(json.loads(committed['published_comparison.json']), comparison), 'published_comparison.json is stale'
        assert load(HERE / 'reference-results/MANIFEST.json') == manifest(committed), 'MANIFEST.json hashes are stale'
    else:
        raise SystemExit('usage: validate.py generate|check <fresh export>')
    failed = [c['name'] for c in validation['checks'] + comparison['checks'] if not c['passed']]
    print(json.dumps({'mode': mode, 'checks': len(validation['checks']), 'comparisonRows': len(comparison['checks']), 'failed': failed}, ensure_ascii=False))
    if failed:
        raise SystemExit(1)


if __name__ == '__main__':
    main(*sys.argv[1:3])
