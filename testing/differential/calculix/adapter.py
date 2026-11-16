"""stabileo 3D frame models -> CalculiX ccx 2.23 (displacements only).

Element pair: stabileo `frame` (Euler-Bernoulli) <-> ccx's native beam U1
(e_c3d_u1.f: a true two-node 6-DOF beam, Luo 2008; ccx's B31/B32 beams are
expanded into 3D solid elements internally and are not the same element).
stabileo `truss` <-> U1 with every moment released at both ends (an exact
axial bar; ccx's T3D2 truss is expanded into solids too).

What U1 computes correctly, checked against closed form (README.md):
axial EA/L, bending in both planes 12EI/L^3 etc. in the Euler-Bernoulli
limit, torsion -- but with G (I11 + I22) / L, the polar moment, not J. What
it does not:

  * shear deformation: the shear-flexible element is *stiffer* than the
    Euler-Bernoulli one (its terms carry 1/(1 - phi)^2 instead of
    1/(1 + phi), e_c3d_u1.f and resultsmech_u1.f); a CalculiX bug, so
    Timoshenko sections are unsupported and the Euler-Bernoulli limit is
    taken with k = 1e13 * 12EI/(G A L^2) (phi = 1e-13).
  * prescribed (nonzero) displacements: the load they induce is computed
    through the same faulty nodal-force routine. A cantilever with its tip
    prescribed uy = 1e-3 returns uz = 1.2e-3, ry = -1.2e-3, rz = 0 instead
    of uz = 0, ry = 0, rz = 1.5 uy / L = 7.5e-4: settlements are
    unsupported.
  * reactions and section forces: resultsmech_u1.f adds both ends' section
    forces to the nodal forces with the same sign (RF of a pulled cantilever
    is +N at the clamp), scales the torque by k, and takes the shear force
    from a strain that cancels to round-off when k is large. Only nodal
    displacements and rotations are compared.
  * SPRING1 elements act on translations only (DOFs 4-6 are silently
    ignored): rotational support springs are unsupported.
  * *EQUATION terms on a DOF that no element activates are silently dropped
    (the coupled DOF is then fixed): every node that carries rotation
    equations or rotational boundary conditions must be a U1 node (below).

Mapping:
  * units: E (MPa) x 1000 -> kN/m^2, nu; ccx derives G = E / (2(1+nu)) as
    stabileo does.
  * local axes: U1's section direction 1 is the given vector e2 (used as
    is, so we pass stabileo's exact local y) and e3 = e1 x e2 = local z.
    I11 (bending in the e1-e2 plane) = iz, I22 = iy. Torsion uses
    I11 + I22, so models need j = iy + iz (calculix/gen.py makes them; 2D
    models lifted by common.model.lift_2d already have it).
  * releases: the released end gets its own node, coupled to the joint
    node by *EQUATION: the three translations, and the joint rotation
    along every unreleased local axis of that end (exact static
    condensation of the released moment). A joint whose frame ends are all
    released carries no U1 element of its own; it gets a 1 m stub U1 to a
    clamped node (unit section, E 1e-20 of the model's largest) so that its
    rotation DOFs exist. The stub must be negligible against the joint's
    own rotational stiffness, which can be small: with E 1e-14 the stub
    shifted a joint rotation by 1.2e-6 (rich3d_ccx-176, PyNite agreeing with
    stabileo to 3e-14); with 1e-20 it is below 1e-12. Where the joint has no
    rotational stiffness at all (stabileo's artificial spring) its rotation
    is not compared.
  * supports: rigid flags -> *BOUNDARY (settlements on free DOFs, which
    the engine ignores, are dropped);
    translational springs -> SPRING1 (as in the engine, a spring frees its
    DOF even when the rigid flag is also set).
  * loads: nodal -> *CLOAD; member loads -> nodes inserted along the member
    (common.model.nodalize, exact for the original nodes' displacements of
    the Euler-Bernoulli element; distributed loads first become four
    moment-equivalent point loads at well-spaced stations, see
    common.model.moment_point_loads).

Not representable (Unsupported): Timoshenko sections, j != iy + iz,
settlements, rotational springs, member loads on trusses, thermal loads, constraints,
shells, warping, inclined supports; modal (U1's mass interpolates the
transverse translations linearly, not with stabileo's cubic consistent
mass); P-Delta (U1 has no geometric stiffness: "no second order
calculation for this type of element").
"""

