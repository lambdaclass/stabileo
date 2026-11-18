### Performance
#### Reduce allocation and redundant bisection in span rotation checks (2026-11-17)

Use bounded stack arrays for cubic roots and stop bisection when the midpoint
cannot advance. Rotation checks retain bit-for-bit results against the original
algorithm, including nonfinite inputs.
