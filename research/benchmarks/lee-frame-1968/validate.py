import hashlib
import json
import math
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[2]
sys.path.insert(0, str(ROOT / 'research/tools'))
from compare_evidence import differences

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
    drift = abs(peak['load'] - regression['firstLimitLoad']) if peak else None
    checks.append({'name': 'Regression: first sampled peak, 20 elements', 'metric': 'absolute difference (kN)',
                   'observed': drift, 'tolerance': regression['absoluteTolerance'],
                   'passed': peak is not None and drift < regression['absoluteTolerance'] and peak['step'] == regression['firstPeakStep']})
    study = fresh['study']
    def settings(rows):
        return sorted((r['split'], r['stepScale']) for r in rows)
    if settings(study) != settings(case['convergence']['cases']) or not all(math.isfinite(m['firstPeak']) for m in study):
        raise ValueError('Incomplete native refinement study')
    for split in (1, 2, 4):
        scales = [r['stepScale'] for r in study if r['split'] == split]
        if len(set(scales)) != len(scales) or len(scales) < 2:
            raise ValueError('Expected distinct refinement step scales per mesh')
    common = set.intersection(*({r['stepScale'] for r in study if r['split'] == split and r['stepScale'] > 0} for split in (1, 2, 4)))
    if not common:
        raise ValueError('Mesh refinement requires a common positive step scale')
    scale = min(common)
    finest = {}
    for split in (1, 2, 4):
        values = [c['firstPeak'] for c in study if c['split'] == split]
        spread = max(values) - min(values)
        checks.append({'name': f'{20 * split} elements: smaller arc-length steps move the first peak', 'metric': 'largest change (kN)',
                       'observed': spread, 'tolerance': case['convergence']['stepEffectBound'], 'passed': spread < case['convergence']['stepEffectBound']})
        finest[split] = next(c['firstPeak'] for c in study if c['split'] == split and c['stepScale'] == scale)
    p20, p40, p80 = finest[1], finest[2], finest[4]
    ratio = (p20 - p40) / (p40 - p80) if p20 > p40 > p80 else None
    ratio_error = abs(ratio - 4) if ratio is not None else None
    checks.append({'name': 'Mesh refinement: ratio of successive changes (4 for second order)', 'metric': 'absolute difference from 4',
                   'observed': ratio_error, 'tolerance': 1, 'passed': ratio_error is not None and ratio_error < 1})
    extrapolated = p80 + (p80 - p40) / (ratio - 1) if ratio is not None and ratio > 1 else None
    stored = load(HERE / 'results/stabileo_results.json')['frames']
    node_ids = {n['id'] for n in case['input']['solver']['nodes'].values()}
    if len(stored) != steps or len(frames) != steps:
        raise ValueError('Incomplete native path')
    drift = 0
    for step, (a, b) in enumerate(zip(stored, frames), 1):
        fields = []
        for frame in (a, b):
            ds = frame['displacement']
            field = {d['nodeId']: d for d in ds}
            if frame['step'] != step or len(ds) != len(node_ids) or field.keys() != node_ids:
                raise ValueError(f'Wrong step or displacement node IDs at step {step}')
            if not math.isfinite(frame['load']) or not all(math.isfinite(d[k]) for d in ds for k in ('ux', 'uz', 'ry')):
                raise ValueError(f'Nonfinite result at step {step}')
            fields.append(field)
        drift = max(drift, abs(a['load'] - b['load']),
                    *(abs(fields[0][i][k] - fields[1][i][k]) for i in node_ids for k in ('ux', 'uz', 'ry')))
    checks.append({'name': 'The page replay is a fresh native run', 'metric': 'largest absolute difference in load (kN), translation (m) and rotation (rad)',
                   'observed': drift, 'tolerance': 1e-9, 'passed': drift <= 1e-9})
    reading = load(READING)
    if sorted(row['id'] for row in reading['rows']) != ['fig10-elements20', 'fig10-extrapolated', 'galvao-extrapolated']:
        raise ValueError('Expected the three distinct published peak comparisons')
    computed = {'elements20': peak['load'] if peak else None, 'elements80': p80, 'extrapolated': extrapolated}
    labels = {'elements20': 'First peak load, 20 elements', 'elements80': 'First peak load, 80 elements',
              'extrapolated': 'First peak load, extrapolated to zero element length'}
    rows = []
    for entry in reading['rows']:
        expected = 'elements20' if entry['id'] == 'fig10-elements20' else 'extrapolated'
        if entry['computed'] != expected:
            raise ValueError(f"Wrong result selector for {entry['id']}")
        value = computed[expected]
        observed = abs(value - entry['reference']) if value is not None else None
        row = {'id': entry['id'], 'name': f'{labels[entry["computed"]]} against {entry["label"]}', 'source': entry['source'], 'unit': 'kN',
               'reference': entry['reference'], 'computed': value, 'metric': 'absolute difference',
               'observed': observed, 'tolerance': entry['uncertainty'], 'passed': observed is not None and observed <= entry['uncertainty']}
        rows.append(row)
        checks.append({k: row[k] for k in ('name', 'metric', 'reference', 'computed', 'observed', 'tolerance', 'passed')})
    return {'command': COMMAND, 'case': 'engine/tests/benchmarks/lee_frame.json', 'checks': checks}, {'checks': rows}


def dump(value):
    return json.dumps(value, indent=2, ensure_ascii=False) + '\n'


def manifest(files):
    return {'method': 'published-peaks.json transcribed by hand from the cited figures and texts; published_comparison.json written by validate.py from a fresh native run.',
            'files_sha256': {name: hashlib.sha256(text.encode()).hexdigest() for name, text in sorted(files.items())}}


def same(committed, fresh):
    return not differences(committed, fresh)


USAGE = 'usage: validate.py generate|check <fresh export>'


def main(mode, export):
    if mode not in ('generate', 'check'):
        raise SystemExit(USAGE)
    validation, comparison = evidence({**load(export), 'study': load(str(export) + '.study.json')})
    failed = [c['name'] for c in validation['checks'] + comparison['checks'] if not c['passed']]
    if failed:
        raise SystemExit('failed checks: ' + ', '.join(failed))
    text = dump(comparison)
    files = {'published-peaks.json': READING.read_text(), 'published_comparison.json': text}
    if mode == 'generate':
        (HERE / 'VALIDATION.json').write_text(dump(validation))
        (HERE / 'reference-results/published_comparison.json').write_text(text)
        (HERE / 'reference-results/MANIFEST.json').write_text(dump(manifest(files)))
    else:
        committed = {name: (HERE / 'reference-results' / name).read_text() for name in files}
        if not same(load(HERE / 'VALIDATION.json'), validation):
            raise ValueError('VALIDATION.json is not what the fresh run gives')
        if not same(json.loads(committed['published_comparison.json']), comparison):
            raise ValueError('published_comparison.json is stale')
        if load(HERE / 'reference-results/MANIFEST.json') != manifest(committed):
            raise ValueError('MANIFEST.json hashes are stale')
    print(json.dumps({'mode': mode, 'checks': len(validation['checks']), 'comparisonRows': len(comparison['checks']), 'failed': failed}, ensure_ascii=False))


if __name__ == '__main__':
    if len(sys.argv) != 3:
        raise SystemExit(USAGE)
    main(*sys.argv[1:3])
