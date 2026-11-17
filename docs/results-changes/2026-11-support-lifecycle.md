# Recorded supports keep their restraints and preset edits reset their axes

Issue [#2277](https://github.com/lambdaclass/stabileo/issues/2277), round 6.

## What changed

The support store used the same roller preset logic for placement, copied
records and JSON fixtures. It relabelled a bare `rollerZ` as `rollerY` and held Z.
An edit to another preset, including `fixed3d`, could leave the previous mask in
force. Generating a global roller mask could keep the previous local member
reference. Fixture replay also called interactive mutation methods while geometry
and loads were still being read.

Copy and fixture replay now insert support records directly. A bare `rollerZ`
stays unresolved through original placement, copy, fixture replay and selection
of that legacy type. In space analysis the existing mapping refusal asks for an
explicit type or restraint choice. A documented mask carried by a bundled
example is accepted as recorded. Plane models retain the defined vertical slider
and its XZ embedding.

Selecting a different preset replaces the old mask and frame. Named space
rollers with defined axes generate their mask and global frame together. Edits
that supply restraints keep the explicit mask and can specify its frame. A
field-only edit keeps the support configuration. The store replays complete
fixtures in their recorded coordinates before setting the example's presentation.

## Results and applicability

Affected space models can move from a guessed answer to a refusal, or produce
different reactions, displacements and member forces after a preset is changed.
A correct explicit support continues to reach the same solver. The change is
in web model preparation. Native Rust receives explicit restraint booleans.

The recheck entry covers 3D projects with a roller or a stored restraint mask
on a named preset. A stale mask can persist on a named fixed, pinned or spring
support. A mask on `custom3d` is the definition of the support itself. Review
the recorded bearing directions and rerun analysis, combinations and design
after editing the supports.

The copy, stale preset and fixture replay regressions here are on the #2277
branch. The earlier silent fixed fallback on main is documented in the
[#2276 results record](2026-11-roller-z-fixed.md).

## Verification

The 35 new regressions fail on `954f08a72` and pass after the fix. The recorded
plane-roller control passes before and after. The tests exercise copied and
transformed support records, single and bulk placement, changing named presets,
a global imposed displacement after replacing a local preset, and JSON replay
while an upright model is open. Native-space fixture tests check the refusal and
the solved reaction after an explicit choice in Basic 3D and PRO, with linear and
nonlinear input building, direct sync and async solves, and sequential and
parallel combination entry points. Node uses the existing fallback for browser
workers. The plane control solves direct and combination cases and compares the
embedded direct reactions.

## Plane rollers follow quarter-turn edits

Round 7 of #2277 corrects how plane geometry and support restraints are carried
before solving. A plane `rollerZ` restrains X. After a quarter-turn in the plane,
a force applied along the rotated restrained axis is resisted entirely by the
roller. The branch previously kept the original restraint and returned a
reaction along X. On main, the old upright-copy path could instead turn this
bearing into a fully restrained support. The plane edit now exchanges the
named roller axes. A model
shown upright in a 3D workspace is materialized into XZ before the copy is
captured, so the ordinary space transform carries its explicit restraint mask.
A genuinely spatial bare `rollerZ` keeps its unresolved name and the solver's
refusal still applies. An off-axis turn a named support cannot encode reports
the dropped support.

Round 9 covers a plane roller marked local at a node without an incident member.
The plane solver uses the drawing axes as its fallback local basis at that node.
The quarter-turn now permutes that basis and records the rotated bearing axis
explicitly. The direct copy, detached copy and in-place edit use the same
conversion. A local roller carried with its reference geometry keeps its local
basis. The regression checks that the bearing takes the rotated load in direct,
asynchronous, case, combination, second-order and embedded 3D solves.

The results record flags plane projects with a bare `rollerZ` or an unmasked local
plane roller for review of previous edits. Saved records do not carry rotation history. The entry declares
no numerical differences for the same stored model, because the correction
changes the edit that produces the model.

Fixture replay also remaps a local support's member reference before insertion
and refuses a reference missing from the fixture. A preset change clears the
old mask and axes as defaults and applies axes explicitly supplied in the edit.
Single and bulk support placement use the same rule for explicit axes.

## Unchanged support types preserve bearing directions

Round 8 of #2277 corrects the support edit that produces the solver input. An
unchanged type carries the recorded DOF mask, frame and local member reference.
Explicit fields in the edit take precedence. An actual type change applies the
new preset and discards the previous mask and axes unless the edit supplies
replacements. Explore preserves the recorded type in its temporary baseline and
uses the same rule as the support editor. Resubmitting a plane roller in the upright view keeps the model in its embedded plane.

The branch could replace a bearing's explicit mask with the global roller
preset during a settlement edit. The existing Explore path can also replace a
mask on the same type in main. In the regression, a unit horizontal force has
an opposing unit reaction at the bearing with its recorded restraint. The
Explore override silently produces zero reaction at the bearing on main. In an
upright plane model, the branch instead refuses the solve after interpreting the
unchanged plane roller as a bare space roller.

The recheck notice covers space rollers and masked named supports. Review the
bearing definition and rerun analyses that used an affected edit or Explore
trial. Saved models record the resulting restraints, so the notice does not
declare numerical changes when the same stored model is sent to the solver.
