"""check-wall-clock-tests.py: no engine test in the shared suite asserts on elapsed wall-clock time."""
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
    #[test]
    fn {name}() {{
        let t0 = std::time::Instant::now();
        work();
        let dt = t0.elapsed();
        assert!(dt.as_secs_f64() < 1.0, "took {{dt:?}}");
    }}
'''


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

    def test_a_timed_assertion_in_the_suite_fails(self):
        found = violations({'engine/src/a.rs': TIMED.format(name='budget')})
        self.assertEqual(len(found), 1)
        self.assertTrue(found[0].startswith('engine/src/a.rs:3 budget: asserts on wall-clock time'), found)

    def test_ignored_and_listed_passes_but_either_alone_fails(self):
        ignored = TIMED.format(name='listed_budget').replace('#[test]\n', '#[test]\n    #[ignore = "wall clock"]\n')
        self.assertEqual(violations({'engine/src/a.rs': ignored}), [])
        self.assertEqual(len(violations({'engine/src/a.rs': TIMED.format(name='listed_budget')})), 1)
        unlisted = TIMED.format(name='other').replace('#[test]\n', '#[test]\n    #[ignore]\n')
        self.assertEqual(len(violations({'engine/src/a.rs': unlisted})), 1)

    def test_modules_engine_gates_runs_are_exempt(self):
        self.assertEqual(violations({'engine/tests/perf_regression_gates.rs': TIMED.format(name='x'),
                                     'engine/tests/sparse_shell_gates.rs': TIMED.format(name='y')}), [])
        self.assertEqual(len(violations({'engine/tests/other.rs': TIMED.format(name='z')})), 1)

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
