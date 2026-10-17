"""stabileo 3D frame models -> PyNite (PyNiteFEA, pip).

Element pair: stabileo `frame` (Euler-Bernoulli) <-> PyNite Member3D
(Euler-Bernoulli, releases by static condensation of the 12x12 matrix and of
the fixed-end reactions). PyNite has no shear deformation: Timoshenko
sections are unsupported. Trusses map to members with both bending ends and
one torsion end released (an axial bar).

Mapping:
  * units: E (MPa) x 1000 -> kN/m^2, G = E / (2(1+nu)) passed explicitly.
  * local axes: PyNite's default (Member3D.T) keeps local y "up" in a
    Y-vertical world: vertical members (X and Z equal, math.isclose) get
    y = -+X, z = +Z; horizontal members y = +Y, z = x cross y; others z
    horizontal, y = z cross x. A member rotation theta (degrees) turns y and z
    about x (Rodrigues): y = cos t y0 + sin t z0. We port this, compute
    stabileo's (ex, ey, ez) and solve for theta.
  * releases: releaseMy* -> Ry*, releaseMz* -> Rz*, releaseT* -> Rx*.
  * supports: rigid flags -> def_support; springs -> def_support_spring
    (two-way; as in the engine, a spring frees its DOF even when the rigid
    flag is set too); settlements on restrained DOFs ->
    def_node_disp. PyNite reactions include -k u of the support springs,
    as stabileo's do.
  * loads (native, local axes): nodal -> add_node_load; distributed (full
    or partial, trapezoidal, qX/qY/qZ) -> add_member_dist_load Fx/Fy/Fz;
    point loads py/pz -> add_member_pt_load Fy/Fz. PyNite's fixed-end
    reactions are closed-form polynomials (exact).
  * end forces: Member3D.f() (forces on the member, local axes, k d + fer):
    nStart = -f0, vyStart = f1, ..., nEnd = f6, vyEnd = -f7, ...

Nodes without rotational stiffness (truss-only) get their rotations fixed
(stabileo adds a tiny artificial spring there) and are not compared;
partial rotational mechanisms are unsupported (as in tools/opensees).

P-Delta (analyze_PDelta) is not compared: PyNite's member K_G has an axial
term (P/L on the axial DOFs) and a torsional term (P Ip/(A L)) that stabileo
does not have, and with releases it condenses K_G separately from K.
"""

import math
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "common"))

from model import (Unsupported, get, int_keys, is_3d, lift_2d, lower_static_3d,  # noqa: E402
                   members, nodes_inside_members, rotational_rank, run_isolated, worker_main)

NAME = "pynite"
ANALYSES = ("static",)
TOL = {"static": (1e-6, None)}


def available():
    try:
        import Pynite  # noqa: F401
        return True
    except ImportError:
        return False


def unsupported(model, analysis):
    why = []
    if analysis != "static":
        return [f"analysis {analysis}"]
    if not is_3d(model):
        try:
            model = lift_2d(model, allow_hinges=True)
        except Unsupported as ex:
            return [str(ex)]
    for k in ("constraints", "connectors", "plates", "quads", "quad9s", "solidShells", "curvedShells", "curvedBeams"):
        if model.get(k):
            why.append(k)
    if model.get("leftHand"):
        why.append("leftHand axes")
    for s in model["sections"].values():
        if s.get("cw") is not None:
            why.append("warping (cw)")
        if s.get("asY") or s.get("asZ"):
            why.append("Timoshenko section")
    for e in model["elements"].values():
        if e["type"] not in ("frame", "truss"):
            why.append(f"element type {e['type']}")
    for s in model["supports"].values():
        if s.get("isInclined"):
            why.append("inclined support")
        if s.get("rw") or s.get("kw"):
            why.append("warping support")
    for ld in model["loads"]:
        if ld["type"] not in ("nodal", "distributed", "pointOnElement"):
            why.append(f"load {ld['type']}")
    if nodes_inside_members(model):
        why.append("node inside a member (PyNite physical members split there, stabileo does not connect it)")
    return sorted(set(why))


def default_axes(pi, pj):
    """PyNite Member3D.T() without rotation: (x, y0, z0)."""
    import numpy as np
    Xi, Yi, Zi = pi
    Xj, Yj, Zj = pj
    L = math.dist(pi, pj)
    x = np.array([(Xj - Xi) / L, (Yj - Yi) / L, (Zj - Zi) / L])
    if math.isclose(Xi, Xj) and math.isclose(Zi, Zj):
        y = np.array([-1.0, 0, 0]) if Yj > Yi else np.array([1.0, 0, 0])
        z = np.array([0.0, 0, 1])
    elif math.isclose(Yi, Yj):
        y = np.array([0.0, 1, 0])
        z = np.cross(x, y)
        z = z / np.linalg.norm(z)
    else:
        proj = np.array([Xj - Xi, 0, Zj - Zi])
        z = np.cross(proj, x) if Yj > Yi else np.cross(x, proj)
        z = z / np.linalg.norm(z)
        y = np.cross(z, x)
        y = y / np.linalg.norm(y)
    return x, y, z


