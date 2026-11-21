# Spatial member loads on reversal and planar projection

Issues [#2268](https://github.com/lambdaclass/stabileo/issues/2268) and [#2411](https://github.com/lambdaclass/stabileo/issues/2411).

Reversing a member exchanges its ends and reverses its local axial direction. The member editor previously left both axial distributed load fields as entered, which reversed the applied force and misplaced the ordinates of a varying load. It also treated global and projected transverse ordinates as local axes. Both reversal commands now swap all three pairs of ordinates and the loaded interval. For local loads they apply the signs of the reversed axes. Global and projected loads retain their directions.

The 3D load adapter previously skipped legacy planar point loads when the member projection was below its existing limit. It now identifies and refuses loads it cannot place without the projection. A pure couple with an unambiguous magnitude at the member start can be [applied directly at the start node](2026-11-planar-start-couples.md). The supported model input for that geometry is a 3D member point load with an explicit force or moment direction.

## Before and after

- In the cantilever regression for #2268, the original fixed axial reaction was −8 kN for a constant profile and −14 kN for a varying profile. On the parent, the reversed description returned +8 kN and +14 kN. With the shared reversal rule, both descriptions return −8 kN and −14 kN respectively. Partial-span checks also verify the axial forces at corresponding ends and the ordinates and bounds of the recovered profile.
- In the #2411 regression, a legacy planar couple of 5 kN·m on a member parallel to global Z gave zero fixed reaction moments on the parent. This also occurred in a converged P-Delta combination with an independently applied force. The adapter now refuses the planar record. A native 3D global-Z couple of the same magnitude on the same model returns a fixed Z moment of −5 kN·m in both linear and P-Delta analysis.

Review distributed loads on members reversed with older builds, including their original directions and endpoint profiles. Recreate any refused planar point loads in 3D using the intended force and moment directions. Rerun the affected analyses, combinations, and design checks after updating the loads.
