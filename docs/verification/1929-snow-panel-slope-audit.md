# Independent snow-panel slope audit for #1929

## Roof panels use the slope of the roof above them (2026-11-13)

Commit `c003f0ae7` in #1929 makes the CIRSOC 104, ASCE 7-22, EN 1991-1-3
(including the UK adapter) and TS 498 snow generators share `snowSlopes`. A beam-enclosed
panel takes the plan-length-weighted slope of the roof members above its polygon, rather
than being treated as a separate flat roof. A panel without sloped roof members above it
remains flat. Explicit roof-slope overrides remain in effect where the adapter supports them.
Regenerate the snow loads before solving an affected saved project; solving alone retains
its stored loads. Reactions, displacements, member forces, shell stresses and dependent
design checks can change. CIRSOC seismic weight can also change through the snow weight
and the retained/shed-snow classification.

### Quantified comparison and independent reference

The audit tests are `snow-slope-audit.test.ts` and `snow-slope-audit-fixture.ts` under
`web/src/lib/engine/loads/__tests__/`. They build a 6 m by 6 m roof over a level eave
ring, with three rafter lines. The shed rises across 6 m; the symmetric duo-pitch roof
rises across each 3 m half-span. Tests inspect generated panel line loads divided by their
tributary widths, in kN/m² of horizontal projection. Expected values below are calculated
from the clauses, with literal expressions in the tests, without calling the snow calculators.
The original test called a duo-pitch geometry a shed; the audit distinguishes both geometries.

`origin/main` at `b6f13f250` only implements CIRSOC snow. It has no ASCE, Eurocode or TS 498
snow adapter: no main-generated value exists for those three codes. They arrived on the
unmerged #1929 branch. Their before/after comparison is against `c003f0ae7^`, not main.
In particular, the previous ASCE adapter already used the measured roof slope for the
whole roof, including its panels; it did **not** assign every panel a flat-roof load.

Inputs: CIRSOC pg = 1, Ce = Ct = I = 1, smooth unobstructed roof; ASCE pg = 20 psf
(0.957605179606717 kN/m²), Ce = Ct = 1, risk category II, slippery unobstructed roof;
Eurocode sk = 1, Ce = Ct = 1, sliding permitted; TS 498 zone II at 900 m, Pk0 = 0.95.
These inputs are fixtures, not recommended site values.

| Code and geometry | Slope | Main panel load | Before c003f0ae7 | Required / current panel load | Assessment of earlier load |
| --- | ---: | ---: | ---: | ---: | --- |
| CIRSOC shed | 10° | 1.000000 | 1.000000 | 0.923077 | Higher, conservative balanced intensity |
| CIRSOC duo-pitch | 10° | 1.000000 | 1.000000 | 0.646154 | Higher, conservative balanced intensity |
| CIRSOC shed | 20° | 1.000000 | 1.000000 | 0.538462 | Higher, conservative balanced intensity |
| CIRSOC duo-pitch | 20° | 1.000000 | 1.000000 | 0.538462 | Higher, conservative balanced intensity |
| ASCE shed and duo-pitch | 10° | Not implemented | 0.957605 | 0.957605 | Equal; low-slope minimum governs |
| ASCE shed and duo-pitch | 20° | Not implemented | 0.515634 | 0.515634 | Equal on this uniform-slope model |
| Eurocode shed and duo-pitch | 10° and 20° | Not implemented | 0.800000 | 0.800000 | Equal balanced μ1 intensity |
| TS 498 shed and duo-pitch | 10° and 20° | Not implemented | 0.950000 | 0.950000 | Equal uniform intensity |

CIRSOC 104-2005 Chapters 3 and 4, equations (1)/(2), Figure 2(a): computed pf =
0.7 Ce Ct I pg = 0.7. Smooth warm Cs is 1 through 5°, then (70 − α)/65.
Section 3.4 sets pf at least I min(pg, 1) on a shed below 15°, or a gable at or below
21/W + 0.5 = 7.5° for W = 3 m. Hence 10° shed: 1 × 60/65; 10° gable:
0.7 × 60/65; 20° either: 0.7 × 50/65. Main's panel uses α = 0°, giving 1.
For these fixtures its balanced intensity is equal through 5°, higher above 5° through
the recognized rafter range (at most 30°). With a rough warm roof Cs stays 1 through 30°;
the low-slope minimum can still make the old flat-panel load higher. Thermal conditions,
exposure, pg and explicit overrides must be considered separately.

