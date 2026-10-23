"""Random stabileo models that exercise more of the converter-supported
feature set than engine/tests/fuzz_models (which only makes default-axis
frames, nodal/full-length loads and rigid supports, and mostly mechanisms):

  2D: frames + trusses, hinges, Timoshenko sections (asY), springs (also
      rotated), guided/roller supports, settlements, partial trapezoidal
      loads, point loads with axial force and concentrated moment.
  3D: frames + trusses, explicit local-y vectors, roll angles, vertical
      members, My/Mz releases, Timoshenko sections (asY/asZ), translational
      and rotational springs, settlements, partial trapezoidal loads with
      axial component, point loads.

Geometry and properties stay in engineering ranges. Hinges and releases
are drawn at random and often leave a mechanism (a member hanging on a
hinge, a node free to turn about one axis): before this was checked, 40 %
of rich3d and 25 % of rich2d models were mechanisms that no comparison
could use. `stability.py` finds them exactly (independently of stabileo
and of the references), and in 90 % of the models the hinges / releases
that cause one are dropped, and nodal moments on rotations nothing
stiffens are zeroed. The other 10 % are kept as drawn, so that stabileo's
singularity diagnostics and refusals stay exercised (and cross-checked:
refused / false_reject / false_warning). Deterministic in the seed.
"""

import json
import math
import random


def _connected_edges(rng, n, extra):
    """[(i, j, is_tree_edge)]: a random spanning tree plus `extra` chords."""
    tree = set()
    for i in range(1, n):
        tree.add((rng.randrange(i), i))
    chords = set()
    for _ in range(extra):
        i, j = rng.sample(range(n), 2)
        if not ({(i, j), (j, i)} & (tree | chords)):
            chords.add((i, j))
    out = [(i, j, True) for i, j in sorted(tree)] + [(i, j, False) for i, j in sorted(chords)]
    return [(i, j, t) if rng.random() < 0.5 else (j, i, t) for i, j, t in out]


# Fraction of rich models kept exactly as drawn, mechanisms included.
KEEP_DEGENERATE = 0.1


def _well_posed(m, seed, dim):
    """Drop the hinges / releases that make m a mechanism (greedily, each
    one whose removal lowers the number of mechanisms), and the nodal
    moments on rotations only the engine's artificial stiffness holds;
    unless this seed keeps its model as drawn (KEEP_DEGENERATE)."""
    import stability
    if random.Random(1_000_003 * seed + 17).random() < KEEP_DEGENERATE:
        return m
    count = stability.mechanisms_3d if dim == 3 else stability.mechanisms_2d
    keys = ("hingeStart", "hingeEnd") if dim == 2 else \
        ("releaseMyStart", "releaseMyEnd", "releaseMzStart", "releaseMzEnd")
    n = count(m)
    while n > 0:
        cands = [(e, k) for _, e in sorted(m["elements"].items(), key=lambda kv: kv[1]["id"])
                 for k in keys if e.get(k)]
        if not cands:
            break
        for e, k in cands:
            e[k] = False
            n2 = count(m)
            if n2 < n:
                n = n2
                break
            e[k] = True
        else:
            for e, k in cands:  # no single release matters alone: drop them all
                e[k] = False
            n = count(m)
    if dim == 2:
        orphan = stability.orphan_rotation_nodes_2d(m)
        for ld in m["loads"]:
            if ld["type"] == "nodal" and ld["data"]["nodeId"] in orphan:
                ld["data"]["my"] = 0.0
    return m


def rich_2d(seed):
    return _well_posed(_rich_2d(seed), seed, 2)


def rich_3d(seed):
    return _well_posed(_rich_3d(seed), seed, 3)


