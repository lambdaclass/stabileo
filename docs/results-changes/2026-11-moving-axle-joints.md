# Moving axles at cumulative path joints

[#2101](https://github.com/lambdaclass/stabileo/issues/2101) and [#2104](https://github.com/lambdaclass/stabileo/issues/2104) reported warning-free shear errors in moving-load envelopes for a rotated beam with an inclined support and a mirrored beam with a tip spring.

At a sampled train position, subtracting a cumulative path distance before classifying the axle could create an unintended open interval between the axle and a joint. The interval carried a different shear from the adjacent span by the full axle force, and a rotation or reflection could determine which member received it. The engine now classifies the joint in cumulative path coordinates before forming a local member distance. It uses eight machine epsilons at the cumulative joint scale. If the two ends of a path member cannot be distinguished at that resolution, the sweep refuses the path.

Each sweep computes the reference position from its integer sample index. The joint test also accounts for the scale of the reference and axle-offset arithmetic when cancellation leaves a station near zero. A reversed interior station uses the member length minus the distance from the route entry to the axle on that member. This preserves coincidence with an opposing point load specified at the same local distance. Generated vehicle cases use the same browser sample grid and keep full sample precision.

The envelope includes the member-face limits for the train immediately before and immediately after a sampled joint. A connected joint takes the same nodal load in both limits. Force equilibrium at the cut adds the local axle force jump to the member face on the corresponding side. If an axle enters or leaves the route at the same sample, only the limit where it lies on the route includes it. The exact sampled position still includes the nodal loads at both endpoints. The sweep evaluates these limits at sampled joints and uses the specified grid for interior positions.

A simply supported span carrying a single 100 kN axle has a shear envelope of magnitude 100 kN at each support face. The axle directly above a support produces a 100 kN reaction and zero member shear at the exact position. As the axle approaches from inside the span, the shear in the short interval between the support and the axle tends to the axle weight. This follows from vertical force and moment equilibrium. The same force jump applies on either member adjoining an internal path joint. Native sweeps also include the corresponding axial face limits for inclined members.

The browser uses the same classifier for its planar and spatial sweeps and when generating vehicle position cases. An axle resolved to a joint becomes a nodal load in a saved position case, so subsequent analyses retain the joint identity. Permanent member loads keep their specified stations.

The native regressions compare both stored nightly models with independent cantilever compatibility and equilibrium at cuts within each open axle interval and on both joint faces. They cover the prepared and constrained solvers. The browser regressions cover both WASM sweep exports, the planar synchronous and asynchronous sweeps, the spatial sweep, and applying an imported vehicle at the governing joint.

Re-run affected sweeps and regenerate saved vehicle position cases before using the resulting force extrema.
