#!/usr/bin/env python3
"""Generate the IASC-ASCE SHM benchmark (Phase I) 120DOF analytical model as
stabileo acceptance cases: a 4-storey, 2x2-bay braced steel frame in 3D with
rigid floors, undamaged and with damage patterns (i) and (ii).

Source (public): E.A. Johnson, H.F. Lam, L.S. Katafygiotis, J.L. Beck,
"Phase I IASC-ASCE Structural Health Monitoring Benchmark Problem Using
Simulated Data", J. Eng. Mech. 130(1):3-15, 2004. Problem statement and the
MATLAB data generator (DataGen/cal_model.m, the "HKUST code") are distributed
by the NEES "Database for Structural Control and Monitoring Benchmark
Problems", doi:10.4231/D3Q52FC7T, archive entries Report_bldg_shm_ana1.pdf
and Files_bldg_shm_ana1.zip.

Geometry, members (Table 1), connectivity with orientation nodes, floor
masses and the rigid-floor transformation are transcribed from cal_model.m
(caseid 2: 120DOF, symmetric mass, lumped mass). Reference frequencies are
Table 2's "120DOF lumped mass" columns: they are NOT computed here.

    python3 asce_shm_phase1.py            # (re)write ../models/asce_shm_*.json
    python3 asce_shm_phase1.py --replay   # replay cal_model.m with numpy

Mass emulation (stabileo has no lumped nodal-mass input yet, issue #341; masses come from
element density only):
  * member masses: cal_model lumps mbar*L/2 on each end node in the three
    translations; these go on mass-only truss stubs (1 m, A = 1 m^2,
    density 3*m, E = 1e-6 MPa) from the node to a fixed auxiliary node.
    The members themselves get density 0.
  * floor masses: cal_model adds four panel masses per floor (800/600/600/400
    kg each on floors 1..4) to the floor's rigid-body DOFs only (x, y, theta),
    each at its panel centroid with the panel's own polar inertia
    m*(2L^2)/12. Each panel mass is split into four points of m/4 at the
    centroid +-L/sqrt(12) in x and y (same mass, first moment and polar
    inertia); each point is a diaphragm slave carrying a mass stub, with
    uz, rx, ry restrained so the mass acts in x, y (and theta) only, exactly
    as in the source.
  * cal_model's torsional rotary inertia of members (Io/A*mbar*L/2 about the
    member axis) goes on rotary-inertia stubs (see stabileo_case). Without it
    the 12th mode of damage (ii) moves out of its printed digits.
  * floor beams: see local_y() for the orientation correction.
"""
import json
import math
import os
import sys

L, H = 1.25, 0.9
E = 2.0e11
NU = 0.3
RHO = 7800.0
COL = dict(iz=0.664e-6, iy=1.97e-6, j=8.01e-9, a=1.133e-3)
BEAM = dict(iz=0.249e-6, iy=1.22e-6, j=3.82e-8, a=1.430e-3)
BRACE = dict(iz=0.0, iy=0.0, j=0.0, a=0.141e-3)
FLOOR_PANEL_MASS = [800.0, 600.0, 600.0, 400.0]  # kg per panel, 4 panels per floor
STUB_E_MPA = 1e-6

