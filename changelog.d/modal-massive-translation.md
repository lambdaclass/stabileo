### BREAKING (results)

#### Refuse modal mechanisms with translational inertia

Planar and spatial modal analysis now refuse when a node can translate with inertia and no resolvable restoring stiffness after constraints. Raw and certified analyses identify a detected mechanism by node and dominant displacement component. The stiffness check retains the contributions that cancel during assembly and constraint reduction. The inertia check uses the mass components excited by the translation. An unresolved positive mode with resolved elastic work reports a conditioning refusal. See [the results change](../docs/results-changes/2026-11-modal-massive-translation.md). (#2146, #2147, #2148, #2416, #2517)
