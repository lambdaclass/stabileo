import importlib.util
import json
import pathlib
import subprocess
import sys
import tempfile
import unittest

ROOT = pathlib.Path(__file__).resolve().parent
spec = importlib.util.spec_from_file_location("feed", ROOT / "check-feed.py")
feed = importlib.util.module_from_spec(spec)
spec.loader.exec_module(feed)


class ReleaseTests(unittest.TestCase):
    def test_monotonic_feed(self):
        feed.check("0.1.0-alpha.9", "0.1.0-alpha.10")
        feed.check("0.1.0-rc.1", "0.1.0")
        for candidate in ["0.1.0-alpha.9", "0.1.0-alpha.8", "0.0.9"]:
            with self.assertRaises(ValueError):
                feed.check("0.1.0-alpha.9", candidate)

    def test_utf8_notices(self):
        with tempfile.TemporaryDirectory() as directory:
            root = pathlib.Path(directory)
            (root / "desktop/src-tauri/legal").mkdir(parents=True)
            (root / "desktop/release").mkdir(parents=True)
            package = root / "craté"
            package.mkdir()
            (package / "LICENSE").write_text("Copyright © Auteur", encoding="utf-8")
            metadata = root / "metadata.json"
            metadata.write_text(json.dumps({"packages": [{
                "name": "craté", "version": "1", "source": "registry", "repository": None,
                "license": "MIT", "manifest_path": str(package / "Cargo.toml"),
            }]}, ensure_ascii=False), encoding="utf-8")
            subprocess.run([sys.executable, "-X", "utf8=0", str(ROOT / "notices.py"), str(metadata), "revision"], cwd=root, check=True)
            self.assertIn("Copyright © Auteur", (root / "desktop/src-tauri/legal/RUST-NOTICES.txt").read_text(encoding="utf-8"))


if __name__ == "__main__":
    unittest.main()
