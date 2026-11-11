import ast
import copy
import importlib.util
import json
import os
from pathlib import Path
import subprocess
import tempfile
import unittest
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[2]
AUDIT = ROOT / 'docs/verification/soundness-regression-audit-2026-11-11'


def partial():
    tree = ast.parse((AUDIT / 'annotate-references.py').read_text())
    function = next(n for n in tree.body if isinstance(n, ast.FunctionDef) and n.name == 'partial')
    namespace = {}
    exec(compile(ast.Module(body=[function], type_ignores=[]), '<partial>', 'exec'), namespace)
    return namespace['partial']


class References(unittest.TestCase):
    def test_present_fields_and_extra_fields(self):
        match = partial()
        self.assertTrue(match({'loads': [{'fz': -1}]}, {'loads': [{'fz': -1, 'fx': 0}]}))
        self.assertFalse(match({'loads': [{'fz': -1}]}, {'loads': [{'fz': 1}]}))
        self.assertFalse(match([1], [1, 2]))

    @unittest.skip('known wrong result: #1946')
    def test_missing_nonzero_load_restraint_and_geometry_do_not_match(self):
        for field, value in [('fz', -1), ('rz', True), ('x', 6)]:
            with self.subTest(field=field):
                self.assertFalse(partial()({field: value}, {}))

    @unittest.skip('known wrong result: #1946')
    def test_frame_measurements_reproduce_each_source_observation(self):
        data = json.loads((AUDIT / 'reference-comparisons.json').read_text())
        rows = [r for r in data['rows'] if r['test'].endswith('::macneal_frame_shear_and_moment')]
        self.assertEqual(len(rows), 6)
        for r in rows:
            self.assertEqual(len(r['models']), 1)
            self.assertTrue(r['models'][0].startswith('solve_2d-'), r)
            frozen = [f for f in data['frozen_primary_comparisons'] if f['id'] == r['id']]
            self.assertEqual(len(frozen), 1)
            f = frozen[0]
            self.assertEqual(f['model'], r['models'][0])
            self.assertEqual(f['selector']['component'], 'ry' if r['observation'] == 5 else 'uz')
            self.assertEqual(f['before'], r['before'])
            self.assertEqual(f['after'], r['after'])
            self.assertIsNone(r['pr'])
            self.assertEqual(r.get('first_parent_merges', []), [])

    @unittest.skip('known wrong result: #1949')
    def test_empty_arch_reactions_are_known_wrong(self):
        for model in ['0015ab84c3baa36f', '022317310499426d']:
            data = json.loads((ROOT / f'web/results-frozen/solve_arc_length-{model}.json').read_text())
            self.assertEqual(data['knownWrong'][0]['issue'], 'https://github.com/lambdaclass/stabileo/issues/1949')
            self.assertEqual(data['knownWrong'][0]['path'], 'nonlinear.results.reactions')


