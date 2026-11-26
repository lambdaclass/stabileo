import base64
import contextlib
import gzip
import hashlib
import importlib.util
import io
import json
import os
from pathlib import Path
import subprocess
import tempfile
import unittest
import zipfile
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[2]
spec = importlib.util.spec_from_file_location("replay_findings", ROOT / "scripts" / "replay-findings.py")
rf = importlib.util.module_from_spec(spec)
spec.loader.exec_module(rf)
REPLAY_COMMIT = "1" * 40
CURRENT_MARKER = "<!-- nightly-defect:" + "a" * 64 + " -->\n"
SINGLE_FINDING = "This run: **1 findings**, **1 analyses**, **1 relations**, **1 models**."


def make_issue(
    number,
    check="metamorphic",
    kind="wrong-result-candidate",
    root_cause="disp ux@n1: got 2, expected 1",
    test="metamorphic/linear/rotation",
    seed="20758",
    reduction="ddmin",
    model=None,
    details=None,
    omit_model=False,
    omit_seed=False,
):
    key = hashlib.sha256(f"{number}:{check}:{test}:{root_cause}".encode()).hexdigest()
    lines = [
        f"<!-- nightly-finding:{key} -->",
        "<!-- nightly-run:41275933376:1 -->",
        f"Check: **{check}** · kind: **{kind}**",
        "",
        f"Root cause: {root_cause}",
        "",
        SINGLE_FINDING,
        "",
        f"Test: **{test}**",
        "",
    ]
    if not omit_seed:
        lines.extend([
            f"Seed: `{seed}` · model SHA-256: `{key}`",
            "",
        ])
    lines.extend([
        "[Run and artifacts](https://github.com/lambdaclass/stabileo/actions/runs/41275933376) · commit `deadbeef`",
        "",
        f"Reduction: {reduction}",
    ])
    if omit_model:
        lines.extend([
            "",
            "Model JSON exceeds the issue body limit; download the finding JSON from the run artifacts.",
        ])
    elif model is not None:
        lines.extend([
            "",
            "Save as model.json:",
            "",
            "```json",
            json.dumps(model, indent=2),
            "```",
        ])
    if details is not None:
        text = details if isinstance(details, str) else json.dumps(details, indent=2)
        lines.extend([
            "",
            "Details:",
            "",
            "```text",
            text,
            "```",
        ])
    return {
        "number": number,
        "title": f"Nightly finding: {check}/{kind}: {root_cause} [{key[:12]}]",
        "body": "\n".join(lines),
    }


def bind_partial_fixtures(issues, rows):
    specs = {
        (spec["issue"], spec.get("reproducer")): spec
        for issue in issues for spec in rf._indexed_reproducers(issue)
    }
    return [
        {**row, **rf._partial_binding(specs[row["issue"], row.get("reproducer")], REPLAY_COMMIT)}
        for row in rows
    ]


def issue_action_runner(issues, calls):
    def run(*args, data=None):
        calls.append((args, data))
        if len(args) == 2 and args[0] == "api":
            number = int(args[1].rsplit("/", 1)[-1])
            issue = next(issue for issue in issues if issue["number"] == number)
            return json.dumps({**issue, "state": "open", "comments": 0})
        return ""

    return run


class MappingTest(unittest.TestCase):
    def test_metamorphic_issue_maps_to_model_seed_and_cell(self):
        model = {"_nightly_name": "rich_2d/7", "_nightly_dens": {"1": 7850.0}, "nodes": {"1": {"id": 1, "x": 0.0, "z": 0.0}}}
        issue = make_issue(101, check="metamorphic", test="metamorphic/P-Delta/rotation", seed="20760", model=model)
        parsed = rf.parse_issue(issue)
        self.assertTrue(parsed["replayable"])
        self.assertEqual(parsed["source"], "metamorphic")
        self.assertEqual(parsed["analysis"], "P-Delta")
        self.assertEqual(parsed["invariant"], "rotation")
        self.assertEqual(parsed["seed"], 20760)
        self.assertEqual(parsed["model"], model)

    def test_differential_issues_map_to_source_and_check_kind(self):
        for num, source, check_kind in [
            (201, "opensees", "mismatch"),
            (202, "opensees", "false_reject"),
            (203, "codeaster", "mismatch"),
            (204, "codeaster", "false_reject"),
            (205, "codeaster", "silent_singular"),
        ]:
            issue = make_issue(
                num,
                check=source,
                kind=check_kind if check_kind != "mismatch" else "wrong-result-candidate",
                test=f"{source}/{check_kind}",
                model={"nodes": {"1": {"id": 1}}},
            )
            parsed = rf.parse_issue(issue)
            self.assertTrue(parsed["replayable"], source)
            self.assertEqual(parsed["source"], source)
            self.assertEqual(parsed["check_kind"], check_kind)

    def test_fuzz_issue_mapping_distinguishes_standalone_slow_unit_and_unreduced_oom(self):
        crash = make_issue(
            301,
            check="fuzz",
            kind="json_plastic",
            root_cause="crash-1234abcd",
            test="fuzz/json_plastic",
            reduction="libFuzzer tmin (bounded to 120 seconds)",
            model={"raw_hex": "7b7d"},
            details='"crash-1234abcd"',
        )
        parsed_crash = rf.parse_issue(crash)
        self.assertTrue(parsed_crash["replayable"])
        self.assertTrue(parsed_crash["standalone_reproducer"])
        self.assertEqual(parsed_crash["target"], "json_plastic")

        unreduced_oom = make_issue(
            302,
            check="fuzz",
            kind="json_plastic",
            root_cause="oom-5678ef01",
            test="fuzz/json_plastic",
            reduction="original crashing input; minimizer produced no smaller artifact",
            model={"raw_hex": "7b7d"},
            details='"oom-5678ef01"',
        )
        parsed_oom = rf.parse_issue(unreduced_oom)
        self.assertTrue(parsed_oom["replayable"])
        self.assertFalse(parsed_oom["standalone_reproducer"])

        slow_unit = make_issue(
            303,
            check="fuzz",
            kind="json_plastic",
            root_cause="slow-unit-abcdef",
            test="fuzz/json_plastic",
            model={"raw_hex": "7b7d"},
            details='"slow-unit-abcdef"',
        )
        parsed_slow = rf.parse_issue(slow_unit)
        self.assertFalse(parsed_slow["replayable"])
        self.assertIn("slow-unit", parsed_slow["not_replayable_reason"])

    def test_replay_pending_placeholders_and_missing_models_are_not_replayable(self):
        for num, source in [(401, "metamorphic"), (402, "opensees"), (403, "codeaster")]:
            placeholder = make_issue(
                num,
                check=source,
                kind="original failure; replay pending",
                root_cause="original failure; replay pending",
                test=f"{source}/dumped_failure",
                model={"nodes": {}},
                details={"status": "original failure; replay pending"},
            )
            parsed = rf.parse_issue(placeholder)
            self.assertFalse(parsed["replayable"])
            self.assertIn("original failure; replay pending", parsed["not_replayable_reason"])

        oversized = make_issue(404, check="metamorphic", test="metamorphic/linear/rotation", omit_model=True)
        self.assertFalse(rf.parse_issue(oversized)["replayable"])

        prop = make_issue(405, check="properties", test="properties/properties_2d_equilibrium", model=None)
        self.assertFalse(rf.parse_issue(prop)["replayable"])

    def test_metamorphic_missing_or_malformed_seeds_are_not_replayable(self):
        model = {"nodes": {"1": {"id": 1, "x": 0.0, "z": 0.0}}}
        missing_seed = make_issue(
            410,
            check="metamorphic",
            test="metamorphic/linear/rotation",
            model=model,
            omit_seed=True,
        )
        parsed_missing = rf.parse_issue(missing_seed)
        self.assertFalse(parsed_missing["replayable"])
        self.assertIn("missing metamorphic seed", parsed_missing["not_replayable_reason"])

        for num, bad_seed in [
            (411, "not-a-seed"),
            (412, "-1"),
            (413, "20758_1"),
            (414, str(1 << 64)),
        ]:
            malformed = make_issue(
                num,
                check="metamorphic",
                test="metamorphic/linear/rotation",
                seed=bad_seed,
                model=model,
            )
            parsed_bad = rf.parse_issue(malformed)
            self.assertFalse(parsed_bad["replayable"], bad_seed)
            self.assertIn("invalid seed", parsed_bad["not_replayable_reason"])

        def fail_if_called(cmd, env=None, cwd=None, timeout=None):
            raise AssertionError("runner must not be called for missing or invalid metamorphic seed")

        report = rf.replay_issues(
            [missing_seed, malformed],
            commit=REPLAY_COMMIT,
            metamorphic_bin="/bin/metamorphic",
            runner=fail_if_called,
        )
        self.assertEqual([r["status"] for r in report], ["not-replayable", "not-replayable"])
        self.assertEqual(
            rf.plan_issue_actions(report, True, "https://github.com/o/r/actions/runs/99", "abc1234"),
            [],
        )
        results, err = rf._run_metamorphic_model(model, None, "/bin/metamorphic", fail_if_called)
        self.assertIsNone(results)
        self.assertIn("seed", err)


