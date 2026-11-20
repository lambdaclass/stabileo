import importlib.util
from pathlib import Path
import subprocess
import tempfile
import unittest
from unittest.mock import patch

SCRIPT = Path(__file__).resolve().parents[1] / 'check-production-parity.py'
SPEC = importlib.util.spec_from_file_location('production_parity', SCRIPT)
parity = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(parity)


class ProductionParity(unittest.TestCase):
    def test_only_new_opt_ins_trigger_parity_automatically(self):
        off = {'production': {'example': False}, 'test': {'example': False}}
        on = {'production': {'example': False}, 'test': {'example': True}}
        production = {'production': {'example': True}, 'test': {'example': True}}
        self.assertTrue(parity.profiles_enable_off_switch(off, on))
        self.assertTrue(parity.profiles_enable_off_switch({}, on))
        self.assertFalse(parity.profiles_enable_off_switch(on, on))
        self.assertFalse(parity.profiles_enable_off_switch(off, production))

    def test_reference_follows_new_base_and_replays_only_intended_paths(self):
        with tempfile.TemporaryDirectory(dir=parity.ROOT) as directory:
            repo = Path(directory)
            def git(*args):
                return subprocess.check_output(['git', '-C', str(repo), *args], stderr=subprocess.PIPE).decode().strip()

            git('init', '--quiet')
            git('config', 'user.name', 'Production parity fixture')
            git('config', 'user.email', 'parity@example.invalid')
            new_main = repo / 'inherited-source.js'
            new_main.write_text('base')
            carried = repo / 'intentional-source.js'
            carried.write_text('before')
            git('add', '.')
            git('commit', '--quiet', '-m', 'Add published sources')
            new_main.write_text('current main')
            git('add', '.')
            git('commit', '--quiet', '-m', 'Move main')
            base = git('rev-parse', 'HEAD')
            carried.write_text('intended')
            new_main.write_text('leaked')
            added = repo / 'new-dependency.js'
            added.write_text('unintended')
            git('add', '.')
            reference = repo / 'reference'
            with patch.object(parity, 'ROOT', repo):
                parity.snapshot(base, reference, {carried.name})
            self.assertEqual((reference / new_main.name).read_text(), 'current main')
            self.assertEqual((reference / carried.name).read_text(), 'intended')
            self.assertFalse((reference / added.name).exists())

    def test_outputs_detect_binary_changes_additions_and_removals(self):
        with tempfile.TemporaryDirectory(dir=parity.ROOT) as directory:
            expected, actual = (Path(directory) / name for name in ('expected', 'actual'))
            for output in (expected, actual):
                output.mkdir()
                (output / 'index.html').write_text('same')
                (output / 'assets').mkdir()
                (output / 'assets' / 'new-unpinned.wasm').write_bytes(b'\x00\xff')
            self.assertEqual(parity.differences(parity.inventory(expected), parity.inventory(actual)), [])
            (actual / 'assets' / 'new-unpinned.wasm').write_bytes(b'\x00\xfe')
            (actual / 'new.css').write_text('new')
            (expected / 'old.svg').write_text('old')
            self.assertEqual(parity.differences(parity.inventory(expected), parity.inventory(actual)),
                             ['assets/new-unpinned.wasm', 'new.css', 'old.svg'])

    def test_gate_rejects_a_new_production_dependency_and_accepts_the_gated_equivalent(self):
        with tempfile.TemporaryDirectory(dir=parity.ROOT) as directory:
            repo = Path(directory)
            web = repo / 'web'
            (web / 'config').mkdir(parents=True)
            (web / 'package.json').write_text('{"scripts":{"build":"node build.cjs"}}')
            (web / 'package-lock.json').write_text('{}')
            (repo / parity.FLAGS).write_text('{"production":{"newFeature":false},"test":{"newFeature":false}}')
            (web / 'build.cjs').write_text(
                'const fs = require("node:fs");\n'
                'const { execFileSync } = require("node:child_process");\n'
                'const path = require("node:path");\n'
                'const root = execFileSync("git", ["rev-parse", "--show-toplevel"], { encoding: "utf8" }).trim();\n'
                'if (root !== path.dirname(process.cwd())) throw Error("wrong Git source root");\n'
                'fs.mkdirSync("dist");\n'
                'fs.writeFileSync("dist/index.html", "legacy");\n'
            )
            def git(*args):
                subprocess.run(['git', *args], cwd=repo, check=True, stdout=subprocess.DEVNULL)

            git('init', '--quiet')
            git('config', 'user.name', 'Production parity fixture')
            git('config', 'user.email', 'parity@example.invalid')
            git('add', '.')
            git('commit', '--quiet', '-m', 'Published reference with the feature off')
            (repo / parity.FLAGS).write_text('{"production":{"newFeature":false},"test":{"newFeature":true}}')
            (web / 'new-dependency.js').write_text('new behaviour')
            git('add', '.')
            baseline = (web / 'build.cjs').read_text()
            output = 'fs.copyFileSync("new-dependency.js", "dist/new-dependency.js");\n'
            with patch.object(parity, 'ROOT', repo), patch('sys.argv', ['check-production-parity.py', 'HEAD']):
                (web / 'build.cjs').write_text(baseline + 'if (require("./config/features.json").production.newFeature) ' + output)
                parity.main()
                (web / 'build.cjs').write_text(baseline + output)
                with self.assertRaisesRegex(SystemExit, r'Switch-off production differs[\s\S]*new-dependency.js'):
                    parity.main()

    def test_missing_output_cannot_pass_as_matching(self):
        with tempfile.TemporaryDirectory(dir=parity.ROOT) as directory:
            with self.assertRaisesRegex(RuntimeError, 'did not emit index.html'):
                parity.inventory(Path(directory))


if __name__ == '__main__':
    unittest.main()
