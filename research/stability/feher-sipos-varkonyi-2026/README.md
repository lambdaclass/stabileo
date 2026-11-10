# Fehér, Sipos & Várkonyi (2026): shape control of an actively bent strip

Research, not a design tool. Interactive page at `/research/stability/feher-sipos-varkonyi-2026`.

E. Fehér, A. Á. Sipos, P. L. Várkonyi, *Quasi-static shape control of structures with
topologically complex equilibrium sets*, Eur. J. Mech. A/Solids (2026),
doi:10.1016/j.euromechsol.2025.106000. Read from the open preprint arXiv:2509.12916v1, whose
title differs and which has nine figures; the journal version could not be opened here.

## What is reproduced

Section 3: a flat strip of length 1, bending stiffness 1/(4π²), clamped at A = (0, 0) and
B = (sin 1, 0), with rotary actuators at both ends and a dead load q·Q(s) pushing down.

- **Section 3.4**, the path (Θ, Δ) = (1, 0) → (1.3, 0) → (1.3, 1.3) → (1, 1.3) → (1, 0) at
  q = 2.5 with Q ≡ 1. It takes the arch to the inverted shape at the same clamp angles through
  stable states only.
- **Section 3.2**, the limit loads and maximum curvatures quoted in the text and Table 1.

## How

- The production 2D co-rotational frame: 60 members, EA·L²/EI = 8·10⁵π².
- The strip is brought into the clamps the way the paper does it:
  1. the end rotations are applied while B slides (`guidedX`);
  2. B is clamped and moved to sin 1;
  3. the load is applied.
- The actuators then move in steps of 0.02 rad (`solve_corotational_2d_from`).
- Stability is the positive definiteness of the tangent on the free DOFs; its lowest eigenvalue
  comes from inverse iteration on the engine's dense Cholesky factor.

**Angle convention.** Θ is half the difference of the end tangents and Δ their sum:
θ(A) = Θ + Δ/2, θ(B) = Δ/2 − Θ. This was fixed against the figures. With this reading the
shapes of Figure 9(c) fall on the corners of the rectangle labelled in Figure 9(b). Reading Δ as
the half sum puts them halfway along the sides and sends the path through much sharper shapes.

## Running

```sh
make evidence.research.feher   # replay.json, VALIDATION.json, MANIFEST.json
make test.research.feher       # validation and the engine's co-rotational tests
research/stability/feher-sipos-varkonyi-2026/build.sh   # the page's WASM
```

## Agreement

`VALIDATION.json` holds every number below.

**Figure 9(c).** The five curves were digitized from the preprint
(`reference-results/fig9c_digitized.json`, method inside). All five lie on our path, with median
distances of 0.0018 to 0.0046 strip lengths; the plotted line is about 0.004 thick.

| Shape | Our closest state (Θ, Δ) |
|---|---|
| 1 | (1, 0), start of the path |
| 2 | (1.3, 0.06) |
| 3 | (1.28, 1.3) |
| 4 | (1, 1.18) |
| 5 | (1, 0), end of the path |

**Section 3.2**, values read from the text:

| Quantity | Paper | Ours | Difference |
|---|---|---|---|
| Limit load, uniform load, (0.9, 0) | ≈ 4.2 | 4.25 | +1.1 % |
| Limit load, uniform load, (0.9, 0.04) | ≈ 3.9 | 3.95 | +1.3 % |
| Table 1, uniform load, (0.96, 0), largest curvature | 2.1 | 2.13 | +1.5 % |

The paper prints the limit loads as negative numbers. With q > 0 pushing down, as in its energy,
they are downward loads of that size.

**Exact solution.** At Θ = 1 and q = 0 the strip is the circular arc of radius 1/2. Ours departs
from it by 3.4·10⁻⁵ of the radius, and the error falls as h².

## What does not agree yet

- **Load on half the span (Q_a):**
  - the limit at (0.9, 0) is 2.37 against ≈ 2.5;
  - the limit at the optimum (0.66, 1.36) is 2.26 against ≈ 4.0;
  - the Table 1 curvature at (0.64, 1.16) is 3.76 against 3.35.
- **Table 1 values reached after a snap:** Q_a at (0.96, 0), 7.6, and Q_s at (0.64, 1.16), 11.7.
  Our load-controlled run loses the equilibrium at the limit point (q = 1.59 for the latter).
  Following the paper past the snap needs arc-length with prescribed rotations, which the
  production solver does not have yet.
- **Curvature threshold:** the inverted shape at the end of the path matches the figure but has a
  largest curvature of about 10.6. The paper sets a threshold of 6 for the path.
- **Not attempted:** the equilibrium surface of Figure 9(a) (unstable branches) and the reachable
  sets of Section 3.3.

Agreement with the paper's figures is a numerical comparison, not experimental validation.
