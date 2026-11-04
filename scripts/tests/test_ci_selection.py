"""Selection contract and workflow wiring; no engine, node or browser work."""
import importlib.util
import json
import re
import os
import runpy
from unittest.mock import patch
from pathlib import Path
import subprocess
import sys
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
            (['web/src/components/tools/a.svelte'], 'tools', {'docker', 'web', 'web_build', 'research', 'research_route_only'}),
            (['engine/src/lib.rs', 'README.md'], 'engine', {'docker', 'web', 'web_build', 'engine', 'ai_backend', 'research', 'determinism', 'results'}),
        ]:
            with self.subTest(scope=scope):
                result = selection.select('pull_request', paths)
                self.assertEqual(result['scope'], scope)
                self.assertEqual(result['retest'], 'true')
                self.assertEqual({k for k, v in result.items() if v == 'true'} - {'retest'}, enabled)
                self.assertEqual(json.loads(result['e2e_shards']), [1])
                self.assertEqual(json.loads(result['e2e_specs']), selection.SPECS.get(scope, []))

    def test_a_pull_request_builds_docker_from_source_only_when_its_recipe_or_pins_change(self):
        for paths in [['Dockerfile'], ['.dockerignore'], ['Cargo.lock'], ['engine/Cargo.toml'], ['rust-toolchain.toml'],
                      ['web/package-lock.json'], ['.nvmrc'], ['engine/.cargo/config.toml'],
                      ['research/fracture/shauer-2025/wasm/build.sh'], ['research/tools/publish_assets.py'],
                      ['web/scripts/check-research-springs.mjs'], ['web/src/App.svelte', 'Cargo.lock']]:
            with self.subTest(paths=paths):
                self.assertEqual(selection.select('pull_request', paths)['docker_source'], 'true')
        for paths in [['web/src/App.svelte'], ['engine/src/lib.rs'], ['research/fracture/shauer-2025/src/lib.rs'],
                      ['.github/workflows/ci.yml'], ['ai-backend/src/main.rs']]:
            with self.subTest(paths=paths):
                result = selection.select('pull_request', paths)
                self.assertEqual((result['docker'], result['docker_source']), ('true', 'false'))
        self.assertEqual(selection.select('pull_request', ['docs/a.md'])['docker_source'], 'false')
        self.assertEqual(selection.select('pull_request', ['web/src/App.svelte'], force_full=True)['docker_source'], 'true')
        for paths in [None, [], [None]]:
            with self.subTest(paths=paths):
                self.assertEqual(selection.select('pull_request', paths)['docker_source'], 'true')
        for event in ['push', 'schedule', 'workflow_dispatch']:
            self.assertEqual(selection.select(event, ['web/src/App.svelte'])['docker_source'], 'true')
        self.assertEqual(selection.select('merge_group', [])['docker_source'], 'false')
        smoke = (ROOT / '.github/workflows/ci.yml').read_text().split('\n  docker-smoke:\n', 1)[1].split('\n  lint-repo:', 1)[0]
        source = smoke.split('docker build --tag stabileo-source-smoke .', 1)[0].rsplit('      - ', 1)[1]
        self.assertIn("if: needs.changes.outputs.docker_source == 'true'", source)
        self.assertNotIn('if:', smoke.split('docker build --build-arg FRONTEND_STAGE=web-prebuilt', 1)[0].rsplit('      - ', 1)[1])

    def test_every_web_scope_runs_typechecking(self):
        for path in ['docs/a.md', 'research/a.rs', 'web/src/components/tools/a.svelte',
                     'engine/src/lib.rs', 'web/src/App.svelte', 'research/fracture/shauer-2025/NOTES.md']:
            result = selection.select('pull_request', [path])
            self.assertEqual(result['web_build'], result['web'])
            self.assertEqual(result['docker'], result['web'])
        workflow = (ROOT / '.github/workflows/ci.yml').read_text()
        build = workflow.split('  web-build:', 1)[1].split('  results-snapshot:', 1)[0]
        self.assertIn("if: needs.changes.outputs.web_build == 'true'", build)
        self.assertIn('make typecheck.web', build)

    def test_product_only_pr_and_merge_queue_do_not_select_research_isolation(self):
        workflow = (ROOT / '.github/workflows/research.yml').read_text()
        scope = workflow.split('        id: scope\n', 1)[1].split('\n      - ', 1)[0]
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
                    env = {**os.environ, **patterns, 'BASE': 'base', 'CANDIDATE': 'head', 'GITHUB_EVENT_NAME': event,
                           'GITHUB_OUTPUT': str(output), 'CHANGED_PATH': path, 'RUNNER_TEMP': tmp}
                    subprocess.run(['bash', '-eu', '-c', script_with_diff], env=env, check=True, stdout=subprocess.DEVNULL)
                    self.assertEqual(output.read_text().strip(), 'research=' + expected)
        self.assertIn('RESEARCH_ISOLATION: ${{ steps.scope.outputs.research }}', workflow)
        self.assertIn('web/scripts/product-route-growth-budgets.json route-main/web/scripts/', workflow)
        self.assertNotIn('--product-budget', workflow)

    def test_unsure_is_full(self):
        for paths in [None, [], {}, [None], ['../docs/x'], ['package.json'], ['flake.lock'],
                      ['.github/workflows/ci.yml'], ['.github/scripts/select-ci.py'],
                      ['research/x', 'engine/x'], ['research/x', 'web/src/components/tools/x'],
                      ['web/package-lock.json'], ['web/package.json'], ['web/src/lib/wasm/stabileo_engine.js'],
                      ['web/public/research-wasm/x.wasm'], ['web/vite.research-viewer.config.ts'],
                      ['web/src/App.svelte', 'engine/src/lib.rs'], ['web/src/App.svelte', 'research/a.rs'],
                      ['backend/mix.exs', 'docs/a.md']]:
            with self.subTest(paths=paths):
                self.assert_full(selection.select('pull_request', paths))

    SITE_SKIPS = ['engine', 'ai_backend', 'backend']
    SITE_RUNS = ['web', 'web_build', 'research', 'research_route_only', 'results', 'retest', 'ci_scripts']

    def assert_site(self, result, queue=False):
        self.assertEqual(result['scope'], 'site')
        for key in self.SITE_SKIPS:
            self.assertEqual(result[key], 'false', key)
        for key in self.SITE_RUNS:
            self.assertEqual(result[key], 'true', key)
        self.assertEqual(json.loads(result['e2e_shards']), list(range(1, 11)))
        self.assertEqual(result['unit_area'], '')
        for key in ['docker', 'determinism', 'flaky']:
            self.assertEqual(result[key], 'false' if queue else 'true', key)

    def assert_docs(self, result, research='false'):
        self.assertEqual(result['research'], research)
        for key in ['engine', 'web', 'web_build', 'docker', 'ai_backend', 'backend', 'ci_scripts', 'results', 'determinism', 'flaky']:
            self.assertEqual(result[key], 'false', key)

    # PR #1250 (copy/pro-finished, merged 196621a64): locale strings, blog posts and two components.
    PR_1250 = ['README.md', 'changelog.d/pro-mode-no-longer-in-development.md', 'web/e2e/prerender.spec.ts',
               'web/src/App.svelte', 'web/src/components/landing/LandingProCalc.svelte',
               'web/src/components/pro/ProAdvancedTab.svelte', 'web/src/lib/blog/pages/cirsoc.ts',
               'web/src/lib/blog/posts/bars-or-finite-elements.ts',
               'web/src/lib/blog/translations/de/page-cirsoc.ts', 'web/src/lib/i18n/__tests__/pro-copy.test.ts',
               'web/src/lib/i18n/locales/en.ts', 'web/src/lib/i18n/locales/es.ts', 'web/src/lib/i18n/pro-copy.ts']
    # PR #1344's docs-only companion shape: roadmap and changelog fragments only (docs/roadmap-2026-11-03).
    DOCS_ONLY = ['docs/roadmap/PRODUCT_ROADMAP.md', 'changelog.d/ci-infra-auto-retry.md', 'CONTRIBUTING.md']

    def test_site_changes_skip_only_the_engine_side(self):
        for paths in [self.PR_1250, ['web/src/lib/i18n/locales/fr.ts'], ['web/src/lib/blog/posts/x.ts'],
                      ['web/e2e/fixtures.ts'], ['web/scripts/prerender.ts', 'docs/a.md'],
                      ['web/scripts/product-route-growth-budgets.json']]:
            with self.subTest(paths=paths[:2]):
                self.assert_site(selection.select('pull_request', paths))

    def test_docs_and_research_prose_skip_every_build(self):
        self.assertEqual(selection.select('pull_request', self.DOCS_ONLY)['scope'], 'docs')
        self.assert_docs(selection.select('pull_request', self.DOCS_ONLY))
        prose = ['research/fracture/shauer-2025/README.md', 'research/DESIGN.md', 'changelog.d/a.md']
        self.assertEqual(selection.select('pull_request', prose)['scope'], 'prose')
        self.assert_docs(selection.select('pull_request', prose), research='true')
        self.assertEqual(selection.select('pull_request', ['research/papers.yaml', 'research/DESIGN.md'])['scope'], 'research')

    def test_merge_queue_groups_are_scoped_by_their_combined_changes(self):
        docs = selection.select('merge_group', self.DOCS_ONLY)
        self.assertEqual(docs['scope'], 'docs')
        self.assert_docs(docs)
        self.assertEqual(docs['slow_e2e'], 'false')
        for paths in [self.PR_1250, self.PR_1250 + ['research/fracture/shauer-2025/src/lib.rs'],
                      ['web/src/components/tools/a.svelte', 'research/papers.yaml', 'docs/a.md'],
                      ['research/a.rs']]:
            with self.subTest(paths=paths[-1]):
                result = selection.select('merge_group', paths, ROOT)
                self.assert_site(result, queue=True)
        for paths in [self.PR_1250 + ['engine/src/lib.rs'], self.DOCS_ONLY + ['engine/src/solver/linear.rs'],
                      ['web/src/App.svelte', 'Cargo.lock'], ['web/package-lock.json'], ['backend/mix.lock'],
                      ['.github/workflows/ci.yml'], ['engine/src/lib.rs']]:
            with self.subTest(paths=paths[-1]):
                result = selection.select('merge_group', paths, ROOT)
                self.assertEqual(result['scope'], 'full')
                for key in ['engine', 'ai_backend', 'backend', 'ci_scripts', 'web', 'research', 'results']:
                    self.assertEqual(result[key], 'true', key)
                self.assertEqual(result['research_route_only'], 'true')

    def test_merge_queue_reads_its_diff_and_fails_open(self):
        for diff, expected in [('docs/a.md\0changelog.d/b.md\0', 'docs'), ('web/src/App.svelte\0', 'site'),
                               ('web/src/App.svelte\0engine/src/lib.rs\0', 'full'), ('', 'full'), (None, 'full')]:
            with self.subTest(diff=diff), tempfile.TemporaryDirectory() as tmp:
                output = Path(tmp) / 'outputs'
                env = {'GITHUB_EVENT_NAME': 'merge_group', 'BASE_SHA': 'base', 'HEAD_SHA': 'head',
                       'GITHUB_OUTPUT': str(output)}
                replies = ['base', 'head base\n', diff] if diff is not None else subprocess.CalledProcessError(128, 'git')
                with patch.dict(os.environ, env, clear=True), patch('subprocess.check_output', side_effect=replies) as git:
                    runpy.run_path(str(ROOT / '.github/scripts/select-ci.py'), run_name='__main__')
                self.assertIn(f'scope={expected}\n', output.read_text())
                if diff is not None:
                    self.assertEqual(git.call_args_list[2].args[0][-2:], ['base', 'head'])

    def queue(self, entries):
        with tempfile.TemporaryDirectory() as tmp:
            git = lambda *args: subprocess.run(['git', '-C', tmp, '-c', 'user.name=t', '-c', 'user.email=t@t', *args],
                                               check=True, capture_output=True, text=True).stdout.strip()
            git('init', '-q', '-b', 'main')
            Path(tmp, 'README.md').write_text('x')
            git('add', '-A')
            git('commit', '-qm', 'main')
            main = git('rev-parse', 'HEAD')
            group, scopes = main, []
            for number, paths in enumerate(entries):
                git('checkout', '-q', '-b', f'pr{number}', main)
                for path in paths:
                    Path(tmp, path).parent.mkdir(parents=True, exist_ok=True)
                    Path(tmp, path).write_text(str(number))
                git('add', '-A')
                git('commit', '-qm', f'pr{number}')
                git('checkout', '-q', '--detach', group)
                git('merge', '-q', '--no-ff', '--no-edit', f'pr{number}')
                group = git('rev-parse', 'HEAD')
                output = Path(tmp, '.git', 'outputs')
                output.write_text('')
                env = {'GITHUB_EVENT_NAME': 'merge_group', 'BASE_SHA': main, 'HEAD_SHA': group, 'GITHUB_OUTPUT': str(output),
                       'PATH': os.environ['PATH'], 'HOME': tmp}
                result = subprocess.run([sys.executable, '-I', str(ROOT / '.github/scripts/select-ci.py')], cwd=tmp, env=env,
                                        capture_output=True, text=True)
                self.assertEqual(result.returncode, 0, result.stderr)
                scopes.append(dict(line.split('=', 1) for line in output.read_text().splitlines())['scope'])
            return scopes

    def test_each_merge_queue_entry_is_scoped_by_its_own_change(self):
        self.assertEqual(self.queue([['engine/src/lib.rs'], ['docs/a.md'], ['web/src/routes/a.svelte'], ['changelog.d/b.md']]),
                         ['full', 'docs', 'site', 'docs'])
        self.assertEqual(self.queue([['docs/a.md'], ['engine/src/solver.rs'], ['docs/b.md']]), ['docs', 'full', 'docs'])

    def test_a_queue_head_without_two_parents_falls_back_to_the_whole_group(self):
        with tempfile.TemporaryDirectory() as tmp:
            git = lambda *args: subprocess.run(['git', '-C', tmp, '-c', 'user.name=t', '-c', 'user.email=t@t', *args],
                                               check=True, capture_output=True, text=True).stdout.strip()
            git('init', '-q', '-b', 'main')
            Path(tmp, 'README.md').write_text('x')
            git('add', '-A')
            git('commit', '-qm', 'main')
            main = git('rev-parse', 'HEAD')
            Path(tmp, 'engine/src').mkdir(parents=True)
            Path(tmp, 'engine/src/lib.rs').write_text('x')
            git('add', '-A')
            git('commit', '-qm', 'engine')
            Path(tmp, 'docs').mkdir()
            Path(tmp, 'docs/a.md').write_text('x')
            git('add', '-A')
            git('commit', '-qm', 'docs')
            output = Path(tmp, 'outputs')
            env = {'GITHUB_EVENT_NAME': 'merge_group', 'BASE_SHA': main, 'HEAD_SHA': git('rev-parse', 'HEAD'),
                   'GITHUB_OUTPUT': str(output), 'PATH': os.environ['PATH'], 'HOME': tmp}
            subprocess.run([sys.executable, '-I', str(ROOT / '.github/scripts/select-ci.py')], cwd=tmp, env=env, check=True,
                           capture_output=True)
            self.assertIn('scope=full\n', output.read_text())
        workflow = (ROOT / '.github/workflows/ci.yml').read_text()
        self.assertIn('BASE_SHA: ${{ github.event.pull_request.base.sha || github.event.merge_group.base_sha }}', workflow)
        self.assertIn('HEAD_SHA: ${{ github.event.pull_request.head.sha || github.event.merge_group.head_sha }}', workflow)

    def test_site_scope_runs_the_whole_smoke_suite(self):
        workflow = (ROOT / '.github/workflows/ci.yml').read_text()
        self.assertIn("if: needs.changes.outputs.scope == 'full' || needs.changes.outputs.scope == 'site'", workflow)
        self.assertIn("if: needs.changes.outputs.scope != 'full' && needs.changes.outputs.scope != 'site'", workflow)

    def assert_full(self, result):
        self.assertEqual(result['scope'], 'full')
        self.assertEqual(json.loads(result['e2e_shards']), list(range(1, 11)))
        self.assertEqual(result['unit_area'], '')
        for key in ['engine', 'web', 'research', 'docker', 'backend', 'ai_backend', 'ci_scripts', 'web_build', 'flaky', 'determinism', 'results', 'retest']:
            self.assertEqual(result[key], 'true', key)

    def test_trusted_events_and_label_are_always_full(self):
        for event in ['push', 'schedule', 'workflow_dispatch', None]:
            for paths in [[], ['docs/a'], ['research/a'], ['engine/a']]:
                self.assert_full(selection.select(event, paths))
        self.assert_full(selection.select('pull_request', ['research/a'], force_full=True))

    def test_run_e2e_label_read_at_run_start_schedules_full_ci(self):
        workflow = (ROOT / '.github/workflows/ci.yml').read_text()
        trigger = re.search(r'^  pull_request:\n    types: \[(.*?)\]', workflow, re.MULTILINE)
        self.assertIsNotNone(trigger)
        self.assertEqual({value.strip() for value in trigger[1].split(',')},
                         {'opened', 'synchronize', 'reopened'})
        self.assertIn("FORCE_FULL: ${{ steps.labels.outputs.run_e2e == 'true' }}", workflow)
        event = {'pull_request': {'labels': [{'name': 'run-e2e'}]}}
        for labels, expected in [([], 'docs'), (event['pull_request']['labels'], 'full')]:
            with self.subTest(labels=labels), tempfile.TemporaryDirectory() as tmp:
                output = Path(tmp) / 'outputs'
                env = {'GITHUB_EVENT_NAME': 'pull_request', 'CHANGED_FILES': '["docs/a.md"]',
                       'BASE_SHA': 'base', 'HEAD_SHA': 'head', 'GITHUB_OUTPUT': str(output),
                       'FORCE_FULL': str(any(label['name'] == 'run-e2e' for label in labels)).lower()}
                with patch.dict(os.environ, env, clear=True), patch('subprocess.check_output', side_effect=['merge-base', 'docs/a.md\0']):
                    runpy.run_path(str(ROOT / '.github/scripts/select-ci.py'), run_name='__main__')
                result = dict(line.split('=', 1) for line in output.read_text().splitlines())
                self.assertEqual(result['scope'], expected)
                if expected == 'full':
                    self.assert_full(result)

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
        for diff in ['docs/moved.md\0Makefile\0', None]:
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

    def test_typecheck_covers_every_selected_web_scope(self):
        workflow = (ROOT / '.github/workflows/ci.yml').read_text()
        unit = workflow.split('  web-unit:', 1)[1].split('  web-build:', 1)[0]
        self.assertIn("if: needs.changes.outputs.web == 'true'", unit)
        self.assertIn('shard: [1, 2, 3, 4]', unit)
        build = workflow.split('  web-build:', 1)[1].split('  results-snapshot:', 1)[0]
        self.assertIn('run: make typecheck.web', build)
        self.assertEqual(workflow.count('run: make typecheck.web'), 1)
        for path in ['research/a.rs', 'web/src/components/tools/a.svelte',
                     'engine/src/lib.rs', 'web/src/App.svelte']:
            self.assertEqual(selection.select('pull_request', [path])['web'], 'true')
        self.assertEqual(selection.select('pull_request', ['docs/a.md'])['web'], 'false')
        self.assertEqual(selection.select('merge_group', [])['web'], 'true')

    def test_main_push_of_a_tree_the_queue_tested_runs_only_the_post_merge_additions(self):
        result = selection.select('push', None, tested=True)
        for key in ['backend', 'ci_scripts', 'ai_backend', 'engine', 'results', 'retest']:
            self.assertEqual(result[key], 'false', key)
        for key in ['web', 'web_build', 'docker', 'determinism', 'flaky', 'slow_e2e', 'research']:
            self.assertEqual(result[key], 'true', key)
        self.assertEqual(result['research_route_only'], 'false')
        self.assertEqual(json.loads(result['e2e_shards']), list(range(1, 11)))

    def test_every_other_main_push_or_event_runs_everything(self):
        self.assert_full(selection.select('push', None))
        for event in ['merge_group', 'pull_request', 'schedule', 'workflow_dispatch']:
            with self.subTest(event=event):
                self.assertEqual(selection.select(event, None, tested=True)['retest'], 'true')
                self.assertEqual(selection.select(event, None, tested=True)['engine'], 'true')

    def test_workflow_wiring(self):
        text = (ROOT / '.github/workflows/ci.yml').read_text()
        self.assertIn('shard: ${{ fromJSON(needs.changes.outputs.e2e_shards) }}', text)
        self.assertIn('CHANGED_FILES: ${{ steps.filter.outputs.all_files }}', text)
        self.assertIn("if: needs.changes.outputs.slow_e2e == 'true' || needs.changes.outputs.run_e2e == 'true'", text)
        for key in selection.select('push', []):
            self.assertIn('${{ steps.select.outputs.' + key + ' }}', text)
        self.assertNotIn('\n  rust:', text)
        self.assertNotIn('\n  npm:', text)
        aggregate = text.split('  ci-ok:', 1)[1]
        script = aggregate.split('        run: |\n', 1)[1]
        script = '\n'.join(line[10:] for line in script.splitlines())
        for result, code in [('success skipped', 0), ('failure skipped', 1), ('cancelled success', 1)]:
            self.assertEqual(subprocess.run(['sh', '-c', script], env={'RESULTS': result}, capture_output=True).returncode, code)


if __name__ == '__main__':
    unittest.main()
