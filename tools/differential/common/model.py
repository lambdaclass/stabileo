"""stabileo model I/O shared by the differential harnesses.

The conventions live in tools/opensees/compare.py (owned by the OpenSees
harness); this module imports them instead of re-deriving them, and adds what
the other translators need:

  * `members(model)`  -- geometry, local axes, material and section of every
    element, in the engine's units (E in kN/m^2, G = E / (2(1+nu))).
  * `nodalize(model)` -- the same structure with every member load other than
    a full-length uniform one moved to nodes inserted along the member (point
    loads exactly; partial / trapezoidal loads as three Gauss point loads,
    exact for the cubic end-response functions of Euler-Bernoulli and
    Timoshenko members). Reference programs whose own fixed-end forces are
    missing or wrong (Frame3DD's interior point loads, Kratos' beams) solve
    this model; stabileo solves the original.
"""

import copy
import math
import os
import subprocess
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, ".."))
REPO = os.path.abspath(os.path.join(ROOT, "..", ".."))
OPENSEES = os.path.join(REPO, "tools", "opensees")
if OPENSEES not in sys.path:
    sys.path.append(OPENSEES)  # gen_models (rich_2d / rich_3d)


def _load_opensees_compare():
    """tools/opensees/compare.py, loaded by path (a plain `import compare`
    would depend on sys.path order)."""
    import importlib.util
    spec = importlib.util.spec_from_file_location("opensees_compare", os.path.join(OPENSEES, "compare.py"))
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


_ops_compare = _load_opensees_compare()

local_axes_3d = _ops_compare.local_axes_3d
is_3d = _ops_compare._is_3d
prune_orphans = _ops_compare.prune_orphans
gauss_point_loads = _ops_compare._gauss_point_loads
ILL_CONDITIONED = _ops_compare.ILL_CONDITIONED

DIFF_SOLVE = os.environ.get("STABILEO_DIFF_SOLVE", os.path.join(REPO, "target", "release", "examples", "diff_solve"))


class Unsupported(Exception):
    """The model uses a feature the reference program cannot represent."""


def get(d, *keys, default=0.0):
    for k in keys:
        if k in d and d[k] is not None:
            return d[k]
    return default


def nodes_xyz(model):
    """{id: (x, y, z)}; 2D models map (x, z) to (x, 0, z)."""
    out = {}
    for n in model["nodes"].values():
        if is_3d(model):
            out[n["id"]] = (float(n["x"]), float(n["y"]), float(n["z"]))
        else:
            out[n["id"]] = (float(n["x"]), 0.0, float(get(n, "z", "y")))
    return out


def members(model):
    """{eid: dict(e, L, ex, ey, ez, E, G, nu, sec, mat, ni, nj)} for 3D models."""
    xyz = nodes_xyz(model)
    mats = {m["id"]: m for m in model["materials"].values()}
    secs = {s["id"]: s for s in model["sections"].values()}
    out = {}
    for e in model["elements"].values():
        pi, pj = xyz[e["nodeI"]], xyz[e["nodeJ"]]
        L = math.dist(pi, pj)
        ex, ey, ez = local_axes_3d(pi, pj, e)
        m = mats[e["materialId"]]
        E = m["e"] * 1000.0
        out[e["id"]] = dict(e=e, L=L, ex=ex, ey=ey, ez=ez, E=E, nu=m["nu"], G=E / (2 * (1 + m["nu"])),
                            sec=secs[e["sectionId"]], mat=m, ni=e["nodeI"], nj=e["nodeJ"], pi=pi, pj=pj)
    return out


