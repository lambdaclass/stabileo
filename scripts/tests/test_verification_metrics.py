"""Tests of scripts/verification-metrics.py with a fake `gh` (no network).

    python3 -m unittest discover -s scripts/tests -v
"""

import importlib.util
import json
import os
import re
import tempfile
import unittest

HERE = os.path.dirname(os.path.abspath(__file__))
spec = importlib.util.spec_from_file_location("vm", os.path.join(HERE, "..", "verification-metrics.py"))
vm = importlib.util.module_from_spec(spec)
spec.loader.exec_module(vm)


def run(i, conclusion="success", branch="main", event="schedule"):
    return {"databaseId": i, "status": "completed", "conclusion": conclusion, "event": event,
            "headBranch": branch, "createdAt": f"2026-10-{i:02d}T00:00:00Z", "headSha": f"sha{i}",
            "url": f"https://example/runs/{i}"}


class FakeGH:
    """runs: {workflow: [run, ...]} newest first; artifacts: {run_id: [name, ...]};
    files: {(run_id, name): {relative path: text}} written on download."""

    def __init__(self, runs, artifacts, files=None):
        self.ok = True
        self._runs, self._arts, self._files = runs, artifacts, files or {}
        self.tmp = tempfile.mkdtemp()
        self.branch_args = []
        self._stamps = {}

    def runs(self, workflow, max_runs, branch="main"):
        self.branch_args.append(branch)
        rs = self._runs.get(workflow, [])
        if branch:
            rs = [r for r in rs if r["headBranch"] == branch]
        return rs[:max_runs]

    jobs_by_run = None  # {run_id: [job, ...]}; default: one mutants job per mutants artifact

    def jobs(self, run_id):
        if self.jobs_by_run is not None:
            if run_id not in self.jobs_by_run:
                raise RuntimeError("jobs unavailable")
            return self.jobs_by_run[run_id]
        n = sum(1 for a in self._arts.get(run_id, []) if a.startswith("mutants-report-"))
        return [{"name": f"mutants ({i})", "conclusion": "success"} for i in range(n)]

    def artifacts(self, run_id):
        return [{"name": n, "expired": False, "created_at": self._stamps.get((run_id, n))}
                for n in self._arts.get(run_id, [])]

    def download(self, run_id, name):
        files = self._files.get((run_id, name))
        if files is None:
            return None
        d = os.path.join(self.tmp, f"{run_id}-{name}")
        for rel, text in files.items():
            p = os.path.join(d, rel)
            os.makedirs(os.path.dirname(p), exist_ok=True)
            with open(p, "w") as f:
                f.write(text)
        return d


def stryker(killed, survived):
    mutants = [{"status": "Killed"}] * killed + [{"status": "Survived"}] * survived
    return {"mutation.json": json.dumps({"files": {"a.ts": {"mutants": mutants}}})}


