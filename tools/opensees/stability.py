"""Exact stability check for the random frame models of gen_models.py,
independent of stabileo and of the reference programs (pure Python, no
numpy, so the Code_Aster harness can use it too).

A linear frame model has a unique answer iff its free-DOF stiffness is
regular, i.e. iff the only motion of the free DOFs that strains no member
and no spring is zero. That null space is the null space of the
compatibility matrix B (one row per member deformation mode or spring), so
`mechanisms(model)` returns dim null(B_free) by Gaussian elimination with
unit-norm columns (a Jacobi scaling) and a relative pivot tolerance:

  truss       axial elongation ex.(u_j - u_i)
  frame       axial; torsion ex.(th_j - th_i) (3D); per bending plane the
              end rotations relative to the chord, th_end - psi, minus the
              ones a hinge / release frees (condensed out of the stiffness)
  spring      the spring's direction (2D: rotated by `angle`)
  support     a restrained DOF is not free

A node whose rotations no row reaches (every frame hinged there, or only
trusses) has them held by the engine's artificial stiffness, and so here:
they are left out. Property values do not change the null space (every
stiffness is positive), only the geometry, axes and releases do.
"""

import math

from compare import local_axes_3d, supports_by_node_2d, SUPPORT_FLAGS_2D

TOL = 1e-9


def _rank(rows, cols):
    """Rank of the rows (dicts col -> value) restricted to `cols`."""
    idx = {c: k for k, c in enumerate(cols)}
    m = [[0.0] * len(cols) for _ in rows]
    for r, row in enumerate(rows):
        for c, v in row.items():
            if c in idx:
                m[r][idx[c]] += v
    # unit-norm columns
    for k in range(len(cols)):
        n = math.sqrt(sum(m[r][k] ** 2 for r in range(len(m))))
        if n > 0:
            for r in range(len(m)):
                m[r][k] /= n
    rank, rows_left = 0, list(range(len(m)))
    for k in range(len(cols)):
        best, piv = TOL, None
        for r in rows_left:
            if abs(m[r][k]) > best:
                best, piv = abs(m[r][k]), r
        if piv is None:
            continue
        rows_left.remove(piv)
        rank += 1
        for r in rows_left:
            f = m[r][k] / m[piv][k]
            if f:
                for c in range(k, len(cols)):
                    m[r][c] -= f * m[piv][c]
    return rank


def _free(rows, dofs, fixed, rot_local):
    """Free DOFs: not restrained, and not an orphan rotation."""
    reached = {c for row in rows for c, v in row.items() if v != 0.0}
    out = []
    for (nid, k) in dofs:
        if (nid, k) in fixed:
            continue
        if k in rot_local and not any((nid, kk) in reached for kk in rot_local):
            continue  # every rotation of the node unreached: artificial stiffness
        out.append((nid, k))
    return out


def mechanisms_2d(d):
    pts = {n["id"]: (n["x"], n.get("z", n.get("y", 0.0))) for n in d["nodes"].values()}
    rows = []
    for e in d["elements"].values():
        i, j = e["nodeI"], e["nodeJ"]
        dx, dz = pts[j][0] - pts[i][0], pts[j][1] - pts[i][1]
        L = math.hypot(dx, dz)
        c, s = dx / L, dz / L
        rows.append({(j, 0): c, (j, 1): s, (i, 0): -c, (i, 1): -s})
        if e["type"] != "frame":
            continue
        # chord rotation psi = n.(u_j - u_i) / L, n = (-s, c)
        psi = {(j, 0): -s / L, (j, 1): c / L, (i, 0): s / L, (i, 1): -c / L}
        for node, hinge in ((i, e.get("hingeStart")), (j, e.get("hingeEnd"))):
            if not hinge:
                row = {k: -v for k, v in psi.items()}
                row[(node, 2)] = row.get((node, 2), 0.0) + 1.0
                rows.append(row)
    fixed = set()
    for nid, s_ in supports_by_node_2d(d["supports"]).items():
        if s_["type"] == "spring":
            kx, ky, kz = (s_.get("kx") or 0.0), (s_.get("ky") or 0.0), (s_.get("kz") or 0.0)
            a = s_.get("angle") or 0.0
            ca, sa = math.cos(a), math.sin(a)
            if kx > 0:
                rows.append({(nid, 0): ca, (nid, 1): sa})
            if ky > 0:
                rows.append({(nid, 0): -sa, (nid, 1): ca})
            if kz > 0:
                rows.append({(nid, 2): 1.0})
        else:
            for k, f in enumerate(SUPPORT_FLAGS_2D.get(s_["type"], (0, 0, 0))):
                if f:
                    fixed.add((nid, k))
    dofs = [(nid, k) for nid in sorted(pts) for k in range(3)]
    free = _free(rows, dofs, fixed, (2,))
    return len(free) - _rank(rows, free)


def mechanisms_3d(d):
    pts = {n["id"]: (n["x"], n["y"], n["z"]) for n in d["nodes"].values()}
    rows = []

    def dot(vec, node, base):
        return {(node, base + k): vec[k] for k in range(3)}

    def comb(*terms):
        out = {}
        for f, row in terms:
            for c, v in row.items():
                out[c] = out.get(c, 0.0) + f * v
        return out

    for e in d["elements"].values():
        i, j = e["nodeI"], e["nodeJ"]
        L = math.dist(pts[i], pts[j])
        ex, ey, ez = local_axes_3d(pts[i], pts[j], e)
        rows.append(comb((1, dot(ex, j, 0)), (-1, dot(ex, i, 0))))
        if e["type"] != "frame":
            continue
        rows.append(comb((1, dot(ex, j, 3)), (-1, dot(ex, i, 3))))
        # bending about local z: chord rotation ey.(u_j - u_i)/L;
        # about local y: -ez.(u_j - u_i)/L
        for ax, chord, rel in ((ez, comb((1 / L, dot(ey, j, 0)), (-1 / L, dot(ey, i, 0))), "releaseMz"),
                               (ey, comb((-1 / L, dot(ez, j, 0)), (1 / L, dot(ez, i, 0))), "releaseMy")):
            for node, end in ((i, "Start"), (j, "End")):
                if not e.get(rel + end):
                    rows.append(comb((1, dot(ax, node, 3)), (-1, chord)))
    fixed = set()
    flags = ["rx", "ry", "rz", "rrx", "rry", "rrz"]
    springs = ["kx", "ky", "kz", "krx", "kry", "krz"]
    for s_ in d["supports"].values():
        nid = s_["nodeId"]
        for k in range(6):
            if (s_.get(springs[k]) or 0.0) > 0:
                rows.append({(nid, k): 1.0})
            elif s_.get(flags[k]):
                fixed.add((nid, k))
    dofs = [(nid, k) for nid in sorted(pts) for k in range(6)]
    free = _free(rows, dofs, fixed, (3, 4, 5))
    return len(free) - _rank(rows, free)


def orphan_rotation_nodes_2d(d):
    """Nodes whose rotation only the artificial stiffness holds (2D)."""
    rot = set()
    for e in d["elements"].values():
        if e["type"] == "frame":
            if not e.get("hingeStart"):
                rot.add(e["nodeI"])
            if not e.get("hingeEnd"):
                rot.add(e["nodeJ"])
    for s_ in d["supports"].values():
        if s_["type"] in ("fixed", "guidedX", "guidedY", "guidedZ") or \
                (s_["type"] == "spring" and (s_.get("kz") or 0.0) > 0):
            rot.add(s_["nodeId"])
    return {n["id"] for n in d["nodes"].values()} - rot
