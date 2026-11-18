# Ambiguous or unknown 3D support names no longer become fixed

Issue [#2276](https://github.com/lambdaclass/stabileo/issues/2276).

## What was wrong

On origin/main `44d527d64933c07c8a812f04ad2373e4d83eb72c`, the named 3D support
switch omitted `rollerZ`. The default returned six rigid restraints for that name and
for every unknown name. The explicit case for `custom3d` used the same clamp when
its mask was missing. Analysis completed without a warning about this substitution.
The web adapter sent the substituted booleans to WASM, so the engine could not identify
that a named slider had become a clamp. The defect also affected imposed-displacement
validation, which consulted the same named mapping.

## Why rollerZ is refused in genuine 3D

The stored name does not establish one defensible 3D condition. In the 2D projection,
`rollerY` and `rollerZ` restrain X, free vertical Z, and free the in-plane bending
rotation. SelectedEntityPanel presents its non-x direction as restricting X, and the
2D viewport emits `rollerZ`. The 3D gizmo instead groups `rollerZ` with `rollerY` and
describes sliding along Y. The bundled `rc-beam-flexure` example uses `rollerZ` at a
bearing under vertical loading and describes a simply supported beam. That requires
vertical restraint and a free bending rotation. These meanings cannot be reconciled
by adding one guessed mask.

The correction uses the explicit fallback requested in #2276: an unmasked `rollerZ`
in genuine 3D is refused with its support and node identifiers and a request to set
explicit 3D restraints. Its defined 2D projection is unchanged. An explicit mask on a
known type takes precedence, so an engineer can state the intended condition. An unknown
type is refused even if it carries a mask. Renaming it to a supported type is required.
The current Viewport3D genuine-3D tool already creates explicit masks through
`addSupportFromTool3D`; its `toSupportType` helper at line 2708 belongs to the
2D-workspace branch, not the current 3D creation path.

## Custom supports require an explicit mask

The 3D adapter now refuses an unmasked `custom3d` and identifies the support and node
so the author can set the intended restraints. A mask supplied with `custom3d`,
including an explicitly all-free mask, defines the restraint flags. The shared
resolver has no preset for a custom support, and each solve path validates before
sending input to WASM.

The same beam below, with the right support labeled `custom3d` and its mask omitted,
reproduces the clamp on origin/main `cf92724704aa0e4d15ac9563fb8e52f525909dae`. The
right vertical reaction and reaction moment are the same as the main values in the
table. The solve reports no warnings. Supplying the intended bearing mask recovers
the explicit simply supported result.

## Independent physical check

The original `rc-beam-flexure.json` geometry has two equal members along X, with total
span L = 5 m. It declares downward uniform loads of 12 and 8 kN/m. Opening it in PRO
with the existing self-weight option adds density times area:
25 kN/m³ × 0.08 m² = 2 kN/m. Thus the all-load solve has w = 22 kN/m.
For a simply supported beam, vertical force and moment equilibrium give both reactions
as wL/2 = 55 kN. The moment at coordinate x is
M(x) = (wL/2)x − wx²/2, giving zero at either support and
M(L/2) = wL²/8 = 68.75 kN·m.

| Quantity | Main, original named bearing | Explicit simply supported bearing |
|---|---:|---:|
| Left vertical reaction, kN | 41.25 | 55 |
| Right vertical reaction, kN | 68.75 | 55 |
| Right reaction My, kN·m | 68.75 | 0 |
| Right member-end My, kN·m | −68.75 | 0 |
| Midspan My magnitude, kN·m | 34.375 | 68.75 |

The retained probe observed an empty audit-feature list and no solver warning on main.
The corrected end moment is approximately −1.93e−14 kN·m, checked against zero at the
unchanged 9-decimal-place assertion. The test derives w from the actual stored loads,
self-weight factors, density and section area rather than assuming the option's value.

The bundled example retains its stored `rollerZ` name but now explicitly restrains
Y and Z translations and torsion about X, leaving X translation and both bending
rotations free. The other end remains `pinned3d`. This supplies the missing torsional
reference without bending fixity. Existing saved files are not silently migrated to
these particular restraints; their authors must confirm their intended conditions.

## Coverage and applicability

The support-name catalog supplies the stored TypeScript union and the re-check feature
reader. The named switch has a `never` default, so extending that union requires an
explicit mapping or refusal. Solver export and imposed-displacement validation share
the effective-mask function; standing-plane materialization also uses its projection.
Unknown names cannot bypass validation by supplying a mask.

The tests cover every catalog type, unknown names including prototype-like names and
missing values, both projection flags, explicit-mask and unmasked boundaries, the
current viewport tool, the exact bundled example, and a correct vertical 2D slider
through both plane and embedded WASM solves. Direct input construction, synchronous
and asynchronous solving, sequential and parallel combinations are checked for both
linear and nonlinear-dispatch models. Rust 3D input already consists of booleans and
has no named-support parser. Rust 2D validates its own support-name whitelist before
analysis. No Rust arithmetic changes are made.

Reproducer commit `a652ca1a9` adds the regressions using the repository's TypeScript
equivalent of an ignored known-wrong test (`RUN_KNOWN_WRONG=2276` opts into execution).
On its parent, 26 regressions fail and four controls pass. The fix removes the skips.
The existing snapshot independently records the wrong clamped-bearing result. Only
`design-rc-beam-flexure` is regenerated, with no tolerance or comparison-rule change.

The analysis entry `roller-z-fixed` and design entry `roller-z-fixed-design` have the
same applicability, exactly **3D model with an unmasked `rollerZ`, an unmasked
`custom3d` or an unknown support type**. Both Basic 3D and PRO qualify. A `rollerZ` or `custom3d` with an explicit mask has
defined restraints. An unknown name remains unresolved with or without a mask. The design
entry covers outputs downstream of the changed force distribution.
Re-establish the intended restraints, then rerun analyses, cases, combinations and
design checks, and review prior deliverables. Historical released binaries were not
assessed. The requested advisory is a draft pending coordinator review and release.

## Published flexure example

With the explicit simply supported bearing, the live PRO design workflow verifies
both members at a displayed D/C of 0.91. The design table records 0.908 and
identifies positive span flexure (Bottom Span, My+) as the governing check for
both members. This was read from both rows after computing demands, required steel
and reinforcement in the blog embed. It is downstream of the registered bearing
correction. The previous screenshot shows the design controls before that correction.

The snapshot gate opens the corrected fixture, which already has its explicit
mask. The `bundled-rc-beam-bearing-design` entry covers the changed design
ratios, demand and governing check for that example's snapshot. The context
comes from the example source in the corpus and applies only to that capture.
Saved projects with unresolved bearings receive the #2276 design notice under
the applicability above.
