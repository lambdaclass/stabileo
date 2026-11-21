# SA-2026-103: Concrete torsion and shear checks could pass without sufficient reinforcement evidence

| | |
|---|---|
| Severity | High |
| Status | Published 2026-11-21 |
| Issue | [#2310](https://github.com/lambdaclass/stabileo/issues/2310), [#2225](https://github.com/lambdaclass/stabileo/issues/2225), [#2369](https://github.com/lambdaclass/stabileo/issues/2369), [#2373](https://github.com/lambdaclass/stabileo/issues/2373), [#2412](https://github.com/lambdaclass/stabileo/issues/2412) |
| Fix | PR [#2433](https://github.com/lambdaclass/stabileo/pull/2433), merged as `76fdc4de4` |
| Fixed release | Next release (0.6.4) |
| Affected versions | Confirmed in 0.6.3. Earliest affected release is unconfirmed |
| Re-check registry | [`rc-torsion-evidence`](../../web/src/lib/provenance/result-changes/rc-torsion-evidence.json) |

## Affected features

CIRSOC 201 torsion and shear verification with provided reinforcement.
Affected inputs include rectangular sections under active torsion,
torsion with concurrent secondary shear, fixed columns verified from a
total longitudinal steel area, and drawn beam reinforcement at cutoffs
and joints.

## What was wrong

The CIRSOC 201-2025 check could reuse the narrower face's minimum
transverse reinforcement for the wider face. The rectangular beam
reproducer could pass with too little transverse steel on the wider
face. Checks could also use unverified secondary-face geometry and
display a small nonzero secondary shear demand as zero.

A fixed-column check could credit a total longitudinal steel area
without establishing that the bars crossed the section or were
distributed around the perimeter. A drawn beam check could credit bar
development through a joint where different hoop diameters put the bars
in different positions.

Under pure torsion the section check could use a nominal concrete
contribution higher than the evaluated contribution. In drawn beam
verification, shear could be checked using steel on the wrong tension
face or steel absent at the cut, including between sampled stations.
Passing results could give no indication that they relied on these inputs.
[Results-change record](../results-changes/2026-11-rc-torsion-evidence.md).

## How to tell if your model is affected

Review earlier passing checks with torsion, especially unequal
rectangular faces, concurrent secondary shear, or fixed verification
based on a scalar steel area. Review drawings where bars stop or change
position near the governing cut, hoop diameter changes at a joint, or
shear and hogging act together.

## Fixed in

Next release (0.6.4). PR [#2433](https://github.com/lambdaclass/stabileo/pull/2433)
checks the transverse minimum in both directions, applies the evaluated
concrete limit to pure torsion and requires evidence for the reinforcement
credited at the section. The checks report a refusal when the geometry,
bar coverage or joint evidence cannot support verification.

## Workaround

Verify the concurrent demands and the reinforcement actually present at
the governing sections independently. Check transverse steel in both
directions, perimeter bar coverage and development, and the tension bars
that reach each shear check.

## What to do with results you already have

Repeat affected verification in 0.6.4 against the actual reinforcement
drawing. Review earlier passing checks, capacities and utilization ratios.
Resolve refusals with verified reinforcement evidence and regenerate
affected schedules and reports.

## Credits and references

See [PR #2433](https://github.com/lambdaclass/stabileo/pull/2433) for the
torsion and shear reproducers and
[SA-2026-091](SA-2026-091-rc-torsion-shear-verification.md) and
[SA-2026-098](SA-2026-098-rc-drawn-reinforcement-verification.md) for earlier
concrete verification advisories.
