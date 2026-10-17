"""stabileo 3D frame models -> Kratos Multiphysics (StructuralMechanicsApplication,
pip wheels KratosMultiphysics 10.4.4).

Element pair: stabileo `frame` (Euler-Bernoulli, or Timoshenko with
asY/asZ) <-> Kratos CrLinearBeamElement3D2N (the linear co-rotational beam:
Euler-Bernoulli without AREA_EFFECTIVE_*, exact two-node Timoshenko with
them; both checked against the closed-form cantilever in README.md);
stabileo `truss` <-> TrussLinearElement3D2N.

Mapping:
  * units: E (MPa) x 1000 -> kN/m^2, nu given (Kratos takes G = E/(2(1+nu)),
    as the engine); density kg/m^3 / 1000 -> t/m^3 (kN, m, s, t).
  * local axes: LOCAL_AXIS_2 (element value) = stabileo's local y (ported
    compute_local_axes_3d, common.model.members).
  * section: CROSS_AREA = a, I22 = iy (bending about local y), I33 = iz,
    TORSIONAL_INERTIA = j. Shear areas: Kratos' AREA_EFFECTIVE_Y is the
    shear area for deflection along local y (paired with I33), stabileo pairs
    asY with Iy (deflection along local z): AREA_EFFECTIVE_Z = asY,
    AREA_EFFECTIVE_Y = asZ.
  * supports: rigid flags -> fixed DOFs (prescribed values for settlements);
    springs -> NodalConcentratedElement3D1N (NODAL_DISPLACEMENT_STIFFNESS /
    NODAL_ROTATIONAL_STIFFNESS, global axes). As in the engine (dof.rs) a
    spring frees its DOF even when the rigid flag is set; its reaction is
    -k u, added here.
  * releases: CrLinearBeamElement3D2N has none. A released end whose
    released local axes are global axes gets its own node at the joint tied
    to it by LinearMasterSlaveConstraints on every non-released global DOF
    (as tools/opensees does with equalDOF); releases about skew axes are
    unsupported.
  * member loads: every member load (uniform, partial, trapezoidal, point,
    axial) is moved to nodes inserted along the member (common.model.nodalize;
    full-length uniform loads are first split in two halves so that they are
    nodalized too). The Gauss point loads are exact for the cubic end
    response of both element types, so nodal results and end forces at the
    original member ends are exact. Kratos' own beam line loads are not used.
  * end forces: k_e u_e from the element's assembled LHS (global axes),
    rotated to stabileo's local axes: forces on the member, so nStart = -f0,
    vyStart = f1, ..., nEnd = f6, vyEnd = -f7, ... (as pynite/adapter.py).
  * reactions: Kratos REACTION / REACTION_MOMENT (force of the support on the
    structure, the engine's sign) on fixed DOFs, -k u on spring DOFs.

Nodes without rotational stiffness (truss-only) get their rotations fixed
(the engine adds a tiny artificial spring there) and are not compared.

kappa: the Jacobi-scaled 2-norm condition number of the free stiffness,
assembled from the Kratos element matrices (enables the driver's
silent_singular / false_reject / false_warning checks).

Modal (not compared, see ANALYSES): K and M can be assembled from the
Kratos element matrices (`_modal`), but Kratos' consistent beam mass
includes rotary inertia, which stabileo's Euler-Bernoulli mass does not.
"""

import copy
import math
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "common"))

from model import (Unsupported, get, int_keys, is_3d, lift_2d, lower_static_3d,  # noqa: E402
                   members, nodalize, rotational_rank, run_isolated, worker_main)

