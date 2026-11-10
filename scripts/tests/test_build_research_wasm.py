import os
import pathlib
import re
import subprocess
import tempfile
import time
import unittest

ROOT = pathlib.Path(__file__).resolve().parents[2]
SCRIPT = ROOT / '.github/scripts/build-research-wasm.sh'
ALL = ['shauer-2025', 'andreassen-2011', 'biggins-2026', 'grossman-2026', 'pastrana-2026', 'fairclough-2026']


class BuildResearchWasm(unittest.TestCase):
    def run_script(self, bundles, fail=(), target=None):
        with tempfile.TemporaryDirectory() as directory:
            record = pathlib.Path(directory) / 'record'
            fake = pathlib.Path(directory) / 'fake'
            fake.write_text(f'''#!/usr/bin/env bash
if [[ $1 == cargo ]]; then echo "fetch $*" >> {record}; exit 0; fi
shift
target=
while [[ $1 == *=* ]]; do [[ $1 == CARGO_TARGET_DIR=* ]] && target=${{1#*=}}; shift; done
echo "build $(date +%s.%N) $1 $target" >> {record}
sleep 2
for f in {' '.join(fail)}; do [[ $1 == *$f* ]] && {{ echo "boom $f"; exit 1; }}; done
echo "built $1"
''')
            fake.chmod(0o755)
            outputs = pathlib.Path(directory) / 'outputs'
            env = {**os.environ, 'BUILD_PREFIX': str(fake), 'RETRY_INFRA_DELAY_SECONDS': '0', 'GITHUB_OUTPUT': str(outputs)}
            env.pop('CARGO_TARGET_DIR', None)
            if target:
                env['CARGO_TARGET_DIR'] = target
            start = time.monotonic()
            result = subprocess.run([str(SCRIPT), *bundles], cwd=ROOT, env=env, capture_output=True, text=True)
            self.outputs = outputs.read_text().splitlines() if outputs.exists() else []
            return result, time.monotonic() - start, record.read_text().splitlines() if record.exists() else []

    def test_ci_registers_every_research_bundle_built_by_make(self):
        makefile = (ROOT / 'Makefile').read_text().split('\nresearch.wasm:', 1)[1].split('\n\n', 1)[0]
        expected = set(re.findall(r'\$\(NIX_RUN\) (research/\S+/build.sh)', makefile))
        listed = subprocess.run([str(SCRIPT), '--list'], cwd=ROOT, capture_output=True, text=True, check=True)
        self.assertTrue(expected)
        self.assertEqual({line.split()[1] for line in listed.stdout.splitlines()}, expected)

    def test_ci_restores_and_publishes_every_research_bundle_built_by_make(self):
        makefile = (ROOT / 'Makefile').read_text().split('\nresearch.wasm:', 1)[1].split('\n\n', 1)[0]
        scripts = re.findall(r'\$\(NIX_RUN\) (research/\S+/build.sh)', makefile)
        expected = {next(part for part in reversed(pathlib.Path(script).parts[:-1]) if part != 'wasm') for script in scripts}
        job = (ROOT / '.github/workflows/ci.yml').read_text().split('\n  research-wasm:', 1)[1].split('\n  site-e2e:', 1)[0]
        self.assertTrue(expected)
        self.assertEqual(set(re.findall(r'id: research-([a-z0-9-]+)', job)), expected)
        restore = job.split('id: host-cache', 1)[1].split('run:', 1)[0]
        save = job.split("Save research compiled assets (this host's cache)", 1)[1].split('run:', 1)[0]
        for name in expected:
            self.assertIn(f'{name}=${{{{ (steps.research-{name}.outputs.cache-hit', restore)
            self.assertIn(f'{name}=${{{{ steps.build-research.outputs.{name}', save)
            self.assertIn(f'Save research compiled assets ({name})', job)

    def test_every_bundle_builds_at_once(self):
        result, seconds, record = self.run_script(ALL)
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        starts = [float(line.split()[1]) for line in record if line.startswith('build ')]
        self.assertEqual(len(starts), 6)
        self.assertLess(max(starts) - min(starts), 1.5)
        for name in ALL:
            self.assertIn(f'::group::{name} (ok)', result.stdout)

    def test_a_failed_bundle_fails_the_step_and_is_named_after_the_others_finish(self):
        result, _, record = self.run_script(ALL, fail=['grossman-2026'])
        self.assertEqual(result.returncode, 1)
        self.assertIn('::group::grossman-2026 (FAILED)', result.stdout)
        self.assertIn('boom grossman-2026', result.stdout)
        self.assertIn('::error title=Research WASM::grossman-2026 failed to build', result.stdout)
        self.assertIn('::group::fairclough-2026 (ok)', result.stdout)

    def test_only_the_bundles_that_built_are_marked_for_saving(self):
        result, _, _ = self.run_script(ALL, fail=['grossman-2026'])
        self.assertEqual(result.returncode, 1)
        self.assertEqual(sorted(self.outputs), sorted(f'{name}=ok' for name in ALL if name != 'grossman-2026'))

    def test_a_bundle_is_marked_for_saving_while_a_slow_one_still_builds(self):
        with tempfile.TemporaryDirectory() as directory:
            fake = pathlib.Path(directory) / 'fake'
            fake.write_text('''#!/usr/bin/env bash
[[ $1 == cargo ]] && exit 0
shift
while [[ $1 == *=* ]]; do shift; done
[[ $1 == *grossman-2026* ]] && sleep 60
exit 0
''')
            fake.chmod(0o755)
            outputs = pathlib.Path(directory) / 'outputs'
            env = {**os.environ, 'BUILD_PREFIX': str(fake), 'RETRY_INFRA_DELAY_SECONDS': '0', 'GITHUB_OUTPUT': str(outputs)}
            env.pop('CARGO_TARGET_DIR', None)
            process = subprocess.Popen([str(SCRIPT), 'pastrana-2026', 'grossman-2026', 'shauer-2025'], cwd=ROOT, env=env, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, start_new_session=True)
            try:
                deadline = time.monotonic() + 20
                while time.monotonic() < deadline and len(outputs.read_text().splitlines() if outputs.exists() else []) < 2:
                    time.sleep(0.2)
                self.assertIsNone(process.poll())
                self.assertEqual(sorted(outputs.read_text().splitlines()), ['pastrana-2026=ok', 'shauer-2025=ok'])
            finally:
                os.killpg(process.pid, 9)
                process.wait()

    def test_only_the_named_bundles_build(self):
        result, _, record = self.run_script(['pastrana-2026'])
        self.assertEqual(result.returncode, 0)
        builds = [line for line in record if line.startswith('build ')]
        self.assertEqual(len(builds), 1)
        self.assertEqual(builds[0].split()[2], 'research/form-finding/pastrana-2026/wasm/build.sh')

    def test_no_bundle_is_a_no_op(self):
        result, _, record = self.run_script([])
        self.assertEqual(result.returncode, 0)
        self.assertEqual(record, [])

    def test_each_bundle_gets_its_own_target_directory_under_the_runners(self):
        result, _, record = self.run_script(ALL, target='/warm')
        self.assertEqual(result.returncode, 0)
        targets = sorted(line.split()[-1] for line in record if line.startswith('build '))
        self.assertEqual(targets, sorted(f'/warm/research-{name}' for name in ALL))

    def test_without_a_runner_target_each_crate_keeps_its_own(self):
        result, _, record = self.run_script(['grossman-2026'])
        self.assertEqual([line.split() for line in record if line.startswith('build ')][0][-1].endswith('build.sh'), True)

    def test_an_unknown_bundle_is_refused_before_anything_builds(self):
        result, _, record = self.run_script(['shauer-2025', 'nope'])
        self.assertEqual(result.returncode, 2)
        self.assertEqual(record, [])


if __name__ == '__main__':
    unittest.main()
