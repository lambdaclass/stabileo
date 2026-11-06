#!/usr/bin/env python3
"""Differential testing of stabileo's 3D linear static solver against
Code_Aster 18.1 (see README.md).

  run.py [FILES...] [--fixtures] [--examples] [--random3d N] [--rich3d N]
         [--aster3d N] [--seed-start S] [--tol T] [-j J] [--report OUT.json]
         [--dump-dir DIR] [--keep] [-v]

Inputs: model files (SolverInput3D JSON), `--fixtures` (the 3D
engine/tests/fixtures/*-input.json, which include the example models),
`--random3d` (engine/tests/fuzz_models via solve_json --gen3d), `--rich3d`
(tools/opensees/gen_models.rich_3d) and `--aster3d` (gen.py: rich_3d plus the
features only this translator covers: torsion releases, connectors,
constraints, thermal loads, inclined supports).

Code_Aster runs in the image built by setup.sh (docker / OrbStack; set
DOCKER to use another client) or, with ASTER_PYTHON pointing at the Python
of a native conda env (`setup.sh --native` -> .work/conda/bin/python), on the
host. All models of a run are split over J batches, each one Code_Aster
session (aster_batch.py).

Exit status: 0 = every compared model agrees, 1 = mismatches, models
Code_Aster finds singular that stabileo solved without a warning
(silent_singular), models stabileo solved although a prescribed displacement
has no rigid restraint to carry it (silent_unimposed) or models stabileo
refused that Code_Aster solves (false_reject), 2 = harness error (Code_Aster failing for another reason).
"""

import argparse
import glob
import importlib.util
import json
import math
import os
import re
import shutil
import subprocess
import sys
import tempfile
import traceback
from collections import Counter
from concurrent.futures import ThreadPoolExecutor

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.abspath(os.path.join(HERE, "..", "..", ".."))
OPENSEES = os.path.join(REPO, "tools", "opensees")
FIXTURES = os.path.join(REPO, "engine", "tests", "fixtures")
DEFAULT_BIN = os.path.join(REPO, "target", "release", "examples", "solve_json")
IMAGE = "stabileo-codeaster:18.1.10"
sys.path.insert(0, HERE)
sys.path.insert(0, OPENSEES)

import to_aster  # noqa: E402
import gen  # noqa: E402


def _load(name, path):
    spec = importlib.util.spec_from_file_location(name, path)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


# Scale-aware comparison, stabileo normalisation and orphan pruning are the
# OpenSees harness's (one definition of the conventions for every harness).
C = _load("opensees_compare", os.path.join(OPENSEES, "compare.py"))


# ---------------------------------------------------------------- inputs

def collect(a):
    jobs = [(os.path.basename(f), json.load(open(f))) for f in a.files]
    if a.fixtures:
        for f in sorted(glob.glob(os.path.join(FIXTURES, "*-input.json"))):
            d = json.load(open(f))
            if C._is_3d(d):
                jobs.append(("fixture-" + os.path.basename(f)[:-len("-input.json")], d))
    for s in range(a.seed_start, a.seed_start + a.random3d):
        p = subprocess.run([a.bin, "--gen3d", str(s)], capture_output=True, text=True, check=True)
        jobs.append((f"fuzz3d-{s}", C.prune_orphans(json.loads(p.stdout))))
    import gen_models
    for s in range(a.seed_start, a.seed_start + a.rich3d):
        jobs.append((f"rich3d-{s}", gen_models.rich_3d(s)))
    for s in range(a.seed_start, a.seed_start + a.aster3d):
        jobs.append((f"aster3d-{s}", gen.aster_3d(s)))
    # Names key the job directories and the results: make them unique (the
    # fixtures include files named random3d-N, like the generated models).
    seen = Counter()
    out = []
    for name, m in jobs:
        seen[name] += 1
        out.append((name if seen[name] == 1 else f"{name}~{seen[name]}", m))
    return out


# ---------------------------------------------------------------- stages

