import pathlib
import re
import unittest

ROOT = pathlib.Path(__file__).resolve().parents[2]
WORKFLOWS = ROOT / '.github/workflows'
SAME_REPO = 'github.event.pull_request.head.repo.full_name == github.repository'
NOT_DEPENDABOT = "github.event.pull_request.user.login != 'dependabot[bot]'"
TRUSTED = "(github.event_name == 'merge_group' || github.ref == 'refs/heads/main')"


def parse(text):
    body = text.split('\njobs:\n', 1)[1]
    out = {}
    for name, block in re.findall(r'^  ([\w-]+):\n((?:(?:    .*|\s*)\n)*)', body + '\n', re.M):
        job = {key: value.strip() for key, value in re.findall(r'^    ([\w-]+):(.*)$', block, re.M)}
        job['block'] = block
        out[name] = job
    return out


def jobs(name):
    return parse((WORKFLOWS / name).read_text())


def concurrency(name):
    text = (WORKFLOWS / name).read_text()
    block = text.split('\nconcurrency:\n', 1)[1].split('\n\n', 1)[0]
    return dict((k, v.strip()) for k, v in re.findall(r'^  ([\w-]+):(.*)$', block, re.M))


def labels(runs_on):
    return set(re.findall(r'"(stabileo[\w-]*)"', runs_on))


