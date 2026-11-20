# Full shear magnitudes on section stress cuts

Detailed biaxial section stress reports a depth cut at `z = 0` and a width cut at `y = 0`. Each cut plots one transverse shear component. The previous calculation also discarded the other component from the total shear and von Mises diagnostics.

On `32ca94087`, a circular hollow section with outer radius 0.100 m and wall thickness 0.001 m, under `Vz = 1` kN alone, reports zero total shear and zero von Mises at the midpoint of the width cut. At the same coordinate the selected fibre reports 3.231245 MPa shear and 5.596681 MPa von Mises. The [#2372](https://github.com/lambdaclass/stabileo/pull/2372) regression tests replay this case through the native and WASM APIs.

The two cuts now calculate total shear and von Mises from the full stress state at each sample. The plotted component remains specific to the cut. Where torsional and transverse shear coincide, the cut continues to return the [combined-shear refusal](2026-11-combined-section-shear-refusal.md).

This affects detailed member stress queries in spatial frames and in planar frames that use the biaxial section stress path for rotated sections or eccentric loads. It also applies to queries on previously solved member forces. Review prior assessments that used total shear or von Mises from these cuts.
