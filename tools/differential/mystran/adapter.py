"""stabileo 3D frame models -> MYSTRAN (Nastran bulk data, SOL 1 / SOL 3).

Element pair: stabileo `frame` <-> MYSTRAN CBAR (BAR1.f90: the exact
two-node Euler-Bernoulli element, or the shear-flexible one when K1/K2 are
given: R = 12EI/L^3 / (1 + 12EI/(K A G L^2)), the same Timoshenko element
as stabileo's). stabileo `truss` <-> CROD with J = 0 (axial only).

Mapping:
  * units: E (MPa) x 1000 -> kN/m^2 and G = E/(2(1+nu)) on MAT1 (both given,
    so MYSTRAN does not derive one from the other); density kg/m^3 / 1000 ->
    t/m^3 (kN, m, s, t consistent).
  * local axes: CBAR x from GA to GB, the orientation vector v (basic) lies
    in the element x-y plane, z = x cross v. v := stabileo's local y
    (common.model.members, which ports compute_local_axes_3d), so the
    element axes are stabileo's exactly.
  * sections: PBAR I1 is the plane-1 (x-y plane, bending about z) inertia
    and I2 the plane-2 one: I1 = iz, I2 = iy, J = j. Shear factors: K1
    (plane 1, shear along y) = asZ / A and K2 = asY / A (stabileo pairs asY
    with Iy, i.e. shear along local z). Blank K1/K2: no shear deformation.
  * releases: CBAR pin flags PA / PB (element DOFs 4 = torsion, 5 = My,
    6 = Mz, by static condensation in PINFLG.f90).
  * supports: SPC (with the enforced value for settlements on restrained
    DOFs); springs -> grounded CELAS2 (as in the engine, a spring frees its
    DOF even when the rigid flag is also set). Rotations of nodes without
    rotational stiffness (truss-only) are fixed and not compared (stabileo
    puts a tiny artificial spring there); PARAM AUTOSPC N, so a mechanism
    makes MYSTRAN fail instead of being silently restrained.
  * loads: nodal -> FORCE / MOMENT. MYSTRAN has no PLOAD1 (no member loads
    of any kind), so every member load is moved to nodes inserted along the
    member: distributed loads as four point loads at well-spaced stations
    with the same moments of order 0..3 (common.model.moment_point_loads),
    point loads where they are (common.model.nodalize); exact for the cubic
    end-response functions of both elements. End forces of a split
    member are those of its first / last piece.
  * results: displacements and SPC forces (global = basic), element nodal
    forces in element axes (PARAM ELFORCEN LOCAL; forces on the element,
    K u): nStart = -F1, vyStart = F2, ..., nEnd = F7, vyEnd = -F8, ... The
    build patches the F06 to print these with 17 significant digits.
  * modal: MYSTRAN's BAR / ROD mass is lumped (BREL1.f90: rho A L / 2 on the
    translations of each end, no rotary inertia). stabileo's 3D frame mass is
    consistent, except for members with any released end (lumped, the same
    rho A L / 2): modal models are compared only when every member is a
    frame with a release (generator `modal3d_lumped`, mystran/gen.py).

Not representable (Unsupported): member loads on trusses, thermal loads,
constraints, connectors, shells, curved beams, warping, inclined supports,
left-handed axes, rotated springs; P-Delta (MYSTRAN has no geometric
stiffness for a static solve).
"""

import math
import os
import re
import subprocess
import sys
import tempfile

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "common"))

from model import (Unsupported, get, is_3d, lift_2d, lower_static_3d, members,  # noqa: E402
                   moment_point_loads, nodalize, rotational_rank)

BIN = os.environ.get("MYSTRAN_BIN", os.path.join(HERE, "..", ".tools", "mystran", "mystran"))

NAME = "mystran"
ANALYSES = ("static", "modal")
TOL = {"static": (1e-6, None), "modal": (1e-6, None)}

