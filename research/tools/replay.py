#!/usr/bin/env python3
"""Replay every paper's validation against its reference outputs (research/DESIGN.md §3).

Run by the Research workflow whenever research/, the engine or the viewer changes, so an engine
change that shifts a research result fails here, by name, and someone decides whether it is a fix.

A paper is a directory research/<field>/<id>/ with a Cargo.toml (its own workspace) and a
committed VALIDATION.json. For each one: `cargo test --release --locked` (the reference validation
and the property tests), then the checks it wrote to target/VALIDATION.json are compared with the
committed ones. Reported, as GitHub annotations and in the job summary:

  * a check that fails: the paper, the check (the quantity), its metric, the value now, the
    tolerance and the value committed;
  * a check that passes but moved by more than MOVED_FACTOR from the committed value (worth a
    look; not a failure);
  * a check added or removed, or a test run that failed without writing its checks.

    python3 -I research/tools/replay.py [paper-dir ...]     # default: every paper
"""

import json
import math
import os
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
RESEARCH = ROOT / "research"
MOVED_FACTOR = 10.0
# Papers whose writer regenerates VALIDATION.json in place rather than target/VALIDATION.json:
# their command and environment. The committed files are restored after the run.
IN_PLACE = {
    "form-finding/pastrana-2026": (["cargo", "test", "--release", "--locked"], {"WRITE_VALIDATION": "1"}),
    "mechanics/biggins-2026": (["cargo", "run", "--release", "--locked", "--bin", "validate", "--", "--write"], {}),
    "optimization/andreassen-2011": (["cargo", "test", "--release", "--locked"], {"UPDATE_VALIDATION": "1"}),
}


def papers(args):
    if args:
        return [Path(a).resolve() for a in args]
    return sorted(p.parent for p in RESEARCH.glob("*/*/VALIDATION.json") if (p.parent / "Cargo.toml").is_file())


def annotate(kind, title, message):
    # One line per annotation; GitHub reads ::error/::warning from stdout.
    message = message.replace("%", "%25").replace("\r", "").replace("\n", "%0A")
    print(f"::{kind} title={title}::{message}", flush=True)


def checks(path):
    try:
        entries = json.loads(path.read_text())["checks"]
        if not isinstance(entries, list) or not entries:
            return None
        result = {}
        for check in entries:
            if not isinstance(check, dict) or not isinstance(check.get("metric"), str) or not isinstance(check.get("passed"), bool):
                return None
            key = check.get("name", check["metric"])
            if not isinstance(key, str) or not key or key in result:
                return None
            for field in ("observed", "tolerance"):
                value = check.get(field)
                if type(value) not in (int, float) or not math.isfinite(value):
                    return None
            if check["tolerance"] < 0:
                return None
            result[key] = check
        return result
    except (OSError, ValueError, KeyError, TypeError):
        return None


def fmt(x):
    return f"{x:.3e}" if isinstance(x, (int, float)) else str(x)


def replay(paper):
    name = f"{paper.parent.name}/{paper.name}"
    title = f"Research replay: {name}"
    committed = checks(paper / "VALIDATION.json")
    if committed is None:
        annotate("error", title, "missing or invalid committed VALIDATION.json")
        return True, [(name, "(invalid committed checks)", "", "", "", "", "FAIL")]
    command, env = IN_PLACE.get(name, (["cargo", "test", "--release", "--locked"], {}))
    produced = paper / "VALIDATION.json" if name in IN_PLACE else paper / "target" / "VALIDATION.json"
    kept = {f: f.read_bytes() for f in (paper / "VALIDATION.json", paper / "PUBLISHED_COMPARISON.json") if f.exists()}
    if name in IN_PLACE:
        os.utime(produced, ns=(0, 0))
    else:
        produced.unlink(missing_ok=True)
    print(f"::group::{name}: {' '.join(command)}", flush=True)
    try:
        run = subprocess.run(command, cwd=paper, env={**os.environ, **env})
        written = produced.exists() and produced.stat().st_mtime_ns != 0
        now = checks(produced) if written else None
    finally:
        for f, data in kept.items():
            f.write_bytes(data)
    print("::endgroup::", flush=True)

    rows, failed = [], run.returncode != 0
    if now is None:
        annotate("error", title, f"the tests exited {run.returncode} without writing {produced.relative_to(paper)}: a build or test failure before the reference checks ran")
        return True, [(name, "(no checks written)", "", "", "", "", "FAIL")]
    for key in sorted(set(committed) | set(now)):
        c, n = committed.get(key), now.get(key)
        if n is None:
            annotate("error", title, f"check removed: {key}")
            rows.append((name, key, "", "", "", "", "REMOVED"))
            failed = True
            continue
        was = c["observed"] if c else None
        status = "ok"
        if not n["passed"] or n["observed"] > n["tolerance"]:
            status = "FAIL"
            failed = True
            annotate("error", title, f"{key} moved: {n['metric']} is now {fmt(n['observed'])}, above the tolerance {fmt(n['tolerance'])} (committed: {fmt(was)})")
        elif c is None:
            status = "ADDED"
            failed = True
            annotate("error", title, f"check not in the committed VALIDATION.json: {key}")
        elif any(c[field] != n[field] for field in ('metric', 'tolerance')):
            status = "FAIL"
            failed = True
            annotate("error", title, f"{key}: metric or tolerance changed from committed validation")
        elif was is not None and moved(was, n["observed"]):
            status = "moved"
            annotate("warning", title, f"{key} moved within its tolerance: {n['metric']} {fmt(was)} -> {fmt(n['observed'])} (tolerance {fmt(n['tolerance'])})")
        rows.append((name, key, n["metric"], fmt(was), fmt(n["observed"]), fmt(n["tolerance"]), status))
    if run.returncode != 0 and all(r[-1] != "FAIL" for r in rows):
        annotate("error", title, f"cargo test exited {run.returncode} (a property test, or VALIDATION.json out of date); see the log")
    return failed, rows


def moved(was, now):
    if was == now:
        return False
    lo, hi = sorted((abs(was), abs(now)))
    if hi < 1e-300:
        return False
    return lo == 0.0 and hi > 1e-12 or lo > 0.0 and hi / lo > MOVED_FACTOR and not math.isclose(was, now, abs_tol=1e-15)


def main():
    targets = papers(sys.argv[1:])
    if not targets:
        print("no papers with a VALIDATION.json found", file=sys.stderr)
        return 1
    failures, rows = [], []
    for paper in targets:
        failed, r = replay(paper)
        rows += r
        if failed:
            failures.append(f"{paper.parent.name}/{paper.name}")
    summary = os.environ.get("GITHUB_STEP_SUMMARY")
    lines = ["## Research replay", "", f"{len(targets)} paper(s); " + (f"**failed: {', '.join(failures)}**" if failures else "all reference checks pass"), "",
             "| Paper | Check | Metric | Committed | Now | Tolerance | |", "|---|---|---|---|---|---|---|"]
    lines += ["| " + " | ".join(str(c).replace("|", "\\|") for c in r) + " |" for r in rows]
    if summary:
        with open(summary, "a") as f:
            f.write("\n".join(lines) + "\n")
    for r in rows:
        if r[-1] != "ok":
            print(f"{r[-1]:8} {r[0]}: {r[1]} [{r[2]}: committed {r[3]}, now {r[4]}, tolerance {r[5]}]")
    print(f"{len(targets)} paper(s) replayed; " + (f"FAILED: {', '.join(failures)}" if failures else "all pass"))
    return 1 if failures else 0


if __name__ == "__main__":
    sys.exit(main())