def _rich_2d(seed):
    rng = random.Random(seed)
    n = rng.randint(3, 9)
    pts = []
    while len(pts) < n:
        p = (round(rng.uniform(0, 12), 3), round(rng.uniform(0, 8), 3))
        if all(math.dist(p, q) > 1.0 for q in pts):
            pts.append(p)
    nodes = {str(i + 1): {"id": i + 1, "x": p[0], "z": p[1]} for i, p in enumerate(pts)}
    mats = {str(i): {"id": i, "e": rng.choice([2e5, 3e4, 7e4, rng.uniform(1e4, 3e5)]),
                     "nu": rng.uniform(0.15, 0.35)} for i in (1, 2)}
    secs = {}
    timo = rng.random() < 0.3  # Timoshenko section in ~30% of the models
    for i in (1, 2, 3):
        h = rng.uniform(0.15, 0.8)
        b = rng.uniform(0.1, 0.5)
        s = {"id": i, "a": b * h, "iz": b * h ** 3 / 12}
        if i == 3 and timo:
            s["asY"] = 5 / 6 * b * h  # Timoshenko section
        secs[str(i)] = s
    elems = {}
    for k, (i, j, tree) in enumerate(_connected_edges(rng, n, rng.randint(0, 3)), start=1):
        # Trusses only as chords: a truss in the spanning tree is usually a
        # mechanism (a bar end hanging free).
        typ = "truss" if not tree and rng.random() < 0.6 else "frame"
        sec = rng.choice([1, 2, 3])
        e = {"id": k, "type": typ, "nodeI": i + 1, "nodeJ": j + 1,
             "materialId": rng.choice([1, 2]), "sectionId": sec,
             "hingeStart": False, "hingeEnd": False}
        if typ == "frame":
            e["hingeStart"] = rng.random() < 0.15
            e["hingeEnd"] = rng.random() < 0.15
        elems[str(k)] = e
    sups = {"1": {"id": 1, "nodeId": 1, "type": "fixed"}}
    for k, nid in enumerate(rng.sample(range(2, n + 1), rng.randint(1, min(3, n - 1))), start=2):
        typ = rng.choice(["fixed", "pinned", "rollerX", "rollerZ", "guidedX", "guidedZ", "spring", "spring"])
        s = {"id": k, "nodeId": nid, "type": typ}
        if typ == "spring":
            s["kx"] = rng.choice([0.0, rng.uniform(1e3, 1e6)])
            s["ky"] = rng.uniform(1e3, 1e6)
            s["kz"] = rng.choice([0.0, rng.uniform(1e3, 1e5)])
            if rng.random() < 0.4:
                s["angle"] = rng.uniform(-1.2, 1.2)
        elif rng.random() < 0.3:
            fl = {"fixed": (1, 1, 1), "pinned": (1, 1, 0), "rollerX": (0, 1, 0),
                  "rollerZ": (1, 0, 0), "guidedX": (0, 1, 1), "guidedZ": (1, 0, 1)}[typ]
            for key, r_, lim in (("dx", fl[0], 0.01), ("dz", fl[1], 0.01), ("dry", fl[2], 0.002)):
                v = rng.uniform(-lim, lim)
                if r_:
                    s[key] = v
        sups[str(k)] = s
    loads = []
    lengths = {e["id"]: math.dist(pts[e["nodeI"] - 1], pts[e["nodeJ"] - 1]) for e in elems.values()}
    for _ in range(rng.randint(1, 6)):
        kind = rng.random()
        if kind < 0.3:
            loads.append({"type": "nodal", "data": {"nodeId": rng.randint(1, n), "fx": rng.uniform(-50, 50),
                                                    "fz": rng.uniform(-50, 50), "my": rng.uniform(-30, 30)}})
            continue
        e = rng.choice(list(elems.values()))
        L = lengths[e["id"]]
        if kind < 0.65:
            d = {"elementId": e["id"], "qI": rng.uniform(-20, 20), "qJ": rng.uniform(-20, 20)}
            if rng.random() < 0.3:
                d["qJ"] = d["qI"]
            if rng.random() < 0.4:
                a = rng.uniform(0, 0.6) * L
                d["a"], d["b"] = a, rng.uniform(a + 0.1 * L, L)
            loads.append({"type": "distributed", "data": d})
        else:
            d = {"elementId": e["id"], "a": rng.uniform(0.1, 0.9) * L, "p": rng.uniform(-60, 60)}
            if rng.random() < 0.5:
                d["px"] = rng.uniform(-40, 40)
            if rng.random() < 0.5:
                d["my"] = rng.uniform(-40, 40)
            loads.append({"type": "pointOnElement", "data": d})
    return {"nodes": nodes, "materials": mats, "sections": secs, "elements": elems,
            "supports": sups, "loads": loads}


