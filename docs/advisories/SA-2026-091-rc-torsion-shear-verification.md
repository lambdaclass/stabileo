# SA-2026-091: Concrete shear, torsion and seismic hoop checks could pass without reinforcement evidence

| | |
|---|---|
| Severity | High |
| Status | Published 2026-11-20 |
| Issue | [#2296](https://github.com/lambdaclass/stabileo/issues/2296), [#2300](https://github.com/lambdaclass/stabileo/issues/2300), [#2301](https://github.com/lambdaclass/stabileo/issues/2301), [#2302](https://github.com/lambdaclass/stabileo/issues/2302), [#2309](https://github.com/lambdaclass/stabileo/issues/2309), [#2310](https://github.com/lambdaclass/stabileo/issues/2310) |
| Fix | PR [#2338](https://github.com/lambdaclass/stabileo/pull/2338), merged as `35b08a1f0` |
| Fixed release | Containment pending release |
| Affected versions | 0.4.0 through 0.6.2 and intervening main deployments before #2338, where the affected checks were available. The beam-line, torsion and seismic frame checks first appear in the 0.4.0 release history |
| Re-check registry | [`rc-torsion-shear-containment`](../../web/src/lib/provenance/result-changes/rc-torsion-shear-containment.json), [`rc-drawn-hoop-verification`](../../web/src/lib/provenance/result-changes/rc-drawn-hoop-verification.json), [`rc-settled-seat-certification`](../../web/src/lib/provenance/result-changes/rc-settled-seat-certification.json), [`rc-drawn-station-checks`](../../web/src/lib/provenance/result-changes/rc-drawn-station-checks.json), [`rc-beam-line-check-parity`](../../web/src/lib/provenance/result-changes/rc-beam-line-check-parity.json) |

## Affected features

CIRSOC 201 reinforced-concrete beam design and verification, including fixed
and provided reinforcement, beam-line station checks, seismic end hoops and
certification. The longitudinal torsion check also affects fixed wall cages.
The stirrup steel yield finding affects the CIRSOC 201-2005 section checker.
[PR #2338](https://github.com/lambdaclass/stabileo/pull/2338).

## What was wrong

Shear verification credited a representative stirrup cage at a cut that fell
in a gap in the drawing. In #2296, it reported 343.10 kN of shear capacity
at the cut and returned OK. Hogging shear could also use the larger span
effective depth where the top reinforcement supported a shallower depth.
Longitudinal torsion verification counted bars beyond their ends. In #2300,
it credited 6.03 cm² at a hogging cut past the cutoff and returned OK at
0.507 utilization. A scalar steel area could also pass longitudinal torsion
without evidence of the required bars around the cage perimeter.
[Containment record](../results-changes/2026-11-rc-torsion-shear-containment.md).

Under combined shear, torsion and axial tension, a fixed beam in #2310
returned torsion OK at 0.9701335 utilization. The section limit used a concrete
shear contribution greater than the evaluated cage supported. Combined
verification could also overstate its primary effective depth. In #2309,
the CIRSOC 201-2005 section checker could pass active torsion using 500 MPa
stirrup steel without applying the 420 MPa yield cap. The station checker
already applied the cap. [Containment record](../results-changes/2026-11-rc-torsion-shear-containment.md).

In #2302, seismic hoop length and spacing passed using a declared 1 m zone
although the dense hoops in the reopened drawing ended at 0.659 m. Drawn
intervals with fewer legs, wider spacing or a different diameter could also
be hidden by reconstruction from the sampled beam regions. The #2301 fixed
cage already retained its two declared primary legs on the main revision
replayed in #2338. The rotated case that required more legs already failed
there, and the new refusal names the detailing shortfall.
[PR #2338](https://github.com/lambdaclass/stabileo/pull/2338),
[drawn hoop record](../results-changes/2026-11-rc-drawn-hoop-verification.md).

## How to tell if your model is affected

Review certified designs and reports for beams with active shear at stirrup
gaps or hogging cuts, and beams or fixed walls with active torsion. Compare
the cage in the drawing with the bars and hoops credited at the governing
cut. Check longitudinal cutoffs and corner-bar continuity, combined shear
and torsion under axial tension, and CIRSOC 201-2005 section checks with
stirrup yield above the cap. For seismic beam checks, measure the continuous
qualifying hoop zone from each support face in the saved or reopened
drawing. A passing strength or detailing row in an earlier report can be
unconservative.

## Fixed in

PR [#2338](https://github.com/lambdaclass/stabileo/pull/2338), merged as
`35b08a1f0`, blocks approval with a translated reason when the check lacks
evidence for the evaluated concrete contribution, effective depth, stirrup
coverage, longitudinal area or perimeter layout. The fixed cage check
preserves the declared leg count and reports a detailing shortfall when it
needs more legs. The CIRSOC 201-2005 section check refuses active torsion
above the yield cap. Seismic verification measures the continuous qualifying
hoops in the drawing at both ends. Drawn cage transitions and bar cutoffs
supply additional check locations. The beam-line and member checks use
the stirrup diameter of the cage being verified. These changes contain
the unsupported passes using the existing design equations.
[Containment record](../results-changes/2026-11-rc-torsion-shear-containment.md),
[drawn hoop record](../results-changes/2026-11-rc-drawn-hoop-verification.md),
[drawn station record](../results-changes/2026-11-rc-drawn-station-checks.md),
[beam-line verification record](../results-changes/2026-11-rc-beam-line-check-parity.md).

## Workaround

Use a build containing #2338 to identify blocked checks. Where verification
is blocked or the build is unavailable, independently check the concurrent
demands, section limits, and actual reinforcement at the governing cuts and
support faces before relying on the design.

## What to do with results you already have

Re-run affected concrete member verification and seismic frame checks.
Review any refusal against the actual reinforcement and the governing
combination. Review prior certified designs for unconservative results,
then regenerate affected calculation reports, workbooks and IFC exports
after verification.

## Credits and references

See [PR #2338](https://github.com/lambdaclass/stabileo/pull/2338),
the [containment record](../results-changes/2026-11-rc-torsion-shear-containment.md)
and the [settled-seat certification record](../results-changes/2026-11-rc-settled-seat-certification.md)
for the replays and verification changes.
