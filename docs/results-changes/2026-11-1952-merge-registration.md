# PR #1952 merge result registration (2026-11-12)

The merge retains all seven immutable #1943 records from origin/main. They were
absent on the pre-merge branch, which made the registry gate stop before it could
check the intended #1952 values. These records retain their original conditions,
quantities, translations and linked write-ups; they are not replacement #1952
registrations.

| Retained record | Registered behavior |
| --- | --- |
| `initial-plastic-refusals-and-stage-cancellation` | Initial 3D plastic states now propagate regular elastic refusals instead of reporting collapse through the hinge fallback. Staged member removal accepts rotations with exactly zero accumulated load and zero physical stiffness, while retaining nonzero-load refusals. Re-run affected plastic and staged histories (PR #1943). |
| `kinematic-translation-motion` | Free rotations moving constrained translations now appear in mechanism metadata. Initial elastic numerical refusals reach the regular solver instead of the plastic soft-spring fallback; rigid-plastic analysis can normalize stiffness first. Dormant staged pins use active stiffness to avoid spurious conditioning warnings. Re-run affected constrained and staged models and review plastic solve status (#1846, PR #1943). Translational stiffness at eigenvalue rounding cannot hide oblique truss mechanisms (#1095, #1103). |
| `local-kinematic-spring-rank` | An unrelated stiff member could falsely make a constrained spring model appear to be a mechanism on PR #1943. Spring normalization now uses only constraint-connected DOFs. Re-run affected spring models; mechanism metadata and solve availability can change. Ordinary elastic component results are unchanged. |
| `staged-cancelled-rotation-subspaces` | Staged moment cancellation now handles oblique free rotations after member removal, preserves supported increments and refuses remaining unsupported moments. Re-run affected staged histories (PR #1943). |
| `staged-free-stiffness` | Staged analysis now refuses nonzero reduced loads on free inactive DOFs, preserves partial constraints and unloaded inactive DOFs, and checks solution accuracy and finiteness through the regular linear routines. Earlier artificial stiffness or omitted refinement could change displacements, reactions and member actions even without end releases. Re-run staged construction histories and review derived demands (#1846, PR #1943). |
| `staged-moment-subspaces` | Staged free-rotation checks now use accumulated loads and refuse moments left unsupported after member removal. Kinematics counts independent rigid-arm translation motions and treats positive springs as restraints independently of stiffness. Elastic solves retain their original conditioning checks. Re-run affected staged and constrained models (#1846, PR #1943). |
| `staged-orphan-rotations` | Staged 3D could add an artificial spring to a real rotation after a unit change when a member end released My or Mz. Staged 2D could also stiffen a real rotational support spring at a hinged end. Both dimensions now share regular linear assembly and its per-node rotation test. Unloaded free rotations still solve; unsupported nodal moments are refused. Re-run staged models with releases and review derived demands (#1846). The affected class includes translations and member forces in multi-member frames and multi-stage loading, including the staged comment witnesses on #1085 and #1011. Re-check spring and mixed truss/frame/shell models too. |

The intended committed snapshot difference from origin/main is 14 added fields
in each of `pro-3d-portal-frame` and `pro-3d-tower`. The existing #1952
`pdelta-physical-residual-certification` entry registers their `equilibrium`
quantity for P-Delta frame members. No displacement, member force, support
reaction, input fixture, tolerance or snapshot baseline is changed by this merge.

The values below are transcribed from the committed snapshots, not recalculated
or selected to fit a tolerance. Components 0–2 are the assembled global force
components; 3–5 are moment components about the centre of the deformed nodal
bounding box, including each force lever arm. Applied sums use the physical
assembled load vector. Reaction sums use recovered physical support forces.
`residualOk` checks the physical free residual; `equilibriumOk` reports the
existing global force and moment check. Either flag being false adds a
structured reaction-unavailability diagnostic. Neither flag certifies a stabilized
residual as physical equilibrium. Small nonzero reaction components
and moment differences are retained as produced, without rounding them to zero.

| Equilibrium field | Portal frame | Tower | Meaning |
| --- | ---: | ---: | --- |
| `appliedForceSum[0]` | `15` | `40` | Physical applied force sum, component 0 |
| `appliedForceSum[1]` | `0` | `-5.551115123e-17` | Physical applied force sum, component 1 |
| `appliedForceSum[2]` | `-134.4994` | `-34.45107203` | Physical applied force sum, component 2 |
| `appliedForceSum[3]` | `-10.00326795` | `0.0008519511831` | Physical applied moment sum, component 3 |
| `appliedForceSum[4]` | `44.9912306` | `120.0070384` | Physical applied moment sum, component 4 |
| `appliedForceSum[5]` | `30.00990716` | `8.1705561e-06` | Physical applied moment sum, component 5 |
| `equilibriumOk` | `true` | `true` | Global force and moment equilibrium acceptance |
| `reactionForceSum[0]` | `-15` | `-40` | Recovered support force sum, component 0 |
| `reactionForceSum[1]` | `-7.275381964e-10` | `-5.278368419e-10` | Recovered support force sum, component 1 |
| `reactionForceSum[2]` | `134.4994` | `34.45107203` | Recovered support force sum, component 2 |
| `reactionForceSum[3]` | `10.00855507` | `0.006872248249` | Recovered support moment sum, component 3 |
| `reactionForceSum[4]` | `-44.99174725` | `-120.0072204` | Recovered support moment sum, component 4 |
| `reactionForceSum[5]` | `-30.03356625` | `-0.001240744837` | Recovered support moment sum, component 5 |
| `residualOk` | `true` | `true` | Physical free-residual acceptance |

Staged results additionally retain #1952's `staged-history-forces-unavailable`
and `staged-support-spring-history` registrations. The shared complete stiffness
fingerprint still withholds unsupported recovery after a loaded stiffness change;
main's physical-stage solve still checks inactive DOFs and free rotation loads.
The latter check may refuse a model before recovery. A refusal and a structured
unavailable result are both containment, and neither permits a numerical result
outside the existing assertions. Full activation-state recovery and released-force
redistribution remain outside this merge.

Main's round-5 and round-8 tests for cancelled moments after loaded-member removal
previously required force collections even when the history had changed. The
merged contract retains their nonzero free-rotation refusal checks and numerical
increment checks. Those exact loaded histories now must withhold every force
collection with the structured history warning. Separate zero-history controls
run every original force-component and row-completeness assertion, with the
original tolerances, including the supported increment against the regular
linear solution. This preserves the public spring and member containment rather
than exempting special cancelled histories from the complete fingerprint.
