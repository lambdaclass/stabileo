# Moving-axle force limits at inward member ends

Results-change entry `moving-axle-inward-rows` for PR #2581.

The planar moving-load adapter could put a recovered axle shear or axial
force limit on the exterior row when a member end had two ordinates.
Member-end reads use the inward row, so they could omit the governing limit.
The adapter and member-end reader now select the same row at each end,
using the right face at I and the left face at J.

The regression uses a fixed-ended inclined member with a stationary point
force at each end and a single downward moving axle. The end restraints carry
the exact endpoint loads. In the limit as the axle approaches either support
from within the span, its entire local force projection crosses the cut
adjacent to the support. Both browser sweep entry points test the signed
limits at each end and the stationary values on the exterior rows.

This affects paired endpoint rows supplied to the planar browser sweep
adapter on the branch. The checked-in WASM producer emits a single inward
row per member end, and the browser sweep solves the train alone. The
regression supplies the paired rows at the adapter boundary.
