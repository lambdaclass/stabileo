"""Random models for the Code_Aster harness: tools/opensees/gen_models.rich_3d
plus the features the other harnesses do not translate:

  * torsion releases (releaseT*) and releases at both ends of a member
  * connectors (6 stiffnesses, zero-length or not)
  * constraints: rigidLink (with rotations), equalDOF, diaphragm (XY/XZ/YZ),
    linearMPC, eccentricConnection (with releases)
  * thermal loads (uniform and gradients, frames and trusses)
  * inclined supports (normal translation restrained)

Deterministic in the seed. Mechanisms and ill-conditioned models are not
filtered here: stabileo flags them (stabileo_failed / ill_conditioned) and
the harness skips them.
"""

import math
import random

from gen_models import rich_3d


def _free_nodes(m):
    sup = {s["nodeId"] for s in m["supports"].values()}
    return [n["id"] for n in m["nodes"].values() if n["id"] not in sup]


def aster_3d(seed):
    m = rich_3d(seed)
    rng = random.Random(10_000_019 * (seed + 1))
    pts = {n["id"]: (n["x"], n["y"], n["z"]) for n in m["nodes"].values()}
    frames = [e for e in m["elements"].values() if e["type"] == "frame"]
    for e in frames:
        for key in ("releaseTStart", "releaseTEnd"):
            if rng.random() < 0.08:
                e[key] = True
    # A connector from an existing node to a new node, restrained beyond it
    # (a bearing / soil spring), or between two existing nodes.
    conns = {}
    next_node = max(pts) + 1
    for k in range(rng.choice([0, 0, 1, 2])):
        cid = k + 1
        kv = {key: rng.uniform(1e3, 1e6) for key in ("kAxial", "kShear", "kShearZ", "kMoment", "kBendY", "kBendZ")}
        ni = rng.choice(list(pts))
        if rng.random() < 0.6:
            off = [0.0, 0.0, 0.0] if rng.random() < 0.4 else [rng.uniform(-1.5, 1.5) for _ in range(3)]
            p = tuple(round(pts[ni][i] + off[i], 3) for i in range(3))
            nj = next_node
            next_node += 1
            m["nodes"][str(nj)] = {"id": nj, "x": p[0], "y": p[1], "z": p[2]}
            m["supports"][str(100 + cid)] = {"nodeId": nj, **{f: True for f in
                                                             ("rx", "ry", "rz", "rrx", "rry", "rrz")}}
        else:
            others = [n for n in pts if n != ni]
            nj = rng.choice(others)
        conns[str(cid)] = {"id": cid, "nodeI": ni, "nodeJ": nj, **kv}
    if conns:
        m["connectors"] = conns
    # Constraints between nodes not otherwise supported (a constraint on a
    # restrained DOF is over-determined).
    cons = []
    free = _free_nodes(m)
    ids = sorted(pts)
    if len(free) >= 1 and rng.random() < 0.5:
        sl = rng.choice(free)
        ms = rng.choice([n for n in ids if n != sl])
        kind = rng.choice(["rigidLink", "equalDOF", "diaphragm", "linearMPC", "eccentricConnection"])
        if kind == "rigidLink":
            dofs = [0, 1, 2] if rng.random() < 0.5 else list(range(6))
            cons.append({"type": "rigidLink", "masterNode": ms, "slaveNode": sl, "dofs": dofs})
        elif kind == "equalDOF":
            cons.append({"type": "equalDOF", "masterNode": ms, "slaveNode": sl,
                         "dofs": sorted(rng.sample(range(6), rng.randint(1, 4)))})
        elif kind == "diaphragm":
            slaves = [n for n in free if n != ms][:rng.randint(1, 3)]
            cons.append({"type": "diaphragm", "masterNode": ms, "slaveNodes": slaves,
                         "plane": rng.choice(["XY", "XZ", "YZ"])})
        elif kind == "linearMPC":
            cons.append({"type": "linearMPC", "terms": [
                {"nodeId": sl, "dof": d, "coefficient": 1.0} for d in [rng.randrange(6)]] + [
                {"nodeId": ms, "dof": rng.randrange(6), "coefficient": rng.uniform(-2, 2)}]})
        else:
            off = [round(pts[sl][i] - pts[ms][i], 3) for i in range(3)]
            rel = [False] * 6
            if rng.random() < 0.5:
                rel[rng.randrange(3, 6)] = True
            cons.append({"type": "eccentricConnection", "masterNode": ms, "slaveNode": sl,
                         "offsetX": off[0], "offsetY": off[1], "offsetZ": off[2], "releases": rel})
    if cons:
        m["constraints"] = cons
    # Thermal loads.
    for _ in range(rng.choice([0, 0, 1, 2])):
        e = rng.choice(list(m["elements"].values()))
        m["loads"].append({"type": "thermal", "data": {
            "elementId": e["id"], "dtUniform": rng.uniform(-40, 40),
            "dtGradientY": rng.uniform(-20, 20), "dtGradientZ": rng.uniform(-20, 20)}})
    # An inclined support on a free node.
    free = _free_nodes(m)
    if free and rng.random() < 0.25:
        nid = rng.choice(free)
        nv = [rng.uniform(-1, 1) for _ in range(3)]
        if math.sqrt(sum(x * x for x in nv)) > 0.2:
            m["supports"][str(200)] = {"nodeId": nid, "rx": True, "ry": True, "rz": True,
                                       "rrx": False, "rry": False, "rrz": False, "isInclined": True,
                                       "normalX": nv[0], "normalY": nv[1], "normalZ": nv[2]}
    return m
