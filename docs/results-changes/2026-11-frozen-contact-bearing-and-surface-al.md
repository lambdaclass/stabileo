# Frozen bearings permit penalty compression and surface AL pushes apart (2026-11-10)

PR #1921 review, issue #432. Results-change entry `frozen-contact-bearing-and-surface-al`.

The initial frozen-state check at `8a8f280f9` rejected any penetration beyond the contact tolerance,
including the displacement required by an active penalty spring under compression. The corrected
check uses the assembled status: an active contact may penetrate and carry compression, while an
open contact must not penetrate or carry force. Tensile force divided by penalty stiffness is
bounded by the existing contact tolerance; a separated contact may not retain compression beyond
that same scaled tolerance. Stiffness and state values must still be finite, and stiffness positive.
No numerical tolerance, baseline or assertion was loosened.

The 2D and 3D bearing controls apply 50 kN to a one-metre axial member with E = 200 MPa and
A = 0.01 m², beside a closed penalty contact of stiffness 100000 kN/m. The member's axial
stiffness is E × 1000 × A / L = 2000 kN/m. Parallel equilibrium gives displacement
50 / (2000 + 100000) m and contact reaction magnitude 100000 × 50 / 102000 kN.
Friction-state changes freeze the active contact. Previously both controls refused; both now
converge with the displacement, contact force and support reaction from this hand formula.
The tensile closed-gap and penetrating open-gap controls still refuse.

The 2D surface formulation also added a positive AL multiplier to k*g0 before multiplying the
normal by its negative. This attracted rather than repelled the surfaces and disagreed with the
compression-positive multiplier update and reported normal force. The old `projected + lambda/k`
validation actually matched that incorrect assembly. Assembly now applies `(-k*g0 + lambda)*N`,
and the signed validation force is `projected - lambda/k`. Both frozen and unfrozen surface AL
controls converge and carry the applied normal load. The frozen control also checks that the
reported normal force equals the sum of the assembled master-support reactions.

AL regressions retain a valid frozen bearing, refuse separated compression after the final
multiplier update, and retain the diagnostic evidence of freezing when later passes reset their
flip counters. Invalid contact tolerances now return structured `contact_tolerance_invalid`
refusals translated in all six locales.

Re-check contact results that use augmented Lagrangian surface pairs. The unfrozen surface
control converges and carries the applied normal load, as asserted by
`nl_contact_review_unfrozen_al_surface_bearing_obeys_equilibrium`. This branch control does not
establish a silent wrong result on origin/main or a release. The frozen-bearing over-refusal was
introduced on this unmerged branch. This review correction creates no safety advisory.

The original contact/cable notice is now scoped to cable members and contact features, including
one-way members and uplift supports; empty models and ordinary frame, truss and shell models
are no longer marked as affected solely by that entry. PR attribution remains 1921.