_FLAGS = ("rx", "ry", "rz", "rrx", "rry", "rrz")
_DISP = ("dx", "dy", "dz", "drx", "dry", "drz")
_SPR = ("kx", "ky", "kz", "krx", "kry", "krz")
_RELEASES = (("releaseTStart", "releaseMyStart", "releaseMzStart"), ("releaseTEnd", "releaseMyEnd", "releaseMzEnd"))


def available():
    return os.access(BIN, os.X_OK)


def unsupported(model, analysis):
    why = []
    if analysis not in ANALYSES:
        return [f"analysis {analysis}"]
    if not is_3d(model):
        if analysis != "static":
            return ["2D model: static only"]
        try:
            model = lift_2d(model, allow_hinges=True)
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
        if e["type"] not in ("frame", "truss"):
            why.append(f"element type {e['type']}")
        if analysis == "modal":
            if e["type"] != "frame":
                why.append("modal: truss (consistent mass in stabileo, lumped in MYSTRAN)")
            elif not any(e.get(r) for end in _RELEASES for r in end):
                why.append("modal: member without releases (consistent mass in stabileo, lumped in MYSTRAN)")
    for s in model["supports"].values():
        if s.get("isInclined"):
            why.append("inclined support")
        if s.get("rw") or s.get("kw"):
            why.append("warping support")
        if s.get("angle"):
            why.append("rotated spring")
    for ld in model["loads"]:
        if ld["type"] not in ("nodal", "distributed", "pointOnElement"):
            why.append(f"load {ld['type']}")
        elif ld["type"] != "nodal":
            e = next((e for e in model["elements"].values() if e["id"] == ld["data"]["elementId"]), None)
            if e is not None and e["type"] != "frame":
                why.append("member load on a truss")
    return sorted(set(why))


# ---------------------------------------------------------------- writing

def _nastran_float(s):
    return float(re.sub(r"(?<=[0-9.])([-+])(\d+)$", r"e\1\2", s))


def num(v):
    """A real in a 16-column Nastran field, the closest of the candidates
    that fit (the exponent letter may be dropped: 1.2345678901+05)."""
    v = float(v)
    if v == 0.0:
        return "0."
    cands = []
    for p in range(17):
        m, e = f"{v:.{p}e}".split("e")
        ex = int(e)
        if "." not in m:
            m += "."
        s = m if ex == 0 else m + ("+" if ex > 0 else "-") + str(abs(ex))
        if len(s) <= 16:
            cands.append(s)
    for d in range(17):
        s = f"{v:.{d}f}"
        if "." not in s:
            s += "."
        if len(s) <= 16:
            cands.append(s)
    return min(cands, key=lambda s: (abs(_nastran_float(s) - v), len(s)))


def card(name, fields):
    """One bulk entry in large-field format: `name*`, then 4 fields of 16
    columns per line, explicit continuation markers."""
    fields = ["" if f is None else (num(f) if isinstance(f, float) else str(f)) for f in fields]
    while len(fields) % 4:
        fields.append("")
    lines = []
    for k in range(0, len(fields), 4):
        head = (name + "*").ljust(8) if k == 0 else f"*C{k // 4}".ljust(8)
        body = "".join(f.ljust(16)[:16] if len(f) <= 16 else _too_long(f) for f in fields[k:k + 4])
        tail = f"*C{k // 4 + 1}" if k + 4 < len(fields) else ""
        lines.append(head + body + tail)
    return "\n".join(lines)


def _too_long(f):
    raise ValueError(f"field longer than 16 columns: {f!r}")


