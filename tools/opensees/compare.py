#!/usr/bin/env python3
"""Differential test: stabileo linear static solver vs OpenSees.

Reads stabileo SolverInput / SolverInput3D JSON, builds the equivalent
OpenSees model (openseespy), runs a linear static analysis, and compares
displacements, reactions and member end forces with what the stabileo
engine (engine/examples/solve_json.rs) returns for the same file.

Usage:
  compare.py [FILES...] [--fixtures] [--random2d N] [--random3d N]
             [--rich2d N] [--rich3d N]
             [--seed-start S] [--bin PATH] [--tol T] [--report OUT.json]
             [--dump-dir DIR] [-v]
  compare.py --opensees FILE      print OpenSees results (stabileo shape)

Every OpenSees run happens in a fresh interpreter (openseespy keeps state
across ops.wipe()). Models are reported as ok / mismatch, or skipped as
unsupported (no clean OpenSees equivalent), ill_conditioned (stabileo
warns, or OpenSees' scaled condition number exceeds 1e12: no unique answer
to compare) or unloaded. A model stabileo refuses is checked against
OpenSees: refused (OpenSees finds no unique answer either), false_reject
(OpenSees' stiffness is regular: flagged), not_applicable (buckling with
no positive load factor on either side), or stabileo_failed (undecided).
A model stabileo flags ill-conditioned whose OpenSees stiffness is well
conditioned (kappa < 1e8) is a false_warning (flagged).

Exit status: 0 = no discrepancy above tolerance, 1 = mismatch,
false_reject or false_warning, 2 = harness error.

Conventions (read from the engine source, see README.md):
  * E is in MPa in the JSON; the engine uses E*1000 (kN/m^2). Lengths m,
    forces kN. G = E / (2(1+nu)).
  * 2D: nodes (x, z) with z up (JSON key "z" or its alias "y"); DOFs
    (ux, uz, ry) where ry is the standard counter-clockwise in-plane
    rotation of the (x, z) plane -- OpenSees ndm=2 with y := z.
  * 3D local axes: engine/src/element/transform.rs compute_local_axes_3d.
    We recompute (ex, ey, ez) identically and pass vecxz = ez to
    geomTransf Linear, so OpenSees' local y = vecxz x ex = ey.
  * Member loads are in local axes (qY/qZ/qX, p/py/pz), positions in metres.
  * End forces: f_local = K u - FEF (forces on the member, local axes; the
    same vector as OpenSees' localForce), reported as start = f_I (axial
    negated: n_start = -f_I,x) and end = -f_J (axial: n_end = f_J,x).
  * Releases/hinges map to -release / -releasey / -releasez; Timoshenko
    sections to ElasticTimoshenkoBeam with Avz = asY, Avy = asZ (the engine
    pairs asY with Iy, i.e. shear along local z). ElasticTimoshenkoBeam has
    no releases: a released Timoshenko end connects to its own node, tied to
    the joint by equalDOF on every DOF but the released rotation (2D always;
    3D when the member's local axes lie along global axes).
  * Member loads other than full-length uniform ones are applied at nodes
    inserted along the member (exact; see opensees_2d / opensees_3d).
"""

import argparse
import glob
import json
import math
import os
import subprocess
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.abspath(os.path.join(HERE, "..", ".."))
FIXTURES = os.path.join(REPO, "engine", "tests", "fixtures")
DEFAULT_BIN = os.path.join(REPO, "target", "release", "examples", "solve_json")


class Unsupported(Exception):
    """Model uses a feature without a clean OpenSees equivalent."""


# ---------------------------------------------------------------- geometry

def _cross(a, b):
    return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]


def _norm(v):
    return math.sqrt(sum(x * x for x in v))


def _unit(v):
    n = _norm(v)
    return [x / n for x in v]


def local_axes_3d(pi, pj, elem):
    """Port of compute_local_axes_3d (left_hand=False; left-hand is excluded)."""
    ex = _unit([pj[k] - pi[k] for k in range(3)])
    ly = (elem.get("localYx"), elem.get("localYy"), elem.get("localYz"))
    ref = None
    if all(v is not None for v in ly) and _norm(ly) > 1e-10:
        ref = _unit(list(ly))
    if ref is None:
        up = [1.0, 0.0, 0.0] if abs(ex[2]) > 0.999 else [0.0, 0.0, 1.0]
        d = sum(ex[k] * up[k] for k in range(3))
        ez0 = _unit([up[k] - d * ex[k] for k in range(3)])
        ref = _cross(ez0, ex)
    ez = _cross(ex, ref)
    if _norm(ez) < 1e-10:
        fb = [1.0, 0.0, 0.0] if abs(ex[0]) < 0.9 else [0.0, 1.0, 0.0]
        ez = _cross(ex, fb)
    ez = _unit(ez)
    ey = _unit(_cross(ez, ex))
    roll = elem.get("rollAngle")
    if roll is not None:
        a = math.radians(roll)
        c, s = math.cos(a), math.sin(a)
        ey, ez = ([c * ey[k] + s * ez[k] for k in range(3)],
                  [-s * ey[k] + c * ez[k] for k in range(3)])
    return ex, ey, ez


def _global_axis(v, tol=1e-12):
    """Index of the global axis a unit vector lies along, or Unsupported."""
    for k in range(3):
        if abs(abs(v[k]) - 1.0) <= tol and all(abs(v[i]) <= tol for i in range(3) if i != k):
            return k
    raise Unsupported("Timoshenko release on a member with skew local axes")


def _hinge_node(ops, tag, joint, dofs, slaves):
    """A node at `joint` sharing its `dofs` (equalDOF): the released end of a
    Timoshenko member (ElasticTimoshenkoBeam has no -release). Its constraint
    force is part of the joint's reaction."""
    ops.node(tag, *ops.nodeCoord(joint))
    ops.equalDOF(joint, tag, *dofs)
    slaves.append((joint, tag))
    return tag


# 3-point Gauss-Legendre on [0, 1]: exact for polynomials of degree <= 5.
# A linearly varying load times the cubic Hermite shape functions is degree 4,
# so three point loads reproduce the trapezoidal load's fixed-end forces
# exactly (OpenSees' 3D -beamUniform is uniform only, and the 2D trapezoidal
# form ignores -release in OpenSees 3.8).
_G3 = [(0.5 - math.sqrt(15) / 10, 5 / 18), (0.5, 8 / 18), (0.5 + math.sqrt(15) / 10, 5 / 18)]


def _gauss_point_loads(qi, qj, a, b):
    """[(P, x)]: three point loads equivalent (in work against any cubic
    shape function) to the linear load qi -> qj on [a, b]."""
    span = b - a
    return [((qi + xi * (qj - qi)) * w * span, a + xi * span) for xi, w in _G3]


def _is_3d(d):
    nodes = (d.get("nodes") or {}).values()
    sups = (d.get("supports") or {}).values()
    return any("y" in n and "z" in n for n in nodes) or any("rx" in s for s in sups)


def _nonempty(d, key):
    v = d.get(key)
    return bool(v)


def _get(d, *keys, default=0.0):
    for k in keys:
        if k in d and d[k] is not None:
            return d[k]
    return default


# 2D support type -> restrained (ux, uz, ry), as dof.rs is_dof_restrained_2d.
SUPPORT_FLAGS_2D = {
    "fixed": (1, 1, 1), "pinned": (1, 1, 0), "rollerX": (0, 1, 0), "rollerY": (1, 0, 0), "rollerZ": (1, 0, 0),
    "guidedX": (0, 1, 1), "guidedY": (1, 0, 1), "guidedZ": (1, 0, 1),
}
_TYPE_OF_FLAGS_2D = {(1, 1, 1): "fixed", (1, 1, 0): "pinned", (0, 1, 0): "rollerX", (1, 0, 0): "rollerZ",
                     (0, 1, 1): "guidedX", (1, 0, 1): "guidedZ"}


def _plain_rigid_2d(s):
    return s["type"] in SUPPORT_FLAGS_2D and all(
        not s.get(k) for k in ("kx", "ky", "kz", "dx", "dy", "dz", "dry", "drz", "angle"))


def supports_by_node_2d(supports):
    """One support per node, as DofNumbering::build_2d sees them: several
    plain rigid supports on one node merge by OR (any of them restraining a
    DOF restrains it). Any other shared node is refused by the engine
    (validate_input_2d, reject_ambiguous_shared_supports), so which one is
    kept there does not matter; the highest id is."""
    at = {}
    for s in sorted(supports.values(), key=lambda s: s["id"]):
        at.setdefault(s["nodeId"], []).append(s)
    out = {}
    for nid, ss in at.items():
        if len(ss) > 1 and all(_plain_rigid_2d(s) for s in ss):
            fl = tuple(max(SUPPORT_FLAGS_2D[s["type"]][k] for s in ss) for k in range(3))
            out[nid] = dict(ss[-1], type=_TYPE_OF_FLAGS_2D[fl])
        else:
            out[nid] = ss[-1]
    return out


# ---------------------------------------------------------------- OpenSees

def _ops():
    import openseespy.opensees as ops  # noqa: imported lazily (venv only)
    return ops


def _analyze(ops, fixed):
    """Linear static solve. Returns the Jacobi-scaled 2-norm condition number
    of the free-DOF stiffness (None for large systems): the comparison
    tolerance grows with it, since both solvers lose ~kappa*eps digits."""
    if all(all(fl) for fl in fixed.values()):
        # Some OpenSees linear systems abort the process on an empty system.
        raise Unsupported("no free DOF")
    n_free = sum(not f for fl in fixed.values() for f in fl)
    small = n_free <= 2500
    ops.constraints("Transformation")
    ops.numberer("RCM")
    ops.system("FullGeneral" if small else "UmfPack")
    ops.test("NormDispIncr", 1e-12, 1, 0)
    ops.integrator("LoadControl", 1.0)
    ops.algorithm("Linear")
    ops.analysis("Static")
    if ops.analyze(1) != 0:
        raise RuntimeError("OpenSees analyze failed (singular / mechanism)")
    ops.reactions()
    if not small:
        return None
    try:
        import numpy as np
    except ImportError:
        return None
    n = ops.systemSize()
    k = np.array(ops.printA("-ret")).reshape(n, n)
    dg = np.sqrt(np.abs(np.diag(k)))
    dg[dg == 0] = 1.0
    return float(np.linalg.cond(k / np.outer(dg, dg)))


def check_supported_2d(d):
    why = []
    for k in ("constraints", "connectors"):
        if _nonempty(d, k):
            why.append(k)
    for e in d["elements"].values():
        if e["type"] not in ("frame", "truss"):
            why.append(f"element type {e['type']}")
    for s in d["supports"].values():
        t = s["type"]
        if t in ("inclinedRoller",):
            why.append("inclinedRoller support")
        elif t not in ("fixed", "pinned", "rollerX", "rollerY", "rollerZ",
                       "guidedX", "guidedY", "guidedZ", "spring"):
            why.append(f"support type {t}")
    for l in d["loads"]:
        if l["type"] == "thermal":
            why.append("thermal load")
    return sorted(set(why))


def check_supported_3d(d):
    why = []
    for k in ("constraints", "connectors", "quad9s", "solidShells", "curvedShells", "curvedBeams"):
        if _nonempty(d, k):
            why.append(k)
    if d.get("leftHand"):
        why.append("leftHand axes")
    for s in d["sections"].values():
        if s.get("cw") is not None:
            why.append("warping (cw)")
    secs = {s["id"]: s for s in d["sections"].values()}
    for e in d["elements"].values():
        if e["type"] not in ("frame", "truss"):
            why.append(f"element type {e['type']}")
        if e.get("releaseTStart") or e.get("releaseTEnd"):
            why.append("torsion release")
    for s in d["supports"].values():
        if s.get("isInclined"):
            why.append("inclined support")
        if s.get("rw") or s.get("kw"):
            why.append("warping support")
    for l in d["loads"]:
        if l["type"] not in ("nodal", "distributed", "pointOnElement", "pressure", "quadPressure"):
            why.append(f"load {l['type']}")
        elif l["type"] == "nodal" and l["data"].get("bw"):
            why.append("bimoment load")
    return sorted(set(why))


def _lever(qi, qj, a, b, L):
    """Simply supported reactions (ri, rj) of a linear load qi->qj on [a, b]."""
    span = b - a
    ri = rj = 0.0
    for w, xc in ((qi * span, (a + b) / 2), ((qj - qi) * span / 2, a + 2 * span / 3)):
        ri += w * (L - xc) / L
        rj += w * xc / L
    return ri, rj


