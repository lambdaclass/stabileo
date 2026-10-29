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

    def test_macos_uninstall_removes_only_recorded_target(self):
        with tempfile.TemporaryDirectory() as directory:
            root = pathlib.Path(directory)
            home = root / "home"
            selected = home / "Applications/Stabileo.app"
            selected.mkdir(parents=True)
            other = root / "other/Stabileo.app"
            other.mkdir(parents=True)
            data = root / "data"
            receipt = data / "stabileo/macos-install-target"
            receipt.parent.mkdir(parents=True)
            receipt.write_text(str(selected) + "\n")
            bin_dir = root / "bin"
            bin_dir.mkdir()
            uname = bin_dir / "uname"
            uname.write_text("#!/bin/sh\necho Darwin\n")
            uname.chmod(0o755)
            rm = bin_dir / "rm"
            rm.write_text('#!/bin/sh\nfor arg do\ncase "$arg" in -*) ;; "$TEST_TARGET"|"$TEST_RECEIPT") ;; *) exit 99 ;; esac\ndone\nexec /bin/rm "$@"\n')
            rm.chmod(0o755)
            import os
            env = dict(os.environ, HOME=str(home), XDG_DATA_HOME=str(data), PATH=str(bin_dir) + ":" + os.environ["PATH"], TEST_TARGET=str(selected), TEST_RECEIPT=str(receipt))
            subprocess.run(["sh", str(ROOT.parent / "install/install.sh"), "--uninstall"], env=env, check=True)
            self.assertFalse(selected.exists())
            self.assertTrue(other.exists())
            self.assertFalse(receipt.exists())
            missing = subprocess.run(["sh", str(ROOT.parent / "install/install.sh"), "--uninstall"], env=env, capture_output=True)
            self.assertNotEqual(missing.returncode, 0)

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
