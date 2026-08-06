# Codex Workflow - Stabileo

This file captures the working collaboration pattern for this project so a reset does not lose it.

## Core roles

- Main Codex acts primarily as planner, auditor, roadmap interpreter, and prompt writer.
- The other agent acts primarily as implementer, validator, and change reporter.
- Unless explicitly agreed otherwise, solver code is off-limits for product work.

## Solver boundary

- Always remind the other agent that solver code is completely off-limits and must not be edited in any way.
- If a bug appears to be solver-side, do not patch around it blindly in product code.
- Instead:
  - confirm whether it is really solver-side
  - summarize the evidence clearly
  - prepare escalation-ready wording for the technical lead / boss if needed

## Branch / PR structure

- Default PR model is stacked PRs.
- PR `[1]` points to `main`.
- PR `[2]` points to PR `[1]`.
- PR `[3]` points to PR `[2]`, and so on.
- PR titles must begin with the merge order in brackets.
- The local branch used for development and `localhost:4000` should always be the top of the active PR stack.

## Current active stack

- Current top-of-stack branch: `pr/3-pro-verification-completeness`
- Current active PR: `#42`

## Response structure

Default response structure:

1. `Read this first as the current state summary:`
2. Project state summary
3. `What the other agent just did:`
4. Summary of the latest agent output
5. `---`
6. `Send this prompt to the other agent:`
7. Prompt block
8. `---`
9. `Notes for you:`

If the user is supposed to do QA:

- Skip the prompt block when appropriate and go directly to `Notes for you:`
- Give short, concrete QA steps

## Bugfix workflow vs feature workflow

For new features, roadmap exploration, architecture changes, and major scope decisions:

- Use the audit-first / plan-first workflow
- Ask the other agent to analyze first
- Wait for confirmation before telling the other agent to code

For bug fixing and regressions:

- Do not use the extra "Do not write code yet / wait for my confirmation" round-trip by default
- Prefer a direct bugfix workflow so the other agent can investigate and fix in one pass
- Still require the other agent to identify the actual root cause rather than guess
- After the fix, review the report and then provide QA steps to the user

## QA expectations

- Provide QA checks whenever they are important.
- Prioritize QA for:
  - report generation
  - continuity drawings
  - schedule/bar-mark outputs
  - any UI behavior that is easy to misread structurally
- For QA-facing bugfixes or UI changes, the other agent must include a final local dev-server check before reporting completion:
  - verify the web app is actually reachable on `http://127.0.0.1:4000/`
  - do not assume `localhost` works
  - if the dev server is not running, start or restart it and report that explicitly
  - include the exact URL to use for QA in the final report

## Engineering standard

- Do not endorse a structural-detailing change just because it looks better.
- Evaluate proposals against:
  - structural mechanics
  - common professional detailing practice
  - constructability
  - what the current code/data can honestly support
- Prefer honest schematic output over fake precision.
- If something is practice-dependent or uncertain, say so explicitly.

## RC detailing direction

The product direction for this phase is:

- PRO-first
- RC-first deliverables
- stronger-than-CypeCAD / STAAD style engineering clarity

The quality bar is not just "pretty drawings". It is:

- believable structural behavior
- continuity that engineers trust
- schedules that help fabrication
- reports that are professionally readable

## PR19 is RC CAD constructibility (reassigned 2026-07-30)

Stack position 19 now belongs to **RC detail CAD constructibility review**, not seismic.

- **Seismic (INPRES-CIRSOC 103) is deferred.** Its original implementation was lost with the
  2026-07-29 workstation data loss and no Git object survived. The specification that could be
  recovered is preserved in `docs/handoffs/deferred-seismic-103-2026-07-29.md`. No seismic
  branch, tag or implementation exists.
- **PR19 begins in POC / design phase.** The branch `pr/19-rc-cad-constructibility` starts as
  documentation and architecture only, with no production CAD integration code.
- **It is intended to mature in place** into a real, mergeable PR19 on the same branch, rather
  than being replaced by a separate implementation branch later.
- First component is a single **isolated footing**, drawn from a real PR18 production fixture.
- It stacks on `pr/18-rc-slabs-walls-foundations`, never on a QA branch.

Design record: `docs/poc/rc-footing-cad-review.md`.

## Branch backup policy — corrected 2026-07-30

The earlier version of this policy (commit `88abc899`) said to open a draft PR as soon as any
branch differed from its base. Applied to every branch that produced PR noise: an integration
branch that must never merge and a deliberately-red evidence snapshot both got draft PRs and both
had to be closed with explanations. A draft PR is a **review surface**; remote backup is a
**push**. The rule is now scoped by branch kind. Push everything; open PRs only where a PR means
something.

**Real deliverable branches** — features, fixes, intended documentation, anything expected to
mature into a mergeable contribution: push immediately; open a draft PR after the first coherent
commit; push every signed checkpoint; keep draft until review-ready.

**QA / integration branches**: push remotely while active; **do not open a PR**; record the exact
component heads; serve the exact branch locally; delete only after a verified replacement exists.

**Temporary evidence / scratch branches**: push only when needed to protect decision-blocked work;
**do not open a PR**; label clearly as non-mergeable; delete once the evidence is represented in
final commits or tracked documentation.

**External forks**: push work to the user's fork, never upstream; do not open an upstream PR until
there is a coherent upstream contribution; a design-only or exploratory fork branch needs no PR;
never push to upstream without explicit authorization.

Never force-push without explicit authorization. A branch push does not preserve `.git/`
contents — that is why `RC_CHAIN_PROGRESS.md`, `pr-drafts/` and the 14 stashes were
unrecoverable. Before deleting any branch, prove the work exists elsewhere: check ancestry against
every production ref, check the tracked docs, and check that no unique required change lives only
there.

### Superseded original (2026-07-29) — kept for history

The first version of this policy was committed as `88abc899` **onto the QA integration branch**
rather than onto a deliverable branch, so it was reachable from no PR and would have been orphaned
when that QA branch was retired. That misplacement is itself an instance of the problem the
correction above fixes: tracked documentation is deliverable work and belongs on a deliverable
branch. Its text is preserved verbatim here so nothing is lost, and it is **superseded** — the
scoped rules above are the ones in force.

> Meaningful local work must never remain local-only again. PR19 was complete, green and signed,
> and it was lost because it was never pushed. PR15-PR18 survived only because they were on GitHub.
>
> 1. Push every newly created work branch immediately to an authorized GitHub remote.
> 2. Once the branch has any diff from its base, open a draft PR immediately.
> 3. Push every coherent signed checkpoint.
> 4. Keep the PR in draft until it is explicitly declared review-ready.
> 5. A draft backup PR is not authorization to merge.
> 6. Never force-push without explicit authorization.
> 7. For external repositories, push to the user's fork, not the upstream repository.
> 8. If GitHub cannot create a PR because the branch has no commits beyond its base, push the
>    branch to the fork as the minimum backup and open the draft PR after the first commit.
> 9. Before ending any session, verify: the branch has an upstream, all commits are pushed, a
>    draft PR exists when the branch differs from base, and the worktree is clean or every
>    dirty file is explicitly reported.
>
> A branch push does not save `.git/` contents. `RC_CHAIN_PROGRESS.md`, `pr-drafts/` and the
> 14 stashes were lost for exactly that reason. Anything that matters and lives only in
> `.git/` must also be duplicated somewhere replicated.

Rule 2 is the part the correction narrows: it now applies to deliverable branches only.
