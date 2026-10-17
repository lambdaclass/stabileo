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

Geometry and properties stay in engineering ranges so most models are
well-conditioned; mechanisms are filtered out by the harness (both solvers
must succeed). Deterministic in the seed.
"""

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


def rich_2d(seed):
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
            s["dx"] = rng.uniform(-0.01, 0.01)
            s["dz"] = rng.uniform(-0.01, 0.01)
            s["dry"] = rng.uniform(-0.002, 0.002)
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


def rich_3d(seed):
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
            for key in ("dx", "dy", "dz"):
                s[key] = rng.uniform(-0.01, 0.01)
            for key in ("drx", "dry", "drz"):
                s[key] = rng.uniform(-0.002, 0.002)
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
