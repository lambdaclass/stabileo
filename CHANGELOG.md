# Changelog

Read next:
- solver roadmap: [`SOLVER_ROADMAP.md`](/Users/unbalancedparen/projects/dedaliano/docs/roadmap/SOLVER_ROADMAP.md)
- benchmark/proof status: [`BENCHMARKS.md`](/Users/unbalancedparen/projects/dedaliano/docs/BENCHMARKS.md)

This file is the historical record.
It should capture what changed, not what should be built next.

## Unreleased

One file per change in [`changelog.d/`](changelog.d/README.md); `scripts/changelog.py --release` moves them here.

## 0.5.0 (2026-11-07)

Release notes: [`docs/releases/v0.5.0.md`](docs/releases/v0.5.0.md) (also in [Spanish](docs/releases/v0.5.0.es.md) and [Portuguese](docs/releases/v0.5.0.pt.md)).
Safety advisories SA-2026-025…046 are published in this release, and all but SA-2026-044 are fixed:
2D plastic collapse stays refused until #758 is fixed. German, French and
Turkish are not offered in this release: they return once a native speaker has checked them, and
their pages redirect to English until then.

### BREAKING (results)

#### The load generator keeps a floor's area loads when low roof structure stands over only part of it (2026-11-03)

- SA-2026-033: since #1076, "Generate loads from the code" left out a whole panel's dead, live
  and roof live area load when the only members found over it were less than 2.2 m above, even
  with open sky over the rest: a 6 × 6 m floor with one low beam over one edge lost all 36 m². A
  panel is now left out only when roof structure covers all of it under 2.2 m and a deck or
  beam under 2.2 m stands over its center, and the panels, members and shells loaded above carry
  all of it; otherwise the part they do not carry stays on it as roof load. Trusses count as roof
  structure. Panels and members only partly under low structure keep all their load, as floor
  load when a floor or roof stands over their center and as roof load otherwise; where a low
  member over them also carries its strip, that strip is loaded twice, and the derivation names
  them and asks for a check. Generate the loads again for models whose loads came from the generator.
