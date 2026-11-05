### Changed
#### A merge to main is not tested twice (2026-11-03)

Every push to main ran the whole CI pipeline again, although the merge queue had just tested the
same tree. When the pushed tree is the tree of a merge-queue commit whose CI run succeeded,
checked through the GitHub API, a push to main now runs only what the queue leaves out (slow
E2E, Docker, determinism, quarantined E2E and full research validation) and the builds they need.
Direct pushes, admin merges and anything that cannot be matched still run everything.
