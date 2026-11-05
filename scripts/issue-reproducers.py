#!/usr/bin/env python3
import argparse
import json
import re
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
WRONG_RESULT_LABELS = {"wrong-result", "safety", "wrong-result-candidate"}
RUST_TAG = re.compile(r'#\[ignore\s*=\s*"known wrong result: #(\d+)\b[^"]*"\]')
RUST_FN = re.compile(r"^\s*(?:pub\s+)?(?:async\s+)?fn\s+([A-Za-z0-9_]+)")
TS_TEST = re.compile(r"""\b(it|test)(\.fails)?\(\s*(['"`])(.*?)\3""")
ISSUE = re.compile(r"#(\d+)\b")
CLOSES = re.compile(r"\b(?:close[sd]?|fix(?:e[sd])?|resolve[sd]?)\s*:?\s+#(\d+)\b", re.I)
PARTLY = re.compile(r"\bpartly\s+(?:fix(?:es|ed)?|address(?:es|ed)?)\s*:?\s+#(\d+)\b", re.I)
PARTLY_BEFORE = re.compile(r"\bpartly\s+$", re.I)
TEST_ATTR = re.compile(r"#\[(?:[\w:]+::)?test\]")
NEXTEST_TEST_FAILED = 100


def rust_tests(text):
    tagged, plain = [], set()
    tag, is_test, ignored = None, False, False
    for line in text.splitlines():
        m = RUST_TAG.search(line)
        if m:
            tag, ignored = int(m.group(1)), True
            continue
        if TEST_ATTR.search(line):
            is_test = True
        if "#[ignore" in line:
            ignored = True
        f = RUST_FN.match(line)
        if f:
            if tag is not None:
                tagged.append((tag, f.group(1)))
            elif is_test and not ignored:
                plain.add(f.group(1))
            tag, is_test, ignored = None, False, False
    return tagged, plain


def ts_tests(text):
    tagged, plain = [], set()
    for m in TS_TEST.finditer(text):
        title = m.group(4)
        if m.group(2):
            for n in ISSUE.findall(title):
                tagged.append((int(n), title))
        else:
            plain.add(title)
    return tagged, plain


def scan_files(files):
    tagged, plain = [], set()
    for path, text in files:
        if path.endswith(".rs"):
            t, p = rust_tests(text)
        elif path.endswith((".ts", ".js", ".mjs", ".cjs")):
            t, p = ts_tests(text)
        else:
            continue
        tagged += [(n, path, name) for n, name in t]
        plain |= {(path, name) for name in p}
    return tagged, plain


def git(*args):
    return subprocess.run(["git", *args], cwd=ROOT, capture_output=True, text=True, check=False).stdout


def files_at(rev):
    if rev is None:
        hits = git("grep", "-l", "-E", r"known wrong result: #|\.fails\(", "--", "engine", "web/src", "web/e2e")
        return [(p, (ROOT / p).read_text()) for p in hits.split()]
    hits = git("grep", "-l", "-E", r"known wrong result: #|\.fails\(", rev, "--", "engine", "web/src", "web/e2e")
    paths = [h.split(":", 1)[1] for h in hits.split()]
    return [(p, git("show", f"{rev}:{p}")) for p in paths]


def files_named(rev, paths):
    return [(p, git("show", f"{rev}:{p}")) for p in sorted(set(paths))]


def references(body):
    body = body or ""
    full = {int(m.group(1)) for m in CLOSES.finditer(body) if not PARTLY_BEFORE.search(body[:m.start()])}
    partly = {int(n) for n in PARTLY.findall(body)} - full
    return full, partly


def closing_issues(body):
    full, partly = references(body)
    return sorted(full | partly)


def flip_check(body, base_files, head_files, labels, pr_commits=()):
    _, partly_refs = references(body)
    base_tagged = sorted(set(scan_files(base_files)[0]).union(*(scan_files(c)[0] for c in pr_commits)))
    head_tagged, head_plain = scan_files(head_files)
    errors, notes = [], []
    for n in closing_issues(body):
        if not WRONG_RESULT_LABELS & set(labels.get(n, [])):
            continue
        before = [(p, name) for k, p, name in base_tagged if k == n]
        still = [(p, name) for k, p, name in head_tagged if k == n]
        flipped = [(p, name) for p, name in before if (p, name) in head_plain]
        if not before:
            errors.append(f"#{n} is a wrong-result issue but has no expected-failure reproducer at the base: "
                          f"add one named after the issue (tagged #{n}) before or with the fix")
            continue
        if not flipped:
            errors.append(f"#{n}: no reproducer flipped; flip one of: " + ", ".join(f"{p}::{name}" for p, name in before))
        partly = n in partly_refs
        if still and not partly:
            errors.append(f"#{n}: still expected to fail: " + ", ".join(f"{p}::{name}" for p, name in still)
                          + ' (flip them, or say "partly fixes" in the body and keep the issue open)')
        if flipped:
            notes.append(f"#{n}: flipped " + ", ".join(f"{p}::{name}" for p, name in flipped))
    return errors, notes


