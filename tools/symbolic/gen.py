"""Write engine/tests/symbolic_elements.rs: stabileo's frame-family element
kernels against matrices derived symbolically in derive.py.

    tools/symbolic/.venv/bin/python -I tools/symbolic/gen.py          # write
    tools/symbolic/.venv/bin/python -I tools/symbolic/gen.py --check  # compare

Every parameter point is an f64 (so the Rust call sees exactly the value the
derivation used); the derivation evaluates exactly, in rationals (or, for the
transformations, to 50 digits), and the expectation is the correctly rounded
f64 of that exact value. The test compares at a relative tolerance of 1e-13.
The output is a pure function of this script and derive.py (fixed seeds), so
CI regenerates it and fails on any difference.
"""

from __future__ import annotations

import os
import random
import sys
from fractions import Fraction
from itertools import product

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import sympy as sp  # noqa: E402

import derive as d  # noqa: E402

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
OUT = os.path.join(ROOT, "engine", "tests", "symbolic_elements.rs")

# ─── numbers ───────────────────────────────────────────────────────────────


def q(v) -> sp.Rational:
    """The exact rational value of an f64."""
    f = Fraction(v)
    return sp.Rational(f.numerator, f.denominator)


def lit(v) -> str:
    """Rust literal of the f64 nearest to the exact value v."""
    if isinstance(v, (bool,)):
        return "true" if v else "false"
    if isinstance(v, float):
        f = v
    else:
        v = sp.sympify(v)
        if v.is_Rational:
            f = float(Fraction(int(v.p), int(v.q)))
        else:
            f = float(sp.N(v, 50))
    r = repr(f)
    if r in ("-0.0",):
        r = "0.0"
    if "e" not in r and "." not in r:
        r += ".0"
    return r


def decade(v) -> int:
    """floor(log10 v), in exact arithmetic."""
    f, k = Fraction(v), 0
    while Fraction(10) ** (k + 1) <= f:
        k += 1
    while Fraction(10) ** k > f:
        k -= 1
    return k


class Rng:
    def __init__(self, seed):
        self.r = random.Random(seed)

    def uni(self, lo, hi):
        return self.r.uniform(lo, hi)

    def log(self, lo, hi):
        """Roughly log-uniform on [lo, hi): a uniform mantissa times a power of
        ten, both correctly rounded, so the draw is the same on every platform
        (no libm exp/log, whose last bit may differ)."""
        k_lo, k_hi = decade(lo), decade(hi)
        k = self.r.randrange(k_lo, max(k_hi, k_lo + 1))
        return self.r.uniform(1.0, 10.0) * float(Fraction(10) ** k)

    def phi(self):
        """Shear parameters: EB, the c4 = 0 point φ = 2, slender and deep."""
        k = self.r.randrange(5)
        return [0.0, 2.0, self.uni(0.0, 0.3), self.uni(0.3, 4.0), self.log(4.0, 40.0)][k]

    def section(self):
        return dict(
            e=self.log(1e4, 3e8),
            a=self.log(1e-4, 0.5),
            iy=self.log(1e-8, 5e-2),
            iz=self.log(1e-8, 5e-2),
            j=self.log(1e-9, 5e-2),
            cw=self.log(1e-12, 1e-3),
            g=self.log(4e3, 1.2e8),
            l=self.log(0.05, 60.0),
        )

    def choice(self, xs):
        return xs[self.r.randrange(len(xs))]


# ─── Rust emission helpers ─────────────────────────────────────────────────


def sparse(m) -> str:
    items = []
    for i in range(m.rows):
        for j in range(m.cols):
            if m[i, j] != 0:
                items.append(f"({i}, {j}, {lit(m[i, j])})")
    return "&[" + ", ".join(items) + "]"


def dense(v) -> str:
    return "[" + ", ".join(lit(z) for z in v) + "]"


def hinge3d(rel) -> str:
    my_s, mz_s, t_s, my_e, mz_e, t_e = rel
    return (f"Hinge3D {{ release_my_start: {lit(my_s)}, release_mz_start: {lit(mz_s)}, "
            f"release_t_start: {lit(t_s)}, release_my_end: {lit(my_e)}, "
            f"release_mz_end: {lit(mz_e)}, release_t_end: {lit(t_e)} }}")


class Out:
    def __init__(self):
        self.parts = []
        self.counts = {}

    def test(self, name, doc, body, n):
        self.counts[name] = n
        self.parts.append(f"/// {doc}\n#[test]\nfn {name}() {{\n{body}}}\n")


# ─── stiffness ─────────────────────────────────────────────────────────────

RELS_2D = [(False, False), (True, False), (False, True), (True, True)]
RELS_3D = list(product([False, True], repeat=6))  # (my_s, mz_s, t_s, my_e, mz_e, t_e)


