# Include small prescribed support movements in static equilibrium (2026-11-23)

Issue #2227. When every prescribed component in the support frame had magnitude
at or below `1e-15`, fully restrained 2D and 3D static solves used zero for
`K_rr u_r` in the reactions. Member recovery used the actual restrained
displacements. Sparse Cholesky and PCG omitted `K_fr u_r` from the free
equations under the same condition, so the reported residual could pass even
when the free displacement did not balance member forces.

Prepared static solves now take their stiffness products and complete the
displacement field from the same restrained vector. The shortcut in the fully
restrained and sparse paths requires every restrained component to be exactly
zero. Dense partially restrained solves use their existing matrix products.
The correction also reaches single solves, load sessions and the linear
starting state and results returned by P-Delta.

On the unloaded #2109 fixture with `dx = 1e-16 m` at the second fixed support,
origin/main returned zero reactions alongside a member shear of about
`-5.10423e-14 kN` at both ends and reported a passing residual and equilibrium
check. The corrected X reactions are about `-5.10423e-14 kN` and
`+5.10423e-14 kN` at the first and second supports, respectively, equal to the
opposing member end actions. Axial chain regressions check the analytical force
`EA Δ/L` at both ends of every member and at the supports, including the
representable values on either side of the former cutoff. The tests also cover
zero motion and a normal settlement.

Re-run affected analyses with small prescribed support displacements or
rotations, including support motion applied by load cases. Support reactions
can change in fully restrained models. In sparse and iterative models, free
displacements, member forces, support reactions and dependent results can
change.
