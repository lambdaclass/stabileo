# Final contact bearing and staged cable solver refusals (2026-11-11)

PR #1921 final review; issues #432 and #417. Registry entry `contact-and-staged-final-validity`.

The previous frozen-contact check accepted geometric penetration with zero or near-zero
assembled force. Active frozen contacts now require the assembled force divided by stiffness
to be no greater than the negative penetration plus the existing contact tolerance. An AL
multiplier may provide additional compression. Final opening and assembled signed traction
are checked separately. Invalid frozen states return `contact_state_invalid` without results.
Every closed surface pair is also checked for tension exceeding the contact tolerance or non-finite assembled traction,
including unfrozen pairs. Reported normal force uses the signed assembled force without a
zero clamp; assembled tension above the tolerance is refused before results are built. Validation and
reporting share the same computed force.

The staged cable exception and its iteration-specific diagnostics introduced on this branch
have been withdrawn. Both staged solvers refuse every cable before assembly with
`cable_analysis_required`; the Ernst iteration and its solver-error tests have been removed.
See the [coordinator correction](2026-11-staged-cable-refusal-and-contact-tolerance.md), which
also applies the unchanged contact tolerance to the unconditional surface-force guard.

The frozen-contact regression previously accepted penetration with zero and near-zero traction;
it now refuses those states while retaining matching penalty and additional AL compression.
The panel replay seeds a successful result in both panel state and the shared results store
before recalculation, and requires both to clear on refusal.

These corrections follow acceptance and diagnostics introduced on this unmerged branch.
Recorded origin/main retains native `NL-13` and `SP-14` warnings; this change does not establish
a new silent main or release result. Advisory decisions remain with the coordinator.
