# Distributed couple and profile limits

Large-displacement (corotational) analysis now refuses a model containing any
nonzero distributed member couple or torque density. The reason is:
“distributed member couples are not supported in large-displacement analysis;
use linear or P-Delta”. This includes balanced distributions whose resultant is
zero, partial spans, all three local axes, and arbitrarily small nonzero samples.
The refusal runs in the common native solver called by WASM, before assembly
or recovery. The branch's distributed-couple rotation and recovery code is
removed. Explicit zero moments, ordinary forces and nodal moments remain
supported. Plane input already refuses member-couple fields at deserialization.

This supersedes the corotational distributed-couple support described in rounds
22 and 23. Linear and P-Delta retain distributed couples. Regenerate affected
loads when needed and rerun using one of these supported analyses; rerunning
large-displacement analysis now gives a refusal instead of a couple diagram.
Native tests use the minimal constant floor-strip couple equivalent; WASM tests
use the generated floor loads themselves and compare linear/P-Delta torsion
with the existing independent hand integration.

The shared linear gravity profile path now refuses any nonfinite endpoint
intensity or endpoint absolute intensity greater than 2^20 (1048576). The
bound is inclusive and applies before cancellation, including exact cancellation
of two otherwise unsupported pieces. Both floor and physical-region generation
pass through this guard. The 2^50 interpolation witness is refused.

At 2^20, binary64 spacing is 2^-32, compared with 1/4 at 2^50. This conservative
limit leaves fractional headroom for the tested half-unit cancellation residuals
and their dyadic interpolation. Stored endpoint samples are returned directly:
interpolation at t=1 must not subtract a large starting value and erase a small
ending value. Compensated summation and exact opposing-sign coalescing remain.
The limit is a supported numerical range, not a claim that arbitrary real
interpolation or arbitrarily small residuals are exactly representable in
binary64. Arbitrary-magnitude exactness remains #2262; no arbitrary-precision
profile engine is introduced here.

Regenerate floor and area loads, then rerun analyses and dependent checks.
The registry includes separate notices for the corotational refusal and profile
limit; earlier pending couple notices no longer advertise the removed support.
No assertion, tolerance or baseline is relaxed. No advisory is added.