def write_bdf(model, analysis="static", densities=None, n_modes=6):
    """(text, maps) for a supported 3D model."""
    native, info = model, None
    if analysis == "static" and any(ld["type"] != "nodal" for ld in model["loads"]):
        # Moment-equivalent point loads at well-spaced stations: the Gauss
        # points of several loads on one member can fall 0.2 mm apart, and
        # MYSTRAN loses digits on such short pieces (frame2d-175: 6e-5 on a
        # cantilever with a full and a partial trapezoid; PyNite, Frame3DD
        # and Kratos agree with stabileo to 1e-13).
        native, info = nodalize(moment_point_loads(model))
    mem = members(native)
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
    for n, d in spr.items():
        for k in d:
            if n in flags:
                flags[n][k] = False
    _, art_rot = rotational_rank(native, flags, spr)
    for n in art_rot:
        flags.setdefault(n, [False] * 6)[3:] = [True, True, True]

    sol = "1" if analysis == "static" else "3"
    cc = ["SOL " + sol, "CEND", "TITLE = stabileo differential model", "ECHO = NONE", "SUBCASE 1",
          "  SPC = 1", "  DISP = ALL"]
    if analysis == "static":
        cc += ["  LOAD = 1", "  SPCFORCE = ALL", "  ELFORCE(NODE) = ALL"]
    else:
        cc += ["  METHOD = 1"]
    out = cc + ["BEGIN BULK", "PARAM   AUTOSPC N", "PARAM   ELFORCEN LOCAL", "PARAM   GRDPNT  -1"]
    for n in sorted(native["nodes"].values(), key=lambda n: n["id"]):
        out.append(card("GRID", [n["id"], 0, float(n["x"]), float(n["y"]), float(n["z"]), 0]))
    rho = densities or {}
    for m in sorted(native["materials"].values(), key=lambda m: m["id"]):
        E = m["e"] * 1000.0
        d = rho.get(str(m["id"]), 0.0) / 1000.0
        out.append(card("MAT1", [m["id"], E, E / (2 * (1 + m["nu"])), float(m["nu"]), float(d)]))
    pid = {}
    for eid, m in sorted(mem.items()):
        e, s = m["e"], m["sec"]
        if e["type"] == "truss":
            key = ("rod", s["id"], e["materialId"])
            if key not in pid:
                pid[key] = len(pid) + 1
                out.append(card("PROD", [pid[key], e["materialId"], float(s["a"]), 0.0]))
            out.append(card("CROD", [eid, pid[key], m["ni"], m["nj"]]))
            continue
        key = ("bar", s["id"], e["materialId"])
        if key not in pid:
            pid[key] = len(pid) + 1
            k1 = s["asZ"] / s["a"] if s.get("asZ") else None
            k2 = s["asY"] / s["a"] if s.get("asY") else None
            # PBAR: PID MID A I1 I2 J NSM | C1 C2 D1 D2 E1 E2 F1 F2 | K1 K2 I12
            out.append(card("PBAR", [pid[key], e["materialId"], float(s["a"]), float(s["iz"]), float(s["iy"]),
                                     float(s["j"]), 0.0, ""] + [""] * 8 +
                            [None if k1 is None else float(k1), None if k2 is None else float(k2), 0.0]))
        pins = []
        for end in _RELEASES:
            pins.append("".join(str(4 + k) for k, r in enumerate(end) if e.get(r)))
        out.append(card("CBAR", [eid, pid[key], m["ni"], m["nj"]] + [float(v) for v in m["ey"]] + [""] +
                        [pins[0], pins[1], "", "", "", "", "", ""]))
    nspc = 0
    for n in sorted(flags):
        for k in range(6):
            if flags[n][k]:
                # Settlements do not enter a modal solution (and MYSTRAN
                # rejects enforced displacements outside statics).
                v = float(disp.get(n, {}).get(k, 0.0)) if analysis == "static" else 0.0
                out.append(card("SPC", [1, n, k + 1, v]))
                nspc += 1
    ce = 10 ** (len(str(max(mem))) + 1)
    springs = [(n, k, v) for n in sorted(spr) for k, v in sorted(spr[n].items()) if not flags.get(n, [False] * 6)[k]]
    if springs:
        # MYSTRAN rejects a grounded CELAS2 (blank G2/C2: "invalid component
        # number 0"): ground the springs on a fully restrained extra grid.
        gnd = 10 ** (len(str(max(n["id"] for n in native["nodes"].values()))) + 1) + 1
        out.append(card("GRID", [gnd, 0, 0.0, 0.0, 0.0, 0]))
        for k in range(6):
            out.append(card("SPC", [1, gnd, k + 1, 0.0]))
        for n, k, v in springs:
            ce += 1
            out.append(card("CELAS2", [ce, float(v), n, k + 1, gnd, k + 1]))
    if analysis == "static":
        nodal = {}
        for ld in native["loads"]:
            x = ld["data"]
            acc = nodal.setdefault(x["nodeId"], [0.0] * 6)
            for k, key in enumerate(("fx", "fy", "fz", "mx", "my", "mz")):
                acc[k] += get(x, key)
        for n, f in sorted(nodal.items()):
            if any(f[:3]):
                out.append(card("FORCE", [1, n, 0, 1.0, float(f[0]), float(f[1]), float(f[2])]))
            if any(f[3:]):
                out.append(card("MOMENT", [1, n, 0, 1.0, float(f[3]), float(f[4]), float(f[5])]))
        if not nodal:
            raise Unsupported("unloaded model")
    else:
        # EIGRL: SID V1 V2 ND (Lanczos); mass-normalized vectors.
        out.append(card("EIGRL", [1, "", "", int(n_modes), "", "", "", "MASS"]))
    out.append("ENDDATA")
    return "\n".join(out) + "\n", dict(info=info, art_rot=art_rot, native=native, nspc=nspc)


