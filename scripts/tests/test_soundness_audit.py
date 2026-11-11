import ast
import json
import os
from pathlib import Path
import subprocess
import tempfile
import unittest
from unittest.mock import patch
import sys
sys.path.insert(0, str(Path(__file__).resolve().parents[2] / 'docs/verification/soundness-regression-audit-2026-11-11'))

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

    def test_missing_nonzero_load_restraint_and_geometry_do_not_match(self):
        for field, value in [('fz', -1), ('rz', True), ('x', 6)]:
            with self.subTest(field=field):
                self.assertFalse(partial()({field: value}, {}))

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

    def test_reference_categories_distinguish_consistency_controls_and_accuracy(self):
        import importlib.util
        spec = importlib.util.spec_from_file_location('annotation', AUDIT / 'annotate-references.py')
        annotation = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(annotation)
        with tempfile.TemporaryDirectory(dir=ROOT) as directory:
            area = Path(directory)
            (area / 'base/engine/tests/benchmarks').mkdir(parents=True)
            (area / 'base/engine/tests/benchmarks/macneal_harder.json').write_text('{"cases": []}')
            data = json.loads((AUDIT / 'reference-comparisons.json').read_text())
            selected = [r for r in data['rows'] if any(n in r['test'] for n in
                        ['mattiasson_load_step_independence', 'signed_response_checks_reject_reversals', 'mattiasson_10'])]
            self.assertTrue(selected)
            (area / 'reference-comparisons.json').write_text(json.dumps({'rows': selected}))
            annotation.main(area)
            regenerated = json.loads((area / 'reference-comparisons.json').read_text())
            self.assertEqual(regenerated['coverage_counts'], {'checker_control': 10, 'engineering_reference': 6, 'self_consistency': 4})
            stale = json.loads(json.dumps(selected))
            for row in stale:
                row['category'] = 'engineering_reference'
                row['reference_kind'] = 'source formula or published target'
            (area / 'reference-comparisons.json').write_text(json.dumps({'rows': stale}))
            source = (AUDIT / 'frozen-references.py').read_text()
            with patch.object(sys, 'argv', ['frozen-references.py', directory]):
                exec(compile(source, str(AUDIT / 'frozen-references.py'), 'exec'), {'__file__': str(AUDIT / 'frozen-references.py')})
            frozen = json.loads((area / 'reference-comparisons.json').read_text())
            self.assertEqual(frozen['coverage_counts'], regenerated['coverage_counts'])
            self.assertEqual(frozen['frozen_primary_comparisons'], [])
            for rows in [selected, regenerated['rows'], frozen['rows']]:
                for row in rows:
                    if 'load_step_independence' in row['test']:
                        self.assertEqual(row['category'], 'self_consistency')
                        self.assertEqual(row['reference_kind'], 'load-step consistency/self-convergence')
                        self.assertIsNone(row['pr'])
                    elif 'signed_response_checks' in row['test']:
                        self.assertEqual(row['category'], 'checker_control')
                        self.assertEqual(row['reference_kind'], 'synthetic signed-response checker control')
                        self.assertIsNone(row['pr'])
                    else:
                        self.assertEqual(row['category'], 'engineering_reference')

    def test_empty_arch_reactions_are_known_wrong(self):
        for model in ['0015ab84c3baa36f', '022317310499426d']:
            data = json.loads((ROOT / f'web/results-frozen/solve_arc_length-{model}.json').read_text())
            self.assertEqual(data.get('knownWrong', [{}])[0].get('issue'), 'https://github.com/lambdaclass/stabileo/issues/1949')
            self.assertEqual(data['knownWrong'][0]['path'], 'nonlinear.results.reactions')