def nodalize(model):
    """(model', info): `model` with interior member loads moved to inserted nodes.

    info = {"sub": {eid: [sub-element ids, start to end]}, "inserted": set of node ids}
    Full-length uniform distributed loads stay on every sub-member (uniform);
    nodal loads are unchanged. Releases stay on the original ends. 3D only.
    """
    if not is_3d(model):
        raise Unsupported("nodalize: 2D model")
    m2 = copy.deepcopy(model)
    mem = members(model)
    stations = {}   # eid -> [(pos, local [px, py, pz])]
    keep = []
    for ld in model["loads"]:
        t, x = ld["type"], ld["data"]
        if t == "nodal":
            keep.append(ld)
            continue
        if t not in ("distributed", "pointOnElement"):
            raise Unsupported(f"load {t}")
        eid = x["elementId"]
        L = mem[eid]["L"]
        if mem[eid]["e"]["type"] != "frame":
            raise Unsupported("member load on a truss")
        if t == "pointOnElement":
            if not (0 < x["a"] < L):
                raise Unsupported("point load at a member end")
            # px (axial) and _mglobal (a couple, global axes) come from lift_2d.
            stations.setdefault(eid, []).append((x["a"], [get(x, "px"), get(x, "py"), get(x, "pz")]
                                                 + list(x.get("_mglobal", (0.0, 0.0, 0.0)))))
            continue
        a = x.get("a") or 0.0
        b = x.get("b") if x.get("b") is not None else L
        q = {k: (get(x, f"q{k}I"), get(x, f"q{k}J")) for k in "XYZ"}
        full = abs(a) < 1e-12 and abs(b - L) < 1e-12 * max(L, 1)
        if full and all(q[k][0] == q[k][1] for k in "XYZ"):
            keep.append(ld)  # uniform: rewritten per sub-member below
            continue
        for k, comp in (("X", 0), ("Y", 1), ("Z", 2)):
            qi, qj = q[k]
            if qi == 0 and qj == 0:
                continue
            for p, xa in gauss_point_loads(qi, qj, a, b):
                f = [0.0] * 6
                f[comp] = p
                stations.setdefault(eid, []).append((xa, f))
    m2["loads"] = []
    max_node = max(n["id"] for n in model["nodes"].values())
    max_elem = max(e["id"] for e in model["elements"].values())
    info = {"sub": {}, "inserted": set()}
    for eid, mm in sorted(mem.items()):
        if eid not in stations:
            info["sub"][eid] = [eid]
            continue
        st = []
        for pos, f in sorted(stations[eid], key=lambda s: s[0]):
            f = list(f) + [0.0] * (6 - len(f))
            if st and abs(pos - st[-1][0]) <= 1e-9 * mm["L"]:
                st[-1][1] = [st[-1][1][k] + f[k] for k in range(6)]
            else:
                st.append([pos, list(f)])
        e0 = m2["elements"].pop(str(eid)) if str(eid) in m2["elements"] else \
            m2["elements"].pop(next(k for k, v in m2["elements"].items() if v["id"] == eid))
        chain = [mm["ni"]]
        for pos, f in st:
            max_node += 1
            p = [mm["pi"][k] + pos * mm["ex"][k] for k in range(3)]
            m2["nodes"][str(max_node)] = {"id": max_node, "x": p[0], "y": p[1], "z": p[2]}
            info["inserted"].add(max_node)
            g = [f[0] * mm["ex"][k] + f[1] * mm["ey"][k] + f[2] * mm["ez"][k] for k in range(3)]
            m2["loads"].append({"type": "nodal", "data": {"nodeId": max_node, "fx": g[0], "fy": g[1], "fz": g[2],
                                                          "mx": f[3], "my": f[4], "mz": f[5]}})
            chain.append(max_node)
        chain.append(mm["nj"])
        subs = []
        for k in range(len(chain) - 1):
            max_elem += 1
            se = dict(e0)
            se["id"], se["nodeI"], se["nodeJ"] = max_elem, chain[k], chain[k + 1]
            # Sub-members keep the parent's local axes: an explicit local-y
            # vector (or the parent's roll) reproduces them exactly.
            se.pop("rollAngle", None)
            se["localYx"], se["localYy"], se["localYz"] = mm["ey"]
            for r in ("releaseMyStart", "releaseMzStart", "releaseTStart", "hingeStart"):
                if k > 0:
                    se.pop(r, None)
            for r in ("releaseMyEnd", "releaseMzEnd", "releaseTEnd", "hingeEnd"):
                if k < len(chain) - 2:
                    se.pop(r, None)
            m2["elements"][str(max_elem)] = se
            subs.append(max_elem)
        info["sub"][eid] = subs
    for ld in keep:
        if ld["type"] == "nodal":
            m2["loads"].append(ld)
        else:
            for sid in info["sub"][ld["data"]["elementId"]]:
                d = dict(ld["data"])
                d["elementId"] = sid
                d.pop("a", None)
                d.pop("b", None)
                m2["loads"].append({"type": "distributed", "data": d})
    return m2, info


_STATIONS = (0.2, 0.4, 0.6, 0.8)
_SHIFTS = (0.0, 0.03, -0.03, 0.06, -0.06, 0.09, -0.09)


