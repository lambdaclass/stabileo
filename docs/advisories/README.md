# Safety advisories

Advisories for released versions that produced wrong or unconservative results. The process,
severity scale, notification channels, timelines and template are in
[../SAFETY_ADVISORIES.md](../SAFETY_ADVISORIES.md).

**SA-2026-001…020 are published** (2026-10-21, with release 0.3.0): SA-2026-001…004 are
retroactive, for defects fixed in 0.2.0; SA-2026-005…020 were fixed in 0.3.0. Each has a GitHub
issue labelled `safety-advisory`, a section in the release notes and an entry in the in-app
re-check registry where the app could produce the result. **SA-2026-021…024 are not published
yet**: they are fixed on `main` (live on stabileo.com) and are published with the next release.

| ID | Summary | Severity | Issue | Fix | Fixed in | Status |
|---|---|---|---|---|---|---|
| [SA-2026-001](SA-2026-001-loads-combinations.md) | Load combinations and generated loads (CIRSOC 101/102/103) unconservative | High | — | #292 | 0.2.0 | Published 2026-10-21 |
| [SA-2026-002](SA-2026-002-concrete-checks.md) | CIRSOC 201 / ACI 318 checks overstated capacity (φMn up to 18 %) | Critical | — | #298, #301 | 0.2.0 | Published 2026-10-21 |
| [SA-2026-003](SA-2026-003-steel-cfs-connections.md) | Steel, cold-formed and connection checks overstated capacity (up to 60 %) | Critical | — | #286, #291, #293, #295, #301, #303, #308 | 0.2.0 | Published 2026-10-21 |
| [SA-2026-004](SA-2026-004-analysis-results.md) | Analyses ignored part of the model (ground motion up to 50 % low, plastic collapse up to 2.3×) | Critical | — | safety wave #275–#302 | 0.2.0 | Published 2026-10-21 |
| [SA-2026-005](SA-2026-005-inclined-member-loads.md) | 2D inclined members: axial force missed the along-member load; member couples dropped in 3D | High | [#343](https://github.com/lambdaclass/stabileo/issues/343) | #437 | 0.3.0 | Published 2026-10-21 |
| [SA-2026-006](SA-2026-006-mirrored-moments-2d-in-3d.md) | 2D model solved in 3D: nodal moments and imposed rotations mirrored | High | [#435](https://github.com/lambdaclass/stabileo/issues/435) | #436 | 0.3.0 | Published 2026-10-21 |
| [SA-2026-007](SA-2026-007-torsional-buckling.md) | 3D buckling missed torsional / flexural-torsional modes (up to 96 % high) | High | [#404](https://github.com/lambdaclass/stabileo/issues/404) | #434 | 0.3.0 | Published 2026-10-21 |
| [SA-2026-008](SA-2026-008-spectral-combination.md) | Spectral base shear SRSS under CQC; participation omitted support-coupled mass | High | [#405](https://github.com/lambdaclass/stabileo/issues/405) | #434 | 0.3.0 | Published 2026-10-21 |
| [SA-2026-009](SA-2026-009-shb8-thickness-locking.md) | Solid shell (SHB8) ~22 % too stiff in thin-plate bending (deflections ~18 % low) | Medium | [#400](https://github.com/lambdaclass/stabileo/issues/400) | #401 | 0.3.0 | Published 2026-10-21 |
| [SA-2026-010](SA-2026-010-spectral-certificate-nonfinite.md) | Spectral certificate passed on non-finite results | Medium | [#335](https://github.com/lambdaclass/stabileo/issues/335) | #398 | 0.3.0 | Published 2026-10-21 |
| [SA-2026-011](SA-2026-011-springs-on-fixed-supports.md) | 3D support switched from spring to fixed or pinned was solved as elastic | High | [#488](https://github.com/lambdaclass/stabileo/issues/488) | #491 | 0.3.0 | Published 2026-10-21 |
| [SA-2026-012](SA-2026-012-material-nonlinear-member-forces.md) | Material-nonlinear solver (engine/WASM only) reported elastic member forces after yield (up to 100×) | Medium | [#427](https://github.com/lambdaclass/stabileo/issues/427) | #510 | 0.3.0 | Published 2026-10-21 |
| [SA-2026-013](SA-2026-013-curved-shell-moments-and-thermal.md) | Curved shells reported zero bending moments; their stresses kept the free thermal strain, and the app's curved-quad temperatures were dropped | High | [#410](https://github.com/lambdaclass/stabileo/issues/410) | #522 | 0.3.0 | Published 2026-10-21 |
| [SA-2026-014](SA-2026-014-plastic-3d-element-order.md) | 3D plastic collapse factor depended on element numbering (up to 2.4× the collapse load) | High | [#511](https://github.com/lambdaclass/stabileo/issues/511) | #524 | 0.3.0 | Published 2026-10-21 |
| [SA-2026-015](SA-2026-015-cable-tension-chord-law.md) | Cables with self-weight got too little tension in indeterminate structures (guyed mast 16 % low) | High | [#416](https://github.com/lambdaclass/stabileo/issues/416) | #525 | 0.3.0 | Published 2026-10-21 |
| [SA-2026-016](SA-2026-016-curved-member-axes.md) | Curved members (engine curved beams, app arc tool): Iy/Iz swapped on near-vertical segments of arches outside the X–Z plane (crown deflection 15 % low) | Medium | [#418](https://github.com/lambdaclass/stabileo/issues/418) | #523 | 0.3.0 | Published 2026-10-21 |
| [SA-2026-017](SA-2026-017-soil-curves.md) | Soil-structure interaction p-y, t-z and q-z curves departed from their references (soft clay p_u a third to a half low, sand A, stiff clay jump, t-z/q-z units) | High | [#421](https://github.com/lambdaclass/stabileo/issues/421), [#422](https://github.com/lambdaclass/stabileo/issues/422), [#423](https://github.com/lambdaclass/stabileo/issues/423) | #526 | 0.3.0 | Published 2026-10-21 |
| [SA-2026-018](SA-2026-018-mitc9-curved-rigid-motion.md) | MITC9 shells (engine/WASM only) on curved geometry strained by rigid-body motion (101 MPa from a 1 mrad rotation) | Medium | [#411](https://github.com/lambdaclass/stabileo/issues/411) | #528 | 0.3.0 | Published 2026-10-21 |
| [SA-2026-019](SA-2026-019-frame-thermal-alpha-depth.md) | Frame and truss temperature loads assumed steel's α and a solid rectangle's depth (gradient moments up to ~30 % low on I sections) | Medium | [#407](https://github.com/lambdaclass/stabileo/issues/407) | #531 | 0.3.0 | Published 2026-10-21 |
| [SA-2026-020](SA-2026-020-material-nonlinear-3d-yield-surface.md) | 3D material-nonlinear solver (engine/WASM only) used a yield surface less conservative than 2D (first yield up to 15 % late at N = 0.5·Np) | Medium | [#429](https://github.com/lambdaclass/stabileo/issues/429) | #529 | 0.3.0 | Published 2026-10-21 |
| [SA-2026-021](SA-2026-021-free-roof-wind-minimum.md) | Free roofs: no wind along the ridge, and less than the §2.1.5 minimum across it (17 % of it at 20 m/s) | High | [#580](https://github.com/lambdaclass/stabileo/issues/580) | #581 | next release | Fixed on main, to publish |
| [SA-2026-022](SA-2026-022-earth-pressure-dead-load-resisting.md) | With earth pressure H, the combination where the dead load resists it was missing (27–45 % low in an example) | High | [#580](https://github.com/lambdaclass/stabileo/issues/580) | #581 and this PR | next release | Fixed on main, to publish |
| [SA-2026-023](SA-2026-023-column-moment-sign.md) | RC column check read one sign of the moment: uneven bar layouts (6, 10, 14… bars) passed on the stronger sign (φMn up to 38 % high) | Critical | — (D4-01) | #590 | next release | Fixed on main, to publish |
| [SA-2026-024](SA-2026-024-design-on-unfactored-results.md) | Footings and joints designed for the unfactored loads when combinations were defined but not solved (live calc, or a failed combination solve): 15 % low in an example, 29–38 % for D + L | High | — (W2-01) | #588 | next release | Fixed on main, to publish |

Other open `safety` issues (the derivation-review findings #406–#433, #338, #439) get an advisory
or a recorded "no advisory needed" when they are triaged; the list is on the
[verification dashboard](../verification/DASHBOARD.md).
