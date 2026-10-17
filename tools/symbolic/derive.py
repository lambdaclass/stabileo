"""Frame-family element matrices derived from first principles with SymPy.

Every matrix here comes from shape functions and an energy (or virtual work)
expression, never from a textbook table typed in; the tables are what the
derivation is checked against (in the module's self-checks, `checks()`, which
`gen.py` runs before writing anything).

Conventions (stabileo's, see docs/verification/SYMBOLIC.md):

* 2D frame DOFs [u1, v1, θ1, u2, v2, θ2]; θ is the section rotation about z,
  counter-clockwise, which equals v' for Euler–Bernoulli members.
* 3D frame DOFs [u, v, w, θx, θy, θz] per node. θz = v' (bending in the x-y
  plane, inertia Iz, shear parameter φz); θy = −w' (bending in the x-z plane,
  inertia Iy, φy): a positive rotation about +y tips the axis toward −z.
* Warping element: the 3D DOFs plus the rate of twist θx' after θz at each node.
* Loads are equivalent nodal loads (the vector added to the right-hand side),
  not fixed-end reactions.
* φ = 12·E·I / (G·As·L²); μ = 1/(1+φ).
"""

from __future__ import annotations

import functools

import sympy as sp

x = sp.Symbol("x", real=True)
L = sp.Symbol("L", positive=True)
E, A, I, G, J, Cw, phi = sp.symbols("E A I G J C_w phi", positive=True)
P = sp.Symbol("P", real=True)  # axial force, tension positive
rho = sp.Symbol("rho", positive=True)  # mass per unit length (ρ·A)
rho_ip = sp.Symbol("rho_Ip", positive=True)  # polar mass moment per length (ρ·Ip)

# ─── shape functions ───────────────────────────────────────────────────────


def solve_shapes(unknown_fields, field_eqs, bc_rows):
    """Generic: polynomial fields with unknown coefficients, homogeneous field
    equations imposed identically in x, and one shape per boundary value.

    `unknown_fields` is a list of (expr, coeff_symbols); `field_eqs` a list of
    expressions that must vanish identically; `bc_rows` the list of boundary
    value expressions (the DOFs). Returns, for each field, the list of shape
    functions (field value when DOF k = 1 and the others 0)."""
    coeffs = [c for _, cs in unknown_fields for c in cs]
    eqs = []
    for fe in field_eqs:
        eqs += sp.Poly(sp.expand(fe), x).all_coeffs()
    shapes = [[] for _ in unknown_fields]
    for k in range(len(bc_rows)):
        rows = eqs + [bc_rows[i] - (1 if i == k else 0) for i in range(len(bc_rows))]
        sol = sp.solve(rows, coeffs, dict=True)
        assert len(sol) == 1, "shape functions not unique"
        for f, (expr, _) in enumerate(unknown_fields):
            shapes[f].append(sp.simplify(expr.subs(sol[0])))
    return shapes


@functools.cache
def linear_shapes():
    """Two-node Lagrange shapes [1 − x/L, x/L] (axial, St-Venant torsion)."""
    return [1 - x / L, x / L]


@functools.cache
def hermite_shapes():
    """Cubic Hermite shapes over (v1, v1', v2, v2'): the exact homogeneous
    solutions of EI·v'''' = 0."""
    a = sp.symbols("a0:4")
    v = sum(a[i] * x**i for i in range(4))
    (n,) = solve_shapes(
        [(v, a)],
        [],
        [v.subs(x, 0), sp.diff(v, x).subs(x, 0), v.subs(x, L), sp.diff(v, x).subs(x, L)],
    )
    return n


