# SA-2026-045: 3D plastic collapse treated a frame member without a usable plastic moment as one that never yields

| | |
|---|---|
| Severity | High |
| Status | Draft |
| Issue | [#1525](https://github.com/lambdaclass/stabileo/issues/1525) |
| Fix | #1526 |
| Affected versions | every release with the 3D plastic solver (`solve_plastic_3d`); not bisected |
| Re-check registry | results version entry `plastic-3d-member-without-capacity-refused` |

## Affected features

- **Engine/WASM: `solve_plastic_3d`**, its certificate (`certify_plastic_3d`, `certify_collapse_3d`)
  and the 3D plastic bundle (`export_plastic_bundle_3d`).
- **App: the PRO pushover** (advanced panel, nonlinear, pushover) only where a section's own
  plastic moment about one axis came out zero: the app sends Mp about both axes of every section
  its members use, so a missing section did not reach the engine from the app.

## What was wrong

A frame member whose plastic moment about either local axis was missing, infinite or zero was
solved as a member that never forms a hinge, and a negative one was used as its absolute value:

- a member whose section had no entry in `sections` (and so none in `mpOverrides`) got Mp = ∞;
- a section without `b`/`h` and with `iy` or `iz` at or below 10⁻²⁰ got Mp = ∞ about that axis;
- an `mpOverrides` pair with a zero entry left the member out of the yield search.

A negative override was used as its absolute value (the same collapse factor as the positive one,
not certified); it is refused now as well.

The collapse factor came out too high, with `is_mechanism` true and no warning, and the plastic
certificate certified it, because it treated the same member as rigid.

| `verify/samples/plastic-3d-portal.input.json`, column 1 on a second section | Collapse factor | Hinges |
|---|---|---|
| Column 1 on a section with Mp = (100, 50), as the sample | 31.865 | members 1 and 3 |
| Column 1 on a section missing from `sections` | 192.816 (6.05×), certified | members 2 and 3 |
| Column 1 on a section with `iy = iz = 0` | 192.816 (6.05×), certified | members 2 and 3 |
| Column 1 with `mpOverrides` (100, 0) | 192.816 (6.05×) | members 2 and 3 |
| Column 1 with `mpOverrides` (−100, 50) | 31.865, from \|Mp\| | members 1 and 3 |

## How to tell if your results are affected

You called the 3D plastic solver with a frame member whose section was missing from `sections`,
had no dimensions and a near-zero inertia, had a yield stress of zero, or had a zero, negative or
non-finite Mp override; in the app, a pushover of a model with a section whose plastic modulus about
one axis is zero.

## Fixed in

The 3D plastic solve, its certificate and its bundle now refuse a frame member without a finite,
positive plastic moment about both axes, before any hinge is searched for. The refusal is a
structured diagnostic, `plastic_capacity_missing`, naming the element (`elementIds`) and its
section (`value`), which the app shows in the reader's language. Tests:
`engine/tests/certify_plastic_3d.rs` (`a_frame_without_plastic_capacity_is_refused_1525`,
`the_portal_sample_collapses_with_hinges_on_both_columns_1525`).

## Workaround

Give every frame member a section with dimensions or inertias, a positive yield stress, or a
positive Mp about both axes.

## What to do with results you already have

Solve again. A model that is refused names the member and section to fix; once its plastic moments
are given, compare the new collapse factor with the old one.