# ---------------------------------------------------------------- reading

_NUM = r"[-+]?\d+\.\d*(?:[eE][-+]?\d+)?"


def parse_f06(text):
    """F06 -> dict(disp, spcf {grid: [6]}, elfn {elem: {grid: [6]}},
    freqs [Hz], shapes [{grid: [6]}])."""
    res = dict(disp={}, spcf={}, elfn={}, freqs=[], shapes=[])
    lines = text.splitlines()
    i, section, cur_elem, elem_type = 0, None, None, None
    while i < len(lines):
        ln = lines[i]
        s = ln.strip()
        if "D I S P L A C E M E N T S" in ln:
            section, tgt = "grid", res["disp"]
        elif "E I G E N V E C T O R" in ln:
            section, tgt = "grid", {}
            res["shapes"].append(tgt)
        elif "S P C   F O R C E S" in ln:
            section, tgt = "grid", res["spcf"]
        elif "E L E M   N O D A L   F O R C E S" in ln:
            section = "elfn"
        elif "F O R   E L E M E N T   T Y P E" in ln:
            elem_type = s.split("T Y P E")[-1].strip()
        elif "R E A L   E I G E N V A L U E S" in ln:
            section = "eig"
        elif s.startswith("OUTPUT FOR") or s.startswith("MAX*") or s.startswith("MIN*") or s.startswith("ABS*") \
                or "A P P L I E D" in ln or "E N G I N E E R I N G" in ln:
            section = None if not s.startswith("OUTPUT FOR") else section
        else:
            t = s.split()
            if section == "grid" and len(t) == 8 and t[0].isdigit() and t[1].isdigit():
                tgt[int(t[0])] = [float(v) for v in t[2:8]]
            elif section == "elfn":
                if len(t) == 8 and t[0].isdigit() and t[1].isdigit():
                    cur_elem = int(t[0])
                    res["elfn"].setdefault(cur_elem, {"type": elem_type})[int(t[1])] = [float(v) for v in t[2:8]]
                elif len(t) == 7 and t[0].isdigit() and cur_elem is not None:
                    res["elfn"][cur_elem][int(t[0])] = [float(v) for v in t[1:7]]
                elif t and not t[0].lstrip("-").replace(".", "").isdigit():
                    pass
            elif section == "eig" and len(t) == 7 and t[0].isdigit() and t[1].isdigit():
                res["freqs"].append(float(t[4]))
        i += 1
    return res


