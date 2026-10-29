#!/usr/bin/env python3
import json
from pathlib import Path
import re
import subprocess
import sys


def decisions(text):
    return {
        int(match[1]): match[2]
        for line in text.splitlines()
        if (match := re.match(r"\| #(\d+) \|.*?\| ([^|]+) \|", line))
    }


def main():
    ledger = Path(__file__).resolve().parents[1] / "docs/verification/CONTAINMENT.md"
    recorded = decisions(ledger.read_text())
    result = subprocess.run(
        ["gh", "api", "--paginate", "--slurp",
         "repos/lambdaclass/stabileo/issues?state=open&labels=safety&per_page=100"],
        check=True, capture_output=True, text=True,
    )
    issues = [issue for page in json.loads(result.stdout) for issue in page if "pull_request" not in issue]
    missing = [issue for issue in issues if issue["number"] not in recorded or "pending" in recorded[issue["number"]].lower()]
    for issue in missing:
        print(f'#{issue["number"]}: {issue["title"]} — no completed containment decision')
    if not missing:
        print(f"All {len(issues)} open safety issues have a containment decision.")
    return bool(missing)


if __name__ == "__main__":
    sys.exit(main())