@functools.cache
def timoshenko_shapes():
    """Interdependent interpolation of the two-node Timoshenko beam.

    Fields: deflection v (cubic) and section rotation ψ (quadratic). They are
    the exact homogeneous solutions of the Timoshenko equations
        (G·As·(v' − ψ))' = 0,    E·I·ψ'' + G·As·(v' − ψ) = 0,
    with G·As = 12·E·I/(φ·L²). DOFs (v1, ψ1, v2, ψ2).
    Returns (N, Ψ): deflection and rotation shapes."""
    a = sp.symbols("a0:4")
    b = sp.symbols("b0:3")
    v = sum(a[i] * x**i for i in range(4))
    psi = sum(b[i] * x**i for i in range(3))
    gas = 12 * E * I / (phi * L**2)
    gamma = sp.diff(v, x) - psi
    n, ps = solve_shapes(
        [(v, a), (psi, b)],
        [sp.diff(gas * gamma, x), (E * I * sp.diff(psi, x, 2) + gas * gamma) * phi],
        [v.subs(x, 0), psi.subs(x, 0), v.subs(x, L), psi.subs(x, L)],
    )
    return n, ps


def integrate(expr, lo=0, hi=None):
    return sp.integrate(sp.expand(expr), (x, lo, L if hi is None else hi))


def gram(f, g, weight=1):
    """[∫ weight·f_i·g_j dx]."""
    return sp.Matrix(len(f), len(g), lambda i, j: sp.factor(integrate(weight * f[i] * g[j])))


# ─── stiffness ─────────────────────────────────────────────────────────────


@functools.cache
def k_bar(stiff=None):
    """Axial (EA) or St-Venant torsion (GJ) bar: ½∫ stiff·u'² dx."""
    n = linear_shapes()
    d = [sp.diff(f, x) for f in n]
    return gram(d, d, E * A if stiff is None else stiff)


@functools.cache
def k_eb():
    """Euler–Bernoulli bending block over (v1, θ1, v2, θ2): ½∫EI·v''² dx."""
    n = hermite_shapes()
    d2 = [sp.diff(f, x, 2) for f in n]
    return gram(d2, d2, E * I)


@functools.cache
def k_timoshenko():
    """Timoshenko bending block over (v1, ψ1, v2, ψ2) from the strain energy
    ½∫(E·I·ψ'² + G·As·(v' − ψ)²) dx with the interdependent shapes. Exact for
    the homogeneous beam (Przemieniecki 1968 §5.6, eq. 5.115)."""
    n, ps = timoshenko_shapes()
    gas = 12 * E * I / (phi * L**2)
    dps = [sp.diff(f, x) for f in ps]
    gam = [sp.diff(n[i], x) - ps[i] for i in range(4)]
    k = sp.Matrix(4, 4, lambda i, j: integrate(E * I * dps[i] * dps[j] + gas * gam[i] * gam[j]))
    return k.applyfunc(sp.factor)


@functools.cache
def k_warping():
    """Torsion with restrained warping over (θ1, θ1', θ2, θ2'): cubic Hermite
    twist, energy ½∫(G·J·θ'² + E·Cw·θ''²) dx. Barsoum & Gallagher (1970),
    eq. 9; McGuire, Gallagher & Ziemian, Matrix Structural Analysis (2000),
    §8.4 / eq. 8.22 (ke for the torsion element with warping)."""
    n = hermite_shapes()
    d1 = [sp.diff(f, x) for f in n]
    d2 = [sp.diff(f, x, 2) for f in n]
    return (gram(d1, d1, G * J) + gram(d2, d2, E * Cw)).applyfunc(sp.factor)


def condense(k, released):
    """Static condensation of the DOFs in `released` (Guyan, exact for the
    element because no load acts on them): K_rr − K_rc K_cc⁻¹ K_cr, embedded
    back with zero rows/columns at the released DOFs."""
    keep = [i for i in range(k.rows) if i not in released]
    if not released:
        return k
    kcc = k.extract(released, released)
    krc = k.extract(keep, released)
    red = k.extract(keep, keep) - krc * kcc.inv() * krc.T
    out = sp.zeros(k.rows, k.cols)
    for a, i in enumerate(keep):
        for b, j in enumerate(keep):
            out[i, j] = sp.factor(red[a, b])
    return out


def condense_load(k, f, released):
    """Condensed load f_r − K_rc K_cc⁻¹ f_c (released entries become zero)."""
    if not released:
        return f
    keep = [i for i in range(k.rows) if i not in released]
    kcc = k.extract(released, released)
    krc = k.extract(keep, released)
    red = f.extract(keep, [0]) - krc * kcc.inv() * f.extract(released, [0])
    out = sp.zeros(f.rows, 1)
    for a, i in enumerate(keep):
        out[i] = sp.factor(red[a])
    return out