import copy
import math
import os
import subprocess
import sys
import tempfile

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "common"))

from model import (Unsupported, gauss_point_loads, get, is_3d, lift_2d, lower_static_3d,  # noqa: E402
                   members, moment_point_loads, nodalize, rotational_rank)

_TOOLS = os.path.join(HERE, "..", ".tools")


def _default_bin():
    for p in (os.path.join(_TOOLS, "ccx-hp", "bin", "ccx"), os.path.join(_TOOLS, "ccx", "bin", "ccx")):
        if os.access(p, os.X_OK):
            return p
    return os.path.join(_TOOLS, "ccx-hp", "bin", "ccx")


BIN = os.environ.get("CCX_BIN") or _default_bin()

NAME = "calculix"
ANALYSES = ("static",)
TOL = {"static": (1e-6, None)}

_FLAGS = ("rx", "ry", "rz", "rrx", "rry", "rrz")
_DISP = ("dx", "dy", "dz", "drx", "dry", "drz")
_SPR = ("kx", "ky", "kz", "krx", "kry", "krz")
_RELEASES = {"Start": ("releaseTStart", "releaseMyStart", "releaseMzStart"),
             "End": ("releaseTEnd", "releaseMyEnd", "releaseMzEnd")}
J_REL = 1e-9  # j must equal iy + iz to this relative accuracy
K_FACTOR = 1e13  # Euler-Bernoulli limit: phi = 12EI/(kGAL^2) = 1/K_FACTOR


def available():
    return os.access(BIN, os.X_OK)


def unsupported(model, analysis):
    if analysis not in ANALYSES:
        return [f"analysis {analysis} (U1: no geometric stiffness; mass not cubic-consistent)"]
    if not is_3d(model):
        try:
            model = lift_2d(model, allow_hinges=True)
        except Unsupported as ex:
            return [str(ex)]
    why = []
    for k in ("constraints", "connectors", "plates", "quads", "quad9s", "solidShells", "curvedShells", "curvedBeams"):
        if model.get(k):
            why.append(k)
    if model.get("leftHand"):
        why.append("leftHand axes")
    used = {e["sectionId"] for e in model["elements"].values() if e["type"] == "frame"}
    for s in model["sections"].values():
        if s.get("cw") is not None:
            why.append("warping (cw)")
        if s["id"] not in used:
            continue
        if s.get("asY") or s.get("asZ"):
            why.append("Timoshenko section (CalculiX U1 shear term is wrong)")
        if abs(s["j"] - (s["iy"] + s["iz"])) > J_REL * (s["iy"] + s["iz"]):
            why.append("j != iy + iz (U1 torsion uses the polar moment)")
    for e in model["elements"].values():
        if e["type"] not in ("frame", "truss"):
            why.append(f"element type {e['type']}")
    for s in model["supports"].values():
        if s.get("isInclined"):
            why.append("inclined support")
        if s.get("rw") or s.get("kw"):
            why.append("warping support")
        if s.get("angle"):
            why.append("rotated spring")
        for k in ("krx", "kry", "krz"):
            if s.get(k):
                why.append("rotational spring (SPRING1 ignores DOFs 4-6)")
        for f, d in zip(_FLAGS, _DISP):
            if s.get(d) and s.get(f) and not s.get(_SPR[_FLAGS.index(f)]):
                why.append("settlement (U1 turns prescribed displacements into wrong loads)")
    etype = {e["id"]: e["type"] for e in model["elements"].values()}
    for ld in model["loads"]:
        if ld["type"] not in ("nodal", "distributed", "pointOnElement"):
            why.append(f"load {ld['type']}")
        elif ld["type"] != "nodal" and etype.get(ld["data"]["elementId"]) != "frame":
            why.append("member load on a truss")
    return sorted(set(why))


# ---------------------------------------------------------------- writing

def _f(x):
    """A real in at most 20 characters (ccx reads several fields with
    f20.0): repr when it fits, else 14 significant digits."""
    r = repr(float(x))
    return r if len(r) <= 20 else f"{float(x):.13e}"


