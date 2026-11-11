# Unreleased changes, one file each

Each change that belongs in [CHANGELOG.md](../CHANGELOG.md) adds its own file here instead of
editing the "Unreleased" section. Every PR used to add its entry at the same place, and parallel
PRs conflicted there on nearly every merge.

`changelog.d/<short-slug>.md`:

```markdown
### Fixed
#### What changed, in a sentence (2026-10-22)

What was wrong, what it is now, and what to re-check. The same prose as before.
```

The first line is the section, one of: `BREAKING (results)`, `Security`, `Added`, `Changed`,
`Fixed`, `Performance`. Then one `####` title and the body.

- `scripts/changelog.py --check` (CI's lint job) fails on a fragment without a known section or a
  title.
- A pull request that changes a committed results snapshot (`web/results-snapshots/`) must add a
  fragment under `BREAKING (results)` and an entry file to `web/src/lib/provenance/result-changes/`
  (the `Results Snapshot` job, `docs/verification/PROVENANCE.md`).
- A release runs `make release.step VERSION=0.5.0 DATE=2026-11-06` (`scripts/release-step.py`). It
  runs `changelog.py --release`, adds the release-notes line, rebases the moved text's `../` links
  to the root, points result-change entries at CHANGELOG.md, and relocks `dedaliano-engine` in
  every Cargo.lock. It fails if any of those is left behind.
- `scripts/changelog.py --release 0.3.1 2026-10-23` moves every fragment under
  `## 0.3.1 (2026-10-23)` in CHANGELOG.md, grouped by section in that order, and deletes them.

- `make changelog.unreleased` rebuilds the Unreleased summary in CHANGELOG.md from the
  current fragments, keeping the fragments for release. Run it again after adding or changing a
  fragment; the summary is a snapshot, and the fragments remain the source of truth.
