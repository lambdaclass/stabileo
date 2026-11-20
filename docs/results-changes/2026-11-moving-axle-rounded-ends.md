# Moving axles at rounded member ends

Planar and spatial moving-load sweeps resolve axle positions within the existing endpoint roundoff allowance to the physical member end before assembling the axle load. This keeps the in-member force envelope consistent when changing units or rotating the model. The sweep reads the stored terminal action and applies the exact endpoint jump to recover its in-member limit. Permanent member point loads retain their supplied coordinates, including positions immediately inside a member end.

Planar and spatial case envelopes report the member, force component and originating result when the diagram polynomial or its evaluation overflows. Both sides of a diagram jump have the same station coordinate. Canvas points carry the side so comparisons can request the matching WASM value.