def _rich_3d(seed):
    rng = random.Random(seed)
    n = rng.randint(3, 9)
    pts = []
    while len(pts) < n:
        if pts and rng.random() < 0.25:
            q = rng.choice(pts)  # a vertical member candidate
            p = (q[0], q[1], round(q[2] + rng.choice([-1, 1]) * rng.uniform(2, 5), 3))
        else:
            p = tuple(round(rng.uniform(0, 8), 3) for _ in range(3))
        if all(math.dist(p, q) > 1.0 for q in pts):
            pts.append(p)
    nodes = {str(i + 1): {"id": i + 1, "x": p[0], "y": p[1], "z": p[2]} for i, p in enumerate(pts)}
    mats = {str(i): {"id": i, "e": rng.choice([2e5, 3e4, rng.uniform(1e4, 3e5)]),
                     "nu": rng.uniform(0.15, 0.35)} for i in (1, 2)}
    secs = {}
    timo = rng.random() < 0.3  # Timoshenko section in ~30% of the models
    for i in (1, 2, 3):
        h, b = rng.uniform(0.15, 0.8), rng.uniform(0.1, 0.5)
        s = {"id": i, "a": b * h, "iy": b * h ** 3 / 12, "iz": h * b ** 3 / 12,
             "j": rng.uniform(0.2, 1.0) * b ** 3 * h / 3}
        if i == 3 and timo:
            s["asY"] = 5 / 6 * b * h * rng.uniform(0.5, 1.0)
            s["asZ"] = 5 / 6 * b * h * rng.uniform(0.5, 1.0)
        secs[str(i)] = s
    elems = {}
    edges = _connected_edges(rng, n, rng.randint(0, 3))
    for k, (i, j, tree) in enumerate(edges, start=1):
        typ = "truss" if not tree and rng.random() < 0.6 else "frame"
        sec = rng.choice([1, 2, 3])
        e = {"id": k, "type": typ, "nodeI": i + 1, "nodeJ": j + 1,
             "materialId": rng.choice([1, 2]), "sectionId": sec}
        if typ == "frame":
            r = rng.random()
            if r < 0.25:
                v = [rng.uniform(-1, 1) for _ in range(3)]
                e["localYx"], e["localYy"], e["localYz"] = v
            elif r < 0.5:
                e["rollAngle"] = rng.uniform(-180, 180)
            for key in ("releaseMyStart", "releaseMyEnd", "releaseMzStart", "releaseMzEnd"):
                if rng.random() < 0.1:
                    e[key] = True
        elems[str(k)] = e
    flag = ["rx", "ry", "rz", "rrx", "rry", "rrz"]
    sups = {"1": {"nodeId": 1, **{f: True for f in flag}}}
    for k, nid in enumerate(rng.sample(range(2, n + 1), rng.randint(1, min(3, n - 1))), start=2):
        s = {"nodeId": nid, **{f: rng.random() < 0.6 for f in flag}}
        if rng.random() < 0.4:
            for key in ("kx", "ky", "kz", "krx", "kry", "krz"):
                if rng.random() < 0.4:
                    s[key] = rng.uniform(1e3, 1e6)
        if rng.random() < 0.3:
            for key, fl, sp in (("dx", "rx", "kx"), ("dy", "ry", "ky"), ("dz", "rz", "kz")):
                v = rng.uniform(-0.01, 0.01)
                if s[fl] and not s.get(sp):
                    s[key] = v
            for key, fl, sp in (("drx", "rrx", "krx"), ("dry", "rry", "kry"), ("drz", "rrz", "krz")):
                v = rng.uniform(-0.002, 0.002)
                if s[fl] and not s.get(sp):
                    s[key] = v
        sups[str(k)] = s
    loads = []
    lengths = {e["id"]: math.dist(pts[e["nodeI"] - 1], pts[e["nodeJ"] - 1]) for e in elems.values()}
    for _ in range(rng.randint(1, 6)):
        kind = rng.random()
        if kind < 0.3:
            loads.append({"type": "nodal", "data": {"nodeId": rng.randint(1, n),
                          **{k: rng.uniform(-50, 50) for k in ("fx", "fy", "fz")},
                          **{k: rng.uniform(-30, 30) for k in ("mx", "my", "mz")}}})
            continue
        e = rng.choice(list(elems.values()))
        L = lengths[e["id"]]
        if kind < 0.65:
            d = {"elementId": e["id"], **{k: rng.uniform(-20, 20) for k in ("qYI", "qYJ", "qZI", "qZJ")}}
            if rng.random() < 0.3:
                d["qXI"], d["qXJ"] = rng.uniform(-10, 10), rng.uniform(-10, 10)
            if rng.random() < 0.3:
                d["qYJ"], d["qZJ"] = d["qYI"], d["qZI"]
                if "qXI" in d:
                    d["qXJ"] = d["qXI"]
            if rng.random() < 0.4:
                a = rng.uniform(0, 0.6) * L
                d["a"], d["b"] = a, rng.uniform(a + 0.1 * L, L)
            loads.append({"type": "distributed", "data": d})
        else:
            loads.append({"type": "pointOnElement", "data": {"elementId": e["id"], "a": rng.uniform(0.1, 0.9) * L,
                                                             "py": rng.uniform(-60, 60), "pz": rng.uniform(-60, 60)}})
    return {"nodes": nodes, "materials": mats, "sections": secs, "elements": elems,
            "supports": sups, "loads": loads}


# ------------------------------------------------ extended analyses
#
# Jobs for compare.py's buckling / modal / pdelta / th comparisons:
# {"analysis": kind, "model": stabileo model, ...spec}. Models are building
# frames (frame_2d / frame_3d: storeys, bays, braces, gravity + lateral loads)
# and the rich random models above, stripped to what each analysis compares
# exactly (geomify / dynamify).

DENSITY = {"1": 7850.0, "2": 2500.0}


