### Changed
#### Wind regression tests reject missing mechanics and exercise case refusal (2026-11-16)

Wind mechanics comparisons now require every expected support reaction and node displacement, with finite components in both solver outputs. Negative controls cover missing, partial and malformed results in 2D and 3D. The case-generation refusal test now constructs its pressure field before invoking the entry point and rejects a generator that silently accepts unsupported member torque (#2220). Engine results are unchanged.