class History(unittest.TestCase):
    def run_history(self, filename, values, provenance=None, extra_models=None):
        with tempfile.TemporaryDirectory(dir=ROOT) as directory:
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
            record.update(provenance or {})
            (area / 'base-fixed-native' / model).write_text(json.dumps(record))
            drift = dict(model=model, analysis=record['analysis'], engineering_fields=1,
                         before_refused=False, after_refused=refusal, test=test)
            drift.update(provenance or {})
            drifts = [drift]
            for name, extra_values, extra_provenance in extra_models or []:
                extra = {**record, **extra_provenance, 'input': [{'model': name}], 'result': extra_values[0]}
                (area / 'base-fixed-native' / name).write_text(json.dumps(extra))
                drifts.append({**drift, **extra_provenance, 'model': name})
            (area / 'native-summary.json').write_text(json.dumps({'drift': drifts}))
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
                    payload = json.loads(kwargs.get('input', '[{}]'))
                    model = (payload[0] if isinstance(payload, list) else payload).get('model')
                    series = next((v for name, v, _ in extra_models or [] if name == model), values)
                    value = series[current[0]]
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

    def test_arc_history_keeps_each_model_and_all_contributing_tests(self):
        values = [{'displacements': [i > 0]} for i in range(5)]
        later = [{'displacements': [i > 2]} for i in range(5)]
        unchanged = [{'displacements': [0]}] * 5
        rows, _ = self.run_history('bisect-arc.py', values,
                                   dict(tests=['macneal_harder::browser_cases', 'shared']),
                                   [('later.json', later, dict(tests=['shared'])),
                                    ('unchanged.json', unchanged, dict(tests=['shared']))])
        self.assertEqual({r['model']: (r['parent'], r['first_bad']) for r in rows},
                         {'solve_3d-test.json': ('r0', 'r1'), 'later.json': ('r2', 'r3')})
        self.assertEqual(rows[0]['tests'], ['macneal_harder::browser_cases', 'shared'])
        self.assertEqual(rows[1]['tests'], ['macneal_harder::browser_cases', 'shared'])

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
    def run_script(self, filename, failure):
        with tempfile.TemporaryDirectory(dir=ROOT) as directory:
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

    def test_setup_and_integrity_fail_before_tests(self):
        for script in ['run-complete-native.sh', 'finish-corpus.sh', 'probe-units.sh', 'probe-units-parent.sh']:
            failures = ['integrity'] if script.startswith('probe-') else ['setup', 'integrity']
            for failure in failures:
                with self.subTest(script=script, failure=failure):
                    status, ran = self.run_script(script, failure)
                    self.assertNotEqual(status, 0)
                    self.assertFalse(ran)

    def test_suite_selectors_exist_and_every_suite_checks_execution(self):
        source = (AUDIT / 'run-complete-native.sh').read_text()
        self.assertNotIn('three_d::corotational_benchmarks', source)
        self.assertNotIn('three_d::buckling_benchmarks', source)
        for selector in ['three_d::three_d_corotational::', 'three_d::three_d_buckling::']:
            self.assertIn(selector, source)
        for script in ['run-complete-native.sh', 'finish-corpus.sh', 'probe-units.sh', 'probe-units-parent.sh']:
            self.assertIn('check-suite', (AUDIT / script).read_text())