def run_mystran(text):
    with tempfile.TemporaryDirectory(prefix="mystran-") as d:
        inp = os.path.join(d, "m.bdf")
        with open(inp, "w") as f:
            f.write(text)
        p = subprocess.run([os.path.abspath(BIN), "m.bdf"], capture_output=True, text=True, cwd=d, timeout=900,
                           stdin=subprocess.DEVNULL)
        f06 = os.path.join(d, "m.F06")
        if not os.path.exists(f06):
            raise RuntimeError(f"mystran exit {p.returncode}: {(p.stderr or p.stdout)[-300:]}")
        with open(f06, errors="replace") as f:
            out = f.read()
        fatal = re.findall(r"\*ERROR\s+\d+:.*", out)
        if fatal:
            raise RuntimeError("mystran: " + "; ".join(sorted(set(x[:160] for x in fatal)))[:400])
        return out


def write_native(model, analysis, path):
    m = model if is_3d(model) else lift_2d(model, allow_hinges=True)
    text, _ = write_bdf(m, analysis)
    with open(path + ".bdf", "w") as f:
        f.write(text)


def run(model, analysis="static", densities=None, n_modes=6):
    why = unsupported(model, analysis)
    if why:
        raise Unsupported(", ".join(why))
    if not is_3d(model):
        return lower_static_3d(run(lift_2d(model, allow_hinges=True), analysis), model)
    while True:
        text, maps = write_bdf(model, analysis, densities, n_modes)
        try:
            raw = parse_f06(run_mystran(text))
            break
        except RuntimeError as ex:
            # Lanczos limits the modes to the problem size (error 9776):
            # ask for fewer, the driver compares the modes both returned.
            if analysis != "modal" or "9776" not in str(ex) or n_modes <= 1:
                raise
            n_modes -= 1
    orig = {n["id"] for n in model["nodes"].values()}
    if analysis == "modal":
        if not raw["freqs"] or len(raw["shapes"]) < len(raw["freqs"]):
            raise RuntimeError("mystran: no modes in the output")
        shapes = [{k: v for k, v in s.items() if k in orig} for s in raw["shapes"]]
        return {"freqs": raw["freqs"][:n_modes], "shapes": shapes[:n_modes]}
    if not raw["disp"]:
        raise RuntimeError("mystran: no displacements in the output")
    disp = {n: raw["disp"].get(n, [0.0] * 6) for n in orig}
    art = maps["art_rot"]
    for n in art:
        disp[n] = disp[n][:3] + [0.0, 0.0, 0.0]
    reac = {}
    for s in model["supports"].values():
        n = s["nodeId"]
        r = list(raw["spcf"].get(n, [0.0] * 6))
        if n in art:
            r[3:] = [0.0, 0.0, 0.0]
        # Springs: stabileo's reaction includes -k u of its support springs.
        for k, key in enumerate(_SPR):
            if s.get(key):
                r[k] -= float(s[key]) * disp[n][k]
        reac[n] = r
    mem = members(model)
    sub = maps["info"]["sub"] if maps["info"] else {e: [e] for e in mem}
    forces = {}
    names = ["n", "vy", "vz", "mx", "my", "mz"]
    for eid, subs in sub.items():
        a, b = subs[0], subs[-1]
        ni, nj = mem[eid]["ni"], mem[eid]["nj"]
        fa = raw["elfn"][a][ni]
        fb = raw["elfn"][b][nj]
        fd = {}
        for k, nm in enumerate(names):
            fd[f"{nm}Start"] = -fa[k] if k == 0 else fa[k]
            fd[f"{nm}End"] = fb[k] if k == 0 else -fb[k]
        if mem[eid]["e"]["type"] == "truss":
            for nm in names[1:]:
                fd[f"{nm}Start"] = fd[f"{nm}End"] = 0.0
        forces[eid] = fd
    return dict(dim=3, disp=disp, reac=reac, forces=forces, art_rot=sorted(art), kappa=None)
