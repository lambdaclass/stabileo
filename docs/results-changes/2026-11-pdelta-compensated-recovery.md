# Compensated P-Delta physical recovery (2026-11-13)

PR #1952, review round 19.

The iteration evaluates the assembled tangent with compensated products and
sums. Physical recovery previously multiplied the elastic and geometric
matrices separately with ordinary sums, added the rounded actions, and
subtracted the load. Those different arithmetic paths could disagree at the
requested criterion: the mirrored issue-971 cantilever had a reported physical
relative residual of 1.3251653877337957e-12 against 1e-12, despite satisfying the
independent element displacement solution. It lost available reactions and
member forces and its certified/JSON exports refused the answer.

Both dimensions now construct the physical tangent through the same system
factory and tangent assembly as the iteration, with artificial stiffness
disabled, and evaluate its residual with the existing compensated arithmetic.
A dedicated physical-residual type transports this evidence into recovery.
The requested tolerance and the withholding rule are unchanged. The same
uniterated cantilevers still fail the physical criterion and their exports
refuse. Tests retain independent element solutions, both dense and sparse
storage, rotations, reflections, unit transformations, and native and WASM
solve/certify entry points. Existing residual-boundary tests cover both sides
of the criterion.

Physical force/residual assembly also captures a typed snapshot of its support
model. Recovered forces retain that snapshot; callers no longer supply a second
model to reaction recovery. The 3D SSI snapshot comes from the curved-beam
expanded model. Other path solvers use the same boundary. SSI load-balance
controls, including soil forces independently of the support reaction builder,
pass on the parent and after this change. Curved-beam expansion in that parent
preserves supports and does not add soil springs; no incomplete SSI answer was
reproduced by changing that model argument alone.

The two-iteration nonlinear certificate fixture has physical relative residual
2.4715848118830225e-9 against 1e-12, so its force withholding remains intentional.
Its displacement-only candidate still receives an error bound covering the
independent double-double reference. Time-history peak reactions remain empty;
the base-shear test reconstructs total inertia and support action from returned
histories instead of treating an elastic displacement-peak estimate as total
reaction.

Prescribed-master zero-motion fingerprints retain every pre-existing numerical
field and their original hash values. The newly added final equilibrium summary and arc reactions are checked
separately because main's reference shape omitted them. Arc member records
are mapped back to main's lexicographic order for its unchanged hash; the
current numeric ordering is asserted separately. The shared corotational
force helper preserves the earlier zero-force sign convention. No baseline
file, tolerance, refusal threshold, or #1996 behaviour changes.
