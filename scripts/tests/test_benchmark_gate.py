import contextlib
import copy
import importlib.util
import io
import json
import os
import pathlib
import subprocess
import sys
import tempfile
import unittest

ROOT = pathlib.Path(__file__).resolve().parents[2]
spec = importlib.util.spec_from_file_location('benchmark_gate', ROOT / 'scripts/benchmark-gate.py')
gate = importlib.util.module_from_spec(spec)
spec.loader.exec_module(gate)

RUST = '''
const TOL: f64 = 0.02;
fn assert_close(a: f64, b: f64, tol: f64, label: &str) {}
#[test]
fn t() {
    assert_close(f(1.0, (2.0)), 3.0, 0.01, "a, b");
    assert_close(x, y, TOL, "c");
    // assert_close(x, y, 0.9, "commented out");
    let err = 1.0;
    assert!(err < 0.015, "e");
}
'''


def reference(value=1.0, source='Textbook'):
    return dict(source=source, location='Table 1, p. 2', value=value, unit='m')


def quantity(**changes):
    q = dict(quantity='tip deflection', unit='m', references=[reference(), reference(1.0001, 'Paper')],
             tolerance=dict(relative=0.02, justification='discretisation error at 16 elements'),
             test_tolerances=[dict(file='case.json', pointer='/tolerance')],
             independent_of_derivation=True, independence_note='closed form')
    q.update(changes)
    return q


def registry(*qs, scope=('bench/*.json',)):
    return dict(scope=list(scope), excluded={},
                benchmarks=[dict(id='case', files=['bench/case.json'], quantities=list(qs) or [quantity()])])


def reader(files):
    return lambda path: files.get(path)


FILES = {'case.json': json.dumps(dict(tolerance=0.02, cases=[dict(t=0.01), dict(t=0.02)])),
         'bench/case.json': '{}', 'x.rs': RUST}


