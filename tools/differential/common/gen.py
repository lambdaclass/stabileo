"""Random stabileo models for the differential harnesses.

Reuses tools/opensees/gen_models.py (rich_3d: frames + trusses, local-y
vectors, roll angles, vertical members, releases, Timoshenko sections,
springs, settlements, partial / trapezoidal loads with axial component,
point loads) and adds generators aimed at what the other programs cover:

  frame3d    rich_3d restricted to what every frame program has (frames only,
             no releases or springs, settlements only on restrained DOFs),
             with all sections Timoshenko in ~40% of the models.
  building   regular multi-storey 3D frames (columns, beams in both
             directions, optional bracing), floor loads and lateral loads.
  modal3d    frames with densities (stored under the "_densities" key, which
             the engine ignores), J = Iy + Iz so that every program's polar
             mass agrees, no loads.
  pdelta3d   buildings and columns with large compressive forces (nodal and
             full-length uniform loads only, Euler-Bernoulli sections).

`restrict(model, caps)` removes features a program lacks (caps: set of
"truss", "release", "spring", "settlement_free", "timoshenko", "point_load",
"partial_load", "axial_load"). Deterministic in the seed.
"""

import copy
import math
import random

from model import is_3d  # noqa: F401  (puts tools/opensees on sys.path)
import gen_models  # tools/opensees/gen_models.py

FLAGS = ("rx", "ry", "rz", "rrx", "rry", "rrz")
DISP = ("dx", "dy", "dz", "drx", "dry", "drz")
SPRINGS = ("kx", "ky", "kz", "krx", "kry", "krz")
RELEASES = ("releaseMyStart", "releaseMyEnd", "releaseMzStart", "releaseMzEnd", "releaseTStart", "releaseTEnd")


def restrict(model, caps):
    m = copy.deepcopy(model)
    for e in m["elements"].values():
        if "truss" not in caps and e["type"] == "truss":
            e["type"] = "frame"
        if "release" not in caps:
            for r in RELEASES:
                e.pop(r, None)
    if "spring" not in caps:
        for s in m["supports"].values():
            for k in SPRINGS:
                s.pop(k, None)
    if "settlement_free" not in caps:
        for s in m["supports"].values():
            for f, d in zip(FLAGS, DISP):
                if not s.get(f):
                    s.pop(d, None)
    if "timoshenko" not in caps:
        for s in m["sections"].values():
            s.pop("asY", None)
            s.pop("asZ", None)
    loads = []
    for ld in m["loads"]:
        x = ld["data"]
        if ld["type"] == "pointOnElement" and "point_load" not in caps:
            continue
        if ld["type"] == "distributed":
            if "partial_load" not in caps:
                x.pop("a", None)
                x.pop("b", None)
                for c in "XYZ":
                    if f"q{c}I" in x:
                        x[f"q{c}J"] = x[f"q{c}I"]
            if "axial_load" not in caps:
                x.pop("qXI", None)
                x.pop("qXJ", None)
        loads.append(ld)
    m["loads"] = loads
    # A node may carry several support records (flags are OR-ed); merge them
    # so that every translator sees one record per node.
    merged = {}
    for s in m["supports"].values():
        t = merged.setdefault(s["nodeId"], {"nodeId": s["nodeId"]})
        for k, v in s.items():
            if k in FLAGS:
                t[k] = bool(t.get(k)) or bool(v)
            elif k != "nodeId" and v is not None:
                t[k] = v
    m["supports"] = {str(k + 1): v for k, v in enumerate(merged[n] for n in sorted(merged))}
    return m


def rich3d(seed):
    return gen_models.rich_3d(seed)


def frame2d(seed):
    """rich_2d with frames only (no trusses, hinges or springs)."""
    m = copy.deepcopy(gen_models.rich_2d(seed))
    for e in m["elements"].values():
        e["type"] = "frame"
        e["hingeStart"] = e["hingeEnd"] = False
    for s in m["supports"].values():
        if s["type"] == "spring":
            s["type"] = "pinned"
            for k in ("kx", "ky", "kz", "angle"):
                s.pop(k, None)
    return m


def frame3d(seed):
    rng = random.Random(seed ^ 0x5F3D)
    m = restrict(gen_models.rich_3d(seed), {"timoshenko", "point_load", "partial_load", "axial_load"})
    if rng.random() < 0.4:
        for s in m["sections"].values():
            k = rng.uniform(0.3, 0.9)
            s["asY"] = k * s["a"]
            s["asZ"] = rng.uniform(0.3, 0.9) * s["a"]
    return m


def _section(rng, sid, timo=False):
    h, b = rng.uniform(0.2, 0.9), rng.uniform(0.15, 0.5)
    s = {"id": sid, "a": b * h, "iy": b * h ** 3 / 12, "iz": h * b ** 3 / 12,
         "j": rng.uniform(0.2, 1.0) * min(b, h) ** 3 * max(b, h) / 3}
    if timo:
        s["asY"], s["asZ"] = 5 / 6 * b * h, 5 / 6 * b * h
    return s


