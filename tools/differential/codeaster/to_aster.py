"""stabileo SolverInput3D JSON -> self-contained Code_Aster command file.

`translate(model)` returns (comm, meta). `comm` is a Python command file
(the mesh is embedded in ASTER format) that runs a linear static analysis
and writes the raw nodal / element fields as JSON to the path in the global
`OUT_PATH`; it runs under `run_aster` (standalone, see the header it writes)
or in a batch (aster_batch.py exec's many of them in one Code_Aster
session). `meta` tells `postprocess(meta, raw)` how to map those fields back
onto stabileo's nodes, reactions and member end forces.

Element pairs (see README.md for the justification of each):

  frame, no shear area     POU_D_E   (Euler-Bernoulli, exact stiffness)
  frame with asY/asZ       POU_D_T   (Timoshenko, exact stiffness),
                           AZ = A/asY, AY = A/asZ (the engine pairs asY with Iy)
  truss                    BARRE
  support springs          DIS_TR / DIS_T on a POI1 cell, K_TR_D_N global
  connectors               DIS_TR on a SEG2 cell (ported from
                           element/connector.rs): zero-length K_TR_D_L in the
                           connector's local axes; finite-length the full
                           global K_TR_L (shear at the midpoint via rigid arms)
  releases (My, Mz, T)     the released end on its own node, tied to the
                           joint by LIAISON_DDL on the three translations and
                           on the local rotation components that are not
                           released (any axes, skew or not); torsion released
                           at both ends is released at the start only (same
                           zero torque, no rigid twist mode)
  supports                 DDL_IMPO (settlements as imposed values);
                           inclined: LIAISON_DDL n.u = 0
  constraints              LIAISON_DDL rows built from the documented
                           kinematics (constraints.rs), never from the
                           engine's transform
  member loads             members are split at load stations; distributed
                           loads as FORCE_POUTRE (local axes; trapezoids as
                           functions of the position, which Code_Aster
                           integrates exactly for linear variation); point
                           loads as nodal forces at station nodes
  thermal                  PRE_EPSI: EPX = a.dTu, KY = a.dTz/hz,
                           KZ = a.dTy/hy (engine: a = 12e-6, h = sqrt(12 I/A);
                           Code_Aster: dthy/dx = KY, dthz/dx = KZ); the
                           initial strain is subtracted from Code_Aster's
                           member forces, which omit it
"""

import math

ALPHA = 12e-6  # engine's thermal expansion coefficient (fef_thermal_3d callers)
FLAGS = ["rx", "ry", "rz", "rrx", "rry", "rrz"]
SPRINGS = ["kx", "ky", "kz", "krx", "kry", "krz"]
PRESC = ["dx", "dy", "dz", "drx", "dry", "drz"]
DDL = ["DX", "DY", "DZ", "DRX", "DRY", "DRZ"]
FORCE_KEYS = ["FX", "FY", "FZ", "MX", "MY", "MZ"]


class Unsupported(Exception):
    """Model uses a feature without a clean Code_Aster equivalent here."""


# ---------------------------------------------------------------- geometry

def _cross(a, b):
    return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]


def _dot(a, b):
    return sum(x * y for x, y in zip(a, b))


def _norm(v):
    return math.sqrt(_dot(v, v))


def _unit(v):
    n = _norm(v)
    return [x / n for x in v]


def local_axes_3d(pi, pj, elem):
    """Port of element/transform.rs compute_local_axes_3d (right-handed)."""
    ex = _unit([pj[k] - pi[k] for k in range(3)])
    ly = (elem.get("localYx"), elem.get("localYy"), elem.get("localYz"))
    ref = None
    if all(v is not None for v in ly) and _norm(ly) > 1e-10:
        ref = _unit(list(ly))
    if ref is None:
        up = [1.0, 0.0, 0.0] if abs(ex[2]) > 0.999 else [0.0, 0.0, 1.0]
        d = _dot(ex, up)
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


def connector_axes(pi, pj):
    """Port of element/connector.rs connector_stiffness_3d's axes: x along
    the connector ([1,0,0] when zero-length), y = ref x dir, z = dir x y."""
    v = [pj[k] - pi[k] for k in range(3)]
    n = _norm(v)
    dx = [x / n for x in v] if n > 1e-12 else [1.0, 0.0, 0.0]
    ref = [1.0, 0.0, 0.0] if abs(dx[0]) < 0.9 else [0.0, 1.0, 0.0]
    dy = _unit(_cross(ref, dx))
    dz = _cross(dx, dy)
    return dx, dy, dz, n


# element/connector.rs CONNECTOR_SHEAR_POSITION: where the shear springs of a
# finite-length connector act, as a fraction of its length from node i.
CONNECTOR_SHEAR_POSITION = 0.5


def connector_matrix(kv, ex, ey, ez, length):
    """Port of element/connector.rs connector_stiffness_3d: global 12x12
    stiffness over [u_i, theta_i, u_j, theta_j], the sum of k * b b^T over the
    spring compatibility rows b. kv = (axial, shear y, shear z, torsion,
    bend y, bend z) in the connector axes ex, ey, ez."""
    a = CONNECTOR_SHEAR_POSITION

    def trans(e, arm):
        b = [0.0] * 12
        for p in range(3):
            b[p] = -e[p]
            b[3 + p] = a * length * arm[p]
            b[6 + p] = e[p]
            b[9 + p] = (1.0 - a) * length * arm[p]
        return b

    def rot(e):
        b = [0.0] * 12
        for p in range(3):
            b[3 + p] = -e[p]
            b[9 + p] = e[p]
        return b

    rows = [trans(ex, [0.0, 0.0, 0.0]), trans(ey, [-v for v in ez]), trans(ez, ey),
            rot(ex), rot(ey), rot(ez)]
    k = [[0.0] * 12 for _ in range(12)]
    for kk, b in zip(kv, rows):
        if kk:
            for i in range(12):
                if b[i]:
                    for j in range(12):
                        k[i][j] += kk * b[i] * b[j]
    return k


