import importlib.util
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
spec = importlib.util.spec_from_file_location("deps_audit", ROOT / "scripts" / "deps-audit.py")
audit = importlib.util.module_from_spec(spec)
spec.loader.exec_module(audit)


class DepsAuditTest(unittest.TestCase):
    def test_only_semver_incompatible_releases_are_listed(self):
        text = "\n".join([
            "    Unchanged criterion v0.5.1 (available: v0.8.2)",
            "    Unchanged aho-corasick v1.1.4 (available: v1.1.5)",
            "    Unchanged tokio v1.40.0 (available: v2.0.0)",
            "    Unchanged wasm-bindgen v0.2.100 (available: v0.3.0, requires Rust 1.90)",
            "    Unchanged tiny v0.0.3 (available: v0.0.4)",
            "    Unchanged bytes v0.4.1 (available: v0.4.9)",
            "    Unchanged criterion v0.5.1 (available: v0.8.2)",
        ])
        self.assertEqual(audit.rust_rows(text), [("criterion", "0.5.1", "0.8.2"), ("tiny", "0.0.3", "0.0.4"), ("tokio", "1.40.0", "2.0.0"), ("wasm-bindgen", "0.2.100", "0.3.0")])

    def test_npm_majors_and_workspaces(self):
        data = {
            "vite": {"current": "6.4.4", "wanted": "6.4.5", "latest": "8.3.4"},
            "svelte": {"current": "5.1.0", "wanted": "5.2.0", "latest": "5.2.0"},
            "typescript": [{"current": "7.0.2", "wanted": "7.0.2", "latest": "7.0.2", "dependent": "lighthouse"}, {"current": "5.9.3", "wanted": "5.9.3", "latest": "7.0.2", "dependent": "web"}],
            "missing": {"wanted": "1.0.0", "latest": "2.0.0"},
        }
        self.assertEqual(audit.npm_rows(data), [("typescript", "web", "5.9.3", "5.9.3", "7.0.2"), ("vite", "", "6.4.4", "6.4.5", "8.3.4")])

    def test_empty_table_says_none(self):
        self.assertIn("| (none) | | |", audit.table(["a", "b", "c"], []))


if __name__ == "__main__":
    unittest.main()
