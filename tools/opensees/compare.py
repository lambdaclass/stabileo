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
unsupported (no clean OpenSees equivalent), stabileo_failed /
ill_conditioned (mechanisms and near-singular systems, where neither answer
is meaningful) or unloaded.

Exit status: 0 = no discrepancy above tolerance, 1 = discrepancies,
2 = harness error.

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
    for k in ("constraints", "connectors", "plates", "quads", "quad9s",
              "solidShells", "curvedShells", "curvedBeams"):
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
        if l["type"] not in ("nodal", "distributed", "pointOnElement"):
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


def opensees_2d(d):
    ops = _ops()
    nodes = {n["id"]: (float(n["x"]), float(_get(n, "z", "y"))) for n in d["nodes"].values()}
    mats = {m["id"]: m for m in d["materials"].values()}
    secs = {s["id"]: s for s in d["sections"].values()}
    elems = sorted(d["elements"].values(), key=lambda e: e["id"])
    has_frame = any(e["type"] == "frame" for e in elems)
    ndf = 3 if has_frame else 2

    ops.wipe()
    ops.model("basic", "-ndm", 2, "-ndf", ndf)
    for nid, (x, z) in sorted(nodes.items()):
        ops.node(nid, x, z)

    # Supports: the highest support id per node wins (DofNumbering::build_2d).
    sup_by_node = {}
    for s in sorted(d["supports"].values(), key=lambda s: s["id"]):
        sup_by_node[s["nodeId"]] = s

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
            if restrained(s, dof):
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
                        "-orient", c, s_, 0.0, -s_, c, 0.0)
        else:
            _, dof, k = sp
            ops.uniaxialMaterial("Elastic", g, k)
            ops.element("zeroLength", g, g, nid, "-mat", g, "-dir", dof + 1)
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
        if e["type"] == "truss":
            tag += 1
            ops.uniaxialMaterial("Elastic", tag, E)
            ops.element("Truss", e["id"], e["nodeI"], e["nodeJ"], sec["a"], tag)
            continue
        ops.geomTransf("Linear", e["id"])
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
            if sec.get("asY"):
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
            if ndf == 3 and abs(f[2]) > 0 and x["nodeId"] in art_rot:
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

    kappa = _analyze(ops, fixed)

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
            N = ops.eleResponse(e["id"], "axialForce")[0]
            fi, fj = truss_axial.get(e["id"], [0.0, 0.0])
            forces[e["id"]] = dict(nStart=N + fi, nEnd=N - fj, vStart=0.0, vEnd=0.0, mStart=0.0, mEnd=0.0)
        else:
            f = list(ops.eleResponse(pieces[e["id"]][0], "localForce"))[:3] + \
                list(ops.eleResponse(pieces[e["id"]][-1], "localForce"))[3:]
            forces[e["id"]] = dict(nStart=-f[0], nEnd=f[3], vStart=f[1], vEnd=-f[4], mStart=f[2], mEnd=-f[5])
    return dict(dim=2, disp=disp, reac=reac, forces=forces, art_rot=sorted(art_rot), kappa=kappa)


def _elem(d, eid):
    for e in d["elements"].values():
        if e["id"] == eid:
            return e
    raise KeyError(eid)


def opensees_3d(d):
    ops = _ops()
    nodes = {n["id"]: (float(n["x"]), float(n["y"]), float(n["z"])) for n in d["nodes"].values()}
    mats = {m["id"]: m for m in d["materials"].values()}
    secs = {s["id"]: s for s in d["sections"].values()}
    elems = sorted(d["elements"].values(), key=lambda e: e["id"])
    has_frame = any(e["type"] == "frame" for e in elems)
    ndf = 6 if has_frame else 3

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
    for nid, k, kv in springs:
        tag += 1
        ops.node(tag, *nodes[nid])
        ops.fix(tag, *([1] * ndf))
        ops.uniaxialMaterial("Elastic", tag, kv)
        ops.element("zeroLength", tag, tag, nid, "-mat", tag, "-dir", k + 1)
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
        if t == "nodal" or etype[x["elementId"]]["type"] == "truss":
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
    for e in elems:
        L, ex, ey, ez = geo[e["id"]]
        pi, pj = nodes[e["nodeI"]], nodes[e["nodeJ"]]
        m, sec = mats[e["materialId"]], secs[e["sectionId"]]
        E = m["e"] * 1000.0
        G = E / (2 * (1 + m["nu"]))
        if e["type"] == "truss":
            tag += 1
            ops.uniaxialMaterial("Elastic", tag, E)
            ops.element("Truss", e["id"], e["nodeI"], e["nodeJ"], sec["a"], tag)
            continue
        ops.geomTransf("Linear", e["id"], *ez)
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
            if sec.get("asY") or sec.get("asZ"):
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

    ops.timeSeries("Linear", 1)
    ops.pattern("Plain", 1, 1)
    for eid, w in uniform_loads.items():
        for sub in pieces[eid]:
            ops.eleLoad("-ele", sub, "-type", "-beamUniform", *w)

    for ld in d["loads"]:
        t, x = ld["type"], ld["data"]
        if t == "nodal":
            f = [x.get(k, 0.0) or 0.0 for k in ("fx", "fy", "fz", "mx", "my", "mz")]
            if x["nodeId"] in art_rot and any(abs(v) > 0 for v in f[3:]):
                raise Unsupported("nodal moment on a rotation-free node")
            add_nodal(x["nodeId"], f[:ndf])
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

    kappa = _analyze(ops, fixed)

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
            N = ops.eleResponse(e["id"], "axialForce")[0]
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
    return dict(dim=3, disp=disp, reac=reac, forces=forces, art_rot=sorted(art_rot), kappa=kappa)


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
        max(s_["a"] for s_ in model["sections"].values())
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
    """OpenSees run in this process -> JSON-able dict."""
    try:
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
    for k in ("disp", "reac", "forces"):
        r[k] = {int(i): v for i, v in r[k].items()}
    return r


