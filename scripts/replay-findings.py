import argparse
from concurrent.futures import ThreadPoolExecutor
import hashlib
import json
import os
from pathlib import Path
import re
import subprocess
import sys
import tempfile

LABEL = "nightly-finding"
PENDING_STATUS = "original failure; replay pending"
VALID_SOURCES = ("metamorphic", "opensees", "codeaster", "fuzz")
BAD_DIFF_STATUSES = frozenset({
    "mismatch",
    "converging",
    "false_reject",
    "false_warning",
    "silent_singular",
    "silent_unimposed",
})
OPENSEES_CHECKS = frozenset({"mismatch", "converging", "false_reject", "false_warning"})
CODEASTER_CHECKS = frozenset({"mismatch", "false_reject", "silent_singular", "silent_unimposed", "false_warning"})
FUZZ_TARGETS = frozenset({"json_static", "json_dynamics", "json_plastic", "model_certify"})
FUZZ_LIMITS = ("-rss_limit_mb=2048", "-timeout=60")
FUZZ_EXIT_CODES = frozenset({70, 71, 77})
FUZZ_FAILURE_MARKERS = (
    "summary: libfuzzer:",
    "error: libfuzzer:",
    "addresssanitizer",
    "undefinedbehaviorsanitizer",
    "memorysanitizer",
    "threadsanitizer",
    "leaksanitizer",
    "alarm: working on the last unit",
    "panicked at",
    "assertion failed",
)
FUZZ_INFRA_ERROR_MARKERS = (
    "could not compile",
    "failed to run custom build command",
    "failed to build fuzz target",
    "is not installed",
    "no such subcommand",
    "command not found",
    "no such file or directory",
    "permission denied",
    "unexpected argument",
    "usage: cargo",
    "failed to load manifest",
    "failed to parse manifest",
    "internal compiler error",
    "thread 'rustc' panicked",
)
NON_PASS_METAMORPHIC_KEYS = (
    "fail",
    "refused",
    "same_refusal",
    "inconclusive",
    "unrepresentable",
    "not_applicable",
)
MAX_U64 = (1 << 64) - 1
DEFAULT_TRIPLE = "x86_64-unknown-linux-gnu"
REPLAY_TIMEOUT_SECONDS = 90
FUZZ_TIMEOUT_SECONDS = 180

MARKER_RE = re.compile(r"<!--\s*nightly-finding:([0-9a-f]{64})\s*-->")
CHECK_RE = re.compile(r"Check:\s*\*\*([^*]+)\*\*")
KIND_RE = re.compile(r"kind:\s*\*\*([^*]+)\*\*")
ROOT_CAUSE_RE = re.compile(r"^Root cause:\s*(.+)$", re.M)
TEST_RE = re.compile(r"Test:\s*\*\*([^*]+)\*\*")
SEED_RE = re.compile(r"Seed:\s*`([^`]+)`")
REDUCTION_RE = re.compile(r"^Reduction:\s*(.+)$", re.M)
MODEL_RE = re.compile(r"Save as model\.json:\s+```json\n([\s\S]*?)\n```")
DETAILS_RE = re.compile(r"Details:\s+```text\n([\s\S]*?)\n```")


def _match(pattern, text):
    m = pattern.search(text)
    return m.group(1).strip() if m else ""


