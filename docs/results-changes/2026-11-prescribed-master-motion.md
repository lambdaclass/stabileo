# Preserve prescribed master motion in constrained solutions (2026-11-12)

Issue #2008.

A restrained constraint master can impose a settlement or rotation on a free
slave. The constraint equation is affine: the free displacement contains both
the independent solution and the particular displacement induced by the master.
Staged construction expanded only the homogeneous part. It also omitted the
particular displacement's stiffness contribution from the reduced right-hand
side. The returned slave motion could be zero while the support reported its
nonzero imposed motion, without a warning.

The same omission affected Winkler, contact, material nonlinear, 2D corotational,
and arc-length analyses. A required master-motion argument now distinguishes
prescribed motion from homogeneous corrections and mode shapes. One shared
expansion computes the particular displacement, including rigid offsets and
composed constraint coefficients. The linear solver uses that same calculation.
Staged construction applies only the change in master motion at each stage;
unchanged stages retain the settlement without accumulating it again.

Winkler and staged solves subtract the particular displacement's stiffness
response. Contact includes it in every base and contact-correction block.
Material nonlinear residuals are evaluated with the prescribed slave motion
already imposed. Corotational predictors and arc-length load directions include
the slave's prescribed increment in both their tangent forcing and expansion.

Cable analyses containing cable elements and linear time histories do not
implement prescribed support motion. They now refuse any nonzero prescribed
support displacement, including values below the static solver's motion cutoff.
Zero prescribed motion remains accepted. Cable inputs without cable elements
continue through the linear solver. Existing refusals in other analyses remain.
Modal and buckling eigenvectors and Newton corrections at fixed supports expand
homogeneously; P-Delta retains the affine linear starting solution.

Re-run staged, foundation, contact and nonlinear analyses with prescribed
constraint masters. Displacements, reactions and member forces can change.
Re-run cable and time-history inputs with prescribed support motion; those calls
now refuse instead of returning a response that omits it. Native and WASM
regressions cover both dimensions, constraint types, both signs, repeated stages,
and dense and sparse dispatch. Zero-motion numerical fingerprints are compared
bit for bit with origin/main. The coordinator assigned
[SA-2026-063](../advisories/SA-2026-063-prescribed-master-motion.md); fixed in
PR #2009, pending release.

The separate reaction and member-force recovery defects tracked by #1949 and
PR #1952 still require their own correction. In particular, transferring slave
forces into restrained-master support reactions is outside this kinematic fix.

The follow-up for #2009 preserves time-history input-error precedence: a support
spring conflicting with a rigid restraint still receives its structured input
error before the prescribed-motion feature check. Unsupported nonzero motion
now uses the same JSON diagnostic envelope, with `unsupported_feature`, error
severity and input phase, across native, traced, certified and WASM entries.
Accepted responses are unchanged: absent and explicitly zero prescribed motion
produce identical loaded histories in both dimensions and integration methods.
Origin/main replay returned identical complete responses for nonzero and absent
prescribed motion, confirming the need for containment. Its existing general
dynamic warnings did not identify the omitted support motion.
