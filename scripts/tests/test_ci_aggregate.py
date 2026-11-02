import pathlib
import re
import unittest

ROOT = pathlib.Path(__file__).resolve().parents[2]


class CiAggregate(unittest.TestCase):
    def test_every_blocking_job_is_required(self):
        workflow = (ROOT / '.github/workflows/ci.yml').read_text().split('\njobs:\n', 1)[1]
        jobs = set(re.findall(r'^  ([\w-]+):$', workflow, re.M))
        aggregate = workflow.split('  ci-ok:', 1)[1]
        needs = aggregate.split('    needs:\n', 1)[1].split('    steps:', 1)[0]
        dependency_list = re.findall(r'^      - ([\w-]+)$', needs, re.M)
        dependencies = set(dependency_list)
        self.assertEqual(len(dependency_list), len(dependencies))
        self.assertEqual(dependencies, jobs - {'ci-ok', 'e2e-flaky'})

    def test_ci_scripts_filter_covers_its_tests_and_inputs(self):
        workflow = (ROOT / '.github/workflows/ci.yml').read_text()
        paths = workflow.split('            ci_scripts:\n', 1)[1].split('\n\n', 1)[0]
        for path in ['scripts/tests/**', 'Makefile', 'Dockerfile']:
            self.assertIn(f"- '{path}'", paths)

    def test_wasm_builder_installs_clang_before_compilation(self):
        stage = (ROOT / 'Dockerfile').read_text().split('AS wasm-builder', 1)[1].split('AS web-builder', 1)[0]
        self.assertRegex(stage.split('wasm-pack build', 1)[0], r'apt-get install[^\n]*\bclang\b')


if __name__ == '__main__':
    unittest.main()
