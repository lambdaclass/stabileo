#!/usr/bin/env python3
import argparse
import json
import os
import re
import signal
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
MANIFEST = ROOT / ".github" / "test-cadence.json"
RUNNERS = {"ci-engine-quick", "nightly"}


def load(root=ROOT):
    return json.loads((root / ".github" / "test-cadence.json").read_text())


def make_targets(root=ROOT):
    text = (root / "Makefile").read_text()
    return set(re.findall(r"^([A-Za-z0-9_.\-]+):(?!=)", text, re.M))


def runnable(check, targets, root=ROOT):
    if check.get("target") not in targets:
        return False
    if any(t not in targets for t in check.get("needs", [])):
        return False
    return all((root / f).exists() for f in check.get("requires", []))


def select(manifest, tiers, runner=None, ident=None):
    out = []
    for c in manifest["checks"]:
        if "target" not in c or c["tier"] not in tiers:
            continue
        if runner and c.get("runner") != runner:
            continue
        if ident and c["id"] != ident:
            continue
        out.append(c)
    return out


def notice(msg):
    prefix = "::notice::" if os.environ.get("GITHUB_ACTIONS") else ""
    print(prefix + msg, flush=True)


def command(check):
    return ["make", *check.get("needs", []), check["target"], *(f"{k}={v}" for k, v in sorted(check.get("vars", {}).items()))]


def execute_group(cmd, cwd, timeout):
    proc = subprocess.Popen(cmd, cwd=cwd, start_new_session=True)
    try:
        return proc.wait(timeout=timeout)
    except subprocess.TimeoutExpired:
        for sig, grace in ((signal.SIGTERM, 30), (signal.SIGKILL, None)):
            try:
                os.killpg(proc.pid, sig)
            except ProcessLookupError:
                break
            try:
                proc.wait(timeout=grace)
                break
            except subprocess.TimeoutExpired:
                continue
        raise


def run(manifest, tiers, runner, ident, root=ROOT, execute=execute_group):
    targets = make_targets(root)
    chosen = select(manifest, tiers, runner, ident)
    if ident and not chosen:
        print(f"cadence: no check {ident!r} in tiers {' '.join(tiers)}", file=sys.stderr)
        return 1
    failed = []
    for c in chosen:
        if not runnable(c, targets, root):
            if c.get("optional"):
                notice(f"cadence: {c['id']} skipped, `make {c['target']}` is not on this branch yet")
                continue
            print(f"cadence: {c['id']}: `make {c['target']}` or what it needs is missing", file=sys.stderr)
            failed.append(c["id"])
            continue
        cmd = command(c)
        print(f"cadence: {c['id']}: {' '.join(cmd)} (budget {c.get('budget_min', '?')} min)", flush=True)
        timeout = 60 * c["budget_min"] if "budget_min" in c else None
        try:
            if execute(cmd, cwd=root, timeout=timeout) != 0:
                failed.append(c["id"])
        except subprocess.TimeoutExpired:
            print(f"cadence: {c['id']} did not finish within {c['budget_min']} min", file=sys.stderr)
            failed.append(c["id"])
    if failed:
        print("cadence: failed: " + " ".join(failed), file=sys.stderr)
        return 1
    return 0


def listing(manifest, tiers, runner, root=ROOT):
    targets = make_targets(root)
    return [
        {"id": c["id"], "tier": c["tier"], "timeout": c.get("budget_min", 60) + 20}
        for c in select(manifest, tiers, runner)
        if runnable(c, targets, root) or not c.get("optional")
    ]


def check(manifest, root=ROOT):
    errors = []
    tiers = set(manifest["tiers"])
    for t, spec in manifest["tiers"].items():
        for k in ("trigger", "budget_min", "on_failure", "owner"):
            if k not in spec:
                errors.append(f"tier {t}: no {k}")
    targets = make_targets(root)
    doc = (root / "docs" / "TESTING_CADENCE.md").read_text() if (root / "docs" / "TESTING_CADENCE.md").exists() else ""
    seen = set()
    for c in manifest["checks"]:
        i = c.get("id", "?")
        if i in seen:
            errors.append(f"{i}: duplicate id")
        seen.add(i)
        if c.get("tier") not in tiers:
            errors.append(f"{i}: unknown tier {c.get('tier')!r}")
        if ("target" in c) == ("existing" in c):
            errors.append(f"{i}: needs exactly one of target and existing")
        if "target" in c:
            if c.get("runner") not in RUNNERS:
                errors.append(f"{i}: runner must be one of {sorted(RUNNERS)}")
            if not c.get("optional") and c["target"] not in targets:
                errors.append(f"{i}: make target {c['target']} is not in the Makefile")
            for t in c.get("needs", []):
                if t not in targets:
                    errors.append(f"{i}: make target {t} (needs) is not in the Makefile")
        if "existing" in c:
            wf, _, job = c["existing"].partition("#")
            path = root / ".github" / "workflows" / wf
            if not path.exists():
                if not c.get("optional"):
                    errors.append(f"{i}: workflow {wf} does not exist")
            elif not re.search(rf"^  {re.escape(job)}:\s*$", path.read_text(), re.M):
                errors.append(f"{i}: workflow {wf} has no job {job}")
        if doc and f"`{i}`" not in doc:
            errors.append(f"{i}: not in docs/TESTING_CADENCE.md")
    return errors


def main(argv):
    p = argparse.ArgumentParser()
    sub = p.add_subparsers(dest="cmd", required=True)
    for name in ("list", "run"):
        s = sub.add_parser(name)
        s.add_argument("tiers", nargs="+")
        s.add_argument("--runner")
        if name == "run":
            s.add_argument("--id")
    sub.add_parser("check")
    a = p.parse_args(argv)
    manifest = load()
    if a.cmd in ("list", "run"):
        unknown = [t for t in a.tiers if t not in manifest["tiers"]]
        if unknown:
            print(f"cadence: unknown tier {' '.join(unknown)}", file=sys.stderr)
            return 2
    if a.cmd == "list":
        print(json.dumps(listing(manifest, a.tiers, a.runner)))
        return 0
    if a.cmd == "run":
        return run(manifest, a.tiers, a.runner, a.id)
    errors = check(manifest)
    for e in errors:
        print(f"cadence: {e}", file=sys.stderr)
    return 1 if errors else 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
