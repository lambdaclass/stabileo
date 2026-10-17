"""Symbolic derivation of the closed forms used by engine/tests/section_exact.rs
and web/src/lib/engine/steel/section-constants.ts.

Run:  python -I derive_closed_forms.py      (needs sympy)

Every assertion is an exact symbolic identity; the script prints nothing but
the derived expressions and exits non-zero on any mismatch.
"""
import sympy as sp

y, z, s = sp.symbols("y z s", real=True)
h, b, tw, tf, t, R, n = sp.symbols("h b t_w t_f t R n", positive=True)


def green(verts):
    """A, first and second moments of a CCW polygon by Green's theorem (symbolic)."""
    A = Sy = Sz = Iyy = Izz = Iyz = 0
    N = len(verts)
    for i in range(N):
        (y1, z1), (y2, z2) = verts[i], verts[(i + 1) % N]
        c = y1 * z2 - y2 * z1
        A += c / 2
        Sy += (y1 + y2) * c / 6
        Sz += (z1 + z2) * c / 6
        Iyy += (z1**2 + z1 * z2 + z2**2) * c / 12
        Izz += (y1**2 + y1 * y2 + y2**2) * c / 12
        Iyz += (2 * y1 * z1 + y1 * z2 + y2 * z1 + 2 * y2 * z2) * c / 24
    yc, zc = Sy / A, Sz / A
    return [sp.simplify(e) for e in (A, yc, zc, Iyy - A * zc**2, Izz - A * yc**2, Iyz - A * yc * zc)]


def rects(rs):
    """Same quantities for a union of disjoint rectangles (y0, y1, z0, z1)."""
    A = sum((y1 - y0) * (z1 - z0) for y0, y1, z0, z1 in rs)
    yc = sum((y1 - y0) * (z1 - z0) * (y0 + y1) / 2 for y0, y1, z0, z1 in rs) / A
    zc = sum((y1 - y0) * (z1 - z0) * (z0 + z1) / 2 for y0, y1, z0, z1 in rs) / A
    Iyy = sum((y1 - y0) * (z1**3 - z0**3) / 3 for y0, y1, z0, z1 in rs) - A * zc**2
    Izz = sum((z1 - z0) * (y1**3 - y0**3) / 3 for y0, y1, z0, z1 in rs) - A * yc**2
    Iyz = sum((y1 - y0) * (z1 - z0) * (y0 + y1) * (z0 + z1) / 4 for y0, y1, z0, z1 in rs) - A * yc * zc
    return [sp.simplify(e) for e in (A, yc, zc, Iyy, Izz, Iyz)]


def same(a, b_, label):
    for x, w in zip(a, b_):
        assert sp.simplify(x - w) == 0, (label, x, w)


hh, hb, ht = h / 2, b / 2, tw / 2
# I/H, as engine/src/section/catalogue.rs::i_section with r = 0 walks it.
I_poly = [(-hb, -hh), (hb, -hh), (hb, -hh + tf), (ht, -hh + tf), (ht, hh - tf), (hb, hh - tf), (hb, hh),
          (-hb, hh), (-hb, hh - tf), (-ht, hh - tf), (-ht, -hh + tf), (-hb, -hh + tf)]
I_rect = [(-hb, hb, -hh, -hh + tf), (-ht, ht, -hh + tf, hh - tf), (-hb, hb, hh - tf, hh)]
same(green(I_poly), rects(I_rect), "I")
A, _, _, Iy, Iz, _ = rects(I_rect)
assert sp.simplify(Iy - (b * h**3 - (b - tw) * (h - 2 * tf) ** 3) / 12) == 0
assert sp.simplify(Iz - (2 * tf * b**3 + (h - 2 * tf) * tw**3) / 12) == 0
print("I:  A =", sp.factor(A), "; Iy =", sp.factor(Iy))

# Channel (web left), angle (corner at origin), tee (flange on top).
C_poly = [(0, -hh), (b, -hh), (b, -hh + tf), (tw, -hh + tf), (tw, hh - tf), (b, hh - tf), (b, hh), (0, hh)]
same(green(C_poly), rects([(0, b, -hh, -hh + tf), (0, tw, -hh + tf, hh - tf), (0, b, hh - tf, hh)]), "C")
L_poly = [(0, 0), (b, 0), (b, t), (t, t), (t, h), (0, h)]
same(green(L_poly), rects([(0, b, 0, t), (0, t, t, h)]), "L")
T_poly = [(-ht, -hh), (ht, -hh), (ht, hh - tf), (hb, hh - tf), (hb, hh), (-hb, hh), (-hb, hh - tf), (-ht, hh - tf)]
same(green(T_poly), rects([(-ht, ht, -hh, hh - tf), (-hb, hb, hh - tf, hh)]), "T")
LA = green(L_poly)
print("L:  Iyz =", sp.factor(LA[5]))

