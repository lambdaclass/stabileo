import importlib.util
import json
import os
import pathlib
import subprocess
import sys
import tempfile
import unittest
from unittest.mock import patch

ROOT = pathlib.Path(__file__).resolve().parent
spec = importlib.util.spec_from_file_location("feed", ROOT / "check-feed.py")
feed = importlib.util.module_from_spec(spec)
spec.loader.exec_module(feed)

spec = importlib.util.spec_from_file_location("publish", ROOT / "publish.py")
publisher = importlib.util.module_from_spec(spec)
spec.loader.exec_module(publisher)


class ReleaseTests(unittest.TestCase):
    def test_publication_recovers_draft_and_partial_create(self):
        for existing in [json.dumps({"isDraft": True}), subprocess.CalledProcessError(1, "gh")]:
            with self.subTest(existing=existing), tempfile.TemporaryDirectory() as directory:
                (pathlib.Path(directory) / "installer").write_text("tested")
                with patch.object(publisher, "gh", side_effect=[existing, "", "", ""] if isinstance(existing, Exception) else [existing, "", ""]) as gh:
                    publisher.publish("owner/repo", "1.0.0-alpha.1", "commit", directory, "notes.md")
                calls = [call.args for call in gh.call_args_list]
                upload = next(args for args in calls if args[:2] == ("release", "upload"))
                self.assertIn("--clobber", upload)
                self.assertEqual(calls[-1][:2], ("release", "edit"))
                self.assertIn("--latest=false", calls[-1])

    def test_failed_upload_does_not_publish_draft(self):
        with tempfile.TemporaryDirectory() as directory:
            (pathlib.Path(directory) / "installer").write_text("tested")
            with patch.object(publisher, "gh", side_effect=[json.dumps({"isDraft": True}), subprocess.CalledProcessError(1, "gh")]) as gh:
                with self.assertRaises(subprocess.CalledProcessError):
                    publisher.publish("owner/repo", "1.0.0-alpha.1", "commit", directory, "notes.md")
                self.assertEqual([call.args[1] for call in gh.call_args_list], ["view", "upload"])

    def test_feed_publication_only_writes_data_after_monotonic_check(self):
        workflow = (ROOT.parent.parent / ".github/workflows/desktop.yml").read_text()
        feed_step = workflow.split("      - name: Point the update feed", 1)[1].split("\n  install:", 1)[0]
        writes = [line.strip().split()[1:] for line in feed_step.splitlines() if line.strip().startswith("put ")]
        self.assertEqual(writes, [["install.sh", "dist/install.sh"], ["install.ps1", "dist/install.ps1"], ["latest.json", "dist/latest.json"]])
        self.assertLess(feed_step.index("check-feed.py"), feed_step.index('gh api -X POST'))
        self.assertIn("latest.json?ref=$base", feed_step)
        self.assertIn('sha=$(gh api "$api?ref=$base"', feed_step)

    def test_published_release_is_immutable_and_feed_can_resume(self):
        for changed in [None, "installer", "extra", "version"]:
            with self.subTest(changed=changed), tempfile.TemporaryDirectory() as directory:
                root = pathlib.Path(directory)
                (root / "installer").write_text("tested")
                (root / "installer.sig").write_text("new signature")
                (root / "latest.json").write_text('{"version":"1.0.0-alpha.1"}')

                def gh(*args):
                    if args[1] == "view":
                        return json.dumps({"isDraft": False, "isPrerelease": True})
                    self.assertEqual(args[1], "download")
                    destination = pathlib.Path(args[-1])
                    (destination / "installer").write_text("different" if changed == "installer" else "tested")
                    (destination / "installer.sig").write_text("published signature")
                    (destination / "latest.json").write_text(json.dumps({"version": "0.0.1" if changed == "version" else "1.0.0-alpha.1", "notes": "published"}))
                    if changed == "extra":
                        (destination / "extra").write_text("unexpected")
                    return ""

                with patch.object(publisher, "gh", side_effect=gh):
                    if changed:
                        with self.assertRaises(ValueError):
                            publisher.publish("owner/repo", "1.0.0-alpha.1", "commit", root, "notes.md")
                    else:
                        publisher.publish("owner/repo", "1.0.0-alpha.1", "commit", root, "notes.md")
                        self.assertEqual((root / "installer.sig").read_text(), "published signature")
                        self.assertEqual(json.loads((root / "latest.json").read_text())["notes"], "published")

    def test_macos_baseline_and_csp(self):
        config = json.loads((ROOT.parent / "src-tauri/tauri.conf.json").read_text())
        self.assertEqual(config["bundle"]["macOS"]["minimumSystemVersion"], "15.0")
        self.assertIn("'wasm-unsafe-eval'", config["app"]["security"]["csp"]["script-src"])
        self.assertNotIn("'unsafe-eval'", config["app"]["security"]["csp"]["script-src"])

    def test_monotonic_feed(self):
        feed.check("0.1.0-alpha.9", "0.1.0-alpha.10")
        feed.check("0.1.0-rc.1", "0.1.0")
        for candidate in ["0.1.0-alpha.9", "0.1.0-alpha.8", "0.0.9"]:
            with self.assertRaises(ValueError):
                feed.check("0.1.0-alpha.9", candidate)

    @unittest.skipIf(os.name == "nt", "POSIX installer fixtures")
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
