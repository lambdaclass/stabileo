import hashlib
import json
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
import unittest

root = Path(__file__).resolve().parents[2]


class BenchmarkOutputs(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory(dir=root / 'target')
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

    @unittest.skip('known wrong result: #2505')
    def test_every_mesh_reaction_is_included_in_the_plate_verdict(self):
        folder = self.benchmark('benchmarks/navier-plate')
        self.wrap_export(folder, 'solve3D', """input => {
          const result = actual.solve3D(input);
          if (input.nodes.size === 65 * 65) result.reactions[0].fz += 1;
          return result;
        }""")
        self.reject(folder)

    @unittest.skip('known wrong result: #2505')
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

    @unittest.skip('known wrong result: #2505')
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


if __name__ == '__main__':
    native = Path(sys.argv.pop()).resolve() if sys.argv[-1].endswith('.json') else None
    unittest.main()
