### Fixed
#### Safety advisories for gravity, self-weight, kinematic reports and load patterns (2026-11-25)

- [SA-2026-123](../docs/advisories/SA-2026-123-gravity-headroom-and-cover.md). Regenerate affected automatic gravity, roof wind and snow loads, verify the assignments, and rerun dependent analyses.
- [SA-2026-124](../docs/advisories/SA-2026-124-scoped-self-weight.md). Repair self-weight scopes, verify the applied weight, and rerun affected analyses and subdivided planar dynamics course responses.
- [SA-2026-125](../docs/advisories/SA-2026-125-shared-rigid-support-degree.md). Rerun native or WASM kinematic checks for shared rigid supports and review the degree of static indeterminacy, classification and diagnosis.
- [SA-2026-126](../docs/advisories/SA-2026-126-repeated-load-combination-terms.md). Review repeated terms, rebuild affected combinations and composite cases, and rerun their analyses, envelopes and design checks.
