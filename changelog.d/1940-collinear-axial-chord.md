### BREAKING (results)

#### Pure axial motion retains zero chord rotation

- Correct the unmerged #1940 corotational chord calculation: compensate both cross-product terms so exactly collinear axial motion cannot create bending. Re-run affected 2D frame corotational and continuation analyses (#761). Settlement regressions now verify the signed loaded-minus-settlement-only reaction, including rotated native and WASM cases, and reject a dropped transverse load. Preserve exact recheck notice ordering when pending entries share one merge version.
