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
  fragment under `BREAKING (results)` and an entry to `web/src/lib/provenance/result-changes.json`
  (the `Results Snapshot` job, `docs/verification/PROVENANCE.md`).
- `scripts/changelog.py --release 0.3.1 2026-10-23` moves every fragment under
  `## 0.3.1 (2026-10-23)` in CHANGELOG.md, grouped by section in that order, and deletes them.
