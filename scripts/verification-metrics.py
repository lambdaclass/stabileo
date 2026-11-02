#!/usr/bin/env python3
"""Verification dashboard and maturity matrix for Stabileo.

Computes every verification metric it can from the repository and from GitHub
(issue counts and the latest CI artifacts, through the `gh` CLI), and writes

    docs/verification/dashboard.json   machine-readable, for the app / docs site
    docs/verification/DASHBOARD.md     current values + per-release history
    docs/verification/MATURITY.md      highest verification level per analysis,
                                       element family and design check

A metric that cannot be measured is written as "not yet measured" with the
reason. No number is ever typed in by hand or estimated.

Usage (from anywhere in the repo; Python 3.9+, standard library only):

    scripts/verification-metrics.py                  # repo + GitHub + CI artifacts
    scripts/verification-metrics.py --offline        # repo only (GitHub values kept
                                                     # from the previous dashboard.json)
    scripts/verification-metrics.py --record v0.3.0  # from a checkout of the tag: write the
                                                     # release snapshot releases/v0.3.0.json
    scripts/verification-metrics.py --max-runs 20    # how far back to look for CI runs
    scripts/verification-metrics.py --check-mutants-rotation  # exit 1 if a mutants shard is
                                                     # older than MUTANTS_PROMISE_DAYS

CI: .github/workflows/verification-dashboard.yml (weekly, on release tags, on demand).

Artifact contracts (a metric appears as soon as CI publishes it):

    differential-<program>   tools/differential/out/ci/*.json (run.py --report)
    opensees-report          opensees-report.json
    codeaster-report         codeaster-report.json
    mutants-report-<k>       cargo-mutants output dir (caught.txt, missed.txt, ...)
    mutants-done-<k>-of-<n>  shard k of n ran to its verdict (nightly.yml)
    stryker-report           Stryker reports/mutation/ (mutation.json)
    fuzz-stats-<target>      text containing libFuzzer `stat::number_of_executed_units: N`
    llvm-cov-summary         `cargo llvm-cov --json --summary-only` output
"""

from __future__ import annotations

import argparse
import datetime as dt
import glob
import json
import os
import re
import shutil
import subprocess
import sys
import tempfile
import unicodedata

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
REPO = "lambdaclass/stabileo"
VDIR = os.path.join(ROOT, "docs", "verification")
OUT_JSON = os.path.join(VDIR, "dashboard.json")
OUT_MD = os.path.join(VDIR, "DASHBOARD.md")
OUT_MATURITY = os.path.join(VDIR, "MATURITY.md")
RELEASES_DIR = os.path.join(VDIR, "releases")  # one snapshot per release: <tag>.json
NOT_MEASURED = "not yet measured"
MUTANTS_PROMISE_DAYS = 16


def read(rel: str) -> str:
    p = os.path.join(ROOT, rel)
    if not os.path.exists(p):
        return ""
    with open(p, encoding="utf-8") as f:
        return f.read()


def warn(msg: str) -> None:
    print(f"warning: {msg}", file=sys.stderr)


def metric(label, value=None, display=None, status="measured", source="", note="", section=""):
    if value is None and status != "not_measured":
        status = "not_measured"  # an undefined value is never displayed as a number ("None %")
    if status == "not_measured":
        display = NOT_MEASURED
    elif display is None:
        display = str(value)
    return {"label": label, "value": value, "display": display, "status": status,
            "source": source, "note": note, "section": section}


def pct(a, b):
    return None if not b else round(100.0 * a / b, 1)


def slug(heading: str) -> str:
    """GitHub's heading anchor."""
    s = heading.strip().lower()
    s = "".join(ch for ch in s if ch in " -_" or unicodedata.category(ch)[0] in "LN")
    return s.replace(" ", "-")


def headings(text: str) -> list[str]:
    return [m.group(2).strip() for m in re.finditer(r"^(#{1,6})\s+(.*)$", text, re.M)]


def section(text: str, heading: str) -> str:
    """Body of the section whose heading text is `heading` (until the next heading of the same
    or higher level)."""
    m = re.search(r"^(#{1,6})\s+" + re.escape(heading) + r"\s*$", text, re.M)
    if not m:
        return ""
    level = len(m.group(1))
    rest = text[m.end():]
    n = re.search(r"^#{1," + str(level) + r"}\s", rest, re.M)
    return rest[: n.start()] if n else rest


def table_rows(text: str) -> list[list[str]]:
    rows = []
    for line in text.splitlines():
        line = line.strip()
        if not line.startswith("|") or re.match(r"^\|[\s:|-]+\|$", line):
            continue
        rows.append([c.strip() for c in line.strip("|").split("|")])
    return rows


# --------------------------------------------------------------------------- GitHub


class GH:
    def __init__(self, offline: bool):
        self.ok = not offline and shutil.which("gh") is not None
        if self.ok:
            try:
                subprocess.run(["gh", "auth", "status"], capture_output=True, timeout=30, check=True)
            except Exception:
                warn("gh is not authenticated; GitHub metrics are skipped")
                self.ok = False
        self.tmp = tempfile.mkdtemp(prefix="stabileo-metrics-")
        # When recording a release snapshot: only CI runs of exactly this commit are evidence.
        self.require_sha: str | None = None

    def run(self, args, timeout=120):
        r = subprocess.run(["gh", *args], capture_output=True, text=True, timeout=timeout)
        if r.returncode != 0:
            raise RuntimeError(r.stderr.strip()[:300])
        return r.stdout

    def json(self, args, timeout=120):
        return json.loads(self.run(args, timeout))

    def issues(self, label: str, state: str = "open"):
        return self.json(["issue", "list", "-R", REPO, "--label", label, "--state", state,
                          "--limit", "1000", "--json", "number,title,state,labels"])

    def issue_states(self, numbers):
        out = {}
        for n in sorted(set(numbers)):
            try:
                out[n] = self.json(["api", f"repos/{REPO}/issues/{n}", "--jq",
                                    "{state: .state, title: .title, pr: (.pull_request != null)}"])
            except Exception as ex:  # noqa: deleted / inaccessible issue
                warn(f"issue #{n}: {ex}")
        return out

    def runs(self, workflow: str, max_runs: int, branch: str | None = "main"):
        args = ["run", "list", "-R", REPO, "--workflow", workflow]
        if branch:
            args += ["--branch", branch]
        return self.json(args + ["--limit", str(max_runs), "--json",
                                 "databaseId,conclusion,status,event,createdAt,headSha,headBranch,url"])

    def artifacts(self, run_id: int):
        return self.json(["api", f"repos/{REPO}/actions/runs/{run_id}/artifacts", "--paginate",
                          "--jq", "[.artifacts[] | {name, expired}]"]) if self.ok else []

    def jobs(self, run_id: int):
        return self.json(["run", "view", str(run_id), "-R", REPO, "--json", "jobs", "--jq",
                          "[.jobs[] | {name, conclusion}]"])

    def download(self, run_id: int, name: str) -> str | None:
        dest = os.path.join(self.tmp, f"{run_id}-{name}")
        if os.path.isdir(dest):
            return dest
        try:
            self.run(["run", "download", str(run_id), "-R", REPO, "-n", name, "-D", dest], timeout=600)
            return dest
        except Exception as ex:
            warn(f"artifact {name} of run {run_id}: {ex}")
            return None


def is_main_or_tag_run(run) -> bool:
    """A run of main, or one triggered by pushing a release tag (`v*`)."""
    return run.get("headBranch") == "main" or (run.get("event") == "push"
                                                and re.fullmatch(r"v\d.*", run.get("headBranch") or "") is not None)


def find_artifacts(gh: GH, workflow: str, pattern: str, max_runs: int, all_matches=False,
                   run_filter=None, branch: str | None = "main"):
    """Latest runs of `workflow` (on `branch`; None = any) that pass `run_filter` and carry
    artifacts whose name matches `pattern`. Returns [(run, artifact_name)], newest first: the
    matches of the newest such run, or with all_matches every match in every run."""
    found = []
    try:
        runs = gh.runs(workflow, max_runs, branch)
    except Exception as ex:
        warn(f"runs of {workflow}: {ex}")
        return found
    for r in runs:
        if r.get("status") != "completed" or (run_filter and not run_filter(r)):
            continue
        need = getattr(gh, "require_sha", None)
        if need and r.get("headSha") != need:
            continue
        try:
            arts = gh.artifacts(r["databaseId"])
        except Exception as ex:
            warn(f"artifacts of run {r['databaseId']}: {ex}")
            continue
        names = [a["name"] for a in arts if not a["expired"] and re.fullmatch(pattern, a["name"])]
        for n in names:
            found.append((r, n))
        if names and not all_matches:
            break
    return found


# --------------------------------------------------------------------------- repo metrics


def feature_matrix():
    text = read("docs/verification/FEATURE_MATRIX.md")
    out = {}
    for dim in ("2D", "3D"):
        body = section(text, dim)
        rows = table_rows(body)
        counts, analyses = {}, {}
        for row in rows:
            if row[0] in ("Analysis", "Symbol"):
                continue
            if not row[1:] or not all(len(c) <= 3 for c in row[1:]):
                continue
            analyses[row[0]] = row[1:]
            for c in row[1:]:
                counts[c] = counts.get(c, 0) + 1
        out[dim] = {"counts": counts, "analyses": analyses}
    return out


