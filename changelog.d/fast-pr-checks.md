### Performance
#### Focus pull-request CI on the changed area (2026-10-29)

Documentation-only PRs run repository lint and changelog checks. Research PRs
run research validation, focused unit and browser tests, and route budgets;
engine PRs keep engine suites and determinism with focused engine-facing smoke
flows. Unknown paths or mixed areas retain full coverage. Tools have a reserved
focused mapping that falls back to full CI until its tests exist. Merge-queue
candidates and pushes to main always run the full pipeline. CI OK, rust and npm
resolve intentional skips while propagating failures and cancellations.