# cal_model.m getNEP: [node_i, node_j, orientation node k], element number = row
ELEM = [
    (1, 10, 4), (2, 11, 5), (3, 12, 6), (4, 13, 7), (5, 14, 8), (6, 15, 9), (7, 16, 4), (8, 17, 5), (9, 18, 6),
    (10, 11, 2), (11, 12, 3), (13, 14, 5), (14, 15, 6), (16, 17, 8), (17, 18, 9), (10, 13, 4), (13, 16, 7),
    (11, 14, 5), (14, 17, 8), (12, 15, 6), (15, 18, 9),
    (1, 11, 10), (11, 3, 12), (3, 15, 12), (15, 9, 18), (9, 17, 18), (17, 7, 16), (7, 13, 16), (13, 1, 10),
    (10, 19, 13), (11, 20, 14), (12, 21, 15), (13, 22, 16), (14, 23, 17), (15, 24, 18), (16, 25, 13), (17, 26, 14),
    (18, 27, 15),
    (19, 20, 11), (20, 21, 12), (22, 23, 14), (23, 24, 15), (25, 26, 17), (26, 27, 18), (19, 22, 13), (22, 25, 16),
    (20, 23, 14), (23, 26, 17), (21, 24, 15), (24, 27, 18),
    (10, 20, 19), (20, 12, 21), (12, 24, 21), (24, 18, 27), (18, 26, 27), (26, 16, 25), (16, 22, 25), (22, 10, 19),
    (19, 28, 22), (20, 29, 23), (21, 30, 24), (22, 31, 25), (23, 32, 26), (24, 33, 27), (25, 34, 22), (26, 35, 23),
    (27, 36, 24),
    (28, 29, 20), (29, 30, 21), (31, 32, 23), (32, 33, 24), (34, 35, 26), (35, 36, 27), (28, 31, 22), (31, 34, 25),
    (29, 32, 23), (32, 35, 26), (30, 33, 24), (33, 36, 27),
    (19, 29, 28), (29, 21, 30), (21, 33, 30), (33, 27, 36), (27, 35, 36), (35, 25, 34), (25, 31, 34), (31, 19, 28),
    (28, 37, 31), (29, 38, 32), (30, 39, 33), (31, 40, 34), (32, 41, 35), (33, 42, 36), (34, 43, 31), (35, 44, 32),
    (36, 45, 33),
    (37, 38, 29), (38, 39, 30), (40, 41, 32), (41, 42, 33), (43, 44, 35), (44, 45, 36), (37, 40, 31), (40, 43, 34),
    (38, 41, 32), (41, 44, 35), (39, 42, 33), (42, 45, 36),
    (28, 38, 37), (38, 30, 39), (30, 42, 39), (42, 36, 45), (36, 44, 45), (44, 34, 43), (34, 40, 43), (40, 28, 37),
]
assert len(ELEM) == 116


def kind(e):  # element number (1-based) -> member group, per cal_model's prop table
    r = (e - 1) % 29
    return "col" if r < 9 else ("beam" if r < 21 else "brace")


PROPS = {"col": COL, "beam": BEAM, "brace": BRACE}


def local_y(e, nd):
    """Local-y reference vector of element e (1-based).

    Columns: cal_model's orientation node k (local y = component of k - i
    normal to the member). Floor beams: horizontal, normal to the beam, so
    the strong axis (Iy = 1.22e-6) resists vertical bending. The archived
    cal_model.m orients the beams with k-nodes one storey down, which puts
    their weak axis in vertical bending; the paper (p. 10) says an older HKUST
    code "had a different orientation for the floor beams, resulting in
    slightly lower natural frequencies" and that Table 2 is from the corrected
    one. With the archived k-nodes the replay is 4-12% below Table 2; with
    horizontal local y it reproduces all 36 printed values (--replay).
    """
    a, b, k = ELEM[e - 1]
    if kind(e) == "beam":
        d = [nd[b][i] - nd[a][i] for i in range(3)]
        return [-d[1], d[0], 0.0]
    return [nd[k][i] - nd[a][i] for i in range(3)]


def rotary_inertias(nd):
    """cal_model's lumped torsional rotary inertia, Io/A*mbar*L/2 = rho*Io*L/2
    per member end about the member axis, summed per node and global axis
    (members are axis-aligned)."""
    J = {n: [0.0, 0.0, 0.0] for n in nd}
    for (a, b, _k), e in zip(ELEM, range(1, 117)):
        p = PROPS[kind(e)]
        io = p["iy"] + p["iz"]
        if io == 0.0:
            continue
        d = [nd[b][i] - nd[a][i] for i in range(3)]
        le = math.dist(nd[a], nd[b])
        ax = max(range(3), key=lambda i: abs(d[i]))
        assert abs(abs(d[ax]) - le) < 1e-12
        J[a][ax] += RHO * io * le / 2
        J[b][ax] += RHO * io * le / 2
    return J