class ArtifactSelection(unittest.TestCase):
    def test_newest_run_with_matches_only(self):
        gh = FakeGH({"w.yml": [run(3), run(2), run(1)]}, {3: ["x-a"], 2: ["x-a", "x-b"], 1: ["x-c"]})
        hits = vm.find_artifacts(gh, "w.yml", r"x-.+", 10)
        self.assertEqual([(r["databaseId"], n) for r, n in hits], [(3, "x-a")])
        hits = vm.find_artifacts(gh, "w.yml", r"x-.+", 10, all_matches=True)
        self.assertEqual(len(hits), 4)

    def test_incomplete_runs_skipped(self):
        r3 = dict(run(3), status="in_progress")
        gh = FakeGH({"w.yml": [r3, run(2)]}, {3: ["x"], 2: ["x"]})
        self.assertEqual(vm.find_artifacts(gh, "w.yml", "x", 10)[0][0]["databaseId"], 2)

    def test_stryker_skips_failed_newest_run(self):
        # The newest run failed but uploaded a report; an older successful run has a usable one.
        gh = FakeGH({"mutation-ts.yml": [run(5, "failure"), run(4)]},
                    {5: ["stryker-report"], 4: ["stryker-report"]},
                    {(5, "stryker-report"): stryker(1, 9), (4, "stryker-report"): stryker(9, 1)})
        r = vm.ts_mutants(gh, 10)
        self.assertIsNotNone(r)
        self.assertEqual(r["score"], 90.0)
        self.assertEqual(r["run"], "https://example/runs/4")

    def test_stryker_none_when_no_success(self):
        gh = FakeGH({"mutation-ts.yml": [run(5, "failure")]}, {5: ["stryker-report"]},
                    {(5, "stryker-report"): stryker(1, 1)})
        self.assertIsNone(vm.ts_mutants(gh, 10))

    def test_coverage_found_on_tag_runs_not_feature_branches(self):
        summary = {"data": [{"totals": {"lines": {"percent": 81.5}, "branches": {"percent": 70.0},
                                        "functions": {"percent": 90.0}}}]}
        runs = [run(9, branch="feature/x", event="workflow_dispatch"),
                run(8, branch="v0.3.0", event="push"), run(7)]
        gh = FakeGH({"verification-dashboard.yml": runs},
                    {9: ["llvm-cov-summary"], 8: ["llvm-cov-summary"]},
                    {(9, "llvm-cov-summary"): {"c.json": json.dumps(dict(summary, data=[{"totals": {
                        "lines": {"percent": 1.0}, "functions": {"percent": 1.0}}}]))},
                     (8, "llvm-cov-summary"): {"c.json": json.dumps(summary)}})
        cov = vm.coverage(gh, 10, None)
        self.assertEqual(cov["lines"], 81.5)
        self.assertEqual(cov["branches"], 70.0)
        self.assertIn(None, gh.branch_args)  # searched beyond main

    def test_nightly_searches_stay_on_main(self):
        gh = FakeGH({"verify.yml": [run(2, branch="ci/x"), run(1)]}, {2: ["fuzz-stats-a"], 1: []})
        self.assertIsNone(vm.fuzz_execs(gh, 10))
        self.assertEqual(set(gh.branch_args), {"main"})

    def test_main_or_tag_filter(self):
        self.assertTrue(vm.is_main_or_tag_run(run(1)))
        self.assertTrue(vm.is_main_or_tag_run(run(1, branch="v1.2.3", event="push")))
        self.assertFalse(vm.is_main_or_tag_run(run(1, branch="v1.2.3", event="pull_request")))
        self.assertFalse(vm.is_main_or_tag_run(run(1, branch="docs/x", event="workflow_dispatch")))


class History(unittest.TestCase):
    def test_snapshots_merge_and_order(self):
        d = tempfile.mkdtemp()
        vm.write_release(d, {"release": "v0.10.0", "date": "d", "commit": "c", "values": {}})
        vm.write_release(d, {"release": "v0.2.0", "date": "d", "commit": "a", "values": {"x": "1"}})
        vm.write_release(d, {"release": "v0.9.1", "date": "d", "commit": "b", "values": {}})
        self.assertEqual([r["release"] for r in vm.load_history(d)], ["v0.2.0", "v0.9.1", "v0.10.0"])

    def test_rewriting_one_release_keeps_the_others(self):
        d = tempfile.mkdtemp()
        vm.write_release(d, {"release": "v0.2.0", "date": "d", "commit": "a", "values": {"x": "1"}})
        vm.write_release(d, {"release": "v0.3.0", "date": "d", "commit": "b", "values": {"x": "2"}})
        vm.write_release(d, {"release": "v0.3.0", "date": "d", "commit": "b", "values": {"x": "3"}})
        h = vm.load_history(d)
        self.assertEqual([(r["release"], r["values"]["x"]) for r in h], [("v0.2.0", "1"), ("v0.3.0", "3")])

    def test_bad_release_name_rejected(self):
        with self.assertRaises(ValueError):
            vm.write_release(tempfile.mkdtemp(), {"release": "../evil", "values": {}})


