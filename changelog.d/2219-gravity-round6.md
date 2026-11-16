### BREAKING (results)

#### Preserve short distributed member loading

Short force, bending-moment and torque densities remain distributed through gravity allocation and member subdivision. They cannot become point loads that the endpoint adapter relocates. Every plane and spatial native-input builder refuses transverse force spans below the native supported limit and any unrepresentable span, naming the member in the selected language. Positive axial-only spans retain native distributed integration. Nonzero bending-moment and torque densities retain distributed integration on canonical spans at least 1e-10 of member length; all-zero moments are treated as absent. Regenerate affected gravity loads or recreate affected subdivisions from the original loading, then rerun analyses, combinations and design checks (#2219). Merging the snow geometry correction retains both advisory catalogs and uses precise snow intersection parameters to avoid spurious endpoint intervals.