class EvidenceChecks(unittest.TestCase):
    def test_report_counts_archives_and_digests_agree(self):
        import gzip
        import hashlib
        report = json.loads(AUDIT.with_suffix('.json').read_text())
        self.assertEqual(report['reference_comparisons'], json.loads((AUDIT / 'reference-comparisons.json').read_text()))
        summary = json.loads((AUDIT / 'run-summary.json').read_text())
        evidence = json.loads(gzip.decompress((AUDIT / 'run-evidence.json.gz').read_bytes()))
        self.assertEqual(summary, evidence['summary'])
        suites = [r for r in summary if r.get('round') == 2 and 'validation' in r['log']]
        self.assertEqual(len(suites), 4)
        self.assertEqual(sorted(r['executed'] for r in suites), [7, 7, 9, 9])
        additional = json.loads(gzip.decompress((AUDIT / 'r3-additional-native.json.gz').read_bytes()))
        self.assertEqual(len(additional), 51)
        for row in additional:
            self.assertEqual(row['before'], row['after'])
            self.assertEqual(row['changes'], [])
        self.assertEqual(report['counts']['native_models'], 3771)
        self.assertEqual(report['counts']['native_unchanged'] + report['counts']['native_changed'], 3771)
        for artifact in report['artifacts']:
            data = (AUDIT / artifact['file']).read_bytes()
            self.assertEqual(len(data), artifact['bytes'], artifact['file'])
            self.assertEqual(hashlib.sha256(data).hexdigest(), artifact['sha256'], artifact['file'])

    def test_suite_counts_both_sides_of_execution_and_failure_limits(self):
        from audit_evidence import check_suite
        with tempfile.TemporaryDirectory(dir=ROOT) as directory:
            log = Path(directory) / 'suite.log'
            for passed, failed, ignored, status, allow, valid in [
                (0, 0, 0, 0, False, False), (0, 0, 7, 0, False, False),
                (1, 0, 0, 0, False, True), (0, 1, 0, 101, True, True),
                (0, 1, 0, 101, False, False), (1, 0, 0, 9, True, False),
                (0, 1, 0, 0, True, False),
            ]:
                with self.subTest(passed=passed, failed=failed, status=status, allow=allow):
                    log.write_text(f'test result: ok. {passed} passed; {failed} failed; {ignored} ignored;')
                    if valid:
                        self.assertEqual(check_suite(log, status, allow)['executed'], passed + failed)
                    else:
                        with self.assertRaises(ValueError):
                            check_suite(log, status, allow)
            for text in ['compilation failed', 'test result: ok. 1 passed; 0 failed; 0 ignored;\n' * 2]:
                log.write_text(text)
                with self.assertRaises(ValueError):
                    check_suite(log, 0)

    def test_replay_requires_exact_manifest_inputs_and_results(self):
        from audit_evidence import check_replay
        with tempfile.TemporaryDirectory(dir=ROOT) as directory:
            source, target = Path(directory) / 'input', Path(directory) / 'output'
            source.mkdir()
            target.mkdir()
            with self.assertRaises(ValueError):
                check_replay(source, target)
            expected = dict(analysis='solve_2d', input=[{'loads': []}], test='control')
            (source / 'model.json').write_text(json.dumps(expected))
            with self.assertRaises(ValueError):
                check_replay(source, target)
            output = target / 'model.json'
            output.write_text(json.dumps({**expected, 'result': {'Ok': {}}}))
            self.assertEqual(check_replay(source, target), 1)
            for invalid in [expected, {**expected, 'result': None}, {**expected, 'result': {}}, {**expected, 'result': {'Ok': {}, 'Err': 'invalid'}}, {**expected, 'input': [{}], 'result': {'Ok': {}}}]:
                output.write_text(json.dumps(invalid))
                with self.assertRaises(ValueError):
                    check_replay(source, target)
            output.write_text(json.dumps({**expected, 'result': {'Ok': {}}}))
            (target / 'stale.json').write_text('{}')
            with self.assertRaises(ValueError):
                check_replay(source, target)

    def test_scan_first_last_reverted_and_unchanged_boundaries(self):
        from audit_evidence import first_boundary
        for sequence, expected in [
            (['A', 'B'], (0, 1)), (['A', 'A', 'B'], (1, 2)),
            (['A', 'B', 'A'], (0, 1)), (['A', 'A', 'A'], None), (['A'], None),
        ]:
            with self.subTest(sequence=sequence):
                self.assertEqual(first_boundary(sequence, lambda i: sequence[i], lambda v: v), expected)


