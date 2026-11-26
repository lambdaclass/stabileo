### Fixed

#### Report inward member-end forces at J

End-force tables, queries, exports and endpoint checks use the member-side
force at either end of a point-load jump. With a −24 kN nodal force and a
+15 kN member point force at J, the inward shear cell now reads 9 kN.
