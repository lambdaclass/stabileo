### Changed
#### Invariance checks on every engine pull request (2026-11-05)

Pull requests that change the solver now check that the analyses they touch give the same answer when a curated set of models is rotated, mirrored, renumbered, has members reversed, changes units or lists its loads in another order. Known open wrong results (#758, #971) are tracked as expected failures, so a fix that removes one is noticed.