def gen_truss(o: Out, rng: Rng):
    lines = []
    n = 0
    for _ in range(8):
        s = rng.section()
        e, a, l = (s[k] for k in ("e", "a", "l"))
        kb = d.k_bar().subs({d.E: q(e), d.A: q(a), d.L: q(l)})
        k2 = sp.zeros(4, 4)
        d.scatter(k2, kb, [0, 2])
        k3 = sp.zeros(6, 6)
        d.scatter(k3, kb, [0, 3])
        lines.append(f"    check_matrix(&truss_local_stiffness_2d({lit(e)}, {lit(a)}, {lit(l)}), 4, {sparse(k2)}, \"truss 2d\");\n")
        lines.append(f"    check_matrix(&truss_local_stiffness_3d({lit(e)}, {lit(a)}, {lit(l)}), 6, {sparse(k3)}, \"truss 3d\");\n")
        n += 2
    # Global trusses: Tᵀ·k·T, directions with rational cosines.
    triples = [(3, 4, 5), (-3, 4, 5), (5, -12, 13), (-8, -15, 17), (1, 0, 1), (0, -1, 1), (20, 21, 29), (-7, 24, 25)]
    for cx, sy, h in triples:
        s = rng.section()
        e, a, l = (s[k] for k in ("e", "a", "l"))
        c, sn = sp.Rational(cx, h), sp.Rational(sy, h)
        kloc = sp.zeros(4, 4)
        d.scatter(kloc, d.k_bar().subs({d.E: q(e), d.A: q(a), d.L: q(l)}), [0, 2])
        t = d.truss_transform_2d(c, sn)
        lines.append(f"    check_matrix(&truss_global_stiffness_2d({lit(e)}, {lit(a)}, {lit(l)}, {lit(c)}, {lit(sn)}), 4, {sparse(t.T * kloc * t)}, \"truss global 2d\");\n")
        n += 1
    quads = [(1, 2, 2, 3), (2, 3, 6, 7), (-1, 4, 8, 9), (2, -6, 9, 11), (4, 4, -7, 9), (0, 0, 1, 1), (-6, 2, 3, 7), (8, -9, 12, 17)]
    for dx, dy, dz, h in quads:
        s = rng.section()
        e, a = s["e"], s["a"]
        scale = rng.choice([0.5, 0.25, 1.5, 2.0, 0.125])
        ddx, ddy, ddz, l = dx * scale, dy * scale, dz * scale, h * scale
        ex = sp.Matrix([q(ddx), q(ddy), q(ddz)]) / q(l)
        r = sp.Matrix([list(ex), [0, 0, 0], [0, 0, 0]])  # only the axial row matters
        t = sp.zeros(6, 6)
        t[0:3, 0:3] = r
        t[3:6, 3:6] = r
        kloc = sp.zeros(6, 6)
        d.scatter(kloc, d.k_bar().subs({d.E: q(e), d.A: q(a), d.L: q(l)}), [0, 3])
        lines.append(f"    check_matrix(&truss_global_stiffness_3d({lit(e)}, {lit(a)}, {lit(l)}, {lit(ddx)}, {lit(ddy)}, {lit(ddz)}), 6, {sparse(t.T * kloc * t)}, \"truss global 3d\");\n")
        n += 1
    o.test("truss_stiffness_exact", "Truss bars, local and global (Tᵀ·k·T), from ½∫EA·u'² with linear shapes.", "".join(lines), n)


def gen_frame_2d(o: Out, rng: Rng):
    lines = []
    n = 0
    for hs, he in RELS_2D:
        for _ in range(6):
            s = rng.section()
            ph = rng.phi()
            e, a, i, l = s["e"], s["a"], s["iz"], s["l"]
            k = d.frame_2d(q(e), q(a), q(i), q(l), q(ph), hs, he)
            lines.append(
                f"    check_matrix(&frame_local_stiffness_2d({lit(e)}, {lit(a)}, {lit(i)}, {lit(l)}, {lit(hs)}, {lit(he)}, {lit(ph)}), 6, {sparse(k)}, \"frame 2d hs={hs} he={he} phi={ph}\");\n")
            n += 1
    o.test("frame_2d_stiffness_exact",
           "2D frame, Euler–Bernoulli and Timoshenko (interdependent interpolation), every hinge combination (static condensation).",
           "".join(lines), n)


def gen_frame_3d(o: Out, rng: Rng):
    lines = []
    n = 0
    for rel in RELS_3D:
        for _ in range(2):
            s = rng.section()
            py, pz = rng.phi(), rng.phi()
            e, a, iy, iz, j, l, g = (s[k] for k in ("e", "a", "iy", "iz", "j", "l", "g"))
            k = d.frame_3d(q(e), q(a), q(iy), q(iz), q(j), q(l), q(g), q(py), q(pz), rel)
            lines.append(
                f"    check_matrix(&frame_local_stiffness_3d({lit(e)}, {lit(a)}, {lit(iy)}, {lit(iz)}, {lit(j)}, {lit(l)}, {lit(g)}, {hinge3d(rel)}, {lit(py)}, {lit(pz)}), 12, {sparse(k)}, \"frame 3d {rel} phi=({py}, {pz})\");\n")
            n += 1
    o.test("frame_3d_stiffness_exact",
           "3D frame: axial, St-Venant torsion, both bending planes (θy = −w'), EB and Timoshenko, all 64 release combinations.",
           "".join(lines), n)


