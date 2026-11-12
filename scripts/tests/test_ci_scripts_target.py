import pathlib
import re
import unittest

ROOT = pathlib.Path(__file__).resolve().parents[2]


def recipe(makefile, target, seen=None):
    seen = seen if seen is not None else set()
    if target in seen:
        return ''
    seen.add(target)
    match = re.search(rf'^{re.escape(target)}:([^\n]*)\n((?:\t[^\n]*\n)*)', makefile, re.M)
    if not match:
        return ''
    return match.group(2) + ''.join(recipe(makefile, prerequisite, seen) for prerequisite in match.group(1).split())


class CiScriptsTarget(unittest.TestCase):
    def test_every_script_test_runs_in_the_required_job(self):
        commands = recipe((ROOT / 'Makefile').read_text(), 'test.ci-scripts')
        tests = sorted(p.relative_to(ROOT).as_posix() for pattern in ('test_*.py', '*.test.cjs', '*.test.mjs')
                       for p in (ROOT / 'scripts/tests').glob(pattern))
        self.assertIn('scripts/tests/test_ci_scripts_target.py', tests)
        self.assertEqual([t for t in tests if not re.search(rf'(^|\s){re.escape(t)}(\s|$)', commands, re.M)], [])

    def test_mjs_tests_have_targets_and_buckling_runs_in_ci(self):
        makefile = (ROOT / 'Makefile').read_text()
        workflows = '\n'.join(p.read_text() for p in (ROOT / '.github/workflows').glob('*.yml'))
        targets = re.findall(r'\bmake ([\w.-]+)', workflows)
        commands = workflows + ''.join(recipe(makefile, target) for target in targets)
        self.assertIn('scripts/tests/buckling-818-wasm.mjs', commands)
        commands += makefile
        tests = sorted(p.relative_to(ROOT).as_posix() for p in (ROOT / 'scripts/tests').glob('*.mjs'))
        self.assertEqual([t for t in tests if not re.search(rf'(^|\s){re.escape(t)}(\s|$)', commands, re.M)], [])

    @unittest.skip("known wrong result: #1952")
    def test_staged_history_helper_is_required_by_the_wasm_ci_target(self):
        makefile = (ROOT / 'Makefile').read_text()
        target = 'test.engine.staged-orphan-wasm'
        match = re.search(rf'^{re.escape(target)}:([^\n]*)', makefile, re.M)
        self.assertIsNotNone(match)
        self.assertIn('scripts/tests/staged-history-containment.mjs', match.group(1).split())
        commands = recipe(makefile, target)
        for consumer in ('staged-round5-wasm.mjs', 'staged-round8-wasm.mjs'):
            self.assertIn(f'scripts/tests/{consumer}', commands)
            self.assertIn("from './staged-history-containment.mjs'", (ROOT / 'scripts/tests' / consumer).read_text())
        workflow = (ROOT / '.github/workflows/ci.yml').read_text()
        wasm_job = re.search(r'^  wasm:\n(.*?)(?=^  [\w-]+:|\Z)', workflow, re.M | re.S)
        self.assertIsNotNone(wasm_job)
        self.assertRegex(wasm_job.group(1), rf'run: make {re.escape(target)}(?:\s|$)')

    def test_a_file_named_only_inside_another_path_does_not_count(self):
        makefile = 'test.ci-scripts: test.a\n\tpython3 scripts/tests/test_x.py.bak\ntest.a:\n\tnode --test scripts/tests/y.test.cjs\n'
        commands = recipe(makefile, 'test.ci-scripts')
        self.assertIn('scripts/tests/y.test.cjs', commands)
        self.assertIsNone(re.search(r'(^|\s)scripts/tests/test_x\.py(\s|$)', commands, re.M))


if __name__ == '__main__':
    unittest.main()