def bending_block(timoshenko: bool):
    """Bending block over (v1, θ1, v2, θ2) with θ = ψ (= v' for EB)."""
    return k_timoshenko() if timoshenko else k_eb()


SIGN_Y = sp.diag(1, -1, 1, -1)  # (w, θy) = (w, −ψ_w): the x-z bending plane


def scatter(big, small, dofs):
    for a, i in enumerate(dofs):
        for b, j in enumerate(dofs):
            big[i, j] += small[a, b]


def frame_2d(e, a, i, l, phi_v, hs, he):
    """2D frame 6×6 at numbers (phi_v = 0: Euler–Bernoulli)."""
    kb = k_timoshenko() if phi_v != 0 else k_eb()
    kb = kb.subs({E: e, I: i, L: l, phi: phi_v})
    rel = [r for r, on in ((1, hs), (3, he)) if on]
    kb = condense(kb, rel)
    k = sp.zeros(6, 6)
    scatter(k, k_bar().subs({E: e, A: a, L: l}), [0, 3])
    scatter(k, kb, [1, 2, 4, 5])
    return k


def frame_3d(e, a, iy, iz, j, l, g, phi_y, phi_z, rel):
    """3D frame 12×12 at numbers; `rel` = (my_s, mz_s, t_s, my_e, mz_e, t_e)."""
    my_s, mz_s, t_s, my_e, mz_e, t_e = rel
    k = sp.zeros(12, 12)
    scatter(k, k_bar().subs({E: e, A: a, L: l}), [0, 6])
    if not (t_s or t_e):
        scatter(k, k_bar(G * J).subs({G: g, J: j, L: l}), [3, 9])
    for dofs, inertia, ph, s, rs, re in (
        ([1, 5, 7, 11], iz, phi_z, sp.eye(4), mz_s, mz_e),
        ([2, 4, 8, 10], iy, phi_y, SIGN_Y, my_s, my_e),
    ):
        kb = (k_timoshenko() if ph != 0 else k_eb()).subs({E: e, I: inertia, L: l, phi: ph})
        kb = condense(s * kb * s, [r for r, on in ((1, rs), (3, re)) if on])
        scatter(k, kb, dofs)
    return k


def frame_3d_warping(e, a, iy, iz, j, cw, l, g, phi_y, phi_z, rel):
    """14×14: the 12×12 with θx's St-Venant block replaced by the warping
    torsion block over (θx1, θx1', θx2, θx2'); a torsion release (either end)
    removes all twist stiffness, as in the 12×12."""
    my_s, mz_s, t_s, my_e, mz_e, t_e = rel
    k12 = frame_3d(e, a, iy, iz, j, l, g, phi_y, phi_z, (my_s, mz_s, True, my_e, mz_e, True))
    m = [0, 1, 2, 3, 4, 5, 7, 8, 9, 10, 11, 12]
    k = sp.zeros(14, 14)
    for p in range(12):
        for q in range(12):
            k[m[p], m[q]] = k12[p, q]
    if not (t_s or t_e):
        scatter(k, k_warping().subs({G: g, J: j, E: e, Cw: cw, L: l}), [3, 6, 10, 13])
    return k


# ─── geometric stiffness ───────────────────────────────────────────────────


@functools.cache
def kg_cubic():
    """Geometric stiffness of the bending block over (v1, θ1, v2, θ2): the
    second-order work ½∫P·v'² dx with cubic Hermite v (Przemieniecki 1968
    eq. 15.?; McGuire, Gallagher & Ziemian eq. 9.18): P/(30L)·[36, 3L, …]."""
    n = hermite_shapes()
    d1 = [sp.diff(f, x) for f in n]
    return gram(d1, d1, P)


@functools.cache
def kg_timoshenko():
    """The same work with the Timoshenko deflection shapes: what a
    shear-consistent Kg would be. Stabileo does NOT use it (it uses
    `kg_cubic` for every member); derived to document the difference."""
    n, _ = timoshenko_shapes()
    d1 = [sp.diff(f, x) for f in n]
    return gram(d1, d1, P)