# Models whose scaled stiffness condition number exceeds this are reported as
# ill-conditioned instead of compared (results carry < ~4 significant digits).
KAPPA_MAX = 1e12


def run_one(name, model, binary, tol, verbose, dump_dir=None):
    dim = 3 if _is_3d(model) else 2
    why = check_supported_3d(model) if dim == 3 else check_supported_2d(model)
    if why:
        return dict(name=name, dim=dim, status="unsupported", why=why)
    try:
        sres = normalize_stabileo(stabileo(model, binary), dim)
    except RuntimeError as ex:
        return dict(name=name, dim=dim, status="stabileo_failed", why=[str(ex)[:200]])
    ill = sorted(set(sres["diags"]) & ILL_CONDITIONED)
    if ill:
        return dict(name=name, dim=dim, status="ill_conditioned", why=ill)
    ores = opensees_isolated(model)
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


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("files", nargs="*")
    ap.add_argument("--fixtures", action="store_true", help="all engine/tests/fixtures/*-input.json")
    ap.add_argument("--random2d", type=int, default=0)
    ap.add_argument("--random3d", type=int, default=0)
    ap.add_argument("--rich2d", type=int, default=0, help="gen_models.rich_2d models")
    ap.add_argument("--rich3d", type=int, default=0, help="gen_models.rich_3d models")
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
    for kind, n, gen in (("2d", a.rich2d, gen_models.rich_2d), ("3d", a.rich3d, gen_models.rich_3d)):
        for s in range(a.seed_start, a.seed_start + n):
            jobs.append((f"rich{kind}-{s}", gen(s)))

    from concurrent.futures import ThreadPoolExecutor
    with ThreadPoolExecutor(max_workers=max(1, a.jobs)) as pool:
        results = list(pool.map(lambda j: run_one(j[0], j[1], a.bin, a.tol, a.verbose, a.dump_dir), jobs))
    for r in results:
        name = r["name"]
        if a.verbose or r["status"] == "mismatch":
            extra = r.get("why") or {k: f"{v:.1e}" for k, v in r.get("max_err", {}).items()}
            print(f"{r['status']:16} {name}  {extra}")
            for w in r.get("worst", [])[:5] if r["status"] == "mismatch" else []:
                q, i, c, s_, o, e = w
                print(f"    {q} {i} {c}: stabileo={s_!r} opensees={o!r} err={e:.2e}")

    from collections import Counter
    cnt = Counter(r["status"] for r in results)
    print("\nsummary:", dict(cnt))
    ok = [r for r in results if r["status"] in ("ok", "mismatch")]
    if ok:
        g = {}
        for r in ok:
            for k, v in r["max_err"].items():
                g[k] = max(g.get(k, 0.0), v)
        print("max normalized error over compared models:", {k: f"{v:.2e}" for k, v in sorted(g.items())})
    for st in ("unsupported",):
        reasons = Counter(w for r in results if r["status"] == st for w in r["why"])
        if reasons:
            print(f"{st} reasons:", dict(reasons))
    if a.report:
        with open(a.report, "w") as f:
            json.dump(results, f, indent=1, default=str)
    return 1 if cnt.get("mismatch") else 0


if __name__ == "__main__":
    sys.exit(main())
