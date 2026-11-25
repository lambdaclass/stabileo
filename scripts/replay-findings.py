import argparse
import base64
import binascii
from concurrent.futures import ThreadPoolExecutor
from datetime import date, timedelta
import gzip
import hashlib
import io
import json
import os
from pathlib import Path
import re
import subprocess
import sys
import tempfile
import zipfile
import zlib

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

REPRODUCER_PREFIX = "<!-- nightly-reproducer:"
REPRODUCER_RE = re.compile(r"^<!-- nightly-reproducer:v1 ([A-Za-z0-9+/=]+) -->$", re.M)
RUN_RE = re.compile(r"^<!-- nightly-run:(\d+):\d+ -->$", re.M)
SIGHTINGS_RE = re.compile(r"^<!-- nightly-sightings:\d+:(\d+):\d+ -->$", re.M)
REPLAY_STATE_RE = re.compile(r"^<!-- nightly-replay:v1 (\{[^\n]*\}) -->\n?", re.M)
ARTIFACT_PATH_RE = re.compile(r"nightly-findings/(nightly-findings-[\w.-]+)/([\w./-]+\.finding\.json)", re.ASCII)
MAX_RECORD_BYTES = 4_000_000
MAX_ARTIFACT_BYTES = 64_000_000


def _match(pattern, text):
    m = pattern.search(text)
    return m.group(1).strip() if m else ""


def parse_issue(issue, record=None):
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

    if record is not None:
        test = record["test"]
        check = test.split("/", 1)[0]
        kind = record["kind"]
        root_cause = record["message"]
        seed_raw = record["seed"]
        reduction = record["reduction"]

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
    if record is not None:
        model = record.get("model")
        model_error = record.get("error") or f"model unavailable at {record.get('path', 'unknown path')}"
    elif model_raw:
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
    if not marker and record is None:
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


def finding_bodies(issue):
    return [issue.get("body") or "", *(issue.get("sightings") or [])]


def _decode_reproducers(body):
    markers = list(REPRODUCER_RE.finditer(body))
    if not markers and REPRODUCER_PREFIX not in body:
        return None
    records = []
    for marker in markers:
        with gzip.GzipFile(fileobj=io.BytesIO(base64.b64decode(marker[1], validate=True))) as compressed:
            content = compressed.read(MAX_RECORD_BYTES + 1)
        if len(content) > MAX_RECORD_BYTES:
            raise ValueError("reproducer block exceeds replay size limit")
        batch = json.loads(content)
        keys = ("test", "seed", "kind", "message", "reduction", "path", "runId", "artifactHash")
        if not isinstance(batch, list) or not batch or not all(
            isinstance(record, dict) and all(isinstance(record.get(key), str) for key in keys)
            for record in batch
        ):
            raise ValueError("invalid reproducer records")
        for record in batch:
            if "artifact" in record:
                try:
                    record.update(_model_from_artifact(record, record.pop("artifact").encode()))
                except (AttributeError, ValueError, KeyError) as error:
                    record["error"] = str(error)
        records.extend(batch)
    if len(markers) != body.count(REPRODUCER_PREFIX):
        raise ValueError("invalid or unsupported reproducer block")
    return records


def parse_reproducers(issue):
    specs = []
    resolved = issue.get("resolved_models", {})
    for index, body in enumerate(finding_bodies(issue)):
        try:
            records = _decode_reproducers(body)
        except (ValueError, EOFError, OSError, binascii.Error, zlib.error) as error:
            spec = parse_issue({**issue, "body": body})
            specs.append({**spec, "replayable": False, "not_replayable_reason": str(error)})
            continue
        if records is None or (index == 0 and not _body_has_primary_record(body)):
            specs.append(parse_issue({**issue, "body": body}))
        for record in records or []:
            if "model" not in record and record["artifactHash"] in resolved:
                record = {**record, **resolved[record["artifactHash"]]}
            specs.append(parse_issue({**issue, "body": body}, record))
    return specs or [parse_issue(issue)]


def _body_has_primary_record(body):
    lines = body.splitlines()
    return any(REPRODUCER_RE.fullmatch(line) and RUN_RE.fullmatch(following)
               for line, following in zip(lines, lines[1:]))


def _replay_fingerprint(specs):
    return hashlib.sha256(json.dumps(specs, sort_keys=True).encode()).hexdigest()


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

    if row_status == "refused" and spec.get("kind") in {"wrong-result-candidate", "silent_singular", "silent_unimposed"}:
        return "not-replayable", f"{test}: main refused the wrong-result reproducer ({serialized})"

    if check_kind == "false_reject":
        passing = {"ok", "refused"}
    elif check_kind == "silent_singular":
        passing = {"ok", "near_singular", "warned_singular"}
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
    script = "testing/opensees/compare.py" if source == "opensees" else "testing/differential/codeaster/run.py"
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
            "--fuzz-dir",
            "../testing/fuzz",
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
    specs = []
    for issue in sorted(issues, key=lambda x: int(x["number"])):
        reproducers = parse_reproducers(issue)
        for index, spec in enumerate(reproducers):
            if len(reproducers) > 1:
                spec["reproducer"] = index
            specs.append(spec)
    selected = filter_specs_for_source(specs, source)
    cache = {} if jobs == 1 else None

    def one(spec):
        result = replay_issue(
            spec,
            metamorphic_bin=metamorphic_bin,
            solve_bin=solve_bin,
            opensees_python=opensees_python,
            aster_python=aster_python,
            fuzz_triple=fuzz_triple,
            runner=runner,
            metamorphic_cache=cache,
        )
        if "reproducer" in spec:
            result["reproducer"] = spec["reproducer"]
        return result

    if jobs <= 1 or len(selected) <= 1:
        results = [one(s) for s in selected]
    else:
        with ThreadPoolExecutor(max_workers=jobs) as pool:
            results = list(pool.map(one, selected))
    return sorted(results, key=lambda r: r["issue"])


