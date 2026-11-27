from hashlib import sha256
import json
import os
import pathlib
import re
import subprocess
import tempfile
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

    def test_pr_parity_uses_one_merge_base_from_the_actual_pr_head(self):
        workflow = (ROOT / '.github/workflows/ci.yml').read_text()
        self.assertEqual(workflow.count('github.event.pull_request.base.sha'), 0,
                         'a long-lived PR can carry a stale event base')
        jobs = dict(re.findall(r'^  ([\w-]+):\n((?:^(?:    .*|)\n)*)', workflow.split('\njobs:\n', 1)[1], re.M))
        changes = jobs['changes']
        self.assertIn('base: ${{ steps.base.outputs.sha }}', changes)
        self.assertIn('PR_HEAD: ${{ github.event.pull_request.head.sha }}', changes)
        self.assertIn('QUEUE_BASE: ${{ github.event.merge_group.base_sha }}', changes)
        self.assertIn('git merge-base "$PR_HEAD" "refs/remotes/origin/$GITHUB_BASE_REF"', changes)
        self.assertIn('BASE_SHA: ${{ steps.base.outputs.sha }}', changes)
        self.assertIn('BASE: ${{ steps.base.outputs.sha }}', changes)
        self.assertIn('CANDIDATE: ${{ github.event.pull_request.head.sha || github.sha }}', changes)
        self.assertIn('parity_snapshots: ${{ steps.parity.outputs.snapshots }}', changes)
        self.assertIn('parity_research_builds: ${{ steps.parity.outputs.research_builds }}', changes)
        self.assertIn('fetch-depth: 0', changes)
        for job in ['production-parity-research', 'production-parity-build', 'production-parity']:
            base = 'matrix.base' if job == 'production-parity-research' else 'matrix.snapshot.base'
            self.assertIn('BASE: ${{ ' + base + ' }}', jobs[job], job)
            if job != 'production-parity-research':
                self.assertIn('snapshot: ${{ fromJSON(needs.changes.outputs.parity_snapshots) }}', jobs[job], job)
            self.assertIn('CANDIDATE: ${{ github.sha }}', jobs[job], job)
            self.assertIn("REQUIRE_PARITY: '1'", jobs[job], job)
            self.assertNotRegex(jobs[job], r'(?m)^          ref:')
            self.assertIn('fetch-depth: 0', jobs[job], job)

    def test_parity_runs_both_snapshots_off_the_web_build_runner(self):
        workflow = (ROOT / '.github/workflows/ci.yml').read_text()
        jobs = dict(re.findall(r'^  ([\w-]+):\n((?:^(?:    .*|)\n)*)', workflow.split('\njobs:\n', 1)[1], re.M))
        self.assertNotIn('check.web.production-parity', jobs['web-build'])
        self.assertIn('side: [reference, candidate]', jobs['production-parity-build'])
        self.assertIn('needs: [changes, production-parity-build]', jobs['production-parity'])
        for job in ['production-parity-build', 'production-parity']:
            for aggregate in ['ci-ok', 'superseded']:
                self.assertRegex(jobs[aggregate], rf'(?m)^      - {job}$')

    def test_parity_builds_research_in_separate_jobs_before_inventories(self):
        workflow = (ROOT / '.github/workflows/ci.yml').read_text().split('\njobs:\n', 1)[1]
        jobs = dict(re.findall(r'^  ([\w-]+):\n((?:^(?:    .*|)\n)*)', workflow, re.M))
        research = jobs['production-parity-research']
        site = jobs['production-parity-build']
        self.assertIn('include: ${{ fromJSON(needs.changes.outputs.parity_research_builds) }}', research)
        self.assertIn('name: parity-research-${{ matrix.base }}-${{ matrix.side }}', research)
        self.assertIn('name: parity-research-${{ matrix.snapshot.base }}-', site)
        self.assertIn('contains(matrix.snapshot.research_sides,', site)
        self.assertIn('name: production-parity-${{ matrix.snapshot.base }}-${{ matrix.side }}', site)
        self.assertIn('pattern: production-parity-${{ matrix.snapshot.base }}-*', jobs['production-parity'])
        self.assertIn('PARITY_RESEARCH_OUT=', research)
        self.assertIn('needs: [changes, production-parity-research]', site)
        self.assertIn('PARITY_RESEARCH_IN=', site)
        self.assertIn('timeout-minutes: 45', site)
        for aggregate in ['ci-ok', 'superseded']:
            self.assertRegex(jobs[aggregate], r'(?m)^      - production-parity-research$')

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


