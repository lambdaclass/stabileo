import contextlib
import hashlib
import importlib.util
import io
import json
from pathlib import Path
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[2]
spec = importlib.util.spec_from_file_location("replay_findings", ROOT / "scripts" / "replay-findings.py")
rf = importlib.util.module_from_spec(spec)
spec.loader.exec_module(rf)


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
            if "tools/opensees/compare.py" in cmd:
                report_path = Path(cmd[cmd.index("--report") + 1])
                report_path.write_text(
                    json.dumps([{"name": "model.json", "status": "mismatch", "n_bad": 2, "max_err": {"disp": 3.1e-2}}])
                )
                return subprocess.CompletedProcess(cmd, 1, "", "")
            raise AssertionError(f"unexpected command: {cmd}")

        import subprocess

        report = rf.replay_issues(
            [passing_issue, failing_issue, placeholder_issue, refused_metamorphic_issue],
            metamorphic_bin="/bin/metamorphic",
            solve_bin="/bin/solve_json",
            opensees_python="/bin/python3",
            runner=fake_runner,
        )
        by_issue = {r["issue"]: r for r in report}
        self.assertEqual(set(by_issue[10].keys()), {"issue", "source", "status", "evidence"})
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
        rf.apply_issue_actions("o/r", actions, gh_runner=lambda *args, data=None: gh_calls.append((args, data)))
        self.assertEqual(len(gh_calls), 2)
        self.assertEqual(gh_calls[0][0][:4], ("issue", "close", "10", "--repo"))
        self.assertEqual(gh_calls[1][0][:4], ("issue", "comment", "20", "--repo"))

    def test_differential_and_fuzz_classification_rules(self):
        false_reject_spec = rf.parse_issue(
            make_issue(50, check="codeaster", kind="false_reject", test="codeaster/false_reject", model={"nodes": {}})
        )
        self.assertEqual(rf.classify_diff(false_reject_spec, {"status": "refused", "why": ["agreed"]})[0], "passes-now")
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
        import subprocess

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

        report = rf.replay_issues([crash_issue], source="fuzz", runner=infra_error_runner)
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
            partial_file.write_text(json.dumps(partial))

            calls = []
            orig_gh = rf.gh
            rf.gh = lambda *args, data=None: calls.append((args, data))
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
                        "--commit", "1234567",
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
                        "--commit", "1234567",
                        "--close-passing",
                    ])
                    self.assertEqual(rc, 0)
                    self.assertEqual(len(calls), 1)
                    self.assertEqual(calls[0][0][:4], ("issue", "close", "1", "--repo"))
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
            metamorphic_file.write_text(json.dumps(metamorphic_partial))

            calls = []
            orig_gh = rf.gh
            rf.gh = lambda *args, data=None: calls.append((args, data))
            with contextlib.redirect_stdout(io.StringIO()):
                try:
                    rc = rf.main([
                        "report",
                        "--issues", str(issues_file),
                        "--partials", str(metamorphic_file), str(missing_opensees_file),
                        "--output", str(out_file),
                        "--repo", "o/r",
                        "--run-url", "https://github.com/o/r/actions/runs/1",
                        "--commit", "1234567",
                        "--close-passing",
                    ])
                    self.assertEqual(rc, 0)
                    written = json.loads(out_file.read_text())
                    self.assertEqual(
                        [(r["issue"], r["status"]) for r in written],
                        [(1, "passes-now"), (2, "not-replayable")],
                    )
                    self.assertIn("no replay result recorded", written[1]["evidence"])
                    self.assertEqual(len(calls), 1)
                    self.assertEqual(calls[0][0][:4], ("issue", "close", "1", "--repo"))
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


if __name__ == "__main__":
    unittest.main()
