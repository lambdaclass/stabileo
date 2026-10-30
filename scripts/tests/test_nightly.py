import contextlib
import importlib.util
import io
import json
import os
from pathlib import Path
import runpy
import subprocess
import sys
import tempfile
import textwrap
import unittest
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[2]
spec = importlib.util.spec_from_file_location('models', ROOT / 'scripts/nightly-models.py')
models = importlib.util.module_from_spec(spec)
spec.loader.exec_module(models)


class Models(unittest.TestCase):
    def replay(self, status, wrapped=False, budget=30, harness_exit=1):
        with tempfile.TemporaryDirectory() as tmp:
            base = Path(tmp)
            model = {'nodes': {}, 'elements': {'needed': {}, 'extra': {}}, 'loads': [1, 2]}
            if wrapped:
                model = {'analysis': 'modal', 'numModes': 3, 'model': model}
            source = base / 'input.json'
            source.write_text(json.dumps(model))
            out = base / 'out'
            evaluated = []

            def fake_run(cmd, **kwargs):
                if '-c' in cmd:
                    return subprocess.CompletedProcess(cmd, 0)
                if '--report' in cmd:
                    candidate = json.loads(Path(cmd[2]).read_text())
                    evaluated.append(candidate)
                    d = models.structural_model(candidate)
                    result = status if 'needed' in d['elements'] and 1 in d['loads'] else 'refused'
                    row = {'status': result}
                    if status == 'mismatch':
                        row.update(status='mismatch', analysis='modal' if wrapped else 'static',
                                   max_err={'disp': len(d['loads']) * .01}, kappa=len(d['elements']) * 100,
                                   tol=1e-6, worst=[['disp' if result == status else 'reac',
                                                     len(d['elements']), 'ux', .1, .2, len(d['loads']) * .01]])
                    Path(cmd[-1]).write_text(json.dumps([row]))
                    return subprocess.CompletedProcess(cmd, harness_exit, '', '')
                if status == 'false_reject':
                    return subprocess.CompletedProcess(cmd, 1, '{"error":"rejected"}', '')
                return subprocess.CompletedProcess(cmd, 0, '{}', '')

            argv = ['nightly-models', '--model', str(source), '--check', 'opensees', '--seed', '42',
                    '--out', str(out), '--reduce-seconds', str(budget)]
            with patch.object(sys, 'argv', argv), patch.object(models, 'run', side_effect=fake_run), \
                    patch.dict(os.environ, {'ASTER_PYTHON': ''}), contextlib.redirect_stdout(io.StringIO()):
                if status in {'harness_error', 'opensees_failed', 'aster_failed', 'unknown'} or harness_exit == 2:
                    with self.assertRaisesRegex(RuntimeError, 'harness'):
                        models.main()
                    self.assertEqual(list(out.glob('*.finding.json')), [])
                    summary = json.loads((out / 'summary.json').read_text())
                    self.assertEqual(summary['comparisons']['opensees']['completed'], 0)
                    return
                if status in {'unsupported', 'ill_conditioned', 'ok'}:
                    self.assertEqual(models.main(), 0)
                    counts = json.loads((out / 'summary.json').read_text())['comparisons']['opensees']
                    category = {'unsupported': 'skipped', 'ill_conditioned': 'inconclusive', 'ok': 'completed'}[status]
                    self.assertEqual(counts[category] if category == 'completed' else len(counts[category]), 1)
                    if category != 'completed':
                        self.assertEqual(counts['completed'], 0)
                    return
                self.assertEqual(models.main(), 1)
            records = list(out.glob('*.finding.json'))
            self.assertEqual(len(records), 1)
            finding = json.loads(records[0].read_text())
            self.assertEqual(finding['test'], f'opensees/{status}')
            self.assertEqual(finding['seed'], 42)
            self.assertEqual(json.loads(source.read_text()), model)
            if budget == 0:
                self.assertEqual(finding['model'], model)
                self.assertIn('budget-limited', finding['reduction'])
            else:
                self.assertEqual(models.structural_model(finding['model']),
                                 {'nodes': {}, 'elements': {'needed': {}}, 'loads': [1]})
                self.assertIn('1-minimal', finding['reduction'])
                self.assertGreater(len(evaluated), 1)
                if wrapped:
                    self.assertTrue(all(c['analysis'] == 'modal' and c['numModes'] == 3 for c in evaluated))

    def test_mismatch_reduces_plain_and_wrapped_models(self):
        for wrapped in (False, True):
            with self.subTest(wrapped=wrapped):
                self.replay('mismatch', wrapped)

    def test_false_rejection_reduces_despite_solver_rejection(self):
        for wrapped in (False, True):
            with self.subTest(wrapped=wrapped):
                self.replay('false_reject', wrapped)

    def test_harness_errors_are_not_findings(self):
        for status in ('harness_error', 'opensees_failed', 'aster_failed', 'unknown'):
            self.replay(status)
        self.replay('mismatch', harness_exit=2)

    def test_reference_coverage_separates_skipped_and_inconclusive(self):
        for status in ('unsupported', 'ill_conditioned', 'ok'):
            self.replay(status)

    def test_budget_does_not_claim_minimality(self):
        self.replay('mismatch', budget=0)

    def test_metamorphic_signature_ignores_numeric_details_but_preserves_check(self):
        def failure(message):
            return {'test': 'metamorphic/static/rotation', 'details': [message]}
        a = failure('case-42: displacement error 0.002 exceeds tolerance 1e-6')
        b = failure('case-9: displacement error 0.001 exceeds tolerance 2e-6')
        c = failure('case-9: reaction error 0.001 exceeds tolerance 2e-6')
        self.assertEqual(models.failure_signature(a), models.failure_signature(b))
        self.assertNotEqual(models.failure_signature(a), models.failure_signature(c))

    def test_metamorphic_reduction_preserves_violation_and_admissibility(self):
        with tempfile.TemporaryDirectory() as tmp:
            base = Path(tmp)
            source = base / 'model.json'
            source.write_text(json.dumps({'loads': [1, 2], 'elements': {'needed': {}, 'extra': {}}}))
            out = base / 'out'
            evaluated = []
            def replay(cmd, **kwargs):
                if '-c' in cmd:
                    return subprocess.CompletedProcess(cmd, 1)
                if 'input' in kwargs:
                    model = json.loads(kwargs['input'])
                    return subprocess.CompletedProcess(cmd, 0 if 'needed' in model['elements'] else 1, '{}', '')
                model = json.loads(Path(kwargs['env']['NIGHTLY_MODEL']).read_text())
                evaluated.append(model)
                quantity = 'displacement' if 1 in model['loads'] else 'reaction'
                failure = {'test': 'metamorphic/static/rotation',
                           'details': [f"replay: {quantity} error {len(model['loads']) * .01} exceeds tolerance 1e-6"]}
                row = dict.fromkeys(['pass', 'fail', 'refused', 'inconclusive', 'unrepresentable', 'not_applicable'], 0)
                row['fail'] = 1
                Path(kwargs['env']['NIGHTLY_RESULTS']).write_text(json.dumps({'failures': [failure], 'verdicts': [row]}))
                return subprocess.CompletedProcess(cmd, 101, '', '')
            with patch.object(sys, 'argv', ['nightly', '--model', str(source), '--check', 'metamorphic', '--out', str(out)]), \
                    patch.dict(os.environ, {'NIGHTLY_REPLAY_BIN': 'replay', 'ASTER_PYTHON': ''}), \
                    patch.object(models, 'run', side_effect=replay), contextlib.redirect_stdout(io.StringIO()):
                self.assertEqual(models.main(), 1)
            finding = json.loads(next(out.glob('*.finding.json')).read_text())
            self.assertEqual(finding['model'], {'loads': [1], 'elements': {'needed': {}}})
            self.assertTrue(all('needed' in model['elements'] for model in evaluated))

    def test_metamorphic_coverage_requires_usable_verdicts(self):
        for verdict in ('pass', 'refused', 'inconclusive', 'unrepresentable', 'not_applicable'):
            with self.subTest(verdict=verdict), tempfile.TemporaryDirectory() as tmp:
                base = Path(tmp)
                source = base / 'model.json'
                source.write_text('{}')
                out = base / 'out'
                row = dict.fromkeys(['pass', 'fail', 'refused', 'inconclusive', 'unrepresentable', 'not_applicable'], 0)
                row[verdict] = 3
                row.update(analysis='static', invariant='rotation')
                def replay(cmd, **kwargs):
                    if '-c' in cmd:
                        return subprocess.CompletedProcess(cmd, 1)
                    Path(kwargs['env']['NIGHTLY_RESULTS']).write_text(json.dumps({'failures': [], 'verdicts': [row]}))
                    return subprocess.CompletedProcess(cmd, 0, '', '')
                with patch.object(sys, 'argv', ['nightly', '--model', str(source), '--check', 'metamorphic', '--out', str(out)]), \
                        patch.dict(os.environ, {'NIGHTLY_REPLAY_BIN': 'replay', 'ASTER_PYTHON': ''}), \
                        patch.object(models, 'run', side_effect=replay), contextlib.redirect_stdout(io.StringIO()):
                    if verdict == 'pass':
                        self.assertEqual(models.main(), 0)
                    else:
                        with self.assertRaisesRegex(RuntimeError, 'insufficient metamorphic coverage'):
                            models.main()
                counts = json.loads((out / 'summary.json').read_text())['comparisons']['metamorphic']
                self.assertEqual(counts['completed'], 3 if verdict == 'pass' else 0)
                category = 'inconclusive' if verdict in ('refused', 'inconclusive') else 'skipped'
                if verdict != 'pass':
                    self.assertEqual(counts[category][0][verdict], 3)