def _rank(rows, tol=1e-10):
    """Rank of a list of sparse rows {column: coefficient} (Gaussian
    elimination with partial pivoting, tolerance relative to each row)."""
    rows = [dict(r) for r in rows if r]
    rank = 0
    while rows:
        r = rows.pop()
        scale = max((abs(v) for v in r.values()), default=0.0)
        if scale == 0.0:
            continue
        col, piv = max(r.items(), key=lambda kv: abs(kv[1]))
        if abs(piv) <= tol * scale:
            continue
        rank += 1
        nxt = []
        for o in rows:
            f = o.get(col, 0.0) / piv
            if f:
                o = {c: o.get(c, 0.0) - f * r.get(c, 0.0) for c in set(o) | set(r)}
                big = max((abs(v) for v in o.values()), default=0.0)
                o = {c: v for c, v in o.items() if abs(v) > tol * max(big, scale)}
            nxt.append(o)
        rows = nxt
    return rank


def constraints_redundant(mpcs, fixed, inclined):
    """True when the constraint rows together with the support rows on the
    DOFs they touch are linearly dependent (some equation is implied by the
    others, so a multiplier is not determined)."""
    eqs = [{(n, k): c for n, k, c in row} for row in mpcs if row]
    if not eqs:
        return False
    cols = {key for e in eqs for key in e}
    sup = []
    for n, k in sorted(cols):
        if (fixed.get(n) or [False] * 6)[k]:
            sup.append({(n, k): 1.0})
    for n in sorted({n for n, k in cols if k < 3 and n in inclined}):
        sup.append({(n, k): inclined[n][k] for k in range(3) if abs(inclined[n][k]) > 0.0})
    rows = sup + eqs
    return _rank(rows) < len(rows)


def rank3(vs, tol=1e-9):
    basis = []
    for v in vs:
        w = list(v)
        for b in basis:
            d = _dot(w, b)
            w = [w[k] - d * b[k] for k in range(3)]
        n = _norm(w)
        if n > tol:
            basis.append([x / n for x in w])
        if len(basis) == 3:
            break
    return basis


def _f(x):
    return repr(float(x))


# ---------------------------------------------------------------- translation

class _Mesh:
    def __init__(self):
        self.nodes = []      # (name, x, y, z)
        self.cells = {"SEG2": [], "POI1": []}   # (name, nodes...)
        self.groups_ma = {}  # name -> [cells]
        self.groups_no = {}  # name -> [nodes]

    def node(self, name, p):
        self.nodes.append((name, p))
        self.groups_no["G" + name] = [name]
        return name

    def cell(self, kind, name, nodes, *groups):
        self.cells[kind].append((name, nodes))
        for g in groups:
            self.groups_ma.setdefault(g, []).append(name)
        return name

    def text(self):
        out = ["COOR_3D"]
        out += [f"{n} {_f(p[0])} {_f(p[1])} {_f(p[2])}" for n, p in self.nodes]
        out.append("FINSF")
        for kind, cells in self.cells.items():
            if cells:
                out.append(kind)
                out += [f"{c} {' '.join(ns)}" for c, ns in cells]
                out.append("FINSF")
        for g, ms in self.groups_ma.items():
            out += ["GROUP_MA", g] + [" ".join(ms[i:i + 8]) for i in range(0, len(ms), 8)] + ["FINSF"]
        for g, ns in self.groups_no.items():
            out += ["GROUP_NO", g] + [" ".join(ns[i:i + 8]) for i in range(0, len(ns), 8)] + ["FINSF"]
        out.append("FIN")
        return "\n".join(out) + "\n"


def check_supported(d):
    why = []
    for k in ("plates", "quads", "quad9s", "solidShells", "curvedShells", "curvedBeams"):
        if d.get(k):
            why.append(k)
    if d.get("leftHand"):
        why.append("leftHand axes")
    for s in d["sections"].values():
        if s.get("cw"):
            why.append("warping (cw)")
    for e in d["elements"].values():
        if e["type"] not in ("frame", "truss"):
            why.append(f"element type {e['type']}")
    for s in d["supports"].values():
        if s.get("rw") or s.get("kw"):
            why.append("warping support")
    for l in d["loads"]:
        if l["type"] not in ("nodal", "distributed", "pointOnElement", "thermal"):
            why.append(f"load {l['type']}")
        elif l["type"] == "nodal" and l["data"].get("bw"):
            why.append("bimoment load")
    return sorted(set(why))


