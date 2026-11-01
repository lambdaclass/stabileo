"""Turn a run_reference.py output directory into the committed reference-results files.

  python -I export.py <name> <run dir> <reference-results dir> --damage <steps...> --displacement <steps...>

The mesh is committed as a fingerprint (FNV-1a 64 over the little-endian bytes of the node
coordinates and of the element connectivity as int64), which the Rust tests recompute from their
own mesh generator, rather than as a copy.
"""
import csv, json, os, sys
import numpy as np


def fnv1a64(data):
    h = 0xcbf29ce484222325
    for b in data:
        h = ((h ^ b) * 0x100000001b3) & 0xFFFFFFFFFFFFFFFF
    return f"{h:016x}"


name, run, out = sys.argv[1], sys.argv[2], sys.argv[3]
args = sys.argv[4:]
damage_steps = [int(s) for s in args[args.index("--damage") + 1:args.index("--displacement")]]
disp_steps = [int(s) for s in args[args.index("--displacement") + 1:]]
steps = json.load(open(os.path.join(run, "steps.json")))
cols = ["step", "pseudotime", "staggered_iterations", "last_residual", "damage_max", "damage_min"]
extra = [k for k in ("reaction", "center_sigma_xx", "center_pf") if k in steps[0]]
with open(os.path.join(out, f"{name}_steps.csv"), "w", newline="") as f:
    w = csv.writer(f)
    w.writerow(cols + extra)
    for s in steps:
        w.writerow([s["step"], repr(s["pseudotime"]), "" if s["staggered_iterations"] is None else s["staggered_iterations"],
                    "" if s["last_residual"] is None else repr(s["last_residual"]), repr(s["pf_max"]), repr(s["pf_min"])]
                   + [repr(s[k]) for k in extra])
nodes = np.load(os.path.join(run, "fields", "nodes.npy")).astype("<f8")
elements = np.load(os.path.join(run, "fields", "elements.npy")).astype("<i8")
with open(os.path.join(out, f"{name}_mesh.json"), "w") as f:
    json.dump({"nodes": len(nodes), "elements": len(elements),
               "nodes_fnv1a64": fnv1a64(nodes.tobytes()), "elements_fnv1a64": fnv1a64(elements.tobytes()),
               "bbox": [float(nodes[:, 0].min()), float(nodes[:, 1].min()), float(nodes[:, 0].max()), float(nodes[:, 1].max())]},
              f, indent=1)
for k in damage_steps:
    pf = np.load(os.path.join(run, "fields", f"pf_{k:04d}.npy"))
    np.savetxt(os.path.join(out, f"{name}_damage_step{k:03d}.csv"), pf, fmt="%.9e", header="damage", comments="")
for k in disp_steps:
    u = np.load(os.path.join(run, "fields", f"u_{k:04d}.npy")).reshape(-1, 2)
    np.savetxt(os.path.join(out, f"{name}_displacement_step{k:03d}.csv"), u, fmt="%.9e", delimiter=",", header="ux,uy", comments="")
