### Changed
#### J, Cw, c and Sy of the CIRSOC 301 check come from the engine (2026-11-08)

The thin-walled torsion constant J of an I or H, the warping constant Cw of an I and of a channel,
F.2's c and a channel's weak-axis modulus to the flange tip (AISC Design Guide 9) are computed by
the Rust engine (`cirsoc301_inputs`), not TypeScript. The TypeScript copy is deleted. On 3 508
sections the engine's values match the TypeScript's to the last bit or within 4 ulp. The
4 ulp is `pow` rounding, so no result changes at any displayed precision.
