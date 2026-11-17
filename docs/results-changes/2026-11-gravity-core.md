# Gravity coverage and combined peaks

## Partial shell coverage on beam panels

Main sampled a global plan grid for shell coverage and multiplied each beam's original load by the same uncovered fraction. A 10 × 6 m bay with 4.76 m of shell coverage reported 58.56 kN under a 1 kPa load. The expected load is 60 kN. At 5 m of coverage main transferred the beam share at the wrong stations. The first moment in the width direction was 225 kN·m instead of 300 kN·m.

The planner subtracts shell footprints from the panel in the carriers' local coordinates. On a rectangular panel where the remainder consists of full-span strips in one direction, each strip bears on its two opposite carriers. Each gets a line reaction equal to half the strip span times the pressure. The line load starts and ends at the strip boundaries and follows collinear carrier subdivisions. Plans with unsupported partial coverage or nonplanar shells are blocked. One-way loading requires the specified span direction to align with the uncovered strip span. Automatic deck selection checks the actual distance between its carriers and checks clearance over the uncovered strip. A strip with clearance below the storey threshold or unresolved low cover stops the plan before it emits loads or level mass. The explicit option to load every panel overrides automatic deck selection.

A shell can subtract a beam panel's area when its surface lies within the panel level's elevation band. A connected sloped shell roof can carry a whole eave ring when it shares the ring's corners at eave elevation and covers its complete footprint. An unrelated shell near the same spring level can stop the plan even if its plan projection matches the bay.

A descending lean-to can share the main roof's eave nodes. Shell coverage is checked at each beam bay using the attached eave nodes and the footprint of the connected roof faces at or above the bay's elevation band. A lower face with positive projected overlap into the candidate bay blocks the plan. A lower face that shares only the bay edge can carry its own roof area. In the 10 × 10 m gable witness with a 4 m lean-to, the old plan reported about 497.869 kN of superimposed dead load at a fixture pressure of 2 kPa. The shells carry about 297.869 kN and the eave ring carries zero area load. The corrected level weights use that same 297.869 kN total.

The planner checks each uncovered strip against higher shells and the areas of higher beam panels accepted by deck selection. A bare upper ring rejected for exceeding the deck span leaves the strip exposed. If the same ring is explicitly loaded as a panel, its area covers the strip. A uniformly exposed strip receives roof pressures and a uniformly covered strip receives floor pressures. Mixed exposure within the uncovered part of a bay blocks load generation. In a 10 × 6 m bay with a 6 m shell band and an upper deck ending at the band, the exposed 4 m strip takes roof dead load of 2 kPa in the witness. Its two opposite beams each take 6 kN/m over that strip, and each short beam takes zero. Extending the upper deck slightly into the strip produces a refusal. The elevation and exposure checks apply with the automatic deck selection override.

For the witness, each long beam takes 3 kN/m over the uncovered range and both short beams take zero. The shell load is 1 kPa on its own area. The same member profiles and cantilever responses hold after plan rotation, reflection, shell remeshing and beam subdivision. Regenerate panel-mode plans that use shells and rerun analyses and dependent checks. A stored derivation that records partial shell coverage triggers the regeneration notice even if the saved plan contains only member loads. This covers #2199 and #2200.

## Width-mode level mass follows loaded carriers

In the #2269 witness, two 10 m carriers with tributary width of 3 m receive dead and live line intensities of 3 and 6 kN/m. Main reported 30 m² and total weight 95 kN at 3 m carrier separation. The loaded plan area is 60 m² and the total level weight is 140 kN. Changing the separation leaves the line loads and their mass unchanged. In #2210, rotating a 10 × 6 m perimeter distorted the level area. With a 1 m tributary width, the correct area is the 32 m sum of beam lengths times the width.

Level area and mass now consume the same carrier areas as gravity generation. Width-mode dead load uses member length and live load uses horizontal projection. Regenerate width-mode gravity and seismic actions, then rerun analyses and dependent checks. This includes legacy width-mode plans with seismic actions and zero member gravity loads. In the zero-width witness, earlier plans added 45 kN of area-based seismic weight despite generating no gravity line loads. The corrected seismic weight is the 50 kN of member self-weight.

## Eccentric floor-load zones are refused

The #2201 zone occupies x = 0 to 1 m across the full 6 m depth of a 10 × 6 m bay. At 1 kPa, its vertical force is 6 kN and its first moment about the y axis has magnitude 3 kN·m. Main's member loads had a first moment of about 0.667 kN·m. The old projection dropped the offset between the load and each carrier.

A two-way zone uses a carrier's sectional transverse moment to verify that its distributed force can act on the axis. A centred one-way zone uses equal line reactions from simply supported strips. When the required eccentric loading cannot be represented by the available distributed force, the entire floor-load definition is refused. The member-load compiler refuses input with both a zone and shell footprints before evaluating either input. Shell-based floor zones continue to act on the shell surface. Preview and revise affected definitions before solving again.

## Combined member diagram extrema

Main sampled combined 3D member diagrams on a fixed grid. For the #2273 witness curves \(1-(t-0.21)^2\) and \(1-(t-0.66)^2\), the exact ABS peak is 1.89875 at \(t=0.435\). Main reported 1.8983. The combination diagram now uses the component polynomials between distributed load, point load and member piece boundaries. ABS splits at sign changes and SRSS finds stationary points of the sum of squares. Both one-sided values are reported at jumps.

Recompute ABS and SRSS 3D member diagrams and any checks that used their peaks.
