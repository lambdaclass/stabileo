# Gravity result explanation scope

The #2219 Web Unit shard exposed overly broad test metadata in six unmerged
gravity registry entries. The v0.4.0 cable-stayed bridge contains full-member
uniform force loads, without moment densities, point loads, partial spans,
generated area loads or floor definitions. Conservative recheck notices still
apply to its member loading. Those notices do not establish a reason for its
solved displacements, support reactions or member end forces to change.

The unchanged bridge test checks the recorded historical correction and then
alters either side of the comparison independently. Previously every fabricated
displacement and reaction was accepted by five gravity entries declaring `*`.
The fabricated axial force was additionally accepted by the zero-moment entry's
whole `elementForces` declaration. These are unrelated changes and must fail.

The result declarations now allow only the channels supported by these records:

| Entry | Permitted result quantities |
| --- | --- |
| `gravity-density-extrema` | `envelope`, `solve.ok` |
| `gravity-diagram-coordinates` | `envelope`, `solve.ok` |
| `gravity-moment-support` | `solve.ok` |
| `gravity-stations-and-edits` | `envelope`, `solve.ok` |
| `gravity-torque-projection-and-carriers` | `envelope` |
| `gravity-zero-member-moments` | `solve.ok` |

Density extrema, jump stations and torque recovery change diagrams and their
combination envelopes. Support validation can refuse, and absent-equivalent zero
moments can recover a previously refused solve. A saved physical load edited or
regenerated into another load is a model change; a notice about restoring that
load does not authorize arbitrary numerical changes in the original model.
There is no audited historical solved-response pair in these six entries that
justifies a general displacement, reaction or member-force permission. Any such
future change needs its own evidence and a suitably scoped declaration.

The legacy judge and snapshot gate now use one quantity matcher. Regression tests
exercise each entry independently, the four CI fields, base/case/combination
results, both comparison directions, plane/spatial/PRO model features and the
P–Delta/nonlinear/SSI snapshot paths. Refusal and recovery permissions, forbidden
model-count changes, envelope coverage and identical results are also checked.
The original bridge test still uses every applicable entry and still accepts
its fingerprinted historical correction while rejecting fabricated values.

This repair changes test explanation metadata only. No engine result, physical
load, baseline, comparison tolerance, recheck notice or results version changes.
No new advisory is assigned.
