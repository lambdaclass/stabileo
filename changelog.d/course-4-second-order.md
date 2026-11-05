### Changed
#### Basic's P-Delta and buckling run with a chosen method and discretization, explained step by step (2026-11-03)

P-Delta offers the geometric or the chord matrix and the stability functions, at a chosen number
of elements per member, with its iterations step by step. B₂ is now 1/(1 − 1/λ₁) from Basic's own
buckling at the same discretization, shown beside the largest displacement amplification. Buckling
is computed with 4 elements per member by default and refuses a factor the discretization cannot
represent instead of reporting it. Re-check B₂ and buckling factors from Basic's 2D panel.
