### Fixed
#### Verify concurrent spacing and withhold unsupported RC detailing results (2026-11-20)

CIRSOC 201 beam checks use concurrent axial force for stirrup spacing, include exact moment-zero stations in anchorage, and account for layered end bars in seismic hoop checks. Verification refuses unsupported drawn bar credit and reports the lower evaluated torsion reserve. Column schedules retain mixed bar diameters and physical detailing flags cages it cannot reproduce.