def prepare(name, model, binary, workdir, flagged=False):
    """stabileo solve + translation. Returns a result dict; status
    'pending' when the job dir is ready for Code_Aster."""
    r = dict(name=name)
    why = to_aster.check_supported(model)
    if why:
        return dict(r, status="unsupported", why=why)
    unimposed = to_aster.unimposed_settlements(model)
    try:
        sraw = C.stabileo(model, binary)
    except RuntimeError as ex:
        why = [str(ex)]
        named = UNIMPOSED.search(why[0])
        if named and named.group(1, 2) in unimposed:
            return dict(r, status="refused", why=why + [
                "code_aster translator: the same prescribed displacement has no rigid restraint to carry it "
                "(the translation would drop it and solve a different model)"])
        return _prepare_refused(dict(r, status="stabileo_failed", why=why), model, workdir)
    if unimposed:
        return dict(r, status="silent_unimposed", why=[
            f"stabileo solved a model whose prescribed displacements {unimposed} no rigid restraint carries "
            "(validate_input_3d refuses these, AC-10)"])
    sres = C.normalize_stabileo(sraw, 3)
    ill = sorted(set(sres["diags"]) & C.ILL_CONDITIONED)
    if ill and not flagged:
        return dict(r, status="ill_conditioned", why=ill)
    if ill:
        r["flagged"] = ill
    try:
        comm, meta = to_aster.translate(model)
    except to_aster.Unsupported as ex:
        return dict(r, status="unsupported", why=[str(ex)])
    job = os.path.join(workdir, name.replace("/", "_"))
    os.makedirs(job, exist_ok=True)
    with open(os.path.join(job, "model.comm"), "w") as f:
        f.write(comm)
    return dict(r, status="pending", job=job, sres=sres, meta=meta)


# The engine's refusal of a prescribed displacement no rigid restraint carries
# (linear.rs, unimposed_settlement): support key and DOF name.
UNIMPOSED = re.compile(r"^stabileo: Support (\S+) \(node \d+\): the prescribed (d[xyz]|dr[xyz]) = \S+ would not be applied, because ")


# Warning-level conditioning diagnostics (not in C.ILL_CONDITIONED, which skips
# the model): a singular Code_Aster verdict on such a model is not silent.
WARNED_CONDITIONING = {"high_diagonal_ratio"}


# The translator's own reasons for rejecting a model that say it has no
# unique answer either: a load on a rotation nothing stiffens, a mechanism.
REFUSED_TOO = ("nodal moment on a rotation-free", "rotational mechanism", "free body")
# Code_Aster's verdicts that the stiffness is singular (a pivot lost more than
# NPREC = 10 digits, or a null pivot) or too ill-conditioned to solve.
SINGULAR = ("<FACTOR_11>", "<FACTOR_42>", "<FACTOR_57>")


def _prepare_refused(r, model, workdir):
    """stabileo refused the model: Code_Aster decides whether rightly.
    'refused' when Code_Aster finds it singular too (or the translator rejects
    it for the same reason), 'false_reject' when Code_Aster solves it with its
    singularity check on, 'stabileo_failed' when it cannot be translated."""
    try:
        comm, meta = to_aster.translate(model)
    except to_aster.Unsupported as ex:
        if any(t in str(ex) for t in REFUSED_TOO):
            return dict(r, status="refused", why=r["why"] + [f"code_aster translator: {ex}"])
        return dict(r, why=r["why"] + [f"code_aster translator: {ex}"])
    job = os.path.join(workdir, r["name"].replace("/", "_"))
    os.makedirs(job, exist_ok=True)
    with open(os.path.join(job, "model.comm"), "w") as f:
        f.write(comm)
    return dict(r, status="pending", job=job, sres=None, meta=meta, refused=r["why"])


def _finish_refused(r, model, dump_dir):
    job = r.pop("job")
    r.pop("sres"), r.pop("meta")
    why = r.pop("refused")
    out, err = os.path.join(job, "result.json"), os.path.join(job, "error.txt")
    if os.path.exists(out):
        if dump_dir:
            os.makedirs(dump_dir, exist_ok=True)
            base = os.path.join(dump_dir, r["name"].replace("/", "_"))
            with open(base + ".json", "w") as f:
                json.dump(model, f, indent=1)
            shutil.copy(os.path.join(job, "model.comm"), base + ".comm")
        return dict(r, status="false_reject", why=why + ["code_aster solves it (NPREC=10 singularity check passed)"])
    msg = open(err).read() if os.path.exists(err) else "no result (Code_Aster session died?)"
    if any(t in msg for t in SINGULAR):
        return dict(r, status="refused", why=why + ["code_aster: " + _first_error(msg)])
    return dict(r, status="aster_failed", why=why + [_first_error(msg)])


