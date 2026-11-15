### Fixed
#### Preserve Mohr stress states in shared links and test public build switches consistently (2026-11-15)

- Serialize Mohr stresses and angles with round-trip numeric strings. Sharing and reopening a nearly hydrostatic state now preserves its nonzero von Mises stress and maximum shear in tool and application links, for every display unit.
- Test Hungarian research, tool and blog copy only when the build offers Hungarian, retaining the complete translation and safety-data assertions when research is enabled.
- Keep concurrent application locale requests on one promise across the lazy module import, and complete the startup test's locale-warning mock.