NAME = "kratos"
# Modal is not compared: CrLinearBeamElement3D2N's consistent mass includes
# rotary inertia (Rayleigh beam: M[ry,ry] = 4 rho A L^3/420 + 2 rho Iy L/15,
# checked on a 2 m member with Iy = 4e-5 and 4e-3), stabileo's does not; on
# a two-member cantilever the bending frequencies are 1.5e-4 to 1.1e-2 lower
# while axial and torsional ones agree to 1e-14. Frame3DD (rotary inertia
# patched out) and MYSTRAN (lumped mass) compare modal results.
ANALYSES = ("static",)
TOL = {"static": (1e-6, None), "modal": (1e-6, None)}

_RELEASES = ("releaseMyStart", "releaseMyEnd", "releaseMzStart", "releaseMzEnd", "releaseTStart", "releaseTEnd")


def available():
    """Kratos importable (checked without importing it: importing prints
    its banner and loads every application)."""
    import importlib.util
    spec = importlib.util.find_spec("KratosMultiphysics")
    if spec is None or not spec.submodule_search_locations:
        return False
    return all(any(os.path.isdir(os.path.join(d, app)) for d in spec.submodule_search_locations)
               for app in ("StructuralMechanicsApplication",))


def _released_axes(m, end):
    """Unit vectors (global components) of the local axes released at `end`
    of member m: ex for torsion, ey for My, ez for Mz."""
    e = m["e"]
    return [m[axis] for flag, axis in (("releaseT", "ex"), ("releaseMy", "ey"), ("releaseMz", "ez"))
            if e.get(flag + end)]


def unsupported(model, analysis):
    why = []
    if analysis not in ANALYSES:
        return [f"analysis {analysis}"]
    if not is_3d(model):
        if analysis != "static":
            return ["2D model: static only"]
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
    for s in model["supports"].values():
        if s.get("isInclined"):
            why.append("inclined support")
        if s.get("rw") or s.get("kw"):
            why.append("warping support")
    for e in model["elements"].values():
        if e["type"] not in ("frame", "truss"):
            why.append(f"element type {e['type']}")
    for ld in model["loads"]:
        if ld["type"] not in ("nodal", "distributed", "pointOnElement"):
            why.append(f"load {ld['type']}")
        elif ld["type"] != "nodal" and analysis != "static":
            why.append("member loads in a modal model")
    return sorted(set(why))


def _split_uniform(model):
    """Full-length uniform member loads as two half-length loads, so that
    nodalize moves them to nodes too."""
    mem = members(model)
    m = copy.deepcopy(model)
    loads = []
    for ld in m["loads"]:
        x = ld["data"]
        if ld["type"] == "distributed":
            L = mem[x["elementId"]]["L"]
            a = x.get("a") or 0.0
            b = x.get("b") if x.get("b") is not None else L
            full = abs(a) < 1e-12 and abs(b - L) < 1e-12 * max(L, 1)
            if full and all(get(x, f"q{c}I") == get(x, f"q{c}J") for c in "XYZ"):
                for aa, bb in ((0.0, 0.5 * L), (0.5 * L, L)):
                    d = dict(x, a=aa, b=bb)
                    loads.append({"type": "distributed", "data": d})
                continue
        loads.append(ld)
    m["loads"] = loads
    return m


def prepare(model):
    """(native model, nodalize info) with every member load at nodes."""
    if not any(ld["type"] != "nodal" for ld in model["loads"]):
        return model, None
    return nodalize(_split_uniform(model))


def run(model, analysis="static", densities=None, n_modes=6):
    why = unsupported(model, analysis)
    if why:
        raise Unsupported(", ".join(why))
    if not is_3d(model):
        return lower_static_3d(run(lift_2d(model, allow_hinges=True), analysis), model)
    out = run_isolated(os.path.abspath(__file__), {"model": model, "analysis": analysis,
                                                   "densities": densities or {}, "n_modes": n_modes})
    return int_keys(out)


# ---------------------------------------------------------------- worker

_FLAGS = ("rx", "ry", "rz", "rrx", "rry", "rrz")
_DISP = ("dx", "dy", "dz", "drx", "dry", "drz")
_SPR = ("kx", "ky", "kz", "krx", "kry", "krz")


