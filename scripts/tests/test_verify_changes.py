import importlib.util
import pathlib
import re
import subprocess
import sys
import unittest

ROOT = pathlib.Path(__file__).resolve().parents[2]
SCRIPT = ROOT / '.github/scripts/verify-changes.py'
spec = importlib.util.spec_from_file_location('verify_changes', SCRIPT)
verify_changes = importlib.util.module_from_spec(spec)
spec.loader.exec_module(verify_changes)
select = verify_changes.select


class VerifyChanges(unittest.TestCase):
    def test_kani_runs_only_when_its_inputs_change(self):
        for paths, verify, kani in [
            (['engine/src/solver/buckling.rs'], True, False),
            (['engine/src/certify/buckling.rs', 'docs/verification/CONTAINMENT.md'], True, False),
            (['engine/tests/metamorphic/regressions.rs', 'web/src/App.svelte'], False, False),
            (['verify/Certify/Bundle.lean'], True, False),
            (['tools/symbolic/gen.py'], True, False),
            (['engine/src/kani_proofs.rs'], True, True),
            (['engine/src/element/frame.rs'], True, True),
            (['engine/src/linalg/amd.rs'], True, True),
            (['engine/src/types/input.rs'], True, True),
            (['engine/src/certify/interval.rs'], True, True),
            (['engine/src/certify/sparse.rs'], True, True),
            (['engine/src/lib.rs'], True, True),
            (['engine/Cargo.toml'], True, True),
            (['Cargo.lock'], True, True),
            (['engine/Cargo.lock'], False, True),
            (['Cargo.toml'], False, True),
            (['rust-toolchain.toml'], False, True),
            (['.cargo/config.toml'], False, True),
            (['engine/.cargo/config.toml'], False, True),
            (['engine/build.rs'], False, True),
            (['build.rs'], False, True),
            (['research/.cargo/config.toml'], False, False),
            (['flake.nix'], True, True),
            (['flake.lock'], True, True),
            (['scripts/kani-safe.sh'], True, True),
            (['scripts/kani-setup.sh'], True, True),
            (['.github/workflows/verify.yml'], True, True),
            (['.github/scripts/verify-changes.py'], True, True),
            (['web/src/App.svelte', 'engine/src/element/truss.rs'], True, True),
            (['research/Cargo.toml'], False, False),
            (['engine/src/linalgx.rs'], True, False),
        ]:
            with self.subTest(paths=paths):
                self.assertEqual(select(paths), {'verify': verify, 'kani': kani})

    def test_it_runs_everything_when_it_cannot_tell_what_changed(self):
        self.assertEqual(select([]), {'verify': True, 'kani': True})
        self.assertEqual(select(['']), {'verify': True, 'kani': True})
        listed = [f'web/src/f{i}.ts' for i in range(verify_changes.API_FILE_LIMIT)]
        self.assertEqual(select(listed), {'verify': True, 'kani': True})
        self.assertEqual(select(listed[:-1]), {'verify': False, 'kani': False})

    def test_the_script_prints_github_outputs(self):
        def run(text):
            return subprocess.run([sys.executable, '-I', str(SCRIPT)], input=text, capture_output=True, text=True, check=True).stdout
        self.assertEqual(run('web/src/App.svelte\n'), 'verify=false\nkani=false\n')
        self.assertEqual(run('engine/src/linalg/dense.rs\n'), 'verify=true\nkani=true\n')
        self.assertEqual(run('\n'), 'verify=true\nkani=true\n')
        self.assertEqual(run(''), 'verify=true\nkani=true\n')

    def test_every_engine_module_the_harnesses_name_is_a_kani_input(self):
        src = ROOT / 'engine/src'
        text = (src / 'kani_proofs.rs').read_text()
        named = set(re.findall(r'crate::([a-z_0-9]+(?:::[a-z_0-9]+)?)', text))
        self.assertTrue(named)
        for module in sorted(named):
            parts = module.split('::')
            files = [src / (parts[0] + '.rs'), src / parts[0] / 'mod.rs']
            if len(parts) > 1:
                files = [src / parts[0] / (parts[1] + '.rs'), src / parts[0] / parts[1] / 'mod.rs'] + files
            path = next(f for f in files if f.exists()).relative_to(ROOT).as_posix()
            with self.subTest(module=module):
                self.assertTrue(verify_changes.kani_input(path), path)

    def test_every_kani_input_module_exists(self):
        for path in verify_changes.KANI_MODULES:
            with self.subTest(path=path):
                self.assertTrue((ROOT / path).exists(), path)

    def test_the_workflow_runs_kani_on_main_and_nightly_and_fails_closed(self):
        text = (ROOT / '.github/workflows/verify.yml').read_text()
        changes = text.split('\n  changes:\n', 1)[1].split('\n  lean:\n', 1)[0]
        self.assertIn('kani: ${{ steps.filter.outputs.kani }}', changes)
        self.assertIn('python3 -I .github/scripts/verify-changes.py <<<"$files" | tee -a "$GITHUB_OUTPUT"', changes)
        self.assertIn("if: github.event_name == 'pull_request' || github.event_name == 'merge_group'", changes)
        kani = text.split('\n  kani:\n', 1)[1]
        gate = re.search(r'^    if: (.+)$', kani, re.M).group(1)
        self.assertIn("(github.event_name != 'pull_request' && github.event_name != 'merge_group')", gate)
        self.assertIn("needs.changes.result != 'success'", gate)
        self.assertIn("needs.changes.outputs.kani != 'false'", gate)
        self.assertIn('schedule:', text.split('\njobs:\n', 1)[0])
        self.assertIn('branches: [main]', text.split('\njobs:\n', 1)[0])


if __name__ == '__main__':
    unittest.main()