def _solve4(a, b):
    """x with a x = b for a 4x4 system (Gaussian elimination, partial pivoting)."""
    a = [list(r) + [v] for r, v in zip(a, b)]
    for i in range(4):
        p = max(range(i, 4), key=lambda r: abs(a[r][i]))
        a[i], a[p] = a[p], a[i]
        for r in range(i + 1, 4):
            c = a[r][i] / a[i][i]
            a[r] = [x - c * y for x, y in zip(a[r], a[i])]
    x = [0.0] * 4
    for i in range(3, -1, -1):
        x[i] = (a[i][4] - sum(a[i][k] * x[k] for k in range(i + 1, 4))) / a[i][i]
    return x


def moment_point_loads(model):
    """Every interior member load as point loads at four stations of the
    member with the same moments of order 0..3 about its start.

    A member's end displacements depend on a load only through its work
    against the end-response functions (cubic for the Euler-Bernoulli
    element, linear axially), i.e. through those four moments, so this is
    exact for the original nodes (Euler-Bernoulli and Timoshenko, with or
    without releases: all have cubic end responses). The stations are well spaced (0.2 L ..
    0.8 L, shifted to stay clear of point loads): common.model.nodalize's
    three Gauss points per load put stations as close as 0.11 (b - a) for a
    load on [a, b], and CalculiX's solver loses digits on very short U1
    pieces (12EI/L^3): a 1.9 mm piece next to a point load on a 5.37 m
    member gave 1.2e-6 (building_ccx-25) against stabileo, PyNite and
    Frame3DD agreeing to 1e-13, short partial loads gave up to 4e-7
    (frame2d_ccx-5002, frame3d_ccx-5165), and two point loads 8.7 mm apart
    on a 3.56 m member gave 1.13e-6 (rich3d_ccx-748362, issue #564).
    """
    m = copy.deepcopy(model)
    mem = members(m)
    points = {}
    loads, member_loads = [], {}
    for ld in m["loads"]:
        t, x = ld["type"], ld["data"]
        if t == "distributed":
            member_loads.setdefault(x["elementId"], []).append((t, x))
        elif t == "pointOnElement":
            eid = x["elementId"]
            L = mem[eid]["L"]
            if 0 < x["a"] < L and mem[eid]["e"]["type"] == "frame":
                member_loads.setdefault(eid, []).append((t, x))
            else:
                points.setdefault(eid, []).append(x["a"] / L if L > 0 else 0.0)
                loads.append(ld)
        else:
            loads.append(ld)
    for eid, xs in sorted(member_loads.items()):
        L = mem[eid]["L"]
        pts = points.get(eid, [])

        def clearance(dlt):
            st = [f + dlt for f in _STATIONS]
            return min(abs(f - q) for f in st for q in pts + [0.0, 1.0])

        dlt = max(_SHIFTS, key=clearance)
        st = [(f + dlt) * L for f in _STATIONS]
        A = [[x ** k for x in st] for k in range(4)]
        acc = [[0.0, 0.0, 0.0] for _ in st]
        for t, x in xs:
            if t == "pointOnElement":
                xp = x["a"]
                for c, comp in (("x", 0), ("y", 1), ("z", 2)):
                    p = get(x, f"p{c}")
                    if p != 0:
                        mom = [p * xp ** k for k in range(4)]
                        for s_, v in zip(range(4), _solve4(A, mom)):
                            acc[s_][comp] += v
                # _mglobal (0, -my2d, 0) from lift_2d: work against theta_y = -dw/dx.
                mg = x.get("_mglobal")
                if mg and mg[1] != 0:
                    my3d = float(mg[1])
                    mom_z = [k * (-my3d) * xp ** (k - 1) if k > 0 else 0.0 for k in range(4)]
                    for s_, v in zip(range(4), _solve4(A, mom_z)):
                        acc[s_][2] += v
                continue
            a = x.get("a") or 0.0
            b = x.get("b") if x.get("b") is not None else L
            for c, comp in (("X", 0), ("Y", 1), ("Z", 2)):
                qi, qj = get(x, f"q{c}I"), get(x, f"q{c}J")
                if qi == 0 and qj == 0:
                    continue
                # Moments of the linear load (3 Gauss points: exact to degree 5).
                mom = [sum(p * xp ** k for p, xp in gauss_point_loads(qi, qj, a, b)) for k in range(4)]
                for s_, v in zip(range(4), _solve4(A, mom)):
                    acc[s_][comp] += v
        for pos, (px, py, pz) in zip(st, acc):
            loads.append({"type": "pointOnElement", "data": {"elementId": eid, "a": pos, "px": px, "py": py, "pz": pz}})
    m["loads"] = loads
    return m


