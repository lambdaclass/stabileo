# Invalid plates and nonconforming wall–slab meshes

PRO refuses analysis when a physical plate has an invalid definition or missing mesh cells. Direct and advanced analysis also refuse an out-of-date mesh even when the set of shell IDs and recorded cell count still match. The freshness check uses the current outline, holes, mesh settings and the geometry the mesh follows. The normal Solve action can remesh first when automatic meshing is enabled. It names the plate so the user can repair the definition or mesh and solve again. The mesh generator also refuses incomplete outlines and holes before creating any elements. Existing meshes created from partial input should be checked against their intended boundaries and openings.

On the previous production path, issue #2368's supported slab carried a uniform 1 kN/m² load over 4 × 4 m. After a corner edit made the second plate, “missing floor,” invalid, preparation reported success with zero plates meshed. The solver returned the loaded slab's 16 kN vertical reaction and omitted the invalid plate. The same model now refuses before producing results and names “missing floor.”

A wall node inside a slab element edge is a separate degree of freedom unless the mesh or a suitable constraint couples it to the slab. PRO now checks shell edges in both directions and refuses a wall–slab junction with an interior node missing from the other mesh. It also refuses overlapping wall and slab edges with coincident endpoints that have different node IDs. It identifies the plates by name where available and by shell identifier on an ungrouped mesh.

The seven-storey gallery example, `pro-edificio-7p`, previously used 77 quads. Node 121 lay at 5/12 of slab edge (13, 14). Node 130 lay at 5/12 of (58, 59). Those wall nodes had no vertical displacement compatibility with the slab edge despite the floor diaphragms. Comparing the wall's vertical displacement with interpolation from the old slab edge gives gaps of −0.189385 mm at node 121 and +0.262410 mm at node 130.

The revised gallery mesh replaces the core-adjacent slab quad on each storey with three quads through the existing wall stations. It shares the wall node IDs with the slab, retains the in-plane diaphragms, and removes the 21 rigid links that previously attached those wall stations to floor corners. The resulting mesh has 91 quads and retains the previous area loads and self-weight. Both WASM solves applied −15,579.25 kN of vertical load and produced +15,579.25 kN of vertical reaction to the precision shown.

| Node | Previous vertical displacement (mm) | Revised vertical displacement (mm) |
| --- | ---: | ---: |
| 121 | −0.682413 | −0.777763 |
| 130 | −0.979471 | −1.170607 |

The old edge interpolation is inapplicable after the subdivision. The revised slab and wall share one vertical displacement at each of these nodes. The comparison used standalone linear WASM with the gallery's self-weight setting. Wall design demand changes were not measured.

The architecture-only CAD gallery draft, `cad-arch-only-dxf`, had a slab node 266 halfway along the unsplit top edge of wall quad 601 between nodes 2 and 13. The draft now splits the six end-wall bays at slab and beam stations on each storey. The walls and slabs share those IDs, and six new fixed nodes preserve the fixed wall base edges. The 600 slab quads, explicit area loads, 1,000 frame members and load combinations are retained. The mesh now has 720 quads and 800 nodes.

In the standalone linear WASM comparison for the dead-load case, using the explicit slab loads and the gallery's self-weight setting, both versions produced a vertical reaction sum of 16,321.225965 kN. The previous displacement at node 266 differed from the old wall-edge interpolation by −0.127587 mm. At the revised junction, node 266 belongs to both the slab and the wall and has one common displacement.

| Result | Previous | Revised |
| --- | ---: | ---: |
| Node 266 vertical displacement (mm) | −0.215365 | −0.091816 |
| Minimum vertical displacement (mm) | −6.471232 | −6.351172 |
| Member 1 axial force (kN) | −79.681096 | −86.151047 |

For projects saved from the previous examples, reload the example or remesh the junctions with shared vertices before rerunning analysis and design. The registry flags older results when the stored model has an invalid or stale plate mesh or a nonconforming junction.
