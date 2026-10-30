"""Run with python3 -I research/tools/test_check_isolation.py."""
import importlib.util
import pathlib
import tempfile
import unittest

spec = importlib.util.spec_from_file_location("isolation", pathlib.Path(__file__).with_name("check_isolation.py"))
isolation = importlib.util.module_from_spec(spec)
spec.loader.exec_module(isolation)


class Isolation(unittest.TestCase):
    def test_allowlist(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = pathlib.Path(tmp)
            (root / "Cargo.toml").write_text("[workspace]\n")
            (root / "web/src").mkdir(parents=True)
            source = root / "web/src/example.ts"
            for data in ["metamaterials/grossman-2026/results/stabileo_results.json", "papers.json", "fracture/paper/VALIDATION.json", "fracture/paper/reference-results/steps.csv"]:
                source.write_text(f"import data from '../../research/{data}?raw';")
                self.assertEqual(isolation.check(root), [])
            for code in ["fracture/paper/src/lib.rs", "tools/catalog.py", "metamaterials/grossman-2026/results/solver.ts", "metamaterials/grossman-2026/results/private.json", "papers.yaml", "fracture/paper/reference-results/run.ts"]:
                source.write_text(f"import data from '../../research/{code}?raw';")
                self.assertTrue(isolation.check(root), code)
            for code in ["fracture/paper/src/lib.rs", "${field}/${paper}/solver.js", "fracture/paper/reference-results/${name}.json"]:
                source.write_text(f"const module = import(`../../research/{code}`);")
                self.assertTrue(isolation.check(root), code)
            source.unlink()
            (root / "engine").mkdir()
            (root / "engine/lib.rs").write_text('include_str!("../research/papers.json");')
            self.assertTrue(isolation.check(root))

    def test_engine_tests_may_include_only_reference_results_json(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = pathlib.Path(tmp)
            (root / "Cargo.toml").write_text("[workspace]\n")
            tests = root / "engine/tests/validation"
            tests.mkdir(parents=True)
            source = tests / "arc_length.rs"
            for data in [
                "numerical-methods/riks-crisfield/reference-results/arc_length_snap_through.json",
                "fracture/paper/reference-results/steps.json",
            ]:
                source.write_text(f'include_str!("../../../research/{data}");')
                self.assertEqual(isolation.check(root), [], data)
            for data in [
                "numerical-methods/riks-crisfield/reference-results/steps.csv",
                "numerical-methods/riks-crisfield/VALIDATION.json",
                "numerical-methods/riks-crisfield/native/src/main.rs",
                "papers.json",
                "numerical-methods/riks-crisfield/reference-results/${name}.json",
            ]:
                source.write_text(f'include_str!("../../../research/{data}");')
                self.assertTrue(isolation.check(root), data)
            for location in ["engine/src/lib.rs", "engine/benches/arc.rs", "engine/tests/arc.ts"]:
                path = root / location
                path.parent.mkdir(parents=True, exist_ok=True)
                path.write_text('include_str!("research/numerical-methods/riks-crisfield/reference-results/arc_length_snap_through.json");')
                self.assertTrue(isolation.check(root), location)
                path.unlink()


if __name__ == "__main__":
    unittest.main()