class CoverageProvenance(unittest.TestCase):
    def _gh(self):
        summary = lambda pctg: {"c.json": json.dumps({"data": [{"totals": {
            "lines": {"percent": pctg}, "functions": {"percent": pctg}}}]})}
        r_new = dict(run(9, branch="v0.4.0", event="push"), headSha="new")
        r_old = dict(run(8, branch="v0.3.0", event="push"), headSha="old")
        return FakeGH({"verification-dashboard.yml": [r_new, r_old]},
                      {9: ["llvm-cov-summary"], 8: ["llvm-cov-summary"]},
                      {(9, "llvm-cov-summary"): summary(90.0), (8, "llvm-cov-summary"): summary(70.0)})

    def test_current_dashboard_takes_newest(self):
        self.assertEqual(vm.coverage(self._gh(), 10, None)["lines"], 90.0)

    def test_release_snapshot_takes_only_its_own_commit(self):
        self.assertEqual(vm.coverage(self._gh(), 10, None, require_sha="old")["lines"], 70.0)
        self.assertIsNone(vm.coverage(self._gh(), 10, None, require_sha="other"))


class RecordGuard(unittest.TestCase):
    def test_missing_tag_refused(self):
        self.assertIn("no tag", vm.check_record("v9.9.9", "abc", "", False))

    def test_tag_not_head_refused(self):
        self.assertIn("check out the tag", vm.check_record("v0.2.0", "abc", "def", False))

    def test_tag_at_head_or_override_allowed(self):
        self.assertIsNone(vm.check_record("v0.2.0", "abc", "abc", False))
        self.assertIsNone(vm.check_record("v9.9.9", "abc", "", True))

    def test_real_repo_has_no_such_tag(self):
        self.assertEqual(vm.resolve_tag("v999.99.99-does-not-exist"), "")


class SafetyMapping(unittest.TestCase):
    def test_unmapped_safety_issues_are_reported(self):
        issues = [{"number": 404, "title": "a"}, {"number": 99999, "title": "new defect"}]
        self.assertEqual([i["number"] for i in vm.unmapped_safety(issues, vm.catalog_issues())], [99999])

    def test_known_defects_are_on_their_rows(self):
        rows = {r[0]: set(r[5]) for r in vm.ANALYSES}
        self.assertIn(444, rows["Winkler foundation"])
        self.assertIn(445, rows["Constraints (rigid links, diaphragms, EqualDOF, MPC)"])


class hidden:
    """Context manager: make `vm.read` behave as if these repository paths (or directories) were
    deleted. Every documentary evidence source of the script is read through `vm.read`."""

    def __init__(self, *paths):
        self.paths = [os.path.normpath(p) for p in paths]

    def __enter__(self):
        self.orig = vm.read

        def fake(rel):
            r = os.path.normpath(rel)
            if any(r == p or r.startswith(p + os.sep) for p in self.paths):
                return ""
            return self.orig(rel)
        vm.read = fake
        return self

    def __exit__(self, *exc):
        vm.read = self.orig


def maturity_rows():
    rows = vm.maturity(vm.feature_matrix(), {})
    return {r["name"]: r for k in rows for r in rows[k]}


LINEAR = "Linear static"
COROT = "Co-rotational (geometric nonlinear)"
CONNECTOR = "Connector (spring element)"
FRAME = "Frame, Euler–Bernoulli (2D, 3D)"
AISC = "AISC 360 steel (`steel_check`)"
CONN = "Connections, engine (`connection_check`)"
FOOT = "Spread footings, engine (`foundation_check`)"