def frame_2d(seed):
    """A plane building frame: 1-3 bays, 1-4 storeys, slightly skewed columns,
    optional truss braces, fixed/pinned/spring bases, gravity loads (column
    tops + full-length beam loads) and small lateral loads."""
    rng = random.Random(seed)
    nb, ns = rng.randint(1, 3), rng.randint(1, 4)
    xs = [0.0]
    for _ in range(nb):
        xs.append(xs[-1] + rng.uniform(3, 8))
    zs = [0.0]
    for _ in range(ns):
        zs.append(zs[-1] + rng.uniform(2.5, 4.5))
    nid = {}
    nodes = {}
    for j, z in enumerate(zs):
        for i, x in enumerate(xs):
            k = len(nodes) + 1
            nid[i, j] = k
            dx = 0.0 if j == 0 else rng.uniform(-0.15, 0.15)
            nodes[str(k)] = {"id": k, "x": round(x + dx, 4), "z": round(z, 4)}
    steel = rng.random() < 0.5
    mats = {"1": {"id": 1, "e": 2e5, "nu": 0.3}, "2": {"id": 2, "e": 3e4, "nu": 0.2}}
    mcol = 1 if steel else 2
    secs = {}
    for i in (1, 2, 3):
        if steel:
            a, iz = rng.uniform(4e-3, 2e-2), rng.uniform(5e-5, 6e-4)
        else:
            h, b = rng.uniform(0.25, 0.6), rng.uniform(0.25, 0.5)
            a, iz = b * h, b * h ** 3 / 12
        secs[str(i)] = {"id": i, "a": a, "iz": iz}
    secs["4"] = {"id": 4, "a": rng.uniform(1e-3, 4e-3), "iz": 1e-6}
    elems = {}

    def add(typ, ni, nj, sec, mat):
        k = len(elems) + 1
        elems[str(k)] = {"id": k, "type": typ, "nodeI": ni, "nodeJ": nj, "materialId": mat,
                         "sectionId": sec, "hingeStart": False, "hingeEnd": False}
        return k
    beams = []
    for j in range(ns):
        for i in range(nb + 1):
            add("frame", nid[i, j], nid[i, j + 1], rng.choice([1, 2]), mcol)
    for j in range(1, ns + 1):
        for i in range(nb):
            beams.append(add("frame", nid[i, j], nid[i + 1, j], 3, mcol))
    for j in range(ns):
        for i in range(nb):
            if rng.random() < 0.3:
                a, b = (nid[i, j], nid[i + 1, j + 1]) if rng.random() < 0.5 else (nid[i + 1, j], nid[i, j + 1])
                add("truss", a, b, 4, 1)
    sups = {}
    for i in range(nb + 1):
        typ = rng.choice(["fixed", "fixed", "pinned", "spring"])
        s = {"id": i + 1, "nodeId": nid[i, 0], "type": typ}
        if typ == "spring":
            s.update(kx=rng.uniform(1e5, 1e7), ky=rng.uniform(1e5, 1e7), kz=rng.uniform(1e4, 1e6))
        sups[str(i + 1)] = s
    loads = []
    for j in range(1, ns + 1):
        for i in range(nb + 1):
            if rng.random() < 0.7:
                loads.append({"type": "nodal", "data": {"nodeId": nid[i, j], "fx": 0.0,
                                                        "fz": -rng.uniform(50, 600), "my": 0.0}})
        if rng.random() < 0.6:
            loads.append({"type": "nodal", "data": {"nodeId": nid[0, j], "fx": rng.uniform(-30, 30),
                                                    "fz": 0.0, "my": 0.0}})
    for b in beams:
        if rng.random() < 0.6:
            q = -rng.uniform(5, 40)
            loads.append({"type": "distributed", "data": {"elementId": b, "qI": q, "qJ": q}})
    return {"nodes": nodes, "materials": mats, "sections": secs, "elements": elems,
            "supports": sups, "loads": loads}