class Spec(unittest.TestCase):
    def errors(self, reg, files=FILES):
        return gate.check(reg, reader(files), list(files))

    def test_a_complete_spec_passes(self):
        self.assertEqual(self.errors(registry()), [])

    def test_a_benchmark_without_a_spec_fails(self):
        files = dict(FILES, **{'bench/new.json': '{}'})
        self.assertEqual(self.errors(registry(), files), [f'bench/new.json: benchmark has no spec in {gate.REGISTRY}'])

    def test_an_excluded_file_needs_no_spec_but_a_reason(self):
        files = dict(FILES, **{'bench/new.json': '{}'})
        reg = registry()
        reg['excluded'] = {'bench/new.json': 'schema'}
        self.assertEqual(self.errors(reg, files), [])
        reg['excluded'] = {'bench/new.json': ' '}
        self.assertEqual(self.errors(reg, files), ['bench/new.json: exclusion needs a reason'])

    def test_a_spec_naming_a_missing_file_fails(self):
        reg = registry()
        reg['benchmarks'][0]['files'].append('bench/gone.json')
        self.assertEqual(self.errors(reg), ['case: bench/gone.json does not exist'])

    def test_one_reference_without_an_exemption_fails(self):
        errors = self.errors(registry(quantity(references=[reference()])))
        self.assertEqual(errors, ['case / tip deflection: 1 reference(s); two independent references or a reviewed exemption required'])

    def test_a_reviewed_single_reference_exemption_passes(self):
        exemption = dict(kind='single-reference', reason='only a closed form', issue=1481, reviewed='PR review')
        self.assertEqual(self.errors(registry(quantity(references=[reference()], exemption=exemption))), [])

    def test_an_exemption_needs_reason_issue_and_review(self):
        exemption = dict(kind='single-reference', reason='', issue='#1', reviewed='')
        errors = self.errors(registry(quantity(references=[reference()], exemption=exemption)))
        self.assertEqual(errors, ['case / tip deflection: exemption needs a reason',
                                  'case / tip deflection: exemption needs a tracking issue number',
                                  'case / tip deflection: exemption needs a review record (reviewed)'])

    def test_a_stale_exemption_fails(self):
        exemption = dict(kind='single-reference', reason='r', issue=1, reviewed='r')
        errors = self.errors(registry(quantity(exemption=exemption)))
        self.assertIn('case / tip deflection: has 2 references; remove the stale single-reference exemption', errors)

    def test_an_unknown_exemption_kind_fails(self):
        exemption = dict(kind='trust-me', reason='r', issue=1, reviewed='r')
        errors = self.errors(registry(quantity(references=[reference()], exemption=exemption)))
        self.assertIn("case / tip deflection: exemption kind must be one of ['single-reference', 'unaudited']", errors)

    def test_an_unaudited_exemption_may_lack_a_numeric_tolerance_but_not_a_justification(self):
        exemption = dict(kind='unaudited', reason='legacy', issue=1482, reviewed='r')
        q = quantity(references=[], exemption=exemption, test_tolerances=[],
                     tolerance=dict(relative=None, justification='qualitative only'))
        self.assertEqual(self.errors(registry(q)), [])
        q['tolerance']['justification'] = ''
        self.assertEqual(self.errors(registry(q)), ['case / tip deflection: tolerance has no justification'])

    def test_a_reference_needs_citation_location_unit_and_value(self):
        bad = dict(source='', location='', unit='', value=None)
        errors = self.errors(registry(quantity(references=[reference(), bad])))
        self.assertEqual(errors, [f'case / tip deflection: reference 2 missing {f}' for f in ('source', 'location', 'unit')]
                         + ['case / tip deflection: reference 2 needs a finite value'])

    def test_a_duplicated_reference_does_not_count_twice(self):
        errors = self.errors(registry(quantity(references=[reference(), reference(1.0001)])))
        self.assertEqual(errors, ['case / tip deflection: the same reference is listed twice'])

    def test_a_tolerance_without_justification_fails(self):
        errors = self.errors(registry(quantity(tolerance=dict(relative=0.02, justification=' '))))
        self.assertEqual(errors, ['case / tip deflection: tolerance has no justification'])

    def test_a_tolerance_needs_one_positive_kind(self):
        self.assertEqual(self.errors(registry(quantity(tolerance=dict(justification='j')))),
                         ['case / tip deflection: tolerance needs exactly one of relative or absolute'])
        self.assertIn('case / tip deflection: tolerance must be a positive number',
                      self.errors(registry(quantity(tolerance=dict(relative=0, justification='j')))))

    def test_missing_evidence_fails(self):
        q = quantity(tolerance=dict(relative=0.02, justification='j', evidence='docs/missing.md#study'))
        self.assertEqual(self.errors(registry(q)), ['case / tip deflection: tolerance evidence docs/missing.md#study does not exist'])

    def test_the_independence_flag_and_note_are_required(self):
        errors = self.errors(registry(quantity(independent_of_derivation='yes', independence_note='')))
        self.assertEqual(errors, ['case / tip deflection: missing independence_note',
                                  'case / tip deflection: independent_of_derivation must be true or false'])

    def test_a_quantity_without_a_test_tolerance_locator_fails(self):
        self.assertEqual(self.errors(registry(quantity(test_tolerances=[]))),
                         ['case / tip deflection: no test tolerance locator'])


