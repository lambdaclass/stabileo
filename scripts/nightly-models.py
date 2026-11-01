#!/usr/bin/env python3
"""Generate, check and reduce nightly models; requires prebuilt release binaries."""
import argparse
import copy
import datetime
import hashlib
import json
import os
import re
from pathlib import Path
import subprocess
import sys
import tempfile
import time

ROOT = Path(__file__).resolve().parents[1]


def canonical(model):
    return json.dumps(model, sort_keys=True, separators=(',', ':'), allow_nan=False)


def run(cmd, **kwargs):
    return subprocess.run(cmd, capture_output=True, text=True, timeout=180, **kwargs)


def structural_model(model):
    return model['model'] if 'analysis' in model and 'model' in model else model


def failure_signature(failure):
    details = failure['details']
    if isinstance(details, dict) and details.get('worst'):
        causes = {(w[0], re.sub(r'step\d+', 'step#', str(w[2]))) for w in details['worst']}
        return failure['test'], details.get('analysis', 'static'), tuple(sorted(causes))
    messages = details if isinstance(details, (list, str)) else (
        details.get('why') or [details.get('message') or details.get('status')])
    if isinstance(messages, str):
        messages = [messages]
    def normalize(message):
        if failure['test'].startswith('metamorphic/'):
            message = message.split(': ', 1)[-1]
        return re.sub(r'[-+]?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?', '#', message)
    return failure['test'], tuple(sorted(set(normalize(m) for m in messages)))