def frame_3d(seed):
    """A space building frame: 1-2 x 1-2 bays, 1-3 storeys, rolled columns,
    explicit beam local-y vectors, truss braces, fixed/pinned bases, gravity +
    lateral loads, full-length beam loads (some with an axial part)."""
    rng = random.Random(seed)
    nx, ny, ns = rng.randint(1, 2), rng.randint(1, 2), rng.randint(1, 3)
    xs, ys, zs = [0.0], [0.0], [0.0]
    for v, n, lo, hi in ((xs, nx, 3, 7), (ys, ny, 3, 7), (zs, ns, 2.5, 4.0)):
        for _ in range(n):
            v.append(v[-1] + rng.uniform(lo, hi))
    nid, nodes = {}, {}
    for k, z in enumerate(zs):
        for j, y in enumerate(ys):
            for i, x in enumerate(xs):
                t = len(nodes) + 1
                nid[i, j, k] = t
                d = (0.0, 0.0) if k == 0 else (rng.uniform(-0.1, 0.1), rng.uniform(-0.1, 0.1))
                nodes[str(t)] = {"id": t, "x": round(x + d[0], 4), "y": round(y + d[1], 4), "z": round(z, 4)}
    mats = {"1": {"id": 1, "e": 2e5, "nu": 0.3}, "2": {"id": 2, "e": 3e4, "nu": 0.2}}
    mfr = rng.choice([1, 2])
    secs = {}
    for i in (1, 2, 3):
        h, b = rng.uniform(0.25, 0.6), rng.uniform(0.2, 0.45)
        sc = 0.05 if mfr == 1 else 1.0  # steel: thin-walled-ish properties
        secs[str(i)] = {"id": i, "a": b * h * sc ** 0.5, "iy": b * h ** 3 / 12 * sc, "iz": h * b ** 3 / 12 * sc,
                        "j": 0.6 * b ** 3 * h / 3 * sc}
    secs["4"] = {"id": 4, "a": rng.uniform(1e-3, 4e-3), "iy": 1e-6, "iz": 1e-6, "j": 1e-6}
    elems = {}

    def add(typ, a, b, sec, mat, **kw):
        t = len(elems) + 1
        elems[str(t)] = {"id": t, "type": typ, "nodeI": a, "nodeJ": b, "materialId": mat, "sectionId": sec, **kw}
        return t
    beams = []
    for k in range(ns):
        for j in range(ny + 1):
            for i in range(nx + 1):
                kw = {}
                if rng.random() < 0.4:
                    kw["rollAngle"] = rng.choice([90.0, rng.uniform(-180, 180)])
                add("frame", nid[i, j, k], nid[i, j, k + 1], rng.choice([1, 2]), mfr, **kw)
    for k in range(1, ns + 1):
        for j in range(ny + 1):
            for i in range(nx + 1):
                for di, dj in ((1, 0), (0, 1)):
                    if i + di <= nx and j + dj <= ny:
                        kw = {}
                        if rng.random() < 0.25:
                            v = [rng.uniform(-1, 1) for _ in range(3)]
                            kw = {"localYx": v[0], "localYy": v[1], "localYz": v[2]}
                        beams.append(add("frame", nid[i, j, k], nid[i + di, j + dj, k], 3, mfr, **kw))
    for k in range(ns):
        for j in range(ny + 1):
            for i in range(nx):
                if rng.random() < 0.25:
                    add("truss", nid[i, j, k], nid[i + 1, j, k + 1], 4, 1)
    sups = {}
    pinned = rng.random() < 0.3
    for j in range(ny + 1):
        for i in range(nx + 1):
            t = len(sups) + 1
            rot = not pinned or rng.random() < 0.3
            sups[str(t)] = {"nodeId": nid[i, j, 0], "rx": True, "ry": True, "rz": True,
                            "rrx": rot, "rry": rot, "rrz": rot}
    loads = []
    zero = {k: 0.0 for k in ("fx", "fy", "fz", "mx", "my", "mz")}
    for k in range(1, ns + 1):
        for j in range(ny + 1):
            for i in range(nx + 1):
                if rng.random() < 0.7:
                    loads.append({"type": "nodal", "data": {**zero, "nodeId": nid[i, j, k], "fz": -rng.uniform(50, 500)}})
        if rng.random() < 0.6:
            loads.append({"type": "nodal", "data": {**zero, "nodeId": nid[0, 0, k],
                                                    "fx": rng.uniform(-30, 30), "fy": rng.uniform(-30, 30)}})
    for b in beams:
        if rng.random() < 0.5:
            d = {"elementId": b, "qYI": 0.0, "qYJ": 0.0, "qZI": 0.0, "qZJ": 0.0}
            q = -rng.uniform(5, 30)
            d["qZI"] = d["qZJ"] = q
            if rng.random() < 0.2:
                d["qXI"] = d["qXJ"] = rng.uniform(-5, 5)
            loads.append({"type": "distributed", "data": d})
    return {"nodes": nodes, "materials": mats, "sections": secs, "elements": elems,
            "supports": sups, "loads": loads}


