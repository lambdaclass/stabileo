"""stabileo 3D frame models -> Frame3DD (20140514+, patched build, see build.sh).

Element pair: stabileo `frame` (Euler-Bernoulli, or Timoshenko with
asY/asZ) <-> Frame3DD frame element (shear flag on: Timoshenko with
phi = 12EI/(G As L^2), the same exact two-node element). Mapping:

  * units: E (MPa) x 1000 -> kN/m^2, G = E/(2(1+nu)); density kg/m^3 / 1000
    -> t/m^3 (kN, m, s, t consistent).
  * local axes: Frame3DD builds them from the roll angle p (coordtrans.c,
    Zvert=1): y = cos p y0 + sin p z0 with z0 the component of +Z normal to
    the member and y0 = z0 x x; vertical members (Cz = +-1 exactly) use
    y = (-Cz sin p, cos p, 0). We port stabileo's compute_local_axes_3d
    (default reference, localY*, rollAngle) and solve for p.
  * shear areas: stabileo pairs asY with Iy (shear along local z) and asZ
    with Iz, Frame3DD pairs Asz with Iy and Asy with Iz: Asz = asY,
    Asy = asZ. A missing shear area (Euler-Bernoulli plane) is written as
    1e10 * A. 1e6 * A was not enough: on the short sub-elements nodalize
    makes at partial-load ends, phi = 12 E I / (G As L^2) reached ~2e-6, above
    the 1e-6 tolerance (frame2d-746114: one rotation off by 1.4e-6).
  * end forces: Frame3DD's Q are the forces on the element in local axes
    (Q = k u - equivalent loads), the same vector as OpenSees localForce:
    nStart = -Q1, vyStart = Q2, ..., nEnd = Q7, vyEnd = -Q8, ...
  * member loads: full-length uniform -> nU, partial/trapezoidal (all three
    local axes) -> nW (Frame3DD's own fixed-end forces, shear-corrected).
    Interior point loads are moved to inserted nodes (common.model.nodalize):
    Frame3DD's point-load fixed-end forces have two bugs (frame3dd_io.c):
    the axial share is swapped (Nx1 = P a/L instead of P b/L) and the shear
    correction of the transverse shares uses Ksz for y loads and Ksy for z
    loads. Both are Frame3DD bugs, not stabileo ones (README.md).
  * supports: rigid flags (per node, OR-ed); settlements -> prescribed
    displacements (Frame3DD only prescribes restrained DOFs).

Not representable (Unsupported): trusses, releases/hinges, springs,
settlements on free DOFs, thermal loads, constraints, connectors, shells,
curved beams, warping, inclined supports, left-handed axes.

Modal: Frame3DD's consistent mass adds rotary inertia (rho Iy, rho Iz) that
stabileo's Euler-Bernoulli consistent mass does not have and uses J (the
torsion constant) for the polar mass where stabileo uses Iy + Iz. The
`frame3dd-norot` build drops the rotary inertia terms; modal models are
generated with J = Iy + Iz so the polar masses agree.

P-Delta: Frame3DD's geometric-stiffness iteration (geom flag) solves
(K + K_G(N)) u = f with N from the end forces, to an equilibrium error of
`tol`; stabileo's solve_pdelta iterates the same fixed point. Frame3DD's
torsional K_G term N J/(A L) is stabileo's Wagner term N (Iy+Iz)/(A L)
(#404) when J = Iy + Iz, as pdelta3d generates; build.sh adds it to
Frame3DD's end torque, which left it out. Frame3DD's K_G is also
shear-corrected, which stabileo's is not: P-Delta models use
Euler-Bernoulli sections.
"""

import math
import os
import re
import subprocess
import tempfile

from conditioning import frame_kappa
from model import Unsupported, get, is_3d, lift_2d, lower_static_3d, members, nodalize