def opensees_2d(d, mode="static", spec=None):
    """Build the OpenSees model of a 2D stabileo model and run `mode`:
    "static" (linear), or one of ANALYSES (buckling, modal, pdelta, th)."""
    ops = _ops()
    geom = mode in GEOM_MODES
    dens = (spec or {}).get("densities") if mode in MASS_MODES else None
    nodes = {n["id"]: (float(n["x"]), float(_get(n, "z", "y"))) for n in d["nodes"].values()}
    mats = {m["id"]: m for m in d["materials"].values()}
    secs = {s["id"]: s for s in d["sections"].values()}
    elems = sorted(d["elements"].values(), key=lambda e: e["id"])
    has_frame = any(e["type"] == "frame" for e in elems)
    ndf = 3 if has_frame else 2
    if geom:
        _check_geom(d, elems, secs, has_frame)

    ops.wipe()
    ops.model("basic", "-ndm", 2, "-ndf", ndf)
    for nid, (x, z) in sorted(nodes.items()):
        ops.node(nid, x, z)

    # Supports (DofNumbering::build_2d): the rigid restraints of all supports
    # of a node are OR-ed (a fixed and a pinned support on one node is fixed).
    # Springs, settlements and inclined rollers sharing a node with another
    # support are rejected by the engine, so the spring and settlement values
    # come from the node's single support (the highest id, if several).
    sup_by_node, sups_of = {}, {}
    for s in sorted(d["supports"].values(), key=lambda s: s["id"]):
        sup_by_node[s["nodeId"]] = s
        sups_of.setdefault(s["nodeId"], []).append(s)

    def restrained(s, dof):
        t = s["type"]
        if t == "spring":
            return False  # spring DOFs are free; stiffness added below
        return {
            "fixed": True,
            "pinned": dof in (0, 1),
            "rollerX": dof == 1,
            "rollerY": dof == 0, "rollerZ": dof == 0,
            "guidedX": dof in (1, 2),
            "guidedY": dof in (0, 2), "guidedZ": dof in (0, 2),
        }.get(t, False)

    # Which nodes have rotational stiffness (frame end not hinged, or a
    # rotational restraint/spring)? Others get their rotation fixed: the
    # engine puts a 1e-10*max_diag artificial spring there.
    rot_ok = set()
    for e in elems:
        if e["type"] == "frame":
            if not e.get("hingeStart"):
                rot_ok.add(e["nodeI"])
            if not e.get("hingeEnd"):
                rot_ok.add(e["nodeJ"])
    fixed = {}  # node -> [bool]*ndf
    for nid in nodes:
        fixed[nid] = [False] * ndf
    settlements = []
    springs = []  # (node, dof, k) or (node, 'rot2', kx, ky, angle)
    for nid, s in sup_by_node.items():
        for dof in range(ndf):
            if any(restrained(t, dof) for t in sups_of[nid]):
                fixed[nid][dof] = True
                v = [s.get("dx"), _get(s, "dz", "dy", default=None), _get(s, "dry", "drz", default=None)][dof]
                if v is not None and abs(v) > 1e-15:
                    settlements.append((nid, dof, float(v)))
        kx, ky, kz = (s.get("kx") or 0.0), (s.get("ky") or 0.0), (s.get("kz") or 0.0)
        ang = s.get("angle")
        if s["type"] == "spring" and ang is not None and abs(ang) > 1e-15 and (kx > 0 or ky > 0):
            springs.append((nid, "rot", kx, ky, ang))
        else:
            if kx > 0 and not fixed[nid][0]:
                springs.append((nid, 0, kx))
            if ky > 0 and not fixed[nid][1]:
                springs.append((nid, 1, ky))
        if kz > 0 and ndf == 3 and not fixed[nid][2]:
            springs.append((nid, 2, kz))
            rot_ok.add(nid)
        if ndf == 3 and fixed[nid][2]:
            rot_ok.add(nid)
    art_rot = set()
    if ndf == 3:
        for nid in nodes:
            if nid not in rot_ok:
                fixed[nid][2] = True
                art_rot.add(nid)
    settle_dofs = {(n, k) for n, k, _ in settlements}
    for nid, fl in fixed.items():
        fl2 = [1 if (f and (nid, k) not in settle_dofs) else 0 for k, f in enumerate(fl)]
        if any(fl2):
            ops.fix(nid, *fl2)

    max_id = max(list(nodes) + [e["id"] for e in elems] + [0])
    tag = 10 ** (len(str(max_id)) + 1)
    spring_elems = []
    # The engine's Rayleigh C = a0*M + a1*K includes the support springs;
    # zeroLength skips Rayleigh damping unless asked.
    ray = ["-doRayleigh", 1] if dens else []
    for sp in springs:
        nid = sp[0]
        tag += 1
        g = tag
        ops.node(g, *nodes[nid])
        ops.fix(g, *([1] * ndf))
        if sp[1] == "rot":
            _, _, kx, ky, ang = sp
            ops.uniaxialMaterial("Elastic", g, max(kx, 1e-300))
            ops.uniaxialMaterial("Elastic", g + 1, max(ky, 1e-300))
            tag += 1
            c, s_ = math.cos(ang), math.sin(ang)
            ops.element("zeroLength", g, g, nid, "-mat", g, g + 1, "-dir", 1, 2,
                        "-orient", c, s_, 0.0, -s_, c, 0.0, *ray)
        else:
            _, dof, k = sp
            ops.uniaxialMaterial("Elastic", g, k)
            ops.element("zeroLength", g, g, nid, "-mat", g, "-dir", dof + 1, *ray)
        spring_elems.append((nid, g))

    # Member loads (local axes). Full-length uniform loads use -beamUniform;
    # every other member load becomes concentrated loads (partial/trapezoidal
    # distributed -> 3 Gauss point loads, exact for the cubic end-response
    # functions of Euler-Bernoulli and Timoshenko members) applied as nodal
    # loads at nodes inserted along the member. Splitting a prismatic member
    # at a point load is exact, and it avoids OpenSees 3.8 element-load gaps:
    # ElasticBeam2d ignores -release for the trapezoidal -beamUniform form,
    # ElasticTimoshenkoBeam2d accepts no -beamPoint, and there is no
    # concentrated-couple element load.
    geo = {}
    for e in elems:
        pi, pj = nodes[e["nodeI"]], nodes[e["nodeJ"]]
        L = math.hypot(pj[0] - pi[0], pj[1] - pi[1])
        geo[e["id"]] = (L, (pj[0] - pi[0]) / L, (pj[1] - pi[1]) / L)
    etype = {e["id"]: e["type"] for e in elems}
    uniform_loads = {}  # eid -> w (local y)
    point_loads = {}    # eid -> [(pos, [px, py, m])]
    for ld in d["loads"]:
        t, x = ld["type"], ld["data"]
        if t == "nodal" or etype[x["elementId"]] == "truss":
            continue
        eid = x["elementId"]
        L = geo[eid][0]
        if t == "distributed":
            a = x.get("a") or 0.0
            b = x.get("b") if x.get("b") is not None else L
            if not (-1e-12 <= a <= b <= L * (1 + 1e-12)):
                raise Unsupported("distributed load outside member")
            if abs(a) < 1e-12 and abs(b - L) < 1e-12 and x["qI"] == x["qJ"]:
                uniform_loads[eid] = uniform_loads.get(eid, 0.0) + x["qI"]
            else:
                for p, xa in _gauss_point_loads(x["qI"], x["qJ"], a, b):
                    point_loads.setdefault(eid, []).append((xa, [0.0, p, 0.0]))
        elif t == "pointOnElement":
            if not (0 < x["a"] < L):
                raise Unsupported("point load outside the member interior")
            m = x.get("my", x.get("mz")) or 0.0
            point_loads.setdefault(eid, []).append((x["a"], [x.get("px") or 0.0, x["p"], m]))

    truss_axial = {}  # eid -> [Fi, Fj] equivalent axial nodal loads (for N recovery)
    nodal = {}

    def add_nodal(nid, f):
        acc = nodal.setdefault(nid, [0.0] * ndf)
        for k in range(ndf):
            acc[k] += f[k]

    pieces = {}
    hinge_slaves = []  # (joint node, hinge node)
    for e in elems:
        L, c, s_ = geo[e["id"]]
        pi, pj = nodes[e["nodeI"]], nodes[e["nodeJ"]]
        m, sec = mats[e["materialId"]], secs[e["sectionId"]]
        E = m["e"] * 1000.0
        if e["type"] == "truss" and geom:
            # String geometric stiffness N/L: a both-ends-released beam on a
            # PDelta transformation (Truss has none; corotTruss is not linear
            # in N). Bending stiffness is condensed out by the releases.
            ops.geomTransf("PDelta", e["id"])
            ops.element("elasticBeamColumn", e["id"], e["nodeI"], e["nodeJ"],
                        sec["a"], E, sec.get("iz") or 1.0, e["id"], "-release", 3)
            continue
        if e["type"] == "truss":
            tag += 1
            ops.uniaxialMaterial("Elastic", tag, E)
            # -doRayleigh: Truss skips Rayleigh damping unless asked.
            mass = ["-rho", _rho_a(dens, m, sec), "-cMass", 1, "-doRayleigh", 1] if dens else []
            ops.element("Truss", e["id"], e["nodeI"], e["nodeJ"], sec["a"], tag, *mass)
            continue
        ops.geomTransf("Linear", e["id"])
        if dens:
            # Mass on a parallel zero-stiffness element: the engine's mass is
            # the Euler-Bernoulli consistent one for every frame, lumped
            # (rho*A*L/2 on the translations) when an end is hinged.
            tag += 1
            ops.element("elasticBeamColumn", tag, e["nodeI"], e["nodeJ"], sec["a"], 0.0, sec["iz"], e["id"],
                        "-mass", _rho_a(dens, m, sec),
                        *([] if e.get("hingeStart") or e.get("hingeEnd") else ["-cMass"]))
        stations = []
        for pos, f in sorted(point_loads.get(e["id"], []), key=lambda p: p[0]):
            if stations and abs(pos - stations[-1][0]) <= 1e-9 * L:
                stations[-1][1] = [stations[-1][1][k] + f[k] for k in range(3)]
            else:
                stations.append([pos, list(f)])
        chain = [e["nodeI"]]
        for pos, f in stations:
            tag += 1
            ops.node(tag, pi[0] + pos * c, pi[1] + pos * s_)
            add_nodal(tag, [c * f[0] - s_ * f[1], s_ * f[0] + c * f[1], f[2]])
            chain.append(tag)
        chain.append(e["nodeJ"])
        subs = []
        for k in range(len(chain) - 1):
            first, last = k == 0, k == len(chain) - 2
            sub = e["id"] if len(chain) == 2 else (tag := tag + 1)
            subs.append(sub)
            if geom:
                # Consistent (cubic) geometric stiffness, linear in N: the
                # engine's Kg. Av = 1e12*A makes it Euler-Bernoulli (phi ~ 1e-12).
                G = E / (2 * (1 + m["nu"]))
                ops.element("ElasticTimoshenkoBeam", sub, chain[k], chain[k + 1],
                            E, G, sec["a"], sec["iz"], 1e12 * sec["a"], e["id"], "-geomNonlinear")
            elif sec.get("asY"):
                G = E / (2 * (1 + m["nu"]))
                ni, nj = chain[k], chain[k + 1]
                # ElasticTimoshenkoBeam has no -release: a hinged end gets
                # its own node sharing the joint's translations (exact).
                if first and e.get("hingeStart"):
                    tag += 1
                    ni = _hinge_node(ops, tag, ni, [1, 2], hinge_slaves)
                if last and e.get("hingeEnd"):
                    tag += 1
                    nj = _hinge_node(ops, tag, nj, [1, 2], hinge_slaves)
                ops.element("ElasticTimoshenkoBeam", sub, ni, nj,
                            E, G, sec["a"], sec["iz"], sec["asY"], e["id"])
            else:
                rel = (1 if first and e.get("hingeStart") else 0) + (2 if last and e.get("hingeEnd") else 0)
                args = ["-release", rel] if rel else []
                ops.element("elasticBeamColumn", sub, chain[k], chain[k + 1],
                            sec["a"], E, sec["iz"], e["id"], *args)
        pieces[e["id"]] = subs

    ops.timeSeries("Linear", 1)
    ops.pattern("Plain", 1, 1)
    for eid, w in uniform_loads.items():
        for sub in pieces[eid]:
            ops.eleLoad("-ele", sub, "-type", "-beamUniform", w, 0.0)

    for ld in d["loads"]:
        t, x = ld["type"], ld["data"]
        if t == "nodal":
            f = [x.get("fx", 0.0), _get(x, "fz", "fy"), _get(x, "my", "mz")]
            # (ndf == 2: a truss-only model has no rotation for it either.)
            if abs(f[2]) > 0 and (ndf == 2 or x["nodeId"] in art_rot):
                raise Unsupported("nodal moment on a rotation-free (all-hinged) node")
            add_nodal(x["nodeId"], f[:ndf])
            continue
        eid = x["elementId"]
        if etype[eid] != "truss":
            continue  # frame member loads handled above
        L, c, s_ = geo[eid]
        # A truss carries nothing transverse: lever rule (statics).
        if t == "distributed":
            a, b = x.get("a") or 0.0, (x.get("b") if x.get("b") is not None else L)
            ri, rj = _lever(x["qI"], x["qJ"], a, b, L)
            pi_ = pj_ = 0.0
        elif t == "pointOnElement":
            a = x["a"]
            mz = x.get("my", x.get("mz")) or 0.0
            ri = x["p"] * (1 - a / L) - mz / L
            rj = x["p"] * a / L + mz / L
            px = x.get("px") or 0.0
            pi_, pj_ = px * (1 - a / L), px * a / L
            fa = truss_axial.setdefault(eid, [0.0, 0.0])
            fa[0] += pi_
            fa[1] += pj_
        else:
            raise Unsupported(t)
        add_nodal(_elem(d, eid)["nodeI"], [-s_ * ri + c * pi_, c * ri + s_ * pi_, 0.0][:ndf])
        add_nodal(_elem(d, eid)["nodeJ"], [-s_ * rj + c * pj_, c * rj + s_ * pj_, 0.0][:ndf])
    for nid, f in sorted(nodal.items()):
        ops.load(nid, *f)
    for nid, dof, v in settlements:
        ops.sp(nid, dof + 1, v)

    ctx = dict(ops=ops, dim=2, ndf=ndf, nodes=nodes, fixed=fixed, art_rot=art_rot, spec=spec or {})
    if mode != "static":
        ctx["collect"] = lambda: _collect_2d(ops, nodes, ndf, sup_by_node, art_rot, spring_elems,
                                            hinge_slaves, elems, truss_axial, pieces)
        return ANALYSES[mode](ctx)
    kappa = _analyze(ops, fixed)
    r = _collect_2d(ops, nodes, ndf, sup_by_node, art_rot, spring_elems, hinge_slaves, elems, truss_axial, pieces)
    return dict(dim=2, art_rot=sorted(art_rot), kappa=kappa, **r)


