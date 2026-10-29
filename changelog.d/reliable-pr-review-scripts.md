### Added
#### Reproducible PR reviews from the repository (2026-10-29)

PR review scripts now pin an exact commit, run Codex alongside Kimi, and fall back to Grok
then adversarial Codex when the second reviewer is unavailable. Reviewer outputs identify
their source and commit; temporary worktrees are cleaned up. Research reviews can be recorded
in the catalog, and a GitHub CLI status table shows open PR readiness and checks. Stub-based
regression tests cover reviewer fallbacks, SHA polling, and catalog validity.
