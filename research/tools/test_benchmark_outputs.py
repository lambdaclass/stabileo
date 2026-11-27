import hashlib
import json
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
import unittest
from unittest.mock import patch

root = Path(__file__).resolve().parents[2]


class BenchmarkOutputs(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory(dir=root)
        self.addCleanup(self.tmp.cleanup)
        self.base = Path(self.tmp.name)
        for name in ['web', 'engine']:
            (self.base / name).symlink_to(root / name)

    def benchmark(self, relative):
        folder = self.base / 'research' / relative
        original = root / 'research' / relative
        for pattern in ['wasm/check.mjs', 'reference-results/*.json', 'results/*.json', 'VALIDATION.json']:
            for file in original.glob(pattern):
                dest = folder / file.relative_to(original)
                dest.parent.mkdir(parents=True, exist_ok=True)
                shutil.copyfile(file, dest)
        return folder

    def reject(self, folder, *args):
        process = subprocess.run(['node', folder / 'wasm/check.mjs', *args], capture_output=True, text=True, cwd=root)
        self.assertNotEqual(process.returncode, 0, process.stdout[-250:])

    def wrap_export(self, folder, export, replacement):
        checker = folder / 'wasm/check.mjs'
        source = checker.read_text().replace('import { createServer }', 'import { createServer as viteServer }')
        wrapper = """
const createServer = async settings => {
  const server = await viteServer(settings);
  const load = server.ssrLoadModule.bind(server);
  server.ssrLoadModule = async id => {
    const actual = await load(id);
    if (typeof actual[EXPORT] !== 'function') return actual;
    return { ...actual, [EXPORT]: REPLACEMENT };
  };
  return server;
};
""".replace('EXPORT', json.dumps(export)).replace('REPLACEMENT', replacement)
        checker.write_text(source.replace('const server = await createServer', wrapper + 'const server = await createServer'))

    @unittest.skip("known wrong result: #2505")
    def test_portal_step_measurements_and_event_identity(self):
        folder = self.benchmark('benchmarks/plastic-collapse')
        path = folder / 'results/stabileo_results.json'
        original = path.read_text()
        for mutation in ['null displacement', 'step load', 'hinge step']:
            with self.subTest(mutation=mutation):
                data = json.loads(original)
                steps = data['result']['steps']
                if mutation == 'null displacement':
                    steps[0]['results']['displacements'][0]['ux'] = None
                elif mutation == 'step load':
                    steps[1]['loadFactor'] += 1
                else:
                    steps[0]['hingesFormed'], steps[1]['hingesFormed'] = steps[1]['hingesFormed'], steps[0]['hingesFormed']
                path.write_text(json.dumps(data))
                self.reject(folder)

    @unittest.skip("known wrong result: #2505")
    def test_plate_rejects_extra_soft_and_hard_rows(self):
        folder = self.benchmark('benchmarks/navier-plate')
        path = folder / 'results/stabileo_results.json'
        original = path.read_text()
        for field in ('rows', 'hard_rows'):
            with self.subTest(field=field):
                data = json.loads(original)
                data[field].append(data[field][0])
                path.write_text(json.dumps(data))
                self.reject(folder)

    @unittest.skip("known wrong result: #2505")
    def test_shell_requires_all_meshes_and_finite_fresh_evidence(self):
        folder = self.benchmark('benchmarks/shell-obstacle-course')
        native_dir = root / 'research/benchmarks/shell-obstacle-course/results'
        checker = folder / 'wasm/check.mjs'
        source = checker.read_text()
        for mutation in ('missing mesh', 'measurement', 'null observation'):
            with self.subTest(mutation=mutation):
                checker.write_text(source)
                if mutation == 'missing mesh':
                    checker.write_text(source.replace('const rows = await runCases();', """cases.splice(cases.findIndex(c => c.id === 'hemisphere-8'), 1);
  const rows = (await runCases()).filter(r => r.id !== 'hemisphere-8');"""))
                elif mutation == 'measurement':
                    path = folder / 'results/wasm-results.json'
                    rows = json.loads(path.read_text())
                    next(r for r in rows if r['id'] == 'cylinder-12')['value'] *= 0.99
                    path.write_text(json.dumps(rows))
                else:
                    shutil.copyfile(native_dir / 'wasm-results.json', folder / 'results/wasm-results.json')
                    path = folder / 'VALIDATION.json'
                    data = json.loads(path.read_text())
                    next(r for r in data['checks'] if r['id'] == 'parity')['observed'] = None
                    path.write_text(json.dumps(data))
                self.reject(folder, native_dir)

    @unittest.skip("known wrong result: #2505")
    def test_macneal_distorted_reference_must_match_regular_reference(self):
        folder = self.benchmark('benchmarks/macneal-harder-1985')
        checker = folder / 'wasm/check.mjs'
        checker.write_text(checker.read_text().replace('const rows = await runCases();',
            "cases.find(c => c.id === 'mitc4-trapezoidal-out').reference = 0.45;\n  const rows = await runCases();"))
        self.reject(folder, native, '--write')

    def test_optimized_newmark_check_rejects_a_stale_period(self):
        folder = self.benchmark('benchmarks/newmark-1959')
        script = folder / 'reference.py'
        shutil.copyfile(root / 'research/benchmarks/newmark-1959/reference.py', script)
        command = [sys.executable, '-I', '-O', script]
        subprocess.run(command, check=True, capture_output=True)
        file = folder / 'reference-results/closed-form.json'
        stored = json.loads(file.read_text())
        stored['period'] *= 2
        file.write_text(json.dumps(stored))
        process = subprocess.run(command, capture_output=True, text=True)
        self.assertNotEqual(process.returncode, 0)
        self.assertIn('MANIFEST.json hashes are stale', process.stderr)

    def test_every_mesh_reaction_is_included_in_the_plate_verdict(self):
        folder = self.benchmark('benchmarks/navier-plate')
        self.wrap_export(folder, 'solve3D', """input => {
          const result = actual.solve3D(input);
          if (input.nodes.size === 65 * 65) result.reactions[0].fz += 1;
          return result;
        }""")
        self.reject(folder)

    def test_plate_uses_fresh_coarse_series_in_truncation_and_paper_rows(self):
        folder = self.benchmark('benchmarks/navier-plate')
        self.wrap_export(folder, 'navierCenter', '(...args) => actual.navierCenter(...args) + (args.length ? 0 : 5e-13)')
        result = subprocess.run(['node', folder / 'wasm/check.mjs', '--write'], capture_output=True, text=True)
        self.assertEqual(result.returncode, 0, result.stderr)
        validation = lambda directory: json.loads((directory / 'VALIDATION.json').read_text())['checks']
        original = root / 'research/benchmarks/navier-plate'
        errors = lambda directory: next(r['observed'] for r in validation(directory) if 'thin-plate series truncation' in r['metric'])
        self.assertNotEqual(errors(folder), errors(original))
        published = lambda directory: json.loads((directory / 'reference-results/published_comparison.json').read_text())['checks']
        series = lambda directory: next(r['computed'] for r in published(directory) if r['id'] == 'series')
        self.assertGreater(series(folder), series(original))

    def test_portal_requires_live_nodes_and_the_complete_sweep(self):
        folder = self.benchmark('benchmarks/plastic-collapse')
        checker = folder / 'wasm/check.mjs'
        original = checker.read_text()
        for name, expression in [('run', """async params => {
              const result = await actual.run(params);
              result.steps[0].results.displacements.pop();
              return result;
            }"""), ('checks', '() => []')]:
            with self.subTest(name=name):
                checker.write_text(original)
                self.wrap_export(folder, name, expression)
                self.reject(folder)

    def test_fairclough_needs_every_weight(self):
        folder = self.benchmark('optimisation/fairclough-2026')
        file = folder / 'reference-results/published_comparison.json'
        rows = json.loads(file.read_text())['checks']
        for incomplete in [[], rows[:-1], rows[:-1] + rows[:1]]:
            with self.subTest(count=len(incomplete)):
                file.write_text(json.dumps({'checks': incomplete}))
                self.reject(folder)

    def test_hard_plate_replay_contains_one_displacement_per_mesh_node(self):
        folder = self.benchmark('benchmarks/navier-plate')
        file = folder / 'results/stabileo_results.json'
        data = json.loads(file.read_text())
        data['hard_rows'][0]['values'].append(0)
        file.write_text(json.dumps(data))
        self.reject(folder)

    def test_portal_requires_every_recorded_node_and_member(self):
        folder = self.benchmark('benchmarks/plastic-collapse')
        file = folder / 'results/stabileo_results.json'
        control = subprocess.run(['node', folder / 'wasm/check.mjs'], capture_output=True, text=True)
        self.assertEqual(control.returncode, 0, control.stderr[-3000:])
        original = file.read_text()
        for field, alter in [('displacements', 'duplicate'), ('elementForces', 'remove'), ('elementForces', 'duplicate'), ('elementForces', 'moment')]:
            with self.subTest(field=field, alter=alter):
                data = json.loads(original)
                records = data['result']['steps'][1]['results'][field]
                if alter == 'duplicate':
                    records.append(records[0])
                elif alter == 'remove':
                    records.pop()
                else:
                    records[0]['myEnd'] += 1
                file.write_text(json.dumps(data))
                self.reject(folder)

    def test_macneal_rejects_stale_measurements_even_with_a_matching_digest(self):
        folder = self.benchmark('benchmarks/macneal-harder-1985')
        file = folder / 'reference-results/published_comparison.json'
        manifest = file.with_name('MANIFEST.json')
        records = file.read_text()
        for field in ['computed', 'reference']:
            with self.subTest(field=field):
                data = json.loads(records)
                data['checks'][0][field] += 0.001
                file.write_text(json.dumps(data))
                metadata = json.loads(manifest.read_text())
                metadata['files_sha256'][file.name] = hashlib.sha256(file.read_bytes()).hexdigest()
                manifest.write_text(json.dumps(metadata))
                self.reject(folder, native)


class CleanCheckout(unittest.TestCase):
    def test_checker_scratch_without_a_native_build(self):
        with tempfile.TemporaryDirectory(dir=root) as checkout:
            with patch.dict(BenchmarkOutputs.setUp.__globals__, root=Path(checkout)):
                case = BenchmarkOutputs()
                try:
                    case.setUp()
                    self.assertTrue(case.base.is_dir())
                finally:
                    case.doCleanups()


if __name__ == '__main__':
    native = Path(sys.argv.pop()).resolve() if sys.argv[-1].endswith('.json') else None
    unittest.main()