# ---------------------------------------------------------------- stabileo

def stabileo(model, analysis="static", binary=None, **opts):
    """Run engine/examples/diff_solve.rs; returns the parsed JSON or raises
    RuntimeError with the engine's message."""
    import json
    args = [binary or DIFF_SOLVE, "--analysis", analysis]
    for k, v in opts.items():
        args += ["--" + k.replace("_", "-"), json.dumps(v) if isinstance(v, dict) else str(v)]
    p = subprocess.run(args, input=json.dumps(model), capture_output=True, text=True)
    try:
        out = json.loads(p.stdout)
    except json.JSONDecodeError:
        raise RuntimeError(f"stabileo: bad output (exit {p.returncode}): {p.stderr[-400:]}")
    if isinstance(out, dict) and "error" in out:
        raise RuntimeError("stabileo: " + out["error"])
    return out


def normalize_static(res, dim):
    """stabileo AnalysisResults -> the harness shape (disp/reac/forces/diags)."""
    return _ops_compare.normalize_stabileo(res, dim)


def normalize_modal(res, dim=3):
    """stabileo ModalResult3D -> {"freqs": [Hz], "shapes": [{node: [6]}]}."""
    freqs, shapes = [], []
    for m in res["modes"]:
        freqs.append(m["frequency"])
        if dim == 3:
            shapes.append({d["nodeId"]: [d[k] for k in ("ux", "uy", "uz", "rx", "ry", "rz")] for d in m["displacements"]})
        else:
            shapes.append({d["nodeId"]: [d["ux"], 0.0, get(d, "uz", "uy"), 0.0, get(d, "ry", "rz"), 0.0]
                           for d in m["displacements"]})
    return {"freqs": freqs, "shapes": shapes}


# ---------------------------------------------------------------- 2D -> 3D

_SUP2D = {  # 2D support type -> restrained (ux, uz, ry)
    "fixed": (1, 1, 1), "pinned": (1, 1, 0), "rollerX": (0, 1, 0), "rollerY": (1, 0, 0), "rollerZ": (1, 0, 0),
    "guidedX": (0, 1, 1), "guidedY": (1, 0, 1), "guidedZ": (1, 0, 1),
}


