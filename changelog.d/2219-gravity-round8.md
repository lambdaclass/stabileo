### BREAKING (results)
#### Representable moment supports and exact floor spans (2026-11-16)

Member moment densities now share checked in-member endpoints between assembly and recovery. Unsafe endpoint rounding and unrepresentable integration supports refuse instead of returning inconsistent member diagrams (#2219). Regenerate affected loads and rerun analyses and checks. See [the results-change record](../docs/results-changes/2026-11-gravity-round8.md). Direct plane WASM calls explicitly refuse member moment fields. Floor profiles retain exact support boundaries and coalesce compatible adjacent pieces without widening them.