ASCE 7-22 equations (7.3-1)/(7.4-1), Figure 7.4-1(a), section 7.3.3 and Table 7.3-4:
pf = 0.7 × 20 psf; Cs = (70 − α)/65 above 5° for the stated warm slippery surface.
The separate low-slope minimum is min(pg, 30 psf) below 15°, so the governing intensity
is 20 psf at 10° and (0.7 × 20 × 50/65) psf at 20°. A hypothetical flat-panel
calculation would give 0.957605 at 20°, but this is **not** the pre-change ASCE output.
On mixed slopes the old whole-roof mean can underload a flatter surface and overload a
steeper one; the new per-surface path changes those loads. No ASCE behavior was shipped
on this main. The adapter's reference labels call the low-slope clause 7.3.4; the
published 2022 text places it at 7.3.3. This documentation does not change the adapter.

EN 1991-1-3:2003 equation (5.1), Table 5.2 and Figures 5.2/5.3: s = μ1 Ce Ct sk;
μ1 = 0.8 through 30°. Both old and new readers therefore give 0.8 throughout the detected
rafter range, rather than demonstrating a numerical reduction above 30°. Steeper members
are excluded by `beamLike` (|Δz|/L ≤ 0.5); this change does not add steep-roof support.
The two drifted duo-pitch arrangements use 0.5 μ1 / μ1 and the reverse, so their specified
side intensities are 0.4 / 0.8 at these slopes. TS 498:1997 clauses 7/8, Tables 3/4 give
Pk = m Pk0, m = 1 through 30°, hence 0.95 on both geometries throughout that range.
Neither code's flat-panel reading is lower than the required **balanced** intensity in
this range. Values above the recognized range must not be inferred from these tests.

The model tests cover 0°, 5°, 10°, 14.99°, 15.01°, 20°, 26.57° and 29.99° as applicable.
At an intended exactly 15° the coordinates can measure infinitesimally below 15° and retain
the higher minimum: observed CIRSOC shed 0.846154 instead of 0.592308, ASCE 0.957605 instead
of 0.567197. This conservative threshold representation behavior is outside this change;
no tolerance or assertion has been relaxed to hide it.


## Unconservative main case: pitched lower roof at a low step

The subsequent drift audit **does find a silently unconservative result on origin/main**.
`web/src/lib/engine/loads/__tests__/snow-drift-audit.test.ts` is the retained, ignored reproducer.
The full main source snapshot at `b6f13f250` returns `READY`, with no blocked keys, and generates
1.000000 kN/m² on the lower roof in every generated case. The integration generates
0.769231 kN/m². Both claim that no drift is required at the modeled higher roof.
The independent CIRSOC 104 §7.1 local balanced-plus-drift peak is **1.181700 kN/m²**.
This supersedes any interpretation that the simple balanced-load comparisons establish safety.
No advisory number or advisory file has been assigned here; integration work stops for the
coordinator's advisory decision and review of the required drift repair.

The lower roof is a 6 m by 2 m smooth gable at 20°, with eaves at +3 m and a ridge at
3 + tan(20°) m. A modeled flat 6 m by 2 m higher roof lies beside its x = 0 edge at
+3.45 m. The gable slopes along y, so the step along x does not obstruct snow sliding off
the two y eaves. At the step's eave, the local height difference is 0.45 m. The upper roof
stands above the lower ridge. The underlying beam-enclosed panels are not extra flat roofs.

For W = 1 m, §3.4's gable minimum applies below 21/W + 0.5 = 21.5°. With pg = Ce = Ct = I = 1,
pf = 1, Cs = (70 − 20)/65, and ps = 0.7692307692307693. Equation (4) gives γ =
0.426 × 1 + 2.2 = 2.626 kN/m³. Thus hb = ps/γ = 0.29292870115413905 m,
hc = 0.45 − hb = 0.15707129884586096 m and hc/hb exceeds 0.2: drift is required.
Figure 9 at pg = 1 and the minimum upwind length 7.5 m gives hd = 0.381 m (the 6 m fetch
uses that minimum). It exceeds hc, so §7.1 caps the drift height at hc and its width at
min(4 hd²/hc, 8 hc). The local peak is ps + γ hc = γ × 0.45 = 1.1817 kN/m².
The quoted Figure 9 ordinate is the repository's recorded vector-path reading, not a new
independent digitization; the peak only needs hd to exceed hc.

