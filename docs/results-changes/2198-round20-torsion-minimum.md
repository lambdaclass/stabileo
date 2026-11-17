# Directional transverse minimum under active torsion (2026-11-17)

The combined shear and torsion checker reused the minimum calculated with
primary width `b` for both directions. Secondary shear acts over width `h`.
A deeper-than-wide section with low secondary shear could therefore pass
with insufficient secondary transverse reinforcement.

[CIRSOC 201-2025 §9.6.4.1–2 and C9.6.4.2](../codes/CIRSOC/markdown/cirsoc-201-2025/capitulo-9-vigas.md#c9.6.4.1)
requires minimum transverse reinforcement where `Tu ≥ φTth`. The minimum
`(Av + 2At)/s` is the greater of `0.062 sqrt(fc) bw/fyt` and
`0.35 bw/fyt`. The commentary makes this consistent with minimum shear
reinforcement. In the checker’s two directional shear checks, each minimum
must use the width of that direction, just as its concrete shear term does.

Both directions now use a single calculation that takes width, depth and
shear together. It computes the concrete contribution, required shear steel
and combined minimum from that same width. A primary minimum cannot be
reused for the secondary direction. Coefficients, material limits, torsion
activation, section strength and longitudinal requirements are unchanged.

## Numerical witness

The [replay record](2198-round20-torsion-minimum.json) uses a 300 × 900 mm
rectangle, 25 mm cover, Ø6 two-leg stirrups at 90 mm spacing, `fc = 25 MPa`,
`fy = fyt = 420 MPa`, 10 kN·m torque, zero primary shear and 1 kN secondary
shear. Effective depths are 861 and 261 mm. Torsion is active: `φTth` is
9.454218750000003 kN·m. The required secondary minimum rises from
0.00025 to 0.00075 m²/m; provision is 0.0006283185307179586 m²/m.
The torsion ratio changes from 0.3978873577297384 to 1.1936620731892151.
The tighter negative control retains its answer.

The shared module is used for provided beam support and span checks in
both configured editions. Its existing use of the 2025 torsion policy
with the 2005 strength edition is preserved; this is not a claim that the
2025 clause is a 2005 clause. The element verifier also calls the module
for section strength without a supplied cage: that section-only use does
not consume the transverse minima and does not change.

## Coverage and main-source evidence

Regressions cover both axis mappings, zero and low secondary shear,
below/equal/above provision and activation boundaries, and widths smaller
than, equal to and larger than the primary width. Actual 3D linear and
P-Delta WASM results reach provided-cage verification through both station
transfer modes. Actual 2D linear and P-Delta results retain torsion-free
answers. The transverse torsion policy has no separate native implementation;
the native structural solve does not perform this cage check.

The exact `origin/main` torsion module, replayed with branch dependencies,
also returns ratio 0.3978873577297384 for this insufficient cage. This is
isolated module evidence, not a complete main checkout or release replay.
The coordinator decides advisory coverage; no advisory is created here.

The result-change entry conservatively matches concrete members, consistent
with the other directional cage entries when saved design details are sparse.
No baseline or tolerance is changed.
