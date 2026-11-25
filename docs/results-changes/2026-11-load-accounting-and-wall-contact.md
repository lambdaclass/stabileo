# Load accounting and wall–slab contact

## Wall–slab mesh contact

A wall edge can run through a slab cell even when the wall and slab share some node IDs. Those isolated connections do not establish a shared mesh edge. Analysis now checks for this contact and shows the wall, slab and wall edge. An edge that pierces the slab interior triggers the same refusal even when both endpoints are away from the slab plane. Subdivide the wall and slab along the intersection and share the junction edges before solving.

In the #2430 witness, a frame connected the wall base to a fixed slab node. The previous application solve reported 16 kN of vertical support reactions from the slab’s uniform 1 kN/m² pressure on a 4 × 4 m slab. Both wall bases carried zero vertical reaction. The previous application also solved the #2429 oblique CAD wall in both fixed-division and target-size meshing and reported 16 kN despite the missing shared edges. Extending the #2430 wall above the slab placed both of its vertical edges through the slab face. The previous application still returned the slab result with zero vertical reaction at the two wall bases. These models now stop with a wall–slab message before returning structural results. Conforming junctions and the separately supported control beyond the contact limit continue to solve.

A wall piercing the common edge of two slab cells also stops before solving if the crossing has no shared mesh connection. The preflight clips the full wall-face intersection against the slab cell. It detects crossings immediately inside the perimeter and a face cut between two shared corners when the mesh lacks the intervening edge. A sloping wall top inside the contact band also stops analysis. Conforming inclined walls and a wall with a fully shared diagonal edge continue to solve.

## Per-member line-load accounting

The case-wide force and moment can both be zero for an axial load that reverses sign along a member. A 2 m span with endpoint intensities of +2 and −2 kN/m has zero net force and a signed station first moment of −4/3 kN·m. Dropping that load on the previous application path could pass the case balance and remove the member’s axial response.

The solve input check now compares each member’s distributed-force components and their station first moments alongside the case wrench. This covers planar projection, spatial assembly and factored spatial combinations. The refusal identifies the load case, member and component. A correct distribution continues to give the same numerical result.

When a variable section or an interior point load divides a member into temporary pieces, the planar and spatial load checks measure both the entered and assembled loads from the original member’s start. The check carries the magnitudes of the terms in each basis conversion through the comparison. Skew members, variable members and planar models embedded for workbook export retain their valid results.

A distributed load transferred to a truss must reach its designated end nodes. Analysis refuses a misplaced end force even when the total force and torque agree. The case wrench still checks both the anchor loads and the equivalent distributed load of a tendon. The external member line-load measure counts the applied line loads, so an internally equilibrated tendon and gravity can share a case.

The same distinction applies when a curved tendon’s equivalent line load is moved to the member ends. Those forces remain in the case wrench, including in factored combinations. The member line-load measure records only external loads.
