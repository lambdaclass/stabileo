#!/usr/bin/env python3
"""Which kept builds (/@<commit>/, docs/DEPLOY.md "Snapshots") may ever be pruned. Never deletes.

  protected                 the snapshots a released experiment version names, in any commit of
                            the branch (default origin/main): never to be deleted
  plan --index index.json   the snapshots a prune MAY remove: not protected, not an indexed
                            research snapshot, not among the --keep-newest, and older than
                            --older-than-days

The index is the host's /@/ (curl -s https://stabileo.com/@/ > index.json). The deletion itself is
a manual step on the host, by its owner, from the plan's output (docs/DEPLOY.md).

    python3 -I research/tools/snapshots.py protected
    python3 -I research/tools/snapshots.py plan --index index.json --older-than-days 365
"""

import argparse
import json
import subprocess
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]


def git(*args):
    return subprocess.run(["git", *args], cwd=ROOT, check=True, capture_output=True, text=True).stdout


def protected(ref):
    """Every `commit` any versions.json has ever named on `ref`: once released, always protected."""
    keep = {}
    for commit in git("log", "--format=%H", ref, "--", "research/*/*/versions.json").split():
        for path in git("ls-tree", "-r", "--name-only", commit, "--", "research").split("\n"):
            if not path.endswith("/versions.json") or path.count("/") != 3:
                continue
            try:
                versions = json.loads(git("show", f"{commit}:{path}"))["versions"]
            except (subprocess.CalledProcessError, ValueError, KeyError):
                continue
            for v in versions:
                if v.get("commit"):
                    keep.setdefault(v["commit"][:7], set()).add(f"{path.split('/')[2]} v{v.get('version')}")
    return keep


def plan(index, keep, older_than_days, keep_newest, now=None):
    now = now or datetime.now(timezone.utc)
    snaps = sorted(index["snapshots"], key=lambda s: datetime.fromisoformat(s["date"]), reverse=True)
    cutoff = now - timedelta(days=older_than_days)
    out = []
    for i, s in enumerate(snaps):
        why = []
        if s["short"] in keep:
            why.append("released: " + ", ".join(sorted(keep[s["short"]])))
        if s.get("research") or s.get("experimentVersions"):
            why.append("permanent research snapshot")
        if i < keep_newest:
            why.append(f"among the {keep_newest} newest")
        if datetime.fromisoformat(s["date"]) > cutoff:
            why.append(f"newer than {older_than_days} days")
        out.append((s["short"], s["date"], why))
    return out


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = ap.add_subparsers(dest="cmd", required=True)
    p1 = sub.add_parser("protected")
    p1.add_argument("--ref", default="origin/main")
    p2 = sub.add_parser("plan")
    p2.add_argument("--index", required=True)
    p2.add_argument("--ref", default="origin/main")
    p2.add_argument("--older-than-days", type=int, default=365)
    p2.add_argument("--keep-newest", type=int, default=20)
    a = ap.parse_args()
    keep = protected(a.ref)
    if a.cmd == "protected":
        for short, why in sorted(keep.items()):
            print(short, "; ".join(sorted(why)))
        return 0
    rows = plan(json.load(open(a.index)), keep, a.older_than_days, a.keep_newest)
    for short, date, why in rows:
        print(f"{'keep ' if why else 'MAY GO'} {short} {date} {'; '.join(why)}")
    print(f"{sum(1 for r in rows if not r[2])} of {len(rows)} snapshots may be pruned; nothing was deleted")
    return 0


if __name__ == "__main__":
    sys.exit(main())
