### Fixed
#### Scheduled runs no longer hold the merge queue's runners (2026-11-04)

Nightly mutation testing, random models and the other nightly jobs ran on the runners the merge
queue uses, so every morning queued PRs waited for them for hours. The nightly now runs only on its
own runners (or GitHub's when the self-hosted host is off), and the daily CI, research and
supply-chain schedules run on GitHub's runners. A test evaluates every scheduled job's runner
choice and fails if any can reach the merge queue's runners.