def eb_release_map(rel_i, rel_j, s=1):
    """θ = T·(v1, θ1, v2, θ2): each released rotation replaced by the value
    that makes its Euler–Bernoulli end moment vanish (the elastic map). `s` is
    the sign of the rotation DOF (−1 for θy = −w')."""
    kb = (sp.diag(1, s, 1, s) * k_eb() * sp.diag(1, s, 1, s))
    rel = [r for r, on in ((1, rel_i), (3, rel_j)) if on]
    t = sp.eye(4)
    if rel:
        keep = [k for k in range(4) if k not in rel]
        sol = -kb.extract(rel, rel).inv() * kb.extract(rel, keep)
        for a, r in enumerate(rel):
            row = sp.zeros(1, 4)
            for b, k in enumerate(keep):
                row[k] = sp.simplify(sol[a, b])
            t[r, :] = row
    return t


def kg_frame_2d(p, l, hs, he):
    """2D frame Kg 6×6 (local), released rotations following the elastic map:
    Kg_c = Tᵀ·Kg·T, the work ½∫P·v'² over the propped/pinned shapes N·T."""
    t = eb_release_map(hs, he)
    kb = (t.T * kg_cubic() * t).subs({P: p, L: l})
    k = sp.zeros(6, 6)
    scatter(k, kb, [1, 2, 4, 5])
    return k


def kg_frame_3d(p, l, rel):
    my_s, mz_s, _t_s, my_e, mz_e, _t_e = rel
    k = sp.zeros(12, 12)
    for dofs, s, rs, re in (([1, 5, 7, 11], 1, mz_s, mz_e), ([2, 4, 8, 10], -1, my_s, my_e)):
        sm = sp.diag(1, s, 1, s)
        t = eb_release_map(rs, re, s)
        kb = (t.T * (sm * kg_cubic() * sm) * t).subs({P: p, L: l})
        scatter(k, kb, dofs)
    return k


def kg_truss(p, l, d):
    """Truss Kg in global coordinates: the transverse part of ½∫P·|u'|² with
    linear shapes: (P/L)·[[G, −G], [−G, G]], G = I − e·eᵀ, e the unit axis."""
    n = len(d)
    e = sp.Matrix(d) / sp.sqrt(sum(c**2 for c in d))
    gm = (sp.eye(n) - e * e.T) * p / l
    k = sp.zeros(2 * n, 2 * n)
    for i in range(n):
        for j in range(n):
            k[i, j] = gm[i, j]
            k[n + i, n + j] = gm[i, j]
            k[i, n + j] = -gm[i, j]
            k[n + i, j] = -gm[i, j]
    return k


# ─── mass ──────────────────────────────────────────────────────────────────


@functools.cache
def m_bar(density=None):
    n = linear_shapes()
    return gram(n, n, rho if density is None else density)


@functools.cache
def m_hermite():
    """Consistent translational mass of the bending block, ½∫ρA·v̇² with cubic
    Hermite v: ρAL/420·[156, 22L, 54, −13L; …] (Archer 1963; Przemieniecki
    eq. 11.?). Stabileo uses it for Timoshenko members too (no rotary
    inertia, no shear correction)."""
    n = hermite_shapes()
    return gram(n, n, rho)


def mass_frame_2d(rho_a, l, hs, he):
    if hs or he:
        # Particle lumping: half the member mass at each node, translations only.
        return sp.diag(rho_a * l / 2, rho_a * l / 2, 0, rho_a * l / 2, rho_a * l / 2, 0)
    k = sp.zeros(6, 6)
    scatter(k, m_bar().subs({rho: rho_a, L: l}), [0, 3])
    scatter(k, m_hermite().subs({rho: rho_a, L: l}), [1, 2, 4, 5])
    return k


def mass_truss_2d(rho_a, l):
    """Consistent truss mass ½∫ρA·|u̇|² with linear shapes in both directions,
    global DOFs [ux1, uy1, ux2, uy2] (isotropic, so frame-invariant)."""
    mb = m_bar().subs({rho: rho_a, L: l})
    k = sp.zeros(4, 4)
    scatter(k, mb, [0, 2])
    scatter(k, mb, [1, 3])
    return k


