# How work is done on Stabileo

This replaces `docs/archive/CODEX_WORKFLOW_STABILEO.md` (July 2026), which described a stacked-PR
process and declared solver code off-limits. Neither is current practice.

Stabileo's results are used to design buildings. Every rule below exists so that a result is
never silently wrong and verification never silently stops working.

## Scope

- **Solver and engine work is in scope**, with verification. A change to `engine/src` comes with
  the tests that would have caught the bug (regression test, and where it applies a certificate,
  feature-matrix, differential or worked-example check), and a CHANGELOG entry under
  `BREAKING (results)` when any result can change.
- **Engineering results come from the Rust engine.** TypeScript formats, searches and draws; see
  [verification/TS_ENGINE_LOGIC.md](verification/TS_ENGINE_LOGIC.md). Do not patch around an
  engine bug in the app.
- **Refuse rather than guess.** When an analysis cannot honour a model feature it refuses by name
  (see [verification/FEATURE_MATRIX.md](verification/FEATURE_MATRIX.md)). Never widen a tolerance
  to make a disagreement go away.

## Branches and pull requests

- **One branch and one pull request per workstream**, based on `main`. Open the PR as a draft
  after the first coherent commit; push after every working step (a branch push is the backup).
- **Waves.** When several workstreams land together (e.g. the October 2026 safety wave), an
  **integration branch per wave** (`integration/<wave>`) merges every PR of the wave onto `main`
  in a planned order, resolves conflicts once, and runs the full suite. It is never merged
  itself; its merge plan is recorded (example: [MERGE_PLAN_SAFETY_WAVE.md](MERGE_PLAN_SAFETY_WAVE.md)).
  Each PR is then merged on its own, in that order.
- **Review before merge.** Every PR gets an independent review (Codex review, plus a human
  reviewer for solver, certificate and design-check changes) before it leaves draft and merges.
- **Required checks** must be green (engine, web, e2e, Kani, Lean, symbolic; see
  [#355](https://github.com/lambdaclass/stabileo/issues/355)). A red scheduled verification run
  opens (or updates) one `ci-failure` issue per workflow, closed when it is green again; each real
  finding behind it is triaged into its own `bug` issue ([verification/NIGHTLY.md](verification/NIGHTLY.md)).
- **Never force-push** a shared branch without explicit authorization. Before deleting a branch,
  prove its work exists elsewhere.
- QA and evidence branches are pushed but get no PR.

## Issues and labels

- `safety`: a released or about-to-be-released result can be wrong or unconservative. These are
  counted on the [verification dashboard](verification/DASHBOARD.md).
- `safety-advisory`: the public advisory for a `safety` issue that reached a release; see
  [SAFETY_ADVISORIES.md](SAFETY_ADVISORIES.md).
- `roadmap:multiplier`, `roadmap:verification`, `roadmap:coverage`, `roadmap:solver-proofs`,
  `roadmap:release-safety`: backlog items of [roadmap/PRODUCT_ROADMAP.md](roadmap/PRODUCT_ROADMAP.md)
  (tracker [#396](https://github.com/lambdaclass/stabileo/issues/396)).
- `derivations`: findings of the element-derivation review ([#330](https://github.com/lambdaclass/stabileo/pull/330)).
- `ci-failure`: a scheduled verification workflow (or the production health check) is red;
  opened and closed by CI.
- `verification-failure`: a finding of a scheduled verification job (the per-job issues the alert
  opened before October 2026).

## Releases

A merge to `main` deploys to users, so a merge is a release. Result-affecting changes need a
release note with a "results may change" section (English, Spanish, Portuguese) and, when an
earlier release produced a wrong or unconservative result, a safety advisory
([SAFETY_ADVISORIES.md](SAFETY_ADVISORIES.md)).

## Engineering standard (kept from the earlier workflow)

- Do not endorse a structural or detailing change because it looks better. Judge it against
  mechanics, the code clause, common professional practice, constructability, and what the data
  can honestly support.
- Prefer honest schematic output over fake precision; say so when something is uncertain or
  practice-dependent.
- QA-facing changes include concrete manual QA steps.