def _pivot_rows(rows):
    """Rows (each a 3-vector) -> an equivalent set whose pivot columns form
    an identity (Gauss-Jordan with partial pivoting): [(pivot, row)]."""
    rows = [list(r) for r in rows]
    out, used = [], set()
    for i in range(len(rows)):
        r = rows[i]
        cands = [k for k in range(3) if k not in used]
        p = max(cands, key=lambda k: abs(r[k]))
        if abs(r[p]) < 1e-12:
            continue
        r = [v / r[p] for v in r]
        for j in range(len(rows)):
            if j != i:
                c = rows[j][p]
                rows[j] = [rows[j][k] - c * r[k] for k in range(3)]
        for q, (pp, rr) in enumerate(out):
            c = rr[p]
            out[q] = (pp, [rr[k] - c * r[k] for k in range(3)])
        rows[i] = r
        out.append((p, r))
        used.add(p)
    return out


def write_inp(model):
    """(text, maps) for a supported 3D model (already lifted)."""
    native, info = model, None
    if any(ld["type"] != "nodal" for ld in model["loads"]):
        native, info = nodalize(moment_point_loads(model))
    mem = members(native)
    xyz = {n["id"]: (float(n["x"]), float(n["y"]), float(n["z"])) for n in native["nodes"].values()}
    flags, disp, spr = {}, {}, {}
    for s in native["supports"].values():
        n = s["nodeId"]
        fl = flags.setdefault(n, [False] * 6)
        for k in range(6):
            fl[k] = fl[k] or bool(s.get(_FLAGS[k]))
            if s.get(_DISP[k]):
                disp.setdefault(n, {})[k] = float(s[_DISP[k]])
            if s.get(_SPR[k]):
                spr.setdefault(n, {})[k] = spr.get(n, {}).get(k, 0.0) + float(s[_SPR[k]])
    for n, d in spr.items():  # dof.rs: a spring frees its DOF
        for k in d:
            if n in flags:
                flags[n][k] = False
    _, art_rot = rotational_rank(native, flags, spr)

    nid_max = max(xyz)
    nodes = dict(xyz)
    elems = []      # (ccx id, type, nodes, section key)
    sections = []   # (elset, kind, data)
    equations = []  # [(node, dof, coef), ...]
    u1_nodes = set()
    eid = 0
    emax = max(mem)
    for e_id, m in sorted(mem.items()):
        e = m["e"]
        eid += 1
        if e["type"] == "truss":
            # A U1 with every moment released at both ends is the axial bar
            # exactly (ccx's T3D2 is expanded into solid elements). Its own
            # spin is held by torsion = 0 at the end node.
            ends = []
            for nid in (m["ni"], m["nj"]):
                nid_max += 1
                nodes[nid_max] = xyz[nid]
                ends.append(nid_max)
                u1_nodes.add(nid_max)
                for k in range(3):
                    equations.append([(nid_max, k + 1, 1.0), (nid, k + 1, -1.0)])
            p, row = _pivot_rows([m["ex"]])[0]
            equations.append([(ends[1], 4 + p, 1.0)] + [(ends[1], 4 + k, row[k]) for k in range(3)
                                                        if k != p and abs(row[k]) > 0])
            elems.append((eid, "U1", tuple(ends)))
            sections.append((f"E{eid}", "truss", m))
            continue
        ends = []
        for nid, end in ((m["ni"], "Start"), (m["nj"], "End")):
            rel = [bool(e.get(r)) for r in _RELEASES[end]]
            if not any(rel):
                ends.append(nid)
                u1_nodes.add(nid)
                continue
            nid_max += 1
            dup = nid_max
            nodes[dup] = xyz[nid]
            ends.append(dup)
            u1_nodes.add(dup)
            for k in range(3):
                equations.append([(dup, k + 1, 1.0), (nid, k + 1, -1.0)])
            axes = [ax for ax, r in zip((m["ex"], m["ey"], m["ez"]), rel) if not r]
            for p, row in _pivot_rows(axes):
                eq = [(dup, 4 + p, 1.0)]
                eq += [(dup, 4 + k, row[k]) for k in range(3) if k != p and abs(row[k]) > 0]
                eq += [(nid, 4 + k, -row[k]) for k in range(3) if abs(row[k]) > 0]
                equations.append(eq)
        elems.append((eid, "U1", tuple(ends)))
        sections.append((f"E{eid}", "beam", m))
    # Joints carrying rotation equations / rotational restraints without a U1
    # element of their own: a soft stub activates their rotation DOFs.
    frame_nodes = {m["ni"] for m in mem.values() if m["e"]["type"] == "frame"} | \
                  {m["nj"] for m in mem.values() if m["e"]["type"] == "frame"}
    stubs = []
    for nid in sorted(frame_nodes - u1_nodes):
        nid_max += 1
        tip = nid_max
        p = xyz[nid]
        nodes[tip] = (p[0] + 1.0, p[1], p[2])
        eid += 1
        elems.append((eid, "U1", (nid, tip)))
        stubs.append((f"E{eid}", tip))
        u1_nodes.add(nid)
    rot_nodes = u1_nodes

    E_max = max(m["e"] * 1000.0 for m in native["materials"].values())
    out = ["*HEADING", "stabileo differential model", "*NODE,NSET=NALL"]
    for n in sorted(nodes):
        x, y, z = nodes[n]
        out.append(f"{n},{_f(x)},{_f(y)},{_f(z)}")
    if any(t == "U1" for _, t, _ in elems):
        out.append("*USER ELEMENT,TYPE=U1,INTEGRATION POINTS=2,MAXDOF=6,NODES=2")
    for k, t, ns in elems:
        out.append(f"*ELEMENT,TYPE={t},ELSET=E{k}")
        out.append(f"{k},{ns[0]},{ns[1]}")
    for mt in native["materials"].values():
        out += [f"*MATERIAL,NAME=M{mt['id']}", "*ELASTIC", f"{_f(mt['e'] * 1000.0)},{_f(mt['nu'])}"]
    if stubs:
        out += ["*MATERIAL,NAME=MSTUB", "*ELASTIC", f"{_f(E_max * 1e-20)},0.3"]
    for elset, kind, m in sections:
        s = m["sec"]
        mat = f"M{m['e']['materialId']}"
        if kind == "truss":
            # Bending / torsion stiffness is condensed out by the releases;
            # any positive inertia gives the same bar.
            i = s["a"] ** 2 / 12.0
            out += [f"*BEAM SECTION,ELSET={elset},MATERIAL={mat},SECTION=GENERAL",
                    f"{_f(s['a'])},{_f(i)},0.,{_f(i)},1.e13",
                    f"{_f(m['ey'][0])},{_f(m['ey'][1])},{_f(m['ey'][2])}"]
            continue
        k = K_FACTOR * 12.0 * m["E"] * max(s["iy"], s["iz"]) / (m["G"] * s["a"] * m["L"] ** 2)
        out += [f"*BEAM SECTION,ELSET={elset},MATERIAL={mat},SECTION=GENERAL",
                f"{_f(s['a'])},{_f(s['iz'])},0.,{_f(s['iy'])},{_f(k)}",
                f"{_f(m['ey'][0])},{_f(m['ey'][1])},{_f(m['ey'][2])}"]
    for elset, tip in stubs:
        out += [f"*BEAM SECTION,ELSET={elset},MATERIAL=MSTUB,SECTION=GENERAL",
                "1.,1.,0.,1.,1.e13", "0.,1.,0."]
    springs = []
    for n, d in sorted(spr.items()):
        for k, v in sorted(d.items()):
            eid += 1
            springs.append((eid, n, k, v))
    for k, n, dof, v in springs:
        out += [f"*ELEMENT,TYPE=SPRING1,ELSET=S{k}", f"{k},{n}", f"*SPRING,ELSET=S{k}", f"{dof + 1}", _f(v)]
    if equations:
        out.append("*EQUATION")
        for eq in equations:
            out.append(str(len(eq)))
            for k in range(0, len(eq), 4):  # at most 4 terms per line
                out.append(",".join(f"{n},{d},{_f(c)}" for n, d, c in eq[k:k + 4]))
    out.append("*BOUNDARY")
    for n in sorted(flags):
        for k in range(6):
            if not flags[n][k]:
                continue
            if k >= 3 and n not in rot_nodes:
                continue  # no rotation DOFs there (truss joint)
            v = disp.get(n, {}).get(k, 0.0)
            out.append(f"{n},{k + 1},{k + 1},{_f(v)}")
    for elset, tip in stubs:
        out.append(f"{tip},1,6,0.")
    out += ["*STEP", "*STATIC", "*CLOAD"]
    nodal = {}
    for ld in native["loads"]:
        x = ld["data"]
        acc = nodal.setdefault(x["nodeId"], [0.0] * 6)
        for k, key in enumerate(("fx", "fy", "fz", "mx", "my", "mz")):
            acc[k] += get(x, key)
    for n in sorted(nodal):
        for k, v in enumerate(nodal[n]):
            if v == 0.0:
                continue
            if k >= 3 and (n not in rot_nodes or n in art_rot):
                # Only stabileo's artificial spring would resist it: a local
                # mechanism (the engine reports it as such).
                raise Unsupported("nodal moment at a node without rotational stiffness")
            out.append(f"{n},{k + 1},{_f(v)}")
    out += ["*NODE PRINT,NSET=NALL", "U", "*END STEP"]
    return "\n".join(out) + "\n", dict(art_rot=art_rot, rot_nodes=rot_nodes, native=native)


