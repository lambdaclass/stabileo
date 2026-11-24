# Active loads and per-component moment checks

The spatial solve excludes inactive members, their loads and loads on nodes connected only to inactive members. The load guard uses the same exclusions for the original load cases and generated case loads. Loads on the active structure still enter the comparison, including loads from a reference case.

Each moment component has its own roundoff reference. The reference sums the magnitudes of the two force-lever products and the applied couple that contribute to that axis, including after planar projection and case factoring. Analysis stops and names the component when the difference exceeds the existing 128 × machine-epsilon factor applied to that component's reference. An unrelated large moment can no longer mask a smaller discrepancy. The solver equations are unchanged.
