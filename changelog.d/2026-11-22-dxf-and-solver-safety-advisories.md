### Fixed
#### Safety advisories fixed after 0.6.4 (2026-11-22)

[SA-2026-109](../docs/advisories/SA-2026-109-dxf-support-labels.md) covers planar DXF support labels that could silently import as pinned. The next release after 0.6.4 blocks unknown or ambiguous support labels and identifies them in the error.

[SA-2026-110](../docs/advisories/SA-2026-110-solver-json-boundary.md) covers silent omission of support springs or load cases in web analysis. The next release after 0.6.4 refuses non-finite solver inputs and preserves resolved factors for planar load cases named `__proto__`.
