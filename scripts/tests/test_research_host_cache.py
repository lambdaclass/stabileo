import os
import pathlib
import re
import subprocess
import tempfile
import unittest

ROOT = pathlib.Path(__file__).resolve().parents[2]
SCRIPT = ROOT / '.github/scripts/research-host-cache.sh'
CI = (ROOT / '.github/workflows/ci.yml').read_text()


class ResearchHostCache(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        base = pathlib.Path(self.tmp.name)
        self.host = base / 'host'
        for namespace in ['trusted', 'pr']:
            (self.host / 'research-assets' / namespace).mkdir(parents=True)
            (self.host / 'research-assets' / namespace).chmod(0o1777)
        self.out = base / 'research-wasm'
        self.outputs = base / 'outputs'

    def tearDown(self):
        self.tmp.cleanup()

    def run_script(self, mode, event, bundles, host=None):
        self.outputs.write_text('')
        env = {**os.environ, 'EVENT': event, 'BUNDLES': bundles, 'STABILEO_HOST_CACHE': str(host or self.host),
               'RESEARCH_ASSETS_DIR': str(self.out), 'GITHUB_OUTPUT': str(self.outputs),
               'STABILEO_HOST_CACHE_OWNER': str(os.getuid())}
        result = subprocess.run([str(SCRIPT), mode], env=env, capture_output=True, text=True)
        self.assertEqual(result.returncode, 0, result.stderr)
        return result.stdout, dict(line.split('=', 1) for line in self.outputs.read_text().splitlines() if '=' in line)

    def built(self, name, content):
        (self.out / name).mkdir(parents=True, exist_ok=True)
        (self.out / name / 'bundle.wasm').write_text(content)

    def entries(self, namespace):
        return sorted(p.name for p in (self.host / 'research-assets' / namespace).glob('*.tar'))

    def test_a_queue_build_is_saved_as_trusted_and_a_pull_request_reuses_it(self):
        self.built('shauer-2025', 'queue build')
        self.run_script('save', 'merge_group', 'shauer-2025=k1 grossman-2026=')
        self.assertEqual(self.entries('trusted'), ['k1.tar'])
        (self.out / 'shauer-2025' / 'bundle.wasm').unlink()
        stdout, outputs = self.run_script('restore', 'pull_request', 'shauer-2025=k1 grossman-2026=k2')
        self.assertEqual(outputs['build'], 'grossman-2026')
        self.assertEqual((self.out / 'shauer-2025' / 'bundle.wasm').read_text(), 'queue build')
        self.assertIn('shauer-2025: from this host\'s cache (trusted)', stdout)

    def test_a_pull_request_build_is_saved_only_for_other_pull_requests(self):
        self.built('pastrana-2026', 'pr build')
        self.run_script('save', 'pull_request', 'pastrana-2026=k3')
        self.assertEqual(self.entries('pr'), ['k3.tar'])
        self.assertEqual(self.entries('trusted'), [])
        self.assertEqual((self.host / 'research-assets' / 'pr' / 'k3.tar').stat().st_mode & 0o777, 0o644)
        _, outputs = self.run_script('restore', 'pull_request', 'pastrana-2026=k3')
        self.assertEqual(outputs['build'], '')
        for event in ['merge_group', 'push']:
            _, outputs = self.run_script('restore', event, 'pastrana-2026=k3')
            self.assertEqual(outputs['build'], 'pastrana-2026', event)

    def test_queue_and_main_runs_never_restore_from_this_host_even_a_trusted_entry(self):
        self.built('shauer-2025', 'main build')
        self.run_script('save', 'push', 'shauer-2025=k1')
        for event in ['merge_group', 'push', 'schedule', 'workflow_dispatch']:
            _, outputs = self.run_script('restore', event, 'shauer-2025=k1')
            self.assertEqual(outputs['build'], 'shauer-2025', event)

    def test_an_actions_cache_hit_is_not_built_and_an_unknown_key_is(self):
        _, outputs = self.run_script('restore', 'pull_request', 'shauer-2025=hit andreassen-2011=none biggins-2026=k9')
        self.assertEqual(outputs['build'], 'andreassen-2011 biggins-2026')

    def test_an_existing_entry_is_never_replaced(self):
        self.built('shauer-2025', 'first')
        self.run_script('save', 'merge_group', 'shauer-2025=k1')
        self.built('shauer-2025', 'second')
        self.run_script('save', 'merge_group', 'shauer-2025=k1')
        (self.out / 'shauer-2025' / 'bundle.wasm').write_text('stale')
        self.run_script('restore', 'pull_request', 'shauer-2025=k1')
        self.assertEqual((self.out / 'shauer-2025' / 'bundle.wasm').read_text(), 'first')
        self.assertEqual(sorted(p.name for p in (self.host / 'research-assets' / 'trusted').iterdir()), ['k1.tar'])
        self.assertEqual(self.entries('pr'), [])

    def test_a_key_with_a_path_in_it_is_neither_saved_nor_read(self):
        self.built('shauer-2025', 'x')
        self.run_script('save', 'merge_group', 'shauer-2025=../escape')
        self.assertEqual(list(self.host.rglob('*.tar')), [])
        _, outputs = self.run_script('restore', 'pull_request', 'shauer-2025=../escape')
        self.assertEqual(outputs['build'], 'shauer-2025')

    def test_an_empty_bundle_is_not_saved(self):
        (self.out / 'shauer-2025').mkdir(parents=True)
        self.run_script('save', 'merge_group', 'shauer-2025=k1')
        self.assertEqual(list(self.host.rglob('*.tar')), [])

    def test_a_missing_key_is_built_even_if_an_entry_is_named_after_the_sentinel(self):
        self.built('shauer-2025', 'planted')
        self.run_script('save', 'pull_request', 'shauer-2025=k1')
        os.link(self.host / 'research-assets' / 'pr' / 'k1.tar', self.host / 'research-assets' / 'pr' / 'none.tar')
        _, outputs = self.run_script('restore', 'pull_request', 'shauer-2025=none grossman-2026=')
        self.assertEqual(outputs['build'], 'shauer-2025 grossman-2026')

    def test_a_namespace_the_host_did_not_provision_is_never_used(self):
        self.built('shauer-2025', 'x')
        self.run_script('save', 'pull_request', 'shauer-2025=k1')
        (self.host / 'research-assets' / 'pr').chmod(0o777)
        _, outputs = self.run_script('restore', 'pull_request', 'shauer-2025=k1')
        self.assertEqual(outputs['build'], 'shauer-2025')
        self.run_script('save', 'pull_request', 'grossman-2026=k2')
        self.assertEqual(self.entries('pr'), ['k1.tar'])
        env_owner = str(os.getuid() + 1)
        (self.host / 'research-assets' / 'pr').chmod(0o1777)
        self.outputs.write_text('')
        result = subprocess.run([str(SCRIPT), 'restore'], capture_output=True, text=True,
                                env={**os.environ, 'EVENT': 'pull_request', 'BUNDLES': 'shauer-2025=k1',
                                     'STABILEO_HOST_CACHE': str(self.host), 'RESEARCH_ASSETS_DIR': str(self.out),
                                     'GITHUB_OUTPUT': str(self.outputs), 'STABILEO_HOST_CACHE_OWNER': env_owner})
        self.assertEqual(result.returncode, 0)
        self.assertIn('build=shauer-2025', self.outputs.read_text())

    def test_a_symlinked_entry_is_never_followed(self):
        secret = self.host / 'secret.tar'
        (self.out / 'shauer-2025').mkdir(parents=True)
        (self.out / 'shauer-2025' / 'bundle.wasm').write_text('secret')
        subprocess.run(['tar', '-cf', str(secret), '-C', str(self.out / 'shauer-2025'), '.'], check=True)
        (self.host / 'research-assets' / 'trusted' / 'k1.tar').symlink_to(secret)
        _, outputs = self.run_script('restore', 'pull_request', 'shauer-2025=k1')
        self.assertEqual(outputs['build'], 'shauer-2025')

    def test_without_the_host_directory_everything_builds_and_nothing_fails(self):
        missing = self.host / 'absent'
        self.built('shauer-2025', 'x')
        self.run_script('save', 'merge_group', 'shauer-2025=k1', host=missing)
        _, outputs = self.run_script('restore', 'pull_request', 'shauer-2025=k1 grossman-2026=k2', host=missing)
        self.assertEqual(outputs['build'], 'shauer-2025 grossman-2026')
        self.assertFalse(missing.exists())

    def test_a_corrupt_entry_falls_back_to_building(self):
        (self.host / 'research-assets' / 'trusted' / 'k1.tar').write_text('not a tar')
        self.built('shauer-2025', 'previous')
        _, outputs = self.run_script('restore', 'pull_request', 'shauer-2025=k1')
        self.assertEqual(outputs['build'], 'shauer-2025')
        self.assertEqual(list(self.out.glob('.host-cache.*')), [])


class Workflow(unittest.TestCase):
    def job(self, name):
        return re.search(rf'^  {name}:\n(.*?)(?=^  [a-z0-9-]+:\n)', CI, re.S | re.M).group(1)

    def test_the_build_takes_only_what_neither_cache_had(self):
        job = self.job('research-wasm')
        self.assertIn('run: .github/scripts/build-research-wasm.sh ${{ steps.host-cache.outputs.build }}', job)
        order = [job.index(marker) for marker in ['id: retry-fairclough-2026', 'id: host-cache', 'id: build-research',
                                                   "Save research compiled assets (this host's cache)"]]
        self.assertEqual(order, sorted(order))

    def test_every_bundle_is_offered_to_the_host_cache_in_both_directions(self):
        job = self.job('research-wasm')
        names = re.findall(r'id: research-([a-z0-9-]+)', job)
        self.assertEqual(len(names), 6)
        restore = job.split('id: host-cache', 1)[1].split('run:', 1)[0]
        save = job.split("Save research compiled assets (this host's cache)", 1)[1].split('run:', 1)[0]
        for name in names:
            self.assertIn(f"{name}=${{{{ (steps.research-{name}.outputs.cache-hit == 'true' || steps.retry-{name}.outputs.cache-hit == 'true') && 'hit'", restore)
            self.assertIn(f"{name}=${{{{ steps.build-research.outputs.{name} == 'ok' && (steps.research-{name}.outputs.cache-primary-key", save)
        self.assertIn('EVENT: ${{ github.event_name }}', restore)
        self.assertIn('EVENT: ${{ github.event_name }}', save)


if __name__ == '__main__':
    unittest.main()
