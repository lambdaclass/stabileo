"""check-wall-clock-tests.py: engine wall-clock budgets go through wall_clock::budget and stay out of the shared suite."""
import importlib.util
from pathlib import Path
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[2]
spec = importlib.util.spec_from_file_location('check', ROOT / '.github/scripts/check-wall-clock-tests.py')
check = importlib.util.module_from_spec(spec)
spec.loader.exec_module(check)

MAKEFILE = '''GATE_MODULES = sparse_shell_gates
GATE_TIMED_MODULES = perf_regression_gates
GATE_TIMED_IGNORED = test(=a::tests::listed_budget) + test(=scaling::listed_scaling)
'''

TIMED = '''
mod tests {{
    #[test]
    fn {name}() {{
        let t0 = std::time::Instant::now();
        work();
        let dt = t0.elapsed();
        crate::wall_clock::budget(dt.as_secs_f64() < 1.0, || format!("took {{dt:?}}"));
    }}
}}
'''

RAW_ASSERT = 'assert!(dt.as_secs_f64() < 1.0, "took {dt:?}")'
BUDGET = 'crate::wall_clock::budget(dt.as_secs_f64() < 1.0, || format!("took {dt:?}"))'


def raw(source):
    assert BUDGET in source
    return source.replace(BUDGET, RAW_ASSERT)


def violations(files):
    with tempfile.TemporaryDirectory() as tmp:
        root = Path(tmp)
        (root / 'Makefile').write_text(MAKEFILE)
        for path, text in files.items():
            (root / path).parent.mkdir(parents=True, exist_ok=True)
            (root / path).write_text(text)
        return check.violations(root)


