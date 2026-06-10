#!/usr/bin/env python3
"""Deterministic generator for the "RC QA Diagnostic Shells" fixture.

Produces a single reinforced-concrete model that exercises EVERY shell contour
component honestly by combining two distinct shell actions in one model:

  * a SLAB (4x3 quad mesh, Z=3 plane) on edge beams -> bending-dominated, so the
    plate bending moments mx/my/mxy vary while in-plane membrane stress ~ 0.
  * a TABIQUE / structural WALL (4x3 quad mesh, Y=0 plane) loaded by in-plane
    lateral shear -> membrane-dominated, so sigmaXx/sigmaYy/tauXy and the
    principal stresses sigma1/sigma2 vary while bending ~ 0.

Von Mises lights up on both. Across the model all 9 components therefore have a
region of meaningful variation, and per-element the "other" family is honestly
near zero (which the UI now reports rather than faking).

All nodes are shared by construction (deduped on rounded coordinates), so the
slab edge nodes coincide with the edge-beam nodes and the wall edge nodes
coincide with the column / slab nodes -> continuous load transfer, exactly the
"split the beams so nodes are shared" workflow the mesh generator documents.

Run:  python3 scripts/build_rc_qa_shells_fixture.py
Out:  src/lib/templates/fixtures/rc-qa-diagnostic-shells.json
"""
import json, math, os

# ---- geometry -------------------------------------------------------------
LX, LY, LZ = 6.0, 4.0, 3.0            # bay X, bay Y, storey height
NX, NY = 4, 3                          # slab mesh divisions (X, Y)
WX, WZ = 4, 3                          # wall mesh divisions (X, Z)
xs = [round(i * LX / NX, 6) for i in range(NX + 1)]      # 0,1.5,3,4.5,6
ys = [round(j * LY / NY, 6) for j in range(NY + 1)]      # 0,1.33,2.67,4
zs = [round(k * LZ / WZ, 6) for k in range(WZ + 1)]      # 0,1,2,3

nodes = {}        # (x,y,z) -> id
node_list = []    # ordered for stable output

def nid(x, y, z):
    key = (round(x, 6), round(y, 6), round(z, 6))
    if key not in nodes:
        i = len(node_list) + 1
        nodes[key] = i
        node_list.append({"id": i, "x": key[0], "y": key[1], "z": key[2]})
    return nodes[key]

elements = []     # frame/truss
quads = []
supports = []
loads = []

def add_elem(ni, nj, section_id):
    eid = len(elements) + 1
    elements.append({"id": eid, "type": "frame", "nodeI": ni, "nodeJ": nj,
                     "materialId": 2, "sectionId": section_id,
                     "hingeStart": False, "hingeEnd": False})
    return eid

def add_quad(corner_xyz, thickness):
    qid = len(quads) + 1
    quads.append({"id": qid, "nodes": [nid(*c) for c in corner_xyz],
                  "materialId": 2, "thickness": thickness})
    return qid

# ---- columns (4 corners, split into WZ segments so wall side nodes are shared)
COL_SEC, BEAM_SEC = 2, 3
for (cx, cy) in [(0, 0), (LX, 0), (LX, LY), (0, LY)]:
    for k in range(WZ):
        add_elem(nid(cx, cy, zs[k]), nid(cx, cy, zs[k + 1]), COL_SEC)

# ---- top edge beams at Z=LZ (pre-split at every grid node = shared with slab)
for i in range(NX):                                   # front (Y=0) & back (Y=LY)
    add_elem(nid(xs[i], 0, LZ),  nid(xs[i + 1], 0, LZ),  BEAM_SEC)
    add_elem(nid(xs[i], LY, LZ), nid(xs[i + 1], LY, LZ), BEAM_SEC)
for j in range(NY):                                   # left (X=0) & right (X=LX)
    add_elem(nid(0, ys[j], LZ),  nid(0, ys[j + 1], LZ),  BEAM_SEC)
    add_elem(nid(LX, ys[j], LZ), nid(LX, ys[j + 1], LZ), BEAM_SEC)

# ---- slab quads (Z=LZ plane) -- bending-dominated under gravity
SLAB_T, WALL_T = 0.18, 0.20
slab_quads = []
for j in range(NY):
    for i in range(NX):
        q = add_quad([(xs[i], ys[j], LZ), (xs[i + 1], ys[j], LZ),
                      (xs[i + 1], ys[j + 1], LZ), (xs[i], ys[j + 1], LZ)], SLAB_T)
        slab_quads.append(q)

# ---- wall quads (Y=0 plane) -- membrane-dominated under in-plane lateral shear
for k in range(WZ):
    for i in range(WX):
        add_quad([(xs[i], 0, zs[k]), (xs[i + 1], 0, zs[k]),
                  (xs[i + 1], 0, zs[k + 1]), (xs[i], 0, zs[k + 1])], WALL_T)