def parse_issue(issue):
    number = int(issue["number"])
    body = issue.get("body") or ""
    marker = _match(MARKER_RE, body)
    check = _match(CHECK_RE, body)
    kind = _match(KIND_RE, body)
    root_cause = _match(ROOT_CAUSE_RE, body)
    test = _match(TEST_RE, body)
    seed_raw = _match(SEED_RE, body)
    reduction = _match(REDUCTION_RE, body)
    details = _match(DETAILS_RE, body)
    model_raw = _match(MODEL_RE, body)

    prefix = test.split("/", 1)[0] if "/" in test else ""
    if check in VALID_SOURCES or check == "properties":
        source = check
    elif prefix in VALID_SOURCES or prefix == "properties":
        source = prefix
    else:
        source = check or prefix or "unknown"

    seed = None
    seed_error = None
    if seed_raw:
        if seed_raw.isascii() and seed_raw.isdigit():
            parsed_seed = int(seed_raw)
            if 0 <= parsed_seed <= MAX_U64:
                seed = parsed_seed
            else:
                seed_error = f"invalid seed '{seed_raw}' (out of u64 range)"
        else:
            seed_error = f"invalid seed '{seed_raw}'"

    model = None
    model_error = None
    if model_raw:
        try:
            model = json.loads(model_raw)
        except json.JSONDecodeError as ex:
            model_error = f"invalid model.json ({ex.msg})"

    spec = {
        "issue": number,
        "title": issue.get("title") or "",
        "marker": marker,
        "source": source,
        "check": check,
        "kind": kind,
        "root_cause": root_cause,
        "test": test,
        "seed": seed,
        "reduction": reduction,
        "details": details,
        "model": model,
        "replayable": False,
        "not_replayable_reason": None,
    }

    label = test or source or f"issue #{number}"
    if not marker:
        spec["not_replayable_reason"] = f"{label}: missing nightly-finding marker"
        return spec

    if (
        test.endswith("/dumped_failure")
        or kind == PENDING_STATUS
        or PENDING_STATUS in root_cause
        or PENDING_STATUS in details
    ):
        spec["not_replayable_reason"] = f"{label}: {PENDING_STATUS} (unclassified dump placeholder)"
        return spec

    if source == "properties":
        spec["not_replayable_reason"] = (
            f"{label}: property findings have no embedded model and PROPTEST_RNG_SEED is not replayable"
        )
        return spec

    if source not in VALID_SOURCES:
        spec["not_replayable_reason"] = f"{label}: unsupported finding source '{source}'"
        return spec

    if model is None:
        reason = model_error or "no inline model.json in issue body"
        spec["not_replayable_reason"] = f"{label}: {reason}"
        return spec

    if not isinstance(model, dict):
        spec["not_replayable_reason"] = f"{label}: model.json is not a JSON object"
        return spec

    if source == "metamorphic":
        parts = test.split("/", 2)
        if len(parts) != 3 or parts[0] != "metamorphic" or not parts[1] or not parts[2]:
            spec["not_replayable_reason"] = f"{label}: expected metamorphic/<analysis>/<invariant> test identifier"
            return spec
        if seed is None:
            reason = seed_error or "missing metamorphic seed in issue body"
            spec["not_replayable_reason"] = f"{label}: {reason}"
            return spec
        spec["analysis"] = parts[1]
        spec["invariant"] = parts[2]
        spec["replayable"] = True
        return spec

    if source in ("opensees", "codeaster"):
        parts = test.split("/", 1)
        valid_checks = OPENSEES_CHECKS if source == "opensees" else CODEASTER_CHECKS
        if len(parts) != 2 or parts[0] != source or parts[1] not in valid_checks:
            spec["not_replayable_reason"] = f"{label}: unsupported {source} check '{test}'"
            return spec
        spec["check_kind"] = parts[1]
        spec["replayable"] = True
        return spec

    parts = test.split("/", 1)
    if len(parts) != 2 or parts[0] != "fuzz" or parts[1] not in FUZZ_TARGETS:
        spec["not_replayable_reason"] = f"{label}: unsupported fuzz target '{test}'"
        return spec
    raw_hex = model.get("raw_hex")
    if not isinstance(raw_hex, str):
        spec["not_replayable_reason"] = f"{label}: fuzz model.json has no raw_hex"
        return spec
    try:
        bytes.fromhex(raw_hex)
    except ValueError:
        spec["not_replayable_reason"] = f"{label}: fuzz model.json raw_hex is not valid hex"
        return spec

    artifact = root_cause or details.strip().strip('"')
    spec["target"] = parts[1]
    spec["artifact"] = artifact
    if artifact.startswith("slow-unit-") or "slow-unit-" in details:
        spec["not_replayable_reason"] = (
            f"{label} ({artifact}): libFuzzer slow-unit diagnostic (>10s), not a standalone failure"
        )
        return spec

    spec["standalone_reproducer"] = not (
        artifact.startswith("oom-") and "tmin" not in reduction
    )
    spec["replayable"] = True
    return spec


