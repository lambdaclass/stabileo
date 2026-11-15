### BREAKING (results)

#### Snow overrides preserve unbalanced sides and section runs

- Restore coordinate-based unbalanced snow pressures and ridge sharing for flat models with a roof-slope override. Derive section width from connected collinear members of the same gradient so splitting a roof run preserves its loads (#2095). Regenerate affected snow loads and rerun analyses, combinations and design checks. This correction is unmerged and unreleased.
