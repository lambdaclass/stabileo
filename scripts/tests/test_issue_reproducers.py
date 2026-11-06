import importlib.util
import json
import subprocess
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
spec = importlib.util.spec_from_file_location("issue_reproducers", ROOT / "scripts" / "issue-reproducers.py")
rep = importlib.util.module_from_spec(spec)
spec.loader.exec_module(rep)

RS_BEFORE = '''
#[test]
#[ignore = "known wrong result: #1414"]
fn issue_1414_connector_mechanism_is_refused() {
    assert!(false);
}

#[test]
#[ignore = "known wrong result: #1414, second shape"]
fn issue_1414_connector_mechanism_3d() {}

#[test]
#[ignore = "wall clock: runs alone"]
fn timing() {}

#[test]
fn unrelated() {}
'''
RS_ONE_FLIPPED = RS_BEFORE.replace('#[ignore = "known wrong result: #1414"]\n', "")
RS_ALL_FLIPPED = RS_ONE_FLIPPED.replace('#[ignore = "known wrong result: #1414, second shape"]\n', "")
TS_BEFORE = "it.fails('#1500 the column is checked about its weak axis', () => {});\nit('other', () => {});\n"
TS_FLIPPED = "it('#1500 the column is checked about its weak axis', () => {});\nit('other', () => {});\n"
WRONG = {1414: ["bug", "safety"], 1500: ["wrong-result"], 77: ["enhancement"]}


def check(body, base, head, labels=WRONG):
    return rep.flip_check(body, base, head, labels)


class ScanTest(unittest.TestCase):
    def test_rust_and_typescript_tags(self):
        tagged, plain = rep.scan_files([("engine/tests/a.rs", RS_BEFORE), ("web/src/x.test.ts", TS_BEFORE), ("README.md", "#1")])
        self.assertEqual(tagged, [
            (1414, "engine/tests/a.rs", "issue_1414_connector_mechanism_is_refused"),
            (1414, "engine/tests/a.rs", "issue_1414_connector_mechanism_3d"),
            (1500, "web/src/x.test.ts", "#1500 the column is checked about its weak axis"),
        ])
        self.assertNotIn(("engine/tests/a.rs", "timing"), plain)
        self.assertIn(("engine/tests/a.rs", "unrelated"), plain)
        self.assertIn(("web/src/x.test.ts", "other"), plain)

    def test_closing_keywords(self):
        self.assertEqual(rep.closing_issues("Fixes #12, closes #3 and Resolved: #40; see #99. fix #7"), [3, 7, 12, 40])
        self.assertEqual(rep.closing_issues(""), [])


class FlipTest(unittest.TestCase):
    base = [("engine/tests/a.rs", RS_BEFORE), ("web/src/x.test.ts", TS_BEFORE)]

    def test_flipping_every_reproducer_passes(self):
        errors, notes = check("Fixes #1414", self.base, [("engine/tests/a.rs", RS_ALL_FLIPPED), ("web/src/x.test.ts", TS_BEFORE)])
        self.assertEqual(errors, [])
        self.assertEqual(len(notes), 1)

    def test_one_left_expected_failing_fails_unless_partly(self):
        head = [("engine/tests/a.rs", RS_ONE_FLIPPED), ("web/src/x.test.ts", TS_BEFORE)]
        errors, _ = check("Fixes #1414", self.base, head)
        self.assertEqual(len(errors), 1)
        self.assertIn("#1414: still expected to fail: engine/tests/a.rs::issue_1414_connector_mechanism_3d", errors[0])
        self.assertEqual(check("Partly addresses #1414: the 2D case", self.base, head)[0], [])
        self.assertEqual(len(check("Partly fixes #1414: the 2D case", self.base, head)[0]), 1)

    def test_nothing_flipped_fails_even_when_partly(self):
        errors, _ = check("Partly addresses #1414", self.base, self.base)
        self.assertEqual(errors, ["#1414: no reproducer flipped; flip one of: engine/tests/a.rs::issue_1414_connector_mechanism_3d, engine/tests/a.rs::issue_1414_connector_mechanism_is_refused"])

    def test_deleting_a_reproducer_is_not_flipping_it(self):
        errors, _ = check("Fixes #1500", self.base, [("engine/tests/a.rs", RS_BEFORE), ("web/src/x.test.ts", "it('other', () => {});\n")])
        self.assertEqual(len(errors), 1)
        self.assertIn("#1500: no reproducer flipped", errors[0])

    def test_typescript_flip(self):
        errors, notes = check("Closes #1500", self.base, [("engine/tests/a.rs", RS_BEFORE), ("web/src/x.test.ts", TS_FLIPPED)])
        self.assertEqual(errors, [])
        self.assertEqual(notes, ["#1500: flipped web/src/x.test.ts::#1500 the column is checked about its weak axis"])

    def test_a_wrong_result_issue_without_reproducer_fails(self):
        errors, _ = check("Fixes #1600", self.base, self.base, {1600: ["wrong-result-candidate"]})
        self.assertEqual(len(errors), 1)
        self.assertIn("#1600 is a wrong-result issue but has no expected-failure reproducer", errors[0])

    def test_other_issues_are_not_checked(self):
        self.assertEqual(check("Fixes #77", self.base, self.base), ([], []))
        self.assertEqual(check("See #1414", self.base, self.base), ([], []))


