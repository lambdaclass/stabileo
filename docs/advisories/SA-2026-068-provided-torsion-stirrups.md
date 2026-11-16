# SA-2026-068: Concrete torsion accepted inadequate designed stirrups

| | |
|---|---|
| Severity | High |
| Status | Published 2026-11-15 |
| Issue | [#2141](https://github.com/lambdaclass/stabileo/issues/2141) |
| Fix | PR [#2080](https://github.com/lambdaclass/stabileo/pull/2080); released in 0.6.1 |
| Fixed release | 0.6.1 (2026-11-15) |
| Affected versions | Confirmed on main `013485aa2629a05672403919060cc1397f510fd1`; earlier introduction and historical release binaries not assessed |
| Re-check registry | [`provided-torsion-stirrups`](../../web/src/lib/provenance/result-changes/provided-torsion-stirrups.json) |

## Affected features

CIRSOC 201 concrete member design and verification with non-negligible torsion,
where the returned transverse cage was designed for shear but was not checked
for its actual torsion capacity and spacing. Spatial linear and P-Delta results
reach this shared design path. Planar solver results have no torsion degree of
freedom. The TypeScript verification is shared by the application entry points;
there is no separate native implementation of this orchestration.

## What was wrong

The main-source replay returns designed stirrups with insufficient transverse
steel and excessive torsion spacing, yet reports both torsion and overall status
as `ok`. It does not emit a warning identifying those inadequate stirrups.
The subsequent branch verification also skipped the transverse check when no
fixed longitudinal torsion allocation was supplied. That optional-argument
bypass is separate from the demonstrated main-source exposure.

The retained rectangular-beam witness has b = 0.3 m, h = 0.6 m, cover = 0.025 m,
fc = 25 MPa and fy = 420 MPa, with V = 0, T = 30 kN·m and M = 20 kN·m.
Main returns two-leg 8 mm stirrups at 0.275 m. The required At/s is
4.271172651305651 cm²/m; each outer leg provides 1.8278357257249704 cm²/m.
The standalone 2025 torsion checker gives ratio 2.3367377008738495 for that
actual cage. The existing spacing limit for this geometry is
0.19599999999999998 m. The corrected transverse check fails. These values
come from the [results-change record](../results-changes/2026-11-provided-torsion-stirrups.md)
and [main-source replay](../results-changes/2080-round15-main-witness.json).
They are a witness, not an error bound for other members.

The replay loads the exact main designer with the initialized current WASM
section kernels. It is source-replay evidence, not a historical binary replay.
No claim is made that an older release binary ran this exact model.

## How to tell if your model is affected

Review concrete members with torsion and the stirrups actually returned or
specified, including their outer-leg area and spacing. A torsion `ok` status
alone did not prove that the returned cage was adequate. The saved-project
notice conservatively selects concrete members; its absence cannot establish
that an older direct verification call was unaffected.

## Fixed in

Version 0.6.1 includes PR #2080. Direct and prepared verification share one
unconditional transverse torsion check for every returned cage. Fixed or
designed stirrups are checked even without a fixed longitudinal torsion area.
Inadequate transverse capacity or spacing fails torsion and verification.
The existing neglect rule, spacing limit and numerical tolerances are unchanged.

Longitudinal torsion provision is a separate requirement. Missing provision
remains explicitly unchecked, holds the normalized member result and cannot
receive a passing certificate. Transverse checks do not certify longitudinal
bar placement or full torsion detailing; existing engine recheck disclosures
remain applicable.

## Workaround

Until upgrading to 0.6.1 or later, independently check torsion capacity and
spacing of the actual transverse cage and verify longitudinal torsion provision.
Do not accept a cage solely because the earlier torsion or overall status passed.

## What to do with results you already have

Re-run affected saved concrete designs after upgrading. Review torsion failures,
actual stirrup area and spacing, longitudinal provision and certificates.
Revisit member sizing, calculations and deliverables based on the previous
passing result. An unchecked longitudinal cage is not an accepted design.

## Credits and references

The exposure was found during PR #2080 verification and tracked as #2141.
The release coordinator assigned SA-2026-068. The
[results-change record](../results-changes/2026-11-provided-torsion-stirrups.md)
retains the main witness, entry-point coverage, boundary tests and correct
controls. The [longitudinal-provision record](../results-changes/2026-11-shared-span-axis-and-torsion-provision.md)
describes the separate unchecked-provision hold.