def translate(d):
    why = check_supported(d)
    if why:
        raise Unsupported(", ".join(why))
    m = _Mesh()
    pts = {n["id"]: (float(n["x"]), float(n["y"]), float(n["z"])) for n in d["nodes"].values()}
    mats = {x["id"]: x for x in d["materials"].values()}
    secs = {x["id"]: x for x in d["sections"].values()}
    elems = sorted(d["elements"].values(), key=lambda e: e["id"])
    for nid in sorted(pts):
        m.node(f"N{nid}", pts[nid])
    extra = [0]

    def new_node(p):
        extra[0] += 1
        return m.node(f"X{extra[0]}", p)

    # ---- supports (DofNumbering::build_3d): flags OR-ed per node; the most
    # restrained (last) support's spring frees a DOF; spring stiffnesses add.
    sups = sorted(d["supports"].values(), key=lambda s: (s["nodeId"], sum(bool(s.get(k)) for k in FLAGS)))
    winner, flags, kspr, presc, inclined = {}, {}, {}, {}, {}
    for s in sups:
        nid = s["nodeId"]
        winner[nid] = s
        if s.get("isInclined") and all(s.get(k) is not None for k in ("normalX", "normalY", "normalZ")):
            nv = [s["normalX"], s["normalY"], s["normalZ"]]
            if _norm(nv) > 1e-12:
                inclined[nid] = _unit(nv)
        fl = flags.setdefault(nid, [False] * 6)
        ks = kspr.setdefault(nid, [0.0] * 6)
        for k in range(6):
            fl[k] = fl[k] or bool(s.get(FLAGS[k]))
            kv = s.get(SPRINGS[k]) or 0.0
            ks[k] += kv if kv > 0 else 0.0
            v = s.get(PRESC[k])
            if v is not None and abs(v) > 1e-15:
                presc[(nid, k)] = float(v)
    fixed, springs = {}, {}
    for nid, fl in flags.items():
        w = winner[nid]
        fx = [False] * 6
        for k in range(6):
            if fl[k] and not ((w.get(SPRINGS[k]) or 0.0) > 0):
                fx[k] = True
            elif kspr[nid][k] > 0:
                springs.setdefault(nid, [0.0] * 6)[k] = kspr[nid][k]
        if nid in inclined:
            # is_dof_restrained_3d: only the normal translation is restrained;
            # the translational flags and springs are ignored there.
            if any(springs.get(nid, [0.0] * 6)[:3]) or any((nid, k) in presc for k in range(3)):
                raise Unsupported("spring or settlement on an inclined support")
            fx[0:3] = [False] * 3
        fixed[nid] = fx

    # ---- member geometry, load stations
    geo = {}
    for e in elems:
        pi, pj = pts[e["nodeI"]], pts[e["nodeJ"]]
        L = _norm([pj[k] - pi[k] for k in range(3)])
        if L < 1e-12:
            raise Unsupported("zero-length member")
        geo[e["id"]] = (L,) + local_axes_3d(pi, pj, e)
    by_id = {e["id"]: e for e in elems}
    stations = {e["id"]: {0.0, 1.0} for e in elems}
    dist, point, thermal = {}, {}, {}
    nodal = {}

    def add_nodal(name, f):
        acc = nodal.setdefault(name, [0.0] * 6)
        for k in range(len(f)):
            acc[k] += f[k]

    truss_axial = {}
    for ld in d["loads"]:
        t, x = ld["type"], ld["data"]
        if t == "nodal":
            add_nodal(f"N{x['nodeId']}", [x.get(k.lower(), 0.0) or 0.0 for k in FORCE_KEYS])
            continue
        eid = x["elementId"]
        if eid not in by_id:
            raise Unsupported(f"load on missing element {eid}")
        e = by_id[eid]
        L, ex, ey, ez = geo[eid]
        if t == "thermal":
            thermal.setdefault(eid, []).append(x)
            if e["type"] == "truss":
                # BARRE ignores PRE_EPSI (no thermal response at all): the
                # bar's exact equivalent, EA.a.dT pulling its ends apart.
                fax = mats[e["materialId"]]["e"] * 1000.0 * secs[e["sectionId"]]["a"] * ALPHA * x["dtUniform"]
                add_nodal(f"N{e['nodeI']}", [-fax * ex[k] for k in range(3)])
                add_nodal(f"N{e['nodeJ']}", [fax * ex[k] for k in range(3)])
            continue
        if e["type"] == "truss":
            # The engine lumps truss member loads to the end nodes by statics
            # (a truss carries nothing transverse); the axial share also
            # shifts the reported end forces.
            if t == "distributed":
                a = x.get("a") or 0.0
                b = x.get("b") if x.get("b") is not None else L
                r = {}
                for key, q in (("x", ("qXI", "qXJ")), ("y", ("qYI", "qYJ")), ("z", ("qZI", "qZJ"))):
                    r[key] = _lever(x.get(q[0], 0.0) or 0.0, x.get(q[1], 0.0) or 0.0, a, b, L)
                fa = truss_axial.setdefault(eid, [0.0, 0.0])
                fa[0] += r["x"][0]
                fa[1] += r["x"][1]
                for end, nid in ((0, e["nodeI"]), (1, e["nodeJ"])):
                    add_nodal(f"N{nid}", [r["x"][end] * ex[k] + r["y"][end] * ey[k] + r["z"][end] * ez[k]
                                          for k in range(3)])
            else:
                fi, fj = 1 - x["a"] / L, x["a"] / L
                for fr, nid in ((fi, e["nodeI"]), (fj, e["nodeJ"])):
                    add_nodal(f"N{nid}", [fr * (x["py"] * ey[k] + x["pz"] * ez[k]) for k in range(3)])
            continue
        if t == "distributed":
            a = x.get("a") or 0.0
            b = x.get("b") if x.get("b") is not None else L
            if not (-1e-12 <= a < b <= L * (1 + 1e-12)):
                raise Unsupported("distributed load outside member")
            b = min(b, L)
            stations[eid].update((a / L, b / L))
            sec = secs[e["sectionId"]]
            if sec.get("asY") or sec.get("asZ"):
                # POU_D_T's equivalent loads for a *varying* FORCE_POUTRE are
                # the Euler-Bernoulli ones (shear deformation ignored; see
                # README "Timoshenko members under varying loads"). The
                # varying components go in as three Gauss point loads,
                # exact for the cubic end response of an exact element.
                x = dict(x)
                for comp, (ki, kj) in (("px", ("qXI", "qXJ")), ("py", ("qYI", "qYJ")), ("pz", ("qZI", "qZJ"))):
                    qi, qj = x.get(ki, 0.0) or 0.0, x.get(kj, 0.0) or 0.0
                    if qi == qj:
                        continue
                    x[ki] = x[kj] = 0.0
                    for pv, xa in gauss_point_loads(qi, qj, a, b):
                        stations[eid].add(xa / L)
                        point.setdefault(eid, []).append({"a": xa, "px": 0.0, "py": 0.0, "pz": 0.0, comp: pv})
            dist.setdefault(eid, []).append((a, b, x))
        elif t == "pointOnElement":
            if not (0 < x["a"] < L):
                raise Unsupported("point load outside the member interior")
            stations[eid].add(x["a"] / L)
            point.setdefault(eid, []).append(x)

    # ---- rotational DOFs: nodes on a beam or DIS_TR cell carry them in
    # Code_Aster. A node whose rotations get no stiffness (only trusses /
    # fully released ends) has them fixed (the engine adds a tiny spring);
    # a partial rank is a mechanism -> unsupported.
    rot_dirs = {nid: [] for nid in pts}
    has_rot = set()
    E3 = [[1.0, 0.0, 0.0], [0.0, 1.0, 0.0], [0.0, 0.0, 1.0]]
    for e in elems:
        if e["type"] != "frame":
            continue
        L, ex, ey, ez = geo[e["id"]]
        for nid, end in ((e["nodeI"], "Start"), (e["nodeJ"], "End")):
            has_rot.add(nid)
            for ax, key in ((ex, "releaseT"), (ey, "releaseMy"), (ez, "releaseMz")):
                if not e.get(key + end):
                    rot_dirs[nid].append(ax)
    for c in (d.get("connectors") or {}).values():
        dx, dy, dz, _ = connector_axes(pts[c["nodeI"]], pts[c["nodeJ"]])
        for nid in (c["nodeI"], c["nodeJ"]):
            has_rot.add(nid)
            for ax, key in ((dx, "kMoment"), (dy, "kBendY"), (dz, "kBendZ")):
                if (c.get(key) or 0.0) > 0:
                    rot_dirs[nid].append(ax)
    for nid, fx in fixed.items():
        for k in range(3):
            if fx[3 + k] or springs.get(nid, [0.0] * 6)[3 + k] > 0:
                rot_dirs[nid].append(E3[k])
    mpcs = _constraint_rows(d, pts)
    # Constraint equations that are linearly dependent on the supports (or on
    # each other): Code_Aster enforces every one with a Lagrange multiplier,
    # and dependent rows make its matrix singular (FACTOR_42, aster3d-744151:
    # a rigid link whose dependent node also has a support). The engine keeps
    # such a model solvable and reports over_constrained_dof. Not comparable,
    # so unsupported; independent rows, whatever the term order (-2*rx_1 +
    # uy_2 = 0 with node 1 fixed), are translated as before.
    if constraints_redundant(mpcs, fixed, inclined):
        raise Unsupported("constraint equations dependent on the supports")
    for row in mpcs:
        for nid, k, _ in row:
            if k >= 3:
                rot_dirs[nid].append(E3[k - 3])
    art_rot = set()
    for nid in pts:
        if nid not in has_rot:
            art_rot.add(nid)
            continue
        r = len(rank3(rot_dirs[nid]))
        if r == 0:
            art_rot.add(nid)
        elif r < 3:
            raise Unsupported(f"rotational mechanism at node {nid} (rank {r})")
    for nid in art_rot:
        if any(abs(v) > 0 for v in nodal.get(f"N{nid}", [0.0] * 6)[3:]):
            raise Unsupported("nodal moment on a rotation-free node")
        if any(springs.get(nid, [0.0] * 6)[3:]):
            raise Unsupported("rotational spring on a rotation-free node")
    for row in mpcs:
        for nid, k, _ in row:
            if k >= 3 and nid in art_rot:
                raise Unsupported("constraint on a rotation-free node's rotation")

    # ---- cells
    ties = []           # (joint, hinge node, [rotation dirs kept])
    groups = {"POU_D_E": [], "POU_D_T": [], "BARRE": [], "DIS_TR": [], "DIS_T": []}
    pieces = {}         # eid -> [cell names]
    piece_span = {}     # cell -> (eid, s0, s1) in metres
    ncell = 0
    for e in elems:
        eid = e["id"]
        L, ex, ey, ez = geo[eid]
        pi, pj = pts[e["nodeI"]], pts[e["nodeJ"]]
        if e["type"] == "truss":
            ncell += 1
            c = m.cell("SEG2", f"M{ncell}", [f"N{e['nodeI']}", f"N{e['nodeJ']}"], f"E{eid}")
            groups["BARRE"].append(f"E{eid}")
            pieces[eid] = [c]
            continue
        sec = secs[e["sectionId"]]
        kind = "POU_D_T" if (sec.get("asY") or sec.get("asZ")) else "POU_D_E"
        groups[kind].append(f"E{eid}")
        ss = sorted(stations[eid])
        merged = [ss[0]]
        for s in ss[1:]:
            if s - merged[-1] > 1e-9:
                merged.append(s)
        merged[-1] = 1.0
        chain = [f"N{e['nodeI']}"]
        for s in merged[1:-1]:
            chain.append(new_node([pi[k] + s * (pj[k] - pi[k]) for k in range(3)]))
        chain.append(f"N{e['nodeJ']}")
        for idx, end, joint in ((0, "Start", e["nodeI"]), (-1, "End", e["nodeJ"])):
            rel = {k: e.get(k + end) for k in ("releaseT", "releaseMy", "releaseMz")}
            if end == "End" and e.get("releaseTStart"):
                # Torsion released at both ends: the member's twist would be a
                # rigid mode of its two hinge nodes (singular in Code_Aster;
                # stabileo condenses it away). One release already makes the
                # torque zero, so the end keeps its torsion.
                rel["releaseT"] = False
            kept = [ax for ax, key in ((ex, "releaseT"), (ey, "releaseMy"), (ez, "releaseMz")) if not rel[key]]
            if len(kept) < 3:
                h = new_node(pts[joint])
                ties.append((f"N{joint}", h, kept))
                chain[idx] = h
        pieces[eid] = []
        for k in range(len(chain) - 1):
            ncell += 1
            c = m.cell("SEG2", f"M{ncell}", [chain[k], chain[k + 1]], f"E{eid}")
            pieces[eid].append(c)
            piece_span[c] = (merged[k] * L, merged[k + 1] * L)
    for nid, kv in sorted(springs.items()):
        ncell += 1
        g = f"S{nid}"
        m.cell("POI1", f"M{ncell}", [f"N{nid}"], g)
        groups["DIS_T" if nid in art_rot else "DIS_TR"].append(g)
    conns = sorted((d.get("connectors") or {}).values(), key=lambda c: c["id"])
    for c in conns:
        ncell += 1
        m.cell("SEG2", f"M{ncell}", [f"N{c['nodeI']}", f"N{c['nodeJ']}"], f"C{c['id']}")
        groups["DIS_TR"].append(f"C{c['id']}")

    # ---- nodes left without DOFs: a joint whose members all end on hinge
    # nodes carries no cell of its own (its translations, and rotations
    # if not rotation-free, are then undefined in Code_Aster, while the
    # ties need them). A zero-stiffness discrete cell gives them DOFs.
    seg = dict(m.cells["SEG2"])
    t_nodes, r_nodes = set(), set()
    for e in elems:
        for c in pieces[e["id"]]:
            t_nodes.update(seg[c])
            if e["type"] == "frame":
                r_nodes.update(seg[c])
    for c in conns:
        t_nodes.update((f"N{c['nodeI']}", f"N{c['nodeJ']}"))
        r_nodes.update((f"N{c['nodeI']}", f"N{c['nodeJ']}"))
    for nid in springs:
        t_nodes.add(f"N{nid}")
        if nid not in art_rot:
            r_nodes.add(f"N{nid}")
    zero_cells = []
    for nid in sorted(pts):
        name = f"N{nid}"
        if name in t_nodes and (nid in art_rot or name in r_nodes):
            continue
        ncell += 1
        g = f"Z{nid}"
        m.cell("POI1", f"M{ncell}", [name], g)
        kind = "DIS_T" if nid in art_rot else "DIS_TR"
        groups[kind].append(g)
        zero_cells.append((g, kind))
        t_nodes.add(name)
        if kind == "DIS_TR":
            r_nodes.add(name)

    # ---- command file
    L_ = []
    w = L_.append
    w("MO = AFFE_MODELE(MAILLAGE=MESH, AFFE=(")
    for kind, gs in groups.items():
        if gs:
            w(f"    _F(GROUP_MA={tuple(gs)!r}, PHENOMENE='MECANIQUE', MODELISATION={kind!r}),")
    w("))")
    used_mats = sorted({e["materialId"] for e in elems})
    for mid in used_mats:
        mt = mats[mid]
        w(f"MAT{mid} = DEFI_MATERIAU(ELAS=_F(E={_f(mt['e'] * 1000.0)}, NU={_f(mt['nu'])}))")
    w("CM = AFFE_MATERIAU(MAILLAGE=MESH, AFFE=(")
    for mid in used_mats:
        gs = tuple(f"E{e['id']}" for e in elems if e["materialId"] == mid)
        w(f"    _F(GROUP_MA={gs!r}, MATER=MAT{mid}),")
    w("))")
    w("CE = AFFE_CARA_ELEM(MODELE=MO,")
    poutre, barre, orient, discret = [], [], [], []
    for e in elems:
        sec = secs[e["sectionId"]]
        g = f"E{e['id']}"
        if e["type"] == "truss":
            barre.append(f"_F(GROUP_MA={g!r}, SECTION='GENERALE', CARA='A', VALE={_f(sec['a'])})")
            continue
        cara = ["A", "IY", "IZ", "JX"]
        vale = [sec["a"], sec["iy"], sec["iz"], sec["j"]]
        if sec.get("asY") or sec.get("asZ"):
            # Engine: phi_y = 12 E Iy / (G asY L^2): asY is the shear area of
            # the Iy plane (shear along local z) -> AZ; a missing one is rigid.
            cara += ["AY", "AZ"]
            vale += [sec["a"] / sec["asZ"] if sec.get("asZ") else 0.0,
                     sec["a"] / sec["asY"] if sec.get("asY") else 0.0]
        poutre.append(f"_F(GROUP_MA={g!r}, SECTION='GENERALE', CARA={tuple(cara)!r}, "
                      f"VALE=({', '.join(_f(v) for v in vale)},))")
        ey = geo[e["id"]][2]
        orient.append(f"_F(GROUP_MA={g!r}, CARA='VECT_Y', VALE=({', '.join(_f(v) for v in ey)}))")
    for nid, kv in sorted(springs.items()):
        if nid in art_rot:
            discret.append(f"_F(GROUP_MA='S{nid}', CARA='K_T_D_N', REPERE='GLOBAL', "
                           f"VALE=({', '.join(_f(v) for v in kv[:3])}))")
        else:
            discret.append(f"_F(GROUP_MA='S{nid}', CARA='K_TR_D_N', REPERE='GLOBAL', "
                           f"VALE=({', '.join(_f(v) for v in kv)}))")
    for g, kind in zero_cells:
        if kind == "DIS_T":
            discret.append(f"_F(GROUP_MA={g!r}, CARA='K_T_D_N', REPERE='GLOBAL', VALE=(0.0, 0.0, 0.0))")
        else:
            discret.append(f"_F(GROUP_MA={g!r}, CARA='K_TR_D_N', REPERE='GLOBAL', VALE=(0.0,) * 6)")
    for c in conns:
        dx, dy, dz, n = connector_axes(pts[c["nodeI"]], pts[c["nodeJ"]])
        kv = [c.get(k) or 0.0 for k in ("kAxial", "kShear", "kShearZ", "kMoment", "kBendY", "kBendZ")]
        g = f"C{c['id']}"
        if n > 1e-12:
            # Finite length: the shear springs act at the midpoint through rigid
            # arms (element/connector.rs), which couples shear to the end
            # rotations: a full 12x12 matrix, not a diagonal one.
            kfull = connector_matrix(kv, dx, dy, dz, n)
            vals = [kfull[i][j] for j in range(12) for i in range(j + 1)]
            discret.append(f"_F(GROUP_MA={g!r}, CARA='K_TR_L', REPERE='GLOBAL', "
                           f"VALE=({', '.join(_f(v) for v in vals)}))")
        else:
            discret.append(f"_F(GROUP_MA={g!r}, CARA='K_TR_D_L', REPERE='LOCAL', VALE=({', '.join(_f(v) for v in kv)}))")
        if n > 1e-12:
            orient.append(f"_F(GROUP_MA={g!r}, CARA='VECT_Y', VALE=({', '.join(_f(v) for v in dy)}))")
        else:
            orient.append(f"_F(GROUP_MA={g!r}, CARA='VECT_X_Y', VALE=({', '.join(_f(v) for v in dx + dy)}))")
    for kw, lst in (("POUTRE", poutre), ("BARRE", barre), ("ORIENTATION", orient), ("DISCRET", discret)):
        if lst:
            w(f"    {kw}=(")
            for s in lst:
                w(f"        {s},")
            w("    ),")
    w(")")

    # kinematics
    ddl, liais = [], []
    for nid, fx in sorted(fixed.items()):
        vals = {}
        for k in range(6):
            if k >= 3 and nid in art_rot:
                continue
            if fx[k]:
                vals[DDL[k]] = presc.get((nid, k), 0.0)
        if vals:
            ddl.append(f"_F(GROUP_NO='GN{nid}', " + ", ".join(f"{k}={_f(v)}" for k, v in vals.items()) + ")")
    for nid in sorted(art_rot):
        if f"N{nid}" in r_nodes:
            ddl.append(f"_F(GROUP_NO='GN{nid}', DRX=0.0, DRY=0.0, DRZ=0.0)")
    for nid, nv in sorted(inclined.items()):
        liais.append(_liaison([(f"N{nid}", 0, nv[0]), (f"N{nid}", 1, nv[1]), (f"N{nid}", 2, nv[2])]))
    for joint, h, kept in ties:
        for k in range(3):
            liais.append(_liaison([(h, k, 1.0), (joint, k, -1.0)]))
        for ax in kept:
            row = []
            for k in range(3):
                if abs(ax[k]) > 1e-14:
                    row += [(h, 3 + k, ax[k]), (joint, 3 + k, -ax[k])]
            liais.append(_liaison(row))
    for row in mpcs:
        liais.append(_liaison([(f"N{n}", k, c) for n, k, c in row]))
    if not ddl and not liais:
        # Nothing restrains the model (Code_Aster rejects an empty
        # AFFE_CHAR_MECA): a free body, singular by its rigid-body motions.
        raise Unsupported("free body: no support or constraint")
    w("BC = AFFE_CHAR_MECA(MODELE=MO,")
    if ddl:
        w("    DDL_IMPO=(" + "".join(f"\n        {s}," for s in ddl) + "\n    ),")
    if liais:
        w("    LIAISON_DDL=(" + "".join(f"\n        {s}," for s in liais) + "\n    ),")
    w(")")
    excit = ["_F(CHARGE=BC)"]

    nodal_f = []
    for e in elems:
        L, ex, ey, ez = geo[e["id"]]
        for x in point.get(e["id"], []):
            s = x["a"]
            # the station node at s (exact position on the chain)
            cell_names = pieces[e["id"]]
            tgt = None
            for c in cell_names:
                s0, s1 = piece_span[c]
                if abs(s0 - s) <= 1e-9 * L:
                    tgt = dict(m.cells["SEG2"])[c][0]
                    break
            if tgt is None:
                raise RuntimeError("station node not found")
            add_nodal(tgt, [(x.get("px") or 0.0) * ex[k] + x["py"] * ey[k] + x["pz"] * ez[k] for k in range(3)])
    for name, f in nodal.items():
        nid = int(name[1:]) if name.startswith("N") else None
        comps = {FORCE_KEYS[k]: f[k] for k in range(6) if abs(f[k]) > 0 and not (k >= 3 and nid in art_rot)}
        if comps:
            nodal_f.append(f"_F(GROUP_NO='G{name}', " + ", ".join(f"{k}={_f(v)}" for k, v in comps.items()) + ")")
    loads_c = []
    pre, eps0 = [], {}
    for eid, tls in thermal.items():
        e = by_id[eid]
        sec = secs[e["sectionId"]]
        tu = sum(t["dtUniform"] for t in tls)
        gy = sum(t.get("dtGradientY", 0.0) or 0.0 for t in tls)
        gz = sum(t.get("dtGradientZ", 0.0) or 0.0 for t in tls)
        comps = {"EPX": ALPHA * tu}
        if e["type"] == "frame":
            hy = math.sqrt(12 * sec["iz"] / sec["a"]) if sec["a"] > 1e-15 else 0.1
            hz = math.sqrt(12 * sec["iy"] / sec["a"]) if sec["a"] > 1e-15 else 0.1
            comps["KY"] = ALPHA * gz / hz
            comps["KZ"] = ALPHA * gy / hy
        E = mats[e["materialId"]]["e"] * 1000.0
        if e["type"] != "truss":  # trusses: nodal forces, see the load loop
            pre.append(f"_F(GROUP_MA='E{eid}', " + ", ".join(f"{k}={_f(v)}" for k, v in comps.items()) + ")")
        # Code_Aster's beam force fields (EFGE_ELNO, SIEF_ELNO) are the
        # stiffness times the *total* strain: they leave out the initial
        # strain (a freely expanding bar reports N = EA.eps0). The member
        # force is the stiffness times the elastic strain, so postprocess
        # subtracts these (README "Thermal loads").
        eps0[eid] = {"N": E * sec["a"] * comps["EPX"], "MFY": E * sec["iy"] * comps.get("KY", 0.0),
                     "MFZ": E * sec["iz"] * comps.get("KZ", 0.0)}
    if nodal_f:
        loads_c.append("FORCE_NODALE=(" + "".join(f"\n        {s}," for s in nodal_f) + "\n    )")
    if pre:
        loads_c.append("PRE_EPSI=(" + "".join(f"\n        {s}," for s in pre) + "\n    )")
    if loads_c:
        w("LD = AFFE_CHAR_MECA(MODELE=MO,\n    " + ",\n    ".join(loads_c) + ",\n)")
        excit.append("_F(CHARGE=LD)")
    # Distributed member loads: Code_Aster accepts a single distributed-load
    # charge for beam post-processing (CALCULEL2_92), and repeated
    # FORCE_POUTRE occurrences on one cell overwrite each other, so every
    # piece gets one formula per component summing all loads on it.
    per_piece = {}
    for e in elems:
        L, ex, ey, ez = geo[e["id"]]
        pi = pts[e["nodeI"]]
        sx = f"((X-{_f(pi[0])})*{_f(ex[0])} + (Y-{_f(pi[1])})*{_f(ex[1])} + (Z-{_f(pi[2])})*{_f(ex[2])})"
        for a, b, x in dist.get(e["id"], []):
            for c in pieces[e["id"]]:
                s0, s1 = piece_span[c]
                if s0 < a - 1e-9 * L or s1 > b + 1e-9 * L:
                    continue
                # N / VY / VZ are local components (FX / FY / FZ are global).
                for ck, (ki, kj) in (("N", ("qXI", "qXJ")), ("VY", ("qYI", "qYJ")), ("VZ", ("qZI", "qZJ"))):
                    qi, qj = x.get(ki, 0.0) or 0.0, x.get(kj, 0.0) or 0.0
                    if qi == 0 and qj == 0:
                        continue
                    if qi == qj:
                        expr = _f(qi)
                    else:
                        expr = f"{_f(qi)} + ({_f(qj - qi)})*({sx} - {_f(a)})/{_f(b - a)}"
                    per_piece.setdefault(c, {}).setdefault(ck, []).append(expr)
    occ = []
    nf = 0
    for c, comps in per_piece.items():
        parts = []
        for ck, exprs in sorted(comps.items()):
            nf += 1
            w(f"Q{nf} = FORMULE(VALE={' + '.join('(' + x + ')' for x in exprs) + ' + 0.0*X'!r}, "
              "NOM_PARA=('X', 'Y', 'Z'))")
            parts.append(f"{ck}=Q{nf}")
        m.groups_ma.setdefault("G" + c, [c])  # MAILLE= is gone in 18.x
        occ.append(f"_F(GROUP_MA={'G' + c!r}, TYPE_CHARGE='FORCE', {', '.join(parts)})")
    if occ:
        w("QD = AFFE_CHAR_MECA_F(MODELE=MO, FORCE_POUTRE=(" + "".join(f"\n    {o}," for o in occ) + "\n))")
        excit.append("_F(CHARGE=QD)")
    # NPREC: MUMPS reports a singular matrix when a pivot loses more than
    # NPREC digits (default 8). The load-station splits add short pieces
    # (stiffness ratios up to (L/h)^3) that cost regular models up to ~8
    # digits; true mechanisms lose 11+ (see README).
    w("RES = MECA_STATIQUE(MODELE=MO, CHAM_MATER=CM, CARA_ELEM=CE, SOLVEUR=_F(METHODE='MUMPS', NPREC=10), "
      "EXCIT=(" + ", ".join(excit) + ",))")
    beam_groups = tuple(g for k in ("POU_D_E", "POU_D_T", "BARRE") for g in groups[k])
    w(f"RES = CALC_CHAMP(reuse=RES, RESULTAT=RES, FORCE=('REAC_NODA',))")
    if any(groups[k] for k in ("POU_D_E", "POU_D_T", "BARRE")):
        w(f"RES = CALC_CHAMP(reuse=RES, RESULTAT=RES, GROUP_MA={beam_groups!r}, CONTRAINTE=('EFGE_ELNO',))")
    w("dump_result(RES, OUT_PATH)")

    cell_index = {}
    i = 0
    for kind in ("SEG2", "POI1"):
        for c, _ in m.cells[kind]:
            cell_index[c] = i
            i += 1
    node_index = {n: i for i, (n, _) in enumerate(m.nodes)}
    meta = dict(
        node_index=node_index,
        cell_index=cell_index,
        nodes=sorted(pts),
        art_rot=sorted(art_rot),
        springs={str(k): v for k, v in springs.items()},
        ties=[(j, h) for j, h, _ in ties],
        support_nodes=sorted(flags),
        mpc_nodes=sorted({n for row in mpcs for n, _, _ in row}),
        elements=[dict(id=e["id"], type=e["type"], first=pieces[e["id"]][0], last=pieces[e["id"]][-1],
                       axial=truss_axial.get(e["id"], [0.0, 0.0]), eps0=eps0.get(e["id"], {})) for e in elems],
    )
    return comm_text(m.text(), "\n".join(L_)), meta