def classify_metamorphic(spec, replay_results):
    test = spec["test"]
    if not isinstance(replay_results, dict):
        return "not-replayable", f"{test}: metamorphic replay produced no results JSON"

    failures = [
        detail
        for entry in (replay_results.get("failures") or [])
        if entry.get("test") == test
        for detail in (entry.get("details") or [])
    ]
    verdict = next(
        (
            v
            for v in (replay_results.get("verdicts") or [])
            if f"metamorphic/{v.get('analysis')}/{v.get('invariant')}" == test
        ),
        None,
    )

    if failures or (verdict and verdict.get("fail", 0) > 0):
        detail_text = "\n".join(failures) if failures else json.dumps(verdict, sort_keys=True)
        return "still-fails", f"{test}: {detail_text}"

    if verdict and isinstance(verdict.get("pass"), int) and not isinstance(verdict.get("pass"), bool) and verdict["pass"] > 0:
        other_counts = {
            k: v
            for k, v in verdict.items()
            if k not in ("analysis", "invariant", "pass")
        }
        has_non_passing = any(
            not isinstance(verdict.get(k, 0), int)
            or isinstance(verdict.get(k, 0), bool)
            or verdict.get(k, 0) != 0
            for k in NON_PASS_METAMORPHIC_KEYS
        ) or any(
            not isinstance(v, int) or isinstance(v, bool) or v != 0
            for v in other_counts.values()
        )
        if not has_non_passing:
            return "passes-now", f"{test}: pass={verdict['pass']} fail=0 ({json.dumps(verdict, sort_keys=True)})"
        summary = json.dumps(verdict, sort_keys=True)
        return "not-replayable", f"{test}: mixed metamorphic verdict ({summary})"

    summary = json.dumps(verdict, sort_keys=True) if verdict else "cell not recorded"
    return "not-replayable", f"{test}: check did not run to pass/fail ({summary})"


def classify_diff(spec, row):
    test = spec["test"]
    check_kind = spec["check_kind"]
    if not isinstance(row, dict) or "status" not in row:
        return "not-replayable", f"{test}: differential harness produced no report row"

    row_status = row["status"]
    compact = {k: v for k, v in row.items() if k != "name"}
    serialized = json.dumps(compact, sort_keys=True, default=str)

    if row_status in BAD_DIFF_STATUSES:
        return "still-fails", f"{test}: status={row_status} ({serialized})"

    if check_kind == "false_reject":
        passing = {"ok", "refused"}
    elif check_kind == "silent_singular":
        passing = {"ok", "near_singular", "warned_singular", "refused"}
    else:
        passing = {"ok"}

    if row_status in passing:
        return "passes-now", f"{test}: status={row_status} ({serialized})"

    return "not-replayable", f"{test}: replay status '{row_status}' did not complete check ({serialized})"


def _is_fuzz_target_failure(returncode, stderr):
    lowered = (stderr or "").lower()
    if any(marker in lowered for marker in FUZZ_INFRA_ERROR_MARKERS):
        return False
    if returncode in FUZZ_EXIT_CODES:
        return True
    return any(marker in lowered for marker in FUZZ_FAILURE_MARKERS)