class ReplayAndClassificationTest(unittest.TestCase):
    def test_passing_failing_and_unreplayable_placeholder_replays_and_closing_policy(self):
        passing_issue = make_issue(
            10,
            check="metamorphic",
            test="metamorphic/linear/rotation",
            seed="20758",
            model={"nodes": {"1": {"id": 1, "x": 0.0, "z": 0.0}}},
        )
        failing_issue = make_issue(
            20,
            check="opensees",
            kind="wrong-result-candidate",
            test="opensees/mismatch",
            model={"nodes": {"1": {"id": 1, "x": 0.0, "z": 0.0}}},
        )
        placeholder_issue = make_issue(
            30,
            check="codeaster",
            kind="original failure; replay pending",
            root_cause="original failure; replay pending",
            test="codeaster/dumped_failure",
            model={"nodes": {"1": {"id": 1, "x": 0.0, "y": 0.0, "z": 0.0}}},
            details={"status": "original failure; replay pending"},
        )
        refused_metamorphic_issue = make_issue(
            40,
            check="metamorphic",
            test="metamorphic/buckling/rotation",
            seed="20759",
            model={"nodes": {"2": {"id": 2, "x": 1.0, "z": 0.0}}},
        )

        def fake_runner(cmd, env=None, cwd=None, timeout=None):
            if "metamorphic_replay" in cmd:
                results_path = Path(env["NIGHTLY_RESULTS"])
                if env.get("METAMORPHIC_SEED") == "20758":
                    payload = {
                        "failures": [],
                        "verdicts": [
                            {
                                "analysis": "linear",
                                "invariant": "rotation",
                                "pass": 1,
                                "same_refusal": 0,
                                "fail": 0,
                                "refused": 0,
                                "inconclusive": 0,
                                "unrepresentable": 0,
                                "not_applicable": 0,
                            }
                        ],
                    }
                else:
                    payload = {
                        "failures": [],
                        "verdicts": [
                            {
                                "analysis": "buckling",
                                "invariant": "rotation",
                                "pass": 0,
                                "same_refusal": 0,
                                "fail": 0,
                                "refused": 1,
                                "inconclusive": 0,
                                "unrepresentable": 0,
                                "not_applicable": 0,
                            }
                        ],
                    }
                results_path.write_text(json.dumps(payload))
                return subprocess.CompletedProcess(cmd, 0, "", "")
            if "testing/opensees/compare.py" in cmd:
                report_path = Path(cmd[cmd.index("--report") + 1])
                report_path.write_text(
                    json.dumps([{"name": "model.json", "status": "mismatch", "n_bad": 2, "max_err": {"disp": 3.1e-2}}])
                )
                return subprocess.CompletedProcess(cmd, 1, "", "")
            raise AssertionError(f"unexpected command: {cmd}")

        report = rf.replay_issues(
            [passing_issue, failing_issue, placeholder_issue, refused_metamorphic_issue],
            commit=REPLAY_COMMIT,
            metamorphic_bin="/bin/metamorphic",
            solve_bin="/bin/solve_json",
            opensees_python="/bin/python3",
            runner=fake_runner,
        )
        by_issue = {r["issue"]: r for r in report}
        self.assertEqual(set(by_issue[10]), {"issue", "source", "status", "evidence", "commit", "input_sha256"})
        self.assertEqual(by_issue[10]["status"], "passes-now")
        self.assertEqual(by_issue[10]["source"], "metamorphic")
        self.assertIn("metamorphic/linear/rotation: pass=1 fail=0", by_issue[10]["evidence"])

        self.assertEqual(by_issue[20]["status"], "still-fails")
        self.assertEqual(by_issue[20]["source"], "opensees")
        self.assertIn("opensees/mismatch: status=mismatch", by_issue[20]["evidence"])

        self.assertEqual(by_issue[30]["status"], "not-replayable")
        self.assertEqual(by_issue[30]["source"], "codeaster")
        self.assertIn("original failure; replay pending", by_issue[30]["evidence"])

        self.assertEqual(by_issue[40]["status"], "not-replayable")
        self.assertIn('"refused": 1', by_issue[40]["evidence"])

        self.assertEqual(
            rf.plan_issue_actions(report, False, "https://github.com/o/r/actions/runs/99", "abc1234"),
            [],
        )

        actions = rf.plan_issue_actions(report, True, "https://github.com/o/r/actions/runs/99", "abc1234")
        self.assertEqual([(a["action"], a["issue"]) for a in actions], [("close", 10), ("comment", 20)])
        self.assertIn("https://github.com/o/r/actions/runs/99", actions[0]["body"])
        self.assertIn("`abc1234`", actions[0]["body"])
        self.assertIn("metamorphic/linear/rotation: pass=1 fail=0", actions[0]["body"])
        self.assertIn("https://github.com/o/r/actions/runs/99", actions[1]["body"])
        self.assertIn("`abc1234`", actions[1]["body"])
        self.assertIn("opensees/mismatch: status=mismatch", actions[1]["body"])
        self.assertNotIn(30, [a["issue"] for a in actions])
        self.assertNotIn(40, [a["issue"] for a in actions])

        gh_calls = []
        snapshots = [passing_issue, failing_issue, placeholder_issue, refused_metamorphic_issue]
        rf.apply_issue_actions("o/r", actions, snapshots, gh_runner=issue_action_runner(snapshots, gh_calls))
        self.assertEqual(gh_calls[0][0], ("api", "repos/o/r/issues/10"))
        writes = [args for args, _ in gh_calls if args[0] == "issue"]
        self.assertEqual(len(writes), 2)
        self.assertEqual(writes[0][:4], ("issue", "close", "10", "--repo"))
        self.assertEqual(writes[1][:4], ("issue", "comment", "20", "--repo"))

    def test_differential_and_fuzz_classification_rules(self):
        false_reject_spec = rf.parse_issue(
            make_issue(50, check="codeaster", kind="false_reject", test="codeaster/false_reject", model={"nodes": {}})
        )
        self.assertEqual(rf.classify_diff(false_reject_spec, {"status": "refused", "why": ["agreed"]})[0], "not-replayable")
        self.assertEqual(rf.classify_diff(false_reject_spec, {"status": "ok", "max_err": {}})[0], "passes-now")
        self.assertEqual(rf.classify_diff(false_reject_spec, {"status": "false_reject", "why": ["bad"]})[0], "still-fails")
        self.assertEqual(rf.classify_diff(false_reject_spec, {"status": "unsupported", "why": ["mpc"]})[0], "not-replayable")

        mismatch_spec = rf.parse_issue(
            make_issue(51, check="opensees", kind="wrong-result-candidate", test="opensees/mismatch", model={"nodes": {}})
        )
        self.assertEqual(rf.classify_diff(mismatch_spec, {"status": "ok", "max_err": {}})[0], "passes-now")
        self.assertEqual(rf.classify_diff(mismatch_spec, {"status": "refused", "why": ["singular"]})[0], "not-replayable")
        self.assertEqual(rf.classify_diff(mismatch_spec, {"status": "ill_conditioned", "why": ["kappa"]})[0], "not-replayable")
        self.assertEqual(rf.classify_diff(mismatch_spec, {"status": "converging", "why": ["mesh"]})[0], "still-fails")

        singular_spec = rf.parse_issue(
            make_issue(52, check="codeaster", kind="silent_singular", test="codeaster/silent_singular", model={"nodes": {}})
        )
        self.assertEqual(rf.classify_diff(singular_spec, {"status": "warned_singular", "why": ["held"]})[0], "passes-now")
        self.assertEqual(rf.classify_diff(singular_spec, {"status": "silent_singular", "why": ["unwarned"]})[0], "still-fails")
        self.assertEqual(rf.classify_diff(singular_spec, {"status": "ill_conditioned", "why": ["diag"]})[0], "not-replayable")

        crash_spec = rf.parse_issue(
            make_issue(
                53,
                check="fuzz",
                kind="json_plastic",
                root_cause="crash-111",
                test="fuzz/json_plastic",
                reduction="libFuzzer tmin (bounded to 120 seconds)",
                model={"raw_hex": "7b7d"},
            )
        )
        self.assertEqual(rf.classify_fuzz(crash_spec, 0)[0], "passes-now")
        self.assertEqual(rf.classify_fuzz(crash_spec, 77, stderr="SUMMARY: AddressSanitizer")[0], "still-fails")

        oom_spec = rf.parse_issue(
            make_issue(
                54,
                check="fuzz",
                kind="json_plastic",
                root_cause="oom-222",
                test="fuzz/json_plastic",
                reduction="original crashing input; minimizer produced no smaller artifact",
                model={"raw_hex": "7b7d"},
            )
        )
        self.assertEqual(rf.classify_fuzz(oom_spec, 0)[0], "not-replayable")
        self.assertEqual(rf.classify_fuzz(oom_spec, 71, stderr="SUMMARY: libFuzzer: out-of-memory")[0], "still-fails")

    def test_metamorphic_mixed_verdicts_are_not_replayable_and_never_closed(self):
        spec = rf.parse_issue(
            make_issue(
                60,
                check="metamorphic",
                test="metamorphic/linear/symmetry",
                seed="20758",
                model={"nodes": {"1": {"id": 1, "x": 0.0, "z": 0.0}}},
            )
        )
        for non_pass_key in ("refused", "inconclusive", "unrepresentable", "same_refusal", "not_applicable"):
            verdict = {
                "analysis": "linear",
                "invariant": "symmetry",
                "pass": 1,
                "same_refusal": 0,
                "fail": 0,
                "refused": 0,
                "inconclusive": 0,
                "unrepresentable": 0,
                "not_applicable": 0,
            }
            verdict[non_pass_key] = 1
            status, evidence = rf.classify_metamorphic(spec, {"failures": [], "verdicts": [verdict]})
            self.assertEqual(status, "not-replayable", non_pass_key)
            self.assertIn("mixed metamorphic verdict", evidence)
            actions = rf.plan_issue_actions(
                [{"issue": 60, "source": "metamorphic", "status": status, "evidence": evidence}],
                True,
                "https://github.com/o/r/actions/runs/99",
                "abc1234",
            )
            self.assertEqual(actions, [])

        failing_mixed = {
            "analysis": "linear",
            "invariant": "symmetry",
            "pass": 1,
            "same_refusal": 0,
            "fail": 1,
            "refused": 0,
            "inconclusive": 0,
            "unrepresentable": 0,
            "not_applicable": 0,
        }
        self.assertEqual(
            rf.classify_metamorphic(spec, {"failures": [], "verdicts": [failing_mixed]})[0],
            "still-fails",
        )

    def test_fuzz_infrastructure_and_build_errors_are_not_classified_as_still_fails(self):
        crash_issue = make_issue(
            70,
            check="fuzz",
            kind="json_plastic",
            root_cause="crash-111",
            test="fuzz/json_plastic",
            reduction="libFuzzer tmin (bounded to 120 seconds)",
            model={"raw_hex": "7b7d"},
        )
        crash_spec = rf.parse_issue(crash_issue)

        for returncode, stderr in [
            (101, "error[E0432]: unresolved import\nerror: could not compile `dedaliano-engine-fuzz`"),
            (1, "error: toolchain 'nightly-2026-10-15-x86_64-unknown-linux-gnu' is not installed"),
            (1, "error: no such subcommand: `fuzz`"),
            (2, "error: unexpected argument '--bad' found\n\nUsage: cargo fuzz run"),
            (127, "cargo: command not found"),
            (1, ""),
        ]:
            status, evidence = rf.classify_fuzz(crash_spec, returncode, stderr=stderr)
            self.assertEqual(status, "not-replayable", (returncode, stderr))
            self.assertIn("fuzz runner failed without reproducing target failure", evidence)

        def infra_error_runner(cmd, env=None, cwd=None, timeout=None):
            return subprocess.CompletedProcess(
                cmd,
                101,
                "",
                "error: could not compile `dedaliano-engine-fuzz` due to 1 previous error",
            )

        report = rf.replay_issues([crash_issue], commit=REPLAY_COMMIT, source="fuzz", runner=infra_error_runner)
        self.assertEqual(len(report), 1)
        self.assertEqual(report[0]["status"], "not-replayable")
        self.assertEqual(
            rf.plan_issue_actions(report, True, "https://github.com/o/r/actions/runs/99", "abc1234"),
            [],
        )

        self.assertEqual(
            rf.classify_fuzz(
                crash_spec,
                1,
                stderr="thread '<unnamed>' panicked at src/lib.rs:10:5\n==99== ERROR: libFuzzer: deadly signal",
            )[0],
            "still-fails",
        )

    def test_empty_fuzz_input_writes_an_empty_crash_file(self):
        issue = make_issue(
            71,
            check="fuzz",
            kind="json_plastic",
            root_cause="crash-empty",
            test="fuzz/json_plastic",
            reduction="libFuzzer tmin (bounded to 120 seconds)",
            model={"raw_hex": ""},
        )
        self.assertTrue(rf.parse_issue(issue)["replayable"])

        def empty_input_runner(cmd, env=None, cwd=None, timeout=None):
            crash_path = Path(cmd[cmd.index("json_plastic") + 1])
            self.assertEqual(crash_path.read_bytes(), b"")
            return subprocess.CompletedProcess(cmd, 0, "", "")

        report = rf.replay_issues([issue], commit=REPLAY_COMMIT, source="fuzz", runner=empty_input_runner)
        self.assertEqual(report[0]["status"], "passes-now")

    def test_fuzz_runner_timeout_before_execution_is_not_replayable(self):
        issue = make_issue(
            72,
            check="fuzz",
            kind="json_plastic",
            root_cause="crash-timeout",
            test="fuzz/json_plastic",
            reduction="libFuzzer tmin (bounded to 120 seconds)",
            model={"raw_hex": "7b7d"},
        )

        def timeout_runner(cmd, env=None, cwd=None, timeout=None):
            raise subprocess.TimeoutExpired(cmd, timeout)

        report = rf.replay_issues([issue], commit=REPLAY_COMMIT, source="fuzz", runner=timeout_runner)
        self.assertEqual(report[0]["status"], "not-replayable")
        self.assertIn("fuzz runner timed out", report[0]["evidence"])
        self.assertEqual(
            rf.plan_issue_actions(report, True, "https://github.com/o/r/actions/runs/99", "abc1234"),
            [],
        )
        self.assertEqual(
            rf.classify_fuzz(
                rf.parse_issue(issue),
                1,
                stderr="ALARM: working on the last unit for 60 seconds\nSUMMARY: libFuzzer: timeout",
            )[0],
            "still-fails",
        )

    def test_report_cli_writes_merged_json_and_respects_close_passing_flag(self):
        issues = [
            make_issue(1, check="metamorphic", test="metamorphic/linear/rotation", model={"nodes": {}}),
            make_issue(
                2,
                check="metamorphic",
                kind="original failure; replay pending",
                root_cause="original failure; replay pending",
                test="metamorphic/dumped_failure",
                model={"nodes": {}},
            ),
        ]
        partial = [
            {"issue": 1, "source": "metamorphic", "status": "passes-now", "evidence": "metamorphic/linear/rotation: pass=1 fail=0"},
            {"issue": 2, "source": "metamorphic", "status": "not-replayable", "evidence": "metamorphic/dumped_failure: original failure; replay pending"},
        ]
        with tempfile.TemporaryDirectory() as tmp:
            tmp_path = Path(tmp)
            issues_file = tmp_path / "issues.json"
            partial_file = tmp_path / "partial.json"
            out_file = tmp_path / "report.json"
            summary_file = tmp_path / "summary.md"
            issues_file.write_text(json.dumps(issues))
            partial_file.write_text(json.dumps(bind_partial_fixtures(issues, partial)))

            calls = []
            orig_gh = rf.gh
            rf.gh = issue_action_runner(issues, calls)
            with contextlib.redirect_stdout(io.StringIO()):
                try:
                    rc = rf.main([
                        "report",
                        "--issues", str(issues_file),
                        "--partials", str(partial_file),
                        "--output", str(out_file),
                        "--summary", str(summary_file),
                        "--repo", "o/r",
                        "--run-url", "https://github.com/o/r/actions/runs/1",
                        "--commit", REPLAY_COMMIT,
                    ])
                    self.assertEqual(rc, 0)
                    self.assertEqual(calls, [])
                    written = json.loads(out_file.read_text())
                    self.assertEqual([r["status"] for r in written], ["passes-now", "not-replayable"])

                    rc = rf.main([
                        "report",
                        "--issues", str(issues_file),
                        "--partials", str(partial_file),
                        "--output", str(out_file),
                        "--repo", "o/r",
                        "--run-url", "https://github.com/o/r/actions/runs/1",
                        "--commit", REPLAY_COMMIT,
                        "--close-passing",
                    ])
                    self.assertEqual(rc, 0)
                    self.assertEqual(calls[0][0], ("api", "repos/o/r/issues/1"))
                    writes = [args for args, _ in calls if args[0] == "issue"]
                    self.assertEqual(len(writes), 1)
                    self.assertEqual(writes[0][:4], ("issue", "close", "1", "--repo"))
                finally:
                    rf.gh = orig_gh

    def test_report_cli_marks_missing_source_partials_not_replayable_without_losing_completed_sources(self):
        issues = [
            make_issue(1, check="metamorphic", test="metamorphic/linear/rotation", model={"nodes": {}}),
            make_issue(2, check="opensees", kind="wrong-result-candidate", test="opensees/mismatch", model={"nodes": {}}),
        ]
        metamorphic_partial = [
            {"issue": 1, "source": "metamorphic", "status": "passes-now", "evidence": "metamorphic/linear/rotation: pass=1 fail=0"},
        ]
        with tempfile.TemporaryDirectory() as tmp:
            tmp_path = Path(tmp)
            issues_file = tmp_path / "issues.json"
            metamorphic_file = tmp_path / "partial-metamorphic.json"
            missing_opensees_file = tmp_path / "partial-opensees.json"
            out_file = tmp_path / "report.json"
            issues_file.write_text(json.dumps(issues))
            metamorphic_file.write_text(json.dumps(bind_partial_fixtures(issues, metamorphic_partial)))

            calls = []
            orig_gh = rf.gh
            rf.gh = issue_action_runner(issues, calls)
            with contextlib.redirect_stdout(io.StringIO()):
                try:
                    rc = rf.main([
                        "report",
                        "--issues", str(issues_file),
                        "--partials", str(metamorphic_file), str(missing_opensees_file),
                        "--output", str(out_file),
                        "--repo", "o/r",
                        "--run-url", "https://github.com/o/r/actions/runs/1",
                        "--commit", REPLAY_COMMIT,
                        "--close-passing",
                    ])
                    self.assertEqual(rc, 0)
                    written = json.loads(out_file.read_text())
                    self.assertEqual(
                        [(r["issue"], r["status"]) for r in written],
                        [(1, "passes-now"), (2, "not-replayable")],
                    )
                    self.assertIn("no replay result recorded", written[1]["evidence"])
                    self.assertEqual(calls[0][0], ("api", "repos/o/r/issues/1"))
                    writes = [args for args, _ in calls if args[0] == "issue"]
                    self.assertEqual(len(writes), 1)
                    self.assertEqual(writes[0][:4], ("issue", "close", "1", "--repo"))
                finally:
                    rf.gh = orig_gh

    def test_workflow_is_workflow_dispatch_only_and_defaults_to_report_only(self):
        workflow = (ROOT / ".github" / "workflows" / "replay-findings.yml").read_text()
        self.assertIn("workflow_dispatch:", workflow)
        self.assertIn("close_passing:", workflow)
        self.assertIn("default: false", workflow)
        self.assertNotIn("\n  schedule:", workflow)
        self.assertNotIn("\n  pull_request:", workflow)
        self.assertIn("if: always() && needs.issues.result == 'success'", workflow)
        self.assertIn("name: replay-findings-report", workflow)
        self.assertIn("path: replay-findings.json", workflow)