def mass_frame_3d(rho_a, a, iy, iz, l, rel):
    if any(rel):
        h = rho_a * l / 2
        return sp.diag(h, h, h, 0, 0, 0, h, h, h, 0, 0, 0)
    k = sp.zeros(12, 12)
    mb = m_bar().subs({rho: rho_a, L: l})
    scatter(k, mb, [0, 6])
    # Torsional rotary inertia ½∫ρ·Ip·θ̇x² with Ip ≈ Iy + Iz (stabileo's choice).
    scatter(k, m_bar(rho_ip).subs({rho_ip: rho_a * (iy + iz) / a, L: l}), [3, 9])
    mh = m_hermite().subs({rho: rho_a, L: l})
    scatter(k, mh, [1, 5, 7, 11])
    scatter(k, SIGN_Y * mh * SIGN_Y, [2, 4, 8, 10])
    return k


def mass_frame_3d_warping(rho_a, a, iy, iz, cw, l, rel):
    """14×14: the 12×12 with the torsion block replaced by the kinetic energy
    ½∫ρ(Ip·θ̇² + Cw·θ̇'²) of the cubic twist over (θx1, θx1', θx2, θx2')."""
    m12 = mass_frame_3d(rho_a, a, iy, iz, l, rel)
    m = [0, 1, 2, 3, 4, 5, 7, 8, 9, 10, 11, 12]
    k = sp.zeros(14, 14)
    for p in range(12):
        for q in range(12):
            k[m[p], m[q]] = m12[p, q]
    if any(rel):
        return k
    for i in (3, 10):
        for j in (3, 10):
            k[i, j] = 0
    n = hermite_shapes()
    d1 = [sp.diff(f, x) for f in n]
    tw = m_hermite().subs(rho, rho_a * (iy + iz) / a) + gram(d1, d1, rho_a * cw / a)
    scatter(k, tw.subs(L, l), [3, 6, 10, 13])
    return k


# ─── equivalent nodal loads ────────────────────────────────────────────────


def consistent_load_transverse(phi_v, l, dist=(), points=(), couples=()):
    """∫q·N + Σ P·N(a) + Σ M·Ψ(a) over (v1, θ1, v2, θ2) with the interdependent
    shapes (Hermite for φ = 0). dist: (qa, qb, a, b) linear on [a, b]."""
    if phi_v == 0:
        n = hermite_shapes()
        ps = [sp.diff(f, x) for f in n]
    else:
        n, ps = timoshenko_shapes()
    sub = {L: l, phi: phi_v}
    n = [f.subs(sub) for f in n]
    ps = [f.subs(sub) for f in ps]
    f = sp.zeros(4, 1)
    for qa, qb, a, b in dist:
        q = qa + (qb - qa) * (x - a) / (b - a)
        for k in range(4):
            f[k] += sp.integrate(sp.expand(q * n[k]), (x, a, b))
    for p, a in points:
        for k in range(4):
            f[k] += p * n[k].subs(x, a)
    for m, a in couples:
        for k in range(4):
            f[k] += m * ps[k].subs(x, a)
    return f.applyfunc(sp.simplify)


