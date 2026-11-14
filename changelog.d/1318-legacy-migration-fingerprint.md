### Fixed
#### Legacy-project regression checks include material strengths and section design properties (2026-11-14)

The legacy-project corpus now detects removed or changed steel Fy, concrete f'c, ultimate strength, thermal properties, timber reference values, section geometry and design metadata. One exhaustive material/section property policy drives the fingerprint; typechecking and a schema test require every new field to be classified. Nested properties and undeclared legacy fields are included conservatively, with exact input comparisons.

This corrects the regression oracle (#1318, cause:B). Analysis, design and project migrations are unchanged. A direct audit of all 187 released corpus projects preserves every saved material property. The stricter example comparison exposes older files without Fu against today's example-loader default; those differences remain failures, with no baseline or tolerance adjustment. See [the verification record](../docs/verification/legacy-migration-fingerprint-1318.md).