def aster_cmd(jobdirs, workdir):
    """Command running aster_batch.py over `jobdirs` (paths under workdir)."""
    py = os.environ.get("ASTER_PYTHON")
    if py:
        lib = os.path.join(os.path.dirname(os.path.dirname(py)), "lib", "elem.1")
        scratch = tempfile.mkdtemp(dir=workdir, prefix="run-")
        shutil.copy(lib, scratch)
        return [py, os.path.join(HERE, "aster_batch.py")] + jobdirs, scratch
    docker = os.environ.get("DOCKER", "docker")
    rel = [os.path.join("/w", os.path.relpath(j, workdir)) for j in jobdirs]
    script = "cd \"$(mktemp -d)\" && cp /opt/conda/lib/elem.1 . && exec /opt/conda/bin/python /h/aster_batch.py \"$@\""
    return [docker, "run", "--rm", "--platform", "linux/amd64", "-v", f"{workdir}:/w", "-v", f"{HERE}:/h:ro",
            IMAGE, "bash", "-c", script, "batch"] + rel, None


def run_aster(pending, workdir, jobs):
    """Run every pending job, in `jobs` batches (one Code_Aster session each)."""
    if not pending:
        return
    chunks = [pending[i::jobs] for i in range(min(jobs, len(pending)))]

    def one(chunk):
        cmd, cwd = aster_cmd([r["job"] for r in chunk], workdir)
        log = os.path.join(workdir, f"batch-{id(chunk)}.log")
        with open(log, "w") as fh:
            subprocess.run(cmd, cwd=cwd, stdout=fh, stderr=subprocess.STDOUT)
        return log

    with ThreadPoolExecutor(max_workers=len(chunks)) as pool:
        list(pool.map(one, chunks))
    # A Code_Aster exception leaks its MUMPS instance; after 50 of them a
    # session refuses every further solve (FACTOR_60). Rerun those jobs in
    # fresh sessions.
    for _ in range(100):
        again = [r for r in pending if _leaked(r["job"])]
        if not again:
            break
        if len(again) == len(pending):
            break  # no progress: leave the error in place
        pending = again
        chunks = [pending[i::jobs] for i in range(min(jobs, len(pending)))]
        with ThreadPoolExecutor(max_workers=len(chunks)) as pool:
            list(pool.map(one, chunks))


def _leaked(job):
    err = os.path.join(job, "error.txt")
    return os.path.exists(err) and "<FACTOR_60>" in open(err).read()


