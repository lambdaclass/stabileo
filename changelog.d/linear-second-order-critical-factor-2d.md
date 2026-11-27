### BREAKING (results)
#### 2D linear analysis bounds its second-order warning by the structure's critical load factor (2026-11-10)

The planar linear screen checks the global proportional buckling load using the buckling solver’s complete mode search. It preserves member-specific warnings and checks compressed truss bars separately in both dimensions. A truss bar whose local buckling cannot be bounded retains the warning even when the structure has a high global buckling factor. See the [results change](../docs/results-changes/2026-11-basic-advisories-and-plastic.md).
