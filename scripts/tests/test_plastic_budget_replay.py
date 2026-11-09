import importlib.util
from pathlib import Path
import unittest

spec = importlib.util.spec_from_file_location("plastic_replay", Path(__file__).parents[1] / "replay-plastic-budget.py")
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


class SeededReplay(unittest.TestCase):
    binary = Path("engine/fuzz/target/release/examples/plastic_replay")
    seed = Path("engine/fuzz/corpus-regressions/plastic-lp-budget/good-cantilever.bin")

    def test_good_seed_repeats_without_retaining_allocations(self):
        result = module.replay(self.binary, self.seed, repeats=3, seconds=10)
        self.assertIsNone(result["failure"], result)
        self.assertTrue(all(row["outcome"].startswith("ok:") for row in result["iterations"]), result)

    def test_admitted_seed_with_planted_hang_times_out(self):
        result = module.replay(self.binary, self.seed, mode="hang", seconds=0.5)
        self.assertEqual(result["failure"], "timeout", result)

    def test_admitted_seed_with_planted_leak_is_flagged(self):
        result = module.replay(self.binary, self.seed, mode="leak", repeats=3, seconds=10)
        self.assertEqual(result["failure"], "retained allocation", result)
        self.assertTrue(all(row["live_after"] - row["live_before"] >= 1 << 20 for row in result["iterations"]), result)


if __name__ == "__main__":
    unittest.main()