_G3 = [(0.5 - 0.5 * math.sqrt(0.6), 5 / 18), (0.5, 8 / 18), (0.5 + 0.5 * math.sqrt(0.6), 5 / 18)]


def gauss_point_loads(qi, qj, a, b):
    """[(P, x)]: three point loads equivalent (in work against any quintic,
    so any cubic response function) to the linear load qi -> qj on [a, b]."""
    span = b - a
    return [((qi + t * (qj - qi)) * w * span, a + t * span) for t, w in _G3]


def _lever(qi, qj, a, b, L):
    """Simply supported reactions (ri, rj) of a linear load qi->qj on [a, b]."""
    span = b - a
    ri = rj = 0.0
    for wv, xc in ((qi * span, (a + b) / 2), ((qj - qi) * span / 2, a + 2 * span / 3)):
        ri += wv * (L - xc) / L
        rj += wv * xc / L
    return ri, rj


def _liaison(terms):
    terms = [(n, k, c) for n, k, c in terms if abs(c) > 0]
    return (f"_F(GROUP_NO={tuple('G' + n for n, _, _ in terms)!r}, DDL={tuple(DDL[k] for _, k, _ in terms)!r}, "
            f"COEF_MULT=({', '.join(_f(c) for _, _, c in terms)},), COEF_IMPO=0.0)")


