# SA-2026-059: Web analyses could silently give cables compressive resistance

| | |
|---|---|
| Severity | High |
| Status | Draft 2026-11-10; fixed in PR #1921, pending release |
| Issue | [#417](https://github.com/lambdaclass/stabileo/issues/417) |
| Fix | PR [#1921](https://github.com/lambdaclass/stabileo/pull/1921); not yet released |
| Affected versions | Web cable mapping introduced in `84a014d46` (2026-09-28); present in 0.2.0, 0.3.0, 0.4.0 and 0.5.0 and subsequent main builds through verified `52619652ecb9d801af1868b34936518965c92d69` (2026-11-10); pending release of #1921 |
| Re-check registry | [`contact-and-cable-validity`](../../web/src/lib/provenance/result-changes/contact-and-cable-validity.json) |

## Affected features

Web 3D analyses of members whose axial behaviour is **Cable**, when the analysis bypasses the automatic dedicated cable solve. Confirmed silent compression occurs in PRO advanced P-Delta, co-rotational, Winkler, soil-structure interaction (SSI), staged construction and direct analysis. The stiffness and flexibility teaching wizards also solve the mapped member as a two-way bar without a cable warning. Other consumers, their measured results and the warnings actually shown are listed in the [replay record](replays/SA-2026-059.md).

The normal 3D Solve and load-combination routes use the dedicated cable solver and correctly let the cable go slack in the replay. This advisory does not claim those routes returned the demonstrated wrong result. Native engine inputs retaining `type: cable` already received the SP-14 warning; that warning did not protect web requests that had lost their cable identity.

## What was wrong

The web `buildSolverInput3D` builder changed `behaviour: cable` to `type: truss`. Advanced analyses then assembled a member that resisted both tension and compression. The engine's SP-14 predicate looked for `type: cable`, so it could not warn about the converted member. A converged, stable result or a small residual only verified the substituted two-way-bar model.

The replay built WASM from origin/main `52619652e` in a separate worktree and used the actual model store, `centerlineInput({ caseDisplacements: true })` and `solvePDelta3D`, the same entry used by `ProAdvancedTab.svelte`. It also executed that component's actual P-Delta handler with the real store and WASM result.

A 3 m vertical cable alongside a frame member uses the store's default section and material. Both endpoints are held in translation, the lower endpoint is clamped, and the upper support moves downward by 0.00001 m. The cable has no pretension. Main returns cable axial force **−4.599884347090908 kN** at both ends, with `converged: true`, `isStable: true`, one iteration and B2 = 1. The panel has no solve error, no P-Delta refusal and **no warning messages**. The nested linear diagnostics contain only informational solver and residual checks.

A cable with no pretension whose chord shortens must go slack: its correct compressive resistance is **0 kN** by the tension-only model. A second replay with a free axial translation and a downward nodal load of 10 kN returns **−5 kN** in the cable and **−5 kN** in the parallel frame. The dedicated cable route returns **0 kN** in the cable and **−10 kN** in the frame. The substituted cable therefore takes half the load away from the frame in that fixture. Co-rotational, Winkler, SSI and staged runs return the −5 kN cable force without containment warnings. The load-driven P-Delta fixture does display an unrelated #1551 second-order warning; the support-shortening fixture above demonstrates the fully silent P-Delta case.

These are measured outputs of the retained fixtures, not a maximum error or a correction factor for other structures. The exact replay, diagnostics, UI interpretation and release-history evidence are in the [replay record](replays/SA-2026-059.md).

## How to tell if your results are affected

Check for members set to **Cable**, then identify how the results were produced. Review results from advanced analyses, direct analysis and teaching wizards rather than assuming a regular Solve result and an advanced result enforce the same cable behaviour. A negative axial force on a cable with no pretension is a direct symptom. Pretensioned, tensile and unloaded cases also need review: a positive force in one state does not establish correct slackening in other states or dynamics.

The re-check registry flags models with cable members or contact features, including one-way members, gap/surface pairs and uplift supports. Ordinary frame, truss and shell models without those features are excluded. This advisory applies to the cable paths described here; the registry also covers the separate contact correction in PR #1921.

## Fixed in

Fixed in PR #1921, pending release. Web builders preserve cable identity. Shared engine validation refuses analyses outside the dedicated cable solver with the structured, translated `cable_analysis_required` error, including tensile and unloaded cable inputs. Teaching solvers refuse them as well. The automatic dedicated cable route remains available. No released fix or deployment is claimed by this draft.

## Workaround

Use the automatic dedicated cable analysis for supported static cable models. Until #1921 is released, independently analyse cable models requiring an advanced workflow that does not enforce tension-only behaviour. Do not change a cable to an ordinary truss merely to obtain a result; that assigns compressive resistance to it.

## What to do with results you already have

Re-check advanced cable-model forces, reactions, deflections, stability conclusions and any design demands or deliverables based on them. Re-run with a solver that enforces slackening, and reassess the surrounding structure's demands. After #1921, an explicit refusal means that workflow cannot provide a valid cable result; it is not a corrected numerical answer.

## Credits and references

Confirmed by the PR #1921 review replay of derivation finding #417. The existing reproducer/fix commits are `b15a29119` and `ad6d301d9`. The [results-change write-up](../results-changes/2026-11-contact-and-cable-validity.md) describes the correction. Release dates are documented in [0.2.0](../releases/v0.2.0.md), [0.3.0](../releases/v0.3.0.md), [0.4.0](../releases/v0.4.0.md) and [0.5.0](../releases/v0.5.0.md).