# damage patterns (cal_model theta = 0 -> E scaled to 0; mass kept)
DAMAGE = {
    "undamaged": [],
    "damage_i": list(range(22, 30)),
    "damage_ii": list(range(22, 30)) + list(range(80, 88)),
}
REFERENCE_HZ = {  # Table 2, "120DOF lumped mass" columns, with mode direction
    "undamaged": "8.59 y 9.18 x 14.58 θ 23.45 y 25.95 x 36.81 y 40.65 θ 42.21 x 46.98 y 56.74 x 62.96 θ 81.05 θ",
    "damage_i": "5.47 y 7.37 x 9.69 θ 19.31 y 22.77 x 34.18 θ 35.29 y 40.66 x 46.73 y 56.38 x 60.43 θ 80.53 θ",
    "damage_ii": "4.96 y 6.68 x 8.70 θ 12.34 y 17.79 x 21.56 θ 34.79 y 38.75 y 40.62 x 49.47 x 59.98 θ 68.57 θ",
}
REFERENCE_12DOF_HZ = {  # Table 2, "12DOF lumped mass" columns
    "undamaged": "9.41 y 11.79 x 16.38 θ 25.54 y 32.01 x 38.66 y 44.64 θ 48.01 y 48.44 x 60.15 x 67.48 θ 83.62 θ",
    "damage_i": "6.24 y 9.91 x 11.73 θ 21.53 y 28.92 x 37.37 y 38.28 θ 47.34 x 47.83 y 59.99 x 65.31 θ 83.31 θ",
    "damage_ii": "5.82 y 9.51 x 11.01 θ 14.89 y 24.91 x 28.41 θ 36.06 y 41.35 y 46.79 x 54.34 x 63.64 θ 72.61 θ",
}
# Table 3: horizontal storey stiffnesses of the 12DOF model [MN/m, MN m/rad],
# storeys 1..4, (x, y, theta)
STOREY_K = {
    "undamaged": [("106.60", "67.90", "232.02")] * 4,
    "damage_i": [("58.37", "19.67", "81.30")] + [("106.60", "67.90", "232.02")] * 3,
}
TITLES = {
    "undamaged": "IASC-ASCE SHM benchmark 4-storey braced frame, 120DOF model, undamaged",
    "damage_i": "IASC-ASCE SHM benchmark 4-storey braced frame, 120DOF model, damage (i): no 1st-storey braces",
    "damage_ii": "IASC-ASCE SHM benchmark 4-storey braced frame, 120DOF model, damage (ii): no 1st/3rd-storey braces",
}


def nodes():
    out = {}
    n = 0
    for f in range(5):
        for iy in range(3):
            for ix in range(3):
                n += 1
                out[n] = (ix * L, iy * L, f * H)
    return out


def member_masses(nd):
    m = {n: 0.0 for n in nd}
    for (a, b, _k), e in zip(ELEM, range(1, 117)):
        p = PROPS[kind(e)]
        le = math.dist(nd[a], nd[b])
        m[a] += RHO * p["a"] * le / 2
        m[b] += RHO * p["a"] * le / 2
    return m


def floor_points(f):
    """Four panels per floor, each split into 4 points: (x, y, mass)."""
    c = L / math.sqrt(12.0)
    pts = []
    for (px, py) in [(L / 2, L / 2), (1.5 * L, L / 2), (1.5 * L, 1.5 * L), (L / 2, 1.5 * L)]:
        for sx in (-1, 1):
            for sy in (-1, 1):
                pts.append((px + sx * c, py + sy * c, FLOOR_PANEL_MASS[f - 1] / 4))
    return pts