def geomify(d, rng):
    """Strip a rich model to what the geometric analyses compare exactly: no
    hinges/releases or Timoshenko sections, member loads full-length uniform,
    2D springs neither rotated nor on restrained supports (the 2D buckling
    path's sparse assembly has known bugs there), plus a compressive load."""
    d = json.loads(json.dumps(d))
    for e in d["elements"].values():
        for k in ("hingeStart", "hingeEnd"):
            if k in e:
                e[k] = False
        for k in ("releaseMyStart", "releaseMyEnd", "releaseMzStart", "releaseMzEnd"):
            e.pop(k, None)
    for s in d["sections"].values():
        s.pop("asY", None)
        s.pop("asZ", None)
    _plain_supports(d)
    ftype = {e["id"]: e["type"] for e in d["elements"].values()}
    keep = []
    for ld in d["loads"]:
        x = ld["data"]
        if ld["type"] == "nodal" or ftype[x["elementId"]] == "truss":
            keep.append(ld)
        elif ld["type"] == "distributed":
            x.pop("a", None)
            x.pop("b", None)
            for k in ("q", "qY", "qZ", "qX"):
                if k + "I" in x:
                    x[k + "J"] = x[k + "I"]
            keep.append(ld)
    d["loads"] = keep
    n = rng.choice([v["id"] for v in d["nodes"].values()])
    load = {"nodeId": n, "fx": 0.0, "fz": -rng.uniform(100, 2000), "my": 0.0}
    if "y" in next(iter(d["nodes"].values())) and _is3(d):
        load = {"nodeId": n, "fx": 0.0, "fy": 0.0, "fz": load["fz"], "mx": 0.0, "my": 0.0, "mz": 0.0}
    d["loads"].append({"type": "nodal", "data": load})
    return d


def _is3(d):
    return any("y" in n and "z" in n for n in d["nodes"].values())


def _plain_supports(d):
    """2D: drop spring angles and springs on rigidly restrained supports."""
    if _is3(d):
        return
    for s in d["supports"].values():
        s.pop("angle", None)
        if s["type"] != "spring":
            for k in ("kx", "ky", "kz"):
                s.pop(k, None)


def _model(kind, dim, seed):
    """Building frame for even seeds, rich random model for odd ones."""
    rng = random.Random(seed * 7 + 3)
    if seed % 2 == 0 or kind == "th":
        return (frame_2d if dim == 2 else frame_3d)(seed), rng
    d = (rich_2d if dim == 2 else rich_3d)(seed)
    return d, rng


def job(kind, dim, seed):
    d, rng = _model(kind, dim, seed)
    if kind in ("buckling", "pdelta"):
        if seed % 2 == 1:
            d = geomify(d, rng)
        if kind == "buckling":
            # OpenSees' linear step would see the settlement through the
            # already-geometric elements (the residual at the imposed trial
            # displacement includes N*Kg*u): not the linear solution.
            for s in d["supports"].values():
                for k in ("dx", "dy", "dz", "drx", "dry", "drz"):
                    s.pop(k, None)
        if kind == "pdelta":
            # Second-order effects of a few percent to ~2x: the buckling load
            # factor of these models is mostly 2..50.
            for ld in d["loads"]:
                f = rng.uniform(0.5, 2.0)
                for k, v in ld["data"].items():
                    if k not in ("nodeId", "elementId", "a", "b") and isinstance(v, float):
                        ld["data"][k] = v * f
        j = {"analysis": kind, "model": d}
        if kind == "buckling":
            j["numModes"] = 4
        return j
    _plain_supports(d)
    for s in d["supports"].values():
        for k in ("dx", "dy", "dz", "drx", "dry", "drz"):
            s.pop(k, None)  # settlements are not part of a dynamic analysis
    dens = {m: DENSITY["1"] if d["materials"][m]["e"] > 1e5 else DENSITY["2"] for m in d["materials"]}
    if kind == "modal":
        d["loads"] = []
        return {"analysis": "modal", "model": d, "densities": dens, "numModes": rng.randint(3, 6)}
    # th: 60-200 steps of a ground motion (two sines from rest) or a nodal
    # force pulse, Newmark average acceleration or HHT, 0-5 % damping.
    loads = d["loads"]
    d["loads"] = []
    nsteps = rng.randint(60, 200)
    dt = rng.choice([0.002, 0.005, 0.01])
    j = {"analysis": "th", "model": d, "densities": dens, "dt": dt, "nSteps": nsteps,
         "dampingXi": rng.choice([0.0, 0.02, 0.05])}
    if rng.random() < 0.5:
        j["alpha"] = -rng.uniform(0.0, 1.0 / 3.0)
    if rng.random() < 0.5:
        f1, f2 = rng.uniform(0.5, 5), rng.uniform(5, 20)
        a1, a2 = rng.uniform(0.5, 3), rng.uniform(0.1, 1)
        j["groundAccel"] = [a1 * math.sin(2 * math.pi * f1 * n * dt) + a2 * math.sin(2 * math.pi * f2 * n * dt)
                            for n in range(nsteps + 1)]
        j["groundDir"] = rng.choice([1, 1, 2] if dim == 2 else [1, 2, 3])
    else:
        # Breakpoints on steps: HHT evaluates the load at t_n + (1+alpha) dt in
        # OpenSees, a sample-and-blend of f_n, f_n+1 in the engine; the two
        # agree only while the load is linear over the step.
        t1 = round(rng.uniform(0.1, 0.5) * nsteps) * dt
        j["forceTimes"] = [0.0, t1, 2 * t1, 3 * t1]
        j["forceFactors"] = [0.0, 1.0, rng.uniform(-1, 1), 0.0]
        nodal = [ld["data"] for ld in loads if ld["type"] == "nodal"]
        keys = ("fx", "fz", "my") if dim == 2 else ("fx", "fy", "fz", "mx", "my", "mz")
        j["forceLoads"] = [[x["nodeId"], [x.get(k, 0.0) or 0.0 for k in keys]] for x in nodal] or \
            [[next(iter(d["nodes"].values()))["id"], [10.0] * len(keys)]]
        if dim == 2:
            for _, f in j["forceLoads"]:
                f[0] += rng.uniform(5, 50)  # some horizontal excitation
    return j


