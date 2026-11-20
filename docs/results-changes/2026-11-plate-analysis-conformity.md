# Invalid plates and nonconforming wall–slab meshes

PRO refuses analysis when a physical plate has an invalid definition or missing mesh cells. It names the plate so the user can repair the definition or mesh and solve again. The mesh generator also refuses incomplete outlines and holes before creating any elements. Existing meshes created from partial input should be checked against their intended boundaries and openings.

On the previous production path, issue #2368's supported slab carried a uniform 1 kN/m² load over 4 × 4 m. After a corner edit made the second plate, “missing floor,” invalid, preparation reported success with zero plates meshed. The solver returned the loaded slab's 16 kN vertical reaction and omitted the invalid plate. The same model now refuses before producing results and names “missing floor.”

A wall node inside a slab element edge is a separate degree of freedom unless the mesh or a suitable constraint couples it to the slab. PRO now checks shell edges in both directions and refuses a wall–slab junction with an interior node missing from the other mesh. It identifies the plates by name where available and by shell identifier on an ungrouped mesh.

The seven-storey gallery example, `pro-edificio-7p`, previously used 77 quads. Node 121 lay at 5/12 of slab edge (13, 14). Node 130 lay at 5/12 of (58, 59). Those wall nodes had no vertical displacement compatibility with the slab edge despite the floor diaphragms. Comparing the wall's vertical displacement with interpolation from the old slab edge gives gaps of −0.189385 mm at node 121 and +0.262410 mm at node 130.

The revised gallery mesh replaces the core-adjacent slab quad on each storey with three quads through the existing wall stations. It shares the wall node IDs with the slab, retains the in-plane diaphragms, and removes the 21 rigid links that previously attached those wall stations to floor corners. The resulting mesh has 91 quads and retains the previous area loads and self-weight. Both WASM solves applied −15,579.25 kN of vertical load and produced +15,579.25 kN of vertical reaction to the precision shown.

| Node | Previous vertical displacement (mm) | Revised vertical displacement (mm) |
| --- | ---: | ---: |
| 121 | −0.682413 | −0.777763 |
| 130 | −0.979471 | −1.170607 |

The old edge interpolation is inapplicable after the subdivision. The revised slab and wall share one vertical displacement at each of these nodes. The comparison used standalone linear WASM with the gallery's self-weight setting. Wall design demand changes were not measured.

The check also refuses the existing `cad-arch-only-dxf` fixture. Its slab node 266 lies halfway along the unsplit wall quad q601 edge (2, 13). The previous linear WASM solve gave a vertical displacement gap of −0.250627 mm between the slab node and the interpolated wall edge. That fixture needs a conforming remesh before analysis.

For projects saved from the previous example, reload the example or remesh the junctions with shared vertices before rerunning analysis and design. The registry flags older results when the stored model has an invalid plate or a nonconforming junction.