def _collect_2d(ops, nodes, ndf, sup_by_node, art_rot, spring_elems, hinge_slaves, elems, truss_axial, pieces):
    """Displacements, reactions and member end forces (stabileo shape)."""
    disp = {}
    for nid in nodes:
        u = ops.nodeDisp(nid)
        disp[nid] = u[:ndf] + ([0.0] if ndf == 2 else [])
    reac = {}
    for nid, s in sup_by_node.items():
        r = list(ops.nodeReaction(nid))[:ndf] + ([0.0] if ndf == 2 else [])
        if nid in art_rot:
            r[2] = 0.0
        for n2, g in spring_elems + hinge_slaves:
            if n2 == nid:
                rg = ops.nodeReaction(g)
                for k in range(ndf):
                    r[k] += rg[k]
        reac[nid] = r
    forces = {}
    for e in elems:
        if e["type"] == "truss":
            N = _truss_n(ops, e["id"])
            fi, fj = truss_axial.get(e["id"], [0.0, 0.0])
            forces[e["id"]] = dict(nStart=N + fi, nEnd=N - fj, vStart=0.0, vEnd=0.0, mStart=0.0, mEnd=0.0)
        else:
            f = list(ops.eleResponse(pieces[e["id"]][0], "localForce"))[:3] + \
                list(ops.eleResponse(pieces[e["id"]][-1], "localForce"))[3:]
            forces[e["id"]] = dict(nStart=-f[0], nEnd=f[3], vStart=f[1], vEnd=-f[4], mStart=f[2], mEnd=-f[5])
    return dict(disp=disp, reac=reac, forces=forces)


def _truss_n(ops, eid):
    """Axial force of a Truss, or of the released-beam stand-in (geometric
    modes), whose localForce starts with the force on end I along x."""
    n = ops.eleResponse(eid, "axialForce")
    return n[0] if n else -ops.eleResponse(eid, "localForce")[0]


def _elem(d, eid):
    for e in d["elements"].values():
        if e["id"] == eid:
            return e
    raise KeyError(eid)


def opensees_3d(d, mode="static", spec=None):
    """3D counterpart of opensees_2d."""
    ops = _ops()
    geom = mode in GEOM_MODES
    dens = (spec or {}).get("densities") if mode in MASS_MODES else None
    nodes = {n["id"]: (float(n["x"]), float(n["y"]), float(n["z"])) for n in d["nodes"].values()}
    mats = {m["id"]: m for m in d["materials"].values()}
    secs = {s["id"]: s for s in d["sections"].values()}
    elems = sorted(d["elements"].values(), key=lambda e: e["id"])
    has_frame = any(e["type"] == "frame" for e in elems)
    shells = _shell_elems(d)
    ndf = 6 if has_frame or shells else 3
    if geom:
        _check_geom(d, elems, secs, has_frame)

    ops.wipe()
    ops.model("basic", "-ndm", 3, "-ndf", ndf)
    for nid, p in sorted(nodes.items()):
        ops.node(nid, *p)

    # Supports (DofNumbering::build_3d): restraint flags OR-ed over all
    # supports of a node; a spring stiffness on the "winning" support (most
    # restrained, last) frees that DOF; spring stiffnesses add up.
    flagk = ["rx", "ry", "rz", "rrx", "rry", "rrz"]
    springk = ["kx", "ky", "kz", "krx", "kry", "krz"]
    dispk = ["dx", "dy", "dz", "drx", "dry", "drz"]
    sups = sorted(d["supports"].values(),
                  key=lambda s: (s["nodeId"], sum(bool(s.get(k)) for k in flagk)))
    winner, flags, kspr, presc = {}, {}, {}, {}
    for s in sups:
        nid = s["nodeId"]
        winner[nid] = s
        fl = flags.setdefault(nid, [False] * 6)
        ks = kspr.setdefault(nid, [0.0] * 6)
        for k in range(6):
            fl[k] = fl[k] or bool(s.get(flagk[k]))
            ks[k] += (s.get(springk[k]) or 0.0) if (s.get(springk[k]) or 0.0) > 0 else 0.0
            v = s.get(dispk[k])
            if v is not None and abs(v) > 1e-15:
                presc[(nid, k)] = float(v)
    fixed = {nid: [False] * ndf for nid in nodes}
    springs = []
    for nid, fl in flags.items():
        w = winner[nid]
        for k in range(ndf):
            has_spring = (w.get(springk[k]) or 0.0) > 0
            if fl[k] and not has_spring:
                fixed[nid][k] = True
            elif kspr[nid][k] > 0:
                springs.append((nid, k, kspr[nid][k]))
    settlements = [(n, k, v) for (n, k), v in presc.items() if k < ndf and fixed[n][k]]

    # Rotational stiffness rank per node: frame ends contribute the local
    # axes whose moment is not released; supports/springs contribute global
    # axes. A node with an incomplete rank is a rotational mechanism: with no
    # rotational stiffness at all (e.g. truss-only nodes in a frame model) we
    # fix the rotations (they are undetermined and unloaded); partial rank is
    # reported as unsupported (both solvers would be near-singular).
    art_rot = set()
    if ndf == 6:
        dirs = {nid: [] for nid in nodes}
        for _, _, sn, _, _ in shells:
            for nid in sn:
                dirs[nid] += [[1.0, 0.0, 0.0], [0.0, 1.0, 0.0], [0.0, 0.0, 1.0]]
        for e in elems:
            if e["type"] != "frame":
                continue
            ex, ey, ez = local_axes_3d(nodes[e["nodeI"]], nodes[e["nodeJ"]], e)
            for nid, end in ((e["nodeI"], "Start"), (e["nodeJ"], "End")):
                dirs[nid].append(ex)
                if not e.get("releaseMy" + end):
                    dirs[nid].append(ey)
                if not e.get("releaseMz" + end):
                    dirs[nid].append(ez)
        for nid in nodes:
            for k in range(3):
                if fixed[nid][3 + k] or any(n == nid and kk == 3 + k for n, kk, _ in springs):
                    dirs[nid].append([1.0 if i == k else 0.0 for i in range(3)])
            r = _rank3(dirs[nid])
            if r == 0:
                for k in range(3, 6):
                    fixed[nid][k] = True
                art_rot.add(nid)
            elif r < 3:
                raise Unsupported(f"rotational mechanism at node {nid} (rank {r})")
    settle_dofs = {(n, k) for n, k, _ in settlements}
    for nid, fl in fixed.items():
        fl2 = [1 if (f and (nid, k) not in settle_dofs) else 0 for k, f in enumerate(fl)]
        if any(fl2):
            ops.fix(nid, *fl2)

    max_id = max(list(nodes) + [e["id"] for e in elems] + [0])
    tag = 10 ** (len(str(max_id)) + 1)
    spring_elems = []
    # The engine's Rayleigh C = a0*M + a1*K includes the support springs;
    # zeroLength skips Rayleigh damping unless asked.
    ray = ["-doRayleigh", 1] if dens else []
    for nid, k, kv in springs:
        tag += 1
        ops.node(tag, *nodes[nid])
        ops.fix(tag, *([1] * ndf))
        ops.uniaxialMaterial("Elastic", tag, kv)
        ops.element("zeroLength", tag, tag, nid, "-mat", tag, "-dir", k + 1, *ray)
        spring_elems.append((nid, tag))

    # Member loads, local axes. Concentrated loads (point loads, and the
    # Gauss-point form of partial/trapezoidal distributed loads) are applied
    # as nodal loads at nodes inserted along the member: OpenSees 3.8's
    # ElasticBeam3d ignores -releasey/-releasez for -beamPoint (it returns
    # the fixed-fixed end forces), so element point loads are unusable on
    # released members. Splitting a prismatic member at a point load is exact.
    geo = {}
    for e in elems:
        pi, pj = nodes[e["nodeI"]], nodes[e["nodeJ"]]
        L = _norm([pj[k] - pi[k] for k in range(3)])
        geo[e["id"]] = (L,) + local_axes_3d(pi, pj, e)
    etype = {e["id"]: e for e in elems}
    uniform_loads = {}   # eid -> [wy, wz, wx]
    point_loads = {}     # eid -> [(pos, [px, py, pz])]
    for ld in d["loads"]:
        t, x = ld["type"], ld["data"]
        if t in ("nodal", "pressure", "quadPressure") or etype[x["elementId"]]["type"] == "truss":
            continue
        eid = x["elementId"]
        L = geo[eid][0]
        if t == "distributed":
            a = x.get("a") or 0.0
            b = x.get("b") if x.get("b") is not None else L
            qy = (x.get("qYI", 0.0), x.get("qYJ", 0.0))
            qz = (x.get("qZI", 0.0), x.get("qZJ", 0.0))
            qx = (x.get("qXI", 0.0) or 0.0, x.get("qXJ", 0.0) or 0.0)
            if not (-1e-12 <= a <= b <= L * (1 + 1e-12)):
                raise Unsupported("distributed load outside member")
            if qy[0] == qy[1] and qz[0] == qz[1] and qx[0] == qx[1] and abs(a) < 1e-12 and abs(b - L) < 1e-12:
                w = uniform_loads.setdefault(eid, [0.0, 0.0, 0.0])
                w[0] += qy[0]
                w[1] += qz[0]
                w[2] += qx[0]
            else:
                gy, gz, gx = (_gauss_point_loads(q[0], q[1], a, b) for q in (qy, qz, qx))
                for (fy, pos), (fz, _), (fx, _) in zip(gy, gz, gx):
                    point_loads.setdefault(eid, []).append((pos, [fx, fy, fz]))
        elif t == "pointOnElement":
            if not (0 < x["a"] < L):
                raise Unsupported("point load outside the member interior")
            point_loads.setdefault(eid, []).append((x["a"], [0.0, x["py"], x["pz"]]))

    nodal = {}
    truss_axial = {}

    def add_nodal(nid, f):
        acc = nodal.setdefault(nid, [0.0] * ndf)
        for k in range(ndf):
            acc[k] += f[k]

    pieces = {}  # eid -> [sub-element tags, first .. last]
    hinge_slaves = []  # (joint node, hinge node)
    wagner = []  # frames' torsional geometric stiffness, added in numpy (see _wagner)
    for e in elems:
        L, ex, ey, ez = geo[e["id"]]
        pi, pj = nodes[e["nodeI"]], nodes[e["nodeJ"]]
        m, sec = mats[e["materialId"]], secs[e["sectionId"]]
        E = m["e"] * 1000.0
        G = E / (2 * (1 + m["nu"]))
        if e["type"] == "frame" and geom:
            # A parallel torsion-only beam (J = 0 until analysis_pdelta sets
            # it) carries the Wagner term in P-Delta; see _wagner.
            tag += 1
            ops.geomTransf("Linear", tag, *ez)
            tag += 1
            ops.element("elasticBeamColumn", tag, e["nodeI"], e["nodeJ"], 0.0, E, G, 0.0, 0.0, 0.0, tag - 1)
            wagner.append(dict(eid=e["id"], ni=e["nodeI"], nj=e["nodeJ"], ex=ex, ea=E * sec["a"], L=L,
                               r0sq=(sec["iy"] + sec["iz"]) / sec["a"], g=G,
                               j=sec.get("j") or sec["iy"] + sec["iz"], tag=tag))
        if e["type"] == "truss" and geom:
            # See opensees_2d: string Kg from a released beam on PDelta.
            ops.geomTransf("PDelta", e["id"], *ez)
            ops.element("elasticBeamColumn", e["id"], e["nodeI"], e["nodeJ"], sec["a"], E, G, 0.0,
                        sec.get("iy") or 1.0, sec.get("iz") or 1.0, e["id"], "-releasez", 3, "-releasey", 3)
            continue
        if e["type"] == "truss":
            tag += 1
            ops.uniaxialMaterial("Elastic", tag, E)
            # -doRayleigh: Truss skips Rayleigh damping unless asked.
            mass = ["-rho", _rho_a(dens, m, sec), "-cMass", 1, "-doRayleigh", 1] if dens else []
            ops.element("Truss", e["id"], e["nodeI"], e["nodeJ"], sec["a"], tag, *mass)
            continue
        ops.geomTransf("Linear", e["id"], *ez)
        if dens:
            # Parallel zero-stiffness mass element (see opensees_2d). Its J is
            # Iy + Iz: the engine's torsional inertia is rho*(Iy+Iz)*L/6*[2 1; 1 2]
            # (polar moment), OpenSees' is the same with Jx in place of Ip.
            tag += 1
            rel = any(e.get(k) for k in ("releaseMyStart", "releaseMyEnd", "releaseMzStart", "releaseMzEnd",
                                         "releaseTStart", "releaseTEnd"))
            ops.element("elasticBeamColumn", tag, e["nodeI"], e["nodeJ"], sec["a"], 0.0, 0.0,
                        sec["iy"] + sec["iz"], sec["iy"], sec["iz"], e["id"],
                        "-mass", _rho_a(dens, m, sec), *([] if rel else ["-cMass"]))
        # Station nodes at the concentrated loads (merged when coincident).
        stations = []
        for pos, f in sorted(point_loads.get(e["id"], []), key=lambda p: p[0]):
            if stations and abs(pos - stations[-1][0]) <= 1e-9 * L:
                stations[-1][1] = [stations[-1][1][k] + f[k] for k in range(3)]
            else:
                stations.append([pos, list(f)])
        chain = [e["nodeI"]]
        for pos, f in stations:
            tag += 1
            ops.node(tag, *[pi[k] + pos / L * (pj[k] - pi[k]) for k in range(3)])
            add_nodal(tag, [f[0] * ex[k] + f[1] * ey[k] + f[2] * ez[k] for k in range(3)] + [0.0] * 3)
            chain.append(tag)
        chain.append(e["nodeJ"])
        subs = []
        for s_i in range(len(chain) - 1):
            first, last = s_i == 0, s_i == len(chain) - 2
            sub = e["id"] if len(chain) == 2 else (tag := tag + 1)
            subs.append(sub)
            if geom:
                big = 1e12 * sec["a"]  # Euler-Bernoulli consistent Kg (see opensees_2d)
                ops.element("ElasticTimoshenkoBeam", sub, chain[s_i], chain[s_i + 1],
                            E, G, sec["a"], sec["j"], sec["iy"], sec["iz"], big, big, e["id"], "-geomNonlinear")
            elif sec.get("asY") or sec.get("asZ"):
                # Engine: phi_y = 12 E Iy / (G asY L^2), i.e. asY is the shear
                # area of the Iy bending plane (shear along local z) -> Avz.
                big = 1e12 * sec["a"]
                avy = sec.get("asZ") or big
                avz = sec.get("asY") or big
                ni, nj = chain[s_i], chain[s_i + 1]
                for at_end, end in ((first, "Start"), (last, "End")):
                    released = [ax for ax, key in ((ey, "releaseMy"), (ez, "releaseMz")) if at_end and e.get(key + end)]
                    if not released:
                        continue
                    kept = [ax for ax in (ex, ey, ez) if not any(ax is r for r in released)]
                    tag += 1
                    dofs = [1, 2, 3] + [4 + _global_axis(ax) for ax in kept]
                    if end == "Start":
                        ni = _hinge_node(ops, tag, ni, dofs, hinge_slaves)
                    else:
                        nj = _hinge_node(ops, tag, nj, dofs, hinge_slaves)
                ops.element("ElasticTimoshenkoBeam", sub, ni, nj,
                            E, G, sec["a"], sec["j"], sec["iy"], sec["iz"], avy, avz, e["id"])
            else:
                args = []
                rz = (1 if first and e.get("releaseMzStart") else 0) + (2 if last and e.get("releaseMzEnd") else 0)
                ry = (1 if first and e.get("releaseMyStart") else 0) + (2 if last and e.get("releaseMyEnd") else 0)
                if rz:
                    args += ["-releasez", rz]
                if ry:
                    args += ["-releasey", ry]
                ops.element("elasticBeamColumn", sub, chain[s_i], chain[s_i + 1],
                            sec["a"], E, G, sec["j"], sec["iy"], sec["iz"], e["id"], *args)
        pieces[e["id"]] = subs

    # Shells: quads -> ShellMITC4 (MITC4 bending, as the engine's; membrane
    # bilinear + Hughes-Brezzi drilling vs the engine's EAS-7), plates ->
    # ShellDKGT (DKT bending, as the engine's; GT9 membrane vs CST). The
    # bending parts are the same formulation; models whose membrane and
    # drilling DOFs are all restrained compare them exactly.
    shell_sec = {}
    for kind, sid, sn, mid, th in shells:
        key = (mid, th)
        if key not in shell_sec:
            tag += 1
            mm = mats[mid]
            ops.section("ElasticMembranePlateSection", tag, mm["e"] * 1000.0, mm["nu"], th, 0.0)
            shell_sec[key] = tag
        tag += 1
        ops.element("ShellMITC4" if kind == "quad" else "ShellDKGT", tag, *sn, shell_sec[key])

    ops.timeSeries("Linear", 1)
    ops.pattern("Plain", 1, 1)
    for eid, w in uniform_loads.items():
        for sub in pieces[eid]:
            ops.eleLoad("-ele", sub, "-type", "-beamUniform", *w)

    for ld in d["loads"]:
        t, x = ld["type"], ld["data"]
        if t == "nodal":
            f = [x.get(k, 0.0) or 0.0 for k in ("fx", "fy", "fz", "mx", "my", "mz")]
            if (ndf == 3 or x["nodeId"] in art_rot) and any(abs(v) > 0 for v in f[3:]):
                raise Unsupported("nodal moment on a rotation-free node")
            add_nodal(x["nodeId"], f[:ndf])
            continue
        if t in ("pressure", "quadPressure"):
            sh = {(k_, i_): sn_ for k_, i_, sn_, _, _ in shells}.get(("plate" if t == "pressure" else "quad", x["elementId"]))
            if sh is None:
                continue  # the engine ignores a pressure on a missing element
            for i_, f in _pressure_nodal([nodes[n_] for n_ in sh], x["pressure"]):
                add_nodal(sh[i_], f + [0.0] * (ndf - 3))
            continue
        eid = x["elementId"]
        e = etype[eid]
        if e["type"] != "truss":
            continue  # frame member loads handled above
        L, ex, ey, ez = geo[eid]
        if t == "distributed":
            a = x.get("a") or 0.0
            b = x.get("b") if x.get("b") is not None else L
            qy = (x.get("qYI", 0.0), x.get("qYJ", 0.0))
            qz = (x.get("qZI", 0.0), x.get("qZJ", 0.0))
            qx = (x.get("qXI", 0.0) or 0.0, x.get("qXJ", 0.0) or 0.0)
            # A truss carries nothing transverse: lever rule (statics).
            ri, rj = {}, {}
            for key, q in (("y", qy), ("z", qz), ("x", qx)):
                ri[key], rj[key] = _lever(q[0], q[1], a, b, L)
            fa = truss_axial.setdefault(eid, [0.0, 0.0])
            fa[0] += ri["x"]
            fa[1] += rj["x"]
            add_nodal(e["nodeI"], [ri["x"] * ex[k] + ri["y"] * ey[k] + ri["z"] * ez[k] for k in range(3)] + [0.0] * (ndf - 3))
            add_nodal(e["nodeJ"], [rj["x"] * ex[k] + rj["y"] * ey[k] + rj["z"] * ez[k] for k in range(3)] + [0.0] * (ndf - 3))
        elif t == "pointOnElement":
            fi, fj = 1 - x["a"] / L, x["a"] / L
            add_nodal(e["nodeI"], [x["py"] * fi * ey[k] + x["pz"] * fi * ez[k] for k in range(3)] + [0.0] * (ndf - 3))
            add_nodal(e["nodeJ"], [x["py"] * fj * ey[k] + x["pz"] * fj * ez[k] for k in range(3)] + [0.0] * (ndf - 3))
        else:
            raise Unsupported(t)
    for nid, f in sorted(nodal.items()):
        ops.load(nid, *f)
    for nid, dof, v in settlements:
        ops.sp(nid, dof + 1, v)

    ctx = dict(ops=ops, dim=3, ndf=ndf, nodes=nodes, fixed=fixed, art_rot=art_rot, spec=spec or {},
               wagner=wagner)
    if mode != "static":
        def collect():
            r = _collect_3d(ops, nodes, ndf, flags, art_rot, spring_elems, hinge_slaves, elems, truss_axial,
                            pieces)
            for w in wagner:  # the engine's end forces include the Wagner torque
                f = list(ops.eleResponse(w["tag"], "localForce"))
                r["forces"][w["eid"]]["mxStart"] += f[3]
                r["forces"][w["eid"]]["mxEnd"] -= f[9]
            return r
        ctx["collect"] = collect
        return ANALYSES[mode](ctx)
    kappa = _analyze(ops, fixed)
    r = _collect_3d(ops, nodes, ndf, flags, art_rot, spring_elems, hinge_slaves, elems, truss_axial, pieces)
    return dict(dim=3, art_rot=sorted(art_rot), kappa=kappa, **r)