class FinalReview(unittest.TestCase):
    def test_static_history_tracks_reactions_forces_and_stresses(self):
        history = History()
        for script in ['bisect-all-static.py', 'bisect-reference.py']:
            for field in ['reactions', 'elementForces', 'quadStresses', 'quadNodalStresses']:
                with self.subTest(script=script, field=field):
                    values = [dict(displacements=[0], **{field: [v]}) for v in [1, -1, 1, 1, 2]]
                    result, _ = history.run_history(script, values)
                    self.assertEqual(len(result), 1)
                    self.assertEqual(result[0]['parent'], 'r0')
                    self.assertEqual(result[0].get('first_change'), 'r1')

    def test_reference_history_selects_secondary_test_provenance(self):
        rows, _ = History().run_history('bisect-reference.py', [{'displacements': [i]} for i in range(5)],
                                       dict(test='another_test', tests=['another_test', 'macneal_harder::browser_cases']))
        self.assertEqual(len(rows), 1)
        self.assertEqual(rows[0]['first_change'], 'r1')

    def test_later_forces_are_not_attributed_to_an_earlier_displacement_change(self):
        for script in ['bisect-all-static.py', 'bisect-reference.py']:
            values = [dict(displacements=[int(i > 0)], reactions=[int(i > 2)], elementForces=[int(i > 3)]) for i in range(5)]
            rows, _ = History().run_history(script, values)
            expected = {
                'displacements': {'parent': 'r0', 'first_change': 'r1'},
                'reactions': {'parent': 'r2', 'first_change': 'r3'},
                'elementForces': {'parent': 'r3', 'first_change': 'r4'},
            }
            self.assertEqual(rows[0].get('quantity_transitions'), expected)

    def test_static_history_excludes_timing_and_build_metadata(self):
        history = History()
        for script in ['bisect-all-static.py', 'bisect-reference.py']:
            values = [dict(displacements=[0], reactions=[1], timings={'solve': i}, solverRunMeta={'commit': str(i)}) for i in range(5)]
            result, _ = history.run_history(script, values)
            self.assertEqual(result, [])

    def test_capture_preserves_every_contributing_test(self):
        with tempfile.TemporaryDirectory(dir=ROOT) as directory:
            area = Path(directory)
            (area / 'engine/tests').mkdir(parents=True)
            source = (AUDIT / 'instrument.py').read_text()
            previous = Path.cwd()
            try:
                os.chdir(area)
                exec(compile(source, str(AUDIT / 'instrument.py'), 'exec'), {})
            finally:
                os.chdir(previous)
            helper = (area / 'engine/tests/audit_capture.rs').read_text()
            record = helper[helper.index('fn record<'):helper.index('#[track_caller]')]
            (area / 'src').mkdir()
            (area / 'Cargo.toml').write_text('[package]\nname="audit-provenance-control"\nversion="0.1.0"\nedition="2021"\n[dependencies]\nserde="1"\nserde_json="1"\n[workspace]\n')
            (area / 'src/main.rs').write_text('use std::hash::{Hash, Hasher};\n' + record + r'''
fn main() {
    let handles: Vec<_> = ["first", "second", "first"].into_iter().map(|name| {
        std::thread::Builder::new().name(name.into()).spawn(|| {
            for kind in ["solve_2d", "solve_3d", "solve_corotational_2d", "solve_corotational_3d", "solve_arc_length"] {
                record(kind, serde_json::json!([{}]), &Ok::<_, String>(1));
            }
        }).unwrap()
    }).collect();
    for handle in handles { handle.join().unwrap(); }
}
''')
            output = area / 'capture'
            result = subprocess.run(['cargo', 'run', '--quiet', '--manifest-path', str(area / 'Cargo.toml'), '--target-dir', str(ROOT / 'target/audit-provenance-control')], env={**os.environ, 'AUDIT_NATIVE_OUT': str(output)}, capture_output=True, text=True)
            self.assertEqual(result.returncode, 0, result.stderr)
            records = list(output.glob('*.json'))
            self.assertEqual(len(records), 5)
            for file in records:
                self.assertEqual(json.loads(file.read_text()).get('tests'), ['first', 'second'])

    def test_input_unions_preserve_provenance_and_reject_identity_collisions(self):
        from audit_evidence import merge_input_records
        first = dict(analysis='solve_2d', input=[{}], test='first')
        second = dict(analysis='solve_2d', input=[{}], test='second', tests=['second', 'third'])
        merged = merge_input_records(first, second)
        self.assertEqual(merged['tests'], ['first', 'second', 'third'])
        self.assertEqual(merge_input_records(merged, first)['tests'], merged['tests'])
        for invalid in [dict(second, input=[{'different': True}]), dict(second, analysis='solve_3d')]:
            with self.assertRaises(ValueError):
                merge_input_records(first, invalid)

    def test_reference_collection_uses_all_provenance_and_refuses_changed_targets(self):
        with tempfile.TemporaryDirectory(dir=ROOT) as directory:
            area = Path(directory)
            (area / 'base-fixed-native').mkdir()
            model = dict(analysis='solve_3d', test='first', tests=['first', 'second'], input=[{}], result={'Ok': {'displacements': [{'ux': 1}]}})
            (area / 'base-fixed-native/model.json').write_text(json.dumps(model))
            for endpoint, actual, reference in [('base', 1, 1), ('repo', 2, 3)]:
                observation = dict(test='second', site='test', actual=actual, reference=reference)
                (area / f'{endpoint}-reference-test.log').write_text('AUDIT_REFERENCE=' + json.dumps(observation))
            source = (AUDIT / 'collect-references.py').read_text().replace('/root/audit/soundness-2026-11-11', directory)
            exec(compile(source, str(AUDIT / 'collect-references.py'), 'exec'), {})
            row = json.loads((area / 'reference-comparisons.json').read_text())['rows'][0]
            self.assertEqual(row['models'], ['model.json'])
            self.assertIsNone(row['farther'])
            self.assertIsNone(row['before_error'])
            self.assertIsNone(row['after_error'])
            observation = dict(test='second', site='test', actual=2, reference=1)
            (area / 'repo-reference-test.log').write_text('AUDIT_REFERENCE=' + json.dumps(observation))
            exec(compile(source, str(AUDIT / 'collect-references.py'), 'exec'), {})
            row = json.loads((area / 'reference-comparisons.json').read_text())['rows'][0]
            self.assertTrue(row['farther'])
            self.assertEqual((row['before_error'], row['after_error']), (0, 1))

    def test_secondary_provenance_reaches_acceptance_and_frozen_reference_consumers(self):
        with tempfile.TemporaryDirectory(dir=ROOT) as directory:
            area = Path(directory)
            for folder in ['base-fixed-native', 'repo-fixed-native', 'base-site-gallery', 'repo-site-gallery',
                           'base/engine/tests/benchmarks', 'repo/engine/tests/benchmarks/spec', 'repo/engine/tests/acceptance/models']:
                (area / folder).mkdir(parents=True)
            (area / 'compare.py').write_text((AUDIT / 'compare.py').read_text())
            (area / 'base/engine/tests/benchmarks/macneal_harder.json').write_text('{"cases": []}')
            (area / 'reference-comparisons.json').write_text('{"rows": []}')
            (area / 'repo/engine/tests/benchmarks/spec/scordelis-lo.json').write_text(json.dumps({'references': [{'value': 1, 'citation': 'synthetic control'}]}))
            case = dict(id='control', source='synthetic control', references=[dict(quantity='displacement', node=1, component='uz', value=1, tolAbs=0)])
            (area / 'repo/engine/tests/acceptance/models/control.json').write_text(json.dumps(case))
            record = dict(analysis='solve_3d', test='first', tests=['first', 'acceptance::control', 'benchmark_protocol::benchmark_protocol_roof'],
                          input=[{'nodes': {'1': {'id': 1, 'x': 0, 'y': 1, 'z': 0}}}], result={'Ok': {'displacements': [{'nodeId': 1, 'uz': 1}]}})
            for endpoint in ['base', 'repo']:
                (area / f'{endpoint}-fixed-native/model.json').write_text(json.dumps(record))
            for script in ['finish-analysis.py', 'frozen-references.py']:
                source = (AUDIT / script).read_text().replace('/root/audit/soundness-2026-11-11', directory)
                with patch.object(sys, 'argv', [script, directory]):
                    exec(compile(source, str(AUDIT / script), 'exec'), {'__file__': str(AUDIT / script)})
            acceptance = json.loads((area / 'acceptance-comparison.json').read_text())
            self.assertEqual((acceptance['cases'], acceptance['references']), (1, 1))
            self.assertTrue(acceptance['comparisons'][0]['after_pass'])
            frozen = json.loads((area / 'reference-comparisons.json').read_text())['frozen_primary_comparisons']
            self.assertEqual(len(frozen), 1)
            self.assertEqual(frozen[0]['test'], 'benchmark_protocol::benchmark_protocol_roof')
            self.assertFalse(frozen[0]['farther'])

    def test_suite_failure_inventory_matches_the_recorded_count(self):
        from audit_evidence import check_suite
        with tempfile.TemporaryDirectory(dir=ROOT) as directory:
            log = Path(directory) / 'suite.log'
            log.write_text('test a::wrong ... FAILED\ntest b::wrong ... FAILED\nfailures:\n    a::wrong\n    b::wrong\ntest result: FAILED. 0 passed; 2 failed; 0 ignored;')
            result = check_suite(log, 101, True)
            self.assertEqual(result.get('failed_tests'), ['a::wrong', 'b::wrong'])
            log.write_text('test result: FAILED. 0 passed; 2 failed; 0 ignored;')
            unavailable = check_suite(log, 101, True)
            self.assertIsNone(unavailable['failed_tests'])
            self.assertIn('no test names', unavailable['failed_tests_unavailable'])
            log.write_text('test a::wrong ... FAILED\ntest result: FAILED. 0 passed; 2 failed; 0 ignored;')
            with self.assertRaises(ValueError):
                check_suite(log, 101, True)

    def test_archived_failure_inventory_is_complete(self):
        import re
        import gzip
        from audit_evidence import failure_inventory
        logs = json.loads(gzip.decompress((AUDIT / 'run-evidence.json.gz').read_bytes()))['logs']
        summary = json.loads((AUDIT / 'run-summary.json').read_text())
        for row in summary:
            failed = sum(int(n) for line in row['results'] for n in re.findall(r'; (\d+) failed;', line))
            with self.subTest(log=row['log']):
                self.assertEqual(len(row['failed_tests']), failed)
                text = logs.get(row['log'])
                if text is None:
                    text = (AUDIT / row['log']).read_text()
                self.assertEqual(row['failed_tests'], failure_inventory(text, failed)['failed_tests'])

    def test_successful_replay_reports_its_own_status(self):
        source = (AUDIT / 'run-complete-native.sh').read_text()
        replay = source[source.index('unset AUDIT_NATIVE_OUT'):]
        self.assertNotIn('${status', replay)

    def test_explicit_site_manifest_cannot_fall_back_to_generated_cases(self):
        source = (AUDIT / 'site-gallery.test.ts').read_text()
        line = next(line for line in source.splitlines() if line.startswith('const cases:'))
        line = line.replace('const cases: typeof generated', 'const cases')
        with tempfile.TemporaryDirectory(dir=ROOT) as directory:
            manifest = Path(directory) / 'manifest.json'
            for supplied, present, valid in [(None, False, True), (str(manifest), True, True), (str(manifest), False, False), ('', False, False)]:
                if present:
                    manifest.write_text('[{"id":"explicit"}]')
                else:
                    manifest.unlink(missing_ok=True)
                code = "import {existsSync,readFileSync} from 'node:fs'; const generated=[{id:'generated'}]; const supplied=" + json.dumps(supplied) + ';' + line + '; console.log(JSON.stringify(cases));'
                if supplied is None:
                    code = code.replace('const supplied=null', 'const supplied=undefined')
                result = subprocess.run(['node', '--input-type=module', '-e', code], capture_output=True, text=True)
                self.assertEqual(result.returncode == 0, valid, result.stdout)
                if valid:
                    self.assertEqual(json.loads(result.stdout)[0]['id'], 'explicit' if present else 'generated')

    def test_frozen_regressions_require_exact_nonempty_evidence(self):
        source = (ROOT / 'scripts/tests/frozen-results-values.test.mjs').read_text()
        original = next(line for line in source.splitlines() if line.startswith('const evidence ='))
        valid = json.loads((AUDIT / 'arc-bisection.json').read_text())
        duplicate = [valid[0], valid[0], valid[2]]
        wrong = [valid[0], {**valid[1], 'model': 'wrong-model.json'}, valid[2]]
        for evidence in [[], [{}], [{'model': 'duplicate'}, {'model': 'duplicate'}], duplicate, wrong, valid]:
            modified = source.replace(original, 'const evidence = ' + json.dumps(evidence) + ';')
            result = subprocess.run(['node', '--input-type=module'], input=modified, cwd=ROOT / 'scripts/tests', capture_output=True, text=True)
            self.assertEqual(result.returncode == 0, evidence == valid, result.stdout + result.stderr)
            if len(evidence) == 3 and evidence != valid:
                self.assertIn('arc evidence case identities', result.stderr)

    def test_1784_coverage_cites_its_buckling_and_multicase_regressions(self):
        report = AUDIT.with_suffix('.md').read_text()
        row = next(line for line in report.splitlines() if line.startswith('| #1784 |'))
        self.assertIn('issue_1759_buckling_rejects_negative_truss_inertia', row)
        self.assertIn('issue_1761_multi_case_overflow_is_refused', row)
        self.assertNotIn('issue_1760_plastic', row)


if __name__ == '__main__':
    unittest.main()
