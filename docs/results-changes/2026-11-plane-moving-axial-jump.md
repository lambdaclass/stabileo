# Concentrated axial actions in plane moving loads and influence lines

Issue [#2375](https://github.com/lambdaclass/stabileo/issues/2375) affects plane frame members in the web moving-load and influence tools. A vertical cantilever with a downward 1 kN axle at midspan reported about −0.5 kN on both sides of the axle. Equilibrium gives −1 kN from the support to the axle and zero from the axle to the tip.

The plane moving-load helper formerly distributed the axial component of a point force between the two ends of a frame member. This gave equivalent joint forces but did not supply the interior load needed to recover the axial force jump. A rightward unit load moving along a horizontal cantilever gave ordinates of 0.25 and 0.75 at load positions one-quarter and three-quarters of the way along, for a section at midspan. Equilibrium gives zero before that section and one after it.

The moving-load and influence tools share the helper that now puts both components of the concentrated force at the actual load position in the existing solver input. The native force recovery already includes the jump for that input. Truss loads still use their existing nodal placement.

With both ends restrained, a rightward 1 kN point load approaching midspan from each side gives midspan ordinates of −0.5 and +0.5. The end-node load model returned zero for both, so the influence envelope omitted both extremes.