HERE = os.path.dirname(os.path.abspath(__file__))
TOOLS = os.path.join(HERE, "..", ".tools", "frame3dd")
BIN = os.environ.get("FRAME3DD_BIN", os.path.join(TOOLS, "frame3dd"))
BIN_NOROT = os.environ.get("FRAME3DD_NOROT_BIN", os.path.join(TOOLS, "frame3dd-norot"))

NAME = "frame3dd"
ANALYSES = ("static", "modal", "pdelta")


def available():
    return os.access(BIN, os.X_OK) and os.access(BIN_NOROT, os.X_OK)


def unsupported(model, analysis):
    why = []
    if not is_3d(model):
        # 2D models run lifted into the XZ plane (common.model.lift_2d).
        if analysis != "static":
            return ["2D model: static only"]
        try:
            model = lift_2d(model)
        except Unsupported as ex:
            return [str(ex)]
    for k in ("constraints", "connectors", "plates", "quads", "quad9s", "solidShells", "curvedShells", "curvedBeams"):
        if model.get(k):
            why.append(k)
    if model.get("leftHand"):
        why.append("leftHand axes")
    for s in model["sections"].values():
        if s.get("cw") is not None:
            why.append("warping (cw)")
    for e in model["elements"].values():
        if e["type"] != "frame":
            why.append(f"element type {e['type']}")
        for r in ("releaseMyStart", "releaseMyEnd", "releaseMzStart", "releaseMzEnd", "releaseTStart", "releaseTEnd"):
            if e.get(r):
                why.append("member releases")
    for s in model["supports"].values():
        if s.get("isInclined"):
            why.append("inclined support")
        if s.get("rw") or s.get("kw"):
            why.append("warping support")
        for k in ("kx", "ky", "kz", "krx", "kry", "krz"):
            if s.get(k):
                why.append("spring support")
        for f, d in zip(("rx", "ry", "rz", "rrx", "rry", "rrz"), ("dx", "dy", "dz", "drx", "dry", "drz")):
            if s.get(d) and not _restrained(model, s["nodeId"], f):
                why.append("settlement on a free DOF")
    for ld in model["loads"]:
        if ld["type"] not in ("nodal", "distributed", "pointOnElement"):
            why.append(f"load {ld['type']}")
    if analysis == "pdelta":
        for ld in model["loads"]:
            if ld["type"] == "pointOnElement" or (ld["type"] == "distributed" and (
                    ld["data"].get("a") or ld["data"].get("b") is not None)):
                why.append("pdelta: interior member loads (nodalizing changes the K_G discretization)")
            if ld["type"] == "distributed" and (ld["data"].get("qXI") or ld["data"].get("qXJ")):
                why.append("pdelta: axial member load (Frame3DD's N includes it, stabileo's does not)")
        for s in model["sections"].values():
            if s.get("asY") or s.get("asZ"):
                why.append("pdelta: Timoshenko section (Frame3DD's K_G is shear-corrected)")
    return sorted(set(why))


_FLAGS = ("rx", "ry", "rz", "rrx", "rry", "rrz")
_DISP = ("dx", "dy", "dz", "drx", "dry", "drz")


def _restrained(model, nid, flag):
    return any(s["nodeId"] == nid and s.get(flag) for s in model["supports"].values())


def roll_angle(ex, ey):
    """Frame3DD roll angle (degrees) whose local y equals `ey` (coordtrans.c)."""
    cx, cy, cz = ex
    if abs(cz) == 1.0:
        return math.degrees(math.atan2(-cz * ey[0], ey[1]))
    den = math.sqrt(1.0 - cz * cz)
    y0 = (-cy / den, cx / den, 0.0)
    z0 = (-cx * cz / den, -cy * cz / den, den)
    return math.degrees(math.atan2(sum(a * b for a, b in zip(ey, z0)), sum(a * b for a, b in zip(ey, y0))))


def _f(x):
    return repr(float(x))