def gen_warping(o: Out, rng: Rng):
    lines = []
    n = 0
    for rel in RELS_3D[::3] + [(False,) * 6] * 6:
        s = rng.section()
        py, pz = rng.phi(), rng.phi()
        e, a, iy, iz, j, cw, l, g = (s[k] for k in ("e", "a", "iy", "iz", "j", "cw", "l", "g"))
        k = d.frame_3d_warping(q(e), q(a), q(iy), q(iz), q(j), q(cw), q(l), q(g), q(py), q(pz), rel)
        lines.append(
            f"    check_matrix(&frame_local_stiffness_3d_warping({lit(e)}, {lit(a)}, {lit(iy)}, {lit(iz)}, {lit(j)}, {lit(cw)}, {lit(l)}, {lit(g)}, {hinge3d(rel)}, {lit(py)}, {lit(pz)}), 14, {sparse(k)}, \"warping {rel}\");\n")
        n += 1
    o.test("frame_3d_warping_stiffness_exact",
           "14-DOF frame with restrained warping: cubic twist, ½∫(GJ·θ'² + ECw·θ''²) (Barsoum–Gallagher 1970).",
           "".join(lines), n)


# ─── geometric stiffness ───────────────────────────────────────────────────


def gen_kg(o: Out, rng: Rng):
    lines = []
    n = 0
    for hs, he in RELS_2D:
        for _ in range(4):
            p, l = rng.uni(-5e4, 5e4), rng.log(0.05, 60.0)
            k = d.kg_frame_2d(q(p), q(l), hs, he)
            lines.append(f"    check_matrix(&frame_kg_local_2d({lit(p)}, {lit(l)}, {lit(hs)}, {lit(he)}), 6, {sparse(k)}, \"kg 2d hs={hs} he={he}\");\n")
            n += 1
    for rel in RELS_3D:
        p, l = rng.uni(-5e4, 5e4), rng.log(0.05, 60.0)
        k = d.kg_frame_3d(q(p), q(l), rel)
        lines.append(f"    check_matrix(&frame_kg_local_3d({lit(p)}, {lit(l)}, &{hinge3d(rel)}), 12, {sparse(k)}, \"kg 3d {rel}\");\n")
        n += 1
    # The truss kernels take P/L itself: the derivation uses that f64 with L = 1.
    triples = [(3, 4, 5), (-3, 4, 5), (5, -12, 13), (-8, -15, 17), (1, 0, 1), (0, -1, 1)]
    for cx, sy, h in triples:
        pl = rng.uni(-5e4, 5e4)
        c, sn = sp.Rational(cx, h), sp.Rational(sy, h)
        k = d.kg_truss(q(pl), 1, [c, sn])
        lines.append(f"    check_matrix(&truss_kg_2d({lit(pl)}, {lit(c)}, {lit(sn)}), 4, {sparse(k)}, \"truss kg 2d\");\n")
        n += 1
    quads = [(1, 2, 2, 3), (2, 3, 6, 7), (-1, 4, 8, 9), (2, -6, 9, 11), (4, 4, -7, 9), (0, 0, 1, 1)]
    for dx, dy, dz, h in quads:
        pl = rng.uni(-5e4, 5e4)
        dirv = [sp.Rational(dx, h), sp.Rational(dy, h), sp.Rational(dz, h)]
        k = d.kg_truss(q(pl), 1, dirv)
        lines.append(f"    check_matrix(&truss_kg_3d({lit(pl)}, &{dense(dirv)}), 6, {sparse(k)}, \"truss kg 3d\");\n")
        n += 1
    o.test("geometric_stiffness_exact",
           "Kg from ½∫P·v'² with cubic Hermite v; released rotations follow the elastic (EB) map; trusses (P/L)(I − eeᵀ).",
           "".join(lines), n)


# ─── mass ──────────────────────────────────────────────────────────────────


