### Fixed
#### CI runs on Ubuntu 24.04 (2026-11-02)

GitHub moved `ubuntu-latest` to Ubuntu 26.04, where Playwright 1.60 cannot install
its browsers, so every pull request failed Web Build, E2E Site and Determinism.
Hosted jobs now name `ubuntu-24.04`, so the image changes only when we change it.
