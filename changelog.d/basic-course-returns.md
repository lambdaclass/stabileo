### BREAKING (results)
#### Basic: the course units return with their review fixes, and three result changes with them (2026-11-05)

- The course stack #1302–#1307 brings back the units #871 landed without review and #1372
  withdrew (results version 15). Each result change of results version 14 returns with the pull
  request that carries it, under its own results version:
  - Results version 27 (#1304): the influence line of M at a section takes M positive when it puts
    the bottom fibre in tension, as every other moment in Basic. Ordinates change sign; their
    magnitudes do not.
  - Results version 28 (#1305): Basic's P-Δ and critical load solve each member as 4 elements by
    default (1, 2, 4 or 8 can be chosen), and B₂ is 1/(1 − 1/λ₁) from the first buckling factor.
    Displacements, forces, B₂ and λcr move toward the converged values, most for slender members
    and members loaded along their length.
  - Results version 29 (#1306): the step-by-step plastic collapse closes hinges that unload and
    goes on to the true collapse (the portal example gives 71.30 instead of 64.06); a hinge that
    drifts along a member counts once, and a run that reaches no admissible mechanism within its
    step limit is reported as not confirmed.

Re-run moment influence lines, P-Δ, critical load and plastic collapse on plane models; the app
flags them. See [the affected results](../docs/results-changes/2026-11-basic-course-returns.md).