def _dof_vars(KM):
    return (KM.DISPLACEMENT_X, KM.DISPLACEMENT_Y, KM.DISPLACEMENT_Z, KM.ROTATION_X, KM.ROTATION_Y, KM.ROTATION_Z)


def build(model, densities):
    """(kratos objects, bookkeeping) for a supported 3D model with nodal loads
    only (after prepare)."""
    import KratosMultiphysics as KM
    import KratosMultiphysics.StructuralMechanicsApplication as SMA
    km = KM.Model()
    mp = km.CreateModelPart("S")
    mp.ProcessInfo[KM.DOMAIN_SIZE] = 3
    for v in (KM.DISPLACEMENT, KM.ROTATION, KM.REACTION, KM.REACTION_MOMENT, SMA.POINT_LOAD, SMA.POINT_MOMENT,
              KM.VOLUME_ACCELERATION):
        mp.AddNodalSolutionStepVariable(v)
    mem = members(model)
    for n in model["nodes"].values():
        mp.CreateNewNode(n["id"], float(n["x"]), float(n["y"]), float(n["z"]))
    next_node = max(n["id"] for n in model["nodes"].values()) + 1

    # hinge nodes for released ends: (eid, end) -> node id, with the global
    # rotation indices it does not share with the joint
    hinge = {}
    for eid, m in sorted(mem.items()):
        if m["e"]["type"] != "frame":
            continue
        for end, nid in (("Start", m["ni"]), ("End", m["nj"])):
            rel = _released_axes(m, end)
            if rel:
                p = m["pi"] if end == "Start" else m["pj"]
                mp.CreateNewNode(next_node, *p)
                hinge[eid, end] = (next_node, nid, rel)
                next_node += 1

    mats = {m["id"]: m for m in model["materials"].values()}
    props = {}
    pid = 0

    def prop(sec, mat, truss):
        nonlocal pid
        key = (sec["id"], mat["id"], truss)
        if key in props:
            return props[key]
        pid += 1
        p = mp.GetProperties()[pid]
        E = mat["e"] * 1000.0
        p[KM.YOUNG_MODULUS] = E
        p[KM.POISSON_RATIO] = mat["nu"]
        p[KM.DENSITY] = float(densities.get(str(mat["id"]), 0.0)) / 1000.0
        p[SMA.CROSS_AREA] = sec["a"]
        if truss:
            p[KM.CONSTITUTIVE_LAW] = SMA.TrussConstitutiveLaw()
            p[SMA.TRUSS_PRESTRESS_PK2] = 0.0
        else:
            p[SMA.I22] = sec["iy"]
            p[SMA.I33] = sec["iz"]
            p[SMA.TORSIONAL_INERTIA] = sec["j"]
            if sec.get("asY"):
                p[SMA.AREA_EFFECTIVE_Z] = sec["asY"]
            if sec.get("asZ"):
                p[SMA.AREA_EFFECTIVE_Y] = sec["asZ"]
            p[KM.CONSTITUTIVE_LAW] = SMA.BeamConstitutiveLaw()
        props[key] = p
        return p

    elems = {}
    for eid, m in sorted(mem.items()):
        e = m["e"]
        truss = e["type"] == "truss"
        p = prop(m["sec"], mats[e["materialId"]], truss)
        ni = hinge.get((eid, "Start"), (m["ni"],))[0]
        nj = hinge.get((eid, "End"), (m["nj"],))[0]
        if truss:
            el = mp.CreateNewElement("TrussLinearElement3D2N", eid, [ni, nj], p)
        else:
            el = mp.CreateNewElement("CrLinearBeamElement3D2N", eid, [ni, nj], p)
            el.SetValue(KM.LOCAL_AXIS_2, list(m["ey"]))
        elems[eid] = el

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
    for n, d in spr.items():
        for k in d:
            if n in flags:
                flags[n][k] = False
    # releases count as removing that member end's rotational stiffness
    _, art_rot = rotational_rank(model, flags, spr)
    for n in art_rot:
        flags.setdefault(n, [False] * 6)[3:] = [True, True, True]
    # Support springs: SpringDamperElement3D (diagonal stiffness in global
    # axes, translations and rotations) to a fully fixed ground node at the
    # same point. (NodalConcentratedElement3D1N ignores
    # NODAL_ROTATIONAL_STIFFNESS: its DOF list has the translations only.)
    eid_next = max(mem) + 1
    springs = {}
    p = mp.GetProperties()[pid + 1]
    for n, d in sorted(spr.items()):
        ground = next_node
        next_node += 1
        nd = mp.Nodes[n]
        mp.CreateNewNode(ground, nd.X, nd.Y, nd.Z)
        flags[ground] = [True] * 6
        el = mp.CreateNewElement("SpringDamperElement3D", eid_next, [n, ground], p)
        el.SetValue(SMA.NODAL_DISPLACEMENT_STIFFNESS, [d.get(k, 0.0) for k in range(3)])
        el.SetValue(SMA.NODAL_ROTATIONAL_STIFFNESS, [d.get(k, 0.0) for k in range(3, 6)])
        springs[n] = (el, d)
        eid_next += 1

    loads = {}
    for ld in model["loads"]:
        x = ld["data"]
        assert ld["type"] == "nodal"
        acc = loads.setdefault(x["nodeId"], [0.0] * 6)
        for k, key in enumerate(("fx", "fy", "fz", "mx", "my", "mz")):
            acc[k] += get(x, key)
    reacs = (KM.REACTION_X, KM.REACTION_Y, KM.REACTION_Z, KM.REACTION_MOMENT_X, KM.REACTION_MOMENT_Y,
             KM.REACTION_MOMENT_Z)
    for v, r in zip(_dof_vars(KM), reacs):
        KM.VariableUtils().AddDof(v, r, mp)
    return dict(KM=KM, SMA=SMA, km=km, mp=mp, mem=mem, elems=elems, flags=flags, spr=spr, springs=springs,
                art_rot=art_rot, hinge=hinge, loads=loads, disp=disp)


