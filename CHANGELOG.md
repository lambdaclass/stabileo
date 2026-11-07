# Changelog

Read next:
- solver roadmap: [`SOLVER_ROADMAP.md`](/Users/unbalancedparen/projects/dedaliano/docs/roadmap/SOLVER_ROADMAP.md)
- benchmark/proof status: [`BENCHMARKS.md`](/Users/unbalancedparen/projects/dedaliano/docs/BENCHMARKS.md)

This file is the historical record.
It should capture what changed, not what should be built next.

## Unreleased

One file per change in [`changelog.d/`](changelog.d/README.md); `scripts/changelog.py --release` moves them here.

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
