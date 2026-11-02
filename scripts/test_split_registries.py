import importlib.util
from pathlib import Path
import tempfile
import unittest

import yaml

spec = importlib.util.spec_from_file_location("split_registries", Path(__file__).with_name("split_registries.py"))
migration = importlib.util.module_from_spec(spec)
spec.loader.exec_module(migration)
spec = importlib.util.spec_from_file_location("catalog", Path(__file__).resolve().parents[1] / "research/tools/catalog.py")
catalog = importlib.util.module_from_spec(spec)
spec.loader.exec_module(catalog)


class MigrationTests(unittest.TestCase):
    def test_rebase_idempotency_conflicts_and_order(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            (root / "research").mkdir()
            legacy = root / "research/papers.yaml"
            entries = [{"id": "z-last", "title": "first"}, {"id": "a-first", "title": "second"}]
            legacy.write_text(yaml.safe_dump({"papers": entries}, sort_keys=False))
            migration.split_papers(root)
            directory = root / "research/papers"
            self.assertEqual(catalog.load_papers(directory), entries)
            before = {p.name: p.read_bytes() for p in directory.iterdir()}
            migration.split_papers(root)
            self.assertEqual(before, {p.name: p.read_bytes() for p in directory.iterdir()})
            entries.append({"id": "new-paper"})
            legacy.write_text(yaml.safe_dump({"papers": entries}, sort_keys=False))
            migration.split_papers(root)
            self.assertEqual(catalog.load_papers(directory), entries)
            for name, data in before.items():
                self.assertEqual((directory / name).read_bytes(), data)
            entries[0]["title"] = "conflict"
            legacy.write_text(yaml.safe_dump({"papers": entries}))
            with self.assertRaisesRegex(ValueError, "conflicting paper"):
                migration.split_papers(root)
            self.assertTrue(legacy.exists())
            self.assertEqual((directory / "z-last.yaml").read_bytes(), before["z-last.yaml"])

    def test_invalid_entries_and_sort_ties(self):
        with tempfile.TemporaryDirectory() as tmp:
            directory = Path(tmp)
            for pid in ["z", "a"]:
                (directory / f"{pid}.yaml").write_text(yaml.safe_dump({"id": pid, "order": 0}))
            self.assertEqual(catalog.load_papers(directory), [{"id": "a"}, {"id": "z"}])
            for entry in [{"id": "z"}, {"id": "z", "order": True}, {"id": "a", "order": 1}]:
                (directory / "z.yaml").write_text(yaml.safe_dump(entry))
                with self.assertRaises(ValueError):
                    catalog.load_papers(directory)


if __name__ == "__main__":
    unittest.main()