def ts_engine_logic():
    text = read("docs/verification/TS_ENGINE_LOGIC.md")
    inv = section(text, "Inventory")
    base = os.path.join(ROOT, "web", "src", "lib", "engine")
    by_class = {c: {"modules": 0, "lines": 0} for c in "abcd"}
    high = {"modules": 0, "lines": 0}
    listed, missing = set(), []
    for row in table_rows(inv):
        m = re.fullmatch(r"`([^`]+\.ts)`", row[0])
        if not m or len(row) < 3 or row[2] not in by_class:
            continue
        path = os.path.join(base, m.group(1))
        listed.add(os.path.normpath(path))
        if not os.path.exists(path):
            missing.append(m.group(1))
            continue
        with open(path, encoding="utf-8") as f:
            n = sum(1 for _ in f)
        by_class[row[2]]["modules"] += 1
        by_class[row[2]]["lines"] += n
        if row[2] in "bc" and len(row) > 4 and row[4] == "high":
            high["modules"] += 1
            high["lines"] += n
    unclassified = {"modules": 0, "lines": 0, "files": []}
    for p in glob.glob(os.path.join(base, "**", "*.ts"), recursive=True):
        if "__tests__" in p or p.endswith((".test.ts", ".d.ts", ".spec.ts")):
            continue
        if os.path.normpath(p) in listed:
            continue
        with open(p, encoding="utf-8") as f:
            n = sum(1 for _ in f)
        unclassified["modules"] += 1
        unclassified["lines"] += n
        unclassified["files"].append(os.path.relpath(p, base))
    rust = 0
    for p in glob.glob(os.path.join(ROOT, "engine", "src", "**", "*.rs"), recursive=True):
        with open(p, encoding="utf-8") as f:
            rust += sum(1 for _ in f)
    return {"by_class": by_class, "high_bc": high, "unclassified": unclassified, "missing": missing, "rust_lines": rust}


def certified_design_checks():
    text = read("docs/verification/CERTIFY.md")
    sec = section(text, "Certified design checks")
    catalog = DESIGN_CHECKS
    out = []
    for c in catalog:
        if c.get("certify_fn"):
            out.append((c["name"], c["certify_fn"] in sec))
    return out


def design_examples():
    text = read("docs/verification/DESIGN_EXAMPLES.md")
    cov = section(text, "Coverage")
    counts = {}
    for row in table_rows(cov):
        if len(row) < 4 or row[0] in ("Clause",):
            continue
        st = row[-1].replace("*", "").strip().lower()
        for key in ("pass", "fixed", "open", "doc", "ex", "uncovered", "clause test"):
            if st.startswith(key):
                counts[key] = counts.get(key, 0) + 1
                break
        else:
            counts["other"] = counts.get("other", 0) + 1
    return counts


def acceptance():
    models = sorted(glob.glob(os.path.join(ROOT, "engine", "tests", "acceptance", "models", "*.json")))
    if not models:
        return None
    refs, by_analysis, cases, bad = 0, {}, 0, []
    for p in models:
        try:
            with open(p, encoding="utf-8") as f:
                d = json.load(f)
            r = d["references"]
            a = d["analysis"]
            if not isinstance(r, list):
                raise ValueError("references is not a list")
        except Exception as ex:
            bad.append(os.path.basename(p))
            warn(f"acceptance case {p}: {ex}")
            continue
        cases += 1
        refs += len(r)
        by_analysis[a] = by_analysis.get(a, 0) + 1
    if not cases:
        return None
    return {"cases": cases, "references": refs, "by_analysis": by_analysis, "unparsable": bad}


def git_grep_count(pattern: str, *paths: str) -> int | None:
    """Matches of `pattern` in tracked files; None when git fails or nothing matches (these counts
    are of things the repository has, so zero means the evidence is missing, not "none")."""
    try:
        r = subprocess.run(["git", "grep", "-hcE", pattern, "--", *paths], cwd=ROOT,
                           capture_output=True, text=True)
    except Exception:
        return None
    if r.returncode not in (0, 1):
        return None
    n = sum(int(x) for x in r.stdout.split() if x.strip().isdigit())
    return n or None


def git_grep_files(pattern: str, *paths: str) -> list[str]:
    r = subprocess.run(["git", "grep", "-lF", pattern, "--", *paths], cwd=ROOT,
                       capture_output=True, text=True)
    return [x for x in r.stdout.splitlines() if x]


# --------------------------------------------------------------------------- CI metrics


def differential(gh: GH, max_runs: int):
    """Per program: model counts by status from the latest main run that has its report."""
    out = {}
    if not gh.ok:
        return out
    for r, name in find_artifacts(gh, "differential.yml", r"differential-.+", max_runs, all_matches=True):
        prog = name.split("-", 1)[1]
        if prog in out:
            continue  # newest report per harness only
        d = gh.download(r["databaseId"], name)
        rep_ = _reports(d, r) if d else None
        if rep_ is not None:  # an artifact without a parsable report (e.g. only mismatch dumps) is no evidence
            out[prog] = rep_
    for program, art in (("opensees", "opensees-report"), ("codeaster", "codeaster-report")):
        for r, name in find_artifacts(gh, "verify.yml", re.escape(art), max_runs, all_matches=True):
            d = gh.download(r["databaseId"], name)
            rep_ = _reports(d, r) if d else None
            if rep_ is not None:
                out[program] = rep_
                break
    return out


def _reports(d: str, run) -> dict | None:
    """Status counts of the run.py / compare.py reports in an artifact directory; None when no
    report parses (the artifact then says nothing about how many models were compared)."""
    statuses, analyses, parsed = {}, {}, 0
    for p in glob.glob(os.path.join(d, "**", "*.json"), recursive=True):
        try:
            with open(p, encoding="utf-8") as f:
                data = json.load(f)
        except Exception:
            continue
        if not isinstance(data, list) or not data or not isinstance(data[0], dict) or "status" not in data[0]:
            continue
        parsed += 1
        for row in data:
            s = row.get("status", "?")
            statuses[s] = statuses.get(s, 0) + 1
            a = row.get("analysis") or "static"
            ad = analyses.setdefault(a, {})
            ad[s] = ad.get(s, 0) + 1
    if not parsed:
        return None
    compared = sum(statuses.get(s, 0) for s in ("ok", "mismatch", "known"))
    return {"run": run["url"], "sha": run.get("headSha"), "date": run["createdAt"][:10], "statuses": statuses,
            "analyses": analyses, "compared": compared, "ok": statuses.get("ok", 0),
            "mismatch": statuses.get("mismatch", 0), "total": sum(statuses.values())}


def rust_mutants(gh: GH, max_runs: int):
    """cargo-mutants totals of the newest main run that uploaded mutants reports (every shard of
    that run). The aggregate is complete only if every shard the run had (its `mutants` jobs, with
    or without an artifact) contributed outcomes and every shard tested all it planned."""
    if not gh.ok:
        return None
    hits = find_artifacts(gh, "nightly.yml", r"mutants-report-\d+", max_runs)
    if not hits:
        return None
    run = hits[0][0]
    try:
        names = [a["name"] for a in gh.artifacts(run["databaseId"])
                 if not a["expired"] and re.fullmatch(r"mutants-report-\d+", a["name"])]
    except Exception as ex:
        warn(f"mutants run {run['databaseId']}: {ex}")
        return None
    try:
        jobs = [j for j in gh.jobs(run["databaseId"]) if j["name"].startswith("mutants")]
    except Exception as ex:
        warn(f"jobs of mutants run {run['databaseId']}: {ex}")
        jobs = None  # number of shards unknown: the aggregate can only be partial
    tot = {"caught": 0, "missed": 0, "timeout": 0, "unviable": 0, "planned": 0}
    shards, plan_known = 0, True
    for name in names:
        d = gh.download(run["databaseId"], name)
        if not d:
            continue
        files = [os.path.join(d, f"{k}.txt") for k in ("caught", "missed", "timeout", "unviable")]
        if not any(os.path.exists(p) for p in files):
            continue  # no outcome files: this shard says nothing
        shards += 1
        for kind, p in zip(("caught", "missed", "timeout", "unviable"), files):
            if os.path.exists(p):
                with open(p, encoding="utf-8") as f:
                    tot[kind] += sum(1 for line in f if line.strip())
        mj = os.path.join(d, "mutants.json")
        try:
            with open(mj, encoding="utf-8") as f:
                tot["planned"] += len(json.load(f))
        except Exception:
            plan_known = False  # unknown plan: never claim the shard is complete
    if not shards:
        return None
    tot["tested"] = sum(tot[k] for k in ("caught", "missed", "timeout", "unviable"))
    tot["plan_known"] = plan_known
    tot["sha"] = run.get("headSha")
    tot["shards"] = shards
    tot["shards_expected"] = max(len(jobs), len(names)) if jobs is not None else None
    tot["shards_missing"] = (tot["shards_expected"] - shards) if jobs is not None else None
    tot["complete"] = (jobs is not None and tot["shards_missing"] == 0 and plan_known
                       and tot["tested"] >= tot["planned"])
    tot["jobs"] = {j["name"]: j["conclusion"] for j in (jobs or [])}
    tot["run"], tot["date"] = run["url"], run["createdAt"][:10]
    return tot


def mutants_plan():
    text = read(".github/workflows/nightly.yml")
    total = re.search(r"^\s*MUTANTS_TOTAL: (\d+)$", text, re.M)
    slots = re.search(r"^\s*MUTANTS_SLOTS: (\d+)$", text, re.M)
    return (int(total.group(1)), int(slots.group(1))) if total and slots else (None, None)


