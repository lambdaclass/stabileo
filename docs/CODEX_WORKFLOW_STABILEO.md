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