def classify_fuzz(spec, returncode, stderr="", timed_out=False):
    test = spec["test"]
    cause = spec.get("artifact") or spec.get("root_cause") or "artifact"
    if timed_out:
        return "not-replayable", f"{test} ({cause}): fuzz runner timed out before target failure was reproduced"
    if returncode != 0:
        tail = (stderr or "").strip()[-1000:]
        if not _is_fuzz_target_failure(returncode, stderr):
            evidence = (
                f"{test} ({cause}): fuzz runner failed without reproducing target failure (returncode={returncode})"
                + (f"\n{tail}" if tail else "")
            )
            return "not-replayable", evidence
        evidence = f"{test} ({cause}): returncode={returncode}" + (f"\n{tail}" if tail else "")
        return "still-fails", evidence
    if not spec.get("standalone_reproducer", True):
        return (
            "not-replayable",
            f"{test} ({cause}): exited 0 when run alone; original OOM was not reduced to a standalone single-input reproducer",
        )
    return "passes-now", f"{test} ({cause}): returncode=0"


def _report_entry(spec, status, evidence):
    return {
        "issue": spec["issue"],
        "source": spec["source"],
        "status": status,
        "evidence": evidence,
    }


def _default_solve_bin():
    target = os.environ.get("CARGO_TARGET_DIR", "target")
    return str(Path(target) / "release" / "examples" / "solve_json")


def _run_metamorphic_model(model, seed, metamorphic_bin, runner):
    if isinstance(seed, bool) or not isinstance(seed, int) or not (0 <= seed <= MAX_U64):
        return None, "missing or invalid metamorphic seed"
    with tempfile.TemporaryDirectory() as tmp:
        model_path = Path(tmp) / "model.json"
        results_path = Path(tmp) / "results.json"
        model_path.write_text(json.dumps(model))
        env = dict(
            os.environ,
            NIGHTLY_MODEL=str(model_path),
            NIGHTLY_RESULTS=str(results_path),
            METAMORPHIC_SEED=str(seed),
        )
        try:
            proc = runner(
                [metamorphic_bin, "--ignored", "--exact", "metamorphic_replay", "--nocapture"],
                env=env,
                timeout=REPLAY_TIMEOUT_SECONDS,
            )
        except subprocess.TimeoutExpired:
            return None, "metamorphic_replay timed out"
        except OSError as ex:
            return None, f"metamorphic_replay failed to start ({ex})"
        if results_path.exists():
            try:
                data = json.loads(results_path.read_text())
            except json.JSONDecodeError as ex:
                return None, f"invalid NIGHTLY_RESULTS JSON ({ex.msg})"
            if proc.returncode not in (0, 101):
                return None, f"metamorphic_replay exited with unexpected code {proc.returncode}"
            if proc.returncode != 0 and not (isinstance(data, dict) and data.get("failures")):
                return None, f"metamorphic_replay exited {proc.returncode} without recorded failures"
            return data, None
        tail = ((proc.stderr or "") + "\n" + (proc.stdout or "")).strip()[-500:]
        return None, f"metamorphic_replay exited {proc.returncode} without NIGHTLY_RESULTS" + (f": {tail}" if tail else "")


def _run_diff_model(source, model, solve_bin, python_bin, runner):
    script = "tools/opensees/compare.py" if source == "opensees" else "tools/differential/codeaster/run.py"
    with tempfile.TemporaryDirectory() as tmp:
        model_path = Path(tmp) / "model.json"
        report_path = Path(tmp) / "report.json"
        model_path.write_text(json.dumps(model))
        env = dict(os.environ)
        if source == "codeaster":
            env["ASTER_PYTHON"] = python_bin
        try:
            proc = runner(
                [python_bin, script, str(model_path), "--bin", solve_bin, "-j", "1", "--report", str(report_path)],
                env=env,
                timeout=REPLAY_TIMEOUT_SECONDS,
            )
        except subprocess.TimeoutExpired:
            return None, f"{source} replay timed out"
        except OSError as ex:
            return None, f"{source} replay failed to start ({ex})"
        if proc.returncode not in (0, 1):
            tail = ((proc.stderr or "") + "\n" + (proc.stdout or "")).strip()[-500:]
            return None, f"{source} replay exited with unexpected code {proc.returncode}" + (f": {tail}" if tail else "")
        if report_path.exists():
            try:
                rows = json.loads(report_path.read_text())
                if isinstance(rows, list) and rows:
                    return rows[0], None
            except json.JSONDecodeError as ex:
                return None, f"invalid {source} report JSON ({ex.msg})"
        tail = ((proc.stderr or "") + "\n" + (proc.stdout or "")).strip()[-500:]
        return None, f"{source} replay exited {proc.returncode} without report" + (f": {tail}" if tail else "")


