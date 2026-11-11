import importlib.util
from pathlib import Path
import unittest

spec = importlib.util.spec_from_file_location(
    "replay_checks", Path(__file__).parent / "tests" / "test_plastic_budget_replay.py")
checks = importlib.util.module_from_spec(spec)
spec.loader.exec_module(checks)


class EngineReplay(checks.SeededReplay):
    @classmethod
    def setUpClass(cls):
        cls.binary = Path("engine/fuzz/target/release/examples/plastic_replay")


if __name__ == "__main__":
    unittest.main()
