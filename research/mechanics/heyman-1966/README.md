# Heyman (1966): the stone skeleton, least thickness and collapse of a masonry arch

Research, not a design tool. Interactive page at `/research/mechanics/heyman-1966`.

J. Heyman, *The stone skeleton*, International Journal of Solids and Structures 2(2), 249–279
(1966), doi:10.1016/0020-7683(66)90018-7. The paper's full text was not read here; the numbers
compared below come from the published solutions tabulated by Rizzi, Cocchetti, Colasante &
Rusconi (2010), doi:10.4028/www.scientific.net/AMR.133-134.467, Table 1, p. 469.

## What is reproduced

A circular arch of N rigid voussoirs with radial joints under Heyman's three assumptions: no
tension, unlimited compressive strength, no sliding.

- **Least thickness under self-weight** for half-angles of embrace α = 60°, 90°, 120° and 145°:
  t/r, the haunch hinge angle β from the crown and the thrust h = H/(w r), with w = γ t d.
  True voussoir weights are compared with Milankovitch's solution, weight uniform along the
  centreline with the CCR solution.
- **Collapse of a ring under a point load**: inner radius 2.35 m, thickness 0.30 m, depth 1 m,
  γ = 20 kN/m³, a vertical load on the extrados above a quarter of the clear span (x = −1.175 m),
  no backfill. This is the geometry of Orduña's ring (PhD thesis, University of Minho, 2004, as
  quoted by Nela et al. 2021) without its backfill, so it is **not** the published 18 kN case.

## How

- Static theorem as a linear program. Once the force and moment at the left springing and the load
  multiplier are chosen, equilibrium fixes every joint force, so each problem has four unknowns and
  three inequalities per joint (`src/lib.rs`), solved by a dual revised simplex (`src/lp.rs`).
- Least thickness: bisection on t/r to a relative width of 10⁻¹²; each step finds the state that
  violates the joint conditions least and accepts the thickness when that violation is not positive.
- Collapse multiplier: maximise λ. Upper bound: every four-hinge mechanism with alternating faces
  and admissible relative rotations; up to 40 voussoirs both bounds agree to 10⁻¹³.
- β is the vertex of the parabola through the eccentricities at the haunch joint and its
  neighbours.

The crate is self-contained (no engine dependency) and builds the page's WASM with `build.sh`.

## Running

```sh
cargo run --release --manifest-path research/mechanics/heyman-1966/Cargo.toml --bin validate -- --write
cargo test --release --manifest-path research/mechanics/heyman-1966/Cargo.toml
cargo run --release --manifest-path research/mechanics/heyman-1966/Cargo.toml --bin replay -- research/mechanics/heyman-1966/reference-results/replay.json
research/mechanics/heyman-1966/build.sh
```

`reference/arch_limit.py` is an independent implementation of the same model with SciPy's HiGHS;
its output is `reference-results/python_highs.json` (versions in `MANIFEST.json`).

## Agreement

All checks are in `VALIDATION.json`. Least thickness with 2·round(800·α/90) voussoirs:

| α | Solution | t/r published | ours | β published | ours | h published | ours |
|---|---|---|---|---|---|---|---|
| 60° | Milankovitch | 0.0228489 | 0.0228488 | 39.4606° | 39.4606° | 0.825052 | 0.825052 |
| 60° | CCR | 0.0228482 | 0.0228481 | 39.4608° | 39.4608° | 0.825094 | 0.825094 |
| 90° | Milankovitch | 0.107478 | 0.107478 | 54.4840° | 54.4840° | 0.620881 | 0.620881 |
| 90° | CCR | 0.107426 | 0.107426 | 54.4963° | 54.4963° | 0.621772 | 0.621771 |
| 120° | Milankovitch | 0.327607 | 0.327606 | 63.7402° | 63.7402° | 0.342263 | 0.342263 |
| 120° | CCR | 0.326547 | 0.326547 | 64.0072° | 64.0072° | 0.349556 | 0.349556 |
| 145° | Milankovitch | 0.763995 | 0.763995 | 49.6698° | 49.6698° | 0.0391491 | 0.0391490 |
| 145° | CCR | 0.740638 | 0.740638 | 56.2271° | 56.2272° | 0.0681781 | 0.0681781 |

Tolerances: 10⁻⁴ relative on t/r and h (the table prints six significant figures), 0.01° on β.

Heyman's closed form in the same table is thinner (t/r = 0.105965 at α = 90°, 1.4 % below
Milankovitch; 15 % at α = 145°): as Rizzi et al. explain, it imposes tangency on the resultant
instead of on the line of thrust. It is shown for comparison and not used as a check.

With fewer voussoirs the hinges can only form at joints, so t/r approaches the continuum value from
below: 0.107373 (N = 51), 0.107450 (101), 0.107464 (201) with true weights.

Ring under the point load (kN): 4.2833 (N = 10), 3.7497 (20), 3.7441 (31), 3.6444 (40),
3.5888 (80), 3.5881 (160). Hinges at N = 31: 29.0° intrados, 81.3° extrados, 139.4° intrados,
180.0° extrados, measured from the left springing. Static and kinematic values agree for N ≤ 40;
both match the Python/HiGHS implementation to 10⁻¹³.

## Limitations

Rigid blocks, no sliding, unlimited compressive strength; the conditions are checked only at the
joints; no backfill, no fill pressure, no settlement. Agreement with published analytical
solutions and with another implementation is a numerical comparison, not a laboratory validation
and never an engineering assessment of a real arch.
