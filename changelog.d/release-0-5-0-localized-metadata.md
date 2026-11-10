### Fixed
#### Fit translated release notes within search metadata limits (2026-11-08)

Shorten the German, French and Turkish 0.5.0 release titles and the German
excerpt to fit the published-page search metadata limits. Format integer counts
with local thousands separators. Regression checks now preserve each advisory's
row and cell associations, reject swapped magnitudes, compare numeric values
across local formatting, and check metadata lengths for every de/fr/tr blog post.
No calculated engineering results change.