def gen_mass(o: Out, rng: Rng):
    lines = []
    n = 0
    for hs, he in RELS_2D:
        for _ in range(3):
            ra, l = rng.log(1e-3, 50.0), rng.log(0.05, 60.0)
            m = d.mass_frame_2d(q(ra), q(l), hs, he)
            lines.append(f"    check_matrix(&frame_consistent_mass({lit(ra)}, {lit(l)}, {lit(hs)}, {lit(he)}), 6, {sparse(m)}, \"mass 2d\");\n")
            n += 1
    for _ in range(4):
        ra, l = rng.log(1e-3, 50.0), rng.log(0.05, 60.0)
        lines.append(f"    check_matrix(&truss_consistent_mass({lit(ra)}, {lit(l)}), 4, {sparse(d.mass_truss_2d(q(ra), q(l)))}, \"truss mass 2d\");\n")
        n += 1
    for rel in [(False,) * 6] * 6 + RELS_3D[1::9]:
        s = rng.section()
        ra = rng.log(1e-3, 50.0)
        a, iy, iz, l = s["a"], s["iy"], s["iz"], s["l"]
        m = d.mass_frame_3d(q(ra), q(a), q(iy), q(iz), q(l), rel)
        lines.append(f"    check_matrix(&frame_consistent_mass_3d({lit(ra)}, {lit(a)}, {lit(iy)}, {lit(iz)}, {lit(l)}, {hinge3d(rel)}), 12, {sparse(m)}, \"mass 3d {rel}\");\n")
        n += 1
    for rel in [(False,) * 6] * 4 + RELS_3D[5::21]:
        s = rng.section()
        ra = rng.log(1e-3, 50.0)
        a, iy, iz, cw, l = s["a"], s["iy"], s["iz"], s["cw"], s["l"]
        m = d.mass_frame_3d_warping(q(ra), q(a), q(iy), q(iz), q(cw), q(l), rel)
        lines.append(f"    check_matrix(&frame_consistent_mass_3d_warping({lit(ra)}, {lit(a)}, {lit(iy)}, {lit(iz)}, {lit(cw)}, {lit(l)}, {hinge3d(rel)}), 14, {sparse(m)}, \"mass 3d warping {rel}\");\n")
        n += 1
    o.test("mass_exact",
           "Consistent mass ½∫ρA·|u̇|² (Hermite transverse, linear axial, ρ(Iy+Iz) torsion; cubic twist with ρCw for warping members); half-mass lumping with releases.",
           "".join(lines), n)


# ─── loads ─────────────────────────────────────────────────────────────────


def frac_pos(rng, l):
    """A load position on [0, L], sometimes at an end or midspan."""
    k = rng.r.randrange(8)
    if k == 0:
        return 0.0
    if k == 1:
        return l
    if k == 2:
        return l / 2
    return rng.uni(0.0, l)


def load_scales(f_scale, l, n_nodes, layout):
    """Per-entry tolerance scale: forces by the total load, moments by it × L."""
    out = []
    for kind in layout:
        out.append(f_scale if kind == "f" else f_scale * l)
    return out


LAYOUT_2D = ["f", "f", "m", "f", "f", "m"]
LAYOUT_3D = ["f", "f", "f", "m", "m", "m"] * 2


def place_2d(fax, f4):
    return [fax[0], f4[0], f4[1], fax[1], f4[2], f4[3]]


def place_3d(fax, fy4, fz4):
    """fy4 over (v, θz); fz4 over (w, ψ_w) → θy = −ψ_w."""
    f = [0] * 12
    f[0], f[6] = fax
    f[1], f[5], f[7], f[11] = fy4
    f[2], f[4], f[8], f[10] = fz4[0], -fz4[1], fz4[2], -fz4[3]
    return f


def cross_check(ph, l, rel, **loads):
    """Consistent loads (with condensation) == exact solution of the loaded
    beam: the derivation's own proof, run on every load case emitted."""
    f = d.consistent_load_transverse(ph, l, **loads)
    k = (d.k_timoshenko().subs({d.phi: ph}) if ph != 0 else d.k_eb()).subs({d.E: 1, d.I: 1, d.L: l})
    fc = d.condense_load(k, f, [r for r, on in ((1, rel[0]), (3, rel[1])) if on])
    fx = d.exact_fixed_end(ph, l, release=rel, **loads)
    diff = (fc - fx).applyfunc(sp.simplify)
    assert diff == sp.zeros(4, 1), (ph, l, rel, loads, fc, fx)
    return fc


