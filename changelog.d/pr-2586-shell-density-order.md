### Fixed

#### Validate shell density before handling zero self-weight

Spatial analysis refuses invalid density on plates and quads covered by a self-weight rule, even at a zero factor. Valid zero-weight rules retain their case results. See the [results change](../docs/results-changes/2026-11-generated-source-accounting.md#verify-generated-load-sources-before-solving). (#2472, #2586)
