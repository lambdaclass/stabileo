# Safety advisories

Stabileo's results are used to design buildings. When a released version gave a result that was
wrong in a way an engineer could have relied on, the people who used it must be told: what was
wrong, whether their model is affected, which version fixes it and what to do until they upgrade.
This document is the process. Advisories live in [`advisories/`](advisories/README.md).

Every merge to `main` is deployed to stabileo.com, so **any merged commit counts as released**
for this process, whether or not it was tagged.

## What triggers an advisory

An advisory is required when a released version produced, without an error or a warning that
names the problem:

- an **unconservative** result: a capacity too high, a demand (force, moment, displacement,
  drift, load) too low, a buckling or collapse factor too high, a check that passed and should
  have failed or been "not evaluated"; or
- a **wrong** result of any sign large enough to change an engineering decision (a sizing, a
  verdict, a serviceability conclusion), or one presented as verified (a certificate, a "pass",
  a Certified badge) that was not.

Not an advisory: a conservative error that cannot change a verdict (it goes in the release notes),
a crash or refusal (the user saw no number), a result the app already flagged as unreliable on
screen. When in doubt, write one.

The trigger is usually a GitHub issue labelled `safety`. Every `safety` issue gets one of: an
advisory, or a comment from a maintainer recording why no advisory is needed (for example, the bug
never reached `main`, or it is a backlog item rather than a defect).

## Severity

Severity is about the user's exposure, judged on the error in the governing quantity and how
likely a normal project is to hit it.

| Severity | Definition | Examples |
|---|---|---|
| **Critical** | Unconservative by more than 10 % in a governing quantity, in a default workflow or a common model, with no warning | φMn up to 18 % high in CIRSOC 201 flexure; ground-motion load up to 50 % low |
| **High** | Unconservative by more than 10 % in a less common feature or input, or by 2–10 % in a common one; or part of the model silently ignored | Torsional buckling missed on angles and tees; spectral base shear SRSS instead of CQC |
| **Medium** | Unconservative by less than 2 %, or limited to uncommon inputs or the API, or a verification claim (certificate, badge) that was wrong while the number itself was visibly wrong | A certificate passing on non-finite results; solid-shell deflections ~18 % low on thin plates |
| **Low** | Wrong but conservative, or wrong only for inputs the app does not produce | Crack width 6.9× too wide |

When a defect spans several severities (depends on the model), the advisory states the range and
is filed at the highest one.

## How users are notified

| Channel | When | Who does it |
|---|---|---|
| **GitHub issue** labelled `safety-advisory`, titled `SA-YYYY-NNN: <summary>`, body = the advisory | At publication | Release manager |
| **Advisory file** `docs/advisories/SA-YYYY-NNN-<slug>.md` | Drafted on confirmation, published with the fix | Author of the fix |
| **Release notes** (`docs/releases/vX.Y.Z{,.es,.pt}.md`): a "Safety advisories" section linking each advisory, in English, Spanish and Portuguese | In the release that fixes it | Release manager |
| **In-app notice**: the release's "your results may have changed" notice (`web/src/lib/release/whats-new.ts`), and the per-project re-check prompt, which shows the advisory to projects that use the affected feature. Each advisory has an entry in the re-check registry, `web/src/lib/provenance/result-changes.json` (PR [#328](https://github.com/lambdaclass/stabileo/pull/328), schema in `docs/verification/PROVENANCE.md`), whose `when` condition is the advisory's "how to tell if your model is affected" | In the release that fixes it | Author of the fix |
| **GitHub Security Advisory** (repository Security tab) | Critical and High, so that the advisory has a stable public identifier | Maintainers |
| **Email** | There is no mailing list today. When one exists (opt-in, see [#441](https://github.com/lambdaclass/stabileo/issues/441)), Critical and High advisories are mailed at publication | — |

## Timelines

| Step | Deadline |
|---|---|
| Triage a new `safety` issue: reproduce, decide whether it reached `main`, assign severity | 2 working days |
| Contain: set the feature's runtime switch to warn or refuse, or record why none is needed ([#447](https://github.com/lambdaclass/stabileo/issues/447)) | 24 hours after confirmation |
| Draft the advisory (`Status: draft`) | 5 working days after confirmation |
| Critical or High with no fix merged within 14 days | Publish the advisory with the workaround, and ship an in-app warning on the affected results before the fix |
| Fix released | Advisory published the same day, with the fixed version; release notes and in-app notice in that release |
| Re-check registry entry | In the PR that fixes the defect |
| Postmortem in `docs/postmortems/` (root cause, why tests missed it, new test kind, variant analysis; [#449](https://github.com/lambdaclass/stabileo/issues/449), [#448](https://github.com/lambdaclass/stabileo/issues/448)); the advisory's "what was wrong" comes from it | 10 working days after the fix |

## Required content

Every advisory has these sections; the [template](#template) lists them.

1. **Identifier, title, severity, status** (draft, published, withdrawn), dates, issue and fix PR.
2. **Affected versions**: the first version or date that produced the wrong result (bisected when
   possible; "not yet bisected" otherwise), and the last affected one. Versions before 0.2.0 were
   not tagged; give deployment dates.
3. **Affected features**: analyses, elements, design checks, inputs, app modes (Basic, PRO, 2D,
   3D, API).
4. **What was wrong**: the quantity, the direction (unconservative or not) and the size, with a
   reproducible example and the correct value with its source.
5. **How to tell if your model is affected**: concrete conditions a user can check in their model
   (element types, section shapes, analysis options), mirrored by the registry `when` condition.
6. **Fixed in**: version and PR. "Not yet fixed" for a draft.
7. **Workaround** until the user can upgrade, or "re-run in the fixed version".
8. **What to do with past results**: which deliverables to re-check.
9. **Credits and references**: who found it and how (review, fuzzing, differential test, user).

## Template

```markdown
# SA-YYYY-NNN: <one-line summary>

| | |
|---|---|
| Severity | Critical / High / Medium / Low |
| Status | Draft / Published YYYY-MM-DD / Withdrawn |
| Issue | #NNN |
| Fix | PR #NNN (merged YYYY-MM-DD), released in vX.Y.Z |
| Affected versions | from <version or deployment date> to <version>; earlier versions not affected / not yet bisected |
| Re-check registry | `<id>` in web/src/lib/provenance/result-changes.json |

## Affected features

## What was wrong

## How to tell if your model is affected

## Fixed in

## Workaround

## What to do with results you already have

## Credits and references
```

## Index

The list of advisories, with status and severity, is [advisories/README.md](advisories/README.md).
The dashboard counts published advisories ([verification/DASHBOARD.md](verification/DASHBOARD.md)).