def plate(seed):
    """A flat plate in the z = 0 plane for the shell comparison: an nx x ny
    mesh of MITC4 quads, DKT triangles (each quad split along a random
    diagonal) or both, interior nodes jittered, each edge free / simply
    supported / clamped (stable combinations only), edge beams on some grid
    lines, nodal forces and moments and element pressures. Every node's
    in-plane translations and drilling rotation are restrained, so the
    comparison is of plate bending (where the engine's MITC4 and DKT are the
    formulations of OpenSees' ShellMITC4 and ShellDKGT) and of beam bending
    and torsion coupled to it."""
    rng = random.Random(seed)
    nx, ny = rng.randint(2, 6), rng.randint(2, 6)
    mode = rng.choice(["quad", "tri", "mixed"])
    # Graded spacings under one skew: every quad is a parallelogram. OpenSees'
    # ShellMITC4 turns the tied shear strains into Cartesian ones with the
    # constant angles of Dvorkin & Bathe (1984), the engine with J^-1 at each
    # Gauss point; the two agree exactly only where J is constant. Triangles
    # (DKT on both sides) also get their interior nodes jittered.
    xs, ys = [0.0], [0.0]
    for v, n in ((xs, nx), (ys, ny)):
        for _ in range(n):
            v.append(v[-1] + rng.uniform(0.5, 2.0))
    skew = rng.uniform(-0.4, 0.4) if rng.random() < 0.6 else 0.0
    nid, nodes = {}, {}
    for j in range(ny + 1):
        for i in range(nx + 1):
            k = len(nodes) + 1
            nid[i, j] = k
            dx = dy = 0.0
            if mode == "tri" and 0 < i < nx and 0 < j < ny:
                dx = rng.uniform(-0.15, 0.15) * (xs[i + 1] - xs[i - 1]) / 2
                dy = rng.uniform(-0.15, 0.15) * (ys[j + 1] - ys[j - 1]) / 2
            x, y = xs[i] + dx, ys[j] + dy
            nodes[str(k)] = {"id": k, "x": round(x + skew * y, 6), "y": round(y, 6), "z": 0.0}
    mats = {"1": {"id": 1, "e": rng.choice([3e4, 2e5]), "nu": rng.uniform(0.15, 0.3)}}
    th = rng.uniform(0.08, 0.3)
    quads, plates = {}, {}
    for j in range(ny):
        for i in range(nx):
            c = [nid[i, j], nid[i + 1, j], nid[i + 1, j + 1], nid[i, j + 1]]
            if mode == "quad" or (mode == "mixed" and rng.random() < 0.5):
                k = len(quads) + 1
                quads[str(k)] = {"id": k, "nodes": c, "materialId": 1, "thickness": th}
            else:
                tris = [(c[0], c[1], c[2]), (c[0], c[2], c[3])] if rng.random() < 0.5 else \
                    [(c[0], c[1], c[3]), (c[1], c[2], c[3])]
                for t in tris:
                    k = len(plates) + 1
                    plates[str(k)] = {"id": k, "nodes": list(t), "materialId": 1, "thickness": th}
    while True:
        edges = [rng.choice(["free", "ss", "clamped"]) for _ in range(4)]
        if sum({"free": 0, "ss": 1, "clamped": 2}[e] for e in edges) >= 2:
            break
    on_edge = {}
    for (i, j), k in nid.items():
        for e, hit in zip(edges, (j == 0, i == nx, j == ny, i == 0)):
            if hit and e != "free":
                on_edge.setdefault(k, set()).add(e)
    sups = {}
    for (i, j), k in nid.items():
        s = {"nodeId": k, "rx": True, "ry": True, "rz": False, "rrx": False, "rry": False, "rrz": True}
        for e in on_edge.get(k, ()):
            s["rz"] = True
            if e == "clamped":
                s["rrx"] = s["rry"] = True
        sups[str(k)] = s
    secs = {"1": {"id": 1, "a": 0.02, "iy": rng.uniform(1e-4, 2e-3), "iz": 1e-4, "j": rng.uniform(1e-5, 5e-4)}}
    elems = {}
    for j in range(1, ny):
        if rng.random() < 0.3:
            for i in range(nx):
                k = len(elems) + 1
                elems[str(k)] = {"id": k, "type": "frame", "nodeI": nid[i, j], "nodeJ": nid[i + 1, j],
                                 "materialId": 1, "sectionId": 1}
    loads = []
    zero = {k: 0.0 for k in ("fx", "fy", "fz", "mx", "my", "mz")}
    for _ in range(rng.randint(1, 4)):
        n = rng.choice(list(nid.values()))
        loads.append({"type": "nodal", "data": {**zero, "nodeId": n, "fz": rng.uniform(-50, 50),
                                                "mx": rng.uniform(-10, 10), "my": rng.uniform(-10, 10)}})
    for _ in range(rng.randint(0, 4)):
        if quads and (not plates or rng.random() < 0.5):
            loads.append({"type": "quadPressure", "data": {"elementId": rng.choice(list(quads.values()))["id"],
                                                           "pressure": rng.uniform(-20, 20)}})
        elif plates:
            loads.append({"type": "pressure", "data": {"elementId": rng.choice(list(plates.values()))["id"],
                                                       "pressure": rng.uniform(-20, 20)}})
    return {"nodes": nodes, "materials": mats, "sections": secs, "elements": elems, "supports": sups,
            "loads": loads, "plates": plates, "quads": quads}


