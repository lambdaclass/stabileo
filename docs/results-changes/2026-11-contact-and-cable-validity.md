# Frozen contact states and cable bar analyses are withheld (2026-11-10)

Issues #432 (NL-13) and #417 (SP-14). Results-change entry `contact-and-cable-validity`.

The contact iteration stopped counting a gap or surface pair as changed once its flip count
exceeded `max_flips`. It could then report convergence while the frozen contact carried tension
or penetrated. The 2D and 3D reproducer returns a closed gap carrying 47.08417852038051 kN of
unphysical tension and `converged = true` at the base revision. The base already attaches a
translated NL-13 warning; these native reproducers therefore did not return silently wrong results.

Both dimensions now check frozen contacts after the final solve without damping, remembering
freezing across augmented-Lagrangian passes. Open contacts must not penetrate or carry force; active
contacts may carry compression with penalty penetration. Tensile force divided by penalty stiffness
must be within the contact tolerance, default 1e-10 m, and a separated contact must not carry
compression above the same scaled tolerance. Invalid states return a structured
`contact_state_invalid` refusal. A frozen state that satisfies these conditions may converge.
The [review correction](2026-11-frozen-contact-bearing-and-surface-al.md) also fixes the surface
AL multiplier sign and documents hand-formula controls. Frozen uplift supports
whose status still needs to change are refused rather than returned with an unsettled state.

Outside the cable solver, cable elements were assembled as two-way truss bars. The 2D pinning
model returns compression at the base; the 3D reproducer returns -10 kN. The base attaches a
translated SP-14 warning. Shared input validation now refuses cable elements in analyses that
cannot enforce slackening, including static, prepared, modal, P-Delta, buckling, time history,
harmonic, constrained, staged, co-rotational, material, fiber and contact paths. Analysis-based
design workflows receive the same refusal. The dedicated cable solver is explicitly exempt.

This is a deliberate restriction on tensile and unloaded cable cases as well as compressed ones:
the unsupported analysis does not prove the cable stays taut in combinations or dynamics. Use
cable analysis; use an explicit truss only for a member intended to resist both force signs. Contact
analysis can represent a tension-only truss with explicit `tension_only` behaviour.

The web input builders preserve cable identity, including advanced-analysis and design requests,
instead of converting cables to trusses before they reach validation. The automatic cable-analysis
route remains available.

Both errors have structured codes and translations in all six locales. Previously accepted affected
models now return errors instead of results. No tolerance, baseline or assertion was loosened.

**What to re-check:** results from frozen contact states, and cable models previously solved or
designed using an analysis other than cable analysis. The native base reproducers carry warnings,
but a real-WASM replay on origin/main `52619652e` confirms silent web compression: the advanced
P-Delta support-shortening fixture returns cable force −4.599884347090908 kN, converged and stable,
with no displayed warning. Co-rotational, Winkler, SSI, staged and direct-analysis paths also
return compressed cables without containment messages. The dedicated cable route returns zero
cable force for the load-driven control. See [SA-2026-059](../advisories/SA-2026-059-web-cable-compression.md)
and its [replay evidence](../advisories/replays/SA-2026-059.md). Fixed in PR #1921, pending release.