def stabileo_case(name, variant="120dof"):
    """variant: "120dof" (modal), "12dof" (modal) or "12dof_static"
    (storey stiffness). The 12DOF model of the source is the same frame with
    every floor node's uz, rx and ry fixed (cal_model cal_T, StructID = 0)."""
    dof12 = variant.startswith("12dof")
    static = variant == "12dof_static"
    nd = nodes()
    mm = member_masses(nd)
    j_nodes = {str(n): {"id": n, "x": round(x, 9), "y": round(y, 9), "z": round(z, 9)} for n, (x, y, z) in nd.items()}
    j_mat = {"1": {"id": 1, "e": E / 1e6, "nu": NU}}
    j_sec = {}
    for sid, (k, p) in enumerate([("col", COL), ("beam", BEAM), ("brace", BRACE)], start=1):
        sec = {"id": sid, "name": k, "a": p["a"], "iy": p["iy"], "iz": p["iz"], "j": p["j"]}
        if k == "brace":  # a truss: bending/torsion unused; keep them positive
            sec.update({"iy": 1e-12, "iz": 1e-12, "j": 1e-12})
        j_sec[str(sid)] = sec
    sec_of = {"col": 1, "beam": 2, "brace": 3}
    j_elems = {}
    removed = set(DAMAGE[name])
    for e, (a, b, k) in enumerate(ELEM, start=1):
        if e in removed:
            continue  # zero stiffness; its mass stays on the nodes (member_masses)
        t = kind(e)
        el = {"id": e, "type": "truss" if t == "brace" else "frame", "nodeI": a, "nodeJ": b,
              "materialId": 1, "sectionId": sec_of[t]}
        if t != "brace":
            ly = local_y(e, nd)
            el.update({"localYx": ly[0], "localYy": ly[1], "localYz": ly[2]})
        j_elems[str(e)] = el
    j_sup = {}
    sid = 0
    for n in range(1, 10):
        sid += 1
        j_sup[str(sid)] = {"nodeId": n, "rx": True, "ry": True, "rz": True, "rrx": True, "rry": True, "rrz": True}
    if dof12:
        for n in range(10, 46):
            sid += 1
            j_sup[str(sid)] = {"nodeId": n, "rx": False, "ry": False, "rz": True, "rrx": True, "rry": True,
                               "rrz": False}
    densities = {"1": 0.0}
    stub_sec = 4
    j_sec[str(stub_sec)] = {"id": stub_sec, "name": "mass stub", "a": 1.0, "iy": 1e-12, "iz": 1e-12, "j": 1e-12}
    mat_for = {}
    next_node, next_elem = 1000, 1000
    s3 = 1 / math.sqrt(3)

    def stub(node, m, xyz):
        nonlocal next_node, next_elem, sid
        key = f"{m:.12e}"
        if key not in mat_for:
            mid = 100 + len(mat_for)
            mat_for[key] = mid
            j_mat[str(mid)] = {"id": mid, "e": STUB_E_MPA, "nu": NU}
            densities[str(mid)] = 3.0 * m
        g = next_node
        next_node += 1
        x, y, z = xyz
        j_nodes[str(g)] = {"id": g, "x": round(x + s3, 9), "y": round(y + s3, 9), "z": round(z + s3, 9)}
        j_elems[str(next_elem)] = {"id": next_elem, "type": "truss", "nodeI": node, "nodeJ": g,
                                   "materialId": mat_for[key], "sectionId": stub_sec}
        next_elem += 1
        sid += 1
        j_sup[str(sid)] = {"nodeId": g, "rx": True, "ry": True, "rz": True, "rrx": True, "rry": True, "rrz": True}

    for n in range(10, 46) if not static else []:
        stub(n, mm[n], nd[n])
    # rotary-inertia stubs: a 1 m frame along the global axis, A = 1e-9 m^2,
    # Iy + Iz = 1 m^4, E = 1e-6 MPa, fixed far end. stabileo's consistent
    # torsion mass rho*(Iy+Iz)*L/6*[[2,1],[1,2]] puts rho/3 on the node's
    # rotation about that axis; its translational and bending-rotary masses
    # scale with A (~1e-9 of it).
    rot_sec = 5
    j_sec[str(rot_sec)] = {"id": rot_sec, "name": "rotary stub", "a": 1e-9, "iy": 0.5, "iz": 0.5, "j": 1e-12}
    J = rotary_inertias(nd)
    for n in range(10, 46) if not static else []:
        for ax in range(3):
            if J[n][ax] <= 0.0:
                continue
            key = f"rot{J[n][ax]:.12e}"
            if key not in mat_for:
                mid = 100 + len(mat_for)
                mat_for[key] = mid
                j_mat[str(mid)] = {"id": mid, "e": STUB_E_MPA, "nu": NU}
                densities[str(mid)] = 3.0 * J[n][ax]
            g = next_node
            next_node += 1
            off = [0.0, 0.0, 0.0]
            off[ax] = 1.0
            x, y, z = nd[n]
            j_nodes[str(g)] = {"id": g, "x": round(x + off[0], 9), "y": round(y + off[1], 9),
                               "z": round(z + off[2], 9)}
            el = {"id": next_elem, "type": "frame", "nodeI": n, "nodeJ": g,
                  "materialId": mat_for[key], "sectionId": rot_sec}
            j_elems[str(next_elem)] = el
            next_elem += 1
            sid += 1
            j_sup[str(sid)] = {"nodeId": g, "rx": True, "ry": True, "rz": True, "rrx": True, "rry": True, "rrz": True}
    constraints = []
    for f in range(1, 5):
        master = 9 * f + 5  # centre node = cal_model's reference point (L, L, f*H)
        slaves = [9 * f + i for i in range(1, 10) if i != 5]
        for (x, y, m) in floor_points(f) if not static else []:
            p = next_node
            next_node += 1
            j_nodes[str(p)] = {"id": p, "x": round(x, 9), "y": round(y, 9), "z": round(f * H, 9)}
            sid += 1
            # mass acts in the floor plane only: uz, rx, ry restrained; rz is
            # left free, as the diaphragm ties it to the floor's rotation (#342:
            # a support on it would hold the whole floor against turning)
            j_sup[str(sid)] = {"nodeId": p, "rx": False, "ry": False, "rz": True, "rrx": True, "rry": True,
                               "rrz": False}
            stub(p, m, (x, y, f * H))
            slaves.append(p)
        constraints.insert(0, {"type": "diaphragm", "masterNode": master, "slaveNodes": slaves, "plane": "XY"})
    loads = []
    refs = []
    if static:
        # unit-ish storey shears: Fx, Fy (kN) and Mz (kN m) at the roof
        # master; every storey carries them, so floor k moves by
        # F * sum_{i<=k} 1/K_i. Checked at floor 1 and at the roof.
        F = 100.0
        loads.append({"type": "nodal", "data": {"nodeId": 41, "fx": F, "fy": F, "fz": 0.0,
                                                "mx": 0.0, "my": 0.0, "mz": F}})
        ks = STOREY_K[name]
        for comp, j, unit in (("ux", 0, "MN/m"), ("uy", 1, "MN/m"), ("rz", 2, "MN m/rad")):
            for floor, master in ((1, 14), (4, 41)):
                printed = [ks[i][j] for i in range(floor)]
                flex = sum(1.0 / (float(k) * 1000.0) for k in printed)
                # half a unit in the last printed digit of each stiffness
                dflex = sum(0.005 / (float(k) - 0.005) / (float(k) * 1000.0) for k in printed)
                refs.append({"quantity": "displacement", "node": master, "component": comp,
                             "value": F * flex, "tolAbs": F * dflex,
                             "sourceValue": " + ".join(f"1/{k}" for k in printed), "sourceUnit": unit,
                             "tolBasis": "F * sum of 1/K over storeys 1.." + str(floor) + " with Table 3's K printed "
                                         "to 0.01; tolerance propagates half a unit in each printed K"})
    else:
        table = REFERENCE_12DOF_HZ if dof12 else REFERENCE_HZ
        toks = table[name].split()
        for i in range(0, len(toks), 2):
            printed, direction = toks[i], toks[i + 1]
            refs.append({"quantity": "frequency", "mode": i // 2 + 1, "value": float(printed),
                         "tolAbs": 0.005, "direction": direction,
                         "tolBasis": f"Table 2 prints {printed} Hz; half a unit in the last printed digit"})
    model = {"nodes": j_nodes, "materials": j_mat, "sections": j_sec, "elements": j_elems,
             "supports": j_sup, "loads": loads, "constraints": constraints}
    total_member = sum(mm[n] for n in range(10, 46))
    if static:
        cid = f"asce_shm_12dof_storey_stiffness_{name}"
        title = TITLES[name].replace("120DOF model", "12DOF model, storey stiffness (Table 3)")
        where = "Report_bldg_shm_ana1.pdf Table 1 (members) and Table 3 (horizontal storey stiffnesses, 12DOF model)"
    else:
        cid = f"asce_shm_{variant}_{name}"
        title = TITLES[name].replace("120DOF", variant.upper())
        where = ("Report_bldg_shm_ana1.pdf Table 1 (members) and Table 2 (natural frequencies, "
                 f"{variant.upper()} lumped mass)")
    extra = []
    if dof12:
        extra.append("12DOF model: uz, rx, ry of every floor node fixed (cal_model cal_T with StructID = 0).")
    if static:
        extra.append("Static case: no masses; roof loads Fx = Fy = 100 kN, Mz = 100 kN m on the centre node.")
    return {
        "id": cid,
        "title": title,
        "dimension": "3d",
        "analysis": "linear" if static else "modal",
        **({} if static else {"numModes": 14, "densities": densities}),
        "source": {
            "citation": "Johnson, Lam, Katafygiotis, Beck (2004). Phase I IASC-ASCE Structural Health Monitoring "
                        "Benchmark Problem Using Simulated Data. J. Eng. Mech. 130(1):3-15.",
            "where": where + "; model DataGen/cal_model.m in Files_bldg_shm_ana1.zip, NEES database "
                             "doi:10.4231/D3Q52FC7T",
            "independence": "Published by the benchmark authors from their own MATLAB model (HKUST code); "
                            "not computed by stabileo or by this generator.",
        },
        "modelling": [
            "Columns/beams Euler-Bernoulli 3D frames; columns oriented by cal_model's k-nodes (localY = k - i), "
            "beams with local y horizontal (see below); braces are trusses; G = E/2.6.",
            "Rigid floors: XY diaphragm on each floor's centre node (cal_model's reference point)"
            + "; the diaphragm ties every slave's rz to the master, as cal_model's T does.",
            f"Member masses lumped (mbar*L/2 per end, 3 translations; {total_member:.3f} kg above the base) "
            "and floor panel masses (x, y, theta only) carried by mass-only truss stubs; see generator docstring.",
            "Member torsional rotary inertia (Io/A*mbar*L/2 about each member axis) carried by rotary-inertia "
            "frame stubs (torsion mass only).",
            "Floor beams oriented with the strong axis in vertical bending (paper p. 10: Table 2 is from the "
            "HKUST code with corrected floor-beam orientation; the archived cal_model.m has the old one).",
        ] + (["Damaged braces removed (cal_model sets their E to 0 and keeps their mass)."] if DAMAGE[name] else [])
          + extra,
        "references": refs,
        "model": model,
    }


