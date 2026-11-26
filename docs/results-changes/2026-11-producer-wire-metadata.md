# Accept Stabileo producer metadata during analysis

Stabileo can solve models that carry display and design metadata on elastic material, section and support rows. This includes the concrete material and section used in the #2171 and #2142 regressions, the shared section rows used by the planar wind, seismic and shear recovery regressions, the concrete and catalogue steel section rows passed by the design adapters, and the support records generated when the web app restrains orphan rotations. A prior revision of PR #2588 refused these models with an unknown-field error before analysis.

The accepted metadata is named in one schema shared by the typed and legacy decoders. The solver uses the same material constants, section properties and restraint values for a model with or without the metadata. Misspelled structural fields, such as `asYY` or `rrX`, still produce a parse error.
