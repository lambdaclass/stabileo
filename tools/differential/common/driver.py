"""Run one differential comparison per model, in parallel, with shrinking
and reporting. Used by tools/differential/run.py for every program.

An adapter (tools/differential/<program>/adapter.py) provides:
  NAME, ANALYSES
  available() -> bool
  unsupported(model, analysis) -> [reasons]      (empty: supported)
  run(model, analysis, densities=, n_modes=) -> reference results
    static / pdelta: dict(dim, disp, reac, forces[, art_rot, kappa])
    modal:           dict(freqs, shapes)
  TOL (optional): {analysis: (tol, extra)} default tolerances
  write_native(model, analysis, path) (optional): the native input file,
    written next to mismatch dumps.

Statuses: ok, mismatch, unsupported, stabileo_failed, ill_conditioned,
unstable (P-Delta beyond the first buckling load: no unique answer),
reference_failed, unloaded, and three that point at stabileo's own
singularity checks (dumped like mismatches):

  silent_singular  the reference's stiffness is singular (kappa > 1e14) and
                   stabileo solved it without a warning;
  false_reject     stabileo refused a static model whose reference stiffness
                   is regular (kappa < 1e10);
  false_warning    stabileo flagged a static model ill-conditioned whose
                   reference stiffness is well conditioned (kappa < 1e8).

The last two need a reference that reports kappa (the Jacobi-scaled
condition number of its free stiffness); otherwise they stay
stabileo_failed / ill_conditioned.
"""

# kappa limits for the cross-checks of stabileo's singularity diagnostics.
KAPPA_SINGULAR = 1e14
KAPPA_REGULAR = 1e10
KAPPA_WELL = 1e8
FLAGGED = ("mismatch", "silent_singular", "false_reject", "false_warning")

import copy
import json
import math
import os
import traceback

import known as K
import model as M
import results as R


class Case:
    def __init__(self, name, model, analysis="static", n_modes=6):
        self.name, self.model, self.analysis, self.n_modes = name, model, analysis, n_modes


def _strip(model):
    m = {k: v for k, v in model.items() if not k.startswith("_")}
    return m


def run_case(adapter, model, analysis, tol, n_modes=6, mode_tol=None):
    """dict(status, ...) for one model."""
    dim = 3 if M.is_3d(model) else 2
    why = adapter.unsupported(model, analysis)
    if why:
        return dict(status="unsupported", why=why)
    clean = _strip(model)
    dens = model.get("_densities") or {}
    try:
        if analysis == "modal":
            # Mechanisms (rigid-body modes) have no well-defined mode order:
            # require a nonsingular stiffness, checked with a unit load.
            probe = dict(clean, loads=[{"type": "nodal", "data": {
                "nodeId": min(n["id"] for n in clean["nodes"].values()),
                "fx": 1.0, "fy": 1.0, "fz": 1.0, "mx": 0.0, "my": 0.0, "mz": 0.0}}])
            pres = M.normalize_static(M.stabileo(probe, "static"), dim)
            ill = sorted(set(pres["diags"]) & M.ILL_CONDITIONED)
            if ill:
                return dict(status="ill_conditioned", why=ill)
            sraw = M.stabileo(clean, "modal", modes=2 * n_modes, densities=dens)
            sres = M.normalize_modal(sraw, dim)
        elif analysis == "pdelta":
            sraw = M.stabileo(clean, "pdelta", max_iter=200, tol=1e-13)
            if not sraw.get("converged") or not sraw.get("isStable"):
                return dict(status="unstable", why=[f"converged={sraw.get('converged')} b2={sraw.get('b2Factor')}"])
            sres = M.normalize_static(sraw["results"], dim)
        else:
            sres = M.normalize_static(M.stabileo(clean, "static"), dim)
    except RuntimeError as ex:
        r = dict(status="stabileo_failed", why=[str(ex)[:200]])
        if analysis == "static":
            _cross_check(adapter, clean, dens, r, KAPPA_REGULAR, "false_reject")
        return r
    if analysis != "modal":
        ill = sorted(set(sres["diags"]) & M.ILL_CONDITIONED)
        if ill:
            r = dict(status="ill_conditioned", why=ill)
            if analysis == "static":
                _cross_check(adapter, clean, dens, r, KAPPA_WELL, "false_warning")
            return r
    try:
        rres = adapter.run(clean, analysis, densities=dens, n_modes=2 * n_modes if analysis == "modal" else n_modes)
    except M.Unsupported as ex:
        return dict(status="unsupported", why=[str(ex)])
    except Exception as ex:  # noqa: reference programs fail in many ways
        return dict(status="reference_failed", why=[f"{type(ex).__name__}: {str(ex)[:300]}"])
    if analysis == "modal":
        nodes = sorted(n["id"] for n in clean["nodes"].values())
        ftol, stol = mode_tol or (tol, math.sqrt(tol))
        bad, groups = R.modal_compare(sres, rres, n_modes, nodes, ftol=ftol, stol=stol)
        kappa = None
    else:
        kappa = rres.get("kappa")
        if kappa is not None and kappa > 1e12:
            # The reference finds the stiffness singular (or nearly): stabileo
            # must have said so (the ILL_CONDITIONED diagnostics were checked
            # above, so here it solved silently).
            if kappa > KAPPA_SINGULAR:
                return dict(status="silent_singular", why=[f"kappa={kappa:.1e} min_pivot={rres.get('min_pivot')}"],
                            kappa=kappa, min_pivot=rres.get("min_pivot"))
            return dict(status="ill_conditioned", why=[f"kappa={kappa:.1e}"])
        tol = max(tol, 100 * 2.2e-16 * (kappa or 0.0))
        bad, groups = R.static_compare(clean, sres, rres, tol)
        if bad is None:
            return dict(status="unloaded")
    status = "mismatch" if bad else "ok"
    why = K.classify(analysis, bad) if bad else None
    if why:
        status = "known"
    return dict(status=status, known=why, max_err=groups, tol=tol, kappa=kappa, n_bad=len(bad),
                worst=sorted(bad, key=lambda b: -b[5])[:8])