def gen_fef_2d(o: Out, rng: Rng):
    lines = []
    n = 0
    cases = 0
    for kind in ("full", "partial", "point", "thermal"):
        for _ in range(10):
            rel = rng.choice(RELS_2D)
            ph = rng.phi()
            l = rng.log(0.1, 30.0)
            L_ = q(l)
            phq = q(ph)
            if kind == "full":
                qi, qj = rng.uni(-50, 50), rng.uni(-50, 50)
                f4 = cross_check(phq, L_, rel, dist=[(q(qi), q(qj), 0, L_)])
                fax = [0, 0]
                call = f"fef_distributed_2d({lit(qi)}, {lit(qj)}, {lit(l)}, {lit(ph)})"
                fs = (abs(qi) + abs(qj)) * l
            elif kind == "partial":
                a = rng.uni(0, l)
                b = rng.uni(a, l) if rng.r.random() < 0.8 else l
                if rng.r.random() < 0.2:
                    a = 0.0
                if b - a < 1e-3 * l:
                    b = l
                qi, qj = rng.uni(-50, 50), rng.uni(-50, 50)
                f4 = cross_check(phq, L_, rel, dist=[(q(qi), q(qj), q(a), q(b))])
                fax = [0, 0]
                call = f"fef_partial_distributed_2d({lit(qi)}, {lit(qj)}, {lit(a)}, {lit(b)}, {lit(l)}, {lit(ph)})"
                fs = (abs(qi) + abs(qj)) * l
            elif kind == "point":
                a = frac_pos(rng, l)
                p, px, mz = rng.uni(-100, 100), rng.uni(-100, 100), rng.uni(-100, 100)
                f4 = cross_check(phq, L_, rel, points=[(q(p), q(a))], couples=[(q(mz), q(a))])
                fax = list(d.axial_load(L_, points=[(q(px), q(a))]))
                call = f"fef_point_load_2d({lit(p)}, {lit(px)}, {lit(mz)}, {lit(a)}, {lit(l)}, {lit(ph)})"
                fs = abs(p) + abs(px) + abs(mz) / l
            else:
                s = rng.section()
                e, a_, iz = s["e"], s["a"], s["iz"]
                dtu, dtg = rng.uni(-60, 60), rng.uni(-40, 40)
                alpha, h = rng.log(5e-6, 2e-5), rng.log(0.05, 2.0)
                # ε0 = α·ΔT; κ0 = α·ΔTg/h with ΔTg = T(−y) − T(+y) (engine convention).
                eps0 = q(alpha) * q(dtu)
                kap0 = q(alpha) * q(dtg) / q(h)
                fax = [-q(e) * q(a_) * eps0, q(e) * q(a_) * eps0]
                f4 = d.thermal_bending_load(q(e) * q(iz), kap0).subs(d.phi, phq)
                k = (d.k_timoshenko().subs({d.phi: phq}) if ph != 0 else d.k_eb()).subs({d.E: 1, d.I: 1, d.L: L_})
                f4 = d.condense_load(k, f4, [r for r, on in ((1, rel[0]), (3, rel[1])) if on])
                call = f"fef_thermal_2d({lit(e)}, {lit(a_)}, {lit(iz)}, {lit(l)}, {lit(dtu)}, {lit(dtg)}, {lit(alpha)}, {lit(h)})"
                fs = abs(float(fax[0])) + abs(float(q(e) * q(iz) * kap0)) / l
            want = place_2d(fax, list(f4))
            sc = load_scales(fs, l, 2, LAYOUT_2D)
            lines.append(
                f"    {{ let mut f = {call}; adjust_fef_for_hinges(&mut f, {lit(l)}, {lit(rel[0])}, {lit(rel[1])}, {lit(ph)}); "
                f"check_load(&f, &{dense(want)}, &{dense(sc)}, \"{kind} rel={rel} phi={ph}\"); }}\n")
            n += 1
            cases += 1
    o.test("fef_2d_exact",
           "2D equivalent nodal loads = ∫q·N with the element's own shapes, each case also solved exactly (piecewise ODE) in the generator; then condensed for the hinges.",
           "".join(lines), n)


def gen_fef_3d(o: Out, rng: Rng):
    lines = []
    n = 0
    for kind in ("full", "partial", "point", "thermal"):
        for _ in range(8):
            rel = rng.choice(RELS_3D)
            my_s, mz_s, _, my_e, mz_e, _ = rel
            py_, pz_ = rng.phi(), rng.phi()
            l = rng.log(0.1, 30.0)
            L_ = q(l)
            fax = [0, 0]
            if kind in ("full", "partial"):
                if kind == "full":
                    a, b = 0.0, l
                else:
                    a = rng.uni(0, l)
                    b = rng.uni(a, l)
                    if b - a < 1e-3 * l:
                        b = l
                qyi, qyj, qzi, qzj = (rng.uni(-50, 50) for _ in range(4))
                fy = cross_check(q(pz_), L_, (mz_s, mz_e), dist=[(q(qyi), q(qyj), q(a), q(b))])
                fz = cross_check(q(py_), L_, (my_s, my_e), dist=[(q(qzi), q(qzj), q(a), q(b))])
                if kind == "full":
                    call = f"fef_distributed_3d({lit(qyi)}, {lit(qyj)}, {lit(qzi)}, {lit(qzj)}, {lit(l)}, {lit(py_)}, {lit(pz_)})"
                else:
                    call = f"fef_partial_distributed_3d({lit(qyi)}, {lit(qyj)}, {lit(qzi)}, {lit(qzj)}, {lit(a)}, {lit(b)}, {lit(l)}, {lit(py_)}, {lit(pz_)})"
                fs = (abs(qyi) + abs(qyj) + abs(qzi) + abs(qzj)) * l
            elif kind == "point":
                a = frac_pos(rng, l)
                py, pz = rng.uni(-100, 100), rng.uni(-100, 100)
                fy = cross_check(q(pz_), L_, (mz_s, mz_e), points=[(q(py), q(a))])
                fz = cross_check(q(py_), L_, (my_s, my_e), points=[(q(pz), q(a))])
                call = f"fef_point_load_3d({lit(py)}, {lit(pz)}, {lit(a)}, {lit(l)}, {lit(py_)}, {lit(pz_)})"
                fs = abs(py) + abs(pz)
            else:
                s = rng.section()
                e, a_, iy, iz = s["e"], s["a"], s["iy"], s["iz"]
                dtu, dgy, dgz = rng.uni(-60, 60), rng.uni(-40, 40), rng.uni(-40, 40)
                alpha, hy, hz = rng.log(5e-6, 2e-5), rng.log(0.05, 2.0), rng.log(0.05, 2.0)
                eps0 = q(alpha) * q(dtu)
                # Engine conventions: ΔTgy = T(−y) − T(+y) → v'' = +α·ΔTgy/hy;
                # ΔTgz = T(+z) − T(−z) → w'' = −α·ΔTgz/hz.
                kv = q(alpha) * q(dgy) / q(hy)
                kw = -q(alpha) * q(dgz) / q(hz)
                fax = [-q(e) * q(a_) * eps0, q(e) * q(a_) * eps0]
                fy0 = d.thermal_bending_load(q(e) * q(iz), kv)
                fz0 = d.thermal_bending_load(q(e) * q(iy), kw)
                ky = (d.k_timoshenko().subs({d.phi: q(pz_)}) if pz_ != 0 else d.k_eb()).subs({d.E: 1, d.I: 1, d.L: L_})
                kz = (d.k_timoshenko().subs({d.phi: q(py_)}) if py_ != 0 else d.k_eb()).subs({d.E: 1, d.I: 1, d.L: L_})
                fy = d.condense_load(ky, fy0, [r for r, on in ((1, mz_s), (3, mz_e)) if on])
                fz = d.condense_load(kz, fz0, [r for r, on in ((1, my_s), (3, my_e)) if on])
                call = (f"fef_thermal_3d({lit(e)}, {lit(a_)}, {lit(iy)}, {lit(iz)}, {lit(l)}, {lit(dtu)}, {lit(dgy)}, {lit(dgz)}, "
                        f"{lit(alpha)}, {lit(hy)}, {lit(hz)})")
                fs = abs(float(fax[0])) + (abs(float(q(e) * q(iz) * kv)) + abs(float(q(e) * q(iy) * kw))) / l
            want = place_3d(fax, list(fy), list(fz))
            sc = load_scales(fs, l, 2, LAYOUT_3D)
            lines.append(
                f"    {{ let mut f = {call}; adjust_fef_for_hinges_3d(&mut f, {lit(l)}, {hinge3d(rel)}, {lit(py_)}, {lit(pz_)}); "
                f"check_load(&f, &{dense(want)}, &{dense(sc)}, \"{kind} {rel}\"); }}\n")
            n += 1
    o.test("fef_3d_exact",
           "3D equivalent nodal loads, both planes (local y ↔ φz, local z ↔ φy, θy = −w'), condensed for the releases.",
           "".join(lines), n)