def finish(r, tol, dump_dir, model, binary=None):
    if "refused" in r:
        return _finish_refused(r, model, dump_dir)
    job = r.pop("job")
    sres, meta = r.pop("sres"), r.pop("meta")
    out, err = os.path.join(job, "result.json"), os.path.join(job, "error.txt")
    if not os.path.exists(out):
        msg = "no result (Code_Aster session died?)"
        if os.path.exists(err):
            with open(err) as f:
                msg = f.read()
        why = [_first_error(msg)]
        if "<FACTOR_11>" in msg:
            if dump_dir:
                C._dump(dump_dir, r["name"], model)
            return dict(r, status="silent_singular", why=why)
        r.pop("near_singular", None)
        if "<FACTOR_57>" in msg:
            # MUMPS could not reach RESI_RELA = 1e-6: the model is too
            # ill-conditioned for Code_Aster to give a reference.
            return dict(r, status="ill_conditioned", why=["code_aster: " + why[0]])
        return dict(r, status="aster_failed", why=why)
    own = sres
    bad, groups, sres = compare_with_aster(model, sres, meta, out, tol)
    if bad is None:
        return dict(r, status="unloaded")
    st = "mismatch" if bad else "ok"
    why = []
    if r.pop("near_singular", False):
        st = "silent_singular" if bad else "near_singular"
        warned = sorted(set(sres["diags"]) & WARNED_CONDITIONING)
        near_mechanism = "NUM-INVARIANCE" in sres.get("issues", [])
        held = []
        if bad and near_mechanism:
            if warned and held_mechanism(model, sres, bad, binary, tol):
                st = "warned_singular"
            elif ((hres := held_solve(model, own, bad, binary)) is not None
                  and held_mechanism(model, sres, [b for b in bad if b[0] == "disp"], binary, tol)
                  and aster_agrees_held(model, own, hres, bad, job, tol)):
                st = "warned_singular"
                held = ["stabileo warned: NUM-INVARIANCE", "stabileo forces the same to round-off with the disagreeing DOFs held, "
                        "moving them needs no force, and code_aster agrees on the held model: "
                        + ", ".join(f"{b[1]} {b[2]}" for b in bad if b[0] == "disp")]
        if bad:
            why = ["code_aster: singular at NPREC=10, and with the check off its solution disagrees"] + [
                f"stabileo warned: {w}" for w in warned] + held
    r = dict(r, status=st, max_err=groups, tol=tol, n_bad=len(bad),
             worst=sorted(bad, key=lambda b: -b[5])[:8], **({"why": why} if why else {}))
    if bad and dump_dir:
        os.makedirs(dump_dir, exist_ok=True)
        base = os.path.join(dump_dir, r["name"].replace("/", "_"))
        with open(base + ".json", "w") as f:
            json.dump(model, f, indent=1)
        shutil.copy(os.path.join(job, "model.comm"), base + ".comm")
    return r


def compare_with_aster(model, sres, meta, out, tol):
    ares = to_aster.postprocess(meta, json.load(open(out)))
    skip = set(ares.pop("skip_reac"))
    # Reactions at constrained nodes include the multipliers of the
    # constraint equations in Code_Aster (REAC_NODA) but not in stabileo,
    # whose reactions are the support forces only: not comparable there.
    ares["reac"] = {n: v for n, v in ares["reac"].items() if n not in skip}
    # compare.py scales forces by the largest reaction / end force. A
    # thermal load on a statically determinate model causes none (free
    # expansion), which would compare round-off with round-off: floor the
    # scale with the restrained thermal force EA.eps0 (EI.kappa0 / size),
    # entered as one identical pseudo-member on both sides.
    th = [(abs(v) / (C_size(model) if k != "N" else 1.0)) for e in meta["elements"] for k, v in e["eps0"].items()]
    if th and max(th) > 0:
        pseudo = {k: max(th) for k in ("nStart", "nEnd")}
        pseudo.update({k: 0.0 for k in ("vyStart", "vyEnd", "vzStart", "vzEnd", "mxStart", "mxEnd",
                                        "myStart", "myEnd", "mzStart", "mzEnd")})
        ares["forces"]["thermal-scale"] = dict(pseudo)
        sres = dict(sres, forces=dict(sres["forces"], **{"thermal-scale": dict(pseudo)}))
    bad, groups = C.compare(model, sres, ares, tol)
    return bad, groups, sres