def _constraint_rows(d, pts):
    """Constraints as linear rows [(node, dof, coef)] = 0, from the kinematics
    documented in engine/src/types/input.rs + solver/constraints.rs:
      rigidLink   u_s = u_m + th_m x r (dofs listed; default translations),
                  rotations listed: th_s = th_m; r = x_s - x_m
      diaphragm   in-plane translations of each slave follow the master's
                  in-plane rigid motion, theta x r (right-handed: XY about z,
                  YZ about x, XZ about y), and the slave's in-plane rotation
                  equals the master's (a rigid floor turns as one body; the
                  engine ties it since 89bed56b4, as SAP2000/OpenSees do)
      equalDOF    u_s,k = u_m,k
      linearMPC   sum c_i u_i = 0
      eccentricConnection  rigidLink with an explicit offset, every DOF not
                  released.
    """
    rows = []

    def rigid(ms, sl, r, dofs):
        dx, dy, dz = r
        for k in dofs:
            row = [(sl, k, 1.0), (ms, k, -1.0)]
            if k == 0:
                row += [(ms, 4, -dz), (ms, 5, dy)]
            elif k == 1:
                row += [(ms, 3, dz), (ms, 5, -dx)]
            elif k == 2:
                row += [(ms, 3, -dy), (ms, 4, dx)]
            rows.append([t for t in row if abs(t[2]) > 1e-15])

    for c in d.get("constraints") or []:
        t, x = c["type"], c
        if "data" in c:
            x = c["data"]
        if t == "rigidLink":
            ms, sl = x["masterNode"], x["slaveNode"]
            r = [pts[sl][k] - pts[ms][k] for k in range(3)]
            rigid(ms, sl, r, x.get("dofs") or [0, 1, 2])
        elif t == "eccentricConnection":
            ms, sl = x["masterNode"], x["slaveNode"]
            rel = x.get("releases") or []
            dofs = [k for k in range(6) if not (k < len(rel) and rel[k])]
            rigid(ms, sl, [x.get("offsetX", 0.0), x.get("offsetY", 0.0), x.get("offsetZ", 0.0)], dofs)
        elif t == "equalDOF":
            for k in x["dofs"]:
                rows.append([(x["slaveNode"], k, 1.0), (x["masterNode"], k, -1.0)])
        elif t == "linearMPC":
            rows.append([(tm["nodeId"], tm["dof"], tm["coefficient"]) for tm in x["terms"]])
        elif t == "diaphragm":
            plane = (x.get("plane") or "XY").upper()
            d0, d1, dr = {"XZ": (0, 2, 4), "YZ": (1, 2, 3)}.get(plane, (0, 1, 5))
            ms = x["masterNode"]
            for sl in x["slaveNodes"]:
                dx, dy, dz = (pts[sl][k] - pts[ms][k] for k in range(3))
                # u_slave = u_master + c * theta_master (constraints.rs, diaphragm_lever)
                c0, c1 = {"XZ": (dz, -dx), "YZ": (-dz, dy)}.get(plane, (-dy, dx))
                rows.append([t_ for t_ in [(sl, d0, 1.0), (ms, d0, -1.0), (ms, dr, -c0)] if abs(t_[2]) > 1e-15])
                rows.append([t_ for t_ in [(sl, d1, 1.0), (ms, d1, -1.0), (ms, dr, -c1)] if abs(t_[2]) > 1e-15])
                rows.append([(sl, dr, 1.0), (ms, dr, -1.0)])
        else:
            raise Unsupported(f"constraint {t}")
    return rows