class StrictnessTest(unittest.TestCase):
    base = [("engine/tests/a.rs", RS_BEFORE)]

    def test_another_ignore_or_no_test_attribute_is_not_a_flip(self):
        other = RS_ALL_FLIPPED.replace("fn issue_1414_connector_mechanism_is_refused", '#[ignore = "slow"]\nfn issue_1414_connector_mechanism_is_refused')
        no_attr = RS_ALL_FLIPPED.replace("#[test]\nfn issue_1414_connector_mechanism_3d", "fn issue_1414_connector_mechanism_3d")
        errors, _ = check("Fixes #1414", self.base, [("engine/tests/a.rs", other)])
        self.assertEqual(errors, [])
        errors, _ = check("Fixes #1414", self.base, [("engine/tests/a.rs", other.replace("#[test]\nfn issue_1414_connector_mechanism_3d", "fn issue_1414_connector_mechanism_3d"))])
        self.assertIn("#1414: no reproducer flipped", errors[0])
        errors, _ = check("Fixes #1414", self.base, [("engine/tests/a.rs", no_attr)])
        self.assertEqual(errors, [])

    def test_partly_is_per_issue_and_partly_addresses_does_not_close(self):
        head = [("engine/tests/a.rs", RS_ONE_FLIPPED), ("web/src/x.test.ts", TS_FLIPPED)]
        base = self.base + [("web/src/x.test.ts", TS_BEFORE)]
        self.assertEqual(rep.references("Partly addresses #1414. Fixes #1500"), ({1500}, {1414}))
        self.assertEqual(rep.references("partly fixes #1414"), ({1414}, set()))
        self.assertEqual(rep.references("partly addresses #1414 and fixes #1414"), ({1414}, set()))
        self.assertEqual(check("Partly addresses #1414. Fixes #1500", base, head)[0], [])
        errors, _ = check("Partly addresses #1500. Fixes #1414", base, head)
        self.assertEqual(len(errors), 1)
        self.assertIn("#1414: still expected to fail", errors[0])

    def test_a_reproducer_added_by_an_earlier_commit_of_the_pull_request_counts(self):
        errors, _ = check("Fixes #1414", [("engine/tests/a.rs", "")], [("engine/tests/a.rs", RS_ALL_FLIPPED)])
        self.assertIn("no expected-failure reproducer", errors[0])
        errors, notes = rep.flip_check("Fixes #1414", [("engine/tests/a.rs", "")], [("engine/tests/a.rs", RS_ALL_FLIPPED)], WRONG,
                                       [[("engine/tests/a.rs", RS_BEFORE)]])
        self.assertEqual(errors, [])
        self.assertEqual(len(notes), 1)


class GitFlowTest(unittest.TestCase):
    def test_a_reproducer_file_added_and_flipped_within_the_pull_request(self):
        d = Path(tempfile.mkdtemp())
        g = lambda *a: subprocess.run(["git", "-c", "user.name=t", "-c", "user.email=t@t", *a], cwd=d, check=True, capture_output=True, text=True).stdout.strip()
        g("init", "-q")
        (d / "engine" / "tests").mkdir(parents=True)
        (d / "engine" / "tests" / "other.rs").write_text("#[test]\nfn other() {}\n")
        g("add", "-A"); g("commit", "-qm", "base")
        base = g("rev-parse", "HEAD")
        (d / "engine" / "tests" / "issue_1414.rs").write_text(RS_BEFORE)
        g("add", "-A"); g("commit", "-qm", "reproducer")
        (d / "engine" / "tests" / "issue_1414.rs").write_text(RS_ALL_FLIPPED)
        g("add", "-A"); g("commit", "-qm", "fix")
        head = g("rev-parse", "HEAD")
        (d / "body.md").write_text("Fixes #1414")
        (d / "labels.json").write_text(json.dumps({"1414": ["safety"]}))
        orig = rep.ROOT
        rep.ROOT = d
        try:
            self.assertEqual(rep.main(["flip-check", "--base", base, "--head", head, "--body-file", str(d / "body.md"), "--labels-json", str(d / "labels.json")]), 0)
            self.assertEqual(rep.main(["flip-check", "--base", base, "--head", base, "--body-file", str(d / "body.md"), "--labels-json", str(d / "labels.json")]), 1)
        finally:
            rep.ROOT = orig


class XfailTest(unittest.TestCase):
    def run_with(self, codes):
        calls = []
        orig = rep.files_at
        rep.files_at = lambda rev: [("engine/tests/known_issues.rs", RS_BEFORE)]
        try:
            return rep.xfail(False, runner=lambda cmd, cwd: (calls.append(cmd), type("R", (), {"returncode": codes[len(calls) - 1]}))[1]), calls
        finally:
            rep.files_at = orig

    def test_only_a_test_failure_counts_as_expected(self):
        self.assertEqual(self.run_with([100, 100])[0], 0)
        self.assertEqual(self.run_with([100, 0])[0], 1)
        self.assertEqual(self.run_with([101, 100])[0], 1)
        self.assertEqual(self.run_with([4, 100])[0], 1)
        _, calls = self.run_with([100, 100])
        self.assertIn("--run-ignored", calls[0])
        self.assertEqual(calls[0][calls[0].index("--test") + 1], "robustness")

    def test_binary_of(self):
        self.assertEqual(rep.binary_of("engine/src/known_issues.rs"), "--lib")
        self.assertEqual(rep.binary_of("engine/tests/metamorphic/generated.rs"), "metamorphic")
        self.assertEqual(rep.binary_of("engine/tests/known_issues.rs"), "robustness")

    def test_the_repository_tags_are_well_formed(self):
        tagged, _ = rep.scan_files(rep.files_at(None))
        for n, path, name in tagged:
            self.assertGreater(n, 0)
            self.assertTrue((ROOT / path).exists(), path)


if __name__ == "__main__":
    unittest.main()