def rotation(pi, pj, ey):
    _, y0, z0 = default_axes(pi, pj)
    return math.degrees(math.atan2(float(sum(a * b for a, b in zip(ey, z0))), float(sum(a * b for a, b in zip(ey, y0)))))


_FLAGS = ("rx", "ry", "rz", "rrx", "rry", "rrz")
_DOF = ("DX", "DY", "DZ", "RX", "RY", "RZ")
_DISP = ("dx", "dy", "dz", "drx", "dry", "drz")
_SPR = ("kx", "ky", "kz", "krx", "kry", "krz")


def build(model):
    """(FEModel3D, art_rot) for a supported 3D model."""
    from Pynite import FEModel3D
    fm = FEModel3D()
    mem = members(model)
    for n in model["nodes"].values():
        fm.add_node(str(n["id"]), float(n["x"]), float(n["y"]), float(n["z"]))
    for m in model["materials"].values():
        E = m["e"] * 1000.0
        fm.add_material(str(m["id"]), E, E / (2 * (1 + m["nu"])), m["nu"], 1.0)
    for s in model["sections"].values():
        fm.add_section(str(s["id"]), s["a"], s["iy"], s["iz"], s["j"])
    for eid, m in sorted(mem.items()):
        e = m["e"]
        name = str(eid)
        fm.add_member(name, str(m["ni"]), str(m["nj"]), str(e["materialId"]), str(e["sectionId"]),
                      rotation=rotation(m["pi"], m["pj"], m["ey"]))
        if e["type"] == "truss":
            fm.def_releases(name, Rxi=True, Ryi=True, Rzi=True, Ryj=True, Rzj=True)
        else:
            r = {k: bool(e.get(v)) for k, v in (("Rxi", "releaseTStart"), ("Ryi", "releaseMyStart"),
                                                 ("Rzi", "releaseMzStart"), ("Rxj", "releaseTEnd"),
                                                 ("Ryj", "releaseMyEnd"), ("Rzj", "releaseMzEnd"))}
            if any(r.values()):
                fm.def_releases(name, **r)
    flags, disp, spr = {}, {}, {}
    for s in model["supports"].values():
        n = s["nodeId"]
        fl = flags.setdefault(n, [False] * 6)
        for k in range(6):
            fl[k] = fl[k] or bool(s.get(_FLAGS[k]))
            if s.get(_DISP[k]):
                disp.setdefault(n, {})[k] = float(s[_DISP[k]])
            if s.get(_SPR[k]):
                spr.setdefault(n, {})[k] = spr.get(n, {}).get(k, 0.0) + float(s[_SPR[k]])
    # stabileo (dof.rs): a spring stiffness on a DOF makes it free, even
    # when the rigid flag is also set.
    for n, d in spr.items():
        for k in d:
            if n in flags:
                flags[n][k] = False
    rank, art_rot = rotational_rank(model, flags, spr)
    for ld in model["loads"]:
        x = ld["data"]
        if ld["type"] == "nodal" and x["nodeId"] in art_rot and any(get(x, k) for k in ("mx", "my", "mz")):
            # A moment on a node with no rotational stiffness is a local
            # mechanism (stabileo refuses it); fixing that node's rotations
            # here would solve it (as tools/opensees/compare.py).
            raise Unsupported("nodal moment at a node without rotational stiffness")
    for n in art_rot:
        fl = flags.setdefault(n, [False] * 6)
        fl[3:] = [True, True, True]
    for n, fl in flags.items():
        if any(fl):
            fm.def_support(str(n), *fl)
    for n, d in disp.items():
        for k, v in d.items():
            if flags[n][k]:
                fm.def_node_disp(str(n), _DOF[k], v)
    for n, d in spr.items():
        for k, v in d.items():
            if not flags.get(n, [False] * 6)[k]:
                fm.def_support_spring(str(n), _DOF[k], v)
    for ld in model["loads"]:
        x = ld["data"]
        if ld["type"] == "nodal":
            for key, dof in zip(("fx", "fy", "fz", "mx", "my", "mz"), ("FX", "FY", "FZ", "MX", "MY", "MZ")):
                if get(x, key):
                    fm.add_node_load(str(x["nodeId"]), dof, get(x, key))
            continue
        eid = x["elementId"]
        L = mem[eid]["L"]
        if ld["type"] == "distributed":
            a = x.get("a") or 0.0
            b = x.get("b") if x.get("b") is not None else L
            for c in "XYZ":
                qi, qj = get(x, f"q{c}I"), get(x, f"q{c}J")
                if qi or qj:
                    fm.add_member_dist_load(str(eid), "F" + c.lower(), qi, qj, a, b)
        elif ld["type"] == "pointOnElement":
            for key, d in (("px", "Fx"), ("py", "Fy"), ("pz", "Fz")):
                if get(x, key):
                    fm.add_member_pt_load(str(eid), d, get(x, key), x["a"])
            mg = x.get("_mglobal")
            if mg:
                for v, d in zip(mg, ("MX", "MY", "MZ")):
                    if v:
                        fm.add_member_pt_load(str(eid), d, v, x["a"])
    fm.add_load_combo("C", {"Case 1": 1.0})
    return fm, art_rot