def gh_labels(issues):
    out = {}
    for n in issues:
        r = subprocess.run(["gh", "issue", "view", str(n), "--json", "labels"], capture_output=True, text=True)
        if r.returncode != 0:
            raise SystemExit(f"issue-reproducers: cannot read the labels of #{n}: {r.stderr.strip()}")
        out[n] = [lab["name"] for lab in json.loads(r.stdout)["labels"]]
    return out


def binary_of(path):
    p = Path(path)
    if p.parts[:2] == ("engine", "src"):
        return "--lib"
    if len(p.parts) > 3 and p.parts[:2] == ("engine", "tests"):
        return p.parts[2]
    for main in sorted((ROOT / "engine" / "tests").glob("*/main.rs")):
        if f'#[path = "../{p.name}"]' in main.read_text():
            return main.parent.name
    return p.stem


def xfail(list_only, runner=subprocess.run):
    tagged, _ = scan_files([f for f in files_at(None) if f[0].endswith(".rs")])
    if list_only:
        for n, p, name in tagged:
            print(f"#{n}\t{p}\t{name}")
        return 0
    passed, broken = [], []
    for n, p, name in tagged:
        b = binary_of(p)
        target = ["--lib"] if b == "--lib" else ["--test", b]
        cmd = ["cargo", "nextest", "run", "--profile", "ci", "--no-tests", "fail", *target,
               "--run-ignored", "only", "-E", f"test(/(^|::){name}$/)"]
        print(f"issue-reproducers: #{n} {p}::{name} (expected to fail)", flush=True)
        r = runner(cmd, cwd=ROOT / "engine")
        if r.returncode == 0:
            passed.append(f"#{n} {p}::{name}")
        elif r.returncode != NEXTEST_TEST_FAILED:
            broken.append(f"#{n} {p}::{name} (nextest exit {r.returncode})")
    if broken:
        print("issue-reproducers: these expected-failure reproducers did not run to a test failure "
              "(build error, or no test selected):\n  " + "\n  ".join(broken), file=sys.stderr)
    if passed:
        print("issue-reproducers: these expected-failure reproducers PASS; flip each in the fix of its issue "
              "(remove the ignore), or fix the reproducer:\n  " + "\n  ".join(passed), file=sys.stderr)
    if passed or broken:
        return 1
    print(f"issue-reproducers: all {len(tagged)} expected-failure reproducers still fail")
    return 0


def main(argv):
    ap = argparse.ArgumentParser()
    sub = ap.add_subparsers(dest="cmd", required=True)
    s = sub.add_parser("scan")
    s.add_argument("--rev")
    f = sub.add_parser("flip-check")
    f.add_argument("--base", required=True)
    f.add_argument("--head", required=True)
    f.add_argument("--body-file", required=True)
    f.add_argument("--labels-json")
    x = sub.add_parser("xfail")
    x.add_argument("--list", action="store_true")
    a = ap.parse_args(argv)
    if a.cmd == "scan":
        tagged, _ = scan_files(files_at(a.rev))
        for n, p, name in tagged:
            print(f"#{n}\t{p}\t{name}")
        return 0
    if a.cmd == "xfail":
        return xfail(a.list)
    body = Path(a.body_file).read_text()
    issues = closing_issues(body)
    if not issues:
        print("issue-reproducers: the body closes no issue")
        return 0
    labels = {int(k): v for k, v in json.loads(Path(a.labels_json).read_text()).items()} if a.labels_json else gh_labels(issues)
    base_files = files_at(a.base)
    head_files = files_at(a.head)
    changed = {p for p, _ in base_files} - {p for p, _ in head_files}
    head_files += files_named(a.head, changed)
    commits = git("rev-list", "--max-count=100", f"{a.base}..{a.head}").split()[1:]
    errors, notes = flip_check(body, base_files, head_files, labels, [files_at(c) for c in commits])
    for line in notes:
        print("issue-reproducers: " + line)
    for e in errors:
        print("issue-reproducers: " + e, file=sys.stderr)
    return 1 if errors else 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