def merge_reports(issues, partial_lists):
    reports = {}
    for entries in partial_lists:
        for entry in entries:
            reports.setdefault((int(entry["issue"]), entry.get("reproducer")), []).append(entry)
    merged = []
    for issue in sorted(issues, key=lambda x: int(x["number"])):
        specs = parse_reproducers(issue)
        entries = []
        for index, spec in enumerate(specs):
            matches = reports.get((spec["issue"], index if len(specs) > 1 else None), [])
            if (len(matches) == 1 and matches[0]["source"] == spec["source"]
                    and (spec["replayable"] or matches[0]["status"] != "passes-now")):
                entries.append(matches[0])
            else:
                reason = spec.get("not_replayable_reason") or f"{spec['test'] or spec['source']}: no replay result recorded"
                entries.append(_report_entry(spec, "not-replayable", reason))
        if len(entries) == 1:
            merged.append(entries[0])
            continue
        statuses = {entry["status"] for entry in entries}
        status = "still-fails" if "still-fails" in statuses else (
            "passes-now" if statuses == {"passes-now"} else "not-replayable"
        )
        evidence = "\n".join(f"{entry['status']}: {entry['evidence']}" for entry in entries)
        merged.append(_report_entry(specs[0], status, evidence))
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


def advance_nightly_replay(state, night, fingerprint, status):
    today = date.fromisoformat(night)
    previous = state.get("night", "")
    if previous > night:
        return state, False
    passes = status == "passes-now"
    same_reproducers = state.get("fingerprint") == fingerprint
    previous_streak = state.get("streak", 0)
    if previous == night and same_reproducers and (previous_streak > 0) == passes:
        return state, previous_streak >= 3
    streak = int(passes)
    if passes and same_reproducers and previous == (today - timedelta(days=1)).isoformat():
        streak = min(3, previous_streak + 1)
    return {"night": night, "fingerprint": fingerprint, "streak": streak}, streak == 3


def _replay_state(body):
    raw = _match(REPLAY_STATE_RE, body)
    try:
        state = json.loads(raw)
        if (isinstance(state, dict) and date.fromisoformat(state["night"]).isoformat() == state["night"]
                and re.fullmatch(r"[0-9a-f]{64}", state["fingerprint"]) and type(state["streak"]) is int
                and 0 <= state["streak"] <= 3):
            return state
    except (KeyError, ValueError, TypeError):
        pass
    return {}


def _has_sighting(issue, run_id):
    return any(run_id in RUN_RE.findall(body) or run_id in SIGHTINGS_RE.findall(body)
               for body in finding_bodies(issue))


def plan_nightly_actions(issues, report, night, run_id, run_url, commit):
    by_issue = {entry["issue"]: entry["status"] for entry in report}
    actions = []
    for issue in issues:
        body = issue.get("body") or ""
        state = _replay_state(body)
        status = "still-fails" if _has_sighting(issue, run_id) else by_issue.get(issue["number"], "not-replayable")
        if status != "passes-now" and not state.get("streak"):
            continue
        fingerprint = _replay_fingerprint(parse_reproducers(issue))
        next_state, close = advance_nightly_replay(state, night, fingerprint, status)
        if next_state == state and not close:
            continue
        marker = f"<!-- nightly-replay:v1 {json.dumps(next_state, separators=(',', ':'))} -->\n"
        action = {"issue": issue["number"], "body": marker + REPLAY_STATE_RE.sub("", body),
                  "previous_body": body, "sightings": issue.get("sightings", [])}
        if close:
            action["close_marker"] = f"<!-- nightly-replay-closed:{night}:{commit} -->"
            action["comment"] = (
                f"{action['close_marker']}\n"
                f"All stored reproducers passed on main for three consecutive nights through {night} (UTC). "
                f"Closing after replay on commit `{commit}` ([workflow run]({run_url}))."
            )
        actions.append(action)
    return actions


def gh(*args, data=None):
    proc = subprocess.run(["gh", *args], capture_output=True, text=True, input=data)
    if proc.returncode != 0:
        raise RuntimeError(f"gh {' '.join(args)} failed: {proc.stderr.strip()}")
    return proc.stdout