def _run_fuzz_model(spec, triple, runner):
    with tempfile.TemporaryDirectory() as tmp:
        crash_path = Path(tmp) / "crash.bin"
        crash_path.write_bytes(bytes.fromhex(spec["model"]["raw_hex"]))
        cmd = [
            "cargo",
            "+nightly-2026-10-15",
            "fuzz",
            "run",
            "--target",
            triple,
            spec["target"],
            str(crash_path),
            "--",
            *FUZZ_LIMITS,
        ]
        try:
            proc = runner(cmd, cwd="engine", env=dict(os.environ), timeout=FUZZ_TIMEOUT_SECONDS)
        except subprocess.TimeoutExpired:
            return classify_fuzz(spec, 124, timed_out=True)
        except OSError as ex:
            test = spec["test"]
            cause = spec.get("artifact") or spec.get("root_cause") or "artifact"
            return "not-replayable", f"{test} ({cause}): fuzz runner failed to start ({ex})"
        combined = "\n".join(part for part in (proc.stderr, proc.stdout) if part)
        return classify_fuzz(spec, proc.returncode, stderr=combined)


def default_runner(cmd, env=None, cwd=None, timeout=REPLAY_TIMEOUT_SECONDS):
    return subprocess.run(cmd, env=env, cwd=cwd, timeout=timeout, capture_output=True, text=True)


def replay_issue(
    spec,
    metamorphic_bin=None,
    solve_bin=None,
    opensees_python=None,
    aster_python=None,
    fuzz_triple=DEFAULT_TRIPLE,
    runner=default_runner,
    metamorphic_cache=None,
):
    if not spec.get("replayable"):
        return _report_entry(spec, "not-replayable", spec.get("not_replayable_reason") or "not replayable")

    source = spec["source"]
    if source == "metamorphic":
        bin_path = metamorphic_bin or os.environ.get("NIGHTLY_REPLAY_BIN")
        if not bin_path:
            return _report_entry(spec, "not-replayable", f"{spec['test']}: NIGHTLY_REPLAY_BIN not configured")
        key = (
            spec["seed"],
            hashlib.sha256(json.dumps(spec["model"], sort_keys=True).encode()).hexdigest(),
        )
        if metamorphic_cache is not None and key in metamorphic_cache:
            results, err = metamorphic_cache[key]
        else:
            results, err = _run_metamorphic_model(spec["model"], spec["seed"], bin_path, runner)
            if metamorphic_cache is not None:
                metamorphic_cache[key] = (results, err)
        if err:
            return _report_entry(spec, "not-replayable", f"{spec['test']}: {err}")
        status, evidence = classify_metamorphic(spec, results)
        return _report_entry(spec, status, evidence)

    if source in ("opensees", "codeaster"):
        sbin = solve_bin or _default_solve_bin()
        py = (
            (opensees_python or sys.executable)
            if source == "opensees"
            else (aster_python or os.environ.get("ASTER_PYTHON") or sys.executable)
        )
        row, err = _run_diff_model(source, spec["model"], sbin, py, runner)
        if err:
            return _report_entry(spec, "not-replayable", f"{spec['test']}: {err}")
        status, evidence = classify_diff(spec, row)
        return _report_entry(spec, status, evidence)

    if source == "fuzz":
        status, evidence = _run_fuzz_model(spec, fuzz_triple, runner)
        return _report_entry(spec, status, evidence)

    return _report_entry(spec, "not-replayable", f"{spec['test']}: unsupported source '{source}'")


