# Correct production continuation and curved-frame nonlinear results (2026-11-23)

Issue #2510. Re-run affected planar arc-length, displacement-control and
co-rotational warm-start analyses. Re-run spatial co-rotational analyses with
curved frames and verify whether their sections have shear-centre offsets.

## Planar continuation and warm starts

Production and experimental arc-length analysis use the same predictor and
corrector. Both orient the step in the same weighted displacement and load
coordinates. A trial is accepted only when equilibrium and the spherical
constraint hold for the represented state. A trial with no real intersection
can retry at half radius. At the radius floor the solve reports nonconvergence
and returns the exact last accepted displacement and load factor.

On the #2510 two-bar model, the former second point converged at radius
3.9086203398927033 with a requested radius of 3. The new solve keeps the first
point and stops at the fixed radius floor. Allowing a half-radius retry
produces a second equilibrium point on that smaller sphere. The two-bar fold
case now continues through its ninth point without retracing the seventh. On
the iteration-limited model, the final load and displacement equal the last
accepted history row.

Both planar continuation methods normalize member loads before computing the
reference pattern and reuse that model for recovery. A member load specified
at a floating-point endpoint now gives the same forces as its canonical form.
Native planar co-rotation assigns the assembled load and the restrained
positions directly at the target endpoint. A unit spring unloaded from
`2^54` to 1 now reports displacement 1, and a prescribed position of
`1e-20` survives continuation from 1.

## Spatial curved frames

Both spatial co-rotational drivers expand curved beams and apply the existing
shear-centre refusal to the sections of the resulting frames. A curved-only
model that previously reached full load with omitted flexural-torsional
coupling now refuses. A centred section, an offset on an unused section and
the linear analysis of the same model still solve.

## Research reference checks

The production WASM replays passed the Lee, Ferrari–Sigmund, da Deppo–Schmidt
and Riks–Crisfield checks with their existing references and tolerances. Lee
kept its first peak at step 47. Ferrari–Sigmund's final load factor and corner
rotation changed at floating-point precision. Da Deppo–Schmidt kept its limit
at step 267 and used 1,600 iterations instead of 1,655. Its limit load and
three normalized crown measurements still pass the published table checks.

The Riks–Crisfield shallow frame retained its energy-equilibrium check. In
the von Mises case the radius adjustment near the fold shifted the sampled
upper-limit bracket from step 1253 to 1262. The interpolated apex displacement
relative error fell from 0.000103 to 0.0000115, within the unchanged 0.005
limit. Shorter steps change the final state for a fixed accepted-step budget.
The live worker validates each reported step against its matching prefix and
accounts for rejected trials separately from accepted step iterations.

The two exact frozen arc fixtures were regenerated after their independent
reaction equilibrium and member-force checks passed. The fixtures keep the
same number of steps, convergence, and iteration counts. Changes are in the
low-order digits of path coordinates, final displacements, forces and reactions.
