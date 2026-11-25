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
support and homogeneous constraint reduction. A candidate must have elastic
work and a restoring force compatible with zero at the existing modal
round-off scale. Its constraint expansion must be translational, and it must
have a nonzero projection onto the physically assembled mass range resolved at
round-off. A witness blocks the solve with MODAL-MECHANISM and identifies the
node and dominant displacement component. Both planar storage paths, the
spatial path and their certified and WASM callers use this check before the
eigensolve. The reported frequency of a candidate never enters the check.

The existing eigensolver, residual, orthogonality and certification checks
continue to apply. The regression tests retain the previous handling for an
exactly massless singular direction and a known released rotation. Positive
controls restore a directional spring or constrain the free translation. The
planar negative control includes a closed-form spring-and-mass frequency. The
new check addresses node-local translations in the solve coordinates. A rank
certificate for arbitrary distributed null directions would require a
separate design.

Re-check stored modal results and responses derived from them for models with
insufficient directional restraint, including models with truss nodes and
directional springs. Registry entry `modal-massive-translation` selects modal
and modal-dependent analyses of models with truss members as a coarse project
filter.