def _cross_check(adapter, clean, dens, r, limit, status):
    """Turn r (stabileo refused or flagged the model) into `status` when the
    reference solves it with a stiffness condition number below `limit`."""
    try:
        rres = adapter.run(clean, "static", densities=dens)
    except Exception as ex:  # noqa: unsupported or failed: nothing to compare with
        r["reference"] = f"{type(ex).__name__}: {str(ex)[:120]}"
        return
    kappa = rres.get("kappa")
    r["kappa"] = kappa
    if kappa is not None and kappa < limit:
        r["status"] = status
        r["why"] = r["why"] + [f"reference kappa={kappa:.1e}"]


# ---------------------------------------------------------------- shrinking

def _drop_element(m, eid):
    m = copy.deepcopy(m)
    m["elements"] = {k: e for k, e in m["elements"].items() if e["id"] != eid}
    m["loads"] = [ld for ld in m["loads"] if ld["data"].get("elementId") != eid]
    used = set()
    for e in m["elements"].values():
        used.update((e["nodeI"], e["nodeJ"]))
    m["nodes"] = {k: n for k, n in m["nodes"].items() if n["id"] in used}
    m["supports"] = {k: s for k, s in m["supports"].items() if s["nodeId"] in used}
    m["loads"] = [ld for ld in m["loads"] if ld["type"] != "nodal" or ld["data"]["nodeId"] in used]
    return m


def _candidates(m):
    """Smaller variants of m, most aggressive first."""
    for i in range(len(m["loads"])):
        if len(m["loads"]) > 1:
            c = copy.deepcopy(m)
            del c["loads"][i]
            yield c
    for e in sorted(m["elements"].values(), key=lambda e: -e["id"]):
        if len(m["elements"]) > 1:
            yield _drop_element(m, e["id"])
    for k, s in list(m["supports"].items()):
        c = copy.deepcopy(m)
        del c["supports"][k]
        yield c
        for f in ("rx", "ry", "rz", "rrx", "rry", "rrz", "kx", "ky", "kz", "krx", "kry", "krz",
                  "dx", "dy", "dz", "drx", "dry", "drz"):
            if s.get(f):
                c = copy.deepcopy(m)
                if f in ("rx", "ry", "rz", "rrx", "rry", "rrz"):
                    c["supports"][k][f] = False  # required fields in 3D
                else:
                    c["supports"][k].pop(f)
                yield c
    for k, e in m["elements"].items():
        for f in ("rollAngle", "localYx", "releaseMyStart", "releaseMyEnd", "releaseMzStart", "releaseMzEnd",
                  "releaseTStart", "releaseTEnd", "hingeStart", "hingeEnd"):
            if e.get(f):
                c = copy.deepcopy(m)
                for g in ((f,) if f != "localYx" else ("localYx", "localYy", "localYz")):
                    c["elements"][k].pop(g, None)
                yield c
    for k, s in m["sections"].items():
        for f in ("asY", "asZ"):
            if s.get(f):
                c = copy.deepcopy(m)
                c["sections"][k].pop(f)
                yield c
    for i, ld in enumerate(m["loads"]):
        for f, v in ld["data"].items():
            if f not in ("elementId", "nodeId", "a", "b") and isinstance(v, (int, float)) and v != 0:
                c = copy.deepcopy(m)
                c["loads"][i]["data"][f] = 0.0
                yield c
            if f in ("a", "b"):
                c = copy.deepcopy(m)
                c["loads"][i]["data"].pop(f)
                yield c