class TestTolerance(unittest.TestCase):
    def errors(self, locator, tolerance, files=FILES):
        q = quantity(tolerance=dict(relative=tolerance, justification='j'), test_tolerances=[locator])
        return gate.check(registry(q), reader(files), list(files))

    def test_a_json_test_tolerance_looser_than_the_spec_fails(self):
        self.assertEqual(self.errors(dict(file='case.json', pointer='/tolerance'), 0.02), [])
        self.assertEqual(self.errors(dict(file='case.json', pointer='/tolerance'), 0.01),
                         ['case / tip deflection: case.json uses tolerance 0.02, looser than the spec 0.01'])

    def test_a_wildcard_pointer_takes_the_loosest(self):
        self.assertEqual(self.errors(dict(file='case.json', pointer='/cases/*/t'), 0.015),
                         ['case / tip deflection: case.json uses tolerance 0.02, looser than the spec 0.015'])

    def test_a_pointer_that_finds_nothing_fails(self):
        self.assertEqual(self.errors(dict(file='case.json', pointer='/missing'), 0.02),
                         ['case / tip deflection: case.json/missing: no numeric test tolerance'])

    def test_a_missing_test_file_fails(self):
        self.assertEqual(self.errors(dict(file='gone.json', pointer='/t'), 0.02),
                         ['case / tip deflection: gone.json: test tolerance file does not exist'])

    def test_rust_call_arguments_resolve_literals_and_constants_and_skip_comments(self):
        locator = dict(file='x.rs', calls=['assert_close'], argument=3)
        self.assertEqual(sorted(gate.extract(locator, reader(FILES))), [0.01, 0.02])
        self.assertEqual(self.errors(locator, 0.015),
                         ['case / tip deflection: x.rs uses tolerance 0.02, looser than the spec 0.015'])

    def test_an_unresolved_rust_tolerance_fails_unless_it_aliases_a_case_tolerance(self):
        files = dict(FILES, **{'x.rs': RUST + 'fn u() { assert_close(a, b, case["t"].as_f64().unwrap(), "d, e"); }'})
        locator = dict(file='x.rs', calls=['assert_close'], argument=3)
        [error] = self.errors(locator, 0.02, files)
        self.assertIn('neither literals, constants nor aliases of a case-file tolerance: assert_close(…case["t"].as_f64().unwrap()…)', error)
        alias = dict(locator, aliases={'case["t"].as_f64().unwrap()': dict(file='case.json', pointer='/cases/*/t')})
        retargeted = dict(FILES, **{'x.rs': RUST + 'fn u() { assert_close(a, b, case["loose"].as_f64().unwrap(), "d"); }'})
        self.assertIn('assert_close(…case["loose"].as_f64().unwrap()…)', self.errors(alias, 0.02, retargeted)[0])
        self.assertEqual(self.errors(alias, 0.02, files), [])
        self.assertEqual(self.errors(alias, 0.015, files),
                         ['case / tip deflection: x.rs uses tolerance 0.02, looser than the spec 0.015'])

    def test_a_reassigned_tolerance_binding_is_unresolved(self):
        files = dict(FILES, **{'x.rs': 'fn a() { let mut tol = 0.01; tol = 0.5; assert_close(x, y, tol, ""); }'})
        [error] = self.errors(dict(file='x.rs', calls=['assert_close'], argument=3), 0.02, files)
        self.assertIn('assert_close(…tol…)', error)

    def test_a_parameter_named_like_a_binding_is_unresolved(self):
        files = dict(FILES, **{'x.rs': 'fn a() { let tol = 0.01; }\nfn h(x: f64, tol: f64) { assert_close(x, 1.0, tol, ""); }'})
        [error] = self.errors(dict(file='x.rs', calls=['assert_close'], argument=3), 0.02, files)
        self.assertIn('assert_close(…tol…)', error)

    def test_a_rust_pattern_reads_error_thresholds(self):
        self.assertEqual(gate.extract(dict(file='x.rs', pattern='error-threshold'), reader(FILES)), [0.015])
        self.assertEqual(self.errors(dict(file='x.rs', pattern='error-threshold'), 0.01),
                         ['case / tip deflection: x.rs uses tolerance 0.015, looser than the spec 0.01'])

    def test_a_pattern_followed_by_arithmetic_fails(self):
        files = dict(FILES, **{'x.rs': 'fn a() { assert!(err < 0.015 * 2.0); }'})
        [error] = self.errors(dict(file='x.rs', pattern='error-threshold'), 0.02, files)
        self.assertIn("matched '0.015' followed by '* 2.0); }', not a complete literal threshold", error)

    def test_a_numeric_unaudited_ceiling_needs_a_locator(self):
        exemption = dict(kind='unaudited', reason='legacy', issue=1482, reviewed='r')
        q = quantity(references=[], exemption=exemption, test_tolerances=[], tolerance=dict(relative=0.05, justification='ceiling'))
        self.assertEqual(gate.check(registry(q), reader(FILES), list(FILES)), ['case / tip deflection: no test tolerance locator'])

    def test_a_pattern_that_matches_nothing_fails(self):
        [error] = self.errors(dict(file='x.rs', pattern=r'nothing < (\d+)'), 0.02)
        self.assertIn('matched no numeric tolerance', error)

    def test_ratio_transforms(self):
        files = dict(FILES, **{'r.json': json.dumps(dict(bounds=[[0.97, 1.01]], floors=[0.95]))})
        self.assertEqual([round(v, 12) for v in gate.extract(dict(file='r.json', pointer='/bounds/*', transform='ratio-bounds'), reader(files))], [0.03])
        self.assertEqual([round(v, 12) for v in gate.extract(dict(file='r.json', pointer='/floors/*', transform='ratio-floor'), reader(files))], [0.05])

    def test_a_kind_mismatch_fails(self):
        self.assertEqual(self.errors(dict(file='case.json', pointer='/tolerance', kind='absolute'), 0.02),
                         ['case / tip deflection: case.json tolerance is absolute, the spec is relative'])