def write_3dd(model, analysis="static", densities=None, n_modes=6, tol=1e-12):
    """(text, maps) for a supported model. maps: node/element renumbering and
    nodalize info."""
    native = model
    info = None
    if analysis == "static" and any(ld["type"] == "pointOnElement" for ld in model["loads"]):
        native, info = nodalize(model)
    mem = members(native)
    nids = sorted(n["id"] for n in native["nodes"].values())
    nmap = {nid: k + 1 for k, nid in enumerate(nids)}
    eids = sorted(mem)
    emap = {eid: k + 1 for k, eid in enumerate(eids)}
    xyz = {n["id"]: (n["x"], n["y"], n["z"]) for n in native["nodes"].values()}
    out = ["stabileo differential model", "", f"{len(nids)}"]
    for nid in nids:
        out.append(f"{nmap[nid]} {_f(xyz[nid][0])} {_f(xyz[nid][1])} {_f(xyz[nid][2])} 0")
    flags = {}
    disp = {}
    for s in native["supports"].values():
        fl = flags.setdefault(s["nodeId"], [0] * 6)
        dv = disp.setdefault(s["nodeId"], [0.0] * 6)
        for k, f in enumerate(_FLAGS):
            if s.get(f):
                fl[k] = 1
            if s.get(_DISP[k]):
                dv[k] = float(s[_DISP[k]])
    rnodes = [n for n in sorted(flags) if any(flags[n])]
    out += ["", f"{len(rnodes)}"]
    for n in rnodes:
        out.append(f"{nmap[n]} " + " ".join(str(v) for v in flags[n]))
    shear = any(m["sec"].get("asY") or m["sec"].get("asZ") for m in mem.values())
    out += ["", f"{len(eids)}"]
    rho = densities or {}
    for eid in eids:
        m = mem[eid]
        s = m["sec"]
        big = 1e10 * s["a"]
        asz = s.get("asY") or big
        asy = s.get("asZ") or big
        p = roll_angle(m["ex"], m["ey"])
        # Frame3DD requires d > 0 even when no mass is used.
        d = rho.get(str(m["e"]["materialId"]), 1000.0) / 1000.0
        out.append(" ".join([str(emap[eid]), str(nmap[m["ni"]]), str(nmap[m["nj"]]), _f(s["a"]), _f(asy), _f(asz),
                             _f(s["j"]), _f(s["iy"]), _f(s["iz"]), _f(m["E"]), _f(m["G"]), _f(p), _f(d)]))
    geom = 1 if analysis == "pdelta" else 0
    out += ["", f"{int(shear)} {geom} 1.0 1.0 -1", "", "1", "0 0 0"]
    # loads
    nodal = {}
    unif, trap = [], []
    for ld in native["loads"]:
        x = ld["data"]
        if ld["type"] == "nodal":
            acc = nodal.setdefault(x["nodeId"], [0.0] * 6)
            for k, key in enumerate(("fx", "fy", "fz", "mx", "my", "mz")):
                acc[k] += get(x, key)
            continue
        eid = x["elementId"]
        L = mem[eid]["L"]
        a = x.get("a") or 0.0
        b = x.get("b") if x.get("b") is not None else L
        q = [(get(x, f"q{c}I"), get(x, f"q{c}J")) for c in "XYZ"]
        if abs(a) < 1e-12 and abs(b - L) < 1e-12 * max(1.0, L) and all(qi == qj for qi, qj in q):
            unif.append((emap[eid], [qi for qi, _ in q]))
        else:
            # Frame3DD rejects x2 > L by any rounding: keep inside.
            b = min(b, L * (1 - 1e-15))
            a = max(a, 0.0)
            trap.append((emap[eid], [(a, b, qi, qj) for qi, qj in q]))
    out.append(f"{len(nodal)}")
    for nid in sorted(nodal):
        out.append(f"{nmap[nid]} " + " ".join(_f(v) for v in nodal[nid]))
    out.append(f"{len(unif)}")
    for e, q in unif:
        out.append(f"{e} " + " ".join(_f(v) for v in q))
    out.append(f"{len(trap)}")
    for e, rows in trap:
        for k, (a, b, qi, qj) in enumerate(rows):
            out.append(("%d " % e if k == 0 else "  ") + " ".join(_f(v) for v in (a, b, qi, qj)))
    out += ["0", "0"]
    dn = [n for n in rnodes if any(disp[n])]
    out.append(f"{len(dn)}")
    for n in dn:
        out.append(f"{nmap[n]} " + " ".join(_f(v) for v in disp[n]))
    if analysis in ("modal", "pdelta"):
        # pdelta: one mode only so that `tol` (read with the modal data) sets
        # the equilibrium tolerance of the geometric-stiffness iteration.
        # The subspace iteration works on min(nM + 8, 2 nM) vectors, which
        # must stay below the number of DOFs. With nM just above the modes
        # compared it does not converge the highest of them and can skip a
        # mode altogether (modal3d-268: nM = 6 misses the 2.961 Hz mode 5,
        # nM = 12 returns it as 2.9615 Hz, nM = 20 as 2.96138213459 Hz like
        # stabileo): ask for as many modes as the subspace allows, at least
        # 20 more than compared, and return the first n_modes.
        nm = max(1, min(n_modes + 20, (6 * len(nids) - 1) // 2)) if analysis == "modal" else 1
        out += ["", f"{nm}", "1", "0", _f(tol), "0.0", "1.0", "0", "0", "0", "0", "0"]
    else:
        out += ["", "0", "0"]
    return "\n".join(out) + "\n", dict(nmap=nmap, emap=emap, info=info, native=native)


_NUM = r"[-+]?(?:\d+\.?\d*(?:[eE][-+]?\d+)?|nan|inf)"


def parse_out(text, n_nodes):
    """Frame3DD .out -> dict(disp {k: [6]}, forces {e: [12]}, reac {k: [6]},
    freqs [Hz], shapes [{k: [6]}]) in Frame3DD numbering."""
    lines = text.splitlines()
    res = dict(disp={}, forces={}, reac={}, freqs=[], shapes=[])
    i = 0
    while i < len(lines):
        ln = lines[i]
        if ln.startswith("N O D E   D I S P L A C E M E N T S"):
            i += 2
            while i < len(lines) and re.match(r"^\s+\d+\s", lines[i]):
                t = lines[i].split()
                res["disp"][int(t[0])] = [float(v) for v in t[1:7]]
                i += 1
            continue
        if ln.startswith("F R A M E   E L E M E N T   E N D   F O R C E S"):
            i += 2
            while i < len(lines) and re.match(r"^\s+\d+\s+\d+\s", lines[i]):
                t = lines[i].split()
                res["forces"].setdefault(int(t[0]), []).extend(float(v) for v in t[2:8])
                i += 1
            continue
        if ln.startswith("R E A C T I O N S"):
            i += 2
            while i < len(lines) and re.match(r"^\s+\d+\s", lines[i]):
                t = lines[i].split()
                res["reac"][int(t[0])] = [float(v) for v in t[1:7]]
                i += 1
            continue
        mm = re.match(r"^\s+MODE\s+(\d+):\s+f=\s*(" + _NUM + r")\s+Hz", ln)
        if mm:
            res["freqs"].append(float(mm.group(2)))
            while not lines[i].strip().startswith("Node"):
                i += 1
            i += 1
            shape = {}
            for _ in range(n_nodes):
                t = lines[i].split()
                shape[int(t[0])] = [float(v) for v in t[1:7]]
                i += 1
            res["shapes"].append(shape)
            continue
        i += 1
    return res


def run_frame3dd(text, binary):
    with tempfile.TemporaryDirectory(prefix="f3dd-") as d:
        inp, outp = os.path.join(d, "m.3dd"), os.path.join(d, "m.out")
        with open(inp, "w") as f:
            f.write(text)
        env = dict(os.environ, FRAME3DD_OUTDIR=d)
        p = subprocess.run([binary, "-i", inp, "-o", outp, "-q", "-x"], capture_output=True, text=True,
                           cwd=d, env=env, timeout=600)
        if not os.path.exists(outp):
            raise RuntimeError(f"frame3dd exit {p.returncode}: {(p.stderr or p.stdout)[-300:]}")
        with open(outp) as f:
            out = f.read()
        if "not positive-definite" in out or "not pos-def" in (p.stderr or ""):
            raise RuntimeError("frame3dd: stiffness matrix not positive definite")
        return out, p.stderr


def run(model, analysis="static", densities=None, n_modes=6, tol=1e-12):
    """Reference results in the harness shape (common/compare.py)."""
    why = unsupported(model, analysis)
    if why:
        raise Unsupported(", ".join(why))
    if not is_3d(model):
        return lower_static_3d(run(lift_2d(model), analysis, densities, n_modes, tol), model)
    # P-Delta keeps Frame3DD's torsional K_G term N J/(A L): it is stabileo's
    # Wagner term N (Iy+Iz)/(A L) for the J = Iy + Iz that pdelta3d generates.
    binary = BIN_NOROT if analysis == "modal" else BIN
    text, maps = write_3dd(model, analysis, densities, n_modes, tol)
    out, err = run_frame3dd(text, binary)
    raw = parse_out(out, len(maps["nmap"]))
    if analysis == "pdelta":
        mm = re.search(r"R M S    R E L A T I V E    E Q U I L I B R I U M    E R R O R:\s*(" + _NUM + ")", out)
        if "NR iteration" in err and "not pos-def" in err:
            raise RuntimeError("frame3dd: geometric stiffness iteration failed")
    inv = {v: k for k, v in maps["nmap"].items()}
    orig_nodes = {n["id"] for n in model["nodes"].values()}
    if analysis == "modal":
        if not raw["freqs"]:
            raise RuntimeError("frame3dd: no modes in the output")
        shapes = [{inv[k]: v for k, v in s.items() if inv[k] in orig_nodes} for s in raw["shapes"]]
        return {"freqs": raw["freqs"][:n_modes], "shapes": shapes[:n_modes]}
    disp = {inv[k]: v for k, v in raw["disp"].items() if inv[k] in orig_nodes}
    for nid in orig_nodes:
        disp.setdefault(nid, [0.0] * 6)
    reac = {}
    sup_nodes = {s["nodeId"] for s in model["supports"].values()}
    for nid in sup_nodes:
        reac[nid] = raw["reac"].get(maps["nmap"][nid], [0.0] * 6)
    forces = {}
    names = ["n", "vy", "vz", "mx", "my", "mz"]
    sub = maps["info"]["sub"] if maps["info"] else {e: [e] for e in maps["emap"]}
    for eid, subs in sub.items():
        qa = raw["forces"][maps["emap"][subs[0]]]
        qb = raw["forces"][maps["emap"][subs[-1]]]
        fd = {}
        for k, n in enumerate(names):
            fd[f"{n}Start"] = -qa[k] if k == 0 else qa[k]
            fd[f"{n}End"] = qb[6 + k] if k == 0 else -qb[6 + k]
        forces[eid] = fd
    # Frame3DD does not report a condition number: estimate it from an
    # independent assembly (common/conditioning.py) of the model stabileo
    # solves (kappa: the singularity statuses) and of the nodalized model
    # Frame3DD factors (kappa_solved: its round-off, for the tolerance).
    # P-Delta factors K + K_G, which K's kappa does not describe: None.
    kappa = kappa_solved = None
    if analysis == "static":
        kappa = frame_kappa(model)
        kappa_solved = frame_kappa(maps["native"]) if maps["native"] is not model else kappa
    return dict(dim=3, disp=disp, reac=reac, forces=forces, art_rot=[], kappa=kappa, kappa_solved=kappa_solved)