class Artifacts(unittest.TestCase):
    def test_fuzz_bytes_and_replay_survive_json_whitespace_selectors(self):
        for raw in (b'\t\t{"nodes":{}}', b'\xff\x00bad'):
            for minimized in (False, True):
                with self.subTest(raw=raw, minimized=minimized), tempfile.TemporaryDirectory() as tmp:
                    base = Path(tmp)
                    crashes = base / 'engine/fuzz/artifacts/solve'
                    crashes.mkdir(parents=True)
                    (crashes / 'crash-original').write_bytes(raw)
                    (base / 'nightly-findings').mkdir()

                    def tmin(cmd, **kwargs):
                        if minimized:
                            Path(cmd[-1].split('=', 1)[1]).write_bytes(raw)
                        else:
                            raise subprocess.CalledProcessError(1, cmd)

                    with contextlib.chdir(base), patch.dict(os.environ, {
                        'FUZZ_TARGET': 'solve', 'FUZZ_SEED': '42', 'FUZZ_TARGET_TRIPLE': 'x86_64-unknown-linux-gnu'
                    }), patch('subprocess.run', side_effect=tmin):
                        runpy.run_path(str(ROOT / 'scripts/nightly-fuzz-findings.py'))
                    records = list((base / 'nightly-findings').glob('*.finding.json'))
                    self.assertEqual(len(records), 1)
                    f = json.loads(records[0].read_text())
                    self.assertEqual(bytes.fromhex(f['model']['raw_hex']), raw)
                    (base / 'model.json').write_text(json.dumps(f['model']))
                    subprocess.run(['bash', '-e', '-c', f['command'].splitlines()[0]], cwd=base, check=True)
                    self.assertEqual((base / 'crash.bin').read_bytes(), raw)
                    self.assertEqual((crashes / 'crash-original').read_bytes(), raw)

    def test_collector_continues_after_finding_and_harness_error(self):
        with tempfile.TemporaryDirectory() as tmp:
            for name in ('a', 'b', 'c'):
                (Path(tmp) / f'{name}.json').write_text('{}')
            results = [subprocess.CompletedProcess([], code) for code in (1, 2, 0, 1, 2, 0)]
            with patch.object(sys, 'argv', ['collect', '--models', tmp, '--check', 'opensees', '--seed', '42', '--out', str(Path(tmp) / 'out')]), \
                    patch('subprocess.run', side_effect=results) as run:
                with self.assertRaises(SystemExit) as exc:
                    runpy.run_path(str(ROOT / 'scripts/nightly-collect.py'), run_name='__main__')
                self.assertEqual(exc.exception.code, 1)
                self.assertEqual(run.call_count, 6)
                self.assertEqual([Path(c.args[0][3]).name for c in run.call_args_list], ['a.json', 'b.json', 'c.json'] * 2)

    def test_every_original_is_reportable_when_reduction_is_interrupted(self):
        with tempfile.TemporaryDirectory() as tmp:
            base = Path(tmp)
            out = base / 'out'
            originals = [{'nodes': {}, 'loads': [i]} for i in range(3)]
            for i, model in enumerate(originals):
                (base / f'{i}.json').write_text(json.dumps(model))
            budgets = []

            def replay(cmd, **kwargs):
                budgets.append(kwargs['timeout'])
                records = list(out.rglob('*.finding.json'))
                self.assertEqual(len(records), 3)
                if cmd[-1] == '120':
                    raise subprocess.TimeoutExpired(cmd, kwargs['timeout'])
                destination = Path(cmd[cmd.index('--out') + 1])
                record = json.loads((destination / 'original.finding.json').read_text())
                record['test'] = 'opensees/mismatch'
                (destination / 'replayed.finding.json').write_text(json.dumps(record))
                return subprocess.CompletedProcess(cmd, 1)

            with patch.object(sys, 'argv', ['collect', '--models', tmp, '--check', 'opensees',
                                           '--seed', '42', '--out', str(out)]), \
                    patch('subprocess.run', side_effect=replay):
                with self.assertRaises(SystemExit) as exc:
                    runpy.run_path(str(ROOT / 'scripts/nightly-collect.py'), run_name='__main__')
            self.assertEqual(exc.exception.code, 1)
            records = [json.loads(p.read_text()) for p in out.rglob('*.finding.json')]
            self.assertCountEqual([r['model'] for r in records], originals)
            self.assertTrue(all(r['test'] and r['command'] and r['seed'] for r in records))
            self.assertTrue(all(r['test'] == 'opensees/mismatch' for r in records))
            self.assertEqual(len(budgets), 4)
            self.assertEqual(budgets, sorted(budgets, reverse=True))

    def test_codeaster_null_pivot_dump_reaches_collector(self):
        with tempfile.TemporaryDirectory() as tmp:
            base = Path(tmp)
            spec = importlib.util.spec_from_file_location('aster_run', ROOT / 'tools/differential/codeaster/run.py')
            adapter = importlib.util.module_from_spec(spec)
            with patch.object(sys, 'path', list(sys.path)):
                spec.loader.exec_module(adapter)
            model = {'nodes': {'n': {'x': 0, 'y': 0, 'z': 0}}, 'elements': {}, 'loads': []}
            (base / 'error.txt').write_text('<FACTOR_11> null pivot')
            dumps = base / 'dumps'
            result = adapter.finish({'name': 'singular', 'job': str(base), 'sres': {}, 'meta': {}},
                                    1e-6, str(dumps), model)
            self.assertEqual(result['status'], 'silent_singular')
            self.assertEqual(json.loads((dumps / 'singular.json').read_text()), model)
            out = base / 'out'
            with patch.object(sys, 'argv', ['collect', '--models', str(dumps), '--check', 'codeaster',
                                           '--seed', '42', '--out', str(out)]), \
                    patch('subprocess.run', side_effect=subprocess.TimeoutExpired('replay', 1)):
                with self.assertRaises(SystemExit):
                    runpy.run_path(str(ROOT / 'scripts/nightly-collect.py'), run_name='__main__')
            record = json.loads(next(out.rglob('*.finding.json')).read_text())
            self.assertEqual(record['model'], model)
            self.assertEqual(record['test'], 'codeaster/dumped_failure')