def run(model, analysis="static", densities=None, n_modes=6):
    why = unsupported(model, analysis)
    if why:
        raise Unsupported(", ".join(why))
    if not is_3d(model):
        return lower_static_3d(run(lift_2d(model, allow_hinges=True), analysis), model)
    return int_keys(run_isolated(os.path.abspath(__file__), {"model": model, "analysis": analysis}))


def solve(model, analysis):
    """In the worker process: build, analyze, extract."""
    fm, art_rot = build(model)
    fm.analyze_linear(check_stability=False, sparse=False)
    c = "C"
    disp = {}
    for n in model["nodes"].values():
        nd = fm.nodes[str(n["id"])]
        disp[n["id"]] = [nd.DX[c], nd.DY[c], nd.DZ[c], nd.RX[c], nd.RY[c], nd.RZ[c]]
    reac = {}
    for s in model["supports"].values():
        nd = fm.nodes[str(s["nodeId"])]
        r = [nd.RxnFX[c], nd.RxnFY[c], nd.RxnFZ[c], nd.RxnMX[c], nd.RxnMY[c], nd.RxnMZ[c]]
        if s["nodeId"] in art_rot:
            r[3:] = [0.0, 0.0, 0.0]
        reac[s["nodeId"]] = r
    forces = {}
    names = ["n", "vy", "vz", "mx", "my", "mz"]
    for e in model["elements"].values():
        pm = fm.members[str(e["id"])]
        subs = list(pm.sub_members.values()) if pm.sub_members else [pm]
        fa = [float(v) for v in subs[0].f(c).flatten()]
        fb = [float(v) for v in subs[-1].f(c).flatten()]
        fd = {}
        for k, n in enumerate(names):
            fd[f"{n}Start"] = -fa[k] if k == 0 else fa[k]
            fd[f"{n}End"] = fb[6 + k] if k == 0 else -fb[6 + k]
        if e["type"] == "truss":
            for k in names[1:]:
                fd[f"{k}Start"] = fd[f"{k}End"] = 0.0
        forces[e["id"]] = fd
    kappa, pivot = conditioning(fm)
    return dict(dim=3, disp=disp, reac=reac, forces=forces, art_rot=sorted(art_rot), kappa=kappa, min_pivot=pivot)


def conditioning(fm):
    """(kappa, min pivot ratio) of PyNite's free stiffness (springs included):
    kappa is the Jacobi-scaled 2-norm condition number; the pivot ratio
    d_j / K_jj is taken from a Cholesky factorization in stabileo's DOF
    order (nodes by id, ux..rz), the quantity stabileo's singularity check
    (engine/src/solver/definiteness.rs) thresholds."""
    import numpy as np
    K = fm.Ke("C", sparse=False, check_stability=False)
    K = np.asarray(K.todense() if hasattr(K, "todense") else K, dtype=float)
    nodes = sorted(fm.nodes.values(), key=lambda nd: int(nd.name))
    free = []
    for nd in nodes:
        sup = (nd.support_DX, nd.support_DY, nd.support_DZ, nd.support_RX, nd.support_RY, nd.support_RZ)
        free += [nd.ID * 6 + k for k in range(6) if not sup[k]]
    if not free or len(free) > 3000:
        return None, None
    Kf = K[np.ix_(free, free)]
    # Jacobi scaling hides a DOF whose whole stiffness is round-off (e.g. a
    # node turning about a column whose torsion is released at the other
    # end: diagonal 1e-11 against 1e5): call such a stiffness singular.
    kind = np.array([k % 6 >= 3 for k in free])
    d = np.abs(np.diag(Kf))
    for sel in (kind, ~kind):
        if sel.any():
            ref = np.median(d[sel])
            if ref > 0 and (d[sel] <= 1e-10 * ref).any():
                return float("inf"), 0.0
    dg = np.sqrt(np.abs(np.diag(Kf)))
    dg[dg == 0] = 1.0
    kappa = float(np.linalg.cond(Kf / np.outer(dg, dg)))
    L = Kf.copy()
    n = len(L)
    ratio = np.inf
    for j in range(n):
        d = L[j, j] - L[j, :j] @ L[j, :j]
        ratio = min(ratio, d / Kf[j, j] if Kf[j, j] else -np.inf)
        if d <= 0:
            break
        L[j, j] = np.sqrt(d)
        L[j + 1:, j] = (L[j + 1:, j] - L[j + 1:, :j] @ L[j, :j]) / L[j, j]
    return kappa, float(ratio)


if __name__ == "__main__" and "--worker" in sys.argv:
    worker_main(solve)