class EvidenceRemovalDowngrades(unittest.TestCase):
    """Negative case per evidence source: removing the evidence must lower the level."""

    @classmethod
    def setUpClass(cls):
        cls.base = maturity_rows()

    def test_baseline_levels(self):
        b = self.base
        self.assertEqual(b[LINEAR]["level"], "Certified")
        self.assertEqual(b[COROT]["level"], "Benchmarked")
        self.assertEqual(b[CONNECTOR]["level"], "Differential")
        self.assertEqual(b[FRAME]["level"], "Certified")
        self.assertEqual(b[AISC]["level"], "Certified")
        self.assertEqual(b[CONN]["level"], "Benchmarked")
        self.assertEqual(b[FOOT]["level"], "Differential")

    def test_certify_doc_removed(self):
        with hidden("docs/verification/CERTIFY.md"):
            r = maturity_rows()
        self.assertNotIn("Certified", r[LINEAR]["evidence"])
        self.assertNotEqual(r[LINEAR]["level"], "Certified")
        self.assertNotEqual(r[AISC]["level"], "Certified")

    def test_benchmarks_doc_removed(self):
        with hidden("docs/BENCHMARKS.md"):
            r = maturity_rows()
        self.assertEqual(r[COROT]["level"], "Tested")
        self.assertNotIn("Benchmarked", r[LINEAR]["evidence"])

    def test_one_harness_removed(self):
        with hidden("tools/differential/codeaster"):
            r = maturity_rows()
        self.assertEqual(r[CONNECTOR]["level"], "Tested")
        self.assertNotIn("Code_Aster", r[LINEAR]["evidence"].get("Differential", ""))
        self.assertIn("OpenSees", r[LINEAR]["evidence"]["Differential"])

    def test_all_harnesses_removed(self):
        with hidden("tools/differential", "tools/opensees"):
            r = maturity_rows()
        for row in r.values():
            if "Differential" in row["evidence"]:
                self.assertIn("TypeScript vs Rust", row["evidence"]["Differential"], row["name"])

    def test_symbolic_doc_removed(self):
        with hidden("docs/verification/SYMBOLIC.md"):
            r = maturity_rows()
        self.assertEqual(r[FRAME]["level"], "Benchmarked")

    def test_worked_examples_removed(self):
        with hidden("docs/verification/DESIGN_EXAMPLES.md"):
            r = maturity_rows()
        self.assertNotEqual(r[CONN]["level"], "Benchmarked")

    def test_ts_differential_removed(self):
        with hidden("docs/verification/TS_ENGINE_LOGIC.md"):
            r = maturity_rows()
            m = vm.ts_metrics(vm.ts_engine_logic())
        self.assertNotEqual(r[FOOT]["level"], "Differential")
        for k, v in m.items():
            self.assertEqual(v["status"], "not_measured", k)

    def test_feature_matrix_removed(self):
        with hidden("docs/verification/FEATURE_MATRIX.md"):
            fm = vm.feature_matrix()
            r = maturity_rows()
        self.assertNotIn("feature matrix", r[LINEAR]["evidence"].get("Tested", ""))
        for k, v in vm.fm_metrics(fm).items():
            self.assertEqual(v["status"], "not_measured", k)

    def test_repo_metrics_measured_when_evidence_present(self):
        for v in list(vm.fm_metrics(vm.feature_matrix()).values()) + list(vm.ts_metrics(vm.ts_engine_logic()).values()):
            self.assertEqual(v["status"], "measured", v["label"])


class AcceptanceEvidence(unittest.TestCase):
    def test_absent_then_present(self):
        orig = vm.ROOT
        try:
            vm.ROOT = tempfile.mkdtemp()
            self.assertIsNone(vm.acceptance())
            d = os.path.join(vm.ROOT, "engine", "tests", "acceptance", "models")
            os.makedirs(d)
            with open(os.path.join(d, "a.json"), "w") as f:
                json.dump({"analysis": "modal", "references": [{}, {}]}, f)
            self.assertEqual(vm.acceptance(), {"cases": 1, "references": 2, "by_analysis": {"modal": 1}, "unparsable": []})
        finally:
            vm.ROOT = orig


def mutants_dir(caught, missed):
    return {"caught.txt": "m\n" * caught, "missed.txt": "m\n" * missed, "timeout.txt": "", "unviable.txt": "",
            "mutants.json": json.dumps([{}] * (caught + missed))}