def shell(seed, refine=1):
    """A thin-walled cantilever made of flat MITC4 panels (an angle, a channel
    or a box-like fold), clamped at x = 0, with tip forces and a pressure on
    one panel: shell behaviour, membrane and bending coupled at the folds.
    The engine's membrane (EAS-7, drilling penalty on θz − ω) and OpenSees'
    ShellMITC4 membrane (bilinear, Hughes-Brezzi drilling) are different
    formulations, so these compare to a discretisation tolerance, not to
    round-off; `refine` multiplies the mesh density."""
    rng = random.Random(seed)
    length = rng.uniform(2, 6)
    shape = rng.choice(["angle", "channel", "zed"])
    w = rng.uniform(0.3, 1.0)
    # The cross-section polyline in the (y, z) plane.
    if shape == "angle":
        pts = [(0.0, w), (0.0, 0.0), (w * rng.uniform(0.6, 1.2), 0.0)]
    elif shape == "channel":
        f = w * rng.uniform(0.3, 0.6)
        pts = [(f, w), (0.0, w), (0.0, 0.0), (f, 0.0)]
    else:
        f = w * rng.uniform(0.3, 0.6)
        pts = [(-f, w), (0.0, w), (0.0, 0.0), (f, 0.0)]
    nl = refine * rng.randint(8, 16)
    nw = refine * rng.randint(2, 4)
    sec = []  # polyline points, nw per segment
    for a, b in zip(pts, pts[1:]):
        for k in range(nw):
            sec.append((a[0] + (b[0] - a[0]) * k / nw, a[1] + (b[1] - a[1]) * k / nw))
    sec.append(pts[-1])
    nodes, nid = {}, {}
    for i in range(nl + 1):
        for j, (y, z) in enumerate(sec):
            k = len(nodes) + 1
            nid[i, j] = k
            nodes[str(k)] = {"id": k, "x": round(length * i / nl, 9), "y": y, "z": z}
    th = w * rng.uniform(0.02, 0.06)
    mats = {"1": {"id": 1, "e": rng.choice([7e4, 2e5]), "nu": 0.3}}
    quads = {}
    for i in range(nl):
        for j in range(len(sec) - 1):
            k = len(quads) + 1
            quads[str(k)] = {"id": k, "nodes": [nid[i, j], nid[i + 1, j], nid[i + 1, j + 1], nid[i, j + 1]],
                             "materialId": 1, "thickness": th}
    flag = ["rx", "ry", "rz", "rrx", "rry", "rrz"]
    sups = {str(j + 1): {"nodeId": nid[0, j], **{f: True for f in flag}} for j in range(len(sec))}
    zero = {k: 0.0 for k in ("fx", "fy", "fz", "mx", "my", "mz")}
    loads = []
    for j in rng.sample(range(len(sec)), min(2, len(sec))):
        loads.append({"type": "nodal", "data": {**zero, "nodeId": nid[nl, j], "fx": rng.uniform(-5, 5),
                                                "fy": rng.uniform(-5, 5), "fz": rng.uniform(-5, 5)}})
    seg = rng.randrange(len(pts) - 1)
    p = rng.uniform(-5, 5)
    for i in range(nl):
        for j in range(seg * nw, (seg + 1) * nw):
            loads.append({"type": "quadPressure", "data": {"elementId": i * (len(sec) - 1) + j + 1, "pressure": p}})
    return {"nodes": nodes, "materials": mats, "sections": {}, "elements": {}, "supports": sups,
            "loads": loads, "plates": {}, "quads": quads}
