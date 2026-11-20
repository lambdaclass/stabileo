## Full rigid links connect coincident shell seams through offset masters

The panel gravity planner could split a continuous offset shell deck at a seam whose duplicate nodes were fully tied through a common master away from the seam. At `0cbe6603b` the 12 × 6 m witness at 1 kN/m² applied 132 kN, including 60 kN on the overlapping beam bay as well as pressure on the shell deck. The plan returned READY with no blocking reason. Coincident shell nodes now share deck membership when they belong to the same full rigid-motion component, regardless of where intermediate nodes lie. The existing offset-deck refusal then blocks the duplicate load. The control with a free rotational degree of freedom still has two separate load paths. (#2347)

## Gravity generation refuses indeterminate carrier slopes

The gravity generator uses the inclination of a member to distinguish load carriers from steep members. Near that boundary, rounding in the member coordinates could change the decision after a rigid plan rotation or subdivision. The geodesic dome at `0cbe6603b` generated 2989.960478811607 kN of dead load with a unit dead pressure and a unit tributary width. Plan rotation generated 2979.406832435951 kN with the same inputs. The planner now refuses when the slope comparison falls within its coordinate roundoff bound. The dome blocks in the original, rotated, mirrored and subdivided models. Members clearly on either side of the boundary keep their existing load treatment. (#2254)

In the other reported complete-model remesh probes, Full Stadium and La Bombonera already refuse nonplanar shells on `origin/main`. The CAD arch structure matched its total dead load under the reported subdivision on that revision. These probes cover the report's transformed models. They do not establish the member-load accuracy of the full examples.

## Snow generation refuses positive drift transfer between flat roof panels

The snow planner's member-load approximation can lose force and eccentric moment when transferring a triangular drift between adjoining flat roof panels. For the two 7.5 × 4 m model roofs in #2218, the checked-in triangle oracle gives 3.049542288 kN and the parent returned 2.953662765086338 kN for the drift alone. Generation now blocks when a positive drift between flat roof panels needs that transfer or when a varying balanced pressure leaves drift applicability unresolved. The blocking result contains no snow cases or flat-roof companion. Steps below the applicability threshold still produce balanced snow. This containment covers the flat step transfer in the reported models. A physical member-load transfer for the surcharge requires separate work. (#2218)

Regenerate gravity or snow in affected projects before relying on analysis and design results. Saved loads must be replaced explicitly if generation blocks.