class ParityWorkflow(unittest.TestCase):
    def setUp(self):
        directory = tempfile.TemporaryDirectory(dir=ROOT)
        self.addCleanup(directory.cleanup)
        self.repo = pathlib.Path(directory.name)
        self.env = {key: value for key, value in os.environ.items()
                    if key not in ('MAKEFLAGS', 'MFLAGS', 'MAKEOVERRIDES', 'MAKELEVEL')}
        self.output = self.repo / 'github-output'
        self.git('init', '--quiet', '-b', 'target')
        self.git('config', 'user.name', 'Parity workflow fixture')
        self.git('config', 'user.email', 'parity@example.invalid')
        web = self.repo / 'web'
        (web / 'config').mkdir(parents=True)
        (web / 'config/features.json').write_text('{"production":{},"test":{}}')
        (web / 'package-lock.json').write_text('{}')
        build = 'mkdir dist && cat page > dist/index.html && git rev-parse HEAD >> dist/index.html'
        (web / 'package.json').write_text(json.dumps({'scripts': {'build': build}}))
        (web / 'page').write_text('old page\n')
        (self.repo / 'Makefile').write_text(
            'wasm:\n\tmkdir -p web/src/lib/wasm\n'
            '\tprintf glue > web/src/lib/wasm/dedaliano_engine.js\n'
            '\tprintf solver > web/src/lib/wasm/dedaliano_engine_bg.wasm\n'
            'research.wasm:\n\tmkdir -p web/public/research-wasm\n'
            '\tcp web/page web/public/research-wasm/asset\n'
        )
        (web / 'caption').write_text('old caption')
        self.base = self.commit('Published source predating the parity checker')
        self.git('switch', '--quiet', '-c', 'feature')
        (web / 'page').write_text('candidate page\n')
        (web / 'caption').write_text('new caption')
        self.undeclared = self.commit('Change the production page', '-m', 'Production-Parity: required')
        self.head = self.commit('Declare the intended production change', '--allow-empty', '-m',
                                'Production-Change: web/page')
        self.git('switch', '--quiet', 'target')
        (self.repo / 'Cargo.lock').write_text('target only')
        self.queue_base = self.commit('Base recorded for the merge group')
        target_build = build + ' && cp caption dist/caption'
        (web / 'package.json').write_text(json.dumps({'scripts': {'build': target_build}}))
        makefile = (ROOT / 'Makefile').read_text()
        parity_target = re.search(r'^check\.web\.production-parity:\n.*?(?=\n\n)', makefile, re.M | re.S)[0]
        with (self.repo / 'Makefile').open('a') as fixture:
            fixture.write(parity_target + '\n')
        script = pathlib.Path('scripts/check-production-parity.py')
        (self.repo / script.parent).mkdir()
        (self.repo / script).write_bytes((ROOT / script).read_bytes())
        self.target = self.commit('Add the checker after the group base')
        self.git('update-ref', 'refs/remotes/origin/target', self.target)
        self.git('update-ref', 'refs/remotes/origin/main', self.target)
        self.git('merge', '--quiet', '--no-ff', 'feature', '-m', 'Workflow merge')
        self.merge = self.git('rev-parse', 'HEAD')

    def git(self, *args):
        return subprocess.check_output(['git', *args], cwd=self.repo, text=True).strip()

    def commit(self, message, *args):
        self.git('add', '.')
        self.git('commit', '--quiet', '-m', message, *args)
        return self.git('rev-parse', 'HEAD')

    def step(self, step_id, **env):
        workflow = (ROOT / '.github/workflows/ci.yml').read_text()
        step = workflow.split(f'        id: {step_id}\n', 1)[1].split('        run: |\n', 1)[1]
        script = re.match(r'(?:          [^\n]*\n)+', step).group()
        self.output.write_text('')
        return subprocess.run(['bash', '-eo', 'pipefail', '-c', script], cwd=self.repo,
                              env={**self.env, 'GITHUB_OUTPUT': str(self.output), **env},
                              text=True, capture_output=True)

    def test_resolver_emits_the_common_ancestor_or_recorded_queue_base(self):
        for event, expected in [('pull_request', self.base), ('merge_group', self.queue_base)]:
            with self.subTest(event=event):
                result = self.step('base', GITHUB_EVENT_NAME=event, PR_HEAD=self.head,
                                   GITHUB_BASE_REF='target', QUEUE_BASE=self.queue_base)
                self.assertEqual(result.returncode, 0, result.stderr)
                self.assertEqual(self.output.read_text(), f'sha={expected}\n')

    def test_planner_uses_workflow_tooling_with_an_older_candidate(self):
        for candidate, required in [(self.head, True), (self.base, False)]:
            with self.subTest(candidate=candidate):
                result = self.step('parity', BASE=self.base, CANDIDATE=candidate,
                                   GITHUB_SHA=self.merge, GITHUB_EVENT_NAME='pull_request')
                self.assertEqual(result.returncode, 0, result.stderr)
                if required:
                    self.assert_plan([self.target])
                else:
                    self.assertEqual(self.output.read_text(), 'required=false\n')
                self.assertEqual(self.git('rev-parse', 'HEAD'), self.merge)

    def assert_plan(self, bases, sides=('reference', 'candidate')):
        outputs = dict(line.split('=', 1) for line in self.output.read_text().splitlines())
        self.assertEqual(set(outputs), {'required', 'snapshots', 'research_builds'})
        self.assertEqual(outputs['required'], 'true')
        snapshots = json.loads(outputs['snapshots'])
        self.assertEqual(snapshots, [{'base': base, 'research_sides': list(sides)} for base in bases])
        self.assertEqual(json.loads(outputs['research_builds']),
                         [{'base': base, 'side': side} for base in bases for side in sides])
        return snapshots

    def parity(self, candidate, *args, succeeds=True):
        result = subprocess.run(['make', '--silent', 'check.web.production-parity', 'NIX_RUN=',
                                 f'CANDIDATE={candidate}', *args],
                                cwd=self.repo, env=self.env, text=True, capture_output=True)
        if succeeds:
            self.assertEqual(result.returncode, 0, result.stderr)
        else:
            self.assertNotEqual(result.returncode, 0, result.stdout)
        return result

    def test_required_workflow_builds_detect_an_asset_published_only_by_the_target(self):
        for event, selection_base, bases in [
            ('pull_request', self.base, [self.target]),
            ('merge_group', self.target, [self.target]),
            ('merge_group', self.queue_base, [self.target, self.queue_base]),
        ]:
            with self.subTest(event=event, selection_base=selection_base):
                result = self.step('parity', BASE=selection_base,
                                   CANDIDATE=self.head if event == 'pull_request' else self.merge,
                                   GITHUB_SHA=self.merge, GITHUB_EVENT_NAME=event)
                self.assertEqual(result.returncode, 0, result.stderr)
                for snapshot in self.assert_plan(bases):
                    base = snapshot['base']
                    args = [f'BASE={base}', 'REQUIRE_PARITY=1']
                    inventories = self.repo / f'{event}-{selection_base}-{base}'
                    inventories.mkdir()
                    for side in snapshot['research_sides']:
                        asset = inventories / f'research-{side}'
                        self.parity(self.merge, *args, f'PARITY_SIDE={side}', f'PARITY_RESEARCH_OUT={asset}')
                        out = inventories / f'{side}.json'
                        self.parity(self.merge, *args, f'PARITY_SIDE={side}', f'PARITY_RESEARCH_IN={asset}',
                                    f'PARITY_OUT={out}')
                        inventory = json.loads(out.read_text())
                        self.assertEqual((inventory['side'], inventory['base'], inventory['head']),
                                         (side, base, self.merge))
                        path = 'web/dist/caption'
                        if side == 'reference' and base == self.queue_base:
                            self.assertNotIn(path, inventory['files'])
                        else:
                            caption = b'old caption' if side == 'reference' else b'new caption'
                            self.assertEqual(inventory['files'][path], sha256(caption).hexdigest())
                    result = self.parity(self.merge, *args, f'PARITY_COMPARE={inventories}', succeeds=False)
                    self.assertIn('\n  web/dist/caption\n', result.stderr)

    def test_required_pr_with_the_same_opt_in_on_target_builds_matching_artifacts(self):
        flags = self.repo / 'web/config/features.json'
        enabled = '{"production":{"example":false},"test":{"example":true}}'
        self.git('switch', '--quiet', '-c', 'opt-in', self.base)
        flags.write_text(enabled)
        head = self.commit('Opt in to the test feature')
        self.git('switch', '--quiet', '--detach', self.target)
        flags.write_text(enabled)
        parent = self.commit('Independently opt in on the target')
        self.git('merge', '--quiet', '--no-ff', head, '-m', 'Workflow merge')
        merge = self.git('rev-parse', 'HEAD')
        args = [f'BASE={parent}', 'REQUIRE_PARITY=1']
        self.assertEqual(self.parity(merge, f'BASE={parent}', 'PARITY_PLAN=1').stdout, 'false\n')
        result = self.step('parity', BASE=self.base, CANDIDATE=head,
                           GITHUB_SHA=merge, GITHUB_EVENT_NAME='pull_request')
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assert_plan([parent], ['reference'])
        self.parity(merge, *args, 'PARITY_SIDE=reference', 'PARITY_RESEARCH_OUT=shared')
        for side in ['reference', 'candidate']:
            self.parity(merge, *args, f'PARITY_SIDE={side}', 'PARITY_RESEARCH_IN=shared', f'PARITY_OUT={side}.json')
        self.parity(merge, *args, 'PARITY_COMPARE=.')

    def test_candidate_defaults_to_merge_base_and_honours_explicit_base(self):
        for base in [self.queue_base, 'origin/main']:
            with self.subTest(base=base):
                result = self.parity(self.head, f'BASE={base}', succeeds=False)
                self.assertIn('engine inputs differ from the reference:\n  Cargo.lock', result.stderr)
        self.parity(self.head)

    def assert_page_snapshots(self, head, reference_page, *args):
        for side, page in [('reference', reference_page), ('candidate', 'candidate page')]:
            self.parity(head, *args, f'PARITY_SIDE={side}', f'PARITY_RESEARCH_OUT=research-{side}')
            self.assertEqual((self.repo / f'research-{side}/assets/asset').read_text(), f'{page}\n')
            self.parity(head, *args, f'PARITY_SIDE={side}', f'PARITY_RESEARCH_IN=research-{side}',
                        f'PARITY_OUT={side}.json')
            inventory = json.loads((self.repo / f'{side}.json').read_text())
            self.assertEqual((inventory['side'], inventory['base'], inventory['head']), (side, self.base, head))
            expected = sha256(f'{page}\n{head}\n'.encode()).hexdigest()
            self.assertEqual(inventory['files']['web/dist/index.html'], expected)

    def test_split_jobs_build_and_compare_the_two_source_snapshots(self):
        base = f'BASE={self.base}'
        self.assert_page_snapshots(self.head, 'candidate page', base)
        self.parity(self.head, base, 'PARITY_COMPARE=.')
        self.parity(self.head, base)

    def test_split_jobs_reject_an_undeclared_page_change(self):
        self.assert_page_snapshots(self.undeclared, 'old page')
        result = self.parity(self.undeclared, 'PARITY_COMPARE=.', succeeds=False)
        self.assertIn('Switch-off production differs', result.stderr)
        self.assertIn('\n  web/dist/index.html\n', result.stderr)


if __name__ == '__main__':
    unittest.main()
