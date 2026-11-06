import importlib.util
import pathlib
import tempfile
import unittest

ROOT = pathlib.Path(__file__).resolve().parents[2]
spec = importlib.util.spec_from_file_location('check_fail_closed', ROOT / 'scripts/check-fail-closed.py')
lint = importlib.util.module_from_spec(spec)
spec.loader.exec_module(lint)

DIRS = ('engine/src/postprocess',)


def run(files, allow=''):
    with tempfile.TemporaryDirectory() as d:
        root = pathlib.Path(d)
        for rel, text in files.items():
            p = root / rel
            p.parent.mkdir(parents=True, exist_ok=True)
            p.write_text(text)
        return lint.check(root, allow, DIRS)


class FailClosedLint(unittest.TestCase):
    def test_each_fallback_is_caught(self):
        for line in (
            'let r = if c > 0.0 { d / c } else { 0.0 };',
            'let r = if c > 0.0 { d / c } else { 0 };',
            'let r = if c > 0.0 { d / c } else { 0_f64 };',
            'let c = m.cap.unwrap_or(0.0);',
            'let c = m.cap.unwrap_or(0);',
            'let c = m.cap.unwrap_or( 0.0f64 );',
            'let c = phi_vn.max(0.0);',
        ):
            with self.subTest(line=line):
                problems = run({'engine/src/postprocess/a.rs': f'fn f() {{\n    {line}\n}}\n'})
                self.assertEqual(len(problems), 1, problems)
                self.assertIn('engine/src/postprocess/a.rs:2:', problems[0])

    def test_a_fallback_split_over_lines_is_caught(self):
        src = 'fn f(c: f64, d: f64) -> f64 {\n    if c > 0.0 {\n        d / c\n    } else {\n        0.0\n    }\n}\n'
        problems = run({'engine/src/postprocess/a.rs': src})
        self.assertEqual(len(problems), 1, problems)
        self.assertIn('a.rs:4:', problems[0])

    def test_other_values_comments_strings_and_tests_are_not_fallbacks(self):
        src = (
            'fn f(c: f64) -> f64 {\n'
            '    // if c > 0.0 { d / c } else { 0.0 }\n'
            '    /* x.unwrap_or(0.0) */\n'
            '    let s = "else { 0.0 }";\n'
            '    let k = x.unwrap_or(0.75);\n'
            '    let r = if c > 0.0 { 1.0 / c } else { f64::INFINITY };\n'
            '    let m = c.max(0.5);\n'
            '    r\n'
            '}\n'
            '#[cfg(test)]\n'
            'mod tests {\n'
            '    fn g() -> f64 { if true { 1.0 } else { 0.0 } }\n'
            '}\n'
        )
        self.assertEqual(run({'engine/src/postprocess/a.rs': src}), [])

    def test_only_the_three_directories_are_scanned(self):
        self.assertEqual(run({'engine/src/solver/a.rs': 'fn f() { let c = x.unwrap_or(0.0); }\n'}), [])

    def test_an_allowed_line_passes_once_per_entry(self):
        src = 'fn f() {\n    let c = m.cap.unwrap_or(0.0);\n    let c = m.cap.unwrap_or(0.0);\n}\n'
        once = '## absent is zero\nengine/src/postprocess/a.rs: let c = m.cap.unwrap_or(0.0);\n'
        problems = run({'engine/src/postprocess/a.rs': src}, once)
        self.assertEqual(len(problems), 1, problems)
        self.assertIn('a.rs:3:', problems[0])
        self.assertEqual(run({'engine/src/postprocess/a.rs': src}, once + 'engine/src/postprocess/a.rs: let c = m.cap.unwrap_or(0.0);\n'), [])

    def test_an_entry_needs_a_reason(self):
        src = 'fn f() {\n    let c = m.cap.unwrap_or(0.0);\n}\n'
        problems = run({'engine/src/postprocess/a.rs': src}, 'engine/src/postprocess/a.rs: let c = m.cap.unwrap_or(0.0);\n')
        self.assertTrue(any('no "## reason"' in p for p in problems), problems)
        self.assertTrue(any('a.rs:2:' in p for p in problems), problems)

    def test_a_stale_entry_fails(self):
        problems = run({'engine/src/postprocess/a.rs': 'fn f() {}\n'}, '## gone\nengine/src/postprocess/a.rs: let c = m.cap.unwrap_or(0.0);\n')
        self.assertEqual(problems, ['allow-list entry no longer matches: engine/src/postprocess/a.rs: let c = m.cap.unwrap_or(0.0);'])

    def test_the_repository_is_clean(self):
        self.assertEqual(lint.check(ROOT, lint.ALLOW.read_text()), [])


if __name__ == '__main__':
    unittest.main()