The generator instead always gives the drift routine the **flat** reference 1.0:
hb = 1/2.626, hc/hb = 0.1817 < 0.2, so it emits `snow.derivation.noDrift` and no surcharge.
Main's 1.0 is below 1.1817; c003f0ae7 lowers the panel's balanced part without correcting
this drift reference. The only main planner warning is `snow.note.notCoveredPanels`, whose
text excludes ice dams and drifts at projections **not** modeled as higher roofs. It does
not cover this explicitly modeled roof step. The derivation incorrectly tells the reader
that §7.1 requires no drift. This is not an ASCE/Eurocode limitation or an unmerged-only defect.

The live test fails on both the full main snapshot and the integration because it requires
`snow.derivation.drift` rather than `snow.derivation.noDrift`. It is committed with Vitest's
`it.skip` and the exact `known wrong result: #1929` marker pending the coordinator's decision.
The fix has intentionally not been attempted at this advisory gate.

### Unbalanced snow, valleys and drift are separate requirements

A higher balanced intensity does not prove that every analysis effect is conservative.
CIRSOC section 6.1's W ≤ 6 m gable has leeward 1.5 ps/Ce and zero windward load.
At 20° the leeward intensity is 0.807692. The audit verifies both wind directions;
these actual-slope unbalanced cases are unchanged by the flat-panel balanced-load repair.
CIRSOC multi-folded/sawtooth roofs retain Cs = 1 under section 4.4; they use the separate
shaped-roof path, not the shed/gable slope reduction. Drift at steps and sliding snow use
the existing extra-load path; its lower-roof balanced reference remains flat, unchanged
by c003f0ae7. The targeted eight drift/sliding tests remain required regression coverage.

ASCE section 7.6.1, for simply supported prismatic ridge-to-eave members with W ≤ 20 ft,
requires a leeward unbalanced pg = 0.957605 and zero windward snow at 20°. The branch's
balanced 0.515634 is lower by 0.441972, and is not a replacement for that case. The
adapter generates only balanced snow and explicitly warns that section 7.6 unbalanced
snow, sections 7.7/7.8 drifts, sliding, rain-on-snow and partial loading are not generated.
This is an acknowledged limitation of an unmerged adapter, not a silent wrong result on main.

Eurocode multi-span roofs require Table 5.2 μ2 and Figure 5.4 under section 5.3.4.
At a symmetric 20° valley μ2 = 0.8 + 0.8 × 20/30 = 1.333333, giving 1.333333 kN/m²,
versus a μ1 balanced 0.8: a 0.533333 shortfall if the valley case is omitted.
The audit includes an actual two-span geometry. The adapter warns that multi-span,
cylindrical roofs, local drifts and exceptional snow are not generated; the slope change
does not implement μ2. TS 498's uniform-only notice likewise does not establish coverage
of special roof forms. Do not use these comparisons to claim complete roof-code compliance.

### Sources and reproduction

CIRSOC clauses are the repository's verbatim source transcription in
`docs/codes/CIRSOC/markdown/cirsoc-104-2005/` (Chapters 3, 4, 6 and Figure 2).
The other references checked for this audit are the primary standard texts:
[ASCE/SEI 7-22, Chapter 7](https://studylib.net/doc/28562046/asce-7-22---minimum-design-loads-and-associated-criteria-...),
[EN 1991-1-3:2003, pages 18–24](https://www.phd.eng.br/wp-content/uploads/2015/12/en.1991.1.3.2003.pdf),
and [TS 498:1997, clauses 7/8](https://unaribas.com/wp-content/uploads/2021/04/ts498.pdf).

Run `make test.web.unit FILE=src/lib/engine/loads/__tests__/snow-slope-audit.test.ts VITEST_WORKERS=2`.
Against main's snow generator, the actual-slope CIRSOC assertions fail; against
c003f0ae7's parent, the same CIRSOC assertions fail while the uniform-slope other-code
comparisons pass. The integration handoff records commands, counts and limitations.
No new advisory is assigned by this write-up.
