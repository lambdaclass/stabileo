# Invalid plates and nonconforming wall–slab meshes

PRO refuses analysis when a physical plate has an invalid definition or missing mesh cells. Direct and advanced analysis also refuse an out-of-date mesh even when the set of shell IDs and recorded cell count still match. The freshness check uses the current outline, holes, mesh settings and the geometry the mesh follows. The normal Solve action can remesh first when automatic meshing is enabled. It names the plate so the user can repair the definition or mesh and solve again. The mesh generator also refuses incomplete outlines and holes before creating any elements. Existing meshes created from partial input should be checked against their intended boundaries and openings.

On the previous production path, issue #2368's supported slab carried a uniform 1 kN/m² load over 4 × 4 m. After a corner edit made the second plate, “missing floor,” invalid, preparation reported success with zero plates meshed. The solver returned the loaded slab's 16 kN vertical reaction and omitted the invalid plate. The same model now refuses before producing results and names “missing floor.”

PRO checks wall and slab shell edges in both directions. Analysis requires either shared vertices or direct linear MPC equations that match the edge interpolation for all three translations and all three rotations. The same check applies at overlapping endpoints with different node IDs. A diaphragm alone does not provide that compatibility. The refusal identifies the plates by name where available and by shell identifier on an ungrouped mesh.

The seven-storey gallery example, `pro-edificio-7p`, previously used 77 quads. Node 121 lay at 5/12 of slab edge (13, 14). Node 130 lay at 5/12 of (58, 59). Comparing vertical displacements on either side of the old junction gave gaps of −0.189385 mm at node 121 and +0.262410 mm at node 130.

The gallery now uses 105 rectangular slab quads and the existing 21 wall quads. The core stations extend as two mesh lines through each slab. The slab, core walls and intersected beams use the same nodes, and the subdivided slab bays remain single physical design panels. In-plane diaphragms include the new slab nodes. The 21 old rigid links to the floor corners were removed. The applied area in each load case, frame cross-sections, wall geometry, gravity load and combinations are preserved. In the standalone linear WASM comparison, the vertical support reaction sum is +15,579.25 kN before and after.

| Node | Previous vertical displacement (mm) | Revised vertical displacement (mm) |
| --- | ---: | ---: |
| 121 | −0.682413 | −0.846148 |
| 130 | −0.979471 | −1.208955 |

Each wall station now has one vertical displacement shared with the slab. The rectangular mesh passes both signed linear and P-Delta combinations. An intermediate mesh with skewed MITC4 cells was withheld by the distortion guard for P-Delta combinations. The guard and its limits are unchanged.

The gallery's design scene contains 7,960 column ties and crossties, 1,091 beam transverse pieces, 14,768 slab bars and 357 wall bars. The connected mesh redistributes the member demands. Of the 168 beam elements, 105 have an explicit design refusal in the scene test. The design leaves those beams bare and reports the reasons. Two-dimensional analysis and native solver formulations are unchanged.

For new CAD drafts with slab meshing enabled, axis-aligned wall runs set the slab mesh lines and the wall quads are cut at the resulting slab stations. The fixed-division two-storey test draft now has 38 slab quads and 8 wall quads. Its opening, applied surface pressure and beam count are preserved. Fixed-division and target-size with zero-size fallback both recover a 290 kN vertical support reaction from the same explicit area loads. The wall mesh still has one row of shells per storey. In the previous target-size draft, slab node 19 moved −0.592267 mm relative to the interpolation along wall quad 59. The revised draft uses a common node there.

The architecture-only CAD gallery draft, `cad-arch-only-dxf`, had a slab node 266 halfway along the unsplit top edge of wall quad 601 between nodes 2 and 13. The draft now splits the six end-wall bays at slab and beam stations on each storey. The walls and slabs share those IDs, and six new fixed nodes preserve the fixed wall base edges. The 600 slab quads, explicit area loads, 1,000 frame members and load combinations are retained. The mesh now has 720 quads and 800 nodes.

In the standalone linear WASM comparison for the dead-load case, using the explicit slab loads and the gallery's self-weight setting, both versions produced a vertical reaction sum of 16,321.225965 kN. The previous displacement at node 266 differed from the old wall-edge interpolation by −0.127587 mm. At the revised junction, node 266 belongs to both the slab and the wall and has one common displacement.

| Result | Previous | Revised |
| --- | ---: | ---: |
| Node 266 vertical displacement (mm) | −0.215365 | −0.091816 |
| Minimum vertical displacement (mm) | −6.471232 | −6.351172 |
| Member 1 axial force (kN) | −79.681096 | −86.151047 |

For projects saved from the previous examples, reload the example or remesh the junctions with shared vertices before rerunning analysis and design. The registry flags older results when the stored model has an invalid or stale plate mesh or a nonconforming junction.
