### Changed
#### The merge rules are written in the workflow document (2026-11-04)

- `docs/WORKFLOW.md` states when a pull request merges (CI green on its head, `main` really merged
  in, an LLM review of that head with no unresolved blockers), the review-round limit, bugs before
  features, results versions in the order PRs become ready, the Merge status issue and labels, and
  that `git stash` is never used (#1393).