def held_mechanism(model, sres, bad, binary, tol):
    """Whether the disagreement is a mechanism of stabileo's own model. Every disagreement must be a
    displacement, and stabileo is solved again with all of them moved at once along the difference
    vector (Code_Aster minus stabileo), scaled to a finite amplitude: it qualifies only if no reaction,
    member force or other displacement changes beyond `tol` and the imposed motion needs no force at
    any moved DOF. A difference that deforms the structure, even between DOFs that share a rigid-body
    motion, needs a force to impose, so it fails here."""
    names = ["ux", "uy", "uz", "rx", "ry", "rz"]
    diff = {}
    for b in bad:
        if b[0] != "disp" or b[2] not in names or not all(isinstance(v, (int, float)) and math.isfinite(v) for v in b[3:6]):
            return False
        diff[(str(b[1]), names.index(b[2]))] = b[4] - b[3]
    nodes = {str(n.get("id")) for n in (model.get("nodes") or {}).values()}
    if not binary or not diff or any(nid not in nodes for nid, _ in diff):
        return False
    peak = max(abs(d) for d in diff.values())
    if peak == 0.0:
        return False
    amplitude = 2.0 * max([abs(v) for u in sres["disp"].values() for v in u] + [1e-3]) / peak
    moved = json.loads(json.dumps(model))
    sups = moved.setdefault("supports", {})
    imposed = {}
    for (nid, k), d in sorted(diff.items()):
        sup = next((s for s in sups.values() if str(s.get("nodeId")) == nid), None)
        if sup is None:
            next_id = max([int(s.get("id", 0) or 0) for s in sups.values()] + [0]) + 1
            sup = sups.setdefault(f"moved-{nid}", {"id": next_id, "nodeId": int(nid)})
        if sup.get(to_aster.FLAGS[k]) or sup.get(to_aster.PRESC[k]) is not None or (sup.get(to_aster.SPRINGS[k]) or 0.0) != 0.0:
            return False
        original = (sres["disp"].get(int(nid)) or sres["disp"].get(nid) or [0.0] * 6)[k]
        imposed[(nid, k)] = original + amplitude * d
        sup[to_aster.FLAGS[k]] = True
        sup[to_aster.PRESC[k]] = imposed[(nid, k)]
    try:
        mres = dict(C.normalize_stabileo(C.stabileo(moved, binary), 3), dim=3)
    except RuntimeError:
        return False
    changed, _ = C.compare(model, sres, mres, tol)
    moved_nodes = {nid for nid, _ in imposed}
    for b in changed:
        if b[0] == "disp" and b[2] in names and (str(b[1]), names.index(b[2])) in imposed:
            continue
        if b[0] == "reac" and b[2] == "missing" and str(b[1]) in moved_nodes:
            continue
        return False
    scale = max([abs(v) for r in sres["reac"].values() for v in r]
                + [abs(v) for f in sres["forces"].values() for v in f.values()] + [1e-300])
    for (nid, k), value in imposed.items():
        applied = mres["disp"].get(int(nid)) or mres["disp"].get(nid)
        if applied is None or not math.isfinite(applied[k]) or abs(applied[k] - value) > tol * max(abs(value), 1e-300):
            return False
        reaction = mres["reac"].get(int(nid)) or mres["reac"].get(nid)
        if reaction is None or not math.isfinite(reaction[k]) or abs(reaction[k]) > tol * scale:
            return False
    return True


HELD_ROUND_OFF = 64 * sys.float_info.epsilon


def held_model(model, sres, bad):
    """The model with every disagreeing displacement restrained at stabileo's own value, and those
    DOFs; None when one is not a free DOF of a known node."""
    names = ["ux", "uy", "uz", "rx", "ry", "rz"]
    dofs = sorted({(str(b[1]), names.index(b[2])) for b in bad if b[0] == "disp" and b[2] in names})
    nodes = {str(n.get("id")) for n in (model.get("nodes") or {}).values()}
    if not dofs or any(nid not in nodes for nid, _ in dofs):
        return None
    held = json.loads(json.dumps(model))
    sups = held.setdefault("supports", {})
    for nid, k in dofs:
        own = (sres["disp"].get(int(nid)) or sres["disp"].get(nid) or [None] * 6)[k]
        if own is None or not math.isfinite(own):
            return None
        sup = next((s for s in sups.values() if str(s.get("nodeId")) == nid), None)
        if sup is None:
            next_id = max([int(s.get("id", 0) or 0) for s in sups.values()] + [0]) + 1
            sup = sups.setdefault(f"held-{nid}", {"id": next_id, "nodeId": int(nid)})
        if sup.get(to_aster.FLAGS[k]) or sup.get(to_aster.PRESC[k]) is not None or (sup.get(to_aster.SPRINGS[k]) or 0.0) != 0.0:
            return None
        sup[to_aster.FLAGS[k]] = True
        sup[to_aster.PRESC[k]] = own
    return held, dofs


def held_solve(model, sres, bad, binary):
    """Stabileo's answer for its model with every disagreeing displacement held at its own value, when
    every member force and reaction is the same to round-off (HELD_ROUND_OFF of the largest force or
    reaction, no absolute floor) and no held DOF or support the holding added carries a force; None
    otherwise. This alone is self-consistency (a stiff DOF passes too)."""
    built = held_model(model, sres, bad)
    if not binary or built is None:
        return None
    held, dofs = built
    try:
        hres = C.normalize_stabileo(C.stabileo(held, binary), 3)
    except RuntimeError:
        return None
    return hres if _held_identical(sres, hres, dofs) else None


