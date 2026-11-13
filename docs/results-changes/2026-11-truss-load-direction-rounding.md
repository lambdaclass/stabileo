# Truss load direction rounding (2026-11-13)

Review #2074, round seven. Registry entry `truss-load-direction-rounding`.

The released-load branch bounded multiplication and summation in 2D truss
member loads and 3D axial distributed and thermal truss loads, but omitted
the physical direction/frame uncertainty already carried by frame and 3D
transverse load transforms. A compatible transformed component could then
be refused because its certificate was too small. This omission concerns
the unmerged released-load certificate; no silent wrong result on main or
a release is established by these tests.

Every truss/cable load variant now forms local end components and sends them
through one dimension-independent bounded transform. That transform owns
the frame-rounding calculation and accumulates products, local amplitude
uncertainty and summation residuals together. No scalar product-only truss
assembly route remains. Mixed axial/transverse 2D point loads are transformed
together; their final binary rounding can change. Axial and thermal 3D
loads now use the same normalized local axis as transverse member loads,
which can also change final binary rounding. This is the same
compatibility certificate used by the released-work gate, not an interval
certificate for the complete structural response or input properties.

Tests cover each omitted load variant, both bar ends and both element types,
with exact rational component enclosures. For each calculated bound the
released-work checker admits zero, the bound and its preceding represented
value, and refuses the next represented value beyond it for either sign.
The boundary checker receives actual bounds from load assembly; its scalar
free-direction projection isolates the certificate independently of stiffness.
Native and WASM public entry controls exercise loaded 2D and 3D bars, linear
and nonlinear solves, and signed nonzero nodal moments at both ends. Correct
loaded models must still complete. Thermal static controls also retain a
nodal axial load so their internal force is observable; the existing nonzero
force assertion is unchanged. Corotational analysis retains its exact
thermal-feature refusal in both dimensions. Harmonic controls cover each
load variant and signed unsupported moments in native and WASM.
No tolerance or frozen baseline changes.

The WASM checker also requires both native and WASM P-Delta convergence for
admitted cases. Matching non-convergence cannot bypass the exact unresolved
identity registry. That registry is unchanged.

Re-run models with truss or cable member loads. The notice is restricted to
loads actually applied to those elements; an unloaded bar beside a loaded
frame does not match.