def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument('--count', type=int, default=1000)
    p.add_argument('--seed', type=int, default=int(datetime.datetime.now(datetime.timezone.utc).strftime('%Y%m%d')))
    p.add_argument('--seconds', type=int, default=7200)
    p.add_argument('--reduce-seconds', type=int, default=300)
    p.add_argument('--out', type=Path, default=Path('nightly-findings'))
    p.add_argument('--model', type=Path)
    p.add_argument('--check', choices=['metamorphic', 'opensees', 'codeaster'])
    a = p.parse_args()
    if a.count < 1 or a.seconds < 1:
        p.error('count and seconds must be positive')
    a.out.mkdir(parents=True, exist_ok=True)
    (a.out / 'seed.txt').write_text(str(a.seed) + '\n')
    print(f'NIGHTLY_SEED={a.seed} count={a.count}', flush=True)
    target = Path(os.environ.get('CARGO_TARGET_DIR', ROOT / 'target')).resolve()
    binary = str(target / 'release/examples/solve_json')
    # cargo emits the precise executable path; never pick stale hashed binaries.
    meta = json.loads((a.out / 'build.json').read_text()) if (a.out / 'build.json').exists() else None
    replay = os.environ.get('NIGHTLY_REPLAY_BIN') or (meta and meta['executable'])
    if not replay and a.check not in ('opensees', 'codeaster'):
        raise RuntimeError('set NIGHTLY_REPLAY_BIN to the metamorphic test executable')
    checks = ['metamorphic']
    if run([sys.executable, '-c', 'import openseespy.opensees']).returncode == 0:
        checks.append('opensees')
    if os.environ.get('ASTER_PYTHON'):
        probe = run([os.environ['ASTER_PYTHON'], '-c', 'import code_aster'])
        if probe.returncode:
            raise RuntimeError('configured ASTER_PYTHON cannot import code_aster')
        checks.append('codeaster')
    if a.check:
        if a.check not in checks:
            raise RuntimeError(f'{a.check} is not installed')
        checks = [a.check]
    print('Checks:', checks, '; skipped:', sorted(set(['opensees', 'codeaster']) - set(checks)), flush=True)
    summary = {'seed': a.seed, 'requested': a.count, 'valid': 0, 'rejected': 0, 'findings': 0, 'checks': checks,
               'comparisons': {c: {'completed': 0, 'skipped': [], 'inconclusive': [], 'errors': []} for c in checks}}
    deadline = time.monotonic() + a.seconds
    with tempfile.TemporaryDirectory() as tmp:
        model_path, result_path = Path(tmp) / 'model.json', Path(tmp) / 'result.json'

        def evaluate(model, check, seed, record=False):
            model_path.write_text(canonical(model))
            result_path.unlink(missing_ok=True)
            if check == 'metamorphic':
                env = dict(os.environ, NIGHTLY_MODEL=str(model_path), NIGHTLY_RESULTS=str(result_path), METAMORPHIC_SEED=str(seed))
                proc = run([replay, '--ignored', '--exact', 'metamorphic_replay', '--nocapture'], env=env)
                if not result_path.exists():
                    raise RuntimeError(f'invariance harness failed: {proc.stdout}\n{proc.stderr}')
                result = json.loads(result_path.read_text())
                if proc.returncode not in (0, 101) or not isinstance(result, dict):
                    raise RuntimeError('invariance harness returned invalid outcomes')
                if proc.returncode != (101 if result['failures'] else 0):
                    raise RuntimeError('invariance harness exit disagrees with outcomes')
                verdicts = result['verdicts']
                completed = sum(row['pass'] + row['fail'] for row in verdicts)
                if record:
                    counts = summary['comparisons'][check]
                    counts['completed'] += completed
                    counts['covered_models'] = counts.get('covered_models', 0) + int(completed > 0)
                    for row in verdicts:
                        if row['refused'] or row['inconclusive']:
                            counts['inconclusive'].append(dict(row, seed=seed))
                        if row['unrepresentable'] or row['not_applicable']:
                            counts['skipped'].append(dict(row, seed=seed))
                return result['failures']
            script = 'tools/opensees/compare.py' if check == 'opensees' else 'tools/differential/codeaster/run.py'
            proc = run([sys.executable, str(ROOT / script), str(model_path), '--bin', binary, '-j', '1', '--report', str(result_path)])
            if proc.returncode not in (0, 1) or not result_path.exists():
                raise RuntimeError(f'{check} harness failed: {proc.stdout}\n{proc.stderr}')
            rows = json.loads(result_path.read_text())
            bad = {'mismatch', 'false_reject', 'false_warning', 'silent_singular'}
            if not rows:
                raise RuntimeError(f'{check} harness returned no outcomes')
            for row in rows:
                status = row['status']
                if status in bad or status == 'ok':
                    category = 'completed'
                elif status in {'unsupported', 'not_applicable', 'unloaded'}:
                    category = 'skipped'
                elif status in {'ill_conditioned', 'near_singular', 'unstable', 'stabileo_failed', 'refused'}:
                    category = 'inconclusive'
                else:
                    category = 'errors'
                if record:
                    counts = summary['comparisons'][check]
                    if category == 'completed':
                        counts[category] += 1
                    else:
                        counts[category].append(dict(row, seed=seed))
                if category == 'errors':
                    raise RuntimeError(f'{check} harness error: {rows}')
            return [{'test': f'{check}/{r["status"]}', 'details': r} for r in rows if r['status'] in bad]

        def valid(model):
            result = run([binary], input=canonical(structural_model(model)))
            return result.returncode == 0 and 'error' not in json.loads(result.stdout)

        def reduce(model, check, seed, failure):
            end = min(deadline, time.monotonic() + a.reduce_seconds)
            changed = True
            while changed:
                changed = False
                for field in ('loads', 'elements'):
                    values = structural_model(model).get(field, [])
                    for key in list(range(len(values))) if isinstance(values, list) else list(values):
                        if time.monotonic() >= end:
                            return model, 'budget-limited reduction'
                        candidate = copy.deepcopy(model)
                        if isinstance(values, list):
                            structural_model(candidate)[field].pop(key)
                        else:
                            del structural_model(candidate)[field][key]
                        try:
                            admissible = check != 'metamorphic' or valid(candidate)
                            reproduces = admissible and any(failure_signature(f) == failure_signature(failure) for f in evaluate(candidate, check, seed))
                        except subprocess.TimeoutExpired:
                            return model, 'budget-limited reduction (candidate timed out)'
                        if reproduces:
                            model, changed = candidate, True
                            break
                    if changed:
                        break
            return model, '1-minimal under load/member deletion (admissibility and failure preserved)'

        try:
            attempts = 1 if a.model else a.count * 10
            for i in range(attempts):
                if time.monotonic() >= deadline:
                    raise RuntimeError('generation/check budget expired before requested count completed')
                seed = a.seed if a.model else a.seed * 100000 + i
                dim = '2d' if i % 2 == 0 else '3d'
                model = json.loads(a.model.read_text()) if a.model else json.loads(run([binary, '--gen' + dim, str(seed)], check=True).stdout)
                if not a.model and not valid(model):
                    summary['rejected'] += 1
                    continue
                summary['valid'] += 1
                for check in checks:
                    # Code_Aster adapter implements 3D only.
                    if check == 'codeaster' and not any('y' in n and 'z' in n for n in model['nodes'].values()):
                        summary['comparisons'][check]['skipped'].append({'seed': seed, 'status': 'unsupported_2d'})
                        continue
                    failures = evaluate(model, check, seed, record=True)
                    pending = []
                    # Persist every failure before reduction, so a timeout cannot
                    # erase siblings. Replace each record atomically as it shrinks.
                    for failure in failures:
                        key = hashlib.sha256((failure['test'] + '\n' + canonical(model)).encode()).hexdigest()
                        command = f'python3 scripts/nightly-models.py --model model.json --seed {seed} --check {check} --count 1'
                        record = dict(failure, seed=seed, original_model_hash=hashlib.sha256(canonical(model).encode()).hexdigest(), model=model, reduction='not reduced yet (job may have timed out)', command=command)
                        path = a.out / f'{key}.finding.json'
                        path.write_text(json.dumps(record, indent=2))
                        pending.append((failure, record, path))
                        summary['findings'] += 1
                    for failure, record, path in pending:
                        minimal, reduction = reduce(model, check, seed, failure)
                        record.update(model=minimal, reduction=reduction)
                        temporary = path.with_suffix('.tmp')
                        temporary.write_text(json.dumps(record, indent=2))
                        temporary.replace(path)
                        print(f'Finding {failure["test"]}: {path.name}', flush=True)
                if a.model or summary['valid'] == a.count:
                    break
            else:
                raise RuntimeError('too many rejected models; requested valid-model count not reached')
            if 'metamorphic' in checks and summary['comparisons']['metamorphic'].get('covered_models', 0) < summary['valid']:
                raise RuntimeError('insufficient metamorphic coverage: each model requires a usable invariant')
        finally:
            (a.out / 'summary.json').write_text(json.dumps(summary, indent=2))
            print(json.dumps(summary), flush=True)
    return int(summary['findings'] > 0)


if __name__ == '__main__':
    sys.exit(main())
