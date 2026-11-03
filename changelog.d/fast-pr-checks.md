### Performance
#### Focus pull-request CI on the changed area (2026-10-29)

Documentation-only PRs run repository lint and changelog checks. Research PRs
run research validation, focused unit and browser tests, and route budgets;
engine PRs keep engine suites and determinism with focused engine-facing smoke
flows. Unknown paths or mixed areas retain full coverage. Tools have a reserved
focused mapping that falls back to full CI until its tests exist. Pushes to main
and the nightly run always run the full pipeline; the merge queue runs the
gating subset described in the lighter merge queue entry. CI OK resolves
intentional skips while propagating failures and cancellations.