_VARNAMES = ("DISPLACEMENT_X", "DISPLACEMENT_Y", "DISPLACEMENT_Z", "ROTATION_X", "ROTATION_Y", "ROTATION_Z")


def _element_matrices(b, mass=False):
    """{element id: ([(node, k)], K_e or M_e)} in the initial configuration
    (every nodal displacement zero)."""
    import numpy as np
    KM, mp = b["KM"], b["mp"]
    pi = mp.ProcessInfo
    out = {}
    for el in mp.Elements:
        A, R = KM.Matrix(), KM.Vector()
        if mass:
            el.CalculateMassMatrix(A, pi)
        else:
            el.CalculateLocalSystem(A, R, pi)
        dl = el.GetDofList(pi)
        keys = [(d.Id(), _VARNAMES.index(d.GetVariable().Name())) for d in dl]
        out[el.Id] = (keys, np.array(A, dtype=float).reshape(len(keys), len(keys)))
    return out


class System:
    """The structure assembled from Kratos' element matrices.

    DOFs are (node, k) keys. A released member end has its own node at the
    joint (build): its translations are the joint's, its rotation is the
    joint's plus one extra DOF per released local axis a (unit vector, global
    components): theta_hinge = theta_joint + sum_a alpha_a a. That is the
    exact release (zero moment about a, full continuity otherwise) for any
    orientation. Fixed DOFs carry their prescribed value. Independent DOFs
    are ordered free first (nodes by id, ux..rz, then the alphas), then
    fixed."""

    def __init__(self, b):
        import numpy as np
        mp = b["mp"]
        for el in mp.Elements:
            el.Initialize(mp.ProcessInfo)
        self.b = b
        self.map = {}
        extra = []
        for (eid, end), (hn, jn, rel) in sorted(b["hinge"].items()):
            for k in range(3):
                self.map[hn, k] = [((jn, k), 1.0)]
            alphas = []
            for a, axis in enumerate(rel):
                key = ("rel", eid, end, a)
                extra.append(key)
                alphas.append((key, axis))
            for k in range(3):
                self.map[hn, 3 + k] = [((jn, 3 + k), 1.0)] + [(key, axis[k]) for key, axis in alphas
                                                               if axis[k] != 0.0]
        keys = sorted((nd.Id, k) for nd in mp.Nodes for k in range(6) if (nd.Id, k) not in self.map)
        self.fixed = [k for k in keys if b["flags"].get(k[0], [False] * 6)[k[1]]]
        fixed = set(self.fixed)
        self.free = [k for k in keys if k not in fixed] + extra
        self.idx = {k: i for i, k in enumerate(self.free + self.fixed)}
        self.nf = len(self.free)
        self.n = len(self.idx)
        self.np = np

    def col(self, key):
        """[(independent index, coefficient)] of a DOF key."""
        return [(self.idx[k], c) for k, c in self.map.get(key, [(key, 1.0)])]

    def T(self, keys):
        """u_e = T u for an element's DOF keys."""
        T = self.np.zeros((len(keys), self.n))
        for r, key in enumerate(keys):
            for i, c in self.col(key):
                T[r, i] += c
        return T

    def assemble(self, mats):
        A = self.np.zeros((self.n, self.n))
        for keys, Ae in mats.values():
            # Only the columns this element touches.
            T = self.T(keys)
            nz = self.np.nonzero(self.np.any(T != 0.0, axis=0))[0]
            Tn = T[:, nz]
            A[self.np.ix_(nz, nz)] += Tn.T @ Ae @ Tn
        return A

    def value(self, u, key):
        return sum(c * u[i] for i, c in self.col(key))


