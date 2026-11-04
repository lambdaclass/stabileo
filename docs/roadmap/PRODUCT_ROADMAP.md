# Stabileo Product Roadmap

## Priority now: bugs first (2026-11-04)

The order of all work, set by the user: wrong-result bugs (P0, then P1) first, then other bugs, then
features. Nothing in a lower group takes capacity from a higher one. The table "Active workstreams"
below has every pull request in flight; "Later: deferred follow-ups" has everything decided for
later, so nothing is forgotten.

### 0. New since 2026-11-03: first in line

| Item | What | Next step |
|---|---|---|
| [#1350](https://github.com/lambdaclass/stabileo/issues/1350) (nightly fuzz, `json_static`) | 2D and 3D envelopes can return non-finite values: end forces near the float limit overflow along the member, and a NaN after the first result is dropped by the comparison | fix in [#1379](https://github.com/lambdaclass/stabileo/pull/1379) (ready, Codex high clean; envelopes refuse non-finite inputs and stations; no results version) |
| Metamorphic nightly findings [#1351](https://github.com/lambdaclass/stabileo/issues/1351)–[#1371](https://github.com/lambdaclass/stabileo/issues/1371) | wrong-result candidates (labelled `wrong-result-candidate`: superposition, symmetry and antisymmetry, quad9 von Mises, member forces, influence lines) and refusals that change under an invariant transform (`invariance-refusal`: eigen-solve convergence, massless mechanisms, self-check residuals, unsupported nodal moments, non-finite time history) | triage each against a hand-checked model before calling it an engine bug: a harness or tolerance cause goes to [#1299](https://github.com/lambdaclass/stabileo/pull/1299), an engine cause gets a fix PR and, if it is live, an advisory. [#1204](https://github.com/lambdaclass/stabileo/issues/1204) duplicates [#1203](https://github.com/lambdaclass/stabileo/issues/1203): close it |
| [#1349](https://github.com/lambdaclass/stabileo/issues/1349) (nightly fuzz, `json_plastic`) | a plastic-collapse input that runs past the fuzz time limit | reproduce, then bound the iteration or refuse the input |
| [#983](https://github.com/lambdaclass/stabileo/issues/983) | the nightly `random-models` job keeps failing | find whether it is infrastructure or a finding; one issue per root cause |
| [#1378](https://github.com/lambdaclass/stabileo/issues/1378) | missed mutants in the static solver core (`linear.rs`, `assembly.rs`): code paths no test checks | tests that kill them, the static solver first |
| [#871](https://github.com/lambdaclass/stabileo/pull/871) incident | the Basic course (units 1 to 7, Batuis) was enqueued directly and merged on 2026-11-04 without review and without the review fixes made on [#1070](https://github.com/lambdaclass/stabileo/pull/1070) and the course stack; it took results version 14 | reverted by [#1372](https://github.com/lambdaclass/stabileo/pull/1372) the same day (results version 15 withdraws v14's three course entries). The course lands again from the reviewed stack [#1302](https://github.com/lambdaclass/stabileo/pull/1302)–[#1307](https://github.com/lambdaclass/stabileo/pull/1307) (drafts), each part with its review fixes. Prevention: Release safety item 11 |

### 1. Wrong-result bugs

**Open safety issues and their state on main.** "Uncontained" means main can give the wrong result
with no warning today. "Contained by [#807](https://github.com/lambdaclass/stabileo/pull/807)" means the containment PR ([#807](https://github.com/lambdaclass/stabileo/pull/807), under [#447](https://github.com/lambdaclass/stabileo/issues/447)) warns or
refuses; it is not on main yet and lands before the per-defect fixes, each of which then removes its
own warning or refusal. The per-defect fixes come from the solver bug-fix workstream, in this order:
[#1238](https://github.com/lambdaclass/stabileo/issues/1238), [#466](https://github.com/lambdaclass/stabileo/issues/466), [#458](https://github.com/lambdaclass/stabileo/issues/458), [#426](https://github.com/lambdaclass/stabileo/issues/426), [#532](https://github.com/lambdaclass/stabileo/issues/532) (already in wave B), [#456](https://github.com/lambdaclass/stabileo/issues/456), [#417](https://github.com/lambdaclass/stabileo/issues/417), [#432](https://github.com/lambdaclass/stabileo/issues/432).

| Issue | Defect | On main today | Containment | Fix |
|---|---|---|---|---|
| [#532](https://github.com/lambdaclass/stabileo/issues/532) (P0) | 3D design demands on the lateral axis (Vy/Mz instead of Vz/My); the live CIRSOC 201 column design checked Mz over the depth, up to 36% short of steel | fixed on main by wave B (715279c26, 2026-11-03) | — | fixed in [#1233](https://github.com/lambdaclass/stabileo/pull/1233) via [#1285](https://github.com/lambdaclass/stabileo/pull/1285) (results version 7, SA-2026-029); issue to close |
| [#534](https://github.com/lambdaclass/stabileo/issues/534) (P0) | EC2 flexure assumes the tension steel yields: M_Rd up to 21% high on singly reinforced beams and 22% with top bars, certified | fixed on main by wave B (715279c26, 2026-11-03) | — | fixed in [#1236](https://github.com/lambdaclass/stabileo/pull/1236) via [#1285](https://github.com/lambdaclass/stabileo/pull/1285) (results version 8, SA-2026-028); issue to close |
| [#532](https://github.com/lambdaclass/stabileo/issues/532) leftover | Excel and IFC imports swap Iy and Iz of rectangles and tubes | uncontained | — | fix in [#1310](https://github.com/lambdaclass/stabileo/pull/1310) (draft; SA-2026-039, High; no results version; its push and base change wait on the user) |
| [#1314](https://github.com/lambdaclass/stabileo/issues/1314) | RC design (ACI 318, EN 1992) ignores member torsion, with no warning | uncontained | contained by [#1319](https://github.com/lambdaclass/stabileo/pull/1319) (draft): torsion above the ACI 22.7.1.1 threshold is marked not checked (SA-2026-040) | torsion design not started |
| [#1315](https://github.com/lambdaclass/stabileo/issues/1315) | modal mechanism detection can miss a mechanism at an inclined support (high-effort review of wave B) | uncontained | — | fix in [#1325](https://github.com/lambdaclass/stabileo/pull/1325) (draft): inclined-support DOFs weighed by their mass |
| [#1323](https://github.com/lambdaclass/stabileo/issues/1323) | 2D buckling overstates the factor when compression grows along a member under axial span loads (mean-N Kg, +43–68 %, no warning) | uncontained | — | fix in [#1324](https://github.com/lambdaclass/stabileo/pull/1324) (draft): each member's varying axial force is integrated |
| [#1316](https://github.com/lambdaclass/stabileo/issues/1316) | RC "Axial + Moment" rows envelope N and M under one combination name | uncontained | — | fix in [#1321](https://github.com/lambdaclass/stabileo/pull/1321) (draft): RC columns also checked under their least compression |
| [#1317](https://github.com/lambdaclass/stabileo/issues/1317) | non-finite demand components that don't govern go unnoticed (high-effort review of wave B) | uncontained | — | not started |
| [#1318](https://github.com/lambdaclass/stabileo/issues/1318) | the legacy-project migration fingerprint omits material strength (fy, f'c) | uncontained | — | not started |
| [#426](https://github.com/lambdaclass/stabileo/issues/426) | 3D co-rotational adds rotation vectors (reachable from PRO) | uncontained | contained by [#807](https://github.com/lambdaclass/stabileo/pull/807) (NL-3, warn) | fix in [#1301](https://github.com/lambdaclass/stabileo/pull/1301) (draft, stacked on #807); back with its author for a high-effort review blocker (a 2π rigid rotation adds torque) |
| [#458](https://github.com/lambdaclass/stabileo/issues/458) | the assembled certificate certifies singular models | uncontained | contained by [#807](https://github.com/lambdaclass/stabileo/pull/807) (CERT-MECHANISM, NUM-INVARIANCE, warn) | 2D fix in [#1298](https://github.com/lambdaclass/stabileo/pull/1298) (draft, stacked on #807); 3D skew case: a rotation held by nothing about a skew axis still solves after rounding, stays contained as a NUM-INVARIANCE warning and is never certified; its real fix (detect the rank-deficient rotation block and refuse) is still open; near-mechanisms stay warn, not refuse (user, 2026-11-02) |
| [#798](https://github.com/lambdaclass/stabileo/issues/798) | MITC4 too stiff on distorted meshes under in-plane bending | uncontained | contained by [#807](https://github.com/lambdaclass/stabileo/pull/807) (SH-MITC4-DISTORTION: warn, refuse on significant membrane bending) | membrane fix not started; narrowing the refusal is deferred (see "Later") |
| [#1057](https://github.com/lambdaclass/stabileo/issues/1057) | MITC4 and MITC9 too flexible on warped geometry | uncontained | contained by [#807](https://github.com/lambdaclass/stabileo/pull/807) (SH-WARPED-MITC4/MITC9, refuse; [#1074](https://github.com/lambdaclass/stabileo/pull/1074) folded in) | formulation fix not started |
| [#466](https://github.com/lambdaclass/stabileo/issues/466) | 2D constraints assume the X–Z plane; Y–Z cuts are mapped wrongly | uncontained | contained by [#807](https://github.com/lambdaclass/stabileo/pull/807) (engine warn; the web refuses Y–Z and X–Y cuts with constraints) | fix in [#1297](https://github.com/lambdaclass/stabileo/pull/1297) (draft, stacked on [#1295](https://github.com/lambdaclass/stabileo/pull/1295)) |
| [#1238](https://github.com/lambdaclass/stabileo/issues/1238) | 3D→2D cut bends members about the wrong axis (up to 13× too stiff) | uncontained | contained by [#807](https://github.com/lambdaclass/stabileo/pull/807) (CUT-SECTION-AXIS, web refusal) | fix in [#1295](https://github.com/lambdaclass/stabileo/pull/1295) (draft, stacked on #807) |
| [#741](https://github.com/lambdaclass/stabileo/issues/741) | certified 3D buckling factor above its own upper bound | fixed by [#817](https://github.com/lambdaclass/stabileo/pull/817) (merged in wave A, results version 6) | [#807](https://github.com/lambdaclass/stabileo/pull/807) also refuses it (BU-BOUND) | landed; close the issue with evidence |
| [#818](https://github.com/lambdaclass/stabileo/issues/818) | the dense reciprocal eigen-solve can report a buckling factor slightly high (0.05%) | uncontained | contained by [#807](https://github.com/lambdaclass/stabileo/pull/807) (BU-ACCURACY, warn on all 3D buckling) | not started |
| [#456](https://github.com/lambdaclass/stabileo/issues/456) | 3D buckling compression gate misses members compressed only between their ends | uncontained | contained by [#807](https://github.com/lambdaclass/stabileo/pull/807) (BU-SPAN-COMPRESSION, warn) | fix in [#1309](https://github.com/lambdaclass/stabileo/pull/1309) (draft, stacked on #807) |
| [#419](https://github.com/lambdaclass/stabileo/issues/419) | 3D connector axes are discontinuous and not user-orientable | uncontained | contained by [#807](https://github.com/lambdaclass/stabileo/pull/807) (SP-17, warn) | not started |
| [#408](https://github.com/lambdaclass/stabileo/issues/408) | the warping DOF is shared by every member at a node | uncontained | contained by [#807](https://github.com/lambdaclass/stabileo/pull/807) (FR-5, warn) | not started |
| [#417](https://github.com/lambdaclass/stabileo/issues/417) | a cable carries compression in the linear solver with no diagnostic | uncontained | contained by [#807](https://github.com/lambdaclass/stabileo/pull/807) (SP-14, warn) | queued with the solver bug-fix workstream |
| [#432](https://github.com/lambdaclass/stabileo/issues/432) | contact reports converged after freezing a chattering gap | uncontained | contained by [#807](https://github.com/lambdaclass/stabileo/pull/807) (NL-13, warn) | queued with the solver bug-fix workstream |
| [#433](https://github.com/lambdaclass/stabileo/issues/433) | fiber solver returns an unconverged iterate | uncontained | contained by [#807](https://github.com/lambdaclass/stabileo/pull/807) (NL-17, warn) | fix in [#1296](https://github.com/lambdaclass/stabileo/pull/1296) (draft): stop at the last converged increment, reactions and an equilibrium gate |
| [#370](https://github.com/lambdaclass/stabileo/issues/370) | known solver gaps (unconverged nonlinear increments and others) | uncontained | contained by [#807](https://github.com/lambdaclass/stabileo/pull/807) (NL-DYNAMIC-GAPS, warn) | not started |
| [#381](https://github.com/lambdaclass/stabileo/issues/381) | nonlinear and dynamic robustness programme | not a single wrong-result defect | [#807](https://github.com/lambdaclass/stabileo/pull/807) records it as scope; concrete defects are tracked separately | — |
| [#428](https://github.com/lambdaclass/stabileo/issues/428) | material nonlinear is a whole-member secant, not plasticity | contained on main (`known_issues.rs`, NL-5 warn) | on main | not started |

**Other wrong-result fixes** (all with a regression test that fails before the fix):

- **Landed: wave B, [#1285](https://github.com/lambdaclass/stabileo/pull/1285)** (715279c26, 2026-11-03; results version 13; main is now at 15, see below):
  [#1233](https://github.com/lambdaclass/stabileo/pull/1233) ([#532](https://github.com/lambdaclass/stabileo/issues/532)), [#1236](https://github.com/lambdaclass/stabileo/pull/1236) ([#534](https://github.com/lambdaclass/stabileo/issues/534)), [#1225](https://github.com/lambdaclass/stabileo/pull/1225) ([#827](https://github.com/lambdaclass/stabileo/pull/827) repeated modes [#759](https://github.com/lambdaclass/stabileo/issues/759), [#865](https://github.com/lambdaclass/stabileo/pull/865) self-checking results, [#770](https://github.com/lambdaclass/stabileo/pull/770) old
  project files, [#786](https://github.com/lambdaclass/stabileo/pull/786) snapshot gate), [#1237](https://github.com/lambdaclass/stabileo/pull/1237) (shell envelope per component, SA-2026-027), [#1246](https://github.com/lambdaclass/stabileo/pull/1246)
  ([#467](https://github.com/lambdaclass/stabileo/issues/467) CIRSOC 301 Q ≤ 0 refused, [#766](https://github.com/lambdaclass/stabileo/issues/766) PRO design says why no member is checked, SA-2026-030),
  [#1234](https://github.com/lambdaclass/stabileo/pull/1234) (AISC G2 and EC3 6.2.6 shear with no web or shear area unevaluated, SA-2026-025 and
  SA-2026-026), [#1239](https://github.com/lambdaclass/stabileo/pull/1239) (time history refuses non-finite results), [#1247](https://github.com/lambdaclass/stabileo/pull/1247) ([#760](https://github.com/lambdaclass/stabileo/issues/760) time-history
  reciprocity on massless DOFs, [#338](https://github.com/lambdaclass/stabileo/issues/338) modal refuses mechanism modes, SA-2026-031 and SA-2026-032).
  [#1286](https://github.com/lambdaclass/stabileo/pull/1286) and [#1287](https://github.com/lambdaclass/stabileo/pull/1287) came in through its branch. Every part is merged or closed "merged via [#1285](https://github.com/lambdaclass/stabileo/pull/1285)". Issues
  [#532](https://github.com/lambdaclass/stabileo/issues/532), [#534](https://github.com/lambdaclass/stabileo/issues/534), [#467](https://github.com/lambdaclass/stabileo/issues/467), [#766](https://github.com/lambdaclass/stabileo/issues/766), [#760](https://github.com/lambdaclass/stabileo/issues/760), [#338](https://github.com/lambdaclass/stabileo/issues/338) and [#759](https://github.com/lambdaclass/stabileo/issues/759) are still open on GitHub: close each with its evidence.
- **Live wrong results in the PRO load generator (from [#1076](https://github.com/lambdaclass/stabileo/pull/1076)):** [#1311](https://github.com/lambdaclass/stabileo/issues/1311) a narrow deck not
  aligned with X/Y gets no floor load (being fixed on #1253's branch); [#1312](https://github.com/lambdaclass/stabileo/issues/1312) in width mode,
  floor beams under low eaves lose their floor load (fixed in #1253); [#1313](https://github.com/lambdaclass/stabileo/issues/1313) "Reproduce" verifies
  a report whose printed values were edited (fixed in #1253). All three come from the high-effort
  re-review of the PRs merged since 2026-11-01: Codex had run at reasoning effort "none" in that
  window, and `run-engine.sh` now forces high.
- **[#1253](https://github.com/lambdaclass/stabileo/pull/1253):** the generated area loads drop a floor's load under a low member (post-merge findings
  on [#1076](https://github.com/lambdaclass/stabileo/pull/1076); SA-2026-033, results version 17 in landing order). Known on main; fix in review.
- **[#1255](https://github.com/lambdaclass/stabileo/pull/1255):** the equilibrium check says "balanced" over loads it left out, similar-storey matching
  and replication (post-merge findings on [#1077](https://github.com/lambdaclass/stabileo/pull/1077); SA-2026-034, results version 18 in landing order).
  Known on main; fix in review.
- **[#807](https://github.com/lambdaclass/stabileo/pull/807)** containment (above), then the per-defect fixes of the solver bug-fix workstream.
- **[#755](https://github.com/lambdaclass/stabileo/issues/755) (SA-2026-023):** the RC column check read one sign of the moment; close the issue once its
  fix is confirmed on main.
- **Nightly triage:** the nightly safety issues from [#1081](https://github.com/lambdaclass/stabileo/issues/1081) on still need decisions (most have
  ledger rows in [#807](https://github.com/lambdaclass/stabileo/pull/807); group A after [#1239](https://github.com/lambdaclass/stabileo/pull/1239), now on main; the replays). In progress on branch
  `safety/nightly-triage-1103`; earlier work on `safety/nightly-triage-engine` (ledger decisions for
  [#954](https://github.com/lambdaclass/stabileo/issues/954)–[#1041](https://github.com/lambdaclass/stabileo/issues/1041), to fold into #807 or its own PR) and `wip/nightly-triage-noise-checks`.
  The new findings from 2026-11-04 are in section 0 above.
- **Results versions follow the landing order:** main is at v15 ([#1372](https://github.com/lambdaclass/stabileo/pull/1372) withdrew [#871](https://github.com/lambdaclass/stabileo/pull/871)'s v14). Next, in order:
  [#1325](https://github.com/lambdaclass/stabileo/pull/1325) (v16), [#1253](https://github.com/lambdaclass/stabileo/pull/1253) (v17) and [#1255](https://github.com/lambdaclass/stabileo/pull/1255) (v18), then [#807](https://github.com/lambdaclass/stabileo/pull/807) and the solver fixes, numbered at landing.
  [#1310](https://github.com/lambdaclass/stabileo/pull/1310) is an import-only fix with advisory SA-2026-039 and no results version. Each PR renumbers if anything lands ahead of it.

### 2. Other bugs

- **Found in the review of [#1253](https://github.com/lambdaclass/stabileo/pull/1253) and [#1255](https://github.com/lambdaclass/stabileo/pull/1255) (2026-11-04):**
  - [#1404](https://github.com/lambdaclass/stabileo/issues/1404): the re-check notice shows every registered change's title and explanation in English to German, French and Turkish users. This affects all 72 entries on main, and a safety notice the reader can't read is close to a missed notice.
  - [#1401](https://github.com/lambdaclass/stabileo/issues/1401): edge beams under one-sided slab load get no torque and no advisory, in the panels, width and plan modes.
  - [#1402](https://github.com/lambdaclass/stabileo/issues/1402): verification integrity. A hand-edited report can drop sections and still pass the report check.
  - [#1403](https://github.com/lambdaclass/stabileo/issues/1403): the storey scope should track explicit picks separately from expansion copies.
- **Route byte budgets:** all six routes are back to 128 B ([#1322](https://github.com/lambdaclass/stabileo/pull/1322), then [#1372](https://github.com/lambdaclass/stabileo/pull/1372) for the app routes), and the blog is its own
  lazy route ([#1289](https://github.com/lambdaclass/stabileo/pull/1289), [#1290](https://github.com/lambdaclass/stabileo/pull/1290)), all landed. The course stack is a lazy route boundary ([#1302](https://github.com/lambdaclass/stabileo/pull/1302)), so each module stays
  within 128 B; the blog posts of [#1338](https://github.com/lambdaclass/stabileo/pull/1338) still need a decision on their growth.
- **Live-site fixes** (section "Live-site fixes"): [#1227](https://github.com/lambdaclass/stabileo/pull/1227) ([#1059](https://github.com/lambdaclass/stabileo/pull/1059), [#1222](https://github.com/lambdaclass/stabileo/pull/1222), [#1223](https://github.com/lambdaclass/stabileo/pull/1223), [#1224](https://github.com/lambdaclass/stabileo/pull/1224)).
- **CI** (section "CI and feedback loop"): the speed work in flight, then what waits on the user.
- The P2 bugs from the triage: [#761](https://github.com/lambdaclass/stabileo/issues/761) P-Delta, fiber and co-rotational refuse rotated or re-unit
  copies; [#471](https://github.com/lambdaclass/stabileo/issues/471) the 3D results panel shows no certificate line (PR [#473](https://github.com/lambdaclass/stabileo/pull/473)); [#743](https://github.com/lambdaclass/stabileo/issues/743) the 3D plastic
  certificate takes 8 s and 680 MB on 8 members; [#420](https://github.com/lambdaclass/stabileo/issues/420) fiber solvers return no reactions; [#607](https://github.com/lambdaclass/stabileo/issues/607) an E2E
  flake; [#608](https://github.com/lambdaclass/stabileo/issues/608) a 40 s rebar filter; [#875](https://github.com/lambdaclass/stabileo/issues/875) non-reproducible prerender (ours; the outside PR is not
  used); [#454](https://github.com/lambdaclass/stabileo/issues/454) slow dense-LU fallback; [#453](https://github.com/lambdaclass/stabileo/issues/453) first-order convergence of solid-shell buckling; [#1080](https://github.com/lambdaclass/stabileo/issues/1080)
  localized AI errors.

### 3. Features

The `/examples` gallery ([#1229](https://github.com/lambdaclass/stabileo/pull/1229), then examples 4 to 7 and the engine work behind them), the landing
positioning copy ([#1230](https://github.com/lambdaclass/stabileo/pull/1230)), Research and Tools speed ([#1065](https://github.com/lambdaclass/stabileo/pull/1065)), the Basic course from its reviewed stack ([#1302](https://github.com/lambdaclass/stabileo/pull/1302)–[#1307](https://github.com/lambdaclass/stabileo/pull/1307)), then the rest
of the table below.

## Active workstreams (2026-11-04, 13:00 UTC)

Everything in flight, so that work survives a crashed session. Source: the workstreams ledger
(`WORKSTREAMS.md` in the workstreams folder) and the open pull requests. **Decision** marks an item
that waits on the user, not on code or CI. Safety, engine and app changes need two reviews before
main (Codex alone until 2026-11-08); every changed result is registered with its own results
version.

**Landed since 2026-11-02:** wave A [#1254](https://github.com/lambdaclass/stabileo/pull/1254) ([#817](https://github.com/lambdaclass/stabileo/pull/817) buckling certificate bounds, results version 6;
[#864](https://github.com/lambdaclass/stabileo/pull/864) units in types slice 1; [#1060](https://github.com/lambdaclass/stabileo/pull/1060) metamorphic slice 1; [#1056](https://github.com/lambdaclass/stabileo/pull/1056) benchmark test correctness; [#1066](https://github.com/lambdaclass/stabileo/pull/1066)
site-wide SEO; [#878](https://github.com/lambdaclass/stabileo/pull/878); [#739](https://github.com/lambdaclass/stabileo/pull/739) nightly alerting; [#1245](https://github.com/lambdaclass/stabileo/pull/1245) AI reviews; [#1242](https://github.com/lambdaclass/stabileo/pull/1242); [#1075](https://github.com/lambdaclass/stabileo/pull/1075) per-runner sccache;
[#985](https://github.com/lambdaclass/stabileo/pull/985); [#1079](https://github.com/lambdaclass/stabileo/pull/1079) hosted runners on Ubuntu 24.04), [#1058](https://github.com/lambdaclass/stabileo/pull/1058) share links refuse malformed and dangling
models, [#1076](https://github.com/lambdaclass/stabileo/pull/1076), [#1077](https://github.com/lambdaclass/stabileo/pull/1077) and [#1078](https://github.com/lambdaclass/stabileo/pull/1078) (PRO analysis 1/3 to 3/3; [#1076](https://github.com/lambdaclass/stabileo/pull/1076) and [#1077](https://github.com/lambdaclass/stabileo/pull/1077) landed before their
review, fixed forward by [#1253](https://github.com/lambdaclass/stabileo/pull/1253) and [#1255](https://github.com/lambdaclass/stabileo/pull/1255)), the CI wave [#1252](https://github.com/lambdaclass/stabileo/pull/1252) ([#863](https://github.com/lambdaclass/stabileo/pull/863), [#866](https://github.com/lambdaclass/stabileo/pull/866), [#1221](https://github.com/lambdaclass/stabileo/pull/1221), [#1226](https://github.com/lambdaclass/stabileo/pull/1226), [#1235](https://github.com/lambdaclass/stabileo/pull/1235),
[#1240](https://github.com/lambdaclass/stabileo/pull/1240)), [#1241](https://github.com/lambdaclass/stabileo/pull/1241), [#1069](https://github.com/lambdaclass/stabileo/pull/1069), [#1062](https://github.com/lambdaclass/stabileo/pull/1062) and [#900](https://github.com/lambdaclass/stabileo/pull/900).

**Landed since 2026-11-03 evening:** wave B [#1285](https://github.com/lambdaclass/stabileo/pull/1285) (with [#1286](https://github.com/lambdaclass/stabileo/pull/1286) and [#1287](https://github.com/lambdaclass/stabileo/pull/1287)), the route budget restore [#1322](https://github.com/lambdaclass/stabileo/pull/1322), the lazy blog
[#1289](https://github.com/lambdaclass/stabileo/pull/1289) and [#1290](https://github.com/lambdaclass/stabileo/pull/1290), [#1341](https://github.com/lambdaclass/stabileo/pull/1341) (load combinations summed in a fixed order), the CI speed PRs [#1327](https://github.com/lambdaclass/stabileo/pull/1327), [#1330](https://github.com/lambdaclass/stabileo/pull/1330)–[#1334](https://github.com/lambdaclass/stabileo/pull/1334),
[#1336](https://github.com/lambdaclass/stabileo/pull/1336), [#1337](https://github.com/lambdaclass/stabileo/pull/1337), [#1339](https://github.com/lambdaclass/stabileo/pull/1339), [#1340](https://github.com/lambdaclass/stabileo/pull/1340), [#1347](https://github.com/lambdaclass/stabileo/pull/1347), [#1335](https://github.com/lambdaclass/stabileo/pull/1335), [#1346](https://github.com/lambdaclass/stabileo/pull/1346), [#1348](https://github.com/lambdaclass/stabileo/pull/1348), [#1374](https://github.com/lambdaclass/stabileo/pull/1374) and [#1376](https://github.com/lambdaclass/stabileo/pull/1376), [#1344](https://github.com/lambdaclass/stabileo/pull/1344), [#1250](https://github.com/lambdaclass/stabileo/pull/1250) (PRO presented as available), and
[#871](https://github.com/lambdaclass/stabileo/pull/871) (the Basic course, without review) with its revert [#1372](https://github.com/lambdaclass/stabileo/pull/1372) (section 0). The website changelog describes them in its 2026-11-06 entry.

**Wrong-result bugs and safety**

| Workstream | PR / branch | State |
|---|---|---|
| Wave B: the safety fixes, results versions v7 to v13 ([#1233](https://github.com/lambdaclass/stabileo/pull/1233), [#1236](https://github.com/lambdaclass/stabileo/pull/1236), [#1225](https://github.com/lambdaclass/stabileo/pull/1225), [#1237](https://github.com/lambdaclass/stabileo/pull/1237), [#1246](https://github.com/lambdaclass/stabileo/pull/1246), [#1234](https://github.com/lambdaclass/stabileo/pull/1234), [#1239](https://github.com/lambdaclass/stabileo/pull/1239), [#1247](https://github.com/lambdaclass/stabileo/pull/1247)) | [#1285](https://github.com/lambdaclass/stabileo/pull/1285) | landed 2026-11-03 (715279c26); every part merged or closed |
| Containment of every open wrong-result issue ([#447](https://github.com/lambdaclass/stabileo/issues/447)) | [#807](https://github.com/lambdaclass/stabileo/pull/807) | open (draft); [#1232](https://github.com/lambdaclass/stabileo/pull/1232) (P0 containment gaps) and [#1074](https://github.com/lambdaclass/stabileo/pull/1074) (warped MITC4/MITC9) are merged into its branch, not into main; lands before the per-defect fixes, results version at landing |
| Per-defect fixes, in order [#1238](https://github.com/lambdaclass/stabileo/issues/1238), [#466](https://github.com/lambdaclass/stabileo/issues/466), [#458](https://github.com/lambdaclass/stabileo/issues/458), [#426](https://github.com/lambdaclass/stabileo/issues/426), [#456](https://github.com/lambdaclass/stabileo/issues/456), [#417](https://github.com/lambdaclass/stabileo/issues/417), [#432](https://github.com/lambdaclass/stabileo/issues/432) | [#1295](https://github.com/lambdaclass/stabileo/pull/1295), [#1297](https://github.com/lambdaclass/stabileo/pull/1297), [#1298](https://github.com/lambdaclass/stabileo/pull/1298), [#1301](https://github.com/lambdaclass/stabileo/pull/1301), [#1309](https://github.com/lambdaclass/stabileo/pull/1309); [#1296](https://github.com/lambdaclass/stabileo/pull/1296) (#433) | drafts stacked on #807 (#1297 on #1295); #417, #432 and the #798/#1057 plan not opened yet |
| [#1076](https://github.com/lambdaclass/stabileo/pull/1076) follow-up: generated area loads (SA-2026-033), with [#1311](https://github.com/lambdaclass/stabileo/issues/1311), [#1312](https://github.com/lambdaclass/stabileo/issues/1312), [#1313](https://github.com/lambdaclass/stabileo/issues/1313) | [#1253](https://github.com/lambdaclass/stabileo/pull/1253) | draft; Codex clean and Grok clean on its last rounds; results version 17 in landing order |
| [#1077](https://github.com/lambdaclass/stabileo/pull/1077) follow-up: equilibrium verdict, similar storeys (SA-2026-034) | [#1255](https://github.com/lambdaclass/stabileo/pull/1255) | ready; Codex clean; results version 18 in landing order |
| Envelopes never return non-finite values ([#1350](https://github.com/lambdaclass/stabileo/issues/1350)) | [#1379](https://github.com/lambdaclass/stabileo/pull/1379) | ready; Codex high clean; no results version |
| Nightly triage of the safety issues from [#1081](https://github.com/lambdaclass/stabileo/issues/1081) on | `safety/nightly-triage-1103`; [#1299](https://github.com/lambdaclass/stabileo/pull/1299) (metamorphic harness: scale-aware floors for nightly false positives) | in progress; #1299 draft |
| Contain warped MITC4/MITC9 (outside PR, code not used) | [#1067](https://github.com/lambdaclass/stabileo/pull/1067) | superseded by [#1074](https://github.com/lambdaclass/stabileo/pull/1074), folded into [#807](https://github.com/lambdaclass/stabileo/pull/807). **Decision:** close it with the standard note |

**Other bugs: budgets, live site and CI**

| Workstream | PR | State |
|---|---|---|
| Live-site integration: soft 404 [#1059](https://github.com/lambdaclass/stabileo/pull/1059), unprefixed redirects [#1224](https://github.com/lambdaclass/stabileo/pull/1224), landing visible without scrolling [#1223](https://github.com/lambdaclass/stabileo/pull/1223) | [#1227](https://github.com/lambdaclass/stabileo/pull/1227) | draft; the changelog counts fix [#1222](https://github.com/lambdaclass/stabileo/pull/1222) moved into [#1384](https://github.com/lambdaclass/stabileo/pull/1384) |
| GitHub Actions bumps | [#1284](https://github.com/lambdaclass/stabileo/pull/1284) | open (Dependabot) |
| CI speed: push to green on a full-scope PR went from 397–498 min to 51–72 min (section "CI and feedback loop"). In flight: research WASM saved bundle by bundle with a retried restore | [#1373](https://github.com/lambdaclass/stabileo/pull/1373) | open, ready; next: automatic retry of infrastructure reds, docs-only path scoping, the queue's critical path |
| Runner pools, E2E cap per host, required proof checks, revert-bot secrets | dotfiles `servers/`, rulesets | **Decision:** see "CI and feedback loop" |

**Features, research and the site**

| Workstream | PR | State |
|---|---|---|
| `/examples` gallery, three examples | [#1229](https://github.com/lambdaclass/stabileo/pull/1229) | draft; ready on its last head, waits on `gh pr ready` |
| `/examples` 4 to 7 and the engine work they need (see "Live examples gallery") | [#1300](https://github.com/lambdaclass/stabileo/pull/1300) (RC column, outrigger sweep, steel tower), [#1308](https://github.com/lambdaclass/stabileo/pull/1308) (RC column pushover with fibre sections) | drafts, stacked on #1229 |
| Landing positioning: open-source structural engineering software, AI marked in development (no provider-key claim until [#1064](https://github.com/lambdaclass/stabileo/pull/1064)); where it fits; Basic and PRO Design copy | [#1230](https://github.com/lambdaclass/stabileo/pull/1230) | ready, Codex clean on 6affce7167; landing −3362 B; reconcile with [#1061](https://github.com/lambdaclass/stabileo/pull/1061) if that lands second |
| Research and Tools faster on phones ([#880](https://github.com/lambdaclass/stabileo/pull/880) folded in) | [#1065](https://github.com/lambdaclass/stabileo/pull/1065) | with the merge captain: ready 4–6× sooner on a phone (paper 10.8 → 5.5 s, tool 20.3 → 3.7 s), paper shift 0.38 → 0.13; needs the user's OK on four new route budgets, the per-language chunk rule and ~14 MB of .br per release |
| Basic course, units 1 to 7: six stacked module PRs with the review fixes, replacing [#1070](https://github.com/lambdaclass/stabileo/pull/1070) and the unreviewed [#871](https://github.com/lambdaclass/stabileo/pull/871) (section 0) | [#1302](https://github.com/lambdaclass/stabileo/pull/1302) shell and shared modules, [#1303](https://github.com/lambdaclass/stabileo/pull/1303) statics and force method, [#1304](https://github.com/lambdaclass/stabileo/pull/1304) influence lines, [#1305](https://github.com/lambdaclass/stabileo/pull/1305) second order and buckling, [#1306](https://github.com/lambdaclass/stabileo/pull/1306) plastic, [#1307](https://github.com/lambdaclass/stabileo/pull/1307) dynamics (SDOF/MDOF) | drafts; to rebase on main now that [#1372](https://github.com/lambdaclass/stabileo/pull/1372) has landed; [#1302](https://github.com/lambdaclass/stabileo/pull/1302) makes the course a lazy route boundary (as [#1289](https://github.com/lambdaclass/stabileo/pull/1289) does for the blog), so each module stays within 128 B. #1070 to close as superseded (user) |
| Roadmap, CHANGELOG fragments and the website changelog (week to 2026-11-06), with the changelog counts fix [#1222](https://github.com/lambdaclass/stabileo/pull/1222) | [#1384](https://github.com/lambdaclass/stabileo/pull/1384) | supersedes [#1228](https://github.com/lambdaclass/stabileo/pull/1228), [#1231](https://github.com/lambdaclass/stabileo/pull/1231), [#1244](https://github.com/lambdaclass/stabileo/pull/1244), [#1292](https://github.com/lambdaclass/stabileo/pull/1292) and [#1294](https://github.com/lambdaclass/stabileo/pull/1294) |
| Blog: Research, Tools and checking our tests; blog images | [#1293](https://github.com/lambdaclass/stabileo/pull/1293) (carries #882) | open; it waited for the lazy blog ([#1290](https://github.com/lambdaclass/stabileo/pull/1290)), which has landed |
| Blog: posts on the JAIE 2026 and Experiencia TIIC 2026 talks, with photos | [#1338](https://github.com/lambdaclass/stabileo/pull/1338) | draft |
| Accounts: terms, usage data, cloud projects, admin site; advertising measurement on top | [#1071](https://github.com/lambdaclass/stabileo/pull/1071), [#1251](https://github.com/lambdaclass/stabileo/pull/1251) | Codex clean. **Decision:** owner OK on the legal text, company line, usage sharing on by default |
| Research round 2: the review fixes of the live papers, one integration | [#1068](https://github.com/lambdaclass/stabileo/pull/1068) (17 PRs: [#884](https://github.com/lambdaclass/stabileo/pull/884), [#885](https://github.com/lambdaclass/stabileo/pull/885), [#889](https://github.com/lambdaclass/stabileo/pull/889), [#891](https://github.com/lambdaclass/stabileo/pull/891), [#893](https://github.com/lambdaclass/stabileo/pull/893)–[#899](https://github.com/lambdaclass/stabileo/pull/899), [#901](https://github.com/lambdaclass/stabileo/pull/901), [#902](https://github.com/lambdaclass/stabileo/pull/902), [#986](https://github.com/lambdaclass/stabileo/pull/986), [#987](https://github.com/lambdaclass/stabileo/pull/987), [#988](https://github.com/lambdaclass/stabileo/pull/988), [#882](https://github.com/lambdaclass/stabileo/pull/882)) | draft; none of the 17 is on main yet |
| Research papers indexable; research and tools SEO | [#988](https://github.com/lambdaclass/stabileo/pull/988), [#881](https://github.com/lambdaclass/stabileo/pull/881) | open |
| Research frozen versions | [#777](https://github.com/lambdaclass/stabileo/pull/777) | **Decision:** host approval and DNS for `snapshots.stabileo.com` |
| Research on phones and tablets | [#831](https://github.com/lambdaclass/stabileo/pull/831) | lands after [#1068](https://github.com/lambdaclass/stabileo/pull/1068) |
| One file per paper | [#844](https://github.com/lambdaclass/stabileo/pull/844) | merges last |
| SEO positioning; pricing copy | [#851](https://github.com/lambdaclass/stabileo/pull/851), [#850](https://github.com/lambdaclass/stabileo/pull/850) | **Decision:** owner OK on the pricing claims; [#851](https://github.com/lambdaclass/stabileo/pull/851) reduced after [#850](https://github.com/lambdaclass/stabileo/pull/850) |
| Landing: more about Stabileo AI | [#1061](https://github.com/lambdaclass/stabileo/pull/1061) | **Decision:** owner OK on the text |
| AI assistant with your own key (interim) | [#1064](https://github.com/lambdaclass/stabileo/pull/1064) | draft |
| Review scripts; perf ratchet | [#842](https://github.com/lambdaclass/stabileo/pull/842), [#768](https://github.com/lambdaclass/stabileo/pull/768) | **Decision:** reviewer sandbox; [#768](https://github.com/lambdaclass/stabileo/pull/768)'s 64-byte margin |
| Desktop app | [#785](https://github.com/lambdaclass/stabileo/pull/785), [#663](https://github.com/lambdaclass/stabileo/pull/663) | **Decision:** close or keep [#785](https://github.com/lambdaclass/stabileo/pull/785) as tracking |
| Roadmap | this file | kept current by small docs PRs |

## Later: deferred follow-ups (2026-11-03)

Decided for later, so that nothing is forgotten. Each one moves to the tables above when it starts.

**Safety (wrong results first)**

- **[#1341](https://github.com/lambdaclass/stabileo/pull/1341) without a results version:** summing combination cases in a fixed order can move a
  combined force in its last digit and flip a marginal detailing decision, but no snapshot changed, so
  nothing was registered. Decide whether it needs a results version and a re-check notice.
- **#1255 statics verdict** (high-effort Codex): `statics-check.ts:65` reports "unbalanced" from a
  residual over incomplete load sums, so a balanced case with an omitted surface load can be flagged
  (a false alarm, never a false pass); return partial whenever loads are left out.
- **Fiber nonlinear with constraints** (#1296): compute the constraint multipliers so the
  equilibrium gate can check constrained models, then lift the refusal.
- **Static self-check floor** ([#865](https://github.com/lambdaclass/stabileo/pull/865), found on [#1285](https://github.com/lambdaclass/stabileo/pull/1285)): `engine/src/solver/self_checks.rs` floors the
  balance force scale at 1 kN, so the imbalance is compared with 1e-3 × 1 kN: a load below
  1e-3 kN left fully unbalanced passes (applied 1e-4 kN, reactions 0, imbalance 1e-4 < 1e-3).
  Scale by max(|F|, |M|/L) with reaction moments and model extent; keep the pure-moment model
  (`prop_maxwell_betti`) as a regression and add that 1e-4 kN case as the one that must start
  failing.
- **Wave B leftovers** ([#1285](https://github.com/lambdaclass/stabileo/pull/1285); visible refusals, not wrong results): `lanczos.rs` refuses a valid
  PSD pencil because `exactly_massless` tests a rounded vector exactly; `sturm_count_above` retries
  at only three fixed cutoffs, so clustered eigenvalues refuse; every-step finiteness of the
  internal u, v, a vectors in `time_integration.rs` ([#1239](https://github.com/lambdaclass/stabileo/pull/1239)'s owner).
- **[#798](https://github.com/lambdaclass/stabileo/issues/798):** narrow `SH-MITC4-DISTORTION`; it withholds hemisphere, hypar and spherical-cap meshes
  within 2% of their references (user, 2026-11-02: ship [#807](https://github.com/lambdaclass/stabileo/pull/807) as is).
- **[#458](https://github.com/lambdaclass/stabileo/issues/458) and [#762](https://github.com/lambdaclass/stabileo/issues/762):** near-mechanisms warn today; refuse versus warn is its own solver change.
- **[#1238](https://github.com/lambdaclass/stabileo/issues/1238) real fix:** carry each member's in-plane axis through the 3D→2D cut so default-oriented I
  columns in Y–Z cuts solve instead of being refused.
- **CIRSOC 201 `flexure_at`** deducts displaced concrete for top bars below the stress block (about
  0.03% unconservative; found by the [#534](https://github.com/lambdaclass/stabileo/issues/534) work). Issue to file, then fix.
- **MITC9 too stiff on twisted coarse meshes** (noted on [#1074](https://github.com/lambdaclass/stabileo/pull/1074)): no warning yet; add containment.
- **[#532](https://github.com/lambdaclass/stabileo/issues/532) leftovers** (outside [#1233](https://github.com/lambdaclass/stabileo/pull/1233)): the Excel import and the IFC mapper treat iz as the strong
  axis (fix in [#1310](https://github.com/lambdaclass/stabileo/pull/1310), draft, stacked on #1233; live on main, SA-2026-039, also in the safety table); aluminium weak-axis shear unchecked (fix in [#1326](https://github.com/lambdaclass/stabileo/pull/1326), draft); the joint-typology check drops Mz (fix in [#1328](https://github.com/lambdaclass/stabileo/pull/1328), draft: weak-axis moments refused); Muy not amplified
  for column slenderness. Grok's nits: the secondary-shear row lacks its combination name,
  `v_strong` serializes as "vy", "Shear G6" used for RHS (AISC G4), the registry's `when` also
  flags beam-only CIRSOC 201 models.
- **[#1246](https://github.com/lambdaclass/stabileo/pull/1246) leftovers:** a material with only `fc` reads as unknown (unreachable from the UI today);
  a material with no modulus is read as concrete; the oracle prints the uncapped CHS Q; Qa printed
  to 3 decimals.
- **[#1247](https://github.com/lambdaclass/stabileo/pull/1247) leftovers:** the static solve of the [#338](https://github.com/lambdaclass/stabileo/issues/338) model only warns (should refuse like modal);
  the dense eigensolver loses the zero mode of a 1 mm seesaw beside geometry 1e4 m away (issue to
  file); Newmark trapezoidal overshoot on massless DOFs when dt ≥ 2·a1 (documented in SA-2026-031,
  not fixed); Rayleigh damping (`damping.rs`) ignores modes with 0 < ω² ≤ 1e-10 (use modal.rs's
  scale-relative zero test); the app calls a free spin a mechanism; the Turkish term; [#1225](https://github.com/lambdaclass/stabileo/pull/1225)'s
  completeness message.
- **Share links** ([#1058](https://github.com/lambdaclass/stabileo/pull/1058)): allow-list support types and spring values; refuse coincident or
  collinear shell corners; require positive e, a and thickness; `referencesResolve` in
  `share-snapshot.ts` must check that `factors` is an array; the stadium canopy keeps an unused
  earthquake case.
- **Issues to file for the record:** the shell envelope bug ([#1237](https://github.com/lambdaclass/stabileo/pull/1237)), the time-history NaN ([#1239](https://github.com/lambdaclass/stabileo/pull/1239)),
  the Frame3DD modal mismatch `modal3d-758065`.
- **Outside-review items not started:** unknown wire fields typed one by one; a nonlinear
  equilibrium gate (P-Δ, contact [#432](https://github.com/lambdaclass/stabileo/issues/432), fiber [#433](https://github.com/lambdaclass/stabileo/issues/433), cable export dropping `converged`); solver worker
  hang and respawn; research crate lists from `research/papers.yaml`; the TypeScript pre-solve
  rewritten in Rust; the [#458](https://github.com/lambdaclass/stabileo/issues/458) Lean gap; touch input (.mrp, tablets); faster tests.
- **`docs/verification/MATURITY.md`** is stale: regenerate; retriage [#810](https://github.com/lambdaclass/stabileo/issues/810) and [#742](https://github.com/lambdaclass/stabileo/issues/742); close [#755](https://github.com/lambdaclass/stabileo/issues/755).

**Product**

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
- **Merge order:** [#831](https://github.com/lambdaclass/stabileo/pull/831) after [#1068](https://github.com/lambdaclass/stabileo/pull/1068); [#851](https://github.com/lambdaclass/stabileo/pull/851) after [#1066](https://github.com/lambdaclass/stabileo/pull/1066) and [#850](https://github.com/lambdaclass/stabileo/pull/850); [#844](https://github.com/lambdaclass/stabileo/pull/844) last.

**CI and infrastructure**

- **Per-route product budgets** (open user question): 128 B per route nearly freezes product work.
- **Restore after wave B:** route budgets back to 128 B and the exact-value assertion in
  `research-route-budget.test.mjs` restored.
- **Nightly harness noise** (zero-displacement floor, time-history Lanczos tolerance, eigen-gap,
  warned plastic bounds inconclusive): in progress; #1299's same-model time-history budgets
  (2e-9 to 8e-9) can be dropped where both runs share the pencil. Issue closures wait for the user.
- **Vite build parse error:** es-module-lexer reads a minified `of` followed by `/` as a regex and
  fails the E2E build (hit on [#1070](https://github.com/lambdaclass/stabileo/pull/1070), worked around). Bump es-module-lexer or Vite, or add a guard.
- **Hosted-runner Nix flakiness:** Magic Nix Cache HTTP 418 and dropped cache.nixos.org downloads;
  move those jobs to self-hosted runners or add a substituter retry.
- **Runners:** wall-clock budgets on `stabileo-timing` for main and nightly; remove the borrowed
  `stabileo` label from sgha9–14; full `apply.sh` (sgha1–6 into pools) and the system upgrade;
  `stabileo-pr` on sgha1–5; the watchdog token; `STABILEO_E2E_POOL` (refused to agents).
- **Secrets:** `REVERT_BOT_TOKEN` and `NTFY_TOPIC` for [#1226](https://github.com/lambdaclass/stabileo/pull/1226); Lean, symbolic and Kani as required
  checks in both rulesets ([#1235](https://github.com/lambdaclass/stabileo/pull/1235) landed).
- **Mutants rotation:** the weekly check fails until 16 nights of markers exist ([#1240](https://github.com/lambdaclass/stabileo/pull/1240)).
- **[#768](https://github.com/lambdaclass/stabileo/pull/768):** strict 64-byte margin or wider.
- **Agent hygiene:** a unique scratchpad log name per agent.
- **Changelog fragments still missing** (list under "Verified review: later and housekeeping").

## Purpose

This is the product roadmap: app features, market sequencing, design/reporting layers, and distribution strategy. It is not the solver mechanics roadmap — for that, see `SOLVER_ROADMAP.md`. Historical progress belongs in `CHANGELOG.md`. This document should stay forward-looking.

For the expanding AI track, see [`AI_ROADMAP.md`](AI_ROADMAP.md).

## Vision

Become the world's best structural engineering software — open-source, browser-based, zero-install. First: match the analytical power of OpenSees/Code_Aster/CalculiX with an accessible visual UX. Then: add design deliverables, diagnostics, and AI-assisted guidance. Later: real-time CRDT collaboration (the Figma moment) and full AI-native design.

Strategic positioning:
- not `broader than every open-source mechanics framework`
- but `the strongest open structural solver product with the clearest visible proof of correctness, the best workflow automation, and the best browser-native UX`

## Competitive Moat

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
10. **Certified results** — linear, modal, buckling, P-Delta, spectral, harmonic, time-history and plastic results and the AISC/EC3/EC2 checks carry machine-checkable error bounds (`docs/verification/CERTIFY.md`), re-checkable in Lean; no commercial package proves its answers

## Product Thesis

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

## Overall order (2026-11-01)

Status as of 2026-11-01. Open decisions:

- Put a CDN in front of the site (Cloudflare proxy and HTML edge caching, with purge on deploy).
- Set the page-size budget for product (non-research) changes; the gate exists at 128 B per route.

1. **Safety first.** Close the ways a wrong result can reach users: containment of every open
   wrong-result issue (#447), the fixes in "Priority now" below, the metamorphic invariance suite,
   independent engineer sign-off, and prevention (section "Prevention": results that check
   themselves, invariance tests everywhere, nightly bug hunting, units in the type system,
   trustworthy benchmarks). After the 2026-10-30 research and Tools deployment, most capacity returns here. Growth multiplies whatever is there, including wrong results; one
   public mistake costs more than any number of good pages earn. Security belongs here too: backend
   security tests and a tested backup restore (#721), staging before production (#724), the policy for
   outside contributions (#726), supply-chain pinning, and isolation of anything that runs untrusted or
   old code (research snapshots on their own origin, #777).
2. **Speed and the first run.** Public pages and the app load fast (Lighthouse performance ≥ 90 on
   public pages; the app today scores 25, #734) and a new visitor builds and solves a first model in
   under a minute with a guided start. Cheap, and it multiplies every growth channel below.
3. **A Python package and API** (`pip install stabileo`, notebook-friendly, the same engine as the app,
   built on the versioned engine interface #731): models built and solved from scripts and notebooks,
   results as arrays, the same refusals and known-issue warnings as the app. Researchers, automation and
   parametric design build on Stabileo; every benchmark, paper and tool becomes scriptable.
4. **A public verification manual,** generated from the engine benchmarks, the metamorphic suite and the
   certificates: every case runnable in the browser, failures shown honestly, always current. A trust
   asset no commercial PDF manual matches, and it ranks for "verification" searches.
5. **Import from the programs engineers already use** (SAP2000 `.s2k`, ETABS `.e2k`, IFC, DXF) and
   export reports they can hand in: removes the biggest switching cost.
6. **Latin American codes:** NBR (Brazil), NSR-10 (Colombia), NTE E.030/E.060 (Peru), NCh (Chile) next to
   CIRSOC, each with independent sign-off (#450): the obvious choice in a region served poorly and
   expensively.

7. **The AI assistant stage,** after safety, speed and the growth and SEO work above, so it lands on
   trustworthy results and an audience that's already there (capabilities, order and safety rules in
   [AI_ROADMAP.md](AI_ROADMAP.md)): describe a structure or upload a sketch, plan or PDF and get a model;
   explain results and warnings; check a model for common mistakes; drive Stabileo through the Python
   API. Every AI suggestion is a model or a change the user sees and the engine solves and verifies;
   the AI is never the authority on a result, and it shows the same known-issue warnings and refusals.
   This is when "AI" moves from "coming" to the centre of the positioning.

**Growth channels, alongside:** Stabileo Research, Stabileo Tools and shared models (section "Growth"
below), with search work, previews, phone and tablet quality and frozen citable versions as multipliers.
**Supporting:** universities when there's capacity (free classroom accounts, assignments as forkable models, textbook problems as examples); a community (forum or Discord, model of the week, short walkthrough videos, university
webinars), institutions (professional councils, INTI/CIRSOC, Ergodic Group's network),
privacy-respecting analytics to see which tools, papers and shares turn into engineers who return, and
and outreach to engineers and paper authors.

### Speed: measured 2026-10-30

From South America: about 0.8 s to first byte and 1.3–1.7 s to first paint. The site has one
server in Nuremberg and no CDN. DNS is already on Cloudflare, but is not proxied. Clicking Research
or Tools leaves a completely white page for 1–2 s: about 670 KB of page code loads only after the click.

PR [#880](https://github.com/lambdaclass/stabileo/pull/880) (`perf/public-nav-instant`, open): the old page stays until the new one is
ready, prefetch on hover, focus, touch and idle, and experiment and viewer code load lazily (the Research
entry goes from 658.5 KB to 8.1 KB gzip, Tools from 33.0 KB to 12.8 KB). Scroll resets to the top on
every public navigation, so research pages no longer open scrolled to the bottom. The same PR makes
the public header persistent: it never unmounts or changes size (on production it disappears for
0.5–1.3 s and comes back 58 vs 67 px high). The Cloudflare proxy and HTML edge caching decision is pending; expected first byte is
about 0.1 s, with purge on deploy.

## Priority now: catch wrong results before they ship (2026-10-30)

Before new features, close the ways a wrong result can still reach users unnoticed. Each gap below
was exposed in the week of 2026-10-21: a steel verdict change merged with no changelog or re-check
entry (#461), the nightly verification failing four days with nobody told, a raw i18n key shown as
a project name. These items come first in every section below; work on new features goes after
them.

| Order | Item | Issue | Section |
|---|---|---|---|
| 1 | **Results snapshot gate:** a reference corpus solved on every PR; any changed number, verdict or refusal fails CI unless the PR registers the result change | [#716](https://github.com/lambdaclass/stabileo/issues/716) | Release safety |
| 2 | **Nightly verification that is green and alerts:** fix the runs failing since 2026-10-24; every scheduled failure opens an issue | [#717](https://github.com/lambdaclass/stabileo/issues/717), [#354](https://github.com/lambdaclass/stabileo/issues/354) | Trust and verification |
| 3 | **Old project files:** a corpus saved by every release and file format; each opens, migrates and gives the same results | [#718](https://github.com/lambdaclass/stabileo/issues/718), PR [#770](https://github.com/lambdaclass/stabileo/pull/770) | Release safety |
| 4 | **Design checks against published worked examples,** chosen and signed off by an independent structural engineer (code manuals, INTI/CIRSOC example books, textbooks) | [#450](https://github.com/lambdaclass/stabileo/issues/450), [#360](https://github.com/lambdaclass/stabileo/issues/360) | Trust and verification |
| 5 | **No raw i18n key visible,** web and desktop, every language | [#719](https://github.com/lambdaclass/stabileo/issues/719) | Release safety |
| 6 | **Production health check** after every deploy and hourly (stabileo.com and staging) | [#720](https://github.com/lambdaclass/stabileo/issues/720) | Release safety |
| 7 | **Backend security tests and a tested backup restore** | [#721](https://github.com/lambdaclass/stabileo/issues/721) | Release safety |
| 8 | **Exported documents:** visual regression for PDF reports, DXF drawings and exports | [#722](https://github.com/lambdaclass/stabileo/issues/722) | Trust and verification |
| 9 | **Desktop app:** install scripts, update from one version to the next, launch on each OS (macOS by hand: no WebDriver for its webview) | PR [#663](https://github.com/lambdaclass/stabileo/pull/663) | Release safety |
| 10 | **Staging before production:** each main commit deploys to staging, passes the health check, then the same build is promoted | [#724](https://github.com/lambdaclass/stabileo/issues/724) | Release safety |
| 11 | **Review before merge, enforced:** CODEOWNERS, a second reviewer for result and verdict changes, a check that every required check still exists, and a merge queue that only maintainers can enqueue into (with a required approving review): [#871](https://github.com/lambdaclass/stabileo/pull/871) and [#1250](https://github.com/lambdaclass/stabileo/pull/1250) were enqueued directly on 2026-11-04 and merged without review | [#725](https://github.com/lambdaclass/stabileo/issues/725), [#470](https://github.com/lambdaclass/stabileo/issues/470), [#355](https://github.com/lambdaclass/stabileo/issues/355) | Release safety |
| 12 | **Policy for outside contributions:** bounty-style and AI-generated PRs, duplicates, credit, re-implementing low-trust fixes | [#726](https://github.com/lambdaclass/stabileo/issues/726) | Release safety |
| 13 | **Safety advisories emailed** to affected users once accounts exist | [#727](https://github.com/lambdaclass/stabileo/issues/727) | Release safety |
| 14 | **MITC4 shells under in-plane bending on distorted meshes** are about 10× too stiff (MacNeal–Harder: −92% trapezoidal, −90% parallelogram; regular meshes within 2%). First register it and warn users when such elements are distorted, then fix the membrane (enhanced/incompatible modes or a drilling membrane) with result-change registration. Found by the research benchmark page (#797) | [#798](https://github.com/lambdaclass/stabileo/issues/798) | Trust and verification |
| 15 | **MITC4 and MITC9 shells too flexible on warped (twisted) geometry,** silently (MITC4 1.32×, MITC9 up to 2.4× on the 90° twisted beam). First contain it (a known-issue warning or refusal for warped elements beyond a measured threshold, with tests), then fix the warped-element formulation with result-change registration. Found by the benchmark test fixes (PR #1056) | [#1057](https://github.com/lambdaclass/stabileo/issues/1057) | Trust and verification |
| 16 | **P0, confirmed by the verified review of 2026-11-02: 3D design-demand axis mapping.** Certified design checks and 3D demand extraction (`certify/design.rs`, `postprocess/design_demands.rs`) read the lateral `shearY`/`momentZ` instead of strong-axis `shearZ`/`momentY`, and the live CIRSOC 201 column design checked Mz over the depth (up to 36% short of steel). Confirmed with hand-checked cases and fixed in our own PR [#1233](https://github.com/lambdaclass/stabileo/pull/1233) with result-change registration (results version 7, advisory SA-2026-029); see "Priority now". PR #533 is from an outside contributor whose code we don't merge: a lead only | [#532](https://github.com/lambdaclass/stabileo/issues/532) | Trust and verification |

**Status of the safety work (2026-11-04):**

| Item | Issue / PR | State |
|---|---|---|
| Contain every open wrong-result issue (warn or refuse; no number changes) | [#447](https://github.com/lambdaclass/stabileo/issues/447) / PR [#807](https://github.com/lambdaclass/stabileo/pull/807) | **open** (draft); [#1232](https://github.com/lambdaclass/stabileo/pull/1232) (P0 containment gaps: [#426](https://github.com/lambdaclass/stabileo/issues/426), [#458](https://github.com/lambdaclass/stabileo/issues/458), [#466](https://github.com/lambdaclass/stabileo/issues/466), [#798](https://github.com/lambdaclass/stabileo/issues/798), [#1057](https://github.com/lambdaclass/stabileo/issues/1057)) and [#1074](https://github.com/lambdaclass/stabileo/pull/1074) (warped MITC4/MITC9) are merged into its branch and reach main with it; then the per-defect fixes in "Priority now" remove its warnings one by one |
| Metamorphic invariance suite | PR [#813](https://github.com/lambdaclass/stabileo/pull/813) | landed |
| Invariance tests everywhere, slice 1 (stiffness scaling for six analyses; fast and nightly tiers) | PR [#860](https://github.com/lambdaclass/stabileo/pull/860) via [#1060](https://github.com/lambdaclass/stabileo/pull/1060) | landed (wave A); next slices: constrained plastic collapse ([#758](https://github.com/lambdaclass/stabileo/issues/758)), dynamic reciprocity, mechanism classification ([#762](https://github.com/lambdaclass/stabileo/issues/762)), modal and buckling breadth |
| Old project files open, migrate and give the same results | [#718](https://github.com/lambdaclass/stabileo/issues/718) / PR [#770](https://github.com/lambdaclass/stabileo/pull/770) | landed (wave B, with the newer-version refusal); next: edge files, real users' files, the migration fingerprint with material strengths ([#1318](https://github.com/lambdaclass/stabileo/issues/1318)) |
| Results snapshot gate, review fixes | PR [#786](https://github.com/lambdaclass/stabileo/pull/786) | landed (wave B) |
| Buckling factor outside its certified bounds no longer certified | [#741](https://github.com/lambdaclass/stabileo/issues/741) / PR [#817](https://github.com/lambdaclass/stabileo/pull/817) | landed (wave A, results version 6); close [#741](https://github.com/lambdaclass/stabileo/issues/741); follow-up [#818](https://github.com/lambdaclass/stabileo/issues/818) |
| Modal analysis skipped repeated modes of symmetric structures | [#759](https://github.com/lambdaclass/stabileo/issues/759) / PR [#827](https://github.com/lambdaclass/stabileo/pull/827) | landed (wave B, results version 9); close [#759](https://github.com/lambdaclass/stabileo/issues/759) |
| Self-checking results, slice 1 (static and modal) | PR [#865](https://github.com/lambdaclass/stabileo/pull/865) | landed (wave B, results version 10); next: buckling, time history and design checks |
| Shell envelope per component, not the von Mises record | PR [#1237](https://github.com/lambdaclass/stabileo/pull/1237) | landed (wave B, results version 11, SA-2026-027) |
| Time history refuses non-finite results | PR [#1239](https://github.com/lambdaclass/stabileo/pull/1239) | landed (wave B) |
| Units in the type system, slice 1 (2D frame material and section path) | PR [#864](https://github.com/lambdaclass/stabileo/pull/864) | landed (wave A); next slices: 3D, loads, design |
| Benchmark test correctness (wrong references and models fixed, strict `assert_close`) | PR [#1056](https://github.com/lambdaclass/stabileo/pull/1056) | landed (wave A); follow-up: the Raasch hook tests may have the same E unit error |
| Envelopes never return non-finite values | [#1350](https://github.com/lambdaclass/stabileo/issues/1350) / PR [#1379](https://github.com/lambdaclass/stabileo/pull/1379) | open, ready |
| 2D plastic collapse factor not invariant | [#758](https://github.com/lambdaclass/stabileo/issues/758) | needs a redesign of mechanism detection; refused until then |
| MITC4 in-plane bending on distorted meshes | [#798](https://github.com/lambdaclass/stabileo/issues/798) | refused by [#807](https://github.com/lambdaclass/stabileo/pull/807) once it lands; membrane fix not started |
| MITC4 and MITC9 too flexible on warped geometry | [#1057](https://github.com/lambdaclass/stabileo/issues/1057) | refused by [#807](https://github.com/lambdaclass/stabileo/pull/807) (with [#1074](https://github.com/lambdaclass/stabileo/pull/1074)) once it lands; formulation fix not started |

The nightly dry run (PR [#861](https://github.com/lambdaclass/stabileo/pull/861)) found two root causes. Rotated or mirrored models are
refused although the original is accepted: input consistency. Singular/eigen failures appear only
after unit scaling, mirroring or rotation, consistent with [#762](https://github.com/lambdaclass/stabileo/issues/762). Each gets its own issue.

Reviews: Codex plus Kimi first (scripts/review, PR [#842](https://github.com/lambdaclass/stabileo/pull/842)); Grok only as a fallback when Kimi
is unavailable, and Kimi is added to that round when it returns. Research and Tools ship first and are
reviewed after they go live; safety, engine and app changes need two reviews before main.

Needs people, not only code: item 4's engineer sign-off; real users' project files for item 3's
corpus; production access for item 7's restore test; testers on real Linux GPUs for the desktop's
3D viewer.

## Prevention: fewer safety problems (2026-10-30)

What found the wrong results so far: the invariance (metamorphic) tests (#758, #760, #762), fuzzing
(#741), a mass-orthogonality check (#759) and the research benchmarks. Prevention is doing more of
what works, all the time, and making every test trustworthy. Started 2026-10-29; progress below.

| # | Item | Why | Workstream |
|---|---|---|---|
| 1 | **Every result checks itself before it is shown.** Statics: reactions balance the loads, small residual. Modal: mass-orthogonal modes and per-mode residual. Buckling: factor equals the mode's Rayleigh quotient. Time history: energy balance, reciprocity spot check. Nonlinear: the reported load factor's residual is below tolerance. Plastic collapse: mechanism equilibrium. A failed check warns or refuses (containment) instead of showing a number. | Turns unknown wrong results into visible refusals; would have caught #759, #760, #432, #433 at runtime | slice 1: PR [#865](https://github.com/lambdaclass/stabileo/pull/865), in review |
| 2 | **Invariance tests on every analysis type and the whole model corpus:** renumbering, member direction, units, rigid motion, mirror symmetry, E scaling, superposition, reciprocity. Fast subset on every PR; exhaustive tier nightly. | Needs no reference values; found three of the worst bugs | suite PR [#813](https://github.com/lambdaclass/stabileo/pull/813) merged; everywhere slice 1 (stiffness scaling, six analyses): PR [#860](https://github.com/lambdaclass/stabileo/pull/860), merged into the stacked branch, still to reach main |
| 3 | **Nightly bug hunting on our own runners** (stabileo-ci-1's 6 runners, idle at night): random models through the invariance tests, differential runs (OpenSees, Code_Aster), fuzzing at high case counts; each distinct finding opens its own issue with the seed and a minimal model. Trusted events only. | Bugs found by the machine at night, not by users | PR [#861](https://github.com/lambdaclass/stabileo/pull/861), merged 2026-10-30 |
| 4 | **Mutation gate on changed engine code:** a PR may not add surviving mutants in the engine code it touches; the backlog (#745–#752, ~1,960 mutants) is cleared in parallel. | Stops test gaps from growing | next |
| 5 | **Trustworthy benchmarks** (the test-correctness program below) | A wrong test cries wolf or, worse, passes a wrong engine | slice 1: PR [#862](https://github.com/lambdaclass/stabileo/pull/862), merged; test fixes: PR [#1056](https://github.com/lambdaclass/stabileo/pull/1056), open (48 wrong references fixed; found #1057) |
| 6 | **New analysis types ship as experimental** (labelled, contained) until they have self-checks, invariance tests and two-source benchmarks. | Nothing new reaches users unverified | next |
| 7 | **Units in the type system (#359)** — crucial: zero-cost unit types in Rust at the engine boundary first (wire format and results unchanged), then inward; branded TypeScript types at the UI → engine boundary; mixing units is a compile error. | Removes a whole class of bugs (#758 and #762 depend on units) | slice 1: PR [#864](https://github.com/lambdaclass/stabileo/pull/864), in review; crucial |

**Test-correctness program (item 5).** Four suspected engine bugs across [#845](https://github.com/lambdaclass/stabileo/issues/845),
[#846](https://github.com/lambdaclass/stabileo/issues/846), [#810](https://github.com/lambdaclass/stabileo/issues/810) and the earlier investigations were test-model errors.
Keep the independent-solver triage rule. Every benchmark must therefore:

1. **Be a spec, not a hand-built model:** a data file (geometry, material, supports, symmetry planes,
   loads, measured quantity, each with source, page and table) turned into a model by one shared,
   tested generator.
2. **Have two independent references that agree before it is admitted:** the paper's value and an
   exact solution, a textbook formula or an independent program (OpenSees, Code_Aster, CalculiX) on
   the same spec.
3. **Pass automatic model checks before any comparison:** total applied load equals the analytic value;
   reactions balance the loads; a symmetric quarter model matches the full model; exactly the expected
   rigid-body modes.
4. **Show convergence, not one mesh:** three or more meshes, the error must shrink, and a Richardson
   estimate of the converged value is compared. A plateau or a growing error flags the model or the
   reference, not the engine.
5. **Triage by an independent solver:** Stabileo and OpenSees agree but miss the reference → suspect
   the reference or model; they disagree → suspect the engine.
6. **Prove it can fail:** mutants of the engine must make it fail; a benchmark that passes a broken
   engine (e.g. absolute-value comparisons) tests nothing. Signed quantities always.
7. **Justify every tolerance** from the convergence study or the reference's precision, written next
   to it; provisional references are informational only, never pass/fail.
8. **Reference audit in review:** numbers checked against the source text page by page; a CI lint
   rejects a benchmark without spec, two references, model checks or convergence study.
PR [#1056](https://github.com/lambdaclass/stabileo/pull/1056) applied rules 6 and 7 to the existing suite: strictly relative comparisons exposed
48 wrong references or models, and fixing the twisted beam's units turned a documented "locking"
into a real engine finding ([#1057](https://github.com/lambdaclass/stabileo/issues/1057)).
Every investigation keeps a written numbers report (e.g. docs/audits/810-mitc4-curved-shells.md), so a
real engine bug is never waved off as a test problem either.

Further, to make the tests themselves trustworthy:

9. **Double-entry specs:** two agents build each benchmark spec independently from the paper text,
   without seeing each other's work, and the specs must match field by field before admission. Modelling
   slips (an extra support, a missing symmetry, a frame for a truss) rarely survive two independent builds.
10. **One source of truth per reference,** shared by the engine tests, the research pages and the
    verification manual; a check fails if any copy differs, so a correction reaches every place at once
    (on 2026-10-29 the shell obstacle course page still carried the models the engine test had fixed).
11. **Independent engineer sign-off on the core reference set** (the ~30 classic benchmarks most trust
    rests on), extending #450 from design checks to analysis benchmarks.
12. **Skipped tests expire:** every test ignored as a known wrong result names its issue and a review
    date; past the date it fails CI, so known failures cannot sit unnoticed.
13. **Allow last-ulp differences:** fixture and JSON comparisons must allow the last-ulp differences
    between macOS and Linux libm (PR [#859](https://github.com/lambdaclass/stabileo/pull/859)).
14. **Test refusals as refusals:** when containment withholds a result, the page must say so and its
    checks must assert that refusal, not fail because a number is absent.

## Multipliers

> **Backlog conventions.** The five backlog sections below (Multipliers, Trust and verification, Engineering coverage, Solver and proof depth, Release safety) are the single backlog. Every item links to its GitHub issue; the tracker is [#396](https://github.com/lambdaclass/stabileo/issues/396). Each section ends with **exit criteria** (when the section is done) and the **metrics** that track them. The metrics are computed by `scripts/verification-metrics.py` and published on the verification [dashboard](../verification/DASHBOARD.md) (current values and per-release history); a metric that cannot be measured yet says "not yet measured" there, never an estimate. Per-item verification levels are in [MATURITY.md](../verification/MATURITY.md). Entry point for all roadmap documents: [README.md](README.md).

The Product Thesis orders what to build for firms to buy. This section ranks what would make the product an order of magnitude more useful, not incrementally better. Engineers spend most of their time modelling, iterating and documenting, not waiting for a solver, so the multipliers are workflow, not numerics. Each builds on verification: none is worth shipping on results that can be silently wrong.

1. **Drawings / BIM → analytical model.** [#344](https://github.com/lambdaclass/stabileo/issues/344) Import IFC (then Revit via IFC, DWG, PDF plans) and propose the analytical model: structural vs architectural elements, centrelines and surfaces snapped to grids, sections, supports, and loads from room uses (CIRSOC 101). Every inference is listed as an assumption the engineer accepts or fixes, never applied silently; the model sanity review then checks it. Modelling goes from days to minutes; the engineer judges assumptions instead of drafting lines.
   *Exists:* `web/src/lib/ifc/` (IFC parse and mapping), `web/src/lib/cad/` (DXF plan wizard, opt-in inferences recorded as assumptions), `web/src/lib/ai/` (`build-model`). *Missing:* one guided import → assumptions → sanity review → analyse flow, real-world idealisation (offsets, members that don't meet, walls with openings), loads from room uses, PDF/vision, and a measured corpus of architect files vs engineer-built models. Related: Interoperability in Phase 2, `sketch-to-model` in the AI roadmap.

2. **AI senior-engineer reviewer.** [#345](https://github.com/lambdaclass/stabileo/issues/345) Most real failures are conceptual (load path, ignored stiff elements, drift near the limit, a poor structural system), not arithmetic. A reviewer that reads model and results like a senior engineer scales that judgment to every project. Built on the model sanity review (reactions vs loads, weight per m², period vs code formula, tributary cross-checks, unit and plausibility checks). Related: `review-model`, `pre-solve-diagnostics` in the AI roadmap.

3. **Certified results as the product.** [#346](https://github.com/lambdaclass/stabileo/issues/346) A report where every number comes with an auditable bound lets building authorities and independent checkers review faster and lowers liability. Extend certificates to CIRSOC 201, ACI RC, timber, CFS and the nonlinear solvers; show a verification status on every result and check using the levels of [MATURITY.md](../verification/MATURITY.md) (Certified > Benchmarked > Differential > Tested > Unverified; [#440](https://github.com/lambdaclass/stabileo/issues/440)); put provenance in reports.

4. **Real-time design iteration and optimisation.** [#347](https://github.com/lambdaclass/stabileo/issues/347) Instant re-analysis plus automatic search over sections and structural systems, minimising cost, steel, concrete or embodied carbon, every candidate passing certified checks; the engineer picks from a Pareto front. Embodied-carbon reporting from the bill of materials comes with it (increasingly mandatory). Related: Automated design iteration in Phase 4, `section-optimizer`.

5. **Existing-building assessment and retrofit.** [#348](https://github.com/lambdaclass/stabileo/issues/348) Latin America has millions of seismically vulnerable buildings, mostly RC frames to old codes. Model from survey, check against the original and current codes, propose retrofits (jacketing, bracing, walls), prioritise portfolios for cities, insurers and banks. Large and underserved.

6. **Latin American codes done properly** [#349](https://github.com/lambdaclass/stabileo/issues/349) — CIRSOC, NSR-10, NTC, NCh, NBR with clause-level traceability; the large vendors treat them as an afterthought.

7. **Model → permit pipeline** [#350](https://github.com/lambdaclass/stabileo/issues/350) — analysis, design, detailing, drawings, bill of materials and an authority-ready calculation report from one model, without re-entry between tools.

8. **Stabileo as an engine for agents** [#351](https://github.com/lambdaclass/stabileo/issues/351) — model building, analysis, checks and certificates exposed as an API / MCP server, so other tools and AI agents can call certified structural analysis.

9. **Collaboration** [#352](https://github.com/lambdaclass/stabileo/issues/352) — versioned, branchable models, comments on members, engineer/checker approvals (see CRDT collaboration).

10. **Digital twin** [#353](https://github.com/lambdaclass/stabileo/issues/353) — sensor data and model updating after construction or an earthquake (see [`../research/beyond_roadmap_opportunities.md`](../research/beyond_roadmap_opportunities.md) §10).

Order of work: 1–3 first (they remove the largest time sink, catch the errors tests cannot, and are unique), then 4–5.

**Exit criteria (Multipliers).** A multiplier is done when it ships in a tagged release and meets its measurable target:

| # | Exit criterion |
|---|---|
| 1 | On a corpus of at least 20 real architect files (IFC/DWG) with engineer-built reference models, the import matches at least 90 % of structural members and supports, every inference appears as an assumption the engineer accepted or fixed (0 applied silently), and the model sanity review passes on the accepted model. Modelling time per project is measured against the manual baseline. |
| 2 | On a corpus of seeded-error models (load path, ignored stiff elements, drift, unit mix-ups, period vs code formula), the reviewer flags at least 90 % of seeded errors with at most one false alarm per clean model; every finding cites the check that produced it. |
| 3 | Every number in the PRO calculation report carries its verification level and provenance; all analyses and design checks used by the report are **Certified** in MATURITY.md, or the report says which are not. |
| 4 | Every candidate on the Pareto front passes certified checks; the optimiser reports cost, steel/concrete quantity and embodied carbon from the bill of materials. |
| 5 | Assessment of an existing RC frame against the original and the current code, with at least one retrofit option, reproduces a published assessment case within its stated tolerance. |
| 6 | Each supported Latin American code has a clause → implementation → test → published-example map enforced in CI (see Trust item 7) with no clause without a test. |
| 7 | One model produces analysis, design, detailing, drawings, bill of materials and an authority-ready report with no re-entry, demonstrated on the acceptance-suite buildings. |
| 8 | The API / MCP server exposes model building, analysis, checks and certificates with the same verification levels as the app, and an agent can reproduce an acceptance-suite case end to end. |
| 9 | Versioned, branchable models with engineer/checker approval recorded in the report. |
| 10 | Model updating from sensor data reproduces a published identification benchmark (e.g. the ASCE SHM benchmark in the acceptance suite) within its tolerance. |

**Metrics.** Backlog issues closed per section (`roadmap:multiplier` count on the [dashboard](../verification/DASHBOARD.md)); per multiplier, the corpus measure in its row above, added to the dashboard when its corpus exists ("not yet measured" until then).

### Trust and verification backlog

What remains after the October 2026 safety wave (certified solver, differential testing against seven solvers, fuzzing and mutation testing, feature matrix, certified design checks, model sanity review). Each item closes a way results can still be silently wrong or a way verification can silently stop working.

1. **Verification jobs that actually run.** [#354](https://github.com/lambdaclass/stabileo/issues/354) (PR [#326](https://github.com/lambdaclass/stabileo/pull/326)) Nightly fuzzing, mutation testing and the Code_Aster / OpenSees / Frame3DD / PyNite / Mystran / Kratos / CalculiX differential jobs run on schedule, and a failure alerts someone (issue or notification). A job that never runs protects nothing.
2. **Protected main.** [#355](https://github.com/lambdaclass/stabileo/issues/355) Required checks (engine, web, e2e, Kani, Lean, symbolic) before merge; CODEOWNERS so solver, certificate and design-check changes need a second reviewer.
3. **Discretization error.** [#356](https://github.com/lambdaclass/stabileo/issues/356) (PR [#327](https://github.com/lambdaclass/stabileo/pull/327)) Certificates bound the algebraic error of the discretized model, not the mesh error. A posteriori estimators (e.g. Zienkiewicz–Zhu) for shells, plates and solids, automatic convergence checks, and a discretization-error estimate shown next to every certified result.
4. **Sensitivity to assumptions.** [#357](https://github.com/lambdaclass/stabileo/issues/357) How much governing results move when uncertain assumptions change (support fixity, cracked-section stiffness modifiers, spring values, connection rigidity), so engineers see which assumptions matter.
5. **Physics invariants on every model (metamorphic testing).** [#358](https://github.com/lambdaclass/stabileo/issues/358) (PR [#332](https://github.com/lambdaclass/stabileo/pull/332)) Rigid rotation, mirroring, node renumbering and unit scaling leave physical results unchanged; superposition and Maxwell–Betti reciprocity hold for linear analyses; external work equals strain energy. Run across all analyses and the whole example corpus; no reference solution needed.
6. **Units in the type system.** [#359](https://github.com/lambdaclass/stabileo/issues/359) Dimensioned quantities in Rust and TypeScript, so kN/N and m/mm mix-ups fail to compile instead of producing wrong numbers.
7. **Clause traceability enforced in CI, and independent implementations.** [#360](https://github.com/lambdaclass/stabileo/issues/360) A machine-readable map clause → implementation → tests → published example; CI fails when a clause has no test. The most-used checks (CIRSOC 201, CIRSOC 301) get a second implementation written from the clause text alone, compared on random inputs.
8. **Re-check prompt for old projects.** [#361](https://github.com/lambdaclass/stabileo/issues/361) (PR [#328](https://github.com/lambdaclass/stabileo/pull/328)) When a saved project opens in a version whose results changed for its features, say what changed and offer to re-run. *In progress (#328): registry of result changes, solve stamps, blocking notice, stale marking — `docs/verification/PROVENANCE.md`.*
9. **Reproducibility and provenance.** [#362](https://github.com/lambdaclass/stabileo/issues/362) (PR [#328](https://github.com/lambdaclass/stabileo/pull/328)) Every report records the version, commit and certificate hashes, so anyone can reproduce it bit for bit. *In progress (#328): provenance block in every report, reproduce dialog and CLI, determinism fixes and test — `docs/verification/PROVENANCE.md`.*
10. **Opt-in field telemetry.** [#363](https://github.com/lambdaclass/stabileo/issues/363) Solver refusals, diagnostics and crashes from real use (opt-in, no model content without consent), to learn how real models fail.
11. **More formal proofs.** [#364](https://github.com/lambdaclass/stabileo/issues/364) More kernels proved in Lean, and machine-checked correspondence between the Rust implementation and the proved algorithm for the critical kernels.
12. **Performance and scale regression tracking.** [#365](https://github.com/lambdaclass/stabileo/issues/365) Solve time, memory, iteration counts and sparse/dense crossover tracked per release on the benchmark and acceptance models (docs/VERIFICATION.md layer 8), with a failing gate on large regressions.
13. **Result badges use the verification maturity levels.** [#440](https://github.com/lambdaclass/stabileo/issues/440) Every result and design-check row shows its level from [MATURITY.md](../verification/MATURITY.md) (Certified > Benchmarked > Differential > Tested > Unverified), read from `docs/verification/dashboard.json` at build time so the badge cannot drift from the matrix; an open `safety` issue affecting the item is shown with it.
14. **Variant analysis after every bug.** [#448](https://github.com/lambdaclass/stabileo/issues/448) After each confirmed bug, search the codebase for the same bug class and add a check that catches the class, not only the instance. Classes seen so far: frame / rotation / sign conventions (#435, #418, #419), unit conversions (#423), double counting, NaN or degenerate input accepted (#335, Lb = 0, zero capacity passing), silent drops (constraints on supported nodes, member couples #343, features an analysis ignored). Each fix records the class, the search, other instances found and the class-level check added (lint, property test, metamorphic invariant, feature-matrix cell, fuzz property).
15. **Textbook example library.** [#450](https://github.com/lambdaclass/stabileo/issues/450) Hundreds of solved problems from standard texts (Hibbeler, Kassimali, McCormac, Gere and similar) as automated engine tests: printed inputs, printed answers as references at the printed precision, a citation per case. Small and many, unlike the building-scale acceptance suite (Coverage item 7); unlike `engine/tests/reference/`, they call the engine.
16. **Every new check ships with a negative case.** [#451](https://github.com/lambdaclass/stabileo/issues/451) Every new design check, test, certificate check, CI gate or alert comes with an input or mutation that must make it fail, run in CI; the existing gates are audited once for the same.

Beyond software: an independent licensed structural engineer reviews worked examples, clause readings and sample reports; real anonymised projects from engineering firms (with their SAP2000/ETABS/RFEM models and results, and the architect's IFC/DWG where available) join the acceptance suite and the BIM-import corpus; the design-code manuals with worked examples (AISC Design Examples, INTI/CIRSOC example books, AWC NDS, TMS 402, AISI Cold-Formed Steel Design Manual) are obtained so checks are tested against published numbers rather than hand-worked ones.

**From the verified review (2026-11-02), P1:**

- **Mutation rotation that keeps its promise:** done by [#1240](https://github.com/lambdaclass/stabileo/pull/1240) (32 shards a night, every shard every 16 days);
  the weekly staleness check stays red until 16 nights of markers exist.
- **The TypeScript model rewrite before the solve is outside verification** (offsets, semi-rigid
  joints, variable members, 2D-in-3D): the differential, fuzz and metamorphic harnesses call Rust
  directly and never exercise it. Move it to Rust (not covered by #731 or #392, which are after the
  solve).

**Exit criteria (Trust and verification).**
- Every verification job (nightly fuzzing per target, Rust mutation testing, the seven differential harnesses, Lean, Kani, symbolic) runs on `main` at least weekly, publishes its numbers as a CI artifact read by the [dashboard](../verification/DASHBOARD.md), and a failure opens an issue; no Trust metric reads "not yet measured".
- 0 untriaged differential mismatches: every mismatch in the latest run per harness is a fixed bug, a known open issue, or a documented modelling difference.
- `main` is protected with the required checks and CODEOWNERS (item 2).
- Every certified shell, plate and solid result shows a discretization-error estimate (item 3).
- Physics invariants (item 5) run on 100 % of the example and acceptance corpus with 0 violations.
- The result badges (item 13) show the MATURITY.md level on 100 % of result views and design-check rows.
- Variant analysis (item 14): 100 % of bugs closed after it lands have a variant-analysis note; every bug class listed has at least one class-level automated check in CI.
- Textbook library (item 15): at least 300 solved problems, at least 20 per analysis family that textbooks cover, each citing its source, 0 failing.
- Negative cases (item 16): 100 % of checks, tests and gates added after it lands have a negative case, and every existing gate has one after the audit.

**Metrics** (all on the [dashboard](../verification/DASHBOARD.md)): differential models compared, agreeing and mismatching per harness; fuzz executions per night; share of analyses and of design checks that are Certified (MATURITY.md); open `safety` issues; `roadmap:verification` issues closed; textbook problems in the library and bug classes with a class-level check ("not yet measured" until items 14–15 land).

### Engineering coverage backlog

Places where Stabileo still computes something unverified, refuses something engineers need, or has two implementations of the same rule.

1. **One proven implementation: TypeScript calls the engine.** [#390](https://github.com/lambdaclass/stabileo/issues/390)–[#395](https://github.com/lambdaclass/stabileo/issues/395) (PR [#321](https://github.com/lambdaclass/stabileo/pull/321), PR [#402](https://github.com/lambdaclass/stabileo/pull/402)) Every engineering result comes from the Rust engine (certified where possible); TypeScript only formats, searches and draws, and keeps its old duplicates only as test oracles (`docs/verification/TS_ENGINE_LOGIC.md`). Remaining areas:
   - concrete: every CIRSOC 201 section shape (flanged, circular, capacity, interaction diagrams, `cirsoc-flex`), slabs (`losas.ts`), bar layouts and the legacy designer, which should size against the engine ([#390](https://github.com/lambdaclass/stabileo/issues/390));
   - steel inputs still computed in TypeScript and fed to the Rust checker: Cb (`moment-gradient.ts`), J/Cw/Z (`section-constants.ts`), unbraced lengths, torsional and flange buckling, material family, the effective net area from end connections ([#391](https://github.com/lambdaclass/stabileo/issues/391));
   - analysis duplicates: diagrams, station forces and design forces, combinations, spectral combination, moving loads, plastic collapse, direct analysis, prestress, rigid diaphragms, kinematic checks, shell load integration and stresses, torsion flow, warping, mass sources ([#392](https://github.com/lambdaclass/stabileo/issues/392));
   - footings (eccentricity, service vs factored loads, flexure) and load generation (wind, snow, seismic, combinations) in Rust ([#393](https://github.com/lambdaclass/stabileo/issues/393));
   - no silent fallbacks: when the engine is unavailable the app says so instead of computing in TypeScript ([#394](https://github.com/lambdaclass/stabileo/issues/394));
   - the teaching solvers (`steps/*`, `solver-detailed*`) are checked against the engine on every model they support ([#395](https://github.com/lambdaclass/stabileo/issues/395)).
2. **Missing design checks:** [#366](https://github.com/lambdaclass/stabileo/issues/366) RC biaxial bending, torsion and slenderness magnification (today not re-checked, and each result says so); CIRSOC 301 F.7–F.11 (boxes, tubes, tees, angles in flexure — refused today); angles in flexure; EC3 Class 1/2 plastic interaction (6.2.9.1); cantilever load-height Cb; beam flexure with axial force; the legacy CIRSOC 201 column verdict computed as compression when the member is in tension; CIRSOC 301 angle arrangements other than back to back (star, starred, single angles in other configurations).
3. **Certificates still missing:** [#367](https://github.com/lambdaclass/stabileo/issues/367) large-displacement (co-rotational) and material-nonlinear results; masonry, connections, foundations and serviceability checks.
4. **Published worked examples** [#368](https://github.com/lambdaclass/stabileo/issues/368) (PR [#333](https://github.com/lambdaclass/stabileo/pull/333)) for masonry, foundations, serviceability, timber and cold-formed steel, and published (not only hand-worked) examples for CIRSOC 301, AISC E7 and EC3 Class 4.
5. **Mechanism detection everywhere:** [#369](https://github.com/lambdaclass/stabileo/issues/369) (PR [#331](https://github.com/lambdaclass/stabileo/pull/331)) the exact free-motion check in 2D and with constraints, connectors and inclined supports, and for local mechanisms, with zero false positives on the model corpus.
6. **Known solver gaps:** [#370](https://github.com/lambdaclass/stabileo/issues/370) material-nonlinear continues after an unconverged increment instead of returning the last converged state; co-rotational refuses prescribed displacements and thermal loads; 3D truss-only nodes inside frames are refused; harmonic refuses a response point on a constrained DOF; spectral analysis reports no shell stresses; beam lumped/consistent mass has no rotary inertia (an option for it, as Kratos and other codes include, matters for modal results of deep members; nodal masses and rotary inertia [#341](https://github.com/lambdaclass/stabileo/issues/341), PR [#399](https://github.com/lambdaclass/stabileo/pull/399)); the rigid diaphragm leaves each node's in-plane rotation free [#342](https://github.com/lambdaclass/stabileo/issues/342) (PR [#397](https://github.com/lambdaclass/stabileo/pull/397)). Open `safety` defects found by the verification work and being fixed now: inclined-member loads and member couples [#343](https://github.com/lambdaclass/stabileo/issues/343) (PR [#274](https://github.com/lambdaclass/stabileo/pull/274)), mirrored moments when a 2D model is solved in 3D [#435](https://github.com/lambdaclass/stabileo/issues/435) (PR [#436](https://github.com/lambdaclass/stabileo/pull/436)), SHB8 thickness locking [#400](https://github.com/lambdaclass/stabileo/issues/400) (PR [#401](https://github.com/lambdaclass/stabileo/pull/401)), missing torsional and flexural-torsional buckling [#404](https://github.com/lambdaclass/stabileo/issues/404) and spectral SRSS/CQC and participation [#405](https://github.com/lambdaclass/stabileo/issues/405) (PR [#434](https://github.com/lambdaclass/stabileo/pull/434)), modes dropped on a mechanism [#338](https://github.com/lambdaclass/stabileo/issues/338), the spectral certificate passing on non-finite results [#335](https://github.com/lambdaclass/stabileo/issues/335) (PR [#398](https://github.com/lambdaclass/stabileo/pull/398)). Each has a draft advisory in [`docs/advisories/`](../advisories/).
7. **A public-benchmark acceptance suite** [#371](https://github.com/lambdaclass/stabileo/issues/371) (PR [#337](https://github.com/lambdaclass/stabileo/pull/337)) (CSI and Dlubal verification examples using their independent references, the SAC buildings, FEMA P-695 archetypes) as a release gate.
8. **Example models that are still not realistic:** [#372](https://github.com/lambdaclass/stabileo/issues/372) the token live load in `la-bombonera`, cable-stayed bridge stays without pretension (large dead-load deflection), the offshore deck sag under the flare. Examples teach users; each should model what it claims to.
9. **Reports built from the design results:** [#373](https://github.com/lambdaclass/stabileo/issues/373) the PRO report's slab-steel section was removed because it invented its load, span and f'c; rebuild it from the slab design's own results.
10. **Hardening what stays in TypeScript** [#374](https://github.com/lambdaclass/stabileo/issues/374) (search, detailing, drawing): property tests for detailing invariants (As provided ≥ As required, spacing and cover, no bar collisions, development lengths) and nightly Stryker mutation testing with surviving mutants triaged.
11. ~~**Nodal masses:** lumped masses at nodes (per direction, rotary inertia) and added line/area mass in the engine input, used by every dynamic analysis; the web's mass source sends them instead of copying materials.~~ Done (#341).
12. ~~**Rigid diaphragm rotates as one body:** each slave node's in-plane rotation equals the master's, as SAP2000/ETABS and OpenSees `rigidDiaphragm` (it was left free).~~ Done (#342).

**Exit criteria (Engineering coverage).**
- No engineering result is computed only in TypeScript: 0 TypeScript modules of class (b) or (c) rated high safety in [TS_ENGINE_LOGIC.md](../verification/TS_ENGINE_LOGIC.md), except the teaching solvers and test oracles, and 0 modules left unclassified.
- Feature matrix: 0 cells E / IGN / BAD / K (holds today and must keep holding), and every `~` cell (no independent reference) replaced by ✓ or R.
- Every implemented design check is **Benchmarked** or **Certified** in MATURITY.md, and the CIRSOC 201 and CIRSOC 301 checks have no "uncovered" clause in [DESIGN_EXAMPLES.md](../verification/DESIGN_EXAMPLES.md).
- The public-benchmark acceptance suite is a release gate and covers every analysis that is Certified or Benchmarked, with at least one real building per analysis family.
- TypeScript mutation score (Stryker, critical set) at least 90 %, with every survivor triaged.
- 0 open `safety` issues labelled `roadmap:coverage` or in item 6.

**Metrics** (on the [dashboard](../verification/DASHBOARD.md)): engineering logic in Rust (share of lines, from TS_ENGINE_LOGIC.md classes); TypeScript (b)+(c) modules rated high safety; feature-matrix cells by status; acceptance-suite cases and reference values; TypeScript mutation score; worked-example clause rows by status; `roadmap:coverage` issues closed.

### Solver and proof depth

Closing the gap between "proven" and "right".

1. **End-to-end certificates.** [#375](https://github.com/lambdaclass/stabileo/issues/375) (PR [#403](https://github.com/lambdaclass/stabileo/pull/403)) Today a certificate proves the solution of the f64 `K` and `f` as assembled, not that they represent the model. An independent checker re-assembles `K` and `f` from the model JSON in interval arithmetic from closed-form element formulas (frames first, then shells), so a certificate covers model → K → result. *Frames and trusses (2D and 3D) done: `endToEnd` on the linear certificate, [CERTIFY.md](../verification/CERTIFY.md#end-to-end-certificates); shells, connectors, curved beams and warping next.*
2. **Trusted computing base, audited and enforced.** [#376](https://github.com/lambdaclass/stabileo/issues/376) (PR [#334](https://github.com/lambdaclass/stabileo/pull/334)) No `sorry` and no extra axioms in Lean (`#print axioms` in CI), pinned Lean/mathlib; a document listing everything a certificate assumes; the IEEE rounding the proofs model checked where the code runs (no fast-math or unexpected FMA, identical WASM results across Chrome, Firefox and Safari).
3. **A second, independent certificate checker** [#377](https://github.com/lambdaclass/stabileo/issues/377) (e.g. MPFR or exact rationals) beside the Lean one; agreement of two independently written checkers.
4. **Properties of the design checks,** [#378](https://github.com/lambdaclass/stabileo/issues/378) proved or exhaustively tested: more reinforcement or a larger section never lowers capacity, a larger load never lowers the utilization ratio, φ within its code limits.
5. **Validation against physical experiments,** [#379](https://github.com/lambdaclass/stabileo/issues/379) not only verification: published laboratory tests (RC beams and columns, shake-table frames, Vecchio–Collins panels, connection tests) for the nonlinear material models (concrete, fiber sections, plastic hinges, contact), following ASME V&V 10 / NAFEMS practice.
6. **Convergence-order tests (method of manufactured solutions)** [#380](https://github.com/lambdaclass/stabileo/issues/380) for every shell, plate and solid element: the observed rate matches the theory.
7. **Nonlinear and dynamic robustness:** [#381](https://github.com/lambdaclass/stabileo/issues/381) convergence criteria audited (force, displacement, energy norms), load-step and time-step sensitivity tests, energy-drift monitoring in time history, path following past limit points.
8. **Numerical stress tests:** [#382](https://github.com/lambdaclass/stabileo/issues/382) extreme stiffness ratios, ~10⁶-DOF models, near-singular and unit-extreme models; measure where accuracy degrades and refuse beyond it.
9. **Engine code hygiene:** [#383](https://github.com/lambdaclass/stabileo/issues/383) line and branch coverage per module (llvm-cov), Miri for any `unsafe`, strict clippy, overflow checks on index arithmetic, `cargo audit` in CI.
10. **Documented, peer-reviewed element derivations** [#384](https://github.com/lambdaclass/stabileo/issues/384) (PR [#330](https://github.com/lambdaclass/stabileo/pull/330)) in `docs/SOLVER_REFERENCE.md`: each formulation's derivation and assumptions, reviewable by an independent engineer. The review's findings are issues [#406](https://github.com/lambdaclass/stabileo/issues/406)–[#433](https://github.com/lambdaclass/stabileo/issues/433) (label `derivations`); several are `safety`.

**From the verified review (2026-11-02), P1:**

- **Every nonlinear exit passes an equilibrium gate:** only `linear.rs` fills `equilibrium`; P-Δ
  leaves it empty; [#432](https://github.com/lambdaclass/stabileo/issues/432) contact freezes a chattering gap and reports converged; [#433](https://github.com/lambdaclass/stabileo/issues/433)
  fiber returns the last iterate; the `solve_cable_2d` export drops `converged`. Contact and fiber
  are not called by the web app, so this is P0 for direct engine callers (partly [#381](https://github.com/lambdaclass/stabileo/issues/381), [#370](https://github.com/lambdaclass/stabileo/issues/370)).
- **[#458](https://github.com/lambdaclass/stabileo/issues/458) proof gap:** `EndToEnd.lean` leaves element formulas and the removal of unstiffened
  DOFs unformalised (partly [#375](https://github.com/lambdaclass/stabileo/issues/375), [#376](https://github.com/lambdaclass/stabileo/issues/376), [#500](https://github.com/lambdaclass/stabileo/issues/500)).
- **Cb moves from TypeScript (`steel/moment-gradient.ts`) to Rust** ([#391](https://github.com/lambdaclass/stabileo/issues/391)).

**Exit criteria (Solver and proof depth).**
- Every Certified analysis is certified end to end for frames (model → K, f → result), then for shells (item 1); the trusted computing base is a reviewed document enforced in CI, with 0 `sorry` and no extra axioms in Lean (item 2).
- Every element family in MATURITY.md is Certified (symbolic derivation) or Benchmarked, and every shell, plate and solid passes a convergence-order test (item 6); 0 open `derivations` issues labelled `safety`.
- Rust mutation testing covers all shards at least every 16 days with 0 missed mutants outside the documented equivalents (`.cargo/mutants.toml`).
- Engine coverage (llvm-cov) measured on every release; targets: line coverage at least 85 % and branch coverage at least 75 % in `engine/src/{solver,element,certify}`, with every uncovered region in `certify/` justified.
- Numerical stress tests define the accuracy limits, and the engine refuses models beyond them (item 8).

**Metrics** (on the [dashboard](../verification/DASHBOARD.md)): Rust mutation score (cargo-mutants) and the share of mutants tested; engine line and branch coverage; Lean theorems, Kani harnesses and engine tests; element families by maturity level; `roadmap:solver-proofs` issues closed.

### Soundness multipliers

The step changes in what a result can be trusted for, beyond more tests of the same kind. Each
builds on what exists: metamorphic testing on the corpus (Trust item 5), discretization estimates
(Trust item 3), independent clause implementations (Trust item 7), Rust–Lean correspondence in
general terms (Trust item 11), end-to-end certificates and a second checker (Solver and proof
depth items 1 and 3), design-check properties (item 4) and validation against experiments (item 5).

1. **Check the user's own model on every solve.** [#498](https://github.com/lambdaclass/stabileo/issues/498) Verification runs on our corpus; the bugs that hurt live in users' models. After each solve, in the background: global equilibrium recomputed from the model's loads, not from `K`; a rotated and renumbered twin of the model, solved and compared (the check that found [#488](https://github.com/lambdaclass/stabileo/issues/488) and the batch-3 interactions); an independent re-assembly of `K` and `f` ([#403](https://github.com/lambdaclass/stabileo/pull/403)) compared entry by entry. On any disagreement the result is not shown as verified, and the reason is. "We tested similar models" becomes "this model was cross-checked".
2. **Proof-carrying results.** [#499](https://github.com/lambdaclass/stabileo/issues/499) Every certified result and report carries a certificate bundle, and the Lean checker (`certcheck`) runs in the browser as WASM: a reviewer or an authority presses "verify this report" and checks it offline, without trusting the solver. The trusted base shrinks to the checker and the bundle parser.
3. **The Rust kernels proved against the Lean algorithm.** [#500](https://github.com/lambdaclass/stabileo/issues/500) The main unproved link in [TRUSTED_BASE.md](../verification/TRUSTED_BASE.md): translate the critical kernels (element matrices, transformations, fixed-end forces, certificate checks) to Lean with Aeneas/Charon and prove them, starting with the frame element and the linear certificate.
4. **Guaranteed bounds on discretization error.** [#501](https://github.com/lambdaclass/stabileo/issues/501) For shells, plates and solids the mesh error dominates and only estimates exist. Equilibrated-residual estimators give guaranteed upper bounds on the energy-norm error in linear elasticity: "the true solution is within ±x", not only "the discrete solve is accurate".
5. **Certificates for nonlinear analyses.** [#502](https://github.com/lambdaclass/stabileo/issues/502) Co-rotational, material-nonlinear and fiber analyses are Benchmarked only; certify the converged equilibrium state (residual inclusion with an interval tangent, Newton–Kantorovich as for P-Delta).
6. **The remaining certificate kinds formalized in Lean.** [#503](https://github.com/lambdaclass/stabileo/issues/503) P-Delta, response-spectrum propagation, harmonic, time history, the constraint mapping and the modal positivity hypothesis, all certified today but not formalized.
7. **Contradictory input refused, never resolved silently.** [#504](https://github.com/lambdaclass/stabileo/issues/504) A rigid restraint and a spring on the same DOF made the engine pick the spring ([#488](https://github.com/lambdaclass/stabileo/issues/488)); every such pair of fields in the input is refused by name.
8. **A public bug bounty for wrong results.** [#505](https://github.com/lambdaclass/stabileo/issues/505) Paid, reproducible wrong or unconservative results, by the severity scale of [SAFETY_ADVISORIES.md](../SAFETY_ADVISORIES.md); each accepted report gets a regression test, a postmortem and, where it applies, an advisory. Alongside the independent licensed engineer's review of defined workflows (findings published) and the corpus of real anonymised projects (Trust backlog, "Beyond software").

**Exit criteria (Soundness multipliers).**
- Every linear static and modal solve in the app runs the per-model cross-checks (item 1); disagreements are 0 on the example and acceptance corpus, and each one seen in the field is a triaged issue.
- Every certified result can be exported as a bundle and verified in the browser by the Lean checker (item 2).
- The frame element and the linear certificate are proved in Lean through Aeneas (item 3); every certificate kind in TRUSTED_BASE.md is formalized or listed with the step that is not (item 6).
- Guaranteed discretization bounds are shown for linear MITC4/MITC9 plates and shells (item 4).
- Co-rotational analysis is Certified in MATURITY.md (item 5).
- The engine refuses every contradictory field pair found by the input audit (item 7); the bug bounty is published with its scope and rules (item 8).

**Metrics** (on the [dashboard](../verification/DASHBOARD.md)): share of solves with per-model cross-checks and their disagreements; certified results exportable as bundles; kernels proved through Aeneas; certificate kinds formalized; bug-bounty reports received, accepted and fixed.

### Solver performance and capability

Speed for the workflows engineers repeat, and results that come with a guaranteed accuracy. This section starts after the open unconservative `safety` issues are closed: a faster solver that is still wrong in places is the wrong order.

1. **Profile before optimizing.** A benchmark harness over the acceptance suite, the large examples and synthetic 10⁵–10⁶-DOF frame, shell and building models: time per phase (assembly, ordering, factorization, solve, post-processing, certificates), memory, and iteration counts, tracked per release on the verification dashboard. Every item below is chosen and measured against it.
2. **Re-analysis instead of re-solving.** Keep factorizations across edits; low-rank (Sherman–Morrison–Woodbury) updates when a section, support or load changes; all load cases and combinations solved as one multi-right-hand-side solve. Target: an edit-and-solve cycle on a large model 100–1000× faster than a full re-solve, so design iteration is interactive. Certificates must still cover the updated result.
3. **A stronger sparse direct solver.** Supernodal or multifrontal Cholesky with nested-dissection / METIS-quality ordering; multithreading in the browser (WASM threads with SharedArrayBuffer and cross-origin isolation) and natively; an algebraic multigrid preconditioner for very large shell models; no silent fallback to dense LU on thin-shell meshes (#454). Target: 10–50× on large models.
4. **GPU (WebGPU) for iterative and many-solve workloads:** preconditioned iterative solves, design-search batches, time-history and parameter sweeps, with CPU fallback and results checked against the CPU path to round-off.
5. **Differentiable solver (adjoint sensitivities).** One adjoint solve gives the derivative of a response (drift, a member force, a utilization ratio, a frequency) with respect to every design variable: section properties, member sizes, support stiffness, material values. Turns optimization, sensitivity to assumptions and "which members govern" from thousands of solves into a handful; the foundation for the optimization and AI-reviewer multipliers. Gradients verified against finite differences in CI.
6. **Adaptive refinement to a target accuracy.** The discretization-error estimator drives h-refinement (and p where available) until the estimated error in the governing quantities is below a user target, so "solve to 1 %" replaces "hope the mesh is fine". Estimates stay labelled as estimates, never certified.
7. **End-to-end certificates for every element family:** after frames and trusses (#403), shells, plates and solids, so every displayed number is checked against the model itself, not only against the assembled matrices.
8. **Substructuring and model reduction for buildings:** floors and repeated parts as superelements (static condensation, Craig–Bampton for dynamics) with exact recovery of the internal results, for large building models and for re-analysis of local changes.
9. **One engine, every size:** the same Rust engine running in the browser, natively on the desktop and on a server for very large models, with identical results across all three (the determinism checks extend to native and server builds).

### Release safety

Pushes to main deploy straight to users, so a merge is a release.

**Faster feedback (2026-10-30):** self-hosted CI runners merged (PR [#854](https://github.com/lambdaclass/stabileo/pull/854)), and the merge
queue is live. In review: fast PR checks that run what a change touches (PR [#863](https://github.com/lambdaclass/stabileo/pull/863)), build
WASM once and retry only infrastructure errors (PR [#866](https://github.com/lambdaclass/stabileo/pull/866)), and e2e guards including a 45 s
smoke budget (PR [#869](https://github.com/lambdaclass/stabileo/pull/869)). Browser checks run on the OVH server.

**Route byte budgets (2026-11-04):** the three landing routes are at 128 B; the app routes carry the one-time safety batch acceptance below until the follow-up restores 128 B, and the gate's own test pins both values. The one-time acceptances for wave B ([#1291](https://github.com/lambdaclass/stabileo/pull/1291)) and for the Basic course ([#871](https://github.com/lambdaclass/stabileo/pull/871)) are gone: [#1322](https://github.com/lambdaclass/stabileo/pull/1322) and the revert [#1372](https://github.com/lambdaclass/stabileo/pull/1372) restored them. The gate counts what the app loads lazily too, except behind a declared route boundary (the blog, [#1289](https://github.com/lambdaclass/stabileo/pull/1289); the course, [#1302](https://github.com/lambdaclass/stabileo/pull/1302)). The JAIE and TIIC blog posts ([#1338](https://github.com/lambdaclass/stabileo/pull/1338)) need their growth measured again against that boundary. **Safety batch (2026-11-04):** each PR of the safety batch records its result change in the results-version registry and its text in every locale, which the gate counts as app growth: [#1326](https://github.com/lambdaclass/stabileo/pull/1326) +1,739 B, [#1328](https://github.com/lambdaclass/stabileo/pull/1328) +3,295 B, [#1319](https://github.com/lambdaclass/stabileo/pull/1319) +3,289 B, [#1321](https://github.com/lambdaclass/stabileo/pull/1321) +2,002 B, [#1298](https://github.com/lambdaclass/stabileo/pull/1298) +1,896 B, [#1324](https://github.com/lambdaclass/stabileo/pull/1324) +2,780 B, [#1301](https://github.com/lambdaclass/stabileo/pull/1301) +8,424 B, [#1295](https://github.com/lambdaclass/stabileo/pull/1295) +9,521 B, [#1297](https://github.com/lambdaclass/stabileo/pull/1297) +18,460 B with #1295 under it, [#1255](https://github.com/lambdaclass/stabileo/pull/1255) +15,998 B. The user accepted the batch once, so the app budget is 20,480 B per PR until the gate counts the registry on its own budget; then it is restored to 128 B. [#1253](https://github.com/lambdaclass/stabileo/pull/1253) (+29,839 B, with its review fixes: the generated-load re-check notice and its texts in six locales) carries its own one-time acceptance, so the app budget is 30,720 B while it lands. The versioned PRs land together as one integration (results versions 17 to 26: #1328, #1319, #1321, #1253, #1255, #1298, #1324, #1301, #1297, [#1396](https://github.com/lambdaclass/stabileo/pull/1396)), whose app growth is +81,550 B in one diff, so the app budget is 83,968 B for that integration; [#1390](https://github.com/lambdaclass/stabileo/pull/1390) then restores 128 B.

1. **Staging before production:** [#385](https://github.com/lambdaclass/stabileo/issues/385) deploy main to a staging URL first; promote to production on a tagged release after the full suite, the acceptance suite and a smoke check pass.
2. **Versioned releases with notes:** [#386](https://github.com/lambdaclass/stabileo/issues/386) every release has a version, release notes in English and Spanish, and a prominent "results may change" section listing result-affecting changes and who is affected.
3. **Users of saved projects are told what changed for their model** [#387](https://github.com/lambdaclass/stabileo/issues/387) (see the re-check prompt above), and stale results are marked until re-run.
4. **Dependency upgrades** [#388](https://github.com/lambdaclass/stabileo/issues/388) go through the same gates; major upgrades of numerics-related crates (e.g. exact arithmetic) must leave results bit-identical.
5. **Steel results stay labelled experimental** [#389](https://github.com/lambdaclass/stabileo/issues/389) ("Proven bound", no pass styling) until an independent engineer has reviewed the CIRSOC 301 checks.
6. **Safety advisories.** [#441](https://github.com/lambdaclass/stabileo/issues/441) When a released version produced a wrong or unconservative result, users are told through an advisory with the affected versions and features, how to tell if a model is affected, the fixed version and a workaround: [SAFETY_ADVISORIES.md](../SAFETY_ADVISORIES.md), drafts in [`docs/advisories/`](../advisories/), scoped in-app notices through the re-check registry (PR [#328](https://github.com/lambdaclass/stabileo/pull/328)).
7. **Contain first, fix second.** [#447](https://github.com/lambdaclass/stabileo/issues/447) Per-feature runtime switches (warn or refuse) that the app, the engine API and the MCP server check at solve and check time, so a known dangerous result is contained within hours of confirmation, before the fix is written or released. Every `safety` issue gets a containment step (switch set, or a recorded reason none is needed) before its fix; a switch can only make results more cautious than the bundled default.
8. **Postmortem per safety bug.** [#449](https://github.com/lambdaclass/stabileo/issues/449) Every `safety` defect that reached `main` gets a blameless postmortem in `docs/postmortems/`: timeline, root cause, why the tests, certificates, differential runs and reviews missed it, the new kind of test or check that now catches it, the variant analysis (Trust item 14), and its advisory, which is written from it.

**From the verified review (2026-11-02), P1:**

- **Contain the lower-severity open defects too** (item 7, [#447](https://github.com/lambdaclass/stabileo/issues/447)): [#818](https://github.com/lambdaclass/stabileo/issues/818)
  the dense reciprocal eigen-solve can report a buckling factor slightly above the true one (0.05%
  in #741's case; #741 itself, a certified factor above its own bound, is fixed on main by #817); [#456](https://github.com/lambdaclass/stabileo/issues/456) 3D buckling averages end
  forces (mostly false refusals); [#419](https://github.com/lambdaclass/stabileo/issues/419) 3D connector axes; [#408](https://github.com/lambdaclass/stabileo/issues/408) warping shared at a node
  with the UI silent; [#417](https://github.com/lambdaclass/stabileo/issues/417) cable in compression caught only in TypeScript.
- **Research crate lists drawn from `research/papers.yaml`:** `supply-chain.yml` skips
  pastrana-2026 and ferrari-sigmund-2025 (pastrana's WASM ships), and `vite.config.ts` checks only
  shauer.

**Exit criteria (Release safety).**
- Every release is tagged, has release notes in English, Spanish and Portuguese with a "results may change" section, and records a row on the [dashboard](../verification/DASHBOARD.md).
- 100 % of `safety` issues fixed in a release have a published advisory (or a recorded reason none is needed) within the timelines of SAFETY_ADVISORIES.md, and the in-app notice reaches the projects that use the affected feature.
- Releases are promoted from staging only after the full suite, the acceptance suite and a smoke check pass (item 1).
- No open `safety` defect older than 30 days without a fix PR or an in-app warning on the affected results.
- Containment (item 7): every `safety` defect has a containment state within 24 hours of confirmation; an e2e test flips a switch and checks that only the affected results are warned or refused.
- Postmortems (item 8): 100 % of `safety` defects fixed after it lands have a postmortem within 10 working days of the fix, each naming a new or extended automated check.

**Metrics** (on the [dashboard](../verification/DASHBOARD.md)): open `safety` issues (the label covers both defects and safety-relevant backlog items); safety advisories published (label `safety-advisory`); `roadmap:release-safety` issues closed; releases recorded in the dashboard history; time from confirmation to containment and postmortems written ("not yet measured" until items 7–8 land).

### Platform and architecture backlog (2026-10-28)

From the desktop-app plan and its reviews (Codex, Kimi): how Stabileo runs on more than the browser
without a second implementation of anything that computes a result.

1. **Desktop app** (Windows, macOS, Linux) with Tauri and the web's WASM engine; phases and install
   in [docs/desktop/README.md](../desktop/README.md). [#728](https://github.com/lambdaclass/stabileo/issues/728), PR [#663](https://github.com/lambdaclass/stabileo/pull/663)
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

### CI and feedback loop (2026-11-04)

Every fix waits on CI; on 2026-11-01 about 40 PRs were in CI at once, and the merge queue stalled for
hours on hung self-hosted runners, a shared sccache server and GitHub cache rate limits. A fast,
reliable queue is a safety item: a fix that cannot land leaves the wrong result live. Owner: the CI
workstream (W2-ci).

**Speed:** push to green on a full-scope pull request went from 397–498 min to 51–72 min after the
CI speed PRs of 2026-11-03 and 2026-11-04 (four threads per job [#1330](https://github.com/lambdaclass/stabileo/pull/1330), artifact 5xx retry [#1331](https://github.com/lambdaclass/stabileo/pull/1331), E2E shards
on GitHub's runners [#1332](https://github.com/lambdaclass/stabileo/pull/1332), hybrid PR routing [#1333](https://github.com/lambdaclass/stabileo/pull/1333), per-crate research WASM cache [#1334](https://github.com/lambdaclass/stabileo/pull/1334), no rerun on
a label [#1336](https://github.com/lambdaclass/stabileo/pull/1336), queue route budgets against the group's base [#1337](https://github.com/lambdaclass/stabileo/pull/1337), no second test of a merge to main
[#1339](https://github.com/lambdaclass/stabileo/pull/1339), no wall-clock assertions in the shared suite [#1340](https://github.com/lambdaclass/stabileo/pull/1340), runner pool drift alert [#1327](https://github.com/lambdaclass/stabileo/pull/1327)), then the shorter builds and runner isolation of items 19 and 20 (landed 2026-11-04).
In flight: [#1373](https://github.com/lambdaclass/stabileo/pull/1373), and item 21.

| # | Item | Why | PR | State |
|---|---|---|---|---|
| 1 | **14 runners in pools on stabileo-ci-1, with a watchdog:** label pools (queue/main, same-repo PRs, timing-sensitive jobs pinned, nightly), and a watchdog that restarts a runner GitHub shows busy with no live job | Six runners hung "busy" with no job blocked the queue for hours twice on 2026-11-02 | (dotfiles `servers/`, with #1221) | sgha7-14 not registered yet: **waits on the user** (remote registration command in the ledger) |
| 2 | **One sccache server per runner user:** private Unix socket per runner; build without sccache when it cannot start | Runners sharing one sccache port failed merge-group WASM builds with "Permission denied" | [#1075](https://github.com/lambdaclass/stabileo/pull/1075) | landed in wave A ([#1254](https://github.com/lambdaclass/stabileo/pull/1254)) |
| 3 | **Build WASM once and retry only infrastructure errors,** with a stall timeout (a hung `cargo fetch` is killed and retried) | Each WASM rebuild costs minutes per job; infra reds were rerun by hand | [#866](https://github.com/lambdaclass/stabileo/pull/866) | landed in the CI wave ([#1252](https://github.com/lambdaclass/stabileo/pull/1252)) |
| 4 | **Path-filtered PR checks:** a PR runs what its change touches; the merge queue still runs everything | Docs and web-only PRs waited on the whole engine suite | [#863](https://github.com/lambdaclass/stabileo/pull/863) | landed in the CI wave ([#1252](https://github.com/lambdaclass/stabileo/pull/1252)) |
| 5 | **Every job on stabileo-ci-1,** pools by label, superseded merge-group runs cancelled, timeouts on every job | Hosted runners moved to Ubuntu 26.04 and broke Playwright on every PR; stale merge-group runs took runner slots ahead of live ones | [#1221](https://github.com/lambdaclass/stabileo/pull/1221) | landed in the CI wave ([#1252](https://github.com/lambdaclass/stabileo/pull/1252)) |
| 6 | **Lighter merge-queue checks,** with the full suite on main after merge, a rerun on failure, then an automatic signed revert PR and an urgent alert | The queue should only block on what catches most breakage; the rest still runs on every main commit and reverts fast | [#1226](https://github.com/lambdaclass/stabileo/pull/1226) | landed in the CI wave; **waits on the user:** repo secrets `REVERT_BOT_TOKEN` and `NTFY_TOPIC`; each revert PR needs a human approval |
| 7 | **Move sgha1-6 into the runner pools,** plus the pending system upgrade on stabileo-ci-1 | The first six runners still run outside the pool slice and its limits | (dotfiles `servers/`) | **waits on the user**, once the queue is empty (restarts each runner) |
| 8 | **Runner labels and watchdog token:** `stabileo-pr` on sgha1-5; drop the borrowed `stabileo` label from sgha9-14 once #1221 lands; a fine-grained PAT for the watchdog | The pools only isolate jobs if the labels match them; the watchdog cannot restart a runner without a token | (dotfiles `servers/`, after #1221) | **waits on the user** |
| 9 | **Wall-clock budgets on the timing pool** (`stabileo-timing`), for main and nightly only | Timing checks on shared runners flake under load and block the queue | [#1241](https://github.com/lambdaclass/stabileo/pull/1241) | landed (2026-11-03); the timing pool for main and nightly is still to do |
| 10 | **Proof checks required:** Lean, symbolic and Kani as required checks in both rulesets (branch protection and merge queue) | #1235 runs them in the merge queue; until they are required, a red one does not block | [#1235](https://github.com/lambdaclass/stabileo/pull/1235) | #1235 landed in the CI wave; **waits on the user** |
| 11 | **Mutants rotation:** 32 shards a night, so every shard runs every 16 days instead of every 128, with a staleness check | The weekly staleness check fails until 16 nights of markers exist; expected, not a regression | [#1240](https://github.com/lambdaclass/stabileo/pull/1240) | landed in the CI wave |
| 12 | **Perf ratchet margin:** keep the strict 64-byte margin or widen it | Strict means nearly every PR that changes shipped web code also runs `make perf.budget.accept`, and two such PRs conflict on `web/perf-budget.json` | [#768](https://github.com/lambdaclass/stabileo/pull/768) | **waits on the user** |
| 13 | **Agent hygiene:** a unique scratchpad log name per agent | Two agents overwrote each other's engine logs on 2026-11-02 | (agent instructions; issue to file) | open |
| 14 | **Cancel superseded merge-group runs** automatically | A rebuilt queue left the old run for the same PR holding a runner | [#1242](https://github.com/lambdaclass/stabileo/pull/1242) | landed in wave A |
| 15 | **Cap concurrent E2E per host,** or lower the queue's maximum entries to build | At 14 headless Chrome jobs stabileo-ci-1 saturates and @slow E2E fails with "Target page closed"; each failed batch costs about 2 h | (dotfiles `servers/` or the ruleset) | the ruleset builds at most 5 entries since 2026-11-03; **waits on the user:** `stabileo-e2e` labels and `STABILEO_E2E_POOL=true` (refused to agents) |
| 16 | **Steps agents cannot run:** `gh pr ready` on drafts (today #1229 and the course stack #1302–#1307) and `gh run cancel` on stale merge-group runs are refused by the permission classifier | Ready PRs wait as drafts and stale runs hold runner slots until a person acts | (process; issue to file) | **waits on the user:** run them, or allow them |
| 17 | **Second reviewer and reviewer sandbox:** Kimi and Grok out of quota (Codex alone until 2026-11-08); the Kimi/Grok sandbox keeps the host network namespace, and nix bwrap cannot run on fede-256gb | Two reviews before main need a second model; a prompt-injected reviewer could reach local services | [#842](https://github.com/lambdaclass/stabileo/pull/842) | **waits on the user:** top up, and accept the sandbox as is or build the outbound proxy |
| 18 | **AI reviews from six models on every PR** | Outside contribution (klaus993); posts a review comment per model and needs six API secrets | [#1245](https://github.com/lambdaclass/stabileo/pull/1245) | landed in wave A |
| 19 | **Shorter builds:** research WASM bundles built in parallel and saved bundle by bundle, with a retried restore; the Docker image built from source on a PR only when its recipe changes; PRs off magic-nix-cache, so they stop churning the Actions cache | The research WASM and the Docker source build were the long poles of a PR run | [#1335](https://github.com/lambdaclass/stabileo/pull/1335), [#1373](https://github.com/lambdaclass/stabileo/pull/1373), [#1346](https://github.com/lambdaclass/stabileo/pull/1346), [#1374](https://github.com/lambdaclass/stabileo/pull/1374) | landed 2026-11-04 except [#1373](https://github.com/lambdaclass/stabileo/pull/1373) (open, ready) |
| 20 | **Runner isolation:** scheduled runs never take the merge queue's runners; Code_Aster's micromamba installs into the job's temp directory | Nightly jobs held the queue's runners while a queued fix waited; a micromamba binary left on a self-hosted runner failed the next Code_Aster comparison | [#1348](https://github.com/lambdaclass/stabileo/pull/1348), [#1376](https://github.com/lambdaclass/stabileo/pull/1376) | landed 2026-11-04 |
| 21 | **Next:** automatic retry of infrastructure reds (cache 429, nix substituter, HTTP/2 framing); docs-only PRs scoped to the docs checks; the merge queue's critical path (E2E waits and research WASM) | Infra reds are still rerun by hand; a docs PR still waits on web jobs | (to open) | planned |

**Exit criteria.** A docs PR gets its checks in under 10 minutes; the merge queue has no hung runner
for a week; every infra red is retried automatically, and a broken main is reverted within an hour.

### Stabileo Research (2026-11-04)

Published computational-mechanics papers turned into experiments anyone can run, change and check,
at stabileo.com/research, always in Stabileo's own viewer. Plan, rules and the ordered paper queue:
[research/DESIGN.md](../../research/DESIGN.md) and [research/CLAUDE.md](../../research/CLAUDE.md).

**Live and pending (2026-11-04).** Live: every paper and benchmark in the table below as a first
version, the eight Tools with their review fixes ([#900](https://github.com/lambdaclass/stabileo/pull/900)), the round-2 fixes of Andreassen ([#886](https://github.com/lambdaclass/stabileo/pull/886)) and
Mattiasson ([#890](https://github.com/lambdaclass/stabileo/pull/890)), and no review-round note on any page ([#1320](https://github.com/lambdaclass/stabileo/pull/1320)). Pending, none of it on main: the
round-2 fixes of the other papers and research SEO, 17 PRs in one integration, [#1068](https://github.com/lambdaclass/stabileo/pull/1068) (draft); then
Research and Tools faster on phones ([#1065](https://github.com/lambdaclass/stabileo/pull/1065)), research on phones and tablets ([#831](https://github.com/lambdaclass/stabileo/pull/831)), frozen versions
([#777](https://github.com/lambdaclass/stabileo/pull/777), waits on DNS) and one file per paper ([#844](https://github.com/lambdaclass/stabileo/pull/844), last).

1. **Live in production:** Shauer 2025 fracture (PR [#769](https://github.com/lambdaclass/stabileo/pull/769)), Grossman & Boudaoud 2026
   (PR [#776](https://github.com/lambdaclass/stabileo/pull/776)), the catalogue (PR [#788](https://github.com/lambdaclass/stabileo/pull/788)), and Ferrari & Sigmund 2025
   (PR [#836](https://github.com/lambdaclass/stabileo/pull/836), viewer fix [#848](https://github.com/lambdaclass/stabileo/pull/848)) are merged.
2. **The wave is live:** PR [#857](https://github.com/lambdaclass/stabileo/pull/857) deployed on 2026-10-30. Its 14 papers and benchmarks
   are listed below. Engine benchmarks run on the production engine, with shared case files and honest
   results, including refusals under containment.
3. **Next:** land the round-2 fixes of the live pages before any new paper (integration branch
   `integration/research-round2`, below). Then gallery organisation, previews, Fehér 2026 and
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
7. **Reviews:** round 1 (Codex + Kimi) is done for 16 items: the 14 wave pages and both Tools batches.
   Round 2 (Kimi, then Codex verifying Kimi, then Claude verifying both) is done for every paper; its
   fixes are on `research/review-fixes-<id>` branches, one PR per paper, combined and tested together
   in `integration/research-round2` before main. Merged: Mattiasson (PR [#890](https://github.com/lambdaclass/stabileo/pull/890)) and Andreassen
   (PR [#886](https://github.com/lambdaclass/stabileo/pull/886)). Mattiasson's final review (round 3, Codex and Grok, Kimi when its quota returns)
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

#### Open items shown on live research pages (2026-11-01)

Live pages must not show unanswered questions or "pending" placeholders. Each item below is either
done (the comparison is made and checked by a test) or the page states plainly what was compared
instead. "Questions for the authors" sections move to the paper's README and to direct email to the
authors; they come off the pages. The round-2 PRs resolve the page side of every row except the shell
obstacle course; the "Still to do" column is the remaining comparison work, which no longer shows on
the page as a placeholder.

| Page | What the page showed (2026-10-30) | Status | Still to do |
|---|---|---|---|
| Ferrari & Sigmund 2025 | "Koiter comparison pending" against the author's code and the paper's figures; a "Questions for the authors" section | page resolved in PR [#889](https://github.com/lambdaclass/stabileo/pull/889) (in integration): states what it is compared with; questions to the README | Implement the Koiter comparison (or reproduce α, β from the paper's equations); digitise the published figure |
| Pastrana et al. 2026 | "Questions for the authors"; published figures "not compared: full text not accessible" | **resolved** in PR [#885](https://github.com/lambdaclass/stabileo/pull/885) (in integration): both removed, questions in the README | Get the full text; compare Fig. 2 |
| Fairclough et al. 2026 | "Questions for the authors" (Table 1 inputs, solver tolerances, open-solver configuration, section export) | **resolved** in PR [#894](https://github.com/lambdaclass/stabileo/pull/894) (in integration): questions in the README; the engine check labelled as reaction/load bookkeeping | Confirm Table 1 inputs with the authors; the per-segment N ≈ σA check |
| Grossman & Boudaoud 2026 | "Terminable workers and precomputed replay are pending" | **resolved** in PR [#893](https://github.com/lambdaclass/stabileo/pull/893) (in integration): live solves in a terminable worker, replay autoplay, Fig. 5 compared marker by marker | None |
| MacNeal–Harder 1985 | "Numerical table provenance pending" | **resolved** in PR [#895](https://github.com/lambdaclass/stabileo/pull/895) (in integration): provenance stated (public transcription of Table 3, p. 10; scan not inspected), shell references recomputed by beam theory | Check the values against the 1985 scan |
| Shell obstacle course | "Proposed: numerical values and exact paper table/page locators have not been checked" | open (no round-2 PR yet) | Locators for every reference, two sources where possible |
| Mattiasson 1981 | "The numerical transcription has not been checked against the paper text. Status: proposed." | **resolved** in PR [#890](https://github.com/lambdaclass/stabileo/pull/890) (merged): independently computed references, corroborated by Nanakorn & Vu (2006) | Final review PR [#902](https://github.com/lambdaclass/stabileo/pull/902) |
| Lee frame 1968 | First limit load 1.83 kN "provisional: a precise numerical locator has not been verified" | **resolved** in PR [#986](https://github.com/lambdaclass/stabileo/pull/986) (in integration): stated as a by-eye reading of de Souza et al. (2020) Fig. 10, with a mesh/step convergence study | A precise second reference |
| DaDeppo 1975 | Reference quoted second-hand (Schmidt 2000), original table not inspected | **resolved** in PR [#987](https://github.com/lambdaclass/stabileo/pull/987) (in integration): limit load and all three crown values compared with Table 1 as quoted by Schmidt, stated as such | Inspect the original 1975 table |
| Andreassen et al. 2011 | No published compliance values or digitised figure compared | **resolved** in PR [#886](https://github.com/lambdaclass/stabileo/pull/886) (merged): names its comparison source (unmodified top88.m in GNU Octave) | Compare with the paper's published values/figure |
| Shauer 2025 | "Not compared: the full text was not accessible to us" | **resolved** in PR [#884](https://github.com/lambdaclass/stabileo/pull/884) (in integration): placeholder removed, the comparison stated | Published figures (supplementary data) |
| Newmark 1959 | Same placeholder, and "Against the author's code" | **resolved** in PR [#896](https://github.com/lambdaclass/stabileo/pull/896) (in integration): exact closed-form solutions and the native engine, cited as a benchmark, not a reproduction | None |
| Riks/Crisfield | Same placeholder | **resolved** in PR [#899](https://github.com/lambdaclass/stabileo/pull/899) (in integration): a method benchmark against analytical equilibrium and native results | More paper examples |
| Plastic collapse | Same placeholder | **resolved** in PR [#898](https://github.com/lambdaclass/stabileo/pull/898) (in integration): the unchecked Horne §§2.2/2.4 attribution removed; bounds are our own hand derivations, 6/6 checks | Locate the source of the bounds (README) |
| CQC 1981 | Published comparison replaced by a limitations note | **resolved** in PR [#897](https://github.com/lambdaclass/stabileo/pull/897) (in integration): 9/9 closed-form checks; says plainly the paper's building and tables are not used | Compare with the paper's example values |

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
   see "Speed and the first run"); Google Search Console to measure.
5. **One name:** finish the Dedaliano → Stabileo rename (#735), user-visible text first.

First PR (branch `seo/positioning`, in progress): landing titles and descriptions per language, the
positioning sentence, `SoftwareApplication` and `Organization` structured data, a sitemap with hreflang
for every prerendered page, Open Graph cards, honest SAP2000 and ETABS alternative pages, and tests for
all of it.

**In flight (2026-11-01):**
- **Research papers indexable** (PR [#988](https://github.com/lambdaclass/stabileo/pull/988)): each paper published only in the languages it has
  (`web/src/components/research/locales.ts`; three English-only until translated, no more 51
  unintended de/fr/tr copies), page hreflang and sitemap agree, localized titles naming the original
  work, `ScholarlyArticle` JSON-LD with the DOI, lastmod from the latest review. After deploy: resubmit
  the sitemap in Search Console and request indexing.
- **Real 404s** (PR [#1059](https://github.com/lambdaclass/stabileo/pull/1059)): unknown URLs returned the landing page with HTTP 200, a site-wide soft
  404. Caddy now serves a prerendered, noindexed 404 page per locale with status 404, keeps the SPA
  fallback for the app only, and a `Caddy Routing` CI job tests it.
- **Speed:** PR [#880](https://github.com/lambdaclass/stabileo/pull/880) (section "Speed: measured 2026-10-30").

### Live-site fixes (2026-11-02)

Bugs a visitor sees on stabileo.com today. Each has a test that fails before the fix; all are Codex
clean. The Ubuntu 24.04 pin (#1079) has landed; they ship together through the live-site integration
PR [#1227](https://github.com/lambdaclass/stabileo/pull/1227), with #1224 stacked on #988; the changelog counts fix ships in [#1384](https://github.com/lambdaclass/stabileo/pull/1384) instead.

| Bug | PR | State |
|---|---|---|
| **Soft 404:** unknown URLs return the landing page with HTTP 200, so search engines index junk | [#1059](https://github.com/lambdaclass/stabileo/pull/1059) | prerendered 404 per locale with status 404; conflicts with #988 resolved on the integration branch |
| **Pages without a language prefix** (`/research`, `/tools`, `/changelog`) serve the landing's HTML and canonical until the client redirects | [#1224](https://github.com/lambdaclass/stabileo/pull/1224) | 301 to the English page, query kept; stacked on #988 |
| **Landing blank below the hero until scrolled** (sections stayed transparent until an IntersectionObserver fired) | [#1223](https://github.com/lambdaclass/stabileo/pull/1223) | every section visible without scrolling or JavaScript |
| **Changelog counts:** the header says 98 changes, the area filters add up to 56 (they counted weekly entries, not items) | [#1222](https://github.com/lambdaclass/stabileo/pull/1222) | filters count items and add up to the total; in [#1384](https://github.com/lambdaclass/stabileo/pull/1384) |

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

### Stabileo Tools: free engineering calculators (2026-11-01)

Engineers search for a calculation ("beam deflection calculator"), not for a platform. Each tool is a
real calculation on the production engine with a path into the full editor. Eight tools are live:
the pilot (PR [#838](https://github.com/lambdaclass/stabileo/pull/838)) and batch 2, carried by PR [#857](https://github.com/lambdaclass/stabileo/pull/857) (PR [#847](https://github.com/lambdaclass/stabileo/pull/847) closed).
Render tests in all locales are merged (PR [#877](https://github.com/lambdaclass/stabileo/pull/877)). Both batches completed round 1 with at
least one "not ready" verdict. Round 2 (Codex, Grok as Kimi's fallback, Claude; Kimi added when its
quota returns) is fixed in PR [#900](https://github.com/lambdaclass/stabileo/pull/900) (open): a validity guard (large displacement, engine vs
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
tests of "Prevention", and refusal paths for whatever is out of scope. Each ships labelled
experimental until it has all of them; an example never shows a number the engine could not check.
Never silently wrong.

**Sequence:** week 1, then gap 1 (the contract), then 9 and 5 (small, on existing engine features),
then 4, 2 and 3; 6 and 7 as safety-critical engine work after the "Priority now" items; 8 on demand.

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

- **Regenerate `docs/verification/MATURITY.md`:** it is stale and still lists closed issues (#427,
  #416, #459) as open; the review trusted it.
- **Retriage [#810](https://github.com/lambdaclass/stabileo/issues/810):** probably a test-model error (per the research page); close or retriage.
- **Triage the 227 open `nightly-finding` issues,** many marked wrong-result candidates.
- **Close or settle the leftovers of this push:** outside PRs #1067, #887 and #888 with the
  standard note (the classifier refused `gh pr close`); the untrusted leads #533 and #535 once
  #1233 and #1236 land; #1063 and #1074 "merged via #807", #1243 is already
  closed (folded into #1079); #765 and #871 once their integrations [#1071](https://github.com/lambdaclass/stabileo/pull/1071) and [#1070](https://github.com/lambdaclass/stabileo/pull/1070) land; the
  old per-job `verification-failure` trackers now that #739 has landed.
- **Dependencies:** num-bigint 0.5 ([#819](https://github.com/lambdaclass/stabileo/pull/819), [#820](https://github.com/lambdaclass/stabileo/pull/820), [#828](https://github.com/lambdaclass/stabileo/pull/828), [#829](https://github.com/lambdaclass/stabileo/pull/829)) breaks the engine's
  num-rational 0.4 and stays open; [#985](https://github.com/lambdaclass/stabileo/pull/985) (npm minor) landed in wave A; older Dependabot PRs [#654](https://github.com/lambdaclass/stabileo/pull/654),
  [#655](https://github.com/lambdaclass/stabileo/pull/655), [#317](https://github.com/lambdaclass/stabileo/pull/317), [#318](https://github.com/lambdaclass/stabileo/pull/318), [#319](https://github.com/lambdaclass/stabileo/pull/319) and the held-back majors [#457](https://github.com/lambdaclass/stabileo/pull/457) need a decision.
- **Performance follow-ups of #768:** gate the WASM size [#1072](https://github.com/lambdaclass/stabileo/issues/1072); the audit's remaining work
  [#1073](https://github.com/lambdaclass/stabileo/issues/1073). The blog post [#882](https://github.com/lambdaclass/stabileo/pull/882) was left out of #1068 because it grows the landing entry by
  32 KB: it needs lazy blog bodies or a budget decision.
- **Old drafts to keep or close:** [#609](https://github.com/lambdaclass/stabileo/pull/609) and [#651](https://github.com/lambdaclass/stabileo/pull/651) (nonlinear framework), [#536](https://github.com/lambdaclass/stabileo/pull/536) (design
  iteration), [#470](https://github.com/lambdaclass/stabileo/pull/470) (CODEOWNERS, pending a reviewer decision), [#331](https://github.com/lambdaclass/stabileo/pull/331) (mechanism detection),
  [#473](https://github.com/lambdaclass/stabileo/pull/473) (3D certificate line); and [#794](https://github.com/lambdaclass/stabileo/issues/794), ShauerPage under the 600-line ceiling (ours; the
  outside PR #888 is closed).
- **Retriage [#742](https://github.com/lambdaclass/stabileo/issues/742)** (fuzz `model_certify`: likely the equilibrium oracle's scale, not the
  engine) and **close [#755](https://github.com/lambdaclass/stabileo/issues/755)** once its fix is confirmed on main.
- **Changelog fragments:** every PR merged to main since 0.4.0 that changes behaviour has one (checked
  2026-11-04; #770, #739, #878, #1287 and #1341 added then). Open PRs that still need theirs before they
  land: [#1061](https://github.com/lambdaclass/stabileo/pull/1061), [#1065](https://github.com/lambdaclass/stabileo/pull/1065), [#1071](https://github.com/lambdaclass/stabileo/pull/1071), [#785](https://github.com/lambdaclass/stabileo/pull/785); [#807](https://github.com/lambdaclass/stabileo/pull/807) must carry the folded #1074 and #1232 in its own.

## Daily, Weekly, Monthly Priority Lens

This is the clearest way to prioritize the product roadmap:

### Daily work

What engineers do on almost every project and should come first:

- trustworthy solve and visible verification
- model quality gates before solve
- code-driven load combinations and the first narrow code-load generation slice
- steel member design and first steel connection workflows
- RC beam/column design, reinforcement schedules, and BBS foundations
- basic reports and governing-case summaries (unblocked now — analysis-only calc books are billable)
- full design reports with utilization ratios and reinforcement schedules (after solver Phases 5-6)
- diagnostics, review cues, and AI explanation of what is wrong and what to fix

Roadmap home:

Immediate product/platform alignment item:
- fix the current 3D coordinate-system mismatch first
- make `Z-up` the explicit product/runtime convention so the app aligns with structural-software expectations
- migrate frontend/runtime pieces in an intentional sequence: viewport/grid/support visuals, generators/examples, and AI context extraction
- keep backend/solver contracts aligned while the frontend migration lands; do not allow any new `Y-up` assumptions back into 3D flows
- do not allow more 3D UX/generator work to silently deepen a mixed-convention state
- Product Step 1 (basic reports, diagnostics, section capacity, design checks)
- Product Step 2 (full design reports, BBS, connections)

### Weekly work

What engineers do regularly, but not on every single model every day:

- automatic code load generation
- IFC/import-export and office-template workflows
- reviewer flows, comments, diffs, and lightweight collaboration
- desktop/offline workflows
- natural-language result queries and stronger AI review assistance
- first dynamic interpretation surfaces and broader workflow packaging

Roadmap home:
- Product Step 2
- Product Step 3
- Product Step 4

### Monthly / specialist work

What matters a lot for advanced firms and specialists, but should not outrank daily delivery work:

- time-history and advanced earthquake workflows
- pushover, IDA, fragility, and performance-based seismic workflows
- progressive collapse, fire, and probabilistic workflows
- global optimization, generative layout, and CRDT real-time collaboration
- cloud platform, ecosystem APIs, and broader software layers built on the solver

Roadmap home:
- Product Step 3 and beyond

## What The Product Depends On From The Solver

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

## Open-Source vs Hosted Boundary

The roadmap describes the full product direction, but not every capability should live at the same distribution layer.

### Open-source should include

- the core browser product
- solver-driven diagnostics, verification, and review surfaces
- AI UI surfaces and capability interfaces
- prompt/result schemas
- local/basic provider adapter patterns where appropriate
- basic AI assistance such as diagnostic explanation, result queries, and limited code-check explanation
- local model support if it is added
- basic BYO-key mode if it materially helps community adoption
- report/design workflow foundations that make the product genuinely useful on its own

### Hosted / private / commercial should include

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

### Guiding principle

The open-source version should be strong enough to be real software engineers can trust and use.

The hosted/private layer should monetize:

- orchestration
- scale
- collaboration
- premium automation
- enterprise controls

not artificial crippling of the core engineering product.

## The Automation Gap

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
- closing it matters not just technically, but commercially, because it moves Dedaliano from analysis software into project-delivery software for RC-heavy markets

## What Engineers Still Do Manually

### High-impact automation to ship early

1. `Load combinations and factors`
   What it should become: auto-generate combinations from selected code families (EC0, ASCE 7, CIRSOC, etc.)
   Roadmap home: solver load-combination infrastructure + Product Steps 1-2

2. `Wind / seismic / snow loads`
   What it should become: enter building/site/code parameters and auto-generate pressures, forces, accidental torsion, and pattern loads
   Roadmap home: Product Step 2

3. `Code pass/fail checking`
   What it should become: automatic utilization ratios, governing checks, and pass/fail per member and per code
   Roadmap home: Product Step 2

4. `Section selection`
   What it should become: suggest viable and optimal sections given forces, code, cost, and constructability
   Roadmap home: Product Step 2

5. `Steel member and connection design`
   What it should become: automatic steel member checks, connection demand extraction, first connection sizing/check workflows, and report-ready design outputs
   Roadmap home: Product Steps 1-2

6. `RC reinforcement design`
   What it should become: required steel -> selected bars -> curtailment -> cutting lists -> BBS
   Roadmap home: Product Steps 1-2

7. `Report generation`
   What it should become: one-click PDF with diagrams, checks, diagnostics, governing cases, and assumptions
   Roadmap home: Product Step 2

8. `Interpretation of dynamic results`
   What it should become: automatic flags for soft story, torsional irregularity, mass participation, dominant modes, and suspicious response patterns
   Roadmap home: Product Step 3

### Medium-impact automation to ship later

1. `Shell family choice`
   What it should become: auto-select MITC4 vs MITC9 vs curved shell vs SHB8-ANS based on geometry and workflow
   Roadmap home: Solver Step 7 + Product Step 1

2. `Analysis type choice`
   What it should become: suggest nonlinear, P-Delta, modal, pushover, or time-history based on the model and requested checks
   Roadmap home: Product Steps 1 and 3

3. `Pre-solve stability assessment`
   What it should become: detect mechanisms, disconnected nodes, bad constraints, poor shell geometry, and suspicious modeling before solve
   Roadmap home: Solver Step 3

4. `Pushover workflow`
   What it should become: one-click capacity spectrum, performance point, and plastic hinge sequence
   Roadmap home: Product Step 3 + Solver Step 10

5. `IDA workflow`
   What it should become: automatic record selection, scaling, batch NLRHA, and fragility curves
   Roadmap home: Product Step 3 + Solver dynamic/nonlinear depth

6. `BIM round-trip`
   What it should become: IFC round-trip with analysis/design results embedded or linked
   Roadmap home: Product Step 4

## What Competitors Still Do Not Automate Well

These are not just "catch-up" items. They are chances to define the category.

1. `AI-assisted model review`
   Example: "beam 7 has no lateral restraint", "this shell is inverted", "this diaphragm constraint likely over-stiffens the floor"

2. `Natural language result queries`
   Example: "what is the max moment in the roof beams?" with governing combination and location

3. `Global section optimization`
   Not just per-member sizing, but whole-structure optimization including fabrication rhythm, procurement, and connection economy

4. `Live code comparison`
   Side-by-side EC2 vs ACI vs CIRSOC design interpretation for the same member or structure

5. `Generative structural layout`
   Given architectural constraints, produce and rank structural systems instead of only checking one user-authored scheme

These should appear in the product sequence on purpose:
- `AI-assisted model review` and `natural-language result queries` early
- `global section optimization` in the platform layer once batch/headless execution is solid
- `live code comparison` in the platform layer once multi-code checks are mature
- `generative structural layout` only after optimization and trusted automation infrastructure exist

## Users We Can Support

The same solver can support different user groups, but they need different product layers:

- **Structural and civil engineers** — full analysis, design, diagnostics, reports, and office workflows
- **Engineering firms** — templates, repeatable workflows, QA, reports, and interoperability
- **Students and professors** — onboarding, examples, benchmark explorer, and educational surfaces
- **Earthquake engineers** — pushover, time-history, IDA, fragility, performance-based design
- **Design-build / contractors / temporary works teams** — staged workflows, rapid reporting, and simple pass/fail communication
- **BIM / computational design users** — interoperability, import/export, and API hooks
- **Researchers / verification users** — benchmark visibility, solver settings, exports, and reproducibility
- **Architects** — only as a later conceptual structural mode with strong guardrails, not as the default product surface

## Product Layers By User Need

- `Engineers and firms` — diagnostics, code checks, RC member design and reinforcement schedules, reports, connections, foundations, templates, interoperability, and explainable element-family defaults
- `Earthquake engineers` — pushover analysis, time-history, ground motion library, IDA, fragility curves, performance-based assessment
- `Education` — first-solve success, examples, benchmark explorer, explanatory views
- `Design-build / temporary works` — staged workflows, fast results communication, deliverable generation
- `BIM / computational design` — import/export, API packaging, geometry-model exchange
- `Architects` — later conceptual structural mode with defaults, visual feedback, and guardrails

## Current Product Surface

Already present:

- browser-native 2D/3D modeling and visualization
- Rust solver in the main app flow through WASM
- broad results, postprocessing, and design-check coverage
- benchmark and validation story strong enough to support a product-quality narrative
- diagnostics and solver warnings surfaced in the results flow
- results-store support for constraint forces, assembly diagnostics, and solver diagnostics
- results-table diagnostics sub-tab and solve-time warning toasts for important issues such as negative Jacobians
- WASD/Arrow/QE keyboard camera navigation with Shift speed boost
- frame vs truss color differentiation across 2D and 3D viewports
- showcase PRO examples (suspension bridge, geodesic dome, diagrid tower, stadium, cable-stayed bridge)

Known example issues:

- **Suspension bridge example needs nonlinear solver**: The linear solver overestimates deflections because it lacks geometric stiffness from cable pretension. Suspension bridges are inherently nonlinear — cable stiffness depends on tension state. Once the corotational/nonlinear 3D solver supports cable pretension, revisit the suspension bridge example with realistic cable areas (A≈0.020 m²) instead of the current oversized A=0.060 m² workaround. Consider adding a catenary element (form-finding) for proper cable analysis.

3D coordinate-system decision:

- Dedaliano is moving to `Z-up` as the canonical 3D product/runtime convention: `x = horizontal`, `y = plan depth`, `z = elevation`.
- The frontend/runtime migration is the near-term work item because the viewport, support visuals, generators, examples, and AI context packaging must all agree on the same interpretation.
- Backend generators/importers and any solver-facing contracts must remain aligned with that `Z-up` convention as the migration completes.
- Important rule: do not mix conventions across backend generators, frontend templates, viewport logic, loads, and result rendering.
- A repo-wide `Z-up` migration must be treated as a planned platform refactor with compatibility review, not as an incidental bug fix.
- This should be treated as a near-term platform decision, not a low-priority cleanup item.

Still productizing:

- richer diagnostics UX in the app/API
- constraint-force presentation in the results experience
- click-to-focus and visual highlighting for problematic elements
- shell-family recommendation and automatic default selection in modeling workflows
- stronger onboarding and first-solve success
- report and deliverable workflows
- broader workflow packaging around the full solver surface
- deeper collaboration and firm-facing features
- smoother interoperability and downstream integrations
- explicit coordinate-system ADR for 3D workflows (`Z-up` canonical, no mixed conventions)

## Post-Core Software Stack

If Dedaliano executes the core roadmap well, the next best products are not "another generic solver." They are high-value software layers built on top of the solver moat.

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

---

## The Sequence

### 1. Solver-Led Product

Build trust through a reliable, accessible structural solver with strong diagnostics, section capacity tools, and the first high-ROI design automation surfaces.

**What:**

Solver trust and diagnostics:
- WASM path reliability — single trusted solver runtime in production
- Public verification surface — benchmark explorer, acceptance models, reference cases, and visible trust signals in the app
- Model quality gates before solve — mechanisms, disconnected nodes, bad constraints, shell pathologies, suspicious local axes/support conditions
- Richer diagnostics UX — grouping, filtering, machine-readable codes, provenance, click-to-focus highlighting
- Structured-code review consumer — reviewer surfaces, comments, and AI explanation should match on diagnostic codes/severity/references instead of parsing warning strings
- Constraint-force and governing-result presentation
- Shell-family recommendation and automatic defaults (MITC4/MITC9/SHB8-ANS)
- Public benchmark and acceptance-model presentation
- Performance feedback in the UI — progress bars, iteration counts, slow-phase visibility
- Solver-run artifact capture — export/import a reproducible run package for bug reports, support, and peer review replay
- Onboarding and first-solve success

Section capacity and materials (early design-oriented subset of solver material/section capability):
- Design-oriented material and section surfaces — Mander confined concrete, Menegotto-Pinto steel, EC2 parabola-rectangle, bilinear steel, and the section-level capacity outputs needed for daily design workflows
- RC section builder — visual concrete shape + rebar layout → auto-generate fibers
- P-M and P-M-M interaction diagram viewer for column design
- Moment-curvature curve visualization and section-level pushover
- Cracked section iteration workflow — solve → check cracking → reduce EI → re-solve
- Material stress-strain curve editor and preview
- Cyclic material testing with hysteresis visualization

Design code computations (solver Phase 6 — what engineers bill for):
- Steel member design — section classification, LTB, compression curves, combined interaction, per-member utilization ratios with pass/fail
- First steel connection workflow — connection-demand extraction, first connection library, sizing/check flow, and report-ready outputs for the most common daily steel cases
- RC beam design — required As, stirrup spacing, crack width, deflection check
- RC column design — interaction diagrams, slenderness, moment magnification
- Effective buckling length display per column (extracted from global eigenvectors)
- Multi-code selector — EC2/EC3, ACI 318/AISC 360, EHE-08/EAE
- Detailing rules output — min/max reinforcement, cover, anchorage lengths
- Automatic member utilization ratios and pass/fail summaries
- Automatic code-driven load combinations and factors
- Narrow first code-load generation slice — simple seismic ELF, gravity-pattern rules, and the first code-driven wind/snow patterns that unlock daily design workflows without trying to solve the entire load-generation scope at once

First automation and AI surfaces:
- AI-assisted section suggestion from utilization, code, and basic economy signals
- AI-assisted modeling and review — explain warnings, suggest missing supports/loads, flag suspicious patterns, guide first-fix actions
- AI explanation of model quality gates — tell the user not only that the model is invalid, but why it matters and what the most likely fix is
- AI setup guidance — suggest shell family, analysis path, and first checks based on the current model and workflow
- Natural-language result navigation and explanation powered by query-ready solver summaries
- Lightweight collaboration — comments, pinned annotations, shared links, model/version diff, reviewer read-only flows

Report and calculation documents (unblocked now — does not need design codes):
- Basic PDF report v1 — model summary, loads, combinations, force diagrams, reactions, governing cases, deformed shapes
- Customizable templates — firm logo, project info, engineer stamp
- LaTeX/KaTeX rendering — equations in the report (leverage existing DSM wizard)
- Diagram exports — M/V/N diagrams, deformed shapes, mode shapes as vector graphics
- Multi-language reports — English, Spanish (leverage i18n system)
- Enriched with design checks, utilization ratios, and reinforcement schedules once solver Phases 5-6 land

**Goal:** Be the most accessible serious structural solver for everyday structural engineering, with real section capacity tools, code-compliant design output, and report-ready deliverables that engineers can use on daily projects.

**Done when:** An engineer can model a structure in the browser, pass pre-solve quality gates, get trustworthy results with visible verification, generate a basic calculation report, view P-M interaction diagrams and moment-curvature curves, run steel and RC design checks with utilization ratios against their national code, produce a first RC beam schedule, and share a read-only link with a reviewer.

### 2. Deliverable Layer

Turn analysis into paid engineering work with reports, BBS, connections, and interoperability.

**What:**
- RC reinforcement schedule and BBS — required steel → selected bars → curtailment → cutting lists → bar bending schedule
- Graphical BBS drawing generation — bending-shape drawings, dimensions, hook semantics
- Steel connection workflow expansion — broaden beyond the first daily-use connection set with more connection families, stronger detailing, and richer report outputs
- Full design reports — enrich Step 1 basic reports with design checks, utilization summaries, reinforcement schedules, and appendix-level per-element calculations
- Broader automatic code load generation — extend the first narrow Step 1 slice into fuller wind, snow, seismic ELF, pattern loading, and accidental torsion coverage from code/site inputs
- Multi-code design check breadth — EC2, EC3, ACI 318, AISC 360, NDS, TMS 402, AISI S100 wired to unified code-selector
- Connections and foundations productization — auto-sizing and detail generation
- Interoperability — full IFC import/export, DXF 3D
- Project and template support — reusable workflows, firm standardization
- AI-powered section suggestion — deepen from local member sizing into stronger whole-frame recommendations
- AI-powered load combination from code selection — broaden and harden code coverage including accidental torsion, pattern loading, combination factors
- Natural language result queries — "what's the max moment in beam 7?", "which column has the highest utilization?"
- AI-powered code-check explanation — explain why a member fails and what parameter drives the failure
- AI-generated governing-case/report summaries — explain which combinations control and why, ready for report output and reviewer consumption
- AI reinforcement/design adjustment suggestions — explain likely bar/section changes that would clear a failing check
- Explicit steel design wedge for daily building/industrial workflows — member checks first, then connection design and report outputs
- Explicit RC/BBS wedge for LATAM delivery workflows — schedules, drawings, and report outputs that directly close the CYPECAD-style project-delivery gap

**Goal:** Move from "can analyze and design" to "can produce deliverables for paid engineering work." Automation handles the repetitive reporting and detailing layer so engineers spend more time on judgment.

**Done when:** An engineer can generate a BBS from RC design results, complete a first steel connection design workflow, generate a submission-grade PDF report, import/export IFC, and ask the app questions about results in plain language.

### 3. Dynamic and Nonlinear Layer

Make the browser the go-to tool for earthquake engineering, replacing OpenSees for the common 80% of work.

**What:**
- Dynamic time-history UI (Newmark-beta, HHT-alpha, ground motion input)
- Pushover analysis (capacity spectrum, N2, MPA)
- Construction staging UI
- P-Delta with a configurable number of iterations in PRO, to reproduce models from programs that stop after a fixed count: converged remains the default, the fixed count is chosen on purpose and saved with the model, and a result that did not converge says so wherever it is shown
- Seismic workflow end-to-end (spectra, ground motion selection, IDA)
- AI-powered nonlinear/dynamic result interpretation — explain convergence, flag unusual hysteresis, detect soft-story mechanisms, suggest damping parameters
- AI ground motion selection — suggest appropriate records from site parameters and target spectrum

**Note:** RC section builder, moment-curvature, interaction diagrams, and the first design-oriented subset of material/section capability have moved to Step 1 because they are daily design needs, not earthquake-specialist features. This does not mean the full nonlinear-material roadmap lands early. The broader solver-side nonlinear material program still belongs later; Step 1 only depends on the subset needed for daily RC/steel design workflows.

**Goal:** Make Stabileo the go-to tool for earthquake engineering — in the browser, with a visual editor, replacing OpenSees for the common 80% of work. AI makes nonlinear results accessible to engineers who aren't nonlinear specialists.

**Done when:** An earthquake engineer can run a pushover analysis, select ground motions, perform IDA, and get AI-explained results — all in the browser without writing a single line of Tcl.

### 4. Workflow Fit Layer

Fit into real firm workflows before expanding into a broader platform.

**What:**
- SAP2000/ETABS import (.s2k), STAAD.Pro import (.std), Robot exchange format
- OpenSees import (.tcl parser subset) for migration
- Tauri desktop packaging — same web app as a local desktop app for offline use, local files, native integration
- Project and template workflows — reusable firm standards, named defaults, standard report packages
- Education and benchmark explorer — university course integration, homework templates, interactive benchmark viewer
- Stronger review flows — comments, pinned annotations, reviewer states, project/version diff
- Bug-report and support replay flow — attach/export solver-run artifacts from the app so support and reviewers can reproduce issues deterministically
- First broader workflow packaging around firms and education, not yet full platformization
- AI workflow assistant — help users import models, choose templates, prepare reviews, and interpret diffs without adding full platform complexity

Desktop principles:
- Web remains the primary product surface
- Desktop is a shared shell, not a forked product
- Local file access, offline use, and native integration are the main value
- Auto-update from signed GitHub releases or equivalent signed update feed

**Done when:** A firm can import an existing model, standardize it to office templates, review it collaboratively, work offline on desktop when needed, and keep using the same product surface.

### 5. Platform Layer

Turn the app into a structural engineering platform with APIs, automation loops, and real-time collaboration.

**What:**
- Python scripting API (Pyodide in-browser) for batch runs and parametric studies
- REST API — headless solver for CI integration and automated analysis
- Cloud solve + comparison platform — batch analysis, branch comparison, model diffing, scenario sweeps, history, batch reports
- CRDT-based real-time collaboration — structural model as CRDT document (Yjs or Automerge), structural-aware merge semantics (you can't delete a node someone else is loading; adding a load to a member someone else is redesigning triggers a review), awareness protocol (live cursors, selection highlights), WebRTC peer-to-peer sync with WebSocket relay fallback, offline-first editing with automatic merge, per-user undo, branch and merge for models, operational history and audit trail
- User roles and permissions (viewer, editor, reviewer, approver)
- Comments and annotations pinned to nodes/elements/regions
- Visual diff between model versions
- Project management — version history, review workflow, project dashboard
- Cost estimation — material quantities to cost (steel tonnage, concrete volume, rebar weight, formwork)
- Enterprise controls — permissions, audit trail, administration
- Optimization and parametric design — size/shape/topology optimization (SIMP), parameter sweeps, multi-objective Pareto, code-constrained optimization
- Global section optimization — optimize the structure as a system, not only member-by-member, including fabrication rhythm and procurement economy
- Natural language to model — "8-storey RC frame, seismic zone 4, soft soil" generates a complete structural model
- Automated design iteration — AI runs hundreds of variants, presents Pareto-optimal designs (cost vs weight vs drift vs carbon)
- GNN/neural operator surrogates — train on solver output for 1000x parametric speedup
- Real-time code comparison — compare EC2 / ACI / CIRSOC interpretation on the same structure or member
- Generative structural layout — produce and rank structural systems from architectural constraints once optimization and automation are trusted
- PWA and offline — installable Progressive Web App, mobile-optimized 3D viewer, offline sync via CRDTs

**Done when:** A team of engineers can work on the same model simultaneously with live cursors, branch/merge design alternatives, and an AI can generate and rank hundreds of structural variants automatically.

### 6. Domain Breadth Layer

Broaden the usable design domain once the core workflow and platform surfaces are in place.

**What:**
- Slab and floor design — punching shear (EC2/ACI), flat slab strips, post-tensioned tendon layout, waffle/ribbed slabs
- Additional design codes — timber (EC5/NDS, CLT, glulam), masonry (EC6/TMS 402, confined masonry), composite (EC4/AISC, metal deck, headed studs, precast)
- Architect-friendly conceptual structural mode with strong guardrails

**Done when:** The same product can serve common RC, steel, timber, masonry, slab, and conceptual structural workflows without forcing firms into separate tools for each domain.

### 7. Specialized Analysis

Cover the remaining 20% of specialized analysis that advanced users need.

**What:**
- Progressive collapse — GSA/UFC alternate path method, automatic member removal, dynamic amplification, catenary action
- Fire design — ISO 834/ASTM E119 curves, temperature-degraded material properties (EC2/EC3/EC4), thermal analysis, fire resistance rating, parametric fire curves (EC1-1-2)
- Performance-based seismic — IDA automation, fragility curves, FEMA P-58 loss estimation, ML-accelerated IDA surrogates, cloud analysis, multi-stripe analysis
- Advanced elements — full catenary, form-finding (force density, dynamic relaxation), membrane/fabric/cable-net, tapered beams, curved beams, 3D solid elements (hex, tet)
- Reliability and probabilistic — Monte Carlo, FORM/SORM, subset simulation, polynomial chaos expansion
- Digital twins and SHM — sensor data ingestion API, Bayesian model updating
- Cloud solve — server-side WASM/native solver for 100k+ DOF models
- Performance at scale — WebGPU compute shaders, sparse iterative solvers (PCG/GMRES), Web Workers, IndexedDB, binary format

**Done when:** An engineer can run a progressive collapse check, a fire resistance analysis, and a probabilistic seismic risk assessment on a 100k+ DOF model — all within the same app.

### 8. First-Party Software Built On The Solver

Turn the solver from an application into a first-party software stack structural firms can live inside.

**What:**
- RC design + BBS studio — analysis to required steel to selected bars to schedules to drawings
- Structural report OS — report-grade outputs, submission documents, issue-ready calculation books
- QA / peer-review assistant — structural review workflows, suspicious-result detection, model-quality review
- Firm workspace — standards, templates, reusable office defaults, collaboration, project memory
- Parametric configurator — building, industrial, and foundation generators
- Interoperability + cloud comparison — shared workspaces, batch runs, model diffing, scenario comparisons

**Done when:** A firm can run their entire structural workflow inside the app — from parametric generation through analysis, design, QA review, and submission-grade deliverables — without switching tools.

---

**Post-Core Vision:** Once the solver roadmap and product roadmap through Step 8 are complete, the game shifts from "catch up and surpass" to "define the next era." The value moves beyond the solver engine into AI, collaboration, automation, and the software ecosystem built on top of trusted analysis.

### 9. Construction Intelligence

Bridge the gap between structural design and construction.

**What:**
- 4D BIM integration — structural model tied to construction schedule, staged loading simulation, construction sequence visualization
- Automated rebar detailing — analysis results to shop drawings with zero human intervention (schedules, placing drawings, splice locations, development lengths)
- Formwork optimization — minimize pours, optimize table reuse, plan striking sequence from early-age strength predictions
- Digital twin construction loop — site sensor data, Bayesian model updating, next-day deflection predictions, shoring adjustments
- As-built model calibration — compare surveyed geometry against design, flag deviations, update analysis with as-built dimensions

**Done when:** A contractor can feed site sensor data into the model, get daily deflection predictions, and receive automatically generated rebar shop drawings that account for as-built conditions.

### 10. Planetary-Scale Infrastructure

Help humanity build climate-resilient, low-carbon, reusable infrastructure.

**What:**
- Climate-resilient design — automated scenario generation from climate models (future wind speeds, flood levels, fire risk), structures that survive 2050/2080 climate
- Embodied carbon optimization — minimize CO2 alongside cost and safety, material passport integration, LCA built into the design loop
- Circular economy design — design for disassembly, reuse scoring for members, material bank integration
- Automated retrofit assessment — LiDAR/photogrammetry to FE model, seismic/wind vulnerability assessment, automated retrofit proposals
- Portfolio risk assessment — entire building portfolios for seismic/wind/flood risk, insurance-grade loss estimation at city scale

**Done when:** A city can upload its building portfolio, get a seismic/climate risk assessment, and receive prioritized retrofit recommendations with embodied carbon tradeoffs.

### 11. Education Platform

Replace static textbooks with interactive learning.

**What:**
- Interactive textbook mode — students see stiffness assembly, equation solving, force recovery step by step with explanations
- AI tutor — explains why a structure failed and what to change, teaches structural intuition
- Exam/homework mode — professor defines constraints, student designs, solver auto-grades
- Benchmark explorer — reproduce every published structural benchmark interactively
- Curriculum integration — pre-built course modules for structural analysis, steel design, RC design, dynamics

**Done when:** A professor can assign a structural design homework, students solve it interactively in the browser, and the app auto-grades while explaining the structural behavior step by step.

### 12. Third-Party Ecosystem and API Economy

Turn the platform into external infrastructure that other software and institutions build on top of.

**What:**
- Stabileo as infrastructure — other applications call the solver via REST/WebSocket API
- Insurance and risk — seismic/wind risk on entire building portfolios through the API
- City planning — urban planning tools check structural feasibility in real-time
- Parametric design backends — Grasshopper, Dynamo, Blender use Stabileo as the analysis engine
- Plugin/extension marketplace — third-party developers build specialized tools on top
- Foundation-model and RL research outputs productized through the platform once the solver/data stack is mature
- Autonomous inspection pipeline — drone damage capture, CV crack detection, Bayesian model updating, remaining life prediction

**Goal:** Stabileo becomes the structural engineering operating system — the platform that every other structural tool is built on top of. Nobody can replicate a platform with a better Cholesky factorization.

**Done when:** Third-party developers can build and sell specialized structural tools on a Stabileo marketplace, and insurance companies can run portfolio-scale risk assessments through the API.

## Non-Goals

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

## Related Docs

- [`README.md`](README.md) — entry point for every roadmap document: purpose, status, owner
- [`../verification/DASHBOARD.md`](../verification/DASHBOARD.md) — the metrics behind the exit criteria, per release
- [`../verification/MATURITY.md`](../verification/MATURITY.md) — verification level of every analysis, element family and design check
- [`../SAFETY_ADVISORIES.md`](../SAFETY_ADVISORIES.md) — the safety advisory process
- `SOLVER_ROADMAP.md` — solver mechanics and validation sequencing
- `POSITIONING.md` — market framing and competitive wedge
- `../research/rc_design_and_bbs.md` — RC design and BBS research
- `../research/beyond_roadmap_opportunities.md` — GNN surrogates, digital twins, UQ, advanced research opportunities
- `../research/cypecad_competitive_gap_and_parity_plan.md` — unified CYPECAD competitive gap analysis and parity plan
- `../research/post_roadmap_software_stack.md` — platform adjacencies after roadmap execution
