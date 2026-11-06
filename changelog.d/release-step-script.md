### Changed

#### The release step is one make target (2026-11-06)

`make release.step VERSION=… DATE=…` (`scripts/release-step.py`) moves the changelog fragments into CHANGELOG.md, adds the release-notes line, rebases the moved text's `../` links to the repository root, points result-change entries at CHANGELOG.md, and relocks `dedaliano-engine` in every tracked Cargo.lock, research crates included. It fails if a moved link still climbs out of the root, a registry entry still names changelog.d/, or a lock pins another engine version. The 0.5.0 release hit the last two by hand.
