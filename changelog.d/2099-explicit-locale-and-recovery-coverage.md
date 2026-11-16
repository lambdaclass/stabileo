### Fixed
#### Retain locale and displacement regression coverage (2026-11-16)

- Keep German, French, Turkish and Hungarian blog cases explicit and require their public availability; supply the missing Hungarian 0.6.1 translation exposed by the metadata check (#2099).
- Require the complete displacement sample count before checking recovered coordinates and point displacements.
- Restore unpublished Hungarian research addresses to English in both navigation shells even with research expansion disabled, retaining query strings and fragments.