# ---------------------------------------------------------------- running



def parse_dat(text):
    """{node: [6]} from the *NODE PRINT U block (3 or 6 values per node)."""
    disp = {}
    lines = text.splitlines()
    i = 0
    while i < len(lines):
        if lines[i].lstrip().startswith("displacements"):
            i += 1
            while i < len(lines) and not lines[i].strip():
                i += 1
            while i < len(lines) and lines[i].strip():
                t = lines[i].split()
                vals = [float(v) for v in t[1:]]
                disp[int(t[0])] = (vals + [0.0] * 6)[:6]
                i += 1
            continue
        i += 1
    return disp


def run_ccx(text, binary=None):
    with tempfile.TemporaryDirectory(prefix="ccx-") as d:
        with open(os.path.join(d, "m.inp"), "w") as f:
            f.write(text)
        env = dict(os.environ, OMP_NUM_THREADS="1", CCX_NPROC_STIFFNESS="1", CCX_NPROC_EQUATION_SOLVER="1")
        p = subprocess.run([binary or BIN, "-i", "m"], capture_output=True, text=True, cwd=d, env=env, timeout=600)
        log = p.stdout + p.stderr
        dat = os.path.join(d, "m.dat")
        if "*ERROR" in log or not os.path.exists(dat):
            err = [ln.strip() for ln in log.splitlines() if "ERROR" in ln or "error" in ln.lower()][:4]
            raise RuntimeError(f"ccx exit {p.returncode}: {' | '.join(err) or log[-300:]}")
        with open(dat) as f:
            return f.read(), log