def ci_gh(require_sha=None, caught=9, missed=1):
    r_verify = dict(run(5), headSha="tagsha")
    r_diff = dict(run(4), headSha="other")
    gh = FakeGH({"verify.yml": [r_verify], "nightly.yml": [r_verify], "differential.yml": [r_diff],
                 "mutation-ts.yml": [dict(run(3), headSha="tagsha")]},
                {5: ["mutants-report-0", "fuzz-stats-json_static"], 4: ["differential-pynite"], 3: ["stryker-report"]},
                {(5, "mutants-report-0"): mutants_dir(caught, missed),
                 (5, "fuzz-stats-json_static"): {"s.txt": "stat::number_of_executed_units: 1234"},
                 (4, "differential-pynite"): {"r.json": json.dumps([{"status": "ok"}, {"status": "mismatch"}])},
                 (3, "stryker-report"): stryker(3, 1)})
    gh.require_sha = require_sha
    return gh


class CIEvidence(unittest.TestCase):
    def test_all_ci_metrics_from_artifacts(self):
        m, _ = vm.ci_metrics(ci_gh(), 10)
        self.assertEqual(set(m), {"differential_compared", "mutation_rust", "mutation_rotation", "mutation_ts",
                                  "fuzz_execs"})
        self.assertEqual(m["mutation_rust"]["value"], 90.0)
        self.assertEqual(m["mutation_rust"]["source"].split(" ")[0], "nightly.yml")
        self.assertEqual(m["fuzz_execs"]["value"], 1234)

    def test_no_artifacts_leaves_only_an_all_stale_rotation(self):
        m, _ = vm.ci_metrics(FakeGH({}, {}), 10)
        self.assertEqual(set(m), {"mutation_rotation"})
        self.assertEqual(m["mutation_rotation"]["value"], 0)
        self.assertEqual(m["mutation_rotation"]["status"], "partial")

    def test_release_sha_applies_to_every_ci_reader(self):
        m, _ = vm.ci_metrics(ci_gh(require_sha="tagsha"), 10)
        self.assertNotIn("differential_compared", m)  # that run is of another commit
        self.assertEqual(set(m), {"mutation_rust", "mutation_ts", "fuzz_execs"})
        m, _ = vm.ci_metrics(ci_gh(require_sha="nothing"), 10)
        self.assertEqual(m, {})

    def test_undefined_mutation_score_is_not_measured(self):
        m, _ = vm.ci_metrics(ci_gh(caught=0, missed=0), 10)
        self.assertNotIn("mutation_rust", m)
        self.assertNotIn("None", json.dumps(m))