def _bot_comments(repo, number, run_gh):
    endpoint = f"repos/{repo}/issues/{number}/comments?per_page=100"
    pages = json.loads(run_gh("api", "--paginate", "--slurp", endpoint))
    return [comment.get("body") or "" for page in pages for comment in page
            if (comment.get("user") or {}).get("login") == "github-actions[bot]"]


def _resolve_artifact(repo, record, run_gh, archives):
    path = ARTIFACT_PATH_RE.fullmatch(record["path"])
    run_id = record["runId"]
    if not path or not re.fullmatch(r"[0-9]+", run_id) or ".." in path[2].split("/"):
        raise ValueError("invalid nightly run or artifact path")
    name, member = path.groups()
    key = (run_id, name)
    if key not in archives:
        reply = json.loads(run_gh("api", f"repos/{repo}/actions/runs/{run_id}/artifacts?name={name}"))
        artifacts = [item for item in reply["artifacts"] if not item["expired"] and item["name"] == name]
        if len(artifacts) != 1 or artifacts[0]["size_in_bytes"] > MAX_ARTIFACT_BYTES:
            raise ValueError("nightly artifact missing, ambiguous, expired or oversized")
        artifact_id = int(artifacts[0]["id"])
        data = subprocess.run(["gh", "api", f"repos/{repo}/actions/artifacts/{artifact_id}/zip"],
                              check=True, capture_output=True, timeout=60).stdout
        archives[key] = zipfile.ZipFile(io.BytesIO(data))
        if len(archives) > 4:
            archives.pop(next(iter(archives))).close()
    with archives[key].open(member) as entry:
        raw = entry.read(MAX_RECORD_BYTES + 1)
    return _model_from_artifact(record, raw)


def _model_from_artifact(record, raw):
    if len(raw) > MAX_RECORD_BYTES or hashlib.sha256(raw).hexdigest() != record["artifactHash"]:
        raise ValueError("nightly finding file size or digest differs")
    finding = json.loads(raw)
    if finding.get("test") != record["test"] or str(finding.get("seed")) != record["seed"]:
        raise ValueError("nightly finding selector differs")
    return {"model": finding["model"]}


def fetch_open_issues(repo, gh_runner=None):
    run_gh = gh_runner or gh
    pages = json.loads(
        run_gh("api", "--paginate", "--slurp", f"repos/{repo}/issues?labels={LABEL}&state=open&per_page=100")
    )
    issues = [
        {"number": i["number"], "title": i.get("title") or "", "body": i.get("body") or "",
         "sightings": [body for body in _bot_comments(repo, i["number"], run_gh) if RUN_RE.search(body)]
         if i.get("comments") else []}
        for page in pages for i in page if "pull_request" not in i
    ]
    archives = {}
    resolved = {}
    for issue in issues:
        models = {}
        for body in finding_bodies(issue):
            try:
                records = _decode_reproducers(body) or []
            except (ValueError, EOFError, OSError, binascii.Error, zlib.error):
                continue
            for record in records:
                if "model" in record or "error" in record:
                    continue
                digest = record["artifactHash"]
                key = (record["runId"], record["path"], digest)
                if key not in resolved:
                    try:
                        resolved[key] = _resolve_artifact(repo, record, run_gh, archives)
                    except (ValueError, KeyError, OSError, RuntimeError, zipfile.BadZipFile, subprocess.SubprocessError) as error:
                        resolved[key] = {"error": f"{record['path']}: {error}"}
                models[digest] = resolved[key]
        if models:
            issue["resolved_models"] = models
    for archive in archives.values():
        archive.close()
    return sorted(issues, key=lambda i: i["number"])


def apply_nightly_actions(repo, actions, gh_runner=None):
    run_gh = gh_runner or gh
    for action in actions:
        number = action["issue"]
        endpoint = f"repos/{repo}/issues/{number}"
        current = json.loads(run_gh("api", endpoint))
        if current["state"] != "open" or (current.get("body") or "") != action["previous_body"]:
            print(f"#{number}: issue changed since replay")
            continue
        patch = {"body": action["body"]}
        if "comment" in action:
            comments = _bot_comments(repo, number, run_gh) if current.get("comments") else []
            if [body for body in comments if RUN_RE.search(body)] != action["sightings"]:
                print(f"#{number}: sightings changed since replay")
                continue
            if not any(action["close_marker"] in comment for comment in comments):
                run_gh("api", "--method", "POST", f"{endpoint}/comments",
                       "--input", "-", data=json.dumps({"body": action["comment"]}))
            patch.update(state="closed", state_reason="completed")
        run_gh("api", "--method", "PATCH", endpoint, "--input", "-", data=json.dumps(patch))


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
    p_report.add_argument("--night")
    p_report.add_argument("--run-id", default=os.environ.get("GITHUB_RUN_ID", ""))
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
    if args.night:
        actions = plan_nightly_actions(issues, report, args.night, args.run_id, args.run_url, args.commit)
        apply_nightly_actions(args.repo, actions)
    else:
        actions = plan_issue_actions(report, args.close_passing, args.run_url, args.commit)
        if actions:
            apply_issue_actions(args.repo, actions)
    return 0


if __name__ == "__main__":
    sys.exit(main())
