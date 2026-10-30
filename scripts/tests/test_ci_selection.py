"""Selection contract and workflow wiring; no engine, node or browser work."""
import importlib.util
import json
import re
import os
import runpy
from unittest.mock import patch
from pathlib import Path
import subprocess
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[2]
spec = importlib.util.spec_from_file_location('selection', ROOT / '.github/scripts/select-ci.py')
selection = importlib.util.module_from_spec(spec)
spec.loader.exec_module(selection)


class Selection(unittest.TestCase):
    def test_categories(self):
        for paths, scope, enabled in [
            (['docs/a.md', 'README.md', 'changelog.d/a.md'], 'docs', set()),
            (['research/a.rs', 'web/src/components/research/a.svelte', 'web/e2e/research-new.spec.ts', 'changelog.d/a.md'], 'research', {'docker', 'web', 'web_build', 'research'}),
            (['web/src/components/tools/a.svelte'], 'tools', {'docker', 'web', 'web_build', 'research'}),
            (['engine/src/lib.rs', 'README.md'], 'engine', {'docker', 'web', 'web_build', 'engine', 'ai_backend', 'research', 'determinism', 'results'}),
        ]:
            with self.subTest(scope=scope):
                result = selection.select('pull_request', paths)
                self.assertEqual(result['scope'], scope)
                self.assertEqual({k for k, v in result.items() if v == 'true'}, enabled)
                self.assertEqual(json.loads(result['e2e_shards']), [1])
                self.assertEqual(json.loads(result['e2e_specs']), selection.SPECS.get(scope, []))

    def test_every_web_scope_runs_typechecking(self):
        for path in ['docs/a.md', 'research/a.rs', 'web/src/components/tools/a.svelte',
                     'engine/src/lib.rs', 'web/src/App.svelte']:
            result = selection.select('pull_request', [path])
            self.assertEqual(result['web_build'], result['web'])
            self.assertEqual(result['docker'], result['web'])
        workflow = (ROOT / '.github/workflows/ci.yml').read_text()
        build = workflow.split('  web-build:', 1)[1].split('  results-snapshot:', 1)[0]
        self.assertIn("if: needs.changes.outputs.web_build == 'true'", build)
        self.assertIn('make typecheck.web', build)

    def test_product_only_pr_and_merge_queue_do_not_select_research_isolation(self):
        workflow = (ROOT / '.github/workflows/research.yml').read_text()
        scope = workflow.split('        id: scope\n', 1)[1].split('      - uses:', 1)[0]
        script = scope.split('        run: |\n', 1)[1]
        script = '\n'.join(line[10:] for line in script.splitlines())
        patterns = dict(re.findall(r"          (RESEARCH_PATHS|NOT_SHIPPED): '([^']+)'", scope))
        ci = (ROOT / '.github/workflows/ci.yml').read_text()
        self.assertNotIn('force_routes', ci + workflow)
        self.assertIn('github.event.pull_request.base.sha || github.event.merge_group.base_sha', scope)
        self.assertNotIn('github.event_name', scope)
        for event in ['pull_request', 'merge_group']:
            for path, expected in [('web/src/App.svelte', 'false'),
                                   ('web/src/components/research/ResearchPage.svelte', 'true')]:
                with self.subTest(event=event, path=path), tempfile.TemporaryDirectory() as tmp:
                    result = selection.select(event, [path])
                    self.assertEqual(result['research'], 'true')
                    output = Path(tmp) / 'output'
                    # Execute the actual workflow selector, substituting only the read-only diff.
                    script_with_diff = 'git() { printf "%s\\n" "$CHANGED_PATH"; }\n' + script
                    env = {**os.environ, **patterns, 'BASE': 'base', 'GITHUB_EVENT_NAME': event,
                           'GITHUB_OUTPUT': str(output), 'CHANGED_PATH': path}
                    subprocess.run(['sh', '-eu', '-c', script_with_diff], env=env, check=True)
                    self.assertEqual(output.read_text().strip(), 'research=' + expected)
        self.assertIn('budget_arg=--product-budget', workflow)
        self.assertIn('if [ "$RESEARCH_ISOLATION" = true ]; then budget_arg=; fi', workflow)

    def test_unsure_is_full(self):
        for paths in [None, [], {}, [None], ['../docs/x'], ['web/src/App.svelte'],
                      ['web/src/lib/a.ts'], ['package.json'], ['flake.lock'],
                      ['.github/workflows/ci.yml'], ['.github/scripts/select-ci.py'],
                      ['research/x', 'engine/x'], ['research/x', 'web/src/components/tools/x'],
                      ['web/e2e/fixtures.ts'], ['web/package-lock.json']]:
            with self.subTest(paths=paths):
                self.assert_full(selection.select('pull_request', paths))

    def assert_full(self, result):
        self.assertEqual(result['scope'], 'full')
        self.assertEqual(json.loads(result['e2e_shards']), list(range(1, 11)))
        self.assertEqual(result['unit_area'], '')
        for key in ['engine', 'web', 'research', 'docker', 'backend', 'ai_backend', 'ci_scripts', 'web_build', 'flaky', 'determinism', 'results']:
            self.assertEqual(result[key], 'true', key)

    def test_trusted_events_and_label_are_always_full(self):
        for event in ['merge_group', 'push', 'workflow_dispatch', None]:
            for paths in [[], ['docs/a'], ['research/a'], ['engine/a']]:
                self.assert_full(selection.select(event, paths))
        self.assert_full(selection.select('pull_request', ['research/a'], force_full=True))

    def test_missing_area_tests_fall_back_to_full(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            self.assert_full(selection.select('pull_request', ['web/src/components/tools/x'], root))
            unit = root / 'web/src/components/tools/a.test.ts'
            unit.parent.mkdir(parents=True)
            unit.touch()
            e2e = root / 'web/e2e/tools-new.spec.ts'
            e2e.parent.mkdir(parents=True)
            e2e.touch()
            self.assertEqual(selection.select('pull_request', ['web/src/components/tools/x'], root)['scope'], 'tools')
        self.assertEqual(selection.select('pull_request', ['research/a'], ROOT)['scope'], 'research')

    def test_engine_specs_are_tagged_and_research_globs_exist(self):
        for glob in selection.SPECS['research'] + selection.SPECS['engine']:
            files = list((ROOT / 'web/e2e').glob(glob))
            self.assertTrue(files, glob)
            if glob in selection.SPECS['engine']:
                for file in files:
                    self.assertIn('@engine @smoke', file.read_text())

    def test_rename_and_missing_history_cannot_narrow(self):
        for diff in ['docs/moved.md\0web/src/App.svelte\0', None]:
            with tempfile.TemporaryDirectory() as tmp:
                output = Path(tmp) / 'outputs'
                env = {'GITHUB_EVENT_NAME': 'pull_request', 'CHANGED_FILES': '["docs/moved.md"]',
                       'BASE_SHA': 'base', 'HEAD_SHA': 'head', 'GITHUB_OUTPUT': str(output)}
                replies = ['merge-base', diff] if diff else subprocess.CalledProcessError(1, 'git')
                with patch.dict(os.environ, env, clear=True), patch('subprocess.check_output', side_effect=replies):
                    runpy.run_path(str(ROOT / '.github/scripts/select-ci.py'), run_name='__main__')
                self.assertIn('scope=full', output.read_text())

    def test_e2e_runner_passes_real_specs_and_engine_tag(self):
        with patch.dict(os.environ, {'E2E_SPECS': '["basic-pdelta.spec.ts"]', 'CI_SCOPE': 'engine'}), patch('pathlib.Path.glob', return_value=[Path('e2e/basic-pdelta.spec.ts')]), patch('subprocess.run') as run:
            runpy.run_path(str(ROOT / '.github/scripts/run-area-e2e.py'))
        args = run.call_args.args[0]
        self.assertIn('e2e/basic-pdelta.spec.ts', args)
        self.assertIn('@engine', args[args.index('--grep') + 1])
        self.assertNotIn('--pass-with-no-tests', args)

    def test_workflow_wiring(self):
        text = (ROOT / '.github/workflows/ci.yml').read_text()
        self.assertIn('shard: ${{ fromJSON(needs.changes.outputs.e2e_shards) }}', text)
        self.assertIn('CHANGED_FILES: ${{ steps.filter.outputs.all_files }}', text)
        self.assertIn("if: github.event_name != 'pull_request' || contains", text)
        for key in selection.select('push', []):
            self.assertIn('${{ steps.select.outputs.' + key + ' }}', text)
        for name in ['rust', 'npm']:
            block = re.split(r'\n  [a-z][\w-]*:', text.split('\n  ' + name + ':', 1)[1])[0]
            self.assertIn('needs: ci-ok', block)
            self.assertIn('if: always()', block)
        aggregate = text.split('  ci-ok:', 1)[1].split('\n  rust:', 1)[0]
        script = aggregate.split('        run: |\n', 1)[1]
        script = '\n'.join(line[10:] for line in script.splitlines())
        for result, code in [('success skipped', 0), ('failure skipped', 1), ('cancelled success', 1)]:
            self.assertEqual(subprocess.run(['sh', '-c', script], env={'RESULTS': result}, capture_output=True).returncode, code)


if __name__ == '__main__':
    unittest.main()