class AbsentInputsAreNotNumbers(unittest.TestCase):
    """Fifth review: an absent or unparsable input must never become a number."""

    def test_differential_artifact_without_report_is_unavailable(self):
        # The newest artifact holds only a mismatch dump; an older run has a valid report.
        runs = [dict(run(6), headSha="new"), dict(run(5), headSha="old")]
        gh = FakeGH({"differential.yml": runs}, {6: ["differential-pynite"], 5: ["differential-pynite"]},
                    {(6, "differential-pynite"): {"pynite/dump-1.json": json.dumps({"nodes": []})},
                     (5, "differential-pynite"): {"r.json": json.dumps([{"status": "ok"}] * 3)}})
        d = vm.differential(gh, 10)
        self.assertEqual(d["pynite"]["ok"], 3)
        self.assertEqual(d["pynite"]["sha"], "old")

    def test_differential_no_report_anywhere(self):
        gh = FakeGH({"differential.yml": [run(6)]}, {6: ["differential-pynite"]},
                    {(6, "differential-pynite"): {"dump.json": "{}"}})
        self.assertEqual(vm.differential(gh, 10), {})
        m, _ = vm.ci_metrics(gh, 10)
        self.assertNotIn("differential_compared", m)

    def test_mutants_shard_without_outcomes_is_ignored(self):
        gh = FakeGH({"nightly.yml": [run(5)]}, {5: ["mutants-report-0"]},
                    {(5, "mutants-report-0"): {"debug.log": "x"}})
        self.assertIsNone(vm.rust_mutants(gh, 10))

    def test_mutants_unknown_plan_is_partial(self):
        files = mutants_dir(9, 1)
        del files["mutants.json"]
        gh = FakeGH({"nightly.yml": [run(5)]}, {5: ["mutants-report-0"]}, {(5, "mutants-report-0"): files})
        m, _ = vm.ci_metrics(gh, 10)
        self.assertEqual(m["mutation_rust"]["status"], "partial")
        self.assertIn("plan unknown", m["mutation_rust"]["display"])

    def test_stryker_empty_report_falls_back(self):
        gh = FakeGH({"mutation-ts.yml": [run(5), run(4)]}, {5: ["stryker-report"], 4: ["stryker-report"]},
                    {(5, "stryker-report"): stryker(0, 0), (4, "stryker-report"): stryker(3, 1)})
        self.assertEqual(vm.ts_mutants(gh, 10)["score"], 75.0)

    def test_coverage_malformed_is_unmeasured(self):
        d = tempfile.mkdtemp()
        p = os.path.join(d, "c.json")
        for text in ("not json", json.dumps({"data": []}), json.dumps({"data": [{"totals": {}}]})):
            with open(p, "w") as f:
                f.write(text)
            self.assertIsNone(vm.coverage(FakeGH({}, {}), 10, p), text)

    def test_coverage_without_branch_instrumentation_has_no_branch_value(self):
        p = os.path.join(tempfile.mkdtemp(), "c.json")
        with open(p, "w") as f:
            json.dump({"data": [{"totals": {"lines": {"percent": 80}, "functions": {"percent": 90},
                                            "branches": {"count": 0, "percent": 0}}}]}, f)
        self.assertIsNone(vm.coverage(FakeGH({}, {}), 10, p)["branches"])

    def test_acceptance_unparsable_cases_not_counted(self):
        orig = vm.ROOT
        try:
            vm.ROOT = tempfile.mkdtemp()
            d = os.path.join(vm.ROOT, "engine", "tests", "acceptance", "models")
            os.makedirs(d)
            with open(os.path.join(d, "bad.json"), "w") as f:
                f.write("{")
            self.assertIsNone(vm.acceptance())
            with open(os.path.join(d, "noref.json"), "w") as f:
                json.dump({"analysis": "modal"}, f)
            self.assertIsNone(vm.acceptance())
        finally:
            vm.ROOT = orig

    def test_git_counts_outside_a_repository(self):
        orig = vm.ROOT
        try:
            vm.ROOT = tempfile.mkdtemp()
            for k, v in vm.count_metrics().items():
                self.assertEqual(v["status"], "not_measured", k)
        finally:
            vm.ROOT = orig
        for k, v in vm.count_metrics().items():
            self.assertEqual(v["status"], "measured", k)

    def test_certified_share_without_certify_doc(self):
        rows = vm.maturity(vm.feature_matrix(), {})
        self.assertEqual(vm.certified_metrics(rows)["certified_analyses"]["status"], "measured")
        with hidden("docs/verification/CERTIFY.md"):
            m = vm.certified_metrics(vm.maturity(vm.feature_matrix(), {}))
        for v in m.values():
            self.assertEqual(v["status"], "not_measured")

    def test_ts_share_without_rust_sources(self):
        ts = vm.ts_engine_logic()
        ts["rust_lines"] = 0
        self.assertEqual(vm.ts_metrics(ts)["rust_share"]["status"], "not_measured")

    def test_undefined_value_never_displayed(self):
        for st in ("measured", "partial", "retained"):
            m = vm.metric("x", None, display="None %", status=st)
            self.assertEqual(m["display"], vm.NOT_MEASURED)