def _held_identical(sres, hres, dofs):
    values = [v for f in sres["forces"].values() for v in f.values()] + [v for r in sres["reac"].values() for v in r]
    if not values or not all(math.isfinite(v) for v in values):
        return False
    bound = HELD_ROUND_OFF * max(abs(v) for v in values)

    def same(a, b):
        return math.isfinite(b) and abs(a - b) <= bound

    if not sres["forces"] or set(hres["forces"]) != set(sres["forces"]):
        return False
    for eid, f in sres["forces"].items():
        if set(hres["forces"][eid]) != set(f) or not all(same(v, hres["forces"][eid][k]) for k, v in f.items()):
            return False
    for nid, r in sres["reac"].items():
        h = hres["reac"].get(nid)
        if h is None or not all(same(a, b) for a, b in zip(r, h)):
            return False
    for nid, k in dofs:
        r = hres["reac"].get(int(nid)) or hres["reac"].get(nid)
        if r is None or not same(0.0, r[k]):
            return False
    for nid, r in hres["reac"].items():
        if nid not in sres["reac"] and not all(same(0.0, v) for v in r):
            return False
    return True


def aster_agrees_held(model, sres, hres, bad, job, tol):
    """Whether Code_Aster, solving the held model with its singularity check on, agrees with
    stabileo's held answer `hres` on every displacement, reaction and member force within `tol`."""
    built = held_model(model, sres, bad)
    if built is None:
        return False
    held, _ = built
    try:
        comm, meta = to_aster.translate(held)
    except to_aster.Unsupported:
        return False
    hjob = job.rstrip(os.sep) + "-held"
    os.makedirs(hjob, exist_ok=True)
    with open(os.path.join(hjob, "model.comm"), "w") as f:
        f.write(comm)
    run_aster([{"job": hjob}], os.path.dirname(hjob), 1)
    out = os.path.join(hjob, "result.json")
    if not os.path.exists(out):
        return False
    hbad, _, _ = compare_with_aster(held, hres, meta, out, tol)
    return hbad == []


def C_size(model):
    xs = [c for p in model["nodes"].values() for c in (p["x"], p.get("y", 0.0), p.get("z", 0.0))]
    return max(max(xs) - min(xs), 1e-12)


def _first_error(msg):
    """The message of a Code_Aster exception box (or the first line)."""
    lines = msg.strip().splitlines()
    for i, line in enumerate(lines):
        if "<EXCEPTION>" in line or "<F>" in line or "<E>" in line:
            body = [x.strip(" ║╚═╝") for x in lines[i:i + 8]]
            return " ".join(b for b in body if b)[:240]
    return lines[0][:240] if lines else "?"


# ---------------------------------------------------------------- main