def _collect_3d(ops, nodes, ndf, flags, art_rot, spring_elems, hinge_slaves, elems, truss_axial, pieces):
    disp = {}
    for nid in nodes:
        u = list(ops.nodeDisp(nid))[:ndf]
        disp[nid] = u + [0.0] * (6 - ndf)
    reac = {}
    for nid in flags:
        r = list(ops.nodeReaction(nid))[:ndf] + [0.0] * (6 - ndf)
        if nid in art_rot:
            r[3:] = [0.0, 0.0, 0.0]
        for n2, g in spring_elems + hinge_slaves:
            if n2 == nid:
                rg = ops.nodeReaction(g)
                for k in range(ndf):
                    r[k] += rg[k]
        reac[nid] = r
    forces = {}
    names = ["n", "vy", "vz", "mx", "my", "mz"]
    for e in elems:
        if e["type"] == "truss":
            N = _truss_n(ops, e["id"])
            fi, fj = truss_axial.get(e["id"], [0.0, 0.0])
            fd = {f"{n}Start": 0.0 for n in names}
            fd.update({f"{n}End": 0.0 for n in names})
            fd["nStart"], fd["nEnd"] = N + fi, N - fj
            forces[e["id"]] = fd
            continue
        f = list(ops.eleResponse(pieces[e["id"]][0], "localForce"))[:6] + \
            list(ops.eleResponse(pieces[e["id"]][-1], "localForce"))[6:]
        fd = {}
        for k, n in enumerate(names):
            fd[f"{n}Start"] = -f[k] if k == 0 else f[k]
            fd[f"{n}End"] = f[6 + k] if k == 0 else -f[6 + k]
        forces[e["id"]] = fd
    return dict(disp=disp, reac=reac, forces=forces)


def _rank3(vs, tol=1e-9):
    """Rank of a set of 3-vectors (Gram-Schmidt)."""
    basis = []
    for v in vs:
        w = list(v)
        for b in basis:
            d = sum(w[k] * b[k] for k in range(3))
            w = [w[k] - d * b[k] for k in range(3)]
        n = _norm(w)
        if n > tol:
            basis.append([x / n for x in w])
        if len(basis) == 3:
            break
    return len(basis)


# ------------------------------------------------- OpenSees: other analyses
#
# The same OpenSees model, analysed otherwise. Matrices are read back with
# printA (FullGeneral), which forms the tangent at the current state:
#
#   buckling  K at u = 0, then K + Kg(N) after the linear load step; the
#             eigenproblem K phi = lambda (-Kg) phi is solved here (numpy).
#             Frames are ElasticTimoshenkoBeam -geomNonlinear (consistent
#             cubic Kg, linear in the axial force; Av = 1e12 A makes it the
#             Euler-Bernoulli one), trusses a released beam on a PDelta
#             transformation (string Kg N/L). Both are the engine's Kg.
#   modal     eigen -fullGenLapack with the engine's mass model (see
#             opensees_2d / opensees_3d).
#   pdelta    the same geometric elements, Newton to convergence: the fixed
#             point (K + Kg(N(u))) u = F the engine iterates to.
#   th        Newmark / HHT transient with the engine's mass and Rayleigh
#             damping (anchored on the first two modes, like the engine).

GEOM_MODES = ("buckling", "pdelta")
MASS_MODES = ("modal", "th")


def _rho_a(dens, m, sec):
    """Mass per unit length (t/m): density (kg/m^3) * A / 1000, as the engine."""
    return float(dens.get(str(m["id"]), 0.0)) * sec["a"] / 1000.0


