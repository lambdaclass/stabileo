# Refuse staged cables and respect contact tolerance (2026-11-11)

PR #1921 coordinator decision; issues #417 and #432. Registry entry
`staged-cable-refusal-and-contact-tolerance`.

Both staged solvers now refuse every cable with `cable_analysis_required` before assembly,
including tensile and unloaded inputs. The restricted 2D exception introduced on this
unmerged branch is withdrawn. Convergence of an Ernst stiffness iteration and positive
recovered end forces do not prove cable equilibrium when sag matters. Ernst stiffness is
a tangent; using it as a secant repeats the SP-12 formulation defect. The dedicated cable
solver uses the chord law and remains available. The unreachable staged Ernst iteration,
end-force gate and iteration-specific solver diagnostic have been removed.

The staged cable parity test now requires identical structured refusals on model sizes on
opposite sides of the sparse threshold, naming every cable and withholding results.
Numeric staged parity uses explicit truss stays from the existing fixture. Each mesh is
checked against an independent linear solve, and the existing relative mesh parity limit
is unchanged. This supersedes the staged cable acceptance described in the earlier
[parity record](2026-11-staged-cable-tension-parity.md) and
[final validity record](2026-11-contact-and-staged-final-validity.md).

The unconditional closed-surface guard previously refused any positive assembled force,
even when force divided by stiffness and opening were within the configured contact
tolerance. It now compares force divided by stiffness with that same tolerance, matching
`check_frozen_contact`. Non-finite forces and tension above the limit remain refused with
`contact_state_invalid`. Frozen bearing and opening checks remain in place. Reported force
continues to use the signed assembled force, including accepted small roundoff tension.
No configured tolerance, baseline or assertion is relaxed.

Public-solver surface controls use the existing chattering fixture with a fixed vertical
master. A hand-condensed cantilever stiffness sets opening and force/stiffness at 99% and
101% of the unchanged tolerance. The smaller case previously refused and now succeeds
with a closed frozen surface; the larger case refuses before and after. The fixture is
translated to avoid subtracting nearly equal coordinates at the tolerance scale.

The native origin/main reference `855e79a5c610cba5b7b45aac44380ec054476e1a` retains
SP-14 cable and NL-13 contact warnings. These corrections withdraw acceptance and refine
a refusal introduced on this unmerged branch; they establish no new silent main/release
wrong result. The existing SA-2026-059 web evidence and advisory decision are unchanged.