def building(seed, timo=None, uniform_only=False, braces=True):
    """Columns along +Z, beams along X and Y, optional diagonal braces."""
    rng = random.Random(seed)
    nx, ny, nz = rng.randint(1, 3), rng.randint(1, 3), rng.randint(1, 4)
    xs = [0.0]
    for _ in range(nx):
        xs.append(round(xs[-1] + rng.uniform(3, 8), 3))
    ys = [0.0]
    for _ in range(ny):
        ys.append(round(ys[-1] + rng.uniform(3, 8), 3))
    zs = [0.0]
    for _ in range(nz):
        zs.append(round(zs[-1] + rng.uniform(2.8, 4.5), 3))
    nodes, nid = {}, {}
    for k, z in enumerate(zs):
        for j, y in enumerate(ys):
            for i, x in enumerate(xs):
                n = len(nodes) + 1
                nid[i, j, k] = n
                nodes[str(n)] = {"id": n, "x": x, "y": y, "z": z}
    timo = rng.random() < 0.3 if timo is None else timo
    mats = {"1": {"id": 1, "e": rng.choice([2e5, 3e4, 2.1e5]), "nu": rng.choice([0.3, 0.2, 0.25])}}
    secs = {str(i): _section(rng, i, timo) for i in (1, 2, 3)}
    elems = {}

    def add(a, b, sec, **kw):
        k = len(elems) + 1
        elems[str(k)] = {"id": k, "type": "frame", "nodeI": a, "nodeJ": b, "materialId": 1, "sectionId": sec, **kw}
        return k

    col_roll = rng.choice([None, 0.0, 90.0, rng.uniform(-180, 180)])
    beams = []
    for k in range(nz):
        for j in range(ny + 1):
            for i in range(nx + 1):
                kw = {} if col_roll is None else {"rollAngle": col_roll}
                add(nid[i, j, k], nid[i, j, k + 1], 1, **kw)
    for k in range(1, nz + 1):
        for j in range(ny + 1):
            for i in range(nx + 1):
                if i < nx:
                    beams.append(add(nid[i, j, k], nid[i + 1, j, k], 2))
                if j < ny:
                    beams.append(add(nid[i, j, k], nid[i, j + 1, k], 2))
        if braces and rng.random() < 0.3:
            i, j = rng.randrange(nx), rng.randrange(ny + 1)
            add(nid[i, j, k - 1], nid[i + 1, j, k], 3)
    sups = {}
    for j in range(ny + 1):
        for i in range(nx + 1):
            n = nid[i, j, 0]
            pinned = rng.random() < 0.2
            sups[str(len(sups) + 1)] = {"nodeId": n, "rx": True, "ry": True, "rz": True,
                                        "rrx": not pinned, "rry": not pinned, "rrz": not pinned}
    loads = []
    for e in beams:
        if rng.random() < 0.7:
            q = -rng.uniform(5, 40)
            d = {"elementId": e, "qYI": 0.0, "qYJ": 0.0, "qZI": q, "qZJ": q}
            if not uniform_only and rng.random() < 0.3:
                d["qZJ"] = q * rng.uniform(0.2, 1.5)
            loads.append({"type": "distributed", "data": d})
    for k in range(1, nz + 1):
        n = nid[rng.randint(0, nx), rng.randint(0, ny), k]
        loads.append({"type": "nodal", "data": {"nodeId": n, "fx": rng.uniform(-30, 30), "fy": rng.uniform(-30, 30),
                                                "fz": 0.0, "mx": 0.0, "my": 0.0, "mz": 0.0}})
    if not uniform_only:
        for _ in range(rng.randint(0, 3)):
            e = rng.choice(beams)
            loads.append({"type": "pointOnElement", "data": {"elementId": e, "a": rng.uniform(0.5, 2.5),
                                                             "py": rng.uniform(-20, 20), "pz": -rng.uniform(10, 60)}})
    return {"nodes": nodes, "materials": mats, "sections": secs, "elements": elems, "supports": sups, "loads": loads}


def modal3d(seed):
    rng = random.Random(seed)
    m = building(seed, timo=False) if rng.random() < 0.5 else restrict(gen_models.rich_3d(seed), set())
    m["loads"] = []
    for s in m["sections"].values():
        s["j"] = s["iy"] + s["iz"]
        s.pop("asY", None)
        s.pop("asZ", None)
    m["_densities"] = {str(mt["id"]): rng.choice([7850.0, 2500.0, rng.uniform(500, 8000)])
                       for mt in m["materials"].values()}
    return m


def pdelta3d(seed):
    """Frames with gravity loads large enough for second-order effects
    (several % amplification) but below the first buckling load."""
    rng = random.Random(seed)
    if rng.random() < 0.7:
        m = building(seed, timo=False, uniform_only=True, braces=rng.random() < 0.5)
    else:
        m = restrict(gen_models.rich_3d(seed), set())
    # Heavy gravity on top nodes: scaled down later by the driver if the
    # engine reports an unstable P-Delta.
    zmax = max(n["z"] for n in m["nodes"].values())
    top = [n["id"] for n in m["nodes"].values() if abs(n["z"] - zmax) < 1e-9]
    scale = rng.choice([200.0, 500.0, 1000.0, 2000.0])
    for n in top:
        m["loads"].append({"type": "nodal", "data": {"nodeId": n, "fx": rng.uniform(-10, 10), "fy": rng.uniform(-10, 10),
                                                     "fz": -scale * rng.uniform(0.5, 1.0),
                                                     "mx": 0.0, "my": 0.0, "mz": 0.0}})
    # J = Iy + Iz: stabileo's K_G carries the Wagner term N r0^2 / L with
    # r0^2 = (Iy + Iz) / A about the shear centre (fe99db4aa, #404), Frame3DD's
    # the torsional term N J / (A L); they agree when J = Iy + Iz.
    for s in m["sections"].values():
        s["j"] = s["iy"] + s["iz"]
    return m


GENERATORS = {"rich3d": rich3d, "frame2d": frame2d, "frame3d": frame3d, "building": building, "modal3d": modal3d, "pdelta3d": pdelta3d}
