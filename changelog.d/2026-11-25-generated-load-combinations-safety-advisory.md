### Fixed
#### Safety advisory for generated load combinations (2026-11-25)

[SA-2026-122](../docs/advisories/SA-2026-122-generated-load-combinations.md) covers incorrect shared alternatives, omitted manual roof live loads, lost flat-roof snow bases and obsolete wind cases after Auto Loads replacement. Verify the loads, rules and envelope membership. Remove obsolete empty load cases before regenerating combinations and verify that the new combinations exclude them. Rebuild affected composite cases, rerun analyses, rebuild envelopes, and repeat dependent design checks.
