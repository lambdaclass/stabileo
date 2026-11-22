import pathlib
import re
import subprocess
import unittest

ROOT = pathlib.Path(__file__).resolve().parents[2]


class CiAggregate(unittest.TestCase):
    def test_vitest_targets_honour_optional_worker_cap(self):
        for target in ['test.web.unit', 'test.web.unit.production', 'test.web.unit.switch-on', 'test.web.timing']:
            for workers in ['', '1', '2']:
                with self.subTest(target=target, workers=workers):
                    result = subprocess.run(
                        ['make', '--no-print-directory', '--dry-run', target,
                         f'VITEST_WORKERS={workers}'],
                        cwd=ROOT, check=True, capture_output=True, text=True,
                    )
                    caps = re.findall(r'--maxWorkers(?:=| +)([^ "\n]+)', result.stdout)
                    self.assertEqual(caps, [workers] if workers else [])

    def test_ci_vitest_jobs_limit_workers(self):
        workflow = (ROOT / '.github/workflows/ci.yml').read_text()
        for job in ['web-unit', 'web-unit-switch-on', 'timing-budgets']:
            with self.subTest(job=job):
                body = workflow.split(f'  {job}:\n', 1)[1]
                body = re.split(r'^  [\w-]+:', body, maxsplit=1, flags=re.M)[0]
                job_env = re.search(r'^    env:\n((?:^      .*\n)*)', body, re.M)
                self.assertIsNotNone(job_env, f'{job} must limit Vitest workers')
                self.assertRegex(job_env[1], r"(?m)^      VITEST_WORKERS: '2'$")

    def test_vitest_setup_does_not_drain_deferred_work_after_each_test(self):
        setup = (ROOT / 'web/vitest.setup.ts').read_text()
        self.assertEqual(re.findall(r'\bafterEach\s*\(', setup), [])

    def test_every_blocking_job_is_required(self):
        workflow = (ROOT / '.github/workflows/ci.yml').read_text().split('\njobs:\n', 1)[1]
        jobs = set(re.findall(r'^  ([\w-]+):$', workflow, re.M))
        aggregate = workflow.split('  ci-ok:', 1)[1]
        needs = aggregate.split('    needs:\n', 1)[1].split('    steps:', 1)[0]
        dependency_list = re.findall(r'^      - ([\w-]+)$', needs, re.M)
        dependencies = set(dependency_list)
        self.assertEqual(len(dependency_list), len(dependencies))
        self.assertEqual(dependencies, jobs - {'ci-ok', 'e2e-flaky', 'e2e-timings', 'timing-budgets-alert',
                                                'wasm-switch-on', 'web-unit-switch-on', 'e2e-switch-on'})

    def test_required_web_tests_use_production_and_switch_on_jobs_report_separately(self):
        workflow = (ROOT / '.github/workflows/ci.yml').read_text().split('\njobs:\n', 1)[1]
        jobs = dict(re.findall(r'^  ([\w-]+):\n((?:^(?:    .*|)\n)*)', workflow, re.M))
        for name, target in [('web-unit', 'test.web.unit.production'), ('site-e2e', 'e2e.web.build.production'),
                             ('e2e', 'e2e.web.smoke.production')]:
            self.assertIn(f'make {target}', jobs[name])
            self.assertRegex(jobs['ci-ok'], rf'(?m)^      - {name}$')
        for name, target in [('web-unit-switch-on', 'test.web.unit.switch-on'), ('e2e-switch-on', 'e2e.web.smoke.switch-on')]:
            self.assertIn(f'make {target}', jobs[name])
            self.assertIn("github.event_name == 'pull_request'", jobs[name])
            self.assertIn('continue-on-error: true', jobs[name])
            self.assertNotRegex(jobs['ci-ok'], rf'(?m)^      - {name}$')
            self.assertNotRegex(jobs['superseded'], rf'(?m)^      - {name}$')
            self.assertNotIn('stop-failed-run.yml', jobs[name])
        self.assertIn('make check.web.production-parity', jobs['production-parity'])

    def test_parity_runs_both_snapshots_off_the_web_build_runner(self):
        workflow = (ROOT / '.github/workflows/ci.yml').read_text()
        jobs = dict(re.findall(r'^  ([\w-]+):\n((?:^(?:    .*|)\n)*)', workflow.split('\njobs:\n', 1)[1], re.M))
        self.assertNotIn('check.web.production-parity', jobs['web-build'])
        self.assertIn('side: [reference, candidate]', jobs['production-parity-build'])
        self.assertIn('needs: [production-parity-build]', jobs['production-parity'])
        for job in ['production-parity-build', 'production-parity']:
            for aggregate in ['ci-ok', 'superseded']:
                self.assertRegex(jobs[aggregate], rf'(?m)^      - {job}$')

    def test_ci_scripts_filter_covers_its_tests_and_inputs(self):
        workflow = (ROOT / '.github/workflows/ci.yml').read_text()
        paths = workflow.split('            ci_scripts:\n', 1)[1].split('\n\n', 1)[0]
        for path in ['scripts/tests/**', 'scripts/check-containment.py', 'Makefile', 'Dockerfile', 'scripts/verification-metrics.py', 'docs/roadmap/PRODUCT_ROADMAP.md']:
            self.assertIn(f"- '{path}'", paths)

    def test_docker_consumes_production_artifact_before_admin_overwrites_dist(self):
        workflow = (ROOT / '.github/workflows/ci.yml').read_text()
        docker = workflow.split('  docker-smoke:', 1)[1].split('  lint-repo:', 1)[0]
        self.assertIn('needs: [changes, web-build]', docker)
        self.assertIn('--name site-production --dir ci-site', docker)
        self.assertIn('--build-arg FRONTEND_STAGE=web-prebuilt', docker)
        self.assertIn('run: docker build --tag stabileo-source-smoke .', docker)
        web = workflow.split('  web-build:', 1)[1].split('  results-snapshot:', 1)[0]
        self.assertLess(web.index('name: site-production'), web.index('name: Admin site build'))
        dockerfile = (ROOT / 'Dockerfile').read_text()
        self.assertIn('ARG FRONTEND_STAGE=web-builder', dockerfile)
        self.assertIn('COPY ci-site/ /app/web/dist/', dockerfile)
        self.assertIn('COPY --from=frontend-assets /app/web/dist ./web-dist', dockerfile)

    def test_wasm_builder_installs_clang_before_compilation(self):
        stage = (ROOT / 'Dockerfile').read_text().split('AS wasm-builder', 1)[1].split('AS web-builder', 1)[0]
        self.assertRegex(stage.split('wasm-pack build', 1)[0], r'apt-get install[^\n]*\bclang\b')


if __name__ == '__main__':
    unittest.main()