def exact_fixed_end(phi_v, l, dist=(), points=(), couples=(), release=(False, False)):
    """Equivalent nodal loads from the exact solution of the loaded Timoshenko
    (φ>0) or Euler–Bernoulli (φ=0) beam, no shape functions involved.

    Piecewise-polynomial solution of  s' = −q,  m' = −s... in the form
        (G·As·γ)' = −q,  E·I·ψ'' + G·As·γ = 0,  γ = v' − ψ,
    with jumps [G·As·γ] = −P at a point force and [E·I·ψ'] = −M at a couple;
    ends fixed (v = ψ = 0) or released (v = 0, no support moment). With
    s = G·As·γ and m = E·I·ψ' the boundary terms of the total potential give
    the support forces, and the equivalent nodal loads are their negatives,
    (s(0) + P0, m(0) + M0, −s(L) + PL, −m(L) + ML) (P0, M0, PL, ML: loads
    applied exactly at the ends).
    EI = 1 (the loads do not depend on it)."""
    ei = sp.Integer(1)
    breaks = sorted({sp.Integer(0), l} | {a for _, _, a, b in dist} | {b for _, _, a, b in dist}
                    | {a for _, a in points} | {a for _, a in couples})
    breaks = [c for c in breaks if 0 <= c <= l]
    segs = list(zip(breaks[:-1], breaks[1:]))
    unknowns, eqs, fields = [], [], []
    for k, (x0, x1) in enumerate(segs):
        av = sp.symbols(f"v{k}_0:6")
        bp = sp.symbols(f"p{k}_0:5")
        unknowns += list(av) + list(bp)
        v = sum(av[i] * x**i for i in range(6))
        psi = sum(bp[i] * x**i for i in range(5))
        q = 0
        for qa, qb, a, b in dist:
            if a <= x0 and x1 <= b:
                q += qa + (qb - qa) * (x - a) / (b - a)
        gamma = sp.diff(v, x) - psi
        if phi_v == 0:
            # EB: γ = 0 with s = −m' (the limit G·As → ∞).
            s = -ei * sp.diff(psi, x, 2)
            eqs += sp.Poly(sp.expand(gamma), x).all_coeffs()
        else:
            gas = 12 * ei / (phi_v * l**2)
            s = gas * gamma
            eqs += sp.Poly(sp.expand(ei * sp.diff(psi, x, 2) + s), x).all_coeffs()
        eqs += sp.Poly(sp.expand(sp.diff(s, x) + q), x).all_coeffs()
        fields.append((v, psi, s, ei * sp.diff(psi, x)))
    # interfaces
    for k in range(len(segs) - 1):
        c = segs[k][1]
        v0, p0, s0, m0 = (f.subs(x, c) for f in fields[k])
        v1, p1, s1, m1 = (f.subs(x, c) for f in fields[k + 1])
        pj = sum(p for p, a in points if a == c)
        mj = sum(m for m, a in couples if a == c)
        eqs += [v1 - v0, p1 - p0, s1 - s0 + pj, m1 - m0 + mj]
    # loads at the very ends act on the supports directly
    end_f = [sum(p for p, a in points if a == 0), sum(m for m, a in couples if a == 0),
             sum(p for p, a in points if a == l), sum(m for m, a in couples if a == l)]
    va, pa, sa, ma = (f.subs(x, 0) for f in fields[0])
    vb, pb, sb, mb = (f.subs(x, l) for f in fields[-1])
    eqs += [va, vb]
    # A released end has no support moment: m(0) + M0 = 0, m(L) − ML = 0
    # (a couple at the very end acts on the member, inside the hinge).
    eqs += [ma + end_f[1] if release[0] else pa, mb - end_f[3] if release[1] else pb]
    sol = sp.solve(eqs, unknowns, dict=True)
    assert len(sol) == 1
    s0v, m0v, sLv, mLv = (sp.simplify(z.subs(sol[0])) for z in (sa, ma, sb, mb))
    return sp.Matrix([s0v, m0v, -sLv, -mLv]) + sp.Matrix(end_f)


def thermal_bending_load(ei, kappa0):
    """∫ Ψ'·E·I·κ0 dx over (v1, θ1, v2, θ2): E·I·κ0·(Ψ(L) − Ψ(0)) = EIκ0·[0, −1, 0, 1]
    for every φ (the rotation shapes interpolate the DOFs)."""
    _, ps = timoshenko_shapes()
    return sp.Matrix([sp.simplify(ei * kappa0 * (f.subs(x, L) - f.subs(x, 0))) for f in ps])


def axial_load(l, dist=(), points=()):
    """∫ q·N_lin + Σ P·N_lin(a) over (u1, u2)."""
    n = [f.subs(L, l) for f in linear_shapes()]
    f = sp.zeros(2, 1)
    for qa, qb, a, b in dist:
        q = qa + (qb - qa) * (x - a) / (b - a)
        for k in range(2):
            f[k] += sp.integrate(sp.expand(q * n[k]), (x, a, b))
    for p, a in points:
        for k in range(2):
            f[k] += p * n[k].subs(x, a)
    return f