class MutantShardsCompleteness(unittest.TestCase):
    def gh(self, present, jobs=4, downloadable=None):
        names = [f"mutants-report-{k}" for k in range(present)]
        files = {(5, n): mutants_dir(9, 1) for n in names[: downloadable if downloadable is not None else present]}
        g = FakeGH({"nightly.yml": [run(5)]}, {5: names}, files)
        if jobs is not None:
            g.jobs_by_run = {5: [{"name": f"mutants ({i})", "conclusion": "success" if i < present else "failure"}
                                 for i in range(jobs)]}
        else:
            g.jobs_by_run = {}
        return g

    def test_all_shards_present_is_measured(self):
        m, _ = vm.ci_metrics(self.gh(4), 10)
        self.assertEqual(m["mutation_rust"]["status"], "measured")

    def test_three_of_four_shards_is_partial(self):
        # The fourth job uploaded nothing (e.g. it died before the upload step).
        m, _ = vm.ci_metrics(self.gh(3, jobs=4), 10)
        self.assertEqual(m["mutation_rust"]["status"], "partial")
        self.assertIn("3 of 4 shards reported", m["mutation_rust"]["display"])

    def test_undownloadable_shard_is_partial(self):
        m, _ = vm.ci_metrics(self.gh(4, jobs=4, downloadable=3), 10)
        self.assertEqual(m["mutation_rust"]["status"], "partial")

    def test_unknown_job_list_is_partial(self):
        m, _ = vm.ci_metrics(self.gh(4, jobs=None), 10)
        self.assertEqual(m["mutation_rust"]["status"], "partial")
        self.assertIn("number of shards unknown", m["mutation_rust"]["display"])


class OfflineRecordProvenance(unittest.TestCase):
    prev = {"generated": "2026-10-01", "metrics": {
        "mutation_rust": vm.with_sha(vm.metric("Mutation", 80.0, display="80.0 %"), ["oldsha"]),
        "fuzz_execs": vm.metric("Fuzz", 5),  # no provenance at all
        "safety_open": vm.metric("Open safety", 7),
        "gone": vm.metric("Gone", status="not_measured")}}

    def test_ci_metric_from_another_commit_is_not_carried_into_a_release(self):
        m = vm.retained(self.prev, "mutation_rust", "Mutation", "s", "offline run", record_sha="tagsha")
        self.assertEqual(m["status"], "not_measured")

    def test_ci_metric_without_provenance_is_not_carried_into_a_release(self):
        m = vm.retained(self.prev, "fuzz_execs", "Fuzz", "s", "offline run", record_sha="tagsha")
        self.assertEqual(m["status"], "not_measured")

    def test_ci_metric_from_the_release_commit_is_retained_and_marked(self):
        m = vm.retained(self.prev, "mutation_rust", "Mutation", "s", "offline run", record_sha="oldsha")
        self.assertEqual(m["status"], "retained")
        self.assertIn("retained from 2026-10-01", m["note"])
        self.assertEqual(vm.snapshot_value(m), "80.0 % (retained)")

    def test_current_dashboard_retains_with_note(self):
        m = vm.retained(self.prev, "mutation_rust", "Mutation", "s", "offline run")
        self.assertEqual((m["status"], m["display"]), ("retained", "80.0 %"))
        m = vm.retained(self.prev, "safety_open", "Open safety", "s", "offline run", record_sha="tagsha")
        self.assertEqual(vm.snapshot_value(m), "7 (retained)")

    def test_nothing_to_retain(self):
        for key in ("gone", "absent"):
            self.assertEqual(vm.retained(self.prev, key, "x", "s", "offline run")["status"], "not_measured")



def nightly(i, day, arts, status="completed"):
    return dict(run(i), createdAt=f"2026-11-{day:02d}T05:00:00Z", status=status), arts


