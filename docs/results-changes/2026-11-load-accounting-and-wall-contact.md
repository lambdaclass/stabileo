# Load accounting and wall–slab contact

## Wall edges inside slab faces

A wall edge can run through a slab cell even when the wall and slab share some node IDs. Those isolated connections do not establish a shared mesh edge. Analysis now checks for this contact and shows the wall, slab and wall edge. Subdivide the slab along the wall trace and share the junction edges before solving.

In the #2430 witness, a frame connected the wall base to a fixed slab node. The previous application solve reported 16 kN of vertical support reactions from the slab’s uniform 1 kN/m² pressure on a 4 × 4 m slab. Both wall bases carried zero vertical reaction. The previous application also solved the #2429 oblique CAD wall in both fixed-division and target-size meshing and reported 16 kN despite the missing shared edges. Both models now stop with a wall–slab message before returning structural results. Conforming junctions and the separately supported control beyond the contact limit continue to solve.

## Per-member line-load accounting

The case-wide force and moment can both be zero for an axial load that reverses sign along a member. A 2 m span with endpoint intensities of +2 and −2 kN/m has zero net force and a signed station first moment of −4/3 kN·m. Dropping that load on the previous application path could pass the case balance and remove the member’s axial response.

The solve input check now compares each member’s distributed-force components and their station first moments alongside the case wrench. This covers planar projection, spatial assembly and factored spatial combinations. The refusal identifies the load case, member and component. A correct distribution continues to give the same numerical result.
