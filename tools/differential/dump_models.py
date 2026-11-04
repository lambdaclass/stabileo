#!/usr/bin/env python3
"""Write the differential generators' models as stabileo solver JSON files.

    python3 tools/differential/dump_models.py OUT_DIR N

writes OUT_DIR/<generator>-<seed>.json for seeds 0..N-1 of every generator in
common/gen.py and the per-program gen.py files. Used to run the end-to-end
certificate on them (docs/verification/CERTIFY.md, "End-to-end certificates"):

    E2E_DIR=OUT_DIR cargo test --release --test certificates certify_end_to_end::e2e_dir -- --ignored --nocapture
"""
import importlib.util
import json
import os
import sys

here = os.path.dirname(os.path.abspath(__file__))
out, n = sys.argv[1], int(sys.argv[2])
os.makedirs(out, exist_ok=True)
sys.path.insert(0, os.path.join(here, "common"))
import gen  # noqa: E402

gens = dict(gen.GENERATORS)
for prog in ["calculix", "mystran", "pynite", "kratos", "frame3dd"]:
    path = os.path.join(here, prog, "gen.py")
    if not os.path.exists(path):
        continue
    spec = importlib.util.spec_from_file_location(prog + "_gen", path)
    mod = importlib.util.module_from_spec(spec)
    try:
        spec.loader.exec_module(mod)
        gens.update(getattr(mod, "GENERATORS", {}))
    except Exception as e:  # a program's generator needing its own deps
        print("skipped", prog, e, file=sys.stderr)
count = 0
for name, g in sorted(gens.items()):
    for seed in range(n):
        with open(os.path.join(out, f"{name}-{seed}.json"), "w") as f:
            json.dump(g(seed), f)
        count += 1
print("wrote", count, "models from", ", ".join(sorted(gens)))