class MutantsRotation(unittest.TestCase):
    NOW = vm.dt.datetime(2026, 11, 20, 12, tzinfo=vm.dt.timezone.utc)

    def rotation(self, nights, total=4, slots=2):
        runs = [r for r, _ in nights]
        gh = FakeGH({"nightly.yml": runs}, {r["databaseId"]: arts for r, arts in nights})
        real, vm.mutants_plan = vm.mutants_plan, lambda: (total, slots)
        try:
            return vm.mutants_rotation(gh, self.NOW), vm.check_mutants_rotation(gh, self.NOW)
        finally:
            vm.mutants_plan = real

    def test_every_shard_within_the_promise_passes(self):
        rot, code = self.rotation([nightly(2, 19, ["mutants-done-0-of-4", "mutants-done-1-of-4"]),
                                   nightly(1, 6, ["mutants-done-2-of-4", "mutants-done-3-of-4"])])
        self.assertEqual((rot["fresh"], rot["stale"], rot["oldest"], code), (4, [], "2026-11-06", 0))

    def test_old_foreign_or_expired_markers_are_stale_and_a_running_night_counts(self):
        rot, code = self.rotation([nightly(4, 19, ["mutants-done-0-of-4", "mutants-done-1-of-8",
                                                   "mutants-report-2"]),
                                   nightly(3, 18, ["mutants-done-2-of-4"], status="in_progress"),
                                   nightly(2, 3, ["mutants-done-3-of-4"])])
        self.assertEqual((rot["fresh"], rot["stale"], code), (2, [1, 3], 1))
        gh = FakeGH({"nightly.yml": [nightly(1, 19, [])[0]]}, {})
        gh.artifacts = lambda _: [{"name": "mutants-done-0-of-4", "expired": True}]
        real, vm.mutants_plan = vm.mutants_plan, lambda: (4, 2)
        try:
            self.assertEqual(vm.mutants_rotation(gh, self.NOW)["stale"], [0, 1, 2, 3])
        finally:
            vm.mutants_plan = real

    def test_freshness_is_the_marker_upload_time_not_the_run_start(self):
        late, _ = nightly(2, 4, ["mutants-done-0-of-2"])
        early, _ = nightly(1, 4, ["mutants-done-1-of-2"])
        gh = FakeGH({"nightly.yml": [late, early]}, {2: ["mutants-done-0-of-2"], 1: ["mutants-done-1-of-2"]})
        gh._stamps = {(2, "mutants-done-0-of-2"): "2026-11-04T13:00:00Z",
                      (1, "mutants-done-1-of-2"): "2026-11-04T11:00:00Z"}
        real, vm.mutants_plan = vm.mutants_plan, lambda: (2, 2)
        try:
            rot = vm.mutants_rotation(gh, self.NOW)
        finally:
            vm.mutants_plan = real
        self.assertEqual((rot["stale"], rot["oldest"]), ([1], "2026-11-04"))

    def test_a_plan_slower_than_the_promise_fails_even_when_fresh(self):
        names = [f"mutants-done-{k}-of-40" for k in range(40)]
        rot, code = self.rotation([nightly(1, 19, names)], total=40, slots=2)
        self.assertEqual((rot["ok"], rot["nights_per_pass"], code), (True, 20, 1))

    def test_unreadable_github_fails_the_check(self):
        gh = FakeGH({}, {})
        gh.ok = False
        self.assertIsNone(vm.mutants_rotation(gh, self.NOW))
        self.assertEqual(vm.check_mutants_rotation(gh, self.NOW), 1)

    def test_shard_ranges(self):
        self.assertEqual(vm.shard_ranges([1, 2, 3, 7, 9, 10]), "1-3, 7, 9-10")
        self.assertEqual(vm.shard_ranges([]), "")

    def test_the_nightly_plan_keeps_the_roadmap_promise(self):
        total, slots = vm.mutants_plan()
        self.assertLessEqual(-(-total // slots), vm.MUTANTS_PROMISE_DAYS)
        roadmap = vm.read("docs/roadmap/PRODUCT_ROADMAP.md")
        self.assertIn(f"covers all shards at least every {vm.MUTANTS_PROMISE_DAYS} days", roadmap)
        workflow = vm.read(".github/workflows/nightly.yml")
        formula = re.search(r'print\(json\.dumps\((\[.*?\])\)\)', workflow).group(1)
        covered = set()
        for d in range(20000, 20000 + vm.MUTANTS_PROMISE_DAYS):
            covered |= set(eval(formula, {}, {"t": total, "s": slots, "d": d}))
        self.assertEqual(covered, set(range(total)))


if __name__ == "__main__":
    unittest.main()
