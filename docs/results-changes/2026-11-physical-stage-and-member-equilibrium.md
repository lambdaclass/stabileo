# Physical staged residuals and deformed member equilibrium (2026-11-12)

PR #1952, review round 7. This supplements the earlier arc-length reaction change.
Registry `planar-corotational-member-equilibrium` covers planar nonlinear member
forces, including ordinary unconstrained corotational analyses. The existing
`arc-length-reactions` entry retains its analysis-qualified scope and describes
the constraint-only stage warning. Staged APIs have no separate saved-project
analysis family; this change does not declare unrelated static fields changed.

Staged reactions and constraint forces previously used a residual assembled with
artificial stiffness. Its free-slave rows could become physical constraint forces
and transfer into support reactions. Both dense and sparse recovery now assemble
without stabilization through `PhysicalStageResidual`; both dimensional result
builders require this type. All four staged assembly paths use the shared
artificial-stiffness switch. Physical contributions, including springs and stage
prestress fixed-end loads, remain in the residual. No stabilization force is
subtracted from an already summed residual, avoiding cancellation with real loads.
Stiffness-free stages with free DOFs retain their unavailable-state warning even
if constraints determine those DOFs. Directly fully restrained controls remain
available. This does not redesign staged construction history or master motion.

Planar corotational recovery previously computed shear using the initial chord,
while reporting the deformed length. The solver residual already used the current
chord. The residual and recovery now share one elastic end-force function:
constitutive end moments still use the reference stiffness; elastic shear is their
sum divided by the current chord. Member fixed-end loads are subtracted afterward.
Arc-length, displacement control and native continuation use this same recovery.
There is no 3D path-following API; 3D corotational recovery already calls
`current_length_shears` and is unchanged.

Only the two requested arc snapshots were regenerated using
`make test.engine.reactions-frozen UPDATE=1`. Each unloaded member has equal start
and end shear, and its signed moment difference equals minus shear times the
reported deformed length. Every changed scalar is listed below; all moments,
lengths, axial forces, displacements, load factors and reactions are unchanged.

| Fixture suffix | Member | Field | Before | After |
| --- | --- | --- | --- | --- |
| `0015ab84c3baa36f` | 1 | `vEnd` | 0.00900512695715393 | 0.009120538867785025 |
| `0015ab84c3baa36f` | 1 | `vStart` | 0.00900512695715393 | 0.009120538867785025 |
| `0015ab84c3baa36f` | 2 | `vEnd` | -0.00900512695715393 | -0.009120538867785025 |
| `0015ab84c3baa36f` | 2 | `vStart` | -0.00900512695715393 | -0.009120538867785025 |
| `022317310499426d` | 1 | `vEnd` | 1509.5406591099968 | 1509.466671404419 |
| `022317310499426d` | 1 | `vStart` | 1509.5406591099968 | 1509.466671404419 |
| `022317310499426d` | 2 | `vEnd` | -1509.5406591099968 | -1509.466671404419 |
| `022317310499426d` | 2 | `vStart` | -1509.5406591099968 | -1509.466671404419 |

Each positive shear above is `(mStart - mEnd) / length` for that member's final
geometry. The second member has the opposite signed moment difference and hence
the opposite shear. Both end values change together because there is no member
loading. Native and WASM assertions independently calculate the final chord from
node coordinates plus displacements and check the local moment balance.

Restored construction controls keep the support mask constant while adding or
removing members, and assert the actual outputs at every stage. Displacement
oracles sum independent linear increments. Force oracles evaluate horizontal
Euler–Bernoulli end forces from those independently calculated displacements and
uniform-load integrals. The original support-history refusal cases remain.
Direct residual regressions supply the compatible settled-master/slave state to
isolate force recovery from construction history, and exercise both assembly
paths in both dimensions. Public native and WASM cases additionally cover
loaded disconnected ties, warning retention, zero and signed motion, dense and
sparse dispatch, directly fixed controls, and stiffness-free free-DOF cases.
No tolerances or unrelated frozen results were changed.
