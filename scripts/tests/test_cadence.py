import importlib.util
import json
import subprocess
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
spec = importlib.util.spec_from_file_location("cadence", ROOT / "scripts" / "cadence.py")
cadence = importlib.util.module_from_spec(spec)
spec.loader.exec_module(cadence)


class Result:
    def __init__(self, code):
        self.returncode = code


def tree(makefile, manifest, files=(), doc="", workflows=None):
    d = Path(tempfile.mkdtemp())
    (d / "Makefile").write_text(makefile)
    (d / ".github" / "workflows").mkdir(parents=True)
    (d / ".github" / "test-cadence.json").write_text(json.dumps(manifest))
    (d / "docs").mkdir()
    (d / "docs" / "TESTING_CADENCE.md").write_text(doc)
    for f in files:
        (d / f).parent.mkdir(parents=True, exist_ok=True)
        (d / f).write_text("")
    for name, text in (workflows or {}).items():
        (d / ".github" / "workflows" / name).write_text(text)
    return d


TIERS = {t: {"trigger": "x", "budget_min": 1, "on_failure": "x", "owner": "x"} for t in ("pr", "daily", "weekly", "monthly")}
MAKE = "a.quick:\n\ttrue\nb.full:\n\ttrue\nX := 1\n"


class CadenceTest(unittest.TestCase):
    def test_optional_target_not_on_the_branch_is_skipped_and_the_rest_run(self):
        m = {"tiers": TIERS, "checks": [
            {"id": "a", "tier": "pr", "runner": "ci-engine-quick", "target": "a.quick", "budget_min": 2},
            {"id": "later", "tier": "pr", "runner": "ci-engine-quick", "target": "not.yet", "optional": True},
            {"id": "full", "tier": "daily", "runner": "nightly", "target": "b.full", "vars": {"MINUTES": "45"}},
        ]}
        d = tree(MAKE, m)
        ran = []
        code = cadence.run(m, ["pr"], "ci-engine-quick", None, root=d, execute=lambda cmd, **kw: (ran.append((cmd, kw["timeout"])), Result(0))[1])
        self.assertEqual(code, 0)
        self.assertEqual(ran, [(["make", "a.quick"], 120)])

    def test_a_required_target_that_is_missing_fails(self):
        m = {"tiers": TIERS, "checks": [{"id": "gone", "tier": "pr", "runner": "ci-engine-quick", "target": "gone"}]}
        d = tree(MAKE, m)
        self.assertEqual(cadence.run(m, ["pr"], None, None, root=d, execute=lambda *a, **k: Result(0)), 1)

    def test_a_failing_check_fails_the_run_after_the_others_ran(self):
        m = {"tiers": TIERS, "checks": [
            {"id": "a", "tier": "daily", "runner": "nightly", "target": "a.quick"},
            {"id": "b", "tier": "daily", "runner": "nightly", "target": "b.full", "vars": {"MINUTES": "45"}},
        ]}
        d = tree(MAKE, m)
        ran = []
        code = cadence.run(m, ["daily"], "nightly", None, root=d, execute=lambda cmd, **kw: (ran.append(cmd), Result(2 if cmd[1] == "a.quick" else 0))[1])
        self.assertEqual(code, 1)
        self.assertEqual(ran, [["make", "a.quick"], ["make", "b.full", "MINUTES=45"]])

    def test_list_gives_only_runnable_checks_of_the_tiers_asked(self):
        m = {"tiers": TIERS, "checks": [
            {"id": "a", "tier": "weekly", "runner": "nightly", "target": "a.quick", "budget_min": 10},
            {"id": "req", "tier": "weekly", "runner": "nightly", "target": "b.full", "requires": ["scripts/missing.py"], "optional": True},
            {"id": "m", "tier": "monthly", "runner": "nightly", "target": "b.full", "needs": ["a.quick"]},
            {"id": "d", "tier": "daily", "runner": "nightly", "target": "b.full"},
        ]}
        d = tree(MAKE, m)
        self.assertEqual(cadence.listing(m, ["weekly", "monthly"], "nightly", root=d),
                         [{"id": "a", "tier": "weekly", "timeout": 30}, {"id": "m", "tier": "monthly", "timeout": 80}])
        (d / "scripts").mkdir()
        (d / "scripts" / "missing.py").write_text("")
        self.assertEqual([c["id"] for c in cadence.listing(m, ["weekly"], "nightly", root=d)], ["a", "req"])

    def test_check_catches_a_stale_reference_an_undocumented_check_and_a_bad_entry(self):
        m = {"tiers": TIERS, "checks": [
            {"id": "ok", "tier": "pr", "existing": "ci.yml#lint"},
            {"id": "nojob", "tier": "pr", "existing": "ci.yml#gone"},
            {"id": "both", "tier": "pr", "existing": "ci.yml#lint", "target": "a.quick", "runner": "nightly"},
            {"id": "badtier", "tier": "hourly", "existing": "ci.yml#lint"},
            {"id": "badrunner", "tier": "pr", "target": "a.quick", "runner": "laptop"},
            {"id": "ok", "tier": "pr", "existing": "ci.yml#lint"},
        ]}
        doc = "`ok` `nojob` `both` `badtier` `badrunner`"
        d = tree(MAKE, m, doc=doc, workflows={"ci.yml": "jobs:\n  lint:\n    runs-on: x\n"})
        errors = cadence.check(m, root=d)
        self.assertEqual(sorted(errors), sorted([
            "nojob: workflow ci.yml has no job gone",
            "both: needs exactly one of target and existing",
            "badtier: unknown tier 'hourly'",
            "badrunner: runner must be one of ['ci-engine-quick', 'nightly']",
            "ok: duplicate id",
        ]))
        d2 = tree(MAKE, {"tiers": TIERS, "checks": [{"id": "undoc", "tier": "pr", "existing": "ci.yml#lint"}]}, doc="nothing", workflows={"ci.yml": "jobs:\n  lint:\n"})
        self.assertEqual(cadence.check(json.loads((d2 / ".github" / "test-cadence.json").read_text()), root=d2), ["undoc: not in docs/TESTING_CADENCE.md"])

    def test_the_repository_manifest_is_consistent(self):
        self.assertEqual(cadence.check(cadence.load()), [])

    def test_make_targets_ignores_variable_assignments(self):
        d = tree("A:=1\nb: c\nd.e-f:\n", {"tiers": TIERS, "checks": []})
        self.assertEqual(cadence.make_targets(d), {"b", "d.e-f"})

    def test_cli_rejects_an_unknown_tier(self):
        r = subprocess.run(["python3", "-I", str(ROOT / "scripts" / "cadence.py"), "list", "hourly"], capture_output=True, text=True)
        self.assertEqual(r.returncode, 2)


if __name__ == "__main__":
    unittest.main()
