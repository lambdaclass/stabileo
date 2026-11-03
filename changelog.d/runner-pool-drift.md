### Changed
#### CI alerts when the self-hosted runner pools drift (2026-11-03)

A daily "Runner pools" workflow fails, and opens a `ci-failure` issue through the verification
alert, when STABILEO_SELF_HOSTED, STABILEO_PR_POOL or STABILEO_E2E_POOL is not `true`, or when
fewer than 6 online runners carry `stabileo`, 4 carry `stabileo-pr` or 4 carry `stabileo-e2e`.
Lint Repo warns when a same-repository pull request still runs on a GitHub-hosted runner while
the pull request pool is on.