HEADER = '''# Generated by tools/differential/codeaster/to_aster.py -- do not edit.
# Standalone: run_aster this.comm (writes result.json next to it), or exec'd
# by aster_batch.py with OUT_PATH set.
import json
import os

from code_aster import CA
from code_aster.Commands import *

if "OUT_PATH" not in globals():
    CA.init()
    OUT_PATH = os.path.join(os.getcwd(), "result.json")


def dump_result(res, path):
    out = {}
    for name in ("DEPL", "REAC_NODA"):
        f = res.getField(name, 1).toSimpleFieldOnNodes()
        v, mask = f.getValues()
        out[name] = dict(cmps=list(f.getComponents()), vals=v.tolist(), mask=mask.tolist())
    if "EFGE_ELNO" in res.getFieldsNames():
        f = res.getField("EFGE_ELNO", 1).toSimpleFieldOnCells()
        cells = {}
        cmps = list(f.getComponents())
        for ic in range(f.getNumberOfCells()):
            npt = f.getNumberOfPointsOfCell(ic)
            if npt == 0:
                continue
            cells[ic] = [[f.getValue(ic, k, p, 0) if f.hasValue(ic, k, p, 0) else None for k in range(len(cmps))]
                         for p in range(npt)]
        out["EFGE_ELNO"] = dict(cmps=cmps, cells=cells)
    with open(path, "w") as fh:
        json.dump(out, fh)

'''


