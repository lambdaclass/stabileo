# SA-2026-016: curved members: section axes turned by 90° on near-vertical segments of arches

| | |
|---|---|
| Severity | Medium |
| Status | Published 2026-10-21 (fixed in 0.3.0; live on stabileo.com since 2026-10-21) |
| Issue | [#418](https://github.com/lambdaclass/stabileo/issues/418) (SP-15 in the element-derivation review) |
| Fix | PR [#523](https://github.com/lambdaclass/stabileo/pull/523) |
| Affected versions | every version with curved beams in the engine or the arc tool in the app, up to 0.2.0 and `main` until the fix |
| Re-check registry | `arc-member-local-axes` (models with members drawn as an arc) |

## Affected features

- **Engine and WASM API: curved beams** (`curvedBeams` in a 3D model). Each arc is expanded into
  straight segments; their local axes are what this advisory is about.
- **App: arcs drawn in the PRO Members tab** ("arc through three nodes"). The app materialises
  the arc as straight members and left them on the default local axes, which is the same defect.

Only segments within 2.56° of vertical are affected, so only arcs in a non-horizontal plane with
such a segment: in practice an arch whose springings are close to vertical and that is cut into
many segments (a semicircle needs 36 or more; the app's default of 8 has none), outside the
global X–Z plane. Plan curves (horizontal) are not affected. Arches in the X–Z plane had the
right stiffness; only the sign of the local y and z of their near-vertical segments differed from
the other segments.

## What was wrong

A segment's local axes came from the default rule for a straight member: local z is global Z
projected off the member axis, and a member within 2.56° of vertical switches to global X as its
reference. In an arch, the segments at a near-vertical springing therefore took local z along
global X. For an arch in the X–Z plane that is in the arch plane, as on every other segment; in
any other vertical plane it is **normal to the arch plane**, so on those segments Iy and Iz were
swapped. With the strong axis bending in the arch plane, the springing segments were given the
weak-axis inertia in plane (too flexible) and the strong axis out of plane (too stiff out of
plane). The same arch gave different results depending on its plan orientation.

| Semicircular arch, R = 5 m, 40 segments, fixed springings, Iz = 100·Iy, crown load 10 kN down and 3 kN along the span | Crown deflection | Crown horizontal displacement |
|---|---|---|
| Arch in the X–Z plane (right, before and after the fix) | −7.29 mm | 3.54 mm |
| Same arch in the Y–Z plane, before the fix | −6.18 mm (15 % low) | 2.69 mm (24 % low) |
| Same arch in the Y–Z plane, after the fix | −7.29 mm | 3.54 mm |

Whichever direction the error goes depends on which axis is the strong one, so it can be
unconservative: here the in-plane deflections were 15–24 % low, and member forces redistribute
accordingly.

Arcs in tilted planes (neither horizontal nor vertical) had a section that rolled slowly along the
arc; they now keep one orientation relative to the curve too, so their results change slightly.

## How to tell if your results are affected

Your model has an arc (engine `curvedBeams`, or members drawn with the app's arc tool) in a
non-horizontal plane that is not the X–Z plane, and one of its segments is within 2.56° of
vertical. In the app, select the arc's members at the springings and show the local axes: on an
affected member local z points out of the arch plane, where the neighbouring members have it in
the plane.

## Fixed in

Every segment of an arc now gets local y = a·n + b·(n × x), n being the normal of the arc's plane
and x the segment's axis, with (a, b) those the default rule gives on the arc's tangent at the
middle of its sweep. The section does not roll along the arc: a plan curve keeps local z vertical
exactly as before, and an arch keeps local y normal to its plane on every segment. In the engine,
`expand_curved_beams_3d` sets it (`ArcSectionFrame`); in the app the arc tool sets it on the
members it creates, and arcs saved before the fix take it once when the project is opened (only
members with no local y or roll of their own whose ends are still on the arc, and only where their
axes are turned, not merely reversed; a member set back to automatic axes afterwards stays so).
A member that a load or a support refers to, or that has end releases, semi-rigid ends, an offset
or stiffness factors, is **not** migrated, because that data is given in
the member's local axes and would turn with them: for those, the re-check notice is the signal, and the
axes are set by hand (see the workaround). Tests:
`engine/tests/derivation_special_elements.rs` (the arch against explicit members with local y
along the plane normal at four plan angles; the same arch rotated about the vertical gives the
same displacements and member forces; plan curves keep the default axes; tilted arcs do not roll)
and `web/src/lib/model/__tests__/curved-member.test.ts`.

## Workaround

Give the near-vertical members of the arch an explicit local y along the normal of the arch
plane, or model the arch in the X–Z plane.

## What to do with results you already have

Re-solve affected models on the fixed version and compare member forces near the springings and
the arch's deflections with the results you used.

## Credits and references

Found by the element-derivation review (SP-15, PR #330) and pinned by
`curved_beam_arch_is_invariant_under_plan_rotation`; the app's arc tool was found to share it
while fixing it.
