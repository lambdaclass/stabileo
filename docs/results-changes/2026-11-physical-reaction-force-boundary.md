# Physical reaction force boundary (2026-11-12)

PR #1952, review round 8. Reaction and constraint-force recovery accepts a
`PhysicalForces` value with private storage, or the staged solver's existing
physical-residual type. It no longer accepts an arbitrary internal-force vector
or an arbitrary full residual. The raw residual transfer is private to the
recovery module. No recovery constructor accepts artificial stiffness.

The planar corotational final-result builder formerly accepted the Newton
system's artificial stiffness list. A compatible supplied state with a released
rotational slave and a prescribed restrained master therefore acquired a
constraint moment and an additional master reaction. The ignored reproducer in
`1deb0d21c` fails on its parent: an artificial stiffness of `1e-6` and slave
rotation `0.0013` add `1.2999999999999999e-9` to both force channels. These
numbers are from `.codex-r8-unit-exact-parent.log`, calculated by the reproducer from
its supplied state. The physical member response must be independent of that
stabilization. Final recovery now has no argument through which to receive it.

Physical constructors cover corotational, material, P-Delta, contact, Guyan,
staged, time history, arc-length and displacement control, as well as cable,
SSI, Winkler and fiber recovery. Linear matrix recovery reassembles with
artificial stiffness disabled, including inside an assumed-stable solve scope.
Physical member forces, springs, foundation stiffness and the final active
contact/cable/soil corrections remain. Tangent assembly for the solve retains
its stabilization. Time history retains its existing unavailable-total-reaction
warning; this change does not claim total dynamic reactions.

Public released-slave controls cover 2D and 3D, zero and signed prescribed
motion, and models on both sides of the sparse dispatch boundary. Native
continuation is covered for corotational and arc-length. Unsupported prescribed
motion remains refused by displacement control, Guyan, time history and spatial
corotational analysis. There is no spatial arc-length/displacement-control API
or WASM Guyan 3D/continuation export. Existing physical-spring, member-force and
unconstrained controls remain checked. The public controls already pass on the
reviewed parent: its ordinary assemblers exclude tied rotations from artificial
stiffness. The failing supplied-state test isolates the unsafe recovery API;
this round does not claim a newly reproduced silent public result on main.

## Refreshed evidence

`docs/advisories/replays/SA-2026-061.json` now reruns all 38 exact recorded
arguments against the final implementation, retaining every original `before`
record and argument. Its fixed WASM hash and source provenance are refreshed.
The two frozen snapshot files already contain the corrected round-7 values;
they remain unchanged. The stale replay's following after-fields now match them:

| Arch | Member | Both end shears before refresh | Both end shears after refresh |
| --- | --- | ---: | ---: |
| `0015ab84c3baa36f` | 1 | 0.00900512695715393 | 0.009120538867785025 |
| `0015ab84c3baa36f` | 2 | -0.00900512695715393 | -0.009120538867785025 |
| `022317310499426d` | 1 | 1509.5406591099968 | 1509.466671404419 |
| `022317310499426d` | 2 | -1509.5406591099968 | -1509.466671404419 |

Other stale after-fields refreshed by the same replay are both end shears of
member 1 in `arc-member-loads` (`0.29999996172953236` to
`0.29999996172750737`), `displacement-member-loads` (`11.11111615227026` to
`11.111116049389368`) and `corotational-2d-restrained-master`
(`9.999988825410284` to `9.99998875041048`). The determined constraint-only
staged records in both dimensions regain the unavailable-state notices added
in round 7. These are stale evidence corrections from the existing final-chord
and staged-warning fixes, not further changes to those algorithms this round.

`make test.engine.reactions-frozen` now checks the stored replay and frozen
values as well as a live solve. Each representation must contain both members,
have finite values, return all expected node IDs, report the chord reconstructed
from displacements, and satisfy unloaded-member shear and moment equilibrium.
Negative controls reintroduce the original shear and remove members. Run
`make shell`, then `node scripts/helpers/arc-evidence-equilibrium.mjs --update`
after `make wasm` to regenerate the replay. No baseline or tolerance is relaxed.

The existing main capture still documents silently inconsistent arch shears
with `converged=true` and no notices. Advisory treatment remains the
coordinator's decision; this round adds no advisory.
