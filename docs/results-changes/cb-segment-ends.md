# Cb reads the moment at both ends of the unbraced segment (2026-11-08)

PR **#1718**. Results-change entry `cb-segment-ends`.

CIRSOC 301-2018 §F.1(3), Ec. F.1-1, is evaluated over the unbraced segment. When a member declares
an unbraced length shorter than its chain of elements, `steelSegmentDiagram` bounds the read to
a window of that length, and the window's ends generally fall between stations. The TypeScript
`momentGradient` read the curvature and Mmáx from the stations inside the window only. It
interpolated the quarter points but never the window's ends.

- **Missed double curvature.** A channel with stations (t, M) = (0, −100), (0.25, 100), (0.5, 0),
  (0.75, 0), (1, 0) read over [0.1, 0.9] starts at −20 kN·m and reaches +100 kN·m. §F.1(4)
  requires Cb = 1 in double curvature for a singly symmetric section. The old read reported
  single curvature and Cb = 2.55, so the lateral-torsional buckling capacity was overstated.
- **Missed maximum.** A larger moment at a window end was left out of Mmáx, which understated Cb.

The engine (`engine/src/postprocess/cirsoc301_inputs.rs`) now adds the interpolated moment at
both window ends to the curvature and Mmáx reads. Members whose unbraced segment is the whole
member or chain, and windows whose ends land on stations, give bit-identical numbers.
The parity sweep `moment-gradient-parity.test.ts` checks this: 37 029 of 38 760 inputs are
bit-identical, the 379 inputs where an end changed the read agree to 1e-12 with the old code
run on the stations plus the two interpolated ends, and the other 1 352 have fewer than three
stations in the window and give Cb = 1 on both sides.

**What to re-check:** CIRSOC 301 members with a declared Lb shorter than the member, mainly
channels and tees in double curvature.