def write_native(model, analysis, path):
    m = model if is_3d(model) else lift_2d(model, allow_hinges=True)
    with open(path + ".inp", "w") as f:
        f.write(write_inp(m)[0])


def run(model, analysis="static", densities=None, n_modes=6):
    why = unsupported(model, analysis)
    if why:
        raise Unsupported(", ".join(why))
    if not is_3d(model):
        return lower_static_3d(run(lift_2d(model, allow_hinges=True), analysis), model)
    text, maps = write_inp(model)
    dat, log = run_ccx(text)
    raw = parse_dat(dat)
    if any(math.isnan(v) for u in raw.values() for v in u):
        raise RuntimeError("ccx: NaN displacements (singular stiffness)")
    disp = {}
    for n in model["nodes"].values():
        nid = n["id"]
        u = list(raw.get(nid, [0.0] * 6))
        if nid not in maps["rot_nodes"]:
            u[3:] = [0.0, 0.0, 0.0]
        disp[nid] = u
    # Without reactions and end forces (above), the comparison's scale comes
    # from the displacements alone. When every load goes straight into the
    # supports, they are round-off of either program: nothing to compare.
    xs = [c for n in model["nodes"].values() for c in (n["x"], n["y"], n["z"])]
    size = max(max(xs) - min(xs), 1e-12)
    f_max = max([abs(get(ld["data"], k)) for ld in model["loads"]
                 for k in ("fx", "fy", "fz", "px", "py", "pz", "qXI", "qXJ", "qYI", "qYJ", "qZI", "qZJ")]
                + [abs(get(ld["data"], k)) / size for ld in model["loads"] for k in ("mx", "my", "mz")] + [0.0])
    ea = max(mt["e"] * 1000.0 for mt in model["materials"].values()) * max(sc["a"] for sc in model["sections"].values())
    u_ref = f_max * size * size / ea
    u_max = max([abs(v) for u in disp.values() for v in u[:3]] + [abs(v) * size for u in disp.values() for v in u[3:]])
    if u_max <= 1e-10 * u_ref:
        raise Unsupported("no deformation: every load goes into the supports (CalculiX gives no reactions to compare)")
    art = sorted(set(maps["art_rot"]) | {n["id"] for n in model["nodes"].values() if n["id"] not in maps["rot_nodes"]})
    return dict(dim=3, disp=disp, reac={}, forces={}, art_rot=art, kappa=None)
