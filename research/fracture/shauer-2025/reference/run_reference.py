import importlib.util, json, os, sys, time
import numpy as np

script, outdir = sys.argv[1], sys.argv[2]
os.makedirs(outdir, exist_ok=True)
os.chdir(outdir)
spec = importlib.util.spec_from_file_location("ref_example", script)
mod = importlib.util.module_from_spec(spec)
spec.loader.exec_module(mod)

steps = []
cur = {"iters": None, "residuals": []}
log = open("run.log", "w")

def capture_print(*a, **k):
    s = " ".join(str(x) for x in a)
    log.write(s + "\n"); log.flush()
    if s.startswith("Residual Elasticity Norm:"):
        cur["residuals"].append(float(s.split(":")[1]))
    if "converged in" in s:
        cur["iters"] = int(s.split("converged in")[1].split()[0])
mod.print = capture_print

orig_vtk = mod.generateVTKLegacyFile
os.makedirs("fields", exist_ok=True)
def vtk(nodes, elements, filename):
    step = len(steps)
    if step == 0:
        np.save("fields/nodes.npy", np.array([[n.x, n.y] for n in nodes]))
        np.save("fields/elements.npy", np.array([e.node_ids for e in elements]))
    np.save(f"fields/pf_{step:04d}.npy", np.asarray(mod.Upf))
    np.save(f"fields/u_{step:04d}.npy", np.asarray(mod.Uelas))
    steps.append({"step": step, "pseudotime": mod.pseudotime, "staggered_iterations": cur["iters"],
                  "last_residual": cur["residuals"][-1] if cur["residuals"] else None,
                  "pf_max": float(np.max(mod.Upf)), "pf_min": float(np.min(mod.Upf)),
                  "wall_s": time.time() - t0})
    cur["iters"] = None; cur["residuals"] = []
    with open("steps.json", "w") as f:
        json.dump(steps, f, indent=1)
mod.generateVTKLegacyFile = vtk

if hasattr(mod, "computeReaction"):
    orig_r = mod.computeReaction
    def reaction(*a, **k):
        r = orig_r(*a, **k)
        steps[-1]["reaction"] = float(r)
        with open("steps.json", "w") as f:
            json.dump(steps, f, indent=1)
        return r
    mod.computeReaction = reaction

if hasattr(mod, "computeSigmaAtCenter"):
    orig_s = mod.computeSigmaAtCenter
    def sig(element, nodes, stress_vec):
        pf = orig_s(element, nodes, stress_vec)
        steps[-1]["center_sigma_xx"] = float(stress_vec[0]); steps[-1]["center_pf"] = float(pf)
        with open("steps.json", "w") as f:
            json.dump(steps, f, indent=1)
        return pf
    mod.computeSigmaAtCenter = sig

t0 = time.time()
mod.main()
print("done", len(steps), "steps in", round(time.time() - t0, 1), "s")