def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("files", nargs="*")
    ap.add_argument("--fixtures", action="store_true", help="3D engine/tests/fixtures/*-input.json")
    ap.add_argument("--random3d", type=int, default=0)
    ap.add_argument("--rich3d", type=int, default=0)
    ap.add_argument("--aster3d", type=int, default=0)
    ap.add_argument("--seed-start", type=int, default=0)
    ap.add_argument("--bin", default=os.environ.get("STABILEO_SOLVE_JSON", DEFAULT_BIN))
    ap.add_argument("--tol", type=float, default=1e-6)
    ap.add_argument("-j", "--jobs", type=int, default=4, help="parallel Code_Aster sessions")
    ap.add_argument("--report")
    ap.add_argument("--dump-dir")
    ap.add_argument("--keep", action="store_true", help="keep the job directories (printed)")
    ap.add_argument("--flagged", action="store_true",
                    help="also run the models stabileo flags as ill-conditioned (statuses get a flagged- prefix): "
                         "checks that the warnings are not false alarms")
    ap.add_argument("-v", "--verbose", action="store_true")
    a = ap.parse_args()

    if not os.path.exists(a.bin):
        print(f"solver binary not found: {a.bin}\n  cargo build --release --example solve_json", file=sys.stderr)
        return 2
    models = collect(a)
    os.makedirs(os.path.join(HERE, ".work"), exist_ok=True)
    workdir = tempfile.mkdtemp(dir=os.path.join(HERE, ".work"), prefix="jobs-")
    with ThreadPoolExecutor(max_workers=max(1, a.jobs)) as pool:
        results = list(pool.map(lambda j: prepare(j[0], j[1], a.bin, workdir, a.flagged), models))
    pending = [r for r in results if r["status"] == "pending"]
    run_aster(pending, workdir, max(1, a.jobs))
    # Code_Aster calls a matrix singular when a pivot loses NPREC = 10
    # digits. Rerun those with the check off (NPREC = -1): if the results
    # then agree with stabileo the model is merely ill-conditioned
    # (near_singular); if not, stabileo solved a singular system silently.
    near = []
    for r in pending:
        err = os.path.join(r["job"], "error.txt")
        if "refused" not in r and os.path.exists(err) and "<FACTOR_11>" in open(err).read():
            comm = os.path.join(r["job"], "model.comm")
            with open(comm) as f:
                text = f.read()
            with open(comm, "w") as f:
                f.write(text.replace("NPREC=10", "NPREC=-1"))
            r["near_singular"] = True
            near.append(r)
    run_aster(near, workdir, max(1, a.jobs))
    by_name = dict(models)
    def safe_finish(r):
        job = r["job"]
        try:
            return finish(r, a.tol, a.dump_dir, by_name[r["name"]], a.bin)
        except Exception:  # noqa: a harness bug on one model must not hide the others
            if a.dump_dir:
                os.makedirs(a.dump_dir, exist_ok=True)
                base = os.path.join(a.dump_dir, r["name"].replace("/", "_"))
                with open(base + ".json", "w") as f:
                    json.dump(by_name[r["name"]], f, indent=1)
                shutil.copy(os.path.join(job, "model.comm"), base + ".comm")
            return dict(name=r["name"], status="harness_error", why=[traceback.format_exc()[-400:]])

    results = [safe_finish(r) if r["status"] == "pending" else r for r in results]
    for r in results:
        if r["status"] == "silent_unimposed" and a.dump_dir:
            C._dump(a.dump_dir, r["name"], by_name[r["name"]])
    for r in results:
        if r.get("flagged"):
            r["status"] = "flagged-" + ("silent" if r["status"] == "silent_singular" else r["status"])
    if a.keep:
        print(f"job directories: {workdir}")
    else:
        shutil.rmtree(workdir, ignore_errors=True)

    for r in results:
        if a.verbose or r["status"] in ("mismatch", "aster_failed", "silent_singular", "silent_unimposed", "false_reject", "harness_error"):
            extra = r.get("why") or {k: f"{v:.1e}" for k, v in r.get("max_err", {}).items()}
            print(f"{r['status']:16} {r['name']}  {extra}")
            for w in r.get("worst", [])[:5] if r["status"] in ("mismatch", "silent_singular") else []:
                q, i, c, s_, o, e = w
                print(f"    {q} {i} {c}: stabileo={s_!r} code_aster={o!r} err={e:.2e}")
    cnt = Counter(r["status"] for r in results)
    print("\nsummary: " + json.dumps(dict(cnt)))
    g = {}
    for r in results:
        for k, v in r.get("max_err", {}).items():
            g[k] = max(g.get(k, 0.0), v)
    if g:
        print("max normalized error over compared models: " + json.dumps({k: f"{v:.2e}" for k, v in sorted(g.items())}))
    for st in ("unsupported", "refused", "false_reject", "stabileo_failed", "ill_conditioned", "silent_singular",
               "warned_singular", "silent_unimposed", "aster_failed"):
        reasons = Counter(w[:120] for r in results if r["status"] == st for w in r.get("why", []))
        if reasons:
            print(f"{st} reasons: " + json.dumps(dict(reasons.most_common(8))))
    if a.report:
        with open(a.report, "w") as f:
            json.dump(results, f, indent=1, default=str)
    if cnt.get("aster_failed") or cnt.get("harness_error"):
        return 2
    return 1 if any(cnt.get(st) for st in ("mismatch", "silent_singular", "silent_unimposed", "false_reject")) else 0


if __name__ == "__main__":
    sys.exit(main())
