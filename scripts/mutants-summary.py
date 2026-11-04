#!/usr/bin/env python3
"""Summary of a cargo-mutants run (CI, .github/workflows/nightly.yml).

    scripts/mutants-summary.py MUTANTS_OUT [LABEL]

Prints how many of the shard's mutants were tested and with what outcome,
the build/test time per mutant, and the missed ones. Also appended to the
GitHub job summary when GITHUB_STEP_SUMMARY is set. Works on a run that was
interrupted (time budget): outcomes.json is written as mutants finish.
"""
import json
import os
import statistics
import sys
from collections import Counter
from pathlib import Path

out = Path(sys.argv[1])
label = sys.argv[2] if len(sys.argv) > 2 else ""
try:
    data = json.loads((out / "outcomes.json").read_text())
except (OSError, ValueError) as e:
    print(f"mutants summary: no readable outcomes.json in {out} ({e})")
    sys.exit(1)

outcomes = [o for o in data.get("outcomes", []) if o.get("scenario") != "Baseline"]
# mutants.json lists the shard's mutants; total_mutants in an interrupted
# run counts only those reached.
try:
    total = len(json.loads((out / "mutants.json").read_text()))
except (OSError, ValueError):
    total = data.get("total_mutants") or len(outcomes)
kinds = Counter(o.get("summary") for o in outcomes)
build = [p["duration"] for o in outcomes for p in o.get("phase_results", []) if p["phase"] == "Build"]
test = [p["duration"] for o in outcomes for p in o.get("phase_results", []) if p["phase"] == "Test"]
missed = (out / "missed.txt").read_text().split("\n") if (out / "missed.txt").exists() else []
missed = [m for m in missed if m.strip()]


def med(xs):
    return f"{statistics.median(xs):.0f} s" if xs else "-"


lines = [
    f"### Mutants {label}",
    "",
    f"Tested {len(outcomes)} of {total} mutants: "
    + ", ".join(f"{k} {v}" for k, v in sorted(kinds.items())),
    f"Median build {med(build)}, median test {med(test)} per mutant.",
]
if missed:
    lines += ["", f"Missed ({len(missed)}):", "```", *missed, "```"]
text = "\n".join(lines)
print(text)
if os.environ.get("GITHUB_STEP_SUMMARY"):
    with open(os.environ["GITHUB_STEP_SUMMARY"], "a") as f:
        f.write(text + "\n")
