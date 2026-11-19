# SA-2026-089: Unresolved 3D supports silently became fixed

| | |
|---|---|
| Severity | High |
| Status | Published 2026-11-18; drafted 2026-11-17 |
| Issue | [#2276](https://github.com/lambdaclass/stabileo/issues/2276) |
| Fix | PR [#2277](https://github.com/lambdaclass/stabileo/pull/2277); released in 0.6.2 |
| Fixed release | 0.6.2 |
| Affected versions | Confirmed on origin/main `44d527d64933c07c8a812f04ad2373e4d83eb72c`; unmasked custom3d also confirmed on origin/main `cf92724704aa0e4d15ac9563fb8e52f525909dae`. Historical releases and introduction not assessed |
| Re-check registry | [`roller-z-fixed`](../../web/src/lib/provenance/result-changes/roller-z-fixed.json), [`roller-z-fixed-design`](../../web/src/lib/provenance/result-changes/roller-z-fixed-design.json) |

## Affected features

A 3D model with an unmasked `rollerZ`, an unmasked `custom3d` or an unknown support type, in Basic 3D or PRO.
The web support-name conversion precedes linear/nonlinear and case/combination dispatch
to WASM. The defined projection of a plane `rollerZ` is unaffected. The Rust 3D API
already takes restraint booleans and has no corresponding support-name conversion.

## What was wrong

The 3D named-support switch had no `rollerZ` case. Its default restrained all six
translations and rotations for any unknown name. The explicit `custom3d` case
also returned six fixed restraints when the support had no mask. A successful solve therefore described a different support condition without a warning.
Member forces, reactions, displacements and downstream design could be wrong.

The shipped `rc-beam-flexure` example is described as simply supported but used
`rollerZ` at its second bearing. The main-source probe completed with no solver
warning and returned a right reaction moment of 68.75 kN·m and a right member-end
moment of −68.75 kN·m. A simply supported end has zero bending moment. The original
left/right vertical reactions were 41.25/68.75 kN; equilibrium for the intended
simply supported model gives 55/55 kN and midspan bending moment 68.75 kN·m.

The [results-change record](../results-changes/2026-11-roller-z-fixed.md) derives
these values from the fixture's geometry, explicit loads and self-weight. Replacing
the original right bearing label with `custom3d` and omitting its mask produced the
same right reaction moment and vertical reaction without warnings on main.

## How to tell if your model is affected

Inspect 3D support names and explicit restraint masks. An unmasked `rollerZ`, an
unmasked `custom3d` or an unknown support name used the fixed fallback. A correct
explicit mask on a recognized name already took precedence. The saved-project
notice selects those three affected inputs.
An equilibrium check of the substituted fixed model cannot verify that its supports
match the intended structure.

## Fixed in

0.6.2 (PR [#2277](https://github.com/lambdaclass/stabileo/pull/2277)). The named switch is exhaustive
at compile time and refuses unknown runtime values, including values accompanied by a
mask. The legacy `rollerZ` has contradictory 2D, gizmo and example meanings; genuine 3D
solves now require explicit restraints for that name and for `custom3d`. The 2D projection remains
defined. Solver export and imposed-displacement validation share the same mapping.
The bundled beam now carries an explicit simply supported bearing mask.

## Workaround

Establish each intended translation and rotation restraint explicitly using the 3D
support editor and a recognized support type. Include the torsional reference needed
by the structural model. Verify end conditions and the resulting reactions and moment
distribution independently. Do not accept a fixed fallback as a slider condition.

## What to do with results you already have

Review the intended supports before re-solving affected saved projects. After upgrading
to 0.6.2, rerun analysis, load cases, combinations and
design. Review forces, reactions, deflections, member sizing and prior deliverables
that relied on the earlier results. The correction does not choose the intended mask
for an existing ambiguous saved bearing.

## Credits and references

See issue #2276 and the
[results-change record](../results-changes/2026-11-roller-z-fixed.md) for the main-source
witness, physical derivation and regressions.
