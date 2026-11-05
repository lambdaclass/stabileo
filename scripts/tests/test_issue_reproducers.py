import importlib.util
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
        self.assertIn(("engine/tests/a.rs", "timing"), plain)
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
        self.assertEqual(check("Partly fixes #1414: the 2D case", self.base, head)[0], [])

    def test_nothing_flipped_fails_even_when_partly(self):
        errors, _ = check("Partly fixes #1414", self.base, self.base)
        self.assertEqual(errors, ["#1414: no reproducer flipped; flip one of: engine/tests/a.rs::issue_1414_connector_mechanism_is_refused, engine/tests/a.rs::issue_1414_connector_mechanism_3d"])

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


class XfailTest(unittest.TestCase):
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
