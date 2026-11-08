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
