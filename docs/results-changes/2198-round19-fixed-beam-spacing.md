# Fixed beam cages enforce along-member spacing in both directions (2026-11-17)

The element verifier's shared directional shear check selected a beam spacing
limit but checked the final provided spacing only for columns. A fixed beam
cage could pass on strength despite exceeding the along-member limit in
either shear direction. Automatic selection already searched within the limit.

The final spacing check now unconditionally evaluates the selected member
limit. Direct, prepared, concurrent and standalone beam checks therefore
cannot bypass it. The beam/column discriminator still selects the applicable
rule; no column rule, tolerance, material capacity or native kernel changes.

## Reproducer and result change

For the supplied 300 × 600 mm beam, 25 mm cover and Ø8 stirrups, the legacy
checker computes depths of 559 mm primary and 259 mm secondary. Four legs
per direction satisfy the transverse distribution requirement. With a fixed
200 mm spacing and concurrent unit shear demands, primary spacing passes
its 279.5 mm limit; secondary spacing exceeds 129.5 mm. Parent `03dd87f74`
returns both directions and overall `ok` without diagnostics. The corrected
checker returns secondary and overall `fail` with `VERIF_FAIL_SHEAR`.
The rotated section proves the primary direction is checked as well.
The [numerical replay record](2198-round19-fixed-beam-spacing.json) contains
inputs, unrounded strengths, ratios, steps and both verdicts. Strengths and
ratios for identical cages do not move.

The rule comes from [CIRSOC 201-2025 §9.7.6.2.2](../codes/CIRSOC/markdown/cirsoc-201-2025/capitulo-9-vigas.md#c9.7.6.2.2):
beam shear reinforcement spacing is limited both along the member and across
its width. A strength pass does not waive the spacing limit. The legacy
checker's existing 2025 beam distribution policy also applies when its
strength edition is 2005; this change preserves that policy and does not
claim this is a 2005 clause.

A secondary direction evaluated for pure torsion also passes through the
same final beam spacing check, even at zero secondary shear. Existing hoop
boundary tests had incorrectly expected that row to pass above its beam
spacing limit. They now require the shear failure independently of the
unchanged torsion verdict. Additional square-beam controls retain below,
equal and above hoop-boundary tests with compliant shear spacing. The torsion
implementation and its coefficients are unchanged.

## Column CI contract

The CI test expecting a wide column face to need extra beam legs contradicts
[CIRSOC 201-2025 Table 10.7.6.5.2](../codes/CIRSOC/markdown/cirsoc-201-2025/capitulo-10-columnas.md#c10.7.6.5.2).
That column table contains only along-member spacing limits, unlike the beam
table. Round 18 correctly stopped imposing the beam across-width rule on
columns. The leg-isolation test now uses a beam and retains every assertion.
An explicit column control retains two legs on both axes and still refuses
its excessive secondary strength demand. No beam rule is reintroduced for
columns to satisfy a stale test.

## Coverage and baseline

The new regressions exercise direct, prepared, concurrent and standalone
calls, both shear directions, both axis mappings, both strength editions,
both beam table rows and below/equal/above spacing boundaries. Real WASM
2D/3D linear and P-Delta solves feed fixed cages through every element entry;
valid tighter cages retain their answer. The TypeScript spacing policy has
no separate native implementation. Result wrappers that generate their own
cages cannot accept the failing fixed-cage input.

The flagship digest retains all six assertions, the existing 408-member
baseline and fingerprint `e61212184720b0b6`. No baseline or tolerance changes.

## Main-source exposure

Exact verifier source from `origin/main@44d527d64933c07c8a812f04ad2373e4d83eb72c`
replayed against branch dependencies and existing WASM silently returns
`ok` for the rotated beam and its standalone primary shear check at 200 mm,
above the 129.5 mm limit. The element result has no diagnostics. Main's beam
verifier omits the secondary direction, so the primary case is the direct
main exposure evidence. This is an isolated source replay, not a full main
checkout or release run. The coordinator decides advisory coverage; no new
advisory or advisory number is created here.
