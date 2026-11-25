# Member extrema from load intervals

The planar moving-load envelope uses each solved position's load boundaries, jump faces and stationary points. The spatial moving-load sweep folds the right-hand limit at I, the left-hand limit at J and both faces of each interior jump. An axle that matches a stored path endpoint is applied at the corresponding member end even if subtracting cumulative distances would produce an interior coordinate. The sweep still evaluates the requested discrete train positions.

The planar overlay scale and calculation report tables use the extrema of the same piecewise diagrams. A partial line load that changes from +128 to −128 over a length of 1/32 has zero resultant and a shear peak of 1 halfway through the patch. An overlay grid and the former moving-load station grid reported zero for that patch. Both the planar and spatial report regressions use a shorter patch with the same integrated peak.

The point-query and diagram paths use the same stationary-point candidates, including boundary alias checks. They refuse when a distinct extremum rounds onto a boundary with a different ordinate. Compensated accumulation retains smaller actions when large actions cancel. In the unit-span moment example in #2437, the opposite uniform loads cancel and the remaining moment is (t(1-t)/2), with peak (1/8) at midspan. A spatial piece keeps its physical cut locations when rebased onto the parent member.

Rerun moving-load analyses and review member extrema in reports and saved diagrams for the affected models. See #2226, #2437 and the path endpoint follow-up on #1782.
