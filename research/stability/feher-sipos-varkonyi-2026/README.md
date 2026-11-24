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

## The page

It opens on the paper's case (Section 3.4) and replays our run of it. Sliders change the load q
(0–4), its distribution (uniform, or Q = 2 on the first half of the arc length), the number of
members (20–120) and the far corner of the rectangle; each change recomputes live in the browser
through `run::path_with`. "Back to the paper" restores Section 3.4 and its replay. Below the
comparison table, one collapsible item per open difference says where it comes from.

| Setting | What the strip does |
|---|---|
| Paper (q = 2.5, uniform, corner (1.3, 1.3)) | ends inverted without a jump |
| q = 1.5 | comes back as an arch: the cusp has moved |
| q = 3 or 3.5 | the path meets a fold and stops |
| q = 4 | snaps on the first leg |
| q = 2.5 on half the span | the arch snaps while it is loaded (q_lim ≈ 2.37), before the path starts |

## Running

```sh
make evidence.research.feher   # replay.json, VALIDATION.json, MANIFEST.json
make test.research.feher       # validation, the crate's path tests and the engine's co-rotational tests
research/stability/feher-sipos-varkonyi-2026/build.sh   # the page's WASM
```

## Agreement

Every number below is in `VALIDATION.json`.

**Figure 9(c).** The five curves were digitized from the preprint
(`reference-results/fig9c_digitized.json`, method inside). Each is compared through its midpoint
height y(1/2), taken at the clamp angles where Figure 9(b) places it; the paper's value is
measured at half the length of its digitized curve. The whole curves also lie on our path, at
median distances of 0.0018 to 0.0046 strip lengths; the plotted line is about 0.004 thick.

| Shape | (Θ, Δ) | Paper y(1/2) | Ours | Difference |
|---|---|---|---|---|
| 1 | (1, 0) | 0.223 | 0.226 | +0.003 |
| 2 | (1.3, 0) | 0.188 | 0.189 | +0.001 |
| 3 | (1.3, 1.3) | 0.107 | 0.108 | +0.001 |
| 4 | (1, 1.3) | −0.076 | −0.065 | +0.011 |
| 5 | (1, 0) | −0.155 | −0.150 | +0.005 |

Shape 4 sits just past the cusp, where y(1/2) changes fast with the clamp angles: our path
reaches −0.076 at Δ ≈ 1.22.

**Section 3.2**, values read from the text. The paper prints the limit loads as negative numbers;
with q > 0 pushing down, as in its energy, they are downward loads of that size.

| Quantity | Paper | Ours | Difference |
|---|---|---|---|
| Limit load, uniform load, (0.9, 0) | ≈ 4.2 | 4.25 | +1.1 % |
| Limit load, uniform load, (0.9, 0.04) | ≈ 3.9 | 3.95 | +1.3 % |
| Limit load, half-span load, (0.9, 0) | ≈ 2.5 | 2.37 | −5.4 % |
| Largest limit load, half-span load, Θ = 0.66 | ≈ 4.0 at Δ = 1.36 | 3.74 at Δ = 1.16 | −6.5 % |
| Table 1, uniform load, (0.96, 0) | 2.10 | 2.13 | +1.5 % |
| Table 1, half-span load, (0.96, 0), after a snap | 7.60 | 14.07 | +85 % |
| Table 1, uniform load, (0.64, 1.16), after a snap | 11.70 | 11.38 | −2.7 % |
| Table 1, half-span load, (0.64, 1.16) | 3.35 | 3.76 | +12 % |

Where loading loses stability before q = 2.5, the state at 2.5 is the stable state the strip
snaps to. It is found by pushing the last stable state along its critical mode, the lowest
eigenvector of the tangent. All values are mesh-converged: going from 96 to 192 members changes
them by less than 0.1 %.

**Exact solution.** At Θ = 1 and q = 0 the strip is the circular arc of radius 1/2. Ours departs
from it by 3.4·10⁻⁵ of the radius, and the error falls as h².

## What does not agree yet

- **Load on half the span:** our limit loads come out 5–7 % lower. The bifurcation curve on which
  the paper finds its optimum lies about 0.2 lower in Δ in our runs, which also puts the Table 1
  point (0.64, 1.16) right on it.
- **Half-span load at (0.96, 0):** the snap lands on a stable state with curvature 14.1, not the
  paper's 7.6.
- **Curvature threshold:** the inverted shape at the end of the path matches the figure but has a
  largest curvature of about 10.6. The paper sets a threshold of 6 for the path.
- **Not attempted:** the equilibrium surface of Figure 9(a) (unstable branches) and the reachable
  sets of Section 3.3.

Agreement with the paper's figures is a numerical comparison, not experimental validation.
