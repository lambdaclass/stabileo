import pathlib
import re
import unittest

ROOT = pathlib.Path(__file__).resolve().parents[2]
WORKFLOWS = ROOT / '.github/workflows'
SAME_REPO = 'github.event.pull_request.head.repo.full_name == github.repository'
NOT_DEPENDABOT = "github.event.pull_request.user.login != 'dependabot[bot]'"


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
                    self.assertIn("github.event_name != 'pull_request'", runs_on, name)
                if labels(runs_on):
                    self.assertIn("vars.STABILEO_SELF_HOSTED == 'true'", runs_on, name)

    def test_routing(self):
        ci = jobs('ci.yml')
        hosted = {name for name, job in ci.items() if job.get('runs-on') == 'ubuntu-24.04'}
        self.assertEqual(hosted, {'changes', 'docker-smoke', 'determinism', 'timing-budgets', 'ci-ok'})
        for name in ['test-engine-gates', 'web-unit']:
            self.assertEqual(labels(ci[name]['runs-on']), {'stabileo-timing'})
        self.assertEqual(labels(jobs('research.yml')['engine-benchmarks']['runs-on']), {'stabileo-timing'})
        self.assertEqual(labels(ci['wasm']['runs-on']), {'stabileo', 'stabileo-pr'})

    def test_wall_clock_budgets_run_alone_on_the_timing_pool_outside_the_merge_queue(self):
        ci = jobs('ci.yml')
        timing = ci['web-timing']
        self.assertEqual(labels(timing['runs-on']), {'stabileo-timing'})
        self.assertIn("github.event_name != 'merge_group'", timing['if'])
        self.assertIn('make test.web.timing', timing['block'])
        self.assertNotIn('test.web.timing', ci['web-build']['block'])
        makefile = (ROOT / 'Makefile').read_text()
        build = makefile.split('\ntest.web.build:\n', 1)[1].split('\n\n', 1)[0]
        self.assertIn('--project build', build)
        self.assertNotIn('--project timing', build)
        self.assertIn('npx vitest run --project timing', makefile.split('\ntest.web.timing:\n', 1)[1].split('\n\n', 1)[0])

    def test_nightly_fuzz_never_takes_a_ci_runner(self):
        fuzz = jobs('nightly.yml')['fuzz']['runs-on']
        self.assertEqual(labels(fuzz), {'stabileo-nightly'})
        self.assertIn("vars.STABILEO_NIGHTLY_POOL == 'true'", fuzz)
        for name, job in jobs('nightly.yml').items():
            self.assertNotIn('stabileo-pr', labels(job.get('runs-on', '')), name)

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