def gen_axial(o: Out, rng: Rng):
    lines = []
    n = 0
    for _ in range(10):
        l = rng.log(0.1, 30.0)
        a = rng.uni(0, l) if rng.r.random() < 0.7 else 0.0
        b = rng.uni(a, l) if rng.r.random() < 0.7 else l
        qi, qj = rng.uni(-50, 50), rng.uni(-50, 50)
        f = d.axial_load(q(l), dist=[(q(qi), q(qj), q(a), q(b))])
        fs = (abs(qi) + abs(qj)) * l
        lines.append(f"    check_load(&axial_distributed_fef({lit(qi)}, {lit(qj)}, {lit(a)}, {lit(b)}, {lit(l)}), &{dense(list(f))}, &[{lit(fs)}, {lit(fs)}], \"axial\");\n")
        n += 1
    o.test("axial_distributed_exact", "Axial trapezoid on [a, b]: ∫q·N_lin.", "".join(lines), n)


def gen_warping_torque(o: Out, rng: Rng):
    lines = []
    n = 0
    fsym, (ti, tj) = d.warping_torque_load_consistent()
    for _ in range(8):
        s = rng.section()
        e, cw, g, j, l = s["e"], s["cw"], s["g"], s["j"], s["l"]
        t_i, t_j = rng.uni(-30, 30), rng.uni(-30, 30)
        f4 = fsym.subs({ti: q(t_i), tj: q(t_j), d.L: q(l)})
        want = [0] * 14
        want[3], want[6], want[10], want[13] = f4
        fs = (abs(t_i) + abs(t_j)) * l
        sc = [fs] * 14
        sc[6] = sc[13] = fs * l
        lines.append(f"    check_load(&fef_distributed_torsion_warping({lit(t_i)}, {lit(t_j)}, {lit(l)}, {lit(e)}, {lit(cw)}, {lit(g)}, {lit(j)}), &{dense(want)}, &{dense(sc)}, \"torque\");\n")
        n += 1
    o.test("warping_torque_load_exact",
           "Distributed torque on the warping element: ∫t·N with the element's cubic twist shapes.",
           "".join(lines), n)