def replay(name, rot_inertia=True, tie_rz=True, dof12=False):
    """cal_model.m (caseid 2) with numpy: lowest 12 frequencies in Hz."""
    import numpy as np
    import scipy.linalg
    nd = nodes()
    nn = len(nd)
    K = np.zeros((6 * nn, 6 * nn))
    M = np.zeros((6 * nn, 6 * nn))
    G = E / 2 / (1 + NU)
    removed = set(DAMAGE[name])
    for e, (a, b, k) in enumerate(ELEM, start=1):
        p = PROPS[kind(e)]
        Iz, Iy, J, A = p["iz"], p["iy"], p["j"], p["a"]
        Ee = 0.0 if e in removed else E
        le = math.dist(nd[a], nd[b])
        Ke = np.zeros((12, 12))
        def blk(v1, r1, v2, r2, I, s):
            c1, c2, c3, c4 = 12 * Ee * I / le**3, 6 * Ee * I / le**2, 4 * Ee * I / le, 2 * Ee * I / le
            idx = [v1, r1, v2, r2]
            m = np.array([[c1, s * c2, -c1, s * c2], [s * c2, c3, -s * c2, c4],
                          [-c1, -s * c2, c1, -s * c2], [s * c2, c4, -s * c2, c3]])
            Ke[np.ix_(idx, idx)] += m
        Ke[np.ix_([0, 6], [0, 6])] += Ee * A / le * np.array([[1, -1], [-1, 1]])
        Ke[np.ix_([3, 9], [3, 9])] += G * J / le * np.array([[1, -1], [-1, 1]]) * (Ee / E if E else 1)
        blk(1, 5, 7, 11, Iz, 1.0)
        blk(2, 4, 8, 10, Iy, -1.0)
        mbar = RHO * A
        Io = Iy + Iz
        rot = Io / A if rot_inertia else 0.0
        Me = np.diag(np.array([1, 1, 1, rot, 0, 0, 1, 1, 1, rot, 0, 0]) * mbar * le / 2)
        d2 = np.array(nd[b]) - np.array(nd[a])
        d3 = np.array(local_y(e, nd)) if kind(e) != "brace" else np.array(nd[k]) - np.array(nd[a])
        ex = d2 / np.linalg.norm(d2)
        ez = np.cross(d2, d3)
        ez /= np.linalg.norm(ez)
        ey = np.cross(ez, ex)
        T1 = np.vstack([ex, ey, ez])
        T = scipy.linalg.block_diag(T1, T1, T1, T1)
        dofs = list(range(6 * (a - 1), 6 * a)) + list(range(6 * (b - 1), 6 * b))
        K[np.ix_(dofs, dofs)] += T.T @ Ke @ T
        M[np.ix_(dofs, dofs)] += T.T @ Me @ T
    free = list(range(54, 6 * nn))
    K, M = K[np.ix_(free, free)], M[np.ix_(free, free)]
    # rigid-floor transformation (cal_model cal_T, StructID = 1)
    cols = 12
    rows = []
    extra = 0
    for f in range(1, 5):
        for i in range(1, 10):
            n = 9 * f + i
            x, y, _ = nd[n]
            vv = [3 * (f - 1) + d for d in range(3)]
            r = [np.zeros(0)] * 0
            rows.append(("rig", vv, [1, 0, L - y]))
            rows.append(("rig", vv, [0, 1, -(L - x)]))
            for _ in range(3):
                rows.append(("zero",) if dof12 else ("own",))
            rows.append(("rig", vv, [0, 0, 1]) if tie_rz else ("own",))
    nown = sum(1 for r in rows if r[0] == "own")
    T = np.zeros((len(rows), cols + nown))
    c = cols
    for i, r in enumerate(rows):
        if r[0] == "rig":
            for j, v in zip(r[1], r[2]):
                T[i, j] = v
        elif r[0] == "own":
            T[i, c] = 1
            c += 1
    Kr, Mr = T.T @ K @ T, T.T @ M @ T
    dx = np.array([L, L, -L, -L]) / 2
    dy = np.array([L, -L, -L, L]) / 2
    dr2 = dx**2 + dy**2
    for f in range(4):
        am = np.ones(4) * FLOOR_PANEL_MASS[f]
        i = 3 * f
        Mr[i, i] += am.sum()
        Mr[i + 1, i + 1] += am.sum()
        Mr[i + 2, i + 2] += (am * (2 * L**2 / 12)).sum() + (am * dr2).sum()
        Mr[i, i + 2] += -(am * dy).sum(); Mr[i + 2, i] += -(am * dy).sum()
        Mr[i + 1, i + 2] += (am * dx).sum(); Mr[i + 2, i + 1] += (am * dx).sum()
    md = np.diag(Mr) > 1e-10
    if not md.all():  # condense massless DOFs
        Kmm, Kms, Kss = Kr[np.ix_(md, md)], Kr[np.ix_(md, ~md)], Kr[np.ix_(~md, ~md)]
        Kr = Kmm - Kms @ np.linalg.solve(Kss, Kms.T)
        Mr = Mr[np.ix_(md, md)]
    w2 = scipy.linalg.eigh(Kr, Mr, eigvals_only=True)
    return np.sqrt(np.abs(w2[:12])) / (2 * math.pi)


