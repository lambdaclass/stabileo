### Fixed
#### Verify concurrent spacing and withhold unsupported RC detailing results (2026-11-20)

CIRSOC 201 beam checks use concurrent axial force for stirrup spacing, include exact moment-zero stations in anchorage, and account for local stirrup intervals and layered end bars. Verification refuses unsupported drawn bar credit and reports torsion capacity and utilization using the lower evaluated limit. Column schedules retain mixed bar diameters, and physical detailing withholds cages it cannot reproduce. Rerun verification against current drawings and review governing combinations, verdicts and reports. See [the results change](../docs/results-changes/2026-11-rc-detailing-verification.md). (#2398)
