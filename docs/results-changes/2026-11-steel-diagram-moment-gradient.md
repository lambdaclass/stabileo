# Steel design uses equilibrium moments for bending and Cb

PR #2403 restores smooth off-grid bending extrema to the steel demand and limits the sampled uniform-load bending grid to concrete. Compact and grouped transfers use the same material-family decision. Both retain the specified stations, load boundaries and available section limits.

The steel check and profile search read the two ends and three quarter points of each known unbraced segment directly from the solved strong-axis diagram. The peak comes from the diagram extrema and the segment ends. For a chain, every point is read on its own oriented element. The segment ends use the in-segment limits. At an interior quarter point with two different limits, both contribute to the extrema and the larger magnitude enters the denominator of CIRSOC 301 F.1-1. The capacity and interaction equations are the existing engine checks. A partially analytic solved chain receives no moment-gradient credit. The cantilever and unknown brace-location provisions continue to apply.

For the tower under combination 2, the uniform-load equilibrium parabola on member 12 peaks at normalized station 0.5522741877 with 0.3494658390 kN·m. The 11-station grid gives 0.3460113530 kN·m at 0.6. Members 10, 14 and 16 have the same missed-peak mechanism. In the portal, member 7 under combination 3 has an absolute strong-axis peak of 1.2480811373 kN·m at 0.5636033062. The 11-station grid gives 1.2411928088 kN·m at 0.6. Using the exact peak and interpolated quarter-point moments gave Cb 1.167502602. The equilibrium quarter-point moments with the same peak give 1.160727489. The governing portal check consequently reports a higher utilization. These comparisons use the solved near-end moment, near-end shear and uniform load in the member equilibrium equation, evaluated independently of the production station reader.

The three steel design corpus cases regenerate with the corrected inputs. Changes in flexural strengths, interaction ratios, verdict output and governing provenance follow from the updated demands and Cb. Concrete design results from the same corpus pass their existing snapshots.

## Three-member shed calculation report

Only the rafter, member 3, changes in the shed report. Under Gravity + wind, the independent equilibrium diagram gives absolute quarter-point moments of 18.938184693543, 33.815941520942 and 14.943698348341 kN·m. Interpolating from the regular stations gave 18.263184693543, 33.815941520942 and 14.268698348341 kN·m. The maximum absolute moment for this combination remains 37.678544824259 kN·m at the J end. The retained interior peaks are smaller than the end maxima in both wind combinations.

| Rafter quantity | Previous | Corrected |
| --- | ---: | ---: |
| Cb, rolled and welded inputs | 1.4400657106091217 | 1.4224512002974827 |
| F.2 nominal strong-axis strength Mn (kN·m) | 91.48798409419204 | 90.36892679885753 |
| F.2 design strong-axis strength φMn (kN·m) | 82.33918568477284 | 81.33203411897178 |
| F.2 strong-axis utilization | 0.45760162079459615 | 0.46326819724124224 |
| H.1.1b utilization, also reported for rolled, welded and top-flange cases | 0.48818057168764645 | 0.49384714813429254 |
| Certified utilization lower bound | 0.488180571687645 | 0.493847148134291 |
| Certified utilization upper bound | 0.48818057168764784 | 0.493847148134294 |

The independent check integrates the uniform load from the solved near-end shear and moment, evaluates the ends and the stationary point, and applies F.1-1 to the equilibrium quarter points. Substituting that Cb into F.2.4b and H.1.1b reproduces the strengths and ratios. Gravity + wind still governs both passing check rows. The overall member verdict remains held under C.1 because the solve uses first-order moments. The calculation trace displays the updated rounded values.
