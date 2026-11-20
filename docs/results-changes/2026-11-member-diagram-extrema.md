# Member diagrams use load boundaries and analytic extrema

Issues #2226, #2250, #2252 and #2273 affected the recovery or reporting of forces between member ends. Issue #2238 affected which beam face was checked for bending.

## Analysis

On each interval with unchanged loading, axial force and shear are at most quadratic and bending moment is at most cubic. Candidates are the interval boundaries and the real interior roots of the derivative. Concentrated actions use the left value at equality and the right value for every later station. Diagram and envelope output can carry both values at the same coordinate. The drawing grid supplies additional points for display.

ABS combinations split at component zeroes and take the extrema of the signed sum on each resulting interval. SRSS combinations take the extrema of the sum of squares before applying its square root. These rules handle combinations whose governing position differs from every constituent's peak. For a nested magnitude expression without polynomial constituents, the diagram identifies the sum of the constituent maximum magnitudes as an upper bound. Design station extraction refuses such a bound as a concurrent force tuple.

The 100 m cantilever with a linear load from +1 to −1 over [1, 2] has a peak shear magnitude of 0.25 at 1.5, the area of the first half of the triangular load. The planar and spatial drawing grids and the spatial envelope previously missed it. The ABS witness with two offset parabolas has a combined peak of 1.89875 at normalized station 0.435. The SRSS witness with parabola peaks at 4.2 and 5.2 has a peak of √2 × (25 − 0.5²) at 4.7.

## Design

Member design includes force tuples at the governing component stations and retains both sides of jumps. A beam span uses a single upright section frame along its chord. Pieces that run the other way are transformed to the same frame, including reversal of the section-cut direction. Incompatible section axes block span design.

The fixed-ended three-piece beam in #2238 has support moments of −qL²/12 and a midspan moment of +qL²/24 under the issue's uniform downward load. Both signs are recovered with forward, mixed or reversed pieces, so the support demand stays on the top face.

The affected corpus snapshots now include additional moment envelope stations. The PRO mat foundation's global My envelope magnitude rises from 46.79134405 to 46.79259896. Member 50's My envelope and governing magnitude both give 16.89871716. The steel portal and tower snapshots also reflect changes in checks that use the added moment stations.
