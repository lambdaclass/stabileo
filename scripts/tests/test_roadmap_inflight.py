import importlib.util
import io
import json
import pathlib
import sys
import tempfile
import unittest
from unittest import mock

ROOT = pathlib.Path(__file__).resolve().parent.parent.parent
spec = importlib.util.spec_from_file_location("roadmap_inflight", ROOT / "scripts/roadmap-inflight.py")
inflight = importlib.util.module_from_spec(spec)
spec.loader.exec_module(inflight)

DOC = "# Roadmap\n\nIntro.\n\n<!-- inflight:start -->\nold table\n<!-- inflight:end -->\n\n## Next\n"


def pr(number, title, draft=False, base="main", login="someone", labels=()):
    return {
        "number": number,
        "title": title,
        "isDraft": draft,
        "baseRefName": base,
        "author": {"login": login},
        "labels": [{"name": name} for name in labels],
    }


class RoadmapInflight(unittest.TestCase):
    def test_replaces_only_the_marked_block(self):
        out = inflight.rewrite(DOC, [pr(7, "Fix A")])
        self.assertTrue(out.startswith("# Roadmap\n\nIntro.\n\n<!-- inflight:start -->\n"))
        self.assertTrue(out.endswith("<!-- inflight:end -->\n\n## Next\n"))
        self.assertNotIn("old table", out)
        self.assertIn("| [#7](https://github.com/lambdaclass/stabileo/pull/7) | Fix A | ready |", out)

    def test_orders_ready_then_draft_then_parked_newest_first(self):
        out = inflight.table([
            pr(1, "parked one", labels=["status:needs-owner-ok"]),
            pr(2, "draft old", draft=True),
            pr(3, "ready old"),
            pr(4, "draft new", draft=True),
            pr(5, "ready new"),
        ])
        numbers = [line.split("](")[0].split("#")[1] for line in out.splitlines()[2:]]
        self.assertEqual(numbers, ["5", "3", "4", "2", "1"])

    def test_leaves_out_dependabot_and_other_bases(self):
        out = inflight.table([
            pr(1, "bump x", login="dependabot[bot]"),
            pr(2, "into a release branch", base="release/v0.5.0"),
            pr(3, "kept"),
        ])
        self.assertNotIn("#1]", out)
        self.assertNotIn("#2]", out)
        self.assertIn("#3]", out)

    def test_escapes_pipes_in_titles(self):
        self.assertIn("a \\| b", inflight.table([pr(9, "a | b")]))

    def test_titles_render_literally(self):
        out = inflight.table([pr(9, "frozen versions (/@<sha>/), *bold* `code` [x](y)")])
        self.assertIn("(/@\\<sha\\>/), \\*bold\\* \\`code\\` \\[x\\](y)", out)

    def test_empty_list_says_so(self):
        self.assertEqual(inflight.table([]), "No pull requests into main are open, apart from Dependabot updates.")

    def test_missing_markers_fail(self):
        with self.assertRaises(SystemExit):
            inflight.rewrite("# Roadmap\n", [])

    def test_a_full_page_refuses_to_rewrite(self):
        with tempfile.TemporaryDirectory() as d:
            doc = pathlib.Path(d) / "ROADMAP.md"
            doc.write_text(DOC)
            stdin = io.StringIO(json.dumps([pr(1, "a"), pr(2, "b")]))
            with mock.patch.object(sys, "argv", ["x", str(doc), "2"]), mock.patch.object(sys, "stdin", stdin):
                with self.assertRaises(SystemExit):
                    inflight.main()
            self.assertEqual(doc.read_text(), DOC)

    def test_is_idempotent(self):
        once = inflight.rewrite(DOC, [pr(7, "Fix A"), pr(8, "Fix B", draft=True)])
        self.assertEqual(once, inflight.rewrite(once, [pr(7, "Fix A"), pr(8, "Fix B", draft=True)]))


if __name__ == "__main__":
    unittest.main()
