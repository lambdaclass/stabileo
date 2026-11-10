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
        self.trusted = self.host / 'research-assets' / 'trusted'
        self.trusted.mkdir(parents=True)
        self.trusted.chmod(0o1755)
        self.out = base / 'research-wasm'
        self.outputs = base / 'outputs'

    def tearDown(self):
        self.trusted.chmod(0o755)
        self.tmp.cleanup()

    def run_script(self, mode, event, bundles, host=None, owner=None):
        self.outputs.write_text('')
        env = {**os.environ, 'EVENT': event, 'BUNDLES': bundles, 'STABILEO_HOST_CACHE': str(host or self.host),
               'RESEARCH_ASSETS_DIR': str(self.out), 'GITHUB_OUTPUT': str(self.outputs),
               'STABILEO_HOST_CACHE_OWNER': str(os.getuid() if owner is None else owner)}
        result = subprocess.run([str(SCRIPT), mode], env=env, capture_output=True, text=True)
        self.assertEqual(result.returncode, 0, result.stderr)
        return result.stdout, dict(line.split('=', 1) for line in self.outputs.read_text().splitlines() if '=' in line)

    def built(self, name, files):
        directory = self.out / name
        if directory.exists():
            subprocess.run(['rm', '-rf', str(directory)], check=True)
        for path, content in files.items():
            (directory / path).parent.mkdir(parents=True, exist_ok=True)
            (directory / path).write_text(content)

    def contents(self, name):
        directory = self.out / name
        return {str(p.relative_to(directory)): p.read_text() for p in directory.rglob('*') if p.is_file()}

    def entries(self):
        return sorted(p.name for p in self.trusted.iterdir())

    BUNDLE = {'bundle.wasm': 'queue build', 'bundle.js': 'glue', 'pkg/meta.json': '{}'}

    def test_a_queue_build_is_reused_by_a_pull_request_exactly(self):
        self.built('shauer-2025', self.BUNDLE)
        stdout, _ = self.run_script('save', 'merge_group', 'shauer-2025=k1 grossman-2026=')
        self.assertIn('shauer-2025: saved', stdout)
        self.assertEqual(self.entries(), ['k1.tar'])
        self.assertEqual((self.trusted / 'k1.tar').stat().st_mode & 0o777, 0o644)
        self.built('shauer-2025', {'stale.wasm': 'old'})
        stdout, outputs = self.run_script('restore', 'pull_request', 'shauer-2025=k1 grossman-2026=k2')
        self.assertEqual(outputs['build'], 'grossman-2026')
        self.assertEqual(self.contents('shauer-2025'), self.BUNDLE)
        self.assertIn("shauer-2025: from this host's cache", stdout)

    def test_a_pull_request_never_writes(self):
        self.built('pastrana-2026', self.BUNDLE)
        stdout, _ = self.run_script('save', 'pull_request', 'pastrana-2026=k3')
        self.assertEqual(self.entries(), [])
        self.assertEqual(stdout, '')

    def test_queue_and_main_runs_never_restore(self):
        self.built('shauer-2025', self.BUNDLE)
        self.run_script('save', 'push', 'shauer-2025=k1')
        for event in ['merge_group', 'push', 'schedule', 'workflow_dispatch']:
            _, outputs = self.run_script('restore', event, 'shauer-2025=k1')
            self.assertEqual(outputs['build'], 'shauer-2025', event)

    def test_an_actions_cache_hit_is_not_built_and_a_missing_key_is(self):
        _, outputs = self.run_script('restore', 'pull_request', 'shauer-2025=hit andreassen-2011=none biggins-2026=k9 grossman-2026=')
        self.assertEqual(outputs['build'], 'andreassen-2011 biggins-2026 grossman-2026')

    def test_a_missing_key_is_built_even_if_an_entry_is_named_after_the_sentinel(self):
        self.built('shauer-2025', self.BUNDLE)
        self.run_script('save', 'merge_group', 'shauer-2025=k1')
        os.link(self.trusted / 'k1.tar', self.trusted / 'none.tar')
        _, outputs = self.run_script('restore', 'pull_request', 'shauer-2025=none')
        self.assertEqual(outputs['build'], 'shauer-2025')

    def test_an_existing_entry_is_never_replaced(self):
        self.built('shauer-2025', {'bundle.wasm': 'first'})
        self.run_script('save', 'merge_group', 'shauer-2025=k1')
        self.built('shauer-2025', {'bundle.wasm': 'second'})
        self.run_script('save', 'merge_group', 'shauer-2025=k1')
        self.run_script('restore', 'pull_request', 'shauer-2025=k1')
        self.assertEqual(self.contents('shauer-2025'), {'bundle.wasm': 'first'})
        self.assertEqual(self.entries(), ['k1.tar'])

    def test_a_key_with_a_path_in_it_is_neither_saved_nor_read(self):
        self.built('shauer-2025', self.BUNDLE)
        self.run_script('save', 'merge_group', 'shauer-2025=../escape')
        self.assertEqual(list(self.host.rglob('*.tar')), [])
        _, outputs = self.run_script('restore', 'pull_request', 'shauer-2025=../escape')
        self.assertEqual(outputs['build'], 'shauer-2025')

    def test_an_empty_bundle_is_not_saved(self):
        (self.out / 'shauer-2025').mkdir(parents=True)
        self.run_script('save', 'merge_group', 'shauer-2025=k1')
        self.assertEqual(self.entries(), [])

    def test_a_directory_others_can_write_or_another_user_owns_is_never_used(self):
        self.built('shauer-2025', self.BUNDLE)
        self.run_script('save', 'merge_group', 'shauer-2025=k1')
        for mode in [0o1777, 0o777, 0o757]:
            self.trusted.chmod(mode)
            _, outputs = self.run_script('restore', 'pull_request', 'shauer-2025=k1')
            self.assertEqual(outputs['build'], 'shauer-2025', oct(mode))
            self.run_script('save', 'merge_group', 'grossman-2026=k2')
            self.assertEqual(self.entries(), ['k1.tar'], oct(mode))
        self.trusted.chmod(0o1755)
        _, outputs = self.run_script('restore', 'pull_request', 'shauer-2025=k1', owner=os.getuid() + 1)
        self.assertEqual(outputs['build'], 'shauer-2025')

    def test_a_symlinked_entry_is_never_followed(self):
        self.built('shauer-2025', self.BUNDLE)
        self.run_script('save', 'merge_group', 'shauer-2025=k1')
        os.rename(self.trusted / 'k1.tar', self.host / 'elsewhere.tar')
        (self.trusted / 'k1.tar').symlink_to(self.host / 'elsewhere.tar')
        _, outputs = self.run_script('restore', 'pull_request', 'shauer-2025=k1')
        self.assertEqual(outputs['build'], 'shauer-2025')

    def tamper(self, change):
        self.built('shauer-2025', self.BUNDLE)
        self.run_script('save', 'merge_group', 'shauer-2025=k1')
        work = self.host / 'work'
        work.mkdir()
        subprocess.run(['tar', '-xf', str(self.trusted / 'k1.tar'), '-C', str(work)], check=True)
        change(work)
        os.unlink(self.trusted / 'k1.tar')
        subprocess.run(['tar', '-cf', str(self.trusted / 'k1.tar'), '-C', str(work), '.'], check=True)
        self.built('shauer-2025', {'previous.wasm': 'previous'})
        _, outputs = self.run_script('restore', 'pull_request', 'shauer-2025=k1')
        self.assertEqual(outputs['build'], 'shauer-2025')
        self.assertEqual(self.contents('shauer-2025'), {'previous.wasm': 'previous'})
        self.assertEqual(list(self.out.glob('.host-cache.*')), [])

    def test_a_damaged_payload_is_built(self):
        self.tamper(lambda work: (work / 'bundle.wasm').write_text('damaged'))

    def test_a_missing_file_is_built(self):
        self.tamper(lambda work: (work / 'pkg' / 'meta.json').unlink())

    def test_an_unlisted_file_is_built(self):
        self.tamper(lambda work: (work / 'extra.js').write_text('x'))

    def test_an_archive_without_a_manifest_is_built(self):
        self.tamper(lambda work: (work / '.host-cache-SHA256SUMS').unlink())

    def test_a_corrupt_archive_is_built(self):
        (self.trusted / 'k1.tar').write_text('not a tar')
        _, outputs = self.run_script('restore', 'pull_request', 'shauer-2025=k1')
        self.assertEqual(outputs['build'], 'shauer-2025')

    def test_without_the_host_directory_everything_builds_and_nothing_fails(self):
        missing = self.host / 'absent'
        self.built('shauer-2025', self.BUNDLE)
        self.run_script('save', 'merge_group', 'shauer-2025=k1', host=missing)
        _, outputs = self.run_script('restore', 'pull_request', 'shauer-2025=k1 grossman-2026=k2', host=missing)
        self.assertEqual(outputs['build'], 'shauer-2025 grossman-2026')
        self.assertFalse(missing.exists())


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
        self.assertEqual(len(names), 8)
        restore = job.split('id: host-cache', 1)[1].split('run:', 1)[0]
        save = job.split("Save research compiled assets (this host's cache)", 1)[1].split('run:', 1)[0]
        for name in names:
            self.assertIn(f"{name}=${{{{ (steps.research-{name}.outputs.cache-hit == 'true' || steps.retry-{name}.outputs.cache-hit == 'true') && 'hit'", restore)
            self.assertIn(f"{name}=${{{{ steps.build-research.outputs.{name} == 'ok' && (steps.research-{name}.outputs.cache-primary-key", save)
        self.assertIn('EVENT: ${{ github.event_name }}', restore)
        self.assertIn('EVENT: ${{ github.event_name }}', save)


if __name__ == '__main__':
    unittest.main()