def gen_shapes(o: Out, rng: Rng):
    lines = []
    n = 0
    nsym, psym = d.timoshenko_shapes()
    for _ in range(12):
        l = rng.log(0.1, 30.0)
        ph = rng.phi()
        xv = frac_pos(rng, l)
        sub = {d.x: q(xv), d.L: q(l), d.phi: q(ph)}
        nv = [f.subs(sub) for f in nsym]
        pv = [f.subs(sub) for f in psym]
        lines.append(f"    check_load(&timoshenko_deflection_shapes({lit(xv)}, {lit(l)}, {lit(ph)}), &{dense(nv)}, &[1.0, {lit(l)}, 1.0, {lit(l)}], \"N\");\n")
        lines.append(f"    check_load(&timoshenko_rotation_shapes({lit(xv)}, {lit(l)}, {lit(ph)}), &{dense(pv)}, &[{lit(1 / l)}, 1.0, {lit(1 / l)}, 1.0], \"psi\");\n")
        n += 2
    o.test("timoshenko_shapes_exact",
           "Interdependent Timoshenko shapes = exact homogeneous solutions of the Timoshenko equations.",
           "".join(lines), n)


# ─── transformations ───────────────────────────────────────────────────────


def gen_transforms(o: Out, rng: Rng):
    lines = []
    n = 0
    for cx, sy, h in [(3, 4, 5), (-3, 4, 5), (5, -12, 13), (-8, -15, 17), (1, 0, 1), (0, -1, 1), (-1, 0, 1)]:
        c, s = sp.Rational(cx, h), sp.Rational(sy, h)
        lines.append(f"    check_abs(&frame_transform_2d({lit(c)}, {lit(s)}), &{dense(list(d.frame_transform_2d(c, s)))}, \"T2d\");\n")
        lines.append(f"    check_abs(&truss_transform_2d({lit(c)}, {lit(s)}), &{dense(list(d.truss_transform_2d(c, s)))}, \"truss T2d\");\n")
        n += 2
    # 3D local axes: default (incl. vertical and near-vertical), explicit
    # local-y vectors, roll angles, left-handed.
    dirs = [(5, 0, 0), (-5, 0, 0), (0, 5, 0), (0, -5, 0), (0, 0, 5), (0, 0, -5), (3, 3, 0), (3, 0, 4), (3, 4, 5),
            (-2, 7, -1), (1, 0, 40), (0, -1, -40), (0.25, 0.5, 22), (2, 1, 0.003)]
    cases = []
    for dv in dirs:
        cases.append((dv, None, None, False))
    for dv in dirs[::2]:
        cases.append((dv, None, rng.choice([30, 45, 90, 180, -45, 270, 17.5]), False))
        cases.append((dv, None, None, True))
    for dv, ly in [((3, 4, 5), (0, 0, 1)), ((5, 0, 0), (0, 1, 1)), ((0, 0, 5), (1, 2, 0)), ((1, 2, 3), (-1, 0.5, 2)),
                   ((2, -1, 4), (0, 0, 0)), ((5, 0, 0), (2, 0, 0)), ((1, 1, 1), (3, -2, 0.5))]:
        cases.append((dv, ly, None, False))
        cases.append((dv, ly, 60, True))
    for dv, ly, roll, lh in cases:
        x0 = [rng.r.randrange(-40, 40) / 4 for _ in range(3)]
        x1 = [x0[k] + dv[k] for k in range(3)]
        dex = [q(x1[k]) - q(x0[k]) for k in range(3)]  # the f64 difference the kernel sees
        dex_f = [x1[k] - x0[k] for k in range(3)]
        assert all(q(dex_f[k]) == dex[k] for k in range(3)), "coordinate difference not exact"
        ly_q = None if ly is None else [q(float(c)) for c in ly]
        ex, ey, ez = d.local_axes_3d(dex, ly_q, roll, lh)
        ly_args = "None, None, None" if ly is None else ", ".join(f"Some({lit(float(c))})" for c in ly)
        roll_arg = "None" if roll is None else f"Some({lit(float(roll))})"
        want = list(ex) + list(ey) + list(ez)
        t = d.frame_transform_3d(ex, ey, ez)
        tw = d.frame_transform_3d(ex, ey, ez, warping=True)
        lines.append(
            f"    {{ let (ex, ey, ez) = compute_local_axes_3d({', '.join(lit(v) for v in x0)}, {', '.join(lit(v) for v in x1)}, {ly_args}, {roll_arg}, {lit(lh)});\n"
            f"      let got: Vec<f64> = ex.iter().chain(&ey).chain(&ez).copied().collect();\n"
            f"      check_abs(&got, &{dense(want)}, \"axes {dv} {ly} {roll} {lh}\");\n"
            f"      check_matrix_abs(&frame_transform_3d(&ex, &ey, &ez), 12, {sparse(t)}, \"T3d\");\n"
            f"      check_matrix_abs(&frame_transform_3d_warping(&ex, &ey, &ez), 14, {sparse(tw)}, \"T3d warping\"); }}\n")
        n += 3
    o.test("transformations_exact",
           "Rotation matrices: 2D, and 3D local axes from their geometric definition (Z-up default, local-y vector, roll by Rodrigues, left-handed).",
           "".join(lines), n)


# ─── file ──────────────────────────────────────────────────────────────────