# ---- curved balcony beam off the back edge (Y=LY), arc through (3,5,3) -------
# Circle through (0,4),(6,4),(3,5) -> centre (3,0), r=5. 6 chord segments.
cxx, cyy, r = 3.0, 0.0, 5.0
a0 = math.atan2(4 - cyy, 0 - cxx)     # at (0,4)
a1 = math.atan2(5 - cyy, 3 - cxx)     # at (3,5) (apex)
a2 = math.atan2(4 - cyy, 6 - cxx)     # at (6,4)
SEG = 6
arc_ids = [nid(0, LY, LZ)]
for s in range(1, SEG):
    th = a0 + (a2 - a0) * s / SEG
    arc_ids.append(nid(cxx + r * math.cos(th), cyy + r * math.sin(th), LZ))
arc_ids.append(nid(LX, LY, LZ))
for s in range(len(arc_ids) - 1):
    add_elem(arc_ids[s], arc_ids[s + 1], BEAM_SEC)

# ---- supports: wall foundation line (Y=0,Z=0) + back column bases ----------
for x in xs:
    supports.append({"nodeId": nid(x, 0, 0), "type": "fixed3d"})
for (cx, cy) in [(0, LY), (LX, LY)]:
    supports.append({"nodeId": nid(cx, cy, 0), "type": "fixed3d"})
for i, s in enumerate(supports):
    s["id"] = i + 1

# ---- loads -----------------------------------------------------------------
# Gravity (D): 5 kN/m^2 downward area load on every slab quad.
lid = 1
for q in slab_quads:
    loads.append({"type": "surface3d", "data": {"id": lid, "quadId": q, "q": 5.0, "caseId": 1}})
    lid += 1
# Lateral (W): 100 kN in-plane shear shared across the 5 wall-top nodes (+X).
for x in xs:
    loads.append({"type": "nodal3d", "data": {"id": lid, "nodeId": nid(x, 0, LZ),
                  "fx": 20.0, "fy": 0.0, "fz": 0.0, "mx": 0.0, "my": 0.0, "mz": 0.0, "caseId": 2}})
    lid += 1

# ---- materials / sections --------------------------------------------------
materials = [
    {"id": 1, "name": "Acero A36", "e": 200000, "nu": 0.3, "rho": 78.5, "fy": 250},
    {"id": 2, "name": "H-30 (f'c=30)", "e": 32000, "nu": 0.2, "rho": 25, "fy": 30},
]
sections = [
    {"id": 1, "name": "IPN 300", "a": 0.0069, "iy": 9.8e-05, "iz": 4.51e-06, "j": 1e-07, "b": 0.125, "h": 0.3},
    {"id": 2, "name": "RC Col 400x400", "a": 0.16, "iy": 0.0021333, "iz": 0.0021333, "j": 0.0036, "b": 0.4, "h": 0.4},
    {"id": 3, "name": "RC Beam 300x600", "a": 0.18, "iy": 0.0054, "iz": 0.00135, "j": 0.0045, "b": 0.3, "h": 0.6},
]

model = {
    "name": "RC QA Diagnostic Shells",
    "materials": materials,
    "sections": sections,
    "nodes": node_list,
    "elements": elements,
    "supports": supports,
    "loads": loads,
    "plates": [],
    "quads": quads,
    "constraints": [],
    "loadCases": [
        {"id": 1, "type": "D", "name": "Gravity — slab area load 5 kN/m²"},
        {"id": 2, "type": "W", "name": "Lateral — in-plane wall shear 100 kN (+X)"},
    ],
    "combinations": [
        {"id": 1, "name": "1.4 D", "factors": [{"caseId": 1, "factor": 1.4}]},
        {"id": 2, "name": "1.2 D + 1.0 W", "factors": [{"caseId": 1, "factor": 1.2}, {"caseId": 2, "factor": 1.0}]},
        {"id": 3, "name": "1.2 D - 1.0 W", "factors": [{"caseId": 1, "factor": 1.2}, {"caseId": 2, "factor": -1.0}]},
    ],
}

# ---- validate node references ---------------------------------------------
valid = {n["id"] for n in node_list}
for e in elements:
    assert e["nodeI"] in valid and e["nodeJ"] in valid, e
for q in quads:
    assert all(n in valid for n in q["nodes"]) and len(set(q["nodes"])) == 4, q
for s in supports:
    assert s["nodeId"] in valid, s

out = os.path.join(os.path.dirname(__file__), "..", "src", "lib", "templates",
                   "fixtures", "rc-qa-diagnostic-shells.json")
out = os.path.abspath(out)
with open(out, "w") as f:
    json.dump(model, f, indent=2, ensure_ascii=False)
    f.write("\n")

print(f"nodes={len(node_list)} elements={len(elements)} quads={len(quads)} "
      f"(slab={len(slab_quads)}, wall={len(quads) - len(slab_quads)}) "
      f"supports={len(supports)} loads={len(loads)}")
print(f"wrote {out}")
