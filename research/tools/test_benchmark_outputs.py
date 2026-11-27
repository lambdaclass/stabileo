import os
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
native = None


class BenchmarkOutputs(unittest.TestCase):
    def test_all_shell_sources_have_a_single_solve_outcome(self):
        folder = self.benchmark('benchmarks/shell-obstacle-course')
        recorded = folder / 'results/wasm-results.json'
        original = json.loads(recorded.read_text())
        native_dir = folder / 'results'
        self.control(folder, native_dir, '--write')
        for case, change, diagnostic in [
            ('hemisphere-4', {'value': 1, 'pass': True}, 'hemisphere-refusals'),
            ('roof-16', {'refused': True}, 'roof-16: expected successful solve'),
            ('cylinder-8', {'failure': 'failed'}, 'cylinder-8: expected successful solve'),
        ]:
            with self.subTest(case=case):
                recorded.write_text(json.dumps([{**r, **change} if r['id'] == case else r for r in original]))
                self.reject(folder, diagnostic, native_dir, '--write')

    def test_cylinder_convergence_uses_mesh_order(self):
        folder = self.benchmark('benchmarks/shell-obstacle-course')
        checker = folder / 'wasm/check.mjs'
        source = checker.read_text()
        hook = 'const rows = await runCases();'
        self.assertIn(hook, source)
        checker.write_text(source.replace(hook, hook + """
  const a = cases.findIndex(c => c.id === 'cylinder-6'), b = cases.findIndex(c => c.id === 'cylinder-8');
  [cases[a], cases[b]] = [cases[b], cases[a]];
"""))
        self.control(folder, folder / 'results', '--write')

    def test_portal_hinge_must_reach_the_section_capacity(self):
        folder = self.benchmark('benchmarks/plastic-collapse')
        self.control(folder)
        p = folder / 'results/stabileo_results.json'
        data = json.loads(p.read_text())
        data['result']['steps'][0]['hingesFormed'][0]['momentY'] /= 10
        p.write_text(json.dumps(data))
        self.reject(folder, 'yield magnitude', '--write')

    def test_macneal_references_are_independent_transcriptions(self):
        folder = self.benchmark('benchmarks/macneal-harder-1985')
        native_file = self.macneal_native()
        self.control(folder, native_file)
        checker = folder / 'wasm/check.mjs'
        source = checker.read_text()
        hook = 'const rows = await runCases();'
        self.assertIn(hook, source)
        checker.write_text(source.replace(hook, "for (const c of cases.filter(c => c.id.startsWith('mitc4-') && c.id.endsWith('-out'))) c.reference = 0.43209;\n  " + hook))
        self.reject(folder, 'Table 3 reference', native_file, '--write')
        checker.write_text(source)
        (self.base / 'engine').unlink()
        relative = Path('engine/tests/benchmarks/shell_obstacle_course.json')
        path = self.base / relative
        path.parent.mkdir(parents=True)
        fixture = json.loads((root / relative).read_text())
        next(c for c in fixture['cases'] if c['id'] == 'roof-16')['reference'] -= 1e-6
        path.write_text(json.dumps(fixture))
        self.reject(folder, 'Table 5(a) reference', native_file, '--write')

    def test_navier_reference_and_budget_are_exact(self):
        folder = self.benchmark('benchmarks/navier-plate')
        self.control(folder)
        path = folder / 'reference-results/published_comparison.json'
        original = path.read_text()
        for key in ['reference', 'tolerance']:
            with self.subTest(key=key):
                data = json.loads(original)
                data['checks'][0][key] *= 1 + 1e-10
                path.write_text(json.dumps(data))
                manifest = folder / 'reference-results/MANIFEST.json'
                m = json.loads(manifest.read_text())
                m['files_sha256'][path.name] = hashlib.sha256(path.read_bytes()).hexdigest()
                manifest.write_text(json.dumps(m))
                self.reject(folder, 'checks.0.' + key)

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

    def macneal_native(self):
        if native is not None:
            return native
        target = self.base / 'macneal-native.json'
        subprocess.run(['make', 'test.engine.targeted', 'TEST=shells', 'FILTER=macneal_harder::browser_cases'],
                       env={**os.environ, 'MACNEAL_HARDER_RESULTS': str(target)}, cwd=root, check=True, capture_output=True)
        return target

    def control(self, folder, *args):
        result = subprocess.run(['node', folder / 'wasm/check.mjs', *args], capture_output=True, text=True, cwd=root)
        self.assertEqual(result.returncode, 0, result.stderr[-3000:])

    def reject(self, folder, diagnostic, *args):
        process = subprocess.run(['node', folder / 'wasm/check.mjs', *args], capture_output=True, text=True, cwd=root)
        self.assertNotEqual(process.returncode, 0, process.stdout[-250:])
        self.assertIn(diagnostic, process.stderr, process.stderr[-3000:])

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

    def test_portal_step_measurements_and_event_identity(self):
        folder = self.benchmark('benchmarks/plastic-collapse')
        self.control(folder)
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
                self.reject(folder, {"null displacement": "finite measurement", "step load": "portal step 1: load", "hinge step": "portal step 0: hinge"}[mutation])

    def test_plate_rejects_extra_soft_and_hard_rows(self):
        folder = self.benchmark('benchmarks/navier-plate')
        self.control(folder)
        path = folder / 'results/stabileo_results.json'
        original = path.read_text()
        for field in ('rows', 'hard_rows'):
            with self.subTest(field=field):
                data = json.loads(original)
                data[field].append(data[field][0])
                path.write_text(json.dumps(data))
                self.reject(folder, 'soft replay mesh identities' if field == 'rows' else 'hard replay mesh identities')

    def test_shell_requires_all_meshes_and_finite_fresh_evidence(self):
        folder = self.benchmark('benchmarks/shell-obstacle-course')
        native_dir = Path(os.environ.get('SHELL_OBSTACLE_RESULTS', root / 'research/benchmarks/shell-obstacle-course/results'))
        if 'SHELL_OBSTACLE_RESULTS' not in os.environ:
            self.control(folder, native_dir, '--write')
        self.control(folder, native_dir)
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
                    shutil.copyfile(root / 'research/benchmarks/shell-obstacle-course/results/wasm-results.json', folder / 'results/wasm-results.json')
                    path = folder / 'VALIDATION.json'
                    data = json.loads(path.read_text())
                    next(r for r in data['checks'] if r['id'] == 'parity')['observed'] = None
                    path.write_text(json.dumps(data))
                self.reject(folder, {'missing mesh': 'required shell meshes', 'measurement': 'cylinder-12: reported error',
                                     'null observation': 'parity: committed null'}[mutation], native_dir)

    def test_macneal_distorted_reference_must_match_regular_reference(self):
        folder = self.benchmark('benchmarks/macneal-harder-1985')
        native_file = self.macneal_native()
        self.control(folder, native_file)
        checker = folder / 'wasm/check.mjs'
        checker.write_text(checker.read_text().replace('const rows = await runCases();',
            "cases.find(c => c.id === 'mitc4-trapezoidal-out').reference = 0.45;\n  const rows = await runCases();"))
        self.reject(folder, 'mitc4-trapezoidal-out: Table 3 reference', native_file, '--write')

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
        self.control(folder)
        self.wrap_export(folder, 'solve3D', """input => {
          const result = actual.solve3D(input);
          if (input.nodes.size === 65 * 65) result.reactions[0].fz += 1;
          return result;
        }""")
        self.reject(folder, 'vertical equilibrium, reactions')

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
        self.control(folder)
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
                self.reject(folder, 'portal nodeId identities' if name == 'run' else 'portal check identities')

    def test_fairclough_needs_every_weight(self):
        folder = self.benchmark('optimisation/fairclough-2026')
        self.control(folder)
        file = folder / 'reference-results/published_comparison.json'
        rows = json.loads(file.read_text())['checks']
        for incomplete in [[], rows[:-1], rows[:-1] + rows[:1]]:
            with self.subTest(count=len(incomplete)):
                file.write_text(json.dumps({'checks': incomplete}))
                self.reject(folder, 'Table 1 weight identities')

    def test_hard_plate_replay_contains_one_displacement_per_mesh_node(self):
        folder = self.benchmark('benchmarks/navier-plate')
        self.control(folder)
        file = folder / 'results/stabileo_results.json'
        data = json.loads(file.read_text())
        data['hard_rows'][0]['values'].append(0)
        file.write_text(json.dumps(data))
        self.reject(folder, 'recorded plate displacement count')

    def test_portal_requires_every_recorded_node_and_member(self):
        folder = self.benchmark('benchmarks/plastic-collapse')
        self.control(folder)
        file = folder / 'results/stabileo_results.json'
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
                self.reject(folder, 'portal nodeId identities' if field == 'displacements' else 'myEnd' if alter == 'moment' else 'portal elementId identities')

    def test_macneal_rejects_stale_measurements_even_with_a_matching_digest(self):
        folder = self.benchmark('benchmarks/macneal-harder-1985')
        native_file = self.macneal_native()
        self.control(folder, native_file)
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
                self.reject(folder, f'published_comparison.json.checks.0.{field}', native_file)


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
