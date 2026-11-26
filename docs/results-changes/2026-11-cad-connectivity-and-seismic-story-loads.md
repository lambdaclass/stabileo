# CAD connectivity, seismic story loads and shell contact

## Preserve CAD connections in conforming slab drafts

A conforming slab could change the snap tolerance of every floor-range join, leaving a column discontinuous even when the two column endpoints were within the specified tolerance. The slab mesh could also follow the drawn beam line after its endpoints had snapped to different coordinates. A wall run with a conforming slab station used the tight mesh tolerance at its other joints, where it could miss the frame.

Draft generation now matches adjacent ranges one to one at their interface, using the configured snap tolerance and keeping the vertices within each range distinct. The slab mesh follows the welded beam endpoints and shares its stations with the beam. Only conforming wall stations use the tight mesh tolerance. Regenerate affected CAD drafts and rerun the analysis to recover the intended load paths.

## Keep crossed columns loaded at story elevation

A four-way crossing could put the active story's column inertia on the upper column segment as a distributed action. This preserved base shear but reduced overturning. In the regression model, a 4 kN horizontal action belongs at the 4 m story and produces 16 kN·m. Distributing it over the upper 2 m placed the resultant at 3 m and produced 12 kN·m.

Vertical continuations keep their story loads. Inclined braces with evidenced endpoints retain their distributed actions. Regenerate affected automatic seismic loads and rerun the analysis.

## Check wall corners inside slab faces

A wall corner could touch the interior of a slab cell with no shared node and a zero-length intersection. A loaded slab with other supports could then solve through those supports while the wall received no pressure reaction. Spatial preflight now reports the incompatible vertex and asks for a mesh with shared nodes.

Cells that meet at a shared edge or corner proceed when a plane through that boundary separates all their other corners. This restores analysis of the full-stadium gallery model, whose warped shell cells have compatible boundaries.
