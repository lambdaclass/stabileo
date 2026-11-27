# SA-2026-121: Planar nonlinear analysis could return incorrect member-load results

| | |
|---|---|
| Severity | Medium |
| Status | Published 2026-11-25 |
| Issue | [#2560](https://github.com/lambdaclass/stabileo/issues/2560) |
| Fix | PR [#2567](https://github.com/lambdaclass/stabileo/pull/2567), merged as `01815580f` |
| Fixed release | the next release after 0.6.4 |
| Affected versions | The planar member-load assembly and recovery paths date to `c57dfb7bb` and were affected in the first numbered release, 0.2.0. The final-chord projection dates to `a1a20b39d` (0.6.0). All four cases were verified against the 0.6.4 tag and main before #2567 |
| Re-check registry | [`planar-nonlinear-load-and-motion-rounding`](../../web/src/lib/provenance/result-changes/planar-nonlinear-load-and-motion-rounding.json), [`exact-planar-member-actions`](../../web/src/lib/provenance/result-changes/exact-planar-member-actions.json), [`planar-member-projection-equilibrium`](../../web/src/lib/provenance/result-changes/planar-member-projection-equilibrium.json) |

## Affected features

Planar arc-length, displacement-control and co-rotational analysis with
member loads, including the production WASM and native solver paths.
The inclined-roller result below concerns a single member point load
in planar co-rotation. [SA-2026-116](SA-2026-116-nonlinear-continuation-and-inclined-loads.md)
covers the earlier defect involving separately specified loads.

## What was wrong

The solvers could round member-load contributions before combining or
projecting them. When components oppose or cancel, that can leave a
spurious force or moment or remove the load driving a free displacement.
The following production WASM replays from the 0.6.4 tag converged
without warnings.

- **Mixed point load at an inclined roller.** When one member load
  contained transverse and axial components, the change to global axes
  could lose the axial component before projection onto the roller's
  free direction. In the co-rotational replay with a transverse load
  of 512 kN and an axial load of about 2.84 × 10⁻¹⁴ kN, the solver
  returned zero horizontal tip displacement. The axial-only control
  and the fixed combined-load replay returned about −2.27 × 10⁻¹⁴ m.
- **Coincident member loads.** Summing individually rounded equivalent
  end actions could give a different result from applying the same
  resultant at the same station. For opposing axial point loads of
  514.1 kN and −512 kN at 1.5 m along a 2 m member, the full-load far-end
  axial force differed from the single-resultant control by about
  2.84 × 10⁻¹⁴ kN. The fixed
  replay matched the control.
- **Partial transverse load.** On a fixed-ended 48 m frame with
  108 kN/m over the first 16 m, a transverse point force of −160 kN and
  a couple of +2,304 kN·m at the far end exactly cancel the far-end
  actions of the distributed load. The
  full-load reaction moment was about +4.55 × 10⁻¹³ kN·m and the reported
  member end moment was about −4.55 × 10⁻¹³ kN·m. Both should be zero.
- **Rotating member.** Recovery could project a point load perpendicular
  to the final chord into a spurious axial action. In the rotation
  replay, with member load components of −512 kN axial and 384 kN
  transverse in the reference frame, the reported far-end axial force
  was about −5.68 × 10⁻¹⁴ kN where it should be zero.

[Results-change records for load and motion](../results-changes/2026-11-planar-nonlinear-load-and-motion-rounding.md),
[equivalent member actions](../results-changes/2026-11-exact-planar-member-actions.md)
and [member projection](../results-changes/2026-11-planar-member-projection-equilibrium.md).

## How to tell if your model is affected

Check planar nonlinear runs with opposing loads at the same member
station, partial transverse loads whose end actions cancel other
loads, or members that rotate under applied loads. For co-rotational
runs with inclined rollers, check for a member point load that
contains both axial and transverse force and drives a small
displacement along the roller. Compare support reactions and member
end forces against the resultant loads and the accepted deformed
geometry.

## Fixed in

The next release after 0.6.4. PR
[#2567](https://github.com/lambdaclass/stabileo/pull/2567) combines
coincident components before evaluating their equivalent end actions.
The planar nonlinear drivers preserve the combined actions through
load assembly and project recovered actions from the member chords
before rounding.

## Workaround

Use an independently verified nonlinear solver for affected cases
until the fixed version is available.

## What to do with results you already have

Rerun affected planar nonlinear analyses from the original load
definitions and support conditions, including any analyses used to
produce continuation start states. Review the accepted displacements,
support reactions and member end actions. Rebuild dependent envelopes,
repeat design checks and regenerate affected reports.

## Credits and references

See [issue #2560](https://github.com/lambdaclass/stabileo/issues/2560),
[PR #2567](https://github.com/lambdaclass/stabileo/pull/2567), the
[inclined and coincident-load tests](https://github.com/lambdaclass/stabileo/blob/01815580f/scripts/tests/arc-review-wasm.mjs)
and the [partial-load and chord-projection tests](https://github.com/lambdaclass/stabileo/blob/01815580f/scripts/tests/planar-exact-member-actions.mjs).
