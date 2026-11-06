import importlib.util
import json
import pathlib
import sys
import tempfile
import unittest

ROOT = pathlib.Path(__file__).resolve().parent.parent.parent
spec = importlib.util.spec_from_file_location("release_step", ROOT / "scripts/release-step.py")
step = importlib.util.module_from_spec(spec)
spec.loader.exec_module(step)

LOG = """# Changelog

## Unreleased

## 0.5.0 (2026-11-06)

### Fixed

#### A fix (2026-11-05)

See [the advisory](../docs/advisories/SA-1.md) and [a test](../web/e2e/a.spec.ts).

[ref]: ../docs/results-changes/x.md

## 0.4.0 (2026-10-28)

Older [link](../keep/this.md).
"""


class RebaseLinks(unittest.TestCase):
    def test_moved_links_point_from_the_root_and_older_releases_are_untouched(self):
        out = step.rebase_section(LOG, "0.5.0", "2026-11-06")
        self.assertIn("](docs/advisories/SA-1.md)", out)
        self.assertIn("](web/e2e/a.spec.ts)", out)
        self.assertIn("[ref]: docs/results-changes/x.md", out)
        self.assertIn("Older [link](../keep/this.md).", out)
        self.assertEqual(step.climbing_links(out, "0.5.0", "2026-11-06"), [])

    def test_a_planted_climbing_link_is_reported(self):
        found = step.climbing_links(LOG, "0.5.0", "2026-11-06")
        self.assertEqual(len(found), 3)

    def test_the_release_notes_line_goes_under_the_heading(self):
        out = step.rebase_section(LOG, "0.5.0", "2026-11-06", "Release notes: x.\n\n")
        self.assertIn("## 0.5.0 (2026-11-06)\n\nRelease notes: x.\n\n### Fixed", out)

    def test_the_notes_line_lists_the_languages_that_exist(self):
        with tempfile.TemporaryDirectory() as d:
            root = pathlib.Path(d)
            (root / "docs/releases").mkdir(parents=True)
            self.assertEqual(step.notes_line("9.9.9", root), "")
            for name in ["v9.9.9.md", "v9.9.9.es.md", "v9.9.9.tr.md"]:
                (root / "docs/releases" / name).write_text("x")
            line = step.notes_line("9.9.9", root)
            self.assertIn("[Spanish](docs/releases/v9.9.9.es.md) and [Turkish](docs/releases/v9.9.9.tr.md)", line)
            self.assertNotIn("Portuguese", line)


    def test_angle_bracket_and_indented_destinations_are_rebased(self):
        log = LOG.replace("See [the advisory]", "See [b](<../docs/b.md>), [s](  ../docs/s.md) and [the advisory]") + ""
        log = log.replace("[ref]: ../docs/results-changes/x.md", "[ref]: ../docs/results-changes/x.md\n   [ind]: <../docs/ind.md>")
        self.assertEqual(len(step.climbing_links(log, "0.5.0", "2026-11-06")), 6)
        out = step.rebase_section(log, "0.5.0", "2026-11-06")
        self.assertIn("[b](<docs/b.md>)", out)
        self.assertIn("[s](  docs/s.md)", out)
        self.assertIn("   [ind]: <docs/ind.md>", out)
        self.assertEqual(step.climbing_links(out, "0.5.0", "2026-11-06"), [])


class EngineLocks(unittest.TestCase):
    def lock(self, version):
        return f'[[package]]\nname = "dedaliano-engine"\nversion = "{version}"\ndependencies = []\n'

    def test_a_stale_engine_lock_is_reported(self):
        stale = step.stale_locks([("research/a/Cargo.lock", self.lock("0.4.0")), ("engine/Cargo.lock", self.lock("0.5.0"))], "0.5.0")
        self.assertEqual(stale, ["research/a/Cargo.lock pins dedaliano-engine 0.4.0, not 0.5.0"])

    def test_a_lock_without_the_engine_is_ignored(self):
        self.assertEqual(step.stale_locks([("x/Cargo.lock", '[[package]]\nname = "serde"\nversion = "1.0.0"\n')], "0.5.0"), [])


class Registry(unittest.TestCase):
    def test_entries_that_linked_a_fragment_link_the_changelog(self):
        with tempfile.TemporaryDirectory() as d:
            directory = pathlib.Path(d)
            entry = {"id": "x", "changelog": {"file": "changelog.d/1-x.md", "heading": "X"}}
            (directory / "x.json").write_text(json.dumps(entry))
            (directory / "y.json").write_text(json.dumps({"id": "y", "changelog": {"file": "CHANGELOG.md"}}))
            self.assertEqual(step.registry_fragment_links(directory), ["x.json"])
            self.assertEqual(step.repoint_registry(directory), ["x.json"])
            self.assertEqual(json.loads((directory / "x.json").read_text())["changelog"], {"file": "CHANGELOG.md", "heading": "X"})
            self.assertEqual(step.registry_fragment_links(directory), [])

    def test_an_escaped_fragment_path_is_found_and_repointed(self):
        with tempfile.TemporaryDirectory() as d:
            directory = pathlib.Path(d)
            (directory / "x.json").write_text('{"id": "x", "changelog": {"file": "changelog.d\\/1-x.md", "heading": "X"}}\n')
            (directory / "u.json").write_text('{"id": "u", "changelog": {"file": "\\u0063hangelog.d/1-u.md"}}\n')
            self.assertEqual(step.registry_fragment_links(directory), ["u.json", "x.json"])
            self.assertEqual(step.repoint_registry(directory), ["u.json", "x.json"])
            for name in ["u.json", "x.json"]:
                self.assertEqual(json.loads((directory / name).read_text())["changelog"]["file"], "CHANGELOG.md")
            self.assertEqual(step.registry_fragment_links(directory), [])


if __name__ == "__main__":
    sys.exit(unittest.main())
