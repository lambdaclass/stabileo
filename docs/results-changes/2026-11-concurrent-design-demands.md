# Interaction checks use concurrent station demands (2026-11-13)

CIRSOC 201 verification now checks each combination at each station with its own signed axial force, both moments, both shears and torsion. An opaque concurrent-demand type carries combination and station provenance through the interaction checks. An envelope cannot satisfy that interface. The least-compression envelope workaround is superseded by the complete sweep. RC column sizing selects one cage against every concurrent uniaxial case, then checks biaxial demands on that cage. Beam flexure and shear use shared reinforcement and each station's own axial force; V–T uses each station's own shear and torque. Each reported check names its actual governing combination.

CIRSOC 301 uses concurrent tuples for its entire check and engine gate, including endpoint-only single-result input and variable-section station checks. Inputs with only force envelopes are refused. Independent check results are selected after evaluation. Moment-gradient factor Cb also comes from the same combination, over the whole unbraced chain when present. Unlabelled or incomplete diagrams receive the permitted Cb = 1 rather than credit from an envelope. ACI 318, AISC 360, EN 1992, EN 1993 and AISI S100 keep their existing formulas; their common dispatcher now always includes the complete station set, and its force interface requires a concurrent demand. The certified path includes that same set. EN 1992's member designer also reads the shared concurrent type.

## Recorded changes

`web/results-snapshots/design-rc-design-qa-8.json`, element e2:

| Check | Before, origin/main | After |
|---|---|---|
| Axial + Moment: axial force | 257.36 kN, gravity envelope | 210.8416155 kN, wind at the moment's station |
| Axial + Moment: utilization | 0.7288629738, mixed-combination warning | 0.6501950585, wind |
| Biaxial: resultant moment | 105.1971098 kN·m, mixed moments | 100.9365552 kN·m, wind |
| Biaxial: capacity | 126.47 kN·m, least-compression surrogate | 138.27 kN·m at the concurrent wind axial force |
| Biaxial: utilization | 0.8319467554, mixed-combination warning | 0.7299270073, wind |

The original issue's 0.6191950464 preceded main's least-compression mitigation. The existing SA-2026-041 documents that earlier shipped defect. Current main warns about mixed N–M provenance and bounds the RC check with the least compression. The decrease relative to current main reflects removal of synthetic combinations, and is not evidence that the historical max-compression-only pairing was safe.

The complete field-by-field before/after record is [1316-concurrent-design-diff.json](1316-concurrent-design-diff.json). It includes demand, capacity, ratio, status and combination-label changes across the affected design snapshots. No solver response, input fixture, tolerance or frozen numerical reference was changed. Snapshots were regenerated with `make snapshots-update FILE=src/lib/results-snapshot/__tests__/snapshot-design.test.ts`.

## Additional steel witness on origin/main

The steel capacity factor Cb was computed from an enveloped moment diagram and reused for all combinations. One combination has uniform moment and compression; another has a larger end moment without compression. The envelope gives gradient credit to the uniform-moment combination. Even though its N and M were concurrent, its capacity belonged to a different diagram.

The IPE 300 reproducer derives its loads from the section's own capacities: N/Pc = 0.4 and M/Mc = 0.5 in the uniform combination. CIRSOC 301 H.1 gives 0.4 + (8/9) × 0.5 = 0.8444444444444444. Origin/main b6f13f250 reports 0.6864197530864198, status `ok`, with no diagnostic and `engineRecheck.certifiedOk = true`. The certificate used the same incorrect Cb input. The fixed result is 0.8444444444444444.

A second case at M/Mc = 0.7 checks the failure side: the hand result is 1.0222222222222221. Main reports 0.812 and `ok`, but also retains an error diagnostic from its preliminary synthetic envelope check. That second case emits `VERIF_STEEL_FAIL_INTERACTION` and is not silent. The first is the silent unconservative witness documented in [SA-2026-064](../advisories/SA-2026-064-steel-cb-combination.md), with the generated replay and source/tag release boundary. PR [#2080](https://github.com/lambdaclass/stabileo/pull/2080) fixes the defect; re-run affected steel interaction checks after upgrading.

## Saved projects

Re-run design checks for saved concrete and steel member projects. Compare the governing combinations, utilization, reinforcement and statuses. Old RC rows labelled with mixed N and M combinations represent an envelope surrogate; their numbers must not be compared as if they represented one load combination. Design now refuses an envelope without the concurrent station data needed to check it. Re-run analysis/combination extraction to supply that data.

## Verification and scope

The issue's force pair has an independent rectangular stress-block equilibrium calculation in `concurrent-rc-demands.test.ts`, including steel strain limits, displaced concrete and the edition's strength factor. Tests cover compression below and above balance, zero axial force, tension, complete station retention, shared orchestration and a single-combination control. The dispatcher reproducer checks each code identity and member kind against an intermediate concurrent interaction that no force maximum identifies. All 37 new reproducer cases fail when enabled on the parent and pass after the fix. The steel Cb cases cover both sides of utilization 1; endpoint and variable-section steel cases test the other adapters.

Verification orchestration is TypeScript over the public WASM section and station kernels. There is no separate native implementation of this orchestration or 2D RC verifier; planar member design uses the same 3D station contract. Existing native capacity formulas and analysis algorithms are unchanged. CIRSOC 201 shell-wall design uses its separate floor/shell path and never calls this bar verifier. Explicit wall-kind calls to the verifier share the column branch.

## Review corrections

The initial implementation’s per-check demand selection, signed flange selection, axial masking and certificate aggregation were corrected during review. The final correction record and generated diff are in [Concurrent checks retain governing demands](2026-11-concurrent-check-demands.md). That review record supersedes the initial diff for overlapping fields.