@functools.cache
def warping_torque_load_consistent():
    """∫ t(x)·N_k dx with t linear (t_i → t_j) and the cubic Hermite twist
    shapes of `k_warping`: the loads consistent with that stiffness, over
    (θx1, θx1', θx2, θx2')."""
    ti, tj = sp.symbols("t_i t_j", real=True)
    t = ti + (tj - ti) * x / L
    return sp.Matrix([sp.factor(integrate(t * f)) for f in hermite_shapes()]), (ti, tj)


# ─── coordinate transformations ────────────────────────────────────────────


def rot2(c, s):
    """Rows: local x = (c, s), local y = (−s, c) (counter-clockwise normal)."""
    return sp.Matrix([[c, s], [-s, c]])


def frame_transform_2d(c, s):
    r = rot2(c, s)
    t = sp.zeros(6, 6)
    for o in (0, 3):
        t[o:o + 2, o:o + 2] = r
        t[o + 2, o + 2] = 1
    return t


def truss_transform_2d(c, s):
    r = rot2(c, s)
    t = sp.zeros(4, 4)
    t[0:2, 0:2] = r
    t[2:4, 2:4] = r
    return t


def unit(v):
    return v / sp.sqrt(v.dot(v))


def rodrigues(axis, v, angle):
    """Right-handed rotation of v about the unit `axis` by `angle`."""
    return v * sp.cos(angle) + axis.cross(v) * sp.sin(angle) + axis * axis.dot(v) * (1 - sp.cos(angle))


def local_axes_3d(d, local_y=None, roll_deg=None, left_hand=False):
    """Stabileo's local axes, from their geometric definition:

    * ex along the member, I → J.
    * Default: local z is the direction of global up (Z; global X for members
      with |ex·Z| > 0.999) with its ex component removed, i.e. ez ∝ ex×(up×ex);
      ey = ez × ex.
    * Explicit local-y vector r: ey is r with its ex component removed,
      ey ∝ ex×(r×ex); ez = ex × ey.
    * Roll angle β (degrees): (ey, ez) rotated right-handedly about ex by β.
    * Left-handed: ey reversed (ez kept).
    Returns (ex, ey, ez) as exact SymPy vectors."""
    d = sp.Matrix(d)
    ex = unit(d)
    if local_y is not None and sp.Matrix(local_y).norm() > sp.Rational(1, 10**10):
        r = unit(sp.Matrix(local_y))
        if ex.cross(r).norm() < sp.Rational(1, 10**10):
            # r ∥ ex: the kernel's fallback reference, global X (or Y when
            # the member is within acos 0.9 of X).
            r = sp.Matrix([1, 0, 0]) if abs(ex[0]) < sp.Rational(9, 10) else sp.Matrix([0, 1, 0])
        ey = unit(ex.cross(r.cross(ex)))
        ez = ex.cross(ey)
    else:
        up = sp.Matrix([1, 0, 0]) if abs(ex[2]) > sp.Rational(999, 1000) else sp.Matrix([0, 0, 1])
        ez = unit(ex.cross(up.cross(ex)))
        ey = ez.cross(ex)
    if roll_deg is not None:
        beta = sp.pi * sp.Rational(roll_deg) / 180
        ey, ez = rodrigues(ex, ey, beta), rodrigues(ex, ez, beta)
    if left_hand:
        ey = -ey
    return ex, ey, ez


def frame_transform_3d(ex, ey, ez, warping=False):
    r = sp.Matrix([list(ex), list(ey), list(ez)])
    n = 14 if warping else 12
    t = sp.zeros(n, n)
    offs = [0, 3, 7, 10] if warping else [0, 3, 6, 9]
    for o in offs:
        t[o:o + 3, o:o + 3] = r
    if warping:
        t[6, 6] = 1
        t[13, 13] = 1
    return t


# ─── self-checks against the textbook tables ───────────────────────────────