def comm_text(mesh, body):
    return (HEADER +
            f"MESH_TEXT = {mesh!r}\n"
            "_mp = OUT_PATH + '.mail'\n"
            "with open(_mp, 'w') as _fh:\n"
            "    _fh.write(MESH_TEXT)\n"
            "MESH = CA.Mesh()\n"
            "MESH.readAsterFile(_mp)\n" + body + "\n")


# ---------------------------------------------------------------- results

def postprocess(meta, raw):
    """Code_Aster raw fields -> dict(disp, reac, forces) keyed by stabileo
    ids, in stabileo's conventions."""
    ni = meta["node_index"]

    def nodal(name):
        f = raw[name]
        idx = {c: i for i, c in enumerate(f["cmps"])}
        out = {}
        for n, i in ni.items():
            row, mk = f["vals"][i], f["mask"][i]
            out[n] = [row[idx[c]] if c in idx and mk[idx[c]] else 0.0 for c in DDL]
        return out

    u = nodal("DEPL")
    r = nodal("REAC_NODA")
    disp = {nid: u[f"N{nid}"] for nid in meta["nodes"]}
    for j, h in meta["ties"]:
        r[j] = [a + b for a, b in zip(r[j], r[h])]
    reac = {}
    for nid in meta["support_nodes"]:
        rv = list(r[f"N{nid}"])
        k = meta["springs"].get(str(nid))
        if k:
            for c in range(6):
                rv[c] -= k[c] * disp[nid][c]
        reac[nid] = rv
    forces = {}
    ef = raw.get("EFGE_ELNO", {"cmps": [], "cells": {}})
    eidx = {c: i for i, c in enumerate(ef["cmps"])}
    names = ["n", "vy", "vz", "mx", "my", "mz"]
    cmap = ["N", "VY", "VZ", "MT", "MFY", "MFZ"]
    for e in meta["elements"]:
        c0 = ef["cells"][str(meta["cell_index"][e["first"]])]
        c1 = ef["cells"][str(meta["cell_index"][e["last"]])]
        fd = {}
        # EFGE_ELNO holds section forces: at node 1 = -f_I, at node 2 = +f_J
        # (local end forces on the member). Engine: nStart = -f_Ix,
        # nEnd = f_Jx, other start = f_I, other end = -f_J.
        for k, (n, cn) in enumerate(zip(names, cmap)):
            if e["type"] == "truss":
                if n == "n":
                    v = c0[0][eidx["N"]] - e["eps0"].get("N", 0.0)
                    fd["nStart"] = v + e["axial"][0]
                    fd["nEnd"] = v - e["axial"][1]
                else:
                    fd[n + "Start"] = fd[n + "End"] = 0.0
                continue
            d0 = e["eps0"].get(cn, 0.0)
            a, b = c0[0][eidx[cn]] - d0, c1[-1][eidx[cn]] - d0
            fd[n + "Start"] = a if n == "n" else -a
            fd[n + "End"] = b if n == "n" else -b
        forces[e["id"]] = fd
    return dict(dim=3, disp=disp, reac=reac, forces=forces, art_rot=meta["art_rot"],
                skip_reac=meta["mpc_nodes"])
