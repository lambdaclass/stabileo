# Concrete reinforcement detailing

## Shear resistance at beam bar ends

Regenerate beam detailing before relying on a previous cutoff or stirrup schedule. The assembly used the largest shear demand anywhere on the beam as its resistance. Doubling a remote demand could relax a local cutoff while leaving the concrete and reinforcement unchanged. The sheet and assembly evaluate the larger absolute shear bracketing the cut. The assembly now queries the CIRSOC section kernel with the reinforcement at the cut, the least compressive bracketing axial force and the smaller resistance from the two faces. It withholds the cutoff when local resistance cannot be established. The double-area provision requires evidence of the required steel area, which the assembly generator does not have.

In the one-bay regression the right top cut lies at 4.668 m. Its bracketing absolute shears are 70 and 105 kN. The Ø20 bottom bars govern the depth bound. With 25 mm cover, an Ø8 stirrup and a 20 mm bend centreline radius, the effective depth is 600 − 25 − 4 − [20 − (20 − 14)/√2] = 555.243 mm. The section has zero axial load. Under CIRSOC 201-2025 Table 22.5.5.1, the concrete contributes 0.17√25 × 300 × 555.243 / 1000 = 141.587 kN. Two 50.3 mm² legs at 150 mm add 2 × 50.3 × 420 × 555.243 / (150 × 1000) = 156.401 kN. Two thirds of the design resistance is 148.994 kN, displayed as 149.0 kN. Both 105 kN at the top cut and 140 kN at the bottom cut meet that limit. The old integration trace reported 93.3 or 186.7 kN according to the remote demand.

If an automatically calculated bottom-bar cutoff reaches either support face, the detailer now continues those bars into the supports and applies the existing end anchorage and coordination checks. A manually placed cutoff still requires evidence of adequate resistance where the bar actually ends.

## Commercial stock for spliced bars

Regenerate the schedule and workbook for marks longer than a commercial stock bar. Each mark now reports the purchased lengths needed for its cutting length and declared pieces, together with the unused length and a translated splice note.

A single 14 m mark exceeds 12 m stock. The old row counted one stock bar and zero offcut. The corrected row counts two, with 24 − 14 = 10 m left against the scheduled length. A mark with two occurrences, a scheduled cutting length of 20 m each and three specified pieces per occurrence counts six stock lengths and 72 − 40 = 32 m of offcut. Its quantity remains two. Where the mark still needs a splice, its note identifies the unresolved detail. A lap must be designed and included in the cutting length before ordering.

The assembly repeats the cutoff check after locked bar substitution, lap materialisation and collision repair. The final longitudinal geometry supplies the effective depth and area. Each required bounding stirrup set must exist with the checked geometry and diameter before its spacing and leg area can support the result. Replacing only the tie immediately before the 5.277 m cut with a smaller one withholds that cut's classification. Keeping the original tie preserves the checked result.

A through bar formed across one or more joints now carries the identities of its original bars into cutoff verification. The verifier had rejected a preserved end because the through bar had a new identifier. It still checks the actual end station, diameter, local capacity and placed stirrups. An end that moved or lost its reinforcement remains unverified.
