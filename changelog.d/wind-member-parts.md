### Fixed
#### Generated wind uses fewer distributed loads on members under curved pressure (2026-11-24)

The wind generator previously subdivided curved pressure until each linear load matched all four
work moments. It can now fit the moments with a pair of linear loads, reducing the number of loads
to open and solve. The equivalent beam end loads follow from those moments. Shear and bending
moment inside a member can change when wind loads are regenerated. Regenerate W and Wa, then
rerun analyses, combinations and design checks. [Results change](../docs/results-changes/2026-11-wind-two-part-moments.md)