class Protocol(unittest.TestCase):
    def test_a_protocol_spec_supplies_its_own_references_and_tolerance(self):
        refs = [dict(citation='A', location='Table 1', value=1.0, pass_fail=True, provisional=False),
                dict(citation='B', location='Eq. 3', value=1.0, pass_fail=True, provisional=False)]
        files = {'spec/p.json': json.dumps(dict(id='p', references=refs, tolerance=dict(relative=0.01, justification='j')))}
        entry = dict(id='p', protocol='spec/p.json', files=[], unit='m', independent_of_derivation=True, independence_note='n')
        reg = dict(scope=['spec/*.json'], excluded={}, benchmarks=[entry])
        self.assertEqual(gate.check(reg, reader(files), list(files)), [])
        refs[1]['provisional'] = True
        files['spec/p.json'] = json.dumps(dict(id='p', references=refs, tolerance=dict(relative=0.01, justification='j')))
        self.assertEqual(gate.check(reg, reader(files), list(files)),
                         ['p / p: 1 reference(s); two independent references or a reviewed exemption required'])


class Loosening(unittest.TestCase):
    def run_check(self, head_tolerance, labels=(), head=None):
        base = registry()
        head = head or registry(quantity(tolerance=dict(relative=head_tolerance, justification='j')))
        return gate.label_check(base, reader(FILES), head, reader(FILES), set(labels))

    def test_tightening_needs_no_label(self):
        self.assertEqual(self.run_check(0.01), ([], []))

    def test_loosening_without_the_label_fails(self):
        errors, _ = self.run_check(0.03)
        self.assertEqual(errors, ['case / tip deflection: relative tolerance loosened from 0.02 to 0.03 (needs the tolerance-change label)'])

    def test_loosening_with_the_label_passes_and_is_reported(self):
        self.assertEqual(self.run_check(0.03, ['tolerance-change']),
                         ([], '1 loosened tolerance(s) accepted by the tolerance-change label'))

    def test_removing_a_spec_or_its_number_counts_as_loosening(self):
        empty = dict(scope=[], excluded={}, benchmarks=[])
        errors, _ = self.run_check(None, head=empty)
        self.assertEqual(errors[0], 'case / tip deflection: spec removed (needs the tolerance-change label)')
        errors, _ = self.run_check(None)
        self.assertEqual(errors[0], 'case / tip deflection: relative tolerance 0.02 removed (needs the tolerance-change label)')

    def test_loosening_a_test_tolerance_inside_the_spec_needs_the_label(self):
        base_files = dict(FILES, **{'case.json': json.dumps(dict(tolerance=0.02, cases=[dict(t=0.01), dict(t=0.02)]))})
        head_files = dict(FILES, **{'case.json': json.dumps(dict(tolerance=0.02, cases=[dict(t=0.015), dict(t=0.02)]))})
        reg = registry(quantity(test_tolerances=[dict(file='case.json', pointer='/cases/*/t')]))
        errors, _ = gate.label_check(reg, reader(base_files), reg, reader(head_files), set())
        self.assertEqual(errors, ['case / tip deflection: test tolerance case.json /cases/0/t loosened from 0.01 to 0.015 (needs the tolerance-change label)'])
        self.assertEqual(gate.label_check(reg, reader(head_files), reg, reader(base_files), set()), ([], []))

    def rust_change(self, before, after):
        reg = registry(quantity(test_tolerances=[dict(file='x.rs', calls=['assert_close'], argument=3)]))
        return gate.label_check(reg, reader(dict(FILES, **{'x.rs': before})), reg, reader(dict(FILES, **{'x.rs': after})), set())[0]

    def test_swapping_two_assertion_tolerances_is_loosening(self):
        before = 'fn a() { assert_close(x, 1.0, 0.01, ""); assert_close(y, 2.0, 0.02, ""); }'
        after = 'fn a() { assert_close(x, 1.0, 0.02, ""); assert_close(y, 2.0, 0.01, ""); }'
        self.assertEqual(self.rust_change(before, after),
                         ['case / tip deflection: test tolerance x.rs a:assert_close(x)#1 loosened from 0.01 to 0.02 (needs the tolerance-change label)'])

    def test_loosening_one_assertion_while_adding_another_is_loosening(self):
        before = 'fn a() { assert_close(x, 1.0, 0.01, ""); assert_close(y, 2.0, 0.02, ""); }'
        after = 'fn a() { assert_close(x, 1.0, 0.015, ""); assert_close(y, 2.0, 0.02, ""); assert_close(z, 3.0, 0.005, ""); }'
        self.assertEqual(self.rust_change(before, after),
                         ['case / tip deflection: test tolerance x.rs a:assert_close(x)#1 loosened from 0.01 to 0.015 (needs the tolerance-change label)'])

    def test_reordering_assertions_while_loosening_one_is_loosening(self):
        before = 'fn a() { assert_close(x, 1.0, 0.01, ""); assert_close(y, 2.0, 0.02, ""); }'
        after = 'fn a() { assert_close(y, 2.0, 0.01, ""); assert_close(x, 1.0, 0.02, ""); }'
        self.assertIn('case / tip deflection: test tolerance x.rs a:assert_close(x)#1 loosened from 0.01 to 0.02 (needs the tolerance-change label)',
                      self.rust_change(before, after))

    def test_a_new_test_function_changes_nothing(self):
        before = 'fn a() { assert_close(x, 1.0, 0.01, ""); }'
        self.assertEqual(self.rust_change(before, 'fn n() { assert_close(w, 1.0, 0.001, ""); }\n' + before), [])

    def test_removing_an_assertion_needs_the_label(self):
        before = 'fn a() { assert_close(x, 1.0, 0.01, ""); assert_close(y, 2.0, 0.02, ""); }'
        after = 'fn a() { assert_close(x, 1.0, 0.01, ""); }'
        self.assertEqual(self.rust_change(before, after),
                         ['case / tip deflection: test tolerance x.rs a:assert_close(y)#1 (0.02) removed or moved (needs the tolerance-change label)'])

    def test_dropping_a_locator_needs_the_label(self):
        base = registry()
        exemption = dict(kind='unaudited', reason='legacy', issue=1482, reviewed='r')
        head = registry(quantity(references=[], exemption=exemption, test_tolerances=[],
                                 tolerance=dict(relative=None, justification='qualitative only')))
        errors, _ = gate.label_check(base, reader(FILES), head, reader(FILES), set())
        self.assertIn('case / tip deflection: test tolerance case.json /tolerance (0.02) removed or moved (needs the tolerance-change label)', errors)

    def test_switching_kind_counts_as_loosening(self):
        head = registry(quantity(tolerance=dict(absolute=0.001, justification='j')))
        errors, _ = self.run_check(None, head=head)
        self.assertEqual(errors, ['case / tip deflection: tolerance changed from relative to absolute (needs the tolerance-change label)'])