class CiRunners(unittest.TestCase):
    def test_every_job_has_a_timeout(self):
        for path in WORKFLOWS.glob('*.yml'):
            for name, job in parse(path.read_text()).items():
                if 'uses' not in job:
                    self.assertIn('timeout-minutes', job, f'{path.name}: {name}')

    def test_ci_jobs_fall_back_to_github_and_keep_forks_off_the_host(self):
        for workflow in ['ci.yml', 'research.yml', 'supply-chain.yml']:
            for name, job in jobs(workflow).items():
                runs_on = job.get('runs-on')
                if runs_on is None:
                    continue
                self.assertTrue(runs_on == 'ubuntu-24.04' or runs_on.endswith("|| 'ubuntu-24.04' }}"), name)
                self.assertNotIn('stabileo-nightly', labels(runs_on), name)
                if 'stabileo-pr' in labels(runs_on):
                    self.assertIn(SAME_REPO, runs_on, name)
                    self.assertIn(NOT_DEPENDABOT, runs_on, name)
                    self.assertIn("vars.STABILEO_PR_POOL == 'true'", runs_on, name)
                if labels(runs_on) & {'stabileo', 'stabileo-timing'}:
                    self.assertIn(TRUSTED, runs_on, name)
                    self.assertNotIn("github.event_name != 'pull_request'", runs_on, name)
                if labels(runs_on):
                    self.assertIn("vars.STABILEO_SELF_HOSTED == 'true'", runs_on, name)

    def test_routing(self):
        ci = jobs('ci.yml')
        hosted = {name for name, job in ci.items() if job.get('runs-on') == 'ubuntu-24.04'}
        self.assertEqual(hosted, {'changes', 'docker-smoke', 'determinism', 'timing-budgets', 'e2e', 'e2e-flaky', 'ci-ok',
                                  'test-ci-scripts', 'lint-backend', 'check-migrations-immutable', 'check-migrations', 'results-snapshot'})
        self.assertEqual({name for name, job in jobs('research.yml').items() if job.get('runs-on') == 'ubuntu-24.04'}, {'isolation', 'catalog'})
        for name in ['test-engine-gates', 'web-unit']:
            self.assertEqual(labels(ci[name]['runs-on']), {'stabileo-timing'})
        self.assertEqual(labels(jobs('research.yml')['engine-benchmarks']['runs-on']), {'stabileo-timing'})
        self.assertEqual(labels(ci['wasm']['runs-on']), {'stabileo', 'stabileo-pr'})

    def test_a_same_repo_pull_request_on_github_while_the_pool_is_on_warns(self):
        lint = jobs('ci.yml')['wasm']
        self.assertEqual(lint['if'], "needs.changes.outputs.web == 'true'")
        self.assertIn('stabileo-pr', labels(lint['runs-on']))
        first = lint['block'].split('    steps:\n', 1)[1].split('\n      - ', 1)[0]
        self.assertIn('name: Pull request pool in use', first)
        for term in ["vars.STABILEO_PR_POOL == 'true'", "github.event_name == 'pull_request'", SAME_REPO, NOT_DEPENDABOT, "runner.environment != 'self-hosted'"]:
            self.assertIn(term, first)
        self.assertIn('::warning ', first)

    def test_pull_requests_take_the_host_only_for_their_critical_path_builds(self):
        pr = set()
        for workflow in ['ci.yml', 'research.yml']:
            for name, job in jobs(workflow).items():
                if 'stabileo-pr' in labels(job.get('runs-on', '')):
                    pr.add(f'{workflow}:{name}')
        self.assertEqual(pr, {'ci.yml:wasm', 'ci.yml:research-wasm', 'ci.yml:site-e2e'})

    def test_jobs_use_a_github_runners_threads_wherever_they_run(self):
        caps = {'CARGO_BUILD_JOBS': '4', 'RUST_TEST_THREADS': '4', 'NEXTEST_TEST_THREADS': '4', 'RAYON_NUM_THREADS': '4',
                'VITEST_MAX_THREADS': '3', 'VITEST_MAX_FORKS': '3', 'BINARYEN_CORES': '4', 'GOMAXPROCS': '4'}
        for workflow in ['ci.yml', 'research.yml']:
            text = (WORKFLOWS / workflow).read_text()
            block = text.split('\nenv:\n', 1)[1].split('\n\n', 1)[0]
            env = dict((k, v.strip()) for k, v in re.findall(r'^  ([A-Z_]+):(.*)$', block, re.M))
            for key, value in caps.items():
                with self.subTest(workflow=workflow, key=key):
                    self.assertEqual(env.get(key), value)
            for name, job in parse(text).items():
                with self.subTest(workflow=workflow, job=name):
                    self.assertIsNone(re.search(r'^\s+(%s):' % '|'.join(caps), job['block'], re.M))

    def test_nightly_fuzz_never_takes_a_ci_runner(self):
        fuzz = jobs('nightly.yml')['fuzz']['runs-on']
        self.assertEqual(labels(fuzz), {'stabileo-nightly'})
        self.assertIn("vars.STABILEO_NIGHTLY_POOL == 'true'", fuzz)
        for name, job in jobs('nightly.yml').items():
            self.assertNotIn('stabileo-pr', labels(job.get('runs-on', '')), name)

    def test_browser_jobs_can_be_capped_to_the_e2e_pool(self):
        ci = jobs('ci.yml')
        browser = {name for name, job in ci.items() if 'stabileo-e2e' in labels(job.get('runs-on', ''))}
        self.assertEqual(browser, {'site-e2e'})
        for name in browser:
            runs_on = ci[name]['runs-on']
            self.assertIn("(vars.STABILEO_E2E_POOL == 'true' && fromJSON('[\"self-hosted\",\"stabileo-e2e\"]') || fromJSON('[\"self-hosted\",\"stabileo\"]'))", runs_on, name)
            self.assertLess(runs_on.index(TRUSTED), runs_on.index('STABILEO_E2E_POOL'), name)
        for workflow in ['research.yml', 'supply-chain.yml', 'nightly.yml']:
            for name, job in jobs(workflow).items():
                self.assertNotIn('stabileo-e2e', labels(job.get('runs-on', '')), name)

    def test_nightly_mutants_prefer_the_nightly_pool(self):
        mutants = jobs('nightly.yml')['mutants']['runs-on']
        self.assertEqual(labels(mutants), {'stabileo-nightly', 'stabileo'})
        self.assertIn("vars.STABILEO_NIGHTLY_POOL == 'true' && fromJSON('[\"self-hosted\",\"stabileo-nightly\"]') || fromJSON('[\"self-hosted\",\"stabileo\"]')", mutants)
        self.assertIn("github.ref == 'refs/heads/main'", mutants)
        self.assertTrue(mutants.endswith("|| 'ubuntu-24.04' }}"))

    def test_superseded_runs_cancel_but_main_never_does(self):
        for workflow in ['ci.yml', 'research.yml', 'supply-chain.yml']:
            group = concurrency(workflow)
            self.assertIn("github.event_name == 'pull_request' && github.ref || github.run_id", group['group'])
            self.assertEqual(group['cancel-in-progress'], "${{ github.event_name == 'pull_request' }}")
        self.assertEqual(concurrency('nightly.yml')['cancel-in-progress'], 'false')

    def test_self_hosted_backend_tests_use_a_port_of_their_own(self):
        block = jobs('ci.yml')['test-backend']['block']
        port = block.split("- name: A PostgreSQL port of this runner's own\n", 1)[1].split('- name:', 1)[0]
        self.assertIn('PGPORT=', port)
        stop = block.split('- name: Stop PostgreSQL\n', 1)[1]
        self.assertIn('if: always()', stop)
        self.assertLess(block.index('make test.backend'), block.index('- name: Stop PostgreSQL'))
        self.assertIn('PG_PORT = $(or $(PGPORT),5452)', (ROOT / 'Makefile').read_text())


if __name__ == '__main__':
    unittest.main()