def _check_geom(d, elems, secs, has_frame):
    """Features whose geometric stiffness has no exact OpenSees counterpart."""
    if not has_frame:
        raise Unsupported("geometric analysis of a truss-only model")
    for e in elems:
        if e["type"] != "frame":
            continue
        if any(e.get(k) for k in ("hingeStart", "hingeEnd", "releaseMyStart", "releaseMyEnd",
                                  "releaseMzStart", "releaseMzEnd")):
            # The engine condenses Kg with the elastic map of the released
            # rotation (3D) or not at all (2D); OpenSees would keep the
            # released rotation as a DOF of the eigenproblem.
            raise Unsupported("hinge/release in a geometric analysis")
        sec = secs[e["sectionId"]]
        if sec.get("shearCenterY") or sec.get("shearCenterZ"):
            # The engine's Kg couples bending and twist through the shear
            # centre offset (_wagner adds the centroidal Wagner term only).
            raise Unsupported("shear centre offset in a geometric analysis")
        if sec.get("asY") or sec.get("asZ"):
            # OpenSees' Kg is the Timoshenko one, the engine's Euler-Bernoulli.
            raise Unsupported("Timoshenko section in a geometric analysis")
    etype = {e["id"]: e["type"] for e in elems}
    for ld in d["loads"]:
        x = ld["data"]
        if ld["type"] == "nodal" or etype.get(x.get("elementId")) == "truss":
            continue
        partial = ld["type"] == "distributed" and (x.get("a") or x.get("b") is not None)
        trapez = ld["type"] == "distributed" and any(
            abs((x.get(k + "I") or 0.0) - (x.get(k + "J") or 0.0)) > 0 for k in ("q", "qY", "qZ", "qX"))
        if ld["type"] != "distributed" or partial or trapez:
            # Station nodes would split the member, and its consistent Kg.
            raise Unsupported("concentrated/partial member load in a geometric analysis")


def _shell_elems(d):
    """[(tag kind, id, node ids, material id, thickness)]: plates (DKT+CST
    triangles) and quads (MITC4), the shell families with an OpenSees pair."""
    out = [("plate", p["id"], list(p["nodes"]), p["materialId"], p["thickness"])
           for p in (d.get("plates") or {}).values()]
    out += [("quad", q["id"], list(q["nodes"]), q["materialId"], q["thickness"])
            for q in (d.get("quads") or {}).values()]
    return out


def _pressure_nodal(pts, p):
    """Consistent nodal forces of a uniform pressure along the element normal,
    as the engine (quad: integral of N_i over the bilinear map, 2x2 Gauss, with
    the normal of the diagonals' cross product; triangle: p*A/3 each, normal
    of (x1-x0) x (x2-x0)). [(node index, [fx, fy, fz])]."""
    if len(pts) == 3:
        n = _cross([pts[1][k] - pts[0][k] for k in range(3)], [pts[2][k] - pts[0][k] for k in range(3)])
        area = _norm(n) / 2
        ez = _unit(n)
        return [(i, [p * area / 3 * ez[k] for k in range(3)]) for i in range(3)]
    ez = _unit(_cross([pts[2][k] - pts[0][k] for k in range(3)], [pts[3][k] - pts[1][k] for k in range(3)]))
    g = 1 / math.sqrt(3)
    f = [0.0] * 4
    for xi in (-g, g):
        for eta in (-g, g):
            nn = [(1 - xi) * (1 - eta) / 4, (1 + xi) * (1 - eta) / 4, (1 + xi) * (1 + eta) / 4, (1 - xi) * (1 + eta) / 4]
            dxi = [-(1 - eta) / 4, (1 - eta) / 4, (1 + eta) / 4, -(1 + eta) / 4]
            deta = [-(1 - xi) / 4, -(1 + xi) / 4, (1 + xi) / 4, (1 - xi) / 4]
            a = [sum(dxi[i] * pts[i][k] for i in range(4)) for k in range(3)]
            b = [sum(deta[i] * pts[i][k] for i in range(4)) for k in range(3)]
            det = _norm(_cross(a, b))
            for i in range(4):
                f[i] += nn[i] * det
    return [(i, [p * f[i] * ez[k] for k in range(3)]) for i in range(4)]


def _np():
    import numpy as np  # noqa: venv only
    return np


def _static_setup(ops, lf):
    ops.wipeAnalysis()
    ops.constraints("Transformation")
    ops.numberer("RCM")
    ops.system("FullGeneral")
    ops.test("NormDispIncr", 1e-12, 1, 0)
    ops.integrator("LoadControl", lf)
    ops.algorithm("Linear")
    ops.analysis("Static")


def _tangent(ops):
    """The assembled free-DOF tangent at the current state (dense)."""
    np = _np()
    n = ops.systemSize()
    return np.array(ops.printA("-ret")).reshape(n, n)


def _kappa(k):
    np = _np()
    dg = np.sqrt(np.abs(np.diag(k)))
    dg[dg == 0] = 1.0
    return float(np.linalg.cond(k / np.outer(dg, dg)))


def _stiffness(ctx):
    """K at the unloaded state, and the equation numbers of every node."""
    ops, fixed = ctx["ops"], ctx["fixed"]
    if all(all(fl) for fl in fixed.values()):
        raise Unsupported("no free DOF")
    if sum(not f for fl in fixed.values() for f in fl) > 2500:
        raise Unsupported("too large for dense eigen/transient comparison")
    _static_setup(ops, 0.0)
    if ops.analyze(1) != 0:
        raise RuntimeError("OpenSees analyze failed (singular / mechanism)")
    k = _tangent(ops)
    eq = {nid: list(ops.nodeDOFs(nid))[:ctx["ndf"]] for nid in ctx["nodes"]}
    return k, eq


def _vec_to_nodes(ctx, eq, vec):
    """Equation-numbered vector -> {node: [6 or 3 components]} (stabileo shape)."""
    width = 3 if ctx["dim"] == 2 else 6
    out = {}
    for nid, dofs in eq.items():
        u = [float(vec[q]) if q >= 0 else 0.0 for q in dofs]
        out[nid] = u + [0.0] * (width - len(u))
    return out


def _gen_eig_spd(a, b):
    """Eigenpairs of a x = mu b x with b SPD (Cholesky reduction, numpy only)."""
    np = _np()
    l = np.linalg.cholesky(b)
    c = np.linalg.solve(l, np.linalg.solve(l, a).T).T
    mu, y = np.linalg.eigh((c + c.T) / 2)
    return mu, np.linalg.solve(l.T, y)


def _wagner_p(ops, w):
    """A frame's axial force at the current displacements, tension positive:
    EA*(elongation)/L, the N the engine builds its Kg from."""
    ui, uj = ops.nodeDisp(w["ni"]), ops.nodeDisp(w["nj"])
    return w["ea"] * sum(w["ex"][k] * (uj[k] - ui[k]) for k in range(3)) / w["L"]


def _wagner(ctx, eq, n):
    """The torsional part of the engine's 3D frame Kg (geometric_stiffness.rs,
    frame_kg_local_3d), which no OpenSees beam has: the Wagner term
    P*r0^2/L*[1, -1; -1, 1] on the member twist (theta . ex at each end),
    r0^2 = (Iy + Iz)/A (centroidal shear centre: _check_geom refuses offsets).
    Without it the engine's 3D load factors came out 1e-5..1e-2 below
    OpenSees' (every buckling3d model since the engine added the term).
    Dense n x n, in OpenSees' equation numbers; zero in 2D."""
    np = _np()
    kw = np.zeros((n, n))
    for wg in ctx.get("wagner", []):
        ni, nj, ex = wg["ni"], wg["nj"], wg["ex"]
        w = _wagner_p(ctx["ops"], wg) * wg["r0sq"] / wg["L"]
        for a, sa in ((ni, 1.0), (nj, -1.0)):
            for b, sb in ((ni, 1.0), (nj, -1.0)):
                for r in range(3):
                    qa = eq[a][3 + r]
                    if qa < 0:
                        continue
                    for c in range(3):
                        qb = eq[b][3 + c]
                        if qb >= 0:
                            kw[qa, qb] += sa * sb * w * ex[r] * ex[c]
    return kw


def analysis_buckling(ctx):
    np = _np()
    ops = ctx["ops"]
    k, eq = _stiffness(ctx)
    ops.integrator("LoadControl", 1.0)
    if ops.analyze(1) != 0:
        raise RuntimeError("OpenSees analyze failed (singular / mechanism)")
    ops.reactions()
    kg = _tangent(ops) - k + _wagner(ctx, eq, k.shape[0])
    linear = dict(dim=ctx["dim"], art_rot=sorted(ctx["art_rot"]), **ctx["collect"]())
    # K phi = lambda (-Kg) phi  <=>  (-Kg) phi = mu K phi, lambda = 1/mu.
    mu, vec = _gen_eig_spd(-kg, k)
    top = max(abs(mu).max(), 1e-300)
    # mu below 1e-9 of the largest is the round-off of Kg's null space (no
    # compressed member along it), lambda ~ 1e10..1e16: not a buckling mode.
    order = [i for i in np.argsort(-mu) if mu[i] > 1e-9 * top]
    n = int(ctx["spec"].get("numModes", 4))
    return dict(dim=ctx["dim"], kappa=_kappa(k), art_rot=sorted(ctx["art_rot"]), linear=linear,
                values=[1.0 / float(mu[i]) for i in order[:n]],
                modes=[_vec_to_nodes(ctx, eq, vec[:, i]) for i in order[:n]])


def analysis_modal(ctx):
    ops = ctx["ops"]
    k, eq = _stiffness(ctx)
    ops.wipeAnalysis()
    n = int(ctx["spec"].get("numModes", 4))
    lam = ops.eigen("-fullGenLapack", n)
    # Massless directions are infinite eigenvalues, which fullGenLapack
    # returns as ~1e308 followed by zeros: keep the ascending finite prefix.
    for i, v in enumerate(lam):
        if not v < 1e100 or (i and v < lam[i - 1]):
            lam = lam[:i]
            break
    modes = []
    for i in range(len(lam)):
        modes.append({nid: list(ops.nodeEigenvector(nid, i + 1))[:ctx["ndf"]] for nid in ctx["nodes"]})
        for nid, u in modes[-1].items():
            u.extend([0.0] * ((3 if ctx["dim"] == 2 else 6) - len(u)))
    return dict(dim=ctx["dim"], kappa=_kappa(k), art_rot=sorted(ctx["art_rot"]),
                values=[math.sqrt(max(v, 0.0)) for v in lam], modes=modes)


def analysis_pdelta(ctx):
    ops = ctx["ops"]
    _stiffness(ctx)
    ops.wipeAnalysis()
    ops.constraints("Transformation")
    ops.numberer("RCM")
    ops.system("FullGeneral")
    ops.test("RelativeNormDispIncr", 1e-11, 200, 0)
    ops.integrator("LoadControl", 1.0)
    ops.algorithm("Newton")
    ops.analysis("Static")
    if ops.analyze(1) != 0:
        raise RuntimeError("OpenSees P-Delta did not converge")
    # The Wagner term (see _wagner) as the parallel torsion beams' GJ/L =
    # P*r0^2/L, P from the current displacements: fixed-point iteration to
    # the engine's (K + Kg(N(u)))u = F, re-solving equilibrium at each step.
    wg = ctx.get("wagner", [])
    for i, w in enumerate(wg, start=1):
        ops.parameter(i, "element", w["tag"], "J")
    ops.integrator("LoadControl", 0.0)
    # A relative increment test has nothing to be relative to at a zero load
    # step: a few Newton iterations per update, convergence judged on P.
    ops.test("FixedNumIter", 3)
    for _ in range(100) if wg else ():
        ps = [_wagner_p(ops, w) for w in wg]
        for i, (w, p) in enumerate(zip(wg, ps), start=1):
            ops.updateParameter(i, p * w["r0sq"] / w["g"])
        if ops.analyze(1) != 0:
            raise RuntimeError("OpenSees P-Delta did not converge")
        # Converged when no Wagner stiffness moves by 1e-12 of its member's
        # own torsional stiffness (P of round-off size never settles relatively).
        new = [_wagner_p(ops, w) for w in wg]
        if all(abs(a - b) * w["r0sq"] / w["g"] <= 1e-12 * w["j"] for a, b, w in zip(new, ps, wg)):
            break
    else:
        if wg:
            raise RuntimeError("OpenSees P-Delta: Wagner fixed point did not converge")
    ops.reactions()
    kt = _tangent(ops)
    r = ctx["collect"]()
    return dict(dim=ctx["dim"], kappa=_kappa(kt), art_rot=sorted(ctx["art_rot"]), **r)


