### BREAKING (results)
#### Validate omitted-earthquake snow provenance and ungrouped pairs (2026-11-16)

- Refuse ambiguous legacy seismic snow even when E is omitted or has zero factor. Regenerate saved snow combinations so physical snow and flat-roof companion snow retain distinct cases.
- Accept a complete single ungrouped physical/flat-roof snow pair while continuing to refuse missing or ambiguous independent actions. Preview and apply use the same validation.
- Details: `docs/results-changes/2026-11-snow-combination-provenance.md` (#2211, #2233).
