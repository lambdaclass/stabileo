import importlib.util
import json
from pathlib import Path
import unittest
import tempfile
import sys
import subprocess
from unittest.mock import patch

spec = importlib.util.spec_from_file_location("plastic_replay", Path(__file__).parents[1] / "replay-plastic-budget.py")
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


class SeededReplay(unittest.TestCase):
    binary = Path("engine/fuzz/target/release/examples/plastic_replay")
    seed = Path("engine/fuzz/corpus-regressions/plastic-lp-budget/good-loaded-beam.bin")

    @classmethod
    def setUpClass(cls):
        directory = tempfile.TemporaryDirectory(dir=".")
        cls.addClassCleanup(directory.cleanup)
        cls.binary = Path(directory.name).resolve() / "replay-runner"
        cls.binary.write_text(f"#!{sys.executable}\n" + r'''import json
from pathlib import Path
import sys
import time

artifact, mode, repeats = sys.argv[1:]
if mode == "hang" or Path(artifact).name == "engine-grid-slab.bin":
    time.sleep(60)
model = json.loads(Path(artifact).read_bytes()[2:])
length = model["solver"]["nodes"]["2"]["x"] - model["solver"]["nodes"]["1"]["x"]
load = abs(model["solver"]["loads"][0]["data"]["qZI"])
factor = 16 * model["mpOverrides"]["1"][0] / (load * length * length)
certificate = dict(certified=True, lambdaLower=factor, lambdaUpper=factor,
                   solverWithinBounds=True)
live = 0
for iteration in range(int(repeats)):
    before = live
    if mode == "leak" or (mode == "leak-first" and iteration == 0):
        live += 1 << 20
    print(json.dumps(dict(iteration=iteration, live_before=before, live_after=live,
                          outcome="ok: " + json.dumps(certificate))), flush=True)
''')
        cls.binary.chmod(0o755)

    def test_slow_grid_runs_only_under_the_replay_watchdog(self):
        seed = self.seed.with_name("engine-grid-slab.bin")
        result = module.replay(self.binary, seed, mode="engine", repeats=1, seconds=0.5)
        self.assertEqual(result["failure"], "timeout", result)
        self.assertEqual(result["iterations"], [], result)

    def test_first_call_only_leak_is_detected_even_with_one_repeat(self):
        with tempfile.TemporaryDirectory(dir=".") as directory:
            binary = Path(directory).resolve() / "first-leak"
            binary.write_text(f"#!{sys.executable}\nimport json, sys\nfor i in range(int(sys.argv[3])):\n print(json.dumps(dict(live_before=0 if i == 0 else 1, live_after=1)))\n")
            binary.chmod(0o755)
            for repeats in (1, 3):
                result = module.replay(binary, self.seed, repeats=repeats, seconds=10)
                self.assertEqual(result["failure"], "retained allocation", result)

    def test_good_seed_repeats_without_retaining_allocations(self):
        result = module.replay(self.binary, self.seed, repeats=3, seconds=10)
        self.assertIsNone(result["failure"], result)
        self.assertTrue(all(row["outcome"].startswith("ok:") for row in result["iterations"]), result)
        model = json.loads(self.seed.read_bytes()[2:])
        length = model["solver"]["nodes"]["2"]["x"] - model["solver"]["nodes"]["1"]["x"]
        load = abs(model["solver"]["loads"][0]["data"]["qZI"])
        expected = 16 * model["mpOverrides"]["1"][0] / (load * length * length)
        for row in result["iterations"]:
            certificate = json.loads(row["outcome"][4:])
            self.assertTrue(certificate["certified"], result)
            self.assertLessEqual(certificate["lambdaLower"], expected, result)
            self.assertLessEqual(expected, certificate["lambdaUpper"], result)
            self.assertIs(certificate["solverWithinBounds"], True, result)

    def test_first_call_only_engine_leak_is_detected(self):
        for repeats in (1, 3):
            result = module.replay(self.binary, self.seed, mode="leak-first", repeats=repeats, seconds=10)
            self.assertEqual(result["failure"], "retained allocation", result)
            rows = result["iterations"]
            self.assertGreaterEqual(rows[0]["live_after"] - rows[0]["live_before"], 1 << 20, result)
            self.assertTrue(all(row["live_after"] == row["live_before"] for row in rows[1:]), result)

    def test_admitted_seed_with_planted_hang_times_out(self):
        result = module.replay(self.binary, self.seed, mode="hang", seconds=0.5)
        self.assertEqual(result["failure"], "timeout", result)

    def test_admitted_seed_with_planted_leak_is_flagged(self):
        result = module.replay(self.binary, self.seed, mode="leak", repeats=3, seconds=10)
        self.assertEqual(result["failure"], "retained allocation", result)
        self.assertTrue(all(row["live_after"] - row["live_before"] >= 1 << 20 for row in result["iterations"]), result)


class ReplayBuild(unittest.TestCase):
    def test_script_target_does_not_build_rust_or_require_nix(self):
        result = subprocess.run(["make", "-n", "test.engine.plastic-budget-watchdog", "NIX_RUN="],
                                capture_output=True, text=True)
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertNotIn("cargo", result.stdout)
        self.assertNotIn("nix", result.stdout)

    def test_script_runner_setup_does_not_invoke_a_build(self):
        with patch.object(subprocess, "run") as build:
            SeededReplay.setUpClass()
        self.addCleanup(SeededReplay.doClassCleanups)
        build.assert_not_called()

    def test_engine_replay_builds_the_example_before_running(self):
        result = subprocess.run(["make", "-n", "test.engine.plastic-replay", "NIX_RUN="],
                                capture_output=True, text=True)
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertLess(result.stdout.index("cargo build"),
                        result.stdout.index("scripts/plastic-budget-engine-tests.py"))

    def test_replay_build_uses_the_directory_consumed_by_tests(self):
        result = subprocess.run(["make", "-n", "build.engine.plastic-budget", "NIX_RUN="],
                                capture_output=True, text=True)
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertIn("--target-dir engine/fuzz/target", result.stdout)
        self.assertIn("--example plastic_replay", result.stdout)


if __name__ == "__main__":
    unittest.main()