def analysis_th(ctx):
    """Linear transient. spec: dt, nSteps, alpha (HHT, engine convention
    [-1/3, 0]; absent = Newmark average acceleration), dampingXi,
    groundAccel + groundDir (1-based OpenSees direction), or forceTimes /
    forceFactors / forceLoads (one shape, scaled by a piecewise-linear
    factor)."""
    ops, sp = ctx["ops"], ctx["spec"]
    k, eq = _stiffness(ctx)
    ops.wipeAnalysis()
    ops.remove("loadPattern", 1)  # the static loads (the model's own are not part of the history)
    xi = sp.get("dampingXi") or 0.0
    if xi > 0:
        lam = [v for v in ops.eigen("-fullGenLapack", 2) if v > 1e-10]
        if not lam:
            raise Unsupported("no positive eigenvalue for Rayleigh damping")
        w1 = math.sqrt(lam[0])
        w2 = math.sqrt(lam[1]) if len(lam) > 1 else 3.0 * w1
        ops.rayleigh(2 * xi * w1 * w2 / (w1 + w2), 2 * xi / (w1 + w2), 0.0, 0.0)
    dt, nsteps = float(sp["dt"]), int(sp["nSteps"])
    if sp.get("groundAccel") is not None:
        # One more sample: the last step's time, accumulated in floating
        # point, lands just past the record, where a Path series is 0.
        vals = list(sp["groundAccel"])
        ops.timeSeries("Path", 101, "-dt", dt, "-values", *(vals + vals[-1:]))
        ops.pattern("UniformExcitation", 101, int(sp["groundDir"]), "-accel", 101)
    else:
        ops.timeSeries("Path", 101, "-time", *sp["forceTimes"], "-values", *sp["forceFactors"], "-useLast")
        ops.pattern("Plain", 101, 101)
        for nid, f in sp["forceLoads"]:
            ops.load(int(nid), *f[:ctx["ndf"]])
    ops.constraints("Transformation")
    ops.numberer("RCM")
    ops.system("FullGeneral")
    ops.test("NormDispIncr", 1e-12, 1, 0)
    ops.algorithm("Linear")
    if sp.get("alpha") is not None:
        ops.integrator("HHT", 1.0 + float(sp["alpha"]))  # OpenSees alpha = 1 + engine alpha
    else:
        ops.integrator("Newmark", 0.5, 0.25)
    ops.analysis("Transient")
    width = 3 if ctx["dim"] == 2 else 6
    hist = {nid: [[0.0] * width] for nid in ctx["nodes"]}
    for _ in range(nsteps):
        if ops.analyze(1, dt) != 0:
            raise RuntimeError("OpenSees transient step failed")
        for nid in ctx["nodes"]:
            u = list(ops.nodeDisp(nid))[:ctx["ndf"]]
            hist[nid].append(u + [0.0] * (width - len(u)))
    return dict(dim=ctx["dim"], kappa=_kappa(k), art_rot=sorted(ctx["art_rot"]), hist=hist)


def _planar_th_in_3d(d, spec):
    """A 2D ground-motion history run on the plane frame embedded in 3D (the
    y = 0 plane, out-of-plane DOFs fixed). OpenSees 3.8's ElasticBeam2d and
    ElasticTimoshenkoBeam2d subtract their UniformExcitation inertia load
    twice (getResistingForce and getResistingForceIncInertia both do), which
    doubles the earthquake on every 2D beam with mass; ElasticBeam3d does it
    once. In-plane bending of the 3D member is about its local y (local z
    lies in the plane for the engine's default axes), so Iy = Iz(2D), a hinge
    is a My release and ry(2D) = -ry(3D)."""
    if any(s.get("angle") for s in d["supports"].values()):
        raise Unsupported("rotated spring in a planar ground-motion history")
    flags = {"fixed": (1, 1, 1), "pinned": (1, 1, 0), "rollerX": (0, 1, 0), "rollerY": (1, 0, 0),
             "rollerZ": (1, 0, 0), "guidedX": (0, 1, 1), "guidedY": (1, 0, 1), "guidedZ": (1, 0, 1),
             "spring": (0, 0, 0)}
    win = supports_by_node_2d(d["supports"])  # as DofNumbering::build_2d
    sups = {}
    for nid, s_ in win.items():
        fx, fz, fr = flags[s_["type"]]
        t = {"nodeId": nid, "rx": bool(fx), "ry": True, "rz": bool(fz), "rrx": True, "rry": bool(fr), "rrz": True}
        for k2, k3 in (("kx", "kx"), ("ky", "kz"), ("kz", "kry")):
            if (s_.get(k2) or 0.0) > 0:
                t[k3] = s_[k2]
        sups[str(nid)] = t
    for n in d["nodes"].values():
        if n["id"] not in win:
            sups[f"p{n['id']}"] = {"nodeId": n["id"], "rx": False, "ry": True, "rz": False,
                                   "rrx": True, "rry": False, "rrz": True}
    secs = {}
    for k, s_ in d["sections"].items():
        t = {"id": s_["id"], "a": s_["a"], "iy": s_["iz"], "iz": s_["iz"], "j": s_["iz"]}
        if s_.get("asY"):
            t["asY"] = s_["asY"]
        secs[k] = t
    elems = {}
    for k, e in d["elements"].items():
        t = {x: e[x] for x in ("id", "type", "nodeI", "nodeJ", "materialId", "sectionId")}
        if e.get("hingeStart"):
            t["releaseMyStart"] = True
        if e.get("hingeEnd"):
            t["releaseMyEnd"] = True
        elems[k] = t
    d3 = {"nodes": {k: {"id": n["id"], "x": n["x"], "y": 0.0, "z": _get(n, "z", "y")} for k, n in d["nodes"].items()},
          "materials": d["materials"], "sections": secs, "elements": elems, "supports": sups, "loads": []}
    sp3 = dict(spec, groundDir={1: 1, 2: 3}[int(spec["groundDir"])])
    r = opensees_3d(d3, "th", sp3)
    r["dim"] = 2
    r["hist"] = {nid: [[u[0], u[2], -u[4]] for u in h] for nid, h in r["hist"].items()}
    return r


ANALYSES = {"buckling": analysis_buckling, "modal": analysis_modal,
            "pdelta": analysis_pdelta, "th": analysis_th}


# ---------------------------------------------------------------- stabileo

def stabileo(path_or_json, binary):
    if isinstance(path_or_json, str):
        p = subprocess.run([binary, path_or_json], capture_output=True, text=True)
    else:
        p = subprocess.run([binary], input=json.dumps(path_or_json), capture_output=True, text=True)
    try:
        out = json.loads(p.stdout)
    except json.JSONDecodeError:
        raise RuntimeError(f"stabileo: bad output (exit {p.returncode}): {p.stderr[-400:]}")
    if "error" in out:
        raise RuntimeError("stabileo: " + out["error"])
    return out


def stabileo_job(job, binary):
    """Run the engine on a harness job ({"analysis": kind, "model": ..., spec})."""
    kind, d = job["analysis"], job["model"]
    if kind == "buckling":
        w = {"analysis": "buckling", "numModes": job["numModes"], "model": d}
    elif kind == "modal":
        w = {"analysis": "modal", "numModes": job["numModes"], "densities": job["densities"], "model": d}
    elif kind == "pdelta":
        # 1e-11 relative increment; a model whose round-off floor sits above
        # that (it stalls there, converged to ~1e-9) is retried at 1e-8,
        # still far inside the 1e-6 comparison tolerance.
        out = stabileo({"analysis": "pdelta", "maxIter": 200, "tolerance": 1e-11, "model": d}, binary)
        if out["converged"]:
            return out
        w = {"analysis": "pdelta", "maxIter": 200, "tolerance": 1e-8, "model": d}
    elif kind == "th":
        th = {"solver": d, "densities": job["densities"], "timeStep": job["dt"], "nSteps": job["nSteps"],
              "method": "hht" if job.get("alpha") is not None else "newmark",
              "alpha": job.get("alpha"), "dampingXi": job.get("dampingXi")}
        dim3 = _is_3d(d)
        if job.get("groundAccel") is not None:
            axis = "XYZ"[job["groundDir"] - 1] if dim3 else "XY"[job["groundDir"] - 1]
            if dim3:
                th["groundAccel" + axis] = job["groundAccel"]
            else:
                th["groundAccel"], th["groundDirection"] = job["groundAccel"], axis
        else:
            keys = ("fx", "fy", "fz", "mx", "my", "mz") if dim3 else ("fx", "fz", "my")
            th["forceHistory"] = [
                {"time": t, "loads": [dict(nodeId=nid, **{k: c * f[i] for i, k in enumerate(keys)})
                                      for nid, f in job["forceLoads"]]}
                for t, c in zip(job["forceTimes"], job["forceFactors"])]
        w = {"analysis": "timeHistory", "input": th}
    else:
        raise ValueError(kind)
    return stabileo(w, binary)


def normalize_ext(kind, res, dim):
    """Engine result of an extended analysis -> the opensees_* result shape."""
    def node_vec(ds):
        if dim == 2:
            return {x["nodeId"]: [x["ux"], _get(x, "uz", "uy"), _get(x, "ry", "rz")] for x in ds}
        return {x["nodeId"]: [x[k] for k in ("ux", "uy", "uz", "rx", "ry", "rz")] for x in ds}
    if kind in ("buckling", "modal"):
        key = "loadFactor" if kind == "buckling" else "omega"
        return dict(values=[m[key] for m in res["modes"]], modes=[node_vec(m["displacements"]) for m in res["modes"]])
    if kind == "pdelta":
        r = normalize_stabileo(res["results"], dim)
        r["converged"], r["stable"] = res["converged"], res["isStable"]
        return r
    comps = ("ux", "uz", "ry") if dim == 2 else ("ux", "uy", "uz", "rx", "ry", "rz")
    return dict(hist={h["nodeId"]: [list(u) for u in zip(*(h[c] for c in comps))] for h in res["nodeHistories"]})


def normalize_stabileo(res, dim):
    if dim == 2:
        disp = {x["nodeId"]: [x["ux"], _get(x, "uz", "uy"), _get(x, "ry", "rz")] for x in res["displacements"]}
        reac = {x["nodeId"]: [x["rx"], _get(x, "rz", "ry"), _get(x, "my", "mz")] for x in res["reactions"]}
        keys = ["nStart", "nEnd", "vStart", "vEnd", "mStart", "mEnd"]
    else:
        disp = {x["nodeId"]: [x[k] for k in ("ux", "uy", "uz", "rx", "ry", "rz")] for x in res["displacements"]}
        reac = {x["nodeId"]: [x[k] for k in ("fx", "fy", "fz", "mx", "my", "mz")] for x in res["reactions"]}
        keys = [f"{n}{s}" for n in ("n", "vy", "vz", "mx", "my", "mz") for s in ("Start", "End")]
    forces = {x["elementId"]: {k: x[k] for k in keys} for x in res["elementForces"]}
    diags = [d.get("code") for d in res.get("structuredDiagnostics", [])]
    return dict(disp=disp, reac=reac, forces=forces, diags=diags)


# ---------------------------------------------------------------- comparison

ILL_CONDITIONED = {"stiffness_not_positive_definite", "diagonal_regularization",
                   "cholesky_failed_lu_fallback",
                   "extremely_high_diagonal_ratio", "residual_high", "near_zero_diagonal"}


def compare(model, sres, ores, tol):
    """Return list of (quantity, id, component, stabileo, opensees, err) above
    tol, and the max normalized error per group. Errors are normalized by the
    largest magnitude of the same group in the model (scale-aware absolute
    error), so small components of large results do not produce noise."""
    dim = ores["dim"]
    nt = 2 if dim == 2 else 3
    groups = {}

    def scale(vals):
        return max([abs(v) for v in vals] + [1e-300])

    # displacements: translations and rotations separately
    tr = [v for u in ores["disp"].values() for v in u[:nt]]
    ro = [v for u in ores["disp"].values() for v in u[nt:]]
    rx = [v for u in ores["reac"].values() for v in u[:nt]]
    rm = [v for u in ores["reac"].values() for v in u[nt:]]
    ff, fm = [], []
    for fd in ores["forces"].values():
        for k, v in fd.items():
            (fm if k.startswith("m") else ff).append(v)
    # Scales: a group's largest magnitude, floored by the companion group
    # times the model's size (moments ~ forces x length, rotations ~
    # translations / length), so an all-zero group (e.g. the end moments of a
    # simply supported bar) does not turn round-off into a mismatch.
    xs = [c for p in model["nodes"].values() for c in (p["x"], p.get("y", 0.0), p.get("z", 0.0))]
    size = max(max(xs) - min(xs), 1e-12) if xs else 1.0
    f_sc = max(scale(rx), scale(ff), scale(rm) / size, scale(fm) / size)
    # Displacement floor: the stretch of the stiffest bar spanning the model
    # under the largest force (all-zero displacement fields otherwise
    # compare round-off against round-off).
    ea = max(m["e"] * 1000.0 for m in model["materials"].values()) * \
        max([s_["a"] for s_ in model["sections"].values()] +
            [p["thickness"] * size for k in ("plates", "quads") for p in (model.get(k) or {}).values()])
    u_floor = f_sc * size / ea
    sc = dict(ut=max(scale(tr), scale(ro) * size, u_floor), ur=max(scale(ro), scale(tr) / size, u_floor / size),
              rf=f_sc, rm=f_sc * size, ef=f_sc, em=f_sc * size)
    if f_sc < 1e-200 and sc["ut"] < 1e-200:
        return None, {}  # nothing loaded: every result is zero
    bad = []

    def chk(group, q, i, comp, a, b, s):
        err = abs(a - b) / s
        groups[group] = max(groups.get(group, 0.0), err)
        if err > tol:
            bad.append((q, i, comp, a, b, err))

    art = set(ores.get("art_rot", []))
    dn = ["ux", "uz", "ry"] if dim == 2 else ["ux", "uy", "uz", "rx", "ry", "rz"]
    for nid, uo in ores["disp"].items():
        us = sres["disp"].get(nid)
        if us is None:
            bad.append(("disp", nid, "missing", None, None, math.inf))
            continue
        for k, name in enumerate(dn):
            if k >= nt and nid in art:
                continue
            chk("disp_t" if k < nt else "disp_r", "disp", nid, name, us[k], uo[k],
                sc["ut"] if k < nt else sc["ur"])
    rn = ["rx", "rz", "my"] if dim == 2 else ["fx", "fy", "fz", "mx", "my", "mz"]
    for nid, ro_ in ores["reac"].items():
        rs = sres["reac"].get(nid)
        if rs is None:
            bad.append(("reac", nid, "missing", None, None, math.inf))
            continue
        for k, name in enumerate(rn):
            if k >= nt and nid in art:
                continue
            chk("reac_f" if k < nt else "reac_m", "reac", nid, name, rs[k], ro_[k],
                sc["rf"] if k < nt else sc["rm"])
    for eid, fo in ores["forces"].items():
        fs = sres["forces"].get(eid)
        if fs is None:
            bad.append(("force", eid, "missing", None, None, math.inf))
            continue
        for k, v in fo.items():
            m = k.startswith("m")
            chk("force_m" if m else "force_f", "force", eid, k, fs[k], v, sc["em"] if m else sc["ef"])
    return bad, groups