def lift_2d(model, allow_hinges=False):
    """A 2D model (x, z plane) as the equivalent 3D model in the global XZ
    plane, out-of-plane DOFs (uy, rx, rz) fixed at every node.

    2D ry is counter-clockwise in the (x right, z up) view, a rotation about
    -Y: ry2d = -ry3d, my2d = -my3d. Every member gets localY = +Y, so its 3D
    local z is the 2D local y (the perpendicular load direction) and 2D
    bending is 3D bending about local y (Iy := iz, asY := asY). End forces
    map as n = n, v = vz, m = -my. With `allow_hinges`, trusses stay trusses,
    hinges become releaseMy and springs (kx, ky vertical, kz rotational; no
    angle) become 3D springs. Inclined rollers, rotated springs, thermal
    loads and constraints raise Unsupported.
    """
    if is_3d(model):
        return model
    m3 = {"nodes": {}, "materials": copy.deepcopy(model["materials"]), "sections": {}, "elements": {},
          "supports": {}, "loads": [], "_lift2d": True}
    for k, n in model["nodes"].items():
        m3["nodes"][k] = {"id": n["id"], "x": float(n["x"]), "y": 0.0, "z": float(get(n, "z", "y"))}
    for k, sct in model["sections"].items():
        t = {"id": sct["id"], "a": sct["a"], "iy": sct["iz"], "iz": sct["iz"], "j": 2 * sct["iz"]}
        if sct.get("asY"):
            t["asY"] = sct["asY"]
        m3["sections"][k] = t
    for k, e in model["elements"].items():
        if not allow_hinges and (e["type"] != "frame" or e.get("hingeStart") or e.get("hingeEnd")):
            raise Unsupported("2D truss / hinge")
        if e["type"] not in ("frame", "truss"):
            raise Unsupported(f"2D element {e['type']}")
        t = {"id": e["id"], "type": e["type"], "nodeI": e["nodeI"], "nodeJ": e["nodeJ"],
             "materialId": e["materialId"], "sectionId": e["sectionId"]}
        if e["type"] == "frame":
            t.update(localYx=0.0, localYy=1.0, localYz=0.0)
            if e.get("hingeStart"):
                t["releaseMyStart"] = True
            if e.get("hingeEnd"):
                t["releaseMyEnd"] = True
        m3["elements"][k] = t
    for s_ in model["supports"].values():
        if s_["type"] == "spring" and allow_hinges and not s_.get("angle"):
            pass
        elif s_["type"] not in _SUP2D:
            raise Unsupported(f"2D support {s_['type']}")
    # Shared plain rigid supports OR-merged, as DofNumbering::build_2d.
    sup = _ops_compare.supports_by_node_2d(model["supports"])
    for n in model["nodes"].values():
        s_ = sup.get(n["id"])
        r = _SUP2D.get(s_["type"], (0, 0, 0)) if s_ else (0, 0, 0)
        t = {"nodeId": n["id"], "rx": bool(r[0]), "ry": True, "rz": bool(r[1]),
             "rrx": True, "rry": bool(r[2]), "rrz": True}
        if s_ and s_["type"] == "spring":
            for k2, k3 in (("kx", "kx"), ("ky", "kz"), ("kz", "kry")):
                if s_.get(k2):
                    t[k3] = s_[k2]
        if s_:
            # Settlements act on restrained DOFs only (as in the engine).
            for d2, d3, k, sg in (("dx", "dx", 0, 1), ("dz", "dz", 1, 1), ("dy", "dz", 1, 1),
                                  ("dry", "dry", 2, -1), ("drz", "dry", 2, -1)):
                if s_.get(d2) and r[k]:
                    t[d3] = sg * s_[d2]
        m3["supports"][str(len(m3["supports"]) + 1)] = t
    for ld in model["loads"]:
        x = ld["data"]
        if ld["type"] == "nodal":
            m3["loads"].append({"type": "nodal", "data": {"nodeId": x["nodeId"], "fx": get(x, "fx"), "fy": 0.0,
                                "fz": get(x, "fz", "fy"), "mx": 0.0, "my": -get(x, "my", "mz"), "mz": 0.0}})
        elif ld["type"] == "distributed":
            d = {"elementId": x["elementId"], "qYI": 0.0, "qYJ": 0.0, "qZI": x["qI"], "qZJ": x["qJ"]}
            for k in ("a", "b"):
                if x.get(k) is not None:
                    d[k] = x[k]
            m3["loads"].append({"type": "distributed", "data": d})
        elif ld["type"] == "pointOnElement":
            d = {"elementId": x["elementId"], "a": x["a"], "py": 0.0, "pz": x["p"], "px": get(x, "px")}
            if get(x, "my", "mz"):
                d["_mglobal"] = (0.0, -get(x, "my", "mz"), 0.0)
            m3["loads"].append({"type": "pointOnElement", "data": d})
        else:
            raise Unsupported(f"2D load {ld['type']}")
    return m3


def lower_static_3d(res3, model2d):
    """3D reference results of a lifted model -> the 2D harness shape."""
    disp = {n: [u[0], u[2], -u[4]] for n, u in res3["disp"].items()}
    supported = {s_["nodeId"] for s_ in model2d["supports"].values()}
    reac = {n: [r[0], r[2], -r[4]] for n, r in res3["reac"].items() if n in supported}
    forces = {e: {"nStart": f["nStart"], "nEnd": f["nEnd"], "vStart": f["vzStart"], "vEnd": f["vzEnd"],
                  "mStart": -f["myStart"], "mEnd": -f["myEnd"]} for e, f in res3["forces"].items()}
    return dict(dim=2, disp=disp, reac=reac, forces=forces, art_rot=res3.get("art_rot", []), kappa=res3.get("kappa"),
                kappa_solved=res3.get("kappa_solved"), min_pivot=res3.get("min_pivot"))


def _rank3(vs, tol=1e-9):
    basis = []
    for v in vs:
        w = list(v)
        for b in basis:
            d = sum(w[k] * b[k] for k in range(3))
            w = [w[k] - d * b[k] for k in range(3)]
        n = math.sqrt(sum(x * x for x in w))
        if n > tol:
            basis.append([x / n for x in w])
    return len(basis)


