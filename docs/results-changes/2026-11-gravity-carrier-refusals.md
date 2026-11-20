## Full rigid links connect coincident shell seams through offset masters

The panel gravity planner could split a continuous offset shell deck at a seam whose duplicate nodes were fully tied through a common master away from the seam. At `0cbe6603b` the 12 × 6 m witness at 1 kN/m² applied 132 kN, including 60 kN on the overlapping beam bay as well as pressure on the shell deck. The plan returned READY with no blocking reason. Shell nodes within the existing physical point tolerance now share deck membership when they belong to the same full rigid-motion component, regardless of where intermediate nodes lie. The one-ULP elevation variant also applied 132 kN on `3408036b8` and now blocks. A deliberate gap outside the geometry tolerance keeps the two decks separate. The existing offset-deck refusal then blocks the duplicate load. The control with a free rotational degree of freedom still has two separate load paths. (#2347)

## Gravity generation refuses indeterminate carrier slopes

The gravity generator uses the inclination of a member to distinguish load carriers from steep members. Near that boundary, rounding in the member coordinates could change the decision after a rigid plan rotation or subdivision. The geodesic dome at `0cbe6603b` generated 2989.960478811607 kN of dead load with a unit dead pressure and a unit tributary width. Plan rotation generated 2979.406832435951 kN with the same inputs. The planner now refuses when the slope comparison falls within its coordinate roundoff bound. The dome blocks in the original, rotated, mirrored and subdivided models. Members clearly on either side of the boundary keep their existing load treatment. (#2254)

In the other reported complete-model remesh probes, Full Stadium and La Bombonera already refuse nonplanar shells on `origin/main`. The CAD arch structure matched its total dead load under the reported subdivision on that revision. These probes cover the report's transformed models. They do not establish the member-load accuracy of the full examples.

## Snow generation refuses positive drift transfer at roof steps

The snow planner's on-site step transfer can lose force and eccentric moment when converting a triangular snow drift to member loads. Raising only the far edge of the upper roof in the #2218 witness preserves the step height, plan fetches, balanced pressure on the receiver and theoretical drift triangle. The parent applied 2.953662765086338 kN and plan first moments of 0.5337317569576308 and 5.907325530172675 kN·m. The checked-in triangle oracle gives 3.049542288 kN and 1.549167482304 and 6.099084576 kN·m respectively.

Generation blocks when on-site step drift needs member transfer or when applicability cannot be established from the balanced-pressure field. The refusal covers both flat and pitched roofs and returns no snow cases or flat-roof companion. Below-threshold steps still produce balanced snow. The physical transfer remains open. (#2218)

The `snow-roof-step`, `snow-roof-rotation` and `snow-two-pitch` reference cases previously recorded generated snow loads. In PR #2406 all three record the step-drift transfer refusal as their sole result. The load snapshots now capture the same blocking reason reported by snow generation.

Regenerate gravity or snow in affected projects before relying on analysis and design results. Saved loads must be replaced explicitly if generation blocks.