def filter_specs_for_source(specs, source):
    if not source or source == "all":
        return specs
    if source == "other":
        return [s for s in specs if s["source"] not in VALID_SOURCES]
    return [s for s in specs if s["source"] == source]


def replay_issues(
    issues,
    source="all",
    jobs=1,
    metamorphic_bin=None,
    solve_bin=None,
    opensees_python=None,
    aster_python=None,
    fuzz_triple=DEFAULT_TRIPLE,
    runner=default_runner,
):
    specs = [parse_issue(i) for i in sorted(issues, key=lambda x: int(x["number"]))]
    selected = filter_specs_for_source(specs, source)
    cache = {} if jobs == 1 else None

    def one(spec):
        return replay_issue(
            spec,
            metamorphic_bin=metamorphic_bin,
            solve_bin=solve_bin,
            opensees_python=opensees_python,
            aster_python=aster_python,
            fuzz_triple=fuzz_triple,
            runner=runner,
            metamorphic_cache=cache,
        )

    if jobs <= 1 or len(selected) <= 1:
        results = [one(s) for s in selected]
    else:
        with ThreadPoolExecutor(max_workers=jobs) as pool:
            results = list(pool.map(one, selected))
    return sorted(results, key=lambda r: r["issue"])


def merge_reports(issues, partial_lists):
    by_issue = {}
    for entries in partial_lists:
        for entry in entries:
            by_issue[int(entry["issue"])] = {
                "issue": int(entry["issue"]),
                "source": entry["source"],
                "status": entry["status"],
                "evidence": entry["evidence"],
            }
    merged = []
    for issue in sorted(issues, key=lambda x: int(x["number"])):
        num = int(issue["number"])
        if num in by_issue:
            merged.append(by_issue[num])
        else:
            spec = parse_issue(issue)
            reason = spec.get("not_replayable_reason") or f"{spec['test'] or spec['source']}: no replay result recorded"
            merged.append(_report_entry(spec, "not-replayable", reason))
    return merged


def plan_issue_actions(report, close_passing, run_url, commit_sha):
    if not close_passing:
        return []
    actions = []
    for entry in sorted(report, key=lambda r: int(r["issue"])):
        status = entry["status"]
        issue_num = int(entry["issue"])
        evidence = str(entry.get("evidence") or "").strip()[:6000]
        if status == "passes-now":
            body = (
                f"Objective replay on commit `{commit_sha}` ([workflow run]({run_url})) "
                f"ran the original finding's check and it passed (`passes-now`). Closing.\n\n"
                f"```text\n{evidence}\n```"
            )
            actions.append({"action": "close", "issue": issue_num, "body": body})
        elif status == "still-fails":
            body = (
                f"Objective replay on commit `{commit_sha}` ([workflow run]({run_url})) "
                f"still fails (`still-fails`):\n\n"
                f"```text\n{evidence}\n```"
            )
            actions.append({"action": "comment", "issue": issue_num, "body": body})
    return actions


def gh(*args, data=None):
    proc = subprocess.run(["gh", *args], capture_output=True, text=True, input=data)
    if proc.returncode != 0:
        raise RuntimeError(f"gh {' '.join(args)} failed: {proc.stderr.strip()}")
    return proc.stdout


def fetch_open_issues(repo, gh_runner=None):
    run_gh = gh_runner or gh
    pages = json.loads(
        run_gh("api", "--paginate", "--slurp", f"repos/{repo}/issues?labels={LABEL}&state=open&per_page=100")
    )
    issues = [
        {"number": i["number"], "title": i.get("title") or "", "body": i.get("body") or ""}
        for page in pages
        for i in page
        if "pull_request" not in i
    ]
    return sorted(issues, key=lambda i: i["number"])


def apply_issue_actions(repo, actions, gh_runner=None):
    run_gh = gh_runner or gh
    for action in actions:
        if action["action"] == "close":
            run_gh("issue", "close", str(action["issue"]), "--repo", repo, "--comment", action["body"])
        elif action["action"] == "comment":
            run_gh("issue", "comment", str(action["issue"]), "--repo", repo, "--body-file", "-", data=action["body"])


