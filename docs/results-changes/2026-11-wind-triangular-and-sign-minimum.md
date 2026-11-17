# Triangular wind tributaries and eccentric sign minima

The unrestricted triangular median partition described below was withdrawn
in [round 11](2026-11-wind-triangular-centroid.md): it does not generally
preserve the projected pressure centroid. Only triangles symmetric about
the wind direction retain that partition. The description below records the
round-4 change and does not define the current supported domain.

PR #2220 round 4 corrects two regressions on the unmerged branch. Regenerate
W and Wa after upgrading, then rerun analyses, combinations and design checks.
Re-solving stored loads alone does not correct their load basis. No new
advisory is assigned: these defects are specific to this branch.

The signed reproducer commit `3113c8036` retains the failing tests first with
Vitest's `known wrong result: #2220` convention. Enable them using
`RUN_KNOWN_WRONG=2220` and the targeted Make tests for `wind-round4.test.ts`
and `wind-member-round3.test.ts`. They fail on parent `922636ac4` before the
production correction. The fix removes their skips.

The shared carrier partition inferred rectangular grids and collinear layouts
but refused a valid three-leg lattice tower. Three noncollinear carrier
locations now establish a triangular median partition. Joining the centroid
to edge midpoints makes three cells, each containing two of the triangle's
six equal-area median subtriangles. Each carrier therefore takes one third
of the projected line load. This definition applies equally to scalene
triangles, rotations, reflections and a subdivision on only one carrier.
Coincident carriers divide their location's share. Collinear points retain
the existing spacing-based partition; unresolved layouts still refuse.
The same height-field path serves buildings, signs, chimneys and towers.
Arbitrary polygonal partitions are outside this correction.

The solid-sign calculation separated calculated pressure from the §4.8
minimum but emitted only a centered minimum. Its calculated B± cases could
then fall below the minimum. Main applies the minimum before generating all
three sign cases. A main-source replay on the checked-in two-leg sign with
calculated pressure 0.4 kN/m², width 2 m and height 6 m gives B± force 9.6 kN
and vertical-axis moments ±3.84 kN·m without a notice. The branch parent gives
4.8 kN and ±1.92 kN·m instead. This comparison concerns the eccentric minimum;
main's separate height-transfer defects remain documented in the earlier
[pressure-field record](2026-11-wind-physical-pressure-field.md).

Calculated and minimum pressure fields now use the same A/B± constructor,
including the same eccentricity and distributed member-load representation.
The minimum stays a separate field rather than clamping a height profile.
The [checked-in §4.8 and Figure 4.4-1](../codes/CIRSOC/markdown/cirsoc-102-2025/capitulo-4-cargas-de-viento-sobre-accesorios-de-edificios.md)
provide the minimum and prescribed sign cases. Tests cover pressures below,
at and above the minimum, both senses on both axes and the planner entry.

Solver tests check that returned element ids exactly equal the input ids,
including multiplicity, before inspecting forces. Signed member and diagram
expectations follow the local axes: a vertical member with positive local-Y
pressure has negative local-Y shear and local-Z moment; positive local-Z
pressure has negative local-Z shear and positive local-Y moment. The 2D
vertical projection uses negative transverse load for positive global-X
pressure, hence positive shear and moment. Reversed pressure reverses these
answers. Checks retain their previous numerical accuracy.

The WASM tests cover 2D/3D linear and P-delta solves, per-carrier member loads,
force and moment conservation, internal forces, interior diagrams and tip
displacements. The shared generator exports 152 inputs for the native tests,
which solve both linear and P-delta modes. Exact fixture parity is checked
on normal Vitest runs. The new registry notice includes Hungarian, as do
the branch's existing notices and assigned advisory catalogs. The earlier
wall write-up now labels its 18 kN foundation share as an equivalent endpoint
diagnostic; the shipped load is distributed member loading.