def _worst(r):
    return max((w[5] for w in r.get("worst", [])), default=0.0)


def shrink(adapter, model, analysis, tol, n_modes=6, max_steps=400):
    """Greedy delta debugging: keep any smaller variant that still mismatches
    with at least half the original worst error (so that the search does
    not drift to a different, smaller discrepancy)."""
    first = run_case(adapter, model, analysis, tol, n_modes)
    target = 0.5 * _worst(first)
    cur, steps = model, 0
    changed = True
    while changed and steps < max_steps:
        changed = False
        for c in _candidates(cur):
            steps += 1
            if steps >= max_steps:
                break
            try:
                r = run_case(adapter, c, analysis, tol, n_modes)
            except Exception:  # noqa: a candidate may break a translator
                continue
            if r["status"] == first["status"] and (r["status"] != "mismatch" or _worst(r) >= target):
                cur, changed = c, True
                break
    return cur


# ---------------------------------------------------------------- driver

def run_all(adapter, cases, tol, jobs=4, dump_dir=None, do_shrink=False, verbose=False, mode_tol=None):
    from concurrent.futures import ThreadPoolExecutor

    def one(case):
        try:
            r = run_case(adapter, case.model, case.analysis, tol, case.n_modes, mode_tol)
        except Exception as ex:  # noqa: harness bug: report, keep going
            r = dict(status="harness_error", why=[traceback.format_exc()[-600:]])
        r.update(name=case.name, analysis=case.analysis)
        if r["status"] in FLAGGED and dump_dir:
            os.makedirs(dump_dir, exist_ok=True)
            base = os.path.join(dump_dir, f"{adapter.NAME}-{case.analysis}-{case.name}".replace("/", "_"))
            with open(base + ".json", "w") as f:
                json.dump(case.model, f, indent=1)
            if do_shrink:
                small = shrink(adapter, case.model, case.analysis, tol, case.n_modes)
                with open(base + ".min.json", "w") as f:
                    json.dump(small, f, indent=1)
                r["shrunk"] = dict(nodes=len(small["nodes"]), elements=len(small["elements"]),
                                   loads=len(small["loads"]))
                if hasattr(adapter, "write_native"):
                    try:
                        adapter.write_native(_strip(small), case.analysis, base + ".min")
                    except Exception:  # noqa
                        pass
        return r

    with ThreadPoolExecutor(max_workers=max(1, jobs)) as pool:
        results = list(pool.map(one, cases))
    return results


def summarize(results, verbose=False, out=print):
    from collections import Counter
    for r in results:
        if verbose or r["status"] in FLAGGED + ("harness_error",):
            extra = r.get("why") or {k: f"{v:.1e}" for k, v in r.get("max_err", {}).items()}
            out(f"{r['status']:16} {r['analysis']:8} {r['name']}  {extra}")
            for w in r.get("worst", [])[:5] if r["status"] == "mismatch" else []:
                q, i, c, s_, o, e = w
                out(f"    {q} {i} {c}: stabileo={s_!r} reference={o!r} err={e:.2e}")
            if r.get("shrunk"):
                out(f"    shrunk to {r['shrunk']}")
    cnt = Counter(r["status"] for r in results)
    out("\nsummary: " + json.dumps(dict(cnt)))
    g = {}
    for r in results:
        if r["status"] in ("ok", "mismatch", "known"):
            for k, v in r["max_err"].items():
                g[k] = max(g.get(k, 0.0), v)
    if g:
        out("max normalized error over compared models: " + json.dumps({k: f"{v:.2e}" for k, v in sorted(g.items())}))
    for st in ("known", "silent_singular", "false_reject", "false_warning", "unsupported", "reference_failed",
               "stabileo_failed", "ill_conditioned", "unstable"):
        reasons = Counter(w[:120] for r in results if r["status"] == st
                          for w in ([r["known"]] if st == "known" else r["why"]))
        if reasons:
            out(f"{st} reasons: " + json.dumps(dict(reasons.most_common(8))))
    return cnt