def format_summary(report):
    counts = {"passes-now": 0, "still-fails": 0, "not-replayable": 0}
    by_source = {}
    for row in report:
        st = row["status"]
        src = row["source"]
        counts[st] = counts.get(st, 0) + 1
        by_source.setdefault(src, {"passes-now": 0, "still-fails": 0, "not-replayable": 0})
        by_source[src][st] = by_source[src].get(st, 0) + 1
    lines = [
        "## Nightly findings objective replay",
        "",
        f"Total open issues: **{len(report)}** (`passes-now`: **{counts['passes-now']}**, "
        f"`still-fails`: **{counts['still-fails']}**, `not-replayable`: **{counts['not-replayable']}**)",
        "",
        "| Source | passes-now | still-fails | not-replayable | Total |",
        "|---|---:|---:|---:|---:|",
    ]
    for src, c in sorted(by_source.items()):
        total = c["passes-now"] + c["still-fails"] + c["not-replayable"]
        lines.append(f"| `{src}` | {c['passes-now']} | {c['still-fails']} | {c['not-replayable']} | {total} |")
    return "\n".join(lines) + "\n"


def main(argv=None):
    parser = argparse.ArgumentParser()
    sub = parser.add_subparsers(dest="cmd", required=True)

    p_fetch = sub.add_parser("fetch")
    p_fetch.add_argument("--repo", default=os.environ.get("GITHUB_REPOSITORY", ""))
    p_fetch.add_argument("--output", required=True)

    p_replay = sub.add_parser("replay")
    p_replay.add_argument("--issues", required=True)
    p_replay.add_argument("--source", default="all")
    p_replay.add_argument("--jobs", type=int, default=1)
    p_replay.add_argument("--metamorphic-bin")
    p_replay.add_argument("--solve-bin")
    p_replay.add_argument("--opensees-python")
    p_replay.add_argument("--aster-python")
    p_replay.add_argument("--fuzz-triple", default=DEFAULT_TRIPLE)
    p_replay.add_argument("--output", required=True)

    p_report = sub.add_parser("report")
    p_report.add_argument("--issues", required=True)
    p_report.add_argument("--partials", nargs="*", default=[])
    p_report.add_argument("--output", required=True)
    p_report.add_argument("--summary")
    p_report.add_argument("--close-passing", action="store_true")
    p_report.add_argument("--repo", default=os.environ.get("GITHUB_REPOSITORY", ""))
    p_report.add_argument("--run-url", default="")
    p_report.add_argument("--commit", default=os.environ.get("GITHUB_SHA", ""))

    args = parser.parse_args(argv)
    if args.cmd == "fetch":
        issues = fetch_open_issues(args.repo)
        Path(args.output).write_text(json.dumps(issues, indent=2) + "\n")
        return 0

    if args.cmd == "replay":
        issues = json.loads(Path(args.issues).read_text())
        report = replay_issues(
            issues,
            source=args.source,
            jobs=args.jobs,
            metamorphic_bin=args.metamorphic_bin,
            solve_bin=args.solve_bin,
            opensees_python=args.opensees_python,
            aster_python=args.aster_python,
            fuzz_triple=args.fuzz_triple,
        )
        Path(args.output).write_text(json.dumps(report, indent=2) + "\n")
        return 0

    issues = json.loads(Path(args.issues).read_text())
    partial_lists = [json.loads(Path(p).read_text()) for p in args.partials if Path(p).exists()]
    report = merge_reports(issues, partial_lists)
    Path(args.output).write_text(json.dumps(report, indent=2) + "\n")
    summary = format_summary(report)
    print(summary, end="")
    if args.summary:
        with open(args.summary, "a") as fh:
            fh.write(summary)
    actions = plan_issue_actions(report, args.close_passing, args.run_url, args.commit)
    if actions:
        apply_issue_actions(args.repo, actions)
    return 0


if __name__ == "__main__":
    sys.exit(main())