# Eigenvalue comparison. Load factors / circular frequencies are compared
# relatively; a mode shape only when its eigenvalue is separated from its
# neighbours by more than MAC_GAP (relative), where the eigenvector is well
# determined (perturbation ~ eigenvalue error / gap), as 1 - MAC.
MAC_GAP = 1e-3
MAC_TOL = 1e-6


def _mac(a, b, art, nt):
    va, vb = [], []
    for nid, ua in a.items():
        ub = b.get(nid)
        if ub is None:
            continue
        for k in range(len(ua)):
            if k >= nt and nid in art:
                continue
            va.append(ua[k])
            vb.append(ub[k])
    ab = sum(x * y for x, y in zip(va, vb))
    aa = sum(x * x for x in va)
    bb = sum(y * y for y in vb)
    return ab * ab / (aa * bb) if aa > 0 and bb > 0 else 0.0


def compare_eigen(sres, ores, tol, n_req, power):
    """(bad, groups) for buckling load factors / modal frequencies + MAC.

    Both solvers get the eigenvalues mu = 1/lambda of the inverted problem
    with an absolute error ~ eps*kappa*mu_1, so the relative error of the k-th
    eigenvalue grows like lambda_k / lambda_1: the tolerance is scaled by it
    (`power` 1 for load factors, 2 for circular frequencies, omega^2 being the
    eigenvalue)."""
    so, oo = sres["values"], ores["values"]
    nt = 2 if ores["dim"] == 2 else 3
    art = set(ores.get("art_rot", []))
    bad, groups = [], {"eig": 0.0, "mac": 0.0}
    n = min(n_req, len(oo))
    if len(so) < n:
        bad.append(("eig", len(so), "missing", len(so), n, math.inf))
    for i in range(min(n, len(so))):
        err = abs(so[i] - oo[i]) / max(abs(oo[i]), 1e-300) / max(1.0, abs(oo[i] / oo[0]) ** power)
        groups["eig"] = max(groups["eig"], err)
        if err > tol:
            bad.append(("eig", i + 1, "value", so[i], oo[i], err))
        nb = [oo[j] for j in (i - 1, i + 1) if 0 <= j < len(oo)]
        if i + 1 >= len(oo) or any(abs(v - oo[i]) <= MAC_GAP * abs(oo[i]) for v in nb):
            continue  # last known mode (gap unknown) or a cluster
        e = 1.0 - _mac(sres["modes"][i], ores["modes"][i], art, nt)
        groups["mac"] = max(groups["mac"], e)
        if e > MAC_TOL:
            bad.append(("mode", i + 1, "1-MAC", e, 0.0, e))
    return bad, groups


def compare_th(model, sres, ores, tol):
    """Displacement histories, normalized per group (translations, rotations)
    by the largest magnitude over all nodes and steps (rotations floored by
    translations / model size and vice versa, as in compare())."""
    nt = 2 if ores["dim"] == 2 else 3
    art = set(ores.get("art_rot", []))
    tr = [abs(v) for h in ores["hist"].values() for u in h for v in u[:nt]]
    ro = [abs(v) for nid, h in ores["hist"].items() if nid not in art for u in h for v in u[nt:]]
    xs = [c for p in model["nodes"].values() for c in (p["x"], p.get("y", 0.0), p.get("z", 0.0))]
    size = max(max(xs) - min(xs), 1e-12)
    st, sr = max(tr + [0.0]), max(ro + [0.0])
    sc_t, sc_r = max(st, sr * size, 1e-300), max(sr, st / size, 1e-300)
    if st == 0.0 and sr == 0.0:
        return None, {}
    bad, groups = [], {"th_t": 0.0, "th_r": 0.0}
    for nid, ho in ores["hist"].items():
        hs = sres["hist"].get(nid)
        if hs is None or len(hs) != len(ho):
            bad.append(("hist", nid, "missing", None, None, math.inf))
            continue
        for step, (us, uo) in enumerate(zip(hs, ho)):
            for k in range(len(uo)):
                if k >= nt and nid in art:
                    continue
                g = "th_t" if k < nt else "th_r"
                err = abs(us[k] - uo[k]) / (sc_t if k < nt else sc_r)
                groups[g] = max(groups[g], err)
                if err > tol:
                    bad.append(("hist", nid, f"step{step}.{k}", us[k], uo[k], err))
    return bad, groups


# Folded shells: different membrane formulations (see gen_models.shell).
# OpenSees' ShellMITC4 membrane is the plain bilinear one and locks in
# in-plane bending: on these cantilevers its lateral tip displacement is 5 %
# (coarse) to 70 % (refined 4x) of the converged value, which the engine's
# EAS-7 membrane is within a few percent of from the coarsest mesh. So the
# translations are only reported (max_err "disp_t", not a failure), and what
# is checked is the reaction resultant about the origin, which equilibrium
# fixes exactly for any formulation: it catches a lost, doubled or misdirected
# load (pressure normals, consistent nodal loads) and a wrong support.
SHELL_DISP_TOL = math.inf


def compare_shell(model, sres, ores, tol):
    keep = {k: ores[k] for k in ("dim", "art_rot")}
    trans = lambda dd: {n: u[:3] + [0.0] * 3 for n, u in dd.items()}  # noqa: E731
    o2 = dict(keep, disp=trans(ores["disp"]), reac={}, forces={})
    bad, groups = compare(model, dict(sres, disp=trans(sres["disp"]), reac={}, forces={}), o2, SHELL_DISP_TOL)
    groups.pop("disp_r", None)
    if bad is None:
        return None, {}

    def resultant(reac):
        f, mm = [0.0] * 3, [0.0] * 3
        for nid, r in reac.items():
            n = next(v for v in model["nodes"].values() if v["id"] == nid)
            p = (n["x"], n["y"], n["z"])
            mxyz = _cross(p, r[:3])
            for k in range(3):
                f[k] += r[k]
                mm[k] += r[3 + k] + mxyz[k]
        return f + mm
    rs, ro = resultant(sres["reac"]), resultant(ores["reac"])
    sc = max(max(abs(v) for v in ro[:3]), 1e-300)
    xs = [c for p in model["nodes"].values() for c in (p["x"], p["y"], p["z"])]
    size = max(xs) - min(xs)
    for k, name in enumerate(("Fx", "Fy", "Fz", "Mx", "My", "Mz")):
        err = abs(rs[k] - ro[k]) / (sc if k < 3 else sc * size)
        groups["resultant"] = max(groups.get("resultant", 0.0), err)
        if err > tol:
            bad.append(("resultant", 0, name, rs[k], ro[k], err))
    return bad, groups


# ---------------------------------------------------------------- driver

def prune_orphans(d):
    """Drop nodes no element references (and their supports/loads): the
    random generators leave stray nodes, which make both solvers singular."""
    used = set()
    for e in d["elements"].values():
        used.update((e["nodeI"], e["nodeJ"]))
    d["nodes"] = {k: n for k, n in d["nodes"].items() if n["id"] in used}
    d["supports"] = {k: s for k, s in d["supports"].items() if s["nodeId"] in used}
    d["loads"] = [l for l in d["loads"] if l["type"] != "nodal" or l["data"]["nodeId"] in used]
    return d


def opensees_worker(model):
    """OpenSees run in this process -> JSON-able dict. `model` is a stabileo
    model or a harness job ({"analysis": kind, "model": ..., spec})."""
    try:
        if "analysis" in model:
            d, spec = model["model"], dict(model)
            if "numModes" in spec:
                spec["numModes"] += 1  # one more: the gap above the last compared mode
            if spec["analysis"] == "th":
                d = dict(d, loads=[])
            if spec["analysis"] == "shell":
                r = opensees_3d(d)
            elif spec["analysis"] == "th" and spec.get("groundAccel") is not None and not _is_3d(d):
                r = _planar_th_in_3d(d, spec)
            else:
                r = (opensees_3d if _is_3d(d) else opensees_2d)(d, spec["analysis"], spec)
        else:
            r = opensees_3d(model) if _is_3d(model) else opensees_2d(model)
    except Unsupported as ex:
        return {"unsupported": str(ex)}
    except Exception as ex:  # noqa: OpenSees raises bare errors
        return {"failed": str(ex)[:300]}
    return {"ok": r}


def opensees_isolated(model):
    """Run OpenSees in a fresh interpreter. openseespy keeps global state that
    survives ops.wipe() (a 3D ndf=3 truss model corrupts later 2D truss
    models in the same process), and some failures abort the process."""
    p = subprocess.run([sys.executable, os.path.abspath(__file__), "--opensees-worker"],
                       input=json.dumps(model), capture_output=True, text=True)
    try:
        out = json.loads(p.stdout.strip().splitlines()[-1])
    except (json.JSONDecodeError, IndexError):
        return {"failed": f"OpenSees worker exit {p.returncode}: {p.stderr.strip()[-200:]}"}
    if "ok" not in out:
        return out
    r = out["ok"]
    _int_keys(r)
    return r


def _int_keys(r):
    """JSON turned the node / element id keys into strings."""
    for k in ("disp", "reac", "forces", "hist"):
        if k in r:
            r[k] = {int(i): v for i, v in r[k].items()}
    if "modes" in r:
        r["modes"] = [{int(i): v for i, v in m.items()} for m in r["modes"]]
    if "linear" in r:
        _int_keys(r["linear"])


# Models whose scaled stiffness condition number exceeds this are reported as
# ill-conditioned instead of compared (results carry < ~4 significant digits).
KAPPA_MAX = 1e12
# A model stabileo refuses whose OpenSees stiffness is better conditioned than
# this is a false rejection (the threshold of stabileo's singular-pivot test,
# engine/src/solver/definiteness.rs, cannot flag a regular model below it).
KAPPA_REGULAR = 1e10
# A model stabileo flags ill-conditioned whose OpenSees stiffness is better
# conditioned than this is a false warning.
KAPPA_WELL = 1e8
# OpenSees' own reasons for not taking a model that say it has no unique
# answer either: a load on a rotation nothing stiffens, a rotational mechanism.
REFUSED_TOO = ("nodal moment on a rotation-free", "rotational mechanism")


def classify_refusal(r, ores):
    """stabileo refused the static model in r ('stabileo_failed'); OpenSees'
    outcome for the same model decides whether that was right:

      refused       OpenSees finds no unique answer either (scaled condition
                    number above KAPPA_MAX, or its translator rejects the
                    model for the same reason): a correct refusal, not a
                    failure;
      false_reject  OpenSees' stiffness is regular (kappa < KAPPA_REGULAR):
                    flagged like a mismatch;
      stabileo_failed  anything in between, or OpenSees failed too.
    """
    kappa = ores.get("kappa")
    if "unsupported" in ores:
        if any(t in ores["unsupported"] for t in REFUSED_TOO):
            return dict(r, status="refused", why=r["why"] + [f"opensees: {ores['unsupported']}"])
        return dict(r, why=r["why"] + [f"opensees: unsupported ({ores['unsupported']})"])
    if "failed" in ores and "singular" in ores["failed"]:
        # OpenSees' own solve breaks down on the stiffness: no unique answer.
        return dict(r, status="refused", why=r["why"] + [f"opensees: {ores['failed']}"])
    if "failed" in ores or kappa is None:
        return r
    if kappa > KAPPA_MAX:
        return dict(r, status="refused", why=r["why"] + [f"opensees kappa={kappa:.1e}"], kappa=kappa)
    if kappa < KAPPA_REGULAR:
        return dict(r, status="false_reject", why=r["why"] + [f"opensees kappa={kappa:.1e}"], kappa=kappa)
    return dict(r, why=r["why"] + [f"opensees kappa={kappa:.1e}"], kappa=kappa)


