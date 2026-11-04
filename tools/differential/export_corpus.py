#!/usr/bin/env python3
"""Export models from the differential generators into the metamorphic corpus.

  export_corpus.py [--n N] [--check]

Writes engine/tests/metamorphic_corpus/differential/<gen>-<seed>.json for the
generators in common/gen.py (frame2d, rich3d, frame3d, building, modal3d,
pdelta3d), seeds 0..N-1. The engine's metamorphic harness
(engine/tests/metamorphic) solves them, transforms them and checks the physics
invariants, so the differential models are covered without any reference
program. `--check` fails if the committed files differ (generator drift).
"""

import argparse
import json
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "common"))

import gen  # noqa: E402

OUT = os.path.join(HERE, "..", "..", "engine", "tests", "metamorphic_corpus", "differential")
GENS = ("frame2d", "rich3d", "frame3d", "building", "modal3d", "pdelta3d")


def models(n):
    for g in GENS:
        for seed in range(n):
            m = getattr(gen, g)(seed)
            m.pop("_densities", None)
            yield f"{g}-{seed}.json", json.dumps(m, indent=1, sort_keys=True) + "\n"


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--n", type=int, default=6)
    ap.add_argument("--check", action="store_true")
    a = ap.parse_args()
    files = dict(models(a.n))
    if a.check:
        bad = [f for f, t in files.items() if not os.path.exists(os.path.join(OUT, f)) or open(os.path.join(OUT, f)).read() != t]
        if bad:
            print("stale:", *bad)
            return 1
        return 0
    os.makedirs(OUT, exist_ok=True)
    for f in os.listdir(OUT):
        os.remove(os.path.join(OUT, f))
    for f, t in files.items():
        with open(os.path.join(OUT, f), "w") as fh:
            fh.write(t)
    print(f"wrote {len(files)} models to {os.path.normpath(OUT)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