class WallClockTests(unittest.TestCase):
    def test_the_repository_has_none(self):
        self.assertEqual(check.violations(), [])

    def test_a_budget_in_the_suite_fails(self):
        found = violations({'engine/src/a.rs': TIMED.format(name='budget')})
        self.assertEqual(len(found), 1)
        self.assertTrue(found[0].startswith('engine/src/a.rs:4 a::tests::budget: has a wall-clock budget'), found)

    def test_a_timed_assert_macro_fails_even_where_engine_gates_runs_it(self):
        listed = raw(TIMED.format(name='listed_budget').replace('#[test]\n', '#[test]\n    #[ignore = "wall clock"]\n'))
        for path, source in [('engine/src/a.rs', raw(TIMED.format(name='budget'))), ('engine/src/a.rs', listed),
                             ('engine/tests/perf_regression_gates.rs', raw(TIMED.format(name='x'))),
                             ('engine/tests/sparse_shell_gates.rs', raw(TIMED.format(name='y')))]:
            with self.subTest(path=path, source=source):
                found = violations({path: source})
                self.assertEqual(len(found), 1)
                self.assertIn(': asserts on wall-clock time (assert!(dt.as_secs_f64() < 1.0', found[0])
                self.assertIn('use wall_clock::budget', found[0])

    def test_a_watchdog_keeps_its_hard_assert_but_still_runs_alone(self):
        self.assertEqual(check.WATCHDOGS, {'fuzz_regressions::a_blocking_child_is_killed_at_its_timeout'})
        watchdog = raw(TIMED.format(name='a_blocking_child_is_killed_at_its_timeout')).replace('mod tests {\n', '').rsplit('}', 1)[0]
        makefile = MAKEFILE.replace('GATE_TIMED_IGNORED = ', 'GATE_TIMED_IGNORED = test(=fuzz_regressions::a_blocking_child_is_killed_at_its_timeout) + ')
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            (root / 'Makefile').write_text(makefile)
            (root / 'engine/tests').mkdir(parents=True)
            (root / 'engine/tests/fuzz_regressions.rs').write_text(watchdog.replace('#[test]\n', '#[test]\n    #[ignore]\n'))
            self.assertEqual(check.violations(root), [])
            (root / 'engine/tests/fuzz_regressions.rs').write_text(watchdog)
            found = check.violations(root)
        self.assertEqual(len(found), 1)
        self.assertIn('a watchdog test asserts on wall-clock time', found[0])
        self.assertEqual(len(violations({'engine/tests/other.rs': raw(TIMED.format(name='a_blocking_child_is_killed_at_its_timeout'))})), 1)

    def test_a_budget_spread_over_lines_is_found(self):
        source = TIMED.format(name='budget').replace(BUDGET, 'dedaliano_engine::wall_clock::budget(\n            dt.as_secs_f64() < 1.0,\n            || format!("took {dt:?}"),\n        )')
        found = violations({'engine/tests/other.rs': source})
        self.assertEqual(len(found), 1)
        self.assertIn('has a wall-clock budget (wall_clock::budget( dt.as_secs_f64() < 1.0,', found[0])

    def test_ignored_and_listed_passes_but_either_alone_fails(self):
        ignored = TIMED.format(name='listed_budget').replace('#[test]\n', '#[test]\n    #[ignore = "wall clock"]\n')
        self.assertEqual(violations({'engine/src/a.rs': ignored}), [])
        self.assertEqual(len(violations({'engine/src/a.rs': TIMED.format(name='listed_budget')})), 1)
        unlisted = TIMED.format(name='other').replace('#[test]\n', '#[test]\n    #[ignore]\n')
        self.assertEqual(len(violations({'engine/src/a.rs': unlisted})), 1)

    def test_a_listed_name_in_another_module_is_not_listed(self):
        ignored = TIMED.format(name='listed_budget').replace('#[test]\n', '#[test]\n    #[ignore]\n')
        found = violations({'engine/src/b.rs': ignored, 'engine/src/x/a.rs': ignored})
        self.assertEqual([f.split(' ')[1] for f in found], ['b::tests::listed_budget:', 'x::a::tests::listed_budget:'])
        scaling = TIMED.format(name='listed_scaling').replace('mod tests {', 'mod inner {').replace('#[test]\n', '#[test]\n    #[ignore]\n')
        self.assertEqual(len(violations({'engine/tests/integration/scaling.rs': scaling})), 1)
        top = TIMED.format(name='listed_scaling').replace('mod tests {\n', '').rsplit('}', 1)[0].replace('#[test]\n', '#[test]\n    #[ignore]\n')
        self.assertEqual(violations({'engine/tests/integration/scaling.rs': top}), [])

    def test_every_assert_macro_counts(self):
        for macro in ['assert!(dt.as_secs() < 1)', 'assert_eq!(dt.as_secs(), 0)', 'assert_ne!(dt.as_secs(), 9)',
                      'debug_assert!(dt.as_secs() < 1)', 'debug_assert_eq!(dt.as_secs(), 0)', 'debug_assert_ne!(dt.as_secs(), 9)']:
            with self.subTest(macro=macro):
                source = TIMED.format(name='m').replace(BUDGET, macro)
                self.assertIn(macro, source)
                self.assertEqual(len(violations({'engine/src/a.rs': source})), 1)

    def test_modules_engine_gates_runs_are_exempt(self):
        self.assertEqual(violations({'engine/tests/perf_regression_gates.rs': TIMED.format(name='x'),
                                     'engine/tests/sparse_shell_gates.rs': TIMED.format(name='y')}), [])
        self.assertEqual(len(violations({'engine/tests/other.rs': TIMED.format(name='z')})), 1)
        self.assertEqual(len(violations({'engine/tests/perf_regression_gates.rs': raw(TIMED.format(name='x'))})), 1)

    def test_timing_through_collections_and_multiline_asserts_is_caught(self):
        source = '''
    #[test]
    fn scales() {
        let mut rows = Vec::new();
        for n in [1, 2] {
            let t = Instant::now();
            solve(n);
            let ms = t.elapsed().as_secs_f64() * 1e3;
            rows.push((n, ms));
        }
        let (n0, s0) = rows[0];
        let (n1, s1) = rows[1];
        let k = (s1 / s0).ln() / (n1 as f64 / n0 as f64).ln();
        assert!(
            k < 2.5,
            "exponent {k}"
        );
    }
'''
        self.assertEqual(len(violations({'engine/src/b.rs': source})), 1)

    def test_timing_returned_from_a_block_is_caught(self):
        source = """
    #[test]
    fn block() {
        let dt = {
            let t = Instant::now();
            work();
            t.elapsed()
        };
        assert!(dt.as_secs() < 1);
    }
"""
        self.assertEqual(len(violations({'engine/src/d.rs': source})), 1)

    def test_timing_only_in_an_assertion_message_passes(self):
        source = """
    #[test]
    fn message() {
        let start = Instant::now();
        let r = solve();
        assert_eq!(r, 3, "took {:?}", start.elapsed());
        assert!(r > 0, "after {:?}", start.elapsed());
    }
"""
        self.assertEqual(violations({'engine/src/e.rs': source}), [])

    def test_logged_timings_and_counted_work_pass(self):
        source = '''
    #[test]
    fn logs_only() {
        let t = Instant::now();
        let r = solve();
        eprintln!("{:?}", t.elapsed());
        assert_eq!(r.len(), 3);
    }

    #[test]
    fn counted() {
        let before = builds();
        solve();
        assert_eq!(builds() - before, 0);
    }
'''
        self.assertEqual(violations({'engine/src/c.rs': source}), [])


if __name__ == '__main__':
    unittest.main()