def run_one(name, model, binary, tol, verbose, dump_dir=None):
    if "analysis" in model:
        return run_ext(name, model, binary, tol, dump_dir)
    dim = 3 if _is_3d(model) else 2
    why = check_supported_3d(model) if dim == 3 else check_supported_2d(model)
    if why:
        return dict(name=name, dim=dim, status="unsupported", why=why)
    try:
        sres = normalize_stabileo(stabileo(model, binary), dim)
    except RuntimeError as ex:
        r = classify_refusal(dict(name=name, dim=dim, status="stabileo_failed", why=[str(ex)[:200]]),
                             opensees_isolated(model))
        if r["status"] == "false_reject" and dump_dir:
            _dump(dump_dir, name, model)
        return r
    ill = sorted(set(sres["diags"]) & ILL_CONDITIONED)
    ores = opensees_isolated(model)
    if ill:
        # stabileo's warning is checked too: OpenSees must not find the same
        # stiffness well conditioned.
        kappa = ores.get("kappa")
        if kappa is not None and "failed" not in ores and "unsupported" not in ores and kappa < KAPPA_WELL:
            if dump_dir:
                _dump(dump_dir, name, model)
            return dict(name=name, dim=dim, status="false_warning", why=ill + [f"opensees kappa={kappa:.1e}"],
                        kappa=kappa)
        return dict(name=name, dim=dim, status="ill_conditioned",
                    why=ill + ([f"opensees kappa={kappa:.1e}"] if kappa is not None else []))
    if "unsupported" in ores:
        return dict(name=name, dim=dim, status="unsupported", why=[ores["unsupported"]])
    if "failed" in ores:
        return dict(name=name, dim=dim, status="opensees_failed", why=[ores["failed"]])
    kappa = ores.get("kappa")
    if kappa is not None and kappa > KAPPA_MAX:
        return dict(name=name, dim=dim, status="ill_conditioned", why=[f"kappa={kappa:.1e}"])
    # Forward error of a backward-stable solve ~ kappa * eps; allow 100x.
    tol = max(tol, 100 * 2.2e-16 * (kappa or 0.0))
    bad, groups = compare(model, sres, ores, tol)
    if bad is None:
        return dict(name=name, dim=dim, status="unloaded")
    r = dict(name=name, dim=dim, status="mismatch" if bad else "ok", max_err=groups, kappa=kappa, tol=tol,
             n_bad=len(bad), worst=sorted(bad, key=lambda b: -b[5])[:8])
    if bad and dump_dir:
        os.makedirs(dump_dir, exist_ok=True)
        with open(os.path.join(dump_dir, name.replace("/", "_") + ".json"), "w") as f:
            json.dump(model, f, indent=1)
    return r


def _dump(dump_dir, name, model):
    os.makedirs(dump_dir, exist_ok=True)
    with open(os.path.join(dump_dir, name.replace("/", "_") + ".json"), "w") as f:
        json.dump(model, f, indent=1)


def _probe_loads(d):
    """The model under a load on every translational DOF: the linear solve's
    conditioning diagnostics then expose mechanisms (an unloaded mechanism
    solves to zero without complaint)."""
    keys = ("fx", "fy", "fz") if _is_3d(d) else ("fx", "fz")
    zero = {k: 0.0 for k in ("fx", "fy", "fz", "mx", "my", "mz")} if _is_3d(d) else {"fx": 0.0, "fz": 0.0, "my": 0.0}
    loads = [{"type": "nodal", "data": dict(zero, nodeId=n["id"], **{k: 1.0 for k in keys})}
             for n in d["nodes"].values()]
    return dict(d, loads=loads)


def run_ext(name, job, binary, tol, dump_dir=None):
    """run_one for a buckling / modal / pdelta / th job."""
    kind, d = job["analysis"], job["model"]
    dim = 3 if _is_3d(d) else 2
    base = dict(name=name, dim=dim, analysis=kind)
    why = check_supported_3d(d) if dim == 3 else check_supported_2d(d)
    if why:
        return dict(base, status="unsupported", why=why)
    try:
        lin = normalize_stabileo(stabileo(_probe_loads(d) if kind in MASS_MODES else d, binary), dim)
    except RuntimeError as ex:
        r = classify_refusal(dict(base, status="stabileo_failed", why=[str(ex)[:200]]),
                             opensees_isolated(_probe_loads(d) if kind in MASS_MODES else d))
        if r["status"] == "false_reject" and dump_dir:
            _dump(dump_dir, name, job)
        return r
    # The static probe flags a mechanism or a near-singular stiffness: no
    # unique modes / load factors either, whatever the eigen solver then does.
    ill = sorted(set(lin["diags"]) & ILL_CONDITIONED)
    if ill:
        return dict(base, status="ill_conditioned", why=ill)
    try:
        sres = lin if kind == "shell" else normalize_ext(kind, stabileo_job(job, binary), dim)
    except RuntimeError as ex:
        ores = opensees_isolated(job)  # a model OpenSees cannot take either is not a failure
        if "unsupported" in ores:
            return dict(base, status="unsupported", why=[ores["unsupported"]])
        v = ores.get("values") or []
        if kind == "modal" and v and v[0] < 1e-3 * max(v):
            # A rigid-body mode (a member hanging on hinges, say): the static
            # probe does not load it, the eigenproblem finds it.
            return dict(base, status="ill_conditioned", why=[f"mechanism (OpenSees omega_1 = {v[0]:.1e})"])
        # A load factor above 1e9 is OpenSees' eigensolver on axial forces of
        # round-off size (1e-12 kN in buckling2d-744187), not a buckling load.
        if kind == "buckling" and "failed" not in ores and (not v or min(v) > 1e9) and \
                ("No compressed elements" in str(ex) or "No positive buckling load factors" in str(ex)):
            # Nothing buckles under this load (no member in compression, or
            # none whose compression reaches a free DOF): OpenSees' K + Kg
            # eigenproblem has no positive load factor either.
            return dict(base, status="not_applicable",
                        why=[str(ex)[:200], f"opensees: no load factor below 1e9 ({v[:2]})"])
        r = dict(base, status="stabileo_failed", why=[str(ex)[:200]])
        if kind == "buckling" and v and min(v) <= 1e9:
            r = dict(r, status="false_reject", why=r["why"] + [f"opensees load factors {v[:3]}"])
            if dump_dir:
                _dump(dump_dir, name, job)
        return r
    ores = opensees_isolated(job)
    if kind == "pdelta" and not (sres["converged"] and sres["stable"]):
        # Beyond the buckling load: no stable equilibrium to compare (the
        # engine flags it, or neither iteration converges).
        if sres["converged"] or "failed" in ores:
            return dict(base, status="unstable", why=["beyond buckling"])
        return dict(base, status="stabileo_failed", why=["P-Delta not converged"])
    if "unsupported" in ores:
        return dict(base, status="unsupported", why=[ores["unsupported"]])
    if "failed" in ores:
        return dict(base, status="opensees_failed", why=[ores["failed"]])
    kappa = ores.get("kappa")
    if kappa is not None and kappa > KAPPA_MAX:
        return dict(base, status="ill_conditioned", why=[f"kappa={kappa:.1e}"])
    tol = max(tol, 100 * 2.2e-16 * (kappa or 0.0))
    if kind in ("buckling", "modal"):
        bad, groups = compare_eigen(sres, ores, tol, job["numModes"], 1 if kind == "buckling" else 2)
        if kind == "buckling":
            # The linear solution Kg is built from: displacements and axial
            # forces (OpenSees' shears and moments include N*Kg*u by then).
            ol = dict(ores["linear"], reac={})
            ol["forces"] = {i: {k: v for k, v in f.items() if k[0] == "n"} for i, f in ol["forces"].items()}
            b2, g2 = compare(d, lin, ol, tol)
            bad += b2 or []
            groups.update({"lin_" + k: v for k, v in g2.items()})
    elif kind == "pdelta":
        bad, groups = compare(d, sres, ores, tol)
    elif kind == "shell":
        bad, groups = compare_shell(d, sres, ores, tol)
    else:
        bad, groups = compare_th(d, sres, ores, tol)
    if bad is None:
        return dict(base, status="unloaded")
    r = dict(base, status="mismatch" if bad else "ok", max_err=groups, kappa=kappa, tol=tol,
             n_bad=len(bad), worst=sorted(bad, key=lambda b: -b[5])[:8])
    if bad and dump_dir:
        _dump(dump_dir, name, job)
    return r


EXT_KINDS = ("buckling", "modal", "pdelta", "th")


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("files", nargs="*")
    ap.add_argument("--fixtures", action="store_true", help="all engine/tests/fixtures/*-input.json")
    ap.add_argument("--random2d", type=int, default=0)
    ap.add_argument("--random3d", type=int, default=0)
    ap.add_argument("--rich2d", type=int, default=0, help="gen_models.rich_2d models")
    ap.add_argument("--rich3d", type=int, default=0, help="gen_models.rich_3d models")
    ap.add_argument("--plates", type=int, default=0, help="gen_models.plate models (MITC4 / DKT bending)")
    ap.add_argument("--shells", type=int, default=0, help="gen_models.shell folded cantilevers (loose tolerance)")
    for kind in EXT_KINDS:
        for dim in ("2d", "3d"):
            ap.add_argument(f"--{kind}{dim}", type=int, default=0, help=f"gen_models.job('{kind}', {dim[0]}) jobs")
    ap.add_argument("--seed-start", type=int, default=0)
    ap.add_argument("--bin", default=os.environ.get("STABILEO_SOLVE_JSON", DEFAULT_BIN))
    ap.add_argument("--tol", type=float, default=1e-6)
    ap.add_argument("--report")
    ap.add_argument("--dump-dir")
    ap.add_argument("--opensees", metavar="FILE")
    ap.add_argument("--opensees-worker", action="store_true", help=argparse.SUPPRESS)
    ap.add_argument("-j", "--jobs", type=int, default=4, help="parallel model runs")
    ap.add_argument("-v", "--verbose", action="store_true")
    a = ap.parse_args()

    if a.opensees_worker:
        print("\n" + json.dumps(opensees_worker(json.load(sys.stdin))))
        return 0
    if a.opensees:
        print(json.dumps(opensees_worker(json.load(open(a.opensees))), indent=1))
        return 0
    if not os.path.exists(a.bin):
        print(f"solver binary not found: {a.bin}\n  cargo build --release --example solve_json", file=sys.stderr)
        return 2

    jobs = [(os.path.basename(f), json.load(open(f))) for f in a.files]
    if a.fixtures:
        for f in sorted(glob.glob(os.path.join(FIXTURES, "*-input.json"))):
            jobs.append((os.path.basename(f), json.load(open(f))))
    for kind, n in (("2d", a.random2d), ("3d", a.random3d)):
        for s in range(a.seed_start, a.seed_start + n):
            p = subprocess.run([a.bin, f"--gen{kind}", str(s)], capture_output=True, text=True, check=True)
            jobs.append((f"random{kind}-{s}", prune_orphans(json.loads(p.stdout))))
    import gen_models
    for kind, n, gen in (("2d", a.rich2d, gen_models.rich_2d), ("3d", a.rich3d, gen_models.rich_3d),
                         ("plate", a.plates, gen_models.plate)):
        for s in range(a.seed_start, a.seed_start + n):
            jobs.append((f"{'' if kind == 'plate' else 'rich'}{kind}-{s}", gen(s)))
    for kind in EXT_KINDS:
        for dim in (2, 3):
            for s in range(a.seed_start, a.seed_start + getattr(a, f"{kind}{dim}d")):
                jobs.append((f"{kind}{dim}d-{s}", gen_models.job(kind, dim, s)))
    for s in range(a.seed_start, a.seed_start + a.shells):
        jobs.append((f"shell-{s}", {"analysis": "shell", "model": gen_models.shell(s, 2)}))

    from concurrent.futures import ThreadPoolExecutor
    with ThreadPoolExecutor(max_workers=max(1, a.jobs)) as pool:
        results = list(pool.map(lambda j: run_one(j[0], j[1], a.bin, a.tol, a.verbose, a.dump_dir), jobs))
    for r in results:
        name = r["name"]
        if a.verbose or r["status"] in FLAGGED:
            extra = r.get("why") or {k: f"{v:.1e}" for k, v in r.get("max_err", {}).items()}
            print(f"{r['status']:16} {name}  {extra}")
            for w in r.get("worst", [])[:5] if r["status"] == "mismatch" else []:
                q, i, c, s_, o, e = w
                print(f"    {q} {i} {c}: stabileo={s_!r} opensees={o!r} err={e:.2e}")

    from collections import Counter
    cnt = Counter(r["status"] for r in results)
    by_cat = {}
    for r in results:
        cat = "files" if r["name"].endswith(".json") else r["name"].rsplit("-", 1)[0]
        by_cat.setdefault(cat, Counter())[r["status"]] += 1
    print()
    for cat, c_ in sorted(by_cat.items()):
        print(f"  {cat:12} {dict(c_)}")
    print("summary:", dict(cnt))
    ok = [r for r in results if r["status"] in ("ok", "mismatch")]
    if ok:
        g = {}
        for r in ok:
            for k, v in r["max_err"].items():
                g[k] = max(g.get(k, 0.0), v)
        print("max normalized error over compared models:", {k: f"{v:.2e}" for k, v in sorted(g.items())})
    for st in ("unsupported", "refused", "not_applicable", "false_reject", "stabileo_failed", "opensees_failed"):
        reasons = Counter(w[:120] for r in results if r["status"] == st for w in r["why"][:1])
        if reasons:
            print(f"{st} reasons:", dict(reasons))
    if a.report:
        with open(a.report, "w") as f:
            json.dump(results, f, indent=1, default=str)
    return 1 if any(cnt.get(st) for st in FLAGGED) else 0


# Statuses that fail the run (and are dumped): a disagreement, stabileo
# refusing a model OpenSees solves with a regular stiffness, or warning about
# one OpenSees finds well conditioned.
FLAGGED = ("mismatch", "false_reject", "false_warning")


if __name__ == "__main__":
    sys.exit(main())