def checks():
    """Each derived matrix against its closed form in the literature."""
    z = sp.simplify
    # Hermite bending: 12EI/L³ etc. (Przemieniecki eq. 5.?; any text)
    kb = k_eb()
    assert z(kb - E * I / L**3 * sp.Matrix([[12, 6 * L, -12, 6 * L], [6 * L, 4 * L**2, -6 * L, 2 * L**2],
                                             [-12, -6 * L, 12, -6 * L], [6 * L, 2 * L**2, -6 * L, 4 * L**2]])) == sp.zeros(4)
    # Timoshenko: Przemieniecki eq. 5.115 (with Φ = φ)
    kt = k_timoshenko()
    want = E * I / ((1 + phi) * L**3) * sp.Matrix([
        [12, 6 * L, -12, 6 * L],
        [6 * L, (4 + phi) * L**2, -6 * L, (2 - phi) * L**2],
        [-12, -6 * L, 12, -6 * L],
        [6 * L, (2 - phi) * L**2, -6 * L, (4 + phi) * L**2]])
    assert z(kt - want) == sp.zeros(4)
    assert z(kt.subs(phi, 0) - kb) == sp.zeros(4)
    # Timoshenko shapes: the closed forms quoted in engine/src/element/fef.rs
    n, ps = timoshenko_shapes()
    xi = x / L
    mu = 1 / (1 + phi)
    want_n = [mu * (1 - 3 * xi**2 + 2 * xi**3 + phi * (1 - xi)),
              mu * L * (xi - 2 * xi**2 + xi**3 + phi * (xi - xi**2) / 2),
              mu * (3 * xi**2 - 2 * xi**3 + phi * xi),
              mu * L * (-xi**2 + xi**3 - phi * (xi - xi**2) / 2)]
    want_p = [mu * 6 * (xi**2 - xi) / L, mu * (1 - 4 * xi + 3 * xi**2 + phi * (1 - xi)),
              mu * 6 * (xi - xi**2) / L, mu * (-2 * xi + 3 * xi**2 + phi * xi)]
    for k in range(4):
        assert z(n[k] - want_n[k]) == 0 and z(ps[k] - want_p[k]) == 0
    # Cubic Kg: P/(30L)·[36, 3L, -36, 3L; 3L, 4L², -3L, -L²; …]
    kg = kg_cubic()
    assert z(kg - P / (30 * L) * sp.Matrix([[36, 3 * L, -36, 3 * L], [3 * L, 4 * L**2, -3 * L, -L**2],
                                            [-36, -3 * L, 36, -3 * L], [3 * L, -L**2, -3 * L, 4 * L**2]])) == sp.zeros(4)
    # Timoshenko-consistent Kg differs for φ > 0 (documented, not used).
    assert z(kg_timoshenko().subs(phi, 0) - kg) == sp.zeros(4)
    assert z(kg_timoshenko()[0, 0] - P / L * (sp.Rational(6, 5) + 2 * phi + phi**2) / (1 + phi) ** 2) == 0
    # Consistent mass (Archer)
    assert z(m_hermite() - rho * L / 420 * sp.Matrix([[156, 22 * L, 54, -13 * L], [22 * L, 4 * L**2, 13 * L, -3 * L**2],
                                                      [54, 13 * L, 156, -22 * L], [-13 * L, -3 * L**2, -22 * L, 4 * L**2]])) == sp.zeros(4)
    # Warping torsion (Barsoum–Gallagher): GJ/(30L)·[36, 3L, …] + ECw/L³·[12, 6L, …]
    kw = k_warping()
    assert z(kw - kg.subs(P, G * J) - kb.subs(I, Cw)) == sp.zeros(4)
    # Condensation: one released end of the EB beam → 3EI/L³ (propped cantilever)
    assert z(condense(kb, [1])[0, 0] - 3 * E * I / L**3) == 0
    assert z(condense(kt, [1])[0, 0] - 12 * E * I / ((4 + phi) * L**3)) == 0
    # Fixed-end loads of the classic cases: qL/2, qL²/12; Pb²(3a+b)/L³ …
    q, p, a = sp.symbols("q p a", real=True)
    f = consistent_load_transverse(0, L, dist=[(q, q, 0, L)])
    assert z(f - sp.Matrix([q * L / 2, q * L**2 / 12, q * L / 2, -q * L**2 / 12])) == sp.zeros(4, 1)
    return True


if __name__ == "__main__":
    checks()
    print("derivations agree with the literature closed forms")