class Event(unittest.TestCase):
    def context(self, name, payload):
        with tempfile.NamedTemporaryFile('w', suffix='.json', delete=False) as f:
            json.dump(payload, f)
        return gate.event_context(dict(GITHUB_EVENT_PATH=f.name, GITHUB_EVENT_NAME=name))

    def test_pull_request_labels_and_base_come_from_the_payload(self):
        payload = dict(pull_request=dict(base=dict(sha='abc'), labels=[dict(name='tolerance-change'), dict(name='x')]))
        self.assertEqual(self.context('pull_request', payload), dict(base='abc', labels=['tolerance-change', 'x']))

    def test_merge_group_and_push_skip_the_label_check(self):
        self.assertIn('skip', self.context('merge_group', dict(merge_group=dict(base_sha='abc'))))
        self.assertIn('skip', self.context('push', dict()))

    def test_without_a_payload_the_check_runs_locally(self):
        self.assertIsNone(gate.event_context({}))

    def test_in_ci_the_labels_fetched_when_the_job_runs_replace_the_payload(self):
        base = registry()
        with tempfile.NamedTemporaryFile('w', suffix='.json', delete=False) as f:
            json.dump(dict(pull_request=dict(base=dict(sha='abc'), labels=[dict(name='tolerance-change')])), f)
        seen = {}
        original = (gate.base_revision, gate.git_reader, gate.label_check)
        gate.base_revision = lambda sha: sha
        gate.git_reader = lambda rev: lambda path: json.dumps(base) if path == gate.REGISTRY else None

        def label_check(base_registry, base_read, head, head_read, labels):
            seen['labels'] = labels
            return [], None
        gate.label_check = label_check
        try:
            with contextlib.redirect_stdout(io.StringIO()), contextlib.redirect_stderr(io.StringIO()):
                gate.main([], dict(GITHUB_EVENT_PATH=f.name, GITHUB_EVENT_NAME='pull_request', BENCHMARK_GATE_LABELS=''))
                removed = seen.pop('labels')
                gate.main([], dict(GITHUB_EVENT_PATH=f.name, GITHUB_EVENT_NAME='pull_request'))
                payload = seen.pop('labels')
        finally:
            gate.base_revision, gate.git_reader, gate.label_check = original
        self.assertEqual((removed, payload), (set(), {'tolerance-change'}))

    def test_a_pull_request_whose_base_cannot_be_read_fails(self):
        with tempfile.NamedTemporaryFile('w', suffix='.json', delete=False) as f:
            json.dump(dict(pull_request=dict(base=dict(sha='0' * 40), labels=[])), f)
        original = gate.base_revision
        gate.base_revision = lambda sha: None
        try:
            with contextlib.redirect_stderr(io.StringIO()) as err, contextlib.redirect_stdout(io.StringIO()):
                code = gate.main([], dict(GITHUB_EVENT_PATH=f.name, GITHUB_EVENT_NAME='pull_request'))
        finally:
            gate.base_revision = original
        self.assertEqual(code, 1)
        self.assertIn('cannot read the pull request base', err.getvalue())

    def test_a_pull_request_against_its_own_head_passes(self):
        head = gate.git('rev-parse', 'HEAD').strip()
        with tempfile.NamedTemporaryFile('w', suffix='.json', delete=False) as f:
            json.dump(dict(pull_request=dict(base=dict(sha=head), labels=[])), f)
        with contextlib.redirect_stdout(io.StringIO()):
            self.assertEqual(gate.main([], dict(GITHUB_EVENT_PATH=f.name, GITHUB_EVENT_NAME='pull_request')), 0)


class Repository(unittest.TestCase):
    def test_the_registry_passes_the_gate(self):
        r = subprocess.run([sys.executable, '-B', '-I', str(ROOT / 'scripts/benchmark-gate.py'), '--base', 'HEAD'],
                           capture_output=True, text=True,
                           env={k: v for k, v in os.environ.items() if not k.startswith('GITHUB_')})
        self.assertEqual(r.returncode, 0, r.stderr)

    def test_every_real_test_tolerance_is_within_its_spec(self):
        registry_ = json.loads((ROOT / gate.REGISTRY).read_text())
        loosened = copy.deepcopy(registry_)
        navier = next(b for b in loosened['benchmarks'] if b['id'] == 'navier-plate')
        navier['quantities'][0]['tolerance']['relative'] = 0.002
        files = (gate.git('ls-files') or '').split('\n')
        self.assertEqual(gate.check(registry_, gate.disk_reader, files), [])
        self.assertIn('navier-plate / DKT centre deflection, 16 x 16 grid, against the Kirchhoff series: '
                      'engine/tests/benchmarks/navier_plate.rs uses tolerance 0.0025, looser than the spec 0.002',
                      gate.check(loosened, gate.disk_reader, files))


if __name__ == '__main__':
    unittest.main()
