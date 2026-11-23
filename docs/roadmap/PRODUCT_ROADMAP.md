# Stabileo Product Roadmap

Stabileo's goal is software engineers can design buildings with. It is not used for that yet, and it
is safety-critical: verification comes first, and a result must never be silently wrong. Some still
can be: section 2 records current soundness priorities and the live backlog by cause; section 4
keeps a curated defect list. Ergodic Group backs and publishes Stabileo.

## 1. Rules

- **Soundness is the top priority** (from 2026-11-08, after release 0.5.0): until the wrong-result
  groups of section 2 are fixed or contained, they and the tests and checks that would catch the next
  one take the capacity first.
- **Order of all work** (set by the user): wrong-result bugs (P0, then P1), then other bugs, then
  features. Nothing in a lower group takes capacity from a higher one. Within a group, rank by impact
  on safe building design divided by effort.
- **Contain first, fix second** ([#447](https://github.com/lambdaclass/stabileo/issues/447)): a confirmed wrong result is warned or refused on main within
  a day; the fix follows with a regression test that fails before it, its own results version and,
  if it was live, a safety advisory.
- **Reviews:** safety, engine and app changes get two reviews before main. Research and Tools ship
  first and are reviewed after they go live, breadth first.
- **Pricing:** the core is free and open source for everyone; paid modules are free for universities;
  Stabileo AI and heavy compute are paid by everyone. Copy promises exactly this.
- **This file** holds priorities and a short status of the soundness program. Detailed landed
  history goes to `CHANGELOG.md` and the website changelog. Sections 2 to 4 are rewritten when an item lands; sections 5 to 7 change rarely. The
  in-flight table in section 2 is generated: run `make roadmap.inflight` and commit the result.

## 2. Now: soundness first (updated 2026-11-22)

### Overall order

Soundness first, in this ranking; nothing lower takes capacity from a higher group, and within a
group work is ranked by impact on safe building design divided by effort:

- (a) uncontained silent wrong results;
- (b) work that removes whole classes of wrong results: completeness gates, invariance tests on
  design and loads, bounded arithmetic, one implementation in Rust, formal checks, units in types,
  test correctness;
- (c) contained defects, warned or refused, that need real fixes;
- (d) verification infrastructure and release safety: nightly reliability, review process, CI gates;
- (e) conservative false refusals and missing engineering coverage;
- (f) performance, platform and architecture;
- (g) growth, SEO, education, examples, Tools, research, marketing and SaaS.

Sections 3 to 6 follow this ranking. Finish and verify the soundness work below before expanding
the design workflow; a conservative refusal is tracked separately from a wrong answer. The release
baseline is [**0.6.4**](../releases/v0.6.4.md) (released 2026-11-21; advisories through `SA-2026-107`
in [docs/advisories/README.md](../advisories/README.md)). Finish the uncontained work first, then
revisit the reported models that main now refuses.

### Priority now

Ordered by expected harm: how likely a user meets the defect, how large the error is, and whether
it errs on the unsafe side. Defects already warned or refused on main (section 4) rank below
uncontained ones.

Most of the silent wrong results found since v0.6.0 came from the design and load layer, the code
that turns analysis results into code checks and generated loads. The solver has nightly fuzzing,
metamorphic and differential tests; this layer has had almost none. The order below follows that.

1. **Contain and fix the remaining silent wrong results.** Start with the open November 17–18
   findings below and the unresolved findings from the design and load audit
   ([#2225](https://github.com/lambdaclass/stabileo/issues/2225) was addressed/contained in `0.6.4`
   via [#2433](https://github.com/lambdaclass/stabileo/pull/2433) /
   [SA-2026-103](../advisories/SA-2026-103-rc-torsion-evidence.md) and remains tracked until full
   closure alongside the remaining open Wave 1–2 items).
   The **under audit** notice for generated loads and concrete design is on main in
   [#2228](https://github.com/lambdaclass/stabileo/pull/2228). Each reported wrong result still
   needs its own correction or refusal.
2. **Remove the classes behind the 2026-11-21 findings** (items 1–4 user-approved 2026-11-21;
   owner-requested architectural foundations 5–6 added 2026-11-22, queued behind active containment
   and items 1–4).
   Almost all the recent wrong results came from the code that feeds the solver or reads its
   results. Four patterns recur; items 1–4 address them directly, and items 5–6 eliminate their
   root causes structurally.

   1. **Independent load and geometry accounting on every solve** (**landed on main in
      [#2470](https://github.com/lambdaclass/stabileo/pull/2470)**; transformation-check follow-ups
      continue below).
      Before each solve, a separate simple path computes each load case's total force and moment
      and each plate's area from the model as entered, compares them with what was assembled into
      the solver, and refuses on a mismatch. This catches dropped or stale couples
      ([#2411](https://github.com/lambdaclass/stabileo/issues/2411),
      [#2459](https://github.com/lambdaclass/stabileo/issues/2459)) and plate area changes during
      remesh ([#2460](https://github.com/lambdaclass/stabileo/issues/2460)). Plate edits lost during
      remesh can also preserve area ([#2461](https://github.com/lambdaclass/stabileo/issues/2461)).
      Include those cases in the transformation checks below. Load-generation tests still compare
      member loads and internal forces.
   2. **Exact internal-force functions instead of station samples.** The engine returns each
      frame element's internal forces as exact piecewise polynomials (`PiecewisePoly<5>`) of its
      loads — extended across combinations, exact inflection points (`M(x) = 0`) and shear zeros
      (`V(x) = 0`), analytical `Cb` integration, closed-form moving-load influence envelopes, and
      rebar anchorage/curtailment intervals. This addresses missed diagram peaks
      ([#2403](https://github.com/lambdaclass/stabileo/pull/2403)), moving-load axial jumps, and
      shear cuts at moment transitions
      ([#2434](https://github.com/lambdaclass/stabileo/pull/2434),
      [#2463](https://github.com/lambdaclass/stabileo/issues/2463)).
   3. **Verdicts only from complete evidence.** A pass requires a record proving every required
      combination, station and reinforcement layer was present. A record with missing evidence
      can only produce a refusal ([#2442](https://github.com/lambdaclass/stabileo/issues/2442),
      [#2355](https://github.com/lambdaclass/stabileo/issues/2355)). This is part of Bautista's design
      work; the reproducers are in draft PRs [#2434](https://github.com/lambdaclass/stabileo/pull/2434)
      and [#2465](https://github.com/lambdaclass/stabileo/pull/2465).
   4. **One canonical model, and invariance on every transformation.** Load, restore and import
      go through one parser that produces a single canonical form. It refuses conflicting fields
      such as the `my`/`mz` aliases. Each night, compare solves across a corpus of saved projects
      before and after remesh, member reversal, rotation, restore and save/open.
   5. **Canonical Physical Structural IR → Pure Rust Analytical Compiler** *(added 2026-11-22; see
      [high_leverage_solver_and_product_plan.md](../research/high_leverage_solver_and_product_plan.md#wave-1--soundness-compounding-architectural-foundations-roadmap-class-b-then-f)).*
      Promote the physical building model (`BeamLine`, `Column`, `Wall`, `Slab`, `RoofPolygon`,
      `Opening`, `LoadSurface`, `Diaphragm`, `RebarCage`, `SupportRegion`) to the sole mutable
      source of truth, with the finite-element mesh compiled by a pure Rust lowering pass (`spade`
      CDT). Every lowering pass enforces global resultant force and moment conservation across
      surface, line, point forces and distributed/point applied couples (`∫ p dA + ∫ q ds + Σ P`
      and `∫ r × p dA + ∫ (r × q + m) ds + Σ (r × P + M)` matching assembled loads within
      scale-relative / interval conservation tolerances) as a **necessary gate**, paired with
      **local patch balance and remesh/subdivision/rotation/reversal metamorphic tests** to verify
      spatial distribution invariance. Wind, snow, seismic stories, gravity load ownership and rebar
      cutoffs are computed on Layer 1 *before* meshing exists — removing the recurring
      subdivision/remesh/reversal bug class across the `SA-2026-064…107` wave (notably
      `SA-2026-072…107`) by construction and enabling multi-fidelity compilation (coarse stick ↔
      refined MITC4/MITC9 ↔ fiber) from one model.
   6. **Executable Design-Code IR ("Design Codes as Data")** *(added 2026-11-22).*
      As design checks move from TypeScript to Rust, encode each code clause once as a pure,
      unit-typed expression AST tagged with its exact clause citation and validity bounds. Derive
      all five outputs from that single AST: fast `f64` check, outward-rounded `Interval`
      certificate (zero drift with f64), `Dual<f64>` sizing derivatives, step-by-step KaTeX /
      Memoria calculation traces (eliminating formula drift between reports and the engine), and
      exhaustive boundary-case tests on both sides of every limit.

   Items 2 to 6 are part of moving design, loads and analytical compilation to Rust and Option B,
   the shared 2D/3D kernel. Item 1 landed independently in [#2470](https://github.com/lambdaclass/stabileo/pull/2470).
3. **Review affected designs after the RC containment and `0.6.3`/`0.6.4` advisories.**
   [#2338](https://github.com/lambdaclass/stabileo/pull/2338) (`0.6.3`,
   [SA-2026-091](../advisories/SA-2026-091-rc-torsion-shear-verification.md)) and
   [#2433](https://github.com/lambdaclass/stabileo/pull/2433) (`0.6.4`,
   [SA-2026-103](../advisories/SA-2026-103-rc-torsion-evidence.md)) block or tighten shear, torsion
   and seismic hoop checks where the evidence is insufficient. Re-run previously certified designs
   and review the governing cuts and drawings. See the release notes for
   [0.6.2](../releases/v0.6.2.md), [0.6.3](../releases/v0.6.3.md) and [0.6.4](../releases/v0.6.4.md)
   for the full list of required re-checks (`SA-2026-069` through `SA-2026-107`).
4. **Audit the design and load layer.** Wave 1 has reported the load-generation and concrete
   findings below; keep each open until its correction or justified refusal is verified.
   Wave 2 covers design dispatch, steel welds and Cb, detailing and EC2.
   Cover CIRSOC 201, 301 and 104, EC3 and the other-code dispatcher, and every load generator. Each check gets an independent
   worked example from a published source, both sides of every limit, and a negative case.
5. **Invariance tests for design and loads, run nightly.** Transforming a model into a physically
   equivalent one must give equivalent answers: relabelling nodes, members or combinations and
   reordering combinations leave every design ratio and generated load unchanged; a change of units
   converts them exactly; rotating, translating or mirroring the whole model together with its
   load-defining directions (wind, seismic, gravity) transforms load components accordingly and
   leaves design ratios unchanged. Gravity-type loads such as snow do not depend on the building's
   plan orientation. The solver already runs these relations; the design layer must too.
6. **Keep design completeness mandatory.** The shared gate for
   [#2096](https://github.com/lambdaclass/stabileo/issues/2096) is done in
   [#2173](https://github.com/lambdaclass/stabileo/pull/2173): missing combinations, members and
   declared stations refuse before design or certification. Audit every new dispatcher and
   demand adapter against that invariant; complete inputs must retain their answers.
7. **One testing system, in `testing/`, with its own roadmap.** Phases 1 and 2 are done in
   [#2165](https://github.com/lambdaclass/stabileo/pull/2165) and
   [#2167](https://github.com/lambdaclass/stabileo/pull/2167): standalone differential, symbolic,
   fuzz and nightly tools, verification documents and the testing backlog now live there.
   The checked map is in `testing/README.md`; generating its coverage and gap inventory remains
   work. Engine integration tests, metamorphic code and browser tests still need consolidation;
   unit tests and Kani checks needing private code stay beside it. Keep existing make targets,
   CI jobs and acceptance limits. Next, in this order, the checks borrowed from database testing:
   - **Every test under equivalent transformations:** each corpus model is rotated, relabelled,
     reordered and converted to other units, and split only where the discrete problem stays the
     same (a frame member split at an unloaded point; generated loads, which depend on the
     physical geometry and not on the mesh); required to give equivalent design ratios, generated
     loads and solver results (the design and load findings listed below). General re-meshing of
     shells and plates changes the discrete answer for a correct implementation, so it is tested
     through convergence rates and error bounds instead.
   - **Pick one, check it is in the answer:** compute one member and station's demands and checks
     independently and require the full run to report exactly that (the
     [#2096](https://github.com/lambdaclass/stabileo/issues/2096) class).
   - **Release diff:** run the corpus on the previous release and the candidate; every changed
     number must match a results-change record, or the release is blocked.
   - **Fast path against slow path:** every cached, sparse or fast path is compared with a plain
     reference on the same input.
   - **Split and sum:** load parts add up to the whole, an envelope equals the union of its parts,
     a member split into segments gives the same design.
   - **A plain-text model corpus with expected answers** from hand calculations or published
     sources, run by every engine and every release.
   - **Seeded simulation of user actions** (edit, undo, change units, save, reload, migrate,
     solve), checking that results survive and nothing stale is shown.
   - **Fault injection** (NaN, infinity, solver failure, missing engine, out of memory) must refuse,
     never fall back silently ([#394](https://github.com/lambdaclass/stabileo/issues/394)), and
     full condition coverage for certificates, design checks and the completeness gate.
8. **Triage the nightly candidates.** The November 15 snapshot had 112 open wrong-result
   candidates from nightly runs; earlier batches collapsed to a few root causes. Each one closes with a fix, a refusal, a
   duplicate link, or evidence that the oracle was wrong.
9. **Remaining engine audits:**
   - [#458](https://github.com/lambdaclass/stabileo/issues/458) and
     [#762](https://github.com/lambdaclass/stabileo/issues/762): replay against the linear
     stability gate ([#1753](https://github.com/lambdaclass/stabileo/pull/1753)).
   - [#759](https://github.com/lambdaclass/stabileo/issues/759): 3D modes that are not
     mass-orthogonal; retriage with our own reproducer.
   - [#818](https://github.com/lambdaclass/stabileo/issues/818),
     [#1453](https://github.com/lambdaclass/stabileo/issues/1453),
     [#742](https://github.com/lambdaclass/stabileo/issues/742),
     [#1503](https://github.com/lambdaclass/stabileo/issues/1503) and
     [#1510](https://github.com/lambdaclass/stabileo/issues/1510) (3D thermal sign convention).
   - [#426](https://github.com/lambdaclass/stabileo/issues/426): 3D co-rotational analysis adds
     rotation vectors, which is wrong for large non-coaxial rotations; confirm whether the app
     warns or refuses, and record it in section 4.
   - Shell results feeding design: every design output built on shell results carries the MITC4
     warnings ([#798](https://github.com/lambdaclass/stabileo/issues/798),
     [#1057](https://github.com/lambdaclass/stabileo/issues/1057)); retriage
     [#810](https://github.com/lambdaclass/stabileo/issues/810).
   - Older findings with no containment yet (MITC9 on twisted coarse meshes, CIRSOC 201
     `flexure_at`, Muy not amplified for slender columns, edge-beam slab torque): section 3,
     "Older wrong-result findings".
10. **Follow-ups:** [#2077](https://github.com/lambdaclass/stabileo/issues/2077),
    [#2078](https://github.com/lambdaclass/stabileo/issues/2078),
    [#2073](https://github.com/lambdaclass/stabileo/issues/2073) and
    [#2085](https://github.com/lambdaclass/stabileo/issues/2085). Also the regression-audit replay
    of [#1946](https://github.com/lambdaclass/stabileo/pull/1946) and the deferred reviews
    [#1997](https://github.com/lambdaclass/stabileo/issues/1997) to
    [#2002](https://github.com/lambdaclass/stabileo/issues/2002). A candidate closes only with a
    correct answer or a justified refusal; a warning alone does not establish correctness.
11. **Conservative false refusals,** kept visible behind the wrong results above:
    [#1951](https://github.com/lambdaclass/stabileo/issues/1951) and
    [#1956](https://github.com/lambdaclass/stabileo/issues/1956).
    [#1996](https://github.com/lambdaclass/stabileo/issues/1996) is decided: staged removal of a
    loaded member keeps refusing.
12. **Plastic collapse invariance:** [#1040](https://github.com/lambdaclass/stabileo/issues/1040)
    and [#972](https://github.com/lambdaclass/stabileo/issues/972). The reported factors were
    slightly conservative, not unsafe. The exact-bounds approach in
    [#2084](https://github.com/lambdaclass/stabileo/pull/2084) is parked because it made the check
    about three times slower and refused PRO examples that solve today; it needs a new approach
    (target: the sparse conic programming / Clarabel SOCP core in
    [Solver performance and capability](#solver-performance-and-capability) item 6, which produces
    primal static and dual kinematic witnesses directly for `PlasticSound.lean` without path,
    ordering or unit dependence).
13. **Remove whole classes of defects:**
    - one shared bounded-arithmetic layer for every rounding certificate and admission check;
    - required test helpers, plus a lint against vacuous checks: assert counts before values, and
      outcomes before diagnostics;
    - every result notice tested on a real saved project, with no feature overrides;
    - one convention for undetermined values
      ([#2077](https://github.com/lambdaclass/stabileo/issues/2077),
      [#2078](https://github.com/lambdaclass/stabileo/issues/2078));
    - units in the type system ([#359](https://github.com/lambdaclass/stabileo/issues/359)):
      zero-cost unit types at the engine boundary first, then branded TypeScript types at the
      UI to engine boundary;
    - nightly bug finding on a dedicated machine, with a liveness check from outside that machine
      that alerts when a night is missed;
    - a release after each advisory.
14. **Move the design and load layer from TypeScript to Rust, then prove its core properties.**
    The recent design, load and result-recovery defects show the gap outside the engine's
    certificates, fuzzing and Kani harnesses. Shared Rust interior recovery has landed in
    [#2170](https://github.com/lambdaclass/stabileo/pull/2170). Continue in this order:
    the design dispatcher and demand assembly, steel inputs such as Cb
    ([#391](https://github.com/lambdaclass/stabileo/issues/391)), CIRSOC 201 sections
    ([#390](https://github.com/lambdaclass/stabileo/issues/390)), load generation
    ([#393](https://github.com/lambdaclass/stabileo/issues/393)), then the analysis duplicates
    ([#392](https://github.com/lambdaclass/stabileo/issues/392)); with no silent TypeScript
    fallback ([#394](https://github.com/lambdaclass/stabileo/issues/394)). Each moved piece gets the
    formal checks listed under [testing/ROADMAP.md, Solver and proof depth item 1](../../testing/ROADMAP.md#solver-and-proof-depth).
15. **How changes land:**
    - every pull request, from any author, gets both reviews when it opens, not only inside a
      later integration;
    - a pull request that changes shared model paths (meshing, supports, loads, design dispatch) is
      not used as the base for other work until it is reviewed;
    - a soundness pull request changes one root cause; when reviews keep finding new defects, the
      proven part ships and the rest splits off;
    - pull requests stay small: one root cause, one advisory.
16. **Before switching on features that ship off:**
    - [#2161](https://github.com/lambdaclass/stabileo/issues/2161) closes before the Tools or
      legal switches turn on (Mohr precision near hydrostatic stress, a plot tick hang, legal-link
      locales);
    - Global axes for 2D, 3D and PRO ([#2364](https://github.com/lambdaclass/stabileo/pull/2364),
      merged in `0.6.3`) and the shared nonlinear drivers
      ([#2483](https://github.com/lambdaclass/stabileo/pull/2483), merged on `main`) sit behind
      switches that are off in production.
    - [#2509](https://github.com/lambdaclass/stabileo/pull/2509) reverted PRO plate modelling &
      the physical-model view ([#2365](https://github.com/lambdaclass/stabileo/pull/2365)) because
      serving production from a frozen copy of `main` froze production fixes. PRO plates
      ([#1928](https://github.com/lambdaclass/stabileo/pull/1928)) can re-land only after owner
      approval, with a real switch gating one shared code path.
    - [#1929](https://github.com/lambdaclass/stabileo/pull/1929) stays held until its review
      findings are fixed.
17. **Shell formulation fixes:** turn the MITC4 and MITC9 warnings and refusals
    ([#798](https://github.com/lambdaclass/stabileo/issues/798),
    [#1057](https://github.com/lambdaclass/stabileo/issues/1057)) into correct answers.
18. **Then unify 2D and 3D.** The design inventory and projection plan are in
    [#1781](https://github.com/lambdaclass/stabileo/pull/1781). Don't merge a broad kernel change
    ahead of the bug fixes and their regression evidence.

### November 17–18 soundness findings

- [#2269](https://github.com/lambdaclass/stabileo/issues/2269) Width-mode level area and seismic weight disagreed with the generated beam loads. Fixed in [#2282](https://github.com/lambdaclass/stabileo/pull/2282).
- [#2271](https://github.com/lambdaclass/stabileo/issues/2271) The provided-beam stirrup spacing check can allow too much spacing when it leaves out axial tension.
- [#2273](https://github.com/lambdaclass/stabileo/issues/2273) Combined 3D member diagrams missed peaks between plotted points. Fixed in [#2282](https://github.com/lambdaclass/stabileo/pull/2282).
- [#2276](https://github.com/lambdaclass/stabileo/issues/2276) Ambiguous or unknown support types could act as fixed supports in 3D. Fixed in [#2277](https://github.com/lambdaclass/stabileo/pull/2277).
- [#2278](https://github.com/lambdaclass/stabileo/issues/2278) DXF import silently maps unknown support labels to pinned supports. Contained on `main` in [#2494](https://github.com/lambdaclass/stabileo/pull/2494) ([SA-2026-109](../advisories/SA-2026-109-dxf-support-labels.md)).
- [#2284](https://github.com/lambdaclass/stabileo/issues/2284) Overlapping shells on the same plane can count floor load twice. Contained on `main` in [#2495](https://github.com/lambdaclass/stabileo/pull/2495) ([SA-2026-111](../advisories/SA-2026-111-gravity-shared-deck-coverage.md)).
- [#2289](https://github.com/lambdaclass/stabileo/issues/2289) A quarter-turn of a plane roller with no attached member can fix every movement in 3D. Recheck the 3D case after [#2277](https://github.com/lambdaclass/stabileo/pull/2277).
- [#2291](https://github.com/lambdaclass/stabileo/issues/2291) A detached sloping shell above a beam bay can hide the floor load below. [#2282](https://github.com/lambdaclass/stabileo/pull/2282) refuses the reported model.
- [#2292](https://github.com/lambdaclass/stabileo/issues/2292) The synchronous cable and soil–structure solvers can treat non-finite spring stiffness as absent, and repeated case factors can cancel a nonzero response. Contained on `main` in [#2496](https://github.com/lambdaclass/stabileo/pull/2496) ([SA-2026-110](../advisories/SA-2026-110-solver-json-boundary.md)).
- [#2294](https://github.com/lambdaclass/stabileo/issues/2294) Copying only a roller node can lose its member axes and restrain the wrong movement.
- [#2295](https://github.com/lambdaclass/stabileo/issues/2295) An offset rafter and split roof shells can both receive load over the same area. [#2282](https://github.com/lambdaclass/stabileo/pull/2282) refuses the reported model.
- [#2296](https://github.com/lambdaclass/stabileo/issues/2296) The provided-beam shear check can miss gaps in the stirrups or use the wrong effective depth at the checked section. Contained in [#2338](https://github.com/lambdaclass/stabileo/pull/2338).
- [#2299](https://github.com/lambdaclass/stabileo/issues/2299) A shell rigidly linked above a closed beam bay can receive the same gravity load as the beams below. Contained on `main` in [#2495](https://github.com/lambdaclass/stabileo/pull/2495) ([SA-2026-111](../advisories/SA-2026-111-gravity-shared-deck-coverage.md)).
- [#2300](https://github.com/lambdaclass/stabileo/issues/2300) The torsion check can count longitudinal bars beyond their ends. Contained in [#2338](https://github.com/lambdaclass/stabileo/pull/2338).
- [#2301](https://github.com/lambdaclass/stabileo/issues/2301) The reported cage already retained its declared primary legs on main. [#2338](https://github.com/lambdaclass/stabileo/pull/2338) adds a translated refusal when a fixed cage needs more legs.
- [#2302](https://github.com/lambdaclass/stabileo/issues/2302) The seismic check can pass a dense stirrup zone that ends too early in the reopened beam line. Contained in [#2338](https://github.com/lambdaclass/stabileo/pull/2338).
- [#2304](https://github.com/lambdaclass/stabileo/issues/2304) Saving and reopening a 3D Y roller can change its label to Z while keeping the Y restraints, so a later edit can give a wrong reaction.

#### Other follow-ups

- [#2290](https://github.com/lambdaclass/stabileo/issues/2290) Speed up the generated-span plastic mechanism test within its existing time limit.
- [#2293](https://github.com/lambdaclass/stabileo/issues/2293) Check very thin gravity strips before rounding can erase them.
- [#2297](https://github.com/lambdaclass/stabileo/issues/2297) Keep the correct sum of repeated load-case factors at extreme magnitudes.
- [#2303](https://github.com/lambdaclass/stabileo/issues/2303) The steel Memoria test uses a smaller shed and keeps the report checks. Done in [#2305](https://github.com/lambdaclass/stabileo/pull/2305).

### Design and load audit: active work (2026-11-18)

An audit finding stays open until its correction or refusal is verified.
Wave 2 covers design dispatch, steel welds and Cb, detailing and EC2.

| Work | Issues | Status |
|---|---|---|
| Directional stirrup legs for secondary shear and torsion | [#2171](https://github.com/lambdaclass/stabileo/issues/2171) | shipped in [0.6.2](../releases/v0.6.2.md) |
| Gravity and floor-region force and moment, width-mode seismic area and combined diagram peaks | [#2199](https://github.com/lambdaclass/stabileo/issues/2199), [#2200](https://github.com/lambdaclass/stabileo/issues/2200), [#2201](https://github.com/lambdaclass/stabileo/issues/2201), [#2210](https://github.com/lambdaclass/stabileo/issues/2210), [#2269](https://github.com/lambdaclass/stabileo/issues/2269), [#2273](https://github.com/lambdaclass/stabileo/issues/2273) | done in [#2282](https://github.com/lambdaclass/stabileo/pull/2282) |
| Wind enclosure classification and physical pressure integration | [#2203](https://github.com/lambdaclass/stabileo/issues/2203), [#2204](https://github.com/lambdaclass/stabileo/issues/2204), [#2205](https://github.com/lambdaclass/stabileo/issues/2205), [#2206](https://github.com/lambdaclass/stabileo/issues/2206) | done in [#2220](https://github.com/lambdaclass/stabileo/pull/2220) |
| Narrow partial member loads and applied-load self-check | [#2222](https://github.com/lambdaclass/stabileo/issues/2222) | done in [#2223](https://github.com/lambdaclass/stabileo/pull/2223) |
| Ambiguous and unknown 3D supports | [#2276](https://github.com/lambdaclass/stabileo/issues/2276) | done in [#2277](https://github.com/lambdaclass/stabileo/pull/2277) |
| Flat-roof snow in companion combinations | [#2211](https://github.com/lambdaclass/stabileo/issues/2211) | done in [#2233](https://github.com/lambdaclass/stabileo/pull/2233) |
| Office concentrated live load | [#2207](https://github.com/lambdaclass/stabileo/issues/2207) | done in [#2236](https://github.com/lambdaclass/stabileo/pull/2236) |
| RC shear, torsion and seismic hoop verification | [#2296](https://github.com/lambdaclass/stabileo/issues/2296), [#2300](https://github.com/lambdaclass/stabileo/issues/2300), [#2301](https://github.com/lambdaclass/stabileo/issues/2301), [#2302](https://github.com/lambdaclass/stabileo/issues/2302), [#2309](https://github.com/lambdaclass/stabileo/issues/2309), [#2310](https://github.com/lambdaclass/stabileo/issues/2310) | contained in [#2338](https://github.com/lambdaclass/stabileo/pull/2338); see [SA-2026-091](../advisories/SA-2026-091-rc-torsion-shear-verification.md) |
| Visible under-audit notice for generated loads and concrete design | open audit findings below | on main in [#2228](https://github.com/lambdaclass/stabileo/pull/2228) |
| Release 0.6.2 | merged results changes (`SA-2026-069`–`085`, `088`–`090`) | shipped on 2026-11-18 ([v0.6.2](../releases/v0.6.2.md)) |
| Release 0.6.3: static/modal seismic, gravity & snow containment, drawn RC detailing, global axes, workbook & section shear (`SA-2026-086`, `087`, `091`–`099`) | [#2316](https://github.com/lambdaclass/stabileo/pull/2316), [#2338](https://github.com/lambdaclass/stabileo/pull/2338), [#2364](https://github.com/lambdaclass/stabileo/pull/2364), [#2395](https://github.com/lambdaclass/stabileo/pull/2395), [#2398](https://github.com/lambdaclass/stabileo/pull/2398), [#2404](https://github.com/lambdaclass/stabileo/pull/2404), [#2406](https://github.com/lambdaclass/stabileo/pull/2406) | shipped on 2026-11-20 ([v0.6.3](../releases/v0.6.3.md)) |
| Release 0.6.4: plate/wall–slab conformity, diagram extrema & span faces, RC torsion evidence, reversed member loads, planar couples & plate remesh (`SA-2026-100`–`107`) | [#2396](https://github.com/lambdaclass/stabileo/pull/2396), [#2403](https://github.com/lambdaclass/stabileo/pull/2403), [#2409](https://github.com/lambdaclass/stabileo/pull/2409), [#2433](https://github.com/lambdaclass/stabileo/pull/2433), [#2456](https://github.com/lambdaclass/stabileo/pull/2456), [#2466](https://github.com/lambdaclass/stabileo/pull/2466), [#2467](https://github.com/lambdaclass/stabileo/pull/2467) | shipped on 2026-11-21 ([v0.6.4](../releases/v0.6.4.md)) |
| Post-0.6.4 containment & accounting on `main` (`SA-2026-108`–`111`): pre-solve load & plate accounting, DXF support labels, solver JSON boundary, duplicate shared-deck gravity | [#2278](https://github.com/lambdaclass/stabileo/issues/2278), [#2284](https://github.com/lambdaclass/stabileo/issues/2284), [#2292](https://github.com/lambdaclass/stabileo/issues/2292), [#2299](https://github.com/lambdaclass/stabileo/issues/2299), [#2411](https://github.com/lambdaclass/stabileo/issues/2411), [#2459](https://github.com/lambdaclass/stabileo/issues/2459)–[#2461](https://github.com/lambdaclass/stabileo/issues/2461) | landed on main in [#2470](https://github.com/lambdaclass/stabileo/pull/2470), [#2494](https://github.com/lambdaclass/stabileo/pull/2494), [#2495](https://github.com/lambdaclass/stabileo/pull/2495), [#2496](https://github.com/lambdaclass/stabileo/pull/2496) (next release after 0.6.4) |

Wave 1 findings outside the initial 0.6.2 fix groups:

| Issue | Finding | Next |
|---|---|---|
| [#2202](https://github.com/lambdaclass/stabileo/issues/2202) | Flat-topped multiple ridges bypass the valley height cap | conservative; deferred behind unsafe results |
| [#2208](https://github.com/lambdaclass/stabileo/issues/2208) | Seismic force location follows the node centroid, not physical mass | closed (`0.6.3`, [#2316](https://github.com/lambdaclass/stabileo/pull/2316), [SA-2026-086](../advisories/SA-2026-086-seismic-static-story-forces.md); residual thin-band/torsion-carrier caveat in [v0.6.4](../releases/v0.6.4.md)) |
| [#2209](https://github.com/lambdaclass/stabileo/issues/2209) | Modal story forces depend on how the same mode is sampled by nodes | closed — generation refused in `0.6.3` ([#2316](https://github.com/lambdaclass/stabileo/pull/2316), [SA-2026-087](../advisories/SA-2026-087-seismic-modal-load-generation.md)) |
| [#2212](https://github.com/lambdaclass/stabileo/issues/2212) | Column fit checks array neighbours instead of physical neighbours | open; reproduce and fix or refuse |
| [#2213](https://github.com/lambdaclass/stabileo/issues/2213) | A different axial combination waives the failing ductility check | open; reproduce and fix or refuse |
| [#2214](https://github.com/lambdaclass/stabileo/issues/2214) | Stirrup spacing row ignores concurrent axial tension | addressed in `0.6.3` ([#2398](https://github.com/lambdaclass/stabileo/pull/2398), [SA-2026-098](../advisories/SA-2026-098-rc-drawn-reinforcement-verification.md)); issue open pending final closure |
| [#2215](https://github.com/lambdaclass/stabileo/issues/2215) | Shaped columns use more steel than the user supplied | open; reproduce and fix or refuse |
| [#2216](https://github.com/lambdaclass/stabileo/issues/2216) | Missing primary reinforcement is reported as a successful seismic member check | open; reproduce and fix or refuse |
| [#2217](https://github.com/lambdaclass/stabileo/issues/2217) | A layered end-bar input is omitted from the seismic hoop limit | addressed in `0.6.3` ([#2398](https://github.com/lambdaclass/stabileo/pull/2398), [SA-2026-098](../advisories/SA-2026-098-rc-drawn-reinforcement-verification.md)); issue open pending final closure |
| [#2218](https://github.com/lambdaclass/stabileo/issues/2218) | Step-drift transfer loses force and moment and changes with subdivision | contained in `0.6.3` ([#2406](https://github.com/lambdaclass/stabileo/pull/2406), [SA-2026-099](../advisories/SA-2026-099-gravity-and-roof-step-loads.md)); issue open for underlying transfer fix |
| [#2225](https://github.com/lambdaclass/stabileo/issues/2225) | CIRSOC torsion can silently pass insufficient secondary minimum reinforcement in a rectangular beam | addressed/contained in `0.6.4` ([#2433](https://github.com/lambdaclass/stabileo/pull/2433), [SA-2026-103](../advisories/SA-2026-103-rc-torsion-evidence.md)); issue open pending final closure |

Wave 2 findings, in the harm order of the audit issue map:

| Issue | Audit ID | Finding | Next |
|---|---|---|---|
| [#2238](https://github.com/lambdaclass/stabileo/issues/2238) | D1 | Reversed span pieces exchange top and bottom moment demands | addressed in `0.6.4` ([#2403](https://github.com/lambdaclass/stabileo/pull/2403), [SA-2026-102](../advisories/SA-2026-102-diagram-extrema-and-span-demands.md)); issue open pending final closure |
| [#2239](https://github.com/lambdaclass/stabileo/issues/2239) | T4 | Mixed column reinforcement becomes uniform smaller bars in detailing | addressed in `0.6.3` ([#2398](https://github.com/lambdaclass/stabileo/pull/2398), [SA-2026-098](../advisories/SA-2026-098-rc-drawn-reinforcement-verification.md)); issue open pending final closure |
| [#2240](https://github.com/lambdaclass/stabileo/issues/2240) | O2 | EC2 drops distinct concurrent force states with the same combination/station | open; reproduce and fix or refuse |
| [#2241](https://github.com/lambdaclass/stabileo/issues/2241) | D2 | A short extra bottom bar is credited outside its drawn extent | addressed/contained in `0.6.3` ([#2398](https://github.com/lambdaclass/stabileo/pull/2398), [SA-2026-098](../advisories/SA-2026-098-rc-drawn-reinforcement-verification.md)); issue open pending final closure |
| [#2242](https://github.com/lambdaclass/stabileo/issues/2242) | T2 | Joint shear becomes OK or disappears when the frame is rotated | open; reproduce and fix or refuse |
| [#2243](https://github.com/lambdaclass/stabileo/issues/2243) | S1 | Segmenting a continuous end-loaded weld removes its length reduction | done in [#2258](https://github.com/lambdaclass/stabileo/pull/2258) (`0.6.2`) |
| [#2244](https://github.com/lambdaclass/stabileo/issues/2244) | S2 | Short fillet welds retain an impermissibly large leg | done in [#2258](https://github.com/lambdaclass/stabileo/pull/2258) (`0.6.2`) |
| [#2245](https://github.com/lambdaclass/stabileo/issues/2245) | D3 | Weak stirrup intervals disappear in midpoint projection | addressed in `0.6.3` ([#2398](https://github.com/lambdaclass/stabileo/pull/2398), [SA-2026-098](../advisories/SA-2026-098-rc-drawn-reinforcement-verification.md)); issue open pending final closure |
| [#2246](https://github.com/lambdaclass/stabileo/issues/2246) | O1 | EC2 credits positive steel that does not reach the checked support region | open; reproduce and fix or refuse |
| [#2247](https://github.com/lambdaclass/stabileo/issues/2247) | S3 | Linear interpolation overstates Cb for an ordinary curved moment diagram | open; reproduce and fix or refuse |
| [#2248](https://github.com/lambdaclass/stabileo/issues/2248) | T1 | Final-geometry repair can issue another member's passing certificate | open; reproduce and fix or refuse |
| [#2249](https://github.com/lambdaclass/stabileo/issues/2249) | T3 | A station exactly at moment zero suppresses an inflection anchorage check | addressed in `0.6.3` ([#2398](https://github.com/lambdaclass/stabileo/pull/2398), [SA-2026-098](../advisories/SA-2026-098-rc-drawn-reinforcement-verification.md)); issue open pending final closure |

Follow-ups, with soundness work ahead of feature expansion:

- [#2224](https://github.com/lambdaclass/stabileo/issues/2224): Snow load on eccentric carriers has no distributed torque; member torsion depends on the planner's one-sided assumption.
- [#2226](https://github.com/lambdaclass/stabileo/issues/2226): Diagram evaluators drop a concentrated force or couple jump at stations within 1e-10 after the load (addressed in `0.6.4` [#2403](https://github.com/lambdaclass/stabileo/pull/2403) / `SA-2026-102`).
- [#2227](https://github.com/lambdaclass/stabileo/issues/2227): 3D fully restrained model: prescribed movement below 1e-15 gives member forces with zero reactions.

### Recent releases and landed milestones

Per [docs/roadmap/README.md](README.md#rules-for-these-documents), detailed landed history lives in
[CHANGELOG.md](../../CHANGELOG.md), release notes, and [docs/advisories/README.md](../advisories/README.md):

- **[v0.6.0](../releases/v0.6.0.md) (2026-11-13, `SA-2026-048`–`063`):** linear load-independent
  stability gate without artificial springs/shifts ([#1753](https://github.com/lambdaclass/stabileo/pull/1753)),
  original-pencil buckling ([#1939](https://github.com/lambdaclass/stabileo/pull/1939)), nonlinear
  physical equilibrium ([#1940](https://github.com/lambdaclass/stabileo/pull/1940)), staged orphan
  rotations & plastic conditioning ([#1943](https://github.com/lambdaclass/stabileo/pull/1943)),
  path-solver reactions ([#1952](https://github.com/lambdaclass/stabileo/pull/1952)), prescribed
  master motion ([#2009](https://github.com/lambdaclass/stabileo/pull/2009)), and zero-work released
  loads ([#2074](https://github.com/lambdaclass/stabileo/pull/2074)).
- **[v0.6.1](../releases/v0.6.1.md) (2026-11-15, `SA-2026-064`–`068`):** concurrent RC/steel
  demands & torsion stirrups ([#2080](https://github.com/lambdaclass/stabileo/pull/2080)) and
  roof-plane snow ([#2095](https://github.com/lambdaclass/stabileo/pull/2095)).
- **[v0.6.2](../releases/v0.6.2.md) (2026-11-18, `SA-2026-069`–`085`, `088`–`090`):** shared 2D/3D
  interior recovery ([#2170](https://github.com/lambdaclass/stabileo/pull/2170)), mandatory design
  completeness gate ([#2173](https://github.com/lambdaclass/stabileo/pull/2173)), wind/snow/gravity
  transfer fixes ([#2175](https://github.com/lambdaclass/stabileo/pull/2175),
  [#2197](https://github.com/lambdaclass/stabileo/pull/2197),
  [#2220](https://github.com/lambdaclass/stabileo/pull/2220),
  [#2282](https://github.com/lambdaclass/stabileo/pull/2282)), explicit 3D support restraints
  ([#2277](https://github.com/lambdaclass/stabileo/pull/2277)), testing consolidation phases 1–2
  ([#2165](https://github.com/lambdaclass/stabileo/pull/2165),
  [#2167](https://github.com/lambdaclass/stabileo/pull/2167)), and Hungarian locale
  ([#2099](https://github.com/lambdaclass/stabileo/pull/2099)).
- **[v0.6.3](../releases/v0.6.3.md) (2026-11-20, `SA-2026-086`, `087`, `091`–`099`):** static/modal
  seismic generation hardening, RC shear/torsion/drawn-reinforcement containment, gravity/snow
  ownership refusals, workbook validation, and Simplified Chinese ([#2360](https://github.com/lambdaclass/stabileo/pull/2360)).
- **[v0.6.4](../releases/v0.6.4.md) (2026-11-21, `SA-2026-100`–`107`):** PRO plate & wall–slab
  conformity ([#2409](https://github.com/lambdaclass/stabileo/pull/2409)), exact member diagram
  peaks & span faces ([#2403](https://github.com/lambdaclass/stabileo/pull/2403)), RC torsion
  evidence ([#2433](https://github.com/lambdaclass/stabileo/pull/2433)), reversed member loads,
  restored planar couples, and curved plate remeshing ([#2456](https://github.com/lambdaclass/stabileo/pull/2456),
  [#2466](https://github.com/lambdaclass/stabileo/pull/2466),
  [#2467](https://github.com/lambdaclass/stabileo/pull/2467)).
- **Landed on main since `0.6.4` (`SA-2026-108`–`111`, next release):** independent pre-solve load
  and physical plate-geometry accounting ([#2470](https://github.com/lambdaclass/stabileo/pull/2470)),
  DXF support label refusal ([#2494](https://github.com/lambdaclass/stabileo/pull/2494)), duplicate
  shared-deck gravity refusal ([#2495](https://github.com/lambdaclass/stabileo/pull/2495)), web
  solver JSON boundary validation ([#2496](https://github.com/lambdaclass/stabileo/pull/2496)), plus
  shared nonlinear drivers ([#2483](https://github.com/lambdaclass/stabileo/pull/2483)). Open
  follow-up issues from these fixes remain tracked in Priority now items 10 and 11 above.

> **Re-run guidance:** where an advisory affects generated area, roof, wind, snow, or seismic loads,
> **regenerate those loads before re-solving** — re-running stored loads alone is insufficient (see
> the "Your results may change" checklist in each release note and affected advisory).

### Open backlog and closures by cause

Historical snapshot retained from the November 11 update: **2026-11-11, 14:42 UTC**.
Source: `gh issue list --state all --limit 2000
--json number,title,state,closedAt,labels,url` (919 issues returned, below the limit).
The open column includes every open issue with that cause label. The closed column counts issues
closed from November 7 at 00:00 UTC through the snapshot, including duplicates and replay closures;
it does not count distinct engine fixes. Labels can overlap, so rows must not be summed.
Infra and other labels are outside this soundness table. Each cause links to its live open backlog.

| Cause | Open on November 11 | Closed since November 7 |
|---|---|---|
| [A](https://github.com/lambdaclass/stabileo/issues?q=is%3Aissue+is%3Aopen+label%3Acause%3AA). Failure becomes zero, a pass or a default; input ignored | 2 | 27 |
| [B](https://github.com/lambdaclass/stabileo/issues?q=is%3Aissue+is%3Aopen+label%3Acause%3AB). The test is wrong | 11 | 3 |
| [C](https://github.com/lambdaclass/stabileo/issues?q=is%3Aissue+is%3Aopen+label%3Acause%3AC). Absolute threshold where a scale-relative bound is needed | 65 | 21 |
| [D](https://github.com/lambdaclass/stabileo/issues?q=is%3Aissue+is%3Aopen+label%3Acause%3AD). Global-axis or plane assumption | 3 | 2 |
| [E](https://github.com/lambdaclass/stabileo/issues?q=is%3Aissue+is%3Aopen+label%3Acause%3AE). Duplicate paths diverge (2D/3D, prepared/regular, TS/Rust) | 7 | 12 |
| [F](https://github.com/lambdaclass/stabileo/issues?q=is%3Aissue+is%3Aopen+label%3Acause%3AF). Envelope or station sampling loses the governing value | 1 | 3 |
| [G](https://github.com/lambdaclass/stabileo/issues?q=is%3Aissue+is%3Aopen+label%3Acause%3AG). Containment misses a field or matches message text | 6 | 2 |
| [H](https://github.com/lambdaclass/stabileo/issues?q=is%3Aissue+is%3Aopen+label%3Acause%3AH). Missing term or formula departs from its reference | 15 | 7 |
| [harness](https://github.com/lambdaclass/stabileo/issues?q=is%3Aissue+is%3Aopen+label%3Acause%3Aharness). Comparison, metamorphic or fuzz harness | 25 | 190 |

The historical 108-candidate cohort came separately from `gh issue list --state open --label
wrong-result-candidate --limit 1000 --json number`. It is the replay inventory, not today’s open
count or the sum of cause rows. The live cause links include subsequent closures and new findings.

### In flight

- **Independent load and geometry accounting on every solve:** landed on `main` in [#2470](https://github.com/lambdaclass/stabileo/pull/2470); transformation-check and design-completeness follow-ups remain open below.

The open pull requests into main, apart from Dependabot updates, rewritten by `make roadmap.inflight`.

<!-- inflight:start -->
| PR | What | State |
|---|---|---|
| [#2508](https://github.com/lambdaclass/stabileo/pull/2508) | Roadmap: archive pre-v0.2.0 layers, update infra to Elixir/Caddy, sync v0.6.4 & precision fixes | ready |
| [#2505](https://github.com/lambdaclass/stabileo/pull/2505) | Research: every experiment validated, interactive and compared with its paper | ready |
| [#2492](https://github.com/lambdaclass/stabileo/pull/2492) | Games hub at /games, the diagram game at /games/diagram-game, and on in production | ready |
| [#2491](https://github.com/lambdaclass/stabileo/pull/2491) | Basic: user-defined materials, advanced functions grouped with a search, and tabs reachable on phones | ready |
| [#2408](https://github.com/lambdaclass/stabileo/pull/2408) | perf(design): reuse support anchorage plan for hook tails | ready |
| [#2350](https://github.com/lambdaclass/stabileo/pull/2350) | Fix plate remeshing growth and shared-edge connectivity | ready |
| [#2320](https://github.com/lambdaclass/stabileo/pull/2320) | Research: transient amplification of broken symmetry in elastic snap-through (Wang, …, Vella 2024) | ready |
| [#2315](https://github.com/lambdaclass/stabileo/pull/2315) | perf: reduce repeated work in nonlinear matrix kernels | ready |
| [#2312](https://github.com/lambdaclass/stabileo/pull/2312) | perf: stability check eigenvectors and 3D diagram drawing, with a diagram precision fix | ready |
| [#2281](https://github.com/lambdaclass/stabileo/pull/2281) | perf: cut repeated work in concrete design generation | ready |
| [#1928](https://github.com/lambdaclass/stabileo/pull/1928) | PRO: every shell a plate, and the physical model read by itself | ready |
| [#1927](https://github.com/lambdaclass/stabileo/pull/1927) | Education: parametric exercises, homework and timed exams; live calculation without blanking; Basic advisory and plastic fixes | ready |
| [#1698](https://github.com/lambdaclass/stabileo/pull/1698) | Verification dashboard: regenerated metrics | ready |
| [#2497](https://github.com/lambdaclass/stabileo/pull/2497) | Web Unit shard 8: design-families tests yield between design stages (\#2439) | draft |
| [#2465](https://github.com/lambdaclass/stabileo/pull/2465) | Seismic capacity checks withhold verdicts until demand is complete | draft |
| [#2434](https://github.com/lambdaclass/stabileo/pull/2434) | RC shear, seismic hoop and report checks refuse or correct unsupported verdicts | draft |
| [#2084](https://github.com/lambdaclass/stabileo/pull/2084) | Require verified, invariant public 3D plastic collapse factors | draft |
| [#2005](https://github.com/lambdaclass/stabileo/pull/2005) | Linear solves and the gravity load plan cost what they did in October again | draft |
| [#1781](https://github.com/lambdaclass/stabileo/pull/1781) | Design: unifying the 2D and 3D solvers (inventory, cost of 2D as 3D, plan) | draft |
<!-- inflight:end -->

Held dependent work remains behind soundness: reinforcement sheets
[#1929](https://github.com/lambdaclass/stabileo/pull/1929) depend on the plate work in
[#1928](https://github.com/lambdaclass/stabileo/pull/1928). The accounts integration
[#765](https://github.com/lambdaclass/stabileo/pull/765) and advertising measurement
[#1251](https://github.com/lambdaclass/stabileo/pull/1251) are integrated through
[#2099](https://github.com/lambdaclass/stabileo/pull/2099) with rollout disabled by default;
education [#1927](https://github.com/lambdaclass/stabileo/pull/1927) remains dependent work.

### Exit criteria

Every confirmed wrong result is corrected or refused with a clear reason and linked evidence.
Every fix has a failing parent reproducer, coverage of its reachable entry points, boundary cases
and a valid control. Replay and regression audit outcomes are recorded per issue; inconclusive
comparisons stay open. Results changes retain their registry entries and re-check notices.
The [containment ledger](../../testing/docs/CONTAINMENT.md) remains the per-defect record; a closed
issue count alone cannot establish safety.

## 3. Next

The soundness order in section 2 controls this backlog. Once those bugs and their regression
checks are complete, continue the structural refactors below, then other bugs and the deferred
product work. The plastic limit analysis has merged, but lifting the public 2D plastic refusal
remains separate work under [#758](https://github.com/lambdaclass/stabileo/issues/758).

### Older wrong-result findings (moved from section 5, 2026-11-15)

Found in reviews up to 2026-11-05 and kept as later work until 2026-11-15. Each needs an issue if it
has none; one that can give an unconservative answer is contained first (section 1), then fixed.
In order: no containment yet, then containment gaps and checks that can pass a wrong answer, then
input hardening.

- **MITC9 too stiff on twisted coarse meshes** (noted on [#1074](https://github.com/lambdaclass/stabileo/pull/1074)): no warning yet; add containment.
- **CIRSOC 201 `flexure_at`** deducts displaced concrete for top bars below the stress block (about
  0.03% unconservative; found by the [#534](https://github.com/lambdaclass/stabileo/issues/534) work). Issue to file, then fix.
- <a name="pro-design-follow-ups"></a>**3D design follow-ups for [#532](https://github.com/lambdaclass/stabileo/issues/532)**
  (outside [#1233](https://github.com/lambdaclass/stabileo/pull/1233)): the Excel import and the IFC
  mapper treat iz as the strong axis (fixed by [#1310](https://github.com/lambdaclass/stabileo/pull/1310), SA-2026-039, released in 0.5.0); aluminium weak-axis shear unchecked (fixed by [#1326](https://github.com/lambdaclass/stabileo/pull/1326), results version 16); the joint-typology check dropped Mz (fixed by [#1328](https://github.com/lambdaclass/stabileo/pull/1328), results version 17: weak-axis moments left unresolved); Muy not amplified
  for column slenderness. Review nits: the secondary-shear row lacks its combination name,
  `v_strong` serializes as "vy", "Shear G6" used for RHS (AISC G4), the registry's `when` also
  flags beam-only CIRSOC 201 models.
- **Eccentric slab torque on edge beams** ([#1401](https://github.com/lambdaclass/stabileo/issues/1401), option 1): apply the
  transverse first moment of one-sided slab area as a distributed torque. Distributed member loads carry
  no torque today (only point loads have `mx`), so this needs a new load component through the engine,
  and a results version. Patterned live load (checkerboards) makes interior beams one-sided too and is
  not in the advisory of [#1417](https://github.com/lambdaclass/stabileo/pull/1417).
- **[#1247](https://github.com/lambdaclass/stabileo/pull/1247) leftovers:** the static solve of the [#338](https://github.com/lambdaclass/stabileo/issues/338) model only warns (should refuse like modal);
  the dense eigensolver loses the zero mode of a 1 mm seesaw beside geometry 1e4 m away (issue to
  file); Newmark trapezoidal overshoot on massless DOFs when dt ≥ 2·a1 (documented in SA-2026-031,
  not fixed); Rayleigh damping (`damping.rs`) ignores modes with 0 < ω² ≤ 1e-10 (use modal.rs's
  scale-relative zero test); the app calls a free spin a mechanism; the Turkish term; [#1225](https://github.com/lambdaclass/stabileo/pull/1225)'s
  completeness message.
- **[#1246](https://github.com/lambdaclass/stabileo/pull/1246) leftovers:** a material with only `fc` reads as unknown (unreachable from the UI today);
  a material with no modulus is read as concrete; the oracle prints the uncapped CHS Q; Qa printed
  to 3 decimals.
- **ORPHAN-SOFT-ROTATION** ([#807](https://github.com/lambdaclass/stabileo/pull/807)): the warning covers only the prepared static paths; the other analyses need it too, until [#1367](https://github.com/lambdaclass/stabileo/issues/1367) is fixed.
- **Static self-check floor** ([#865](https://github.com/lambdaclass/stabileo/pull/865), found on [#1285](https://github.com/lambdaclass/stabileo/pull/1285)): `engine/src/solver/self_checks.rs` floors the
  balance force scale at 1 kN, so the imbalance is compared with 1e-3 × 1 kN: a load below
  1e-3 kN left fully unbalanced passes (applied 1e-4 kN, reactions 0, imbalance 1e-4 < 1e-3).
  Scale by max(|F|, |M|/L) with reaction moments and model extent; keep the pure-moment model
  (`prop_maxwell_betti`) as a regression and add that 1e-4 kN case as the one that must start
  failing.
- **Share links** ([#1058](https://github.com/lambdaclass/stabileo/pull/1058)): allow-list support types and spring values; refuse coincident or
  collinear shell corners; require positive e, a and thickness; `referencesResolve` in
  `share-snapshot.ts` must check that `factors` is an array; the stadium canopy keeps an unused
  earthquake case.

### Structural fixes: remove whole classes of wrong results (from [#1480](https://github.com/lambdaclass/stabileo/pull/1480), 2026-11-05)

An analysis of the month to 2026-11-05 (461 labelled issues, 129 fix PRs, advisories SA-2026-005 to
042, the [#807](https://github.com/lambdaclass/stabileo/pull/807) containment ledger, 190 review blockers) found eight recurring causes. Each
item below removes a cause instead of one more instance of it. Phase 1 started when
[#807](https://github.com/lambdaclass/stabileo/pull/807) landed (2026-11-05); items 3 and 5 will surface new findings, each fixed or contained like any other
wrong-result bug.

| Cause | Bugs (approx.) | Examples |
|---|---|---|
| A. A failure becomes 0, a pass or a default; an input is silently ignored | 22 | SA-2026-025, 026, 030, 011, [#443](https://github.com/lambdaclass/stabileo/issues/443), [#1326](https://github.com/lambdaclass/stabileo/pull/1326) |
| B. The test is wrong: references, loose tolerances, weakened asserts | 15 | [#845](https://github.com/lambdaclass/stabileo/issues/845), [#846](https://github.com/lambdaclass/stabileo/issues/846), [#810](https://github.com/lambdaclass/stabileo/issues/810), SA-2026-009 |
| C. An absolute threshold where a scale-relative one was needed | 10 | [#762](https://github.com/lambdaclass/stabileo/issues/762), [#1453](https://github.com/lambdaclass/stabileo/issues/1453), SA-2026-032, the [#807](https://github.com/lambdaclass/stabileo/pull/807) shell guard |
| D. Global-axis or X–Z plane assumptions | 11 | SA-2026-006, 036, 035, 029 |
| E. Duplicate 2D/3D, prepared/regular or Rust/TS paths that diverge | 14 | SA-2026-020, [#456](https://github.com/lambdaclass/stabileo/issues/456), SA-2026-027 |
| F. Envelopes or station sampling lose the governing value | 11 | SA-2026-027, 041, 023, [#1389](https://github.com/lambdaclass/stabileo/issues/1389), [#1396](https://github.com/lambdaclass/stabileo/pull/1396) |
| G. Containment misses a result field or matches message text | 7 | the [#807](https://github.com/lambdaclass/stabileo/pull/807) review: fullEnvelope, combinations over a refused case, NL-13 |
| H. A missing term or a formula that departs from its reference | 13 | SA-2026-007, 008, 012, 037 |

**Landed by 2026-11-08:** fail-closed numerics ([#1486](https://github.com/lambdaclass/stabileo/pull/1486); follow-ups [#1491](https://github.com/lambdaclass/stabileo/issues/1491)), the result walker
([#1487](https://github.com/lambdaclass/stabileo/pull/1487)), the benchmark gate (follow-ups in the regression audit of section 2), the invariance harness
([#1498](https://github.com/lambdaclass/stabileo/pull/1498), [#1501](https://github.com/lambdaclass/stabileo/pull/1501), [#1505](https://github.com/lambdaclass/stabileo/pull/1505), [#1512](https://github.com/lambdaclass/stabileo/pull/1512), [#1514](https://github.com/lambdaclass/stabileo/pull/1514)) and the first typed refusals
([#1527](https://github.com/lambdaclass/stabileo/pull/1527), [#1528](https://github.com/lambdaclass/stabileo/pull/1528), [#1545](https://github.com/lambdaclass/stabileo/pull/1545), [#1546](https://github.com/lambdaclass/stabileo/pull/1546)).

Ordered by what each item still prevents: ignored inputs and lost governing values first, then
the harnesses and refusals, then the landed items' follow-ups, then process. Planned phases
(2026-11-05): phase 1, from 2026-11-05 for about one week, is items 6, 7, 8, 10 and 11; phase 2,
about one week, items 3, 5 and 9; phase 3, about one week plus the fixes it finds, items 1 and 2;
item 4 runs alongside, 2 to 4 weeks.

1. No ignored inputs (A; M): every solver adapter destructures its input exhaustively, and a
   sensitivity test perturbs each field and expects a change or a structured refusal.
2. An envelope type (F; M): the extreme and its governing combination per component, interaction
   checks per combination, station extremes from exact roots. Gate: every envelope bounds every
   combination. Can change design results, so it takes a results version.
3. A required invariance and parity harness for every WASM solve entry point (C, D, E; M): scale and
   units, renumbering, member reversal, rotation and mirror, a 2D model in each of the three planes and
   embedded in 3D, prepared against regular; a fast tier per PR, the long tier nightly. A
   scale-relative tolerance type and a ratchet on bare `1e-N` comparisons. Every containment guard
   also gets a masking test: the error next to a term that inflates the guard's reference (load
   scale, a uniform part, rigid motion, thermal strain, a combination of opposing cases) must still
   be refused. The [#807](https://github.com/lambdaclass/stabileo/pull/807) shell guard needed five review rounds to find these one by one;
   the combined-field check is [#1478](https://github.com/lambdaclass/stabileo/issues/1478).
4. One implementation per analysis (E; L): the TS course solvers call WASM ([#392](https://github.com/lambdaclass/stabileo/issues/392)) and the remaining
    2D/3D twins share one kernel, the parity rows of item 3 guarding the move.
5. Typed refusals and diagnostics (G, C; M): solver errors carry a `DiagnosticCode`, not text
   (baseline on 2026-11-05: 464 function signatures outside tests return `Result<_, String>`, in 533
   lines of `engine/src`); the nightly classifier keys on codes; a lint forbids matching on message
   text ([#1527](https://github.com/lambdaclass/stabileo/pull/1527): 150 existing matches listed
   with a reason each, converted cluster by cluster, starting with the MD-ORTHOGONALITY containment
   keyed on the harmonic method's label).
6. Benchmark gate (B, H; S): no benchmark without a spec file, two independent references and a
   stated tolerance. The gate is on main; left: its two blind spots ([#1489](https://github.com/lambdaclass/stabileo/issues/1489)), the loose
   tolerances it exposed ([#1490](https://github.com/lambdaclass/stabileo/issues/1490)), second references for single-reference benchmarks
   ([#1481](https://github.com/lambdaclass/stabileo/issues/1481)) and an audit of the legacy benchmark files ([#1482](https://github.com/lambdaclass/stabileo/issues/1482)).
7. Fail-closed numerics (A; S; [#1486](https://github.com/lambdaclass/stabileo/pull/1486), follow-ups [#1491](https://github.com/lambdaclass/stabileo/issues/1491)): a checked demand/capacity ratio that cannot turn a non-positive
   capacity or a NaN into 0 or a pass, and no non-finite value crossing the WASM boundary. Gate: a
   lint against `else { 0.0 }` and `unwrap_or(0` in `engine/src/{design,certify,postprocess}`.
8. One result walker generated from the result types (G; S–M; [#1487](https://github.com/lambdaclass/stabileo/pull/1487)): Rust and TS walkers from one schema,
   containment applied at the WASM boundary, the store only displays. Gate: a test that injects a
   refusal at every field of every result type.
9. Web typecheck baseline from 247 errors to zero, so types can enforce the rest.
10. Process: every script test required; supply-chain advisories required only when a lockfile
   changes, otherwise a daily job opens the fix PR; issues close only through an explicit
   `Closes:` line (a check rejects other closing keywords); a label required for any diff that loosens
   a tolerance, adds an allow-list entry or weakens an assert; results versions assigned at merge
   ([#1431](https://github.com/lambdaclass/stabileo/pull/1431)); unit tests isolated and shuffled ([#1471](https://github.com/lambdaclass/stabileo/issues/1471)); one fix or one containment per
   pull request, never a batch like [#807](https://github.com/lambdaclass/stabileo/pull/807), whose every finding blocked all fifteen fixes and
   which main conflicted with three times; after about three review rounds only a finding that
   allows a wrong result, a security defect or a weakened safety test blocks; the rest go to a
   follow-up issue.
11. Cause tracking: every wrong-result issue gets a cause label (A to H) when it is triaged, and a
   monthly count shows whether new bugs still come from causes whose fix has landed. If they do,
   that fix is not working and is revisited.

## 4. Open bugs

### Wrong results

"Uncontained" means main can give the wrong result with no warning today; "warned" or "refused" names the
containment on main, which each per-defect fix removes. Release **0.6.4** is the release baseline. Section 2 tracks later work on main.
Rows are ordered uncontained first, then those whose containment is still to be checked, then warned or refused, then conservative. The priorities in section 2 come first; this is a curated list, while its cause links provide the complete live backlog.

| Issue | Defect | On main today | Containment | Fix |
|---|---|---|---|---|
| design and load audit | open findings from both waves: generated loads, concrete checks, design dispatch, steel welds and Cb, detailing and EC2 | open; individual containment must be established | general under-audit notice on main in [#2228](https://github.com/lambdaclass/stabileo/pull/2228) | active issue and PR map in section 2 |
| [#1510](https://github.com/lambdaclass/stabileo/issues/1510) | 3D thermal gradients use opposite sign conventions on y and z (direct API callers only; the app converts) | uncontained for API callers | [#1511](https://github.com/lambdaclass/stabileo/pull/1511) documents and tests each sign | one convention or a typed gradient |
| [#426](https://github.com/lambdaclass/stabileo/issues/426) | 3D co-rotational analysis adds rotation vectors, which is wrong for large non-coaxial rotations | check needed | — | confirm whether the app warns or refuses (section 2 item 9) |
| [#1503](https://github.com/lambdaclass/stabileo/issues/1503) | the La Bombonera showcase rotates six nodes 0.18 to 0.20 rad in linear analysis | — | — | decide whether the model or the analysis is wrong |
| [#742](https://github.com/lambdaclass/stabileo/issues/742) | fuzz `model_certify`: settlement-only 3D model fails the equilibrium oracle | — | — | likely the oracle's scale: retriage |
| [#810](https://github.com/lambdaclass/stabileo/issues/810) | MITC4 Scordelis–Lo roof plateaus 15 % stiff; pinched cylinder error grows | audited: test-model errors, not an engine regression | — | audited in [docs/audits/810-mitc4-curved-shells.md](../audits/810-mitc4-curved-shells.md): crown pin & corner symmetry fixed (roof plateau removed, cylinder converges); 6–16 mesh 2 % cylinder check remains explicitly ignored (issue open) |
| nightly | the open `nightly-finding` issues | — | — | the replay and regression audit in section 2 |
| [#1445](https://github.com/lambdaclass/stabileo/issues/1445) | 2D accepts a nodal moment on an artificial rotational DOF (3D refuses) | linear stability gate shipped in `0.6.0` | the ledger records the wrong results it would let through (#1367, #1437) as fixed by [#1428](https://github.com/lambdaclass/stabileo/pull/1428) | [#1753](https://github.com/lambdaclass/stabileo/pull/1753) (`SA-2026-054`, `0.6.0`); regression audit pending (issue open) |
| [#1496](https://github.com/lambdaclass/stabileo/issues/1496) | 3D: a rotation about 1e12 softer than another axis at the same node is locked by the orphan spring | fixed in `0.6.0` (issue closed) | artificial orphan springs removed | [#1753](https://github.com/lambdaclass/stabileo/pull/1753) (`SA-2026-054`, `0.6.0`); issue closed |
| [#458](https://github.com/lambdaclass/stabileo/issues/458) | 3D skew case: a rotation held by nothing about a skew axis still solves after rounding | linear stability gate shipped in `0.6.0`; replay pending | load-independent stability check | verify against [#1753](https://github.com/lambdaclass/stabileo/pull/1753) (`0.6.0`); the 2D case is fixed ([#1298](https://github.com/lambdaclass/stabileo/pull/1298)) |
| [#762](https://github.com/lambdaclass/stabileo/issues/762) | mechanism detection and accuracy change with units and orientation on near-singular models | linear gate shipped in `0.6.0`; replay pending | load-independent stability check | [#1753](https://github.com/lambdaclass/stabileo/pull/1753) (`SA-2026-054`, `0.6.0`); regression audit pending (issue open) |
| [#818](https://github.com/lambdaclass/stabileo/issues/818) | the dense reciprocal eigen-solve can report a buckling factor slightly high (0.05 %) | original-pencil factors shipped in `0.6.0`; original unresolved-compression witness still refuses | certificate bounds unchanged | [#1939](https://github.com/lambdaclass/stabileo/pull/1939) (`0.6.0`); issue open pending full closure |
| [#1553](https://github.com/lambdaclass/stabileo/issues/1553), [#1556](https://github.com/lambdaclass/stabileo/issues/1556) | second-order screen: the frame-level release and the follow-ups of the hold | warned | on main (LIN-SECOND-ORDER) | the regression audit in section 2 |
| [#758](https://github.com/lambdaclass/stabileo/issues/758) | 2D plastic collapse factor changes with numbering, direction and units (SA-2026-044) | refused | on main (PL-2D-INVARIANCE) | the limit analysis landed ([#1447](https://github.com/lambdaclass/stabileo/pull/1447)); the lift is in section 3 |
| [#798](https://github.com/lambdaclass/stabileo/issues/798) | MITC4 too stiff on distorted meshes under in-plane bending | warned | on main (SH-MITC4-DISTORTION) | membrane fix not started |
| [#1057](https://github.com/lambdaclass/stabileo/issues/1057) | MITC4 and MITC9 too flexible on warped geometry | refused | on main (SH-WARPED-MITC4/MITC9) | formulation fix not started |
| [#419](https://github.com/lambdaclass/stabileo/issues/419) | 3D connector axes are discontinuous and not user-orientable | warned | on main (SP-17) | not started |
| [#408](https://github.com/lambdaclass/stabileo/issues/408) | the warping DOF is shared by every member at a node | warned | on main (FR-5) | not started |
| [#370](https://github.com/lambdaclass/stabileo/issues/370) | known solver gaps (unconverged nonlinear increments and others) | warned | on main (NL-DYNAMIC-GAPS) | not started |
| [#428](https://github.com/lambdaclass/stabileo/issues/428) | material nonlinear is a whole-member secant, not plasticity | contained on main (NL-5 warn) | on main | not started |
| [#381](https://github.com/lambdaclass/stabileo/issues/381) | nonlinear and dynamic robustness programme | not a single defect | [#807](https://github.com/lambdaclass/stabileo/pull/807) records it as scope | — |
| [#1453](https://github.com/lambdaclass/stabileo/issues/1453) | 2D limit analysis loses redistribution when capacities differ by about 1e9 (conservative) | — | — | not started |

Closed issues and replay closures are counted in section 2. Previously listed fixed-but-open
clusters have largely closed; consult the live cause queries before assigning more replay work.
Open regression and containment follow-ups remain part of the audit, even when their base fix
has merged.

### Other bugs

- **Visible:** [#1429](https://github.com/lambdaclass/stabileo/issues/1429) (re-check notice Retry never recovers in Chromium), [#1468](https://github.com/lambdaclass/stabileo/issues/1468) (taps lost on a prerendered page
  until it hydrates), [#1403](https://github.com/lambdaclass/stabileo/issues/1403) (storey scope picks versus expansion copies).
- **CI and infrastructure:** the red nightlies of section 2, [#1375](https://github.com/lambdaclass/stabileo/issues/1375) (nightly verification), [#1377](https://github.com/lambdaclass/stabileo/issues/1377) (runner pools), [#983](https://github.com/lambdaclass/stabileo/issues/983)
  (`random-models`), [#1471](https://github.com/lambdaclass/stabileo/issues/1471) (flaky tests), [#1383](https://github.com/lambdaclass/stabileo/issues/1383) (record runner OOM kills), [#1466](https://github.com/lambdaclass/stabileo/issues/1466)
  (the engine release profile is ignored for the app WASM).
- **P2 from the triage:** #761 is done in [#1940](https://github.com/lambdaclass/stabileo/pull/1940). Remaining:
  [#743](https://github.com/lambdaclass/stabileo/issues/743) the 3D plastic certificate takes 8 s and 680 MB on 8 members; [#420](https://github.com/lambdaclass/stabileo/issues/420) fiber solvers return no
  reactions; [#607](https://github.com/lambdaclass/stabileo/issues/607) an E2E flake; [#608](https://github.com/lambdaclass/stabileo/issues/608) a 40 s rebar filter; [#454](https://github.com/lambdaclass/stabileo/issues/454) slow dense-LU fallback; [#453](https://github.com/lambdaclass/stabileo/issues/453)
  first-order convergence of solid-shell buckling; [#1080](https://github.com/lambdaclass/stabileo/issues/1080) localized AI errors; [#1451](https://github.com/lambdaclass/stabileo/issues/1451) research
  prefetch not aborted.

## 5. Later and parked

### Later: decided, not started

Each moves to section 2 or 3 when it starts.

**After Wave 0 soundness closure (section 2, including `SA-2026-056` and the MITC4/MITC9 shell formulation fixes [#798](https://github.com/lambdaclass/stabileo/issues/798), [#1057](https://github.com/lambdaclass/stabileo/issues/1057)), reprioritized in four post-soundness waves (Waves 1–4; full Waves 0–4 blueprint in [high_leverage_solver_and_product_plan.md](../research/high_leverage_solver_and_product_plan.md)):**

- **Wave 1 — Soundness-compounding foundations & engine multipliers:** land the Physical IR compiler, Executable Design-Code IR, constrained `PreparedStatic` factorization reuse + adjoint/Woodbury re-analysis, Load-Dependent Ritz + identical-substructure superelement caching, and the resident WASM memory arena (`simd128` + zero-copy Three.js buffers).
- **Wave 2 — Zero-switching-cost trust & distribution wedges:** ship offline browser-verifiable **Proof-Carrying Memorias** (`verify.stabileo.com`, [#499](https://github.com/lambdaclass/stabileo/issues/499), [#346](https://github.com/lambdaclass/stabileo/issues/346)), the public verification manual, **"Drop your ETABS/SAP2000/STAAD/OpenSees file" Certified Second-Opinion Audit** (local WASM, zero upload), ecosystem-first **`stabileo-mcp` + `pip install stabileo`** on the versioned engine interface ([#731](https://github.com/lambdaclass/stabileo/issues/731), [#351](https://github.com/lambdaclass/stabileo/issues/351)) with Visual Revision Diff and `Stabileo-Bench`, the **Inverse Design Canvas** (adjoint click-to-fix + live cost/CO₂/constructability rhythm HUD + live code-switch diff), and Latin American codes (NBR, NSR-10, NTC, NTE E.030/E.060, NCh next to CIRSOC) built on the Executable Design-Code IR with independent sign-off ([#450](https://github.com/lambdaclass/stabileo/issues/450)).
- **Wave 3 — High-ARPU category-expanding modules (reusing existing `engine/` primitives):** Sparse Conic Programming (SOCP) core for building-scale certified conic N–M–T limit analysis, automated Strut-and-Tie (CIRSOC 201/ACI 318 Ch. 23) and slab/masonry DLO; browser-native **CBFEM (steel connections) & CSFM (concrete detail)**; clash-free active **3D rebar routing → BVBS CNC export**; **CUFSM thin-walled buckling & 2D thermal FE fire rating** on `engine/src/section/`; unified **PT slab & staged bridge studio** (`prestress` + `creep_shrinkage` + `staged` + `MITC4`); **Prager–Synge equilibrated-flux guaranteed energy-norm bounds** ([#501](https://github.com/lambdaclass/stabileo/issues/501)) + dual-number force-based fiber nonlinearity.
- **Wave 4 — Ecosystem & top-of-funnel lock-in:** bi-directional **Parametric Script ↔ 3D Canvas** + locked Enterprise/Manufacturer Configurator Apps, the **Structural Intuition Lab & Seeded Professor Auto-Grader** (`diagram-game` + Education), and broader in-app AI assistant workflows ([AI_ROADMAP.md](AI_ROADMAP.md)): the AI is never the authority on a result.

**First vertical slices (effort & dependencies — full table in [high_leverage_solver_and_product_plan.md](../research/high_leverage_solver_and_product_plan.md#first-vertical-slices-execution-scope-effort--dependencies)):**
- *Quick wins (Effort S, days):* constrained `PreparedStatic` factorization reuse in `engine/src/solver/load_cases.rs` & `engine/src/load_session.rs` (`State2D`/`State3D::Constrained`), and determinism-gated `wasm-opt` + streaming WASM compile ([#1072](https://github.com/lambdaclass/stabileo/issues/1072), [#1466](https://github.com/lambdaclass/stabileo/issues/1466)).
- *Wave 1 vertical slices (Effort M–L, weeks–months):* Physical IR Slice 1 (one slab + opening + perimeter beams + gravity/wind load surface compiled purely in Rust, depending on the PRO plates re-land ([#1928](https://github.com/lambdaclass/stabileo/pull/1928), pending owner approval) plus [#2409](https://github.com/lambdaclass/stabileo/pull/2409) and [#2470](https://github.com/lambdaclass/stabileo/pull/2470)); Executable Design-Code IR Slice 1 (CIRSOC 201 rectangular beam flexure + shear authored once as a unit-typed AST under [#390](https://github.com/lambdaclass/stabileo/issues/390)); Adjoint + Woodbury interactive pilot on linear drift/moments + single-member `EI` drag.
- *Wave 2 vertical slices (Effort M, 2–4 weeks each):* `<150 KB` offline `verify.stabileo.com` WASM verifier + authenticated timestamped Ed25519 attestation & transparency log / per-firm PKI ([#499](https://github.com/lambdaclass/stabileo/issues/499), [#346](https://github.com/lambdaclass/stabileo/issues/346)); local stdio `stabileo-mcp` (review/audit/certify first) + frame-only `.s2k`/`.e2k` second-opinion audit ([#351](https://github.com/lambdaclass/stabileo/issues/351), [#731](https://github.com/lambdaclass/stabileo/issues/731)).
- *Issue tracking:* new Wave 1–4 items without an existing issue receive `roadmap:*` GitHub issues linked under tracker [#396](https://github.com/lambdaclass/stabileo/issues/396) as each slice opens.

**Release safety still open:** no raw i18n key visible ([#719](https://github.com/lambdaclass/stabileo/issues/719)), visual regression for exported
documents ([#722](https://github.com/lambdaclass/stabileo/issues/722)), the policy for outside contributions ([#726](https://github.com/lambdaclass/stabileo/issues/726)), safety advisories emailed once
accounts exist ([#727](https://github.com/lambdaclass/stabileo/issues/727)), old project files from real users ([#718](https://github.com/lambdaclass/stabileo/issues/718)), the CDN decision (Cloudflare
proxy and HTML edge caching with purge on deploy).

#### Deferred follow-ups (2026-11-05)

- **Edge beams under one-sided slab load** ([#1426](https://github.com/lambdaclass/stabileo/issues/1426)): one-sided stretches shorter than 1/200 of the member escaped the torsion warning; fixed by [#1457](https://github.com/lambdaclass/stabileo/pull/1457) (merged 2026-11-05, issue closed).

**Safety (its wrong-result items moved to section 3 on 2026-11-15)**

- **Report check integrity** (deferred blocker of [#1416](https://github.com/lambdaclass/stabileo/pull/1416)): a report rewritten in full and re-hashed still passes the check. It needs report signing or a server-side record of each report.
- **Re-check notices in German, French and Turkish** ([#1406](https://github.com/lambdaclass/stabileo/pull/1406), [#1409](https://github.com/lambdaclass/stabileo/pull/1409)): a native-speaker review of the texts.
- **[#1341](https://github.com/lambdaclass/stabileo/pull/1341) without a results version:** summing combination cases in a fixed order can move a
  combined force in its last digit and flip a marginal detailing decision, but no snapshot changed, so
  nothing was registered. Decide whether it needs a results version and a re-check notice.
- **#1255 statics verdict** (review): `statics-check.ts:65` reports "unbalanced" from a
  residual over incomplete load sums, so a balanced case with an omitted surface load can be flagged
  (a false alarm, never a false pass); return partial whenever loads are left out.
- **Fiber nonlinear with constraints** (#1296): compute the constraint multipliers so the
  equilibrium gate can check constrained models, then lift the refusal.
- **Wave B leftovers** ([#1285](https://github.com/lambdaclass/stabileo/pull/1285); visible refusals, not wrong results): `lanczos.rs` refuses a valid
  PSD pencil because `exactly_massless` tests a rounded vector exactly; `sturm_count_above` retries
  at only three fixed cutoffs, so clustered eigenvalues refuse; every-step finiteness of the
  internal u, v, a vectors in `time_integration.rs` ([#1239](https://github.com/lambdaclass/stabileo/pull/1239)'s owner).
- **[#798](https://github.com/lambdaclass/stabileo/issues/798):** narrow `SH-MITC4-DISTORTION`; it withholds hemisphere, hypar and spherical-cap meshes
  within 2% of their references (user, 2026-11-02: ship [#807](https://github.com/lambdaclass/stabileo/pull/807) as is).
- **[#458](https://github.com/lambdaclass/stabileo/issues/458) and [#762](https://github.com/lambdaclass/stabileo/issues/762):** near-mechanisms warn today; refuse versus warn is its own solver change. The replay against the linear stability gate is Priority now item 9.
- **[#1238](https://github.com/lambdaclass/stabileo/issues/1238) real fix:** carry each member's in-plane axis through the 3D→2D cut so default-oriented I
  columns in Y–Z cuts solve instead of being refused.
- **Issues to file for the record:** the shell envelope bug ([#1237](https://github.com/lambdaclass/stabileo/pull/1237)), the time-history NaN ([#1239](https://github.com/lambdaclass/stabileo/pull/1239)),
  the Frame3DD modal mismatch `modal3d-758065`.
- **Outside-review items not started** are tracked once in section 6 and [testing/ROADMAP.md](../../testing/ROADMAP.md): unknown wire fields, solver
  worker hangs and touch input (Platform, P1); the nonlinear equilibrium gate (P-Δ, contact [#432](https://github.com/lambdaclass/stabileo/issues/432),
  fiber [#433](https://github.com/lambdaclass/stabileo/issues/433), cable export dropping `converged`) and the [#458](https://github.com/lambdaclass/stabileo/issues/458) Lean gap ([testing/ROADMAP.md, Solver and proof depth](../../testing/ROADMAP.md#solver-and-proof-depth),
  P1); research crate lists (Release safety, P1); the TypeScript pre-solve in Rust ([testing/ROADMAP.md, Trust](../../testing/ROADMAP.md#trust-and-verification-backlog), P1); faster
  tests (Verified review: later).
- **`testing/docs/DASHBOARD.md` and `testing/docs/MATURITY.md`** are still frozen at 2026-10-19 (`v0.2.0`; open regeneration PR [#1698](https://github.com/lambdaclass/stabileo/pull/1698) not yet merged): regenerate and merge; the [#810](https://github.com/lambdaclass/stabileo/issues/810) audit is in `docs/audits/810-mitc4-curved-shells.md` and [#742](https://github.com/lambdaclass/stabileo/issues/742) retriage is Priority now item 9; close [#755](https://github.com/lambdaclass/stabileo/issues/755).

**Product**

- **P-Delta configurable fixed-iteration option in PRO:** to reproduce models from programs that stop after a fixed count, allow an explicit fixed iteration cap saved with the model while converged P-Delta remains the default and any unconverged result states so wherever it is shown.

- **Time-history input near 1.7e308 g** (#1285): the app shows the raw "Parse error: invalid type:
  null" instead of a translated refusal (a visible refusal, not a wrong result).
- **Blog:** a release post for Stabileo 0.4.0 (released 2026-10-28), like 0.3.0's.
- **Basic course:** each module PR's deferred should-fixes are in its body; #1070's last
  uncommitted round carries over only its wrong-result fixes.
- **[#1255](https://github.com/lambdaclass/stabileo/pull/1255) leftovers:** the report prints `0.00 %` for an unbalanced residual between about 1e-6 and
  5e-5; a plan-view member crossing the cut with both ends outside is drawn but not pickable;
  `StoreyScopeBar` lacks the bottom safe-area inset; similar storeys skip a zero-length copy
  silently; the English registry text says "blended".
- **[#1253](https://github.com/lambdaclass/stabileo/pull/1253) nits:** the "narrow band" note is 1/20 of the panel; strengthen the shallow-truss test;
  tie the self-weight split test to the production level map.
- **Wave A nits:** the Spanish paper title; the paper JSON-LD is not updated on in-app navigation.
- **Examples 4 to 7** (after [#1229](https://github.com/lambdaclass/stabileo/pull/1229)) and the engine work the other examples need.

**CI and infrastructure**

- **Nightly harness noise** (zero-displacement floor, time-history Lanczos tolerance, eigen-gap,
  warned plastic bounds inconclusive): in progress; #1299's same-model time-history budgets
  (2e-9 to 8e-9) can be dropped where both runs share the pencil. Issue closures wait for the user.
- **Vite build parse error:** es-module-lexer reads a minified `of` followed by `/` as a regex and
  fails the E2E build (hit on [#1070](https://github.com/lambdaclass/stabileo/pull/1070), worked around). Bump es-module-lexer or Vite, or add a guard.
- **Hosted-runner Nix flakiness:** Magic Nix Cache HTTP 418 and dropped cache.nixos.org downloads;
  move those jobs to self-hosted runners or add a substituter retry.
- **Runner pools and labels, the revert secrets ([#1226](https://github.com/lambdaclass/stabileo/pull/1226)), required proof checks ([#1235](https://github.com/lambdaclass/stabileo/pull/1235)), the
  mutants rotation ([#1240](https://github.com/lambdaclass/stabileo/pull/1240)), the [#768](https://github.com/lambdaclass/stabileo/pull/768) margin and agent hygiene:** tracked once in [testing/ROADMAP.md, CI and feedback
  loop](../../testing/ROADMAP.md#ci-and-feedback-loop-2026-11-04), items 1, 6 to 13 and 15.
- **Changelog fragments still missing** (list under "Verified review: later and housekeeping", section 6).

### Parked

Not worked on until sections 2 and 3 are done, unless the user says otherwise. Each keeps its text
in section 6 so nothing is lost.

- **Growth channels:** launches, weekly short videos, video and GIF export, embeds, plugins, the
  worked-problems library, public challenges ("Growth"). Growth multiplies whatever is there,
  including wrong results; it waits for engineer sign-off and the verification manual.
- **SEO beyond what has landed:** alternative-to pages and pricing copy ([#851](https://github.com/lambdaclass/stabileo/pull/851), [#850](https://github.com/lambdaclass/stabileo/pull/850); **Decision:**
  owner OK on the pricing claims), more languages, the landing AI text ([#1061](https://github.com/lambdaclass/stabileo/pull/1061); **Decision**). The
  landing copy ([#1230](https://github.com/lambdaclass/stabileo/pull/1230)) is ready and costs no engineering capacity: land it.
- **Tools past the eight live ones,** and examples gallery gaps 2, 3, 6, 7 and 8. The gallery
  itself ([#1229](https://github.com/lambdaclass/stabileo/pull/1229), then [#1300](https://github.com/lambdaclass/stabileo/pull/1300) and [#1308](https://github.com/lambdaclass/stabileo/pull/1308)) is ready and can land.
- **Research platform extras:** embeds, sweeps, gallery organisation, frozen versions ([#777](https://github.com/lambdaclass/stabileo/pull/777);
  **Decision:** host and DNS for `snapshots.stabileo.com`), one file per paper ([#844](https://github.com/lambdaclass/stabileo/pull/844)). New papers
  keep shipping breadth first, without engine or safety capacity.
- **Desktop app** ([#663](https://github.com/lambdaclass/stabileo/pull/663), [#785](https://github.com/lambdaclass/stabileo/pull/785); **Decision:** close [#785](https://github.com/lambdaclass/stabileo/pull/785) or keep it as tracking), the nonlinear
  framework drafts ([#609](https://github.com/lambdaclass/stabileo/pull/609), [#651](https://github.com/lambdaclass/stabileo/pull/651)), generated designs ([#536](https://github.com/lambdaclass/stabileo/pull/536)), the build-timelapse PoC ([#276](https://github.com/lambdaclass/stabileo/pull/276)).
- **AI with your own key** ([#1064](https://github.com/lambdaclass/stabileo/pull/1064)) and advertising measurement ([#1251](https://github.com/lambdaclass/stabileo/pull/1251)): no paid acquisition and no
  AI positioning before sign-off.
- **The rename's code and storage phases** ([#735](https://github.com/lambdaclass/stabileo/issues/735) phases 2 to 4): risk to users' saved data, no safety
  value; phase 1 (visible text) can go on.
- **More CI speed:** a PR and a merge-queue run take about 22 minutes; only reliability work continues.
- **Major dependency upgrades:** held in [#457](https://github.com/lambdaclass/stabileo/pull/457); the single-package Dependabot majors are duplicates of it.
- **Blog volume:** [#1293](https://github.com/lambdaclass/stabileo/pull/1293), [#1338](https://github.com/lambdaclass/stabileo/pull/1338), [#1430](https://github.com/lambdaclass/stabileo/pull/1430), [#1442](https://github.com/lambdaclass/stabileo/pull/1442) wait on the owner's wording.

## 6. Backlog by area

The product backlog, with exit criteria and metrics per area. Testing and verification
items live in [testing/ROADMAP.md](../../testing/ROADMAP.md), linked by area below. Every item links to its GitHub issue;
the tracker is [#396](https://github.com/lambdaclass/stabileo/issues/396).

> **Backlog conventions.** Areas are ordered by the ranking in section 2: soundness areas first, wrong results before nice-to-haves within each, then CI, performance and platform, then growth, SEO, Tools, examples, research and housekeeping. The verification sections end with **exit criteria** (when the section is done) and the **metrics** that track them. The metrics are computed by `scripts/verification-metrics.py` and published on the verification [dashboard](../../testing/docs/DASHBOARD.md) (current values and per-release history); a metric that cannot be measured yet says "not yet measured" there, never an estimate. Per-item verification levels are in [MATURITY.md](../../testing/docs/MATURITY.md). Entry point for all roadmap documents: [README.md](README.md).

### Prevention: fewer safety problems (2026-10-30)

See [testing/ROADMAP.md — Prevention: fewer safety problems (2026-10-30)](../../testing/ROADMAP.md#prevention-fewer-safety-problems-2026-10-30).

### Soundness multipliers

See [testing/ROADMAP.md — Soundness multipliers](../../testing/ROADMAP.md#soundness-multipliers).

### Trust and verification backlog

See [testing/ROADMAP.md — Trust and verification backlog](../../testing/ROADMAP.md#trust-and-verification-backlog).

### Solver and proof depth

See [testing/ROADMAP.md — Solver and proof depth](../../testing/ROADMAP.md#solver-and-proof-depth).

### Release safety

Pushes to main deploy straight to users, so a merge is a release.

1. **Contain first, fix second.** [#447](https://github.com/lambdaclass/stabileo/issues/447) Per-feature runtime switches (warn or refuse) that the app, the engine API and the MCP server check at solve and check time, so a known dangerous result is contained within hours of confirmation, before the fix is written or released. Every `safety` issue gets a containment step (switch set, or a recorded reason none is needed) before its fix; a switch can only make results more cautious than the bundled default.
2. **Safety advisories.** [#441](https://github.com/lambdaclass/stabileo/issues/441) When a released version produced a wrong or unconservative result, users are told through an advisory with the affected versions and features, how to tell if a model is affected, the fixed version and a workaround: [SAFETY_ADVISORIES.md](../SAFETY_ADVISORIES.md), drafts in [`docs/advisories/`](../advisories/), scoped in-app notices through the re-check registry (PR [#328](https://github.com/lambdaclass/stabileo/pull/328)).
3. **Users of saved projects are told what changed for their model** [#387](https://github.com/lambdaclass/stabileo/issues/387) (see the re-check prompt above), and stale results are marked until re-run.
4. **Postmortem per safety bug.** [#449](https://github.com/lambdaclass/stabileo/issues/449) Every `safety` defect that reached `main` gets a blameless postmortem in `docs/postmortems/`: timeline, root cause, why the tests, certificates, differential runs and reviews missed it, the new kind of test or check that now catches it, the variant analysis ([testing/ROADMAP.md, Trust item 2](../../testing/ROADMAP.md#trust-and-verification-backlog)), and its advisory, which is written from it.
5. **Steel results stay labelled experimental** [#389](https://github.com/lambdaclass/stabileo/issues/389) ("Proven bound", no pass styling) until an independent engineer has reviewed the CIRSOC 301 checks.
6. **Versioned releases with notes:** [#386](https://github.com/lambdaclass/stabileo/issues/386) every release has a version, release notes in English and Spanish, and a prominent "results may change" section listing result-affecting changes and who is affected.
7. **Staging before production:** [#385](https://github.com/lambdaclass/stabileo/issues/385) deploy main to a staging URL first; promote to production on a tagged release after the full suite, the acceptance suite and a smoke check pass.
8. **Dependency upgrades** [#388](https://github.com/lambdaclass/stabileo/issues/388) go through the same gates; major upgrades of numerics-related crates (e.g. exact arithmetic) must leave results bit-identical.

**From the verified review (2026-11-02), P1:**

- **Contain the lower-severity open defects too** (item 1, [#447](https://github.com/lambdaclass/stabileo/issues/447)): [#818](https://github.com/lambdaclass/stabileo/issues/818)
  original-pencil buckling recovery is now merged in [#1939](https://github.com/lambdaclass/stabileo/pull/1939); the original unresolved-compression witness still refuses (see section 2); [#456](https://github.com/lambdaclass/stabileo/issues/456) 3D buckling averages end
  forces (mostly false refusals); [#419](https://github.com/lambdaclass/stabileo/issues/419) 3D connector axes; [#408](https://github.com/lambdaclass/stabileo/issues/408) warping shared at a node
  with the UI silent; [#417](https://github.com/lambdaclass/stabileo/issues/417) cable in compression caught only in TypeScript.
- **Research crate lists drawn from `research/papers.yaml`:** `supply-chain.yml` skips
  pastrana-2026 and ferrari-sigmund-2025 (pastrana's WASM ships), and `vite.config.ts` checks only
  shauer.

**Exit criteria (Release safety).**
- Every release is tagged, has release notes in English, Spanish and Portuguese with a "results may change" section, and records a row on the [dashboard](../../testing/docs/DASHBOARD.md).
- 100 % of `safety` issues fixed in a release have a published advisory (or a recorded reason none is needed) within the timelines of SAFETY_ADVISORIES.md, and the in-app notice reaches the projects that use the affected feature.
- Releases are promoted from staging only after the full suite, the acceptance suite and a smoke check pass (item 7).
- No open `safety` defect older than 30 days without a fix PR or an in-app warning on the affected results.
- Containment (item 1): every `safety` defect has a containment state within 24 hours of confirmation; an e2e test flips a switch and checks that only the affected results are warned or refused.
- Postmortems (item 4): 100 % of `safety` defects fixed after it lands have a postmortem within 10 working days of the fix, each naming a new or extended automated check.

**Metrics** (on the [dashboard](../../testing/docs/DASHBOARD.md)): open `safety` issues (the label covers both defects and safety-relevant backlog items); safety advisories published (label `safety-advisory`); `roadmap:release-safety` issues closed; releases recorded in the dashboard history; time from confirmation to containment and postmortems written ("not yet measured" until items 1 and 4 land).

### Engineering coverage backlog

Places where Stabileo still computes something unverified, refuses something engineers need, or has two implementations of the same rule.

1. **Known solver gaps:** [#370](https://github.com/lambdaclass/stabileo/issues/370) material-nonlinear continues after an unconverged increment instead of returning the last converged state; co-rotational refuses prescribed displacements and thermal loads; 3D truss-only nodes inside frames are refused; harmonic refuses a response point on a constrained DOF; spectral analysis reports no shell stresses; beam lumped/consistent mass has no rotary inertia (an option for it, as Kratos and other codes include, matters for modal results of deep members; nodal masses and rotary inertia [#341](https://github.com/lambdaclass/stabileo/issues/341), PR [#399](https://github.com/lambdaclass/stabileo/pull/399)); the rigid diaphragm leaves each node's in-plane rotation free [#342](https://github.com/lambdaclass/stabileo/issues/342) (PR [#397](https://github.com/lambdaclass/stabileo/pull/397)). Open `safety` defects found by the verification work and being fixed now: inclined-member loads and member couples [#343](https://github.com/lambdaclass/stabileo/issues/343) (PR [#274](https://github.com/lambdaclass/stabileo/pull/274)), mirrored moments when a 2D model is solved in 3D [#435](https://github.com/lambdaclass/stabileo/issues/435) (PR [#436](https://github.com/lambdaclass/stabileo/pull/436)), SHB8 thickness locking [#400](https://github.com/lambdaclass/stabileo/issues/400) (PR [#401](https://github.com/lambdaclass/stabileo/pull/401)), missing torsional and flexural-torsional buckling [#404](https://github.com/lambdaclass/stabileo/issues/404) and spectral SRSS/CQC and participation [#405](https://github.com/lambdaclass/stabileo/issues/405) (PR [#434](https://github.com/lambdaclass/stabileo/pull/434)), modes dropped on a mechanism [#338](https://github.com/lambdaclass/stabileo/issues/338), the spectral certificate passing on non-finite results [#335](https://github.com/lambdaclass/stabileo/issues/335) (PR [#398](https://github.com/lambdaclass/stabileo/pull/398)). Each has a draft advisory in [`docs/advisories/`](../advisories/).
2. **One proven implementation: TypeScript calls the engine.** [#390](https://github.com/lambdaclass/stabileo/issues/390)–[#395](https://github.com/lambdaclass/stabileo/issues/395) (PR [#321](https://github.com/lambdaclass/stabileo/pull/321), PR [#402](https://github.com/lambdaclass/stabileo/pull/402)) Every engineering result comes from the Rust engine (certified where possible); TypeScript only formats, searches and draws, and keeps its old duplicates only as test oracles (`testing/docs/TS_ENGINE_LOGIC.md`). The design and load parts move first, as Priority now item 14. Remaining areas:
   - concrete: every CIRSOC 201 section shape (flanged, circular, capacity, interaction diagrams, `cirsoc-flex`), slabs (`losas.ts`), bar layouts and the legacy designer, which should size against the engine ([#390](https://github.com/lambdaclass/stabileo/issues/390));
   - steel inputs still computed in TypeScript and fed to the Rust checker: Cb (`moment-gradient.ts`), J/Cw/Z (`section-constants.ts`), unbraced lengths, torsional and flange buckling, material family, the effective net area from end connections ([#391](https://github.com/lambdaclass/stabileo/issues/391));
   - analysis duplicates: diagrams, station forces and design forces, combinations, spectral combination, moving loads, plastic collapse, direct analysis, prestress, rigid diaphragms, kinematic checks, shell load integration and stresses, torsion flow, warping, mass sources ([#392](https://github.com/lambdaclass/stabileo/issues/392));
   - footings (eccentricity, service vs factored loads, flexure) and load generation (wind, snow, seismic, combinations) in Rust ([#393](https://github.com/lambdaclass/stabileo/issues/393));
   - no silent fallbacks: when the engine is unavailable the app says so instead of computing in TypeScript ([#394](https://github.com/lambdaclass/stabileo/issues/394));
   - the teaching solvers (`steps/*`, `solver-detailed*`) are checked against the engine on every model they support ([#395](https://github.com/lambdaclass/stabileo/issues/395)).
3. **Missing design checks:** [#366](https://github.com/lambdaclass/stabileo/issues/366) RC biaxial bending, torsion and slenderness magnification (today not re-checked, and each result says so); CIRSOC 301 F.7–F.11 (boxes, tubes, tees, angles in flexure — refused today); angles in flexure; EC3 Class 1/2 plastic interaction (6.2.9.1); cantilever load-height Cb; beam flexure with axial force; the legacy CIRSOC 201 column verdict computed as compression when the member is in tension; CIRSOC 301 angle arrangements other than back to back (star, starred, single angles in other configurations).
4. **Mechanism detection everywhere:** [#369](https://github.com/lambdaclass/stabileo/issues/369) (PR [#331](https://github.com/lambdaclass/stabileo/pull/331)) the exact free-motion check in 2D and with constraints, connectors and inclined supports, and for local mechanisms, with zero false positives on the model corpus.
5. **Certificates still missing:** [#367](https://github.com/lambdaclass/stabileo/issues/367) large-displacement (co-rotational) and material-nonlinear results; masonry, connections, foundations and serviceability checks.
6. **A public-benchmark acceptance suite** [#371](https://github.com/lambdaclass/stabileo/issues/371) (PR [#337](https://github.com/lambdaclass/stabileo/pull/337)) (CSI and Dlubal verification examples using their independent references, the SAC buildings, FEMA P-695 archetypes) as a release gate.
7. **Published worked examples** [#368](https://github.com/lambdaclass/stabileo/issues/368) (PR [#333](https://github.com/lambdaclass/stabileo/pull/333)) for masonry, foundations, serviceability, timber and cold-formed steel, and published (not only hand-worked) examples for CIRSOC 301, AISC E7 and EC3 Class 4.
8. **Hardening what stays in TypeScript** [#374](https://github.com/lambdaclass/stabileo/issues/374) (search, detailing, drawing): property tests for detailing invariants (As provided ≥ As required, spacing and cover, no bar collisions, development lengths) and nightly Stryker mutation testing with surviving mutants triaged.
9. **Reports built from the design results:** [#373](https://github.com/lambdaclass/stabileo/issues/373) the PRO report's slab-steel section was removed because it invented its load, span and f'c; rebuild it from the slab design's own results.
10. **Example models that are still not realistic:** [#372](https://github.com/lambdaclass/stabileo/issues/372) the token live load in `la-bombonera`, cable-stayed bridge stays without pretension (large dead-load deflection), the suspension bridge example using oversized cable area (`A = 0.060 m²` workaround instead of realistic `A ≈ 0.020 m²` because linear analysis lacks cable-pretension geometric stiffness — revisit with 3D nonlinear pretension / catenary form-finding), and the offshore deck sag under the flare. Examples teach users; each should model what it claims to.
11. ~~**Nodal masses:** lumped masses at nodes (per direction, rotary inertia) and added line/area mass in the engine input, used by every dynamic analysis; the web's mass source sends them instead of copying materials.~~ Done (#341).
12. ~~**Rigid diaphragm rotates as one body:** each slave node's in-plane rotation equals the master's, as SAP2000/ETABS and OpenSees `rigidDiaphragm` (it was left free).~~ Done (#342).

**Exit criteria (Engineering coverage).**
- No engineering result is computed only in TypeScript: 0 TypeScript modules of class (b) or (c) rated high safety in [TS_ENGINE_LOGIC.md](../../testing/docs/TS_ENGINE_LOGIC.md), except the teaching solvers and test oracles, and 0 modules left unclassified.
- Feature matrix: 0 cells E / IGN / BAD / K (holds today and must keep holding), and every `~` cell (no independent reference) replaced by ✓ or R.
- Every implemented design check is **Benchmarked** or **Certified** in MATURITY.md, and the CIRSOC 201 and CIRSOC 301 checks have no "uncovered" clause in [DESIGN_EXAMPLES.md](../../testing/docs/DESIGN_EXAMPLES.md).
- The public-benchmark acceptance suite is a release gate and covers every analysis that is Certified or Benchmarked, with at least one real building per analysis family.
- TypeScript mutation score (Stryker, critical set) at least 90 %, with every survivor triaged.
- 0 open `safety` issues labelled `roadmap:coverage` or in item 1.

**Metrics** (on the [dashboard](../../testing/docs/DASHBOARD.md)): engineering logic in Rust (share of lines, from TS_ENGINE_LOGIC.md classes); TypeScript (b)+(c) modules rated high safety; feature-matrix cells by status; acceptance-suite cases and reference values; TypeScript mutation score; worked-example clause rows by status; `roadmap:coverage` issues closed.

### Multipliers

The Product Thesis orders what to build for firms to buy. This section ranks what would make the product an order of magnitude more useful, not incrementally better. Engineers spend most of their time modelling, iterating, reviewing and documenting, not waiting for a solver, so the multipliers are workflow, trust distribution and inverse-design physics. Each builds on verification: none is worth shipping on results that can be silently wrong. Re-ranked 2026-11-22 (full technical breakdown in [high_leverage_solver_and_product_plan.md](../research/high_leverage_solver_and_product_plan.md)).

1. **Proof-carrying Memorias & zero-trust verification portal (`verify.stabileo.com`).** [#346](https://github.com/lambdaclass/stabileo/issues/346), [#499](https://github.com/lambdaclass/stabileo/issues/499) Compile `certcheck` to a tiny offline browser WASM verifier (<150 KB) and embed a QR code + **signed** cryptographic proof bundle in every exported PDF/DOCX `Memoria de Cálculo`. Certified bounds are proved **solely by `certcheck` re-verifying the embedded proof bundle** (never by a signature alone); authorship and post-issuance tamper detection use either **per-firm PKI** keys or **authenticated timestamped digest attestation + mandatory append-only transparency log** (the browser canonicalizes the report + bundle excluding the QR/signature placeholder region and sends only its SHA-256 digest so NDA models stay zero-upload; the server signs `(signer_id, server_timestamp, key_id, canonical_digest)` and logs the entry so re-signing an edited report creates a visible second revision under that signer's identity rather than silently overwriting the original). Building authorities, peer checkers, banks and insurers drop a report into `verify.stabileo.com` **offline** to verify certified solver/plastic/combination bounds per [MATURITY.md](../../testing/docs/MATURITY.md) (with Lean-proved checker soundness where formalized, disclosing unformalized steps under [#500](https://github.com/lambdaclass/stabileo/issues/500) and [#503](https://github.com/lambdaclass/stabileo/issues/503)), cryptographic signature, signer identity, timestamp/transparency-log integrity, and advisory + key-revocation status against an embedded timestamped snapshot (explicitly marking current advisory and key-revocation status as snapshot-dated/unknown when offline, with an **optional online-only fetch** of the separate unauthenticated public advisory/revocation feeds that never uploads the report or model), plus interactive read-only 3D inspection with sensitivity sliders. Show a verification status on every result and check from the same maturity matrix ([#440](https://github.com/lambdaclass/stabileo/issues/440)).

2. **"Certified Second-Opinion Audit" for ETABS / SAP2000 / STAAD / OpenSees models (zero-switching-cost wedge).** Import `.e2k`, `.s2k`, `.std` and `.tcl` 100% locally in the browser (NDA client files never leave the engineer's machine; zero upload), run kinematic/mechanism detection, an independent certified static/modal/buckling solve (scoped to [MATURITY.md](../../testing/docs/MATURITY.md) Certified levels, disclosing any uncertified features), `review_model_sanity` (equilibrium, mass/m², period vs empirical code formula, soft-story and torsional irregularity) and a side-by-side comparison against the incumbent tool's reactions and drifts. Lets firms deploy Stabileo on billable QA immediately with zero rip-and-replace risk.

3. **Inverse Design Canvas — click-to-fix failing checks, constructability rhythm & live cost/CO₂ HUD.** [#347](https://github.com/lambdaclass/stabileo/issues/347) Powered by exact adjoint sensitivities and Woodbury low-rank re-analysis: click any failing limit state (drift, PMM, buckling, torsion, slab deflection) to light up every member by marginal efficiency (`∂failure / ∂$ or kg`, with subgradient/active-set handling at repeated eigenvalues or nonsmooth transitions) and offer concrete constructable fixes (cheapest, zero-architectural-impact, or rhythm-consolidated: "standardize to ≤ 4 beam profiles & ≤ 3 column sizes"). Pair with an always-visible live `steel t · concrete m³ · tCO₂e · unique sections` HUD and instant **Live Code-Switch Diff** (CIRSOC 201 ↔ ACI 318 ↔ EC2 on one model).

4. **Stabileo as the deterministic physics engine for every AI agent (`stabileo-mcp` + `pip install stabileo` + Visual Revision Diff + `Stabileo-Bench`).** [#351](https://github.com/lambdaclass/stabileo/issues/351), [#731](https://github.com/lambdaclass/stabileo/issues/731) Ship an open-source **local stdio MCP server** (100% local execution for NDA models; zero upload) plus an opt-in authenticated remote MCP tier, and a PyO3 native Python package backed by the Physical IR, sanity gates, code checks and certificates — with local `.ded` handoff or opt-in authenticated `stabileo.com/m/<id>` previews ([private by default](#shared-models-github--figma-for-structural-engineering)), 3D **Visual Revision Diff** (`.ded` / `.ifc` Rev A vs Rev B showing geometry, demand, BOM and newly failing checks), and **`Stabileo-Bench`**, the first deterministic structural-engineering LLM benchmark.

5. **Drawings / BIM → analytical model.** [#344](https://github.com/lambdaclass/stabileo/issues/344) Import IFC (then Revit via IFC, DWG, PDF plans) into the Physical IR and propose the analytical model: structural vs architectural elements, centrelines and surfaces snapped to grids, sections, supports, and loads from room uses (CIRSOC 101). Every inference is listed as an assumption the engineer accepts or fixes, never applied silently; the model sanity review then checks it. Modelling goes from days to minutes; the engineer judges assumptions instead of drafting lines.
   *Exists:* `web/src/lib/ifc/` (IFC parse and mapping), `web/src/lib/cad/` (DXF plan wizard, opt-in inferences recorded as assumptions), `web/src/lib/ai/` (`build-model`). *Missing:* one guided import → assumptions → sanity review → analyse flow, real-world idealisation (offsets, members that don't meet, walls with openings), loads from room uses, PDF/vision, and a measured corpus of architect files vs engineer-built models. Related: Interoperability in Phase 2, `sketch-to-model` in the AI roadmap.

6. **AI senior-engineer reviewer.** [#345](https://github.com/lambdaclass/stabileo/issues/345) Most real failures are conceptual (load path, ignored stiff elements, drift near the limit, a poor structural system), not arithmetic. A reviewer that reads model and results like a senior engineer scales that judgment to every project. Built on the model sanity review (reactions vs loads, weight per m², period vs code formula, tributary cross-checks, unit and plausibility checks). Related: `review-model`, `pre-solve-diagnostics` in the AI roadmap.

7. **Browser-native CBFEM (steel connections) & CSFM (concrete detail) — replacing separate $5k–$10k/yr connection tools.** Combine existing `spade` 2D meshing, elastoplastic `MITC4`/`DKT` shells, unilateral `contact.rs`, `constraints.rs` bolt/weld springs and `buckling.rs` so clicking any steel joint or RC D-region (deep beam, corbel, pile cap, wall opening) in the 3D model automatically imports all concurrent combinations and runs nonlinear plate/contact/buckling or Strut-and-Tie/CSFM verification in-browser.

8. **Clash-free 3D rebar routing → direct CNC machine export (BVBS) & model → permit pipeline.** [#350](https://github.com/lambdaclass/stabileo/issues/350) Turn `engine/src/collision_kernel.rs` into an active 3D rebar router resolving beam–column joint congestion, hook bends, lap splices and aggregate clearances automatically; export **BVBS (`.abs`)** directly for CNC rebar benders, IFC4 Rebar, mobile QR site inspection, BOM and an authority-ready calculation report from one model without re-entry.

9. **Executable Latin American & international codes done properly** [#349](https://github.com/lambdaclass/stabileo/issues/349) — CIRSOC, NSR-10, NTC, NCh, NBR, ACI/AISC and Eurocodes authored on the single **Executable Design-Code IR** (clause-level traceability, zero engine-vs-report drift, auto-certified interval checks, step-by-step KaTeX Memoria).

10. **Unified time-dependent PT slab & staged bridge studio + existing-building retrofit & forensic assessment.** [#348](https://github.com/lambdaclass/stabileo/issues/348) Couple `prestress.rs`, `creep_shrinkage.rs`, `staged.rs` (including shoring/reshoring staging and loaded-member removal redistribution) and `MITC4` slabs for browser-native post-tensioned slabs and staged bridges; add forensic retrofit assessment (measured field `f'c`/rebar/plumbness, original vs current code checks, CFRP/jacketing/bracing/wall retrofit comparison, portfolio risk prioritization).

11. **Thin-walled buckling (CUFSM / DSM) & 2D transient thermal FE fire certification (R30–R120).** Extend `engine/src/section/` (`mesh.rs` + `poisson.rs`) with Finite Strip Method signature buckling curves ($P_{crl}, P_{crd}, P_{cre}$) for cold-formed steel Direct Strength Method (AISI S100 / CIRSOC 303, <5 ms) and ISO 834 / EC1-1-2 2D transient heat transfer coupled to temperature-degraded section capacity for arbitrary RC, steel, composite and timber cross-sections (<50 ms).

12. **Bi-directional Parametric Script ↔ 3D Canvas, Enterprise/Manufacturer Configurator Apps & Structural Intuition Lab.** Sync every visual model with a readable parametric script (`@param` sliders) enabling locked enterprise typology apps (pipe racks, solar trackers, sheds, substations, crane runways, towers) and manufacturer-embedded certified product calculators tied directly to 3D model forces; expand `diagram-game` + Education into a mobile-first Structural Intuition Lab (qualitative $M/V/N$ diagram & deflected-shape sketching, mechanism-spotting challenges, and deterministic per-student seeded professor auto-grading).

13. **Collaboration & digital twin.** [#352](https://github.com/lambdaclass/stabileo/issues/352), [#353](https://github.com/lambdaclass/stabileo/issues/353) Versioned, branchable models, comments on members, engineer/checker approvals (CRDT collaboration with structural-aware merge semantics: e.g., never delete a node someone else is loading; adding a load to a member someone else is redesigning triggers review), and post-construction/post-earthquake sensor model updating ([`beyond_roadmap_opportunities.md`](../research/beyond_roadmap_opportunities.md) §10).

Order of work: 1–4 first (pull-based trust distribution, zero-switching-cost QA entry, inverse-design UX, agent/Python ecosystem), alongside 5–6 and 9 on the Physical IR / Executable Code IR foundations; then 7–8 and 10–11 (high-ARPU category expanders); then 12–13.

**Exit criteria (Multipliers).** A multiplier is done when it ships in a tagged release and meets its measurable target:

| # | Exit criterion |
|---|---|
| 1 | Every number in the PRO calculation report carries its verification level, signed QR/bundle provenance and timestamped advisory-snapshot status (plus optional online-only advisory refresh with zero model upload); `certcheck` runs offline in the browser (<150 KB WASM) and verifies all Certified analyses and design checks used by the report, or states which are not. |
| 2 | On a corpus of real `.e2k`/`.s2k`/`.std`/`.tcl` models, local in-browser import + certified second-opinion audit agrees with reference reactions and drifts within documented tolerances, flags seeded modelling defects, and uploads zero user model data. |
| 3 | Clicking a failing limit state highlights members by exact adjoint sensitivity verified against finite differences in CI; every candidate on the constructability Pareto front passes certified checks and reports cost, steel/concrete quantity, distinct section count and embodied carbon. |
| 4 | `stabileo-mcp` and `pip install stabileo` reproduce acceptance-suite cases end to end with identical verification levels and provenance; Visual Revision Diff catches 100 % of seeded geometry/demand regressions between Rev A and Rev B; `Stabileo-Bench` runs deterministically in CI. |
| 5 | On a corpus of at least 20 real architect files (IFC/DWG) with engineer-built reference models, the import matches at least 90 % of structural members and supports, every inference appears as an assumption the engineer accepted or fixed (0 applied silently), and the model sanity review passes on the accepted model. |
| 6 | On a corpus of seeded-error models (load path, ignored stiff elements, drift, unit mix-ups, period vs code formula), the reviewer flags at least 90 % of seeded errors with at most one false alarm per clean model; every finding cites the check that produced it. |
| 7 | CBFEM steel joints and CSFM/STM concrete D-regions match published experimental/reference benchmarks (EN 1993-1-8, AISC Design Guides, ACI 318/CIRSOC 201 Ch. 23) within stated tolerances and carry explicit refusal paths for out-of-scope geometry. |
| 8 | One model produces analysis, design, clash-free 3D rebar (0 unresolved collisions in `collision_kernel.rs`), BVBS CNC export, drawings, BOM and an authority-ready report with no re-entry, demonstrated on the acceptance-suite buildings. |
| 9 | Each supported Latin American and international code has a clause → AST → implementation → test → published-example map enforced in CI ([testing/ROADMAP.md, Trust item 3](../../testing/ROADMAP.md#trust-and-verification-backlog)) with zero engine-vs-Memoria drift and no clause without a test. |
| 10 | PT slab/staged bridge benchmarks reproduce published time-dependent/hyperstatic references; existing-building assessment against original and current codes with at least one retrofit option reproduces a published assessment case within its stated tolerance. |
| 11 | CUFSM signature buckling curves match published CUFSM / AISI S100 DSM benchmarks ($P_{crl}, P_{crd}, P_{cre}$) and 2D ISO 834 thermal FE fire ratings match published EC2/EC3 Annex benchmarks (R30–R120) within stated tolerances. |
| 12 | Bi-directional script ↔ canvas round-trips without loss on the example corpus; at least one locked parametric configurator app and one seeded university problem set run end to end on the production engine. |
| 13 | Versioned, branchable models with engineer/checker approval recorded in the report; sensor model updating reproduces a published identification benchmark (e.g. the ASCE SHM benchmark) within its tolerance. |

**Metrics.** Backlog issues closed per section (`roadmap:multiplier` count on the [dashboard](../../testing/docs/DASHBOARD.md)); per multiplier, the corpus measure in its row above, added to the dashboard when its corpus exists ("not yet measured" until then).

### CI and feedback loop (2026-11-04)

See [testing/ROADMAP.md — CI and feedback loop (2026-11-04)](../../testing/ROADMAP.md#ci-and-feedback-loop-2026-11-04).

### Solver performance and capability

Speed for the workflows engineers repeat, inverse-design primitives, and results that come with guaranteed accuracy. This section starts after the open unconservative `safety` issues are closed: a faster solver that is still wrong in places is the wrong order. Full architecture notes: [high_leverage_solver_and_product_plan.md](../research/high_leverage_solver_and_product_plan.md).

1. **Profile before optimizing.** A benchmark harness over the acceptance suite, the large examples and synthetic 10⁵–10⁶-DOF frame, shell and building models: time per phase (assembly, ordering, factorization, solve, post-processing, certificates), memory, and iteration counts, tracked per release on the verification dashboard. Every item below is chosen and measured against it.
2. **Constrained `PreparedStatic` + low-rank re-analysis instead of re-solving.** First close the immediate gap in `engine/src/solver/load_cases.rs` and `engine/src/load_session.rs` (`State2D`/`State3D::Constrained`) where any constraint (rigid diaphragm, rigid link, eccentric connection) bypasses factorization reuse and re-factors `Cᵀ K C` per load case. Then add Sherman–Morrison–Woodbury rank-k re-analysis *using* the cached supernodal Cholesky factor `L` with a small `k×k` capacitance solve (not mutating `L` in place) for sparsity-preserving local section/stiffness edits (`WhatIfPanel` interactive target on 50k-DOF buildings, falling back to fast augmented/re-factored solves when release or support edits change sparsity or `C`). Target: an edit-and-solve cycle 100–1000× faster than a full re-solve, with certificates covering the updated result.
3. **Differentiable solver (exact analytical & adjoint sensitivities).** On top of the already-factored `L`, compute exact derivatives with respect to every member and support parameter simultaneously: one adjoint back-solve (`K λ = ∂g/∂u`) for smooth linear static responses (drift, displacements, member forces, smooth utilization), eigenvector-only Rayleigh sensitivity for simple modal frequencies (`∂(ω²)/∂p_e = φᵀ(∂K − ω²∂M)φ`, no adjoint back-solve for mass-normalized `φ`), and eigenvector + one adjoint back-solve for simple buckling factors `λ_cr` (accounting for prestress-dependent `K_G(u)`), using subgradients / active-set sensitivities at repeated eigenvalues or nonsmooth branch/envelope switches. Powers the Inverse Design Canvas, zero-Monte-Carlo assumption sensitivity bounds (`#357`), and 5–15-iteration whole-building convex sizing (MMA / sequential conic). Gradients verified against finite differences in CI.
4. **Resident WASM memory arena + zero-copy Three.js buffers + deterministic WASM `simd128`.** Eliminate repeated full-model JSON string round-trips across JS↔WASM (`engine/src/lib.rs`) by keeping models, factors and results in a persistent WASM arena accepting delta mutations and exposing zero-copy `Float32Array` GPU views. Add deterministic `f64x2` `simd128` supernode panel kernels in `sparse_chol.rs` (fixed reduction order preserving cross-browser bitwise parity), streaming WASM compile + determinism-gated `wasm-opt` (`#1072`), and Web Worker parallelism for multi-case / optimization / background certification.
5. **Load-Dependent Ritz vectors (Wilson WYD) + automatic identical-substructure superelement caching.** Add Load-Dependent Ritz vectors alongside Lanczos (`lanczos.rs`) to reach >99% seismic/dynamic mass participation in 5–10 vectors with built-in missing-mass static correction (10–50× faster on shell-slab buildings; eliminates truncation failures like `SA-2026-043`/`058`). Automatically hash and condense repeated floors/bays once via `reduction.rs` (Craig–Bampton / Guyan superelements) with exact recovery, collapsing repetitive multi-story towers by 10–100× in DOF count.
6. **Sparse conic programming (SOCP) core (promoting Clarabel from `research/`).** Replace the 200-member dense LP in `plastic_limit.rs` with a sparse primal-dual LP/SOCP solver in `engine/`, unlocking: (a) path- and ordering-independent, 10,000+-member 2D/3D certified limit analysis with conic **N–My–Mz–V–T** interaction (exact for quadratic/ellipsoidal yield surfaces, bounded conic approximations otherwise) feeding both primal and dual witnesses straight into `PlasticSound.lean` (closing `SA-2026-044` / `SA-2026-014` structurally), (b) automated code-compliant **Strut-and-Tie Modeling** (CIRSOC 201 / ACI 318 Ch. 23, EC2 §6.5), and (c) **Discontinuity Layout Optimization (DLO)** for certified slab yield-line and masonry arch/vault collapse bounds.
7. **Guaranteed continuous energy-norm bounds (Prager–Synge equilibrated fluxes) + goal-oriented DWR adaptive meshing.** Upgrade `engine/src/postprocess/discretization/` from ZZ-SPR heuristics to local vertex-patch equilibrated-flux reconstruction giving a provable Prager–Synge upper bound (`‖e‖_E ≤ η`) on the continuous **energy-norm** error for conforming linear-elastic formulations where exact equilibrium holds (conforming plates, solids, and mixed-equilibrium formulations; formalizable in Lean; [#501](https://github.com/lambdaclass/stabileo/issues/501)), paired with Dual-Weighted Residual goal-oriented refinement toward a user error target (e.g. 1 %). **DWR indicators, ZZ-SPR, and non-conforming/variational-crime `MITC4`/`MITC9` estimators stay labelled as estimates (`certified: false`) unless an explicit variational-crime consistency residual bound is also proved.**
8. **Unified force-based fiber nonlinearity + `Dual<f64>` exact tangents + semi-smooth Newton NCP contact.** Replace displacement-only/secant nonlinear limitations (`#426–#433`) with 1-element-per-member Gauss–Lobatto force-based fiber beam-columns, exact SO(3) Lie-group kinematics, Rust generic-scalar `Dual<f64>` consistent tangents, and Augmented Lagrangian / semi-smooth Newton complementarity for unilateral contact and tension-only cables — enabling Newton–Kantorovich certification of nonlinear states ([#502](https://github.com/lambdaclass/stabileo/issues/502)).
9. **2D section-FE extensions (`engine/src/section/`): CUFSM thin-walled buckling & transient thermal FE fire.** Build Finite Strip Method signature buckling curves ($P_{crl}, P_{crd}, P_{cre}$) for cold-formed steel Direct Strength Method (<5 ms) and 2D ISO 834 transient thermal heat transfer + degraded-section fire resistance (R30–R120 in <50 ms) directly on the existing `spade` section mesh and Poisson solver.
10. **Stronger sparse direct / iterative / GPU stack & end-to-end shell certificates.** Supernodal/multifrontal Cholesky with nested-dissection ordering, AMG for >100k-DOF shells, selective WebGPU for batched postprocessing/topology/sweeps (CPU parity checked), end-to-end interval re-assembly certificates extended from frames (#403) to shells, plates and solids, and one deterministic Rust engine across browser, desktop (Tauri) and server.

### Platform and architecture backlog (2026-10-28)

From the desktop-app plan and its reviews: how Stabileo runs on more than the browser
without a second implementation of anything that computes a result.

1. **Desktop app** (Windows, macOS, Linux) with Tauri and the web's WASM engine; phases and install
   in `docs/desktop/README.md`. [#728](https://github.com/lambdaclass/stabileo/issues/728), PR [#663](https://github.com/lambdaclass/stabileo/pull/663)
2. **Accounts:** sign in once, never blocking a calculation; PRO entitlement verified offline; AI
   enforced per account; projects stay local; privacy policy (Ley 25.326, GDPR). [#729](https://github.com/lambdaclass/stabileo/issues/729)
3. **`.ded` as a long-term format:** schema, golden files per version, atomic saves with backup,
   crash recovery, newer files refused clearly by older versions. [#730](https://github.com/lambdaclass/stabileo/issues/730)
4. **Versioned engine interface and a CLI:** whole operations (solve and finish, design over
   demands) with job ids, progress, cancellation, structured refusals and provenance, the same for
   WASM, native or server. [#731](https://github.com/lambdaclass/stabileo/issues/731)
5. **Ownership map, then consolidation:** which implementation owns each code check and limit
   state; numerical rules move to Rust where they exist only in TypeScript or disagree. [#732](https://github.com/lambdaclass/stabileo/issues/732)

**From the verified review (2026-11-02), P1:**

- **Wire inputs refuse unknown fields, type by type** (audit plan K5): only `SolverElement3D` and
  the mass structs deny them today. Not a blanket change: the web sends `name` on `SolverSection`.
- **Solver worker hangs:** after init, a killed or out-of-memory worker leaves its jobs pending
  forever (no timeout, no respawn), and a worker is reused after a WASM trap. A hang, not a wrong
  result.
- **Touch:** cover the mobile results panel (`.mrp-*`, 22 px steppers) and tablets in the
  touch-density checks; compact stays the default (a documented decision).
- **Sitemap and research metadata:** research pages missing from the de/fr/tr sitemap, research
  JSON-LD and share cards: in PRs [#881](https://github.com/lambdaclass/stabileo/pull/881) and [#1066](https://github.com/lambdaclass/stabileo/pull/1066).

**Exit criteria.** The desktop app ships signed on three OSes with auto-update and results
identical to the web on the snapshot corpus (#716); every code check and limit state has one
authoritative implementation in the ownership map; `.ded` files from every release open (#718).

### Growth: shared models, tools and research (2026-10-29)

Several tracks exist to grow Stabileo faster, and they share infrastructure: **Stabileo Research**
(papers you can run), **Stabileo Tools** (free calculators that rank in search) and **shared models**
below. All three are "a public page in Stabileo's viewer with a path into the editor"; build them on
the same snapshot, viewer and prerendering pieces (#777 frozen versions, the research shell, the tools
page). Measure them together: visitors, editor opens, forks, sign-ups, retention.

#### Shared models: GitHub + Figma for structural engineering

Every model can have a URL (`stabileo.com/m/<id>`) where anyone, **without an account**, can inspect
the structure, explore loads, deformations and diagrams, and **fork** an independent copy. This turns
Stabileo from a tool used alone into a place where engineering work is shared.

1. **Already half there:** share links encode the whole model (tested by `share-link-fidelity`), the
   research pages do "view, then Open in Stabileo", and #777 builds immutable snapshots on a separate
   origin. Release 1 is mostly a short URL, storage and a public viewer page.
2. **Modes:** public, unlisted (anyone with the link: warn that it is effectively public), private
   (authorised users). **Private by default;** publishing is an explicit action; author and project
   metadata stripped unless the author chooses otherwise; revoking deletes the stored copy.
3. **Immutable revisions,** not live projects: `projects`, `model_revisions` (parent, model hash,
   engine version), `shares` (access policy, fork allowed, revoked), `forks` (source revision →
   destination project). PostgreSQL for metadata and permissions, object storage for models and result
   fields. Links can follow the latest revision or pin one; research and report links pin.
4. **Safety (not optional):** a snapshot records the engine version it was solved with; the viewer shows
   that version's known issues and refusals; when a later fix changes the result, the page says so with
   the new value and the advisory (the result-change registry and safety advisories, applied to shared
   models). Shared results are never presented as an approval of a real design.
5. **Releases:** (1) share — snapshot, public read-only route, viewer, permissions; (2) fork — independent
   project with source attribution, anonymous local experimentation, save after sign-in (registration
   only after the visitor has experienced value); (3) discovery — public gallery, examples, Open Graph
   previews, embeddable viewer. No Git-style merging; compare revisions instead.
6. **Later: public engineering challenges** (e.g. minimum-mass truss under stress and deflection
   constraints), clearly educational or research benchmarks, with submissions re-run by the server; needs
   sandboxed server-side compute.
7. **Prerequisites:** a long-term versioned `.ded` format (#730) and old files always opening (#718);
   moderation, abuse and rate limits, takedowns, storage costs, and model text treated as untrusted
   (XSS).

**Metrics:** shares per active engineer; unique visitors per shared model; viewer → fork rate; fork →
successful solve; new creators who share again; 4-week retention of fork-acquired users; and
reproducibility (opened snapshots whose recomputed results match the stored ones).

**Sequence:** after the Tools pilot and #777 land (they provide the snapshot and public-page pieces);
share and fork first, with the safety pieces from day one; discovery next; challenges once server
compute exists.

#### Worked-problems library (under Education)

Students search by problem type ("moment distribution example", "overhanging beam with point load"),
every semester. A library of **original** worked problems, each solved step by step by the hand method a
professor expects and then by Stabileo's engine, the two agreeing, with **Open in Stabileo** to change it.
Built on the Tools page (a tool with a fixed worked example), so it is one system with two entry points.

- **Where:** under the existing **Education** navbar item (no new item: the navbar is full), at
  `/<lang>/problems/<slug>/` (Spanish `problemas`), prerendered with structured data, in the sitemap.
  Tools link to related problems ("see it solved by moment distribution") and problems to their tool
  ("try your own numbers").
- **What:** about 40–60 problem types: determinate beams, trusses (joints, sections, zero-force
  members), frames and three-hinged arches, deflections (double integration, moment-area, conjugate
  beam, virtual work), indeterminate structures (force method, slope-deflection, moment distribution /
  Cross, stiffness method), influence lines and moving loads, Euler buckling and P-Δ, section
  properties.
- **First 10, Spanish and English:** moment distribution, slope-deflection, influence lines, virtual work
  deflections, method of sections; then measure and expand.
- **Sources:** our own problems; problems from openly licensed textbooks only where the licence allows
  (attribution, non-commercial and no-derivatives terms checked per book); the research classics.
  **Never** solutions to numbered problems from copyrighted textbooks (publishers own them, and it helps
  students cheat, which works against professors).

#### Video and GIF export, and short videos

- **Export video / GIF in the viewer** (app, research and tools): mode and buckling shapes, deformed
  shape under load, time history and moving loads, research replays. MP4 (WebCodecs), WebM
  (MediaRecorder), GIF; vertical, square and landscape presets; length, speed, caption; a small "Made
  with Stabileo" mark with a link, on by default (removable in PRO); an honesty overlay with the analysis
  type, engine version and any known-issue warning. All in the browser, frame-exact, no upload. Every
  exported video is a way in; with shared models it links to the model itself.
- **Short videos from recipes** (reusing the preview pipeline): a recipe says which page, which
  parameter changes and camera moves, and the captions; Playwright drives the real page and ffmpeg
  composes vertical and square videos with title and end cards. Always a real run on the live engine,
  silent with captions (no unlicensed music), linking to the page. One a week for LinkedIn and Shorts:
  first the beam turning into a truss, the crack through the plate, "check a beam in 20 seconds".

#### Fast-growth backlog (ranked)

1. **Launches:** Show HN / Product Hunt / LinkedIn when Research has 4–5 live papers and the Tools pilot is
   up, then one per new capability (Tools, sharing, the Python package).
2. **Weekly short videos** (above).
3. **Embeds wherever engineers ask questions:** a one-line live model for Eng-Tips, Engineering Stack
   Exchange, Reddit, blogs and course pages (comes with shared models).
4. **Plugins where engineers already work:** an Excel add-in first (on the Python package and API), then
   Grasshopper/Rhino.
5. **AI: sketch, plan or PDF → model:** the viral demo, only after the safety work (a confidently wrong
   model spreads as fast).
6. Cheaper multipliers: student competitions (steel bridge, concrete canoe), free "Stabileo basics"
   certificates with a LinkedIn badge, team invites and referrals ("ask a colleague to review this
   model"), Latin American engineering communities in Spanish and Portuguese.

### SEO and positioning (2026-10-29)

**Pricing principle (decided 2026-10-29):**
- the **core program** is free and open source for everyone;
- some **specialised modules** are paid; **universities get them free**;
- **Stabileo AI and heavy cloud compute** are paid by everyone, universities included, priced to cover
  what they cost.

Copy promises exactly this and nothing more (never "free in every case").

**Position:** *Stabileo — free, open-source structural analysis and design in your browser, with
machine-checked results; AI assistant coming.* Claims stay true: the AI assistant is "in development"
until it ships, so pages say "coming" and AI content covers what exists (verifiable AI-assisted
modelling plans, research on AI checks). AI becomes central in the messaging only when it works.

1. **Core searches with real pages** in English, Spanish and Portuguese (then de/fr/tr): "free
   structural analysis software", "open source structural analysis", "online structural analysis",
   "structural engineering software free", "FEA in the browser" ("software de cálculo estructural
   gratis", "análisis estructural online", "cálculo estrutural gratuito"): the landing page with one
   clear positioning sentence; one page per capability (analyses, design codes, reports, desktop) with a
   demo and its verification evidence; honest "free alternative to SAP2000 / ETABS / RFEM / Robot"
   pages that say what Stabileo does and does not do yet.
2. **Long tail** from Tools, worked problems, research papers and the public verification manual, all
   cross-linked to the core pages.
3. **Authority:** GitHub (stars, README), awesome-lists, the launches, links from universities and
   research groups (paper outreach) and professional councils; encyclopedia mentions only after
   independent coverage, never self-promotional editing.
4. **Technical:** prerendered pages with real content; structured data (`SoftwareApplication` with price
   0 and the licence, `ScholarlyArticle` / `citation_*` on research); hreflang in six languages;
   sitemaps; canonical links; Open Graph previews; speed (the app's Lighthouse 25 also costs rankings;
   see section 5, "Later"); Google Search Console to measure.
5. **One name:** finish the Dedaliano → Stabileo rename (#735), user-visible text first.

### Stabileo Tools: free engineering calculators (2026-11-01)

Engineers search for a calculation ("beam deflection calculator"), not for a platform. Each tool is a
real calculation on the production engine with a path into the full editor. Eight tools are live:
the pilot (PR [#838](https://github.com/lambdaclass/stabileo/pull/838)) and batch 2, carried by PR [#857](https://github.com/lambdaclass/stabileo/pull/857) (PR [#847](https://github.com/lambdaclass/stabileo/pull/847) closed).
Render tests in all locales are merged (PR [#877](https://github.com/lambdaclass/stabileo/pull/877)). Both batches completed round 1 with at
least one "not ready" verdict. Round 2 landed in PR [#900](https://github.com/lambdaclass/stabileo/pull/900): a validity guard (large displacement, engine vs
classical difference, slenderness; near-zero EI refused), mesh and sign-convention fixes, an influence-line
shear error of about 200% fixed, and the "First version · N review rounds" note removed from every tool;
the record stays in `research/tools/batches/VALIDATION.json`. The share-link importer change it needed
affects every share link in the app, so it is split into PR [#1058](https://github.com/lambdaclass/stabileo/pull/1058) (refuses malformed,
non-finite and dangling models) and gets two reviews as app code. Tools use the same first-version floor
and post-live review sequence as Research.

1. **One shared tool page,** `/tools/<slug>`, not 100 one-offs. Each has:
   - a real calculation on the production engine (WASM); where a textbook formula exists, the engine
     result and the closed-form value side by side, which doubles as verification;
   - the diagrams in Stabileo's viewer (deformed shape, moment, shear);
   - explicit assumptions, units and references (Timoshenko, Roark, code clauses) and a worked example
     with exact numbers that CI checks, so the page can never drift from the engine;
   - **Open in Stabileo:** the same model in the full editor, the conversion path;
   - code-dependent tools name the standard and edition (CIRSOC 201-2005, ACI 318-19, ...) and refuse
     what's out of scope; known-issue warnings and refusals show exactly as in the app.
2. **Built for search:** prerendered static HTML with real content; structured data (schema.org),
   canonical links, hreflang and a sitemap; six languages (en, es, pt, de, fr, tr) — Spanish and
   Portuguese are an opening (few good CIRSOC or NBR calculators exist); fast: a tool loads only what
   it needs, never the whole editor (the same "own page" architecture as Research); phone and tablet
   checks.
3. **Tools an AI can't do reliably come first.** A chatbot answers PL³/48EI instantly, so simple
   formula calculators are search entry points, not the reason to choose Stabileo. Most of the first 20
   are "solver-needed" tools, with diagrams in Stabileo's viewer, the engine checked against a hand
   method where one exists, and Open in Stabileo: continuous beams and frames with any supports and
   loads (indeterminate: where AI answers go wrong); influence lines and moving-load envelopes; natural
   frequencies, mode shapes and response spectrum; P-Δ and frame buckling with real end restraints;
   trusses and frames with many members (paste coordinates, solve); section properties of any shape
   (draw or import; I, J, warping, shear centre); plates and slabs; code checks with every number tied to
   its clause (CIRSOC 201/301, ACI, AISC), clearly scoped; load-combination generation and envelopes.
   The simple ones stay as the entry points.
4. **The first 20,** where the engine is strongest (verified or certified): beams (simply supported,
   cantilever, fixed-fixed, propped, continuous 2–4 spans, overhang: deflection, moment, shear,
   reactions); section properties (I, rectangular, circular, hollow, built-up); column buckling (Euler
   with effective lengths, P-Δ amplification); 2D truss and portal frame; natural frequency of beams and
   frames; influence lines and moving loads; concrete beam (CIRSOC 201 / ACI 318) and steel member check
   (AISC / CIRSOC 301) with their scope stated, steel kept "experimental" until independent review
   (#389). Later, by demand: plates, slabs, foundations, then other fields (piping, electrical, pressure
   vessels, fire protection). Not for now: connections and bearing capacity (the engine doesn't do them;
   a weak tool hurts trust).
5. **Research gets the same treatment:** Google Scholar `citation_*` tags, DOI and author markup, preview
   images and video on every paper page; the classic benchmark pages (MacNeal–Harder, Scordelis–Lo) are
   what engineers search for.
6. **Sequence:** fix review findings in the 8 live tools, then grow to the first 20; then
   measure in Google Search Console (impressions, clicks, editor opens per tool) before growing toward
   100.

**Safety:** these pages will be used for real decisions: every tool states its assumptions, runs only
analyses we've verified, shows the same known-issue warnings as the app, and labels a simplified check
as such, never as a full code check.

**Exit criteria.** 20 tools live in six languages, each with a CI-checked worked example and engine vs
formula agreement; Lighthouse performance ≥ 90 on tool pages; Search Console impressions and editor
opens measured per tool.

### Live examples gallery (2026-11-02)

A gallery of parametric examples at `/examples`: each a live model on the production engine with
sliders, the results redrawn as the parameters move, and **Open in Stabileo**. Tools answer one
calculation; examples show what a whole structure does. A feasibility study compared Stabileo with
the examples a parametric structural gallery needs; this section is what it found and what is left.

**Week 1 (in progress, separate branch):** `/examples` with 7 examples: frame playground, slab on
columns, earthquake time history, RC pushover, RC column drawings, outrigger sweep, tower modes and
buckling. PR [#1229](https://github.com/lambdaclass/stabileo/pull/1229) ships the first three (frame playground, slab on columns, earthquake
time history) and the `defineExample` contract; examples 4–7 (RC pushover, RC column drawings,
outrigger sweep, tower modes and buckling) follow on the same contract in PR [#1300](https://github.com/lambdaclass/stabileo/pull/1300) (RC column,
outrigger sweep, steel tower) and PR [#1308](https://github.com/lambdaclass/stabileo/pull/1308) (RC pushover with fibre sections), both stacked on #1229. The earthquake time-history example lands after PR [#1239](https://github.com/lambdaclass/stabileo/pull/1239), so a non-finite result is
refused there too.

**The 13 example types and where Stabileo stands:**

| # | Example type | State | What is missing |
|---|---|---|---|
| 1 | Frame playground (2D/3D frames, loads, diagrams) | have it | week 1 |
| 2 | Slab on columns (plates, deflection) | have it | week 1 |
| 3 | Earthquake time history | have it | week 1 |
| 4 | RC pushover | have it | week 1 |
| 5 | RC column drawings (section, reinforcement, detailing) | have it | week 1 |
| 6 | Parametric tower: outrigger sweep, modes and buckling | small gap | week 1 builds it by hand; structural generators (gap 9) |
| 7 | Timber member design | small gap | NDS only; Eurocode 5 (gap 4) |
| 8 | AI agent: IFC import → code check → report | small gap | IFC import and the BYO-key assistant exist; the example wiring (gap 5) |
| 9 | Floor vibration under walking (footfall) | missing | walking-load generator, plate time history (gap 2) |
| 10 | Membrane form-finding | missing | force density for surfaces (gap 3) |
| 11 | Slab yield-line analysis | missing | a new solver (gap 6) |
| 12 | Nonlinear shell buckling (imperfection-sensitive shells) | missing | corotational shells plus arc length (gap 7) |
| 13 | Mesh (OBJ) to member skeleton | missing | an import pipeline (gap 8) |

**Gaps, in order** (effort S = days, M = one to two weeks, L = a month or more):

| # | Item | Why | Effort | Depends on |
|---|---|---|---|---|
| 1 | **General parametric example API:** a `defineExample` contract (parameters with units and ranges, a model generator, the results to show, refusals), with the generators unified with the Tools `buildModel` (`web/src/components/tools/calculators.ts`) | One way to write an example, a tool or a worked problem; every later gap plugs into it instead of growing one-off pages | M | week 1 (extract the contract from its 7 examples) |
| 2 | **Footfall / walking-load generator** for floor vibration (pace frequency, harmonics, walker path), and plate time history with response factors | Floor vibration is a routine check for long-span and timber floors, and today has no load to drive it | M | 1; time history on plates verified against two references (modal superposition and direct integration) |
| 3 | **Membrane form-finding:** force density for surfaces (cable nets and membranes), building on the cable form-finding in `research/form-finding/pastrana-2026` | Tension structures are a showcase example and only cables exist today | M | 1; the Pastrana research crate promoted to the engine through the experimental path |
| 4 | **Eurocode 5 timber checks** next to the NDS checks in `engine/src/postprocess/timber_check.rs` (bending, compression with buckling, tension, shear, combined; kmod and service classes) | Timber outside the US is designed to EN 1995; NDS alone limits the timber example to one market | M | published worked examples for each check, signed off (#450) |
| 5 | **AI agent example:** IFC import → code check → report, driven by the bring-your-own-key assistant (PR [#1064](https://github.com/lambdaclass/stabileo/pull/1064)) | Shows the AI stage on real engine results: the assistant drives, the engine decides, the report cites clauses | S/M | #1064 and its error translation ([#1080](https://github.com/lambdaclass/stabileo/issues/1080)); IFC import (`web/src/lib/ifc/`) |
| 6 | **Slab yield-line analysis:** a new solver (mechanism search over candidate patterns, upper-bound check) | The standard way to check slab collapse; nothing in the engine does it | L | **safety-critical:** two reviews before main, published benchmarks (Johansen's patterns, textbook cases), experimental label until verified |
| 7 | **Nonlinear shell buckling:** corotational shells plus arc length. Today `engine/src/solver/corotational.rs` rejects every shell element and only linear (eigenvalue) shell buckling exists | Imperfection-sensitive shells (cylinders, domes) buckle far below the linear load, so a linear factor alone is unconservative there | L | **safety-critical:** two reviews before main, published benchmarks (hinged cylindrical panel, pinched hemisphere); #1057 and #798 fixed first |
| 8 | **OBJ / mesh to member skeleton import** (centrelines from a surface mesh, joints merged, sections assigned by the user) | Turns architects' massing models into analysis models. Low priority | L | 1; the refusals and checks of the other importers |
| 9 | **Outrigger and other structural generators** for parametric towers (core, outrigger and belt levels, bracing patterns, diagrids) | Week 1's tower is hand-built; generators make the sweep a real parameter study | S | 1 |

**Verification first, for every engine gap (2, 3, 4, 6, 7):** benchmarks with two independent
references that agree before they are admitted, a convergence study, the self-checks and invariance
tests of [testing/ROADMAP.md, “Prevention”](../../testing/ROADMAP.md#prevention-fewer-safety-problems-2026-10-30), and refusal paths for whatever is out of scope. Each ships labelled
experimental until it has all of them; an example never shows a number the engine could not check.
Never silently wrong.

**Sequence:** week 1, then gap 1 (the contract), then 9 and 5 (small, on existing engine features),
then 4, 2 and 3; 6 and 7 as safety-critical engine work after sections 2 and 3; 8 on demand.

### Stabileo Research (2026-11-04)

Published computational-mechanics papers turned into experiments anyone can run, change and check,
at stabileo.com/research, always in Stabileo's own viewer. Plan, rules and the ordered paper queue:
[research/DESIGN.md](../../research/DESIGN.md) and [research/CLAUDE.md](../../research/CLAUDE.md).

**Live and pending (2026-11-05).** Live: every paper and benchmark in the table below as a first
version, the eight Tools with their review fixes ([#900](https://github.com/lambdaclass/stabileo/pull/900)), the round-2 fixes of Andreassen ([#886](https://github.com/lambdaclass/stabileo/pull/886)) and
Mattiasson ([#890](https://github.com/lambdaclass/stabileo/pull/890)), no review-round note on any page ([#1320](https://github.com/lambdaclass/stabileo/pull/1320)), the round-2 fixes of the other papers and research SEO
([#1068](https://github.com/lambdaclass/stabileo/pull/1068), 17 PRs), research on phones and tablets ([#831](https://github.com/lambdaclass/stabileo/pull/831)) and the Shauer page split ([#1410](https://github.com/lambdaclass/stabileo/pull/1410)), all landed 2026-11-04.
Pending: Research and Tools faster on phones ([#1065](https://github.com/lambdaclass/stabileo/pull/1065)), frozen versions
([#777](https://github.com/lambdaclass/stabileo/pull/777), waits on DNS) and one file per paper ([#844](https://github.com/lambdaclass/stabileo/pull/844), last).

1. **Live in production:** Shauer 2025 fracture (PR [#769](https://github.com/lambdaclass/stabileo/pull/769)), Grossman & Boudaoud 2026
   (PR [#776](https://github.com/lambdaclass/stabileo/pull/776)), the catalogue (PR [#788](https://github.com/lambdaclass/stabileo/pull/788)), and Ferrari & Sigmund 2025
   (PR [#836](https://github.com/lambdaclass/stabileo/pull/836), viewer fix [#848](https://github.com/lambdaclass/stabileo/pull/848)) are merged.
2. **The wave is live:** PR [#857](https://github.com/lambdaclass/stabileo/pull/857) deployed on 2026-10-30. Its 14 papers and benchmarks
   are listed below. Engine benchmarks run on the production engine, with shared case files and honest
   results, including refusals under containment.
3. **Next:** gallery organisation, previews, Fehér 2026 and
   Ferrari & Sigmund 2020 in 3D.
4. **Platform:** frozen, citable versions under `/@<commit>/`, made only for research releases and
   stored once per file and served from their own origin, `snapshots.stabileo.com`, which needs DNS
   records before it can go live (PR [#777](https://github.com/lambdaclass/stabileo/pull/777)); a run-time
   line and preview images/videos; Research as its own page (no editor loaded); embeds; reproducing
   preprints as well as published versions where they differ (the phase-field page reproduces the SSRN
   preprint's iteration counts exactly with the author's code of that date); the
   paper's own figures overlaid on live runs; parameter sweeps in the browser.
5. **Gallery organisation** (as the catalogue grows past 40 papers): **Run it** first — only runnable
   experiments, big cards with a looping preview video, in a hand-set showcase order (newest and most
   impressive first); then **New research** (2020–2026, newest first) and **Classics** (oldest first, as
   a timeline of computational mechanics, where the engine-benchmark pages belong); topic chips and a
   status filter instead of more sections; every card keeps its evidence badge, so importance is never
   confused with verification.
6. **Ship first, review after:** papers and Tools go to production as first versions on a minimal
   floor: CI green, isolation, full web unit suite, and no phone overflow. Claims cover only what the
   tests check. Safety, engine and app changes need two reviews before main.
   **Decided 2026-10-31:** the site no longer shows review counts or a "First version · N review
   rounds" note (Tools in PR [#900](https://github.com/lambdaclass/stabileo/pull/900), Research per paper with `final_review: true`, PR [#902](https://github.com/lambdaclass/stabileo/pull/902));
   review records stay in `research/papers.yaml` and `research/tools/batches/VALIDATION.json`.
   Each research page is published only in the languages it actually has (PR [#988](https://github.com/lambdaclass/stabileo/pull/988)).
7. **Reviews:** round 1 is done for 16 items: the 14 wave pages and both Tools batches.
   Round 2 is done for every paper; its
   fixes are on `research/review-fixes-<id>` branches, one PR per paper, combined and tested together
   in `integration/research-round2` before main. Merged: Mattiasson (PR [#890](https://github.com/lambdaclass/stabileo/pull/890)) and Andreassen
   (PR [#886](https://github.com/lambdaclass/stabileo/pull/886)). Mattiasson's final review (round 3)
   is PR [#902](https://github.com/lambdaclass/stabileo/pull/902).

| Paper | Stage | Round-2 fixes | Open fixes |
|---|---|---|---|
| Andreassen 2011, topology optimisation (88 lines) | first version, live | merged, PR [#886](https://github.com/lambdaclass/stabileo/pull/886) (names its comparison: unmodified top88.m in GNU Octave) | Extensions and licence check |
| Shauer 2025, phase-field fracture | first version, live | PR [#884](https://github.com/lambdaclass/stabileo/pull/884), in integration (14 findings fixed; states what it is compared with) | Published figures need the supplementary data |
| Grossman & Boudaoud 2026, spring networks | first version, live | PR [#893](https://github.com/lambdaclass/stabileo/pull/893), in integration (21 findings; Fig. 5 compared; terminable worker and replay) | Strip-simulation protocol |
| Ferrari & Sigmund 2025 | first version, live | PR [#889](https://github.com/lambdaclass/stabileo/pull/889), in integration (pending badges and author questions off the page) | Koiter α and β; optimisation of the post-buckling response |
| Pastrana 2026 | first version, live | PR [#885](https://github.com/lambdaclass/stabileo/pull/885), in integration (author questions and "not accessible" off the page) | Adjoints, optimisation, shells and editor export |
| Zmyślony, Khan & Biggins 2026, arches | first version, live | PR [#891](https://github.com/lambdaclass/stabileo/pull/891), in integration (published check tightened 0.02 → 0.005) | Intrinsic curvature, continuation and authors’ data |
| Fairclough 2026 | first version, live | PR [#894](https://github.com/lambdaclass/stabileo/pull/894), in integration (author questions to the README) | Per-segment N ≈ σA check; larger examples and the full layout method |
| Mattiasson elastica | first version, live | merged, PR [#890](https://github.com/lambdaclass/stabileo/pull/890); final review PR [#902](https://github.com/lambdaclass/stabileo/pull/902) | Tip-moment and frame cases |
| MacNeal–Harder | first version, live | PR [#895](https://github.com/lambdaclass/stabileo/pull/895), in integration (signed comparisons; provenance of Table 3 stated) | Remaining cases; [#798](https://github.com/lambdaclass/stabileo/issues/798) withheld once #807 lands; twisted beam is [#1057](https://github.com/lambdaclass/stabileo/issues/1057) |
| Shell obstacle course | first version, live | corrected models merged (PR [#859](https://github.com/lambdaclass/stabileo/pull/859)) | Reference locators |
| Riks / Crisfield | first version, live | PR [#899](https://github.com/lambdaclass/stabileo/pull/899), in integration (false "limit reached" fixed; method benchmark) | More paper examples; shared case file under `engine/tests/benchmarks/` |
| Newmark 1959 | first version, live | PR [#896](https://github.com/lambdaclass/stabileo/pull/896), in integration (states its references: closed form and the native engine) | A printed example from the paper |
| CQC 1981 | first version, live | PR [#897](https://github.com/lambdaclass/stabileo/pull/897), in integration (says the paper's building is not used) | The paper's example values |
| Plastic collapse | first version, live | PR [#898](https://github.com/lambdaclass/stabileo/pull/898), in integration (unchecked Horne attribution removed) | Locate the source of the bounds |
| Navier plate | first version, live | PR [#901](https://github.com/lambdaclass/stabileo/pull/901), in integration (hard-support Reissner–Mindlin series replaces the MITC4 explanation) | None from round 2 |
| Lee frame 1968 | first version, live | PR [#986](https://github.com/lambdaclass/stabileo/pull/986), in integration (1.83 kN stated as a by-eye reading; convergence study) | A precise second reference for the limit load |
| DaDeppo arch 1975 | first version, live | PR [#987](https://github.com/lambdaclass/stabileo/pull/987), in integration (all three crown values vs Table 1 as quoted by Schmidt 2000) | Inspect the original 1975 table |

The shell obstacle course's [#810](https://github.com/lambdaclass/stabileo/issues/810) was a test-model error: crown pin and corner symmetry.
PR [#859](https://github.com/lambdaclass/stabileo/pull/859) corrected the live page (merged 2026-10-30). Research SEO (PR [#988](https://github.com/lambdaclass/stabileo/pull/988), open, merged into the
integration branch): per-page languages, agreeing hreflang and sitemap, localized titles, `ScholarlyArticle`
metadata with the original DOI. Under containment (PR [#807](https://github.com/lambdaclass/stabileo/pull/807)),
the distorted MacNeal–Harder cases say "withheld by the engine (known issue #798)".
Permanent phone/tablet e2e checks: [#831](https://github.com/lambdaclass/stabileo/issues/831).

**Still to fix in the paper implementations:** review fixes first, then the missing parts below.

- **Every first version:** land its round-2 fixes through `integration/research-round2`; run its
  browser and phone/tablet checks on the live page; record each review in `research/papers.yaml`;
  mark a paper `final_review: true` after its final round.
- **Topology optimisation (88 lines):** the paper's extensions (other loads and supports, passive
  elements, multiple load cases, Heaviside filter); clear the licence of `top88.m` (reference only now).
- **Pastrana 2026:** the paper's main contribution (differentiable form-finding with adjoints and
  optimisation), shells, the published optimised results; the editor export without cable prestress.
- **Ferrari & Sigmund 2025:** the Koiter coefficients α and β are not reproduced (questions to the
  authors); then the optimisation of the post-buckling response.
- **Snapping arches (Biggins 2026):** intrinsic curvature, continuation from the formed state, the
  authors' data.
- **Fairclough 2026:** verify the first version; larger examples and the full layout method.
- **Mattiasson elastica:** the tip-moment case (full circle) and the frame problems.
- **Riks / Crisfield:** land PR [#899](https://github.com/lambdaclass/stabileo/pull/899); more paper examples; move the shared case file under `engine/tests/benchmarks/`.
- **MacNeal–Harder:** the remaining problems (curved beam, plates, shells, thick cylinder); verify the
  numerical table against the paper scan; the MITC4 failures (#798) and the warped MITC4/MITC9 finding
  (#1057), which the twisted-beam case must show as refused or warned once contained.
- **Shell obstacle course:** page and table locators for every reference.
- **Phase-field fracture:** the published figures need the article's supplementary data; record the
  preprint reproduction on the page.
- **Spring networks:** the strip-simulation protocol; the questions to the authors are in the README.

Review records are kept in `research/papers.yaml` (`reviews:`, `final_review:`); the site no longer
shows the counts. First versions use the minimal floor above. Review findings become small follow-up fixes; every
claim stays true, isolation holds, editor data stays safe, and CI stays green.

**Exit criteria.** Each experiment's page claims only what its committed validation checks; the
engine-benchmark pages run in required CI and match the native tests; at least one paper's authors
have reviewed their page.

### Growth and housekeeping (2026-10-28)

1. **Real users and independent validation:** a beta-tester program, the outreach to engineers and
   professors, and an independent structural engineer signing off worked examples. [#733](https://github.com/lambdaclass/stabileo/issues/733)
2. **Website and app speed:** Lighthouse 52 (landing), 35 (blog), 25 (app) on 2026-10-23; start
   with loading only the active language (about −2 MB). [#734](https://github.com/lambdaclass/stabileo/issues/734)
3. **Rename Dedaliano to Stabileo everywhere, in phases, tests first** [#735](https://github.com/lambdaclass/stabileo/issues/735).
   About 2,700 references in 926 files on 2026-10-29: mostly mechanical (771 engine test files import
   the crate as `dedaliano_engine`), but some carry users' data (autosave and settings keys in browser
   storage, the `.ded` project format, share links), where a careless rename loses saved projects.
   - **Phase 0, tests before anything is renamed:**
     - an inventory test that lists every remaining `dedaliano` (case-insensitive), with an allowlist
       that may only shrink;
     - compatibility tests: `.ded` files from every release open and give the same results (#718),
       old browser-storage keys and IndexedDB data migrate, old share links still open, old desktop
       sessions restore;
     - the results snapshot corpus, determinism and the full test suites as the "nothing changed" guard.
   - **Phase 1, everything users see:** UI text, site, docs, emails, release notes, package
     descriptions.
   - **Phase 2, code identifiers:** the Rust crate (`dedaliano-engine` → `stabileo-engine`, every
     `use`), the WASM glue (`dedaliano_engine.js` / `_bg.wasm`), npm and research crates, fuzz targets and
     benches, CI paths. Results must stay bit-identical.
   - **Phase 3, stored names:** new storage keys and database names with migrations; the readers for the
     old names stay forever, and `.ded` keeps opening (the extension may remain as the project format).
   - **Phase 4, keep it done:** a CI check forbids new `dedaliano` outside the compatibility allowlist.
   Each phase is its own PR, reviewed twice, merged only when the guard tests from phase 0 are green.

### Verified review: later and housekeeping (2026-11-02)

From the same verified review. **Later (P2):**

- Split `App.svelte` (4,326 lines) into mode shells; move the 136 `#[wasm_bindgen]` wrappers out of
  `lib.rs`.
- PCG factors K fully first (performance only, opt-in path).
- String discriminants to serde enums; TypeScript types generated from Rust.
- Sheet detents and double-tap, a touch loupe for snapping, tool permalinks and embeds.
- Faster build tests (5 production builds, not 3; the 800 ms prerender wait).
- AI backend: run `sanity::review_json` and a mechanism check when it builds a model.
- An animated mechanism mode for "why did this fail" (mechanism nodes are already reported).
- Serviceability certificates ([#367](https://github.com/lambdaclass/stabileo/issues/367)); Rust ports of direct analysis and Wood–Armer ([#392](https://github.com/lambdaclass/stabileo/issues/392)).
- Already planned, unchanged: BundleCheck in the browser ([#499](https://github.com/lambdaclass/stabileo/issues/499)), parametric models
  ([#347](https://github.com/lambdaclass/stabileo/issues/347), [#357](https://github.com/lambdaclass/stabileo/issues/357)), CLI and MCP ([#351](https://github.com/lambdaclass/stabileo/issues/351), [#731](https://github.com/lambdaclass/stabileo/issues/731)), steel and RC tools (Tools item 4).

**Housekeeping:**
- **Regenerate `testing/docs/DASHBOARD.md` and `testing/docs/MATURITY.md`:** both are still frozen at
  **2026-10-19 (`v0.2.0`)** (open regeneration PR [#1698](https://github.com/lambdaclass/stabileo/pull/1698)
  has not merged yet), so their open-issue columns still list closed issues (#427, #416, #459) and
  lag `v0.6.4` until regenerated.
- **Close the superseded pull requests:** [#1227](https://github.com/lambdaclass/stabileo/pull/1227) (three of its four parts landed; [#1224](https://github.com/lambdaclass/stabileo/pull/1224) lands
  alone), [#1231](https://github.com/lambdaclass/stabileo/pull/1231) and [#1244](https://github.com/lambdaclass/stabileo/pull/1244) (roadmap drafts superseded by [#1384](https://github.com/lambdaclass/stabileo/pull/1384)), [#882](https://github.com/lambdaclass/stabileo/pull/882) (carried by [#1293](https://github.com/lambdaclass/stabileo/pull/1293)).
- **Dependencies:** num-bigint 0.5 is five PRs for one bump ([#313](https://github.com/lambdaclass/stabileo/pull/313), [#819](https://github.com/lambdaclass/stabileo/pull/819), [#820](https://github.com/lambdaclass/stabileo/pull/820), [#828](https://github.com/lambdaclass/stabileo/pull/828),
  [#829](https://github.com/lambdaclass/stabileo/pull/829)) and waits on num-rational 0.4: keep one, close the rest. The single-package majors
  ([#311](https://github.com/lambdaclass/stabileo/pull/311), [#312](https://github.com/lambdaclass/stabileo/pull/312), [#314](https://github.com/lambdaclass/stabileo/pull/314), [#315](https://github.com/lambdaclass/stabileo/pull/315), [#316](https://github.com/lambdaclass/stabileo/pull/316), [#317](https://github.com/lambdaclass/stabileo/pull/317), [#318](https://github.com/lambdaclass/stabileo/pull/318), [#319](https://github.com/lambdaclass/stabileo/pull/319)) are held by [#457](https://github.com/lambdaclass/stabileo/pull/457); [#654](https://github.com/lambdaclass/stabileo/pull/654) and
  [#1284](https://github.com/lambdaclass/stabileo/pull/1284) go through the normal gates.
- **Performance follow-ups of [#768](https://github.com/lambdaclass/stabileo/pull/768):** gate the WASM size [#1072](https://github.com/lambdaclass/stabileo/issues/1072); the audit's remaining work [#1073](https://github.com/lambdaclass/stabileo/issues/1073).
- **Old drafts to keep or close:** [#609](https://github.com/lambdaclass/stabileo/pull/609) and [#651](https://github.com/lambdaclass/stabileo/pull/651) (nonlinear framework), [#536](https://github.com/lambdaclass/stabileo/pull/536) (generated
  designs), [#276](https://github.com/lambdaclass/stabileo/pull/276) (build timelapse PoC), [#470](https://github.com/lambdaclass/stabileo/pull/470) (CODEOWNERS, now [testing/ROADMAP.md, Trust item 10](../../testing/ROADMAP.md#trust-and-verification-backlog)).
- **Duplicate tracking issues:** [#385](https://github.com/lambdaclass/stabileo/issues/385) and [#724](https://github.com/lambdaclass/stabileo/issues/724) (staging), [#354](https://github.com/lambdaclass/stabileo/issues/354) and [#717](https://github.com/lambdaclass/stabileo/issues/717) (nightly that runs
  and alerts), [#355](https://github.com/lambdaclass/stabileo/issues/355) and [#725](https://github.com/lambdaclass/stabileo/issues/725) (protected main, review enforced), [#718](https://github.com/lambdaclass/stabileo/issues/718) and [#730](https://github.com/lambdaclass/stabileo/issues/730) (old files and
  the long-term format): merge each pair into one.
- **Changelog fragments:** open PRs that change behaviour need theirs before they land.

## 7. Strategy and long-term sequence

Reference material: why Stabileo exists, what it must become, and the long-term order. It changes
rarely; sections 2 to 4 decide what happens now.

### Purpose

This is the product roadmap: app features, market sequencing, design/reporting layers, and distribution strategy. It is not the solver mechanics roadmap — for that, see `SOLVER_ROADMAP.md`. Historical progress belongs in `CHANGELOG.md`. This document should stay forward-looking.

For the expanding AI track, see [`AI_ROADMAP.md`](AI_ROADMAP.md).

### Vision

Become the world's best structural engineering software — open-source, browser-based, zero-install. First: match the analytical power of OpenSees/Code_Aster/CalculiX with an accessible visual UX. Then: add design deliverables, diagnostics, and AI-assisted guidance. Later: real-time CRDT collaboration (the Figma moment) and full AI-native design.

Strategic positioning:
- not `broader than every open-source mechanics framework`
- but `the strongest open structural solver product with the clearest visible proof of correctness, the best workflow automation, and the best browser-native UX`

### Competitive Moat

What we have that OpenSees/Code_Aster/CalculiX/SAP2000/ETABS will never have:

1. **Zero-install browser UX** — engineers open a URL and start working
2. **Visual model building** — competitors require scripting or clunky pre-processors
3. **Real-time feedback** — live calc, instant diagrams, interactive 3D
4. **Educational mode** — no competitor explains the math step by step
5. **Modern stack** — their codebases are Fortran/Tcl/C++ from the 90s
6. **Explainable diagnostics and review workflows** — warnings, provenance, result trust, comments, and guided fixes as first-class product surfaces
7. **AI-assisted engineering UX** — guided modeling, result queries, and code/design suggestions built on structured solver outputs
8. **CRDT collaboration** — later Figma-style real-time multi-user editing on top of a trusted structural core
9. **Verification as a product surface** — public benchmarks, acceptance models, reproducible runs, and trust signals visible to users rather than hidden in backend engineering
10. **Certified results** — linear, modal, buckling, P-Delta, spectral, harmonic, time-history and plastic results and the AISC/EC3/EC2 checks carry machine-checkable error bounds (`testing/docs/CERTIFY.md`), re-checkable in Lean; no commercial package proves its answers

### Product Thesis

Dedaliano should win in this order:

1. structural solver trust
2. code checks, steel/RC design workflows, and first automation surfaces
3. automatic load generation and code-driven combinations
4. reports and documentation
5. diagnostics, review workflows, and AI-assisted guidance
6. lightweight collaboration and shareable review flows
7. dynamic analysis and nonlinear materials (what OpenSees is famous for)
8. foundations and deeper connection/detail workflows
9. construction staging, fire, progressive collapse
10. seismic engineering workflow (end-to-end)
11. interoperability and BIM-connected workflows
12. broader material codes (timber, masonry, composite)
13. desktop, API, and firm workflow packaging
14. optimization, full collaboration, and broader AI workflows

That matches how structural firms buy software:

`can it analyze -> can it handle real loads -> can it design -> can it produce deliverables -> can it fit our workflow -> can my team use it together`

ROI order for users:
1. stable analysis they can trust
2. automation that removes repetitive hand-work immediately
3. steel/RC design outputs they can use daily
4. reports and deliverables they can issue
5. diagnostics, review, and guidance that reduce failure/debug time
6. lightweight collaboration that makes review and sharing easier
7. workflow polish and breadth after the above are solid

### What The Product Depends On From The Solver

The product roadmap only works if the solver exposes the right contracts and trust signals. The app should treat these as product dependencies, not backend details.

1. `Benchmark and verification moat`
   Public acceptance models, parity checks, and reproducible proof should be part of the user-facing trust story.

2. `Structured diagnostics and provenance`
   Machine-readable warning codes, severity, element references, and governing-case provenance are the substrate for AI review, QA, reports, and comments.

3. `Solver-run artifact contract`
   Bug-report export/import, reproducible support cases, and reviewer replay flows depend on a stable solver-run artifact the product can capture and attach, not only internal engine metadata.

4. `Query-ready result contracts`
   Natural-language result queries, reviewer tools, and report generation need indexed maxima/minima/governing-case summaries rather than UI-side table scraping.

5. `Model quality gates`
   Pre-solve checks for mechanisms, bad constraints, disconnected subgraphs, shell pathologies, and suspicious axes/supports are one of the highest-ROI product features.

6. `Headless and native execution parity`
   Desktop, API, cloud comparison, and firm workflows depend on browser/native parity and repeatable headless execution, not only a good in-browser demo.

### Open-Source vs Hosted Boundary

The roadmap describes the full product direction, but not every capability should live at the same distribution layer.

#### Open-source should include

- the core browser product
- solver-driven diagnostics, verification, and review surfaces
- AI UI surfaces and capability interfaces
- prompt/result schemas
- local/basic provider adapter patterns where appropriate
- basic AI assistance such as diagnostic explanation, result queries, and limited code-check explanation
- local model support if it is added
- basic BYO-key mode if it materially helps community adoption
- report/design workflow foundations that make the product genuinely useful on its own

#### Hosted / private / commercial should include

- hosted backend routing
- premium provider integrations and tuning
- provider-selection policies
- caching, logging, tracing, and eval infrastructure
- team review assistant
- large-project context assembly
- report-generation intelligence
- automated design iteration / optimization assistant
- office-specific knowledge / templates / standards
- usage quotas, rate limits, billing, and admin controls
- enterprise security / audit / tenancy features
- cloud comparison, batch execution, and hosted platform services

#### Guiding principle

The open-source version should be strong enough to be real software engineers can trust and use.

The hosted/private layer should monetize:

- orchestration
- scale
- collaboration
- premium automation
- enterprise controls

not artificial crippling of the core engineering product.

### The Automation Gap

> Full analysis: [automation_gaps.md](../research/automation_gaps.md)

The biggest remaining product gap is not "more analysis categories." It is automating the work engineers still do manually after the solver has already produced correct forces.

Today the solver can compute forces, reactions, modes, and envelopes well enough to be impressive. What still blocks daily project delivery is the manual layer on top:

1. defining code load combinations and factors
2. computing wind / seismic / snow loads from code inputs
3. checking whether members pass code
4. sizing sections by trial and error
5. turning RC demand into bars, schedules, and drawings
6. generating calculation reports and governing-case narratives
7. interpreting mode shapes, irregularities, and design drivers

Closing this gap is the difference between:

- `impressive analysis tool`
- `software an engineer can actually deliver a project with`

Competitors like SAP2000, ETABS, and RFEM automate parts of this already. Dedaliano should not only catch up there; it should also automate things competitors still do not do well or at all.

Commercially, the most important catch-up gap is also the clearest wedge in Latin America:
- `RC design + reinforcement schedules + BBS`
- this is the specific area where CYPECAD still has strong practical advantage
- closing it matters not just technically, but commercially, because it moves Stabileo from analysis software into project-delivery software for RC-heavy markets

### Users We Can Support

The same solver can support different user groups, but they need different product layers:

- **Structural and civil engineers** — full analysis, design, diagnostics, reports, and office workflows
- **Engineering firms** — templates, repeatable workflows, QA, reports, and interoperability
- **Students and professors** — onboarding, examples, benchmark explorer, and educational surfaces
- **Earthquake engineers** — pushover, time-history, IDA, fragility, performance-based design
- **Design-build / contractors / temporary works teams** — staged workflows, rapid reporting, and simple pass/fail communication
- **BIM / computational design users** — interoperability, import/export, and API hooks
- **Researchers / verification users** — benchmark visibility, solver settings, exports, and reproducibility
- **Architects** — only as a later conceptual structural mode with strong guardrails, not as the default product surface

### Product Layers By User Need

- `Engineers and firms` — diagnostics, code checks, RC member design and reinforcement schedules, reports, connections, foundations, templates, interoperability, and explainable element-family defaults
- `Earthquake engineers` — pushover analysis, time-history, ground motion library, IDA, fragility curves, performance-based assessment
- `Education` — first-solve success, examples, benchmark explorer, explanatory views
- `Design-build / temporary works` — staged workflows, fast results communication, deliverable generation
- `BIM / computational design` — import/export, API packaging, geometry-model exchange
- `Architects` — later conceptual structural mode with defaults, visual feedback, and guardrails

### Post-Core Software Stack

If Stabileo executes the core roadmap well, the next best products are not "another generic solver." They are high-value software layers built on top of the solver moat.

Top opportunities:

1. `RC design + reinforcement schedule + BBS studio` — analysis → required steel → selected bars → schedules → drawings
2. `Structural report OS` — calculation books, governing-case narratives, solver diagnostics, code-check summaries, submission-grade PDFs
3. `QA / peer-review assistant` — model-quality checks, suspicious-reaction detection, instability warnings, load-path issues, reviewer workflows
4. `Firm workspace` — templates, office standards, reusable load packages, shared defaults, review flows, project memory
5. `Parametric structural configurator` — high-value typology generators for towers, warehouses, pipe racks, stadiums, mat foundations, and repetitive frames
6. `Interoperability layer` — BIM/CAD exchange, analytical-model generation, geometry cleanup, downstream drawing sync
7. `Cloud solve + comparison platform` — batch analysis, branch comparison, model diffing, scenario sweeps, history, batch reports
8. `Education product` — teaching-first solver experience, benchmark explorer, assignments, verification visibility, explainable methods
9. `Desktop distribution via Tauri` — native shell around the same web app for offline use, local files, native integration, and heavier local workflows

Recommended build order:

1. RC design + schedule / BBS
2. Structural report OS
3. QA / peer-review assistant
4. Firm workspace
5. Parametric configurator
6. Interoperability + cloud comparison
7. Desktop distribution via Tauri

What not to build next:

- a second solver engine
- a broad CAD clone
- a generic project-management app without engineering depth
- a full BIM-authoring competitor

### Execution Sequence (Current vs Archived)

The active execution order is governed by:
- **Wave 0 (Soundness First):** [section 2 (`Now: soundness first`)](#2-now-soundness-first-updated-2026-11-22) and [section 4 (`Open bugs`)](#4-open-bugs).
- **Waves 1–4 (Post-soundness foundations, trust/distribution wedges, high-ARPU modules, ecosystem):** [section 5 (`Later: decided, not started`)](#later-decided-not-started) and [`high_leverage_solver_and_product_plan.md`](../research/high_leverage_solver_and_product_plan.md).
- **Archived pre-v0.2.0 sequence:** the earlier 12-step "Dedaliano" sequence, pre-April Z-up migration notes, and daily/weekly/monthly mapping are preserved verbatim in [`docs/archive/roadmap/PRODUCT_SEQUENCE_PRE_V0_2.md`](../archive/roadmap/PRODUCT_SEQUENCE_PRE_V0_2.md) (with still-actionable engineering notes — suspension-bridge cable pretension, configurable fixed-iteration P-Delta in PRO, and CRDT structural-aware merge semantics — retained in sections 5 and 6 above).

### Non-Goals

Do not prioritize these before the core product is clearly trusted:

- Generic multiphysics expansion
- CFD or thermal-fluid products
- Overly broad enterprise features before single-user workflow quality is strong
- AI features that outrun solver trust
- Architect-friendly conceptual mode before onboarding, diagnostics, deliverables, and interoperability are stronger
- GPU sparse direct factorization (CPU sparse direct is correct for structural problem sizes)
- Isogeometric analysis (IGA shines for automotive/aerospace, not buildings)
- Meshfree methods (peridynamics, MPM — niche, out of scope for routine structural)
- A second solver engine
- A broad CAD clone
- A generic project-management app without engineering depth
- A full BIM-authoring competitor

### Related Docs

- [`README.md`](README.md) — entry point for every roadmap document: purpose, status, owner
- [`../../testing/docs/DASHBOARD.md`](../../testing/docs/DASHBOARD.md) — the metrics behind the exit criteria, per release
- [`../../testing/docs/MATURITY.md`](../../testing/docs/MATURITY.md) — verification level of every analysis, element family and design check
- [`../SAFETY_ADVISORIES.md`](../SAFETY_ADVISORIES.md) — the safety advisory process
- `SOLVER_ROADMAP.md` — solver mechanics and validation sequencing
- `POSITIONING.md` — market framing and competitive wedge
- `../research/rc_design_and_bbs.md` — RC design and BBS research
- [`../research/high_leverage_solver_and_product_plan.md`](../research/high_leverage_solver_and_product_plan.md) — 2026-11-22 reprioritized solver and product plan across Waves 0–4
- `../research/beyond_roadmap_opportunities.md` — GNN surrogates, digital twins, UQ, advanced research opportunities
- `../research/cypecad_competitive_gap_and_parity_plan.md` — unified CYPECAD competitive gap analysis and parity plan
- `../research/post_roadmap_software_stack.md` — platform adjacencies after roadmap execution

