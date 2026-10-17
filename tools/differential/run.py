#!/usr/bin/env python3
"""Differential testing of the stabileo engine against independent programs.

  run.py PROGRAM [FILES...] [--gen NAME N]... [--analysis static|modal|pdelta]
         [--seed-start S] [--tol T] [--modes K] [-j 4] [--shrink]
         [--report OUT.json] [--dump-dir DIR] [-v]

PROGRAM: frame3dd, pynite, mystran, kratos, calculix (see README.md).
Generators (common/gen.py and the program's own gen.py): rich3d, frame3d,
building, modal3d, pdelta3d, plus per-program ones.

Exit status: 0 = nothing flagged, 1 = a mismatch, silent_singular, false_reject
or false_warning (common/driver.py), 2 = harness error.
"""

import argparse
import importlib.util
import json
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "common"))

import driver  # noqa: E402
import gen  # noqa: E402

PROGRAMS = ("frame3dd", "pynite", "mystran", "kratos", "calculix")


def load(program, mod="adapter"):
    path = os.path.join(HERE, program, mod + ".py")
    if not os.path.exists(path):
        return None
    spec = importlib.util.spec_from_file_location(f"{program}_{mod}", path)
    m = importlib.util.module_from_spec(spec)
    sys.path.insert(0, os.path.join(HERE, program))
    spec.loader.exec_module(m)
    return m


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("program", choices=PROGRAMS)
    ap.add_argument("files", nargs="*")
    ap.add_argument("--gen", nargs=2, action="append", metavar=("NAME", "N"), default=[])
    ap.add_argument("--analysis", default=None, help="default: from the generator (modal3d -> modal, ...)")
    ap.add_argument("--seed-start", type=int, default=0)
    ap.add_argument("--tol", type=float, default=None)
    ap.add_argument("--modes", type=int, default=6)
    ap.add_argument("-j", "--jobs", type=int, default=4)
    ap.add_argument("--shrink", action="store_true")
    ap.add_argument("--report")
    ap.add_argument("--dump-dir")
    ap.add_argument("-v", "--verbose", action="store_true")
    a = ap.parse_args()

    adapter = load(a.program)
    if adapter is None or not adapter.available():
        print(f"{a.program}: not available (build it first, see README.md)", file=sys.stderr)
        return 2
    gens = dict(gen.GENERATORS)
    extra = load(a.program, "gen")
    if extra is not None:
        gens.update(extra.GENERATORS)
    default_analysis = {"modal3d": "modal", "pdelta3d": "pdelta"}
    if extra is not None:
        default_analysis.update(getattr(extra, "ANALYSIS", {}))

    cases = []
    for f in a.files:
        with open(f) as fh:
            cases.append(driver.Case(os.path.basename(f), json.load(fh), a.analysis or "static", a.modes))
    for name, n in a.gen:
        if name not in gens:
            print(f"unknown generator {name}; have {sorted(gens)}", file=sys.stderr)
            return 2
        an = a.analysis or default_analysis.get(name, "static")
        for s in range(a.seed_start, a.seed_start + int(n)):
            cases.append(driver.Case(f"{name}-{s}", gens[name](s), an, a.modes))

    tols = getattr(adapter, "TOL", {})
    by_analysis = {}
    for c in cases:
        by_analysis.setdefault(c.analysis, []).append(c)
    results = []
    for an, cs in by_analysis.items():
        tol = a.tol or tols.get(an, (1e-6, None))[0]
        mode_tol = tols.get(an, (None, None))[1]
        results += driver.run_all(adapter, cs, tol, a.jobs, a.dump_dir, a.shrink, a.verbose, mode_tol)
    cnt = driver.summarize(results, a.verbose)
    if a.report:
        with open(a.report, "w") as f:
            json.dump(results, f, indent=1, default=str)
    if cnt.get("harness_error"):
        return 2
    return 1 if any(cnt.get(s) for s in driver.FLAGGED) else 0


if __name__ == "__main__":
    sys.exit(main())
