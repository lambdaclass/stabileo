# Moving axles at cumulative path joints

[#2101](https://github.com/lambdaclass/stabileo/issues/2101) and [#2104](https://github.com/lambdaclass/stabileo/issues/2104) reported warning-free shear errors in moving-load envelopes for a rotated beam with an inclined support and a mirrored beam with a tip spring.

At a sampled train position, subtracting a cumulative path distance before classifying the axle could create an unintended open interval between the axle and a joint. The interval carried a different shear from the adjacent span by the full axle force. The engine now classifies the joint using the two cumulative coordinates before forming a local member distance. It uses eight machine epsilons at the cumulative joint scale. If the two ends of a path member cannot be distinguished at that resolution, the sweep refuses the path.

Each sweep computes the reference position from its integer sample index. The joint test also accounts for the scale of the reference and axle-offset arithmetic when cancellation leaves a station near zero. A reversed interior station uses the member length minus the distance from the route entry to the axle on that member. This preserves coincidence with an opposing point load specified at the same local distance. Generated vehicle cases use the same browser sample grid and keep full sample precision.

For a 100 kN axle sampled every 0.25 m on a simply supported 10 m beam, the governing interior shear is 97.5 kN. The first interior sample gives a reaction of 100 × (10 − 0.25) / 10 by moment equilibrium. A sample directly over a simple support transfers the full axle weight into the support and produces zero beam shear.

The browser uses the same classifier for its planar and spatial sweeps and when generating vehicle position cases. An axle resolved to a joint becomes a nodal load in a saved position case, so subsequent analyses retain the joint identity. Permanent member loads keep their specified stations.

The native regressions compare both stored nightly models with independent cantilever compatibility and equilibrium at cuts within each open axle interval. They cover the prepared and constrained solvers. The browser regressions cover both WASM sweep exports, the planar synchronous and asynchronous sweeps, the spatial sweep, and applying an imported vehicle at the governing joint.

Re-run affected sweeps and regenerate saved vehicle position cases before using the resulting force extrema.
