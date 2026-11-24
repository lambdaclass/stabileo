# Supplied linear results require a stable load case

A Rust caller could submit displacements from a previous solve to the linear case and combination certificate APIs. Those APIs checked the interval residual against the assembled matrix. The matrix could include artificial springs at released rotations, which could make an incompatible load appear to have a unique equilibrium.

For the all-hinged joint from #458, the assembled response used a numerical spring to carry the joint moment. The supplied-result certificate reported a relative bound of 9.868649107779185e-16 for that response. Certifying a supplied combination exported the same bound for its input case. The current linear solve already refused the moment.

The supplied-result APIs now apply the current linear solver's stability and load checks to every submitted case before evaluating its certificate. A refused case returns an uncertified status with the solver's reason and prevents dependent combinations and envelopes from receiving a bound. A compatible case in the same batch can still be certified. The direct solve-and-certify APIs and bundle exporters already obtain their cases from a successful current solve. Their analysis values and certificate calculation are unchanged.

This change applies to the native single-result, batch and combination certificate APIs for 2D and 3D. It concerns certification status and bounds for supplied results.

The registry entry requires the native supplied-certificate context. Saved web projects and certified WASM exports use solve-and-certify entry points, so a saved project does not receive this notice.
