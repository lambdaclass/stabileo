# Refuse modal mechanisms with translational inertia

Issues #2146, #2147, #2148, #2416 and #2517 share the model stored in
`engine/tests/fixtures/modal-null-21650.json`. Node 4 has one axial truss and
one directional spring. Their directions span a plane. Motion perpendicular
to that plane has inertia and zero restoring stiffness. On the parent solver,
both ordinary and certified modal analysis returned a positive first angular
frequency. The WASM result carried NUM-INVARIANCE and MD-ORTHOGONALITY warnings,
and the certificate status was uncertified. Rotation and relabeling could make
the eigenvalue cross zero and trigger the mechanism refusal instead.

The new check examines each node's translational block of the stiffness after
support and homogeneous constraint reduction. Each row of the restoring force
must be compatible with zero at the round-off scale of the active terms. The
same bounded projection checks the candidate's local block and the other
rows. Its constraint expansion must be translational and have a nonzero
projection onto the physically assembled mass range resolved at round-off.
A witness blocks the solve with MODAL-MECHANISM and carries a structured
diagnostic with the node and dominant global displacement component of one
detected mechanism. Both
planar storage paths, the spatial path and their certified and WASM callers
use this check before the eigensolve. The reported frequency of a candidate never enters the check.

The existing eigensolver, residual, orthogonality and certification checks
continue to apply. The regression tests retain the previous handling for an
exactly massless singular direction and a known released rotation. Positive
controls restore a directional spring or constrain the free translation. The
planar negative control includes a closed-form spring-and-mass frequency. The
new check addresses node-local translations in the solve coordinates. A rank
certificate for arbitrary distributed null directions would require a
separate design.

The skewed-spring regression uses an axial stiffness of `s = 1e14` and an
axis-aligned spring of stiffness `k = 1`. The exact lower stiffness
eigenvalue is `sk / (s + k + sqrt(s² + k²))`, approximately 0.5. The physical check resolves its restoring force. The existing
post-eigensolve classifier still refuses that case at the conditioning seen
on the parent solver. A spring of stiffness 4 on the same model returns a
positive finite mode.

Re-check stored modal and dependent results for models with insufficient
directional restraint. Registry entry `modal-massive-translation` covers modal,
response spectrum and seismic results of projects with members, springs,
constraints or connectors. This includes pin-ended frames.