def mutants_rotation(gh: GH, now: dt.datetime, promise_days: int = MUTANTS_PROMISE_DAYS):
    """Which mutants shards of the current MUTANTS_TOTAL ran to their verdict on main within the
    promise. None when GitHub or the plan cannot be read."""
    total, slots = mutants_plan()
    if not gh.ok or not total or not slots:
        return None
    since = now - dt.timedelta(days=promise_days)
    try:
        runs = gh.runs("nightly.yml", 4 * promise_days)
    except Exception as ex:
        warn(f"runs of nightly.yml: {ex}")
        return None
    last = {}
    for r in runs:
        created = dt.datetime.fromisoformat(r["createdAt"].replace("Z", "+00:00"))
        if r.get("status") != "completed" or created < since:
            continue
        try:
            arts = gh.artifacts(r["databaseId"])
        except Exception as ex:
            warn(f"artifacts of run {r['databaseId']}: {ex}")
            return None
        for a in arts:
            m = re.fullmatch(r"mutants-done-(\d+)-of-(\d+)", a["name"])
            if m and not a["expired"] and int(m.group(2)) == total:
                shard = int(m.group(1))
                last[shard] = max(last.get(shard, ""), r["createdAt"][:10])
    stale = [k for k in range(total) if k not in last]
    return {"total": total, "slots": slots, "promise_days": promise_days,
            "nights_per_pass": -(-total // slots), "fresh": total - len(stale), "stale": stale,
            "oldest": min(last.values()) if last else None, "since": since.strftime("%Y-%m-%d"),
            "ok": not stale}


def shard_ranges(shards):
    out, start = [], None
    for i, k in enumerate(shards):
        if start is None:
            start = k
        if i + 1 == len(shards) or shards[i + 1] != k + 1:
            out.append(str(start) if start == k else f"{start}-{k}")
            start = None
    return ", ".join(out)


def ts_mutants(gh: GH, max_runs: int):
    if not gh.ok:
        return None
    for r, name in find_artifacts(gh, "mutation-ts.yml", r"stryker-report", max_runs, all_matches=True,
                                  run_filter=lambda r: r.get("conclusion") == "success"):
        d = gh.download(r["databaseId"], name)
        p = d and next(iter(glob.glob(os.path.join(d, "**", "mutation.json"), recursive=True)), None)
        if not p:
            continue
        with open(p, encoding="utf-8") as f:
            rep = json.load(f)
        st = {}
        try:
            for fdata in rep.get("files", {}).values():
                for m in fdata.get("mutants", []):
                    st[m["status"]] = st.get(m["status"], 0) + 1
        except Exception as ex:
            warn(f"Stryker report of run {r['databaseId']}: {ex}")
            continue
        detected = st.get("Killed", 0) + st.get("Timeout", 0)
        valid = detected + st.get("Survived", 0) + st.get("NoCoverage", 0)
        if not valid:
            continue  # a report with no mutants says nothing; try an older run
        return {"statuses": st, "score": pct(detected, valid), "run": r["url"], "date": r["createdAt"][:10],
                "sha": r.get("headSha")}
    return None


def fuzz_execs(gh: GH, max_runs: int):
    if not gh.ok:
        return None
    total, targets, shas = 0, {}, set()
    for r, name in find_artifacts(gh, "verify.yml", r"fuzz-stats-.+", max_runs):
        d = gh.download(r["databaseId"], name)
        if not d:
            continue
        for p in glob.glob(os.path.join(d, "**", "*"), recursive=True):
            if os.path.isfile(p):
                with open(p, encoding="utf-8", errors="ignore") as f:
                    text = f.read()
                for m in re.finditer(r"stat::number_of_executed_units:\s*(\d+)", text):
                    targets[name] = targets.get(name, 0) + int(m.group(1))
                    total += int(m.group(1))
                    shas.add(r.get("headSha"))
    return {"total": total, "targets": targets, "shas": sorted(s for s in shas if s)} if targets else None


def coverage(gh: GH, max_runs: int, local: str | None, require_sha: str | None = None):
    """Engine coverage from `local`, else from the newest coverage artifact of a main or release-tag
    run. With `require_sha` (recording a release snapshot) only an artifact of a run of exactly that
    commit is accepted; otherwise coverage stays unmeasured for the snapshot."""
    data, sha = None, None
    if local and os.path.exists(local):
        try:
            with open(local, encoding="utf-8") as f:
                data = json.load(f)
        except Exception as ex:
            warn(f"coverage file {local}: {ex}")
        src = local
        sha = require_sha  # the caller measured it on the commit being recorded
    elif gh.ok:
        # Coverage is measured by release-tag runs (and manual runs on main), so tag runs count.
        flt = is_main_or_tag_run if not require_sha else (
            lambda r: is_main_or_tag_run(r) and r.get("headSha") == require_sha)
        hit = find_artifacts(gh, "verification-dashboard.yml", r"llvm-cov-summary", max_runs, branch=None,
                             run_filter=flt)
        if hit:
            d = gh.download(hit[0][0]["databaseId"], hit[0][1])
            p = d and next(iter(glob.glob(os.path.join(d, "**", "*.json"), recursive=True)), None)
            if p:
                try:
                    with open(p, encoding="utf-8") as f:
                        data = json.load(f)
                except Exception as ex:
                    warn(f"coverage artifact: {ex}")
                src = hit[0][0]["url"]
                sha = hit[0][0].get("headSha")
    try:
        t = data["data"][0]["totals"]
        out = {"lines": float(t["lines"]["percent"]), "functions": float(t["functions"]["percent"]),
               "branches": None, "source": src, "sha": sha}
        b = t.get("branches", {}).get("percent")
        # llvm-cov reports 0 % branches with count 0 when branch coverage was not enabled
        if b is not None and t.get("branches", {}).get("count", 1):
            out["branches"] = float(b)
        return out
    except Exception:
        return None


# --------------------------------------------------------------------------- maturity catalog
#
# Each row names where its evidence must be found. The level is computed from those sources,
# so if a document drops the evidence (a CERTIFY section, a benchmark row, a feature-matrix row,
# a worked-example table, a differential harness) the level drops with it and a warning is
# printed. `issues` lists open issues known to affect the item; closed ones are dropped
# automatically when GitHub is reachable.

DIFF = {
    # harness -> (document, analyses it compares, element/feature families it exercises)
    "Frame3DD": ("../../tools/differential/frame3dd/README.md", "frame3dd"),
    "PyNite": ("../../tools/differential/pynite/README.md", "pynite"),
    "MYSTRAN": ("../../tools/differential/mystran/README.md", "mystran"),
    "Kratos": ("../../tools/differential/kratos/README.md", "kratos"),
    "CalculiX": ("../../tools/differential/calculix/README.md", "calculix"),
    "OpenSees": ("../../tools/opensees/README.md", None),
    "Code_Aster": ("../../tools/differential/codeaster/README.md", None),
}

# OpenSees categories from its README table (category column) and Code_Aster's static scope.
OPENSEES_CATEGORY = {"buckling": "buckling", "modal": "modal", "pdelta": "P-Delta",
                     "th": "time history", "plates": "plates", "shells": "folded shells"}

ANALYSES = [
    # name, feature-matrix rows, CERTIFY headings, BENCHMARKS rows, differential (harness, analysis), issues
    ("Linear static", ["linear", "linear (sparse path)"], ["Certified linear static results"],
     ["2D linear static", "3D linear static"],
     [("Frame3DD", "static"), ("PyNite", "static"), ("MYSTRAN", "static"), ("Kratos", "static"),
      ("CalculiX", "static"), ("OpenSees", "static"), ("Code_Aster", "static")], [343, 435, 443, 452]),
    ("Constraints (rigid links, diaphragms, EqualDOF, MPC)", ["constrained"],
     ["Constraints (multi-point constraints)"], ["Constraint technology"], [("Code_Aster", "static")], [342, 445]),
    ("Load combinations and envelopes", ["load combinations"], ["Load combinations and envelopes"],
     ["Load combinations / envelopes"], [], []),
    ("Member forces, diagrams, deflections, reactions", [],
     ["Member force bounds", "Diagrams, extremes, deflections and reactions"],
     ["Diagrams / section forces / deformed shape"],
     [("Frame3DD", "static"), ("PyNite", "static"), ("OpenSees", "static"), ("Code_Aster", "static")], [343]),
    ("P-Delta (second order)", ["P-Delta", "P-Delta (sparse path)"], ["P-Delta (second-order) displacements"],
     ["2D P-Delta", "3D P-Delta"], [("Frame3DD", "pdelta"), ("OpenSees", "pdelta")], [404, 431, 439, 442]),
    ("Linear buckling", ["buckling"], ["Buckling load-factor enclosure"], ["2D buckling", "3D buckling"],
     [("OpenSees", "buckling")], [404, 439]),
    ("Modal", ["modal", "certified modal"], ["Modal enclosures and completeness"], ["2D modal", "3D modal"],
     [("Frame3DD", "modal"), ("MYSTRAN", "modal"), ("OpenSees", "modal")], [338, 341, 405]),
    ("Response spectrum (SRSS / CQC)", ["spectral"], ["Response spectrum (SRSS / CQC)"],
     ["2D response spectrum", "3D response spectrum"], [], [335, 405, 424]),
    ("Time history", ["time history"], ["Time-history integration"], ["2D time history", "3D time history"],
     [("OpenSees", "th")], [425]),
    ("Harmonic (steady state)", ["harmonic"], ["Harmonic (steady-state) response"],
     ["Harmonic response (2D/3D)"], [], []),
    ("Plastic collapse (2D, 3D)", ["plastic collapse"],
     ["Plastic collapse load factor", "Plastic collapse load factor, 3D"],
     ["Plastic collapse / hinge sequencing"], [], []),
    ("Co-rotational (geometric nonlinear)", ["corotational", "corotational (sparse path)"], [],
     ["2D geometric nonlinear (corotational)", "3D geometric nonlinear"], [], [426, 442]),
    ("Material nonlinear", ["material nonlinear", "material nonlinear (sparse path)"], [],
     ["2D material nonlinear", "3D material nonlinear"], [], [427, 428, 429]),
    ("Fiber nonlinear", ["fiber nonlinear"], [], ["Fiber nonlinear (2D/3D)"], [], [420, 433]),
    ("Arc length", ["arc length"], [], ["Nonlinear solution controls"], [], []),
    ("Displacement control", ["displacement control"], [], ["Nonlinear solution controls"], [], []),
    ("Staged construction", ["staged (one stage)"], [], ["Construction staging"], [], []),
    ("Winkler foundation", ["Winkler (no foundation)"], [], ["Winkler foundation solvers (2D/3D)"], [], [444]),
    ("Contact / gaps", ["contact (no gaps)"], [], ["Contact / gap / unilateral support behavior"], [], [432]),
    ("Soil-structure interaction (p-y, t-z, q-z)", ["SSI (no soil springs)"], [],
     ["Nonlinear SSI beyond Winkler"], [], [421, 422, 423]),
    ("Creep and shrinkage", ["creep & shrinkage (t = t0)"], [], ["Creep / shrinkage / relaxation response"], [], []),
    ("Cable solver", ["cable solver"], [], ["Cable / catenary element"], [], [416, 417]),
    ("Guyan reduction", ["Guyan reduction"], [], ["Model reduction / substructuring"], [], []),
    ("Craig–Bampton", ["Craig–Bampton"], [], ["Model reduction / substructuring"], [], []),
    ("Kinematic / mechanism check", ["kinematic check"], [], ["Kinematic / mechanism diagnostics"], [],
     [338, 369]),
    ("Moving loads", ["moving loads"], [], ["Moving loads / influence workflows (2D/3D)"], [], []),
    ("Influence lines", ["influence line"], [], ["Moving loads / influence workflows (2D/3D)"], [], []),
]

ELEMENTS = [
    # name, source file, feature-matrix feature names, SYMBOLIC kernels, BENCHMARKS rows, differential, issues
    ("Frame, Euler–Bernoulli (2D, 3D)", "engine/src/element/frame.rs", ["baseline frame"],
     ["frame_local_stiffness_2d", "frame_local_stiffness_3d"], ["2D frame / truss elements", "3D frame / truss elements"],
     ["Frame3DD", "PyNite", "MYSTRAN", "Kratos", "CalculiX", "OpenSees", "Code_Aster"], [404, 407]),
    ("Truss", "engine/src/element/truss.rs", ["truss element"], ["truss_local_stiffness_2d/3d"],
     ["2D frame / truss elements", "3D frame / truss elements"], ["PyNite", "MYSTRAN", "Kratos", "OpenSees"], []),
    ("Frame, Timoshenko (shear deformable)", "engine/src/element/frame.rs", ["Timoshenko shear area"],
     ["frame_local_stiffness_2d"], ["Timoshenko beam / shear deformation"], ["MYSTRAN", "Kratos", "OpenSees"], [406]),
    ("Warping torsion (7th DOF)", "engine/src/element/frame.rs", ["warping torsion"],
     ["frame_local_stiffness_3d_warping"], ["Warping torsion / 7th DOF"], [], [408, 439]),
    ("Curved beam", "engine/src/element/curved_beam.rs", ["curved beam"], [], ["Curved beams"], [], [418]),
    ("Connector (spring element)", "engine/src/element/connector.rs", ["connector"], [], [], ["Code_Aster"], [419]),
    ("Cable / catenary", "engine/src/element/cable.rs", [], [], ["Cable / catenary element"], [], [414, 415, 416, 417]),
    ("Fiber beam-column", "engine/src/element/fiber_beam.rs", [], [], ["Fiber / section-based beam-column elements"], [],
     [420, 433]),
    ("Plate, DKT triangle", "engine/src/element/plate.rs", ["plate (DKT triangle)"], [], ["Plate / shell triangles"],
     ["OpenSees"], [409]),
    ("Shell, MITC4 quad", "engine/src/element/quad.rs", ["quad shell (MITC4)"], [], ["MITC4 quadrilateral shell element"],
     ["OpenSees"], [413]),
    ("Shell, MITC9 quad", "engine/src/element/quad9.rs", ["quad9 shell (MITC9)"], [],
     ["MITC9 9-node quadrilateral shell element"], [], [411, 412]),
    ("Curved shell", "engine/src/element/curved_shell.rs", ["curved shell"], [], ["Curved shell element"], [], [410]),
    ("Solid shell, SHB8-ANS", "engine/src/element/solid_shell.rs", ["solid shell"], [],
     ["SHB8-ANS 8-node solid-shell element"], [], [400]),
]

DESIGN_CHECKS = [
    # name, certify fn, DESIGN_EXAMPLES section, TS_ENGINE_LOGIC differential key, test grep key, issues
    {"name": "AISC 360 steel (`steel_check`)", "certify_fn": "certify_steel_members",
     "examples": "AISC 360 (`steel_check`, Rust)", "diff": None, "test": "steel_check", "issues": [366]},
    {"name": "EN 1993-1-1 steel (`ec3_check`)", "certify_fn": "certify_ec3_members",
     "examples": "EN 1993-1-1 (`ec3_check`, Rust)", "diff": None, "test": "ec3_check", "issues": [366]},
    {"name": "EN 1992-1-1 RC (`ec2_check`)", "certify_fn": "certify_ec2_members",
     "examples": "EN 1992-1-1 (`ec2_check`, Rust)", "diff": None, "test": "ec2_check", "issues": []},
    {"name": "ACI 318-19 RC (`rc_check`)", "certify_fn": "certify_rc_members",
     "examples": "ACI 318-19 (`rc_check`) and CIRSOC 201-2005 (`cirsoc201_check`), Rust", "diff": None,
     "test": "rc_check", "issues": [366]},
    {"name": "CIRSOC 201 RC, engine (`cirsoc201_check`)", "certify_fn": "certify_cirsoc201_members",
     "examples": "ACI 318-19 (`rc_check`) and CIRSOC 201-2005 (`cirsoc201_check`), Rust",
     "diff": "CIRSOC 201 beam sections", "test": "cirsoc201_check", "issues": [366, 390]},
    {"name": "CIRSOC 301 steel, engine (`cirsoc301_check`)", "certify_fn": "certify_cirsoc301_members",
     "examples": "CIRSOC 301-2018 (`cirsoc301.ts`, TS)", "diff": "CIRSOC 301", "test": "cirsoc301",
     "issues": [366, 389, 391]},
    {"name": "NDS timber (`timber_check`)", "certify_fn": "certify_timber_members", "examples": None,
     "diff": None, "test": "timber_check", "issues": [368]},
    {"name": "AISI S100 cold-formed (`cfs_check`)", "certify_fn": "certify_cfs_members", "examples": None,
     "diff": None, "test": "cfs_check", "issues": [368]},
    {"name": "TMS 402 masonry (`masonry_check`)", "certify_fn": "certify_masonry_members", "examples": None,
     "diff": None, "test": "masonry_check", "issues": [367, 368]},
    {"name": "Connections, engine (`connection_check`)", "certify_fn": "certify_connection_members",
     "examples": "Connections (`connection_check`, Rust)", "diff": None, "test": "connection_check",
     "issues": [367]},
    {"name": "Spread footings, engine (`foundation_check`)", "certify_fn": "certify_foundation_members",
     "examples": None, "diff": "Footing shear", "test": "foundation_check", "issues": [367, 393]},
    {"name": "Serviceability (`serviceability`)", "certify_fn": "certify_serviceability_members", "examples": None,
     "diff": "Serviceability", "test": "check_serviceability", "issues": [367]},
    {"name": "CIRSOC 201 legacy designer, TypeScript (`cirsoc201.ts`)", "certify_fn": None,
     "examples": "CIRSOC 201-2005 (`cirsoc201.ts`, TS)", "diff": None, "test": "cirsoc201-inti-examples",
     "issues": [390]},
    {"name": "CIRSOC 301 J welds and bolts, TypeScript (`fillet-weld.ts`, `bolted-joint.ts`)", "certify_fn": None,
     "examples": "Connections (TS)", "diff": None, "test": "fillet-weld-inti", "issues": []},
    {"name": "CIRSOC 201 footings, TypeScript (`foundation-check.ts`, `footing-flexure.ts`)", "certify_fn": None,
     "examples": None, "diff": "Footing shear", "test": "foundation-check", "issues": [393]},
    {"name": "CIRSOC 201-2025 detailing, TypeScript (`codes/cirsoc201/*`)", "certify_fn": None, "examples": None,
     "diff": None, "test": "codes/cirsoc201", "issues": [374]},
]

LEVELS = ["Certified", "Benchmarked", "Differential", "Tested", "Unverified"]


def harness_sources() -> dict:
    """What each differential harness in the repository compares, read from its own files."""
    adapters = {}
    for prog in ("frame3dd", "pynite", "mystran", "kratos", "calculix"):
        m = re.search(r"^ANALYSES\s*=\s*\(([^)]*)\)", read(f"tools/differential/{prog}/adapter.py"), re.M)
        adapters[prog] = set(re.findall(r'"(\w+)"', m.group(1))) if m else set()
    return {"adapters": adapters, "opensees": read("tools/opensees/README.md"),
            "codeaster": read("tools/differential/codeaster/README.md"),
            "docs": {h: bool(read(os.path.normpath(os.path.join("docs/verification", d)))) for h, (d, _) in DIFF.items()}}


def harness_covers(src: dict, h: str, analysis: str) -> bool:
    """Whether harness `h` exists (its README is present) and compares `analysis`."""
    if not src["docs"].get(h):
        return False
    doc, prog = DIFF[h]
    if prog:
        return analysis in src["adapters"].get(prog, set())
    if h == "OpenSees":
        text = src["opensees"]
        if analysis == "static":
            return "linear static" in text.lower() or "member end forces" in text
        cat = OPENSEES_CATEGORY.get(analysis)
        return bool(cat) and re.search(r"^\|\s*" + re.escape(cat) + r"\s*\|", text, re.M) is not None
    if h == "Code_Aster":
        return analysis == "static" and "linear static" in src["codeaster"]
    return False


def maturity(fm, issue_state):
    certify = read("docs/verification/CERTIFY.md")
    certify_h = set(headings(certify))
    bench = section(read("docs/BENCHMARKS.md"), "Solver Capability Matrix")
    bench_rows = {r[0]: r[1] for r in table_rows(bench) if len(r) >= 2}
    symbolic = read("docs/verification/SYMBOLIC.md")
    examples = read("docs/verification/DESIGN_EXAMPLES.md")
    ts_logic = section(read("docs/verification/TS_ENGINE_LOGIC.md"), "2. Differential tests, TypeScript against Rust")

    hsrc = harness_sources()

    def harness_does(h, analysis):
        return harness_covers(hsrc, h, analysis)

    def bench_ok(names):
        hits = [n for n in names if bench_rows.get(n) in ("Strong", "Good")]
        for n in names:
            if n not in bench_rows:
                warn(f"BENCHMARKS.md capability row missing: {n}")
        return hits

    def open_issues(nums):
        keep = []
        for n in nums:
            st = issue_state.get(str(n)) or issue_state.get(n)
            if st is None or st.get("state", "open").lower() == "open":
                keep.append(n)
        return keep

    def level(ev):
        for lv in LEVELS[:-1]:
            if ev.get(lv):
                return lv
        return "Unverified"

    rows = {"analyses": [], "elements": [], "design": []}

    for name, fm_rows, cert_h, bench_names, diffs, issues in ANALYSES:
        ev = {}
        missing_h = [h for h in cert_h if h not in certify_h]
        for h in missing_h:
            warn(f"CERTIFY.md heading missing: {h}")
        present = [h for h in cert_h if h in certify_h]
        if present:
            ev["Certified"] = ", ".join(f"[{h}](CERTIFY.md#{slug(h)})" for h in present)
        b = bench_ok(bench_names)
        if b:
            ev["Benchmarked"] = "[BENCHMARKS](../BENCHMARKS.md#solver-capability-matrix): " + "; ".join(
                f"{n} ({bench_rows[n]})" for n in b)
        progs = [h for h, a in diffs if harness_does(h, a)]
        if progs:
            ev["Differential"] = ", ".join(f"[{h}]({DIFF[h][0]})" for h in progs)
        dims = []
        for dim in ("2D", "3D"):
            if any("✓" in fm[dim]["analyses"].get(r, []) for r in fm_rows):
                dims.append(dim)
        if dims:
            ev["Tested"] = "[feature matrix](FEATURE_MATRIX.md) " + ", ".join(
                f"[{d}](FEATURE_MATRIX.md#{d.lower()})" for d in dims)
        elif fm_rows:
            warn(f"feature-matrix rows not found or without ✓: {fm_rows}")
        rows["analyses"].append({"name": name, "level": level(ev), "evidence": ev, "issues": open_issues(issues)})

    fm_features = {}
    fm_text = read("docs/verification/FEATURE_MATRIX.md")
    for dim in ("2D", "3D"):
        body = section(fm_text, dim)
        feats = dict((m.group(2), int(m.group(1))) for m in re.finditer(r"^- \*\*F(\d+)\*\* (.+)$", body, re.M))
        fm_features[dim] = feats

    for name, src, feats, kernels, bench_names, harnesses, issues in ELEMENTS:
        ev = {}
        if not os.path.exists(os.path.join(ROOT, src)):
            warn(f"element source missing: {src}")
        k = [x for x in kernels if f"`{x}`" in symbolic or x in symbolic]
        if k:
            ev["Certified"] = "[symbolic derivation](SYMBOLIC.md): " + ", ".join(f"`{x}`" for x in k)
        b = bench_ok(bench_names)
        if b:
            ev["Benchmarked"] = "[BENCHMARKS](../BENCHMARKS.md#solver-capability-matrix): " + "; ".join(
                f"{n} ({bench_rows[n]})" for n in b)
        live = [h for h in harnesses if harness_does(h, "static")]
        for h in set(harnesses) - set(live):
            warn(f"element {name}: differential harness {h} not found or not comparing static results")
        if live:
            ev["Differential"] = ", ".join(f"[{h}]({DIFF[h][0]})" for h in live)
        dims = []
        for dim in ("2D", "3D"):
            for f in feats:
                col = fm_features[dim].get(f)
                if col is None:
                    continue
                if any(len(cells) >= col and cells[col - 1] == "✓" for cells in fm[dim]["analyses"].values()):
                    dims.append(dim)
                    break
        if dims:
            ev["Tested"] = "[feature matrix](FEATURE_MATRIX.md) " + ", ".join(
                f"[{d}](FEATURE_MATRIX.md#{d.lower()})" for d in dims)
        elif os.path.exists(os.path.join(ROOT, src)):
            ev["Tested"] = f"engine tests of `{os.path.basename(src)}`" if git_grep_files(
                os.path.basename(src)[:-3], "engine/tests") else ""
            if not ev["Tested"]:
                del ev["Tested"]
        rows["elements"].append({"name": name, "level": level(ev), "evidence": ev, "issues": open_issues(issues)})

    cert_sec = section(certify, "Certified design checks")
    tracked_tests = [f for f in subprocess.run(["git", "ls-files", "engine/tests", "web/src"], cwd=ROOT,
                                               capture_output=True, text=True).stdout.splitlines()
                     if "/tests/" in f or "__tests__" in f or ".test." in f]
    for c in DESIGN_CHECKS:
        ev = {}
        if c["certify_fn"] and c["certify_fn"] in cert_sec:
            ev["Certified"] = f"[`{c['certify_fn']}`](CERTIFY.md#certified-design-checks)"
        if c["examples"]:
            body = section(examples, c["examples"])
            if not body:
                warn(f"DESIGN_EXAMPLES.md section missing: {c['examples']}")
            st = [r[-1].replace("*", "").lower() for r in table_rows(body) if r and r[0] != "Clause"]
            n_ok = sum(1 for s in st if s.startswith(("pass", "fixed", "doc")))
            if n_ok:
                ev["Benchmarked"] = (f"[worked examples](DESIGN_EXAMPLES.md#{slug(c['examples'])}): "
                                     f"{n_ok} of {len(st)} clauses against published examples")
        if c["diff"] and c["diff"] in ts_logic:
            ev["Differential"] = (f"[TypeScript vs Rust](TS_ENGINE_LOGIC.md#2-differential-tests-typescript-against-rust): "
                                  f"{c['diff']}")
        if c["test"] and (git_grep_files(c["test"], "engine/tests", "web/src") or any(
                c["test"] in f for f in tracked_tests)):
            ev["Tested"] = f"tests referencing `{c['test']}`"
        rows["design"].append({"name": c["name"], "level": level(ev), "evidence": ev,
                               "issues": open_issues(c["issues"])})
    return rows


def catalog_issues() -> set[int]:
    return ({n for row in ANALYSES for n in row[5]} | {n for row in ELEMENTS for n in row[6]}
            | {n for c in DESIGN_CHECKS for n in c["issues"]})


def unmapped_safety(open_safety: list[dict], catalog: set[int]) -> list[dict]:
    """Open `safety` issues that no maturity row names. They are listed in MATURITY.md and counted
    on the dashboard, so a new defect cannot vanish from the matrix because nobody mapped it; map
    each defect to the rows it affects (backlog / process items may stay unmapped)."""
    return [i for i in open_safety if i["number"] not in catalog]


# --------------------------------------------------------------------------- output


def issue_link(n):
    return f"[#{n}](https://github.com/{REPO}/issues/{n})"


def write_maturity(rows, generated, commit, unmapped=None):
    lines = [
        "# Verification maturity matrix",
        "",
        "Generated by [`scripts/verification-metrics.py`](../../scripts/verification-metrics.py); do not edit by",
        "hand. Regenerate with `scripts/verification-metrics.py` (CI does it weekly and on release tags).",
        f"Generated {generated} at `{commit}`.",
        "",
        "For every analysis, element family and design check: the **highest** verification level it has",
        "reached, and the evidence for every level it has. The app's result badges use exactly these",
        "levels ([#440](https://github.com/lambdaclass/stabileo/issues/440)).",
        "",
        "| Level | Meaning | Evidence source |",
        "|---|---|---|",
        "| **Certified** | The result carries a machine-checked bound (analyses, design checks: an interval certificate, its checker proved in Lean), or the element matrices are checked exactly against a first-principles derivation (elements) | [CERTIFY.md](CERTIFY.md), [SYMBOLIC.md](SYMBOLIC.md) |",
        "| **Benchmarked** | Reproduces published reference values (textbook, benchmark report, published worked example) | [BENCHMARKS.md](../BENCHMARKS.md) capability matrix (rows rated Strong or Good), [DESIGN_EXAMPLES.md](DESIGN_EXAMPLES.md); the acceptance suite (#337) when merged |",
        "| **Differential** | Agrees with an independent implementation (another FE program, or an independent TypeScript statement of the clause) | [tools/differential](../../tools/differential/README.md), [tools/opensees](../../tools/opensees/README.md), [TS_ENGINE_LOGIC.md](TS_ENGINE_LOGIC.md) §2 |",
        "| **Tested** | Covered by tests against an independent reference in the feature matrix, or by unit/integration tests | [FEATURE_MATRIX.md](FEATURE_MATRIX.md), engine and web tests |",
        "| **Unverified** | None of the above | |",
        "",
        "A level is not a guarantee. A certificate proves the solver solved the system it assembled,",
        "not that the system is the right model (end-to-end certificates are",
        "[#375](https://github.com/lambdaclass/stabileo/issues/375)); a benchmark covers the cases it",
        "covers. The **Open issues** column lists open issues known to affect the item (bold: labelled",
        "`safety`); an item with an open safety issue should not be presented as verified for the",
        "affected cases. The element derivations of #330 (`docs/solver/`) become evidence here when",
        "that PR merges. The Benchmarked column for analyses and elements reads the self-assessed",
        "ratings of the BENCHMARKS.md capability matrix; the acceptance suite (#337), whose every",
        "reference value cites its published source, is meant to replace it as the evidence.",
        "",
    ]
    titles = {"analyses": "Analyses", "elements": "Element families", "design": "Design checks"}
    for key in ("analyses", "elements", "design"):
        lines += [f"## {titles[key]}", "",
                  "| Item | Highest level | Certified | Benchmarked | Differential | Tested | Open issues |",
                  "|---|---|---|---|---|---|---|"]
        for r in rows[key]:
            ev = r["evidence"]
            iss = ", ".join(issue_link(n) for n in r["issues"]) or "—"
            cells = [ev.get(lv, "—") for lv in LEVELS[:-1]]
            lines.append(f"| {r['name']} | **{r['level']}** | " + " | ".join(cells) + f" | {iss} |")
        counts = {lv: sum(1 for r in rows[key] if r["level"] == lv) for lv in LEVELS}
        lines += ["", "Totals: " + ", ".join(f"{lv} {n}" for lv, n in counts.items() if n), ""]
    if unmapped is not None:
        lines += ["## Open `safety` issues not mapped to an item", "",
                  "Every open `safety` issue that no row above names. Defects belong on the rows they affect",
                  "(edit the catalog in `scripts/verification-metrics.py`); backlog and process items may stay here.", ""]
        lines += [f"- {issue_link(i['number'])} {i['title']}" for i in unmapped] or ["None."]
        lines.append("")
    with open(OUT_MATURITY, "w", encoding="utf-8") as f:
        f.write("\n".join(lines))


def bold_safety(text, safety):
    return re.sub(r"\[#(\d+)\]\(([^)]+)\)",
                  lambda m: f"**[#{m.group(1)}]({m.group(2)})**" if int(m.group(1)) in safety else m.group(0), text)


HISTORY_KEYS = ["safety_open", "rust_share", "ts_high_safety", "certified_analyses", "certified_design", "acceptance_refs",
                "mutation_rust", "mutation_ts", "coverage_lines", "differential_compared", "fuzz_execs", "fm_bad"]


def write_dashboard(doc):
    m = doc["metrics"]
    lines = [
        "# Verification dashboard",
        "",
        "Generated by [`scripts/verification-metrics.py`](../../scripts/verification-metrics.py) from the",
        "repository, GitHub issues and the latest CI artifacts on `main`; do not edit by hand. The same",
        "data is in [`dashboard.json`](dashboard.json) for the app and the docs site. CI regenerates it",
        "weekly and on every release tag ([workflow](../../.github/workflows/verification-dashboard.yml)).",
        "**\"not yet measured\" means exactly that**: no value is estimated or typed in.",
        "",
        f"Generated {doc['generated']} at commit `{doc['commit']}`.",
        "",
        "These are the metrics behind the exit criteria of the backlog sections of",
        "[PRODUCT_ROADMAP.md](../roadmap/PRODUCT_ROADMAP.md). Per-item verification levels are in",
        "[MATURITY.md](MATURITY.md).",
        "",
        "## Current values",
        "",
        "| Metric | Value | Roadmap section | Source / note |",
        "|---|---|---|---|",
    ]
    for k, v in m.items():
        note = "; ".join(x for x in (v["source"], v["note"]) if x)
        lines.append(f"| {v['label']} | **{v['display']}** | {v['section']} | {note} |")
    lines += ["", "## History", "",
              "One row per release, from the snapshots in [`releases/`](releases/): each is measured on the "
              "tagged revision (`--record <tag>` from a checkout of the tag; CI does it on every release tag).", ""]
    hist = doc.get("history", [])
    if hist:
        hdr = ["Release", "Measured", "Commit"] + [m[k]["label"] for k in HISTORY_KEYS if k in m]
        lines += ["| " + " | ".join(hdr) + " |", "|" + "---|" * len(hdr)]
        for h in hist:
            vals = [h["values"].get(k, "—") for k in HISTORY_KEYS if k in m]
            lines.append(f"| {h['release']} | {h['date']} | `{h['commit']}` | " + " | ".join(vals) + " |")
    else:
        lines.append("No release recorded yet.")
    d = doc["details"]
    lines += ["", "## Details", ""]
    if d.get("safety_issues") is not None:
        lines += ["### Open `safety` issues", ""]
        lines += [f"- {issue_link(i['number'])} {i['title']}" for i in d["safety_issues"]] or ["None."]
        lines.append("")
    if d.get("differential"):
        lines += ["### Differential testing (latest report per harness on `main`)", "",
                  "| Harness | Run | Models | Compared | Agree (ok) | Mismatch | Other statuses |",
                  "|---|---|---|---|---|---|---|"]
        for prog, r in sorted(d["differential"].items()):
            other = ", ".join(f"{s} {n}" for s, n in sorted(r["statuses"].items())
                              if s not in ("ok", "mismatch", "known"))
            lines.append(f"| {prog} | [{r['date']}]({r['run']}) | {r['total']} | {r['compared']} | {r['ok']} | "
                         f"{r['mismatch']} | {other} |")
        lines += ["", "*Compared* counts models where both programs produced a comparable answer "
                  "(ok, mismatch, or known); ill-conditioned, unsupported and refused models are reported but "
                  "not compared ([statuses](../../tools/differential/README.md#statuses)).", ""]
    fmc = d.get("feature_matrix")
    if fmc:
        lines += ["### Feature-matrix cells by status", "", "| Status | 2D | 3D |", "|---|---|---|"]
        syms = sorted(set(fmc["2D"]) | set(fmc["3D"]))
        for s in syms:
            lines.append(f"| `{s}` | {fmc['2D'].get(s, 0)} | {fmc['3D'].get(s, 0)} |")
        lines += ["", "Symbols as in [FEATURE_MATRIX.md](FEATURE_MATRIX.md): ✓ supported and matches an "
                  "independent reference, R refused by name, ~ no independent reference, · not applicable; "
                  "E, IGN, BAD and K must stay at zero.", ""]
    ts = d.get("ts")
    if ts:
        lines += ["### Engineering logic: Rust vs TypeScript", "",
                  "| Where | Modules | Lines |", "|---|---|---|",
                  f"| Rust engine (`engine/src`, all lines incl. unit tests) | — | {ts['rust_lines']} |"]
        names = {"a": "TypeScript (a) delegates to WASM", "b": "TypeScript (b) duplicates a Rust check",
                 "c": "TypeScript (c) TypeScript-only engineering arithmetic", "d": "TypeScript (d) search / presentation"}
        for c in "abcd":
            lines.append(f"| {names[c]} | {ts['by_class'][c]['modules']} | {ts['by_class'][c]['lines']} |")
        u = ts["unclassified"]
        lines.append(f"| TypeScript not yet classified in TS_ENGINE_LOGIC.md | {u['modules']} | {u['lines']} |")
        lines += ["", "Classes from the inventory in [TS_ENGINE_LOGIC.md](TS_ENGINE_LOGIC.md); line counts are "
                  "recomputed from the files. The Rust share is Rust lines / (Rust lines + TypeScript (b) + (c)).", ""]
        if ts["missing"]:
            lines += ["Inventory entries whose file no longer exists: " + ", ".join(f"`{x}`" for x in ts["missing"]), ""]
    if d.get("design_examples"):
        lines += ["### Design checks against published worked examples (clause rows)", "",
                  ", ".join(f"{k} {v}" for k, v in sorted(d["design_examples"].items())), "",
                  "From [DESIGN_EXAMPLES.md](DESIGN_EXAMPLES.md): pass, fixed (was wrong, now matches), doc (deliberate, "
                  "documented deviation), ex (the example is wrong), open (disagreement not fixed), uncovered (no "
                  "published example found), clause test (hand-derived from the clause).", ""]
    rm = d.get("rust_mutants")
    if rm:
        lines += ["### Rust mutation testing (cargo-mutants, newest nightly on `main`)", "",
                  f"[Run {rm['date']}]({rm['run']}), {rm['shards']} shards: caught {rm['caught']}, missed {rm['missed']}, "
                  f"timeout {rm['timeout']}, unviable {rm['unviable']}; {rm['tested']} of {rm['planned']} planned "
                  "mutants tested. Missed mutants fail the job and are triaged in "
                  "[FUZZ_MUTANTS.md](FUZZ_MUTANTS.md).", ""]
    with open(OUT_MD, "w", encoding="utf-8") as f:
        f.write("\n".join(lines))


# --------------------------------------------------------------------------- main


def resolve_tag(name: str) -> str:
    """Short commit of refs/tags/<name>, or "" when there is no such tag."""
    return subprocess.run(["git", "rev-parse", "--verify", "--quiet", "--short=10", f"refs/tags/{name}^{{commit}}"],
                          cwd=ROOT, capture_output=True, text=True).stdout.strip()


def check_record(release: str, head: str, tag_commit: str, allow_untagged: bool) -> str | None:
    """Why --record must not run (None when it may): the tag must exist and be HEAD."""
    if allow_untagged:
        return None
    if not tag_commit:
        return (f"--record {release}: no tag refs/tags/{release} (mistyped, or not fetched); "
                "pass --allow-untagged-record to record HEAD anyway")
    if tag_commit != head:
        return (f"--record {release}: HEAD is {head}, the tag is {tag_commit}; check out the tag "
                "(or pass --allow-untagged-record)")
    return None


def write_release(directory: str, row: dict) -> str:
    """Write one release snapshot. Snapshots are one file per release, so a run that starts from a
    main without some pending snapshot never deletes it (the workflow also carries over the
    snapshots of the pending automation PR)."""
    os.makedirs(directory, exist_ok=True)
    if not re.fullmatch(r"[A-Za-z0-9._-]+", row["release"]):
        raise ValueError(f"bad release name {row['release']!r}")
    path = os.path.join(directory, f"{row['release']}.json")
    with open(path, "w", encoding="utf-8") as f:
        json.dump(row, f, indent=1, ensure_ascii=False)
        f.write("\n")
    return path


def _version_key(name: str):
    return [int(x) if x.isdigit() else x for x in re.split(r"(\d+)", name)]


def load_history(directory: str) -> list[dict]:
    rows = []
    for p in glob.glob(os.path.join(directory, "*.json")):
        with open(p, encoding="utf-8") as f:
            rows.append(json.load(f))
    return sorted(rows, key=lambda r: _version_key(r["release"]))


S_TRUST, S_COV, S_PROOF, S_REL, S_MULT = ("Trust and verification", "Engineering coverage",
                                          "Solver and proof depth", "Release safety", "Multipliers")


CI_KEYS = {"differential_compared", "mutation_rust", "mutation_ts", "fuzz_execs", "coverage_lines",
           "coverage_branches"}


def with_sha(m: dict, shas) -> dict:
    """Record the commit(s) the CI evidence of a metric was measured on."""
    m["evidence_sha"] = sorted({x for x in shas if x})
    return m


def retained(prev: dict, key: str, label: str, section_name: str, why: str, record_sha: str | None = None) -> dict:
    """A metric carried over from the previous dashboard (offline run, GitHub unreachable), marked
    `retained` with where it came from. When recording a release, a CI metric is carried over only
    if all its evidence was measured on the release commit; otherwise it is not measured."""
    p = prev.get("metrics", {}).get(key)
    if not p or p.get("status") == "not_measured" or p.get("value") is None:
        return metric(label, status="not_measured", note=why, section=section_name)
    if record_sha is not None and key in CI_KEYS:
        shas = p.get("evidence_sha") or []
        if not shas or any(x != record_sha for x in shas):
            return metric(label, status="not_measured", section=section_name,
                          note=f"{why}; the previous value was not measured on the release commit")
    p = dict(p)
    base = re.sub(r"\s*\(retained from .*\)$", "", p.get("note", ""))
    p["note"] = (base + f" (retained from {prev.get('generated', 'previous run')}; {why})").strip()
    p["status"] = "retained"
    return p


def snapshot_value(m: dict) -> str:
    return m["display"] + (" (retained)" if m.get("status") == "retained" else "")


def count_metrics() -> dict:
    out = {}
    for key, label, pat, paths, src in (
            ("engine_tests", "Engine `#[test]` functions", r"^[[:space:]]*#\[test\]", ("engine",), "git grep engine"),
            ("kani_harnesses", "Kani harnesses", r"kani::proof", ("engine",), "git grep `kani::proof`"),
            ("lean_theorems", "Lean theorems and lemmas", r"^[[:space:]]*(theorem|lemma) ", ("*.lean",),
             "verify/*.lean")):
        n = git_grep_count(pat, *paths)
        out[key] = metric(label, n, section=S_PROOF, source=src,
                          note="" if n else "git grep failed or found nothing")
    return out


def certified_metrics(rows) -> dict:
    out = {}
    have = bool(read("docs/verification/CERTIFY.md"))
    for key, lab in (("analyses", "certified_analyses"), ("design", "certified_design")):
        label = f"{'Analyses' if key == 'analyses' else 'Design checks'} certified"
        if not have or not rows.get(key):
            out[lab] = metric(label, status="not_measured", section=S_TRUST,
                              note="CERTIFY.md or the maturity catalog missing")
            continue
        n = sum(1 for r in rows[key] if r["level"] == "Certified")
        out[lab] = metric(label, n, display=f"{n} of {len(rows[key])} ({pct(n, len(rows[key]))} %)",
                          section=S_TRUST, source="MATURITY.md (CERTIFY.md)")
    return out


def ts_metrics(ts) -> dict:
    """Rust vs TypeScript metrics; not measured when the inventory could not be read (an empty
    inventory would otherwise read as "100 % Rust")."""
    labels = {"rust_share": "Engineering logic in Rust (share of lines)",
              "ts_high_safety": "TypeScript (b)+(c) modules rated high safety",
              "ts_engineering_lines": "TypeScript engineering arithmetic, classes (b)+(c) (lines)"}
    if sum(c["modules"] for c in ts["by_class"].values()) == 0 or not ts["rust_lines"]:
        return {k: metric(l, status="not_measured", section=S_COV,
                          note="TS_ENGINE_LOGIC.md inventory or engine/src missing or unreadable")
                for k, l in labels.items()}
    ts_eng = ts["by_class"]["b"]["lines"] + ts["by_class"]["c"]["lines"]
    share = pct(ts["rust_lines"], ts["rust_lines"] + ts_eng)
    return {
        "rust_share": metric(labels["rust_share"], share, display=f"{share} %", section=S_COV,
                             source="engine/src vs TS_ENGINE_LOGIC.md classes (b)+(c)",
                             note=f"TypeScript (b)+(c): {ts_eng} lines in "
                                  f"{ts['by_class']['b']['modules'] + ts['by_class']['c']['modules']} modules; "
                                  f"{ts['unclassified']['modules']} TS modules not yet classified"),
        "ts_high_safety": metric(labels["ts_high_safety"], ts["high_bc"]["modules"],
                                 display=f"{ts['high_bc']['modules']} modules, {ts['high_bc']['lines']} lines",
                                 section=S_COV, source="TS_ENGINE_LOGIC.md inventory (Safety column)"),
        "ts_engineering_lines": metric(labels["ts_engineering_lines"], ts_eng, section=S_COV,
                                       source="TS_ENGINE_LOGIC.md inventory, recounted"),
    }


def fm_metrics(fm) -> dict:
    """Feature-matrix metrics; not measured when no cell could be read (zero cells would otherwise
    read as "0 BAD cells")."""
    total = {}
    for d in fm:
        for sym, n in fm[d]["counts"].items():
            total[sym] = total.get(sym, 0) + n
    if not total:
        why = "FEATURE_MATRIX.md missing or unreadable"
        return {"fm_cells": metric("Feature-matrix cells (2D + 3D)", status="not_measured", note=why, section=S_COV),
                "fm_bad": metric("Feature-matrix cells E / IGN / BAD / K", status="not_measured", note=why,
                                 section=S_COV)}
    bad = sum(total.get(sym, 0) for sym in ("E", "IGN", "BAD", "K"))
    return {"fm_cells": metric("Feature-matrix cells (2D + 3D)", sum(total.values()),
                               display=", ".join(f"{k} {n}" for k, n in sorted(total.items())), section=S_COV,
                               source="FEATURE_MATRIX.md"),
            "fm_bad": metric("Feature-matrix cells E / IGN / BAD / K", bad, section=S_COV, source="FEATURE_MATRIX.md")}


def ci_metrics(gh, max_runs: int):
    """Metrics from CI artifacts (honouring gh.require_sha). A metric is left out (and later written
    as not measured) when no usable artifact exists or its value is undefined."""
    M, details = {}, {}
    diff = differential(gh, max_runs)
    details["differential"] = diff
    if diff:
        comp = sum(r["compared"] for r in diff.values())
        ok = sum(r["ok"] for r in diff.values())
        mis = sum(r["mismatch"] for r in diff.values())
        M["differential_compared"] = with_sha(metric(
            "Differential models compared (latest run per harness)", comp,
            display=f"{comp} ({ok} agree, {mis} mismatch)", section=S_TRUST,
            source=", ".join(sorted(diff)),
            note="see Details; no report yet: " + (", ".join(
                h for h in ("frame3dd", "pynite", "mystran", "kratos", "calculix", "opensees", "codeaster")
                if h not in diff) or "none")), [r["sha"] for r in diff.values()])
    rm = rust_mutants(gh, max_runs)
    details["rust_mutants"] = rm
    sc = pct(rm["caught"], rm["caught"] + rm["missed"]) if rm else None
    if sc is not None:
        partial = not rm["complete"]
        size = (f"{rm['tested']} of {rm['planned']} mutants tested" if rm["plan_known"]
                else f"{rm['tested']} mutants tested, plan unknown")
        if rm["shards_missing"] is None:
            size += "; number of shards unknown"
        elif rm["shards_missing"]:
            size += f"; {rm['shards']} of {rm['shards_expected']} shards reported"
        M["mutation_rust"] = with_sha(metric(
            "Mutation score, Rust (cargo-mutants)", sc,
            display=f"{sc} %" + (f" (partial: {size})" if partial else ""),
            section=S_PROOF, status="partial" if partial else "measured",
            source=f"nightly.yml [{rm['date']}]({rm['run']})",
            note=f"caught/(caught+missed); {rm['shards']} shards; jobs: "
                 + ", ".join(sorted(set(str(v) for v in rm["jobs"].values())))), [rm["sha"]])
    rot = None if getattr(gh, "require_sha", None) else mutants_rotation(gh, dt.datetime.now(dt.timezone.utc))
    details["mutants_rotation"] = rot
    if rot:
        M["mutation_rotation"] = metric(
            f"Rust mutants shards tested in the last {rot['promise_days']} days", rot["fresh"],
            display=f"{rot['fresh']} of {rot['total']}" + ("" if rot["ok"] else f" (stale: {shard_ranges(rot['stale'])})"),
            section=S_PROOF, status="measured" if rot["ok"] else "partial",
            source="nightly.yml mutants-done-*",
            note=f"{rot['slots']} shards a night, a full pass every {rot['nights_per_pass']} nights; "
                 f"promise: every shard within {rot['promise_days']} days")
    tm = ts_mutants(gh, max_runs)
    details["ts_mutants"] = tm
    if tm and tm.get("score") is not None:
        M["mutation_ts"] = with_sha(metric("Mutation score, TypeScript (Stryker)", tm["score"],
                                           display=f"{tm['score']} %", section=S_COV,
                                           source=f"mutation-ts.yml [{tm['date']}]({tm['run']})"), [tm["sha"]])
    fz = fuzz_execs(gh, max_runs)
    if fz:
        M["fuzz_execs"] = with_sha(metric("Fuzz executions (latest nightly)", fz["total"], section=S_TRUST,
                                          source="verify.yml fuzz-stats-*"), fz["shas"])
    return M, details


def check_mutants_rotation(gh, now) -> int:
    rot = mutants_rotation(gh, now)
    if rot is None:
        print("mutants rotation: cannot read nightly.yml runs or the MUTANTS_TOTAL/MUTANTS_SLOTS plan")
        return 1
    print(f"mutants rotation: {rot['fresh']} of {rot['total']} shards ran to their verdict since {rot['since']} "
          f"({rot['slots']} a night, a pass every {rot['nights_per_pass']} nights)")
    if rot["nights_per_pass"] > rot["promise_days"]:
        print(f"a pass takes {rot['nights_per_pass']} nights, more than the {rot['promise_days']}-day promise")
        return 1
    if rot["stale"]:
        print(f"stale shards: {shard_ranges(rot['stale'])}")
        return 1
    return 0


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--offline", action="store_true", help="repository only; keep GitHub values from dashboard.json")
    ap.add_argument("--record", metavar="RELEASE",
                    help="write docs/verification/releases/RELEASE.json; HEAD must be the tag's commit")
    ap.add_argument("--allow-untagged-record", dest="allow_untagged", action="store_true",
                    help="allow --record when HEAD is not the tag's commit (the row records HEAD)")
    ap.add_argument("--max-runs", type=int, default=15, help="CI runs to look back per workflow")
    ap.add_argument("--coverage-json", help="local `cargo llvm-cov --json --summary-only` output")
    ap.add_argument("--check-mutants-rotation", action="store_true",
                    help=f"only check that every mutants shard ran within {MUTANTS_PROMISE_DAYS} days; exit 1 if not")
    a = ap.parse_args()
    if a.check_mutants_rotation:
        sys.exit(check_mutants_rotation(GH(False), dt.datetime.now(dt.timezone.utc)))
    if a.record:  # fail before spending minutes on GitHub calls
        head = subprocess.run(["git", "rev-parse", "--short=10", "HEAD"], cwd=ROOT, capture_output=True,
                              text=True).stdout.strip()
        err = check_record(a.record, head, resolve_tag(a.record), a.allow_untagged)
        if err:
            sys.exit(err)

    prev = {}
    if os.path.exists(OUT_JSON):
        with open(OUT_JSON, encoding="utf-8") as f:
            prev = json.load(f)
    gh = GH(a.offline)
    commit = subprocess.run(["git", "rev-parse", "--short=10", "HEAD"], cwd=ROOT, capture_output=True,
                            text=True).stdout.strip()
    now = dt.datetime.now(dt.timezone.utc).strftime("%Y-%m-%d %H:%M UTC")
    M, details = {}, {}

    record_sha = None
    if a.record:
        record_sha = subprocess.run(["git", "rev-parse", "HEAD"], cwd=ROOT, capture_output=True,
                                    text=True).stdout.strip()

    def keep_prev(key, label, section_name, why):
        return retained(prev, key, label, section_name, why, record_sha)


    # Safety issues and roadmap issues
    issue_state = prev.get("issue_state", {})
    if gh.ok:
        try:
            open_safety = gh.issues("safety", "open")
            closed_safety = gh.issues("safety", "closed")
            M["safety_open"] = metric("Open `safety` issues", len(open_safety), section=S_REL,
                                      source="GitHub label `safety`", note=f"{len(closed_safety)} closed")
            details["safety_issues"] = [{"number": i["number"], "title": i["title"]}
                                        for i in sorted(open_safety, key=lambda i: i["number"])]
            adv = gh.issues("safety-advisory", "all")
            M["advisories"] = metric("Safety advisories published (GitHub)", len(adv), section=S_REL,
                                     source="GitHub label `safety-advisory`")
            for lab in ("roadmap:multiplier", "roadmap:verification", "roadmap:coverage", "roadmap:solver-proofs",
                        "roadmap:release-safety"):
                o, c = len(gh.issues(lab, "open")), len(gh.issues(lab, "closed"))
                if o + c == 0:
                    continue  # label missing or renamed: not measured, never "0 of 0"
                sec = {"roadmap:multiplier": S_MULT, "roadmap:verification": S_TRUST, "roadmap:coverage": S_COV,
                       "roadmap:solver-proofs": S_PROOF, "roadmap:release-safety": S_REL}[lab]
                M[f"issues_{lab.split(':')[1]}"] = metric(f"Backlog issues closed (`{lab}`)", c,
                                                          display=f"{c} of {o + c}", section=sec,
                                                          source=f"GitHub label `{lab}`")
        except Exception as ex:
            warn(f"GitHub issues: {ex}")
    for key, label, sec in (("safety_open", "Open `safety` issues", S_REL),):
        if key not in M:
            M[key] = keep_prev(key, label, sec, "GitHub not reachable")
    if "safety_issues" not in details:
        details["safety_issues"] = prev.get("details", {}).get("safety_issues")

    # Rust vs TypeScript
    ts = ts_engine_logic()
    details["ts"] = ts
    M.update(ts_metrics(ts))

    # Feature matrix
    fm = feature_matrix()
    details["feature_matrix"] = {d: fm[d]["counts"] for d in fm}
    M.update(fm_metrics(fm))

    # Maturity (also gives certified shares)
    issue_nums = catalog_issues()
    if gh.ok:
        st = gh.issue_states(issue_nums)
        issue_state = {str(k): v for k, v in st.items()} or issue_state
    rows = maturity(fm, issue_state)
    M.update(certified_metrics(rows))
    lv = {k: {l: sum(1 for r in rows[k] if r["level"] == l) for l in LEVELS} for k in rows}
    details["maturity_levels"] = lv

    # Worked examples
    details["design_examples"] = design_examples()

    # Acceptance suite
    acc = acceptance()
    if acc:
        M["acceptance_cases"] = metric("Acceptance-suite cases", acc["cases"], section=S_COV,
                                       source="engine/tests/acceptance/models",
                                       note=", ".join(f"{k} {v}" for k, v in sorted(acc["by_analysis"].items())))
        M["acceptance_refs"] = metric("Acceptance-suite reference values", acc["references"], section=S_COV,
                                      source="engine/tests/acceptance/models")
    else:
        why = "suite not on main yet (PR #337)"
        M["acceptance_cases"] = metric("Acceptance-suite cases", status="not_measured", note=why, section=S_COV)
        M["acceptance_refs"] = metric("Acceptance-suite reference values", status="not_measured", note=why,
                                      section=S_COV)

    # Static counts
    M.update(count_metrics())

    # CI artifacts
    if a.record:
        gh.require_sha = subprocess.run(["git", "rev-parse", "HEAD"], cwd=ROOT, capture_output=True,
                                        text=True).stdout.strip()
    if gh.ok:
        ci, ci_details = ci_metrics(gh, a.max_runs)
        M.update(ci)
        details.update(ci_details)
    head_sha = subprocess.run(["git", "rev-parse", "HEAD"], cwd=ROOT, capture_output=True, text=True).stdout.strip()
    cov = coverage(gh, a.max_runs, a.coverage_json, require_sha=head_sha if a.record else None)
    if cov:
        cs = [cov["sha"]] if cov.get("sha") else []
        M["coverage_lines"] = with_sha(metric("Engine line coverage (llvm-cov)", cov["lines"],
                                              display=f"{cov['lines']:.1f} %", section=S_PROOF,
                                              source=cov["source"]), cs)
        if cov.get("branches") is not None:
            M["coverage_branches"] = with_sha(metric("Engine branch coverage (llvm-cov)", cov["branches"],
                                                     display=f"{cov['branches']:.1f} %", section=S_PROOF,
                                                     source=cov["source"]), cs)
    where = "of the release commit" if a.record else "on main"
    for key, label, sec, why in (
        ("differential_compared", "Differential models compared (latest run per harness)", S_TRUST,
         f"no differential report found {where}"),
        ("mutation_rust", "Mutation score, Rust (cargo-mutants)", S_PROOF,
         f"no mutants report with a defined score found {where}"),
        ("mutation_rotation", f"Rust mutants shards tested in the last {MUTANTS_PROMISE_DAYS} days", S_PROOF,
         "not tracked for a release snapshot" if a.record else "GitHub or the nightly.yml mutants plan unreadable"),
        ("mutation_ts", "Mutation score, TypeScript (Stryker)", S_COV,
         f"no successful Stryker run with a defined score found {where}"),
        ("fuzz_execs", "Fuzz executions (latest nightly)", S_TRUST,
         "the nightly fuzz job does not publish execution counts yet (artifact fuzz-stats-<target>)"),
        ("coverage_lines", "Engine line coverage (llvm-cov)", S_PROOF, "no llvm-cov run yet (artifact llvm-cov-summary)"),
        ("coverage_branches", "Engine branch coverage (llvm-cov)", S_PROOF,
         "no llvm-cov run with branch coverage yet"),
    ):
        if key not in M:
            M[key] = keep_prev(key, label, sec, why) if a.offline else metric(label, status="not_measured",
                                                                              note=why, section=sec)

    if a.offline:
        for k, v in prev.get("metrics", {}).items():
            if k not in M:
                M[k] = keep_prev(k, v["label"], v.get("section", ""), "offline run")
        for k in ("differential", "rust_mutants", "ts_mutants"):
            if details.get(k) is None and prev.get("details", {}).get(k) is not None:
                details[k] = prev["details"][k]

    order = ["safety_open", "advisories", "rust_share", "ts_high_safety", "ts_engineering_lines", "certified_analyses",
             "certified_design", "acceptance_cases", "acceptance_refs", "mutation_rust", "mutation_rotation",
             "mutation_ts", "coverage_lines", "coverage_branches", "differential_compared", "fuzz_execs", "fm_cells", "fm_bad",
             "engine_tests", "kani_harnesses", "lean_theorems"]
    order += [k for k in M if k not in order]
    metrics = {k: M[k] for k in order if k in M}

    if a.record:
        # A release snapshot describes the revision that was measured: run this from a checkout of
        # the tag (the workflow does). Refuse to label main's numbers with another commit.
        err = check_record(a.record, commit, resolve_tag(a.record), a.allow_untagged)
        if err:
            sys.exit(err)
        write_release(RELEASES_DIR, {"release": a.record, "date": now[:10], "commit": commit,
                                     "values": {k: snapshot_value(metrics[k]) for k in HISTORY_KEYS if k in metrics}})
    history = load_history(RELEASES_DIR)

    doc = {"schema": 1, "generated": now, "commit": commit, "metrics": metrics,
           "maturity": rows, "maturity_levels": lv, "history": history, "issue_state": issue_state,
           "details": details}
    with open(OUT_JSON, "w", encoding="utf-8") as f:
        json.dump(doc, f, indent=1, ensure_ascii=False)
        f.write("\n")
    write_dashboard(doc)
    safety = {i["number"] for i in (details.get("safety_issues") or [])}
    unm = unmapped_safety(details.get("safety_issues") or [], catalog_issues()) \
        if details.get("safety_issues") is not None else None
    write_maturity(rows, now, commit, unm)
    if safety:
        with open(OUT_MATURITY, encoding="utf-8") as f:
            t = f.read()
        with open(OUT_MATURITY, "w", encoding="utf-8") as f:
            f.write(bold_safety(t, safety))
    shutil.rmtree(gh.tmp, ignore_errors=True)
    print(f"wrote {os.path.relpath(OUT_JSON, ROOT)}, {os.path.relpath(OUT_MD, ROOT)}, "
          f"{os.path.relpath(OUT_MATURITY, ROOT)}")
    for k, v in metrics.items():
        print(f"  {v['label']}: {v['display']}")


if __name__ == "__main__":
    sys.exit(main())