def solve_static(b):
    """(u {key: value}, reactions {fixed key: value}, K) of the linear
    static problem K u = f with prescribed values on fixed DOFs."""
    import numpy as np
    S = System(b)
    Ke = _element_matrices(b)
    b["Ke"] = Ke
    K = S.assemble(Ke)
    f = np.zeros(S.n)
    for n, fv in b["loads"].items():
        for k in range(6):
            f[S.idx[n, k]] += fv[k]
    uc = np.array([b["disp"].get(n, {}).get(k, 0.0) for n, k in S.fixed])
    nf = S.nf
    Kff, Kfc = K[:nf, :nf], K[:nf, nf:]
    uf = np.linalg.solve(Kff, f[:nf] - Kfc @ uc) if nf else np.zeros(0)
    u = np.concatenate([uf, uc])
    r = K[nf:, :] @ u - f[nf:]
    return S, u, dict(zip(S.fixed, r)), K


def conditioning(S, K):
    """(kappa, min pivot ratio) of the free stiffness: Jacobi-scaled 2-norm
    condition number and min d_j / K_jj of a Cholesky in stabileo's DOF
    order (as pynite/adapter.py)."""
    import numpy as np
    nf = S.nf
    if not nf or nf > 3000:
        return None, None
    Kf = K[:nf, :nf]
    dg = np.sqrt(np.abs(np.diag(Kf)))
    dg[dg == 0] = 1.0
    kappa = float(np.linalg.cond(Kf / np.outer(dg, dg)))
    L = Kf.copy()
    ratio = np.inf
    for j in range(nf):
        d = L[j, j] - L[j, :j] @ L[j, :j]
        ratio = min(ratio, d / Kf[j, j] if Kf[j, j] else -np.inf)
        if d <= 0:
            break
        L[j, j] = np.sqrt(d)
        L[j + 1:, j] = (L[j + 1:, j] - L[j + 1:, :j] @ L[j, :j]) / L[j, j]
    return kappa, float(ratio)