class ReplayClosureReviewTest(unittest.TestCase):
    def record(self, seed, model):
        artifact = json.dumps({"test": "metamorphic/linear/rotation", "seed": seed, "model": model})
        record = {
            "test": "metamorphic/linear/rotation", "seed": str(seed), "kind": "wrong-result-candidate",
            "message": "displacement mismatch", "reduction": "ddmin", "runId": "41275933376",
            "path": "nightly-findings/nightly-findings-metamorphic/reproducer.finding.json",
            "artifactHash": hashlib.sha256(artifact.encode()).hexdigest(), "artifact": artifact,
        }
        payload = base64.b64encode(gzip.compress(json.dumps([record]).encode())).decode()
        return f"<!-- nightly-reproducer:v1 {payload} -->"

    def assert_report_actions(self, issues, partials, expected, scheduled=False, live_issue=None, live_comments=None, commit=REPLAY_COMMIT):
        calls = []

        def fake_gh(*args, data=None):
            calls.append((args, data))
            if len(args) == 2 and args[0] == "api":
                number = int(args[1].rsplit("/", 1)[-1])
                issue = next(issue for issue in issues if issue["number"] == number)
                return json.dumps({**issue, "state": "open", "comments": len(issue.get("sightings", [])), **(live_issue or {})})
            if args[:3] == ("api", "--paginate", "--slurp"):
                comments = live_comments if live_comments is not None else [
                    {"user": {"login": "github-actions[bot]"}, "body": body} for body in issues[0].get("sightings", [])
                ]
                return json.dumps([comments])
            return ""

        with tempfile.TemporaryDirectory() as tmp, patch.object(rf, "gh", side_effect=fake_gh):
            root = Path(tmp)
            issues_file = root / "issues.json"
            partial_file = root / "partial.json"
            output = root / "report.json"
            issues_file.write_text(json.dumps(issues))
            partial_file.write_text(json.dumps(partials))
            args = ["--night", "2026-11-25", "--run-id", "99"] if scheduled else ["--close-passing"]
            args.extend(["--commit", commit])
            with contextlib.redirect_stdout(io.StringIO()):
                self.assertEqual(rf.main(["report", "--issues", str(issues_file), "--partials", str(partial_file),
                                          "--output", str(output), "--repo", "owner/repo", *args]), 0)
            report = json.loads(output.read_text())
        self.assertEqual([entry["status"] for entry in report], expected)
        return report, calls

    def test_missing_primary_inventory_prevents_manual_and_scheduled_closure(self):
        original = make_issue(1, model={"nodes": {}})
        run = "<!-- nightly-run:41275933376:1 -->"
        current = CURRENT_MARKER + original["body"]
        summary = "This run: **2 findings**, **1 analyses**, **1 relations**, **2 models**.\n"
        legacy = original["body"].replace(SINGLE_FINDING + "\n", summary)
        overflow = (
            "<!-- nightly-sightings:1:3:1 -->\nAdditional sighting.\n"
            "<!-- nightly-overflow-complete -->\n" + self.record(3, {"nodes": {}}) + "\n\n"
        )
        recovered_records = []
        for seed in (42, 43):
            marker = self.record(seed, {"nodes": {str(seed): {}}})
            recovered_records.extend(json.loads(gzip.decompress(base64.b64decode(marker.split()[2]))))

        def recovered(records):
            payload = base64.b64encode(gzip.compress(json.dumps(records).encode())).decode()
            return legacy.replace(run, f"<!-- nightly-reproducer:v1 {payload} -->\n{run}")

        cases = [
            ("legacy singleton", original["body"], [], True),
            ("adopted legacy singleton", "<!-- nightly-finding-adopted -->\n" + current, [], True),
            ("current body missing block", current, [], False),
            ("current sighting missing block", original["body"], [current], False),
            ("current body missing block despite overflow", overflow + current, [], False),
            ("legacy body missing models", legacy, [], False),
            ("legacy comment missing models", original["body"], [legacy], False),
            ("adopted legacy missing models", "<!-- nightly-finding-adopted -->\n" + current.replace(original["body"], legacy), [], False),
            ("legacy recovery still incomplete", recovered(recovered_records[:1]), [], False),
            ("legacy batch omits displayed input", recovered(recovered_records), [], False),
        ]
        verdict = {"verdicts": [{"analysis": "linear", "invariant": "rotation", "pass": 1}]}
        commit = subprocess.check_output(["git", "rev-parse", "HEAD"], cwd=ROOT, text=True).strip()
        for name, body, sightings, closes in cases:
            issue = {**original, "body": body, "sightings": sightings}
            for scheduled in (False, True):
                with self.subTest(name=name, scheduled=scheduled):
                    snapshot = issue
                    if scheduled:
                        fingerprint = rf._replay_fingerprint(rf.parse_reproducers(issue))
                        state = json.dumps({"night": "2026-11-24", "fingerprint": fingerprint, "streak": 2})
                        snapshot = {**issue, "body": f"<!-- nightly-replay:v1 {state} -->\n{body}"}
                    partials = self.replay_cli([snapshot], lambda *_: (verdict, None))
                    expected = "passes-now" if closes else "not-replayable"
                    _, calls = self.assert_report_actions([snapshot], partials, [expected], scheduled=scheduled, commit=commit)
                    closed = any(args[:2] == ("issue", "close") or
                                 (args[:3] == ("api", "--method", "PATCH") and json.loads(data).get("state") == "closed")
                                 for args, data in calls)
                    self.assertEqual(closed, closes)

    def test_legacy_sample_and_counts_do_not_prove_the_original_inventory(self):
        model = {"nodes": {}}
        issue = make_issue(1, seed="42", model=model)
        run = "<!-- nightly-run:41275933376:1 -->"
        summary = "This run: **2 findings**, **1 analyses**, **2 relations**, **1 model**.\n"
        multi = issue["body"].replace(SINGLE_FINDING + "\n", summary)
        displayed = self.records(self.record(42, model))
        unrelated = self.records(self.record(99, {"nodes": {"unrelated": {}}}))
        wrong_seed = self.records(self.record(43, model))
        restored = (
            ("one model, multiple findings", multi),
            ("aggregate with no count", multi.replace(summary, "One smallest available reproducer\n")),
            ("no evidence of the number of inputs", issue["body"].replace(SINGLE_FINDING + "\n", "")),
            ("enough records omit displayed input", multi.replace(run, self.batch(wrong_seed + unrelated) + "\n" + run)),
            ("one display and an unrelated record", multi.replace(run, self.batch(displayed + unrelated) + "\n" + run)),
        )
        verdict = {"verdicts": [{"analysis": "linear", "invariant": "rotation", "pass": 1}]}
        commit = subprocess.check_output(["git", "rev-parse", "HEAD"], cwd=ROOT, text=True).strip()
        for name, body in restored:
            for scheduled in (False, True):
                with self.subTest(name=name, scheduled=scheduled):
                    snapshot = {**issue, "body": body}
                    if scheduled:
                        fingerprint = rf._replay_fingerprint(rf.parse_reproducers(snapshot))
                        state = json.dumps({"night": "2026-11-24", "fingerprint": fingerprint, "streak": 2})
                        snapshot["body"] = f"<!-- nightly-replay:v1 {state} -->\n{body}"
                    partials = self.replay_cli([snapshot], lambda *_: (verdict, None))
                    report, calls = self.assert_report_actions(
                        [snapshot], partials, ["not-replayable"], scheduled=scheduled, commit=commit)
                    self.assertIn("original", report[0]["evidence"])
                    self.assertFalse(any(args[:2] == ("issue", "close") or
                                         (args[:3] == ("api", "--method", "PATCH") and
                                          json.loads(data).get("state") == "closed") for args, data in calls))

    def records(self, marker):
        return json.loads(gzip.decompress(base64.b64decode(marker.split()[2])))

    def batch(self, records):
        payload = base64.b64encode(gzip.compress(json.dumps(records).encode())).decode()
        return f"<!-- nightly-reproducer:v1 {payload} -->"

    def with_inventory(self, body, marker):
        return CURRENT_MARKER + body.replace("<!-- nightly-run:", marker + "\n<!-- nightly-run:", 1)

    def test_rounded_legacy_inline_model_needs_original_bytes_even_with_a_safe_seed(self):
        safe = (1 << 53) - 1
        exact = (1 << 53) + 1
        rounded = int(float(exact))
        cases = [
            ({"value": [safe, -safe]}, None, "passes-now"),
            ({"value": [{"id": rounded}]}, None, "not-replayable"),
            ({"value": [{"id": -rounded}]}, None, "not-replayable"),
            ({"value": [float(rounded)]}, None, "not-replayable"),
            ({"value": [{"id": rounded}]}, {"value": [{"id": exact}]}, "passes-now"),
        ]
        for number, (displayed, original, expected) in enumerate(cases, 1):
            with self.subTest(number=number):
                issue = make_issue(number, seed="42", model=displayed)
                if original is not None:
                    issue["body"] = self.with_inventory(issue["body"], self.record(42, original))
                seen = []

                def runner(cmd, *, env, timeout):
                    seen.append(json.loads(Path(env["NIGHTLY_MODEL"]).read_text()))
                    Path(env["NIGHTLY_RESULTS"]).write_text(json.dumps(
                        {"verdicts": [{"analysis": "linear", "invariant": "rotation", "pass": 1}]}))
                    return subprocess.CompletedProcess(cmd, 0, "", "")

                partials = rf.replay_issues([issue], commit=REPLAY_COMMIT, runner=runner, metamorphic_bin="metamorphic")
                _, calls = self.assert_report_actions([issue], partials, [expected])
                self.assertEqual(seen, [] if expected == "not-replayable" else [original or displayed])
                self.assertEqual(any(args[:2] == ("issue", "close") for args, _ in calls), expected == "passes-now")

    def test_live_closure_detects_a_new_bot_comment_with_missing_run_marker(self):
        issue = make_issue(1, model={"nodes": {}})
        new_sighting = {"user": {"login": "github-actions[bot]"}, "body": self.record(42, {"nodes": {"new": {}}})}
        for scheduled in (False, True):
            with self.subTest(scheduled=scheduled):
                snapshot = issue
                if scheduled:
                    fingerprint = rf._replay_fingerprint(rf.parse_reproducers(issue))
                    state = json.dumps({"night": "2026-11-24", "fingerprint": fingerprint, "streak": 2})
                    snapshot = {**issue, "body": f"<!-- nightly-replay:v1 {state} -->\n" + issue["body"]}
                partials = bind_partial_fixtures([snapshot], [
                    {"issue": 1, "status": "passes-now", "evidence": "snapshot input passed"}
                ])
                _, calls = self.assert_report_actions(
                    [snapshot], partials, ["passes-now"], scheduled=scheduled,
                    live_comments=[new_sighting], live_issue={"comments": 1})
                self.assertEqual(len(calls), 2)
                self.assertIn("/comments?", calls[-1][0][-1])

    def test_fetch_retains_bot_reproducer_comments_with_broken_occurrence_markers(self):
        issue = make_issue(1, model={"nodes": {}})
        record = self.record(42, {"nodes": {"comment": {}}})
        bot = {"login": "github-actions[bot]"}
        finding = CURRENT_MARKER.rstrip("\n")
        intact = f"{finding}\n{record}\n<!-- nightly-run:12:1 -->"
        for body, expected in (
            (intact, "passes-now"),
            (intact.rsplit("\n", 1)[0], "not-replayable"),
            (intact.replace("12:1", "12:bad"), "not-replayable"),
            (finding, "not-replayable"),
        ):
            with self.subTest(body=body[:100]):
                def gh(*args, data=None):
                    if "/comments?" in args[-1]:
                        return json.dumps([[{"user": bot, "body": body},
                                            {"user": bot, "body": "Objective replay completed."}]])
                    return json.dumps([[{**issue, "comments": 2}]])

                fetched = rf.fetch_open_issues("owner/repo", gh)
                self.assertEqual(fetched[0]["sightings"], [body])
                commit = subprocess.check_output(["git", "rev-parse", "HEAD"], cwd=ROOT, text=True).strip()
                verdict = {"verdicts": [{"analysis": "linear", "invariant": "rotation", "pass": 1}]}
                partials = self.replay_cli(fetched, lambda *_: (verdict, None))
                self.assert_report_actions(fetched, partials, [expected], commit=commit)

    def test_false_reject_requires_acceptance_in_both_differential_adapters(self):
        sources = {"opensees": "testing/opensees/compare.py", "codeaster": "testing/differential/codeaster/run.py"}
        issues = [make_issue(number, check=source, kind="false_reject", test=f"{source}/false_reject",
                             model={"nodes": {}}) for number, source in enumerate(sources, 1)]
        for status, expected in (("refused", "not-replayable"), ("ok", "passes-now"), ("false_reject", "still-fails")):
            def runner(cmd, env=None, cwd=None, timeout=None):
                self.assertIn(cmd[1], sources.values())
                Path(cmd[cmd.index("--report") + 1]).write_text(json.dumps([{"status": status}]))
                return subprocess.CompletedProcess(cmd, 0)

            for jobs in (1, 2):
                with self.subTest(status=status, jobs=jobs):
                    partials = rf.replay_issues(issues, commit=REPLAY_COMMIT, jobs=jobs, solve_bin="/bin/solve", runner=runner)
                    _, calls = self.assert_report_actions(issues, partials, [expected, expected])
                    closes = [args[2] for args, _ in calls if args[:2] == ("issue", "close")]
                    self.assertEqual(closes, ["1", "2"] if status == "ok" else [])

    def test_verified_artifact_copy_survives_expired_reference_in_either_order(self):
        issue = make_issue(1, model={"nodes": {}})
        marker = self.record(42, {"nodes": {"exact": {}}})
        record, = json.loads(gzip.decompress(base64.b64decode(marker.split()[2])))
        artifact = record.pop("artifact")
        zip_data = io.BytesIO()
        with zipfile.ZipFile(zip_data, "w") as archive:
            archive.writestr("reproducer.finding.json", artifact)

        def reference(run_id):
            payload = base64.b64encode(gzip.compress(json.dumps([{**record, "runId": str(run_id)}]).encode())).decode()
            return f"<!-- nightly-reproducer:v1 {payload} -->"

        hint = "<!-- nightly-run:41275933376:1 -->"
        for overflow_run, primary_run in ((2, 1), (1, 2), (1, 1), (2, 2)):
            with self.subTest(overflow_run=overflow_run, primary_run=primary_run):
                body = (
                    "<!-- nightly-sightings:1:3:1 -->\nOne additional sighting.\n"
                    "<!-- nightly-overflow-complete -->\n" + reference(overflow_run) + "\n\n" +
                    self.with_inventory(issue["body"], reference(primary_run))
                )

                def gh(*args, data=None):
                    if args[:3] == ("api", "--paginate", "--slurp"):
                        return json.dumps([[{**issue, "body": body}]])
                    run_id = int(args[-1].split("/runs/")[1].split("/")[0])
                    return json.dumps({"artifacts": [{"name": "nightly-findings-metamorphic", "id": run_id,
                                                     "expired": run_id == 2, "size_in_bytes": len(zip_data.getvalue())}]})

                with patch.object(rf.subprocess, "run", return_value=subprocess.CompletedProcess([], 0, stdout=zip_data.getvalue())):
                    fetched = rf.fetch_open_issues("owner/repo", gh)
                seen = []

                def runner(cmd, env=None, cwd=None, timeout=None):
                    seen.append(json.loads(Path(env["NIGHTLY_MODEL"]).read_text()))
                    verdict = {"analysis": "linear", "invariant": "rotation", "pass": 1}
                    Path(env["NIGHTLY_RESULTS"]).write_text(json.dumps({"verdicts": [verdict]}))
                    return subprocess.CompletedProcess(cmd, 0)

                partials = rf.replay_issues(fetched, commit=REPLAY_COMMIT, jobs=2, metamorphic_bin="/bin/metamorphic", runner=runner)
                passes = 1 in (overflow_run, primary_run)
                expected = "passes-now" if passes else "not-replayable"
                self.assertEqual(seen, [{"nodes": {"exact": {}}}] * (2 if passes else 0))
                self.assertEqual([row["status"] for row in partials], [expected, expected])
                report = rf.merge_reports(fetched, [partials], REPLAY_COMMIT)
                self.assertEqual([row["status"] for row in report], [expected])

    def test_verified_copy_matches_exact_input_across_diagnostic_changes(self):
        issue = make_issue(1, model={"nodes": {}})
        model = {"nodes": {"exact": {"id": (1 << 53) + 1}}}
        compact = json.dumps(model, sort_keys=True, separators=(",", ":"))
        model_hash = hashlib.sha256(compact.encode()).hexdigest()
        original, = self.records(self.record(42, model))
        original.update(runId="1", modelHash=model_hash)
        original.pop("artifact")

        for reverse in (False, True):
            for change, expected in (
                ("diagnostics", "passes-now"), ("model", "not-replayable"), ("seed", "not-replayable"),
                ("test", "not-replayable"), ("wrong model hash", "not-replayable"),
                ("bad file digest", "not-replayable"), ("contradictory original", "not-replayable"),
            ):
                with self.subTest(reverse=reverse, change=change):
                    copy = {**original, "runId": "2"}
                    artifact = {"test": copy["test"], "seed": 42, "model": model, "details": "new diagnostics"}
                    if change == "model" or change == "wrong model hash":
                        artifact["model"] = {"nodes": {"different": {}}}
                    if change == "model":
                        copy["modelHash"] = hashlib.sha256(b'{"nodes":{"different":{}}}').hexdigest()
                    if change == "seed":
                        copy["seed"], artifact["seed"] = "43", 43
                    if change == "test":
                        copy["test"] = artifact["test"] = "metamorphic/linear/mirror"
                    raw = json.dumps(artifact).encode()
                    copy["artifactHash"] = hashlib.sha256(raw).hexdigest()
                    prior = original
                    if change == "contradictory original":
                        original_bytes = json.dumps({**artifact, "model": {"nodes": {"different": {}}}}).encode()
                        prior = {**prior, "artifactHash": hashlib.sha256(original_bytes).hexdigest()}
                    ordered = [copy, prior] if reverse else [prior, copy]
                    body = self.with_inventory(issue["body"], self.batch(ordered))

                    def gh(*args, data=None):
                        return json.dumps([[{**issue, "body": body}]])

                    def read(repo, run_id, name, member, *_):
                        if run_id == "1":
                            if change == "contradictory original":
                                return original_bytes
                            raise ValueError("expired")
                        return raw + (b" " if change == "bad file digest" else b"")

                    with patch.object(rf, "_read_artifact_member", side_effect=read):
                        fetched = rf.fetch_open_issues("owner/repo", gh)
                    verdict = {"verdicts": [{"analysis": "linear", "invariant": name, "pass": 1}
                                            for name in ("rotation", "mirror")]}
                    partials = self.replay_cli(fetched, lambda *_: (verdict, None))
                    commit = subprocess.check_output(["git", "rev-parse", "HEAD"], cwd=ROOT, text=True).strip()
                    self.assert_report_actions(fetched, partials, [expected], commit=commit)

    def test_chunked_manifests_require_every_committed_chunk_and_finding(self):
        issue = make_issue(1, model={"nodes": {}})
        files = {}
        chunks = []
        for seed in (42, 43):
            record, = self.records(self.record(seed, {"nodes": {str(seed): {}}}))
            artifact = record.pop("artifact").encode()
            member = f"{seed}.finding.json"
            record["path"] = f"nightly-findings/nightly-findings-metamorphic/{member}"
            files[member] = artifact
            chunk = json.dumps([record]).encode()
            digest = hashlib.sha256(chunk).hexdigest()
            chunks.append(digest)
            files[digest + ".json"] = chunk

        variants = ("valid", "missing chunk", "corrupt chunk", "corrupt index", "duplicate chunk", "bad finding")
        for variant in variants:
            with self.subTest(variant=variant):
                members = files.copy()
                index = json.dumps({"chunks": [chunks[0], chunks[0]] if variant == "duplicate chunk" else chunks}).encode()
                digest = hashlib.sha256(index).hexdigest()
                members[digest + ".json"] = index
                pointer = f"<!-- nightly-reproducer:v3 41275933376 1 {digest} -->"
                body = self.with_inventory(issue["body"], pointer)
                if variant == "missing chunk":
                    del members[chunks[1] + ".json"]
                if variant == "corrupt chunk":
                    members[chunks[1] + ".json"] += b" "
                if variant == "corrupt index":
                    members[digest + ".json"] += b" "
                if variant == "bad finding":
                    members["43.finding.json"] += b" "

                with patch.object(rf, "_read_artifact_member", side_effect=lambda repo, run, name, member, *_: members[member]):
                    fetched = rf.fetch_open_issues("owner/repo", lambda *_: json.dumps([[{**issue, "body": body}]]))
                verdict = {"verdicts": [{"analysis": "linear", "invariant": "rotation", "pass": 1}]}
                partials = self.replay_cli(fetched, lambda *_: (verdict, None))
                commit = subprocess.check_output(["git", "rev-parse", "HEAD"], cwd=ROOT, text=True).strip()
                expected = "passes-now" if variant == "valid" else "not-replayable"
                self.assert_report_actions(fetched, partials, [expected], commit=commit)
                if variant == "valid":
                    self.assertEqual(len(partials), 2)

    def test_manifest_and_original_bytes_must_both_verify_before_closure(self):
        issue = make_issue(1, model={"nodes": {}})
        record, = json.loads(gzip.decompress(base64.b64decode(self.record(42, {"nodes": {"exact": {}}}).split()[2])))
        artifact = record.pop("artifact").encode()
        manifest = json.dumps([record]).encode()
        digest = hashlib.sha256(manifest).hexdigest()
        pointer = f"<!-- nightly-reproducer:v2 41275933376 1 {digest} -->"
        issue["body"] = self.with_inventory(issue["body"], pointer)

        def zipped(member, content):
            data = io.BytesIO()
            with zipfile.ZipFile(data, "w") as archive:
                archive.writestr(member, content)
            return data.getvalue()

        for state in ("valid", "corrupt manifest", "missing manifest", "corrupt finding"):
            with self.subTest(state=state):
                manifest_zip = zipped(f"{digest}.json", manifest + (b" " if state == "corrupt manifest" else b""))
                finding_zip = zipped("reproducer.finding.json", artifact + (b" " if state == "corrupt finding" else b""))

                def gh(*args, data=None):
                    if args[:3] == ("api", "--paginate", "--slurp"):
                        return json.dumps([[issue]])
                    name = args[-1].split("?name=")[1]
                    manifest_request = name == "nightly-replay-manifests-1"
                    items = [] if manifest_request and state == "missing manifest" else [
                        {"name": name, "id": 1 if manifest_request else 2, "expired": False,
                         "size_in_bytes": len(manifest_zip if manifest_request else finding_zip)}]
                    return json.dumps({"artifacts": items})

                def download(cmd, **kwargs):
                    data = manifest_zip if cmd[-1].endswith("/1/zip") else finding_zip
                    return subprocess.CompletedProcess(cmd, 0, stdout=data)

                with patch.object(rf.subprocess, "run", side_effect=download):
                    fetched = rf.fetch_open_issues("owner/repo", gh)

                def runner(cmd, env=None, cwd=None, timeout=None):
                    self.assertEqual(json.loads(Path(env["NIGHTLY_MODEL"]).read_text()), {"nodes": {"exact": {}}})
                    verdict = {"analysis": "linear", "invariant": "rotation", "pass": 1}
                    Path(env["NIGHTLY_RESULTS"]).write_text(json.dumps({"verdicts": [verdict]}))
                    return subprocess.CompletedProcess(cmd, 0)

                partials = rf.replay_issues(fetched, commit=REPLAY_COMMIT, metamorphic_bin="/bin/metamorphic", runner=runner)
                expected = "passes-now" if state == "valid" else "not-replayable"
                _, calls = self.assert_report_actions(fetched, partials, [expected])
                closes = [args[2] for args, _ in calls if args[:2] == ("issue", "close")]
                self.assertEqual(closes, ["1"] if state == "valid" else [])

    def test_rounded_legacy_seed_cannot_close_but_safe_and_exact_seeds_are_replayed(self):
        model = {"nodes": {}}
        safe_seed = (1 << 53) - 1
        unsafe_seed = int(float((1 << 53) + 1))
        issues = [
            make_issue(1, seed=str(safe_seed), model=model),
            make_issue(2, seed=str(unsafe_seed), model=model),
        ]
        for number, seed in [(3, unsafe_seed), (4, (1 << 64) - 1)]:
            issue = make_issue(number, seed=str(seed), model=model)
            issue["body"] = self.with_inventory(issue["body"], self.record(seed, model))
            issues.append(issue)

        seen = []

        def runner(cmd, env=None, cwd=None, timeout=None):
            seen.append(env["METAMORPHIC_SEED"])
            verdict = {"analysis": "linear", "invariant": "rotation", "pass": 1}
            Path(env["NIGHTLY_RESULTS"]).write_text(json.dumps({"failures": [], "verdicts": [verdict]}))
            return type("Process", (), {"returncode": 0, "stderr": ""})()

        partials = rf.replay_issues(issues, commit=REPLAY_COMMIT, metamorphic_bin="/bin/metamorphic", runner=runner)
        self.assertEqual([entry["status"] for entry in partials], ["passes-now", "not-replayable", "passes-now", "passes-now"])
        self.assertEqual(seen, [str(safe_seed), str(unsafe_seed), str((1 << 64) - 1)])

        partials[1] = {**partials[0], "issue": 2}
        report, calls = self.assert_report_actions(issues, partials, ["passes-now", "not-replayable", "passes-now", "passes-now"])
        self.assertIn("legacy seed exceeds JavaScript's safe integer range", report[1]["evidence"])
        self.assertEqual([args[2] for args, _ in calls if args[0] == "issue"], ["1", "3", "4"])

    def test_replaced_overflow_reproducer_prevents_closure_of_passing_subset(self):
        original = make_issue(1, model={"nodes": {}})
        passing = {"issue": 1, "source": "metamorphic", "status": "passes-now", "evidence": "retained input passed"}
        report, calls = self.assert_report_actions([original], bind_partial_fixtures([original], [passing]), ["passes-now"])
        self.assertEqual([args[:3] for args, _ in calls if args[0] == "issue"], [("issue", "close", "1")])

        latest = self.record(12, {"nodes": {"retained": {}}})
        issue = {**original, "body": (
            "<!-- nightly-sightings:2:41275933377:1 -->\n"
            "2 additional sightings after the detailed comment limit.\n"
            f"{latest}\n\n{original['body']}"
        )}
        partials = bind_partial_fixtures([issue], [{**passing, "reproducer": index} for index in range(2)])
        report, calls = self.assert_report_actions([issue], partials, ["not-replayable"])
        self.assertIn("overflow reproducers are outstanding", report[0]["evidence"])
        self.assertEqual(calls, [])

        fingerprint = rf._replay_fingerprint(rf.parse_reproducers(issue))
        state = json.dumps({"night": "2026-11-24", "fingerprint": fingerprint, "streak": 2})
        issue["body"] = f"<!-- nightly-replay:v1 {state} -->\n{issue['body']}"
        _, calls = self.assert_report_actions([issue], partials, ["not-replayable"], scheduled=True)
        self.assertEqual(len(calls), 2)
        self.assertEqual(calls[1][0][:3], ("api", "--method", "PATCH"))
        patch_body = json.loads(calls[1][1])
        self.assertEqual(rf._replay_state(patch_body["body"])["streak"], 0)
        self.assertNotIn("state", patch_body)

        partials[1] = {**partials[1], "status": "still-fails", "evidence": "retained input still fails"}
        report, calls = self.assert_report_actions([issue], partials, ["still-fails"])
        self.assertEqual(calls[0][0][:3], ("issue", "comment", "1"))


    def test_retained_first_overflow_can_close_only_after_all_batches_pass(self):
        original = make_issue(1, model={"nodes": {}})
        latest = self.record(12, {"nodes": {"latest": {}}})
        sightings = [
            self.record(run, {"nodes": {str(run): {}}}) + f"\n<!-- nightly-run:{run}:1 -->"
            for run in range(1, 6)
        ]
        complete = "<!-- nightly-overflow-complete -->\n"
        header = "<!-- nightly-sightings:2:41275933377:1 -->\n2 additional sightings after the detailed comment limit.\n"
        issue = {**original, "body": header + complete + latest + "\n\n" + original["body"], "sightings": sightings}

        def runner(cmd, env=None, cwd=None, timeout=None):
            verdict = {"analysis": "linear", "invariant": "rotation", "pass": 1}
            Path(env["NIGHTLY_RESULTS"]).write_text(json.dumps({"failures": [], "verdicts": [verdict]}))
            return type("Process", (), {"returncode": 0, "stderr": ""})()

        partials = rf.replay_issues([issue], commit=REPLAY_COMMIT, metamorphic_bin="/bin/metamorphic", runner=runner)
        self.assertEqual(len(partials), 7)
        self.assertEqual([entry["status"] for entry in partials], ["passes-now"] * 7)
        _, calls = self.assert_report_actions([issue], partials, ["passes-now"])
        self.assertEqual([args[:3] for args, _ in calls if args[:2] == ("issue", "close")], [("issue", "close", "1")])

        fingerprint = rf._replay_fingerprint(rf.parse_reproducers(issue))
        state = json.dumps({"night": "2026-11-24", "fingerprint": fingerprint, "streak": 2})
        issue["body"] = f"<!-- nightly-replay:v1 {state} -->\n{issue['body']}"
        _, calls = self.assert_report_actions([issue], partials, ["passes-now"], scheduled=True)
        self.assertEqual([json.loads(data)["state"] for args, data in calls if args[:3] == ("api", "--method", "PATCH")], ["closed"])

        cases = [
            (issue, partials[:-1]),
            ({**issue, "body": issue["body"].replace(latest + "\n", "")},
             [{**entry, "reproducer": index} for index, entry in enumerate([partials[0], *partials[2:]])]),
            ({**issue, "body": issue["body"].replace(complete, "")}, partials),
        ]
        for incomplete, completed_replays in cases:
            with self.subTest(body=incomplete["body"][:200], replays=len(completed_replays)):
                _, calls = self.assert_report_actions([incomplete], completed_replays, ["not-replayable"])
                self.assertFalse(any(args[:2] == ("issue", "close") for args, _ in calls))

    def test_manual_report_checks_live_body_and_trusted_sightings_before_close(self):
        original = make_issue(1, model={"nodes": {}})
        sighting = make_issue(1, seed="7", model={"nodes": {"known": {}}})["body"].replace(
            "nightly-run:41275933376:", "nightly-run:2:")
        new_sighting = make_issue(1, seed="8", model={"nodes": {"new": {}}})["body"].replace(
            "nightly-run:41275933376:", "nightly-run:3:")
        issue = {**original, "sightings": [sighting]}
        partials = [
            {"issue": 1, "source": "metamorphic", "status": "passes-now", "evidence": "input passed", "reproducer": index}
            for index in range(2)
        ]
        partials = bind_partial_fixtures([issue], partials)
        cases = [
            ("new bot sighting", issue["body"], "open", [new_sighting], False),
            ("changed body", issue["body"] + "\nupdated", "open", [], False),
            ("already closed", issue["body"], "closed", [], False),
            ("snapshot matches", issue["body"], "open", [], True),
        ]
        for name, body, state, added, should_close in cases:
            with self.subTest(name=name):
                live_comments = [
                    {"user": {"login": "github-actions[bot]"}, "body": entry} for entry in [sighting, *added]
                ] + [{"user": {"login": "maintainer"}, "body": new_sighting}]
                _, calls = self.assert_report_actions(
                    [issue], partials, ["passes-now"],
                    live_issue={"state": state, "body": body, "comments": len(live_comments)},
                    live_comments=live_comments,
                )
                closes = [args for args, _ in calls if args[:2] == ("issue", "close")]
                self.assertEqual(bool(closes), should_close)
                if should_close:
                    self.assertEqual([args[0] for args, _ in calls], ["api", "api", "issue"])


    def replay_cli(self, issues, verdict):
        with tempfile.TemporaryDirectory() as tmp, patch.object(rf, "_run_metamorphic_model", side_effect=verdict):
            root = Path(tmp)
            issues_file = root / "issues.json"
            partial_file = root / "partial.json"
            issues_file.write_text(json.dumps(issues))
            self.assertEqual(rf.main(["replay", "--issues", str(issues_file), "--source", "metamorphic",
                                      "--metamorphic-bin", "/bin/metamorphic", "--output", str(partial_file)]), 0)
            return json.loads(partial_file.read_text())

    def test_changed_model_or_seed_cannot_inherit_a_partial_at_the_same_position(self):
        commit = subprocess.check_output(["git", "rev-parse", "HEAD"], cwd=ROOT, text=True).strip()

        def verdict(model, seed, *_):
            counts = {"fail": 1} if model["nodes"] or seed != 42 else {"pass": 1}
            return {"verdicts": [{"analysis": "linear", "invariant": "rotation", **counts}]}, None

        original = make_issue(1, seed="42", model={"nodes": {}})
        variants = {
            "seed": make_issue(1, seed="43", model={"nodes": {}}),
            "model": make_issue(1, seed="42", model={"nodes": {"n1": {}}}),
        }
        sighting = self.record(42, {"nodes": {}, "unchanged": True}) + "\n<!-- nightly-run:2:1 -->"
        for sightings in ([], [sighting]):
            snapshot = {**original, "sightings": sightings}
            partial = self.replay_cli([snapshot], verdict)
            self.assertEqual([row["status"] for row in partial], ["passes-now"] * (1 + len(sightings)))
            for name, variant in variants.items():
                with self.subTest(change=name, sightings=len(sightings)):
                    changed = {**variant, "sightings": sightings}
                    _, calls = self.assert_report_actions([changed], partial, ["not-replayable"], commit=commit)
                    self.assertEqual(calls, [])
                    current = self.replay_cli([changed], verdict)
                    self.assertEqual([row["status"] for row in current], ["still-fails"] + ["passes-now"] * len(sightings))
                    _, calls = self.assert_report_actions([changed], current, ["still-fails"], commit=commit)
                    self.assertEqual([args[:3] for args, _ in calls], [("issue", "comment", "1")])

            _, calls = self.assert_report_actions([snapshot], partial, ["passes-now"], commit=commit)
            self.assertEqual([args[:3] for args, _ in calls if args[:2] == ("issue", "close")], [("issue", "close", "1")])

    def test_report_requires_the_commit_actually_checked_out_by_the_worker(self):
        commit = subprocess.check_output(["git", "rev-parse", "HEAD"], cwd=ROOT, text=True).strip()
        other = ("1" if commit[0] == "0" else "0") + commit[1:]
        issue = make_issue(1, model={"nodes": {}})
        verdict = {"verdicts": [{"analysis": "linear", "invariant": "rotation", "pass": 1}]}
        with patch.dict(os.environ, {"GITHUB_SHA": other}):
            partial = self.replay_cli([issue], lambda *_: (verdict, None))
        _, calls = self.assert_report_actions([issue], partial, ["not-replayable"], commit=other)
        self.assertEqual(calls, [])

        fingerprint = rf._replay_fingerprint(rf.parse_reproducers(issue))
        state = json.dumps({"night": "2026-11-24", "fingerprint": fingerprint, "streak": 2})
        issue["body"] = f"<!-- nightly-replay:v1 {state} -->\n{issue['body']}"
        _, calls = self.assert_report_actions([issue], partial, ["not-replayable"], scheduled=True, commit=other)
        self.assertEqual([rf._replay_state(json.loads(data)["body"])["streak"]
                          for args, data in calls if args[:3] == ("api", "--method", "PATCH")], [0])
        self.assertFalse(any(args[:3] == ("api", "--method", "POST") for args, _ in calls))

        for missing in ({"commit"}, {"input_sha256"}, {"commit", "input_sha256"}):
            with self.subTest(missing=missing):
                incomplete = [{key: value for key, value in partial[0].items() if key not in missing}]
                _, calls = self.assert_report_actions([issue], incomplete, ["not-replayable"], commit=commit)
                self.assertEqual(calls, [])
        _, calls = self.assert_report_actions([issue], partial, ["passes-now"], commit=commit)
        self.assertEqual([args[:3] for args, _ in calls if args[:2] == ("issue", "close")], [("issue", "close", "1")])


if __name__ == "__main__":
    unittest.main()