# Plastic modulus of the I about its strong axis (PNA at mid-depth by symmetry).
Z = 2 * (b * tf * (hh - tf / 2)) + 2 * (tw * (hh - tf) * (hh - tf) / 2)
assert sp.simplify(Z - (b * tf * (h - tf) + tw * (h - 2 * tf) ** 2 / 4)) == 0
print("I:  Zy = b tf (h - tf) + tw (h - 2 tf)^2 / 4")

# Regular n-gon of circumradius R: exact area and centroidal inertia.
k = sp.symbols("k", integer=True)
th = 2 * sp.pi / n
tri_A = R**2 * sp.sin(th) / 2
# One triangle (0, P_k, P_k+1): its integral of y^2 summed over k; the sum of
# cos^2 terms over a full turn gives n/2 for n >= 3, done here for n = 3..12.
for nn in range(3, 13):
    ang = [2 * sp.pi * i / nn for i in range(nn)]
    verts = [(R * sp.cos(a), R * sp.sin(a)) for a in ang]
    A_, yc_, zc_, Iy_, Iz_, Iyz_ = green(verts)
    t_ = 2 * sp.pi / nn
    # Trigonometric radicals defeat simplify(); the forms are homogeneous in R
    # (R^2, R^4), so they are compared at R = 1 to 60 significant digits.
    zero = lambda e: abs(sp.N(e.subs(R, 1), 60)) < sp.Float("1e-50")
    assert zero(A_ - nn * R**2 * sp.sin(t_) / 2), nn
    want = nn * R**4 * sp.sin(t_) * (2 + sp.cos(t_)) / 24
    assert zero(Iy_ - want) and zero(Iz_ - want) and zero(Iyz_), nn
print("n-gon: A = n R^2 sin(2pi/n)/2, I = n R^4 sin(2pi/n)(2 + cos(2pi/n))/24  (n = 3..12)")

# Thin-walled channel (centreline model): web height h0, flanges b', thicknesses tw, tf.
# Shear centre from the web centreline: e = 3 b'^2 tf / (6 b' tf + h0 tw);
# warping constant (AISC Design Guide 9 form):
#   Cw = tf b'^3 h0^2 / 12 * (3 b' tf + 2 h0 tw) / (6 b' tf + h0 tw).
bp, h0 = sp.symbols("b' h_0", positive=True)
Ix = tw * h0**3 / 12 + 2 * bp * tf * (h0 / 2) ** 2
# Shear flow in the top flange from a unit vertical shear: q(s) = tf s h0/2 / Ix.
# Its resultant times the lever arm h0 balances e.
F = sp.integrate(tf * s * (h0 / 2) / Ix, (s, 0, bp))
e = sp.simplify(F * h0)
assert sp.simplify(e - 3 * bp**2 * tf / (6 * bp * tf + h0 * tw)) == 0
# Sectorial coordinate about the shear centre S (at distance e behind the web,
# on the axis of symmetry). Contour: top flange tip -> web top -> web bottom -> bottom tip.
# omega relative to S, normalised to zero mean (the principal sectorial coordinate).
u = sp.symbols("u", real=True)
# top flange, s from web (0) to tip (b'), point (s, h0/2), pole at (-e, 0): d(omega) = h0/2 ds
w_web = lambda zz: -e * zz            # web point (0, zz): omega = -e z (sign fixed by the contour)
w_top = lambda ss: w_web(h0 / 2) + h0 / 2 * ss
w_bot = lambda ss: w_web(-h0 / 2) - h0 / 2 * ss
mean = (sp.integrate(w_top(s), (s, 0, bp)) * tf + sp.integrate(w_web(u), (u, -h0 / 2, h0 / 2)) * tw
        + sp.integrate(w_bot(s), (s, 0, bp)) * tf)
assert sp.simplify(mean) == 0  # antisymmetric: already normalised
Cw = (sp.integrate(w_top(s) ** 2, (s, 0, bp)) * tf + sp.integrate(w_web(u) ** 2, (u, -h0 / 2, h0 / 2)) * tw
      + sp.integrate(w_bot(s) ** 2, (s, 0, bp)) * tf)
dg9 = tf * bp**3 * h0**2 / 12 * (3 * bp * tf + 2 * h0 * tw) / (6 * bp * tf + h0 * tw)
assert sp.simplify(Cw - dg9) == 0
print("thin channel: e =", e, "; Cw == DG9 form")

# Doubly symmetric thin I: Cw = If h0^2 / 4 with If = tf b^3 / 12 per flange pair... (Iz ~ 2 If)
Cw_I = 2 * tf * sp.integrate((h0 / 2 * s) ** 2, (s, -b / 2, b / 2))
assert sp.simplify(Cw_I - (2 * tf * b**3 / 12) * h0**2 / 4) == 0
print("thin I: Cw = Iz_flanges h0^2 / 4")

# Bredt for a thin rectangular tube on its centreline: J = 4 Am^2 t / p.
bm, hm = sp.symbols("b_m h_m", positive=True)
assert sp.simplify(4 * (bm * hm) ** 2 * t / (2 * (bm + hm)) - 2 * t * bm**2 * hm**2 / (bm + hm)) == 0
print("Bredt RHS: J = 2 t bm^2 hm^2 / (bm + hm)")
print("all identities hold")
