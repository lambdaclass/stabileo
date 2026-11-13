### BREAKING (results)

#### Preserve staged containment and result registrations when merging main (#1952)

- Preserve main's staged physical-stiffness and kinematic checks together with
  #1952's complete staged stiffness fingerprint and support-spring history
  containment. Retain all seven #1943 result registrations. The intended P-Delta
  equilibrium fields for the spatial portal and tower remain registered by
  `pdelta-physical-residual-certification`; every added value is explained in
  [the merge registration](../docs/results-changes/2026-11-1952-merge-registration.md).