class Workflow(unittest.TestCase):
    def test_property_pipeline_propagates_failure_and_timeout(self):
        workflow = (ROOT / '.github/workflows/nightly.yml').read_text()
        step = workflow.split('      - name: Property soak', 1)[1].split('      - uses:', 1)[0]
        self.assertIn('shell: bash', step)
        script = textwrap.dedent(step.split('        run: |\n', 1)[1])
        with tempfile.TemporaryDirectory() as tmp:
            base = Path(tmp)
            timeout = base / 'timeout'
            timeout.write_text(f'#!{sys.executable}\nimport subprocess, sys\ntry:\n p = subprocess.run(sys.argv[4:], timeout=float(sys.argv[3]))\n sys.exit(p.returncode)\nexcept subprocess.TimeoutExpired:\n sys.exit(124)\n')
            timeout.chmod(0o755)
            cargo = base / 'cargo'
            for body, expected in [('exit 17', 17), ('exec sleep 5', 124), ('echo passed', 0)]:
                cargo.write_text('#!/bin/bash\n' + body + '\n')
                cargo.chmod(0o755)
                result = subprocess.run(['bash', '--noprofile', '--norc', '-eo', 'pipefail', '-c', script],
                                        cwd=base, env=dict(os.environ, PATH=f'{base}:{os.environ["PATH"]}', BUDGET='0.2' if expected == 124 else '5'),
                                        capture_output=True, text=True)
                self.assertEqual(result.returncode, expected, result.stderr)
                self.assertTrue((base / 'property-report/output.txt').exists())

    def test_raw_artifact_upload_and_immutable_action(self):
        workflow = (ROOT / '.github/workflows/nightly.yml').read_text()
        step = workflow.split('      - name: Retain original fuzz crashes\n', 1)[1].split('      - name:', 1)[0]
        self.assertIn('if: failure()', step)
        self.assertIn('path: engine/fuzz/artifacts/${{ matrix.target }}/', step)
        self.assertRegex(workflow, r'mamba-org/setup-micromamba@[0-9a-f]{40}\b')
        ci = (ROOT / '.github/workflows/ci.yml').read_text().split('            ci_scripts:\n', 1)[1].split('\n\n', 1)[0]
        for path in ('scripts/nightly-*.py', '.github/workflows/nightly.yml', 'scripts/tests/**', '.github/scripts/**'):
            self.assertIn(f"- '{path}'", ci)


if __name__ == '__main__':
    unittest.main()
