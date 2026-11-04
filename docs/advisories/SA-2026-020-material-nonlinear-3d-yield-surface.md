# SA-2026-020: 3D material-nonlinear analysis used a yield surface less conservative than 2D

| | |
|---|---|
| Severity | Medium |
| Status | Published 2026-10-21 (fixed in 0.3.0; live on stabileo.com since 2026-10-21) |
| Issue | [#429](https://github.com/lambdaclass/stabileo/issues/429) (NL-6 in the element-derivation review) |
| Fix | PR [#529](https://github.com/lambdaclass/stabileo/pull/529) |
| Affected versions | every version with the 3D material-nonlinear solver (added 2026-03-07), up to 0.2.0 and `main` until the fix |
| Re-check registry | not needed: no app workflow runs this solver |

## Affected features

The 3D material-nonlinear frame solver (`solve_nonlinear_material_3d`), reachable only through
the engine and its WASM API (`solveNonlinearMaterial3D` in `web/src/lib/engine/wasm-solver.ts`,
which no screen of the app calls). Results obtained in the app are not affected. The 2D solver is
not affected.

## What was wrong

The 2D solver yields a member end when $(N/N_p)^2 + |M|/M_p > 1$, the exact interaction of a
rectangular section. The 3D solver used $(N/N_p)^2 + (M_y/M_{py})^2 + (M_z/M_{pz})^2$, with the
moment ratios squared. Squaring a ratio below 1 makes it smaller, so **a 3D member yielded later
than the same member in 2D whenever it carried axial force or bending about both axes**, and the
reported utilization was low by the same amount:

| Case (rectangle, Mp = 843.75 kN·m, Np = 11 250 kN) | Correct (2D, and 3D after the fix) | 3D before the fix |
|---|---|---|
| N = 0.5·Np, M = 0.7·Mp: utilization | 0.95 | 0.74 |
| Cantilever 4 m, N = 0.5·Np, tip load about one axis: load at first yield | 158.2 kN | 182.7 kN (15 % high) |
| Cantilever, tip moments My = Mz = 0.6·Mp: utilization and state | 1.20, yielded | 0.72, elastic |
| N = 0.3·Np, My = 0.4·Mp, Mz = 0.2·Mp: utilization | 0.69 | 0.29 |

Pure bending about a single axis was right (the squared and the linear ratio cross 1 at the same
moment). The error grows with the axial force: about one axis the yield moment was
$1/\sqrt{1-n^2}$ times too high ($n = N/N_p$; 1.15 at $n = 0.5$, 2.3 at $n = 0.9$); under equal
biaxial moments with no axial force, 1.41 times.

## How to tell if your results are affected

You called the 3D material-nonlinear solver directly (engine or WASM) on a model whose members
carry axial force together with bending, or bending about both axes. The first-yield load and the
collapse load factor may be too high, and members reported elastic, or with utilization below 1,
may have yielded.

## Fixed in

The fix is in review on `fix/nl6-yield-surface`; released in 0.3.0. The 3D
solver uses $(N/N_p)^2 + |M_y|/M_{py} + |M_z|/M_{pz} \le 1$ to detect yield and to report
utilization, which is computed from the reported member forces (the secant forces, SA-2026-012).
For bending about one axis it is exactly the 2D surface. Between the axes it is the straight line
between the two uniaxial limits at the same N, which lies inside any convex section interaction
through them, so a member never yields later than either uniaxial limit implies. Four tests in
`engine/tests/derivation_nonlinear.rs` pin it: the same planar state gives the same utilization
in 2D and 3D, a 3D cantilever under axial force yields at the 2D load about either axis, a biaxial
cantilever yields, and the reported utilization matches a hand calculation.

Two limits remain, for 2D and 3D alike. The axial term is the rectangle's: for the strong axis of
an I-section under high axial force (n above about 0.2) both solvers still yield later than the
section does (docs/solver/nonlinear.md, NL-6). And the solver is a whole-member secant, not
plasticity (NL-5, #428), which its results carry as a warning.

## Workaround

Check members of 3D material-nonlinear runs by hand with
$(N/N_p)^2 + |M_y|/M_{py} + |M_z|/M_{pz}$, and bound the collapse load with the plastic-collapse
solver.

## What to do with results you already have

Re-run 3D material-nonlinear models with axial force or biaxial bending on the fixed version, or
recompute the utilization of each member from its reported end forces with the formula above.

## Credits and references

Found by the element-derivation review (NL-6, PR #330) and pinned by
`nl_material_2d_and_3d_use_the_same_yield_surface`.
