### BREAKING (results)
#### Basic 2D plastic collapse is released at the certified limit-analysis factor (2026-11-10)

2D plastic collapse was withheld (`PL-2D-INVARIANCE`, SA-2026-044, #758). Basic now shows the collapse factor of the engine's limit analysis, confirmed where the exact plastic certificate's static and kinematic bounds meet at it. Basic withholds the numerical trace when the certificate declines the factor. A hinge that moves retains its formation coordinate in the original step. A history that ends outside the certificate’s numerical agreement range is marked approximate. The kinematic and static step-by-step methods apply again where the factor is released. "Portal Frame": 1925/27 = 71.296. See [the results change](../docs/results-changes/2026-11-basic-advisories-and-plastic.md).

The exact limit check also retains the #2608 planar truss mechanism when joint equilibrium fixes the force in the member that yields.

A diagonal truss can now receive its equilibrium-proven axial collapse factor when the exact value has an irrational square root.