HEADER = '''//! GENERATED by tools/symbolic/gen.py — do not edit; regenerate with
//!     tools/symbolic/.venv/bin/python -I tools/symbolic/gen.py
//!
//! Frame-family element kernels against matrices DERIVED symbolically from
//! shape functions and energy (tools/symbolic/derive.py), evaluated exactly at
//! random f64 parameter points: stiffness (EB, Timoshenko with interdependent
//! interpolation, axial, St-Venant and warping torsion, truss), static
//! condensation for every release combination, equivalent nodal loads (each
//! also re-derived in the generator from the exact solution of the loaded
//! beam), consistent and lumped mass, geometric stiffness, and the 2D/3D
//! transformations. Expectations are the correctly rounded f64 of the exact
//! value; the kernels must match to 1e-13 relative.
//! See docs/verification/SYMBOLIC.md.

#![allow(clippy::excessive_precision, clippy::unreadable_literal, clippy::approx_constant)]

use dedaliano_engine::element::*;
use dedaliano_engine::solver::geometric_stiffness::{frame_kg_local_2d, frame_kg_local_3d, truss_kg_2d, truss_kg_3d};
use dedaliano_engine::solver::mass_matrix::{frame_consistent_mass, frame_consistent_mass_3d, frame_consistent_mass_3d_warping, truss_consistent_mass};

const RTOL: f64 = 1e-13;

/// `got` (n×n row-major) against sparse exact entries. Entry (i, j) is held to
/// RTOL relative to max(|K_ij|, √|K_ii·K_jj|): the natural scale of a
/// symmetric positive semi-definite matrix, independent of units. A zero
/// diagonal (released DOF) demands exact zeros in its row and column.
fn check_matrix(got: &[f64], n: usize, want: &[(usize, usize, f64)], ctx: &str) {
    assert_eq!(got.len(), n * n, "{ctx}: size");
    let mut w = vec![0.0; n * n];
    for &(i, j, v) in want {
        w[i * n + j] = v;
    }
    for i in 0..n {
        for j in 0..n {
            let scale = w[i * n + j].abs().max((w[i * n + i] * w[j * n + j]).abs().sqrt());
            let err = (got[i * n + j] - w[i * n + j]).abs();
            assert!(
                err <= RTOL * scale,
                "{ctx}: entry ({i}, {j}) = {:e}, exact {:e} (error {:e}, scale {:e})",
                got[i * n + j], w[i * n + j], err, scale
            );
        }
    }
}

/// Unit-scale matrices (rotations): absolute tolerance.
fn check_matrix_abs(got: &[f64], n: usize, want: &[(usize, usize, f64)], ctx: &str) {
    let mut w = vec![0.0; n * n];
    for &(i, j, v) in want {
        w[i * n + j] = v;
    }
    check_abs(got, &w, ctx);
}

fn check_abs(got: &[f64], want: &[f64], ctx: &str) {
    assert_eq!(got.len(), want.len(), "{ctx}: size");
    for (k, (g, w)) in got.iter().zip(want).enumerate() {
        assert!((g - w).abs() <= RTOL, "{ctx}: [{k}] = {g:e}, exact {w:e}");
    }
}

/// Load vectors: entry k to RTOL relative to max(|f_k|, scale_k), scale_k the
/// total load (forces) or total load × L (moments) — the size of the terms
/// that cancel in it.
fn check_load(got: &[f64], want: &[f64], scale: &[f64], ctx: &str) {
    assert_eq!(got.len(), want.len(), "{ctx}: size");
    for k in 0..got.len() {
        let s = want[k].abs().max(scale[k]);
        let err = (got[k] - want[k]).abs();
        assert!(err <= RTOL * s, "{ctx}: [{k}] = {:e}, exact {:e} (error {:e}, scale {s:e})", got[k], want[k], err);
    }
}

'''


def build() -> tuple[str, dict]:
    d.checks()
    o = Out()
    gens = [gen_truss, gen_frame_2d, gen_frame_3d, gen_warping, gen_kg, gen_mass, gen_fef_2d, gen_fef_3d,
            gen_axial, gen_warping_torque, gen_shapes, gen_transforms]
    for k, g in enumerate(gens):
        g(o, Rng(1000 + k))
    total = sum(o.counts.values())
    summary = "\n".join(f"//!   {name}: {n} checks" for name, n in o.counts.items())
    text = HEADER.replace("//! See docs/verification/SYMBOLIC.md.\n",
                          f"//! See docs/verification/SYMBOLIC.md.\n//!\n//! Coverage ({total} kernel calls):\n{summary}\n")
    return text + "\n".join(o.parts), o.counts


def main():
    text, counts = build()
    if "--check" in sys.argv:
        cur = open(OUT, encoding="utf-8").read() if os.path.exists(OUT) else ""
        if cur != text:
            print(f"{OUT} is stale: regenerate with tools/symbolic/gen.py", file=sys.stderr)
            sys.exit(1)
        print("symbolic_elements.rs is up to date")
        return
    with open(OUT, "w", encoding="utf-8") as fh:
        fh.write(text)
    print(f"wrote {OUT}: {sum(counts.values())} kernel calls")


if __name__ == "__main__":
    main()