- SA-2026-033 (#1311): the generator sized a panel by its bounding box in the plan's X and Y, so a
  3 × 20 m deck turned 45° lost all 60 m² of its floor load as "too wide for a slab". A panel is
  now too wide only when its narrowest width across any direction passes 12 m.
- SA-2026-033 (#1312): by width, the floor beams under low eaves keep their floor load.
- SA-2026-033: the part of a panel or member strip that the low structure above does not carry is
  now found exactly, not by a grid that counted any partly carried cell as uncarried (a 0.05 m gap
  between two beam strips kept 1.8 m² instead of 0.3 m²).
- SA-2026-033: whether roof structure lies over a panel is now probed along the panel's own sides,
  not the plan's X and Y, so a shallow trussed roof turned 45° is no longer loaded as a floor.
- The re-check notice for this change stays until the loads are generated again. Solving again no
  longer clears it, because saved loads do not change. Applying a load plan now records the results
  version it was generated with.

#### Shell figures paint the field the screen shows (2026-11-03)

- Exported shell result figures painted each element with its own centre value, over the range
  those values occupied, while the screen paints the contour field: nodal averages within the
  chosen domain, the chosen face, a typed range and bands. They now paint the screen's field,
  cut along its band edges (or 24 steps of a smooth scale) where it crosses them inside each face,
  with its range and peak, so the figure and its scale agree with the screen and its legend. Re-export shell figures (results version 21).
- Shell direction marks and the largest and smallest values on screen leave out hidden shells.

#### Cutting a 3D model to 2D bends each member about the axis it bends about in 3D (2026-11-03)

A 3D-to-2D cut used the section's strong-axis inertia for every member, so columns in a Y–Z cut, beams in an X–Y cut and members rolled 90° bent about the wrong axis: an IPN 300 portal standing in Y–Z swayed 0.96 mm in 2D against 13.0 mm in 3D (#1238, SA-2026-035). Such cuts now give each such member its section turned a quarter turn in the 2D model, and agree with 3D. Cuts of members whose section axes are skew to the plane (even with equal inertias, such as a square rolled 45°, whose corner lies farther out; a round tube excepted), or that would need a section that is not doubly symmetric turned or flipped (a T rolled half a turn, or on a member drawn the other way, would hang its flange on the other side of the 2D member), are refused, because a 2D model cannot represent them. A cut whose constraints the 2D solver would read with another meaning on that plane (#466) is refused too. Re-cut, or solve in 3D, any 2D model taken from such a cut.

#### ACI 318 and EN 1992 checks no longer pass a concrete member whose torsion they did not check (2026-11-03)

The other-codes ACI 318 and EN 1992-1-1 checks of reinforced concrete members read flexure, shear and axial force only, so a member carrying large torsion could pass (#1314, SA-2026-040). The check is now marked "torsion not checked" and does not pass: for ACI 318 above the 22.7.1.1 threshold below which torsion may be neglected, φ·0.083·λ·√f'c·Acp²/pcp with √f'c ≤ 8.3 MPa½ and λ = 0.75 below a unit weight of 23 kN/m³ (any torsion under axial tension, which lowers that threshold), and for EN 1992, which has no such threshold, whenever the member carries torsion, and its certificate is refused as partial. Torsion design itself is not added; the CIRSOC 201 design already checks torsion.

#### Modal analysis refuses a mechanism that slides along inclined supports (2026-11-03)

- Fix #1315 (follows SA-2026-032): the check that refuses a mechanism read the mass it moves in global axes, but at an inclined support the solver works in the support's own axes, so a mechanism that slides only along inclined rollers or inclined 3D supports was taken as massless: its zero mode was dropped and the other modes came back as complete. The mass is now read in the support's axes, so modal analysis, and the spectral and seismic analyses that use it, refuse such a model and name the mechanism. Models without inclined supports are unchanged.

#### RC columns are also checked under their least compression (2026-11-03)

The CIRSOC 201 column check took the largest moment of any combination and checked it under the largest compression only. Below the balance point a column is weaker with less compression, so a wind or 0.9D moment was checked where the column is stronger: in the design QA frame the 40 × 40 columns' utilization was 0.727 and is 0.832 (#1316, SA-2026-041). The column and biaxial checks now also run under the least compression any combination puts on the member; columns may now need more bars or fail.

#### 2D buckling integrates each member's varying axial force (2026-11-03)

2D buckling built each member's geometric stiffness from its mean axial force. Under a load along a member (gravity on a rafter, an axial point load) the force varies along it, and where compression grows toward the end that rotates most the factor came out too high, with no warning: 4.97 instead of 3.48 (+43 %) for a one-member cantilever whose compression rises to its tip, 4.97 instead of 2.96 (+68 %) for that cantilever under a thrust at its tip and an equal, opposite axial point load at mid-span, so that only the half toward the tip is compressed (#1323, SA-2026-042). The geometric stiffness now integrates the whole axial force along the member; one member gives 3.54 and 3.06, and a finer mesh converges to the exact values. The factor is a property of the whole model, so any 2D buckling model with a load along a member's axis may change, whichever member governs; models with no such load keep their factors.

#### A soft but real node rotation is no longer locked by the orphan-rotation spring (2026-11-05)

A node rotation that nothing stiffens (every member released there, or only trusses and solid shells reach it) gets a small artificial spring so the stiffness matrix stays nonsingular. The 2D and 3D assemblers judged a rotation unstiffened when its diagonal stiffness was below 1e-12 of the largest rotational diagonal in the whole model, so in a model with a stiffness contrast above about 10¹² a real but soft rotation was taken for an orphan and locked: under a force load it solved silently wrong (a soft propped cantilever beside a stiff member: end rotation 1.04e-7 rad instead of the closed-form P·L²/(32·EI) = 0.05 rad), and a nodal moment on it was refused (#1367). The threshold is now 1e-12 of the largest rotational diagonal of the same node, so a soft part of the model is no longer judged against a stiff part elsewhere. A rotation 1e12 softer than another rotation of the same node is still taken for an orphan. Rotations every member releases, and the refusal of a nodal moment on them, are unchanged.

#### Harmonic analysis checks the residual of its modal response and computes the omitted modes' correction in their own subspace (2026-11-05)

The static correction of the omitted modes was the static response minus the kept modes' share of it. With one kept mode much softer than the rest that difference was all round-off, multiplied by ω²: on the C2-symmetric frame of #1371 the antisymmetric response at 2.3 Hz came out 3.14 instead of 0.0396 (79×), 0.520 instead of 0.434 at 0.7 Hz, and a displacement that is zero by symmetry 7.3·10⁻³ (SA-2026-043). The correction is now projected off the kept modes before and after each solve, and every frequency's response is checked against the full dynamic system: a relative residual ‖(K + iωC − ω²M)u − f‖ above 10⁻² in the energy norm is solved directly instead, listed in `directFrequencies` with a warning (refused when the direct solve is over the dense ceiling). `maxModalResidual` reports the largest modal residual of the sweep.

#### A member's governing value and the 2D envelope read the diagram's true peak (2026-11-04)

- #1389: in plane models with combinations and loads along members, the governing moment, shear
  or axial force of a member and the 2D envelope were read at fixed stations, so a peak between
  two stations was read low: 0.23 % under a triangular load, 1.05 % under a short partial load,
  and a combination peaking between stations could lose the governing title. Both now take the
  true peak (both sides of each point load, the stationary points between load discontinuities).
  Governing values and envelope peaks can rise; they never fall. Results version 26.

#### 2D: a mechanism hidden behind a connector is refused, not solved (2026-11-05)

A 2D node whose frame members are all hinged got an artificial rotational spring to keep the stiffness matrix nonsingular. That spring is inert only while nothing else touches the node's rotation; a connector with a rotational spring (or a finite-length connector with a shear spring) ties it to the other end, so the artificial spring became a real spring to ground on everything the connector reaches. A hinged cantilever tip tied by a connector to a coincident node carrying a moment is a mechanism, yet every 2D path and the end-to-end certificate returned a rotation of about 10 rad with a zero reaction moment (#1414). Such a model is now singular and refused on every 2D path, including chains of connectors. Where something real holds the rotation (a rotational spring support, an unhinged member, a connector chain to a fixed node), the model still solves, without the artificial spring's share of the moment (0.01 % of the rotation in the test case).

#### The 3D biaxial cantilever example stays within small rotations (2026-11-05)

Only the bundled example changed; a saved model gives the same numbers as before. The biaxial cantilever twisted 0.42 rad and its 3 m tip moved 103 mm in all (span/29), outside linear analysis (#1446). Its torque is now 0.5 kN·m (10 kN at 50 mm eccentricity) and its tip loads Fy 1 kN and Fz 10 kN, so it twists 0.042 rad and its tip moves 11 mm in all (span/272). Its axial compression is now 10 kN, 4% of the weak-axis Euler load of the 3 m cantilever (247 kN; it was 100 kN, 40%), so second-order effects add about 4% instead of about 70%.

#### The 3D torsion beam example uses a closed section and stays within small rotations (2026-11-05)

Only the bundled example changed; a saved model gives the same numbers as before. The torsion beam twisted 0.45 rad under its 8 kN·m torque on an open IPN 300, outside linear analysis (#1446). It now uses a closed SHS 140×140×8 (IRAM-IAS table: J 1813.95 cm⁴), the usual answer to torsion, and twists 0.011 rad.

#### Linear analysis warns when a rotation passes 0.1 rad (2026-11-05)

Linear analysis assumes small displacements, yet it returned rotations of many radians without notice, for example 75 rad at a nearly free node (#1446). A linear static solve, 2D or 3D, now warns with `LIN-SMALL-DISPLACEMENT` when a node rotation (in 3D the rotation vector's norm), or a frame member's relative end displacement over its length, exceeds 0.1 rad. A load combination warns when its own rotations do or a member of one of its cases did: 0.1 rad is a screening limit: past it the terms first-order theory drops, such as the chord shortening 1 − cos θ ≈ 0.5 %, may no longer be negligible, and the change of geometry should be checked. Numerical values are unchanged. The 3D torsion beam example twisted 0.45 rad, past the threshold, before it took a closed section; it now twists 0.011 rad and shows no warning.

#### A design check that cannot be evaluated is refused, not passed with a ratio of 0 (2026-11-05)

A demand over a capacity that was zero, negative, NaN or infinite could come out as a ratio of 0, which reads as a pass: a CIRSOC 301 limit state whose slenderness or demand was NaN, a loaded bolt group without bolts or a weld without throat, a footing shear or punching check without a usable resistance, a non-positive allowable bearing pressure, or a CIRSOC 201 ductility ratio. The same holds for every steel, timber, masonry and concrete check that forms a ratio. Each such check is now listed as not evaluated (the member or footing is not marked OK), and any result holding NaN or infinity is withheld with a message naming the value, except an intermediate value (such as a reduction factor) whose check is already listed as not evaluated, which is shown as unknown. Models whose checks all had usable capacities give the same numbers. Every design, certify and postprocess ratio now goes through `engine/src/check.rs`, which returns a ratio or the reason it could not be formed, and `engine/src/boundary.rs` refuses any result with a non-finite number before it leaves the engine, naming its path (SA-2026-025, SA-2026-026, SA-2026-030, SA-2026-010, #1317, #1350).

#### A load combination judges its members' relative displacement on its own displacements (2026-11-06)

A load combination warned `LIN-SMALL-DISPLACEMENT` for a member only when one of its cases did. A member whose relative end displacement over its length, ‖Δu‖/L, was 0.06 in a case and 0.12 in a combination with factor 2 was not warned, and a member warned in a case stayed warned where the combination reduced or cancelled it (#1506). Each linear static result, 2D or 3D, now records every two-node member's Δu/L vector as `resultSummary.memberChords`, and a combination sums them with its factors and warns where the norm of its own sum exceeds 0.1, recording the sum in its own summary. When a contributing case lacks that record, the sum would be incomplete, so the combination carries the member warnings of all its cases as before and records no chords. Numerical values are unchanged.

#### Linear analysis warns when a member turns past 0.1 rad inside its span (2026-11-06)

`LIN-SMALL-DISPLACEMENT` judged node rotations and each member's end chord only, so a member fixed at both ends under a large span load, which moves nothing at its ends, was never warned though it turned past 0.1 rad inside the span (#1506). A linear static solve, 2D or 3D, now recovers each frame member's section rotation along its span from the engine's exact Euler–Bernoulli / Timoshenko member deflection, the one the 2D deformed shape is drawn from, here with 2D span couples included (end displacements and rotations in the member's axes, releases, distributed and point span loads, and 2D span couples), on each interval between 64 stations and the load positions, where each plane's moment is a cubic whose zeros, the rotation's extremes, are found exactly, and warns where it exceeds 0.1 rad; in 3D the two bending planes and the twist are judged together, the norm of the rotation vector bounded on each interval by the norm of each part's largest magnitude there. With every section rotation within 0.1 rad, an Euler–Bernoulli member's deflection from its chord stays within L/20. Each result records the member data the check needs (`resultSummary.memberSpans`), and a load combination recomputes the rotations from its own displacements and span loads; when a contributing case lacks the record, the combination carries the member warnings of its cases as before. Not covered yet, tracked in #1569: the slope a Timoshenko member adds by shear deformation, and curvature from a thermal gradient in a member with a release. Numerical values are unchanged.

#### 3D plastic collapse refuses a frame member without a usable plastic moment (2026-11-05)

- SA-2026-045, fix #1525 (#1526): the 3D plastic solve (`solve_plastic_3d`, the PRO pushover), its certificate and its bundle treated a frame member whose plastic moment about either axis was missing, infinite or zero as one that never yields: a section missing from `sections`, a section without dimensions and with an inertia at or below 10⁻²⁰, or a zero Mp override. On the 3D portal sample (`verify/samples/plastic-3d-portal.input.json`), a column on such a section moved the collapse factor from 31.865 to 192.816 (6.05×), still reported as a mechanism and certified. A negative override was used as its absolute value. Both are now refused, naming the element and its section (`plastic_capacity_missing`), and the app says so in the reader's language. Models whose members all have positive plastic moments give the same numbers.

#### Harmonic analysis chooses between modal superposition and the direct solve per model and frequency, never per load (2026-11-06)

- Fix #1537, #1538, #1539, #1540 and #1541: since #1423 a frequency was solved directly when the residual of its modal response, which depends on the load, exceeded 10⁻², and the modal response was accepted below that. So a sum of loads could be solved one way and each load the other, which broke superposition and reciprocity, and accepted modal responses were off from the direct solve by up to 107 % at a node (a one-member 3D cantilever at 0.7 Hz: −9.14 instead of 139.4) with imaginary parts off by up to 8.6×. A 2D frame showed only the rotary-inertia warning. Now a model with fewer than 64 free DOFs is solved directly at every frequency (exact), and a larger one keeps the modal response only where the omitted modes are bounded (`q = |ω² − i a₀ω| / (λ_omit |1 + i a₁ω|)` at most 1/16, error under q² of their share) and solves the other frequencies directly, the same frequencies for every load. A modal response kept that way whose residual still exceeds 10⁻² is refused, never replaced for that load alone. Past the dense ceiling (more than 3000 DOFs) frequencies are not re-solved and HARM-TRUNCATION (#1434) still warns where the omitted modes are not corrected.

#### 3D buckling refuses a model whose only compression is round-off (2026-11-06)

3D buckling took the round-off axial force of an uncompressed member for compression, as 2D did before #959. On a cantilever loaded only across its length, that force moved with the model's orientation and load scale, and the analysis returned load factors from 1.49e-3 to 3.1e7, or refused, depending on the rotation (#1548). When every member's compression is within the round-off of its own elongation, 3D buckling and its certificate now refuse as not determinable, naming the largest compression, as 2D does. A model with a resolved compression anywhere gives the same factors.

#### Linear analysis warns when compression may amplify its moments past 10 % (2026-11-06)

A linear solve gave no warning when a member's compression was a large fraction of its critical load, for example a 3 m IPN 300 cantilever at 40 % of its Euler load, whose weak-axis moments are about 68 % larger in a second-order analysis (#1551). A linear static solve, 2D or 3D, now warns with `LIN-SECOND-ORDER` when N/Ncr may exceed 0.0748, where the worst elastic moment amplification, sec((π/2)·√(N/Ncr)), reaches 1.1, the limit CIRSOC 301 Appendix 7 takes for small second-order effects. The check uses member bounds only: a member clamped to a support at one end is judged against π²·E·I_min/(2L)², and one whose two ends sit on supports holding every translation against π²·E·I_min/L², each over its whole length and counting its axial span loads. A member over 0.0748/1.6, the largest CIRSOC 301 load factor, is named by `LIN-SECOND-ORDER-NEAR`. Any other compressed member warns `LIN-SECOND-ORDER-UNBOUNDED`, since its critical load cannot be bounded from the member alone. A load combination is bounded by the sum of its factored case ratios (each result records its largest N/Ncr as `resultSummary.secondOrderRatio`), keeps the members its cases name, and is unbounded when a case is unbounded or a factor is negative. Every CIRSOC 301 check is held, not passed, when any result warns `LIN-SECOND-ORDER` or `LIN-SECOND-ORDER-UNBOUNDED`, since H.1 takes the moments as second-order. Numerical values are unchanged.

#### 3D material-nonlinear analysis solves a frame without warping beside one with it, and a truss-only node (2026-11-06)

3D material-nonlinear analysis crashed with an out-of-bounds index when one section had a warping constant and another frame's section had none (#1578): that frame was assembled as 12 DOFs over the 14 a warping model gives each member. Its internal forces read the wrong 12 of those 14 as well. Each such frame now uses its own 12 DOFs, as the linear solver does. The tangent stiffness also lacked the small artificial stiffness the linear solver puts on DOFs no member holds (the rotation of a node reached only by trusses, or the warping of a node no warping member reaches), so those models were refused as singular. They now solve, and in the elastic range they give the linear solver's displacements. Models that solved before give the same numbers.

#### Modal analysis refuses a mechanism instead of dropping its zero mode (2026-11-03)

- Fix #338 (SA-2026-032): modes with ω² ≤ 1e-10 rad²/s² were skipped silently, so a mechanism
  (a member with a moment release and a free end) returned its other modes as complete: 3 of 12
  on the MYSTRAN differential model, with no diagnostic. Modal analysis, and the spectral and
  seismic analyses that use it, now refuse and name the mechanism when its zero modes move mass;
  a zero mode that moves none (a column free to spin) is reported in `nullModes` and listed by
  the app with the discarded modes.

#### 3D co-rotational analysis composes rotations instead of subtracting rotation vectors (2026-11-03)

The 3D co-rotational element formed each member's deformational end rotations by subtracting rotation vectors, which is exact only for rotations about one axis. With large rotations about several axes it misread bending and torsion: the Bathe–Bolourchi 45° bend converged 1.3 % away from Simo and Vu-Quoc's solution and refining the mesh did not help (#426, SA-2026-037). The element now works with rotation matrices and takes the deformational rotations as logarithms after removing the member's rigid rotation; the bend lies within 0.4 % of both Simo–Vu-Quoc and Cardona–Géradin, and an NL-3 warning appears where a member end turns more than 0.02 rad against its chord, since end forces still omit a finite-rotation term of about half that rotation. Planar frames and rotations about one axis below half a turn give the same numbers as before; a planar member turned a whole turn or more did not, and is worth re-checking. In addition, a solve ending with one member's ends turned more than 0.9π (about 160°) relative to each other is now refused, naming the member, because whole turns are ambiguous there: split such a member into shorter ones.

#### 3D buckling integrates each member's varying axial force (2026-11-05)

3D buckling built each member's geometric stiffness from its mean axial force, and judged whether a member was compressed from the average of its end forces. Under a load along a member's axis the force varies along it: where compression grows toward the end that rotates most the factor came out too high, 4.97 instead of 3.48 (+43 %) for a one-member cantilever whose compression rises to its tip, and a cantilever under q = 10 − 5x, with zero end forces and compression between them, was refused as having no compressed members (#456, SA-2026-038). The geometric stiffness now integrates the whole axial force along the member, as in 2D (SA-2026-042); one member gives 3.54 and 460.1 against the exact 3.48 and 455.7, and a finer mesh converges to them. The BU-SPAN-COMPRESSION warning is removed. Any 3D buckling model with a load along a member's axis may change, whichever member governs; models with no such load keep their factors, and their per-member table reads each member's mean axial force.

#### 2D: a mechanism hidden behind a rigid link or diaphragm is refused, not solved and certified (2026-11-03)

A 2D rigid link with no DOFs listed (which ties rotation) or a diaphragm, from a node whose members are all hinged to a node that only the constraint holds in rotation (a truss end), is a mechanism: the linked pair turns about the hinge. The 2D solver gave the slave's rotation the all-hinged artificial spring, the constraint turned it into a real spring on the mechanism, and the model solved to meaningless displacements (3.99e5 m in the test case, flagged as excessive) that the assembled-level certificate certified (#458). Such a model is now singular and refused on every 2D path. Models where something real holds the pair are unchanged. The 3D case of #458 (a rotation unstiffened about a skew axis) is not part of this fix.

#### Cutting a 3D model to 2D on Y–Z or X–Y keeps the meaning of its constraints (2026-11-03)

The 2D solver read every constraint as if the model stood in X–Z, so a Y–Z cut dropped a sway tie on uy and applied a tie on ux, out of the plane, as an in-plane one; diaphragms, rigid links, MPCs and eccentric connections were misread the same way on Y–Z and X–Y (#466, SA-2026-036). A cut now rewrites the constraints as if the frame stood in X–Z (axes renamed, the in-plane rotation's sign reversed in MPCs) and restores them with the 3D model, and the 2D results agree with 3D. A constraint that ties a movement in the plane to one out of it (a linear MPC with terms on both, or an eccentric connection offset out of the plane) is now refused on every plane, X–Z included, where it used to be dropped without a word. So is a cut that merges a constrained node into another, since the 2D model would keep a link to a node it no longer has. Re-cut, or solve in 3D, any 2D model with constraints taken from a Y–Z or X–Y cut before this version.

A project with constraints solved in 2D before this version opens with a re-check notice that asks for it to be re-cut from the 3D model or solved in 3D, since the file does not record the plane it was cut from.

#### CIRSOC 301 refuses a compression capacity with Qa ≤ 0 or above the squash load (2026-11-02)

- Fix #467 (SA-2026-030): a box or tube whose area is smaller than the plates its compression
  elements describe got a negative Qa in §E.7, a NaN slenderness and the elastic branch, and so a
  compression capacity above A·Fy (1 098 908 kN on a 976 kN section), and passed. The check now
  refuses Q ≤ 0 and any Fcr above Fy: the member is held with the reason. Re-check custom steel sections whose area was typed by hand.
  A round tube just past D/t = 0.11·E/Fy got Q up to 1.012 from E.7.2(c), and so a compression
  capacity up to 1.2 % high; Q is now capped at 1. Re-check such tubes that pass with little margin.

#### Design checks read 3D forces about the section's own axes (2026-11-02)

- Fix #532 (SA-2026-029): the CIRSOC 201 column check took Mz as a column's moment and checked it
  over depth h, though Mz bends the section over its width b. It now takes the larger of My and Mz
  over its own depth, turns the section when Mz governs, reads slenderness end moments from that
  axis and checks the other shear too. Rectangular columns bent mainly about Mz may need more bars:
  re-run the design.
- Engine/WASM: 3D design demands go through one mapping (`AxisDemand`: strong axis My with Vz, weak
  axis Mz with Vy). `certify_steel_multi_case_3d` checked web shear with the lateral Vy (zero under
  gravity) and now uses Vz; weak-axis shear is a separate check, "Shear G6", against the new `awWeak`, or left not
  evaluated. `extract_rc_demands_3d` used Mz as Mu; it now uses My and refuses members with
  weak-axis demand. The extraction functions take the peak shear, not the shear at the station of
  the largest moment. The single-plane certified converters return `Result` and refuse demands
  with a weak-axis component.

#### Aluminium checks shear along the weak axis (2026-11-03)

The EN 1999-1-1 aluminium check carried the weak-axis shear of each member but had no row for it: a member under lateral shear (a rail or purlin under wind, a column swaying about its weak axis) passed with no shear check (#532). A `Shear, weak axis` row now checks it (6.2.6) with the shear area of the parts parallel to it: the flanges of an I, the walls along the width of a rectangular tube. A circular tube, and a section checked with the 2A/3 fallback shear area (a solid rectangle), checks the resultant of its two shears.

#### Steel joints with a weak-axis moment are left unresolved (2026-11-03)

The joint typologies (shear tab, end plate, splice, gusset, base plate) read only each member's strong-axis end moment. A beam carrying a moment about its weak axis into a joint (pushed sideways, or under plan torsion) had it dropped, and the joint was designed and passed without it (#532). Such a joint is now left unresolved with the reason: release the moment if the joint is pinned about that axis, or design it by hand. A column continuing through the joint does not count; at a knee or a splice the column does.

#### EN 1992-1-1 flexure solves the neutral axis by strain compatibility (2026-11-02)

The EN 1992-1-1 check (PRO other codes, `check_ec2_members`, `certify_ec2_members`) assumed the
tension steel yields and took the compression-steel strain from the singly reinforced neutral
axis without iterating, so MRd was up to about 20 % high on over-reinforced beams and beams with
top bars, and a failing beam could be certified OK. The neutral axis is now the root of the
strain-compatible force balance (3.1.7 block, εcu3 from Table 3.1, steel 3.2.7 horizontal top
branch), in the f64 and the certified interval checks. Top bars inside the stress block are
taken net of the concrete they displace, and add nothing when in tension. Re-run the EN 1992-1-1 check on concrete
beams. Issue #534; PR #1236; results version 8; advisory
[SA-2026-028](docs/advisories/SA-2026-028-ec2-flexure-strain-compatibility.md).

#### Solid-shell stresses use local shell axes (2026-10-29)

- Fix #757: SHB8 solid-shell centroid stresses now use local shell axes, correcting
  sigmaXx, sigmaYy, tauXy and in-plane von Mises for vertical, inclined and curved
  panels. Re-run solid-shell models. Stiffness, displacements, reactions and full
  3D integration-point von Mises are unchanged. See
  [the frame definition and affected results](docs/results-changes/2026-10-solid-shell-stress-axes.md).

#### Time history: a load at t = 0 on a massless DOF starts from equilibrium (2026-11-03)

- Fix #760 (SA-2026-031): with a singular mass matrix, a force already on at t = 0 on a massless
  direction was left out of the initial state, so the first step started out of equilibrium:
  Maxwell–Betti reciprocity failed by up to 33× on fuzz models, and a two-DOF chain with a
  massless tip was 24 % of P/k2 off its discrete closed form. The load at t = 0 on massless
  rows now makes their velocity jump when damped (their displacement, when undamped), and the
  massive rows take the rest. A singular mass
  mixing several DOFs, or a massless part with no stiffness, now refuses instead of dividing by
  the diagonal of M or integrating a mechanism. Re-run time histories with step forces at 0 s on
  nodes without mass.

#### Safety containment diagnostics (2026-10-29)

- Register safety containment diagnostics (#807, #447): known-issue warnings added; numerical values of retained results are unchanged except the 2D reactions corrected for #1113. Unsafe affected results are withheld with structured refusals. See [Safety containment diagnostics](docs/results-changes/2026-10-containment.md).
- Preserve warnings across influence and moving-load sweeps and standalone spectral certification; warn on all 3D buckling factors pending #818. Run the read-only containment audit as an advisory check. Numerical values are unchanged.
- Preserve the model viewport during containment, retire failed advanced reruns, and carry localized refusals and warnings through tables and exports. Warn on MITC4 shell convergence uncertainty (#810); non-static rotated-shell operations remain available.
- Correct 2D reactions of a settled rigid support that also carries a spring on the settled DOF (#1113): the spring force −k·u is now included, so the reactions balance the loads. Fiber analyses now warn on near-singular tangents like the other nonlinear solvers (#1093).
- Warn on CIRSOC 201 column and biaxial checks whose axial force and moment come from different combinations (#1316): the check names both combinations and a passing member becomes a warning. Ratios are unchanged.
- Refuse 3D buckling, Guyan and Craig–Bampton reductions of models with distorted MITC4 elements, as 3D harmonic analysis already does (#798): their mode shapes and reduced matrices carry the locked membrane stiffness that the static field check cannot see.
- Warn on 2D and 3D P-Delta when members carry axial span loads (#1329): the geometric stiffness uses each member's mean axial force, which can understate the second-order amplification. Values are unchanged.

#### 3D buckling names the modes that round-off in the axial forces can move (2026-11-06)

3D buckling had no counterpart of 2D's BU-UNRESOLVED-MODE check (#982). A model with a real compression beside a member whose axial force is only round-off could return a mode driven by that member, with λ ≈ 1e10, and no warning saying it was not resolved: the #982 model placed in 3D did so in most orientations. 3D buckling now names, as 2D does, every mode whose geometric work round-off in the axial forces can change by more than 1 %, and the members that drive it. Load factors are unchanged; re-check any 3D buckling result that now carries this warning.

#### Basic: the course units return with their review fixes, and three result changes with them (2026-11-05)

- The course stack #1302–#1307 brings back the units #871 landed without review and #1372
  withdrew (results version 15). Each result change of results version 14 returns with the pull
  request that carries it, under its own results version:
  - Results version 27 (#1304): the influence line of M at a section takes M positive when it puts
    the bottom fibre in tension, as every other moment in Basic. Ordinates change sign; their
    magnitudes do not.
  - Results version 28 (#1305): Basic's P-Δ and critical load solve each member as 4 elements by
    default (1, 2, 4 or 8 can be chosen), and B₂ is 1/(1 − 1/λ₁) from the first buckling factor.
    Displacements, forces, B₂ and λcr move toward the converged values, most for slender members
    and members loaded along their length.
  - Results version 29 (#1306): the step-by-step plastic collapse closes hinges that unload and
    goes on to the true collapse (the portal example gives 71.30 instead of 64.06); a hinge that
    drifts along a member counts once, and a run that reaches no admissible mechanism within its
    step limit is reported as not confirmed.

Re-run moment influence lines, P-Δ, critical load and plastic collapse on plane models; the app
flags them. See [the affected results](docs/results-changes/2026-11-basic-course-returns.md).

#### Basic: the course units of #871 are withdrawn (2026-11-04)

- #871 reached main without its review fixes and is reverted. Plane plastic collapse, Basic P-Δ
  and critical load, and moment influence lines give the numbers of results version 13 again.

Re-run those analyses on plane models solved with results version 14. See
[the affected results](docs/results-changes/2026-11-basic-course-withdrawn.md).

#### Buckling factors outside their enclosure are refused (2026-10-29)

Buckling certification now refuses a reported factor above the independently certified
upper bound, in 2D and 3D, including constrained models. It does not widen the bound or
change the raw solver estimate. Re-run certification before relying on an earlier
buckling certificate. Issue #741; PR #817; results version 6. See
[the numerical evidence](docs/results-changes/2026-10-buckling-certificate.md).

#### Repeated eigenvalues retain their multiplicity (2026-10-29)

Lanczos now verifies completeness with a sparse Sturm (Sylvester inertia) count
of K − σM just above the requested eigenvalue boundary. Missing directions are
recovered with independent random starts and mass-orthogonal deflation, including
the full multiplicity of boundary clusters. There is no sparse-path DOF cap.
Failure to establish completeness within the iteration limit returns an explicit
refusal. Re-run modal and dependent dynamic analyses; frequencies, effective
masses and response combinations can change. The shared buckling path also checks
completeness in its positive stiffness metric.
Exactly massless DOFs are statically condensed before dense modal fallback, so
a near-zero mode cannot make the reciprocal cutoff discard higher physical modes.
Results version 9; issue #759; PR #827. See
[the results change](docs/results-changes/2026-10-modal-completeness.md).

The reported warping-mode orthogonality failures were separately traced to the
nightly checker omitting the returned seventh DOF. Its reconstruction now includes
warping. MD-ORTHOGONALITY containment is untouched and must be removed when both
branches land.

Modal postprocessing also refuses partial results if computed modes fail its
existing positive-frequency threshold, instead of silently returning fewer modes.

#### Static and modal runtime self-checks

Linear static and modal analyses in 2D and 3D now check equilibrium/residuals and modal mass orthogonality before returning results. Failed checks warn visibly; non-finite or severely failed checks refuse publication. Passing checks do not alter numerical results. See [Runtime self-checks](docs/safety/self-checks.md).

Residuals use dimensionally consistent diagonal energy scaling and no absolute RHS floor. Three-DOF 3D MPC reactions include Z and use 3D force labels. PRO warnings precede results, persist with displayed mode shapes, and appear in printable modal reports; recording controls meet 44 px target and 12 px text minimums.

#### The shell envelope holds each component's own extremes (2026-11-02)

The envelope of plates and quads kept each element's whole result from the combination with the
largest Von Mises, so every other component could be lower than another combination's: mx 77.94
where 90.93 governs on the mat foundation example (14 % low). Each component now has its own
largest and smallest value with its combination; principal stresses and required steel are the
extremes over the combinations. Slab and wall design are unchanged. See
[SA-2026-027](docs/advisories/SA-2026-027-shell-envelope-von-mises-record.md).

### Security

#### Backend dependencies updated, including assent's sign-in fix (2026-11-02)

The backend's assent (0.3.2, a fix in how Apple sign-in claims are checked), bandit, phoenix and
ssl_verify_fun are updated (#1069). Lock file only; the backend is not deployed yet, so no user
was exposed. No calculation changes.

### Added

#### A scheduled job that stays red opens an issue (2026-11-06)

- A daily workflow, Red nightlies (`.github/workflows/red-nightlies.yml`), reads the last scheduled
  runs on main of every scheduled workflow, job by job (matrix shards together). A job whose last
  two scheduled runs failed, timed out, or were cancelled by GitHub for exceeding their timeout
  opens one issue titled `Stays red: <workflow> / <job>`, labelled `nightly-red` and assigned to
  unbalancedparentheses and Batuis; later red runs comment on it, and the first green run closes
  it. The OpenSees comparison had been timing out every night since 21 October unnoticed: the
  workflow-level alert only said that Nightly verification as a whole was red.

#### The AI assistant works with your own Anthropic or OpenAI key (2026-11-01)

The AI panel was switched off while its server was being built. It now works with an API key you
paste in the panel: pick Anthropic (Claude) or OpenAI, paste the key, and the assistant builds and
edits models, and reviews results, as it was designed to. The key is kept only in this browser and
sent only to that provider (api.anthropic.com or api.openai.com), never to Stabileo; usage is
billed to your account with the provider. "Forget key" removes it. A proposal from the model is
still a draft: it is checked against the model's rules before it reaches the canvas, and the model
is solved only when you press Apply. Without a key the panel asks for one instead of showing
greyed-out controls. This is interim: when Stabileo's own AI service opens, the panel will use it
and a key will no longer be needed.

#### Trustworthy benchmarks, slice 1: check the model before trusting the comparison (2026-10-30)

Benchmark specifications now state the elements, geometry, restraints, loads, measured quantity,
units and tolerance, with two independent non-provisional references that must agree before a
solve (#862). A shared test-only generator checks applied loads, reactions, rigid motions,
support contracts, full versus reduced shell symmetry, and mesh convergence for Mattiasson,
the shallow-toggle truss and frame, Scordelis–Lo and the pinched cylinder.

Wrong variants from #845, #846 and #810 are kept as negative tests: the old elastica number,
a frame compared with a truss formula, and incorrect shell supports or loads must be rejected.
Convergence checks use every admitted reference, the finest mesh and extrapolation; a plateau,
growing error or oscillation reports a suspect model or reference. The two-element toggle gate
is a discrete comparison, not proof of continuum convergence.

Re-check the model and reference behind a failed benchmark before calling it an engine defect.
This slice changes tests and their evidence, not the production solver or existing accuracy
tolerances; previously solved user projects need no recalculation for it.

#### Benchmark gate: every benchmark has a spec, two references and a justified tolerance (2026-11-05)

`engine/tests/benchmarks/registry.json` records, for every benchmark, the quantity checked, its
references with citation, location and units, a justified tolerance and whether the references
are independent of the implementation's derivation. `make lint.engine` fails when a benchmark has
no spec, a quantity has fewer than two references without a reviewed exemption, a tolerance has
no justification, a test asserts a looser tolerance than its spec, or a pull request loosens a
spec tolerance without the `tolerance-change` label. Single-reference benchmarks (#1481) and the
unaudited legacy validation files (#1482) are listed as explicit exemptions. Tests and CI only;
no solver change, and no project needs recalculation.

#### Two blog posts on the 2026 talks, with photos (2026-11-03)

The blog now has one post on the JAIE 2026 talk in Córdoba (18 September) and one on the
Experiencia TIIC 2026 (20 October), each dated the day of its event and with two photos.
Posts gain a photo block, served like the screenshots: AVIF with a WebP fallback at two widths.

#### `make check.quick` runs CI's first checks for what a branch changed, before it is pushed (2026-11-05)

It runs the changelog, pin and test-target checks, and, for the areas a branch touches, the engine's
clippy, the backend's format and credo, the CI-script tests and the web typecheck, then the unit and
engine tests related to the changed files. docs/WORKFLOW.md makes it the step before each push.
`make test-changed` now runs the AI backend's tests for `ai-backend/` changes, and points to
`make test.backend` for `backend/` changes instead of running the AI backend's tests for them. A
change to the root `Cargo.toml`, `Cargo.lock`, `rust-toolchain.toml`, `engine/Cargo.toml` or
`engine/build.rs` now runs the engine's library tests.

#### Basic explains statics, the force method and the displacement method as a course unit (2026-11-03)

The force method lets you choose the primary structure, with axial stiffness on or off, bars and
springs written out term by term and the degree of indeterminacy explained. Virtual work computes
rotations and relative movements with springs, settlements and temperature. The classroom
displacement method counts and explains its kinematic unknowns, and the stiffness wizard can hold
members axially rigid.

#### Influence lines of N, displacements and rotations, with loading and envelopes (2026-11-03)

Influence lines cover the axial force, displacements and rotations at any section, member ends
included, explained step by step. A panel loads the line with permanent, live and point loads for
its extremes, draws the envelope along the member, and a load-cases panel finds the largest and
smallest effects. The influence line of a moment now reads positive where it tensions the bottom
fibre, as the static diagram's sagging side; re-check signs you read off earlier moment lines.

#### Plastic analysis explained step by step, with the static and kinematic methods (2026-11-03)

Plastic analysis shows each load step, the λ-displacement curve, plastic rotations and the
mechanism, checks a mechanism you place, and adds the static and kinematic methods. A collapse the
step-by-step analysis cannot resolve is reported as unresolved instead of as a collapse factor.

#### Structural dynamics in Basic: one and many degrees of freedom, mass models and point masses (2026-11-03)

Basic's dynamic panel adds one- and many-degree-of-freedom systems with modal superposition, mass
models with condensation, and point masses at nodes (with their rotary inertia), which the modal
analysis also uses. Point masses and the mass source travel in share links and in the project
workbook. An unstable or coupled system is refused instead of given a frequency.

#### SRSS versus CQC for closely spaced building modes

A research benchmark at `/research/benchmarks/cqc-1981`: one four-column
shear-building idealization, production modal and response-spectrum WASM solvers,
Stabileo's viewer and closed-form frequency, roof displacement and base-shear
comparisons. The verification block counts the nine closed-form checks and says
plainly that the paper's building and tables are not used; the citation reads
"method illustration based on". The engine's own ρ, recovered from the CQC and SRSS
base shears, is shown beside the closed form and tested at 1e-8 in the replay and in
live WASM. Six languages, a roof-displacement table and 44 px controls. Published
paper-example and time-history comparisons remain not yet done; this is research,
not a design tool.

#### An ETABS alternative page, and research pages share their own picture (2026-11-06)

A new page at /etabs-alternative, in six languages, says what Stabileo covers today, what it does
not (ETABS and SAP2000 models cannot be imported yet) and how its results are checked. The footer
links it next to the SAP2000 alternative. A research page whose thumbnail is a WebP image now uses
it, at its real size, as the picture a link preview shows. Footer links and social buttons, and the
standalone links on the comparison pages, are at least 44 px tall, so they are easier to tap on a
phone, and the footer's legal line is a little larger.

#### Three more live examples: RC column, outrigger and steel tower (2026-11-03)

/examples adds a reinforced concrete column section (CIRSOC 201 interaction diagram with the demand point, squash load and balanced point checked by hand), an outrigger on a tall core (top drift and column force against the Smith & Coull closed form, and a sweep over every storey that finds the best level) and a steel tower (first three frequencies against the cantilever frequency equation with a tip mass, and buckling against Euler with the engine's certified bracket). In six languages.

#### Live structural examples at /examples (2026-11-02)

A gallery of parametric models the engine solves again in the browser as a slider moves: a beam and portal frame playground (moment, shear and deflection, with closed forms beside single-load cases), a slab on columns in MITC4 shells (Navier's series on walls), and an earthquake time history of a concrete frame (Newmark average acceleration). Each result shows its certificate or the engine's refusal, links the check that verifies it, opens in the editor and keeps its settings in a share link. In six languages, linked from the landing hero and the site navigation. Published by Ergodic Group.

#### Five-node gridshell reproduction after Fairclough et al. (2026)

Adds one Table 1 square example at normalized unit weight 1.65, an isolated Rust/Clarabel solver,
an externally executed and hash-pinned author reference, numerical evidence, and a six-language
research page with live recomputation and editor export. The exported frame surrogate is checked
with the production engine, and the page now says what that check is (reaction and load bookkeeping,
not N ≈ σA or small bending). All 132 section areas are checked against πr², live results against
the committed layout, and every number on the page is read from the evidence; an author/Stabileo
toggle drives volume, height and the viewer. General catenary optimization and stability
verification remain out of scope. No engine numerical behavior changes.

#### Ferrari & Sigmund (2025): Roorda-frame research, first version (2026-10-29)

The page at /research/stability/ferrari-sigmund-2025 compares the Roorda frame's critical load
with production buckling and offers an imperfect arc-length path as replay or live computation
(#836). An isolated research crate checks beam-energy derivatives. The Koiter coefficient and
near-bifurcation comparisons remain unfinished, and the catalogue says implementation in
progress: this is groundwork for reproducing the paper, not a completed post-buckling validation.
Check those limits before relying on the example. Production solver results are unchanged.

#### Mechanism fuzzing of the linear certificate (2026-11-05)

A seeded generator builds 2D and 3D models that are mechanisms or near-mechanisms by construction (all-hinged or all-released nodes, connectors without moment stiffness, missing or partial supports, concurrent or parallel inclined supports, rigid links and diaphragms that carry a free rotation, a skew rotation left by a torsion release, and tiny rotational springs with a closed-form answer), each with its zero-energy modes known. The certified linear solve must refuse them, leave them uncertified, or be right: a certified result whose loads do work on a zero-energy mode, that moves along one, or that misses the closed-form answer fails. `make test.engine.mechanism-fuzz.quick` runs a checked-in seed corpus (for the per-PR tier) and `make test.engine.mechanism-fuzz.long DURATION=30m` runs fresh seeds and writes minimised reproducers (for the nightly and weekly tiers); the testing-cadence framework schedules them. The open issue they still hit, #458, is listed seeds and a regression file that fail once it is fixed. #1414, fixed by #1415, keeps a regression file that must be refused. #1437, which the fuzzer found (a soft rotational spring at a hinged 2D node replaced by the artificial stiffness) and #1428 fixed, keeps a regression file that must be solved exactly.

#### Metamorphic invariance checks across every analysis (2026-10-29)

The engine is checked to give the same answer for the same structure rescaled in units, renumbered, with members reversed and rigidly moved, plus superposition and reciprocity for linear analyses, across 17 analysis types: a fast set in every pull request and 8,192 generated models nightly. The known invariance bugs (#758–#762) keep explicit reproductions, ignored until fixed.

#### Invariance checks, slice 1: priority analyses and stiffness scaling (2026-10-31)

The metamorphic suite now runs strict geometric and superposition checks on the six priority analyses (linear, plastic collapse, time history, kinematic check, modal, buckling), with exact counts of the comparisons run so a dropped analysis fails, every comparison required to pass (no refusal, unreproduced or inconclusive result accepted), and stricter validation of modal and spectral results. Four of them also check uniform stiffness scaling (every E times k): linear displacements and rotations scale by 1/k with reactions and forces unchanged, modal frequencies by √k, buckling factors by k, and plastic collapse factors stay unchanged. Test-only: no solver results change.

#### Navier plate mesh convergence

A research page at `/research/benchmarks/navier-plate`. One uniformly loaded, simply supported rectangular plate, DKT and MITC4 mesh refinement through the production WASM wrapper, the shared Stabileo viewer, and centre displacement compared with the Navier series and a published worked example. DKT converges to the thin-plate series at second order; MITC4 with hard simple support converges at second order to the Reissner–Mindlin series (−0.142% at 16×16), and its soft-support results are labelled as a different problem rather than an accuracy ranking. Live, partial, cancelled and failed runs are distinguished; text in six languages; the viewer has keyboard pan, zoom and orbit. MITC9 is not exposed by the current web wrapper. This is research, not a design tool.

#### Newmark (1959): one SDOF step response

A research page at `/research/benchmarks/newmark-1959` runs the production WASM
time-history solver with Newmark average acceleration and compares an undamped
axial SDOF step response with its exact solution. Includes a shared JSON engine
benchmark, precomputed replay, Stabileo viewer, live recomputation, four time steps
showing period elongation, and English, Spanish and Portuguese text. The page says
what it is compared with (exact closed-form solutions and the native engine; no
printed figure is reproduced) and cites the paper as a benchmark, not a reproduction.
The engine test checks every model number and writes 13 checks (discrete error below
1e-10 m, period against Tₙ within 0.5 %, continuous error within the phase-lag bound),
which the page recomputes from the histories it shows. Playback runs at physical speed
with the viewer above the fold, 44 px controls and an accessible slider. Published
figures, damping, harmonic loads, nonlinear and multi-DOF examples are not yet covered.

#### An end-to-end check that no raw translation key is ever shown, in Spanish, English and Portuguese (2026-10-28)

The main screens (Basic empty, its settings and project panels, a solved model and its results,
the switch-to-2D dialog; PRO with design off, its settings, a solved model and the automatic loads
dialog; PRO with design on and the design desk) are opened in each offered language, and the test
fails if any visible text, tooltip, label or the window title is a translation key such as
`tabBar.newStructure`, the key the desktop app showed as its project name (#719). Nothing an
engineer sees changes.

#### Files saved by every release open, migrate and give the same results, and a newer file is refused by name (2026-11-03)

Every bundled example, saved and solved by v0.2.0, v0.3.0 and v0.4.0 with that release's own code,
is now opened, migrated and solved on every change, and its results must match what that release
showed unless the app's own re-check lists a registered result change that applies (#718, #770).
v0.3.0 and v0.4.0 files give exactly today's results. A project file saved by a newer Stabileo
used to be refused only as "invalid format", and a newer session file was not checked at all, so
its tabs opened anyway; both are now refused with a message saying a newer version saved them.
No calculation changes.

#### Stabileo Research: form-finding of a cable net (Pastrana et al. 2026) (2026-10-29)

Adds a scoped Pastrana et al. (2026) forward FDM experiment, a research Rust crate using the engine’s sparse solver, pinned jax_fdm reference results, localized replay/live controls and a 3D truss editor handoff. The page distinguishes its explicit demonstration inputs from published numerical results and excludes adjoints and inverse design. Restart returns to the first frame, the experiment sits above the introduction, input hints and units are translated, live recomputations are announced, and a failed recomputation keeps the replay; the questions for the authors moved from the page to the README.

#### PRO: a visible command search that reaches everything, and a split view with the plan (2026-11-02)

The ribbon has a search button ("Find a command", Ctrl/⌘ K, or "/") that finds every command by
name, now including what lives outside the ribbon: saving, the examples, the calculation report,
the results workbook, the drawings, checking an exported report, the project's regulations, the
view presets, the split and plan views, "show everything" and the settings.

"Split view", in the view menu and the View panel, puts beside the view the plan of the working
level (with the columns of the storey below it) or, when the view is in plan, the model in 3D. A
drag moves that half only, a click there selects as in the view, and its list of levels sets the
working level, which the plan view follows.

#### PRO's help under each option is one line you can turn off (2026-11-02)

The short line under PRO's options saying what each one does is now the same everywhere, and
"Help under each option" in PRO's settings turns it off; the browser remembers it. It is on to
begin with. Warnings and states (an empty list, a result that changed) stay with it off. The
analyses, the load cases and the report dialog gained their lines, in the six languages.

#### A linked IFC is drawn in 3D as a reference, in halftone, with what it could not draw (2026-11-02)

Grid and levels has "Linked models (IFC)": an architecture file, or another discipline's, is
linked and drawn in 3D over the model, in halftone by default, as context to model over. It is
not part of the analysis. The card says how many objects it draws with their shape, how many have
no 3D shape and are drawn as a point, and how many could not be placed, by IFC type. The project
keeps the link and the counts; the 3D shape stays in the browser, and a project opened on another
computer asks for the file again. "Update" takes a new version of the file. The same links feed
the coordination in the design desk, which compares versions object by object.

#### Master and similar storeys, and a scope for edits: this storey, the similar ones, or all (2026-11-02)

In Grid and levels, each level can be similar to a master level, marked as a column splice and given
a colour. On the view, "Scope" chooses where an edit reaches: this storey, the similar storeys or
all. With a wider scope, selecting a member, node or slab on one storey selects the same object on
the others, so editing, assigning and deleting the selection reaches them all in one undo step,
and a member drawn on a storey is drawn on its similar ones. "The same object" is the one of the
same kind at the same place in plan and the same heights above its level, within a centimetre; a
column of a taller similar storey is still the same column. The bar says how many objects the
selection took and how many had no counterpart. The plan view steps a storey up or down with ▲ ▼
or Page Up and Page Down.

#### Plate results: forces per unit width, faces, principal moments and directions, averaged per plate (2026-11-02)

The shell contour offers the membrane forces Nx, Ny and Nxy per unit width, the transverse shears
Vx, Vy and Vmax (where the elements give them) and the principal moments Mmax and Mmin. Stresses
can be read on the mid-surface, on the top or bottom face, or on the more stressed face; by default
Von Mises is read on the more stressed face, as before, and the other stresses on the mid-surface,
where Von Mises is that of the membrane stresses alone. At the nodes, values (Von Mises too) average over the
whole model, within each physical plate, or within each group, so a wall and the slab it meets keep
their own values at their common edge. The principal directions can be drawn on each element, in red
where they pull and blue where they push, and the largest and smallest values written on the
model. Hovering a shell reads its value and the span its corners are painted with. The legend, the
results along a line and the exported figures read the same field.

#### A read-only viewer for a PRO model, with "Duplicate and edit" (2026-11-02)

"Copy read-only link" in Project shares a model that opens in a viewer: its name, who signs it
and its size, the model in 3D, in plan level by level or both side by side, and a gallery of the
examples, without the editor. Nothing of it is saved in the reader's browser until they press
"Duplicate and edit", which turns it into an ordinary PRO tab with their own copy.

#### The report after the analysis: model, analysis and design in one list you can export (2026-11-02)

PRO's Diagnostics opens with the report after the analysis. Beside the model's checks and the
solver's findings it lists the analysis's own: each load case whose loads and reactions do not
balance, by how much and what the check could not add up, or that they all balance; whether the
P-Delta iteration converged, in how many iterations and with which B2, or found the structure
unstable; and a mechanism, with its nodes. With the design on, it lists the members the design does
not approve and why, or says they all verify. A line selects what it names. The whole report
downloads as CSV, PDF or Word.

#### PRO says in its header whether the project is saved (2026-11-02)

Beside the settings, PRO shows where the project stands against its autosave: "Saving…",
"Saved 2 minutes ago", "Unsaved changes", "Saved to limited storage" when the browser only offers
its small fallback storage, or "Could not save". With unsaved changes a click saves now; otherwise
it opens the autosave in Project. It used to be visible only in the Project tab. The autosave
itself works as before, in this browser; saving to an account comes with sign-in.

#### PRO's videos beside the examples (2026-11-02)

The Project tab lists PRO's two upcoming videos beside the examples, each marked "Coming soon" until
it is published: how a building is modelled in PRO, and the full walkthrough of a three-storey
building from the grid to the report, each with what it shows and how long it is. Once published,
each opens on YouTube in the interface's language where there is a version in it, and the first
time PRO opens in a browser a card recommends the short one; dismissed or followed, it does not come
back. The videos take the place of a long guided tutorial inside the app.

#### PRO's view shows each kind of object, in halftone or not at all, and named views remember it (2026-11-02)

The View panel has a row per category (members, nodes, slabs and walls, supports, loads, labels,
background drawings and linked models) with three states: shown, halftone, or hidden. Halftone
keeps a category as faint context; hidden takes it out of the drawing, of picking and of "select
all", while it is still analysed and saved. While something is hidden the viewport names it, with
a button to show everything. The drawing style (lines, thick bars, sections, physical geometry)
is also chosen there. A named view now keeps the categories and the style with the camera, and
"Update" makes a view take what is on screen, so it opens that way next time.

#### The deployed site is checked after a deploy and every hour (2026-10-28)

Production and staging now get a browser health check after successful deploys or rollbacks and
hourly (#738, #720). It checks the landing page, a blog page and backend health, opens Basic,
loads the deployed WASM engine with the right content type and solves a reference cantilever
against its closed-form result. A failing site opens one issue, updates it while the failure
persists and closes it on recovery. This catches a broken deployed build even when the build
itself passed. Re-check the site's health run and reference solve after a deployment failure.

#### German, French and Turkish throughout the app and public site (2026-10-29)

The language chooser offers German, French and Turkish alongside Spanish, English and Portuguese
(#780–#783). The new dictionaries cover the editor, steel checks and step-by-step explanations;
the public site, standing pages, release notes and translated blog articles use the same locale.
Only articles available in a language appear in its sitemap and feeds. Full app dictionaries load
for the chosen language, and a coverage gate catches missing keys and undeclared English text.
Re-check saved language preferences, public links and exported labels in the newly offered
languages. Model data and calculation results are unchanged.

#### Stabileo Research catalogue: 19 more verified papers (2026-10-29)

The research catalogue lists 19 more papers, each verified against Crossref: the origins of the finite element method, Newmark, the CQC rule, Riks and Crisfield, Bathe–Dvorkin MITC shells, MacNeal–Harder, Zienkiewicz–Zhu and others, as catalogue records (#788, integrated in #857). A catalogue record alone does not mean an experiment is runnable or validated; the gallery and each paper's status distinguish the live implementations from proposed work. Check those statuses and the stated evidence before relying on a reproduction.

#### Curvature-patterned snapping arches in Stabileo Research

Adds the centered shallow-arch experiment after Zmyślony, Khan and Biggins (2026),
with production frame buckling modes, a research modal-equilibrium layer, replay,
live WASM recomputation and translated controls. Checks the published 70% threshold
(now to 0.005, half the last printed digit, with an error budget) and a regenerated
Zenodo software curve, plus independent equilibrium invariants and the critical
pre/post-snap frame pair; evidence files must equal fresh output exactly. The chart
has a legend and a data table, the viewer sits near the top, and the page is in six
languages. The equilibrium jump is not a transient snap simulation or experimental
validation. Production engine code is unchanged.

#### DaDeppo–Schmidt deep arch benchmark

Research page at `/research/benchmarks/dadeppo-arch-1975`: one 215° clamped–hinged arch traced with the production corotational arc-length solver, shared native/WASM case, Stabileo viewer, precomputed replay and live recomputation. Compares the limit load (PR²/EI = 8.97) and the crown state at the limit point (u/R, v/R, rotation) with Table 1 of the 1975 paper as quoted by Schmidt (2000), with tolerances derived from a 20/40/80-element mesh study. Text in all six site languages.

#### Research benchmarks in engine CI (2026-10-29)

Check research-page reference quantities directly through production solvers in the engine validation suite, including MacNeal–Harder, Riks/Crisfield, shell obstacles, Mattiasson, Roorda buckling, arch modes and the exported gridshell frame. Document source provenance and existing coverage. Keep known inaccurate results and newly exposed reference mismatches as explicitly ignored tests with their original tolerances; no engine numerics changed.

#### Lee frame (1968) research benchmark

A pinned 120 × 120 cm Lee frame at
`/research/benchmarks/lee-frame-1968`, traced with the production corotational
arc-length solver and displayed in Stabileo’s viewer. Includes a shared engine
case, first-peak regression test, a mesh (20/40/80 elements) and arc-length step
study, replay, live WASM recomputation, text in six locales, and a first-peak
comparison, to the nearest percent, with a by-eye reading of the pinned curve in
de Souza, Vanalli & de Luz (2020), Figure 10.

#### Stabileo Research: MacNeal–Harder benchmark page (2026-10-29)

The 1985 MacNeal–Harder element tests run on the production engine in the browser, sharing one case file with the engine tests: 8 of 12 pass at 2%; two distorted out-of-plane cases fail the accuracy target, and the two distorted in-plane cases are shown as withheld by the engine (known issue #798). Native and WASM checks require those containment refusals; they do not count as accuracy passes. (PR #797)

#### Stabileo Research: Mattiasson elastica page (2026-10-29)

A cantilever traced by the production co-rotational solver until it curls, compared with the exact elliptic-integral values. Corrected area and stepping, five analytical checks below 0.1%, complete translations and responsive playback controls. The mesh error ceilings and the axial-extension bound now live in the shared case file read by the Rust test, the SciPy reference and the page; all 21 cases must reach full load with no failures; the slider label follows the shown case and the evidence link is pinned to the build commit.

#### Classic plastic collapse benchmark

One fixed-base portal at `/research/benchmarks/plastic-collapse`, using the
production 3D plastic-collapse WASM solver and Stabileo viewer, compared with beam,
sway and combined virtual-work bounds. The native test asserts every hinge event
(element, end, order, sign, |My| = Mp, λ within 1e-6), equilibrium, the corner moment
and that no other member end yields; the live WASM run is compared with the replay
event by event. The bounds are our own hand derivations (Horne as background), the
header counts the six hand-calculation checks, and the page adds hinge-event and
displacement tables, a status region and six languages. No production numerics or
tolerances changed.

#### Stabileo Research: shell obstacle course page (2026-10-29)

The Scordelis–Lo roof, pinched cylinder and pinched hemisphere run on the production engine with mesh refinement: the hemisphere passes; the roof plateaus about 15% stiff and the cylinder error grows with refinement, shown as failures and under triage (#810).

#### Research and calculators link to each other (2026-11-02)

Each calculator page links to the research benchmarks that check the same mechanics, each of those research pages links back to its calculators, and both link to the research gallery, the calculators and the blog, in the reader's language. Research links go to the language the paper page is published in.

#### Runnable MBB topology optimization research experiment (2026-10-29)

Add an isolated Andreassen et al. experiment: SIMP/OC on the engine's sparse Cholesky, both original filters, full-precision Octave reference capture, and a shared-viewer research page with replay and live worker computation. Numerical agreement is distinct from experimental validation; no published-figure agreement is claimed. Round 2 reviewed by Kimi, Codex and Claude (2026-10-31): the page names its comparison source (the unmodified top88.m in GNU Octave) instead of a not-compared placeholder, with measured iteration counts, 44 px controls and 12 px text, the viewer near the top, keyboard pan and zoom with a data table, and Escape closing the viewer menu.

The filter selector also has its own accessible label, so assistive technology reads the control
name without appending all its options (#857). Re-check the density and sensitivity filter
choices when replaying or recomputing the example.

#### Results snapshot gate: envelopes, newly produced results and removed cases count (2026-10-28)

The results snapshot gate (#716) now also records the combinations' envelopes and the combination
that governs each member, counts a result the app starts producing (another combination, mode or
limit state) as a change to register, and fails when a corpus case is removed without deleting
its snapshot, so the deletion is registered too. A spectral mode's participation is compared by
magnitude, since its sign is the eigenvector's. Nothing an engineer sees changes.

#### Results snapshot gate: a pull request that changes a result must say so (2026-10-28)

A reference corpus of 39 projects (the bundled examples in Basic 2D, Basic 3D and PRO; shells,
combinations, P-Δ, modal, spectral and buckling; the CIRSOC 201, CIRSOC 301 and footing checks with
PRO's design on) is solved through the app's own solve and design path on every pull request and
in the merge queue, and compared with committed snapshots (`web/results-snapshots/`) to one part
per million. A pull request whose snapshots move must add an entry to the registry of result
changes and a `BREAKING (results)` changelog fragment, so the engineers whose projects it affects
are told when they open them; `make snapshots-update` regenerates the snapshots. Nothing an
engineer sees changes (#716).

#### Arc-length benchmarks: Riks and Crisfield (2026-10-29)

Added a Riks–Crisfield research page that runs Stabileo’s production arc-length solver on shared two-bar cases, compares native and browser WASM results and opens the models in the editor. A limit point now counts only when the load drops between converged frames; an unreached limit is shown as not evaluated. The page says the run passes the upper limit point and does not reach the lower limit, and that it is a method benchmark against analytical equilibrium and native results, not a reproduction of the papers' examples. Per-metric tolerances were tightened from 5 % (peak load 1e-3, peak displacement 5e-3, path residual 5e-5) with a finer step and parabolic peak interpolation; the page is in six languages.

#### Stabileo Research (2026-10-28)

Browse computational-mechanics papers and run the Shauer phase-field fracture experiment with replay, live computation and reference comparisons. Explore Grossman & Boudaoud (2026) spring networks, auxetic response and elastic moduli with published comparisons. Research, not a design tool.

#### The JAIE 2026 paper, in full (2026-10-29)

The paper "Developing a structural calculation agent on top of a verified solver", presented in
Spanish at the 29th JAIE, can be read whole at /paper in English, set like its LaTeX article with
its equations, tables, figures and references. It downloads as the LaTeX-typeset PDF, and the
Spanish original is offered beside it. It sits between Blog and Research in the site header.

#### Continuous beams, portals, trusses, influence lines and beam frequencies (2026-10-29)

Stage: first version. Reviews: 0.

Five localized Stabileo Tools use the production engine for continuous beams, single-bay portals, editable planar trusses, moving-load influence lines and beam bending frequencies. Includes independent classical comparisons, engine diagrams and mode shapes, validated input limits, editor handoff, and responsive viewer-first layouts. Assumptions and sampling limits are explicit; portal references neglect axial deformation, and modal results exclude axial modes. Tool dictionaries and analysis stay behind the tools route boundary.

#### Every batch-two Tool is render-tested in all six languages (2026-10-30)

The continuous beam, portal, truss, influence-line and beam-frequency pages now have server-render
tests in English, Spanish, Portuguese, German, French and Turkish (#877): 30 cases check the
translated title, viewer container, input form, localized gallery link and absence of raw Tools
keys. This catches missing page content or translations before publication; it does not replace
browser interaction or numerical tests. Re-check these cases when changing a Tool's page or
locale. Calculator results are unchanged.

#### Free beam and elastic column calculators (2026-10-29)

Stage: first version. Reviews: 0.

Stabileo Tools adds localized public calculators for simply supported beams, cantilevers and elastic column buckling, with production-engine results, independent formulas, worked examples and an editor handoff. Assumes linear elasticity, small deflection and prismatic Euler–Bernoulli members; this is not a code design check. Buckling comparisons expose finite-element error and the rounded fixed–pinned K = 0.7 approximation.

#### A public changelog at /changelog, linked from the landing nav (2026-10-29)

What reached stabileo.com since the first version in February 2026: a month at a time until April,
then one entry per weekly report, in Spanish, English, Portuguese, German, French and Turkish. The page draws the history on
a timeline by month, groups each entry's changes by area (Basic, PRO, Education, App, Engine,
Website), filters by area and shows screenshots of what changed. It sits beside "Blog" in the site header
of every public page and in the footer. Nothing in the editor changes.

Re-check the timeline filters and language links when adding an entry (#790).

### Changed

#### The merge queue runs the `@slow` E2E specs (2026-11-06)

The merge queue (`merge_group`) now runs every `@slow` Playwright spec whenever the queued entry changes
anything that can reach the app, sharded across the 14 E2E runners by measured duration (#1519). A spec
counts as slow when it, or a helper it imports directly or transitively, carries the `@slow` tag. Only
these select nothing: docs, changelog fragments, the backend and AI backend, engine tests and benches,
script tests, web unit-test files and web script tests, the paper, admin, account and Tools pages.
Research-only paths select the research specs, and a changed spec file selects itself when it is slow.
A missing diff, a script error, or a spec list with any invalid or unmatched entry runs the full suite.

#### Engine wall-clock budgets report on pull requests instead of failing (2026-11-06)

Engine wall-clock budgets (the perf regression gates and the timed tests Engine Gates runs alone) now report an overrun on pull requests and in the merge queue instead of failing Engine Gates. Main and the nightly run still fail on one. Every performance budget goes through `wall_clock::budget`, and the wall-clock lint rejects a bare `assert!` on elapsed time, except in the fuzz watchdog test, whose timeout is the contract under test.

#### Timing budgets report on pull requests and fail on main (2026-11-06)

The Timing Budgets job (the scale budgets and the `@slow` wall-clock E2E budgets) failed CI OK on pull requests and in the merge queue whenever a shared runner stalled, which threw a merge group out of the queue and cancelled the runs behind it (#1562). Over 134 recent runs it failed twice, both times on the physical-view frame of the model-fluidity check (691 ms against a 275 ms budget in the merge queue, with a 600 s timeout on the retry), while the median run used 58 % of that budget and the scale budgets never came within 2.6× of theirs. On pull requests and in the merge queue only the time comparisons are soft now: an overrun is recorded and shown as a warning in the run summary without failing CI OK, while a crash or any other failed check in those tests still fails; pushes to main, the nightly run and manual runs on main still fail on it, and open (or comment on) a `CI failure: Timing Budgets on main` issue, closed again by the next green run of main's head.

#### Pull requests get automatic AI reviews (2026-11-03)

- Pull requests that are ready for review, other than Dependabot's, get one review comment each
  from six AI reviewers, and owners, members and collaborators can re-run one or all of them with a
  slash command (#1245). The reviews are advisory; the merge rules in `docs/WORKFLOW.md` still
  apply.

#### Basic 3D: a grid 100 m across, and examples without node IDs (2026-10-29)

Basic 3D's grid is 100 m across by default (it was 50 m). A 3D example now opens with node IDs off,
as in PRO, where they crowd the larger models; the setting stays at hand, and a model built from
scratch keeps them on.

#### Copy and paste in Basic work as in PRO: what is selected, placed with a ghost (2026-10-29)

In Basic 2D and 3D, Ctrl+V pasted at once, one metre over (or three metres up in 3D), on top of the
original, and Ctrl+C took the members between copied nodes too. Copy now takes what is selected:
nodes alone come without members, a member brings its two nodes. Ctrl+V shows the copy as a ghost
that follows the pointer, snapping to nodes and the grid, with the placement bar of PRO above the
model: a click places it, Shift+click places and keeps going, R turns it, F mirrors it, Tab changes
the anchor, the bar takes exact coordinates (X and Z in 2D) and Esc cancels. Ctrl+Shift+V pastes in
place. Ctrl+X removes the selection and the nodes nothing else uses, as in PRO.

Beside the delete button there are now copy and paste buttons, in the options bar on a desktop and
over the model on a phone: copy shows while something is selected, paste once something was copied.
On a phone the ghost follows the finger and lifting it places the copy.

#### "Check an exported report…" moves under the report, as a link (2026-10-28)

The button that re-solves a project and compares it with an exported report's provenance stood in
the File row beside Save and Open, in PRO and in Basic, under the name "Reproduce from
provenance…". It is now a quiet link under the report button, in the report group, named "Check an
exported report…". The dialog and what it does are unchanged.

#### CI runs on Stabileo's own runners, and superseded runs cancel themselves (2026-11-02)

With `STABILEO_SELF_HOSTED` on, every CI job that builds or tests runs on the
self-hosted stabileo-ci-1 runners (except Determinism, for WebKit, and Docker
build smoke) for the merge queue and pushes to main, and, with
`STABILEO_PR_POOL`, for pull requests from this repository's branches (on
`stabileo-pr` runners, so the merge queue always keeps runners of its own). Fork
and Dependabot pull requests stay on GitHub. The timing-sensitive jobs (Engine
Gates, Web Unit, research engine benchmarks) move only to pinned `stabileo-timing`
runners (`STABILEO_TIMING_POOL`), and nightly fuzzing only to `stabileo-nightly`
runners (`STABILEO_NIGHTLY_POOL`). A merge-group run whose PR left or was rebuilt
in the queue is cancelled. Main and nightly runs are never cancelled. Every job has
a timeout. Engine Suite and Web Unit now run in four shards each. CI's `rust` and
`npm` jobs, which mirrored CI OK under the names of the required dependency
audits, are gone, so those required checks are the audits again.

#### CI retries an artifact download that GitHub's storage refuses with a 5xx (2026-11-03)

`gh run download` failing with HTTP 500, 502, 503 or 504 from GitHub's artifact storage (for
example "503 Egress is over the account limit") is now retried as an infrastructure failure
instead of failing the job. A 404 or any other error still fails at once.

#### Browser system packages come from the Actions cache on hosted runners (2026-11-04)

Every hosted job that installs Playwright's system packages (E2E shards, E2E Site, Web Build, Determinism,
Timing Budgets, the flaky suite) now goes through one action. That action keeps apt's downloaded
packages in the Actions cache, keyed by runner image, browsers and lockfile, so apt no longer fetches
them from Ubuntu's mirror on each run. The mirror sometimes serves at about 50 kB/s: 21 MB took
6.5 minutes and was the slowest step of an E2E shard. The action also has apt wait up to 5 minutes
for the dpkg lock.

#### E2E shards balance from times measured on recent main and merge-queue runs (2026-11-05)

Each main and merge-queue run that passes the full E2E smoke suite now saves how long every spec file
took. The next runs split the smoke specs across their shards from that measured table instead of the
committed one, so the shards finish closer together as specs grow or get faster. A run that cannot
find a recent table uses the committed one, and every shard always reads the same table, so each spec
still runs exactly once.

#### E2E shards run on GitHub's runners again (2026-11-03)

The E2E shards (and quarantined E2E) always run on GitHub-hosted runners: all ten start at
once and take about 11 minutes, against about 18 minutes and a queue on the shared self-hosted
host. The site they test is still built once on the self-hosted runners.

#### A pull request's lint, typecheck and unit failures turn red sooner and stop the rest of the run (2026-11-05)

Web typechecking is now its own Web Typecheck job. It needs only the engine WASM, so it no longer waits
for the research assets and the site build's setup. Web Unit runs in eight shards instead of four. On
pull requests from this repository's branches, Web Unit stops at its first failing test. When Lint
Repo, Test CI Scripts, Lint Engine, Lint Backend, Web Typecheck or Web Unit fails on such a pull
request, the run is cancelled once that job has ended as a failure, so the failed check stays red
and the long E2E and build jobs stop. A small workflow, Stop a failed pull request run, does the
cancelling. CI OK still reports the failure. Pull requests from forks get a read-only token, so
their runs are not cancelled; they run to the end as before. The merge queue and main still run every
test.

#### Pull request CI reruns infrastructure failures once by itself (2026-11-04)

When every failed job of a pull request's CI, Research or Supply chain run shows infrastructure
evidence (a job timeout or exit 137 outside a test step, a lost runner, or a cache, artifact or
network error in a download step), its failed jobs are rerun once automatically, and the summary of
the Infrastructure retry run records why. Test, build and lint failures are never retried, nor is
anything unrecognised.

#### A lighter merge queue, with a revert when main fails (2026-11-02)

The merge queue now runs what combining PRs can break and skips the heavy jobs that
it rarely breaks: slow E2E, visual baselines, Docker build smoke, Determinism,
quarantined E2E and research validation beyond route budgets. Pushes to main and a
new nightly CI run (03:30 UTC) still run everything. When a push to main fails twice,
a post-merge workflow opens a signed revert PR of the merges since the last green
push and notifies the ntfy topic. Once approved and green, it jumps the merge queue.

Browser jobs (E2E, E2E Site and the quarantined E2E) can be limited to a smaller set of runners
labelled `stabileo-e2e` once the repository variable `STABILEO_E2E_POOL` is `true`, so a host no
longer runs a dozen headless Chromes at once; without it they stay on the `stabileo` pool.

Outside the PR pool (same-repository pull requests, when `STABILEO_PR_POOL` is on), the
self-hosted runners take only the merge queue and runs on `main` (pushes, the nightly run and
manual runs of `main`); a manual run of any other branch goes to GitHub-hosted runners.

#### Only the newest main commit runs post-merge CI and proofs (2026-11-04)

When merges land close together, each push to main ran the whole post-merge CI and Verify
workflows, even though the next push contains the same commits. Between 06:00 and 18:15 UTC on
2026-11-04, 598 CI job-minutes and 430 Verify job-minutes ran after a newer main push had already
started. These runs held the self-hosted runners while the merge queue waited. A push to main now
cancels the main run still in progress in each of the two workflows. Merge-queue, scheduled and
dispatched runs are never cancelled this way. Deploy runs in its own workflow and is unaffected.
The post-merge revert ignores cancelled runs and blames every merge since the last green one.

#### A mutation-testing shard that does not finish no longer waits 16 nights for its turn (2026-11-05)

The nightly mutation run picks the 32 shards that went longest without running to their verdict,
instead of a fixed block by day. A shard lost to a runner failure or to its time budget used to
wait for the next full pass, 16 nights later; it is now retried once ahead of shards with a newer
report, and a shard that misses twice waits its turn like one that just ran.

#### The nightly verification runs at night (2026-11-04)

The nightly verification run takes about seven hours on the self-hosted runners. It started at
05:00 UTC, so it competed with pull requests and the merge queue until about noon. A dispatch at 14:01
held the nightly pool all afternoon: dispatched nightly runs took 23% of all self-hosted runner time
between 06:00 and 18:15. The scheduled run now starts at 00:00 UTC. A dispatch takes the nightly
pool only between 00:00 and 07:00 UTC; the rest of the day it runs on GitHub-hosted runners and
says so in a notice.

#### Docs, research prose and site-only changes run a smaller CI (2026-11-04)

A pull request that changes only docs, the changelog or research papers' prose (Markdown outside
`research/tools/`) now runs no build: repository lint, plus the research checks for research prose.
One that changes only the site (components, blog, locale strings, end-to-end tests, route budgets,
outside the package manifests and the compiled WASM) runs everything except the engine, AI-backend
and backend jobs and the full research validation (only its route checks run): WASM, the site build, the E2E site and every E2E shard still run.

The merge queue scopes each entry the same way, by its diff against the entry ahead of it: an entry of
docs only runs no build, and one touching only the site, research or tools skips the engine jobs. Any entry that
touches the engine, the toolchain or anything unrecognised runs the full queue set; pushes to main
and the nightly run still run everything.

#### Pull requests take the self-hosted runners only for their critical-path builds (2026-11-03)

A pull request's WASM, Research WASM and e2e site builds run on the self-hosted pull request
runners, where their caches are warm; every other pull request job runs on GitHub, where thirty
start at once, instead of queueing for four runners. Checks that take a minute or less run on
GitHub for the merge queue too, leaving the self-hosted runners to the builds and test suites.

#### The merge queue's longest chain is shorter (2026-11-04)

The end-to-end smoke suite runs in fourteen shards instead of ten, balanced from fresh timings (the
old table predicted 41.5 min of tests where the queue ran 69.8, so one shard took 11.7 min and
another 3.0). GitHub-hosted jobs free their disk space in the background instead of waiting about
2.5 minutes for it. With `STABILEO_ENGINE_POOL` set, the engine suite and metamorphic tests run on
their own runners, so WASM, research WASM and the end-to-end site start without waiting.

#### Each merge-queue entry is scoped by its own change (2026-11-04)

A merge-queue run now picks its scope (full, site, docs) from the diff against
the entry ahead of it, not against main, so a docs or site change queued behind
an engine change no longer runs the whole engine pipeline again. The entry ahead
tests everything it brings and must pass before this one merges. A run whose
history can't be read still falls back to the full pipeline.

#### Pull requests reuse research WASM bundles that the merge queue and main built (2026-11-04)

Research WASM takes 28% of the self-hosted runners' time. Pull requests rebuilt every bundle,
because main's Actions caches had been evicted and a pull request can't read another pull
request's cache. Now the queue-only runners, which never take a pull request, keep each bundle they
build in a directory on the host, keyed like the Actions cache and checked against a SHA-256
manifest. A pull request whose research inputs match reuses that bundle. Only those runners can
write the directory, and merge-queue and main runs never read it.

#### Research validation runs once per merged commit and leaves the merge queue's runners free (2026-11-05)

A commit merged to main used to run every research validation twice: once from CI and once from the
standalone Research workflow. The standalone workflow now runs only its online catalog check on push
(and everything on its weekly schedule). CI's run covers the rest, and the research filter in CI
selects every path that used to trigger the standalone run. While the pull request runner pool is
on, these post-merge research jobs also run on that pool instead of the runners kept for the merge
queue, so queued pull requests wait less for a runner. The engine benchmarks keep the timing runners
they share with the queue.

#### Research WASM builds its bundles in parallel (2026-11-03)

The research WASM bundles that missed their cache build at the same time, each in its own
target directory, instead of one after another: about 6 minutes instead of 15 when the engine
changes. Every bundle's log is printed, and any failed bundle fails the job by name.

#### Research WASM rebuilds only the bundles whose inputs changed (2026-11-03)

Each of the six research WASM bundles has its own build cache, keyed on its crate, the engine
(every bundle links it), the shared toolchain and research tooling. A change to one research
crate rebuilds only that bundle instead of all six.

#### CI tools use a GitHub runner's thread counts on every runner (2026-11-03)

Cargo, the Rust test harnesses, rayon, vitest, binaryen and esbuild get the thread counts they
already pick on GitHub's four-vCPU runners, in CI and Research, so each tool on the shared
self-hosted runner no longer sizes itself to every core of the machine. These are per-tool
limits, not a cap on a whole job; nothing changes on GitHub's runners.

#### Web Build's production-build tests reuse the build CI just made (2026-11-04)

`make test.web.build` builds the site once and builds a second copy with a Vite manifest. It stamps
both with a hash of the files each holds and of the sources it was built from: the commit, web/ and research/, the engine and
research WASM, the Vite env files, and the build variables (`VITE_*`, `BASE_PATH`, `GITHUB_SHA`, `NODE_ENV`), recorded before Vitest starts. The production-build tests then read those two builds instead
of making four more. A test refuses a shared build whose sources or files differ from its stamp, so a
stale build fails and is never tested in place of the current one. The VITE_E2E build in the
hook-gating test is still its own, and run on their own, outside `make test.web.build`, the tests still
build what they need.

#### The degree of indeterminacy is counted one way everywhere, and plane governing combinations look along the whole member (2026-11-03)

The kinematic panel, the stiffness wizard and the force method now share one count of the degree
of indeterminacy, GH = 3·m + r − 3·n − c, with the internal hinges (c) written out, and split it
into its external and internal parts. In the plane workspace the governing combination of a member
is chosen by the largest moment, shear and axial force anywhere along it, not only at its ends: a
span load whose peak is at midspan now picks the combination that governs there. Re-check governing
combinations of plane members with span loads.

#### Basic's P-Delta and buckling run with a chosen method and discretization, explained step by step (2026-11-03)

P-Delta offers the geometric or the chord matrix and the stability functions, at a chosen number
of elements per member, with its iterations step by step. B₂ is now 1/(1 − 1/λ₁) from Basic's own
buckling at the same discretization, shown beside the largest displacement amplification. Buckling
is computed with 4 elements per member by default and refuses a factor the discretization cannot
represent instead of reporting it. Re-check B₂ and buckling factors from Basic's 2D panel.

#### The step-by-step course loads when it is opened (2026-11-03)

The explained step-by-step catalog, the stiffness and flexibility wizards, and their texts in every
language are now a separate download that the app fetches the first time the Advanced panel opens.
Opening the app without it is about 1.1 MB lighter.

#### The deformed shape writes its displacements only when asked (2026-10-29)

The deformed shape wrote every node's displacement on the drawing, under the same "show values"
switch as the diagrams. It now has its own switch, off by default: in Basic 2D and 3D a "Show
displacements" check beside Animate, under the scale slider (on a phone too); in PRO's deformed
view it takes the place of "Show loads". The other results keep their values on.

#### Pull requests build the Docker image from source only when its recipe changes (2026-11-04)

The Docker check built the whole image from source on every pull request: the backend, the engine
and research WASM, and the site. That took 18–27 min and was the PR's longest check. A pull request
now builds the image around its already-tested site. It builds from source only when the Dockerfile,
`.dockerignore`, or a toolchain or dependency pin the build reads changes. Pushes to main still
build both.

#### Exporting an empty model, and choosing which drawings come out (2026-10-28)

PRO's export buttons were greyed out until the model had a node; they are offered at once, as in
Basic. Every export dialog of both modes says when the model is still empty, the file still comes
out, and one notice says it came out with no data, in place of the solver's errors about a model
with nothing to solve. PRO's report now opens on an empty model too.

Drawings opens on what to include, with three quick sets (model only, model and diagrams,
everything) above the checks, and, when more than one drawing is chosen, whether they come out
on one sheet or one file each in a .zip. PRO's DXF offers the same: one drawing with a layer per
content, or a .zip with the model's drawing and one per result with the model underneath.

#### Invariance checks on every engine pull request (2026-11-05)

Pull requests that change the solver now check that the analyses they touch give the same answer when a curated set of models is rotated, mirrored, renumbered, has members reversed, changes units or lists its loads in another order. Known open wrong results (#758, #971) are tracked as expected failures, so a fix that removes one is noticed.

#### The landing says more about Stabileo AI, and loads that section after the page (2026-11-06)

The AI section lists what the assistant does: it drafts a model from a description, edits it on
screen and shows each change before it is applied, reviews a solved model, and explains solver
warnings and results. It says the engineer decides, and that the panel is in the editor and works with your own
Anthropic (Claude) or OpenAI key, kept only in the browser. Pricing says Stabileo AI is paid by everyone, universities included. The section, its
copy in six languages and its screenshot now load once the rest of the landing is up, so the first
load of the landing is lighter.

#### The landing opens by saying Stabileo is open-source structural engineering software, with AI in development (2026-11-03)

The hero, page title and description in all six languages now say it plainly: open-source
structural engineering software whose solver runs on your machine and is checked against seven
other finite-element programs, with an AI assistant that is still in development and will work on
the same model and solver. The description and README no longer lead with the assistant's own-key mode, which stays the
interim way to use it until Stabileo's own AI service opens.

#### The landing says where Stabileo fits and what each design code check covers today (2026-11-02)

A short block after the hero places Stabileo against commercial desktop packages, script-driven
open-source solvers and classroom freeware, with links to the reliability and SAP2000 pages.
Basic mode names what it shows: live recalculation, the stiffness method step by step, mechanism
detection, which torsion theory applies, and P-Δ, buckling, modal, plastic collapse and influence
lines. PRO Design lists every code it checks with its maturity, and says that open issue #532
(3D design demands may use the wrong axis) affects the 3D checks.

#### The landing and the editor load the blog only when it is shown (2026-11-03)

The blog page and its posts load on demand: on a blog address, when the editor opens the blog,
and for the latest-post card at the foot of the landing. The landing entry is about 724 KB
smaller (uncompressed) and every `/app/*` mode about 215 KB smaller. The card appears once the
posts arrive, without moving the link to the index.

#### Every Rust mutant is tested at least every 16 days (2026-11-02)

The nightly mutation run now tests 32 of its 512 shards a night instead of 4, on the nightly
runner pool, so a full pass takes 16 nights, as the roadmap promises, instead of 128. A shard
that runs to its verdict leaves a marker, and the weekly verification dashboard fails and lists
the stale shards when any shard has gone more than 16 days without one. The dashboard's Rust
mutation score now reads the nightly workflow, where the mutants job runs.

#### Nightly and differential runs: infrastructure failures fixed, one alert issue per workflow (2026-11-03)

A failed scheduled verification run (nightly, differential, mutation testing) now opens or
comments on one `ci-failure` issue per workflow instead of one per job (#739, #717). The OpenSees,
Code_Aster and Frame3DD harnesses and the mutants filter and exit code that made those runs fail
for reasons other than the engine are fixed, and the dashboard commit is signed. No calculation
changes.

#### One nightly finding per root cause, not one per node or element (2026-11-01)

The nightly bug hunt grouped its findings by a fingerprint that kept node and element ids, so one
root cause opened many issues (30 for one shell stress label). Ids are now normalised before
fingerprinting (#1062); distinct quantities stay distinct. No calculation changes.

#### Adding a label no longer restarts CI (2026-11-03)

Pull request CI ran again from scratch whenever any label was added. Now only opening, pushing and
reopening start a run. The `run-e2e` label is read when a run starts, so after adding it, push or
re-run CI to get the full pipeline.

#### Engine tests that time themselves no longer run on a shared CI machine (2026-11-03)

The solid-shell centroid-stress performance check failed on a busy CI runner although nothing was
wrong: it compared two wall-clock timings measured back to back. It now counts how often the
expensive enhanced-strain blocks are built (never for the centroid stress, once per stiffness);
its timing budget runs single-threaded in the Engine Gates job.
Four other engine checks of how cost grows with model size (Poisson section solve, constraint
validation, area-mass validation, RC member check) keep their timings and now run single-threaded
in the Engine Gates job only. No check of a computed result changed.

#### Exports by what comes out, with the format chosen in the dialog, in PRO and Basic (2026-10-28)

Project → Export had a button per format (Excel, CSV, PDF report, DXF, IFC, SVG, PNG, JPG). It now
has one per content: Results… (Excel or CSV), Calculation report… (PDF, Word or HTML), Drawings…
(DXF, SVG, PNG or JPG, one row of formats across the DXF and the picture dialogs, each keeping its
own options) and BIM model (IFC). Each dialog shows its format first. The calculation report no
longer offers a workbook or CSV of its tables: the results as data are the Results export. The
dialogs, their contents and the files they write are otherwise unchanged.

Basic does the same: Results… (Excel or CSV, in a small dialog where it used to download at once),
Calculation report… (PDF, Word or HTML; Word and HTML were not offered before) and Drawings… (SVG,
PNG or JPG; JPG is new). In both modes the export buttons sit one per row, one line high, and the
spreadsheet import is a wide button with its template beside it.

#### PRO is presented as available, not in development (2026-11-02)

The landing (its PRO lead and captions), the standing pages, two blog posts, the app's header and
its tour stop calling PRO a module in development or in beta: its analysis is what the site offers today. What is still in development is
said of code design inside PRO (reinforcement, detailing and connections), which stays off by
default, and of Stabileo AI. The PRO mode loses its "Beta" mark, and its advanced analyses lose the
"work in progress" banner.

#### A results change is one file, numbered by main's merge order (2026-11-05)

Changes that move results are registered one per file in `web/src/lib/provenance/result-changes/`,
without a version number. Each merge to main that adds one takes the next results version, so two
pull requests that change results no longer conflict, and the merge queue can land them together.
The versions numbered by hand keep their entries and their meaning (`numbered.json`), and every saved project
gets the same re-check notices as before. A build now needs the git history back to this change,
and fails without it.

#### The release step is one make target (2026-11-06)

`make release.step VERSION=… DATE=…` (`scripts/release-step.py`) moves the changelog fragments into CHANGELOG.md, adds the release-notes line, rebases the moved text's `../` links to the repository root, points result-change entries at CHANGELOG.md, and relocks `dedaliano-engine` in every tracked Cargo.lock, research crates included. It fails if a moved link still climbs out of the root, a registry entry still names changelog.d/, or a lock pins another engine version. The 0.5.0 release hit the last two by hand.

#### The calculation report prints a chosen result set, the envelope by default (2026-11-02)

The PRO report's reactions, forces and displacements were those on screen, which after a solve is
every load case added at factor 1, labelled only "the result on screen". The report dialog now has
"Results of": the envelope of the combinations (the default when there are combinations), any
combination or case, or the screen. The sum of every case at factor 1 is named for what it is,
on screen, in tables and in figures, with a note that it is not a code load state.

#### Research bundles build faster from scratch, with their checked outputs pinned bit for bit (2026-11-05)

The phase-field, spring-network and four-cable research bundles now compile the engine in parallel
pieces, and keep whole-program optimisation for the final bundle. A cold build of those bundles takes
about 20 to 30% less time, and each shipped bundle is 1.1 to 1.5% larger. Every value those bundles
return in their reference checks is bit-identical to before. CI now checks that bit for bit: it
hashes every value the phase-field, spring-network, four-cable and gridshell bundles return in their
reference checks and compares the hash with research/tools/wasm-output-hashes.json, so a later build
change that moves one of those results by one bit fails CI.

#### Grossman (2026) spring networks: direct comparison with the paper and corrected protocol

The spring-network page chooses clamped rows before adding disorder, uses directional Poisson ratios in ensembles and states its vertex count and seeds. It compares all ten strip markers with Fig. 5 directly (failures shown), splits combined checks into 31 named ones and replaces unbacked tolerances with recorded values; WASM output is checked against native results. The replay autoplays from a native replay file, live solves run in a terminable worker, the plots have data tables, and the page is in German, French and Turkish. No tolerance changed and no production engine source changed.

#### Stabileo Research works on phones and tablets (2026-10-29)

On phones the experiment comes right after the title, the viewer is sized to the model, controls are at least 44 px and text at least 12 px; a permanent check renders every research page at phone and tablet sizes in CI (PR #831).

#### Shauer (2025) phase-field fracture page: corrected energies, loads and wording

The fracture page colours its energies correctly, shows the true final load of each time step, checks its load coordinates and the numbers quoted in the narrative, describes tension and the history field accurately, and integrates the energies independently. It now states exactly what it is compared with instead of a "full text not accessible" placeholder, puts the viewer above the introduction, has keyboard and touch charts, and is available in German, French and Turkish. The production engine is unchanged.

#### Research and Tools: the runnable catalogue is together (2026-10-30)

The research and Tools wave (#857) brings the experiments into one gallery, with thumbnails,
first-version badges and links to replay or recompute each example. Alongside Shauer (2025)
phase-field fracture and Grossman & Boudaoud (2026) spring networks, 15 further entries are live
(17 runnable entries in all):

- Ferrari & Sigmund (2025): Roorda-frame buckling and an imperfect nonlinear path.
- Andreassen et al. (2011): MBB-beam topology optimization.
- Pastrana et al. (2026): cable-net form-finding by force density.
- Fairclough et al. (2026): a five-node gridshell under its own weight.
- Zmyślony, Khan & Biggins (2026): curvature-patterned snapping arches.
- Mattiasson (1981): cantilever elastica.
- MacNeal–Harder (1985): element accuracy tests.
- The shell obstacle course: Scordelis–Lo roof, pinched cylinder and pinched hemisphere.
- Lee frame (1968): large deflections and stability.
- DaDeppo–Schmidt (1975): a deep arch through its limit load.
- Riks–Crisfield: arc-length snap-through of two-bar models.
- Newmark (1959): an SDOF step response.
- CQC (1981): closely spaced modes compared with SRSS.
- Classic plastic collapse: a portal compared with virtual-work bounds.
- Navier plate: mesh convergence against the series solution.

The eight Tools are the simply supported beam, cantilever, elastic column buckling, continuous
beam, single-bay portal, planar truss, moving-load influence lines and beam bending frequencies.
Their individual entries describe the assumptions and comparisons. Research pages state what
has been reproduced and what remains provisional or fails; a live page is not a completed
validation or a code design check. Re-check the stated model and reference before using a
comparison as evidence. Riks and shell article text stays in route-local dictionaries with
English fallback where a translation is absent.

#### The certificate and the discretization error fold under the results (2026-10-29)

The certificate, the end-to-end check and the discretization error opened the results panel, above
the diagrams and the tables, in Basic and in PRO. They now sit at the foot of the panel, under the
results tables, in a "Result checks" fold that says in one line what is inside (certified, not
certified, high discretization error). It stays closed while nothing warns and opens by itself when
something does, so a warning is never folded away unseen.

#### Refusals are found wherever a result type can hold them, from one generated list (2026-11-05)

Which fields of a result can carry a known-issue warning or refusal is now generated from the
engine's result types and the web app's result types (`make gen.result-sites`), and both the engine
and the web read that list. Every result leaving the engine lists any refusal held deeper inside it
at its top level as well, and combinations and envelopes gather their load cases' known issues the
same way. No number, warning or refusal changes; a result type that gains a field holding
diagnostics is covered without a hand edit, and a stale list fails CI.

#### Roadmap: the safety batch, the course and the open wrong results as of 2026-11-05

- The product roadmap marks the safety batch (#1409, results versions 16 to 26), #1295, #1296,
  #1299, #1379, #1396 and the Basic course (#1302–#1307, results versions 27 to 29) as landed,
  lists the wrong-result issue #1414, fixed by #1415 (results version 30), and puts #1401 (#1417) and #1402
  (#1416) in their current state (#1405 had added them); #1402 is fixed by #1416.

#### The roadmap lists every open safety issue with its state, every workstream and every deferred follow-up (2026-11-03)

The product roadmap opens with the work order (wrong-result bugs, then other bugs, then features).
Each open safety issue in the containment ledger has a row saying whether main can give the wrong result today, whether the
containment PR (#807) warns or refuses, and where its fix is. A table lists every pull request in
flight with its state and the decisions it waits on, and a new "Later: deferred follow-ups" section
lists what was decided for later. About 140 nightly safety findings still await triage and are
counted there, not listed one by one. The CI table records the CI wave and wave A as landed. This
records plans, not fixes; no calculation or saved project changes.

#### The roadmap puts gaps in result checks before new features (2026-10-28)

The product roadmap now puts result snapshots, nightly failure alerts, old-project compatibility,
independent worked examples, visible translation keys and production health first (#723). Platform
work and growth have their own sections, with links to the tracked gaps and completion criteria.
This records the priorities, not completed safeguards; read each item's linked issue for its
implementation status. No calculation or saved project changes.

#### Route budgets: wave B's acceptance ended, one more for the safety batch (2026-11-04)

- #1322 put the landing and app route budgets back to 128 B after wave B landed, and #1388 then
  accepted the safety batch's app growth once, up to 20,480 B per pull request, because each
  result change adds its registry text in every language. #1390 later replaced the per-PR budget
  with a size report and a weekly ceiling check.

#### The app route budget treats the blog page as its own route (2026-11-03)

"Landing and app route byte budgets" leaves the lazily loaded blog page out of `/app/*`, as it
already does for research and tools, so loading the blog on demand is not counted as app
growth. Modules the blog shares with the app still count. The budgets are unchanged.

#### The route byte budget says which limit a route broke (2026-11-03)

When "Landing and app route byte budgets" fails, the message now names the limit: research
isolation, for a change that touches research code shipped to the browser, or the product
budget in `web/scripts/product-route-growth-budgets.json`. Both were reported as the same
"128 byte tolerance". The limits themselves are unchanged.

#### Page size is watched weekly instead of gated per change (2026-11-04)

A pull request no longer fails because the landing or the app grew: CI reports each route's
growth against main on the PR. A weekly check measures main against the ceilings in
`web/scripts/route-size-ceilings.json` and opens or updates a `route-size` issue when a route is
over. Research isolation still blocks: a change to research code shipped to the browser may grow
a route by 128 bytes at most, and research modules in a product chunk always fail.

#### CI alerts when the self-hosted runner pools drift (2026-11-03)

A daily "Runner pools" workflow fails, and opens a `ci-failure` issue through the verification
alert, when STABILEO_SELF_HOSTED, STABILEO_PR_POOL or STABILEO_E2E_POOL is not `true`, or when
fewer than 6 online runners carry `stabileo`, 4 carry `stabileo-pr` or 4 carry `stabileo-e2e`.
The WASM job warns when a same-repository pull request still runs on a GitHub-hosted runner while
the pull request pool is on.

#### Trusted merge-queue checks use Stabileo runners and Nix browsers (2026-10-30)

With #854, the jobs eligible for Stabileo runners are Lint Repo, Lint Engine, both Engine Suite
shards, Engine Metamorphic, WASM, Research WASM, Results Snapshot, Web Build, E2E Site,
all ten Chromium E2E shards and quarantined Chromium E2E tests. They self-host when
`STABILEO_SELF_HOSTED` is enabled, only for the merge queue and pushes to main.
Pull requests still use GitHub runners. Self-hosted jobs explicitly clean checkout
workspaces and use the installed Nix toolchain without running the Nix installer
or GitHub-only disk cleanup and build-cache actions. The browser jobs use the Nix
shell's Playwright 1.60.0 browsers, libraries and fallback fonts; Web Build also gets pinned
Rust for its third-party notices checks.

All other jobs stay on GitHub. Engine Gates and Web Unit retain isolated timing
budgets, and Docker smoke needs Docker, which is not guaranteed on the host.
Determinism keeps Chromium, Firefox and WebKit on GitHub: Chromium and Firefox
passed the Nix Linux host preflight, but Nix WebKit did not start.

Pull requests that change the tooling check the merge queue's browser shell on a GitHub runner
before it reaches the trusted queue. Research WASM bypasses sccache because the host cache could
not start its toolchain. Re-check the browser-shell preflight after changing Nix or Playwright;
Chromium and Firefox are covered there, not WebKit. This changes where checks run, not solver
results or which projects need recalculation.

#### Search results describe Stabileo, its calculators and its paper more accurately (2026-11-01)

The site now presents Stabileo as open-source structural engineering software in all six
languages, with its AI assistant described as in development (bring your own Claude or OpenAI
key). Every public page states who publishes Stabileo (Ergodic Group) and who builds it
(LambdaClass) to search engines, with a breadcrumb trail. Each calculator's title names the
calculator and the textbook case it solves, calculator pages link to each other, and the paper is
marked up as a scholarly article. The sitemap dates the blog index by its newest post and the
calculators by their latest review, not by the day the site was built.

#### Shared site header, fonts and button contrast (2026-10-28)

Public pages share the site header and IBM Plex fonts, with improved button contrast.

#### A merge to main is not tested twice (2026-11-03)

Every push to main ran the whole CI pipeline again, although the merge queue had just tested the
same tree. When the pushed tree is the tree of a merge-queue commit whose CI run succeeded,
checked through the GitHub API, a push to main now runs only what the queue leaves out (slow
E2E, Docker, determinism, quarantined E2E and full research validation) and the builds they need.
Direct pushes, admin merges and anything that cannot be matched still run everything.

#### The calculation report in Word carries its figures, cover, header and page numbers (2026-10-28)

The Word version of PRO's calculation report is written from the same HTML as the PDF, with the
same choices of the report dialog. It used to keep only headings, paragraphs and tables. It now
also carries every figure as an image drawn at 300 dpi of its printed size, the logo and the
letterhead on a cover page without header or footer, the page breaks, the notes and the warnings
(stale or incomplete results among them) as styled paragraphs, a header with the program and
version, and a footer with the report, its date and "page n of m". Symbols and expressions keep
their meaning as text in headings, paragraphs and every table cell: sub- and superscripts at any
depth, fractions as num/den with parentheses around compound parts (and around the fraction
itself when a factor follows it or a division precedes it: (1/2)qL², x/(a/b)), roots as √(…); a
construct with no unambiguous plain form (an accent, a matrix) is written as its TeX. They are
text, not editable equations. Number columns are right-aligned and narrow tables take only the width they need. The provenance table is no longer
written twice. The same improvements reach every report exported to Word through the shared
writer (the design report and the detailing report when design is on). The calculation report's
cover no longer says "Verification per CIRSOC 201": it carries no code check.

#### Tools follows the Research layout (2026-10-29)

Tools now uses the site's ink palette, parameter rows, diagram tabs, charts and viewer. Calculations update after input changes; key results and the formula comparison sit beside the viewer on desktop and below it on phones. The gallery has structure previews. Columns show the buckling mode and effective length without exposing internal reference-load reactions. Copy is translated into all six public locales; worked examples remain in the prerendered page.

#### Typed elastic frame properties (#359)

The direct 2D linear WASM path now retains typed material and section properties through
frame stiffness assembly and force recovery. Rust distinguishes MPa from kN/m² and area
from second moment; TypeScript brands the matching wire fields and display conversions.
Wire numbers, existing validation and numerical tolerances are unchanged. The migration
survey, conversion audit and remaining slices are in `docs/safety/units-in-types.md`.

#### A new engine test cannot time itself in the shared suite (2026-11-03)

Lint Engine now fails on an engine test that asserts on elapsed wall-clock time and would run in
the shared engine suite, where a busy CI machine makes such a test fail with nothing wrong. Such a
test must count the work instead, or be marked ignored and listed to run alone in Engine Gates.

#### Web dependencies updated (2026-11-03)

- KaTeX 0.19, three.js 0.186, three-mesh-bvh 0.9.17, web-ifc 0.0.78, Svelte 5.57.3 and
  Playwright 1.64, among the minor updates of #985. No calculation changes.

#### The merge rules are written in the workflow document (2026-11-04)

- `docs/WORKFLOW.md` states when a pull request merges (CI green on its head, `main` really merged
  in, an LLM review of that head with no unresolved blockers), the review-round limit, bugs before
  features, results versions in the order PRs become ready, the Merge status issue and labels, and
  that `git stash` is never used (#1393).
- It also says not to stack PRs that go through the merge queue, to re-arm auto-merge after a
  dequeue, to run the quick local checks before pushing, to close an issue only after every listed
  reproducer passes, and to triage nightly wrong-result candidates daily with a recorded decision.

### Fixed

#### The landing says the AI assistant works with your own key (2026-11-07)

The landing said the AI panel was switched off while it was tested, and that the assistant would
work later, although the editor's panel already works with your own Anthropic (Claude) or OpenAI
key, kept only in the browser and sent only to that provider. The AI section and the hero now say
so, in every language.

#### The span check includes a member's shear slope and the thermal curvature at a release (2026-11-06)

`LIN-SMALL-DISPLACEMENT`'s in-span check (#1506) read only the section rotation ψ, so it missed two cases (#1569).
- A shear-flexible (Timoshenko) member whose axis turned past 0.1 rad by shear deformation was not warned. An example is a member rigid in bending with G·As = 77 kN under a 20 kN midspan load: its axis turns 0.13 rad while ψ stays near 1e-7.
- A thermal gradient's free curvature was dropped at a member release, so the rotation at a hinged end read as zero instead of κL/4.

The check now judges the larger of ψ and the axis slope ψ − V/(G·As), on both sides of each point load, and includes each member's thermal curvature α·ΔT/h. Each result records that curvature in `resultSummary.memberSpans[].curvature`. A load combination sums its cases' curvatures with their factors. Numerical values are unchanged; some results gain the warning.

#### The route-size check measures a pull request with main's script and budgets (2026-11-06)

- The Landing and app route byte budgets job copied the pull request's measurement script over
  main's before measuring main, so a branch carrying an old copy measured main's newer code with
  old rules and failed for reasons it did not cause (#1593 and #1600). The job now measures both
  main and the pull request with main's (or the merge queue base's) `web/scripts`, placed in
  `web/.route-base` by `.github/scripts/route-size-from-base.sh`; the pull request's own
  `research-route-allowances.json` is used only when the pull request changes it. No budget changed.

#### "Check an exported report…" fails closed (2026-11-03)

- The printed tables are now printed again for the result the report's fingerprint records, not
  for the result-set key in the report's editable script: a report whose key and numbers were both
  swapped to another case or combination no longer checks as reproduced. A report whose embedded
  choices were removed, or whose result is not on hand, is incomplete instead of reproduced.
- A report of a case, combination or envelope that is not in the results is refused instead of
  printing what is on screen under that name.
- The report dialog keeps the result set you chose when the model is solved again while it is open.
- The seismic weight puts the whole weight of a member or shell with a node on no level on the
  levels its other nodes are on, instead of leaving out that node's share, and reports it as
  skipped only when no node is on a level. Every node is on a level today, so no result changes.

#### Equilibrium is never reported as verified over loads the check left out; similar storeys respect member types (2026-11-03)

- SA-2026-034: a case whose statics check could not add up every load (a surface load it cannot
  spread to nodes, a load type it does not read) was reported as "loads and reactions agree" in
  the report after the analysis, "balances" in the statics panel and with a tick in the project
  report when the residual over the rest was small. Such a case is now "not fully checked", with
  the loads left out named, and the cases that balance are listed even when another does not.
- The similar-storey scope no longer takes a truss for a frame member at the same place or the
  reverse; a member drawn on one storey is copied to the others with its releases, joints,
  offsets, local axes and the rest of its properties, and the storeys it could not reach are
  named. Narrowing the scope back to one storey returns to the selection made there.

#### PRO's split view, linked models, diagnostics and storey scope bar (2026-11-03)

- A click in the split view's plan picks only what the plan draws, not an object above its cut,
  and its level list sets the working level as the plan chip does. Phones no longer offer a split
  view they cannot show.
- Linked models leave the 3D scene when PRO's layer is closed, instead of staying drawn in Basic.
- Diagnostics are filed under Model on screen and in the CSV, PDF and Word export alike, with the
  solver's source named.
- The storey scope bar wraps on a phone, with buttons a finger can take.

#### The public viewer on phones, and its Duplicate (2026-11-03)

- The viewer's bar no longer covers the model or the examples list when it wraps onto two rows on a
  phone or a narrow tablet: the space below it follows its real height, safe areas included. Its
  buttons are large enough to tap, and "3D and plan" is offered only where it can be shown.
- "Duplicate and edit" says the copy is saved only once it is written to this browser, and says so
  when it could not be.

#### Load-combination envelopes refuse instead of returning infinite or NaN values (2026-11-04)

- Fix #1350: the 2D and 3D envelopes (`compute_envelope`, `compute_envelope_3d`, and the multi-case
  solves that use them) evaluated each member's diagrams without checking the result, so end forces
  near the f64 limit overflowed to ±∞ along the member and were returned as envelope values, and a
  NaN in any result after the first was dropped by the max/min comparisons. They now refuse, naming
  the result and the field, or the member, diagram and station that left the range of f64. Envelopes
  of finite, in-range results are unchanged.

#### "Check an exported report…" catches a report with sections removed (2026-11-05)

- Fix #1402 (#1416): the check printed a report's tables again from its embedded settings, which
  nothing bound, so a report with a section switched off and its marker removed still checked as
  reproduced. The fingerprint now records the report's choices and every table it printed, the
  check prints from that record, and a missing, extra or reordered table fails it. A report exported
  before this change checks as incomplete; export it again. No result changes.

#### The re-check notice explains each result change in German, French and Turkish (2026-11-04)

- Fix #1404: the notice that lists the result changes since a project was last solved showed each
  change's title and explanation in English to German, French and Turkish readers, because the
  registry (`result-changes.json`) held only English, Spanish and Portuguese and the notice chose
  among those three. Every entry now carries all six of the app's languages, the notice follows the
  app's language, and the registry is refused if an entry lacks any of them.

#### A coded refusal no longer hides a containment refusal carried by the same error (2026-11-06)

When an engine error carried both a containment refusal (a known wrong result) and a coded refusal such as "no compressed elements" or "no free degrees of freedom", the app took the coded one and dropped the containment refusal (#1558). Some of those coded refusals are benign answers: the P-Δ comparison read "no compressed elements" as λ₁ = ∞ and B₂ = 1, the advanced toolbar showed it as information, P-Δ with nothing free returned the linear result, and a failed space eigen decomposition was retried with the mechanism held. An error that is a containment refusal is now always shown as one, and is never treated as a coded refusal.

#### The industrial shed example's tie rods are tension-only, and the containment notice no longer blocks the model (2026-11-06)

- The 116 Ø16 tie rods of the industrial shed example (`3d-nave-industrial`) are now tension-only. Loading an example used to drop a member's behaviour, so the rods were solved as plain truss bars, and 66 of them carried up to 22.7 kN of compression at about 80 times their buckling load.
- Compact share links now keep a member's behaviour. A link with a behaviour the app does not know is refused instead of loading the member as a plain bar.
- The containment notice over the viewport no longer takes the clicks and taps meant for the members under it. On a phone it is one line, with More to read it all.

#### A combination no longer trusts a load case without a second-order screen whose ends read no compression (2026-11-06)

- #1607: combining load-case results that arrived without the engine's second-order screen (from outside the engine, through `combine_results_checked` or the WASM combination calls) counted a case as compressed only when a member's end force read compression. A member compressed inside its span by an axial span load or an axial point load, with both ends at zero or in tension, was missed. The combination could then come out bounded, and its steel checks were not held. Such a case now counts as compressed whenever any member carries an axial force or an axial load, so the combination is `LIN-SECOND-ORDER-UNBOUNDED` and holds the checks. Results the engine solves itself always carry the screen and are unchanged.

#### Diagrams keep a member's load at any magnitude (2026-11-06)

- A 2D member whose results carry only the legacy start/end load values lost that load from its
  moment and shear diagrams, and from the diagram gaps the certificate checks, when both values
  were at or below 1e-10. Any nonzero value now counts, so a model scaled as a whole draws the same
  diagrams. The results snapshot corpus is unchanged (#1614).

#### The 30 s workspace save no longer freezes a designed project after a few edits (2026-11-06)

Every 30 s the open tabs are saved to the browser for the next visit, without their undo history.
The save still copied that history before dropping it: on a designed and detailed building every
undo step holds the detailing, and after a handful of edits the copy took the page's main thread
for minutes until the tab ran out of memory. The history is now left out before anything is
copied. On the 7-storey example after 16 edits the save takes 0.34 s instead of 1.9 s in Node,
and in the browser it no longer freezes the page (#1618).

#### Excel and IFC imports no longer swap Iy and Iz of rectangles and tubes (2026-11-03)

A section given to the Excel importer by `b` and `h`, and a rectangular or tube profile in an IFC file (drawn, or named like `500x200` or `200x100x5`), came in with b·h³/12 in `Iz` and h·b³/12 in `Iy`. The app's sections, solves and checks read `Iy` for bending in the depth, so such members bent about the wrong axis: a 20 × 40 cantilever deflected four times too much and a 40 × 20 one four times too little (#532, SA-2026-039). Affected since each path landed and in every release up to 0.4.0: Excel sections given by `b` and `h` (since 2026-09-09), IFC sections named `HxB`/`HxBxT` and the no-profile fallback (since 2026-03-04), and IFC rectangles drawn in the file (since 2026-10-18); catalogue profiles and explicit `Iy`/`Iz` were not affected. Both importers now follow the app's convention. Models imported before keep their values; check their rectangular and tube sections.

#### PRO design names the concrete with no f′c instead of calling every member steel (2026-11-02)

- Fix #766: a concrete material with no strength (no f′c or fy) was counted as steel, so the
  CIRSOC 201 check said "all 105 of its members are steel" on the 3d-building example, whose H-30
  had no strength, and checked none of them. Such a material is now named in the message ("material
  H-30, used by 105 members, has no f′c"), and the 3d-building example's H-30 carries f′c = 30 MPa,
  so PRO designs all of its members.

#### A copy made in 2D no longer lands turned onto the floor when pasted in 3D (2026-10-29)

A 2D model opened in 3D keeps its vertical as Y until the first edit rewrites it with Z up. A copy
taken in 2D, or in 3D before any edit, kept the old axes, and pasting it rewrote the model but not
the copy: it landed rotated 90°, in the X–Y plane, in Basic 3D and in PRO. The copy is now rewritten
the same way as the model. A copy from a 3D model is not pasted into a 2D one, and says why.

#### The production-build test pass runs its builds one at a time, as designed (2026-11-04)

The build Vitest project set `fileParallelism: false` and `maxWorkers: 1`, which Vitest 3 reads
only from the root config, so its four to five production builds and a prerender ran at once
(21.5 GB peak, measured). The project now runs in a single fork (7.6 GB peak), which removes the
out-of-memory kills of those builds that failed Web Build on the shared CI host.

#### The production-build tests no longer time out on hosted runners (2026-11-04)

Every test in the build pass spawns a process, such as a `vite build` or `npm ls --all`. The
notices check had no timeout of its own, so it got Vitest's 5 s default. `npm ls` took 64 s on a
GitHub-hosted runner and failed Web Build there. The build pass now gives each test 120 s unless the
test sets its own.

Prerendering the site gave each page navigation Playwright's 30 s default, so on a heavily loaded
build host a page that was still loading failed the whole E2E Site job. Each prerender page now
allows 120 s per navigation.

#### The changelog's area filters count changes, as its total does (2026-11-02)

The changelog page said "98 changes" while its area filters added up to 56: each filter counted
the weekly entries that touched the area, not the changes in it. Every filter now shows the number
of changes in its area, the same number the total shows once that filter is on, so the filters add
up to the total. Every change already has an area, so no "Other" filter is needed.

#### A pull request run cancelled by a newer one no longer shows a red CI OK (2026-11-04)

When a newer pull-request run cancelled an older one, the older run's CI OK still ran and failed
on the cancelled jobs, so the pull request looked red while the real run was still queued. This
happened to every course pull request at 18:30 UTC on 2026-11-04 (for example #1303, run
41887856500). A cancelled pull-request run now checks for a newer run of the workflow on the same head. When one
exists, CI OK is skipped and the newer run reports instead. A run cancelled any other way still
fails CI OK, because a skipped required check would pass.

#### CI runs on Ubuntu 24.04 (2026-11-02)

GitHub moved `ubuntu-latest` to Ubuntu 26.04, where Playwright 1.60 cannot install
its browsers, so every pull request failed Web Build, E2E Site and Determinism.
Hosted jobs now name `ubuntu-24.04`, so the Ubuntu release changes only when we change it.

#### A stalled dependency download no longer leaves a lock that fails its retry (2026-11-04)

The CI retry wrapper used to kill an attempt after 15 minutes in total. It now does so only after 15
minutes with no output, so a slow mirror that is still downloading (Playwright's browser system
packages took over 15 minutes on hosted runners) finishes instead of being killed; an attempt is still stopped after 40 minutes in total. When an attempt
does stall, every process of the attempt is stopped. The retry also waits for the dpkg locks to clear,
because apt-get under sudo runs outside the attempt and kept holding the dpkg lock, so the retry failed
at once with "Could not get lock /var/lib/dpkg/lock-frontend". If the lock is still held after
10 minutes, the step fails without retrying.

#### The nightly Code_Aster comparison no longer fails on a reused runner (2026-11-04)

The Code_Aster comparison installed micromamba into the runner user's home directory, where it
stayed after the job. On a self-hosted runner the next nightly then refused to install over it and
the comparison never ran. Micromamba and its environments now go into the job's temporary
directory, which the runner empties before every job.

#### Ctrl+S no longer sends the 3D view sliding away (2026-10-29)

In Basic 3D and in PRO, W, A, S, D, Q and E move the 3D view while held. Ctrl+S (Cmd+S on a Mac)
pressed the S as well: the save dialog took the key's release, and on a Mac no release reaches
the page while Cmd is down, so the view kept panning until S was pressed again. Cmd+A did the same
with A. A letter pressed with Ctrl, Cmd or Alt no longer moves the view, and held navigation keys
are let go when the window loses focus or Cmd is released. Basic 2D has no key navigation and was
not affected.

#### Catch invalid E2E JSON imports and bound smoke failures (2026-10-30)

Fast source-only Vitest guards reject static JSON imports without Node's `with { type: 'json' }`
attribute and unexplained smoke timeouts above 45 seconds. A dedicated smoke project limits each
test to 45 seconds; slow and quarantined tests retain their longer budgets. Ordinary waits now
fit the smoke budget, long journeys and computations move to the slow suite, and shared-helper
exceptions explain their purpose. Run `npm run test:e2e:guards` without a browser or WASM build.

<details>
<summary>Spec migration audit</summary>

**Long cases moved to `@slow`.** These cases already requested long test budgets or long computation/export waits. Short cases in mixed groups keep their smoke tags. In design-off-journey, the global override was moved into the existing slow tests.

[basic-demos.spec.ts](web/e2e/basic-demos.spec.ts), [basic-draw-members.spec.ts](web/e2e/basic-draw-members.spec.ts), [basic-mobile-delete.spec.ts](web/e2e/basic-mobile-delete.spec.ts), [basic-mobile-modelling.spec.ts](web/e2e/basic-mobile-modelling.spec.ts), [basic-whatif.spec.ts](web/e2e/basic-whatif.spec.ts), [batch-copy.spec.ts](web/e2e/batch-copy.spec.ts), [blog.spec.ts](web/e2e/blog.spec.ts), [cirsoc-flex.spec.ts](web/e2e/cirsoc-flex.spec.ts), [design-desk.spec.ts](web/e2e/design-desk.spec.ts), [design-off-journey.spec.ts](web/e2e/design-off-journey.spec.ts), [detailing-convergence.spec.ts](web/e2e/detailing-convergence.spec.ts), [everyday-path.spec.ts](web/e2e/everyday-path.spec.ts), [excel-import.spec.ts](web/e2e/excel-import.spec.ts), [explained-steps.spec.ts](web/e2e/explained-steps.spec.ts), [export-empty-and-drawings.spec.ts](web/e2e/export-empty-and-drawings.spec.ts), [force-method-wizard.spec.ts](web/e2e/force-method-wizard.spec.ts), [interaction-contracts.spec.ts](web/e2e/interaction-contracts.spec.ts), [pro-analysis-rules.spec.ts](web/e2e/pro-analysis-rules.spec.ts), [pro-design-gates.spec.ts](web/e2e/pro-design-gates.spec.ts), [pro-design-workflow.spec.ts](web/e2e/pro-design-workflow.spec.ts), [pro-example-gallery.spec.ts](web/e2e/pro-example-gallery.spec.ts), [pro-large-model-tables.spec.ts](web/e2e/pro-large-model-tables.spec.ts), [pro-modelling-flow.spec.ts](web/e2e/pro-modelling-flow.spec.ts), [pro-panel-consistency.spec.ts](web/e2e/pro-panel-consistency.spec.ts), [pro-project-workbook.spec.ts](web/e2e/pro-project-workbook.spec.ts), [pro-report-docx.spec.ts](web/e2e/pro-report-docx.spec.ts), [pro-workflow-shell.spec.ts](web/e2e/pro-workflow-shell.spec.ts), [recheck-provenance.spec.ts](web/e2e/recheck-provenance.spec.ts), [research-ferrari.spec.ts](web/e2e/research-ferrari.spec.ts), [share-link-fidelity.spec.ts](web/e2e/share-link-fidelity.spec.ts).

**Shared helpers with documented long waits.** These helpers wait for live design/detailing, 3-D scene construction, or a large-project download. Project-restore helpers serve only its slow journey. The smoke test budget still bounds shared-helper callers.

[ded-roundtrip.spec.ts](web/e2e/ded-roundtrip.spec.ts), [f4-document-scope.spec.ts](web/e2e/f4-document-scope.spec.ts), [f6-viewer.spec.ts](web/e2e/f6-viewer.spec.ts), [frame-editor-detail.spec.ts](web/e2e/frame-editor-detail.spec.ts), [project-restore.spec.ts](web/e2e/project-restore.spec.ts), [rebar-workspace-focus.spec.ts](web/e2e/rebar-workspace-focus.spec.ts).

**Ordinary waits capped at 45 seconds.** Startup, solver-readiness and ordinary UI waits now fit the smoke budget instead of waiting 60 seconds or more.

[basic-3d-defaults.spec.ts](web/e2e/basic-3d-defaults.spec.ts), [basic-connections.spec.ts](web/e2e/basic-connections.spec.ts), [basic-copy-paste-buttons.spec.ts](web/e2e/basic-copy-paste-buttons.spec.ts), [basic-copy-paste.spec.ts](web/e2e/basic-copy-paste.spec.ts), [basic-demos.spec.ts](web/e2e/basic-demos.spec.ts), [basic-draw-members.spec.ts](web/e2e/basic-draw-members.spec.ts), [basic-dynamic.spec.ts](web/e2e/basic-dynamic.spec.ts), [basic-interaction-view.spec.ts](web/e2e/basic-interaction-view.spec.ts), [basic-move-nodes.spec.ts](web/e2e/basic-move-nodes.spec.ts), [basic-pdelta.spec.ts](web/e2e/basic-pdelta.spec.ts), [basic-point-load-axes.spec.ts](web/e2e/basic-point-load-axes.spec.ts), [basic-selection.spec.ts](web/e2e/basic-selection.spec.ts), [blog.spec.ts](web/e2e/blog.spec.ts), [certificate-end-to-end.spec.ts](web/e2e/certificate-end-to-end.spec.ts), [cirsoc-flex.spec.ts](web/e2e/cirsoc-flex.spec.ts), [commercial-grade.spec.ts](web/e2e/commercial-grade.spec.ts), [copy-text.spec.ts](web/e2e/copy-text.spec.ts), [ded-roundtrip.spec.ts](web/e2e/ded-roundtrip.spec.ts), [deformed-displacements-toggle.spec.ts](web/e2e/deformed-displacements-toggle.spec.ts), [design-desk.spec.ts](web/e2e/design-desk.spec.ts), [design-off-journey.spec.ts](web/e2e/design-off-journey.spec.ts), [design-optional.spec.ts](web/e2e/design-optional.spec.ts), [design-workspace-a.spec.ts](web/e2e/design-workspace-a.spec.ts), [double-click-editors.spec.ts](web/e2e/double-click-editors.spec.ts), [education.spec.ts](web/e2e/education.spec.ts), [engine-i18n.spec.ts](web/e2e/engine-i18n.spec.ts), [explained-steps.spec.ts](web/e2e/explained-steps.spec.ts), [flex-loads-from-model.spec.ts](web/e2e/flex-loads-from-model.spec.ts), [floor-families-document.spec.ts](web/e2e/floor-families-document.spec.ts), [i18n-languages.spec.ts](web/e2e/i18n-languages.spec.ts), [interaction-contracts.spec.ts](web/e2e/interaction-contracts.spec.ts), [m1-generators-joints.spec.ts](web/e2e/m1-generators-joints.spec.ts), [m1-states-and-languages.spec.ts](web/e2e/m1-states-and-languages.spec.ts), [m1-steel-i18n-fallback.spec.ts](web/e2e/m1-steel-i18n-fallback.spec.ts), [m1-steel-selectors.spec.ts](web/e2e/m1-steel-selectors.spec.ts), [move-and-view-controls.spec.ts](web/e2e/move-and-view-controls.spec.ts), [no-raw-i18n-keys.spec.ts](web/e2e/no-raw-i18n-keys.spec.ts), [pro-code-loads.spec.ts](web/e2e/pro-code-loads.spec.ts), [pro-export-by-content.spec.ts](web/e2e/pro-export-by-content.spec.ts), [pro-load-generator-areas.spec.ts](web/e2e/pro-load-generator-areas.spec.ts), [pro-moving-loads.spec.ts](web/e2e/pro-moving-loads.spec.ts), [pro-workflow-shell.spec.ts](web/e2e/pro-workflow-shell.spec.ts), [project-restore.spec.ts](web/e2e/project-restore.spec.ts), [rebar-workspace-focus.spec.ts](web/e2e/rebar-workspace-focus.spec.ts), [recheck-provenance.spec.ts](web/e2e/recheck-provenance.spec.ts), [regulations.spec.ts](web/e2e/regulations.spec.ts), [research-springs.spec.ts](web/e2e/research-springs.spec.ts), [research.spec.ts](web/e2e/research.spec.ts), [result-checks-folded.spec.ts](web/e2e/result-checks-folded.spec.ts), [section-analysis.spec.ts](web/e2e/section-analysis.spec.ts), [viewport-keys-after-shortcuts.spec.ts](web/e2e/viewport-keys-after-shortcuts.spec.ts).

</details>

#### An embedded or viewed link no longer overwrites the reader's autosave (2026-11-02)

Opening a model through an embed link autosaved it into the reader's single autosave slot and
workspace, over their own project. An embedded or viewed model is now never autosaved.

#### A project saved under the name `tabBar.newStructure` takes its language's name (2026-10-28)

Projects saved while a new project was named with the raw key (see the tab-name fix) kept that
name, and their exports came out as `tabBarnewStructure.xlsx` and the like. The raw key is now
recognised as the default name, so it gives way to «Nueva estructura» / «New structure» when the
language is changed, as the default name of any language does.

#### Excel, the report and drawings no longer stall on a real building, and "Check an exported report" compares the printed numbers (2026-11-02)

Exporting a six-storey building's results to Excel built every sheet of every case and
combination in memory before it measured them, and the tab ran out of memory. The large sheets
(stations, stresses, shell centres, nodes and corners) are now written row by row straight into
the zip of CSV files, the size is counted beforehand without producing a row, and the dialog says
how many cells the file will have and whether it comes as .xlsx or as a zip.

The report, PNG and SVG froze the browser for minutes (19 on an industrial shed) placing load
labels: every label tried each spot against every label and member placed before it. Labels now
look only at their neighbours, large obstacles in a coarser grid, and a spot that cannot beat the
best one found is not measured, with the same placement as before. On the audited six-storey
building the report went from about four minutes to ten seconds, and the PNG drawing from two
minutes to about fifteen seconds. The report draws the loads one
figure per load case (twelve at most; the table lists them all) instead of every case on one
unreadable figure, and a drawing of the model takes the cases shown on screen or one chosen case.

"Check an exported report" compared fingerprints only: a number edited in the HTML still read as
reproduced. A report now embeds its own choices and marks the tables it printed from the results;
the check prints them again from the fresh solve and compares every value, naming each one that
differs by table, row and column. It also stopped failing for every project with a seismic code
bound (an empty settings block and a pending binding read back differently after saving) and when
the load generator had run again at another time.

#### Ferrari–Sigmund research page corrections (2026-10-30)

- Correct Ferrari–Sigmund research reference provenance, model regression checks, live playback selection, locale formatting and short-landscape layout. Replace pending Koiter badges with the actual buckling and native/WASM comparison scope; retain author questions in the research README.

#### Ferrari & Sigmund 2025 research page shows the frame in the viewer (2026-10-30)

Fix the Ferrari–Sigmund research frame display during replay and live computation with an explicit uncoloured viewer mode. Bring its experiment into the initial mobile/tablet viewport, enforce readable viewer status text and 44px controls, and add rendering, displacement and responsive regressions. Record the post-launch review without changing the paper’s first-version stage.

The frame could disappear because its members have no scalar values to colour (#848). Re-check
both replay and live computation, including on phones and tablets: the geometry and displacement
must remain visible, with viewer text at least 12 px. This repairs the display, not the solver or
the unfinished Koiter comparisons.

#### Fiber-nonlinear analysis stops at its last converged load step (2026-11-03)

Fix #433: when a load increment did not converge, or its tangent was singular (at a plastic
collapse), `solve_fiber_nonlinear_2d/3d` returned the last unconverged iterate, or an error for
the whole run. They now return the state at the last converged increment with
`status: "stopped"`, `lastConvergedLoadFactor` and `stopReason`, plus the history of every
converged increment. The reactions (empty before) and an equilibrium summary are filled for the
returned state, and a state whose residual or global force and moment balance is out of
tolerance is refused. Models with constraints (rigid links, diaphragms, equal DOFs) are now
refused, because their global balance cannot be checked without the constraint forces; before,
they ran unchecked. The web app does not call these solvers yet; direct engine callers should read
`status` before using the result.

#### Verify and enable the Mattiasson elastica benchmarks (2026-10-29)

Replace provisional cantilever references with independently evaluated elliptic
integrals and enable all four load cases, including PL²/EI=10. Separate axial
extension from the inextensible comparison, retain the original finite-area
model against an independent extensible-rod solution, and check mesh refinement
and load-step independence with tighter tolerances. The engine implementation
and results for existing user models are unchanged (#845).

#### Verify shallow-toggle snap-through against the matching structural model (2026-10-30)

The shallow-toggle benchmark compared rigid-jointed frame elements against an axial-only truss formula and demanded a limit point that the frame does not have over apex inversion. Use true truss elements for the exact snap-through reference, trace both limit points, and check every equilibrium point and forward displacement increment. Preserve the original frame geometry and stiffness in a separate test against its independently derived energy reference. Tighten the limit-point validation so an incomplete positive-load path cannot pass. This corrects tests and references only; production solver results are unchanged. Resolves #846 in #852.

Re-check any claim based on the old failing benchmark against the correct element type and its
matching reference. Previously solved user models need no recalculation for this test-model fix.

#### The combination governing a member counts the forces inside it, not only at its ends (2026-11-02)

The combination named as governing a member's moment, shear, axial force or torsion was the one
with the largest value at either end. A beam whose largest moment is at midspan under one
combination and at its ends under another was credited to the wrong one, with an understated
value. The governing combination is now taken over the whole diagram, its interior stations
included, in 2D and in 3D. Design checks that already read station demands are unchanged; the
combination they name where no station demand exists is now the right one.

#### The German landing headline no longer makes the page wider than a phone (2026-11-03)

At 390 px the German hero heading ("Tragwerksberechnung") made the landing 424 px wide, so the
page scrolled sideways on phones (#878). Landing headings now break inside long words when they
must. No calculation changes.

#### The landing shows every section without scrolling to it (2026-11-02)

Every section below the hero started transparent and was painted only once it scrolled into view,
so a reader, a crawler that renders the page, or a capture of it saw blank space under the hero.
The fade-in is gone: the sections are painted from the first frame, with or without JavaScript,
and the prerendered HTML no longer needs a scroll to carry them visible.

#### Load combinations add their cases in the same order on every solve (2026-11-04)

The engine summed a combination's load cases in hash-map order, which differs between builds and
between the browser and native runs, so a combined force could move in its last digit and flip a
marginal detailing decision (#1341). Cases are now summed in their names' order, every time. The
results snapshot corpus is unchanged and #1341 registered no results version, so the app shows no
re-check notice; a member right at a detailing limit may still come out on the other side of it.

#### The load generator no longer loads a shed's eaves as a floor, and weighs slabs and walls in the seismic weight (2026-11-02)

In PRO, "Generate loads from the code" took the panel closed by a trussed shed's bottom chords and
eave beams for a covered floor: it put the occupancy live load and the floor finishes (screed and
tile) at the eaves, with their four pattern cases, and loaded rings of wall girts 20 m across the
same way. Panels within the roof's structure (less than 2.2 m under its trusses, rafters or
purlins everywhere the roof is over them) and panels more than 12 m both ways with no beam or slab
inside now take no area load; a floor with storey height under part of a sloped roof keeps its load;
the derivation lists them, and "Load every panel" in Applying keeps the old behaviour for a real
mezzanine or loft. A pitched roof (5° or more) with no slab, whose dead load is "the floors'" in a model with no
floors, now stops the plan with a message, instead of carrying the floors' screed and tile; a flat
roof still takes it.

The seismic weight of each level now includes the slabs, walls and roof decks drawn as shells
(thickness × density × surface, a wall half to each level it joins); it counted only the members,
so a concrete building's base shear came out about half of what it is.

When the generator writes its combinations, the four example cases and combinations a new project
starts with ("Dead Load", "Live Load", "Wind", "Earthquake", "1.4D", …) are removed if nobody
touched them, instead of staying empty beside the generated ones. The preview says so.

Re-check: generated loads of sheds and halls, and the seismic cases of buildings with shell slabs
or walls, after generating again. Saved loads do not change until they are regenerated.

#### A rebuilt merge-queue entry cancels its own superseded run (2026-11-02)

When the merge queue rebuilds, GitHub starts a new run for each entry on its new base but
leaves the old runs going, and they held the CI runners. Every merge-queue run now first
cancels the unfinished merge-queue runs of CI, supply chain and verification whose head is no
longer in the queue. A run whose head is still a queue entry or a queue branch, such as another
pull request's entry, is never cancelled, and nothing is cancelled unless three snapshots of the
queue agree.

#### Modal analysis says so when it returns fewer modes than you asked for (2026-11-03)

Asking for more modes than the model has free degrees of freedom (10 modes of a 3-DOF model)
returned the modes there are with no diagnostic, because the request was trimmed before the
short-spectrum check saw it (#1287). The diagnostic now compares with what you asked for, in 2D
and 3D. The modes themselves do not change.

#### Fewer false wrong-result reports from the nightly verification run (2026-11-03)

The nightly metamorphic checks no longer report a wrong result when a quantity that is zero in exact arithmetic is compared against rounding noise, when a time history or modal result carries the accuracy of its eigensolve, when two modes are nearly repeated, or when a plastic analysis stops short of a mechanism and reports only a lower bound. Each tolerance scales with the model, and deliberately wrong results on the same models are still caught.

#### Scheduled runs no longer hold the merge queue's runners (2026-11-04)

Nightly mutation testing, random models and the other nightly jobs ran on the runners the merge
queue uses, so every morning queued PRs waited for them for hours. The nightly now runs only on its
own runners (or GitHub's when the self-hosted host is off), and the daily CI, research and
supply-chain schedules run on GitHub's runners. A test evaluates every scheduled job's runner
choice and fails if any can reach the merge queue's runners.

#### Pull requests no longer flood the shared CI cache (2026-11-04)

Every pull request saved about 1,850 Nix store paths (2.9 GB) to the repository's 10 GB Actions
cache, so the cache stayed full and evicted, within an hour, the compiled research bundles and
toolchains that other runs reuse. Pull requests now skip that Nix cache. Their Nix setup was no
slower without it (6.4 min summed over the hosted jobs, against 8.6 min with it); main and the
merge queue keep writing it.

#### Wall-clock budgets no longer fail the merge queue on loaded runners (2026-11-02)

In the merge queue, where the runners are shared and the host was at a load of 90 to 110 on 30
CPUs, the wall-clock assertions of the slow E2E suite (the 3-D rebar workspace opening and the
model fluidity edit) and of the scale-budget unit test are skipped; every functional assertion
of those tests still runs there. Pull requests run every budget unchanged.

#### Steel shear checks with no shear area are not evaluated instead of passing (2026-11-02)

AISC 360 G2 with no `aw` reported a shear ratio of 0 and passed, certified, under any shear
(SA-2026-025). EN 1993-1-1 6.2.6 with no `av` took Av = 0.5·A, 57 % above the shear area of an
HEB 300 (SA-2026-026); it now derives Av from the section geometry by 6.2.6(3), and without
geometry the shear check is not evaluated. Both concern the engine and WASM API only: the app
always sends the area. Re-check API results for members sent without it (#1234).

#### Plastic collapse no longer stops early under distributed loads (2026-10-30)

When a hinge would unload as the structure turned into a false mechanism, the step-by-step collapse
stopped there and reported a low collapse factor: the portal frame example gave 64.06 instead of
71.30. Those hinges now close and the analysis continues. Re-check plastic collapse factors of frames
with distributed loads.

#### Installing Playwright browsers never writes into the Nix store (2026-11-06)

- Every `make` target that installs browsers goes through `web/scripts/playwright-install.sh`, which
  installs nothing when `PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1` or when `PLAYWRIGHT_BROWSERS_PATH` is a
  Nix store path. Before, `make` decided from its own environment, so `make test.web.build
  NIX_RUN="nix develop .#e2e --command"` run as root overwrote the Nix Playwright browsers with an
  unpatched download and broke every Web Build and E2E Site job on the self-hosted runners.

#### Two prerenders of the same build with the same star count are byte-identical (2026-11-04)

Research charts took a random clip-path id on every render, every prerendered page asked GitHub
for the star count (in parallel some were rate-limited and printed "GitHub" instead), and animated
research pages were captured mid-animation. Chart ids now come from the component, the prerender
fetches the star count once per run and hands it to every page (`PRERENDER_GITHUB_STARS` pins
it, and two runs differ only if the live count differs), and pages are captured under reduced motion, which shows each animation's final frame. A build
test prerenders twice and compares every file (#875).

#### The prerender waits for each page to render before capturing it (2026-11-04)

The prerender captured a page as soon as the network had been quiet for half a second. A page
whose code chunk is requested only after a long main-thread task looked quiet in between, so on a
loaded CI host it was captured before rendering and the build failed with "came back nearly
empty (14 chars)". Capture now also waits until the page holds the 500 characters the existing
check requires.

#### What a first hour in PRO runs into (2026-11-02)

- The default load cases are named in the interface's language ("Cargas permanentes",
  "Sobrecarga de uso", "Viento" and "Sismo" in Spanish) instead of always in English. Projects
  saved before keep their names.
- The report's node and member columns, and its slab and wall rows, follow the report's language.
- The report numbers its sections in the order printed, with no gap when a section is absent
  (2.3 was followed by 2.5 in a model without slabs), and its index lists them in that order with
  links that land.
- Exported figures and the report's figures leave out a label that has no room instead of writing
  it over another, and say under the figure how many they left out; the tables carry every value.
- Story drift is called "Deriva" in Spanish throughout.
- The Building, Foundations and Physical panels show their titles.
- The project's regulations list each code once.
- The load generator binds a wind or seismic code from its own form, where it used to send the
  user to the regulations panel and lose the form.
- "Combinations used by design" is titled for the analysis when design is off.
- A view export that draws nothing says so instead of closing without a file.
- The unstated basis of application is one warning for the whole stack, not one per regulation.

#### A new project's tab is named in the reader's language, not `tabBar.newStructure` (2026-10-28)

The stores name the first project before the application registers its full dictionaries, so a
fresh Basic or PRO session showed the translation key `tabBar.newStructure` as the project's name in
its tab, in every language. The tab bar's entries now ship with the dictionary subset loaded first,
and the end-to-end check of raw keys reads the tab's name field (#719).

#### A public page opens at its top (2026-11-05)

- Opening a paper from the Research gallery, or going back to the gallery, kept the scroll position
  of the page before it: the gallery and every paper share one scrolling container, so the paper
  opened scrolled down, by as much as the gallery had been. Every navigation between public pages
  now starts at the top (or at the section its link names), in the browser's back and forward too.

#### Unknown addresses on stabileo.com answer 404 instead of the landing page (2026-10-31)

Any address that was not a page (`/en/research/nonexistent-paper/`) used to answer 200 with the
landing page and its canonical, so search engines saw a site-wide soft 404. Caddy now answers
those with a real 404 and a short, noindexed page in the address's language that links to the
home page, Research, Tools and the Blog. The application's addresses (`/app/…`, `/demo`), the
prerendered pages, the old unprefixed links (`/blog/<slug>`), assets and the slash redirects are
unchanged; `make test.infra.caddy` checks each of them.

#### The re-check notice no longer flashes open and shut on opening an older project (2026-11-05)

Opening a project saved with an older results version, from a file, a tab, an autosave restore or
a link, showed the notice headed "Results have changed since this project was last solved" while
the list of changes was still loading. When none of the changes since concerned the model, it then
closed on its own before it could be read. Nothing was hidden: every notice that lists changes
still holds until it is acknowledged. Now nothing is shown for the first 800 ms of the check. If
the check takes longer, the notice opens saying the project is being checked, and it only says
results have changed once the changes that apply are on screen (#1418).

#### Riks–Crisfield evidence matches the CI platform (2026-10-30)

The exact Riks–Crisfield evidence is refreshed on Linux, with the rounding-only difference from
macOS ARM documented (#857). The reference tolerances and reported validation failures are kept;
a platform difference is not treated as a solver correction. Re-check comparisons against the
recorded platform when regenerating the evidence.

#### Research gallery and pages: no clipped badges or captions, and no review-round note (2026-11-03)

- Badge rows and thumbnail captions wrap instead of being clipped, the viewer controls get their
  own row instead of sitting under the legend, the plastic collapse card names Horne (1979)
  properly, and Research is described as structural engineering research you can run and check, in
  six languages (#883).
- The "First version · N review rounds" note no longer shows on any research page or gallery card
  (#1320). The review records themselves are kept.

#### Stabileo Research: MacNeal–Harder page corrections (2026-10-30)

Results are now compared with signed references, so a deflection or rotation in the wrong direction fails. The headline reports shell cases (2/6) and frame adaptations (6/6) separately, rows distinguish documented limitations, unexpected mismatches and engine errors, and the regular out-of-plane pass is marked marginal against the reference's printed precision. Native CI pins every case's outcome and the four distorted-mesh values. The page states units, quantities, the project-chosen 2% limit and where the references come from (checked against Timoshenko beam theory), is translated into six languages, and works by keyboard and on phones and tablets.

#### Research papers are published only in the languages they are written in, and every other-language URL redirects to the English page (2026-11-01)

Search engines saw research pages under six languages while the sitemap listed three, 51
mixed-language de/fr/tr copies, Spanish and Portuguese pages with English titles, no structured
data and a build-day lastmod everywhere. Each research page, /paper, post and standing page is now
built, listed and linked only in the languages it is written in; the sitemap and every page's
hreflang agree; titles name the original work; pages carry ScholarlyArticle and breadcrumb data
citing the paper's DOI; lastmod is the latest review. A URL in a language a page lacks answers 301
to its English page (Caddy). The build now fails when a non-English page repeats the English page's
text, title or description, or when the sitemap, hreflang and built files disagree; the Spanish and
Portuguese validation check names, catalogue summaries and gallery cards that were still English
are translated. After deploy: resubmit the sitemap in Search Console.

#### A research WASM build that runs out of time keeps the bundles it finished (2026-11-04)

The research WASM job saved its cached bundles only when the whole job succeeded, so a job that hit
its time limit on a loaded runner threw away every bundle it had built, and the rerun built them
all again. The bundles build in parallel and each one is marked for saving the moment it finishes;
the build step stops at 75 minutes so the finished bundles are still saved within the job's 90
(was 60). A cache lookup that GitHub rate-limits is tried a second time instead of counting as a miss.

#### Route budgets in the merge queue compare against the group's real base (2026-11-03)

In a merge-queue group stacked on another pending group, the "Landing and app route byte budgets"
job measured its baseline on main, which lacked the group ahead. The pull requests ahead then
counted as this group's change, and a research file among them forced research isolation. The
baseline now comes from the commit the group was built on.

#### Merge-queue WASM builds no longer fail on another runner's compiler cache (2026-11-02)

The self-hosted CI runners are separate users on one host, and all of them talked to a single
sccache server on its default port. A job then compiled through a server owned by another runner
user, which could not read its files ("failed to spawn ... Permission denied"), and the PR left the
merge queue. Inside CI, the Nix shell now gives each runner user its own sccache server on a Unix
socket in a private cache directory, and builds without sccache when its server cannot start. Local shells are unchanged.

#### The 3D shed example no longer lists an earthquake combination it has no earthquake for (2026-11-03)

The industrial shed brings its own load cases (dead, roof live and wind) and no combinations, so
opening it in Basic 3D kept Basic's four defaults. The fourth, "1.2D + L + E", took a load case the
shed does not have: the solver skipped that factor and showed 1.2 D + 1.0 Lr under an earthquake
name. Its numbers were those of 1.2 D + 1.0 Lr, which never gave the largest magnitude of any member
force, reaction or displacement, but the name said the shed had been checked for an earthquake. The
shed now opens with the seven CIRSOC 101-2025 §2.3.2 combinations for its dead, roof live and wind
cases, and the stadium canopy, which had Basic's "L" combinations applied to its roof live case,
with the three for its dead and roof live loads. The biaxial cantilever, whose only load sits in its
own "Tip load" case, had every combination at zero; it now has one combination of that case. An
example, workbook or generated model that brings its own load cases and no combinations keeps
Basic's four only when each of their cases is there with the type it was written for and every case
it loads is in one of them; otherwise it gets the CIRSOC 101-2025 strength combinations of its own
cases, and is refused if a case it loads is in none of them (a workbook says so on its LoadCases
sheet and leaves the open model as it was). One with a load in a case it does not have, or whose own
combination names such a case or a factor that is not a number, is refused (a workbook without a
LoadCases sheet reports a load beyond Basic's four cases as a problem), and a share link whose loads
omit their case is read as case 1 and refused when there is no such case. Projects saved with the
old combinations solve as before; open the example again for the new ones.

#### A page served by the fallback no longer states the landing's structured data (2026-11-04)

A blog post, standing page, tool or research page reached through the fallback page used to keep
the landing's Schema.org data (an application at the English home page) until its own code had
loaded, and for good if that code failed to load. It now drops data written for another address
on arrival, so the page states only its own. Prerendered pages keep theirs.

#### A restored session's deferred re-solve no longer fails unrelated unit tests (2026-11-04)

Opening a saved session that had results schedules a re-solve 50 ms later. Without a browser
window (the unit tests), that timer threw after its test had finished. On a slow CI runner this
failed a whole Web Unit shard even though every test had passed. The re-solve now does nothing when
there is no window.

#### Time history refuses a response that is not finite (2026-11-02)

A linear time history could return NaN or infinite displacements with no refusal: with damping,
a model with fewer than two modes that carry mass (a single member whose rotations have no mass)
anchored its Rayleigh damping on an infinite frequency, and the run blew up. The damping is now
anchored on the finite modes only, and any response that is still not finite is refused with
`TH-NONFINITE`, translated in the app, instead of being shown (nightly #1196, #1205, #1207,
#1208, #1210, #1212).

#### Wall-clock budgets run only on a dedicated hosted VM, never on the shared runners (2026-11-03)

The merge queue already skipped the wall-clock assertions on the shared self-hosted runners and
checked them in the Timing Budgets job on a GitHub-hosted VM. Pushes to main and pull requests
on the self-hosted pool now do the same: every self-hosted Web Build and slow E2E step skips the
wall-clock assertions, and Timing Budgets runs for those events too, so a loaded runner can no
longer fail main and trigger a revert. Pull requests on GitHub-hosted runners check the budgets
in Web Build as before. The fixtures and the budgets are unchanged.

#### Tools warn when their result is outside what they check, and refuse a near-zero stiffness (2026-11-01)

Fixes from the second review of the eight Stabileo Tools (#900). Every tool now warns when the
largest displacement exceeds span/50, when the engine and the classical formula differ by more than
1%, and, for beam frequencies, when the member is stocky (L/r < 20); a bending stiffness below
1e-6 is refused, because below it the deflected shape silently dropped member loads. The influence
line snapped its section to the mesh, which fixes a shear about 200% off just past a support; the
frequency tool asks for more modes until it has three bending modes; the pilot merges
near-coincident mesh points and states its moment sign convention. The "First version · N review
rounds" note is gone from every tool; the review record stays in
`research/tools/batches/VALIDATION.json`. Re-check any influence-line shear read from a tool before
2026-11-01.

#### Undo and redo no longer lay a 2D model flat in 3D (2026-10-29)

A model drawn in Basic 2D stands in the X–Z plane when the view turns 3D. Each undo step also
recorded the space view of the moment, and in 2D that was the "as stored" one: undoing in 3D a
step taken in 2D restored it, and the model, still stored with its vertical as Y, lay flat on X–Y,
again with every further undo. A step taken in 2D now records no space view, and restoring it in 3D
chooses the view as switching to 3D does.

#### The Lean, symbolic and Kani proofs run in the merge queue (2026-11-02)

The verification workflow had no merge-queue trigger, so its proof checks never reported for
queued PRs. Each queue entry now diffs its base against its head and runs the proofs (Kani's fast
tier) when it touches what they cover, as pull requests already did; if the diff fails, the proofs
run anyway. A test requires every workflow that provides a required check to run in the merge queue.

### Performance

#### Focus pull-request CI on the changed area (2026-10-29)

Documentation-only PRs run repository lint and changelog checks. Research PRs
run research validation, focused unit and browser tests, and route budgets;
engine PRs keep engine suites and determinism with focused engine-facing smoke
flows. Unknown paths or mixed areas retain full coverage. Tools have a reserved
focused mapping that falls back to full CI until its tests exist. Pushes to main
and the nightly run always run the full pipeline; the merge queue runs the
gating subset described in the lighter merge queue entry. CI OK resolves
intentional skips while propagating failures and cancellations.

#### Kani runs on a pull request only when its inputs change (2026-11-06)

The Kani job took about 50 minutes on every pull request and merge-queue entry that touched any engine source. It now runs only when the change touches what the harnesses prove (the harnesses, the element, linear-algebra and type modules they call, the interval and sparse certificate arithmetic), the Cargo configuration, build script or Rust toolchain pins, the flake, the Kani scripts or the Verify workflow, and is skipped otherwise. When the changed files cannot be listed, it runs. Pushes to main and the nightly schedule always run it.

#### Kani proofs run in five CI shards (2026-11-06)

The Verify workflow now assigns the Kani harnesses deterministically across five runners, with each runner still checking one harness at a time under the existing watchdog, tier, unwind and solver settings. The required `kani` check passes only after every shard reports success; a failed, cancelled, skipped or missing shard fails the check.

#### Public pages prerender in parallel (2026-10-30)

The site build renders public routes through a pool of browser pages instead of one at a time
(#857). It defaults to at most six workers, bounded by the available CPUs; PRERENDER_CONCURRENCY
sets another positive count. Feeds and the sitemap retain their input order, and a render failure
names the route, stops assigning new work and closes the workers. This shortens the growing
multilingual site's build without changing its published content. Re-check generated pages,
feed order and the sitemap when changing the pool or route list.

#### Lighthouse scores can only get better without a recorded decision (2026-11-01)

A daily workflow runs Lighthouse against stabileo.com (median of five, mobile and desktop) and opens
an issue when a score moves beyond its margin from `web/perf-lighthouse.json`: down is a
regression, up is an improvement to record. Measured baselines, margins and the audit are in
`docs/performance/`.

#### Adding a research paper no longer grows the landing page or the app (2026-10-29)

- Research catalogue entries, experiments, gallery text and research translations load only on
  research pages (#840). The landing and the app no longer list them for preloading, so a new paper
  changes their size by 0 bytes.

#### Research and Tools load only when opened (2026-10-29)

Research pages load through their own loader (#840); the integration wave (#857) keeps both
Research and Tools behind the public-page boundary. Adding an experiment no longer brings its
catalogue, calculator translations or analysis into the landing page or editor's initial load.
Route-size checks guard that boundary. Re-check direct links to experiments and calculators as
well as navigation from the galleries when adding a route.

#### Reuse CI builds and tolerate transient infrastructure outages (2026-10-29)

CI retries known dependency-download infrastructure failures twice while keeping
code and test failures immediate. A download that stalls is killed after 15
minutes and retried as an infrastructure failure, cargo fetches without HTTP/2
multiplexing, and the retry wrapper no longer waits for daemons a command starts
(sccache held its output pipe, so Research WASM hung for an hour after the fetch). Self-hosted runners use their local Nix store;
hosted cache outages are non-fatal. Research WASM reuses a source-keyed cache
while validating and publishing the current viewer. Docker smoke tests both the
default source build (including engine WASM, research WASM and frontend compilation)
and a prebuilt-site build consuming the tested `site-production` artifact. A full
cold PR runs 5 engine WASM builds (the shared WASM job, Docker's source build and
three research validation jobs), 2 research WASM sets and 6 site builds, excluding
builds spawned by tests; a research source-cache hit reduces the research WASM
sets to 1 while leaving the other counts unchanged.

Every hosted job that fetches the Nix shell now does it first through the same retry, including
the hosted Timing Budgets job, the Andreassen and Fairclough research validations and the Lean
and Kani proofs, and a test fails if a job reaches `nix develop` or `make` before it.

## 0.4.0 (2026-10-28)

Release notes: [`docs/releases/v0.4.0.md`](docs/releases/v0.4.0.md) (also in
[Spanish](docs/releases/v0.4.0.es.md) and [Portuguese](docs/releases/v0.4.0.pt.md)). Safety advisories
SA-2026-021…024 are fixed and published in this release.

### BREAKING (results)

#### CIRSOC 301 steel verdicts of the design chain, registered (#461, 2026-10-25)

#461 changed steel member verdicts and reached main without a changelog entry or a re-check entry;
both are added now (results version 4, `docs/results-changes/2026-10-design-chain.md`). A limit
state the engine refuses holds the member («not evaluated») instead of failing it with an
infinite ratio. A section that does not state whether it is rolled or welded is checked both ways
and held where they disagree (it was taken as welded unless it came from a rolled catalogue); an
undeclared load height is read on the top flange and, where that fails, on the web. H.1 is rated
on the forces that act together (each combination at each station), so some ratios fall; unbraced
lengths are read per axis and per flange from the bracing; weak-axis shear (G.6) is checked; 0.95
to 1.00 reads as a warning. Cold-formed sections are no longer checked by CIRSOC 301 as if they
were hot-rolled: CIRSOC 303 is not implemented, so they read not designed, and an earlier pass is
not a valid verification. Projects solved before are told so on opening (re-check entries
`cirsoc301-refused-limit-state-holds`, `cirsoc301-undeclared-fabrication-and-load-height`,
`cirsoc301-concurrent-forces-and-lengths`, `cold-formed-not-checked-by-cirsoc301`).

#### Design never on the unfactored loads, completed; a NaN check and a staleness that hold on the combination path (2026-10-26)

- **Slabs, walls and the steel optimiser no longer design over the unfactored solve**
  (W2-01, SA-2026-024, which #588 fixed for footings and joints). The floor run designed slab
  bending from the result on screen's mx and my, and the optimiser took it as its one
  combination. With combinations to design for and none to read, every design refuses and says
  why (`designCombinationsWithheld`): not solved, only SRSS or ABS active, or an active list that
  names no solved one. An empty active list now counts as unsolved: the single solve stood in for
  it and footings, joints and floors designed over it. RC design says the combinations are not
  solved instead of "Define at least one load combination". The message no longer tells to
  "Solve again (Calcular)", which did not help when the combinations were refused.
- **The combination path checks for NaN displacements** before it publishes the base, the cases
  and the combinations, as the single solve does; #588's manual solve checked only the single.
- **Every manual solve cancels the pending live calc** (an export, the re-run), not only Enter and
  the ribbon: a live calc firing mid-solve made it report "the model changed" for an untouched
  model, or published its single solve in place of the combinations.
- **A solve that left the combinations out keeps the project stale** from any entry point; a plain
  Calcular after the refused re-run stamped it current over the same single solve. In Basic 3D the
  combinations' failure is information, not an error, when the single solve stands in. (#649)

#### Dynamic analyses refuse member insertion offsets and shell offsets (#460, 2026-10-25)

Modal, response-spectrum and time-history analyses, and the modal step of the seismic and wind
load plans, refuse a model with member insertion offsets or shell offsets and say why. They were
solved on the node lines, without the eccentricities the static analysis takes, so their results
for such a model did not include them. Registered with the design chain's changes (results version
4, re-check entry `dynamic-analyses-refuse-eccentricities`).

#### Free roofs get the §2.1.5 minimum wind force; with H, the dead load resisting it is checked (2026-10-22)

SA-2026-021: a free roof had no horizontal wind along its ridge and, across it, less than
CIRSOC 102-2025 §2.1.5's 0,75 kN/m² × Af at low and moderate speeds; each wind direction now has an
"open-building minimum" load case, Af the reader's or the whole vertical projection (#581).
SA-2026-022: with earth pressure H, 0,9 D + 1,6 H and 1,2 D + 1,6 H (the principal load not
acting) were never generated, so an effect where the dead load resists H came out low; they are
now, with or without wind and earthquake in the model (#581 and the advisory's PR). The site
altitude also accepts values below sea level, where Ke > 1 (#581). Results version 2.

#### RC columns are checked for both signs of the moment (D4-01, 2026-10-22)

A CIRSOC 201 column whose bars are not symmetric about the bending axis gets the capacity of its
weaker side; some columns that passed now fail, and the designer may pick more bars. The station
moments are magnitudes, but the uniaxial column capacity was solved with the +y face compressed
only, and the designer's 6, 10, 14… bars (and faces entered with nTop ≠ nBottom or nLeft ≠ nRight)
put more bars on the other side: 30×30 with 6 Ø20 at Nu = 100 kN carries 101.57 kN·m one way and
78.57 the other, and passed Mu = 100 at 0.98. The column kernel (`column_capacity_kernel.rs`) now
solves both signs and returns the weaker, with the governing sign (`momentSign` on the column
result); the station verifier, the designer and the engine gate all read it. Symmetric layouts are
solved once, bit for bit as before. The biaxial check already took the worst quadrant. Projects
solved before are told so on opening (re-check entry `column-capacity-both-signs`, results
version 3). Advisory SA-2026-023 (#590).

#### The solve path: one manual solve, design never on the unfactored loads, a re-check that says what it left out (2026-10-22)

- **Footings and joints no longer design over the unfactored solve** (W2-01, SA-2026-024).
  Live calc re-solves only "All loads" while the single view is on screen (deliberately, for a
  large model's sake), so after one edit the combinations were gone and a footing was designed
  for D + W at factor 1 where 1.2D + 1.6W acts. With combinations defined and none solved,
  `activeResultSet3D` is now null and the floor and connection panels say why
  (`combinationsUnsolved`). Re-check entry `design-on-unfactored-results`, results version 3.
- **Enter, the ribbon, ToolbarResults, the exports and the steel optimiser's re-verify solve
  through `runGlobalSolve`** (W5-01), Calcular's solve, and take its guard: an older Enter solve
  landed after a newer one was published. `runSolve3D` is gone; the base is still solved directly
  from these entry points. A view export right after PRO's solve failed no longer solves again
  (one solve, one error toast). The manual 3D solve now checks for NaN displacements and names the
  mechanism in PRO, as Enter did; Basic with load cases off solves no combination from any of
  them, as Enter already did.
- **The solve guard reads the solve settings, not only the model** (W5-03): a solve in flight
  when self-weight (or its case, the axis convention, the mode) changed published its answer
  under the new setting.
- **"Re-run analysis and design" fails when the combinations were refused or failed** (W5-02),
  and the project stays stale; it reported success over the single solve that stood in. A P-Δ
  run with no second-order equilibrium no longer stamps the project as solved, and a modal run
  alone no longer ends the stale state (and with it the "current" in an export's provenance).
  (#588)

### Added

#### Cables: a pretension per cable, and a warning when their own weight gives most of their tension (2026-10-22)

Specifications › Members › Cable takes a pretension (kN): the cable's tension on its drawn chord
under its own weight, from which the engine sets its unstressed length. Without one, the chord is
the unstressed length, as before. A cable given no pretension whose self-weight tension
(T₀³ = EA·(w·l_h)²/24) is over a quarter of its reported tension is warned, in en/es/pt: a heavy
member typed as a cable is usually a truss member (#527, #582).

#### PRO curved members as whole pieces, loads along the arc, plates with curved sides, IFC export in Project (2026-10-27)

An arc is picked whole (or one segment at a time), shows one local-axis triad, and has a panel with
its radius, angle, arc length, the chord error of its segments and Remake with another count,
keeping its id, section, material and end releases. Loads along the arc are given per metre of arc
in a global direction and spread on the segments keeping the total force. Results read N, V, T and
M against the length along the piece, and export as CSV. A plate side can follow an arc and share
the curved member's nodes. Project → Export offers IFC with design on or off.

#### PRO DXF templates over several levels, CAD-style snaps, assisted conversion, and per-floor plans in the CAD wizard (2026-10-27)

A DXF with several plans is prepared as templates: its regions found, each laid on a level by a
point, locked, aligned by two pairs of points (a scale mismatch is reported, never applied), its
layers shown or hidden and snapped or not. Object snaps on templates (endpoint, midpoint, center,
quadrant, intersection, perpendicular, nearest) are turned on one by one from the draw bar and
remembered per browser; F3 turns them off and on. Part of a template converts to members, arcs and
columns after a plan that reports duplicates, joins, T joints and loose ends. The CAD draft wizard
finds the separate plans of a drawing, lays each on the one below by its columns, and gives every
floor its plan and height in a table; the provenance records each floor's plan and the point each
plan was laid by. The DXF and IFC import dialogs use the application's palette.

#### PRO plates as physical objects, meshed on demand, with Diagnostics on the Analyse row (2026-10-27)

A plate is drawn as an outline of any number of nodes, with holes, material, thickness and area
loads kept on the plate, and holds no shells until it is meshed: from its panel or in a batch, as
free quadrilaterals or triangles or as a grid of rectangles or squares of chosen sides, after a
plan that lists what changes. Meshing before the analysis (on by default) meshes only plates with
no mesh or an out-of-date one, once per solve; a plate whose old mesh carries loads put on its
elements is never remeshed there, the analysis names it instead. A plate is picked whole or by
element, shows one local-axis triad when picked whole, and has per-plate extremes of its moments,
membrane forces and deflection in its own axes. Diagnostics now has its own command on the
Analyse row. Only objects drawn this way are plates: existing shells and the slabs of the building
generators are unchanged, and no saved result moves.

#### PRO use zones per floor, their live loads from the CIRSOC 101 table, and finishes (2026-10-27)

Use zones are drawn per floor or taken from a template's closed outlines, independent of the mesh.
Each zone takes an occupancy from the CIRSOC 101 table already in the application or a stated
value; names found in the drawing are offered as suggestions to confirm, never applied on their
own. "No load" is a decision of its own, shown apart from a zone with no use yet. The zones' live
loads, and finishes as a dead load of their own, are written as load definitions after a plan
that shows what is added, changed and removed, and running it again adds nothing; loads entered
by hand are never touched. Zones are copied between floors with their exceptions. A zone over a
plate not yet meshed loads the slab once it is meshed; finishes in a model with no dead-load case
are named in the plan and in Diagnostics.

### Changed

#### E2E runs in ten duration-balanced shards, and flaky tests have a quarantine (2026-10-23)

CI's end-to-end suite runs in ten shards instead of five, and the slow suite (the merge queue's)
is now balanced by measured duration like the smoke suite: `--shard=N/5` split it by test count
and left the Basic advanced sweep, 54 of its 120 minutes, in one shard (49 min there, 6 in the
lightest). The sweep is seven spec files now, none over ten minutes, over one shared harness
(`web/e2e/basic-advanced-sweep.ts`); no test was added or removed. The required checks are
`e2e (1)` to `e2e (10)`.

A test tagged `@flaky` is left out of the blocking runs and runs in the non-required `e2e-flaky`
job with two retries; the tag requires a linked issue (`web/e2e/README.md`). The Basic advanced
sweep's `tower-3d-2` is quarantined (#607: the mode-shape motion check reads too little on CI;
its frames now span a whole period before calling a shape still). The rebar workspace's
"restored proposal is PROVISIONAL" test is fixed instead: its poll gave up after 10 s while the
page was busy for 40 s after the filter press (#608 tracks the freeze itself).

#### Normative design is optional in PRO and off by default; the design chain enters main (2026-10-26)

The design stages (#462–#475: concrete design, detailing, other materials and codes, documents,
the design workspace, polish and reliability on a real building) enter main in one merge with the
switch of #624, so no intermediate state was deployed. PRO starts without the Design stage;
modelling, buildings and levels, loads and combinations, the analysis and its results, the
calculation exports and IFC need none of it. Settings → PRO → «Turn on normative design (in
development)» adds it, with the module's open limitations listed there. A project that already
holds design (bars, detailing, decisions) opened with design off keeps all of it and offers to turn
design on; a link that names a place of design asks first and turns it on for that visit only.
With design off, nothing of design runs: no sizing, no code check, no verification on a re-run.
Concrete, other-material and footing verdicts that move with the chain are told to the projects
they concern (results version 4, `docs/results-changes/2026-10-design-chain.md`).

#### `make test-changed` and a pre-push hook, for a faster local loop (2026-10-23)

`make test-changed` (scripts/test-changed.sh) runs only the tests the branch most likely affects,
against origin/main with uncommitted work included: `vitest related` on the changed web files,
the engine's library unit tests when engine/src changed, the integration targets whose own files
changed plus up to six named after a changed source file, and the backend tests when backend/
changed. It prints every command it runs and everything it skipped, and why; CI still runs it all.

`make hooks` points git at the versioned hooks in scripts/hooks. The pre-push hook runs the web
typecheck and the unit tests related to the pushed commits (usually 20 to 40 s, longer when a
widely imported module changed); `git push --no-verify` skips it.

#### IFC import keeps every straight piece of a curved edge on its own points (2026-10-27)

The analytical model of an imported building joined consecutive members that were offset from
each other, which turned the short pieces of a curved slab edge into fewer chords off the edge.
Pieces are now joined only when they point the same way (within 0.5°). A building imported from
now on can have more analytical members along curved edges, with the same total length; projects
already imported are not touched.

### Fixed

#### The verification report's bar marks count every stirrup leg, and its table is translated (2026-10-23)

The estimated bar marks of the PRO verification report read each stirrup's number of legs and
dropped it: a 4-leg stirrup was scheduled as one 2-leg hoop, so its cut list and steel weight left
out the inner legs. They are now listed as crossties (two per hoop for a 4-leg stirrup, across the
depth, hooked at both ends), and beams with different leg counts are no longer grouped as one mark.
The table's labels named keys that do not exist (`report.bm*`), so it printed the keys in every
language; it now uses the app's `pro.bm*` strings. Quantities only: no design check changes.
Found while clearing the type-check baseline (an unused `legs`).

#### The default steel declares its ultimate strength, so a new model's steel checks run (2026-10-22)

The material every new model starts with, "Acero A36", declared Fy = 250 MPa but no Fu, so every
CIRSOC 301 check of a new model, the bundled examples included, read "not evaluated: the material
lacks Fu" until the user typed it. It now declares Fu = 400 MPa, ASTM A36's minimum and the value
the grade catalogue gives A36. Fu feeds the design checks only, not the analysis. Found by the new
end-to-end test of the everyday path (#597).

#### Deleting or renumbering no longer leaves a load on a number someone else takes (2026-10-21)

Audit 2026-10, W1-01 to W1-05. A load names a node, a member or a definition by number, and
numbers are reused.
- **A deleted floor-load definition takes its loads with it.** They were kept as plain loads and
  went on into every solve. `removeGroup` now drops the loads the definition wrote, so deleting it
  from the panel or as a group does the same; undo brings both back. A load from a definition the
  model never held (a link, a paste) is still kept as a plain load.
- **Deleting a member takes its tendon, and deleting a node takes its imposed displacement.**
  Each delete kept its own list of load types, and neither list had the newer types. They now
  read one table, `LOAD_TARGET`, of what each load type stands on. Before, the solve skipped the
  orphan tendon and said "solved", and the orphan displacement made every solve refuse, naming
  the deleted node.
- **The solve refuses a load on a member or a node the model does not have**, naming the load
  and the number (`orphanLoadRefusal`: the single solve, both combination solves, direct
  analysis). Such a load now comes only from an older file or a paste. Before, a member load
  like that was skipped without a word.
- **Renumbering refuses while a load names something the model does not have**
  (`refused: 'orphanLoads'`, by load). The renumber left an unknown number unchanged, so a
  deleted support's settlement ended up on another support and solved.
- **A project spectrum's number is never given again.** Numbers were the highest in use plus
  one, so deleting spectrum 2 and adding a new one gave 2 again, and a spectral case on the old
  spectrum solved on the new one's placeholder table. The counter is saved with the project
  (`nextId.spectrum`). Older files start it past every spectrum and every number a case uses. A
  spectrum is not deleted while a spectral case uses it; the panel names the cases.

#### Editing a spectrum retires the results solved on the old one (2026-10-21)

A user spectrum feeds the spectral load cases of the main solve (#261), and the time history
its own run, but `setDynamics` recorded on the views undo channel, which retires nothing, and
the edit did not bump the model version: D + Ex solved on a 0.4 g spectrum stayed on screen
after the spectrum became 0.8 g, live calc did not re-run, and undoing the edit kept the 0.8 g
results (W3-01). The spectra and the time history are now a model edit: undoable, and the
results on hand are retired on the edit, its undo and its redo; a write that changes nothing
takes no step. Undo entries a session saved on the old channel restore them the same way.
Test: `web/src/lib/store/__tests__/spectrum-edit-retires-results.test.ts`.

#### PRO DXF of the envelope draws the envelope; no deformed shape for an envelope or SRSS set (2026-10-21)

The DXF integrated the envelope's end forces as one load state: each end's largest force, from
whichever combination gives it, with the first combination's member loads. On a portal whose
wind combination is listed before the dead load the beam was drawn and labelled at 320.59 kN·m
against an envelope peak of 49.16. It now draws the envelope's own positive and negative station
curves, labelled and scaled from the envelope, as the figures do (#271); the same holds when the
envelope is the set on screen. An envelope (each value from its own combination) and an SRSS or
ABS set (magnitudes without a sign) are no deflected state: neither writes a deformed shape any
more, and their reactions are written as values without an arrow. The RESULTS layer says what
was left out (W4-01, W4-02).

#### The re-check prompt names the 0.3.0 fixes to projects solved before them (2026-10 audit, V6-02)

Solves have been stamped with results version 1 since #328, which is deployed; the fixes merged
with 0.3.0 after it (#530: SA-2026-013…017) were registered at version 1 as well, so a project
solved on a build in between opened as current and was never told that its curved-shell, arc,
3D plastic-collapse, cable or soil-spring results had moved. Those entries are now at results
version 2 (`currentResultsVersion` 2), with the one the registry lacked for an app workflow:
member temperature loads (#407, FR-4, SA-2026-019; feature `memberThermalLoads`). The 3D
material-nonlinear yield surface (SA-2026-020) stays out: no screen of the app runs that solver.
A project solved on 0.3.0 itself also carries version 1 and is shown these entries once more.
`results-version.test.ts` pins each version's entries, so adding one to a version already on main
fails, and `docs/verification/PROVENANCE.md` states the rule. The committed `.ded` fixture is
restamped at version 2. (Version 2 was taken on main first, by #582 and #597; these entries share
it — a build stamping 2 already carries the five fixes, so it is never shown them, and a project
stamped 1 is shown every entry that followed.)

#### A member cut by a mesh keeps its loads on its pieces (2026-10-27)

Meshing a region with "split members" (the quick quadrilateral mesher, slabs meshed at the
analysis, and now physical plates) cut the members after the loads had been committed: the pieces
came without their loads, and the loads kept naming the member that was gone. The analysis then
refused the model ("Load N is on member M, which the model does not have"), so no result was ever
computed on the wrong loads and none needs re-checking. Meshes made from now on keep each load on
the pieces of its member, with its total. A project saved after hitting the defect still carries
those loads on a member it no longer has, and still says so when solved: delete them and put them
on the pieces.

### Performance

#### The landing and the blog load 0.46 MB instead of 6.4 MB (2026-10-23)

Every public page downloaded and ran the whole application (3 MB of JavaScript) and the engine
(3 MB of WASM) before it settled: Lighthouse measured performance 52 on the landing and 35 on the
blog, with the blog's largest paint at 19 s on a mobile profile. The public pages now render on
their own with only their share of the dictionaries, and the application and the engine load on
the first app route; an address that is the application's mounts it at once, as before (#595).

#### The engine's tests build in 7 binaries instead of 104, and rebuild three times faster (2026-10-23)

Every top-level `engine/tests/*.rs` was its own test binary, and each one linked the whole
engine: building and linking 110 binaries was most of `cargo test` and of CI's `test` and
`suite` jobs. The files are now modules of seven binaries by area (`gates`, `certificates`,
`shells`, `derivations`, `solver`, `elements`, `robustness`; `engine/tests/<binary>/main.rs`),
next to the six that were already directories. The files did not move. Measured on an M-series
Mac at 4 jobs, with the dependencies already built: building the test binaries went from 99 s
to 48 s (CPU 336 s to 156 s), rebuilding them after an engine change from 35 s to 11 s, and
`cargo nextest list` from 82 s to 13 s.

The same 8425 tests run (8469 with the ignored ones), each once in CI: every gate step
selects its file's module (`--test gates -E 'test(/^sparse_shell_gates::/)'`) and the suite
excludes exactly those, checked test by test against the old filters. Test names now start
with their file (`sparse_shell_gates::craig_bampton_deterministic`), so a single file runs
with `cargo test --test gates sparse_shell_gates::`. Since the binaries are listed
(`autotests = false`), `scripts/check-test-targets.py` (CI lint) fails when a test file is in
no binary, where it would never run, or in two.

#### The engine ships optimized: 25 % smaller, same results bit for bit (2026-10-23)

The deployed WASM engine was built with `--no-opt` (12.0 MB). It is now optimized with
`wasm-opt` (9.0 MB). CI checks every run that the optimized and the unoptimized builds give the
same results on the 184 determinism cases, bit for bit, so the optimizer cannot change a number
without failing the build.

## 0.3.0 (2026-10-21)

Release notes: [`docs/releases/v0.3.0.md`](docs/releases/v0.3.0.md) (also in
[Spanish](docs/releases/v0.3.0.es.md) and [Portuguese](docs/releases/v0.3.0.pt.md)). Safety advisories
SA-2026-005…020 are fixed in this release; SA-2026-001…020 are published.

### Fixed

#### Frame and truss temperature loads take the material's α and the section's depth (#407, FR-4)

Member thermal loads were computed with α = 12·10⁻⁶ /°C and the depth √(12·I/A) of the
equivalent solid rectangle, whatever the material and section (an IPE's gradient moment 30 %
low; aluminium's thermal force about half). A `thermal` load now takes `alpha` and the section
depth (`depth` in 2D, `depthY`/`depthZ` in 3D), and the app sends them instead of scaling the
load; a load without them is solved with the old defaults and carries a
`thermal_default_assumed` warning. The end-to-end certificate re-assembles thermal loads with the
same inputs. Advisory SA-2026-019.

### Added

#### End-to-end certificates for frames and trusses (2026-10-18)

The linear certificate proved the solution of the f64 `K` and `f` the engine assembled; an
assembly bug would have been certified. An independent checker
(`engine/src/certify/reassembly/`) now re-derives `K` and `f` from the model JSON in interval
arithmetic, from formulas written for it (cantilever flexibility and equilibrium, static
condensation of releases, work-equivalent loads on the exact Timoshenko shapes, its own DOF
numbering, supports, inclined supports and constraints), and certifies the returned
displacements against the exact model. The engine's assembled `K` and `f` must agree with it
to 1e-10 and the displacements must satisfy the model's kinematics. `certify_linear_2d/3d`
report `endToEnd` and `certificateLevel` (`endToEnd` / `assembled` / `none`). 2D and 3D frames
(Euler–Bernoulli and Timoshenko), trusses and cables, releases, local axes, springs,
settlements, inclined supports, rigid links, diaphragms, equal-DOF, eccentric connections,
MPCs, nodal, distributed, point and thermal loads; shells, connectors, curved beams and
warping are reported out of scope. Every fixture and 350 stable random frames agree and are
certified end to end; planted assembly bugs make it fail. Lean: `Certify.end_to_end_bound`.
Docs: `docs/verification/CERTIFY.md`, "End-to-end certificates".

Found by it (pinned in `engine/tests/certify_end_to_end_findings.rs`): 3D diaphragms in the
XZ plane tied the slaves with the rotation of the wrong sign (since fixed, #342); in 2D a nodal
moment on a node where every member is hinged (since refused before the solve), or a rigid link
from such a node, is held by the artificial spring and the assembled-level certificate
certifies a model that has no solution.
### Changed

#### Re-check prompt for old projects; provenance-stamped, reproducible results (2026-10-18)

**Results move in the last bits:** the engine now iterates its inputs in a fixed order, so a model
solves to the same bits every time; before, two solves of the same model in one session could
differ in the last digits (2D displacements, equilibrium sums, inclined-support models) and list
3D plate stresses in a different order. See `docs/verification/PROVENANCE.md`.

- `web/src/lib/provenance/result-changes.json`: machine-readable registry of result-affecting
  changes (results version, model features, en/es/pt explanation, changelog link), seeded with
  the October 2026 safety wave and the earlier BREAKING entries.
- Projects record which build last solved them (`snapshot.solvedWith`). Opening one solved with
  an older version lists the registered changes that concern that model in a notice that stays
  until acknowledged, with "Re-run analysis and design"; results stay marked stale until re-run.
- Every report (calc, PRO), workbook cover and CSV prints a provenance block: app and engine
  version and commit, WASM hash, model/settings/results hashes, engine input and result hashes,
  certificate hashes, stale flag. "Reproduce from provenance" re-solves and compares the hashes;
  `cargo run --release --example reproduce` does the same natively from the exported solver input.
- Engine: `crate::ordered` (key-ordered iteration of input maps), `DofNumbering::entries_by_dof`,
  WASM `engine_build_info` and `engine_reproduce_hashes`, `tests/determinism.rs`.
#### Discretization error: estimated next to every certified shell result (2026-10-18)

Certificates bound the algebraic error of the assembled system, not the mesh error. The engine
now estimates the second one, and never presents it as certified (docs/verification/DISCRETIZATION.md).

- `engine/src/postprocess/discretization/`: Zienkiewicz–Zhu estimator with superconvergent
  patch recovery for DKT, MITC4, MITC9, curved shells and SHB8 solid-shells (element and global
  energy-norm indicators; effectivity 1.01 for MITC4 and 1.10 for DKT at 16 × 16 on the Navier
  plate); uniform h-refinement (smooth or faceted geometry, frames split, supports and loads
  carried over) and a convergence study with Richardson extrapolation and observed order.
  WASM `estimate_discretization_3d`, `convergence_study_3d`. Frames are stated exact.
- Results panel: "algebraic error: certified ≤ X · discretization error: estimated ~Y% (not
  certified)", a warning above 5 %, an element error map and an on-demand convergence check
  (en/es/pt).
- Degenerate cases are reported as such, never as "no error": a loaded mesh that carries no
  strain (one simply supported element under pressure) is "cannot be estimated — refine the
  mesh", not 0 %; members with warping torsion, curved beams and members of variable section
  (solved as prismatic pieces) are not claimed exact.
- **Fix (results): curved-shell self-weight was 1000× too heavy** (density taken in kN/m³
  instead of kg/m³ like every other shell). Not reachable from the web app.
- SHB8 solid-shells are estimated from the ANS + EAS strain the element is built from (#401):
  on the Navier plate (t/a = 0.01) the centre deflection converges to Kirchhoff (0.972, 0.995,
  1.000 at n = 4, 8, 16) with effectivity 1.34, 1.23, 1.12, asserted like the other families.
- Refinement supports a new node only on an exterior edge between supported nodes: a slab on a
  column grid meshed one element per bay keeps its interior columns as points (supporting every
  edge between columns pinned the whole refined slab and reported it converged). When the rule
  adds supports the study says so (caveat `supportsInferred`, with the count). A model whose
  elements name a missing node is an error, not a panic; a non-finite estimate is `nonFinite`,
  never a NaN percentage; a last Richardson step within round-off is converged, not oscillating.

#### Design checks against published worked examples, part 2 (2026-10-18)

**BREAKING (results): cold-formed columns, steel columns braced about their weak axis, masonry
walls and partially grouted masonry shear walls get lower (correct) strengths; cold-formed
compression without `xo` is reported unevaluated.** Examples, sources and discrepancies in
`docs/verification/DESIGN_EXAMPLES.md` (D18–D31); tests in `engine/tests/design_worked_examples_2.rs`.

- `cfs_check`: flexural-torsional buckling (AISI S100 E2.2) from the new `xo`, `kx_lx`, `kt_lt`.
  It was weak-axis flexural buckling only: AISI Design Manual Ex. III-3 gave Pn = 10.4 against
  6.88 kips (+51 %). Without `xo` a compression demand is unevaluated.
- `steel_check`: AISC E4-2 torsional buckling of doubly symmetric members (`lcz`, default the
  longer flexural length); refused when the member can twist over a longer length than it buckles
  about y and neither J nor Cw is given. Constrained-axis torsion (girts on one flange) is still
  not covered (D20).
- `masonry_check`: untied bars no longer count in Pn (`laterally_tied`, +14 % before); shear
  carries γg (`gamma_g`, default 0.70 when An < b·t, +33 % before).
- `timber_check`: `le_bending` (Table 3.3.3 row when the loading is known) and `le_b` (column
  length across b, 0 for sheathing). Defaults unchanged.
- `foundation_check`: `neglect_size_effect` opts in to ACI 318-19 §13.2.6.2 (λs = 1 for
  footings). Default unchanged (λs applied).

#### Nodal masses in the engine (2026-10-18)

The engine took mass only from material density. `SolverInput`/`SolverInput3D` now take
`masses`: lumped **nodal** masses (t per direction, rotary inertia in t·m²), mass per length along
members (**line**, t/m) and, in 3D, per area over shells (**area**, t/m²). They are assembled into
every mass matrix (dense and sparse, inclined-support frames, before constraint reduction), so
modal, mass participation, spectral, time history, harmonic, Guyan/Craig–Bampton and their
certificates all see them; mass ratios divide by the mass per direction. Models without `masses`
give the same results as before. (#341)

- Validated against closed forms (SDOF, 2-DOF, torsional SDOF, cantilever with a tip mass),
  equivalent models (raised density, slave masses through a diaphragm, an MPC in place of an
  inclined support), the Bathe–Wilson frame and the SAC LA 3-storey case with the acceptance
  suite's mass stubs replaced by nodal masses: `engine/tests/nodal_masses.rs`.
- Web: the mass source sends load mass as line and area masses instead of copies of the material
  with a raised density (same modes to 1e-10, tested), and point masses — with a button for floor
  masses on the diaphragm masters — from the mass-source panel (en/es/pt).

#### Rigid diaphragm rotates as one body (2026-10-18)

**BREAKING (results): every node of a rigid diaphragm now rotates in plane with its master**
(θz for an XY diaphragm, θ in 2D). The slave nodes' own in-plane rotation was left free, so the
columns under a rigid floor twisted against nothing at their tops: storeys were too soft in
torsion and the column end torques came out zero. SAP2000/ETABS diaphragms and OpenSees
`rigidDiaphragm` tie it. Engine inputs with a diaphragm get new results (torsional periods,
column torques and moments, drifts); models without one are unchanged. Web projects are
unchanged: the web already added an equalDOF on that rotation for every slave, which is removed
now that the engine ties it. (#342)

- `engine/src/solver/constraints.rs`: both the dependent-DOF list used by validation and the
  constraint equations tie the slave's in-plane rotation; inclined-support frames go through the
  same equations.
- **BREAKING (results): 3D XZ diaphragms** coupled the slave to −θy (the XY lever pattern); they
  now follow ω × r. **Diaphragms in all-truss models are refused**: with no rotational DOFs the
  floor's rotation cannot be represented (a 3D one tied uz instead). In 2D, plane "XZ" is the
  model plane as "XY" is; "YZ" is refused.
- **BREAKING (results): web 2D solves** sent 3D floor (XY) diaphragms as a rigid body in the
  frame's plane, making floor beams rigid in vertical bending; a floor now ties ux only, a YZ wall
  uz only, an XZ diaphragm stays a 2D diaphragm.
- `engine/tests/diaphragm_rotation.rs`: a storey with a diaphragm matches the same storey with a
  floor of in-plane-rigid beams (displacements, column end forces, periods to 1e-4); slave θz =
  master θz in static, modal, 2D and inclined-support cases. On the old code the torsional period
  of that storey came out 6.9 % long and the column torques were zero.
#### Solid shell: Poisson thickness locking and in-plane locking removed (2026-10-18, #400)

**BREAKING (results): solid-shell (SHB8) models with ν ≠ 0 deflect more — about 22 % more in
thin-plate bending at ν = 0.3 — and solid shells bent in their own plane deflect up to ~10×
more.** The old values were too stiff (unconservative for deflections; moments in indeterminate
structures and modal frequencies shift too). Re-run solid-shell models.

- Root cause: the trilinear element's thickness strain is constant through the thickness, so
  bending with ν ≠ 0 carried a spurious σ_zz and used the constrained modulus
  E(1 − ν)/((1 + ν)(1 − 2ν)) instead of E/(1 − ν²): 1.225× too stiff at ν = 0.3 on every mesh
  (simply supported plate centre deflection 0.80–0.82 of Navier under refinement). Separately,
  in-plane bending locked through parasitic in-plane shear (MacNeal–Harder in-plane cantilever
  0.09).
- Fix (`engine/src/element/solid_shell.rs`): five condensed enhanced assumed strains, Simo–Rifai
  mapped so the patch test holds — the thickness mode E_ζζ ∝ ζ (Büchter–Ramm–Roehl) and the
  membrane EAS-4 set (Andelfinger–Ramm) — on top of the existing covariant ANS. Stress recovery
  uses the same ANS + EAS strains.
- Now: thin plate (t/a = 0.01, 0.001) → Kirchhoff at observed order 2.0 (32×32: 1.0000); thick
  plate → Mindlin with κ = 1 (the single-layer limit, 0.8 % / 2.9 % stiffer than κ = 5/6 at
  t/a = 0.1 / 0.2); pure bending with ν exact; Scordelis–Lo 0.997 (16×16); pinched cylinder 0.988
  (32×32); hemisphere 0.98–1.00; MacNeal–Harder straight cantilever out-of-plane 0.96–0.98,
  in-plane 0.98 regular / 0.62 parallelogram / 0.05 trapezoidal (trapezoidal locking, inherent).
- Tests: `engine/tests/solid_shell_locking.rs`; solid-shell benchmarks tightened (Navier 0.5–2.0×
  → ±1 %, Scordelis–Lo, twisted beam, hemisphere). Two benchmark bugs fixed: the Navier reference
  lacked the series' alternating sign (5.7 % high), and the solid-shell hemisphere tests pulled
  both equator points outward with the equator held in z (the reported "4e-4 membrane locking").
### Fixed

#### Curved shells report their bending moments and thermal stresses (SH-6, #410, 2026-10-21)

**BREAKING (results), advisory SA-2026-013.** `curved_shell_stresses` returned
mx = my = mxy = 0 whatever the bending; the moments are now the in-plane stresses integrated
through the thickness (two Gauss points in ζ, sign as the flat MITC4, which a flat curved shell
matches to 1e-6). Under `curvedShellThermal` the stresses, moments and corner Von Mises kept the
free thermal strain; they now use ε − α·(ΔT + ζ·ΔTg/2), summed over the element's temperature
loads and per load case (the curved-shell Kg takes its membrane stress from the same recovery).
The app sent a curved quad's temperature as `quadThermal`, which named no flat quad and was
dropped, so the shell was analysed unheated; it is sent as `curvedShellThermal`, and the engine
refuses a shell load naming an element of another family. A cantilever strip of curved shells
reports the static root moment, 35 kN·m/m (was 0); a free heated curved shell reports zero
stress (was E·α·ΔT/(1−ν)). The SH-6 known-issue warning is removed.
#### Curved members keep one section orientation along the arc (#418, #523, SA-2026-016)

The straight segments of an arc took the default local axes of a straight member, which switch to
a global-X reference within 2.56° of vertical. In an arch outside the X–Z plane the near-vertical
segments at the springings so had Iy and Iz swapped: a 40-segment semicircle in the Y–Z plane
gave a crown deflection 15 % lower (−6.18 mm instead of −7.29 mm) than the same arch in the X–Z
plane. Every segment now takes local y = a·n + b·(n × x) from the arc's plane normal n, with (a, b)
those of the default rule at the middle of the arc: plan curves keep local z vertical as before,
arches keep local y normal to their plane, tilted arcs no longer roll. Engine curved beams
(`expand_curved_beams_3d`, `ArcSectionFrame`) and the app's arc tool both apply it, and arcs
saved before take it when the project opens (re-check notice `arc-member-local-axes`). The SP-15
known-issue warning is removed. Tests: `engine/tests/derivation_special_elements.rs` (explicit
members, rotation about the vertical, plan curves, tilted arcs) and
`web/src/lib/model/__tests__/curved-member.test.ts`.
#### 3D plastic collapse factor no longer depends on element numbering (2026-10-21)

**BREAKING (results)** (#511, SA-2026-014). When the hinge reversal checks of
`solve_plastic_3d` cycled under biaxial bending, the solver went on from whichever state of the
cycle the element order left it in and pushed a closed section through the yield surface: the
same structure, renumbered, reported 75.9 to 424.3 against a certified collapse factor of 176.5.
It now stops at the last consistent state and reports that factor with a warning and
`isMechanism = false` (a lower bound, static theorem); choices among hinges go by rate, not by
element number; and a span peak within 0.1 % of the member length of a hinge of the member does
not form a sliver hinge. The PC-3D known-issue notice is removed.
#### Cable tension follows the elastic-catenary chord law (2026-10-21, #416, #415, #525)

**BREAKING (results): cables with self-weight in statically indeterminate structures carry more
tension.** The cable solve used Ernst's modulus (the tangent of the chord law) as a secant from the
straight chord, ε = T/EA + (w·l_h)²/(12T²) instead of T/EA − (w·l_h)²/(24T²), so a cable that
shares its load got too little tension (guyed mast: 4.34 kN instead of 5.18 kN) and the iteration
often oscillated. It now runs Newton on the chord law (`element::cable_chord_tension`), with Ernst's
modulus as the tangent and the rest of the linearised law as nodal forces, so the converged state
satisfies the law exactly; reactions balance the reported tensions. With the unstressed length equal
to the modelled chord, a cable with weight hangs at T₀³ = EA·(w·l_h)²/24 with no load and no longer
goes exactly slack; a vertical cable has no sag term. `ernst_tangent_modulus` now returns the
chord-law derivative (it was negative for moderate α). Known issue SP-12 removed. Advisory
SA-2026-015.
#### Soil curves follow their references (2026-10-21, #421, #422, #423, PR #526, SA-2026-017)

The SSI soil curves departed from the references they cited. Soft clay omitted Matlock's
J·c·z/D term (p_u 84 instead of 124 kN/m in the test); it is now API RP 2A's tabulation of
Matlock's static curve with J a required input (0.25–0.5). Sand always used the cyclic A = 0.9
and a step k table; it now takes `loading` (static A = max(3 − 0.8 z/D, 0.9), or cyclic) and
interpolates k in API RP 2GEO Table 5, refusing φ outside 25–40°. The "stiff clay" curve jumped
from 0.5·p_u to p_u at y50; it is now Welch & Reese (1972) stiff clay without free water,
continuous (`free_water: true` is refused). t-z and q-z returned stresses: t-z now needs the
shaft perimeter and q-z the tip area (kN/m and kN), q-z follows API's table, and the q-z tip
spring is no longer multiplied by a tributary length and bears only in compression. Springs on
missing nodes or along rotations are refused. Missing inputs are refused, never assumed.
The app's SSI panel asks for J and the sand loading. Known-issue warnings AC-12, AC-13 and
AC-16 removed. Tests: `engine/tests/soil_curves_references.rs`.
#### MITC9 on curved geometry reproduces rigid-body motion (SH-7, #411, SA-2026-018) (2026-10-21)

**Results change for curved MITC9 meshes (engine/WASM only; the app creates no MITC9).** The
MITC9 projected its nine nodes onto the corner-diagonal plane with no rigid-link correction, so a
rigid rotation strained any curved or warped element (relative K·r residual 0.11 on a 2 × 2 m
patch with 0.2 m sag; 101 MPa of nodal von Mises stress for a 1 mrad rigid rotation, steel,
t = 50 mm). Each node is now tied to its projection by a rigid link (the MITC4 warp correction on
all nine nodes) in the stiffness, the stress recovery and the thermal load.
Flat MITC9 elements are unchanged. Pinched hemisphere (MacNeal–Harder) at 16 × 16: 0.935 → 0.976
of 0.093 (0.504 → 0.681 at 8 × 8); Scordelis–Lo and the pinched cylinder move by less than 0.1 %.
The element is documented as a flat facet (curvature from the mesh). The `SH-7` known-issue warning
is removed. The Scordelis–Lo MITC9 effectivity check against w₃ − w₀ is dropped: the faceted
energies are not monotone under refinement, so that difference is not the error (θ was 0.99 by
coincidence, 1.57 after the fix with the same displacements).
#### 3D material-nonlinear yield surface matches 2D (2026-10-21, #429, NL-6, SA-2026-020)

**BREAKING (results): 3D material-nonlinear members with axial force or biaxial bending yield
earlier and report a higher utilization.** The 3D solver yielded at
(N/Np)² + (My/Mpy)² + (Mz/Mpz)² > 1; squaring the moment ratios made a 3D member yield later
than the same member in 2D ((N/Np)² + |M|/Mp): 15 % later about one axis at N = 0.5·Np,
0.74 against 0.95 for the same planar state, and a tip moment of 0.6·Mp about each axis stayed
elastic. It now uses (N/Np)² + |My|/Mpy + |Mz|/Mpz, in yield detection and in the utilization
(from the reported secant forces): the 2D surface for bending about one axis, and between the
axes the chord between the uniaxial limits. Engine and WASM API only; no app screen calls the
solver. The NL-5 warning no longer mentions NL-6. Tests in `engine/tests/derivation_nonlinear.rs`;
advisory `docs/advisories/SA-2026-020-material-nonlinear-3d-yield-surface.md`. Still open for 2D
and 3D: the (N/Np)² term is the rectangle's and is unconservative for the strong axis of an
I-section at high axial force.

#### Silent errors from the element-derivations review: 2D-in-3D signs, settlements, Winkler, imperfections, constraints (2026-10-18)

**BREAKING (results): a flat 2D model solved by the 3D solver now turns nodal moments and
prescribed rotations the right way** (#435, AC-15). Standing the plane in X–Z is a reflection:
the plane's counter-clockwise θ is a rotation about −Y. Both went in unchanged, so the embedded
solve modelled the mirror image of the load and the support rotation (a nodal couple moved the
loaded node up instead of down). `buildSolverLoads3D` sends `my = −M` (the hunk is identical to
#274's) and the support mapping `dry = −θ`. Store-level test of every rotation-carrying input
against the 2D solve (`embed-2d-rotations-store.test.ts`); member couples are #343/#274.

**BREAKING (results): Winkler member forces include the bed** (AC-7). End forces are
(K_e + K_f)·u − FEF; they were K_e·u − FEF, so a free end on a bed reported −K_f·u of shear and
moment, and the shear jumped at every node. The bed reaction −k_f·v(x) is reported with the
member loads (16 linear pieces) so a diagram closes. Checked against Hetényi's beam on an
elastic foundation (w₀, M₀ = P/4λ, V = P/2, M(x)) in 2D and in 3D for both beds. The 3D `kz`
bed uses D·K_f·D (AC-6, the hunk of #330). A bed on a member with a released end is refused. The
Winkler solves build the prescribed displacements as the linear solve does (the inclined-roller
projection was missing).

**BREAKING (results): one stored constraint means one thing in the 2D and the 3D solve**
(AC-3, AC-5). The web sent a floor (XY) diaphragm to the 2D solver as it was, which reads it as
the in-plane rigid body and so made the beam it spans rigid in bending; it now sends its trace on
the X–Z plane (XY: equal u_x, YZ: equal u_z, XZ: the rigid body). A rigid link with no DOFs
listed, a pinned arm in 3D, was a fixed arm in 2D: it is now sent as [u_x, u_z]. A linear MPC
term on ry keeps its meaning in 2D (θ = −ry: the coefficient turns). The engine's own defaults
are unchanged and documented in `types/input.rs`.

**New refusals instead of silently ignored input:**
- **Settlements on a DOF the support leaves free** (AC-10): a 2D `pinned` with `dry`, any
  settlement on a `spring` support, a roller's off-axis component, a rotation in a truss-only
  model, a 3D unflagged DOF or one a spring frees, a free rotation at an inclined support.
  The message names the support, the value and why. (At an inclined support the documented
  projection of a global settlement on the normal stays.)
- **Imperfections** (NL-9, NL-10, NL-11): 3D notional loads looked for gravity along Y by default
  (Z is up) and found none; member loads were not counted as gravity. The gravity axis now
  defaults to the model's vertical, and member loads on frames are lumped into it. Residual
  stresses and initial displacements (never applied), a missing node, a lateral direction equal
  to the gravity axis, shell gravity loads, and notional loads that find no gravity are refused.
  `NotionalLoadDef.gravity_axis` is now `Option<usize>`. In the app, notional loads along Y on a
  plane model (held out of its plane) and on a model without downward load are refused.
### Fixed

#### 2D: loads along inclined members reach the member; couples on members in the 3D solve (2026-10-18)

**BREAKING (results): the axial force N of inclined plane members under global, angled or
self-weight loads now varies along the member, and plane models solved in space take couples on
members and no longer mirror nodal couples.** Rebase of #274 by @diegokingston onto the safety wave.

- The part of a load that runs along an inclined member used to reach the 2D solver as nodal
  loads at its ends. Reactions and displacements were right, but N came out constant at the mean
  of its true end values. A 3-4-5 member under 10 kN/m vertical read N = 0 at both ends; the
  correct values are −15 and +15. The diagram, inspector, despiece, report, Excel and design all
  read that value. Point loads now put their axial part in `px`. Distributed loads and self-weight
  use a new engine load, `axialDistributed` (dense, sparse, parallel, truss, corotational,
  moving loads, combinations, plastic, diagrams).
- In a plane model solved in space, a couple on a member was dropped: a beam loaded only by one
  had zero reactions. Nodal couples went in about +Y, which is the mirror image of the drawn
  load (standing in X–Z is a reflection), so the vertical reactions came out with the wrong
  sign. Both kinds of couple now go in as −M about Y.
- Where the safety wave met the new load: the event-to-event plastic solve cuts it at an
  interior hinge the way it cuts a distributed load (before, part of the load was lost), the 2D
  diagram certificate bounds N between stations under it (before, it certified a zero gap), and
  the exact plastic certificate refuses it by name.
- Plastic collapse reads |N| where it can peak inside a member (a sign-changing axial load
  peaks between the ends), and when a member yields axially its axial point loads, and on a
  truss its transverse loads too, stay on the structure at its ends. Before, part of the
  load was lost, and a frame member with only an axial point load counted as crushed.
- 2D buckling decides that a member is compressed from its mean axial force, the force its
  geometric stiffness is built from. A member whose end forces are both 0 but which is
  compressed along its span is no longer refused as "No compressed elements".
- The 2D diagram certificate bounds N' by q_x on each interval, so an axial point load's jump
  beside an axial span load is no longer dropped.
- Corotational truss and cable bars recover the axial span load: N varies along them as in
  the linear solve instead of being constant.
- Staged construction applies member loads on truss bars. Before, it dropped all of them:
  axial span loads, distributed and point loads, and temperature.
- Moving-load envelopes of N, V and M read the diagram along each member, not only its end
  values. Under a span load M peaks inside the span, and under a sign-changing axial load so
  does N, so these envelopes can now be larger than before.
- 2D models already materialized to PRO keep their old mirrored couples and lumped axial loads.
  There is no migration.
#### Web: real torsion constant, shear centre and warping constant for 3D sections (#439)

**BREAKING (results): 3D sections reach the engine with their real J and shear centre, and
3D buckling with their warping constant.** With the Wagner term in the geometric stiffness
(#404) these decide torsional and flexural-torsional buckling, and the web sent none of them
properly.
- **J is never invented.** A section with no torsion constant used to get J = 0.001·Iy, which
  with the Wagner term set a torsional buckling load out of nothing (spurious low modes, P-Delta
  instabilities). J is now the tabulated or declared value, the exact one of a circle or tube,
  or Saint-Venant solved on the section's mesh (IPE 300: 20.1 cm⁴, table 20.12). A section with
  none is sent with J = 0 and its members released in torsion (they carry no torque in the
  static solve), and buckling, P-Delta, co-rotational and imperfection analyses refuse those
  members by name. The sections table shows "—" for an unknown J instead of the made-up value.
- **Shear centre.** Solved on the section's mesh and sent as `shearCenterY/Z`, so channels,
  tees and angles get their flexural-torsional coupling (UPN 200, 2 m: the coupled
  twist mode at 1642 kN). A tee, channel or angle stated by its properties only has no shear
  centre: the same analyses refuse it rather than take the centroid. A section stated by its
  properties with no shape is taken as symmetric, as before. The co-rotational solver does not
  model the offset and refuses these sections (#434), where it ran without the coupling.
- **Warping constant in buckling only.** Cw is solved on the mesh (IPE 300: 125.9·10³ cm⁶ to
  0.1 %; UPN 200: 8990 cm⁶, table 9070) and given to the buckling analysis alone, on straight
  runs of compressed members with no end releases, most compressed first, so that no node ties
  the warping of members at an angle (the engine's warping DOF is one per node; sharing it
  across a beam-column joint would restrain the column's warping, the unconservative side).
  Supports leave warping free (effective torsional length factor 1). Every other member keeps
  Saint-Venant torsion, whose G·J/r0² is a lower bound. The static solve, modal, spectral and
  P-Delta analyses get no Cw, so their results do not depend on it; P-Delta's torsional limit
  stays the conservative G·J/r0². IPE 300 column, 2 m, fork supports: buckling is the
  weak-axis Euler load 2981 kN, with the torsional mode at (GJ + π²ECw/L²)/r0² ≈ 4660 kN;
  without Cw torsion governed at 928 kN.
- Results that move: 3D buckling of open sections (higher torsional loads where Cw now counts,
  lower flexural-torsional loads for channels, tees and angles), 3D static torsion of members
  whose section had no J (now zero torque), and analyses refused for sections with no J or a
  missing shear centre. Checked end to end through the model store
  (`web/src/lib/engine/__tests__/section-torsion-buckling.test.ts`).
- Torsional modes between twist restraints now appear even in members left as one element:
  without warping the element's twist is linear, so a member whose two ends are held in twist
  had no torsional freedom and its torsional buckling was never found (a king-post truss of IPN
  300 beams, held out of plane at every node: torsional modes at λ = 11.6 behind the in-plane
  51.7, which the space model now shows). The twist inside one warping element is a cubic, like
  the deflection, so one element between twist restraints overestimates the Cw term (only) as it
  overestimates the Euler load (up to 21.6 % for fork ends); two elements bring it under 1 %.

#### Torsional buckling and response-spectrum combination fixed (2026-10-18)

**BREAKING (results): 3D linear buckling and P-Delta now include the torsional terms of the
frame geometric stiffness** (#404). The Wagner term P·r0²·θ'² (r0² = (Iy + Iz)/A + y0² + z0²
about the shear centre) and the shear-centre coupling were missing, so torsional and
flexural-torsional buckling were never found and the flexural load was reported instead
(unconservative: a 200×10 mm cruciform, L = 1.5 m, reported 5860 kN for a governing 2993 kN,
+96%). Load factors drop for cruciforms, angles, tees, channels and short open sections.
- New optional section fields `shearCenterY`, `shearCenterZ` (m, from the centroid, local
  axes) for monosymmetric and asymmetric sections; absent = 0.
- Sections without `cw` have no warping stiffness in the model, so their torsional buckling
  load is GJ/r0²: conservative for I-sections, and for short I columns it can now govern.
  Declare `cw` (warping DOFs) for open sections whose torsional load matters.
- One Kg for every path: buckling, P-Delta tangent and second-order forces, the buckling
  and P-Delta certificates, `build_kg_from_forces_3d`, 12-DOF (linear twist) and 14-DOF
  warping (cubic twist) members, releases (a torsion release removes the terms). The
  co-rotational solver adds the Wagner torque to its residual and tangent and refuses
  sections with a shear-centre offset.
- Checked against Euler, P_T = (GJ + π²ECw/L²)/r0², the flexural-torsional cubic for
  channels, tees and an asymmetric section, the P-Delta twist amplification 1/(1 − P/P_T),
  and unchanged I-section loads where flexure governs
  (`engine/tests/torsional_buckling_and_spectral.rs`).

**BREAKING (results): response spectrum** (#405).
- The base shear is combined with the requested rule. It was always SRSS, also under CQC
  (unconservative for closely spaced modes: ×1/1.23 at ω₂ = 1.1ω₁).
- Member forces combine each end's signed per-mode value and take the envelope of the two
  ends afterwards. They combined the per-mode max(|start|, |end|), which made every CQC cross
  term non-negative (conservative, up to 2.7× for opposite-sign modes). Lower forces are
  possible where modes contribute with opposite signs.
- An unknown combination rule is refused (it ran CQC silently); SRSS/CQC are case-insensitive.

**BREAKING (results): modal participation includes the support-coupled mass** (#405).
Γ and the effective masses used M_ff·r_f; with a consistent mass the ground-motion load is
(M·r)_f = M_ff·r_f + M_fr·r_r, as time history already applied. Participation factors,
effective masses and mass ratios rise (a one-element cantilever: Σ M_eff from 37% to 75%
of the mass, the rest moving rigidly with the support), and the spectral displacements and
forces now have the exact static limit. The spectral certificate uses the same load.

## 0.2.0 (2026-10-18)

**Results change: re-run your projects.** Release notes for users, in English, Spanish and
Portuguese: [`docs/releases/v0.2.0.md`](docs/releases/v0.2.0.md) ·
[es](docs/releases/v0.2.0.es.md) · [pt](docs/releases/v0.2.0.pt.md). They list every change
that affects results (defaults, loads and combinations, CIRSOC 201/301, ACI, EC3, AISC, AISI,
analyses), the new refusals, the sanity review and the corrected example models. This is the
first tagged release: everything below was already deployed to stabileo.com as it was merged.
The app now shows its version in the status bar and, once, a notice that results may have
changed with a link to the notes.

### Changed
#### Element formulations documented for independent review (2026-10-18)

`docs/solver/` documents each element and solver family's derivation, assumptions, conventions
and tests (roadmap "Solver and proof depth" item 10). Findings while writing the frame family:

- **3D `leftHand: true` is now refused.** It reversed local y and made the member triad
  improper, so the element stiffness changed with the labelling of an axis (tip twist of a skew
  cantilever changed sign). No product path sent it. Test: `derivation_frames.rs`.
- The beam-station output's declared sign convention now matches its values (2D moments are
  hogging-positive; 3D components are the resultant on the negative face). Values are unchanged.
- The 2D/3D shear-area pairing (`as_y` goes with `iz` in 2D, with `iy` in 3D) is spelled out in
  the input docs.

Shells (`docs/solver/shells.md`, tests in `derivation_shells.rs`). **BREAKING (results)** for
curved shells, walls in dynamics and heated shells:

- Curved shell: transverse-shear ANS transform corrected on non-rectangular elements (it was up
  to 1.75× too stiff in shear on a 60° parallelogram). Drilling penalty is now an area integral
  as in MITC4 (it was h × that and unit-dependent). Self-weight was 1000× too large (kg/m³ not
  converted to kN).
- Shell rotary inertia is now about the element's in-plane axes. A vertical wall used to get
  inertia about its normal (drilling) and none about one in-plane axis. Horizontal elements are
  unchanged.
- Geometric stiffness of DKT, MITC9 and curved shells uses the mechanical strain, so free thermal
  expansion no longer creates membrane force (or a spurious buckling load).
- DKT nodal stresses subtract the thermal strain, and several thermal loads on one shell are
  summed in stress recovery (only the last was used).
- Follow-ups from review:
  - The summed thermal loads are keyed by (family, id), so a quad and a quad9 sharing an id
    no longer double each other's correction.
  - The curved-shell rotary mass is built from the nodal directors, so a spin about the
    director is massless.
  - The time-history initial acceleration handles mass nullspaces that are not coordinate DOFs
    (an oblique shell's drilling rotation). It had fallen back to diagonal lumping, giving a
    25% error on a 45°-rotated quad.

Assembly, supports and constraints (`docs/solver/assembly-constraints.md`, tests in
`derivation_assembly_constraints.rs`). **BREAKING (results)** for the cases listed:

- Rigid links, eccentric connections and diaphragms in 3D truss/cable-only models (3 DOFs per
  node) read the master's vertical displacement as its rotation. They now branch on the model's
  dimension.
- 2D diaphragm planes: "XZ" (the 2D plane) is now the in-plane rigid body, "YZ" ties vertical
  displacement only, and unknown plane names are refused (they fell back to XY). The 3D "XZ"
  diaphragm had both rigid-body signs flipped.
- Reactions at an inclined support that also carries a spring now balance the loads. 3D rotated
  the spring force with the normal reaction, and 2D dropped it.
- 3D Winkler `kz` foundation: the translation–rotation coupling signs were not flipped, so a
  symmetric beam deflected half as much under z as under y.
- API RP 2A sand p-y: the C1, C2, C3 coefficients now follow the Reese–Cox–Koop formulas. Ultimate
  resistance was 5× too low near the surface and 16× too low at depth.

Fiber beams and cables (`docs/solver/special-elements.md`, tests in
`derivation_special_elements.rs`). **BREAKING (results)** for fiber analyses:

- Fiber beam, 2D and 3D: the sign of the bending curvature mirrored the strain field. Results
  change for any section not symmetric about its bending axis (asymmetric reinforcement,
  T-sections, eccentric fibers).
- Fiber member forces are now the fiber section resultants. They were elastic-stiffness forces,
  off by orders of magnitude after yield.
  The elastic forces removed use the same Timoshenko shear parameters as the linear recovery.
- Non-positive shear areas (`asY`/`asZ` ≤ 0) are refused. Zero gave a NaN stiffness and a
  negative value a negative shear parameter, silently.
- Fiber material history is committed only at convergence, so results no longer depend on the
  load stepping.
- Steel `hardening_ratio` is now the true post-yield slope over E (it gave αE/(1+α)).
- 6 and 7 integration points really use 6 and 7 points. Counts outside 3–7 are refused (2 gave a
  wrong elastic stiffness).
- `irvine_parameter`: removed a spurious factor L (unused by the solvers).

Nonlinear (`docs/solver/nonlinear.md`, tests in `derivation_nonlinear.rs`):

- Co-rotational 2D (also arc-length and displacement control): member-end deformational rotations
  are now reduced to (−π, π]. Members drawn right to left, or rotating past ±π, no longer get a
  spurious 2π of bending. A cantilever fixed at its right end used to fail to converge.
- The 3D co-rotational leaning-column reproduction (SYMBOLIC.md item 5) now passes and is a
  regular regression test.

#### CIRSOC 301 steel checks in the engine, re-checked and certified (2026-10-17)

**BREAKING (results): steel members bent about both axes without axial force are now checked by
H.1.1b**, which the TypeScript checker skipped (unconservative). Every other CIRSOC 301 number is
unchanged: the engine agrees with the previous checker to 1e-9 on 4 000 random members.

- `engine/src/postprocess/cirsoc301_check.rs`: tension D.2 (Ae = An·U), compression E.3/E.4/E.7,
  single angles E.5 and double angles E.6, flexure F.2–F.6 with load height and Cb, shear G.2/G.4,
  interaction H.1; generic over `Real`; WASM `check_cirsoc301_members`, `certify_cirsoc301_members`.
- `cirsoc301.ts` is an adapter over it; every steel pass is confirmed by the certified engine check
  (`VERIF_ENGINE_DISAGREES` / `VERIF_ENGINE_UNAVAILABLE` otherwise).
- Catalogue angles (one thickness) and double angles now reach the steel check; the member states
  the E.5 end condition or the E.6 connectors. Angles in flexure (F.9, F.10) are refused by name.
- Steel results screen: every check per member, ratio, governing check, status with the reason,
  proven-bound badge, the calculation with clause references, in en/es/pt.
#### Solid shells meshed with frames or shells; spectral analysis checked (2026-10-17)

**BREAKING (results): 3D models that mix solid shells (or trusses) with frames or shells now
solve instead of being refused; nodal moments on nodes without rotational stiffness are
refused.** Reproductions and references in `tests/solid_shell_analyses.rs`.

- **A solid-shell model meshed with frames or shells was singular on every path.** A
  solid-shell node carries translations only, but any frame or shell gives every node six
  DOFs, and nothing stiffened the rotations of a node only solid shells reach: K had zero
  rows and the linear solver answered "Singular stiffness matrix — structure is a
  mechanism" on the dense and the sparse path alike (the feature matrix showed it on the
  sparse path, where its padding frame put six DOFs on the strip). The dense, sparse and
  parallel 3D assemblers now give a free rotation DOF whose summed diagonal is zero the same
  artificial stiffness the orphan warping DOFs get (K is positive semi-definite, so a zero
  diagonal is a zero row: the DOF is decoupled and the rest of the answer is unchanged —
  the strip with a frame elsewhere matches the strip alone to 1e-9). A frame free to spin
  about a single solid-shell node is still refused as a mechanism, by the linear solver and
  the kinematic check. The artificial stiffness never stands in for a member's own missing
  property: a frame not released in torsion with J <= 0 (or a section with Cw < 0) is
  refused by name before assembly, and nodes a constraint references are left out (an
  artificial spring on a tied rotation would become a real spring once the constraint is
  imposed). Truss-only and fully released nodes in a frame model, which the analysis solver
  refused raw while the app added its own vanishing springs, now solve in the engine too.
- **A nodal moment on a node without rotational stiffness was lost.** In a model of solid
  shells and trusses only there are no rotation DOFs and the moment was dropped from the
  load vector; on an orphan rotation it would have produced a meaningless rotation. It is
  now refused by node (static load cases, harmonic loads and time-history force histories),
  as is a harmonic response read from such a rotation.
- **Time history: the initial acceleration of a model with massless DOFs replaced the
  consistent mass by its diagonal for every DOF.** When M is singular (the orphan rotations
  above, lumped rotational masses) the massless DOFs now get no initial acceleration and the
  massive ones solve their own block of M exactly; the solid-shell strip with a frame
  elsewhere now matches the strip alone step by step (its first steps were up to twice too
  large).
- **Spectral analysis of solid shells was right; the feature-matrix reference was not.**
  The response matches the one-mode hand calculation Γ₁φ₁(L)·Sa/ω₁² within 1.5 %. The
  matrix compared the bottom-layer probe's ux (θ·t/2, a real displacement of that fibre)
  with the beam centreline's ux ≈ 0 component by component, and called it a spurious
  response (7.8e7). The beam reference now carries its probes on rigid stubs at the bottom
  fibre, and every solid-shell cell is supported or refused by name.

#### Connectors: shear–moment coupling and the model's own DOFs (2026-10-17)

**BREAKING (results): models with a finite-length connector that has shear stiffness, and
connectors in all-truss 2D models, solve differently.** Zero-length connectors (bearings,
the web's semi-rigid ends) are unchanged to the bit. Found by the element rigid-body checks
(`tests/element_rigid_body_modes.rs`); reproductions and analytic checks in
`tests/connector_k_findings.rs`.

- **A finite-length shear spring did not carry its moment.** The element was
  [K_ii, −K_ii; −K_ii, K_ii] with K_ii = diag(k_axial, k_shear, k_moment), so rotating the
  connector rigidly stretched its shear spring by θ·L (a spring to ground), and the shear
  force it transmitted had no moment arm: a cantilever through a 2 m connector reacted
  M = 0 instead of −20 under a 10 kN tip load. The shear springs now act at the connector's
  midpoint through rigid arms, so V·L is split equally between the ends, the element does
  not depend on which node is i, and its stiffness annihilates every rigid motion in 2D and
  3D (rank 3 / 6). Each spring is assembled as k·b·bᵀ from its deformation, so K is
  symmetric positive semidefinite by construction.
- **Connector assembly assumed 3 (2D) / 6 (3D) DOFs per node.** In an all-truss 2D model
  (2 per node) the entries landed on the wrong DOFs (k_moment on ux), and with a warping
  section (7 per node) 3D assembly panicked with an index out of bounds. Every assembly path
  (dense, sparse, triplet and parallel, 2D and 3D, used by the linear, modal, buckling, P-Δ
  and time-history solvers) now scatters through the model's DOF numbering. Without rotation
  DOFs the rotational springs have nothing to act on and are dropped, as rotational support
  springs are. A finite-length shear spring there is refused with an error naming the
  connector, since it needs end rotations to carry V·L. So is a connector whose node does
  not exist (it used to be skipped silently) or whose stiffness is not finite.

#### Every analysis works in the inclined-support frames with K (2026-10-17)

**BREAKING (results): modal, harmonic, spectral, Craig–Bampton, 3D buckling, 3D time
history, SSI, fiber, arc-length / displacement control and 3D contact results of models with
an inclined support change, and 2D modal analysis of a frame with truss-only nodes now
solves.** The stiffness assemblers rotate K (and f) into each inclined support's frame, where
the restrained normal is a DOF of its own. The analyses that build something beside K kept it
in global axes, and most reported their solution in the support frames. Each is now checked
against the same structure turned rigidly so that the support is a plain restraint
(`tests/inclined_support_analyses.rs`, dense and sparse paths): eigenvalues equal, shapes,
histories, responses and reactions equal after the rotation.

- **Shared helpers** (`assembly::InclinedFrame`, implemented by the 2D and 3D transform data):
  `rotate_inclined_free_block` (triplets), `rotate_inclined_dense`, `to_inclined_free`
  (global vector → free DOFs of the support frames) and `to_global` (back), generalizing the
  2D ones of the entry below. `assemble_mass_matrix_3d_sparse_inclined` joins the 2D one.
- **Modal (2D, 3D)**: the mass (sparse and dense) and the X/Y/Z influence vectors are rotated
  with K, and mode shapes are rotated back before normalization. A rotated portal frame gave
  6.31 Hz against 5.67 Hz. The modal certificate rotates M and the published modes into K's
  frames.
- **Massless DOFs in the eigensolver.** The dense generalized eigensolve (every model up to
  80 free DOFs, and the fallbacks) factored the mass, so a free DOF without mass — the
  rotation of a node reached only by trusses, or of a node where every frame is hinged —
  failed modal analysis with "Eigenvalue decomposition failed" (no inclined support needed).
  It now solves the reciprocal pencil when M is singular, factoring K as the sparse
  shift-invert path already did, and keeps the finite eigenpairs: exactly the result of
  condensing the massless DOFs out statically, with their components in the mode shapes.
  No artificial mass is added (it would invent modes at a frequency set by its size).
  Harmonic, Craig–Bampton and the Rayleigh-damping estimates use the same solver.
- **3D buckling**: K_G is built over all DOFs (surface K_G included), rotated with K and cut
  to the free block; modes are rotated back before normalization; the certificate rotates
  the mode into K's frames. A column guided by an inclined support gave 11.4 against 30.9.
- **3D time history**: the mass, the ground-acceleration influence vectors and the force
  history are rotated into the support frames and the recorded states back to global axes,
  as in 2D. Peak reactions come from the linear solver's reaction builder (springs and
  inclined supports included; springs were reported as zero).
- **Harmonic (2D, 3D)**: the mass is rotated with K, and the response is read in global axes:
  the response DOF is a functional of the free DOFs, so a global component at an inclined
  support is Rᵀ of its tangential DOFs (it was refused as restrained, or read in the support
  frame).
- **Spectral (2D, 3D)**: each mode's displacement is built over all DOFs from the global mode
  shape; the restrained slot was dropped, which at an inclined support holds a real global
  component, so element forces lost it.
- **Craig–Bampton (2D dense and sparse, 3D)**: the mass is rotated with K. Boundary DOFs at
  an inclined support are its tangential DOFs.
- **SSI (2D, 3D)**: soil springs act along global axes and are rotated (R·k·Rᵀ) into the
  support frame; displacements are rotated back before the soil curves and the results read
  them.
- **Fiber (2D, 3D), arc length and displacement control**: tangent and internal forces were in
  global axes against loads and restraints in the support frames. Each Newton step is now
  solved in the support frames, with the correction rotated back.
- **3D contact**: gap, friction, damping and deactivated-truss corrections are built in global
  axes and rotated into the support frames; the state and the results are in global axes.
- Already consistent, now tested: P-Delta, material-nonlinear and Winkler (2D, 3D) and
  corotational 2D. Staged construction refuses inclined supports.

#### 2D buckling and time integration use the linear path's stiffness (2026-10-17)

**BREAKING (results): 2D buckling and 2D time histories of models with an angled spring, an
inclined roller, a spring on a restrained DOF, a truss-only node in a frame, or a spring on a
rigid support's free DOF solve differently.** Both assembled K with `assemble_sparse_2d_ex`,
a hand-kept copy of the 2D assembler that had drifted from the dense and linear sparse ones
(`tests/index_exhaustive.rs` pinned four differences).

- **`assemble_sparse_2d_ex` is now `assemble_stiffness_sparse_2d` plus
  `assemble_load_vector_2d`**, the linear static path's builders, and equals the dense
  assembler entry for entry on every model of the exhaustive test. It used to ignore a
  spring's angle (diag(kx, ky) instead of the rotated block), leave springs on restrained
  DOFs out of the full K (time-history reactions off by k·δ), skip the orphan-rotation guard
  (a truss-only node in a frame made K singular: buckling and time integration failed), and
  ignore inclined rollers (the restrained normal was taken as global uz).
- **Inclined rollers in 2D buckling and time integration.** K, f and the result are in the
  roller frames the assembler reports (`SparseAssemblyResult::inclined_transforms_2d`); the
  geometric stiffness, the mass (`assemble_mass_matrix_2d_sparse_inclined`), the ground
  influence and the force history are rotated into them, and mode shapes and recorded
  histories rotated back to global axes. Results match the same model rotated so that the
  roller is a rollerX (`tests/sparse_ex_analysis_regressions.rs`).
- **2D time-history reactions** come from the linear solver's reaction builder: angled
  springs, springs on rigid supports and inclined rollers are reported like `solve_2d`'s.
- The 2D kinematic fast path no longer defers models with inclined rollers or angled springs
  to the dense analysis: the sparse K is now the same matrix.
- 2D modal, harmonic and Craig–Bampton, and 3D buckling and time integration still paired a
  K rotated into the inclined-support frame with an unrotated mass or geometric stiffness:
  fixed in the entry above. The 3D `assemble_sparse_3d` already shares the linear path's
  stiffness.

#### Frame element matrices checked against a symbolic derivation (2026-10-17)

**BREAKING (results): 2D buckling and P-Delta of frames with hinged members, and every model
with warping members (`cw` set) — static, buckling and modal — solve differently.** Found by
deriving the frame-family element matrices from shape functions and energy in SymPy and comparing
the Rust kernels exactly (`tools/symbolic/`, `engine/tests/symbolic_elements.rs`,
`docs/verification/SYMBOLIC.md`); each fix has a regression test.

- **The 2D geometric stiffness ignored hinges.** A hinged rotation kept the fixed-fixed −4PL/30,
  held only by the solver's artificial rotational stiffness, so a plane frame with a pin-ended
  member buckled at λ ≈ 1e-6 (a leaning-column frame: 5e-6 instead of 3.75) and P-Delta amplified
  wrongly. Kg is now condensed for the hinges exactly as in 3D.
- **The warping torsion block mixed a linear-twist St-Venant term (GJ/L) with the cubic warping
  term.** It is now the energy of the cubic twist (Barsoum–Gallagher): convergence h⁴ instead of
  h² (a cantilever’s tip twist with one element: 11% off before, under 2% now).
- **Warping DOFs carried a lumped ρ·Ip·L/2**, a rotation's inertia on a rate-of-twist DOF.
  Warping members now use the consistent 14×14 mass of their cubic twist (ρIp and ρCw terms); a
  fork beam's first torsional frequency was 10.6% low.
- `fef_distributed_torsion_warping` (no callers) now returns the loads consistent with the
  warping element.
- Not fixed, reproduced by an ignored test: the 3D co-rotational solver does not converge on (or
  converges wrongly for) frames with pin-ended members.

#### Solver fixes found by extending the OpenSees comparison to buckling, modal, P-Delta and time history (2026-10-17)

**BREAKING (results): buckling load factors of models with axial point loads or partial /
trapezoidal axial loads on members change, P-Delta member end forces change, 2D buckling and
P-Delta of hinged frames change, ground-motion time histories change, and small modal models with massless DOFs now solve.** Found by `tools/opensees/compare.py --buckling2d/3d --modal2d/3d`; each has a
regression test in `engine/tests/opensees_differential_regressions.rs`.

- **Buckling took each member's axial force as (N_start + N_end)/2.** The geometric
  stiffness integrates N along the member, so it needs the mean axial force, which the end
  average is only while N is linear. An axial point load or a partial axial load on a
  member gave a wrong load factor (3× on a truss braced by a spring). Kg is now built at
  the linear solution with each member's force read from its elongation, EA·(δ/L − αΔT)
  — the exact mean, and the same force the P-Delta iteration uses.
- **P-Delta member end forces left out the geometric stiffness.** Displacements and
  reactions came from K + Kg, but the end forces were recovered with the elastic K alone,
  so they balanced neither the joints nor the reactions: a free cantilever tip reported a
  moment and the base moment was not H·L + P·Δ. End forces are now (K + Kg(N))·u − FEF
  for frame members; OpenSees agrees to ~1e-10 on 596 random frames. The web app's 3D
  workaround that added Kg·u to the engine's forces (`pdelta-forces.ts`) is removed, since
  with the engine fixed it counted the geometric part twice.
- **Ground motion left out the mass coupled to the supports.** The relative-motion load
  is −(M·r)_f·a_g with r the rigid-body translation of every DOF, supports included; with
  a consistent mass the free DOFs are coupled to the supports' translations (M_fr·r_r),
  and the time history took M_ff·r_f only: a bar on two supports felt half the
  earthquake, random frames up to ~50 % less in OpenSees' comparison. The influence vector
  now spans every DOF (the full mass is assembled only when a restrained DOF moves with
  the ground), in 2D and 3D. Modal participation factors still use M_ff·r_f.
- **2D buckling and P-Delta used an uncondensed Kg on hinged members.** The elastic
  stiffness condenses a hinged end's rotation out of the member, but the 2D geometric
  stiffness kept the consistent matrix on the node's rotation — the Kg of a different
  member. A portal whose beam is hinged at one end buckled 2.5 % off its own 3D model
  (which already condensed Kg). The 2D Kg is now condensed with the same elastic map as
  the 3D one, in buckling, P-Delta, its end forces and the P-Delta certificate's terms.
- **Modal analysis failed on small models with a massless DOF.** Hinged members (and
  3D members with any release) get a lumped mass with no rotational inertia, and a node
  of trusses only has none either; the dense eigensolver used below 80 DOFs
  Cholesky-factored M and returned "Eigenvalue decomposition failed". A semi-definite M
  is now solved as the inverse problem M·x = μ·K·x (K definite), massless directions
  dropped as λ = ∞.

#### Assembly-path fixes found by the cross-path oracle (2026-10-17)

**BREAKING (results): 2D buckling and P-Delta of models with hinges, 3D buckling with inclined
supports, 3D modal, buckling, harmonic and reduction analyses of models with curved beams, and
regularized sparse 3D solves solve differently.** Each was found by
`engine/tests/assembly_paths.rs`, which compares every path that assembles the same K, load
vector, M or K_G entry by entry (`docs/verification/ASSEMBLY.md`), and each has a regression
test there.

- **The sparse 3D assemblers took the largest diagonal over the free DOFs only.** The dense
  assembler takes it over all DOFs, and it scales both the artificial stiffness of warping DOFs
  no element stiffens and the diagonal shift that regularizes a failed sparse Cholesky, so the
  two paths disagreed whenever a restrained DOF held the largest diagonal (the usual case: a
  stiff member into a support). Serial and parallel sparse assembly now track all DOFs.
- **The 2D geometric stiffness ignored hinges.** All three 2D builders (P-Delta from
  displacements, buckling from element forces, the P-Delta certificate's affine terms) used the
  fixed-fixed K_G whatever the hinges, while 3D condenses it for releases: 1.2·P/L instead of
  P/L in sway and −4·P·L/30 on a hinged rotation nothing else holds. A cantilever bracing a
  leaning column (hinged at both ends) now buckles at k·h = 3EI/h², as in 3D. The 2D and 3D
  members share one condensation (`condense_kg_plane`).
- **3D buckling added K_G in global axes to a K rotated at inclined supports.** The critical
  factor depended on how the model was oriented: a column guided by an inclined support gave
  101.5 rotated against 62.1 unrotated. K_G is now rotated into each inclined support's frame
  with K, and the mode shapes are reported back in global axes (they were left in the
  support's frame). The buckling certificate rotates the mode before checking it.
- **3D modal, buckling, harmonic, Guyan and Craig–Bampton analyses ignored curved beams.** They
  assembled the model without expanding its curved beams into segments (every other 3D solver
  does, `expand_curved_beams_3d`), so an arch made of a curved beam had no stiffness or mass,
  and 3D buckling panicked on the segments' element forces. They now expand first, and the
  modal and harmonic certificates check the expanded model.
- **The parallel sparse 3D load vector left quad and MITC9 self-weight in local axes.** Only
  builds with the `parallel` feature were affected (the sequential and dense paths transform it).
#### Tension members: end connections in the model (2026-10-17)

- **CIRSOC 301 tension rupture (Ae = An·U) can now be evaluated in the app.** Each member end
  can carry its connection (`Element.tensionConnection`): bolted (diameter, standard/oversize
  hole, bolts per line, lines per connected element, pitch, optional stagger) or welded
  (longitudinal / transverse / both, weld length), and which elements are connected (all, both
  flanges, web, tee flange, one angle leg). `engine/steel/tension-connection.ts` computes An
  (B.4.2.2, nominal hole + 2 mm, s²/4g) and U (D.3(1), D.3(2)(a)–(d), U ≤ 0,9, U ≥ A_conn/Ag)
  for I/H, channels, tees, angles, back-to-back pairs and plates, and refuses tubes (CIRSOC 302),
  cold-formed (CIRSOC 303), drawn sections and other built-ups by name. An end left undescribed
  keeps rupture NOT EVALUATED; Ae = Ag is never assumed. Old models load unchanged.
- PRO: an "End connection (tension)" card in Specifications › Members and in the steel workflow
  (presets, apply to the selection, An/U/Ae preview per member, copy a bolt layout designed at
  the end node), and a tension-members table in the workflow's verification block with the
  rupture ratio, the calculation with clause references, or "not evaluated — add the end
  connection". Reverse, split and merge carry the end connections.

#### Further unsafe design-check gaps closed (2026-10-17)

**BREAKING (results): web fillet welds, EC3/AISC lateral-torsional buckling, EC3 Class 4
members, AISC 360 slender-element columns, CIRSOC 301 T/double-angle/channel columns and
CIRSOC 301 tension members give lower capacities, or are refused (not evaluated) where the
inputs needed to compute them safely are absent.**

- **The web fillet weld applied β only to welds marked end-loaded** — the opposite default from
  the engine's weld groups. `designFilletWeld` (joint designer) now treats an undeclared weld as
  end-loaded (CIRSOC 301 §J.2.1, the conservative side); `loading: 'other'` opts out, and the
  joint panel's selector defaults to end-loaded. The Connections tab's quick
  `checkFilletWeld` credited `0.6 L` above `300 w` instead of the clause's `180 w` (at
  `L = 600 w`, twice the allowed length); it now caps at `180 w` and takes `endLoaded`
  (default true).
- **EC3 Mcr ignored where the load acts** (the zg = 0 expression, NCCI SN003b eq. (3)), which
  overstates Mcr for the usual gravity load on the top flange. It is now SN003b eq. (2) with
  the load height zg and C2. `Ec3MemberData` takes optional `geometry` (I/RHS/CHS plate
  dimensions) and `ltb` (`c2`, `loadPosition`, `zg`); absent, the load is on the **top flange**
  (zg = +h/2) with C2 = C1 (a lower bound for every transverse-load case of SN003b Table 3.2),
  and a top-flange load without a depth is refused (not evaluated). The result reports `mcr`.
  SBE Worked Example A.1 (IPE 330, zg = +165 mm, C2 = 0.454: Mcr = 113.9 kNm; at the shear
  centre the check gave more than 1.3× that) is a regression test. The web EC3 check sends
  the section geometry, so its Mcr takes the top-flange load.
- **EC3 Class 4 members used the gross A and Wel when Aeff/Weff were not given**, and never
  added ΔM = eN·NEd. A Class 4 section buckles locally before A·fy or Wel·fy, so the stand-in
  was unconservative by the whole effective-width reduction (a welded I 600×300×12×6 in S355:
  Aeff = 8330 of A = 10 656 mm², −22 %). Aeff, Weff,y and Weff,z are now computed from
  `geometry` by EN 1993-1-5 4.3/4.4 (internal and outstand ρ, Tables 4.1/4.2, web ψ from the
  effective flanges, 4.4(3)) for I and RHS; `aEff`/`weffY`/`weffZ` still override. New
  `eNY`/`eNZ` give the centroid shift; with geometry it is 0 (doubly symmetric). Without
  either, the checks that need the missing property are refused and named ("Class 4 Aeff",
  "Class 4 Weff,y", "Class 4 eN"); a Class 4 CHS (EN 1993-1-6) is refused. Class 3 and 4
  members in compression also get the cross-section check 6.2.9.2/6.2.9.3
  (`interactionRatioSection`), which (6.61)/(6.62) can fall below with Cm < 1. Tension
  yields the gross section (6.2.3) for every class. The result reports `aEff`, `weffY`,
  `weffZ`. The web EC3 check now checks Class 4 I and RHS members (it skipped them), and takes
  an I section as **welded** (Table 6.2 curves b/c, Table 6.4 c/d) unless it was picked from a
  rolled catalogue family — it read every I as rolled (a/b), unconservative for a welded or
  parametric section.
- **AISC 360 compression had no slender-element reduction (E7)**: Pn = Fcr·Ag for every section.
  A W14×22 at Lc = 1 m (h/tw = 53.3, footnoted slender in the Manual) was 10.9 % high, an
  HSS 12×8×3/16 16 %. `SteelMemberData` takes `compressionElements` (Table B4.1a kind: rolled
  or welded flange with kc, angle, tee stem, web, HSS wall, other stiffened, round HSS; b, t,
  count); Ae follows E7-2/E7-3/E7-5 with Table E7.1 c1, c2, and E7-7 for round HSS. **Without
  `compressionElements` the compression check is refused** (an empty list states that there is
  no element to reduce); a round HSS with D/t > 0.45E/Fy is refused. The result reports `ae`
  and names the check "Compression E3/E7".
- **AISC 360 lateral-torsional buckling ignored the load height.** `loadPosition` (`shearCentre`,
  `topFlange`, `bottomFlange`); absent, the load is on the **top flange** and Cb is multiplied
  by 1.4^(2y/h) = 1/1.4 (Helwig, Frank & Yura 1997; SSRC Guide §5.2.3). A bottom-flange load is
  not credited (Cb as given). Applies to F2-2 and F2-3; not to cantilevers, where the factor is
  not valid and Cb itself must be given for the case.
- The web AISC check sends the section's E7 elements (it marked slender columns not evaluated)
  and its LTB takes the top-flange load.
- **CIRSOC 301 compression checked flexural buckling only (§E.3/E.7).** §E.4 is now evaluated
  and Pn is the least of the limit states: E.4.4 torsional buckling for an I (whenever J and Cw
  are given; refused without them when kz·Lz > ky·L), E.4.2/E.4.3 for a tee without slender
  elements, E.4.5 flexural-torsional with Fez (E.4.9) for a channel or a slender tee, the Fe
  going into E.7.2a/E.7.3a with Q. A rolled-flange tee 200×150×12×10 at L = 3 m: φPn =
  392.8 kN where flexural buckling alone gave 451.8 (+15 %). `SteelDesignParams` takes `Kz`,
  `Lz` (default 1 and L) and `shearCentreOffset` (default from the thin-walled plates); a tee or
  channel without J is refused. Closed sections and solid bars are not checked for E.4. The
  steel workflow's «no torsional buckling» assumption is replaced by the one that remains:
  kz = 1 over the member length.
- **CIRSOC 301 tension rupture took Ae = Ag** (no hole deduction, no shear lag), optimistic for
  every bolted member and for any member connected through some of its elements. `SteelDesignParams`
  takes `tensionConnection`: `An`, or `holes` (count, nominal d, t, staggers) with the 2 mm of
  B.4.2.2 and s²t/4g; and U as given, `allElementsConnected` (D.3(1)), `plateWeld` {L, w} (D.3.5
  table, L < w refused) or `xBar`/`length` (D.3.2, U = 1 − x̄/L ≤ 0.9, not below `connectedArea`/Ag,
  on Ag when `welded`). **Without it, a member in tension is NOT EVALUATED** — the model holds no
  hole pattern or connection, so app tension members are now reported not evaluated until the
  connection can be given (`checkSteelMember`'s `lengths.tensionConnection`). The workflow's
  «Ae = Ag» assumption is removed (it is a refusal now).

#### Unsafe design-check disagreements closed (2026-10-17)

**BREAKING (results): weld groups with long fillets, CIRSOC 301 slender-element columns,
CIRSOC 301 noncompact/slender I-girders, CIRSOC 301 lateral-torsional buckling and EC3
members in compression plus bending give lower capacities.** These were the unsafe
disagreements left open by the published-example verification
(`docs/verification/DESIGN_EXAMPLES.md`, D5, D6, D8, D11); each example is now a regression test.

- **Weld groups ignored the end-loaded fillet length reduction β** (AISC 360-22 J2.2b(d),
  CIRSOC 301-2018 §J.2.2(b) eq. J.2.1). AISC Example J.1 (two 27 in. runs of a 3/16 in.
  fillet, l/w = 144) prints φRn = 206 kips; stabileo gave 225. `WeldSegment` takes an
  optional `endLoaded`; absent, the segment is treated as end-loaded (the conservative side),
  `false` opts out. The result reports `minBeta`.
- **EC3 member interaction was a linear sum with every k = 1**, not EN 1993-1-1 6.3.3. It is
  now eqs. (6.61)/(6.62) with the **Annex B** ("Method 2") interaction factors kyy, kyz, kzy,
  kzz (Table B.1, or Table B.2 for open sections with an LTB length). `Ec3MemberData` takes an
  optional `interaction` with Table B.3's `cmy`, `cmz`, `cmLt` (absent: 1.0, the table's upper
  bound) and `hollow`; the result reports `kYy`, `kYz`, `kZy`, `kZz` and both equations. A Cm
  outside [0.4, 1] is refused (not evaluated). Where Annex B gives k > 1 (near-uniform moment,
  high NEd/Nb,Rd) the old sum was unconservative. SBE Multi-Storey Part 8 Example 2 and the
  SBE Single-Storey Part 4 Appendix D column are regression tests. The web EC3 check no longer
  marks the interaction as not evaluated.
- **CIRSOC 301 compression had no slender-element reduction (§E.7).** Every section was taken
  as non-slender. Q = Qs·Qa now follows E.7.1/E.7.2 with the Table B.4.1a limits (rolled and
  welded flanges, angles, tee stems, I/channel webs, welded-box and RHS walls, circular tubes).
  INTI Ejemplo 10(c), a welded box with b/t = 72, prints Pd = 204.7 kN; the checker gave 237.4
  (+16 %). `SteelDesignParams` takes `shape` ('I', 'U', 'T', 'box', 'RHS', 'CHS', 'rect') and
  optionally `hw` and explicit `compressionElements`.
- **CIRSOC 301 flexure implemented only §F.2 (compact sections).** §F.3 (noncompact/slender
  flanges), §F.4 (noncompact webs: Rpc, rt, F.4.7/F.4.8) and §F.5 (slender webs: Rpg, F.5.3/F.5.4)
  are now applied by classification (Table B.4.1b cases 11, 12, 16), and §F.6.2 (minor-axis flange
  local buckling, case 14). INTI Ejemplo 14 girder V2 prints Md = 286.1 kNm (stabileo: 326.0,
  +14 %); girder V3 (slender web) prints Md = 771.4 kNm. Both are regression tests.
- **CIRSOC 301 lateral-torsional buckling used AISC 360-10's form** (rts, Mr = 0.7·Fy·Sx) and
  had no load height. It now follows F.2.4–F.2.7 (X1, X2, FL = Fy − Fr with Fr = 69 MPa rolled,
  114 MPa welded) with both load positions; `loadPosition: 'web' | 'topFlange'` selects
  F.2.4a/F.2.5a/F.2.6a or F.2.4b/F.2.5b/F.2.6b, and **absent it is 'topFlange'**, the lower of the
  two, because the checker does not know where the load acts. INTI Ejemplo 14 V1 case I-B
  (top-flange deck, Lb = 5 m) prints Md = 18.39 kNm, and braced at midspan 37.91 kNm.
- **The CIRSOC 301 checker refuses what it cannot classify.** A shape outside the list above
  (e.g. cold-formed 'C', which is CIRSOC 303), strong-axis flexure of non-I shapes (§F.7–F.11 not
  implemented), a circular tube with D/t > 0.45·E/Fy, a girder with aw > 10, LTB beyond Lp
  without J, or a channel with a slender web come back **not evaluated** (`notEvaluated`, ratio
  ∞, status fail, diagnostic `VERIF_STEEL_NOT_EVALUATED_*`), never as a pass; H.1 interaction is
  refused when it would need a refused capacity.
- **The app's CIRSOC 301 verification takes a section as welded unless it was picked from a rolled
  catalogue family** (`profileFamily`): Fr = 114 MPa, Table B.4.1 case 2/12 flanges and Aw on the
  web height, each the conservative side for a parametric or imported section. It now also passes
  the section's `shape`.

#### Design checks against published worked examples (2026-10-17)

**BREAKING (results): CIRSOC 201 shear, CIRSOC 301 web shear, doubly reinforced ACI 318 / CIRSOC 201 flexure,
AISC flexure of sections given a flange slenderness, and EC3 strong-axis checks with
Lb = 0 give different numbers.** Each was found by reproducing a published worked example
clause by clause (`docs/verification/DESIGN_EXAMPLES.md`,
`engine/tests/design_worked_examples.rs`), and each example is now a regression test.

- **AISC F3/F6.2 flange local buckling was not implemented.** Every W-shape was treated as
  having compact flanges, so a noncompact flange kept Mp: AISC Example F.3B (W21×48) gave
  φbMn = 401 kip-ft against 398. `SteelMemberData` takes an optional `flangeSlenderness`
  (bf/2tf); when given, F3-1/F3-2 cap the major-axis strength and F6-2/F6-3 the minor-axis
  one (slender flanges use the clause's lower bound kc = 0.35, as h/tw is not an input).
- **Doubly reinforced sections were not solved by strain compatibility** (ACI 318 and
  CIRSOC 201 checks). The neutral axis came from the "A's yields" trial and was never
  iterated; with As = A's that trial is c = 0 and the singly reinforced moment came back.
  INTI's CIRSOC 201 Example 2.I.7 prints Mn = 57.40 kNm; stabileo gave 56.21 (ACI) and
  56.97 (CIRSOC). Both now bisect on c.
- **CIRSOC 201 shear used ACI 318M's 0.17 for the 1/6 of CIRSOC 201-2005 §11.3.1.1** (and
  0.66 for the 2/3 of §11.5.7.9): Vc was 1.9% high against INTI Example 3.I. The φ
  transition now starts at εty = fy/Es (§10.3.3) instead of a fixed 0.002.
- **CIRSOC 301 web shear (web checker) used AISC 360-10's rule, not CIRSOC 301-2018 §G.2.1.**
  The Cv = 1 limit was 2.24·√(E/Fy) with kv = 5.34 and there was no elastic branch G.2.5,
  so a slender web kept the inelastic Cv; Aw was the total depth also for built-up
  sections. INTI's CIRSOC 301 Example 14 (welded girder V2, h/tw = 138) prints Cv = 0.336
  and φVn = 130.3 kN; the checker gave 0.536 and 207.8 kN. It now applies G.2.3–G.2.5 with
  kv = 5, and `SteelDesignParams.builtUp` selects the web height for Aw.
- **EC3 strong-axis flexure was NaN (unevaluated) for Lb = 0.** Mcr divided by Lb²; a
  continuously restrained member now takes χLT = 1.

#### Solid shell: assumed strains in the thickness direction; MITC4 warping correction (2026-10-17)

**BREAKING (results): every model with solid-shell (SHB8-ANS) elements whose thickness
is not along global z, or whose plan is not a parallelogram, and every model with warped
(non-planar) MITC4 quads, solves differently.** Planar MITC4 quads are unchanged, and so
are the web's validation and example baselines.

- **The solid shell's assumed strains were global Cartesian components.** Its ANS replaced
  ε_zz, γ_xz and γ_yz, tied at natural-coordinate points, instead of the covariant
  components along the element's thickness direction. The stiffness changed by ≈8% under
  a rigid rotation, a wall or a curved shell got the anti-locking treatment on the wrong
  strains, and the element failed the patch test on a distorted plan (residual ≈2e-2) and
  on any tilted mesh. It now ties the covariant E_ζζ (Betsch & Stein 1995; Bischoff & Ramm
  1997) and transverse shears E_ξζ, E_ηζ (Dvorkin & Bathe 1984) and maps them to Cartesian
  strains with the contravariant basis. The stiffness is frame invariant to round-off, the
  MacNeal–Harder patch passes flat and tilted, and a thin cantilever matches beam theory to
  0.4% from t/L = 1/10 to 1/1000 in any orientation (the old element read 0.03 at
  t/L = 1/100 once tilted). Benchmarks with thickness off global z moved: Scordelis-Lo
  0.39/0.51 → 0.95/0.96 (6×6/8×8), twisted beam 0.08/0.25 → 0.67/0.82 (4×1/8×1),
  hemisphere 1e-4 → 4e-4 (still membrane-locked). The flat Navier plate is unchanged
  (0.84; Poisson thickness locking, no EAS).
- **Two solid-shell benchmarks were mis-posed.** The twisted beam applied load case B
  (tip F_y) but compared against case A's 5.424e-3; it now uses 1.754e-3. The Scordelis-Lo
  quarter vault had no symmetry condition at midspan and could rotate rigidly (it reported
  uz ≈ 1e9, with no assertion); it now has ux = 0 there and is held to [0.9, 1.05].
- **MITC4 on a warped quad did not annihilate rigid rotations.** The flat element is
  formulated on the quad's mean plane, and the nodes' offsets from it (±h) were ignored, so
  the rigid-rotation residual grew linearly with the warp. Each node is now tied to its
  projection by a rigid link (MacNeal; Taylor 1987): K ← WᵀKW, with the same W in the
  stress recovery and the thermal load. Six zero eigenvalues on any warped quad, and a
  rigidly rotated warped quad is stress free at its corners. The warped cantilever
  benchmark moved from 0.38/0.14/0.04 to 0.97/0.96/0.94 of beam theory at 5/10/20% warp;
  the MITC4 twisted beam moved from 0.0012/0.0011 to 0.0013/0.0013 (24×8, loads A/B).

#### Nonlinear and special solvers answer for the model as given (2026-10-17)

**BREAKING (results).** Tests: `engine/tests/nonlinear_solver_findings.rs`, each against the same
structure expressed without the feature or an analytical value.

- **2D contact returned the linear solution of the unmodified model.** Slack tension-only braces,
  closed gaps and node-to-surface contacts changed the status report but not the displacements,
  reactions or member forces (`linear::solve_2d` of the model as drawn). 2D and 3D contact now
  solve every iteration on the model in its contact state and report that state: a slack member
  is removed (the model is reassembled without it; 3D used to keep tension-only *frames* and
  subtract only trusses) and carries only its own fixed-end forces; reactions and constraint
  forces are those of the contact state (3D returned none).
- **Gaps and node-to-surface contacts acted from zero displacement.** The penalty spring of a
  closed gap now acts from the moment it closes (the opening g0 enters the load as ±k·g0):
  u = (F + k·g0)/(EA/L + k) on a bar pushed into a gap, where it used to be F/(EA/L + k).
- **Friction** was a stick spring μ·k at any load, with only the *reported* force clamped to μ·N;
  a contact now slides (Coulomb force μ·N against the slip) once the stick force exceeds μ·N.
- **Contact damping** added a spring of stiffness c to ground at the gap nodes (its "velocity"
  force was always zero); it is now a proximal term that vanishes at a fixed point, and the final
  state is solved without it.
- **Inclined supports and prescribed displacements in contact:** the gap corrections are built in
  global axes and rotated into the support frames, statuses are read in global axes, and support
  settlements enter the solve (3D refused both; 2D read rotated displacements).
- **Uplift supports were ignored** (kept as two-way restraints). 2D: a support whose vertical
  reaction comes out tensile lifts off (pinned → rollerZ, fixed → guidedZ, rollerX → free) and
  bears again if its node comes back below its seat. 3D uplift supports are refused by name, as
  are unknown element behaviours, behaviours on missing elements and thermal loads on
  tension/compression-only members.
- **3D co-rotational: large rotations, releases, frames out of the XZ/YZ planes.** The member's
  rigid rotation was the skew part of R (sin θ, not θ: 1% short at 0.25 rad, 36% at 90°), its
  corotated frame was rebuilt from the chord and a fixed reference vector (a spurious twist, read
  as torsion, whenever a member bent in a plane neither containing nor normal to that reference),
  and its end shears balanced the end moments on the undeformed length. A portal whose beam is
  pinned at both ends settled 1.5% further than the same frame in the 2D solver and, at twice the
  load, did not converge; the same portal in a vertical plane at 53° to X moved out of its plane.
  Now: exact rotation vector, frame carried by the mean end rotation, shears on the current chord;
  planar frames in any vertical plane, with and without releases, match the 2D solver to 1e-6.
  The tangent's geometric stiffness is condensed for the end releases, as in P-Delta.
- **3D co-rotational member forces left out the member loads.** End forces were K·d only: a
  fixed-ended beam under a uniform load reported end moments qL²/12 short and end shears qL/2
  short, and the diagrams showed no load, although the displacements were right. The fixed-end
  forces and the load data are now the linear solver's; member forces match it in the
  small-load limit (uniform, partial, axial and point member loads, with a release).
- **Unconverged co-rotational solves** returned the iterate they gave up on (no equilibrium state)
  with reactions taken against the full load, and the Pro panel printed "Not converged" next to
  its peak displacement. The engine now returns the last converged increment, with reactions
  and member forces under the load it carries, and a new `loadFactor` (1 when converged); the
  panel shows only how much of the load reached equilibrium, and no displacements.
- **Co-rotational solves under small loads did not converge.** The elongation was a difference
  of two lengths, with a rounding error of order ε·L and so an axial-force residual of order
  ε·EA (2e-7 kN against a 0.001 kN load): Newton never reached the tolerance and the "answer"
  was the last iterate, flagged unconverged. The elongation is now computed without
  cancellation, (2·d0·du + du·du)/(L + L0), in every co-rotational member and connector.
- **Connectors in the nonlinear solvers** (co-rotational, arc length, displacement control,
  material- and fiber-nonlinear; 2D and 3D) were refused; they are now part of the tangent and
  the internal forces. Small-displacement solvers use the linear connector. Co-rotational ones:
  a zero-length connector is its springs in global axes; a connector with length has its axial
  spring along the current chord (N = k·(L − L0), with the string stiffness N/L) and, in 2D, its
  rotational spring on the relative rotation. Shear stiffness on a connector with length (and,
  in 3D, its torsional and bending stiffness) has no large-displacement definition and is
  refused by name. Checked at large displacement against a truss bar, a spring support and a
  rotational spring support.
- **Connectors in all-truss models (linear and every other path).** The connector matrix was
  scattered through the node's own DOF list, so with two DOFs per node (three in 3D, or seven
  with warping) its rows did not line up: a horizontal connector between two free truss nodes
  pushed the far node vertically. Each local DOF is now mapped to its global DOF by name.
- **Truss-only nodes in the nonlinear solvers.** A node reached only by trusses (or by members
  hinged there) in a frame left the 2D co-rotational, arc-length, displacement-control,
  material- and fiber-nonlinear tangents singular, so they refused a model the linear solver
  answers; they now carry the linear assembler's artificial stiffness on that rotation (material
  nonlinear recomputed it for all-hinged nodes only).

#### Every analysis supports a model feature or refuses it by name (2026-10-17)

**BREAKING (results and refusals): several analyses solved a simplified model without a word;
they now solve the model as given or refuse it with an error that names the feature and where
it is.** `engine/tests/feature_matrix.rs` runs every (feature, analysis) pair on a small model
where the feature matters and compares it with the same structure expressed without the
feature, an analytical value or the linear solution; the result is in
[`docs/verification/FEATURE_MATRIX.md`](docs/verification/FEATURE_MATRIX.md), and the test fails
when the file drifts or when a cell is silently ignored or wrong without a branch fixing it.

Now supported (results change):
- **3D co-rotational: columns and members not along +X.** The rigid-body rotation was subtracted
  in global axes from rotations in local axes. A vertical cantilever under a lateral load
  converged to itself folded in half (u_z = −2L) and reported convergence; members along Y and
  any member with a local-y vector other than +Y were equally wrong. An explicit local y nearly
  parallel to the member is anchored to the initial frame.
- **2D buckling and P-Delta with member end releases:** the geometric stiffness is condensed for
  the release, as in 3D (a beam released into its support buckled 3.2% low).
- **2D plastic collapse** forms hinges where a rotational spring (on any support type), a
  constraint or a connector holds the rotation. Dropped there, the member carried more than Mp:
  a beam on a rotational spring collapsed at 150 instead of 83.3 (unsafe).
- **Curved-shell buckling:** the geometric stiffness was integrated with dA·h²/2 instead of dA,
  1/200 at h = 0.1 (a strip buckled at 200 times its Euler load).
- **3D P-Delta includes shell geometric stiffness** (plates, quads, quad9, solid and curved
  shells); a compressed wall strip came back as its linear solution. Quad membrane forces for
  geometric stiffness subtract the free thermal strain.
- **3D material-nonlinear solves the constraint-reduced system**: rigid links, diaphragms and
  EqualDOF were not part of the structure it iterated on. In 2D, convergence is measured on the
  independent DOFs (a model with one constraint never converged).
- **Timoshenko shear areas** in 2D co-rotational, arc-length/displacement-control and
  material-nonlinear analyses (solved as Euler–Bernoulli, 22% stiff on a deep cantilever).
- **Support springs:** the co-rotational, arc-length, material- and fiber-nonlinear and staged
  2D analyses share the linear assembler's definition (the spring angle was dropped, and a
  rotational spring on a pinned support in some of them); the 3D fiber analysis had no support
  springs at all, and assembled truss members as full frames.
- **Curved beams** are expanded in modal, buckling (which panicked), harmonic, Guyan,
  Craig–Bampton, material- and fiber-nonlinear 3D analyses.
- **Influence lines** keep the model's constraints and connectors.

Now refused by name (previously solved without the feature):
- connectors: staged construction, 3D plastic (the nonlinear solvers that refused them now
  support them, see "Nonlinear and special solvers" above);
- prescribed support displacements: co-rotational, arc length, displacement control,
  fiber-nonlinear, SSI, harmonic (2D and 3D), 3D contact;
- inclined supports: arc length, displacement control, fiber-nonlinear, SSI (2D and 3D), 3D
  contact;
- thermal loads: co-rotational, arc length, displacement control (temperature entered as
  fixed global forces, 12–24% off on a heated, bent member); thermal loads on plates, quad9 and
  curved shells in 3D buckling and P-Delta;
- shear areas, member end releases, warping and shells: fiber-nonlinear; warping: 3D
  co-rotational; shells: 3D material-nonlinear;
- constraints and support springs: 3D plastic (its mechanism test accepted every state with
  constraints and stopped at the first hinge with springs);
- staged payloads carrying connectors (2D, 3D), solid or curved shells or curved beams (3D),
  which the staged input has no field for and used to drop.

#### Section properties and connections verified against exact forms and published values (2026-10-17)

**BREAKING (results): asymmetric sections wound clockwise, the shear centre, shear areas and
warping constant of sections with a product of inertia, thin-walled J, bolt bearing, long
end-loaded welds, and models using the IRAM steels or the concrete/aluminium presets solve or
check differently.** Each was found by `docs/verification/SECTIONS_CONNECTIONS.md` and has a
regression test.

- **Product of inertia ignored the winding.** `analyze_section` fixed the sign of `Iy`/`Iz`
  with `abs()` but not of `Iyz`, so a clockwise outline, or a hole wound clockwise, returned
  its centroidal product with the wrong sign and mirrored the principal axes of any
  asymmetric custom or drawn section wound that way. Now corrected by the sign of the signed
  area; checked exactly (rational arithmetic) on random polygons with holes.
- **Shear fields ignored the product of inertia (unsafe).** The transverse-shear solve drove
  the field with `z/Iy` and `y/Iz`, which on non-principal axes carries a spurious resultant
  `Iyz/Iy` along the other axis. Shear centre, shear areas, shear stresses and the warping
  constant (whose pole is the shear centre) were wrong for angles, Z and lipped or unequal
  sections and rotated outlines: an equal angle 100x100x10 had its shear centre 13.8 mm
  outside the heel and a warping constant 24 times too large. The field now uses the
  unsymmetric-bending gradient `(Iz z - Iyz y)/D`, and agrees with an independent
  quadratic-element solution (sectionproperties) to 0.2% on shear centre and Cw.
- **Saint-Venant J was far low on thin walls.** The section mesh was sized by triangle count
  alone (A/2000), leaving one or two triangles through a 2-4 mm wall; the P1 Prandtl solve,
  a strict lower bound, then read 18.5% low on a 400x200 I with 2-4 mm plates and 23.9% low
  on a 2 mm channel against an independent quadratic-element solve. The mesh now also bounds
  each triangle by (2A/P)^2/50 (P including holes, capped at 60 000 triangles): those cases
  read 2.2% and 3.3% low, IPE 300 2.5% (was 3.6%). J stays a lower bound, so the change
  raises J toward the true value and never above it.
  The example baselines were re-recorded: member torsion and reaction moments in the steel
  examples move by up to 0.6% (pro-crane-hangar), everything else by under 1e-6.
- **Bolt bearing used the end bolt's clear distance for every bolt (unsafe).** CIRSOC 301
  §J.3.10 takes `Lc = s - dh` for interior bolts; with a generous edge distance the interior
  bolts are the weaker ones (at `s = 3d` they never reach the `2.4 d t Fu` cap), so both the
  designed joint (`lib/connection/bolted-joint.ts`) and the PRO-tab calculator
  (`lib/engine/connection-design.ts`) overstated bearing. The designed joint now sums
  `min(shear, bearing)` per bolt, end and interior apart, as the clause prescribes; the
  calculator, which has no layout, takes the smaller of the two `Lc` (interior at the given
  spacing, or at the 3d minimum when none is given). Checked against the INTI CIRSOC 301-2018
  worked examples 1 and 5.
- **End-loaded fillet welds longer than 300w were credited 0.6L (unsafe).** CIRSOC 301 eq.
  J.2.1 fixes the effective length at 180w beyond 300w; the PRO-tab weld calculator used
  `beta = 0.6`, which matches only at exactly 300w (67% too much at 500w).
- **Combined tension and shear divided the required shear stress by phi.** `frv` is the
  required stress `V/(Ab n)`; the extra phi put the reduced tension of the designed joint
  20-40% below Tabla J.3.6 at moderate shear (conservative). Now reproduces `806 - 2.5 fv`.
- **The PRO advanced section panel could print Routh's J.** When the Saint-Venant solve
  failed it kept the polygon analyser's `j`, Routh's approximation (twice the true J on an I).
  It now shows no J in that case.
- **IRAM steels (F-24, F-26, F-36) carried the 1984 elastic constants (unsafe).** E = 210 000
  and G = 80 769 MPa came from CIRSOC 301:1984; CIRSOC 301-2018 §A.3.5 fixes E = 200 000 and
  G = 77 200 MPa. Models in these grades were 5% too stiff (deflections and drift low).
- **Material presets corrected to their standards.** Reinforced-concrete unit weight 25 kN/m³
  for CIRSOC (CIRSOC 101-2025 Tabla 3.1), EN (EN 1991-1-1 Table A.1) and NBR presets (was 24 or
  24.5: self-weight 4% low); NBR 6118 concrete uses the secant modulus `Ecs = alpha_i Eci` of
  §8.2.8 for analysis (was `Eci`, 8-18% stiff); aluminium 5052-H32 130/210 MPa and 6063-T6
  160/195 MPa per EN 1999-1-1 Tables 3.2a/3.2b (were typical values, up to 50% high on fo).
- **M5x18.9 weak-axis inertia.** The IRAM table's Iz = 327 cm⁴ disagreed with its own
  dimensions (outline 363) and with AISC Shapes Database v16.0 (362); now 362 cm⁴. Every
  catalogue profile is now checked, tabulated against computed from its dimensions, by
  `catalogue-tabulated-vs-computed.test.ts`.

#### Loads and combinations verified clause by clause against the CIRSOC texts (2026-10-17)

**BREAKING (results): generated combinations, seismic weights and wind roof pressures change.**
Every load table and combination rule was re-read from the official texts and checked against
published worked examples where any exist (`docs/verification/LOADS.md`). The errors found
were all unsafe, and each has a regression test.

- **Combinations with companion loads not acting were never generated.** CIRSOC 101-2025
  §2.3.2 requires "investigar los efectos de una o más cargas que no estén actuando". The
  generator emitted only the printed combinations. A roof without floor live load, under wind,
  got combination 3 only as 1,2 D + 1,6 Lr + 0,5 W, so roof suction lowered every gravity
  combination: in the `pro-simple-shed` example the column axial force grew from 44 to 62 kN
  and the rafter moment from 6.9 to 11.4 kN·m once 1,2 D + 1,6 Lr was generated. Combinations
  2 to 5 are now also emitted without each subset of their companions (`notActing`, default on).
  Combinations with the principal load removed are left out because they fall inside the
  envelope of the rest, and a property test checks that claim over every subset of loads.
- **The seismic combination took 0,2 S where INPRES-CIRSOC 103 asks for 0,70.** [3.16]
  combines 1,20 D ± 1,00 E + f1 L + f2 S, and Tabla 3.3 gives f2 = 0,70 for roofs that are
  horizontal or do not shed snow. Combination 5 now takes the larger of the two codes' factors
  for L (f1) and for S (f2). f2 is read from the planned roof's C_s, or from the project's
  `snowRetaining`.
- **Snow was missing from the seismic weight.** [3.15] weighs each level as
  Wi = Di + f1·Li + f2·Si, and the levels left out f2·S. With snow planned, the base shear now
  includes it.
- **Group Ao with medium irregularity was given the static method.** INPRES-CIRSOC 103
  Tabla 2.5 allows Ao only line 1a of Tablas 2.3 and 2.4. Such a plan is now refused with its
  own message, and the modal method is required.
- **CIRSOC 102 roof pressure coefficients (Fig. 2.4-1, θ ≥ 10°) did not interpolate in h/L
  and ran past the first row's 0,0\*.** h/L between printed rows was rounded up to the next
  row, which understated the positive windward Cp (0,2 where the figure gives 0,296 at 25°,
  h/L 0,26). Past the 0,0\*, the first row was interpolated toward positive values, where
  note 2 prescribes 0,0 (0,3 instead of 0,0 at 52,5°, h/L 0,5). Pitched-roof wind loads change
  for h/L other than 0,25, 0,5 or 1,0 and for slopes between 35° and 60°.
- **By width, every member took the live load reduction of the largest area in the model.**
  The plan read AT as the largest area any member could carry and applied it to all of them. A
  6 m edge beam under a 3 m width has KLL·AT = 36 m² < 37 m², which §4.7.2 does not reduce, but
  it came out 21 % light. Each member now takes its own width × length in plan. Panel mode
  already did this.
- **One-way slabs were given the live load reduction.** CIRSOC 101-2025 §4.7.6 reads "Para
  losas en una sola dirección, las sobrecargas no se podrán reducir excepto en el caso de
  sobrecargas pesadas". The module followed ASCE 7 and the commentary, which allow the
  reduction up to 1,5 × the span. It now refuses it up to 5 kN/m².
- **A partition allowance below 0,75 kN/m² counted** (§4.3.2). It is now reported as missing.
  Tabla 4.1's 9 and 14 kN concentrated loads for light and heavy manufacturing were added.
- **CIRSOC 104 Tablas 1.8 and 1.13: Uspallata (0,80 kN/m²) and Villa Reynolds (0,45 kN/m²)
  added.** The tables print them above their headers, and they were missing, so they could only
  be read as their departments' 0,3 kN/m². The slippery-roof option now states the §4.1
  thermal-resistance condition for warm roofs.
- The companion-snow note now says what the S case is: the balanced roof snow load. Exception
  2 names the flat-roof load and its commentary admits the sloped one (ps).

#### Constraints on inclined-support nodes are built in the support frames (2026-10-17)

**BREAKING (results): models with a constraint (rigid link, diaphragm, equal DOF,
eccentric connection, linear MPC) on a node with an inclined support, and models whose
constraint slave sits on a support, solve differently in every analysis.**

- **Constraints at inclined supports.** At an inclined-support node the DOF slots hold
  the support frame's rotated components (every analysis assembles K, M, Kg and loads
  there), while constraint equations are written in global components. The constraint
  transform was built over the slots as if they were global, so the solve enforced the
  wrong equations and the results violated the constraint with no warning (found by the
  Code_Aster differential, aster3d-16; #296 made the linear static solvers refuse such
  models). `build_constraint_transform` now takes the inclined frames
  (`inclined_dofs_2d/3d`) and rewrites the equations there; `FreeConstraintSystem`
  is built from the model, so every analysis and the linear, modal and buckling
  certificates use the same transform. Constraint forces at an inclined node are reported
  in global components. #296's refusal is replaced by the fix.
- **A constraint whose slave is held by a support is enforced.** Its equation's dependent
  DOF is now chosen among the free DOFs after substituting the existing dependencies, so
  a rigid link whose slave sits on a support makes the support restrain the master.
  Eliminating the restrained slave instead dropped the equation: the support won and the
  results broke the constraint, with only an `OverConstrainedDof` warning (still issued).
- Every equation touching an inclined node or a restrained slave is verified against the
  built transform; a conflict there (e.g. two rigid links on the same slave, which
  elsewhere is "last one wins") is refused.
- Tests: `tests/constraints_inclined_supports.rs`, every constraint type in 2D and 3D
  (dense and sparse paths) against the support modelled as a linear MPC and against the
  rigidly turned model, and every analysis that takes constraints. Modal, buckling,
  harmonic, spectral 2D, Craig–Bampton, time history, fiber, SSI, contact and arc length
  are ignored until #287 (they mis-handle inclined supports with or without constraints);
  all pass with it merged.

#### Fixes found by fuzzing the WASM entry points (2026-10-17)

Found by the cargo-fuzz targets in `engine/fuzz` (`docs/verification/FUZZ_MUTANTS.md`),
each with a regression test.

- **Several supports on one node double-counted its reaction.** Linear 2D/3D results listed
  one reaction per support, each with the node's full restrained-DOF reaction, so ΣR was
  off by the applied load and a *certified* result failed global equilibrium. Each node now
  has a single reaction entry with its restrained reactions counted once (spring forces of
  all its supports still add). `tests/duplicate_support_reactions.rs`.
- **Several supports on one node could silently drop a restraint.** 2D DOF numbering kept
  only the highest-id support of a node, so `fixed` (id 1) plus `pinned` (id 2) solved as a
  pinned end; 3D ORed the restraint flags but took springs and the inclined flag from one
  support picked in hash order. Plain rigid restraints on one node now merge by OR in 2D and
  3D; any other combination (springs, prescribed displacements, inclined directions) is
  rejected with an error naming the node. The web app already keeps one support per node.
  `tests/duplicate_support_reactions.rs`.
- **A 3D inclined support without a usable normal solved as an ordinary support.**
  `isInclined: true` with a missing or zero normal fell back to the support's restraint
  flags. It is now rejected; the web app always sends the normal. Found while triaging
  surviving mutants of the DOF numbering. `tests/solver_mutation_kills.rs`.
- **An unknown 2D support type restrained nothing, silently.** A type the engine did not
  know (a typo, or `"pin"`/`"roller"`) left the node free. Every 2D analysis now rejects it,
  naming the accepted types (`"free"` stays as an explicit no-restraint type). Five engine
  tests had used `"pin"`/`"roller"` and so ran unsupported models; they now use
  `"pinned"`/`"rollerX"`, except the stayed-deck cable test, which keeps the cantilevered
  deck it always ran (`"free"`): with a real end roller the 2D cable iteration does not
  converge (a stay alternates between slack and taut) and says so. The 2D and 3D cable
  solvers also skipped input validation entirely; they now validate like every other
  analysis. `tests/solver_mutation_kills.rs`.
- **Harmonic certificates reported NaN enclosures for a zero response.** When the target DOF
  was not excited (or the reported value equalled the candidate), the outward-rounded sum of
  squares had a lower end of −5e−324 and its interval square root was NaN, so a *certified*
  result carried NaN amplitude enclosures and error bounds. The modulus now clamps that lower
  end at 0 (sound: the sum is ≥ 0 exactly). `tests/fuzz_regressions.rs`.
- **Time-history certificates reported +∞ relative update residuals for a structure at
  rest.** The subnormal interval residual of exact zeros was divided by max‖u‖ = 0, giving
  `null` in fields the web reads as numbers. Relative residuals now divide by
  max(scale, `f64::MIN_POSITIVE`). `tests/fuzz_regressions.rs`.

#### Solver fixes found by result certificates and OpenSees differential testing (2026-10-15)

**BREAKING (results): models with Timoshenko members under member loads, plastic analyses,
HHT-α time histories, spectral member forces, harmonic responses, partial distributed loads,
2D truss axial point loads and 2D spring rollers solve differently.** Each was found by a
certificate disagreeing with the solver (`docs/verification/CERTIFY.md`) or by the
comparison against OpenSees (`tools/opensees/`), and each has a regression test.

- **Timoshenko members used Euler–Bernoulli fixed-end forces.** Members with shear areas
  assembled a shear-flexible stiffness but loaded it with Euler–Bernoulli fixed-end forces,
  so point loads, couples, partial and trapezoidal loads gave wrong displacements and end
  forces (13.6% on a short cantilever). All member-load fixed-end forces now integrate the
  load against the Timoshenko element's own shape functions; the FEF functions take `phi`
  explicitly. Validation models 04 and 07 moved (largest maxima change 0.67%, applied loads
  unchanged). The member deflection curve in the web now includes shear deflection.
- **Plastic analysis placed hinges only at member ends.** With the peak moment inside a
  loaded member the collapse factor was overestimated, which is unsafe: a one-element fixed
  beam under UDL gave 60.28 instead of 37.5 (2D), and a space portal swaying out of plane
  77.04 instead of 33.33 (3D). Both solvers now search each member's moment diagram for
  span hinges, close hinges whose rotation reverses, and (3D) no longer read a failed solve
  as collapse. 3D hinges under biaxial bending can still land 0.4–3.6% below the certified
  value, on the safe side, and the solver warns.
- **HHT-α was not HHT-α.** It was Newmark with HHT's β and γ and a load blend: dissipative
  but first-order accurate. It now integrates the α-weighted equation of motion and is
  second-order accurate.
- **Spectral member forces included static member loads.** Every mode's member forces
  carried the fixed-end forces of the model's distributed, point and thermal loads, and
  SRSS/CQC combined them as if dynamic (simple beam, q = −20: V_max 25.70 instead of 0.758).
  Modal forces now come from the inertia response only.
- **Harmonic responses were truncated silently.** The omitted modes are now added as a
  static (mode-acceleration) correction, cutting the error against a direct solve from
  ~7e-5 to ~1e-7 of the peak. `HarmonicResult` reports `method`, `modesUsed`, `nDof`,
  `truncationRatio` and `warnings`.
- **Partial distributed loads** were integrated with 20-panel Simpson (~1e-4 relative
  error); now exact Gauss–Legendre.
- **2D truss end forces** ignored axial member point loads.
- **2D roller supports with a spring** on the free DOF left the spring force out of the
  reaction.
- **New warning `StiffnessNotPositiveDefinite`** when the factored stiffness is singular or
  indefinite (LU fallback, a diagonal shift, or a Cholesky pivot at round-off level).
  Numbers are unchanged; the solver used to return them without comment.

#### Shell elements: rigid motions, the DKT triangle, and three sign conventions (2026-09-24)

**BREAKING (results): every model with shell elements solves differently.** Four defects,
found by one check that every element must pass and none did: its stiffness must
annihilate the six rigid motions (`tests/shell_rigid_body_modes.rs`).

- **Drilling stabilisation resisted rigid rotation (MITC4, MITC9, DKT+CST, curved
  shell).** The penalty was γ·∫θz² on the drilling DOF alone. A rigid rotation about the
  normal then cost energy, so the term acted as a spring to ground on every shell node,
  about its normal. A beam sharing nodes with a slab and bending in the slab's plane lost
  part of its moment to the ground: reactions stopped balancing the loads, and floor beams
  under gravity carried weak-axis moments the structure does not have. It is now the
  Hughes–Brezzi term γ·∫(θz − ω)², ω = ½(∂v/∂x − ∂u/∂y), with the same γ (G·t/1000). On
  curved shells it uses the interpolated surface's own normal and dual basis, so it
  vanishes on rigid rotation for any geometry; `rigid_body_modes_curved` was relaxed to 2e-4
  for exactly this energy and is now held to 1e-10.
- **The DKT triangle's B-matrix coefficients were wrong.** Pₖ, qₖ and tₖ had the wrong form
  (Pₖ = −6xy/l² instead of −6x/l², on xⱼ − xᵢ). The element did not annihilate a rigid
  tilt, and a simply supported square plate read 3.75–4.0× Navier's deflection at every
  mesh density. It had passed its benchmark because that benchmark accepted anything within
  5×. It now follows Batoz, Bathe & Ho (1980) and converges to Navier: 0.961, 0.991, 0.998,
  1.000 at 4×4, 8×8, 16×16, 32×32. The benchmark now holds 16×16 to 0.5 %.
- **The curved shell turned its director by d × θ.** Every rotation DOF of the element had
  the opposite sign to the frames and MITC4 it shares nodes with. A tip moment on a
  curved-shell strip bent it the wrong way (+1.59e-3 against −1.60e-3). It now uses θ × d.
- **MITC4 and MITC9 thermal gradients curled plates the wrong way.** With
  dt_gradient = T(+z face) − T(−z face), the convention of the frames' `dt_gradient_z`, of
  the curved shell and of the corrected DKT, a hotter top curled a clamped plate up. The
  moment sign in `quad_thermal_load` and `quad9_thermal_load` is corrected. Centroid
  and nodal stress recovery use the matching free thermal curvature, so a freely curling
  plate reports zero moments. DKT reports sagging-positive moments, matching MITC4/9 and
  the reinforcement design convention, while preserving physical top/bottom fibre stresses.
  Analytical checks cover both gradient signs, free and restrained plates, and bending/twist
  (`tests/shell_stress_conventions.rs`).

Assembled with an upper triangle mirrored, the new terms are exactly symmetric. The shell
modal golden in `tests/core/sparse_mass.rs` was re-captured: the bending modes moved by
1e-8 to 6e-7 relative. `tests/shell_model_equilibrium.rs` pins the model-level
consequences on all four elements: tip moment sign, thermal curl, and reaction balance
with an edge beam.

On the web side, the flagship `pro-edificio-7p` now has no provisional-biaxial beams. Its
last five had secondary ratios of 0.106–0.244, and the drilling spring produced them: they
are 0.010–0.028 now. Tests that exercise the provisional path turn five beams 20° about
their axis (`ROLLED_BEAMS` in `workspace-scene.ts`), which bend about both axes for a real
reason.

#### Modal participation of constrained models (2026-09-24)

**Output change: `participationX/Y/Z`, effective masses and mass ratios from modal analysis of
models with constraints, and every spectral result built on them.** With constraints the
eigenproblem is solved in the reduced space, and the participation numerator φᵀM r was formed
as (Cᵀr)ᵀ(CᵀMC)φ_s. Cᵀ is the force transform: for N nodes tied by EqualDOF it sums their ones
into N, so Γ came out N× too large and the effective mass N²× — three tied columns reported a
cumulative mass ratio of 3.34, a one-storey diaphragm 434. A diaphragm's Cᵀr also put the
nodes' eccentricities on the master's θz, a torsional participation no rigid translation has.

The numerator is now φ_s · Cᵀ(M r): the inertial load of a unit ground acceleration, reduced as
the force it is, which is exact for every constraint type. Unconstrained models compute the
same numbers as before. Pinned by `tests/modal_constrained_participation.rs`, which compares
each constrained model with the same structure tied by stiff massless links.

The web app does not send constraints to modal analysis today, so this was reached only
through the engine API.

#### Modal participation factors refer to the published mode shape (2026-09-23)

**Output change: `participationX/Y/Z` from modal analysis, and every spectral displacement and
member force.** `solve_modal_2d`/`solve_modal_3d` computed Γ on the eigenvector as the
eigensolver returned it (mass-normalized) and then published that vector scaled to a unit
maximum, without rescaling Γ. Γ scales inversely with its shape, so the pair no longer
belonged together — and `solve_spectral_2d`/`solve_spectral_3d` build each modal response as
Γ·φ·Sd from exactly that pair. Spectral displacements and member forces came out multiplied by
the reciprocal of the eigenvector's largest entry: √m for a single-degree-of-freedom system,
3.13× for a 9.8 t girder, growing with the square root of the model's mass.

Γ is now rescaled with the shape. Unaffected: frequencies, periods, mode shapes, effective
masses and mass ratios (Γ²·φᵀMφ is invariant), and therefore spectral base shear, which is
built from effective mass. Pinned by `validation/domains/dynamics/spectral_normalization.rs`:
Γ = 1 and u = Sa/ω² for an SDOF frame in 2D and 3D, and the modal expansion Σ Γₙφₙ = ι over
all modes of a cantilever, in every direction, in 2D and 3D — an identity that holds under any
normalization only if Γ and φ share one.

The PRO modal table's "Cum. X/Y" columns added up |Γ| and read the sum as a mass percentage
against the 90 % target; with unit-maximum shapes a cantilever's first mode showed 157 %,
marked sufficient, while carrying 61 % of the mass. (That display was fixed separately on
main; this entry covers the engine side.)

#### Shell edge loads: outward normal sign corrected (E6 audit, 2026-08-14)

**BREAKING (saved models): `quadEdge` and `quad9Edge` loads reverse direction.**
`quad_edge_load` and `quad9_edge_load` built their in-plane normal as `ez × et`, which
points INWARD for the CCW node ordering `quad_local_axes` guarantees — the opposite of
the convention documented on `SolverQuadEdgeLoad` ("positive `qn` = outward from
element") and of `curved_shell_edge_load`, which has always used `t̂ × d̂`. The three
shell elements disagreed, and the two quads contradicted their own documented input.

The code now matches the documentation, so **the documentation did not change and the
results did**. Any existing model carrying a `quadEdge`/`quad9Edge` load now produces
forces in the opposite direction: a case that read as tension reads as compression.
There is no version gate and no automatic migration — `qn` is passed through unmodified
at every call site. Re-check any saved model that uses these load types, and negate `qn`
where the previous (inward) direction was the intended one.

Unaffected: `curved_shell` edge loads, which were already correct; pressure loads; and
any model without edge loads.

**Magnitude fix in the same place.** The normal was also unnormalized. `ez` is derived
from the element diagonals, so it is perpendicular to the edge chord only when the quad
is planar; on a warped element `|et × ez| = sin θ < 1` and `qn` was applied at that
fraction of its stated value — correct direction, silently short, and invisible to any
test built on a flat square. Both quads now normalize, matching `curved_shell`.

#### Curved shell thermal gradient: 2× factor removed (E6 audit, 2026-08-14)

`curved_shell_thermal_load` applied twice the thermal moment it should. The through
-thickness gradient term now integrates to `M_T = Eα·ΔTg·t²/(12(1−ν))`, matching
`quad_thermal_load`. Thermal-gradient results on curved shells change by a factor of 2.

#### RC Design workflow rebuild — verified auto-design, honest invalidation (PR15, 2026-07-25)

**BREAKING (verification results): `cirsoc201.provided.v1` → `cirsoc201.provided.v2`.**
Statuses produced by earlier versions are NOT comparable with this release — some
previous passes were false. Every design certificate now records `verifierId`, and
the UI carries a migration notice (`design.cert.migrationNotice`).

**Reported regression fixed.** A committed reinforcement edit called
`verificationStore.clear()`, which emptied the design table and also destroyed
`concreteMap` — the data the live provided-rebar verification needs as input. Editing
reinforcement now preserves the table, the expansion, filters, scroll position and
selection; the affected member re-verifies immediately from retained demand.

**The real trust bug fixed.** The table summary and the viewport overlay read the
auto-design baseline, which is "designed to pass" by construction. Weakening a
member's rebar left the viewport green. Status everywhere is now derived from the
PROVIDED reinforcement, with three honest display states: current, stale (desaturated
status colour + hatch + glyph) and unavailable (never green).

**Governing-axis correction.** Beam and column verification was hardcoded to the
Mz/Vy pair while the generator selected the axis per member. Measured on the
408-member flagship frame: 128 X-beams received *false passes* (utilization 0.62 while
the real 1113 kN·m gravity moment was unchecked), and columns were designed for a
6 kN·m moment while carrying 973 kN·m. Both now consume a single
`resolveDesignAxes` result. Missing reinforcement in a loaded region is an explicit
FAILURE instead of a silently skipped check; column ties check both shear components;
the slenderness magnifier reaches the verifier.

**Auto-design now produces verified reinforcement.** A deterministic, bounded
candidate search designs each beam region independently, enforces bar fit at
generation time, recomputes the effective depth from the actual layer centroid, and
verifies every candidate with the authoritative verifier the UI displays. Outcomes are
`VERIFIED` (with a certificate), `SECTION_INADEQUATE` (exhaustive, with a preliminary
section recommendation), `DEMAND_UNAVAILABLE`, `SEARCH_EXHAUSTED` or `UNSUPPORTED` —
none of which is ever counted as a pass. Measured on `rc-design-frame`:
**376/408 failing before → 408/408 VERIFIED after** at rebuild time, worst certified
utilization 0.993, 408 members in ~0.4 s. (The second review round below later
tightened biaxial coverage: the same frame now reports 386 VERIFIED + 22 honest
refusals of previously false-passing wind-combo beams.)

**Utilization convention** is now demand/capacity everywhere (warn 0.95 < u ≤ 1.00,
fail above 1.00); the ad-hoc `1/ratio` inversion in the UI is gone.

**Review hardening (PR #78 review follow-ups).** Three verifier defects in the
regional rewrite, all in `station-design-forces.ts`:

- Column uniaxial P-M capacity was analyzed about the WRONG axis for My-governed
  rectangular columns (b≠h): the capacity axis followed the moment NAME instead of
  the flex-rotated section, checking at the strong depth — measured false passes of
  ~2.2x (util 0.68 reported where the true value is 1.51). The mapping is now
  primary→depth h, secondary→depth b.
- Opposite-sign demand was silently unchecked: hogging in the span (cantilevers,
  pattern live load, uplift) and sagging at the supports were filtered out of every
  region. A new sweep checks them against the steel that actually reaches each region
  (from the curtailment/continuity resolution) and FAILS explicitly when none does;
  the candidate generator seeds and escalates support top steel for span hogging and
  span bottom steel for support sagging. The pre-PR sweep coverage is restored.
- Shear capacity received the axial force in the solver's sign (+ = tension) while
  expecting compression-positive — compression weakened members (false failures) and
  tension strengthened them (unsafe passes). Both call sites now pass -N. Column ties
  also use a per-axis effective depth (secondary axis used the primary depth).

Plus: stirrup/tie legs clamped to [2, 6] and column face bars to 6 at the store layer
(typed input bypassed the editors' max; legs multiply shear capacity unchecked);
`designOne` keeps provisional flags in sync; the design table no longer hijacks
editor keystrokes (Enter collapsed the row being edited). Regression coverage:
`design/__tests__/review-fixes.test.ts` (9 tests incl. rectangular-column P-M,
cantilever-style span hogging, shear axial sign) and
`store/__tests__/rebar-review-fixes.test.ts` (clamps + provisional sync).
The flagship frame still designed 408/408 VERIFIED with the sweep active
(now 386 + 22 explicit biaxial refusals — see the second review round below).

**Review hardening, second round (independent review of the full PR).** Six
further fixes, each RED-verified before the change:

- Biaxial column P-M mapping: the first-round axis fix covered the uniaxial branch
  only; the biaxial branch passed moments by name into the rotated section. Same
  physical column gave utilization 0.903 vs 0.518 depending on axis naming; now
  primary→Muz/secondary→Muy with a mirror-symmetry regression test.
- Biaxial beams (secondary demand ≥10% of primary) are now explicitly REFUSED
  instead of certified with an unchecked axis — 22 wind-combo beams on the flagship
  frame moved from false-pass to `SEARCH_EXHAUSTED (limiting: biaxial)`.
- Undo/redo of reinforcement-only edits goes through the silent path: the analysis,
  demand and results survive Ctrl+Z (previously a full invalidation).
- Solve generations are stamped on every results publish: verification computed
  against superseded forces now displays as `stale` (previously unreachable), closing
  the self-weight/axis-convention re-solve hole.
- Solve results that arrive after a model mutation are discarded (mutation-epoch
  guard in live-calc) — the moving-load fix generalized to the main combination path.
- The 190 `design.*` i18n keys now exist in all 14 locales (2,280 translated strings)
  with a key-parity test.

**One "Run Design" button became three explicit commands plus Design all**
(compute demands / run code check / auto-design), with progress, cancellation and
partial-run honesty. Reinforcement writes go through
`modelStore.reinforcementTransaction`: one undo step per action, one reactive commit,
no model-version bump and **zero structural solves** — previously rebar edits were not
undoable at all.

**Added**: derived member grouping (elevation bands labelled `L3 +10.20 m`, structural
planes, frame lines with a collinearity gate, section/material/kind/connectivity),
batch editing with preview + validation + opt-in "Protect manual overrides" +
one-step undo, changed-members review with provisional (uncertified) candidates, a
design-code adapter registry (CIRSOC 201 implemented; ACI/Eurocode/NDS/TMS/AISI
registered as honestly unsupported), and Playwright browser coverage.

**Fixture corrections**: `rc-design-frame` authored its 120 Y-direction beams' gravity
load in the local *y* (horizontal) component — 240 load entries moved to `qZ`. Load
combinations added; sections enlarged to 500×500 columns and 350×650 beams so the
flagship example demonstrates a complete design. New `rc-design-qa-8` fixture for fast
deterministic tests. `orientation-diagnostic.ts` detects this class of error and blocks
certification for affected members.

**Initially-suspected solver defect: withdrawn.** While authoring this work, a raw
WASM probe (no explicit `localY`) appeared to bend a global-Y member about local y
instead of local z — ratio exactly Iz/Iy — and it reproduced on the untouched baseline,
so it was written up as a pre-existing upstream defect. CI disproved that: `web/src/lib/wasm/`
is gitignored and CI rebuilds it from the current `engine/` source, where the same probe
returns the correct Iz result. The authoring machine's binary predated the newest engine
commit by nine days. There is no solver defect and no solver change is needed; the
regression coverage in `design/__tests__/orientation-boundary.test.ts` now asserts the
correct behaviour and fails with an explicit "rebuild your local WASM" message if a
stale binary is used.

**Deferred to the next PR**: continuity-aware continuous-beam detailing, coordinated
bar cutoff/laps across spans, beam-column joint design, seismic joint checks and
strong-column/weak-beam design.

### Performance

#### JsValue boundary on the 8 hot WASM exports (2026-07-24)

- `solve_2d`/`solve_3d`, `combine_results_2d`/`3d`, `compute_envelope_2d`/`3d`, and `solve_multi_case_2d`/`3d` now cross the JS↔WASM boundary as `JsValue` (serde-wasm-bindgen, maps as plain objects) instead of JSON text — no `stringify`/`parse` round trip on the hot path. Export names unchanged; ~70 cold exports untouched.
- Worker pool messages carry structured-cloned plain objects instead of ~1MB JSON strings, removing main-thread JSON work from the parallel 3D combinations path.
- `assertFiniteWire` guard preserves the old boundary semantics: NaN/Infinity inputs are rejected before reaching the solver (JSON.stringify used to coerce them to `null`, which serde_json rejected).
- New `web/scripts/bench-wasm-boundary.mjs` benchmark (`npm run bench:wasm-boundary`): combine+envelope per call 1.15–2.1× faster; single-solve total is noise-bound (boundary is ~2% of solve).

### Fixed

#### Hinge/release correctness cleanup (2026-04-26)

Systematic cleanup of hinge/release semantics across the solver contract:

- **Bug A — orphan rotation DOFs**: 2D and 3D kinematic analysis now detect rotation-only zero-stiffness rows directly from `K_ff` instead of relying only on topology heuristics. Dense 2D assembly also stabilizes these orphan rotational DOFs so truss-attached pinned nodes no longer fail as false mechanisms.
- **Bug B — 3D articulated arch / over-release**: 3D frame elements now use explicit per-axis end releases (`releaseMy`, `releaseMz`, `releaseT`) instead of ambiguous generic hinge booleans. This fixes the articulated-arch failure mode caused by releasing both bending planes at once.
- **3D schema cleanup**: legacy 3D `hingeStart` / `hingeEnd` fields are no longer accepted by the solver input contract; stale 3D JSON now fails loudly instead of silently preserving broken semantics.
- **3D UI bridge mapping**: the current 3D hinge bridge now maps the existing generic UI hinge toggle to a single in-plane bending release (`Mz`) rather than an accidental ball-joint-style double release.
- **Regression coverage**: Rust + TypeScript reproducers now cover both the orphan-rotation false mechanism and the 3D articulated-arch release contract.

#### Trust hardening — 25+ correctness fixes (2026-04-19)

Systematic audit and fix of solver correctness issues across elements, constraints, and diagnostics:

- **Timoshenko hinge FEF condensation**: correct shear/moment redistribution ratios derived from stiffness matrix — `sv = 6/(L(4+φ))`, `sm = (2-φ)/(4+φ)`. Both 2D (φ=0) and 3D (φ_y, φ_z) call sites updated across `assembly.rs`, `sparse_assembly.rs`, `linear.rs`, `corotational.rs`
- **Pre-solve gates**: `run_pre_solve_gates_3d` wired into all advanced solvers (corotational, material_nonlinear, fiber_nonlinear, winkler) — shell distortion, suspicious local axes, isolated/duplicate nodes
- **Shell distortion / Jacobian gating**: quality metrics for Quad9 (MITC9), SolidShell (SHB8-ANS), and CurvedShell — aspect ratio, skew, warping, Jacobian ratio at integration points. 24 shell mesh quality gate tests
- **RigidLink DOF validation**: `validate_constraint_refs` now checks RigidLink DOF indices against `max_dofs_per_node` (3 for 2D, 6 for 3D)
- **Inclined support equilibrium summary**: reactions transformed from support-local to global before summing, fixing incorrect totals. 2D + 3D tests
- **Hognestad tangent**: removed contradictory dead code in pre-peak ascending branch
- **Cable validation**: cable elements now pass input validation (were rejected as unknown type)
- **Dead DKT code**: removed unused `ak/bk/ck/dk/ek` arrays from plate.rs

### Added

#### Certified results (2026-10-15)

After a solve the engine can prove rigorous bounds on how far its answers are from the
exact solution of the assembled model: interval-arithmetic a posteriori certificates for
linear static analysis (constraints included), member and shell forces, combinations and
envelopes, design utilizations, buckling, modal (with proof that no mode below the cutoff
was missed), spectral, harmonic, P-Delta, plastic collapse (2D and 3D, exact rationals)
and time integration. Their soundness is proved in Lean (`verify/`), and a verified Lean
checker re-checks exported certificate bundles. The web shows the certificates beside the
results. Kani proves the element kernels, interval rounding and sparse index code
(`docs/verification/KANI.md`); `scripts/kani-safe.sh` runs the harnesses one at a time
under a memory watchdog. See `docs/verification/CERTIFY.md`.

#### Step 4 runtime gates and CI improvements (2026-04-19)

- **Runtime regression gates** (`perf_regression_advanced.rs` — 11 tests): timing bounds for modal, buckling, harmonic, Guyan, Craig-Bampton on representative plate models; sub-cubic scaling verification; sparse path efficiency checks
- **k_full overbuild gates** (`kfull_overbuild_gates.rs` — 15 tests): audit confirmed all solver paths correct (no unnecessary k_full construction); gate tests lock down the contract; fill-ratio gates for frame, shell, and modal paths
- **CI pipeline**: named gates for perf regression, advanced perf, and k_full overbuild; quick criterion benchmark run with HTML artifact upload (30-day retention)

#### Frontend performance optimizations (2026-04-19)

- **Invalidation-based viewport rendering**: both 2D (Canvas) and 3D (Three.js) viewports now render on-demand instead of continuous 60fps loops. Continuous rendering only for active animations, keyboard navigation, and orbit damping. Idle CPU drops to near-zero
- **Live calc debounce**: 120ms for 2D, 200ms for 3D — prevents solver spam during drag/type operations. Manual solve remains immediate
- **Continuous rendering flag**: `uiStore.continuousRendering` toggle to opt-in to old always-render behavior

#### Comprehensive Z-up coordinate convention enforcement (2026-04-18)

Audited and fixed 60+ Z-up/Y-up axis convention inconsistencies across 30+ files:

- **viewport 3D rendering**: WASD pan uses forward.z (not forward.y), Q/E vertical movement on Z axis, distributed load axis fixed, 5 results-sync functions now use `projectNodeToScene()` (computeStructureBBox, syncVerificationLabels, applyFrameHeatmap, syncReactions, syncConstraintForces), measurement label offset corrected
- **store operations**: `splitElementAtPoint`, `mirrorNodes`, `rotateNodes` now preserve Z coordinate for 3D models
- **file persistence**: `.ded` files now persist `analysisMode` and `axisConvention3D`; share links serialize plates, quads, and constraints for PRO models; HTML report uses `dz`/`dry` instead of `dy`/`drz`
- **exports**: added `isMode3D()` helper so PRO mode uses 3D code paths in CSV, HTML, and Excel exports (6 instances in excel.ts, 3 in toolbar)
- **fixture loading**: separated spring stiffness keys from support opts in `load-fixture.ts`
- **IFC import**: added `ifcToZup()`/`ifcDirToZup()` remapping with parent placement hierarchy composition
- **backend AI**: `fz`/`my` as canonical 2D nodal load fields (`fy`/`mz` as serde aliases for backward compat); bounds contract uses `z_min`/`z_max` always-present, `y_min`/`y_max` optional for 3D
- **section stress**: quick-path `computeSectionStress` in `section-stress-3d.ts` fixed My/Mz ↔ yMax/zMax pairing per Navier formula (`σ = N/A + Mz·y/Iz + My·z/Iy`)
- **locale labels**: `rotMomentHelp` corrected across all 14 locales — My is weak-axis bending, Mz is strong-axis
- **basic 3D node creation**: `shouldProjectModelToXZ()` now excludes `'3d'` mode (was only excluding `'pro'`), fixing Y/Z swap in basic 3D mode node placement
- **axis validation**: added `validateAxisSafety()` to detect 2D files with non-zero Z coordinates on load
- **autosave**: `restoreAutosave()` now restores `analysisMode` and `axisConvention3D`

New tests: 39 tests across 4 new test files (model-zcoord, zup-results-sync-projection, fixture-support-metadata, file-save-load). All 1946 web tests and 5919 engine tests pass. (blended count predating the engine-coupled/reference split — see docs/BENCHMARKS.md 'Test taxonomy')

### Added

#### Extraction contracts, structured diagnostics, and solver-run artifacts

- hardened the beam-station extraction contract for downstream RC/steel workflows:
  - added `schemaVersion` to station payloads with documented evolution rules
  - added no-phantom-governing protections so empty governing entries do not serialize fake combo IDs or infinities
  - added representative full-pipeline regression fixtures for RC and steel solve → stations → demands workflows
  - added grouped/member-level snapshot and contract coverage
  - added governing combo names to governing entries and grouped member-governing entries
- added pre-solve model-quality gates for:
  - disconnected nodes / isolated components
  - near-duplicate nodes
  - initial 2D instability-risk detection
- expanded structured diagnostics and trust signals:
  - machine-readable diagnostic codes, severity, node/DOF references, and path-parity coverage
  - equilibrium and residual summaries in representative result payloads
  - sparse fill-ratio diagnostics after sparse Cholesky
  - documented tolerance policy by test type
- added a solver-run artifact contract for reproducibility and replay:
  - `SolverRunMeta` with engine version, build SHA, solver path, and model size
  - `SolverRunArtifact` carrying metadata, diagnostics, equilibrium, timings, result summary, and compact output fingerprint
  - JSON round-trip coverage for artifact serialization

### Changed

#### WASM-first with TS fallback across engine modules

- rewired kinematic analysis (2D/3D) to delegate to WASM when available, falling back to full TS LU rank analysis when not
- deduplicated diagram code: diagrams-3d.ts `computeDiagram3D` now calls `evaluateDiagramAt` instead of duplicating 140-line switch/case; diagrams.ts uses shared `buildDiagram` helper
- added TS fallback for `computeDeformedShape` (was WASM-only, broke tests)
- restored TS fallback for `analyzeSectionStress` (2D), `analyzeSectionStress3D`, and `analyzeSectionStressFromForces` — all had been migrated to WASM-only without fallback
- rewired `moving-loads.ts` to use TS solver when WASM unavailable
- net reduction of ~240 LOC across migrated files

### Fixed

#### Test infrastructure: localStorage and WASM fallback

- fixed `i18n/store.svelte.ts` localStorage crash in vitest: `typeof localStorage !== 'undefined'` passes in Node but `.getItem` is not a function; added `hasLocalStorage()` guard
- fixed test imports in `inclined-supports.test.ts` and `kinematic-analysis.test.ts` to import kinematic functions from `kinematic-2d` instead of `solver-js`
- test suite went from 122 passing / 3 failing / 31 suites crashing to 1625 passing / 0 failing / 35 suites green

### Added

#### Design-grade beam station extraction

- added `engine/src/postprocess/beam_stations.rs` with 2D and 3D station extraction
- `extract_beam_stations()` and `extract_beam_stations_3d()` evaluate M/V/N (or all 6 force components in 3D) at configurable stations per member, across all load combinations, tracking governing pos/neg values with combo provenance
- exposed as WASM functions `extract_beam_stations` and `extract_beam_stations_3d` for direct use from the product layer
- default 11 stations (tenth-points), configurable via `num_stations`
- 8 unit tests (endpoint parity, midspan UDL, governing combo split, configurable count, missing element skip, determinism, 3D endpoint parity, envelope cross-check)
- 3 integration tests (full solve→station extraction with multi-span continuous beam and two combos, JSON round-trip with camelCase verification, snapshot stability test for product-team contract)
- unblocks RC design tables, reinforcement schedules, and downstream BBS generation
- `Option<GoverningEntry>` pattern prevents phantom infinities / sentinel combo_id=0 when no combo data exists
- `combo_name` propagated into per-station combo force entries — frontend never needs a separate join
- `SignConvention2D` / `SignConvention3D` metadata embedded in every result payload
- grouped-by-member convenience layer: `extract_beam_stations_grouped()` / `extract_beam_stations_grouped_3d()` with member-level governing summaries (`MemberGoverning` / `MemberGoverningEntry` including station index), WASM bindings, 5 unit tests, 1 integration test

#### Modified Newton-Raphson for nonlinear solvers

- added `modified_nr: bool` parameter to corotational 2D/3D and fiber nonlinear 2D/3D solvers
- when enabled, caches the Cholesky factorization from iteration 0 and reuses it across subsequent NR iterations within each load increment, avoiding refactorization; falls back to full NR if Cholesky fails on iteration 0
- measured on fiber nonlinear 2D with bilinear steel (fy=250 MPa, 1% hardening): converges for moderate plasticity with 2-3× more iterations; diverges for deep plasticity — not a blanket win, useful where factorization cost dominates and nonlinearity is moderate
- corotational (geometric nonlinearity) diverges under modified NR; full NR remains more robust for geometric-nonlinear and deep-plasticity cases
- added 3 parity tests (corotational 2D, corotational 3D, fiber 2D) and 1 measurement benchmark

#### Sparse buckling eigensolver milestone

- added `lanczos_buckling_eigen_sparse` in `engine/src/linalg/lanczos.rs`
- wired `solve_buckling_3d` to use the sparse buckling eigensolver path directly in the common unconstrained case, while keeping a dense path for small models and conservative fallback behavior
- added sparse shell gate coverage for sparse buckling parity
- confirmed the sparse buckling path handles the generalized `K phi = lambda (-Kg) phi` case by factorizing `K` and applying `K^{-1}(-Kg)` as the operator

#### Sparse modal eigensolver milestone

- added sparse Lanczos operators in `engine/src/linalg/lanczos.rs`, including sparse symmetric mat-vec and sparse shift-invert helpers
- wired `solve_modal_3d` to use the sparse eigensolver path directly in the common unconstrained case, skipping dense `K_ff` reconstruction there
- added sparse shell gate coverage for:
  - sparse faster than dense at representative shell size
  - deterministic sparse assembly
  - fill-ratio regression bounds
  - sparse modal parity
- added measured modal sparse-vs-dense timing coverage, including an `11.8×` speedup at `20×20 MITC4`
- measured AMD vs RCM fill behavior and confirmed AMD wins materially on larger shell meshes

#### Sparse reuse into 3D eigen and reduction workflows

- switched `solve_modal_3d`, `solve_buckling_3d`, `solve_harmonic_3d`, `guyan_reduce_3d`, and `craig_bampton_3d` from dense `n×n` assembly to sparse assembly plus dense `K_ff` conversion
- eliminated full dense `n×n` stiffness allocation in those workflows while leaving mass matrices, geometric stiffness, and eigensolver internals unchanged
- added sparse shell gate coverage for these reuse paths (`321` tests reported green)

#### Sparse assembly bottlenecks resolved

- rewrote `from_triplets` from per-column duplicate compaction to global sort + single-pass CSC build, eliminating the memmove-heavy hotspot
- added `k_ff`-only sparse assembly where full reactions are not needed
- sparse assembly on representative shell models moved from major regression to runtime win after those fixes

#### Measured sparse vs dense runtime gains

- added dense vs sparse benchmarks for all three shell families: MITC4, Quad9, and curved shell
- measured factorization-only speedups: 4.5× at 700 DOFs, 22× at 2600 DOFs, 77-89× at 5700 DOFs
- measured end-to-end speedup: 22× at 30×30 MITC4 (sparse 0.56s vs dense 12.3s)
- 0 pivot perturbations across all tested sizes and element families
- sparse wins on all families above ~500 DOFs; dense still faster at curved 8×8 (~450 DOFs)
- fill ratio grows from 2.6× (10×10) to 7.0× (50×50) under RCM ordering — not constant as previously estimated
- extended `bench_solve_3d_shell` to 20×20 and 30×30 mesh sizes
- added `bench_solve_3d_quad9` (5×5 to 15×15), `bench_solve_3d_curved` (8×8 to 24×24), and `bench_full_solve_3d_families` criterion benchmarks
- added `sparse_vs_dense_comparison` in opt-in `bench_phases.rs` profiling test target, now gated behind `--features manual-bench-phases`

#### Sparse shell solve viability and deterministic assembly

- replaced broken etree-based symbolic Cholesky with direct left-looking symbolic factorization that correctly computes fill structure
- added two-tier pivot perturbation in numeric Cholesky: hard threshold (1e-20 × max_diag) rejects true singularities, soft threshold (1e-10 × max_diag) perturbs drilling-DOF pivots with controlled regularization
- added RCM (Reverse Cuthill-McKee) ordering with George-Liu pseudo-peripheral start node; fill ratio dropped from 673× to 1.8× on representative shell meshes
- eliminated dense LU fallback on shell models: sparse Cholesky now survives MITC4, MITC9, and curved-shell plates that previously always fell back to dense LU (87% of wall time → 0%)
- made all assembly paths (dense, sparse, parallel) deterministic by sorting HashMap element iterations by ID
- fixed DOF numbering determinism: when multiple supports target the same node, constraint flags are now merged with OR instead of nondeterministic HashMap overwrite
- added residual-based parity testing for ill-conditioned shell matrices: both sparse and dense solutions verified via ||Ku-f||/||f|| < 1e-6 instead of max-displacement comparison
- added benchmark gate tests: no-dense-fallback gate, fill-ratio gate (< 200×), and sparse-vs-dense residual parity gate
- wired pivot perturbation count and max perturbation into SolveTimings and solver diagnostics
- added `PivotInfo` to `NumericCholesky` for tracking perturbation statistics

#### Parallel 3D element assembly

- added `assemble_sparse_3d_parallel()` behind `#[cfg(feature = "parallel")]` using rayon
- unified all 8 element families (frame, truss, plate, quad, quad9, solid-shell, curved-shell, connector) into a single `AnyElement3D` enum for one `par_iter()` work pool
- pre-built element-id load index reduces load dispatch from O(elem × loads) to O(elem + loads)
- serial fallback via `#[cfg(not(feature = "parallel"))]` delegates to the existing `assemble_sparse_3d()`
- wired parallel path into `solve_3d()` as the default sparse assembly call
- added parity tests: flat-plate (4×4) and mixed frame+slab (4 columns + 16 quads + nodal + pressure loads)
- added criterion benchmarks: flat-plate up to 50×50 (2500 quads, ~15k DOFs) and mixed frame+slab up to 8-storey 8×8
- measured 2-6% speedup on MITC4 flat plates (lightweight per-element cost); later profiling showed CSC construction, not element math, is the real sparse-assembly bottleneck
- made `inclined_rotation_matrix` and `apply_inclined_transform_triplets` public for reuse
- fixed pre-existing `transform_force` scope issue in the 2D parallel path

#### Curved shell family and corrected hemisphere interpretation

- integrated the curved-shell family into the solver narrative as a production shell option for genuinely curved geometry
- established that the old hemisphere extremes were partly inflated by an `E` unit issue in the benchmark setup, and corrected that interpretation across the shell benchmark story
- added curved-shell benchmark coverage showing near-reference hemisphere behavior while preserving credible flat-shell and barrel-vault performance
- clarified that the shell stack is now `MITC4 + MITC9 + SHB8-ANS + curved shell`, with the remaining work focused on family guidance, workflow hardening, and shell-adjacent breadth

#### MITC9 and SHB8-ANS shell-family expansion

- integrated the `MITC9` 9-node quadrilateral shell through the full solver stack: dense+sparse assembly, mass, geometric stiffness, buckling, stress recovery, and all shell load types
- added `MITC9` acceptance/workflow models covering cantilever shell response, mixed beam+slab building workflow, cylindrical tank wall behavior, and modal plate extraction
- integrated the `SHB8-ANS` solid-shell family as a new shell path for the curved/non-planar frontier
- added shell-family frontier gates and comparative benchmarks across `MITC4`, `MITC9`, and `SHB8-ANS`
- established explicit shell selection guidance instead of treating shell support as a single undifferentiated element family
- shifted the shell roadmap from “add more shell breadth” to “harden and guide the multi-family shell stack”

#### Sparse-first 3D assembly and solve

- completed sparse 3D assembly for plates, quads, inclined supports, and diagnostics
- wired sparse path into `solve_3d()` for models with 64+ free DOFs
- 11-22x memory reduction on shell models (10×10 to 15×15 quad meshes)
- 13 new validation tests: 8 dense-vs-sparse parity, 2 performance benchmarks, 3 drilling regression

#### Shell validation and hardening

- added `QuadSelfWeight` body force load type (density, gx, gy, gz) with consistent Gauss integration, wired into assembly
- added mesh distortion robustness study: aspect ratio, parallelogram skew, trapezoidal taper, and random perturbation sweeps against Navier analytical
- added MacNeal-Harder pinched cylinder benchmark (R=300, L=600, t=3, E=3×10⁶) at 6×6 and 8×8 meshes
- added edge load validation: normal (in-plane) and tangential (axial extension) against beam theory
- added thermal gradient convergence sweep: 4×4, 8×8, 16×16 with monotonic convergence and tightened tolerances
- added warped element accuracy study: cantilever strip at 0%, 5%, 10%, 20% warp with graceful degradation tracking

#### Shell and nonlinear 3D workflows

- verified quad shell load vectors, mass, geometric stiffness, and quality metrics
- verified mixed DKT and MITC4 assembly and beam-shell DOF interfacing
- wired plate and quad stress recovery into the major nonlinear 3D solver families
- added beam-shell mixed benchmarks, shell buckling benchmarks, shell thermal benchmarks, and shell acceptance models
- added plate geometric stiffness contribution in 3D buckling
- added assembly diagnostics for distorted/low-quality plate and quad meshes
- added full nodal stress tensor recovery for MITC4 quads

#### Constraints and connectors

- pushed constraint-system unification further across solver families
- added connector-element assembly coverage across dense and sparse 2D/3D paths
- added constraint-force output in constrained solver paths
- added eccentric-connection integration tests and new constraint benchmark coverage
- propagated constraint-force output into plastic and fiber nonlinear solver paths
- added cross-solver constraint-force parity coverage

#### Benchmark gates and test infrastructure

- added explicit gate suites for:
  - constraints
  - contact
  - shells
  - reduction
  - sparse and conditioning paths
- added explicit CI gate steps for shell benchmarks, shell acceptance models, and constraint benchmarks before the full suite
- added conditioning diagnostics
- added sparse triplet assembly infrastructure
- added parallel element assembly behind the `parallel` feature flag
- extended criterion benchmarks with larger-model assembly and dense-vs-sparse solve comparisons
- switched CI and local default full-suite execution toward `cargo nextest`, with engine-local nextest config and Linux `mold` linker support

### Changed

#### MITC4 shell element: Bathe-Dvorkin ANS shear tying

- implemented true assumed natural strain (ANS) transverse shear interpolation (Bathe & Dvorkin, 1986) in the MITC4 quad shell element
- uses covariant strain tying at 4 edge midpoints with Jacobian-correct transformation at each Gauss point, eliminating transverse shear locking on thin plates
- added EAS-4 membrane softening to the MITC4 quad shell element via static condensation
- benchmark improvements: Scordelis-Lo 6×6 ratio from 0.14 to 0.80, Navier plate from 0.08 to 0.93, cantilever pressure from 0.10 to 1.05, buckling from wide tolerance to 1.02, modal frequencies from ~6× error to 0.1% error
- tightened shell benchmark tolerances across the board to lock in the formulation quality
- added `quad_check_jacobian()` for negative/degenerate Jacobian detection
- added moderate warping diagnostics (0.01-0.1 range) in assembly
- added dedicated thin-plate locking test (a/t = 1000) to prevent regression
- expanded CI shell benchmark gate to cover plate bending, Navier convergence, Scordelis-Lo, cantilever, hemisphere, and thin-plate tests
- EAS-4 is mathematically correct and stable, but pinched hemisphere remains a known membrane-locking limit; that boundary is now documented explicitly

#### MITC4 shell element: EAS-7 upgrade and curved-shell tracking

- replaced the 4-mode membrane enhancement with EAS-7 using a generic small-matrix inverse and 7 enhanced membrane modes
- Scordelis-Lo improved further to roughly 0.84 of reference with no regressions on Navier, buckling, modal, or existing shell gates
- added new shell tracking benchmarks for Raasch hook and twisted beam as explicit non-planar / curved-shell formulation-limit indicators
- clarified that the remaining shell decision is no longer `EAS-4 vs EAS-7`; it is `bounded MITC4+EAS-7 vs broader shell family`

### Fixed

#### Deterministic DOF numbering and assembly

- fixed 3D DOF numbering: multiple supports targeting the same node now merge constraint flags with OR instead of nondeterministic HashMap overwrite
- fixed 2D DOF numbering: supports sorted by ID for deterministic overwrite order
- fixed nondeterministic assembly: all element iterations in dense, sparse, and parallel assembly paths now sorted by element ID
- fixed point-of-contraflexure inflection detection: rewrote to use nodal moment profile approach that handles inflection points on element boundaries

#### Solver quality milestone

- fixed the staged fixed-end-force accumulation bug by tracking cumulative loads across stages
- corrected four pre-existing TME validation expectations involving formulas, sign conventions, and a wrong midspan-node assumption
- added residual-checked Cholesky fallback: if ||Kff*u - f||/||f|| > 1e-6, the sparse 3D solve falls back to dense LU

### Validation

- latest reported full-suite status reached `5590` passing engine-coupled tests with `0` failures
  (plus `1192` reference-formula self-checks counted separately — see `docs/BENCHMARKS.md`
  "Test taxonomy")