def _end_forces(b, S, u, eid):
    """12 local end forces (on the member, k_e u_e) of element eid in
    stabileo's local axes."""
    import numpy as np
    keys, Ke = b["Ke"][eid]
    fe = Ke @ np.array([S.value(u, k) for k in keys])
    m = b["mem"][eid]
    R = np.array([m["ex"], m["ey"], m["ez"]])
    if m["e"]["type"] == "truss":
        return list(R @ fe[0:3]) + [0.0] * 3 + list(R @ fe[3:6]) + [0.0] * 3
    return list(R @ fe[0:3]) + list(R @ fe[3:6]) + list(R @ fe[6:9]) + list(R @ fe[9:12])


def solve(model, analysis, densities, n_modes):
    native, info = prepare(model) if analysis == "static" else (model, None)
    b = build(native, densities)
    if analysis == "modal":
        return _modal(b, model, n_modes)
    S, u, racc, K = solve_static(b)
    disp = {n["id"]: [float(u[S.idx[n["id"], k]]) for k in range(6)] for n in model["nodes"].values()}
    reac = {}
    for s in model["supports"].values():
        n = s["nodeId"]
        fl = b["flags"].get(n, [False] * 6)
        r = [float(racc.get((n, k), 0.0)) if fl[k] else 0.0 for k in range(6)]
        for k, kv in b["spr"].get(n, {}).items():
            r[k] += -kv * disp[n][k]
        if n in b["art_rot"]:
            r[3:] = [0.0, 0.0, 0.0]
        reac[n] = r
    names = ["n", "vy", "vz", "mx", "my", "mz"]
    sub = info["sub"] if info else {e: [e] for e in b["mem"]}
    forces = {}
    for e in model["elements"].values():
        subs = sub[e["id"]]
        fa = _end_forces(b, S, u, subs[0])
        fb = _end_forces(b, S, u, subs[-1])
        fd = {}
        for k, nm in enumerate(names):
            fd[f"{nm}Start"] = float(-fa[k] if k == 0 else fa[k])
            fd[f"{nm}End"] = float(fb[6 + k] if k == 0 else -fb[6 + k])
        forces[e["id"]] = fd
    kappa, pivot = conditioning(S, K)
    return dict(dim=3, disp=disp, reac=reac, forces=forces, art_rot=sorted(b["art_rot"]), kappa=kappa,
                min_pivot=pivot)


def _modal(b, model, n_modes):
    """Lowest modes of K v = w^2 M v on the free DOFs. M is semidefinite
    (no rotary inertia), K definite (the driver checks it first): solve
    M v = mu K v and take the largest mu = 1/w^2."""
    import numpy as np
    import scipy.linalg as sl
    S = System(b)
    nf = S.nf
    K = S.assemble(_element_matrices(b))[:nf, :nf]
    M = S.assemble(_element_matrices(b, mass=True))[:nf, :nf]
    mu, V = sl.eigh(M, K)
    order = np.argsort(-mu)
    orig = sorted(n["id"] for n in model["nodes"].values())
    freqs, shapes = [], []
    for i in order[:n_modes]:
        if mu[i] <= 0:
            break
        freqs.append(1.0 / math.sqrt(mu[i]) / (2 * math.pi))
        v = V[:, i]
        shapes.append({n: [float(v[S.idx[n, k]]) if S.idx[n, k] < nf else 0.0 for k in range(6)] for n in orig})
    return {"freqs": freqs, "shapes": shapes}


if __name__ == "__main__" and "--worker" in sys.argv:
    worker_main(solve)
    # Kratos' C++ side prints a banner and, at interpreter exit,
    # "Deregistering ..." lines on stdout: leave before they can follow the
    # JSON reply (run_isolated reads the last line).
    sys.stdout.flush()
    os._exit(0)