def rotational_rank(model, flags, springs):
    """({node: rank}, art_rot) of the rotational stiffness at each node of a
    3D model (as tools/opensees/compare.py): frame ends contribute their
    local axes whose moment (torsion: ex) is not released, rotational
    restraints / springs their global axes. Rank 0 nodes (truss-only, all
    released) are returned in art_rot: the engine puts a tiny artificial
    spring there and their rotations are not compared. A partial rank is a
    rotational mechanism: Unsupported."""
    mem = members(model)
    dirs = {n["id"]: [] for n in model["nodes"].values()}
    for m in mem.values():
        e = m["e"]
        if e["type"] != "frame":
            continue
        for nid, end in ((m["ni"], "Start"), (m["nj"], "End")):
            # Torsion released at either end leaves no torsional stiffness
            # at both ends (bending released at one end still couples the
            # other end).
            if not (e.get("releaseTStart") or e.get("releaseTEnd")):
                dirs[nid].append(m["ex"])
            if not e.get("releaseMy" + end):
                dirs[nid].append(m["ey"])
            if not e.get("releaseMz" + end):
                dirs[nid].append(m["ez"])
    for nid in dirs:
        for k in range(3):
            if flags.get(nid, [False] * 6)[3 + k] or springs.get(nid, {}).get(3 + k):
                dirs[nid].append([1.0 if i == k else 0.0 for i in range(3)])
    rank = {nid: _rank3(v) for nid, v in dirs.items()}
    art = {nid for nid, r in rank.items() if r == 0}
    if model.get("_lift2d"):
        # A lifted 2D model (lift_2d) restrains rx and rz everywhere; its 2D
        # rotation is ry. The 2D engine puts the artificial spring on ry of
        # a node where every frame is hinged (or only trusses meet): such a
        # node has no ry stiffness from members, restraints or springs.
        for nid, v in dirs.items():
            if all(abs(d[1]) < 1e-12 for d in v):
                art.add(nid)
                rank[nid] = 0
    bad = [nid for nid, r in rank.items() if 0 < r < 3]
    if bad:
        raise Unsupported(f"rotational mechanism at node {bad[0]}")
    return rank, art


# ---------------------------------------------------------------- isolation

def run_isolated(script, payload, timeout=900):
    """Run `script --worker` in a fresh interpreter with `payload` (JSON) on
    stdin; returns its JSON reply. Python reference programs run this way:
    they print, keep global state, and hold the GIL."""
    import json
    p = subprocess.run([sys.executable, "-I", script, "--worker"], input=json.dumps(payload),
                       capture_output=True, text=True, timeout=timeout)
    lines = p.stdout.strip().splitlines()
    try:
        out = json.loads(lines[-1])
    except (json.JSONDecodeError, IndexError):
        raise RuntimeError(f"{os.path.basename(script)} worker exit {p.returncode}: {p.stderr.strip()[-300:]}")
    if "unsupported" in out:
        raise Unsupported(out["unsupported"])
    if "error" in out:
        raise RuntimeError(out["error"])
    return out["ok"]


def worker_main(fn):
    """Body of a `--worker` process: payload from stdin, fn(**payload) ->
    one JSON line on stdout (dict keys become strings)."""
    import json
    import traceback
    payload = json.load(sys.stdin)
    try:
        out = {"ok": fn(**payload)}
    except Unsupported as ex:
        out = {"unsupported": str(ex)}
    except Exception as ex:  # noqa: report any failure to the parent
        out = {"error": f"{type(ex).__name__}: {ex} {traceback.format_exc()[-400:]}"}
    print("\n" + json.dumps(out, default=float))


def int_keys(res):
    """JSON round trip turns node / element ids into strings: undo it."""
    for k in ("disp", "reac", "forces"):
        if k in res:
            res[k] = {int(i): v for i, v in res[k].items()}
    if "shapes" in res:
        res["shapes"] = [{int(i): v for i, v in s.items()} for s in res["shapes"]]
    return res


def nodes_inside_members(model, rel=1e-9):
    """[(node, element)] with the node on the element's segment (excluding its
    ends). stabileo does not connect such a node to the member; programs that
    split members at nodes (PyNite's physical members) would."""
    xyz = nodes_xyz(model)
    out = []
    for e in model["elements"].values():
        pi, pj = xyz[e["nodeI"]], xyz[e["nodeJ"]]
        d = [pj[k] - pi[k] for k in range(3)]
        L2 = sum(x * x for x in d)
        if L2 == 0:
            continue
        L = math.sqrt(L2)
        for nid, p in xyz.items():
            if nid in (e["nodeI"], e["nodeJ"]):
                continue
            t = sum((p[k] - pi[k]) * d[k] for k in range(3)) / L2
            if not (0 < t < 1):
                continue
            q = [pi[k] + t * d[k] - p[k] for k in range(3)]
            if math.sqrt(sum(x * x for x in q)) <= 1e-6 * (1 + L):
                out.append((nid, e["id"]))
    return out
