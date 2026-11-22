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

SOLVER_RECIPE = (
    'wasm:\n'
    '\tmkdir -p web/src/lib/wasm\n'
    '\tprintf glue > web/src/lib/wasm/dedaliano_engine.js\n'
    '\tprintf legacy > web/src/lib/wasm/dedaliano_engine_bg.wasm\n'
)


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

    @unittest.skip("known wrong result: #2483")
    def test_reference_materializes_base_only_blobs_from_a_partial_clone(self):
        with tempfile.TemporaryDirectory(dir=parity.ROOT) as directory:
            fixture = Path(directory)
            upstream = fixture / 'upstream'
            upstream.mkdir()
            repo = fixture / 'ci-checkout'

            def git(checkout, *args):
                return subprocess.check_output(['git', '-C', str(checkout), *args]).decode().strip()

            git(upstream, 'init', '--quiet')
            git(upstream, 'config', 'user.name', 'Production parity fixture')
            git(upstream, 'config', 'user.email', 'parity@example.invalid')
            git(upstream, 'config', 'uploadpack.allowFilter', 'true')
            git(upstream, 'config', 'uploadpack.allowAnySHA1InWant', 'true')
            (upstream / 'Makefile').write_text(SOLVER_RECIPE)
            (upstream / 'intended.bin').write_bytes(b'\x00\xff')
            git(upstream, 'add', '.')
            git(upstream, 'commit', '--quiet', '-m', 'Published reference')
            base = git(upstream, 'rev-parse', 'HEAD')
            base_recipe = git(upstream, 'rev-parse', 'HEAD:Makefile')
            (upstream / 'Makefile').write_text(SOLVER_RECIPE.replace('printf legacy', 'printf changed'))
            (upstream / 'intended.bin').write_bytes(b'\x00\xfe')
            git(upstream, 'add', '.')
            git(upstream, 'commit', '--quiet', '-m', 'Change the candidate recipe and asset')

            git(upstream, 'clone', '--quiet', '--filter=blob:none', upstream.as_uri(), str(repo))
            self.assertIn(f'?{base_recipe}', git(repo, 'rev-list', '--objects', '--missing=print', base).splitlines())
            reference = fixture / 'reference'
            with patch.object(parity, 'ROOT', repo):
                parity.snapshot(base, reference, {'intended.bin'})
            self.assertEqual(git(reference, 'rev-parse', 'HEAD'), base)
            self.assertEqual((reference / 'Makefile').read_text(), SOLVER_RECIPE)
            self.assertEqual((reference / 'intended.bin').read_bytes(), b'\x00\xfe')
            self.assertEqual(git(reference, 'diff', '--cached', '--name-only'), 'intended.bin')
            self.assertEqual(git(repo, 'status', '--porcelain'), '')

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
            (repo / 'Makefile').write_text(SOLVER_RECIPE + 'research.wasm: ;\n')
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

    def test_gate_builds_each_solver_with_its_own_makefile(self):
        with tempfile.TemporaryDirectory(dir=parity.ROOT) as directory:
            repo = Path(directory)
            web = repo / 'web'
            engine_source = repo / 'engine/src/lib.rs'
            engine_source.parent.mkdir(parents=True)
            engine_source.write_text('legacy')
            (web / 'config').mkdir(parents=True)
            (web / 'package.json').write_text('{"scripts":{"build":"node build.cjs"}}')
            (web / 'package-lock.json').write_text('{}')
            (repo / parity.FLAGS).write_text('{"production":{"newFeature":false},"test":{"newFeature":false}}')
            (web / 'build.cjs').write_text(
                'const fs = require("node:fs");\n'
                'fs.mkdirSync("dist");\n'
                'fs.writeFileSync("dist/index.html", "legacy");\n'
                'fs.copyFileSync("src/lib/wasm/dedaliano_engine_bg.wasm", "dist/solver.wasm");\n'
            )
            makefile = repo / 'Makefile'
            recipe = SOLVER_RECIPE + 'research.wasm: ;\n'
            makefile.write_text(recipe)
            (repo / '.gitignore').write_text('/web/src/lib/wasm/\n')

            def run(*args):
                subprocess.run(args, cwd=repo, check=True, stdout=subprocess.DEVNULL)

            run('git', 'init', '--quiet')
            run('git', 'config', 'user.name', 'Production parity fixture')
            run('git', 'config', 'user.email', 'parity@example.invalid')
            run('git', 'add', '.')
            run('git', 'commit', '--quiet', '-m', 'Published reference with the original solver recipe')
            base = subprocess.check_output(['git', 'rev-parse', 'HEAD'], cwd=repo).decode().strip()
            (repo / parity.FLAGS).write_text('{"production":{"newFeature":false},"test":{"newFeature":true}}')

            run('make', 'wasm')
            with patch.object(parity, 'ROOT', repo), patch('sys.argv', ['check-production-parity.py', base]):
                parity.main()
                opt_in = repo / 'engine/src/experimental.rs'
                opt_in.write_text('pub fn experimental() {}\n')
                run('git', 'add', str(opt_in.relative_to(repo)))
                parity.main()
                makefile.write_text(recipe.replace('printf legacy', 'cat engine/src/lib.rs'))
                parity.main()
                engine_source.write_text('changed')
                with self.assertRaisesRegex(SystemExit, r'Switch-off production differs[\s\S]*dedaliano_engine_bg.wasm'):
                    parity.main()
                engine_source.write_text('legacy')
                makefile.write_text(recipe.replace('printf legacy', 'printf changed'))
                run('make', 'wasm')
                with self.assertRaisesRegex(SystemExit, r'Switch-off production differs[\s\S]*solver.wasm'):
                    parity.main()
                run('git', 'add', 'Makefile')
                run('git', 'commit', '--quiet', '-m', 'Intentionally change the solver recipe',
                    '-m', 'Production-Change: Makefile')
                parity.main()
                makefile.write_text(SOLVER_RECIPE.split('\tprintf legacy')[0])
                with self.assertRaisesRegex(RuntimeError, r'did not emit .*dedaliano_engine_bg.wasm'):
                    parity.main()

    def test_gate_builds_research_wasm_from_each_checkout(self):
        with tempfile.TemporaryDirectory(dir=parity.ROOT) as directory:
            repo = Path(directory)
            web = repo / 'web'
            source = repo / 'research/example/src/lib.rs'
            source.parent.mkdir(parents=True)
            source.write_text('pub fn solve() -> i32 { 1 }\n')
            (web / 'config').mkdir(parents=True)
            (web / 'package.json').write_text('{"scripts":{"build":"node build.cjs"}}')
            (web / 'package-lock.json').write_text('{}')
            (repo / parity.FLAGS).write_text('{"production":{"newFeature":false},"test":{"newFeature":false}}')
            (repo / '.gitignore').write_text('/web/public/research-wasm/\n')
            (repo / 'Makefile').write_text(SOLVER_RECIPE +
                'research.wasm:\n'
                '\tmkdir -p web/public/research-wasm/example\n'
                '\tcp research/example/src/lib.rs web/public/research-wasm/example/solver_bg.wasm\n'
            )
            (web / 'build.cjs').write_text(
                'const fs = require("node:fs");\n'
                'fs.mkdirSync("dist");\n'
                'fs.writeFileSync("dist/index.html", "legacy");\n'
                'fs.cpSync("public/research-wasm", "dist/research-wasm", { recursive: true });\n'
            )

            def run(*args):
                subprocess.run(args, cwd=repo, check=True, stdout=subprocess.DEVNULL)

            run('git', 'init', '--quiet')
            run('git', 'config', 'user.name', 'Production parity fixture')
            run('git', 'config', 'user.email', 'parity@example.invalid')
            run('git', 'add', '.')
            run('git', 'commit', '--quiet', '-m', 'Published reference with the original research solver')
            base = subprocess.check_output(['git', 'rev-parse', 'HEAD'], cwd=repo).decode().strip()
            run('make', 'research.wasm')
            with patch.object(parity, 'ROOT', repo), patch('sys.argv', ['check-production-parity.py', base, '--required']):
                parity.main()
                source.write_text('pub fn solve() -> i32 { 2 }\n')
                run('make', 'research.wasm')
                with self.assertRaisesRegex(SystemExit, r'Switch-off production differs[\s\S]*research-wasm/example/solver_bg.wasm'):
                    parity.main()
                run('git', 'add', str(source.relative_to(repo)))
                run('git', 'commit', '--quiet', '-m', 'Intentionally change the research solver',
                    '-m', 'Production-Change: research/example/src/lib.rs')
                parity.main()

    def test_missing_output_cannot_pass_as_matching(self):
        with tempfile.TemporaryDirectory(dir=parity.ROOT) as directory:
            with self.assertRaisesRegex(RuntimeError, 'did not emit index.html'):
                parity.inventory(Path(directory))


if __name__ == '__main__':
    unittest.main()
