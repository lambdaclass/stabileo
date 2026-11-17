### Fixed
#### Preserve modal factors and framed load meaning

- Display signed modal participation factors separately from labelled mass ratios and cumulative mass percentages in Advanced and PRO reports (#2259).
- Resolve global point-load report components through the solver's plane converter before changing axes; preserve local components and use member direction for inclined axial loads (#2259).
- Keep AI plane moment instructions, projected-load selection and model-code local-restraint normals consistent with their actual frames (#2259).
- Round-trip standalone workbook gravity independently of case weights, and correct the German section kern description (#2259).
