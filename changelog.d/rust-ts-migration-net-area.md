### Changed
#### Ae of a tension member's end connections comes from the engine (2026-11-08)

The effective net area of CIRSOC 301 §D.3 and §B.4.2.2 is computed by the Rust engine
(`cirsoc301_inputs`, op `netArea`), not TypeScript. That covers x̄, the hole chains with s²/4g,
An, the shear-lag factor U and the refusals. The TypeScript copy is deleted. On 946 sections,
55 295 resolved ends and 323 105 refusals, the engine matches the TypeScript to the last bit,
steps included, so no result changes.
