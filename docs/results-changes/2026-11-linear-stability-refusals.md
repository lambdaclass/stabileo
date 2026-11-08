# Linear analysis refuses a mechanism or an unresolvable stiffness

Issues #993, #1353, #1355, #1651, #1106, #1496. Slice 2 of the stability test
([docs/solver/stability.md](../solver/stability.md)).

## Linear analysis refuses a mechanism or an unresolvable stiffness

The linear 2D and 3D solves (dense, sparse, PCG, the prepared multi-case path and the
constrained solvers) take the scale-invariant stability verdict on the stiffness they factor,
before factorizing it, and refuse a Mechanism or a Singular verdict, or a stiffness that is
not positive definite. They no longer add the artificial rotation springs (`1e-10 · max
diagonal`), shift the diagonal or fall back to LU after a failed Cholesky. A rotation nothing
stiffens is eliminated exactly; a load on it is refused; a rotation far softer than the others
at its node that the solution loads through its connections is refused (#1496).

What changes for a model:

| Before | After |
|--------|-------|
| Solved with `StiffnessNotPositiveDefinite` (LU fallback or a diagonal shift) | Refused: "the stiffness matrix is not positive …" or "the structure is a mechanism …" |
| Solved with `HighDiagonalRatio`, `NearZeroDiagonal` or `NUM-INVARIANCE`, `κ_S A > 1e12` | Refused as Singular, naming the nodes |
| Solved with `HighDiagonalRatio` and `κ_S A ≤ 1e12` | Same displacements, without the warning |
| Solved with `ORPHAN-SOFT-ROTATION` (#1496) | Solved exactly, or refused |
| A stable model | Same displacements and reactions |

`NUM-INVARIANCE` is attached by the linear solves only for an excessive displacement.

## Corpus

Every model of the example, fixture, feature-matrix and differential corpus (238 linear
solves, 2D and 3D) was solved before (d81653aca) and after:

- None is refused, before or after.
- Every displacement and reaction is bit-identical.
- The only diagnostic change is `ex-three-hinge-arch-input`, which loses `HighDiagonalRatio`
  and `NUM-INVARIANCE`: its hinge rotations are free directions the stability test eliminates,
  and its verdict is Stable.

## Real structures now refused

These are structures someone could model; each is refused because its weak direction keeps
fewer than four digits in double precision, and each was returned before with a conditioning
warning or none:

| Model | Verdict | Why |
|---|---|---|
| MITC9 twisted strip, 24×8 mesh, `t = 0.0254` and `0.047` (`t/L` about 0.002 to 0.004) | Singular | `κ_S A` = 3.8e10 × 8.4e2 and 1.1e10 × 1.2e3 |
| Cantilever with `Iy = 1e-10`, `Iz = 1e3` (#1496) | Mechanism | weak-axis translation below `1e-12` of the strong one |
| Beam with `A = 0.01`, `I = 1e-12` | Singular | `κ_S A` = 1.5e3 × 8.3e8 |

Thin quadratic shells (MITC9) of that slenderness are refused; MITC4 on the same strip is
Stable and solved as before.

## Random models no longer certified end to end

Of the 240 random 3D models of `end_to_end_random_3d`, 19 were certified end to end before
and 17 after. Eleven more are refused; nine of them were not certified before (a mechanism or
a bound the certificate could not give). Two had a certified answer and are now refused:

| Model | Verdict | `κ_S A` |
|---|---|---|
| `random_3d_model(11)` | Singular | 6.8e5 × 1.2e9 |
| `random_3d_model(56)` | Singular | 4.0e9 × 2.0e8 |

The verdict bounds the error of any answer, so it refuses where the certificate, which checks
one answer for one load, can still certify. The test's floor is 17.

## In the app

The app gates P-Δ, buckling and modal analysis on the static solve, so a model the static solve
refuses is refused by each of them with the same message:

- A column on a pin free to spin about its own axis under beams released about the vertical
  (the hinged-frame sweep, seed 10) is a mechanism the loads do not excite. It was solved
  before, and modal and buckling named the spin as a discarded mode; all three refuse it now.
- An L-frame (a fixed column with a beam on top, the default section) with every area
  multiplied by 1e4 is Singular (`κ_S A` = 7.0e6 × 9.4e5); by 1e3 it solves as before.