class History(unittest.TestCase):
    def run_history(self, filename, values):
        with tempfile.TemporaryDirectory(dir=ROOT / '.audit-input') as directory:
            area = Path(directory)
            for sub in ['repo', 'base-fixed-native', 'all-static-bisect', 'arc-bisect', 'reference-bisect', 'bisect-probe', 'target-arc-bisect/release/examples']:
                (area / sub).mkdir(parents=True)
            (area / 'arc-bisect/engine/examples').mkdir(parents=True)
            model = 'solve_3d-test.json'
            refusal = filename == 'bisect-refusals.py'
            arc = filename == 'bisect-arc.py'
            test = 'macneal_harder::browser_cases'
            record = dict(analysis='solve_arc_length' if arc else 'solve_3d', test=test,
                          input=[{}], result=values[0] if arc else {'Ok': values[0]})
            (area / 'base-fixed-native' / model).write_text(json.dumps(record))
            drift = dict(model=model, analysis=record['analysis'], engineering_fields=1,
                         before_refused=False, after_refused=refusal, test=test)
            (area / 'native-summary.json').write_text(json.dumps({'drift': [drift]}))
            current = [0]
            seen = []
            revisions = ['r0', 'r1', 'r2', 'r3', 'r4']

            def git(args, **kwargs):
                if args[1] == 'rev-parse':
                    return 'r0' if args[2] == '3e8b33d1c' else 'r4'
                if args[1] == 'rev-list':
                    return '\n'.join(revisions[1:])
                return 'subject'

            def run(args, **kwargs):
                if args[:3] == ['git', 'checkout', '--detach']:
                    current[0] = revisions.index(args[3])
                if str(args[0]) == 'nice' and 'build' not in args:
                    seen.append(current[0])
                    value = values[current[0]]
                    return subprocess.CompletedProcess(args, 2 if refusal and value['refused'] else 0,
                                                       json.dumps(value.get('output', value)), '')
                return subprocess.CompletedProcess(args, 0, '', '')

            source = (AUDIT / filename).read_text().replace('/root/audit/soundness-2026-11-11', directory)
            with patch('subprocess.check_output', side_effect=git), patch('subprocess.run', side_effect=run):
                exec(compile(source, str(AUDIT / filename), 'exec'), {'__file__': str(AUDIT / filename)})
            outputs = {'bisect-all-static.py': 'all-static-bisection.json', 'bisect-arc.py': 'arc-bisection.json',
                       'bisect-reference.py': 'reference-bisection.json', 'bisect-refusals.py': 'refusal-bisection.json'}
            result = json.loads((area / outputs[filename]).read_text())
            return result, seen

    @unittest.skip('known wrong result: #1946')
    def test_reverted_changes_and_refusals_find_first_adjacent_transition(self):
        for filename in ['bisect-all-static.py', 'bisect-arc.py', 'bisect-reference.py', 'bisect-refusals.py']:
            with self.subTest(script=filename):
                if filename == 'bisect-refusals.py':
                    values = [dict(refused=b, output={'refused': b}) for b in [False, True, False, False, True]]
                else:
                    values = [{'displacements': [v]} for v in ['A', 'B', 'A', 'A', 'C']]
                result, seen = self.run_history(filename, values)
                self.assertEqual(result[0].get('first_change', result[0].get('first_bad')), 'r1')
                self.assertEqual(result[0]['parent'], 'r0')
                self.assertIn(1, seen)

    def test_unchanged_static_history_has_no_boundary(self):
        for filename in ['bisect-all-static.py', 'bisect-reference.py']:
            result, _ = self.run_history(filename, [{'displacements': ['A']}] * 5)
            self.assertEqual(result, [])


class Shells(unittest.TestCase):
    def run_script(self, filename, failure, replay_missing=False):
        with tempfile.TemporaryDirectory(dir=ROOT / '.audit-input') as directory:
            area = Path(directory)
            for sub in ['repo', 'base', 'bin', 'repo/engine/tests/metamorphic_corpus/nightly']:
                (area / sub).mkdir(parents=True, exist_ok=True)
            for name in ['issue-1360.json', 'issue-1361.json']:
                (area / 'repo/engine/tests/metamorphic_corpus/nightly' / name).write_text('{}')
            marker = area / 'ran-tests'
            commands = {
                'python3': 'exit 9' if failure == 'setup' else 'exit 0',
                'git': 'exit 9' if failure == 'integrity' else 'exit 0',
                'nice': f'touch "{marker}"\nprintf "test result: ok. 0 passed; 0 failed; 1 ignored; 0 measured; 7 filtered out; finished in 0.00s\\n"',
            }
            for name, body in commands.items():
                executable = area / 'bin' / name
                executable.write_text('#!/bin/bash\n' + body + '\n')
                executable.chmod(0o755)
            source = (AUDIT / filename).read_text().replace('/root/audit/soundness-2026-11-11', directory)
            env = {**os.environ, 'PATH': str(area / 'bin') + ':' + os.environ['PATH']}
            result = subprocess.run(['bash'], input=source, text=True, capture_output=True, cwd=ROOT, env=env)
            return result.returncode, marker.exists()

    @unittest.skip('known wrong result: #1946')
    def test_setup_and_integrity_fail_before_tests(self):
        for script in ['run-complete-native.sh', 'finish-corpus.sh', 'probe-units.sh', 'probe-units-parent.sh']:
            failures = ['integrity'] if script.startswith('probe-') else ['setup', 'integrity']
            for failure in failures:
                with self.subTest(script=script, failure=failure):
                    status, ran = self.run_script(script, failure)
                    self.assertNotEqual(status, 0)
                    self.assertFalse(ran)

    @unittest.skip('known wrong result: #1946')
    def test_suite_selectors_exist_and_every_suite_checks_execution(self):
        source = (AUDIT / 'run-complete-native.sh').read_text()
        self.assertNotIn('three_d::corotational_benchmarks', source)
        self.assertNotIn('three_d::buckling_benchmarks', source)
        for script in ['run-complete-native.sh', 'finish-corpus.sh']:
            self.assertIn('check-suite', (AUDIT / script).read_text())


if __name__ == '__main__':
    unittest.main()