def main():
    here = os.path.dirname(os.path.abspath(__file__))
    def write(case):
        path = os.path.join(here, "..", "models", case["id"] + ".json")
        with open(path, "w") as f:
            json.dump(case, f, indent=1, ensure_ascii=False)
            f.write("\n")
        print("wrote", os.path.relpath(path))

    for name in DAMAGE:
        write(stabileo_case(name))
        if "--replay" in sys.argv:
            ref = [float(t) for t in REFERENCE_HZ[name].split()[0::2]]
            a = replay(name)
            b = replay(name, rot_inertia=False)
            c = replay(name, tie_rz=False)
            for i in range(12):
                print(f"  mode {i+1:2}: Table 2 {ref[i]:6.2f}  replay {a[i]:9.5f}  "
                      f"(no rotary inertia {b[i]:9.5f}, slave rz not tied {c[i]:9.5f})")
        write(stabileo_case(name, "12dof"))
        if "--replay" in sys.argv:
            ref = [float(t) for t in REFERENCE_12DOF_HZ[name].split()[0::2]]
            a = replay(name, dof12=True)
            for i in range(12):
                print(f"  12DOF mode {i+1:2}: Table 2 {ref[i]:6.2f}  replay {a[i]:9.5f}")
        if name in STOREY_K:
            write(stabileo_case(name, "12dof_static"))


if __name__ == "__main__":
    main()
